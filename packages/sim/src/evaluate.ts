import { SUITS, type Face, type Rank, type Suit } from './cards';

export interface HandEval {
  /** Suit of the best flush. */
  suit: Suit;
  /** Number of cards in the best flush. */
  size: number;
  /** Ranks in the best flush, high to low. This is the tiebreak key. */
  ranks: Rank[];
  suitCounts: Record<Suit, number>;
  /** Longest run of consecutive ranks within one suit; Ace plays high or low. */
  straightFlush: number;
}

export interface Qualifier {
  minSize: number;
  /** Top card needed when the flush is exactly `minSize`. */
  minHighCard: Rank;
}

/** Positive if a beats b, negative if b beats a, 0 on an exact tie. */
export function compareFlush(a: { size: number; ranks: Rank[] }, b: { size: number; ranks: Rank[] }): number {
  if (a.size !== b.size) return a.size - b.size;
  for (let i = 0; i < a.ranks.length; i++) {
    const diff = a.ranks[i]! - b.ranks[i]!;
    if (diff !== 0) return diff;
  }
  return 0;
}

function longestRun(ranks: Rank[]): number {
  let mask = 0;
  for (const r of ranks) {
    mask |= 1 << r;
    if (r === 14) mask |= 1 << 1;
  }
  let best = 0;
  let run = 0;
  for (let r = 1; r <= 14; r++) {
    if (mask & (1 << r)) {
      run++;
      if (run > best) best = run;
    } else {
      run = 0;
    }
  }
  return best;
}

export function evaluateHand(cards: readonly Face[]): HandEval {
  const bySuit: Record<Suit, Rank[]> = { S: [], H: [], D: [], C: [] };
  for (const card of cards) bySuit[card.suit].push(card.rank);

  let best: { suit: Suit; size: number; ranks: Rank[] } | null = null;
  let straightFlush = 0;
  const suitCounts = { S: 0, H: 0, D: 0, C: 0 } as Record<Suit, number>;

  for (const suit of SUITS) {
    const ranks = bySuit[suit].sort((x, y) => y - x);
    suitCounts[suit] = ranks.length;
    const candidate = { suit, size: ranks.length, ranks };
    if (best === null || compareFlush(candidate, best) > 0) best = candidate;
    const run = longestRun(ranks);
    if (run > straightFlush) straightFlush = run;
  }

  return { ...best!, suitCounts, straightFlush };
}

export function qualifies(hand: HandEval, rule: Qualifier): boolean {
  if (hand.size !== rule.minSize) return hand.size > rule.minSize;
  return hand.ranks[0]! >= rule.minHighCard;
}
