import { standardDeck, type Card } from './cards';
import { Rng, type Seed } from './rng';

/**
 * A dealing shoe: several decks shuffled together once and dealt down to a
 * cut card, as casinos deal blackjack and baccarat. Unlike a fresh shuffle
 * each hand, the cards already dealt change what is left.
 */
export interface Shoe {
  /** Every card in the shoe, in dealing order. */
  cards: Card[];
  /** The next card to deal. Starts past the burn card. */
  next: number;
  /** When the deal reaches the cut card, the shoe is finished after that round. */
  cut: number;
}

/** The dealer burns the first card of a fresh shoe. */
export const BURN_CARDS = 1;
/** Penetration: the player cuts somewhere between 70% and 80% of the way in. */
const CUT_FROM = 0.7;
const CUT_TO = 0.8;

/** A freshly shuffled shoe of `decks` decks. The seed fixes its order and its cut. */
export function shuffleShoe(decks: number, ...seed: Seed[]): Shoe {
  const rng = new Rng(...seed, 'shoe');
  const cards: Card[] = [];
  for (let d = 0; d < decks; d++) cards.push(...standardDeck('player', `d${d}`));
  for (let i = cards.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const card = cards[i]!;
    cards[i] = cards[j]!;
    cards[j] = card;
  }
  const cut = Math.round(cards.length * (CUT_FROM + rng.next() * (CUT_TO - CUT_FROM)));
  return { cards, next: BURN_CARDS, cut };
}

/** The cut card has come out: finish this round, then shuffle. */
export function cutCardOut(shoe: Shoe): boolean {
  return shoe.next >= shoe.cut;
}
