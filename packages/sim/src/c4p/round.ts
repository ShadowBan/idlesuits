import { settleBonuses, type BonusResult } from '../bonus';
import { standardDeck, type Card } from '../cards';
import { bestFour, fourCategoryOf, FourCategory, fourTopRank } from '../four';
import { Rng, type Seed } from '../rng';
import { C4P_BONUSES } from './bonus';
import { C4P_RULES, type C4pRules } from './rules';
import { C4P_BIG_PLAY_FROM, type C4pChoice } from './strategy';

export interface C4pDecision {
  cards: Card[];
  /** Index of the card the best four leave out. */
  discard: number;
  /** Play bet sizes allowed: [1], or [1, 3] with a pair of aces or better. */
  sizes: number[];
}

export type C4pEvent =
  | { type: 'RoundStarted'; round: number; bonuses: Record<string, number> }
  | { type: 'PlayerCards'; cards: Card[]; score: number; discard: number }
  | { type: 'DealerCards' }
  | { type: 'Decision' }
  | { type: 'Played'; size: number }
  | { type: 'Folded' }
  | { type: 'DealerRevealed'; cards: Card[]; score: number; discard: number; opens: boolean }
  | { type: 'Settled'; part: 'ante' | 'play' | 'superBonus'; net: number; note: string }
  | { type: 'BonusSettled'; result: BonusResult }
  | { type: 'RoundSettled'; net: number };

export interface C4pRoundInput {
  rules?: C4pRules;
  seed: { run: Seed; round: number };
  decide: (decision: C4pDecision) => C4pChoice;
  /** Side bets by id (see C4P_BONUSES), in antes. Missing or zero is off. */
  bonuses?: Readonly<Record<string, number>>;
  recordEvents?: boolean;
  onEvent?: (event: C4pEvent) => void;
}

export interface C4pRoundResult {
  player: Card[];
  dealer: Card[];
  playerScore: number;
  dealerScore: number;
  opens: boolean;
  /** Play bet in antes; zero after a fold. */
  play: number;
  folded: boolean;
  /** In antes. The Super Bonus is a required bet the size of the Ante. */
  parts: { ante: number; play: number; superBonus: number; bonus: number };
  bonuses: BonusResult[];
  net: number;
  events: C4pEvent[];
}

/** What the Super Bonus pays for a hand of a straight or better, or 0 below that. */
export function superBonusPays(score: number, rules: C4pRules = C4P_RULES): number {
  const category = fourCategoryOf(score);
  const sb = rules.superBonus;
  if (category === FourCategory.Quads) return fourTopRank(score) === 14 ? sb.fourAces : sb.quads;
  if (category === FourCategory.StraightFlush) return sb.straightFlush;
  if (category === FourCategory.Trips) return sb.trips;
  if (category === FourCategory.Flush) return sb.flush;
  if (category === FourCategory.Straight) return sb.straight;
  return 0;
}

export function simulateC4pRound(input: C4pRoundInput): C4pRoundResult {
  const rules = input.rules ?? C4P_RULES;
  const events: C4pEvent[] = [];
  const emit = (event: C4pEvent) => {
    if (input.recordEvents) events.push(event);
    input.onEvent?.(event);
  };

  const rng = new Rng(input.seed.run, 'c4p', input.seed.round);
  const deck = standardDeck('player');
  let next = 0;
  const draw = (): Card => {
    const j = next + rng.int(deck.length - next);
    const card = deck[j]!;
    deck[j] = deck[next]!;
    deck[next] = card;
    next++;
    return card;
  };

  const stakes = { ...input.bonuses };
  emit({ type: 'RoundStarted', round: input.seed.round, bonuses: stakes });
  const player = Array.from({ length: 5 }, draw);
  const dealer = Array.from({ length: 5 }, draw);
  const mine = bestFour(player);
  const theirs = bestFour(dealer);
  emit({ type: 'PlayerCards', cards: player, score: mine.score, discard: mine.discard });
  emit({ type: 'DealerCards' });

  emit({ type: 'Decision' });
  const sizes = mine.score >= C4P_BIG_PLAY_FROM ? [1, rules.bigPlay] : [1];
  const choice = input.decide({ cards: player, discard: mine.discard, sizes });
  const folded = choice.move === 'fold';
  const play = choice.move === 'play' ? (sizes.includes(choice.size) ? choice.size : 1) : 0;
  emit(folded ? { type: 'Folded' } : { type: 'Played', size: play });

  const opens = theirs.score >= rules.opensHigh * 15 ** 3;
  emit({ type: 'DealerRevealed', cards: dealer, score: theirs.score, discard: theirs.discard, opens });

  const parts = { ante: 0, play: 0, superBonus: 0, bonus: 0 };
  const settle = (part: 'ante' | 'play' | 'superBonus', net: number, note: string) => {
    parts[part] = net;
    emit({ type: 'Settled', part, net, note });
  };

  if (folded) {
    settle('ante', -1, 'folded');
    settle('superBonus', -1, 'folded');
  } else {
    const cmp = mine.score - theirs.score;
    if (!opens) {
      settle('ante', 0, 'dealer does not open');
      settle('play', play, 'win');
    } else if (cmp > 0) {
      settle('ante', 1, 'win');
      settle('play', play, 'win');
    } else if (cmp < 0) {
      settle('ante', -1, 'lose');
      settle('play', -play, 'lose');
    } else {
      settle('ante', 0, 'tie');
      settle('play', 0, 'tie');
    }
    // The Super Bonus pays on a straight or better however the hand goes; below that it only loses to a dealer win.
    const pays = superBonusPays(mine.score, rules);
    if (pays > 0) settle('superBonus', pays, `pays ${pays}:1`);
    else settle('superBonus', opens && cmp < 0 ? -1 : 0, opens && cmp < 0 ? 'lose' : 'push');
  }

  const bonuses = settleBonuses(C4P_BONUSES, stakes, { player, dealer });
  for (const result of bonuses) {
    parts.bonus += result.net;
    emit({ type: 'BonusSettled', result });
  }
  const net = parts.ante + parts.play + parts.superBonus + parts.bonus;
  emit({ type: 'RoundSettled', net });

  return {
    player,
    dealer,
    playerScore: mine.score,
    dealerScore: theirs.score,
    opens,
    play,
    folded,
    parts,
    bonuses,
    net,
    events,
  };
}
