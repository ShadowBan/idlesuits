import type { CharmTrigger, RoundReport } from '@idlesuits/sim';
import { Decimal } from './money';
import { affordable, room } from './rooms';
import { bankOf, recordWin, settleRound, type BreakdownLine, type EngineContext } from './settle';
import type { PlayerState, WinRecord } from './state';
export { counter, progressOf, withProgress } from './progress';
import { roomTuningOf } from './tuning';

/** The bets an instant game takes, in the room's minimums. */
export const BET_STEPS = [1, 2, 3, 5, 10, 20, 50, 100] as const;

/** Rules that end an auto batch early, the same ones the table's auto play stops on. */
export interface AutoStop {
  /** Stop after a round that won this many bets or more. */
  winX?: number;
  /** Stop once the bank falls below this, or reaches this, in dollars. */
  below?: string;
  above?: string;
}

/** What a round left behind, for the table to show once the round is on screen. */
export interface RoundAfter {
  bank: string;
  tokens: number;
  lifetimeTokens: number;
  best: number;
  current: number;
  /** The win it added to its game's list, if it won. */
  win?: WinRecord;
}

/** What every settled instant round tells the table, besides its own game's details. */
export interface InstantSettled {
  game: string;
  round: number;
  /** The round's seed, kept in its replay. */
  run: string;
  room: number;
  step: number;
  bet: string;
  /** Nothing was staked (a free round). */
  onHouse: boolean;
  /** In bets: what the round paid. */
  x: number;
  /** In bets: what the round came to, stake and charms included. */
  net: number;
  lines: BreakdownLine[];
  text: string;
  sub: string;
  tokens: number;
  triggers: CharmTrigger[];
  after: RoundAfter;
}

/**
 * The bet a round plays at: the room and step asked for, within the rooms
 * opened, stepped down to what the bank covers. Null if the bank can't cover
 * even the least bet (unless the round is on the house).
 */
export function fitBet(state: PlayerState, wantRoom: number, wantStep: number, ctx: EngineContext, free = false): { room: number; step: number; bet: Decimal } | null {
  const rt = roomTuningOf(ctx.tuning);
  const bank = bankOf(state);
  let roomIndex = Math.min(Math.max(0, Math.floor(wantRoom) || 0), state.floor.best);
  let step = Math.min(Math.max(0, Math.floor(wantStep) || 0), BET_STEPS.length - 1);
  if (!free) {
    roomIndex = affordable(bank, 1, roomIndex, rt);
    while (step > 0 && room(roomIndex, rt).min.mul(BET_STEPS[step]!).gt(bank)) step--;
  }
  const bet = room(roomIndex, rt).min.mul(BET_STEPS[step]!);
  if (!free && bet.gt(bank)) return null;
  return { room: roomIndex, step, bet };
}

/** The checks every instant game's play request shares. Null if it's fine, or what's wrong. */
export function badBet(play: { step: unknown; room: unknown }): string | null {
  if (!Number.isInteger(play.step) || (play.step as number) < 0 || (play.step as number) >= BET_STEPS.length) return 'That bet isn’t offered.';
  if (!Number.isInteger(play.room) || (play.room as number) < 0) return 'That room isn’t open.';
  return null;
}

/** How many rounds a batch asks for: at least one, at most `max`. */
export function batchSize(rounds: unknown, max: number): number {
  return Math.min(max, Math.max(1, Math.floor(typeof rounds === 'number' && Number.isFinite(rounds) ? rounds : 1)));
}

/**
 * Settles an instant round that paid `x` bets: through the charms (a round
 * on the house staked nothing, so all it pays is won), into the bank, the
 * Tokens, the stats, and the wins list (with `replay`) if it came out ahead.
 * The stake was never taken separately: the round's net is applied at once.
 */
export function settleInstant(
  state: PlayerState,
  r: {
    game: string;
    round: number;
    run: string;
    room: number;
    step: number;
    bet: Decimal;
    x: number;
    onHouse?: boolean;
    lines: BreakdownLine[];
    text: string;
    sub: string;
    replay: unknown;
    listRound?: number;
    /** The bets as the charms see them, where a round isn't one bet (roulette's layout). */
    bets?: RoundReport['bets'];
    /** The lines already say what the stake did: no "Bet" line of −1. */
    noBetLine?: boolean;
    /** What the stake's line is called ("Spin"), if not "Bet". */
    betLabel?: string;
    /** More for the charms to read: a slot spin's gems, a poker hand's rank. */
    extra?: Partial<Pick<RoundReport, 'gems' | 'nearMiss' | 'tier' | 'flush' | 'blackjack'>>;
  },
  ctx: EngineContext,
): { state: PlayerState; settled: InstantSettled } {
  const onHouse = !!r.onHouse;
  const net = onHouse ? r.x : r.x - 1;
  const report: RoundReport = {
    game: r.game,
    seed: { run: r.run, round: r.round },
    // Stake 1 even on the house, as before: charms count a free round's win like any other.
    bets: r.bets ?? [{ kind: 'main', stake: 1, net }],
    outcome: net > 0 ? 'win' : net === 0 ? 'push' : 'lose',
    ...r.extra,
  };
  const out = settleRound({ ...state, floor: { ...state.floor, current: r.room } }, report, r.bet, net, ctx);
  let next = out.state;
  const units = net + out.extra;
  const money = r.bet.mul(units);
  let win: WinRecord | undefined;
  if (money.gt(0)) {
    win = { round: r.listRound ?? r.round + 1, text: r.text, sub: r.sub, net: money.toString(), unit: r.bet.toString(), at: ctx.now, replay: r.replay };
    next = recordWin(next, r.game, win);
  }
  return {
    state: next,
    settled: {
      game: r.game,
      round: r.round,
      run: r.run,
      room: r.room,
      step: r.step,
      bet: r.bet.toString(),
      onHouse,
      x: r.x,
      net: units,
      lines: [...(onHouse || r.noBetLine ? [] : [{ label: r.betLabel ?? 'Bet', amount: -1 }]), ...r.lines, ...out.lines],
      text: r.text,
      sub: r.sub,
      tokens: out.tokens,
      triggers: out.triggers,
      after: { bank: next.bank, tokens: next.meta.tokens, lifetimeTokens: next.meta.lifetimeTokens, best: next.floor.best, current: next.floor.current, win },
    },
  };
}

/** An auto batch's stop rules, checked after a round that came to `net` bets, with the bank after it. */
export function autoStops(stop: AutoStop | undefined, net: number, bank: Decimal): boolean {
  if (!stop) return false;
  if (typeof stop.winX === 'number' && stop.winX > 0 && net >= stop.winX) return true;
  try {
    if (stop.below !== undefined && bank.lt(new Decimal(stop.below))) return true;
    if (stop.above !== undefined && new Decimal(stop.above).gt(0) && bank.gte(new Decimal(stop.above))) return true;
  } catch {
    // A rule that isn't an amount stops nothing.
  }
  return false;
}
