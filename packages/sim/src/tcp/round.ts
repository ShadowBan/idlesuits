import { settleBonuses, type BonusResult } from '../bonus';
import { standardDeck, type Card } from '../cards';
import { Rng, type Seed } from '../rng';
import { threeCardHand, threeCardScore, type ThreeCardHand } from '../three';
import { TCP_BONUSES } from './bonus';
import { TCP_RULES, type TcpRules } from './rules';

export interface TcpDecision {
  cards: Card[];
}

export type TcpMove = 'play' | 'fold';

export type TcpEvent =
  | { type: 'RoundStarted'; round: number; bonuses: Record<string, number> }
  | { type: 'PlayerCards'; cards: Card[]; hand: ThreeCardHand }
  | { type: 'DealerCards' }
  | { type: 'Decision' }
  | { type: 'Played' }
  | { type: 'Folded' }
  | { type: 'DealerRevealed'; cards: Card[]; hand: ThreeCardHand; qualified: boolean }
  | { type: 'Settled'; part: 'ante' | 'play' | 'anteBonus'; net: number; note: string }
  | { type: 'BonusSettled'; result: BonusResult }
  | { type: 'RoundSettled'; net: number };

export interface TcpRoundInput {
  rules?: TcpRules;
  seed: { run: Seed; round: number };
  decide: (decision: TcpDecision) => TcpMove;
  /** Side bets by id (see TCP_BONUSES), in antes. Missing or zero is off. */
  bonuses?: Readonly<Record<string, number>>;
  recordEvents?: boolean;
  onEvent?: (event: TcpEvent) => void;
}

export interface TcpRoundResult {
  player: Card[];
  dealer: Card[];
  playerHand: ThreeCardHand;
  dealerHand: ThreeCardHand;
  qualified: boolean;
  folded: boolean;
  /** In antes. */
  parts: { ante: number; play: number; anteBonus: number; bonus: number };
  bonuses: BonusResult[];
  net: number;
  events: TcpEvent[];
}

/** A queen-high or better qualifies: queen-3-2 is the weakest such hand. */
function qualifies(score: number, rules: TcpRules): boolean {
  return score >= ((0 * 15 + rules.qualifyHigh) * 15 + 0) * 15;
}

export function simulateTcpRound(input: TcpRoundInput): TcpRoundResult {
  const rules = input.rules ?? TCP_RULES;
  const events: TcpEvent[] = [];
  const emit = (event: TcpEvent) => {
    if (input.recordEvents) events.push(event);
    input.onEvent?.(event);
  };

  const rng = new Rng(input.seed.run, 'tcp', input.seed.round);
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
  const player = [draw(), draw(), draw()];
  const dealer = [draw(), draw(), draw()];
  const playerHand = threeCardHand(player);
  const dealerHand = threeCardHand(dealer);
  emit({ type: 'PlayerCards', cards: player, hand: playerHand });
  emit({ type: 'DealerCards' });

  emit({ type: 'Decision' });
  const folded = input.decide({ cards: player }) === 'fold';
  emit({ type: folded ? 'Folded' : 'Played' });

  const playerScore = threeCardScore(player);
  const dealerScore = threeCardScore(dealer);
  const qualified = qualifies(dealerScore, rules);
  emit({ type: 'DealerRevealed', cards: dealer, hand: dealerHand, qualified });

  const parts = { ante: 0, play: 0, anteBonus: 0, bonus: 0 };
  const settle = (part: 'ante' | 'play' | 'anteBonus', net: number, note: string) => {
    parts[part] = net;
    emit({ type: 'Settled', part, net, note });
  };

  if (folded) {
    settle('ante', -1, 'folded');
  } else {
    const cmp = playerScore - dealerScore;
    if (!qualified) {
      settle('ante', 1, 'dealer does not qualify');
      settle('play', 0, 'push');
    } else if (cmp > 0) {
      settle('ante', 1, 'win');
      settle('play', 1, 'win');
    } else if (cmp < 0) {
      settle('ante', -1, 'lose');
      settle('play', -1, 'lose');
    } else {
      settle('ante', 0, 'tie');
      settle('play', 0, 'tie');
    }
    // The Ante Bonus pays on the player's hand alone, whatever the dealer holds.
    const bonus = rules.anteBonus[playerHand] ?? 0;
    if (bonus > 0) settle('anteBonus', bonus, `pays ${bonus}:1`);
  }

  const bonuses = settleBonuses(TCP_BONUSES, stakes, { player, dealer });
  for (const result of bonuses) {
    parts.bonus += result.net;
    emit({ type: 'BonusSettled', result });
  }

  const net = parts.ante + parts.play + parts.anteBonus + parts.bonus;
  emit({ type: 'RoundSettled', net });
  return { player, dealer, playerHand, dealerHand, qualified, folded, parts, bonuses, net, events };
}
