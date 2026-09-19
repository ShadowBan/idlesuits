export const SUITS = ['S', 'H', 'D', 'C'] as const;
export type Suit = (typeof SUITS)[number];

/** 2..14, where 11 = J, 12 = Q, 13 = K, 14 = A. */
export type Rank = number;
export const RANKS: readonly Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];

/** Which contribution to the shared shoe a card came from. */
export type CardSource = 'player' | 'dealer' | 'table';

export interface Card {
  /** Unique within a shoe; duplicates of the same face get distinct uids. */
  uid: string;
  suit: Suit;
  rank: Rank;
  source: CardSource;
}

/** The suit/rank the evaluator sees, after any effects have been applied. */
export interface Face {
  suit: Suit;
  rank: Rank;
}

export const SUIT_SYMBOL: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
const RANK_LABEL: Record<number, string> = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

export function rankLabel(rank: Rank): string {
  return RANK_LABEL[rank] ?? String(rank);
}

export function cardLabel(card: Face): string {
  return `${rankLabel(card.rank)}${SUIT_SYMBOL[card.suit]}`;
}

export function standardDeck(source: CardSource, uidPrefix: string = source): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ uid: `${uidPrefix}:${rank}${suit}`, suit, rank, source });
    }
  }
  return deck;
}

/** Combines every contribution into the shared shoe. */
export function buildShoe(...contributions: readonly Card[][]): Card[] {
  const shoe = contributions.flat();
  const seen = new Set<string>();
  for (const card of shoe) {
    if (seen.has(card.uid)) throw new Error(`Duplicate card uid in shoe: ${card.uid}`);
    seen.add(card.uid);
  }
  return shoe;
}
