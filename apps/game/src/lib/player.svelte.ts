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
 * A decided round the screen hasn't shown yet: what it changed, held back
 * until its animation gets there.
 */
interface Pending {
  /** Taken off the bank: its winnings, or its whole result before its stake is down. */
  money: Decimal;
  /** Its Tokens. */
  tokens: number;
  /** The game whose wins list it added to, if it won. */
  win: string | null;
  /** The highest room open before it. */
  best: number;
}

/** The parts of a settled round the screen holds back. */
export interface HeldRound {
  game: string;
  bet: string;
  net: number;
  onHouse: boolean;
  tokens: number;
  after: { best: number; win?: unknown };
}

let pendingIds = 0;

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
  /** Decided rounds not yet shown, by id. */
  private pending = $state.raw<ReadonlyMap<number, Pending>>(new Map());
  /** A game's progress as of the round on screen, while later rounds are held back. */
  private views = $state.raw<Readonly<Record<string, unknown>>>({});
  /** Signed in: the server decides. */
  member = $state(false);
  /** Who's playing is known: until then nothing can be played. */
  ready = $state(false);
  /** The games the engine plays. */
  games = $state.raw<readonly string[]>(ENGINE_GAMES);
  /** The member's state couldn't be loaded or an action failed: what to tell them. */
  error = $state<string | null>(null);

  /** The state as the screen shows it: the truth, less whatever rounds not yet shown changed. */
  shown = $derived.by((): PlayerState => {
    const t = this.truth;
    const views = this.views;
    if (!this.pending.size && !Object.keys(views).length) return t;
    let money = amount(0);
    let tokens = 0;
    let best = t.floor.best;
    const hiddenWins: Record<string, number> = {};
    for (const p of this.pending.values()) {
      money = money.add(p.money);
      tokens += p.tokens;
      best = Math.min(best, p.best);
      if (p.win) hiddenWins[p.win] = (hiddenWins[p.win] ?? 0) + 1;
    }
    const wins = { ...t.wins };
    for (const [game, n] of Object.entries(hiddenWins)) wins[game] = (wins[game] ?? []).slice(n);
    const { keno, ...games } = views;
    return {
      ...t,
      bank: amount(t.bank).sub(money).max(0).toString(),
      meta: { ...t.meta, tokens: Math.max(0, t.meta.tokens - tokens), lifetimeTokens: Math.max(0, t.meta.lifetimeTokens - tokens) },
      floor: { ...t.floor, best },
      keno: (keno as PlayerState['keno'] | undefined) ?? t.keno,
      games: { ...t.games, ...games },
      wins,
    };
  });

  /**
   * Holds decided rounds off the screen until they're shown. `before` is the
   * highest room open before the first. Returns the ids, in order: `start`
   * puts a round's stake down, `reveal` shows all it did.
   */
  holdBack(rounds: readonly HeldRound[], before: number): number[] {
    const next = new Map(this.pending);
    const ids = rounds.map((r, i) => {
      const id = ++pendingIds;
      const bet = amount(r.bet);
      next.set(id, { money: bet.mul(r.net), tokens: r.tokens, win: r.after.win ? r.game : null, best: i ? rounds[i - 1]!.after.best : before });
      return id;
    });
    this.pending = next;
    return ids;
  }

  /** A held round has started on screen: its stake is down, its winnings still held. */
  start(id: number, r: HeldRound) {
    const p = this.pending.get(id);
    if (!p) return;
    const bet = amount(r.bet);
    const next = new Map(this.pending);
    next.set(id, { ...p, money: bet.mul(r.net).add(r.onHouse ? 0 : bet) });
    this.pending = next;
  }

  /** A held round is on screen in full. */
  reveal(...ids: number[]) {
    if (!ids.some((id) => this.pending.has(id))) return;
    const next = new Map(this.pending);
    for (const id of ids) next.delete(id);
    this.pending = next;
  }

  /** Shows a game's progress as of the round on screen (null: as it truly is). */
  view(game: string, progress: unknown) {
    const { [game]: _, ...rest } = this.views;
    this.views = progress === null ? rest : { ...rest, [game]: progress };
  }

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

  private clearHolds() {
    this.pending = new Map();
    this.views = {};
  }

  /** Signed in: from now on the server's state is the one shown and played. */
  async join() {
    this.member = true;
    this.ready = false;
    this.clearHolds();
    await this.refresh();
    this.ready = true;
  }

  /** Signed out: back to this browser's own state, as a guest. */
  leave() {
    this.member = false;
    this.clearHolds();
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
