import {
  BJ_BONUSES,
  handTotal,
  totalOf,
  type BjEvent,
  type BonusResult,
  type Card,
  type HandOutcome,
  type HandTotal,
  type Move,
} from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { bonusLine } from '../../lib/sidebets.svelte';

export interface HandView {
  cards: Card[];
  /** The player's own money on this hand, in base bets. */
  bet: number;
  /** The house's money, from a free split or free double. */
  free: number;
  total: HandTotal | null;
  fromSplit: boolean;
  outcome?: HandOutcome;
  net?: number;
  /** The move that just landed on this hand, for a brief flash. */
  flash?: { move: Move; free: boolean };
}

const OUTCOME_LABEL: Record<HandOutcome, string> = {
  blackjack: 'Blackjack',
  win: 'Win',
  lose: 'Lose',
  push: 'Push',
  push22: 'Push 22',
  bust: 'Bust',
  dealerBlackjack: 'Dealer blackjack',
};

export function outcomeLabel(outcome: HandOutcome): string {
  return OUTCOME_LABEL[outcome];
}

function newHand(bet: number, free = 0, fromSplit = false): HandView {
  return { cards: [], bet, free, total: null, fromSplit };
}

/** Everything the blackjack table shows, built only by applying events in order. */
export class BjTableView {
  hands = $state<HandView[]>([newHand(1)]);
  /** Null stands for the hole card, face down. */
  dealer = $state<(Card | null)[]>([]);
  dealerTotal = $state<HandTotal | null>(null);
  /** The hand the player is acting on. */
  active = $state<number | null>(null);
  peeked = $state<boolean | null>(null);
  net = $state<number | null>(null);
  bonusResults = $state<Record<string, BonusResult>>({});
  breakdown = $state<BreakdownLine[]>([]);
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);

  /** The dealer's total counting only the cards face up. */
  private refreshDealer() {
    const up = this.dealer.filter((c): c is Card => c !== null);
    this.dealerTotal = up.length > 0 ? handTotal(up) : null;
  }

  apply(event: BjEvent) {
    switch (event.type) {
      case 'RoundStarted':
        this.hands = [newHand(event.bet)];
        this.dealer = [];
        this.dealerTotal = null;
        this.active = null;
        this.peeked = null;
        this.net = null;
        this.bonusResults = {};
        this.breakdown = [];
        break;

      case 'CardDealt': {
        if (event.to === 'dealer') {
          this.dealer.push(event.holeCard ? null : event.card);
          this.refreshDealer();
          break;
        }
        const hand = this.hands[event.hand];
        if (!hand) break;
        hand.cards.push(event.card);
        hand.total = handTotal(hand.cards);
        if (hand.flash?.move === 'hit') hand.flash = undefined;
        break;
      }

      case 'DealerPeeked':
        this.peeked = event.blackjack;
        break;

      case 'HandFocused':
        this.active = event.hand;
        break;

      case 'MoveMade': {
        const hand = this.hands[event.hand];
        if (!hand) break;
        hand.flash = { move: event.move, free: event.free };
        if (event.move === 'double') {
          if (event.free) hand.free += hand.bet + hand.free;
          else hand.bet *= 2;
        }
        if (event.move === 'split') {
          // The card moves to a new hand the house stakes.
          const moved = hand.cards.pop()!;
          hand.total = handTotal(hand.cards);
          this.hands.push({ ...newHand(0, hand.bet + hand.free, true), cards: [moved], total: handTotal([moved]) });
        }
        break;
      }

      case 'HandStood': {
        const hand = this.hands[event.hand];
        if (hand) hand.total = event.total;
        if (this.active === event.hand) this.active = null;
        break;
      }

      case 'HoleCardRevealed': {
        const slot = this.dealer.indexOf(null);
        if (slot >= 0) this.dealer[slot] = event.card;
        this.refreshDealer();
        break;
      }

      case 'DealerDone':
        this.dealerTotal = event.total;
        break;

      case 'HandSettled': {
        const hand = this.hands[event.hand];
        if (!hand) break;
        hand.outcome = event.outcome;
        hand.net = event.net;
        hand.flash = undefined;
        const name = this.hands.length > 1 ? `Hand ${event.hand + 1}` : 'Hand';
        this.breakdown.push({ label: `${name} · ${outcomeLabel(event.outcome).toLowerCase()}`, amount: event.net });
        break;
      }

      case 'BonusSettled':
        this.bonusResults[event.result.id] = event.result;
        this.breakdown.push(bonusLine(BJ_BONUSES, event.result));
        break;

      case 'RoundSettled':
        this.net = event.net;
        this.last = { lines: [...this.breakdown], net: event.net };
        this.active = null;
        break;

      case 'DealerDrew':
        break;
    }
  }
}

export { totalOf };
