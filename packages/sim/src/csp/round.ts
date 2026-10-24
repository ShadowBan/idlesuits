import { settleBonuses, type BonusResult } from '../bonus';
import { standardDeck, type Card } from '../cards';
import { comparePoker, evaluatePoker, type PokerHand } from '../poker';
import { Rng, type Seed } from '../rng';
import { CSP_BONUSES } from './bonus';
import { CSP_RULES, cspQualifies, type CspRules } from './rules';

export interface CspDecision {
  cards: Card[];
  upcard: Card;
}

export type CspMove = 'raise' | 'fold';

export type CspEvent =
  | { type: 'RoundStarted'; round: number; bonuses: Record<string, number> }
  | { type: 'PlayerCards'; cards: Card[]; hand: PokerHand }
  | { type: 'DealerUpcard'; card: Card }
  | { type: 'Decision' }
  | { type: 'Raised' }
  | { type: 'Folded' }
  | { type: 'DealerRevealed'; cards: Card[]; hand: PokerHand; qualified: boolean }
  | { type: 'Settled'; part: 'ante' | 'raise'; net: number; note: string }
  | { type: 'BonusSettled'; result: BonusResult }
  | { type: 'RoundSettled'; net: number };

export interface CspRoundInput {
  rules?: CspRules;
  seed: { run: Seed; round: number };
  decide: (decision: CspDecision) => CspMove;
  /** Side bets by id (see CSP_BONUSES), in antes. Missing or zero is off. */
  bonuses?: Readonly<Record<string, number>>;
  recordEvents?: boolean;
  onEvent?: (event: CspEvent) => void;
}

export interface CspRoundResult {
  player: Card[];
  dealer: Card[];
  playerHand: PokerHand;
  dealerHand: PokerHand;
  qualified: boolean;
  folded: boolean;
  /** In antes. */
  parts: { ante: number; raise: number; bonus: number };
  bonuses: BonusResult[];
  net: number;
  events: CspEvent[];
}

export function simulateCspRound(input: CspRoundInput): CspRoundResult {
  const rules = input.rules ?? CSP_RULES;
  const events: CspEvent[] = [];
  const emit = (event: CspEvent) => {
    if (input.recordEvents) events.push(event);
    input.onEvent?.(event);
  };

  const rng = new Rng(input.seed.run, 'csp', input.seed.round);
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
  const upcard = dealer[0]!;
  const playerHand = evaluatePoker(player);
  const dealerHand = evaluatePoker(dealer);
  emit({ type: 'PlayerCards', cards: player, hand: playerHand });
  emit({ type: 'DealerUpcard', card: upcard });

  emit({ type: 'Decision' });
  const folded = input.decide({ cards: player, upcard }) === 'fold';
  emit({ type: folded ? 'Folded' : 'Raised' });

  const qualified = cspQualifies(dealerHand.category, dealerHand.ranks);
  emit({ type: 'DealerRevealed', cards: dealer, hand: dealerHand, qualified });

  const parts = { ante: 0, raise: 0, bonus: 0 };
  const settle = (part: 'ante' | 'raise', net: number, note: string) => {
    parts[part] = net;
    emit({ type: 'Settled', part, net, note });
  };

  if (folded) {
    settle('ante', -1, 'folded');
  } else if (!qualified) {
    settle('ante', 1, 'dealer does not qualify');
    settle('raise', 0, 'push');
  } else {
    const cmp = comparePoker(playerHand, dealerHand);
    if (cmp > 0) {
      const pays = rules.raisePays[playerHand.category] ?? 1;
      settle('ante', 1, 'win');
      settle('raise', rules.raise * pays, `pays ${pays}:1`);
    } else if (cmp < 0) {
      settle('ante', -1, 'lose');
      settle('raise', -rules.raise, 'lose');
    } else {
      settle('ante', 0, 'tie');
      settle('raise', 0, 'tie');
    }
  }

  const bonuses = settleBonuses(CSP_BONUSES, stakes, { player, upcard });
  for (const result of bonuses) {
    parts.bonus += result.net;
    emit({ type: 'BonusSettled', result });
  }
  const net = parts.ante + parts.raise + parts.bonus;
  emit({ type: 'RoundSettled', net });
  return { player, dealer, playerHand, dealerHand, qualified, folded, parts, bonuses, net, events };
}
