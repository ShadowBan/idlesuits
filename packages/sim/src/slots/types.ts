/**
 * A video slot: five reels of three rows, paying 243 ways, with a bonus of
 * its own: hold & spin, free spins that upgrade symbols or collect cash, a
 * wheel, or a pick. Every amount is a multiple of the total bet.
 */

export type JackpotTier = 'mini' | 'minor' | 'major' | 'grand';
export const JACKPOT_TIERS: readonly JackpotTier[] = ['mini', 'minor', 'major', 'grand'];

/**
 * A symbol on the reels. Pay symbols pay 3, 4 or 5 of a kind from the left
 * reel; a wild stands in for them. The rest pay nothing on a line: coins carry
 * a value, scatters start the bonus anywhere on the screen, collectors take
 * every coin's value, and hammers fill the forge's meter in free spins.
 */
export interface SlotSymbol {
  id: string;
  name: string;
  kind: 'pay' | 'wild' | 'coin' | 'scatter' | 'collector' | 'hammer';
  /** Paid for 3, 4 and 5 reels in a row, per way, in total bets. */
  pays?: readonly [number, number, number];
}

/** What a coin carries: cash (a multiple of the total bet) or a jackpot. */
export type CoinValue = { kind: 'cash'; x: number } | { kind: 'jackpot'; tier: JackpotTier };

export interface Weighted<T> {
  value: T;
  weight: number;
}

/** Coins stick, each new one resets the respins, and a full screen wins the Grand. Started by coins rather than a scatter. */
export interface HoldSpinBonus {
  kind: 'holdSpin';
  /** Coins anywhere on a spin that start the feature. */
  trigger: number;
  /** Respins to start with, and to go back to whenever a coin lands. */
  respins: number;
  /** The chance each empty cell lands a coin on a respin. */
  land: number;
}

/**
 * Free spins on reels of their own, with a meter that levels up: every
 * `perLevel` hammers (upgrade) or collectors (collect) on the screen add
 * `extraSpins` and a level, which counts from the next spin.
 */
interface FreeSpinsBase {
  /** The scatter that starts it, and how many anywhere on one spin. */
  scatter: string;
  trigger: number;
  spins: number;
  reels: readonly (readonly string[])[];
  perLevel: number;
  maxLevel: number;
  extraSpins: number;
}

/**
 * Upgrading symbols: each level moves every tier symbol up one tier, so
 * bronze shows as silver, then gold, then the top tier. A screen of nothing
 * but the top tier and wilds wins the Grand, once a feature.
 */
export interface UpgradeBonus extends FreeSpinsBase {
  kind: 'upgrade';
  /** The symbol that fills the meter. */
  hammer: string;
  /** Tier symbols, lowest first. */
  tiers: readonly string[];
}

/**
 * Collecting: every collector on the screen takes the value of every coin on
 * it. Each level multiplies the cash it takes (never a jackpot).
 */
export interface CollectBonus extends FreeSpinsBase {
  kind: 'collect';
  /** Cash multiplier by level, from level 0. */
  multipliers: readonly number[];
}

export type WheelWedge = { kind: 'cash'; x: number } | { kind: 'jackpot'; tier: JackpotTier } | { kind: 'up' };

/** A wheel of wheels: a spin stops on a wedge, every wedge as likely as the next, and "up" spins the next wheel in. */
export interface WheelBonus {
  kind: 'wheel';
  scatter: string;
  trigger: number;
  /** Outermost first. The innermost has no "up". */
  wheels: readonly (readonly WheelWedge[])[];
}

/**
 * Pick to match: a board of `per` tiles for each jackpot, picked one by one
 * until three of one jackpot show, which pays. The jackpot is drawn by weight
 * first and the picks laid out to match, as on a real machine.
 */
export interface PickBonus {
  kind: 'pick';
  scatter: string;
  trigger: number;
  per: number;
  weights: Record<JackpotTier, number>;
}

export type SlotBonusDef = HoldSpinBonus | UpgradeBonus | CollectBonus | WheelBonus | PickBonus;

