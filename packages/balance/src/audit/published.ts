/**
 * Published figures every bet is held to. House edges are positive fractions
 * (0.0264 = the house keeps 2.64% of each unit staked). Combination counts
 * are the published hand frequencies, which exact runs must reproduce.
 */
export interface Reference {
  edge: number;
  source: string;
  /** Published combinations per pay-table line, when the source lists them. */
  combos?: Record<string, number>;
  note?: string;
  /** The simulator is known to differ from this source, for the reason in `note`. */
  known?: boolean;
}

const WOO = 'wizardofodds.com';

export const PUBLISHED = {
  suitsMain: {
    edge: 0.0264,
    source: `${WOO}/games/i-luv-suits-poker (via High Card Flush)`,
    note: 'Optimal play: raise every 4+ flush and 3-card flushes 10-8-6 or better.',
  },
  flushRush: {
    edge: 0.075292,
    source: `${WOO}/games/i-luv-suits-poker`,
    combos: { '7': 6864, '6': 267696, '5': 3814668, '4': 26137540 },
  },
  superFlushRush: {
    edge: 0.131093,
    source: `${WOO}/games/i-luv-suits-poker`,
    combos: { '7': 32, '6': 1568, '5': 39924, '4': 676148, '3': 8642916 },
    note:
      'The same page’s progressive table counts 32 / 1,592 / 39,960 / 676,196 / 8,642,932 straight flushes, ' +
      'which this simulator matches exactly; the Super Flush Rush table is 124 hands short of it.',
    known: true,
  },
  bjMain: { edge: 0.0104, source: `${WOO}/games/free-bet-blackjack` },
  potOfGold: {
    edge: 0.057686,
    source: `${WOO}/games/free-bet-blackjack (pay table 1, "based on a random simulation")`,
    note:
      'Pot of Gold wins whenever a round earns a free bet, which the first two cards decide. Under today’s rules ' +
      'that is 16.18% of rounds exactly (six decks, dealer peeks); the published table assumes 16.66%.',
    known: true,
  },
  push22: { edge: 0.117565, source: `${WOO}/games/free-bet-blackjack (dealer makes 22: 0.073536)` },
  uthMain: {
    edge: 0.0243,
    source: `${WOO}/games/ultimate-texas-hold-em (simple strategy; 2.19% with perfect play)`,
  },
  trips: {
    edge: 0.009018,
    source: `${WOO}/games/ultimate-texas-hold-em (Trips pay table 1)`,
    combos: {
      'Royal flush': 4324,
      'Straight flush': 37260,
      'Four of a kind': 224848,
      'Full house': 3473184,
      Flush: 4047644,
      Straight: 6180020,
      'Three of a kind': 6461620,
      loses: 113355660,
    },
  },
  sixCard: {
    edge: 0.085614,
    source: `${WOO}/games/three-card-poker/6-card-bonus (version 1-A)`,
    combos: {
      'Royal flush': 188,
      'Straight flush': 1656,
      'Four of a kind': 14664,
      'Full house': 165984,
      Flush: 205792,
      Straight: 361620,
      'Three of a kind': 732160,
      loses: 18876456,
    },
  },
  holeCard: {
    edge: 0.085406,
    source: `${WOO}/games/ultimate-texas-hold-em (Hole Card Bonus)`,
    combos: {
      'Aces, and the dealer has aces': 6,
      'Pair of aces': 7344,
      'A-K suited': 4900,
      'A-Q or A-J suited': 9800,
      'A-K': 14700,
      'Pair of jacks to kings': 22050,
      'A-Q or A-J': 29400,
      'Pair of 2s to 10s': 66150,
      loses: 1470000,
    },
  },
  badBeat: { edge: 0.147868, source: `${WOO}/games/ultimate-texas-hold-em (Bad Beat pay table 1)` },
  studMain: {
    edge: 0.049149,
    source: `${WOO}/games/mississippi-stud (average wager 3.59, element of risk 1.37%)`,
  },
  threeCard: {
    edge: 472 / 22100,
    source: 'New Jersey DGE pay table 4, priced on the standard three-card hand counts',
    combos: {
      'Mini royal (A-K-Q suited)': 4,
      'Straight flush': 44,
      'Three of a kind': 52,
      Straight: 720,
      Flush: 1096,
      Pair: 3744,
      loses: 16440,
    },
  },
} satisfies Record<string, Reference>;
