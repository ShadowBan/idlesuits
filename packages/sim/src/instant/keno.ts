import { Rng, type Seed } from '../rng';

/**
 * Keno: the player marks 1 to 10 numbers (spots) out of 80, then 20 balls are
 * drawn. A ticket pays by how many of its spots were drawn (its hits), from a
 * table for that many spots: more spots, longer odds and bigger tops.
 *
 * The gold ball: the 20th ball drawn is gold. If it's one of the ticket's
 * spots, the ticket's win is multiplied by GOLD_X. Every drawn ball is as
 * likely as any other to be the last, so with k hits the chance the gold ball
 * is one of them is exactly k ÷ 20, and each table's payback is an exact sum:
 *
 *   Σ P(k hits) · pays(k) · (1 + (k / 20)(GOLD_X − 1))
 *
 * where P(k hits) is hypergeometric, C(n, k) · C(80 − n, 20 − k) ÷ C(80, 20).
 */
export const KENO_NUMBERS = 80;
export const KENO_DRAWN = 20;
export const KENO_MAX_SPOTS = 10;
/** What a win is multiplied by when the gold ball (the last one drawn) is one of the ticket's spots. */
export const GOLD_BALL_X = 3;

/**
 * Each table as drawn, hits → pays, before scaling to the floor's payback.
 * Shaped like a casino's: a small return for a few hits, then each extra hit
 * paying several times the last, to a top prize for catching them all.
 */
const TABLES: Record<number, Record<number, number>> = {
  1: { 1: 3.5 },
  2: { 1: 1, 2: 7.5 },
  3: { 2: 2.5, 3: 30 },
  4: { 2: 1, 3: 5.5, 4: 90 },
  5: { 3: 3, 4: 18, 5: 330 },
  6: { 3: 1, 4: 6.5, 5: 70, 6: 1000 },
  7: { 3: 1, 4: 3, 5: 16, 6: 150, 7: 3000 },
  8: { 4: 2, 5: 10, 6: 60, 7: 500, 8: 10000 },
  9: { 4: 1, 5: 4, 6: 30, 7: 150, 8: 2500, 9: 20000 },
  10: { 0: 2, 5: 2, 6: 13, 7: 90, 8: 800, 9: 4500, 10: 45000 },
};

function choose(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  let c = 1;
  for (let i = 0; i < k; i++) c = (c * (n - i)) / (i + 1);
  return c;
}

/** The chance of each number of hits, 0 to `spots`, when 20 of 80 are drawn. */
export function kenoOdds(spots: number): number[] {
  const all = choose(KENO_NUMBERS, KENO_DRAWN);
  return Array.from({ length: spots + 1 }, (_, k) => (choose(spots, k) * choose(KENO_NUMBERS - spots, KENO_DRAWN - k)) / all);
}

/** A table as drawn: what each number of hits pays, 0 to `spots`. */
function drawn(spots: number): number[] {
  const t = TABLES[spots]!;
  return Array.from({ length: spots + 1 }, (_, k) => t[k] ?? 0);
}

/** A table's payback as drawn, the gold ball included. */
function drawnPayback(spots: number): number {
  const odds = kenoOdds(spots);
  return drawn(spots).reduce((sum, pay, k) => sum + odds[k]! * pay * (1 + (k / KENO_DRAWN) * (GOLD_BALL_X - 1)), 0);
}

/**
 * What each number of hits pays at the floor's payback `rtp`, 0 to `spots`:
 * the table as drawn, scaled so that it, gold ball and all, pays back exactly
 * `rtp`. Every table pays the same, however many spots are marked.
 */
export function kenoPays(spots: number, rtp: number): number[] {
  const scale = rtp / drawnPayback(spots);
  return drawn(spots).map((pay) => pay * scale);
}

/** A ticket's exact payback at the floor's payback: `rtp` itself, for every table. */
export function kenoPayback(spots: number, rtp: number): number {
  const odds = kenoOdds(spots);
  return kenoPays(spots, rtp).reduce((sum, pay, k) => sum + odds[k]! * pay * (1 + (k / KENO_DRAWN) * (GOLD_BALL_X - 1)), 0);
}

