import { settleBonuses, type BonusResult } from '../bonus';
import { deckWithJoker, type Card } from '../cards';
import { Rng, type Seed } from '../rng';
import { DJ_BONUSES } from './bonus';
import { djCategoryOf, djScore } from './evaluate';
import { DJ_RULES, type DjRules } from './rules';

export interface DjDecision {
  cards: Card[];
}

export type DjMove = 'play' | 'fold';

export type DjEvent =
  | { type: 'RoundStarted'; round: number; bonuses: Record<string, number> }
  | { type: 'PlayerCards'; cards: Card[]; score: number }
  | { type: 'DealerCards' }
  | { type: 'Decision' }
  | { type: 'Played' }
  | { type: 'Folded' }
  | { type: 'DealerRevealed'; cards: Card[]; score: number }
  | { type: 'Settled'; part: 'ante' | 'blind' | 'play'; net: number; note: string }
  | { type: 'BonusSettled'; result: BonusResult }
  | { type: 'RoundSettled'; net: number };

export interface DjRoundInput {
  rules?: DjRules;
  seed: { run: Seed; round: number };
  decide: (decision: DjDecision) => DjMove;
  /** Side bets by id (see DJ_BONUSES), in antes. Missing or zero is off. */
  bonuses?: Readonly<Record<string, number>>;
  recordEvents?: boolean;
  onEvent?: (event: DjEvent) => void;
}

export interface DjRoundResult {
  player: Card[];
  dealer: Card[];
  playerScore: number;
  dealerScore: number;
  folded: boolean;
  /** In antes. The Blind is a required bet the size of the Ante. */
  parts: { ante: number; blind: number; play: number; bonus: number };
  bonuses: BonusResult[];
  net: number;
  events: DjEvent[];
}

export function simulateDjRound(input: DjRoundInput): DjRoundResult {
  const rules = input.rules ?? DJ_RULES;
  const events: DjEvent[] = [];
  const emit = (event: DjEvent) => {
    if (input.recordEvents) events.push(event);
    input.onEvent?.(event);
  };

  const rng = new Rng(input.seed.run, 'djwild', input.seed.round);
  const deck = deckWithJoker();
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
  const playerScore = djScore(player);
  const dealerScore = djScore(dealer);
  emit({ type: 'PlayerCards', cards: player, score: playerScore });
  emit({ type: 'DealerCards' });

  emit({ type: 'Decision' });
  const folded = input.decide({ cards: player }) === 'fold';
  emit({ type: folded ? 'Folded' : 'Played' });
  emit({ type: 'DealerRevealed', cards: dealer, score: dealerScore });

  const parts = { ante: 0, blind: 0, play: 0, bonus: 0 };
  const settle = (part: 'ante' | 'blind' | 'play', net: number, note: string) => {
    parts[part] = net;
    emit({ type: 'Settled', part, net, note });
  };

  if (folded) {
    settle('ante', -1, 'folded');
    settle('blind', -1, 'folded');
  } else if (playerScore > dealerScore) {
    settle('ante', 1, 'win');
    settle('play', rules.play, 'win');
    const pays = rules.blindPays[djCategoryOf(playerScore)] ?? 0;
    settle('blind', pays, pays > 0 ? `pays ${pays}:1` : 'push');
  } else if (playerScore < dealerScore) {
    settle('ante', -1, 'lose');
    settle('play', -rules.play, 'lose');
    settle('blind', -1, 'lose');
  } else {
    settle('ante', 0, 'tie');
    settle('play', 0, 'tie');
    settle('blind', 0, 'tie');
  }

  const bonuses = settleBonuses(DJ_BONUSES, stakes, { player });
  for (const result of bonuses) {
    parts.bonus += result.net;
    emit({ type: 'BonusSettled', result });
  }
  const net = parts.ante + parts.blind + parts.play + parts.bonus;
  emit({ type: 'RoundSettled', net });
  return { player, dealer, playerScore, dealerScore, folded, parts, bonuses, net, events };
}
