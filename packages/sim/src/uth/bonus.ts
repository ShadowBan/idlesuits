import type { BonusBet } from '../bonus';
import type { Card } from '../cards';
import { Category, evaluatePoker, type PokerHand } from '../poker';

/** Everything on the table once an Ultimate Texas Hold'em hand is dealt out. */
export interface UthBonusContext {
  hole: readonly Card[];
  dealer: readonly Card[];
  board: readonly Card[];
  /** Four extra cards, dealt only for the 6-Card Bonus. */
  bonusCards: readonly Card[];
  playerHand: PokerHand;
  dealerHand: PokerHand;
}

/** Rows for a pay table keyed by poker category, best first; the row index for a category. */
function byCategory(lines: readonly [Category, string, number][]) {
  const rows = lines.map(([, label, pays]) => ({ label, pays }));
  const rowOf = (category: Category) => lines.findIndex(([c]) => c === category);
  return { rows, rowOf };
}

const POKER_LINES: [Category, string][] = [
  [Category.RoyalFlush, 'Royal flush'],
  [Category.StraightFlush, 'Straight flush'],
  [Category.Quads, 'Four of a kind'],
  [Category.FullHouse, 'Full house'],
  [Category.Flush, 'Flush'],
  [Category.Straight, 'Straight'],
  [Category.Trips, 'Three of a kind'],
];

function pokerTable(pays: readonly number[]) {
  return byCategory(POKER_LINES.map(([c, label], i) => [c, label, pays[i]!]));
}

const trips = pokerTable([50, 40, 30, 9, 7, 4, 3]);
/** Wizard of Odds pay table 1 (0.90%). */
export const UTH_TRIPS: BonusBet<UthBonusContext> = {
  id: 'trips',
  name: 'Trips',
  short: 'Trips',
  blurb: 'Your best five of seven: three of a kind or better.',
  rows: trips.rows,
  edge: 0.009018,
  resolve: (ctx) => trips.rowOf(ctx.playerHand.category),
};

const sixCard = pokerTable([1000, 200, 100, 20, 15, 10, 7]);
/** Wizard of Odds version 1-A (8.56%). */
export const UTH_SIX_CARD: BonusBet<UthBonusContext> = {
  id: 'sixCard',
  name: '6-Card Bonus',
  short: '6-Card',
  blurb: 'Your two cards plus four bonus cards: three of a kind or better.',
  rows: sixCard.rows,
  edge: 0.085614,
  resolve: (ctx) => sixCard.rowOf(evaluatePoker([...ctx.hole, ...ctx.bonusCards]).category),
};

/** Wizard of Odds (8.54%): the Pairs Bonus with a 1,000:1 line for aces against aces. */
export const UTH_HOLE_CARD: BonusBet<UthBonusContext> = {
  id: 'holeCard',
  name: 'Hole Card Bonus',
  short: 'Hole Card',
  blurb: 'Your two cards alone: any pair, or an ace with a jack or better.',
  rows: [
    { label: 'Aces, and the dealer has aces', pays: 1000 },
    { label: 'Pair of aces', pays: 30 },
    { label: 'A-K suited', pays: 25 },
    { label: 'A-Q or A-J suited', pays: 20 },
    { label: 'A-K', pays: 15 },
    { label: 'Pair of jacks to kings', pays: 10 },
    { label: 'A-Q or A-J', pays: 5 },
    { label: 'Pair of 2s to 10s', pays: 3 },
  ],
  edge: 0.085406,
  resolve: ({ hole, dealer }) => {
    const [a, b] = hole as [Card, Card];
    const high = Math.max(a.rank, b.rank);
    const low = Math.min(a.rank, b.rank);
    const suited = a.suit === b.suit;
    if (high === low) {
      if (high === 14) return dealer[0]!.rank === 14 && dealer[1]!.rank === 14 ? 0 : 1;
      return high >= 11 ? 5 : 7;
    }
    if (high !== 14) return -1;
    if (low === 13) return suited ? 2 : 4;
    if (low >= 11) return suited ? 3 : 6;
    return -1;
  },
};

const badBeat = byCategory([
  [Category.StraightFlush, 'Straight flush', 7500],
  [Category.Quads, 'Four of a kind', 500],
  [Category.FullHouse, 'Full house', 50],
  [Category.Flush, 'Flush', 30],
  [Category.Straight, 'Straight', 20],
  [Category.Trips, 'Three of a kind', 9],
]);
/** Wizard of Odds pay table 1 (14.79%). Ties lose. */
export const UTH_BAD_BEAT: BonusBet<UthBonusContext> = {
  id: 'badBeat',
  name: 'Bad Beat',
  short: 'Bad Beat',
  blurb: 'Pays on the losing hand, yours or the dealer’s: three of a kind or better.',
  rows: badBeat.rows,
  edge: 0.147868,
  resolve: ({ playerHand, dealerHand }) => {
    if (playerHand.score === dealerHand.score) return -1;
    const loser = playerHand.score < dealerHand.score ? playerHand : dealerHand;
    // A royal flush never loses, so straight flush is the top line.
    return badBeat.rowOf(Math.min(loser.category, Category.StraightFlush) as Category);
  },
};

export const UTH_BONUSES: readonly BonusBet<UthBonusContext>[] = [UTH_TRIPS, UTH_SIX_CARD, UTH_HOLE_CARD, UTH_BAD_BEAT];