/**
 * What a full pot adds to the bonus.
 *
 * Hold & spin:
 * - boost: after every respin, every coin on the screen gains the same cash, drawn by weight;
 * - extra: the respins start and reset at `respins` rather than the usual count;
 * - collect: when the respins end, a collector takes every coin's cash again.
 *
 * Free spins:
 * - level: the feature starts `levels` up, the meter already that full;
 * - marks: every hammer or captain fills the meter `times` over;
 * - wilds: every wild multiplies the ways through it by `x`;
 * - spins: `add` more free spins to start;
 * - cash: every doubloon's cash is `times` as much.
 *
 * Wheel:
 * - ups: the `add` smallest cash wedges on the outer wheel turn to Up;
 * - ring: a ring spins with the wheel and multiplies cash (never a jackpot), drawn by weight;
 * - encore: the wheel is played again from the outside, and both pay.
 *
 * Pick:
 * - drop: the `tier` jackpot's tiles are gone from the board;
 * - twin: a second board is played after the first, and both pay;
 * - rise: the jackpot won climbs a tier, as far as `top`.
 */
export type PotPower =
  | { kind: 'boost'; values: readonly Weighted<number>[] }
  | { kind: 'extra'; respins: number }
  | { kind: 'collect' }
  | { kind: 'level'; levels: number }
  | { kind: 'marks'; times: number }
  | { kind: 'wilds'; x: number }
  | { kind: 'spins'; add: number }
  | { kind: 'cash'; times: number }
  | { kind: 'ups'; add: number }
  | { kind: 'ring'; values: readonly Weighted<number>[] }
  | { kind: 'encore' }
  | { kind: 'drop'; tier: JackpotTier }
  | { kind: 'twin' }
  | { kind: 'rise'; top: JackpotTier };

/** The power of a kind among those in play, if there is one. */
export function powerOf<K extends PotPower['kind']>(powers: readonly PotPower[], kind: K): Extract<PotPower, { kind: K }> | undefined {
  return powers.find((p): p is Extract<PotPower, { kind: K }> => p.kind === kind);
}

/**
 * A pot over the reels. The symbol that starts the bonus (coins for hold &
 * spin, the scatter otherwise) can carry its gem, and every gem fills it a
 * step. Its progress is kept from spin to spin, at any bet. Once full it stays
 * lit until the bonus starts; then its power joins the bonus and it empties.
 * Pots that aren't full keep their progress.
 */
export interface PotDef {
  id: string;
  name: string;
  /** Gems to fill it. */
  size: number;
  /** The chance each carrier on the base game carries this pot's gem. A carrier carries one gem at most. */
  chance: number;
  power: PotPower;
}

