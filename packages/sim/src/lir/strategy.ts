import type { Card } from '../cards';

/**
 * Wizard of Odds' Let It Ride strategy for the standard pay table. "High"
 * means a ten or better; an ace playing low in A-2-3-4-5 is not high.
 */

/** Distinct ranks with the ace low and high, for straight draws: the tightest window, with how many high cards in it. */
function window(cards: readonly Card[]): { span: number; highs: number; top: number } | null {
  const ranks = cards.map((c) => c.rank);
  if (new Set(ranks).size !== ranks.length) return null;
  let best: { span: number; highs: number; top: number } | null = null;
  for (const aceLow of [false, true]) {
    if (aceLow && !ranks.includes(14)) continue;
    const values = ranks.map((r) => (aceLow && r === 14 ? 1 : r)).sort((a, b) => a - b);
    const span = values[values.length - 1]! - values[0]! + 1;
    if (span > 5) continue;
    const highs = values.filter((v) => v >= 10).length;
    if (!best || span < best.span) best = { span, highs, top: values[values.length - 1]! };
  }
  return best;
}

const suited = (cards: readonly Card[]) => cards.every((c) => c.suit === cards[0]!.suit);

/** A hand that already pays: tens or better, two pair, trips, quads. */
function paying(cards: readonly Card[]): boolean {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  const groups = [...counts.entries()].filter(([, n]) => n >= 2);
  return groups.length >= 2 || groups.some(([r, n]) => n >= 3 || r >= 10);
}

/** With three cards: let the first bet ride? */
export function rideThree(cards: readonly Card[]): boolean {
  if (paying(cards)) return true;
  if (!suited(cards)) return false;
  if (cards.every((c) => c.rank >= 10)) return true; // three to a royal
  const w = window(cards);
  if (!w) return false;
  if (w.span === 3) return w.top >= 5; // a suited run, except A-2-3 and 2-3-4
  if (w.span === 4) return w.highs >= 1;
  if (w.span === 5) return w.highs >= 2;
  return false;
}

/** With four cards: let the second bet ride? */
export function rideFour(cards: readonly Card[]): boolean {
  if (paying(cards)) return true;
  if (suited(cards)) return true;
  const w = window(cards);
  if (!w) return false;
  // Four in a row that can be finished at either end: not A-2-3-4 and not J-Q-K-A.
  if (w.span === 4 && w.top >= 5 && w.top <= 13) return true;
  // Four to an inside straight, all of them ten or better (worth exactly as much as pulling back).
  return w.highs === 4;
}

export function decideLir(cards: readonly Card[]): 'ride' | 'pull' {
  return (cards.length === 3 ? rideThree(cards) : rideFour(cards)) ? 'ride' : 'pull';
}
