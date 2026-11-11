import { findCharm, MAX_SLOTS } from '@idlesuits/sim';
import type { AutoStop } from './instant';
import { autoSession, autoStart, autoStop, autoSync, playsRound, type AutoReply } from './auto';
import { KENO_BATCH_MAX, playKeno, type KenoPlay, type KenoRound } from './keno';
import { deepdropDrop, deepdropExpire, deepdropReel, deepdropRounds, DEEPDROP_BATCH_MAX, type DeepDropLive, type DeepDropRound } from './deepdrop';
import { jackpotState, withJackpots, JACKPOT_SEEDS, MAJOR_CAP } from './jackpots';
import { playSlot, slotRound, SLOT_BATCH_MAX, type SlotPlay, type SlotRound } from './slots';
import { tableAuto, tableDeal, tableGames, tableMove, tableProgress, tableResume, TABLE_BATCH_MAX, type TableDealRequest, type TablePlay } from './tables';
import { playRoulette, rouletteRound, ROULETTE_BATCH_MAX, type RouletteRound } from './roulette';
import { minesAuto, minesBegin, minesCash, minesDig, minesOpen, minesRounds, minesTrack, MINES_BATCH_MAX, type MinesRound, type MinesStep } from './mines';
import { playPlinko, plinkoRound, PLINKO_BATCH_MAX, type PlinkoPlay, type PlinkoRound } from './plinko';
import { amount } from './money';
import { opened } from './rooms';
import { buyIn, buySlot, enterRoom, equipCharm, pullCharms, unequipCharm, type Capsule, type EngineContext } from './settle';
import type { PlayerState } from './state';
import { roomTuningOf } from './tuning';

/** What a player can ask for. Each is checked here, whoever sends it. */
export type PlayerAction =
  | ({ type: 'keno.play' } & KenoPlay)
  | ({ type: 'plinko.play' } & PlinkoPlay)
  | { type: 'mines.begin'; bombs: number; step: number; room: number }
  | { type: 'mines.dig'; square: number }
  | { type: 'mines.track'; track: number }
  | { type: 'mines.cash' }
  | { type: 'mines.open'; square: number }
  | { type: 'mines.auto'; bombs: number; digs: number; step: number; room: number; rounds?: number; stop?: AutoStop }
  | { type: 'deepdrop.drop'; step: number; room: number; pace: number; target?: number; rounds?: number; stop?: AutoStop }
  | { type: 'deepdrop.reel'; at: number }
  | { type: 'deepdrop.expire' }
  | { type: 'roulette.spin'; layout: Record<string, string>; room: number; rounds?: number; stop?: AutoStop }
  | ({ type: 'slot.spin' } & SlotPlay)
  | ({ type: 'table.deal'; game: string } & TableDealRequest)
  | { type: 'table.move'; game: string; choice: unknown }
  | { type: 'table.resume'; game: string }
  | ({ type: 'table.auto'; game: string; rounds?: number; stop?: AutoStop } & TableDealRequest)
  | { type: 'auto.start'; game: string; action: unknown; stop?: AutoStop; limit?: number; speed?: number }
  | { type: 'auto.sync' }
  | { type: 'auto.stop' }
  | { type: 'buyIn' }
  | { type: 'room'; index: number }
  | { type: 'charms.pull'; count: 1 | 10 }
  | { type: 'charms.equip'; id: string; slot?: number }
  | { type: 'charms.unequip'; id: string }
  | { type: 'charms.slot' };

/** The pit boss's tools for testing, on their own account or anyone's. */
export type AdminAction =
  | { type: 'admin.bank'; set: string }
  | { type: 'admin.tokens'; add: number }
  | { type: 'admin.charm'; id: string; copies: number }
  | { type: 'admin.slots' }
  | { type: 'admin.rooms'; best: number }
  | { type: 'admin.jackpot'; tier?: 'major' | 'grand'; value?: number; due?: boolean };

export type Action = PlayerAction | AdminAction;

/** What an action returned besides the new state: Keno's draws, or the capsules a pull opened. */
export type ActResult =
  | (AutoReply &
      (
        | { rounds: KenoRound[] | PlinkoRound[] | RouletteRound[] | SlotRound[] }
        | { steps: MinesStep[]; rounds: MinesRound[] }
        | { live: null; rounds: DeepDropRound[] }
        | { plays: TablePlay[] }
      ))
  | { rounds: KenoRound[] | PlinkoRound[] | RouletteRound[] | SlotRound[] }
  | { steps: MinesStep[]; rounds: MinesRound[] }
  | { live: DeepDropLive | null; rounds: DeepDropRound[] }
  | { plays: TablePlay[] }
  | { capsules: Capsule[] }
  | null;

export type ActOutcome = { ok: true; state: PlayerState; result: ActResult } | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

/**
 * Runs one action on a player's state: the only way the state changes. The
 * same code runs on the server, for members, and in a guest's browser.
 * Admin actions are refused unless `admin` is set.
 */
