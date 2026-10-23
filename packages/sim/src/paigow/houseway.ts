import type { Card } from '../cards';
import { PgCategory, pgCategoryOf, pgScore2, pgScore5, sevenCardFeatures } from './evaluate';

/** A set hand: which two of the seven cards play in the low hand. The other five are the high hand. */
export interface PaiGowSet {
  low: [number, number];
}

export interface SetHands {
  high: Card[];
  low: Card[];
  highScore: number;
  lowScore: number;
}

/** Splits seven cards by a set, and scores both hands. */
export function applySet(cards: readonly Card[], set: PaiGowSet): SetHands {
  const [i, j] = set.low;
  const low = [cards[i]!, cards[j]!];
  const high = cards.filter((_, k) => k !== i && k !== j);
  return { high, low, highScore: pgScore5(high), lowScore: pgScore2(low) };
}

/** The high hand must outrank the low hand, or the hand is fouled. */
export function isLegalSet(cards: readonly Card[], set: PaiGowSet): boolean {
  const [i, j] = set.low;
  if (i === j || i < 0 || j < 0 || i >= cards.length || j >= cards.length) return false;
  const { highScore, lowScore } = applySet(cards, set);
  return highScore > lowScore;
}

/** Every one of the 21 ways to pick the low hand. */
export function allSets(): PaiGowSet[] {
  const sets: PaiGowSet[] = [];
  for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++) sets.push({ low: [i, j] });
  return sets;
}

const value = (card: Card) => (card.joker ? 14 : card.rank);

/**
 * The Foxwoods house way, as published by Wizard of Odds: how the dealer sets
 * every hand, and what the table suggests to the player. Wizard's 2.72% house
 * edge is for a player who also sets by this way. The joker counts as an ace
 * when pairing, and as a filler when it makes a straight or flush.
 */
export function houseWay(cards: readonly Card[]): PaiGowSet {
  const set = houseWayRules(cards);
  if (isLegalSet(cards, set)) return set;
  // Never foul: fall back to the legal split with the strongest low hand.
  const legal = allSets().filter((s) => isLegalSet(cards, s));
  return legal.reduce((best, s) => (pgScore2(lowOf(cards, s)) > pgScore2(lowOf(cards, best)) ? s : best), legal[0]!);
}

function houseWayRules(cards: readonly Card[]): PaiGowSet {
  // Card indices grouped by rank (joker with the aces), biggest groups first.
  const byRank = new Map<number, number[]>();
  cards.forEach((card, i) => {
    const r = value(card);
    byRank.set(r, [...(byRank.get(r) ?? []), i]);
  });
  // Natural cards before the joker within a group, so the joker stays free to fill a straight or flush.
  for (const group of byRank.values()) group.sort((x, y) => Number(!!cards[x]!.joker) - Number(!!cards[y]!.joker));
  const groups = [...byRank.entries()].sort((x, y) => y[1].length - x[1].length || y[0] - x[0]);
  const ofSize = (n: number) => groups.filter(([, g]) => g.length === n);
  const fives = ofSize(5);
  const quads = ofSize(4);
  const trips = ofSize(3);
  const pairs = ofSize(2);
  const singles = ofSize(1).map(([, g]) => g[0]!); // highest first

  const set = (a: number, b: number): PaiGowSet => ({ low: a < b ? [a, b] : [b, a] });
  /** The top `n` singles, skipping any in `except`. */
  const topSingles = (except: number[] = []) => singles.filter((i) => !except.includes(i));
  const lowPair = (group: number[]) => set(group[0]!, group[1]!);

  // Straight, flush or straight flush available? Only then is it worth trying every split.
  const f = sevenCardFeatures(cards);
  const sfSets = f.straight || f.flush ? allSets().filter((s) => isCompleteBack(cards, s)) : [];
  /** Among splits that keep a straight or flush in back, the one with the best low hand. */
  const bestComplete = () =>
    sfSets.reduce((best, s) => (pgScore2(lowOf(cards, s)) > pgScore2(lowOf(cards, best)) ? s : best), sfSets[0]!);

  // Five aces: a pair of aces up front, unless a pair of kings can go there.
  if (fives.length) {
    const kings = pairs.find(([r]) => r === 13) ?? trips.find(([r]) => r === 13);
    return kings ? lowPair(kings[1]) : lowPair(fives[0]![1]);
  }

  if (quads.length) {
    const [rank, four] = quads[0]!;
    // With a pair or a second set, the pair goes in front.
    const other = [...trips, ...pairs].sort((x, y) => y[0] - x[0])[0];
    if (other) return lowPair(other[1]);
    const top = topSingles();
    const split = () => set(four[0]!, four[1]!);
    if (rank >= 11) return split();
    if (rank >= 7) return value(cards[top[0]!]!) >= 13 ? set(top[0]!, top[1]!) : split();
    return set(top[0]!, top[1]!);
  }

  if (trips.length >= 2) return lowPair(trips[0]![1]); // two sets: a pair from the higher in front
  if (trips.length === 1 && pairs.length) {
    // Full house: the highest pair goes in front.
    return lowPair(pairs[0]![1]);
  }
  if (trips.length === 1) {
    const [rank, three] = trips[0]!;
    if (sfSets.length) return bestComplete(); // keep the straight or flush, a pair from the set in front if it can
    const top = topSingles();
    if (rank === 14) return set(three[0]!, top[0]!); // break aces: one up front with the best other card
    return set(top[0]!, top[1]!);
  }

  if (pairs.length >= 3) return lowPair(pairs[0]![1]); // three pair: the highest in front

  if (pairs.length === 2) {
    const [[big], [, small]] = pairs as [[number, number[]], [number, number[]]];
    const top = topSingles();
    const highest = value(cards[top[0]!]!);
    const keepBoth = () => set(top[0]!, top[1]!);
    if (big >= 11) return lowPair(small);
    if (big >= 7) return highest === 14 ? keepBoth() : lowPair(small);
    return highest >= 13 ? keepBoth() : lowPair(small);
  }

  if (pairs.length === 1) {
    const pair = pairs[0]!;
    const top = topSingles();
    const pairInBack = set(top[0]!, top[1]!);
    if (sfSets.length) {
      const complete = bestComplete();
      // With an ace and a pair of tens to kings, play the ace up front if that beats the straight's front.
      const aceUp = value(cards[top[0]!]!) === 14 && pair[0] >= 10 && pair[0] <= 13;
      if (aceUp && pgScore2(lowOf(cards, pairInBack)) > pgScore2(lowOf(cards, complete))) return pairInBack;
      return complete;
    }
    return pairInBack;
  }

  // No pair.
  if (sfSets.length) return bestComplete();
  return set(singles[1]!, singles[2]!);
}

function lowOf(cards: readonly Card[], s: PaiGowSet): Card[] {
  return [cards[s.low[0]]!, cards[s.low[1]]!];
}

/** Does this split keep a straight, flush or straight flush in the high hand? */
const COMPLETE = new Set([PgCategory.Straight, PgCategory.Flush, PgCategory.StraightFlush, PgCategory.RoyalFlush]);

function isCompleteBack(cards: readonly Card[], s: PaiGowSet): boolean {
  const high = cards.filter((_, k) => k !== s.low[0] && k !== s.low[1]);
  return COMPLETE.has(pgCategoryOf(pgScore5(high)));
}
