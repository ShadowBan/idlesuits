import type { Card } from '../cards';
import { djCategoryOf, DjCategory, djScore, djTopRank, isWild } from './evaluate';

/**
 * The published DJ Wild strategy, first worked out by Elliot Frome: play a
 * pair of fours or better, except two fours with a three. Fold the rest.
 */
export function decideDj(cards: readonly Card[]): 'play' | 'fold' {
  const score = djScore(cards);
  const category = djCategoryOf(score);
  if (category > DjCategory.Pair) return 'play';
  if (category < DjCategory.Pair) return 'fold';
  const pair = djTopRank(score);
  if (pair < 4) return 'fold';
  // A pair of fours loses to more dealer threes when the player holds none of them.
  if (pair === 4 && cards.some((c) => !isWild(c) && c.rank === 3)) return 'fold';
  return 'play';
}
