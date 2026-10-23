import { standardDeck, type Card } from '../cards';

/**
 * Pai Gow Poker hands. The 53rd card is a joker that is only partly wild: it
 * plays as an ace, or completes a straight, flush or straight flush. Five aces
 * (four plus the joker) is the best hand, and A-2-3-4-5 is the second-highest
 * straight, behind only A-K-Q-J-10.
 */
export enum PgCategory {
  HighCard = 0,
  Pair = 1,
  TwoPair = 2,
  Trips = 3,
  Straight = 4,
  Flush = 5,
  FullHouse = 6,
  Quads = 7,
  StraightFlush = 8,
  RoyalFlush = 9,
  FiveAces = 10,
}

export const PG_CATEGORY_NAMES: Record<PgCategory, string> = {
  [PgCategory.HighCard]: 'High card',
  [PgCategory.Pair]: 'Pair',
  [PgCategory.TwoPair]: 'Two pair',
  [PgCategory.Trips]: 'Three of a kind',
  [PgCategory.Straight]: 'Straight',
  [PgCategory.Flush]: 'Flush',
  [PgCategory.FullHouse]: 'Full house',
  [PgCategory.Quads]: 'Four of a kind',
  [PgCategory.StraightFlush]: 'Straight flush',
  [PgCategory.RoyalFlush]: 'Royal flush',
  [PgCategory.FiveAces]: 'Five aces',
};

/** A 53-card Pai Gow deck: the standard 52 plus the joker. */
export function paiGowDeck(): Card[] {
  return [...standardDeck('player'), { uid: 'player:joker', suit: 'S', rank: 14, source: 'player', joker: true }];
}

const SUIT = { S: 0, H: 1, D: 2, C: 3 } as const;
const BASE = 16;

function pack(category: number, a = 0, b = 0, c = 0, d = 0, e = 0): number {
  return ((((category * BASE + a) * BASE + b) * BASE + c) * BASE + d) * BASE + e;
}

export function pgCategoryOf(score: number): PgCategory {
  return Math.floor(score / BASE ** 5) as PgCategory;
}

/**
 * Five natural cards as ranks and suits (-1 for a joker standing in as a
 * suitless ace or straight filler). Straights rank by a high value where the
 * wheel is 14 and A-K-Q-J-10 is 15, so the wheel sits second.
 */
function scoreNatural(ranks: number[], suits: number[]): number {
  const counts = new Map<number, number>();
  for (const r of ranks) counts.set(r, (counts.get(r) ?? 0) + 1);
  const flush = suits[0]! >= 0 && suits.every((s) => s === suits[0]);
  const distinct = [...counts.keys()].sort((x, y) => y - x);

  let straight = 0;
  if (distinct.length === 5) {
    if (distinct[0] === 14 && distinct[1] === 13 && distinct[4] === 10) straight = 15;
    else if (distinct[0] === 14 && distinct[1] === 5 && distinct[4] === 2) straight = 14;
    else if (distinct[0]! - distinct[4]! === 4) straight = distinct[0]!;
  }

  if ((counts.get(14) ?? 0) === 5) return pack(PgCategory.FiveAces, 14);
  if (straight && flush) return straight === 15 ? pack(PgCategory.RoyalFlush, 15) : pack(PgCategory.StraightFlush, straight);

  // Ranks grouped by how many of each, biggest group first, then highest rank.
  const groups = [...counts.entries()].sort((x, y) => y[1] - x[1] || y[0] - x[0]);
  const [g0, g1] = groups as [[number, number], [number, number] | undefined];
  const order = groups.map(([r]) => r);

  if (g0[1] === 4) return pack(PgCategory.Quads, g0[0], g1![0]);
  if (g0[1] === 3 && g1?.[1] === 2) return pack(PgCategory.FullHouse, g0[0], g1[0]);
  if (flush) return pack(PgCategory.Flush, ...(distinct as [number, number, number, number, number]));
  if (straight) return pack(PgCategory.Straight, straight);
  if (g0[1] === 3) return pack(PgCategory.Trips, ...(order as [number, number, number]));
  if (g0[1] === 2 && g1?.[1] === 2) return pack(PgCategory.TwoPair, ...(order as [number, number, number]));
  if (g0[1] === 2) return pack(PgCategory.Pair, ...(order as [number, number, number, number]));
  return pack(PgCategory.HighCard, ...(distinct as [number, number, number, number, number]));
}

