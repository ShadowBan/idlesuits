import type { Card } from '../cards';
import { bestFour, FourCategory } from '../four';

const pack = (category: number, a = 0, b = 0, c = 0, d = 0) => (((category * 15 + a) * 15 + b) * 15 + c) * 15 + d;

/** A pair of aces: the weakest hand allowed the big Play bet. */
export const C4P_BIG_PLAY_FROM = pack(FourCategory.Pair, 14);
/** King-queen-8-4: the weakest hand worth playing at all. */
export const C4P_PLAY_FROM = pack(FourCategory.HighCard, 13, 12, 8, 4);

export type C4pChoice = { move: 'fold' } | { move: 'play'; size: number };

/** Wizard of Odds' simple strategy, 0.000089% off optimal: play 3× with aces up, 1× with K-Q-8-4 or better. */
export function decideC4p(cards: readonly Card[], bigPlay = 3): C4pChoice {
  const { score } = bestFour(cards);
  if (score >= C4P_BIG_PLAY_FROM) return { move: 'play', size: bigPlay };
  if (score >= C4P_PLAY_FROM) return { move: 'play', size: 1 };
  return { move: 'fold' };
}
