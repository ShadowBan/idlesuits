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
  tcpMain: {
    edge: 0.03373,
    source: `${WOO}/games/three-card-poker (Ante Bonus pay table 1)`,
    combos: {
      '7': 617044,
      '6': 931972,
      '5': 289104,
      '3': 8976452,
      '2': 91100696,
      '1': 80955780,
      '0': 249216,
      '-1': 132923304,
      '-2': 91126832,
    },
  },
  pairPlus: {
    edge: 512 / 22100,
    source: `${WOO}/games/three-card-poker (Pairplus pay table 1)`,
    combos: { 'Straight flush': 48, 'Three of a kind': 52, Straight: 720, Flush: 1096, Pair: 3744, loses: 16440 },
  },
  prime: {
    edge: 0.036206,
    source: `${WOO}/games/three-card-poker (Prime)`,
    combos: { 'All six cards one color': 9209200, 'Your three cards one color': 86595600, loses: 311365600 },
  },
  paiGowMain: {
    edge: 0.027212,
    source: `${WOO}/games/pai-gow-poker (house way against the Foxwoods house way, dealer banking)`,
  },
  fortune: {
    edge: 0.07765575,
    source: `${WOO}/games/pai-gow-poker/side-bets/fortune (pay table 2, before envy bonuses)`,
    combos: {
      'Seven-card straight flush': 32,
      'Royal flush + suited K-Q': 72,
      'Seven-card straight flush, with joker': 196,
      'Five aces': 1128,
      'Royal flush': 26020,
      'Straight flush': 184644,
      'Four of a kind': 307472,
      'Full house': 4188528,
      Flush: 6172088,
      'Three of a kind': 7672500,
      Straight: 11034204,
      loses: 124556196,
    },
  },
  emperor: {
    edge: 0.041714,
    source: `${WOO}/games/pai-gow-poker/appendix/3 (Emperor's Challenge)`,
    combos: {
      'Seven-card straight flush': 32,
      'Seven-card straight flush, with joker': 196,
      'Five aces': 1128,
      'Royal flush': 26092,
      'Straight flush': 184644,
      'Four of a kind': 307472,
      'Full house': 4188528,
      Flush: 6172088,
      'Three of a kind': 7672500,
      Straight: 11034204,
      'Nine-high pai gow': 31080,
      'Ten-high pai gow': 248640,
      'Jack-high pai gow': 963480,
      loses: 123312996,
    },
  },
  insurance: {
    edge: 0.073457,
    source: `${WOO}/games/pai-gow-poker/appendix/3 (Pai Gow Insurance)`,
    combos: {
      'Nine-high pai gow': 31080,
      'Ten-high pai gow': 248640,
      'Jack-high pai gow': 963480,
      'Queen-high pai gow': 2719500,
      'King-high pai gow': 6386940,
      'Ace-high pai gow': 14430780,
      loses: 129362660,
    },
  },
} satisfies Record<string, Reference>;

/**
 * Wizard of Odds' seven-card Pai Gow hand counts. It lists royal and straight
 * flushes together (210,964) and notes 26,132 royals; they are split here.
 */
export const PAI_GOW_HANDS: Record<string, number> = {
  'Five aces': 1128,
  'Royal flush': 26132,
  'Straight flush': 184832,
  'Four of a kind': 307472,
  'Full house': 4188528,
  Flush: 6172088,
  Straight: 11236028,
  'Three of a kind': 7470676,
  'Two pair': 35553816,
  Pair: 64221960,
  'High card': 24780420,
};

