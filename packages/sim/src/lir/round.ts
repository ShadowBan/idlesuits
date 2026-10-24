import { settleBonuses, type BonusResult } from '../bonus';
import { standardDeck, type Card } from '../cards';
import { evaluatePoker, type PokerHand } from '../poker';
import { Rng, type Seed } from '../rng';
import { LIR_BONUSES } from './bonus';
import { LIR_RULES, lirMultiplier, type LirRules } from './rules';

/** Which of the two bets that can be pulled back is being decided: the first after three cards, the second after four. */
export interface LirDecision {
  bet: 1 | 2;
  cards: Card[];
}

export type LirMove = 'ride' | 'pull';

export type LirEvent =
  | { type: 'RoundStarted'; round: number; bonuses: Record<string, number> }
  | { type: 'PlayerCards'; cards: Card[] }
  | { type: 'Decision'; bet: 1 | 2 }
  | { type: 'Rode'; bet: 1 | 2 }
  | { type: 'Pulled'; bet: 1 | 2 }
  | { type: 'CommunityCard'; index: number; card: Card }
  | { type: 'FinalHand'; hand: PokerHand; multiplier: number; riding: number }
  | { type: 'BonusSettled'; result: BonusResult }
  | { type: 'RoundSettled'; net: number };

export interface LirRoundInput {
  rules?: LirRules;
  seed: { run: Seed; round: number };
  decide: (decision: LirDecision) => LirMove;
  /** Side bets by id (see LIR_BONUSES), in units of one bet. Missing or zero is off. */
  bonuses?: Readonly<Record<string, number>>;
  recordEvents?: boolean;
  onEvent?: (event: LirEvent) => void;
}

export interface LirRoundResult {
  hole: Card[];
  community: Card[];
  /** Which of the three bets stayed up to the end. The third always does. */
  riding: [boolean, boolean, boolean];
  hand: PokerHand;
  multiplier: number;
  /** The three main bets alone, in units of one bet. */
  main: number;
  bonuses: BonusResult[];
  net: number;
  events: LirEvent[];
}

export function simulateLirRound(input: LirRoundInput): LirRoundResult {
  const rules = input.rules ?? LIR_RULES;
  const events: LirEvent[] = [];
  const emit = (event: LirEvent) => {
    if (input.recordEvents) events.push(event);
    input.onEvent?.(event);
  };

  const rng = new Rng(input.seed.run, 'lir', input.seed.round);
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
  const hole = [draw(), draw(), draw()];
  const community = [draw(), draw()];
  emit({ type: 'PlayerCards', cards: hole });

  const riding: [boolean, boolean, boolean] = [true, true, true];
  for (const bet of [1, 2] as const) {
    emit({ type: 'Decision', bet });
    const cards = bet === 1 ? hole : [...hole, community[0]!];
    const move = input.decide({ bet, cards });
    riding[bet - 1] = move === 'ride';
    emit({ type: move === 'ride' ? 'Rode' : 'Pulled', bet });
    emit({ type: 'CommunityCard', index: bet - 1, card: community[bet - 1]! });
  }

  const hand = evaluatePoker([...hole, ...community]);
  const multiplier = lirMultiplier(hand, rules);
  const up = riding.filter(Boolean).length;
  const main = multiplier * up;
  emit({ type: 'FinalHand', hand, multiplier, riding: up });

  const bonuses = settleBonuses(LIR_BONUSES, stakes, { hole, community });
  for (const result of bonuses) emit({ type: 'BonusSettled', result });
  const net = main + bonuses.reduce((sum, b) => sum + b.net, 0);
  emit({ type: 'RoundSettled', net });
  return { hole, community, riding, hand, multiplier, main, bonuses, net, events };
}
