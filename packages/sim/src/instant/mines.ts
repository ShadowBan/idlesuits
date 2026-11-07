import { Rng, type Seed } from '../rng';

/**
 * Mines: a 5×5 board hides bombs the player chose the number of, a few stars,
 * sometimes a mine cart, and gems everywhere else. Each safe tile raises the
 * cash-out: a star twice as much as a gem, a cart by whatever its ride makes
 * (see `cartRide`). A bomb loses the bet. The player can cash out after any
 * safe tile.
 *
 * Every safe tile also drops a little cash into the Gem Vault (`VAULT_SHARE`
 * of the bet, times the payback), which carries from round to round and pays
 * out on a bonus board once it's full (`VAULT_FULL` finds).
 *
 * The cash-out is a fair game with the house's cut taken once, up front: it
 * starts at `rtp` times the bet, and each tile multiplies it by just enough
 * that its expected value after the next pick, plus what that pick drops in
 * the vault, equals what it is now. So the payback (cash-out and vault
 * together) is exactly `rtp` however many tiles the player turns, and however
 * they choose them. With no stars, carts or vault it's the real casino's game:
 * the payout is rtp ÷ the chance of surviving that many picks.
 */
export const MINES_TILES = 25;
export const MINES_MAX_BOMBS = 24;

export type MinesTile = 'gem' | 'star' | 'cart' | 'bomb';
/** A safe tile found: a cart carries what its ride multiplied the cash-out by. */
export interface MinesFind {
  tile: 'gem' | 'star' | 'cart';
  cart?: number;
}

/** The cart ride: at each junction one of `CART_TRACKS` tracks caves in; each clear one adds its boost. */
export const CART_TRACKS = 3;
export const CART_BOOSTS = [0.25, 0.5, 1, 2] as const;
/** What a ride multiplies the cash-out by, on average. */
export const CART_MEAN = 1 + CART_BOOSTS.reduce((sum, b, j) => sum + ((CART_TRACKS - 1) / CART_TRACKS) ** (j + 1) * b, 0);

/** Each safe tile drops this share of the bet (times the payback) into the vault. */
export const VAULT_SHARE = 0.025;
/** Finds that fill the vault. */
export const VAULT_FULL = 40;
/** The vault's bonus board: picks, and the shares of the vault its squares hide (25, averaging one fifth). */
export const VAULT_PICKS = 5;
export const VAULT_SQUARES: readonly number[] = [
  ...Array<number>(12).fill(0.05),
  ...Array<number>(6).fill(0.15),
  ...Array<number>(4).fill(0.3),
  ...Array<number>(2).fill(0.5),
  1.3,
];

/**
 * Stars on a board with this many bombs: one for every three bombs, up to two,
 * so the gems keep most of the board's worth; never more than the safe tiles allow.
 */
export function starsFor(bombs: number): number {
  return Math.max(0, Math.min(2, Math.floor(bombs / 3), MINES_TILES - 1 - bombs));
}

/**
 * A cart, if the board can afford one: it's worth CART_MEAN gems' rise at
 * once, so it needs enough bombs over the stars that a gem still raises the
 * cash-out with the vault's share taken out, and a gem left to find besides.
 */
export function cartsFor(bombs: number): number {
  const stars = starsFor(bombs);
  const safe = MINES_TILES - bombs;
  return bombs - stars - (CART_MEAN - 1) >= VAULT_SHARE * safe && safe >= stars + 2 ? 1 : 0;
}

/** A board: what lies under each tile, dealt from the round's seed. */
export function minesBoard(bombs: number, seed: { run: Seed; round: number }): MinesTile[] {
  const b = Math.min(MINES_MAX_BOMBS, Math.max(1, Math.floor(bombs)));
  const stars = starsFor(b);
  const carts = cartsFor(b);
  const tiles: MinesTile[] = Array.from({ length: MINES_TILES }, (_, i) => (i < b ? 'bomb' : i < b + stars ? 'star' : i < b + stars + carts ? 'cart' : 'gem'));
  const rng = new Rng(seed.run, 'mines', seed.round);
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [tiles[i], tiles[j]] = [tiles[j]!, tiles[i]!];
  }
  return tiles;
}

