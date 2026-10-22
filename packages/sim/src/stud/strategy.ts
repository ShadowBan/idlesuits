import type { Card } from '../cards';
import type { StudChoice, StudDecision } from './round';

/**
 * The published optimal strategy for Mississippi Stud, rule for rule.
 * Cards score points: jacks to aces 2, sixes to tens 1, deuces to fives 0.
 */

const points = (card: Card) => (card.rank >= 11 ? 2 : card.rank >= 6 ? 1 : 0);
const isMid = (card: Card) => card.rank >= 6 && card.rank <= 10;

/** Rank counts, highest pair first. */
function pairs(cards: readonly Card[]): number[] {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n >= 2).map(([r]) => r).sort((a, b) => b - a);
}

function hasTrips(cards: readonly Card[]): boolean {
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  return [...counts.values()].some((n) => n >= 3);
}

/** A pair of sixes or better, two pair, or trips: a hand that already pays or pushes. */
function madeHand(cards: readonly Card[]): boolean {
  const found = pairs(cards);
  return hasTrips(cards) || found.length >= 2 || (found[0] ?? 0) >= 6;
}

function lowPair(cards: readonly Card[]): boolean {
  const found = pairs(cards);
  return found.length > 0 && found[0]! <= 5;
}

const suited = (cards: readonly Card[]) => cards.every((c) => c.suit === cards[0]!.suit);

/**
 * How far a set of distinct ranks is from a straight: gaps inside the run, or
 * null if they cannot share one. Aces play high or low, whichever is tighter;
 * an ace playing low is a low card, not a high one.
 */
function straightGaps(cards: readonly Card[]): { gaps: number; high: number; highs: number } | null {
  const ranks = [...new Set(cards.map((c) => c.rank))];
  if (ranks.length !== cards.length) return null;
  let best: { gaps: number; high: number; highs: number } | null = null;
  for (const aceLow of [false, true]) {
    if (aceLow && !ranks.includes(14)) continue;
    const values = ranks.map((r) => (aceLow && r === 14 ? 1 : r)).sort((a, b) => a - b);
    const span = values[values.length - 1]! - values[0]!;
    if (span > 4) continue;
    const gaps = span - (values.length - 1);
    const highs = values.filter((v) => v >= 11).length;
    if (!best || gaps < best.gaps) best = { gaps, high: values[values.length - 1]!, highs };
  }
  return best;
}

function threeCards(cards: readonly Card[]): StudChoice {
  const total = cards.reduce((sum, c) => sum + points(c), 0);
  const draw = straightGaps(cards);
  const flushy = suited(cards);

  if (madeHand(cards)) return { move: 'bet', size: 3 };
  if (flushy && cards.every((c) => c.rank >= 10)) return { move: 'bet', size: 3 }; // royal flush draw
  if (flushy && draw) {
    if (draw.gaps === 0 && draw.high >= 7) return { move: 'bet', size: 3 };
    if (draw.gaps === 1 && draw.highs >= 1) return { move: 'bet', size: 3 };
    if (draw.gaps === 2 && draw.highs >= 2) return { move: 'bet', size: 3 };
  }
  if (flushy) return { move: 'bet', size: 1 };
  if (lowPair(cards)) return { move: 'bet', size: 1 };
  if (total >= 3) return { move: 'bet', size: 1 };
  if (draw && draw.gaps === 0 && draw.high >= 6) return { move: 'bet', size: 1 };
  if (draw && draw.gaps === 1 && cards.filter(isMid).length >= 2) return { move: 'bet', size: 1 };
  return { move: 'fold' };
}

function fourCards(cards: readonly Card[], bets: readonly number[]): StudChoice {
  const total = cards.reduce((sum, c) => sum + points(c), 0);
  const draw = straightGaps(cards);

  if (madeHand(cards)) return { move: 'bet', size: 3 };
  if (suited(cards)) return { move: 'bet', size: 3 };
  // Four in a row that can be finished at either end, eight-high or better.
  if (draw && draw.gaps === 0 && draw.high >= 8 && draw.high <= 13) return { move: 'bet', size: 3 };
  if (draw) return { move: 'bet', size: 1 };
  if (lowPair(cards)) return { move: 'bet', size: 1 };
  if (total >= 4) return { move: 'bet', size: 1 };
  if (cards.filter(isMid).length >= 3 && bets.includes(3)) return { move: 'bet', size: 1 };
  return { move: 'fold' };
}

export function decideStud(decision: StudDecision): StudChoice {
  const cards = [...decision.hole, ...decision.shown];

  if (decision.street === 3) {
    const [a, b] = cards as [Card, Card];
    if (a.rank === b.rank) return { move: 'bet', size: 3 };
    if (points(a) + points(b) >= 2) return { move: 'bet', size: 1 };
    const sixFive = new Set([a.rank, b.rank]).has(6) && new Set([a.rank, b.rank]).has(5);
    if (sixFive && a.suit === b.suit) return { move: 'bet', size: 1 };
    return { move: 'fold' };
  }
  if (decision.street === 4) return threeCards(cards);
  return fourCards(cards, decision.bets);
}
