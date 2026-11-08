import { Rng, type Seed } from '../rng';

/**
 * Single-zero roulette, as dealt in Europe and most online casinos: 37
 * pockets, 0 to 36. Every bet covers a set of numbers and pays 36 ÷ (numbers
 * covered) for 1, so each has the same house edge, 1 ÷ 37 (2.70%):
 * straight up 35:1, split 17:1, street 11:1, corner 8:1, six line 5:1,
 * dozens and columns 2:1, and the even-money bets 1:1.
 */
export const ROULETTE_POCKETS = 37;
export const ROULETTE_EDGE = 1 / ROULETTE_POCKETS;

/** The pockets in order round the wheel, clockwise from zero. */
export const ROULETTE_WHEEL = [
  0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26,
] as const;

export const RED_NUMBERS: ReadonlySet<number> = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

export type PocketColor = 'green' | 'red' | 'black';
export function pocketColor(n: number): PocketColor {
  return n === 0 ? 'green' : RED_NUMBERS.has(n) ? 'red' : 'black';
}

export type RouletteBetKind =
  | 'straight'
  | 'split'
  | 'street'
  | 'trio'
  | 'corner'
  | 'firstFour'
  | 'line'
  | 'dozen'
  | 'column'
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'low'
  | 'high';

export interface RouletteBet {
  /** Unique: the numbers covered, joined (`17`, `14-17`, `1-2-4-5`), or the outside bet's name (`red`, `dozen2`). */
  id: string;
  kind: RouletteBetKind;
  label: string;
  numbers: readonly number[];
  /** N in "pays N to 1": 36 ÷ numbers covered, less the stake. */
  pays: number;
}

function bet(kind: RouletteBetKind, numbers: number[], label: string, id?: string): RouletteBet {
  const sorted = [...numbers].sort((a, b) => a - b);
  return { id: id ?? sorted.join('-'), kind, label, numbers: sorted, pays: 36 / sorted.length - 1 };
}

/** The number in a column (0–11, left to right) and row (0–2, top to bottom) of the layout: 3, 6 … 36 along the top. */
export function layoutNumber(column: number, row: number): number {
  return column * 3 + (3 - row);
}

/** Every bet the layout takes. */
export const ROULETTE_BETS: readonly RouletteBet[] = (() => {
  const out: RouletteBet[] = [];
  for (let n = 0; n <= 36; n++) out.push(bet('straight', [n], `Straight up ${n}`));
  // Splits: side by side along a row (n, n + 3), and up and down a column (n, n + 1); and zero with 1, 2 or 3.
  for (let n = 1; n <= 36; n++) {
    if (n <= 33) out.push(bet('split', [n, n + 3], `Split ${n}/${n + 3}`));
    if (n % 3 !== 0) out.push(bet('split', [n, n + 1], `Split ${n}/${n + 1}`));
  }
  for (const n of [1, 2, 3]) out.push(bet('split', [0, n], `Split 0/${n}`));
  for (let c = 0; c < 12; c++) {
    const low = c * 3 + 1;
    out.push(bet('street', [low, low + 1, low + 2], `Street ${low}–${low + 2}`));
    if (c < 11) out.push(bet('line', [low, low + 1, low + 2, low + 3, low + 4, low + 5], `Six line ${low}–${low + 5}`));
  }
  out.push(bet('trio', [0, 1, 2], 'Trio 0-1-2'), bet('trio', [0, 2, 3], 'Trio 0-2-3'));
  for (let n = 1; n <= 32; n++) if (n % 3 !== 0) out.push(bet('corner', [n, n + 1, n + 3, n + 4], `Corner ${n}-${n + 1}-${n + 3}-${n + 4}`));
  out.push(bet('firstFour', [0, 1, 2, 3], 'First four 0-1-2-3'));
  const range = (from: number, to: number, keep: (n: number) => boolean = () => true) =>
    Array.from({ length: to - from + 1 }, (_, i) => from + i).filter(keep);
  out.push(
    bet('dozen', range(1, 12), '1st dozen', 'dozen1'),
    bet('dozen', range(13, 24), '2nd dozen', 'dozen2'),
    bet('dozen', range(25, 36), '3rd dozen', 'dozen3'),
    bet('column', range(1, 36, (n) => n % 3 === 1), 'Column 1 (1, 4 … 34)', 'column1'),
    bet('column', range(1, 36, (n) => n % 3 === 2), 'Column 2 (2, 5 … 35)', 'column2'),
    bet('column', range(1, 36, (n) => n % 3 === 0), 'Column 3 (3, 6 … 36)', 'column3'),
    bet('red', range(1, 36, (n) => RED_NUMBERS.has(n)), 'Red', 'red'),
    bet('black', range(1, 36, (n) => !RED_NUMBERS.has(n)), 'Black', 'black'),
    bet('odd', range(1, 36, (n) => n % 2 === 1), 'Odd', 'odd'),
    bet('even', range(1, 36, (n) => n % 2 === 0), 'Even', 'even'),
    bet('low', range(1, 18), '1 to 18', 'low'),
    bet('high', range(19, 36), '19 to 36', 'high'),
  );
  return out;
})();

const BY_ID = new Map(ROULETTE_BETS.map((b) => [b.id, b]));
export function rouletteBet(id: string): RouletteBet | undefined {
  return BY_ID.get(id);
}

/** The pocket the ball drops into on this round. */
export function rouletteSpin(seed: { run: Seed; round: number }): number {
  return new Rng(seed.run, 'roulette', seed.round).int(ROULETTE_POCKETS);
}

export interface RouletteWin {
  id: string;
  stake: number;
  /** What the bet won or lost, its stake aside. */
  net: number;
}

export interface RouletteResult {
  pocket: number;
  /** Every bet on the layout, won or lost. */
  bets: RouletteWin[];
  /** Everything staked. */
  staked: number;
  /** Won less lost, across the layout. */
  net: number;
}

/** Settles a layout of bets (id → stake) on a pocket. Unknown ids and empty stakes are left out. */
export function rouletteSettle(layout: Readonly<Record<string, number>>, pocket: number): RouletteResult {
  const bets: RouletteWin[] = [];
  let staked = 0;
  let net = 0;
  for (const [id, stake] of Object.entries(layout)) {
    const b = BY_ID.get(id);
    if (!b || !(stake > 0)) continue;
    const won = b.numbers.includes(pocket);
    const n = won ? stake * b.pays : -stake;
    bets.push({ id, stake, net: n });
    staked += stake;
    net += n;
  }
  return { pocket, bets, staked, net };
}