/** Score a five-card high hand. Higher wins; equal is a copy, which the banker wins. */
export function pgScore5(cards: readonly Card[]): number {
  const naturals = cards.filter((c) => !c.joker);
  const ranks = naturals.map((c) => c.rank);
  const suits = naturals.map((c) => SUIT[c.suit]);
  if (naturals.length === 5) return scoreNatural(ranks, suits);

  // The joker as an ace counts for anything; as another card only to finish a straight or flush.
  let best = scoreNatural([...ranks, 14], [...suits, -1]);
  const suited = suits.every((s) => s === suits[0]);
  for (let r = 2; r <= 14; r++) {
    if (ranks.includes(r)) continue;
    const plain = scoreNatural([...ranks, r], [...suits, -1]);
    if (pgCategoryOf(plain) === PgCategory.Straight) best = Math.max(best, plain);
    if (suited) {
      const flushy = scoreNatural([...ranks, r], [...suits, suits[0]!]);
      if (pgCategoryOf(flushy) >= PgCategory.Flush) best = Math.max(best, flushy);
    }
  }
  return best;
}

/** Score a two-card low hand on the same scale as `pgScore5`; the joker plays as an ace. */
export function pgScore2(cards: readonly Card[]): number {
  const [a, b] = cards.map((c) => (c.joker ? 14 : c.rank)).sort((x, y) => y - x) as [number, number];
  return a === b ? pack(PgCategory.Pair, a) : pack(PgCategory.HighCard, a, b);
}

/** Name of a scored hand, for the table. */
export function pgHandName(score: number): string {
  const category = pgCategoryOf(score);
  const top = Math.floor(score / BASE ** 4) % BASE;
  const RANK: Record<number, string> = { 11: 'jacks', 12: 'queens', 13: 'kings', 14: 'aces' };
  const HIGH: Record<number, string> = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Ace' };
  if (category === PgCategory.Pair) return `Pair of ${RANK[top] ?? `${top}s`}`;
  if (category === PgCategory.HighCard) return `${HIGH[top] ?? top} high`;
  return PG_CATEGORY_NAMES[category];
}

/** Name of a two-card low hand: a pair, or its two cards, as in "A-K". */
export function pgLowName(score: number): string {
  if (pgCategoryOf(score) === PgCategory.Pair) return pgHandName(score);
  const label = (r: number) => ({ 11: 'J', 12: 'Q', 13: 'K', 14: 'A' })[r] ?? String(r);
  return `${label(Math.floor(score / BASE ** 4) % BASE)}-${label(Math.floor(score / BASE ** 3) % BASE)}`;
}

// ---------------------------------------------------------------------------
// Seven-card analysis, for side bets that pay on all seven cards however the
// hand is set. Allocation-free, since the audit runs it on every hand.

export interface SevenCardFeatures {
  /** Seven suited cards in a row, with no joker. */
  naturalSevenFlush: boolean;
  /** Seven in a row in one suit, the joker filling one gap or end. */
  wildSevenFlush: boolean;
  fiveAces: boolean;
  royalFlush: boolean;
  /** A royal flush, plus a natural suited K-Q in the other two cards. */
  royalMatch: boolean;
  straightFlush: boolean;
  quads: boolean;
  fullHouse: boolean;
  flush: boolean;
  trips: boolean;
  straight: boolean;
  twoPair: boolean;
  pair: boolean;
  threePair: boolean;
  /** With no pair, straight or flush possible: the highest card (the joker plays as an ace). Else 0. */
  paiGowHigh: number;
}

const rankCount = new Uint8Array(15);
const suitCount = new Uint8Array(4);
const suitMask = new Uint16Array(4);

/** Does `mask` (ace on bits 1 and 14) cover a `len`-card run, with `wild` cards to fill gaps? */
function hasRun(mask: number, len: number, wild: number, onlyHigh = 0): boolean {
  for (let high = onlyHigh || 14; high >= len; high--) {
    let missing = 0;
    for (let r = high - len + 1; r <= high; r++) if (!(mask & (1 << r))) missing++;
    if (missing <= wild) return true;
    if (onlyHigh) return false;
  }
  return false;
}

