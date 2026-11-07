import { Rng, type Seed } from '../rng';

/**
 * Plinko: a ball falls through rows of pegs, going left or right at each one
 * as likely as not, and lands in a slot across the bottom. The slots pay a
 * multiple of the bet: most at the edges, least in the middle, where a high
 * risk board pays back only a fifth of the ball. With `rows` rows, landing in
 * slot k (counting rights) has the binomial chance C(rows, k) ÷ 2^rows.
 *
 * Fever: now and then a ball drops golden (`FEVER_CHANCE`). It lands and pays
 * like any other, then sets off Fever: free balls on the same board, one at a
 * time, each paying its slot times the next step of a climbing ladder
 * (`FEVER_LADDER`), up to ×14 on the last. A board's payback is its own slots
 * plus its share of Fever, an exact sum.
 */
export type PlinkoRisk = 'low' | 'medium' | 'high';
export const PLINKO_RISKS: readonly PlinkoRisk[] = ['low', 'medium', 'high'];
export const PLINKO_ROWS = [8, 12, 16] as const;
export type PlinkoRows = (typeof PLINKO_ROWS)[number];

export const FEVER_CHANCE = 1 / 400;
/** What each of Fever's free balls multiplies its slot by, in order. */
export const FEVER_LADDER = [2, 3, 5, 8, 14] as const;
export const FEVER_BALLS = FEVER_LADDER.length;
/** Fever's share, over and above a board's own payback: the board's payback is this times its slots'. */
export const FEVER_LIFT = 1 + FEVER_CHANCE * FEVER_LADDER.reduce<number>((a, b) => a + b, 0);

/** The payback the boards are drawn to, with Fever: the floor's starting payback. */
export const PLINKO_DESIGN = 0.97;

/**
 * Each board's slots from the edge to the middle, mirrored on the other side.
 * Drawn from one curve, rising from the middle's value to the edge's, bent
 * until the slots pay about 97% ÷ FEVER_LIFT, then rounded so every board,
 * Fever included, pays within a sixth of a percent of 97%.
 */
const HALVES: Record<PlinkoRows, Record<PlinkoRisk, readonly number[]>> = {
  8: {
    low: [5.6, 2.4, 1.2, 0.7, 0.5],
    medium: [12, 3.2, 1.1, 0.58, 0.4],
    high: [28, 4.3, 0.97, 0.33, 0.2],
  },
  12: {
    low: [9, 4.9, 2.7, 1.6, 0.99, 0.66, 0.5],
    medium: [32, 12, 4.6, 1.9, 0.89, 0.46, 0.3],
    high: [170, 28, 5.9, 1.6, 0.56, 0.28, 0.2],
  },
  16: {
    low: [16, 9.2, 5.4, 3.2, 2, 1.3, 0.88, 0.63, 0.5],
    medium: [110, 40, 16, 6.4, 2.8, 1.4, 0.67, 0.41, 0.3],
    high: [1000, 170, 35, 8.7, 2.6, 0.98, 0.43, 0.25, 0.2],
  },
};

/** Every slot's multiplier as drawn, left to right. */
export function plinkoSlots(rows: PlinkoRows, risk: PlinkoRisk): number[] {
  const half = HALVES[rows][risk];
  return Array.from({ length: rows + 1 }, (_, k) => half[Math.min(k, rows - k)]!);
}

/** The chance of each slot, left to right. */
export function plinkoOdds(rows: number): number[] {
  const out: number[] = [];
  let c = 1;
  for (let k = 0; k <= rows; k++) {
    out.push(c / 2 ** rows);
    c = (c * (rows - k)) / (k + 1);
  }
  return out;
}

/** The board's payback as drawn, Fever included. */
export function plinkoRTP(rows: PlinkoRows, risk: PlinkoRisk): number {
  const odds = plinkoOdds(rows);
  return plinkoSlots(rows, risk).reduce((sum, m, k) => sum + m * odds[k]!, 0) * FEVER_LIFT;
}

/**
 * Every slot's multiplier at the floor's payback `rtp`: as drawn at 97%, and
 * scaled by rtp ÷ 97% otherwise, so the pit boss moves every board alike.
 */
export function plinkoPays(rows: PlinkoRows, risk: PlinkoRisk, rtp: number): number[] {
  const scale = rtp / PLINKO_DESIGN;
  return plinkoSlots(rows, risk).map((m) => m * scale);
}

/** The board's exact payback at the floor's payback `rtp`, Fever included. */
export function plinkoPayback(rows: PlinkoRows, risk: PlinkoRisk, rtp: number): number {
  return (plinkoRTP(rows, risk) * rtp) / PLINKO_DESIGN;
}

/** One ball: left (0) or right (1) at each row, and the slot it lands in. Ball `ball` of the round has its own path. */
export function dropBall(rows: number, seed: { run: Seed; round: number }, ball = 0): { path: (0 | 1)[]; slot: number } {
  const rng = new Rng(seed.run, 'plinko', seed.round, ball);
  const path = Array.from({ length: rows }, () => (rng.next() < 0.5 ? 0 : 1) as 0 | 1);
  return { path, slot: path.reduce<number>((a, b) => a + b, 0) };
}

/** Whether the round's ball drops golden, setting off Fever. */
export function isGolden(seed: { run: Seed; round: number }): boolean {
  return new Rng(seed.run, 'plinko-gold', seed.round).next() < FEVER_CHANCE;
}
