import type { Card } from './cards';
import { compareFlush, evaluateHand, qualifies, type HandEval, type Qualifier } from './evaluate';
import type { GameEvent, MainOutcome } from './events';
import { DEFAULT_RAISE_CAPS, maxRaise, type ScaleTable } from './paytables';
import { draw, Rng, type Seed } from './rng';
import { FLUSH_RUSH, SUPER_FLUSH_RUSH, sideBetPays, type SideBetDef, type SideBetOwner } from './sidebets';
import { decideRaise, type RaisePolicy } from './strategy';

export interface TableRules {
  handSize: number;
  qualifier: Qualifier;
  raiseCaps: ScaleTable;
  sideBets: SideBetDef[];
  /** Who owns a side bet the seat did not fund. 'dealer' is a dealer downside. */
  unclaimedOwner: 'none' | 'dealer';
  /** Stake (in antes) the dealer plays on bets it owns. */
  dealerClaimStake: number;
}

export const DEFAULT_RULES: TableRules = {
  handSize: 7,
  qualifier: { minSize: 3, minHighCard: 9 },
  raiseCaps: DEFAULT_RAISE_CAPS,
  sideBets: [FLUSH_RUSH, SUPER_FLUSH_RUSH],
  unclaimedOwner: 'none',
  dealerClaimStake: 1,
};

export interface SeatConfig {
  raisePolicy: RaisePolicy;
  /** Side-bet id → stake in antes. Missing or 0 means unclaimed. */
  sideBets: Record<string, number>;
}

export interface RoundSeed {
  run: Seed;
  dealerId: string;
  round: number;
}

export interface RoundInput {
  shoe: readonly Card[];
  seats: readonly SeatConfig[];
  rules: TableRules;
  seed: RoundSeed;
  /** Off for bulk simulation; on when the UI will present the round. */
  recordEvents?: boolean;
}

export interface SideBetResult {
  owner: SideBetOwner;
  stake: number;
  pays: number;
  net: number;
}

export interface SeatResult {
  cards: Card[];
  hand: HandEval;
  raise: number;
  outcome: MainOutcome;
  /** Ante + raise result, in antes. */
  mainNet: number;
  sideBets: Record<string, SideBetResult>;
  /** Everything, in antes. */
  net: number;
}

export interface RoundResult {
  seats: SeatResult[];
  dealerCards: Card[];
  dealerHand: HandEval;
  dealerQualified: boolean;
  events: GameEvent[];
}

/** Separate streams so adding a new random effect never changes the shuffle. */
export function roundRng(seed: RoundSeed, stream: string): Rng {
  return new Rng(seed.run, seed.dealerId, seed.round, stream);
}

function resolveMain(hand: HandEval, raise: number, dealer: HandEval, dealerQualified: boolean): [MainOutcome, number] {
  if (raise === 0) return ['fold', -1];
  if (!dealerQualified) return ['dealerNoQualify', 1];
  const cmp = compareFlush(hand, dealer);
  if (cmp > 0) return ['win', 1 + raise];
  if (cmp < 0) return ['lose', -(1 + raise)];
  return ['push', 0];
}

function resolveSideBet(
  def: SideBetDef,
  owner: SideBetOwner,
  stake: number,
  hand: HandEval,
  dealer: HandEval,
): SideBetResult {
  switch (owner) {
    case 'none':
      return { owner, stake: 0, pays: 0, net: 0 };
    case 'player': {
      const pays = sideBetPays(def, hand);
      return { owner, stake, pays, net: pays > 0 ? pays * stake : -stake };
    }
    case 'dealer': {
      const pays = sideBetPays(def, dealer);
      return { owner, stake, pays, net: -pays * stake };
    }
  }
}

export function simulateRound(input: RoundInput): RoundResult {
  const { shoe, seats, rules, seed } = input;
  const events: GameEvent[] = [];
  const emit = input.recordEvents ? (e: GameEvent) => events.push(e) : () => {};

  const n = rules.handSize;
  const dealt = draw(roundRng(seed, 'shuffle'), shoe, n * (seats.length + 1));
  const dealerCards = dealt.slice(n * seats.length);

  emit({ type: 'RoundStarted', round: seed.round, shoeSize: shoe.length, seats: seats.length });

  const owners = seats.map((seat, s) => {
    emit({ type: 'AntePlaced', seat: s, amount: 1 });
    return rules.sideBets.map((def) => {
      const funded = seat.sideBets[def.id] ?? 0;
      const owner: SideBetOwner = funded > 0 ? 'player' : rules.unclaimedOwner;
      const stake = owner === 'player' ? funded : owner === 'dealer' ? rules.dealerClaimStake : 0;
      emit({ type: 'SideBetOwnership', seat: s, betId: def.id, owner, stake });
      return { owner, stake };
    });
  });

  // Player reveals and raise decisions happen before the dealer reveal.
  const seatHands = seats.map((seat, s) => {
    const cards = dealt.slice(n * s, n * (s + 1));
    cards.forEach((card, index) => emit({ type: 'CardRevealed', hand: s, index, card }));
    const hand = evaluateHand(cards);
    emit({ type: 'HandEvaluated', hand: s, eval: hand });
    const raise = decideRaise(seat.raisePolicy, hand, maxRaise(rules.raiseCaps, hand.size));
    emit({ type: 'RaiseDecided', seat: s, raise });
    return { cards, hand, raise };
  });

  dealerCards.forEach((card, index) => emit({ type: 'CardRevealed', hand: 'dealer', index, card }));
  const dealerHand = evaluateHand(dealerCards);
  emit({ type: 'HandEvaluated', hand: 'dealer', eval: dealerHand });
  const dealerQualified = qualifies(dealerHand, rules.qualifier);
  emit({ type: 'DealerQualified', qualified: dealerQualified });

  const seatResults = seatHands.map(({ cards, hand, raise }, s): SeatResult => {
    const [outcome, mainNet] = resolveMain(hand, raise, dealerHand, dealerQualified);
    emit({ type: 'MainBetResolved', seat: s, outcome, net: mainNet });

    let net = mainNet;
    const sideBets: Record<string, SideBetResult> = {};
    rules.sideBets.forEach((def, b) => {
      const { owner, stake } = owners[s]![b]!;
      const result = resolveSideBet(def, owner, stake, hand, dealerHand);
      sideBets[def.id] = result;
      net += result.net;
      if (owner !== 'none') {
        emit({ type: 'SideBetResolved', seat: s, betId: def.id, owner, pays: result.pays, net: result.net });
      }
    });

    emit({ type: 'RoundSettled', seat: s, net });
    return { cards, hand, raise, outcome, mainNet, sideBets, net };
  });

  return { seats: seatResults, dealerCards, dealerHand, dealerQualified, events };
}
