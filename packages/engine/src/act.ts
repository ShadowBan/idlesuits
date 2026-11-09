import { findCharm, MAX_SLOTS } from '@idlesuits/sim';
import { playKeno, type KenoPlay, type KenoRound } from './keno';
import { amount } from './money';
import { opened } from './rooms';
import { buyIn, buySlot, enterRoom, equipCharm, pullCharms, unequipCharm, type Capsule, type EngineContext } from './settle';
import type { PlayerState } from './state';
import { roomTuningOf } from './tuning';

/** What a player can ask for. Each is checked here, whoever sends it. */
export type PlayerAction =
  | ({ type: 'keno.play' } & KenoPlay)
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
  | { type: 'admin.rooms'; best: number };

export type Action = PlayerAction | AdminAction;

/** What an action returned besides the new state: Keno's draws, or the capsules a pull opened. */
export type ActResult = { rounds: KenoRound[] } | { capsules: Capsule[] } | null;

export type ActOutcome = { ok: true; state: PlayerState; result: ActResult } | { ok: false; error: string };

const fail = (error: string) => ({ ok: false as const, error });

/**
 * Runs one action on a player's state: the only way the state changes. The
 * same code runs on the server, for members, and in a guest's browser.
 * Admin actions are refused unless `admin` is set.
 */
export function act(state: PlayerState, raw: unknown, ctx: EngineContext, opts: { admin?: boolean } = {}): ActOutcome {
  if (!raw || typeof raw !== 'object') return fail('No action.');
  const a = raw as Action;
  const t = ctx.tuning;
  const done = (next: PlayerState | null, error: string): ActOutcome => (next ? { ok: true, state: next, result: null } : fail(error));

  if (typeof a.type !== 'string') return fail('No action.');
  if (a.type.startsWith('admin.') && !opts.admin) return fail('Only the pit boss can do that.');
  switch (a.type) {
    case 'keno.play': {
      const out = playKeno(state, a, ctx);
      return out.ok ? { ok: true, state: out.state, result: { rounds: out.rounds } } : fail(out.error);
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
    default:
      return fail('Unknown action.');
  }
}


/**
 * The games the engine plays: for a member, these are decided on the server.
 * Every other game is still decided in the browser, and members play it on a
 * practice bankroll until it moves here.
 */
export const ENGINE_GAMES: readonly string[] = ['keno'];