export function sevenCardFeatures(cards: readonly Card[], out?: SevenCardFeatures): SevenCardFeatures {
  rankCount.fill(0);
  suitCount.fill(0);
  suitMask.fill(0);
  let joker = 0;
  let mask = 0;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!;
    if (card.joker) {
      joker = 1;
      continue;
    }
    const s = SUIT[card.suit];
    rankCount[card.rank]!++;
    suitCount[s]!++;
    const bit = (1 << card.rank) | (card.rank === 14 ? 2 : 0);
    suitMask[s]! |= bit;
    mask |= bit;
  }

  // Pairs and sets, with the joker as an ace.
  let quads = false;
  let tripsRanks = 0;
  let pairRanks = 0;
  let high = 0;
  for (let r = 14; r >= 2; r--) {
    const n = rankCount[r]! + (r === 14 ? joker : 0);
    if (n === 0) continue;
    if (!high) high = r;
    if (n >= 4) quads = true;
    if (n >= 3) tripsRanks++;
    if (n >= 2) pairRanks++;
  }
  const aces = rankCount[14]! + joker;

  let flush = false;
  let straightFlush = false;
  let royalFlush = false;
  let naturalSevenFlush = false;
  let wildSevenFlush = false;
  let royalMatch = false;
  for (let s = 0; s < 4; s++) {
    if (suitCount[s]! + joker < 5) continue;
    flush = true;
    if (hasRun(suitMask[s]!, 5, joker)) straightFlush = true;
    if (hasRun(suitMask[s]!, 5, joker, 14)) {
      royalFlush = true;
      // The two cards outside the royal must be a natural, suited king and queen.
      if (!royalMatch) royalMatch = matchesRoyal(cards, s);
    }
    if (suitCount[s]! + joker >= 7 && hasRun(suitMask[s]!, 7, joker)) {
      if (joker) wildSevenFlush = true;
      else naturalSevenFlush = true;
    }
  }
  const straight = hasRun(mask, 5, joker);
  const fullHouse = tripsRanks >= 2 || (tripsRanks >= 1 && pairRanks >= 2);

  const f = out ?? ({} as SevenCardFeatures);
  f.naturalSevenFlush = naturalSevenFlush;
  f.wildSevenFlush = wildSevenFlush;
  f.fiveAces = aces === 5;
  f.royalFlush = royalFlush;
  f.royalMatch = royalMatch;
  f.straightFlush = straightFlush;
  f.quads = quads;
  f.fullHouse = fullHouse;
  f.flush = flush;
  f.trips = tripsRanks >= 1;
  f.straight = straight;
  f.twoPair = pairRanks >= 2;
  f.pair = pairRanks >= 1;
  f.threePair = pairRanks >= 3;
  f.paiGowHigh = pairRanks === 0 && !flush && !straight ? high : 0;
  return f;
}

/** A royal in suit `s` leaves two other cards; are they a natural K-Q of one suit? */
function matchesRoyal(cards: readonly Card[], s: number): boolean {
  const royal = [10, 11, 12, 13, 14];
  const inRoyal = (c: Card) => !c.joker && SUIT[c.suit] === s && royal.includes(c.rank);
  const naturalsInRoyal = cards.filter(inRoyal).length;
  // Natural royal uses five cards of the suit; a wild one uses four and the joker.
  const rest = cards.filter((c) => !inRoyal(c) && !(c.joker && naturalsInRoyal === 4));
  if (rest.length !== 2) return false;
  const [x, y] = rest as [Card, Card];
  return !x.joker && !y.joker && x.suit === y.suit && x.rank + y.rank === 25 && Math.abs(x.rank - y.rank) === 1;
}

/** The best poker category among all seven cards, in standard poker order. */
export function sevenCardCategory(f: SevenCardFeatures): PgCategory {
  if (f.fiveAces) return PgCategory.FiveAces;
  if (f.royalFlush) return PgCategory.RoyalFlush;
  if (f.straightFlush) return PgCategory.StraightFlush;
  if (f.quads) return PgCategory.Quads;
  if (f.fullHouse) return PgCategory.FullHouse;
  if (f.flush) return PgCategory.Flush;
  if (f.straight) return PgCategory.Straight;
  if (f.trips) return PgCategory.Trips;
  if (f.twoPair) return PgCategory.TwoPair;
  if (f.pair) return PgCategory.Pair;
  return PgCategory.HighCard;
}