/** Where the round stands, and what the next pick can do. */
export interface MinesState {
  /** The cash-out now, in bets; 0 before the first find. */
  value: number;
  /** The chance the next pick is a bomb. */
  bomb: number;
  /** What a gem, a star, or a cart before its ride multiplies the cash-out by. */
  gem: number;
  star: number;
  cart: number;
  /** What any find drops in the vault, in bets. */
  vault: number;
  gemsLeft: number;
  starsLeft: number;
  cartsLeft: number;
}

/** The round after these finds: the cash-out, and the next pick's prices. */
export function minesState(bombs: number, found: readonly MinesFind[], rtp: number): MinesState {
  const stars = starsFor(bombs);
  const carts = cartsFor(bombs);
  const vault = VAULT_SHARE * rtp;
  let value = rtp;
  let s = { gems: MINES_TILES - bombs - stars - carts, stars, carts };
  const price = (value: number, left: number) => {
    // E[next cash-out + next drop in the vault] = now:
    // (gems·a + stars·2a + carts·a·CART_MEAN)·value + safe·vault = left·value.
    const safe = s.gems + s.stars + s.carts;
    return (left * value - safe * vault) / (value * (s.gems + 2 * s.stars + CART_MEAN * s.carts));
  };
  for (let i = 0; i < found.length; i++) {
    const a = price(value, MINES_TILES - i);
    const f = found[i]!;
    if (f.tile === 'gem') {
      value *= a;
      s = { ...s, gems: s.gems - 1 };
    } else if (f.tile === 'star') {
      value *= 2 * a;
      s = { ...s, stars: s.stars - 1 };
    } else {
      value *= a * (f.cart ?? 1);
      s = { ...s, carts: s.carts - 1 };
    }
  }
  const left = MINES_TILES - found.length;
  const a = s.gems + s.stars + s.carts ? price(value, left) : 1;
  return { value: found.length ? value : 0, bomb: bombs / left, gem: a, star: 2 * a, cart: a, vault, gemsLeft: s.gems, starsLeft: s.stars, cartsLeft: s.carts };
}

/** The cash-out, in bets, after these finds. */
export function minesCashout(bombs: number, found: readonly MinesFind[], rtp: number): number {
  return minesState(bombs, found, rtp).value;
}

/**
 * The cash-out, in bets, on average after `picks` safe tiles in a row, whatever
 * they turned out to be: what the round is worth, less what its finds have
 * dropped in the vault, over the chance of getting that far.
 */
export function minesAverage(bombs: number, picks: number, rtp: number): number {
  let dropped = 0;
  for (let j = 1; j <= picks; j++) dropped += minesSurvival(bombs, j);
  return (rtp - VAULT_SHARE * rtp * dropped) / minesSurvival(bombs, picks);
}

/** The chance of turning `picks` safe tiles in a row. */
export function minesSurvival(bombs: number, picks: number): number {
  let p = 1;
  for (let i = 0; i < picks; i++) p *= (MINES_TILES - bombs - i) / (MINES_TILES - i);
  return p;
}

/** A cart's ride: which track caves in at each junction, from the round's seed. */
export function cartRide(seed: { run: Seed; round: number }): number[] {
  const rng = new Rng(seed.run, 'mines-cart', seed.round);
  return CART_BOOSTS.map(() => rng.int(CART_TRACKS));
}

/** What a ride multiplies the cash-out by, given the tracks taken: it stops at the first cave-in. */
export function cartMultiplier(caves: readonly number[], picks: readonly number[]): number {
  let x = 1;
  for (let j = 0; j < picks.length && j < CART_BOOSTS.length; j++) {
    if (picks[j] === caves[j]) break;
    x += CART_BOOSTS[j]!;
  }
  return x;
}

/** The vault's bonus board, dealt from its own seed: the shares under each square. */
export function vaultBoard(seed: { run: Seed; round: number }): number[] {
  const squares = [...VAULT_SQUARES];
  const rng = new Rng(seed.run, 'mines-vault', seed.round);
  for (let i = squares.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [squares[i], squares[j]] = [squares[j]!, squares[i]!];
  }
  return squares;
}
