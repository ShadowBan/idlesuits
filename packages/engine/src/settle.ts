import {
  applyCharms,
  drawCharm,
  findCharm,
  levelOf,
  maxLevelOf,
  MAX_SLOTS,
  SLOT_COSTS,
  type CharmTrigger,
  type Equipped,
  type RoundReport,
} from '@idlesuits/sim';
import { amount, Decimal } from './money';
import { MIN_BET, opened, room } from './rooms';
import type { GameStats, PlayerState, WinRecord } from './state';
import { WINS_KEPT } from './state';
import { growJackpots } from './jackpots';
import { tokenBoost, trackPass, useFreePulls } from './pass';
import { roomTuningOf, type EngineTuning } from './tuning';

/** What a host gives the engine for one action. */
export interface EngineContext {
  /** Date.now(), for the stats and wins. */
  now: number;
  tuning: EngineTuning;
  /** The shared progressive jackpot, for a member: rounds feed it and slot spins play against it. */
  link?: import('./jackpots').JackpotLink;
  /**
   * The seed for one round of a game. On the server it's an HMAC of the
   * player's secret key, so it can't be known before the round; in a guest's
   * browser it comes from the browser's own save.
   */
  seed(game: string, round: number): string;
}

/** One line of a payout explanation: a label and an amount in bet units. */
export interface BreakdownLine {
  label: string;
  amount: number;
}

export function bankOf(state: PlayerState): Decimal {
  return amount(state.bank);
}

/** The charms on, with their levels. */
export function equipped(state: PlayerState): Equipped[] {
  return state.meta.loadout.filter((id): id is string => id !== null).map((id) => ({ id, level: levelOf(state.meta.collection[id] ?? 0, maxLevelOf(id)) }));
}

/** Moves the bank by `delta` and opens any rooms the new bank has earned. */
export function moveBank(state: PlayerState, delta: Decimal, t: EngineTuning): PlayerState {
  const bank = bankOf(state).add(delta).max(0);
  const best = opened(bank, state.floor.best, roomTuningOf(t));
  return { ...state, bank: bank.toString(), floor: best === state.floor.best ? state.floor : { ...state.floor, best } };
}

/** A round has settled: counts it in the game's lifetime record. `net` in bets of `unit`. */
function countRound(state: PlayerState, report: RoundReport, unit: Decimal, net: number, now: number): PlayerState {
  const old = state.stats.games[report.game];
  const game: GameStats = old ? { ...old } : { rounds: 0, wagered: '0', net: '0', biggestWin: '0', bestX: 0, wins: 0, lastPlayed: 0 };
  const staked = report.bets.reduce((sum, b) => sum + Math.max(0, b.stake), 0);
  const money = unit.mul(net);
  game.rounds++;
  game.wagered = new Decimal(game.wagered).add(unit.mul(staked)).toString();
  game.net = new Decimal(game.net).add(money).toString();
  if (net > 0) {
    game.wins++;
    if (money.gt(new Decimal(game.biggestWin))) game.biggestWin = money.toString();
    game.bestX = Math.max(game.bestX, net);
  }
  game.lastPlayed = now;
  const bank = bankOf(state);
  return {
    ...state,
    stats: {
      since: state.stats.since || now,
      peakBank: bank.gt(new Decimal(state.stats.peakBank)) ? bank.toString() : state.stats.peakBank,
      games: { ...state.stats.games, [report.game]: game },
    },
  };
}

export interface SettleOutcome {
  state: PlayerState;
  /** The charms' extra cash, in bets. */
  extra: number;
  /** Tokens earned, room bonus and rate included. */
  tokens: number;
  triggers: CharmTrigger[];
  /** The charms' cash, as breakdown lines. */
  lines: BreakdownLine[];
}

/**
 * The one step every game's settled round goes through: applies the charms,
 * pays the bank the round's net plus whatever charms add (`net` in bets of
 * `unit`, the stake already counted in it), pays the Tokens (more in higher
 * rooms), and counts the round in the lifetime stats.
 */
export function settleRound(state: PlayerState, report: RoundReport, unit: Decimal, net: number, ctx: EngineContext): SettleOutcome {
  const t = ctx.tuning;
  const out = applyCharms(report, equipped(state), state.meta.run);
  // Higher rooms comp more: their Token bonus multiplies everything earned on the round.
  // A Lucky Stars boost doubles them.
  const tokens = Math.max(0, out.tokens * room(state.floor.current, roomTuningOf(t)).tokenBonus * t.tokenRate * tokenBoost(state.pass, ctx.now));
  let next: PlayerState = {
    ...state,
    meta: { ...state.meta, run: out.state, hands: state.meta.hands + 1, tokens: state.meta.tokens + tokens, lifetimeTokens: state.meta.lifetimeTokens + tokens },
  };
  next = moveBank(next, unit.mul(net + out.cash), t);
  next = countRound(next, report, unit, net + out.cash, ctx.now);
  next = trackPass(next, report, net + out.cash, tokens, ctx.now);
  // Every round anywhere feeds the linked progressives: the shared ones, reported back, or the player's own.
  if (ctx.link) ctx.link.rounds++;
  else next = growJackpots(next, ctx, true);
  return {
    state: next,
    extra: out.cash,
    tokens,
    triggers: out.triggers,
    lines: out.triggers.filter((tr) => tr.cash > 0).map((tr) => ({ label: `${tr.name} · charm`, amount: tr.cash })),
  };
}