export function act(state: PlayerState, raw: unknown, ctx: EngineContext, opts: { admin?: boolean; auto?: boolean } = {}): ActOutcome {
  if (!raw || typeof raw !== 'object') return fail('No action.');
  const a = raw as Action;
  const t = ctx.tuning;
  const done = (next: PlayerState | null, error: string): ActOutcome => (next ? { ok: true, state: next, result: null } : fail(error));

  if (typeof a.type !== 'string') return fail('No action.');
  if (a.type.startsWith('admin.') && !opts.admin) return fail('Only the pit boss can do that.');
  // A round played by hand while auto play runs: auto play settles what's due and stops first.
  if (!opts.auto && playsRound(a.type) && autoSession(state)?.on) {
    const stopped = autoStop(state, ctx);
    if (!stopped.ok) return fail(stopped.error);
    return act(stopped.state, raw, ctx, opts);
  }
  switch (a.type) {
    case 'auto.start': {
      const out = autoStart(state, a, ctx, opts);
      return out.ok ? { ok: true, state: out.state, result: out.result as unknown as ActResult } : fail(out.error);
    }
    case 'auto.sync':
    case 'auto.stop': {
      const out = a.type === 'auto.sync' ? autoSync(state, ctx, opts) : autoStop(state, ctx);
      return out.ok ? { ok: true, state: out.state, result: out.result as unknown as ActResult } : fail(out.error);
    }
    case 'keno.play': {
      const out = playKeno(state, a, ctx);
      return out.ok ? { ok: true, state: out.state, result: { rounds: out.rounds } } : fail(out.error);
    }
    case 'plinko.play': {
      const out = playPlinko(state, a, ctx);
      return out.ok ? { ok: true, state: out.state, result: { rounds: out.rounds } } : fail(out.error);
    }
    case 'mines.begin':
    case 'mines.dig':
    case 'mines.track':
    case 'mines.cash':
    case 'mines.open':
    case 'mines.auto': {
      const out =
        a.type === 'mines.begin'
          ? minesBegin(state, a, ctx)
          : a.type === 'mines.dig'
            ? minesDig(state, a.square, ctx)
            : a.type === 'mines.track'
              ? minesTrack(state, a.track, ctx)
              : a.type === 'mines.cash'
                ? minesCash(state, ctx)
                : a.type === 'mines.open'
                  ? minesOpen(state, a.square, ctx)
                  : minesAuto(state, a, ctx);
      return out.ok ? { ok: true, state: out.state, result: { steps: out.steps, rounds: out.rounds } } : fail(out.error);
    }
    case 'deepdrop.drop':
    case 'deepdrop.reel':
    case 'deepdrop.expire': {
      const out = a.type === 'deepdrop.drop' ? deepdropDrop(state, a, ctx) : a.type === 'deepdrop.reel' ? deepdropReel(state, a.at, ctx) : deepdropExpire(state, ctx);
      return out.ok ? { ok: true, state: out.state, result: { live: out.live, rounds: out.rounds } } : fail(out.error);
    }
    case 'roulette.spin': {
      const out = playRoulette(state, a, ctx);
      return out.ok ? { ok: true, state: out.state, result: { rounds: out.rounds } } : fail(out.error);
    }
    case 'slot.spin': {
      const out = playSlot(state, a, ctx, !!opts.admin);
      return out.ok ? { ok: true, state: out.state, result: { rounds: out.rounds } } : fail(out.error);
    }
    case 'table.deal':
    case 'table.move':
    case 'table.resume':
    case 'table.auto': {
      if (typeof a.game !== 'string') return fail('No such table.');
      const out =
        a.type === 'table.deal'
          ? tableDeal(state, a.game, a, ctx)
          : a.type === 'table.move'
            ? tableMove(state, a.game, a.choice, ctx)
            : a.type === 'table.resume'
              ? tableResume(state, a.game, ctx)
              : tableAuto(state, a.game, a, ctx);
      return out.ok ? { ok: true, state: out.state, result: { plays: out.plays } } : fail(out.error);
    }
    case 'buyIn':
      return done(buyIn(state, t), 'You still have chips to play.');
    case 'room':
      return done(enterRoom(state, a.index), 'That room isn’t open yet.');
    case 'charms.pull': {
      if (a.count !== 1 && a.count !== 10) return fail('Pull one or ten.');
      const out = pullCharms(state, a.count, ctx);
      return out ? { ok: true, state: out.state, result: { capsules: out.capsules } } : fail('Not enough Tokens.');
    }
    case 'charms.equip':
      return done(typeof a.id === 'string' ? equipCharm(state, a.id, a.slot) : null, 'That charm can’t go there.');
    case 'charms.unequip':
      return done(typeof a.id === 'string' ? unequipCharm(state, a.id) : null, 'No such charm.');
    case 'charms.slot':
      return done(buySlot(state, t), 'Not enough Tokens.');

    case 'admin.bank': {
      const bank = amount(a.set, -1);
      if (bank.lt(0)) return fail('Not an amount.');
      return done({ ...state, bank: bank.toString(), floor: { ...state.floor, best: opened(bank, state.floor.best, roomTuningOf(t)) } }, '');
    }
    case 'admin.tokens':
      if (typeof a.add !== 'number' || !Number.isFinite(a.add)) return fail('Not a number.');
      return done({ ...state, meta: { ...state.meta, tokens: Math.max(0, state.meta.tokens + a.add) } }, '');
    case 'admin.charm': {
      if (typeof a.id !== 'string' || !findCharm(a.id) || !Number.isInteger(a.copies)) return fail('No such charm.');
      const copies = Math.max(0, (state.meta.collection[a.id] ?? 0) + a.copies);
      const collection = { ...state.meta.collection };
      if (copies) collection[a.id] = copies;
      else delete collection[a.id];
      const loadout = copies ? state.meta.loadout : state.meta.loadout.map((s) => (s === a.id ? null : s));
      return done({ ...state, meta: { ...state.meta, collection, loadout } }, '');
    }
    case 'admin.slots':
      return done({ ...state, meta: { ...state.meta, loadout: [...state.meta.loadout, ...Array<null>(MAX_SLOTS - state.meta.loadout.length).fill(null)] } }, '');
    case 'admin.rooms': {
      if (!Number.isInteger(a.best) || a.best < 0 || a.best > 1000) return fail('Not a room.');
      return done({ ...state, floor: { best: a.best, current: Math.min(state.floor.current, a.best) } }, '');
    }
    case 'admin.jackpot': {
      const j = jackpotState(state);
      if (a.due) return done(withJackpots(state, { ...j, due: true }), '');
      if ((a.tier !== 'major' && a.tier !== 'grand') || typeof a.value !== 'number' || !Number.isFinite(a.value)) return fail('Not a meter.');
      const value = Math.max(JACKPOT_SEEDS[a.tier], a.tier === 'major' ? Math.min(a.value, MAJOR_CAP) : a.value);
      return done(withJackpots(state, { ...j, [a.tier]: value }), '');
    }
    default:
      return fail('Unknown action.');
  }
}


