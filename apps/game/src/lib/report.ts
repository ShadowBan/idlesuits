import type { BonusResult, ReportBet, RoundReport } from '@idlesuits/sim';

/** A main-game bet in a hand's report; a stake of zero (a bet never made) is left out. */
export function mainBet(stake: number, net: number): ReportBet[] {
  return stake > 0 ? [{ kind: 'main', stake, net }] : [];
}

/** The side bets in a hand's report, each with the stake it was dealt at. */
export function sideBets(bonuses: readonly BonusResult[], stakes: Readonly<Record<string, number>>): ReportBet[] {
  return bonuses.filter((b) => (stakes[b.id] ?? 0) > 0).map((b) => ({ kind: 'side', stake: stakes[b.id]!, net: b.net }));
}

/** The main game's result from its net, side bets aside. */
export function outcomeOf(folded: boolean, mainNet: number): RoundReport['outcome'] {
  if (folded) return 'fold';
  return mainNet > 0 ? 'win' : mainNet < 0 ? 'lose' : 'push';
}
