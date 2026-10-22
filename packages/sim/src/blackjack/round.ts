import { standardDeck, type Card } from '../cards';
import { Rng, type Seed } from '../rng';
import { handTotal, isBlackjack, isPair, type HandTotal } from './hand';
import { cardValue, FREE_BET_RULES, type BjRules } from './rules';
import { decideMove, type Allowed, type Move, type StrategyTables } from './strategy';

export type HandOutcome = 'blackjack' | 'win' | 'lose' | 'push' | 'push22' | 'bust' | 'dealerBlackjack';

export interface BjHand {
  cards: Card[];
  /** The player's own money on this hand. Zero on a hand the house opened. */
  bet: number;
  /** The house's money riding on this hand, from a free split or free double. */
  free: number;
  /** Came from splitting, so a two-card 21 is not a blackjack. */
  fromSplit: boolean;
  /** Split aces stand after one card. */
  closed: boolean;
  outcome?: HandOutcome;
  /** In units of the base bet. */
  net?: number;
}

export type BjEvent =
  | { type: 'RoundStarted'; round: number; bet: number }
  | { type: 'CardDealt'; to: 'player' | 'dealer'; hand: number; card: Card; holeCard?: boolean }
  | { type: 'DealerPeeked'; blackjack: boolean }
  | { type: 'HandFocused'; hand: number }
  | { type: 'MoveMade'; hand: number; move: Move; free: boolean }
  | { type: 'HandStood'; hand: number; total: HandTotal }
  | { type: 'HoleCardRevealed'; card: Card }
  | { type: 'DealerDrew'; card: Card }
  | { type: 'DealerDone'; total: HandTotal }
  | { type: 'HandSettled'; hand: number; outcome: HandOutcome; net: number }
  | { type: 'RoundSettled'; net: number };

export interface BjSeed {
  run: Seed;
  round: number;
}

export interface BjRoundInput {
  rules?: BjRules;
  tables: StrategyTables;
  seed: BjSeed;
  /** Overrides the strategy for one decision at a time, for manual play. */
  decide?: (hand: BjHand, index: number, upcard: Card, allowed: Allowed) => Move;
  recordEvents?: boolean;
  /** Called as each event happens, so a caller can watch a round that is still running. */
  onEvent?: (event: BjEvent) => void;
}

export interface BjRoundResult {
  hands: BjHand[];
  dealer: Card[];
  dealerTotal: HandTotal;
  dealerBlackjack: boolean;
  /** Everything won or lost this round, in units of the base bet. */
  net: number;
  events: BjEvent[];
}

/** A freshly shuffled shoe. Six decks means ten-value cards show up 4/13 of the time. */
export function buildBjShoe(rules: BjRules = FREE_BET_RULES): Card[] {
  const shoe: Card[] = [];
  for (let d = 0; d < rules.decks; d++) shoe.push(...standardDeck('player', `d${d}`));
  return shoe;
}

