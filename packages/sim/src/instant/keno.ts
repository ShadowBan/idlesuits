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

/** A buff's effect on one draw (see KENO_BUFFS). */
export interface KenoDrawBuff {
  /** A free extra number on the ticket: counts as one of the ticket's own if drawn, the gold ball included. */
  free?: number;
  /** What the gold ball multiplies by, in place of GOLD_BALL_X. */
  goldX?: number;
  /** What the whole win is multiplied by. */
  times?: number;
}

/**
 * What a ticket pays on a draw, from the table for its spots scaled to
 * `ticketRtp` (see `kenoTicketRtp`), with any buff on the draw. A free spot's
 * catch counts toward the hits, up to the ticket's own spots.
 */
export function kenoSettle(spots: readonly number[], balls: readonly number[], ticketRtp: number, buff: KenoDrawBuff = {}): KenoResult {
  const drawnSet = new Set(balls);
  const marked = buff.free !== undefined && !spots.includes(buff.free) ? [...spots, buff.free] : spots;
  const hits = marked.filter((n) => drawnSet.has(n));
  const gold = marked.includes(balls[balls.length - 1]!);
  const base = kenoPays(spots.length, ticketRtp)[Math.min(hits.length, spots.length)] ?? 0;
  return { hits, gold, pay: base * (gold && base > 0 ? (buff.goldX ?? GOLD_BALL_X) : 1) * (buff.times ?? 1) };
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

/**
 * The ticket's own payback, what `kenoPays` is scaled to: the floor's payback
 * less the pots' shares, and less what the pattern meters' buffs pay on
 * average, which is a fixed share of the ticket's own (`kenoBuffShare`).
 */
export function kenoTicketRtp(rtp: number, spots: number): number {
  return (rtp - KENO_ROW_SHARE - KENO_CARD_SHARE) / (1 + kenoBuffShare(spots));
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

/*
 * Pattern meters. Each paid draw is checked for four patterns among its 20
 * balls, laid out on the board (eight rows of ten):
 *
 *   run      five in a row across one row (33-34-35-36-37)
 *   tower    six in one column
 *   crowd    seven or more in one row
 *   corners  three of the four corners (1, 10, 71, 80)
 *
 * Each pattern fills its own meter a step; a full meter grants its buff and
 * starts again. Buffs wait their turn and run one at a time, for a number of
 * draws. Every pattern's chance is exact (counted, not sampled), so each buff
 * comes, in the long run, once in (meter steps ÷ chance) paid draws, and what
 * the buffs pay on average is a fixed share of the ticket's own pays. The
 * ticket is scaled down by that share, so ticket, buffs and pots together pay
 * back exactly the floor's payback, for a ticket kept the same.
 */
export type KenoPattern = 'run' | 'tower' | 'crowd' | 'corners';
export type KenoBuffKind = 'double' | 'freeSpot' | 'freeDraws' | 'goldRush';

export interface KenoBuffDef {
  kind: KenoBuffKind;
  name: string;
  pattern: KenoPattern;
  /** The pattern, in a few words. */
  patternName: string;
  /** Pattern sightings to fill the meter. */
  steps: number;
  /** Draws the buff lasts. */
  draws: number;
  /** What it does, in a few words. */
  blurb: string;
}

export const KENO_BUFFS: readonly KenoBuffDef[] = [
  { kind: 'double', name: 'Double Up', pattern: 'run', patternName: '5 in a row across', steps: 6, draws: 5, blurb: 'wins pay ×2' },
  { kind: 'freeSpot', name: 'Free Spot', pattern: 'tower', patternName: '6 in one column', steps: 5, draws: 3, blurb: 'a free extra number' },
  { kind: 'freeDraws', name: 'Free Draws', pattern: 'crowd', patternName: '7 in one row', steps: 3, draws: 3, blurb: 'draws on the house' },
  { kind: 'goldRush', name: 'Gold Rush', pattern: 'corners', patternName: '3 of the 4 corners', steps: 9, draws: 5, blurb: 'gold ball ×10' },
];
export const KENO_GOLD_RUSH_X = 10;
export const KENO_CORNERS = [1, 10, 71, 80] as const;

/** The patterns among a draw's balls, each with the numbers that make it. */
export function kenoPatterns(balls: readonly number[]): Partial<Record<KenoPattern, number[]>> {
  const drawn = new Set(balls);
  const out: Partial<Record<KenoPattern, number[]>> = {};
  for (let row = 0; row < KENO_ROWS; row++) {
    const inRow: number[] = [];
    let run: number[] = [];
    for (let i = 1; i <= KENO_ROW_SIZE; i++) {
      const n = row * KENO_ROW_SIZE + i;
      if (drawn.has(n)) {
        inRow.push(n);
        run.push(n);
        if (run.length >= 5 && !out.run) out.run = [...run];
        else if (out.run && run.length > out.run.length && out.run[0] === run[0]) out.run = [...run];
      } else run = [];
    }
    if (inRow.length >= 7 && !out.crowd) out.crowd = inRow;
  }
  for (let col = 1; col <= KENO_ROW_SIZE; col++) {
    const inCol = Array.from({ length: KENO_ROWS }, (_, r) => r * KENO_ROW_SIZE + col).filter((n) => drawn.has(n));
    if (inCol.length >= 6 && !out.tower) out.tower = inCol;
  }
  const corners = KENO_CORNERS.filter((n) => drawn.has(n));
  if (corners.length >= 3) out.corners = corners;
  return out;
}

/** Coefficient of x^k in the product of polynomials (as coefficient lists), up to degree k. */
function coefficient(polys: readonly (readonly number[])[], k: number): number {
  let acc = [1];
  for (const p of polys) {
    const next = Array<number>(Math.min(k, acc.length - 1 + p.length - 1) + 1).fill(0);
    acc.forEach((a, i) => p.forEach((b, j) => i + j <= k && (next[i + j]! += a * b)));
    acc = next;
  }
  return acc[k] ?? 0;
}

/** Ways to choose j of a row's ten cells with no five in a row, j = 0 … 10. */
function noRunOfFive(): number[] {
  // By position along the row: how many chosen, and the run ending here.
  let ways = new Map<string, number>([['0,0', 1]]);
  for (let i = 0; i < KENO_ROW_SIZE; i++) {
    const next = new Map<string, number>();
    for (const [key, w] of ways) {
      const [j, run] = key.split(',').map(Number) as [number, number];
      const skip = `${j},0`;
      next.set(skip, (next.get(skip) ?? 0) + w);
      if (run + 1 < 5) {
        const take = `${j + 1},${run + 1}`;
        next.set(take, (next.get(take) ?? 0) + w);
      }
    }
    ways = next;
  }
  const out = Array<number>(KENO_ROW_SIZE + 1).fill(0);
  for (const [key, w] of ways) out[Number(key.split(',')[0])]! += w;
  return out;
}

/** Each pattern's exact chance on a draw. */
export const KENO_PATTERN_ODDS: Readonly<Record<KenoPattern, number>> = (() => {
  const all = choose(KENO_NUMBERS, KENO_DRAWN);
  const capped = (size: number, max: number) => Array.from({ length: size + 1 }, (_, j) => (j <= max ? choose(size, j) : 0));
  const rowsNoRun = coefficient(Array(KENO_ROWS).fill(noRunOfFive()), KENO_DRAWN);
  const colsUnderSix = coefficient(Array(KENO_ROW_SIZE).fill(capped(KENO_ROWS, 5)), KENO_DRAWN);
  const rowsUnderSeven = coefficient(Array(KENO_ROWS).fill(capped(KENO_ROW_SIZE, 6)), KENO_DRAWN);
  const corners = (choose(4, 3) * choose(76, 17) + choose(4, 4) * choose(76, 16)) / all;
  return { run: 1 - rowsNoRun / all, tower: 1 - colsUnderSix / all, crowd: 1 - rowsUnderSeven / all, corners };
})();

/** How often each buff comes, per paid draw, in the long run: its pattern's chance over its meter's steps. */
export function kenoBuffRate(def: KenoBuffDef): number {
  return KENO_PATTERN_ODDS[def.pattern] / def.steps;
}

/** A table's payback as drawn with the gold ball at `goldX`, and with a free spot (n + 1 numbers, paid on at most n). */
function drawnPaybackWith(spots: number, goldX: number, freeSpot = false): number {
  const marked = spots + (freeSpot ? 1 : 0);
  const odds = kenoOdds(marked);
  const table = drawn(spots);
  return odds.reduce((sum, p, k) => sum + p * table[Math.min(k, spots)]! * (1 + (k / KENO_DRAWN) * (goldX - 1)), 0);
}

/** What one draw of a buff adds, as a share of an ordinary draw's ticket pay. */
export function kenoBuffValue(kind: KenoBuffKind, spots: number): number {
  const plain = drawnPaybackWith(spots, GOLD_BALL_X);
  switch (kind) {
    case 'double':
      return 1;
    case 'freeDraws':
      return 1;
    case 'goldRush':
      return drawnPaybackWith(spots, KENO_GOLD_RUSH_X) / plain - 1;
    case 'freeSpot':
      return drawnPaybackWith(spots, GOLD_BALL_X, true) / plain - 1;
  }
}

/** What the buffs pay on average per paid draw, as a share of the ticket's own pays. */
export function kenoBuffShare(spots: number): number {
  return KENO_BUFFS.reduce((sum, def) => sum + kenoBuffRate(def) * def.draws * kenoBuffValue(def.kind, spots), 0);
}

/** The free number for a Free Spot draw: one not on the ticket, from the round's seed. */
export function kenoFreeSpot(ticket: readonly number[], seed: { run: Seed; round: number }): number {
  const rng = new Rng(seed.run, 'keno-free', seed.round);
  const open = Array.from({ length: KENO_NUMBERS }, (_, i) => i + 1).filter((n) => !ticket.includes(n));
  return open[rng.int(open.length)]!;
}

/** The meters' fill and the buffs waiting, the first running: kept from draw to draw. */
export interface KenoBuffState {
  meters: Record<KenoPattern, number>;
  /** Buffs earned, in order; the first is the one the next draw plays under, with the draws it has left. */
  queue: { kind: KenoBuffKind; left: number }[];
}

export const KENO_BUFF_START: KenoBuffState = { meters: { run: 0, tower: 0, crowd: 0, corners: 0 }, queue: [] };

export function kenoBuffDef(kind: KenoBuffKind): KenoBuffDef {
  return KENO_BUFFS.find((d) => d.kind === kind)!;
}

/**
 * After a draw: the buff it played under (the first in the queue) uses up a
 * draw, and, if it was a paid draw, each pattern among its balls fills its
 * meter a step; a full meter adds its buff to the end of the queue and starts
 * again. Free draws fill no meters.
 */
export function kenoAfterDraw(
  state: KenoBuffState,
  balls: readonly number[],
  paid: boolean,
): { state: KenoBuffState; patterns: Partial<Record<KenoPattern, number[]>>; granted: KenoBuffKind[] } {
  const queue = state.queue.map((b) => ({ ...b }));
  if (queue[0]) {
    queue[0].left--;
    if (queue[0].left <= 0) queue.shift();
  }
  const meters = { ...state.meters };
  const granted: KenoBuffKind[] = [];
  const patterns = paid ? kenoPatterns(balls) : {};
  for (const def of KENO_BUFFS) {
    if (!patterns[def.pattern]) continue;
    meters[def.pattern]++;
    if (meters[def.pattern] >= def.steps) {
      meters[def.pattern] = 0;
      queue.push({ kind: def.kind, left: def.draws });
      granted.push(def.kind);
    }
  }
  return { state: { meters, queue }, patterns, granted };
}

/** How a buff plays out on one draw: what it does to the ticket, and whether the draw is on the house. */
export function kenoBuffOnDraw(kind: KenoBuffKind | undefined, ticket: readonly number[], seed: { run: Seed; round: number }): KenoDrawBuff & { free?: number; onHouse: boolean } {
  switch (kind) {
    case 'double':
      return { times: 2, onHouse: false };
    case 'goldRush':
      return { goldX: KENO_GOLD_RUSH_X, onHouse: false };
    case 'freeSpot':
      return { free: kenoFreeSpot(ticket, seed), onHouse: false };
    case 'freeDraws':
      return { onHouse: true };
    default:
      return { onHouse: false };
  }
}
