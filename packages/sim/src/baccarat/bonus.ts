import type { BonusBet } from '../bonus';
import type { Card } from '../cards';

export type BaccaratWinner = 'player' | 'banker' | 'tie';

export interface BaccaratBonusContext {
  player: readonly Card[];
  banker: readonly Card[];
  winner: BaccaratWinner;
}

const pair = (cards: readonly Card[]) => cards[0]!.rank === cards[1]!.rank;

/** 8:1, eight decks: 14.36%. A tie pushes the Player and Banker bets. */
export const BACCARAT_TIE: BonusBet<BaccaratBonusContext> = {
  id: 'tie',
  name: 'Tie',
  short: 'Tie',
  blurb: 'Player and Banker finish on the same total.',
  rows: [{ label: 'Tie', pays: 8 }],
  edge: 0.143596,
  resolve: ({ winner }) => (winner === 'tie' ? 0 : -1),
};

/** 11:1, eight decks: the Player's first two cards are the same rank (31 in 415), 10.36%. */
export const BACCARAT_PLAYER_PAIR: BonusBet<BaccaratBonusContext> = {
  id: 'playerPair',
  name: 'Player Pair',
  short: 'P Pair',
  blurb: "The Player's first two cards are a pair.",
  rows: [{ label: 'Pair', pays: 11 }],
  edge: 0.103614,
  resolve: ({ player }) => (pair(player) ? 0 : -1),
};

export const BACCARAT_BANKER_PAIR: BonusBet<BaccaratBonusContext> = {
  id: 'bankerPair',
  name: 'Banker Pair',
  short: 'B Pair',
  blurb: "The Banker's first two cards are a pair.",
  rows: [{ label: 'Pair', pays: 11 }],
  edge: 0.103614,
  resolve: ({ banker }) => (pair(banker) ? 0 : -1),
};

export const BACCARAT_BONUSES: readonly BonusBet<BaccaratBonusContext>[] = [
  BACCARAT_PLAYER_PAIR,
  BACCARAT_TIE,
  BACCARAT_BANKER_PAIR,
];
