import { settleBonuses, type BonusResult } from '../bonus';
import type { Card } from '../cards';
import { Rng, type Seed } from '../rng';
import { PG_BONUSES } from './bonus';
import { paiGowDeck } from './evaluate';
import { applySet, houseWay, isLegalSet, type PaiGowSet, type SetHands } from './houseway';

export interface PaiGowDecision {
  cards: Card[];
  /** How the house way would set them. */
  suggestion: PaiGowSet;
}

/** Who took one of the two hands. A copy (an exact tie) goes to the dealer, who banks. */
export type HandWinner = 'player' | 'dealer' | 'copy';

export type PaiGowOutcome = 'win' | 'push' | 'lose';

export type PaiGowEvent =
  | { type: 'RoundStarted'; round: number; bonuses: Record<string, number> }
  | { type: 'PlayerCards'; cards: Card[] }
  | { type: 'DealerCards' }
  | { type: 'Decision' }
  | { type: 'PlayerSet'; set: PaiGowSet; hands: SetHands }
  | { type: 'DealerRevealed'; cards: Card[] }
  | { type: 'DealerSet'; set: PaiGowSet; hands: SetHands }
  | { type: 'Compared'; hand: 'high' | 'low'; winner: HandWinner }
  | { type: 'Settled'; outcome: PaiGowOutcome; net: number }
  | { type: 'BonusSettled'; result: BonusResult }
  | { type: 'RoundSettled'; net: number };

export interface PaiGowRules {
  /** Taken from a winning bet: 0.05 pays 0.95 to 1. */
  commission: number;
}

export const PAI_GOW_RULES: PaiGowRules = { commission: 0.05 };

export interface PaiGowRoundInput {
  rules?: PaiGowRules;
  seed: { run: Seed; round: number };
  /** The player's split. An illegal one is set by the house way instead, as a dealer would. */
  decide: (decision: PaiGowDecision) => PaiGowSet;
  /** Side bets by id (see PG_BONUSES), in units of the main bet. Missing or zero is off. */
  bonuses?: Readonly<Record<string, number>>;
  recordEvents?: boolean;
  onEvent?: (event: PaiGowEvent) => void;
}

export interface PaiGowRoundResult {
  player: Card[];
  dealer: Card[];
  playerSet: SetHands;
  dealerSet: SetHands;
  high: HandWinner;
  low: HandWinner;
  outcome: PaiGowOutcome;
  /** The main bet alone, in units of the bet. */
  main: number;
  bonuses: BonusResult[];
  net: number;
  events: PaiGowEvent[];
}

export function simulatePaiGowRound(input: PaiGowRoundInput): PaiGowRoundResult {
  const rules = input.rules ?? PAI_GOW_RULES;
  const events: PaiGowEvent[] = [];
  const emit = (event: PaiGowEvent) => {
    if (input.recordEvents) events.push(event);
    input.onEvent?.(event);
  };

  const rng = new Rng(input.seed.run, 'paigow', input.seed.round);
  const deck = paiGowDeck();
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
  const player = Array.from({ length: 7 }, draw);
  const dealer = Array.from({ length: 7 }, draw);
  emit({ type: 'PlayerCards', cards: player });
  emit({ type: 'DealerCards' });

  emit({ type: 'Decision' });
  const suggestion = houseWay(player);
  const chosen = input.decide({ cards: player, suggestion });
  const set = isLegalSet(player, chosen) ? chosen : suggestion;
  const playerSet = applySet(player, set);
  emit({ type: 'PlayerSet', set, hands: playerSet });

  emit({ type: 'DealerRevealed', cards: dealer });
  const dealerWay = houseWay(dealer);
  const dealerSet = applySet(dealer, dealerWay);
  emit({ type: 'DealerSet', set: dealerWay, hands: dealerSet });

  const judge = (mine: number, theirs: number): HandWinner =>
    mine > theirs ? 'player' : mine < theirs ? 'dealer' : 'copy';
  const high = judge(playerSet.highScore, dealerSet.highScore);
  const low = judge(playerSet.lowScore, dealerSet.lowScore);
  emit({ type: 'Compared', hand: 'high', winner: high });
  emit({ type: 'Compared', hand: 'low', winner: low });

  const won = Number(high === 'player') + Number(low === 'player');
  const outcome: PaiGowOutcome = won === 2 ? 'win' : won === 1 ? 'push' : 'lose';
  const main = outcome === 'win' ? 1 - rules.commission : outcome === 'push' ? 0 : -1;
  emit({ type: 'Settled', outcome, net: main });

  const bonuses = settleBonuses(PG_BONUSES, stakes, { cards: player });
  for (const result of bonuses) emit({ type: 'BonusSettled', result });
  const net = main + bonuses.reduce((sum, b) => sum + b.net, 0);
  emit({ type: 'RoundSettled', net });

  return { player, dealer, playerSet, dealerSet, high, low, outcome, main, bonuses, net, events };
}
