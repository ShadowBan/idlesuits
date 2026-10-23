import type { Card } from '../cards';
import { threeCardScore } from '../three';

/** Queen-6-4, the weakest hand worth playing. */
export const TCP_PLAY_FROM = ((0 * 15 + 12) * 15 + 6) * 15 + 4;

/** The published optimal strategy: play queen-6-4 or better, fold the rest. */
export function decideTcp(cards: readonly Card[]): 'play' | 'fold' {
  return threeCardScore(cards) >= TCP_PLAY_FROM ? 'play' : 'fold';
}
