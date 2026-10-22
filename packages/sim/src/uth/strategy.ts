import { rankLabel, type Card, type Rank } from '../cards';
import { Category, categoryOfScore, evaluatePoker, pokerScore } from '../poker';
import type { UthDecision, UthMove } from './round';
import { payOf, UTH_RULES, type UthRules } from './rules';

/** "AKs", "QQ", "T9o" — the 169 distinct starting hands. */
export function startingHandKey(hole: readonly Card[]): string {
  const [a, b] = [...hole].sort((x, y) => y.rank - x.rank);
  const high = rankLabel(a!.rank);
  const low = rankLabel(b!.rank);
  if (a!.rank === b!.rank) return `${high}${high}`;
  return `${high}${low}${a!.suit === b!.suit ? 's' : 'o'}`;
}

/** Starting hands worth the big pre-flop raise. Derived by simulation; see uth-chart.ts. */
export type PreflopChart = Record<string, boolean>;

/** A pair that uses at least one hole card — the dealer cannot see it coming. */
export function hasHiddenPair(hole: readonly Card[], board: readonly Card[]): boolean {
  const boardRanks = board.map((c) => c.rank);
  return hole.some((card) => boardRanks.includes(card.rank) || hole.filter((c) => c.rank === card.rank).length > 1);
}

/** Four cards to a flush where the player's card in that suit is a ten or better. */
export function fourToFlushWithHighHole(hole: readonly Card[], board: readonly Card[], minRank: Rank = 10): boolean {
  const cards = [...hole, ...board];
  for (const suit of new Set(cards.map((c) => c.suit))) {
    const suited = cards.filter((c) => c.suit === suit);
    if (suited.length !== 4) continue;
    if (hole.some((c) => c.suit === suit && c.rank >= minRank)) return true;
  }
  return false;
}

export interface RiverOdds {
  /** Expected result of betting one more ante, counting ante, play and blind. */
  ev: number;
  /** Share of the dealer's possible holdings that beat the player. */
  beats: number;
  /** Dealer holdings counted, always 990 with a full board. */
  combinations: number;
}

/**
 * On the river nothing is unknown but the dealer's two cards, so the right
 * play can be computed rather than guessed: every one of the 990 remaining
 * holdings is dealt out and settled.
 */
export function riverOdds(
  hole: readonly Card[],
  board: readonly Card[],
  deck: readonly Card[],
  rules: UthRules = UTH_RULES,
  playBet = 1,
): RiverOdds {
  const playerScore = pokerScore([...hole, ...board]);
  const blindPays = payOf(rules.blindPays, categoryOfScore(playerScore));
  const seen = new Set([...hole, ...board].map((c) => `${c.rank}${c.suit}`));
  const unseen = deck.filter((c) => !seen.has(`${c.rank}${c.suit}`));

  // One reusable seven-card hand: the board, then the dealer's two cards.
  const hand: Card[] = [...board, unseen[0]!, unseen[0]!];
  let total = 0;
  let beats = 0;
  let combinations = 0;

  for (let i = 0; i < unseen.length; i++) {
    hand[5] = unseen[i]!;
    for (let j = i + 1; j < unseen.length; j++) {
      hand[6] = unseen[j]!;
      const dealerScore = pokerScore(hand);
      combinations++;
      // The ante only settles when the dealer opens with a pair or better;
      // otherwise it pushes, win or lose.
      const anteLive = categoryOfScore(dealerScore) >= rules.qualifies ? 1 : 0;
      if (dealerScore > playerScore) {
        beats++;
        total += -anteLive - playBet - 1; // play and blind always lose
      } else if (dealerScore < playerScore) {
        total += anteLive + playBet + blindPays;
      }
    }
  }
  return { ev: total / combinations, beats: beats / combinations, combinations };
}

export interface UthStrategy {
  chart: PreflopChart;
}

/**
 * Pre-flop reads from a chart. The flop uses the published rule of thumb: two
 * pair or better, a hidden pair other than deuces, or four to a flush with a
 * high hole card. The river is computed exactly.
 */
export function decideUth(
  strategy: UthStrategy,
  decision: UthDecision,
  deck: readonly Card[],
  rules: UthRules = UTH_RULES,
): { move: UthMove; raise?: number } {
  const { hole, board, street, raises } = decision;

  if (street === 'preflop') {
    return strategy.chart[startingHandKey(hole)] ? { move: 'raise', raise: raises[0] } : { move: 'check' };
  }

  const hand = evaluatePoker([...hole, ...board]);

  if (street === 'flop') {
    const pocketDeuces = hole[0]!.rank === 2 && hole[1]!.rank === 2;
    const raise =
      hand.category >= Category.TwoPair ||
      (hand.category === Category.Pair && hasHiddenPair(hole, board) && !pocketDeuces) ||
      fourToFlushWithHighHole(hole, board);
    return raise ? { move: 'raise', raise: raises[0] } : { move: 'check' };
  }

  // Folding costs the ante and the blind, so bet whenever one more ante beats that.
  const odds = riverOdds(hole, board, deck, rules, raises[0]);
  return odds.ev > -2 ? { move: 'raise', raise: raises[0] } : { move: 'fold' };
}
