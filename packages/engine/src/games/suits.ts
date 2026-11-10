import { buildShoe, DEFAULT_RULES, maxRaise, simulateRound, standardDeck, type GameEvent, type RaisePolicy, type RoundResult, type TableRules } from '@idlesuits/sim';
import { mainBet } from '../report';
import { registerTable, sidesDown, type TableAdapter } from '../tables';
import { rulesFor, type EngineTuning } from '../tuning';

/** The one deck Idle Suits deals from, shuffled afresh each round by its seed. */
const SHOE = buildShoe(standardDeck('player'));

/** The raise to choose, once the player's flush is known: up to the cap for its size, and what the plan says. */
export interface SuitsDecision {
  size: number;
  cap: number;
  suggested: number;
}

interface SuitsData {
  round: number;
  bonuses: Record<string, number>;
  plan: RaisePolicy;
  dealerClaims: boolean;
}

/** A raise plan as sent: a raise for each flush size, and whether three-card hands must reach the minimum. */
function cleanPlan(raw: unknown): RaisePolicy {
  const p = raw && typeof raw === 'object' ? (raw as { raises?: Record<string, unknown>; threeCardMinimum?: unknown }) : {};
  const raises: Record<number, number> = {};
  for (const [size, v] of Object.entries(p.raises ?? {})) {
    const n = Number(size);
    if (Number.isInteger(n) && n >= 2 && n <= 7 && typeof v === 'number' && Number.isInteger(v)) raises[n] = Math.min(10, Math.max(0, v));
  }
  if (!Object.keys(raises).length) Object.assign(raises, { 2: 0, 3: 1, 4: 1, 5: 2, 6: 3 });
  return { kind: 'bySize', raises, minRanks: p.threeCardMinimum === false ? undefined : [10, 8, 6] };
}

function rulesOf(t: EngineTuning, data: SuitsData): TableRules {
  return { ...rulesFor(t, 'suits', DEFAULT_RULES), unclaimedOwner: data.dealerClaims ? 'dealer' : 'none' };
}

function play(t: EngineTuning, run: string, data: SuitsData, raisePolicy: RaisePolicy): RoundResult {
  return simulateRound({
    shoe: SHOE,
    seats: [{ raisePolicy, sideBets: data.bonuses }],
    rules: rulesOf(t, data),
    seed: { run, dealerId: 'standard', round: data.round },
    recordEvents: true,
  });
}

const isRaise = (e: GameEvent) => e.type === 'RaiseDecided' && e.seat === 0;

/**
 * Idle Suits: the ante (and any side bets) down, seven cards each from one
 * deck. The player sees their flush, then raises 0 to the cap for its size (0
 * folds); then the dealer shows. Dealer-claimed side bets, if the player
 * plays with them, can cost more than was down: never more than the bank.
 */
export const suits: TableAdapter<SuitsDecision, number, GameEvent, RoundResult> = {
  game: 'suits',
  blindMain: 0,
  sides: (ctx) => rulesFor(ctx.tuning, 'suits', DEFAULT_RULES).sideBets.map((b) => b.id),
  open(_state, req) {
    const unit = Number(req.bet);
    const bonuses = Object.fromEntries(
      Object.entries(req.sides ?? {})
        .filter(([, v]) => Number(v) > 0)
        .map(([id, v]) => [id, Number(v) / unit]),
    );
    const data: SuitsData = { round: (req as unknown as { round: number }).round, bonuses, plan: cleanPlan(req.options?.plan), dealerClaims: req.options?.dealerClaims === true };
    return { data: data as unknown as Record<string, unknown>, down: 1 + sidesDown(bonuses) };
  },
  step(raw, choices, ctx) {
    const data = raw as unknown as SuitsData;
    const run = ctx.seed('suits', data.round);
    const planned = play(ctx.tuning, run, data, data.plan);
    const at = planned.events.findIndex(isRaise);
    if (choices.length) {
      const result = play(ctx.tuning, run, data, { kind: 'fixed', raise: choices[0]! });
      return { kind: 'done', events: result.events, result };
    }
    if (at < 0) return { kind: 'done', events: planned.events, result: planned };
    const seat = planned.seats[0]!;
    const cap = maxRaise(rulesOf(ctx.tuning, data).raiseCaps, seat.hand.size);
    return { kind: 'decision', events: planned.events.slice(0, at), decision: { size: seat.hand.size, cap, suggested: Math.min(seat.raise, cap) } };
  },
  offer(d, _data, afford) {
    // Raises are paid from the bank: never more than it covers.
    let cap = d.cap;
    while (cap > 0 && !afford(cap)) cap--;
    return { ...d, cap, suggested: Math.min(d.suggested, cap) };
  },
  cost: (d, c) => (Number.isInteger(c) && c >= 0 && c <= d.cap ? c : null),
  suggest: (d) => d.suggested,
  report(result) {
    const seat = result.seats[0]!;
    return {
      report: {
        bets: [
          ...mainBet(1 + seat.raise, seat.mainNet),
          ...Object.values(seat.sideBets)
            .filter((b) => b.owner === 'player')
            .flatMap((b) => (b.stake > 0 ? [{ kind: 'side' as const, stake: b.stake, net: b.net }] : [])),
        ],
        outcome: seat.outcome === 'dealerNoQualify' ? 'win' : seat.outcome,
        // Every hand here is a flush; a charm's "flush" is a big one.
        flush: seat.hand.size >= 6,
      },
      net: seat.net,
      text: `${seat.hand.size}-card flush`,
      sub: seat.outcome === 'dealerNoQualify' ? 'dealer didn’t qualify' : seat.outcome,
    };
  },
};

registerTable(suits);
