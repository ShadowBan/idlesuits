import type { Card } from '../cards';
import { Category, evaluatePoker } from '../poker';

/**
 * Wizard of Odds' Caribbean Stud strategy, 0.001% off optimal. Raise any pair
 * or better, fold anything under ace-king, and raise ace-king when:
 *  - the dealer's card is 2 to queen and matches one of yours; or
 *  - the dealer's card is an ace or king and you hold a queen or jack; or
 *  - the dealer's card matches none of yours, you hold a queen, and the dealer's
 *    card is lower than your fourth-highest card.
 */
export function decideCsp(cards: readonly Card[], upcard: Card): 'raise' | 'fold' {
  const hand = evaluatePoker(cards);
  if (hand.category >= Category.Pair) return 'raise';
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  if (ranks[0] !== 14 || ranks[1] !== 13) return 'fold';
  const up = upcard.rank;
  const matches = ranks.includes(up);
  if (matches && up <= 12) return 'raise';
  if ((up === 14 || up === 13) && (ranks.includes(12) || ranks.includes(11))) return 'raise';
  if (!matches && ranks.includes(12) && up < ranks[3]!) return 'raise';
  return 'fold';
}