/** The round's 20 balls, in the order they're drawn; the last is the gold ball. */
export function kenoDraw(seed: { run: Seed; round: number }): number[] {
  const rng = new Rng(seed.run, 'keno', seed.round);
  const pool = Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1);
  for (let i = 0; i < KENO_DRAWN; i++) {
    const j = i + rng.int(KENO_NUMBERS - i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, KENO_DRAWN);
}

export interface KenoResult {
  /** The ticket's spots that were drawn. */
  hits: number[];
  /** The gold ball is one of the ticket's spots. */
  gold: boolean;
  /** In bets, the gold ball's multiplier included. */
  pay: number;
}

/** What a ticket pays on a draw at the floor's payback. */
export function kenoSettle(spots: readonly number[], balls: readonly number[], rtp: number): KenoResult {
  const drawnSet = new Set(balls);
  const hits = spots.filter((n) => drawnSet.has(n));
  const gold = spots.includes(balls[balls.length - 1]!);
  const base = kenoPays(spots.length, rtp)[hits.length] ?? 0;
  return { hits, gold, pay: base * (gold && base > 0 ? GOLD_BALL_X : 1) };
}

/**
 * The Gold Card: the board itself, 1 to 80 in eight rows of ten, kept from
 * draw to draw. Every draw stamps the gold ball's number, and every number
 * the ticket catches. Finish a row of ten and it wins the Row pot; stamp all
 * 80 and the card wins the Card pot, and starts again empty.
 *
 * Each draw feeds the pots a share of its bet, in dollars, and the ticket's
 * pays are scaled to the floor's payback less those shares, so the ticket and
 * the pots together pay back exactly the floor's payback however the card
 * fills: every dollar put in a pot is paid back out of it.
 */
export const KENO_ROWS = 8;
export const KENO_ROW_SIZE = 10;
/** The share of each bet that goes to the Row pot, and to the Card pot. */
export const KENO_ROW_SHARE = 0.04;
export const KENO_CARD_SHARE = 0.04;

/** The ticket's own payback once the pots have their shares: what `kenoPays` is scaled to. */
export function kenoTicketRtp(rtp: number): number {
  return rtp - KENO_ROW_SHARE - KENO_CARD_SHARE;
}

/** The row a number is in, 0 to 7. */
export function kenoRow(n: number): number {
  return Math.floor((n - 1) / KENO_ROW_SIZE);
}

export interface KenoStamp {
  /** The numbers this draw stamped that weren't stamped before, in the order they came out. */
  stamped: number[];
  /** Rows this draw finished. */
  rows: number[];
  /** Every number is stamped: the card is full. */
  full: boolean;
}

/** What a draw does to the card: stamps the gold ball and every number the ticket caught. `card` is what's stamped already. */
export function kenoStamp(card: ReadonlySet<number>, ticket: readonly number[], balls: readonly number[]): KenoStamp {
  const gold = balls[balls.length - 1]!;
  const mine = new Set(ticket);
  const stamped: number[] = [];
  const now = new Set(card);
  for (const b of balls) {
    if ((mine.has(b) || b === gold) && !now.has(b)) {
      now.add(b);
      stamped.push(b);
    }
  }
  const rows = [...new Set(stamped.map(kenoRow))].filter((r) => {
    for (let n = r * KENO_ROW_SIZE + 1; n <= (r + 1) * KENO_ROW_SIZE; n++) if (!now.has(n)) return false;
    return true;
  });
  return { stamped, rows: rows.sort((a, b) => a - b), full: now.size === KENO_NUMBERS };
}

/** A quick pick: `count` different numbers, from the round's seed. */
export function kenoQuickPick(count: number, seed: { run: Seed; round: number }, salt = 0): number[] {
  const rng = new Rng(seed.run, 'keno-pick', seed.round, salt);
  const pool = Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1);
  for (let i = 0; i < count; i++) {
    const j = i + rng.int(KENO_NUMBERS - i);
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}
