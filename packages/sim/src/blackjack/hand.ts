import type { Card, Rank } from '../cards';
import { cardValue } from './rules';

export interface HandTotal {
  /** The best total that is not a bust, or the bust total. */
  total: number;
  /** An ace is still counting as 11. */
  soft: boolean;
  bust: boolean;
}

export function totalOf(ranks: readonly Rank[]): HandTotal {
  let total = 0;
  let aces = 0;
  for (const rank of ranks) {
    const value = cardValue(rank);
    total += value;
    if (value === 11) aces++;
  }
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0, bust: total > 21 };
}

export function handTotal(cards: readonly Card[]): HandTotal {
  return totalOf(cards.map((c) => c.rank));
}

/** An ace and a ten-value card as the first two cards dealt — not after a split. */
export function isBlackjack(cards: readonly Card[]): boolean {
  if (cards.length !== 2) return false;
  const [a, b] = [cardValue(cards[0]!.rank), cardValue(cards[1]!.rank)];
  return (a === 11 && b === 10) || (a === 10 && b === 11);
}

export function isPair(cards: readonly Card[]): boolean {
  return cards.length === 2 && cardValue(cards[0]!.rank) === cardValue(cards[1]!.rank);
}