/** Adds a win to the top of a game's list. */
export function recordWin(state: PlayerState, game: string, win: WinRecord): PlayerState {
  return { ...state, wins: { ...state.wins, [game]: [win, ...(state.wins[game] ?? [])].slice(0, WINS_KEPT) } };
}

/** Too little left for the cheapest table: the player can buy back in. */
export function isBroke(state: PlayerState): boolean {
  return bankOf(state).lt(MIN_BET);
}

/** A fresh stake, back on the Main Floor; rooms already opened stay open. Only when broke. */
export function buyIn(state: PlayerState, t: EngineTuning): PlayerState | null {
  if (!isBroke(state)) return null;
  return { ...state, bank: new Decimal(t.buyIn).toString(), floor: { ...state.floor, current: 0 } };
}

/** Sits in a room already opened. */
export function enterRoom(state: PlayerState, index: number): PlayerState | null {
  if (!Number.isInteger(index) || index < 0 || index > state.floor.best) return null;
  return index === state.floor.current ? state : { ...state, floor: { ...state.floor, current: index } };
}

/** One capsule's contents, as the machine shows it. */
export interface Capsule {
  id: string;
  /** First copy of this charm. */
  isNew: boolean;
  /** Level after this copy, and whether it just went up. */
  level: number;
  levelUp: boolean;
}

/** Pulls one or ten capsules from the Charm Machine; null if there aren't the Tokens for it. */
export function pullCharms(state: PlayerState, count: 1 | 10, ctx: EngineContext, free = false): { state: PlayerState; capsules: Capsule[] } | null {
  const cost = free ? 0 : count === 10 ? ctx.tuning.tenPullCost : ctx.tuning.pullCost;
  if (state.meta.tokens < cost) return null;
  // Free pulls from Lucky Stars: one each.
  if (free) {
    const paid = useFreePulls(state, count);
    if (!paid) return null;
    state = paid;
  }
  const seed = ctx.seed('charms', 0);
  const collection = { ...state.meta.collection };
  const capsules: Capsule[] = [];
  let pulls = state.meta.pulls;
  for (let i = 0; i < count; i++) {
    const id = drawCharm(seed, pulls++, ctx.tuning.secretOdds);
    const before = collection[id] ?? 0;
    collection[id] = before + 1;
    const level = levelOf(before + 1, maxLevelOf(id));
    capsules.push({ id, isNew: before === 0, level, levelUp: before > 0 && level > levelOf(before, maxLevelOf(id)) });
  }
  return { state: { ...state, meta: { ...state.meta, tokens: state.meta.tokens - cost, collection, pulls } }, capsules };
}

/** Puts a charm in the first empty slot (or the given one); null if it isn't owned or there's no room. */
export function equipCharm(state: PlayerState, id: string, slot?: number): PlayerState | null {
  if (!findCharm(id) || !state.meta.collection[id]) return null;
  const loadout = state.meta.loadout.map((s) => (s === id ? null : s));
  const at = slot ?? loadout.indexOf(null);
  if (!Number.isInteger(at) || at < 0 || at >= loadout.length) return null;
  loadout[at] = id;
  return { ...state, meta: { ...state.meta, loadout } };
}

export function unequipCharm(state: PlayerState, id: string): PlayerState {
  return { ...state, meta: { ...state.meta, loadout: state.meta.loadout.map((s) => (s === id ? null : s)) } };
}

/** The price of the next charm slot, or null when every slot is open. */
export function nextSlotCost(state: PlayerState, t: EngineTuning): number | null {
  const slots = state.meta.loadout.length;
  return slots < MAX_SLOTS ? Math.round(SLOT_COSTS[slots]! * t.slotCostScale) : null;
}

export function buySlot(state: PlayerState, t: EngineTuning): PlayerState | null {
  const cost = nextSlotCost(state, t);
  if (cost === null || state.meta.tokens < cost) return null;
  return { ...state, meta: { ...state.meta, tokens: state.meta.tokens - cost, loadout: [...state.meta.loadout, null] } };
}
