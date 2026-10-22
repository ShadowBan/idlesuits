import { standardDeck, type Card } from '../cards';
import { evaluatePoker, type PokerHand } from '../poker';
import { Rng, type Seed } from '../rng';
import { STUD_RULES, studMultiplier, type StudRules } from './rules';

/** The three betting rounds, named for how many cards the player can see. */
export type StudStreet = 3 | 4 | 5;

export interface StudDecision {
  street: StudStreet;
  hole: Card[];
  /** Community cards face up so far: none, then one, then two. */
  shown: Card[];
  /** Street bets already made, in antes. */
  bets: number[];
  raises: number[];
}

export type StudChoice = { move: 'fold' } | { move: 'bet'; size: number };

export type StudEvent =
  | { type: 'RoundStarted'; round: number }
  | { type: 'HoleCards'; cards: Card[] }
  | { type: 'Decision'; street: StudStreet }
  | { type: 'Bet'; street: StudStreet; size: number }
  | { type: 'Folded'; street: StudStreet; lost: number }
  | { type: 'CommunityCard'; index: number; card: Card }
  | { type: 'FinalHand'; hand: PokerHand; multiplier: number }
  | { type: 'RoundSettled'; net: number };

export interface StudRoundInput {
  rules?: StudRules;
  seed: { run: Seed; round: number };
  decide: (decision: StudDecision) => StudChoice;
  recordEvents?: boolean;
  onEvent?: (event: StudEvent) => void;
}

export interface StudRoundResult {
  hole: Card[];
  community: Card[];
  bets: number[];
  folded: boolean;
  hand: PokerHand | null;
  /** N:1 on every bet, 0 for a push, -1 for a loss; null after a fold. */
  multiplier: number | null;
  /** Ante plus every street bet made. */
  wagered: number;
  /** In antes. */
  net: number;
  events: StudEvent[];
}

export function simulateStudRound(input: StudRoundInput): StudRoundResult {
  const rules = input.rules ?? STUD_RULES;
  const events: StudEvent[] = [];
  const emit = (event: StudEvent) => {
    if (input.recordEvents) events.push(event);
    input.onEvent?.(event);
  };

  const rng = new Rng(input.seed.run, 'stud', input.seed.round);
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

  emit({ type: 'RoundStarted', round: input.seed.round });
  const hole = [draw(), draw()];
  const community = [draw(), draw(), draw()];
  emit({ type: 'HoleCards', cards: hole });

  const bets: number[] = [];
  for (const street of [3, 4, 5] as const) {
    emit({ type: 'Decision', street });
    const shown = community.slice(0, street - 3);
    const choice = input.decide({ street, hole, shown, bets: [...bets], raises: rules.raises });

    if (choice.move === 'fold') {
      const lost = 1 + bets.reduce((a, b) => a + b, 0);
      emit({ type: 'Folded', street, lost });
      emit({ type: 'RoundSettled', net: -lost });
      return { hole, community, bets, folded: true, hand: null, multiplier: null, wagered: lost, net: -lost, events };
    }

    const size = rules.raises.includes(choice.size) ? choice.size : rules.raises[0]!;
    bets.push(size);
    emit({ type: 'Bet', street, size });
    emit({ type: 'CommunityCard', index: street - 3, card: community[street - 3]! });
  }

  const hand = evaluatePoker([...hole, ...community]);
  const multiplier = studMultiplier(hand, rules);
  const wagered = 1 + bets.reduce((a, b) => a + b, 0);
  const net = multiplier * wagered;
  emit({ type: 'FinalHand', hand, multiplier });
  emit({ type: 'RoundSettled', net });

  return { hole, community, bets, folded: false, hand, multiplier, wagered, net, events };
}