/**
 * The games the engine plays: for a member, these are decided on the server.
 * Every other game is still decided in the browser, and members play it on a
 * practice bankroll until it moves here.
 */
export const ENGINE_GAMES: readonly string[] = ['keno', 'plinko', 'mines', 'deepdrop', 'roulette', 'vault', 'forge', 'haul', 'carnival', 'lanterns', 'blackjack', 'baccarat', 'uth', 'tcp', 'csp', 'c4p', 'stud', 'lir', 'djwild', 'paigow', 'suits'];

/** A run of seeds an action may need: `count` rounds of `game` from `from`. */
export interface SeedRun {
  game: string;
  from: number;
  count: number;
}

/**
 * The seeds an action could need, so a host that works seeds out ahead (the
 * server's are HMACs, which Web Crypto only does asynchronously) has them all.
 */
export function seedsWanted(state: PlayerState, action: unknown): SeedRun[] {
  const type = action && typeof action === 'object' ? (action as { type?: unknown }).type : undefined;
  switch (type) {
    case 'keno.play':
      return [{ game: 'keno', from: state.keno.round, count: KENO_BATCH_MAX }];
    case 'plinko.play':
      return [{ game: 'plinko', from: plinkoRound(state), count: PLINKO_BATCH_MAX }];
    case 'charms.pull':
      return [{ game: 'charms', from: 0, count: 1 }];
    case 'mines.begin':
    case 'mines.dig':
    case 'mines.track':
    case 'mines.cash':
    case 'mines.open':
    case 'mines.auto': {
      const r = minesRounds(state);
      return [{ game: 'mines', from: r.live ?? r.next, count: MINES_BATCH_MAX + 1 }];
    }
    case 'deepdrop.drop':
    case 'deepdrop.reel':
    case 'deepdrop.expire':
      return [{ game: 'deepdrop', from: deepdropRounds(state).from, count: DEEPDROP_BATCH_MAX + 1 }];
    case 'roulette.spin':
      return [{ game: 'roulette', from: rouletteRound(state), count: ROULETTE_BATCH_MAX }];
    case 'table.deal':
    case 'table.move':
    case 'table.resume':
    case 'table.auto': {
      const game = String((action as { game?: unknown }).game ?? '');
      if (!tableGames().includes(game)) return [];
      const t = tableProgress(state, game);
      const shoe = Number((t.progress.shoe as { number?: unknown } | undefined)?.number ?? 0) || 0;
      return [
        { game, from: t.round, count: TABLE_BATCH_MAX + 1 },
        { game: `${game}.shoe`, from: shoe, count: TABLE_BATCH_MAX + 2 },
      ];
    }
    case 'slot.spin': {
      const machine = String((action as { machine?: unknown }).machine ?? '');
      if (!/^[a-z]{1,20}$/.test(machine)) return [];
      return [
        { game: machine, from: slotRound(state, machine), count: SLOT_BATCH_MAX },
        { game: 'jackpot', from: jackpotState(state).majorHits, count: SLOT_BATCH_MAX + 1 },
      ];
    }
    default:
      return [];
  }
}
