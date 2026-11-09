import {
  act,
  amount,
  ENGINE_GAMES,
  isOldStateKey,
  playerFromSave,
  readPlayer,
  type Action,
  type ActOutcome,
  type EngineContext,
  type EngineTuning,
  type KenoProgress,
  type PlayerState,
} from '@idlesuits/engine';
import { api, ApiError } from './api';
import type { Decimal } from './money';
import { load, saveSoon, storedEntries, unstore } from './save';
import { tuning } from './tuning.svelte';

/**
 * What's on screen while a decided round is still being shown: the parts of
 * the state the round changed, held back until its animation gets there.
 */
export interface Hold {
  /** Taken off the bank: winnings not yet shown, or stakes not yet down. */
  money: Decimal;
  /** Tokens not yet shown. */
  tokens: number;
  /** Rooms opened, and Keno's card, pots and meters, as of the round on screen. */
  best: number;
  keno: KenoProgress;
  /** Wins at the top of a game's list that haven't been shown yet. */
  hiddenWins: { game: string; count: number } | null;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

/** A guest's state: from this browser's save, or moved in once from the keys the game kept before the engine. */
function guestState(): PlayerState {
  const saved = load<unknown>('player', null);
  if (saved) return readPlayer(saved, newSeed());
  const old = playerFromSave(storedEntries(), newSeed());
  return old ?? readPlayer({}, newSeed());
}

/**
 * The player: their bank, Tokens, charms, floor, stats, wins and each moved
 * game's progress, as one state that only the engine changes.
 *
 * A guest's engine runs here, on this browser's save. A member's runs on the
 * server: this holds the latest state it sent, and every change is an action
 * sent to it. The games the engine plays (`plays`) go through `act` for both;
 * the rest still settle in the browser, on a guest's state, or on a member's
 * practice bankroll, which never touches their real one.
 */
class Player {
  /** The latest state: the server's for a member, this browser's for a guest. */
  truth = $state.raw<PlayerState>(guestState());
  /** A decided round still being shown. */
  hold = $state.raw<Hold | null>(null);
  /** Signed in: the server decides. */
  member = $state(false);
  /** Who's playing is known: until then nothing can be played. */
  ready = $state(false);
  /** The games the engine plays. */
  games = $state.raw<readonly string[]>(ENGINE_GAMES);
  /** The member's state couldn't be loaded or an action failed: what to tell them. */
  error = $state<string | null>(null);

  /** The state as the screen shows it: the truth, less whatever a round being shown hasn't reached yet. */
  shown = $derived.by((): PlayerState => {
    const t = this.truth;
    const h = this.hold;
    if (!h) return t;
    const wins = h.hiddenWins ? { ...t.wins, [h.hiddenWins.game]: (t.wins[h.hiddenWins.game] ?? []).slice(h.hiddenWins.count) } : t.wins;
    return {
      ...t,
      bank: amount(t.bank).sub(h.money).max(0).toString(),
      meta: { ...t.meta, tokens: Math.max(0, t.meta.tokens - h.tokens), lifetimeTokens: Math.max(0, t.meta.lifetimeTokens - h.tokens) },
      floor: { ...t.floor, best: Math.min(t.floor.best, h.best) },
      keno: h.keno,
      wins,
    };
  });

  bank = $derived(amount(this.shown.bank));

  /** The engine decides this game: a member's rounds of it are played on the server. */
  plays(game: string | null | undefined): boolean {
    return !!game && this.games.includes(game);
  }

  /** A member at a table the engine doesn't play yet: they play it on the practice bankroll. */
  practicing(game: string | null | undefined): boolean {
    return this.member && !!game && !this.plays(game);
  }

  /** The engine's context in a guest's browser: the browser's tuning, and seeds from the browser's own save. */
  private context(): EngineContext {
    const seed = this.truth.meta.seed;
    return { now: Date.now(), tuning: tuning.engine, seed: (game, round) => (game === 'charms' ? seed : `${seed}:${game}:${round}`) };
  }

  private setTruth(state: PlayerState) {
    this.truth = state;
    if (!this.member) saveSoon('player', () => this.truth);
  }

  /**
   * Runs an action: on the server for a member, here for a guest. `landed`
   * runs the moment the new state is in, before anything redraws, so a round
   * can hold back what it hasn't shown yet. A member's quick, certain actions
   * (sitting in a room, equipping a charm) show at once, before the server answers.
   */
  async act(action: Action, landed?: (out: Extract<ActOutcome, { ok: true }>) => void): Promise<ActOutcome> {
    if (!this.member) {
      const out = act(this.truth, action, this.context(), { admin: true });
      if (out.ok) {
        this.setTruth(out.state);
        landed?.(out);
      }
      return out;
    }
    if (PREDICTED.has(action.type) && tuning.server) {
      const guess = act(this.truth, action, { now: Date.now(), tuning: tuning.server, seed: () => '' }, { admin: true });
      if (guess.ok) this.truth = guess.state;
    }
    try {
      const { state, result } = await api<{ state: unknown; result: unknown }>('/act', { method: 'POST', body: { action } });
      const out = { ok: true as const, state: readPlayer(state, 'server'), result } as Extract<ActOutcome, { ok: true }>;
      // Replies can cross on the way back: only a newer state replaces the one shown.
      if (out.state.rev >= this.truth.rev) this.truth = out.state;
      this.error = null;
      landed?.(out);
      return out;
    } catch (e) {
      const error = e instanceof Error ? e.message : 'Something went wrong.';
      // A guess the server turned down comes back off the screen.
      if (PREDICTED.has(action.type)) void this.refresh();
      if (e instanceof ApiError && e.status === 401) this.error = 'Your session ended. Sign in again to keep playing.';
      return { ok: false, error };
    }
  }

  /**
   * A change only a guest's browser makes: a round of a game the engine
   * doesn't play yet, settled here. A member's real state never changes this way.
   */
  local(change: (state: PlayerState, ctx: EngineContext) => PlayerState) {
    if (this.member) return;
    this.setTruth(change(this.truth, this.context()));
  }

  /** Signed in: from now on the server's state is the one shown and played. */
  async join() {
    this.member = true;
    this.ready = false;
    this.hold = null;
    await this.refresh();
    this.ready = true;
  }

  /** Signed out: back to this browser's own state, as a guest. */
  leave() {
    this.member = false;
    this.hold = null;
    this.error = null;
    tuning.useServer(null);
    this.games = ENGINE_GAMES;
    this.truth = guestState();
    this.ready = true;
  }

  /** Nobody is signed in (or there's no server): play as a guest. */
  guest() {
    if (!this.member) this.ready = true;
  }

  /** The member's state, tuning and games, fresh from the server. */
  async refresh() {
    if (!this.member) return;
    try {
      const reply = await api<{ state: unknown; tuning: EngineTuning; games: string[] }>('/state');
      this.truth = readPlayer(reply.state, 'server');
      tuning.useServer(reply.tuning);
      this.games = reply.games;
      this.error = null;
    } catch (e) {
      this.error = e instanceof Error ? e.message : 'Couldn’t load your Players Club account.';
    }
  }
}

/** Actions whose result is certain from the state alone: a member sees them at once. */
const PREDICTED = new Set<Action['type']>(['room', 'charms.equip', 'charms.unequip', 'charms.slot']);

export const player = new Player();

// The keys the game kept player state under before the engine are now in 'player': cleared once moved.
if (typeof window !== 'undefined') {
  saveSoon('player', () => player.truth);
  for (const key of Object.keys(storedEntries())) if (isOldStateKey(key)) unstore(key);
}
