/**
 * A video slot: five reels of three rows, paying 243 ways, with a hold & spin
 * feature. Every amount is a multiple of the total bet.
 */

export type JackpotTier = 'mini' | 'minor' | 'major' | 'grand';
export const JACKPOT_TIERS: readonly JackpotTier[] = ['mini', 'minor', 'major', 'grand'];

/** A symbol on the reels. Pay symbols pay 3, 4 or 5 of a kind from the left reel; a wild stands in for them; coins start the feature. */
export interface SlotSymbol {
  id: string;
  name: string;
  kind: 'pay' | 'wild' | 'coin';
  /** Paid for 3, 4 and 5 reels in a row, per way, in total bets. */
  pays?: readonly [number, number, number];
}

/** What a coin carries: cash (a multiple of the total bet) or a jackpot. */
export type CoinValue = { kind: 'cash'; x: number } | { kind: 'jackpot'; tier: JackpotTier };

export interface HoldSpinRules {
  /** Coins anywhere on a spin that start the feature. */
  trigger: number;
  /** Respins to start with, and to go back to whenever a coin lands. */
  respins: number;
  /** The chance each empty cell lands a coin on a respin. */
  land: number;
  /** What a coin can carry, by weight. A full screen wins the Grand on top. */
  values: readonly { value: CoinValue; weight: number }[];
}

export interface MachineDef {
  id: string;
  name: string;
  rows: number;
  /** One strip per reel, read top to bottom and wrapping round. */
  reels: readonly (readonly string[])[];
  symbols: readonly SlotSymbol[];
  holdSpin: HoldSpinRules;
  /** Fixed jackpots, and where the progressive ones start, in total bets. */
  jackpots: Record<JackpotTier, number>;
}

/** The progressive jackpots as they stand, in total bets. The fixed ones come from the machine. */
export interface JackpotMeters {
  major: number;
  grand: number;
}

/** One way-pay on a spin. */
export interface WayWin {
  symbol: string;
  /** Reels in a row from the left. */
  reels: number;
  ways: number;
  /** In total bets. */
  pay: number;
  /** Every cell that took part: [reel, row]. */
  cells: [number, number][];
}

/** A coin on the screen during the feature. */
export interface HeldCoin {
  /** Cell index, reel × rows + row. */
  cell: number;
  value: CoinValue;
}

export interface HoldSpinRespin {
  /** Coins that landed on this respin. */
  landed: HeldCoin[];
  /** Respins left after it. */
  left: number;
}

export interface HoldSpinResult {
  /** The coins that started it. */
  start: HeldCoin[];
  respins: HoldSpinRespin[];
  /** Every coin at the end, in cell order. */
  coins: HeldCoin[];
  /** Every cell filled: the Grand. */
  full: boolean;
  /** Each coin's pay in order, then the Grand if won; in total bets. */
  pay: number;
  /** Jackpots won, in the order they were collected. */
  jackpots: JackpotTier[];
}

export interface SlotSpinResult {
  /** Where each reel stopped: the index of its top row in its strip. */
  stops: number[];
  /** Symbol ids by reel, then row. */
  grid: string[][];
  /** The value on each coin that landed, by cell index. */
  coins: HeldCoin[];
  wins: WayWin[];
  /** The ways paid together, in total bets. */
  waysPay: number;
  feature: HoldSpinResult | null;
  /** Everything the spin paid, in total bets. The bet itself is not returned on top. */
  pay: number;
}
