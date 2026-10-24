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
  lirMain: {
    edge: 0.035057,
    source: `${WOO}/games/let-it-ride (standard pay table)`,
    combos: {
      'Royal flush:3': 80,
      'Straight flush:3': 352,
      'Straight flush:2': 368,
      'Four of a kind:3': 7872,
      'Four of a kind:2': 4608,
      'Full house:3': 33408,
      'Full house:2': 41472,
      'Flush:3': 10008,
      'Flush:2': 92152,
      'Straight:3': 4464,
      'Straight:2': 88656,
      'Straight:1': 110880,
      'Three of a kind:3': 364560,
      'Three of a kind:2': 328968,
      'Three of a kind:1': 404712,
      'Two pair:3': 574128,
      'Two pair:2': 682776,
      'Two pair:1': 1214136,
      'Tens or better:3': 2571636,
      'Tens or better:2': 2647560,
      'Tens or better:1': 3228804,
      'Loser:3': 53076,
      'Loser:2': 937824,
      'Loser:1': 38576700,
    },
  },
  lirThreeCard: {
    edge: 0.07095,
    source: `${WOO}/games/let-it-ride (3-Card Bonus, most common table)`,
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
  lirFiveCard: {
    edge: 0.23727,
    source: `${WOO}/games/let-it-ride (5-Card Bonus, pay table 2)`,
    combos: {
      'Royal flush': 4,
      'Straight flush': 36,
      'Four of a kind': 624,
      'Full house': 3744,
      Flush: 5108,
      Straight: 10200,
      'Three of a kind': 54912,
      'Two pair': 123552,
      'Tens or better': 422400,
      loses: 1978380,
    },
  },
  cspMain: {
    edge: 1041417758724 / 19933230517200,
    source: `${WOO}/games/caribbean-stud-poker (Wizard's strategy; 5.2243% with perfect play)`,
  },
  fivePlusOne: { edge: 0.085614, source: `${WOO}/games/caribbean-stud-poker (5+1 Bonus)` },
  c4pMain: {
    edge: 0.034189 + 0.00000089,
    source: `${WOO}/games/crazy-4-poker (Ante, Play and Super Bonus; K-Q-8-4 strategy, +0.000089% on optimal)`,
  },
  queensUp: {
    edge: 0.067772,
    source: `${WOO}/games/crazy-4-poker (Queens Up pay table 4)`,
    combos: {
      'Four of a kind': 624,
      'Straight flush': 2072,
      'Three of a kind': 58656,
      Flush: 114616,
      Straight: 101808,
      'Two pair': 123552,
      'Pair of queens or better': 242916,
      loses: 1954716,
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