export interface MachineDef {
  id: string;
  name: string;
  rows: number;
  /** One strip per reel, read top to bottom and wrapping round. */
  reels: readonly (readonly string[])[];
  symbols: readonly SlotSymbol[];
  /** What a coin can carry, by weight, wherever coins land. */
  coinValues?: readonly Weighted<CoinValue>[];
  bonus: SlotBonusDef;
  /** The fixed jackpots this machine pays, and where the progressives start, in total bets. */
  jackpots: Record<JackpotTier, number>;
  /** The jackpots this machine can award besides the must-hit Major, for its marquee. */
  awards: readonly JackpotTier[];
  /** Pots over the reels, filled by gems on whatever starts the bonus. */
  pots?: readonly PotDef[];
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

/** A coin on the screen. */
export interface HeldCoin {
  /** Cell index, reel × rows + row. */
  cell: number;
  value: CoinValue;
}

/** A collector taking every coin on the screen. */
export interface Collect {
  cell: number;
  /** Cash × the multiplier, plus any jackpots, in total bets. */
  pay: number;
  jackpots: JackpotTier[];
}

export interface HoldSpinRespin {
  /** Coins that landed on this respin. */
  landed: HeldCoin[];
  /** Respins left after it. */
  left: number;
  /** The boost pot's cash, added to every coin on the screen after the coins land; 0 without it. */
  boost: number;
}

export interface HoldSpinResult {
  kind: 'holdSpin';
  /** The coins that started it. */
  start: HeldCoin[];
  respins: HoldSpinRespin[];
  /** Every coin at the end, in cell order. */
  coins: HeldCoin[];
  /** Every cell filled: the Grand. */
  full: boolean;
  /** The pots' powers in play. */
  powers: PotPower['kind'][];
  /** Boost cash each coin gathered, by cell. */
  boosted: Record<number, number>;
  /** What the collector took on top: every coin's cash, boost included, a second time. */
  collected: number;
  /** Each coin's pay and boost in order, then the collector, then the Grand if won; in total bets. */
  pay: number;
  /** Jackpots won, in the order they were collected. */
  jackpots: JackpotTier[];
}

/** One free spin, as the screen shows it. */
export interface FreeSpin {
  /** Symbol ids by reel, then row, upgraded to the level the spin played at. */
  grid: string[][];
  coins: HeldCoin[];
  wins: WayWin[];
  waysPay: number;
  collects: Collect[];
  /** Cells that fill the meter: hammers or collectors. */
  marks: number[];
  /** The level it played at. */
  level: number;
  /** The meter after it. */
  meter: number;
  /** Levels gained on it, counting from the next spin. */
  levelUps: number;
  /** Spins added by those levels. */
  added: number;
  /** Spins left after it. */
  left: number;
  /** A full screen of the top tier: the Grand (once a feature). */
  grand: boolean;
  /** Everything it paid, in total bets. */
  pay: number;
}

export interface FreeSpinsResult {
  kind: 'freeSpins';
  /** The pots' powers in play. */
  powers: PotPower['kind'][];
  /** Spins to start with, and the meter and level the first spin plays at. */
  start: { spins: number; meter: number; level: number };
  spins: FreeSpin[];
  level: number;
  pay: number;
  jackpots: JackpotTier[];
}

/** One play of the wheel: where it stopped, wheel by wheel, outermost first, and the ring's multiplier on cash. */
export interface WheelRound {
  stops: { wheel: number; wedge: number }[];
  /** The ring's multiplier, 1 without it. */
  ring: number;
  pay: number;
}

export interface WheelResult {
  kind: 'wheel';
  /** The pots' powers in play. */
  powers: PotPower['kind'][];
  /** The wheels as played, Up wedges added. */
  wheels: WheelWedge[][];
  /** One round, or two with an encore. */
  rounds: WheelRound[];
  pay: number;
  jackpots: JackpotTier[];
}

/** One board of the pick. */
export interface PickBoard {
  /** What each pick revealed, in order; the last completes three of a kind. */
  picks: JackpotTier[];
  /** The jackpot matched. */
  tier: JackpotTier;
  /** The jackpot paid: the one matched, or a tier up with the rise. */
  won: JackpotTier;
}

export interface PickResult {
  kind: 'pick';
  /** The pots' powers in play. */
  powers: PotPower['kind'][];
  /** The jackpots on the board: all of them, unless one was dropped. */
  tiers: JackpotTier[];
  /** One board, or two with the twin. */
  boards: PickBoard[];
  pay: number;
  jackpots: JackpotTier[];
}

export type SlotBonusResult = HoldSpinResult | FreeSpinsResult | WheelResult | PickResult;

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
  /** Collectors on the base screen taking the coins. */
  collects: Collect[];
  collectPay: number;
  feature: SlotBonusResult | null;
  /** Everything the spin paid, in total bets. The bet itself is not returned on top. */
  pay: number;
  /** Carriers (coins or scatters) that carry a pot's gem: the cell and the pot's index. */
  gems: { cell: number; pot: number }[];
  /** Each pot's gems once this spin's have gone in, before any empties for the bonus. */
  filled: number[];
  /** Pots whose power joined this spin's bonus, by index. */
  lit: number[];
  /** Each pot's gems after the spin, to carry to the next. */
  pots: number[];
}