export function simulateBjRound(input: BjRoundInput): BjRoundResult {
  const rules = input.rules ?? FREE_BET_RULES;
  const events: BjEvent[] = [];
  const emit = (e: BjEvent) => {
    if (input.recordEvents) events.push(e);
    input.onEvent?.(e);
  };

  const rng = new Rng(input.seed.run, 'blackjack', input.seed.round);
  const shoe = buildBjShoe(rules);
  let next = 0;
  // Partial Fisher-Yates: only the cards actually dealt get shuffled.
  const draw = (): Card => {
    const j = next + rng.int(shoe.length - next);
    const card = shoe[j]!;
    shoe[j] = shoe[next]!;
    shoe[next] = card;
    next++;
    return card;
  };

  emit({ type: 'RoundStarted', round: input.seed.round, bet: 1 });

  const hands: BjHand[] = [{ cards: [], bet: 1, free: 0, fromSplit: false, closed: false }];
  const dealer: Card[] = [];
  const deal = (to: 'player' | 'dealer', hand = 0, holeCard = false) => {
    const card = draw();
    if (to === 'dealer') dealer.push(card);
    else hands[hand]!.cards.push(card);
    emit({ type: 'CardDealt', to, hand, card, ...(holeCard ? { holeCard: true } : {}) });
    return card;
  };

  deal('player');
  deal('dealer');
  deal('player');
  deal('dealer', 0, true);

  const upcard = dealer[0]!;
  const dealerBj = isBlackjack(dealer);
  const peeks = cardValue(upcard.rank) >= 10;
  if (peeks) emit({ type: 'DealerPeeked', blackjack: dealerBj });

  const playerBj = isBlackjack(hands[0]!.cards);
  let net = 0;

  const settle = (hand: BjHand, outcome: HandOutcome, amount: number) => {
    hand.outcome = outcome;
    hand.net = amount;
    net += amount;
    emit({ type: 'HandSettled', hand: hands.indexOf(hand), outcome, net: amount });
  };

  if (dealerBj || playerBj) {
    emit({ type: 'HoleCardRevealed', card: dealer[1]! });
    const hand = hands[0]!;
    if (playerBj && dealerBj) settle(hand, 'push', 0);
    else if (playerBj) settle(hand, 'blackjack', rules.blackjackPays * hand.bet);
    else settle(hand, 'dealerBlackjack', -hand.bet);
    emit({ type: 'RoundSettled', net });
    return { hands, dealer, dealerTotal: handTotal(dealer), dealerBlackjack: dealerBj, net, events };
  }

  // The player plays each hand out; splits are appended and played in turn.
  for (let i = 0; i < hands.length; i++) {
    const hand = hands[i]!;
    emit({ type: 'HandFocused', hand: i });
    if (hand.cards.length === 1) deal('player', i); // second card for a freshly split hand

    while (!hand.closed) {
      const total = handTotal(hand.cards);
      if (total.bust || total.total === 21) break;

      const twoCards = hand.cards.length === 2;
      const value = cardValue(hand.cards[0]!.rank);
      const splitAce = hand.fromSplit && value === 11 && rules.splitAcesOneCard;
      const freeDouble = twoCards && !total.soft && rules.freeDoubleTotals.includes(total.total);
      const canSplit =
        twoCards && isPair(hand.cards) && value !== rules.noSplitValue && hands.length < rules.maxHands;
      // A split ace takes one card and stands, but another ace may be split again.
      const allowed = {
        double: !splitAce && twoCards && (freeDouble || (rules.paidDoubles && hand.bet > 0)),
        split: canSplit,
      };
      if (splitAce && !canSplit) break;

      const regime = hand.bet > 0 ? 'real' : 'free';
      const move = splitAce
        ? 'split'
        : input.decide
          ? input.decide(hand, i, upcard, allowed)
          : decideMove(input.tables, regime, hand.cards, upcard, allowed);

      if (move === 'stand') break;

      if (move === 'double' && allowed.double) {
        emit({ type: 'MoveMade', hand: i, move, free: freeDouble });
        if (freeDouble) hand.free += hand.bet + hand.free;
        else hand.bet *= 2;
        deal('player', i);
        hand.closed = true;
        break;
      }

      if (move === 'split' && allowed.split) {
        emit({ type: 'MoveMade', hand: i, move, free: true });
        const moved = hand.cards.pop()!;
        // The house stakes every split hand; the player's own bet stays on the first.
        hands.push({ cards: [moved], bet: 0, free: hand.bet + hand.free, fromSplit: true, closed: false });
        hand.fromSplit = true;
        deal('player', i);
        if (value === 11 && rules.splitAcesOneCard) hand.closed = true;
        continue;
      }

      emit({ type: 'MoveMade', hand: i, move: 'hit', free: false });
      deal('player', i);
    }
    emit({ type: 'HandStood', hand: i, total: handTotal(hand.cards) });
  }

  const live = hands.filter((h) => !handTotal(h.cards).bust);
  emit({ type: 'HoleCardRevealed', card: dealer[1]! });

  if (live.length > 0) {
    for (;;) {
      const total = handTotal(dealer);
      const stands = total.total > 17 || (total.total === 17 && !(total.soft && rules.hitsSoft17));
      if (total.bust || stands) break;
      emit({ type: 'DealerDrew', card: deal('dealer') });
    }
  }
  const dealerTotal = handTotal(dealer);
  emit({ type: 'DealerDone', total: dealerTotal });

  for (const hand of hands) {
    const total = handTotal(hand.cards);
    const stake = hand.bet + hand.free;
    if (total.bust) settle(hand, 'bust', -hand.bet);
    else if (rules.push22 && dealerTotal.total === 22) settle(hand, 'push22', 0);
    else if (dealerTotal.bust || total.total > dealerTotal.total) settle(hand, 'win', stake);
    else if (total.total < dealerTotal.total) settle(hand, 'lose', -hand.bet);
    else settle(hand, 'push', 0);
  }

  emit({ type: 'RoundSettled', net });
  return { hands, dealer, dealerTotal, dealerBlackjack: false, net, events };
}
