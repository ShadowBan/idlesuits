import { rouletteBet, rouletteSettle, rouletteSpin, type RoundReport } from '@idlesuits/sim';
import { autoStops, batchSize, counter, progressOf, settleInstant, withProgress, type AutoStop, type InstantSettled } from './instant';
import { Decimal, formatMoney } from './money';
import { room } from './rooms';
import { bankOf, type BreakdownLine, type EngineContext } from './settle';
import type { PlayerState } from './state';
import { gameValue, roomTuningOf } from './tuning';

/** Most spins one auto request may play. */
export const ROULETTE_BATCH_MAX = 5;

/** A spin kept with its win: enough to spin it again exactly. */
export interface RouletteReplay {
  run: string;
  round: number;
  /** The layout it was spun with, in dollars, as strings so any size survives saving. */
  layout: Record<string, string>;
}

export interface RouletteRound extends InstantSettled {
  pocket: number;
  /** Each bet on the layout: its share of the chips, and what it won or lost, in units of the whole layout. */
  bets: { id: string; stake: number; net: number }[];
  replay: RouletteReplay;
}

export type RouletteOutcome = { ok: true; state: PlayerState; rounds: RouletteRound[] } | { ok: false; error: string };

/** A layout as sent: known bets, whole dollars, within the room's limits. Its chips by bet, or what's wrong. */
export function cleanLayout(raw: unknown, roomIndex: number, ctx: EngineContext): { layout: Record<string, Decimal>; total: Decimal } | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return 'Put some chips down.';
  const r = room(roomIndex, roomTuningOf(ctx.tuning));
  const layout: Record<string, Decimal> = {};
  let total = new Decimal(0);
  for (const [id, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!rouletteBet(id)) return 'There’s no such bet on the layout.';
    let amount: Decimal;
    try {
      amount = new Decimal(typeof v === 'string' || typeof v === 'number' ? v : NaN);
    } catch {
      return 'A bet isn’t an amount.';
    }
    if (!amount.isFinite() || amount.lte(0) || !amount.eq(amount.floor())) return 'Bets are whole dollars.';
    if (amount.gt(r.max)) return `No one bet can be over ${r.max.toString()}.`;
    layout[id] = amount;
    total = total.add(amount);
  }
  if (total.lt(r.min)) return 'The layout is under the table minimum.';
  return { layout, total };
}

/**
 * Spins the wheel for a layout: once, or up to ROULETTE_BATCH_MAX times for
 * auto play, the same chips each time. A batch stops when the bank no longer
 * covers the layout or a stop rule is met.
 */
export function playRoulette(state: PlayerState, req: { layout: unknown; room: number; rounds?: number; stop?: AutoStop }, ctx: EngineContext): RouletteOutcome {
  if (!Number.isInteger(req.room) || req.room < 0 || req.room > state.floor.best) return { ok: false, error: 'That room isn’t open.' };
  const clean = cleanLayout(req.layout, req.room, ctx);
  if (typeof clean === 'string') return { ok: false, error: clean };
  const { layout, total } = clean;
  const want = batchSize(req.rounds, ROULETTE_BATCH_MAX);
  const perBet = gameValue(ctx.tuning, 'roulette', 'tokensPerBet', true);
  const rounds: RouletteRound[] = [];
  let current = state;
  for (let i = 0; i < want; i++) {
    if (total.gt(bankOf(current))) break;
    const p = progressOf(current, 'roulette');
    const round = counter(p, 'round');
    const run = ctx.seed('roulette', round);
    const pocket = rouletteSpin({ run, round });
    // Every bet in units of the whole layout, so the charms see the spin as one bet.
    const stakes = Object.fromEntries(Object.entries(layout).map(([id, v]) => [id, v.div(total).toNumber()]));
    const result = rouletteSettle(stakes, pocket);
    // Tokens by each winning bet (as designed), or by the spin as one bet: see the table's rules.
    const bets: RoundReport['bets'] = [];
    if (perBet) {
      for (const b of result.bets) if (b.net > 0) bets.push({ kind: 'main', stake: 1, net: b.net });
      const lost = result.bets.filter((b) => b.net < 0).reduce((sum, b) => sum + b.stake, 0);
      if (lost > 0) bets.push({ kind: 'main', stake: lost, net: -lost });
    } else bets.push({ kind: 'main', stake: 1, net: result.net });
    const lines: BreakdownLine[] = result.bets.filter((b) => b.net > 0).map((b) => ({ label: `${rouletteBet(b.id)!.label} · ${rouletteBet(b.id)!.pays}:1`, amount: b.net }));
    const losers = result.bets.filter((b) => b.net < 0);
    const lost = losers.reduce((sum, b) => sum + b.net, 0);
    if (lost < 0) lines.push({ label: `${losers.length} losing ${losers.length === 1 ? 'bet' : 'bets'}`, amount: lost });
    const replay: RouletteReplay = { run, round, layout: Object.fromEntries(Object.entries(layout).map(([id, v]) => [id, v.toString()])) };
    const next = withProgress(current, 'roulette', { ...p, round: round + 1 });
    const done = settleInstant(
      next,
      { game: 'roulette', round, run, room: req.room, step: 0, bet: total, x: 1 + result.net, lines, text: `${pocket}`, sub: `${formatMoney(total)} down`, replay, bets, noBetLine: true, extra: { feats: result.bets.some((b) => b.net > 0 && rouletteBet(b.id)?.kind === 'straight') ? ['straight'] : [] } },
      ctx,
    );
    current = done.state;
    rounds.push({ ...done.settled, pocket, bets: result.bets.map((b) => ({ id: b.id, stake: b.stake, net: b.net })), replay });
    if (autoStops(req.stop, done.settled.net, bankOf(current))) break;
  }
  if (!rounds.length) return { ok: false, error: 'The layout is more than your bank.' };
  return { ok: true, state: current, rounds };
}

export function rouletteRound(state: PlayerState): number {
  return counter(progressOf(state, 'roulette'), 'round');
}
