import { Rng, type Seed } from '../rng';
import type {
  CoinValue,
  HeldCoin,
  HoldSpinRespin,
  HoldSpinResult,
  JackpotMeters,
  JackpotTier,
  MachineDef,
  SlotSpinResult,
  WayWin,
} from './types';

export interface SlotSpinInput {
  machine: MachineDef;
  seed: { run: Seed; round: number };
  /** × every way-pay, to set the machine's payback (see `waysScaleFor`). */
  waysScale?: number;
  /** The progressive jackpots as they stand; the machine's seeds if not given. */
  meters?: JackpotMeters;
  /** Spins the reels again until the feature lands, for testing. */
  forceFeature?: boolean;
}

/** The symbols in one reel's window, top to bottom, with the reel stopped at `stop`. */
export function windowAt(strip: readonly string[], stop: number, rows: number): string[] {
  return Array.from({ length: rows }, (_, row) => strip[(stop + row) % strip.length]!);
}

export function coinCount(machine: MachineDef, grid: readonly (readonly string[])[]): number {
  const coin = coinSymbol(machine);
  return grid.reduce((n, reel) => n + reel.filter((s) => s === coin).length, 0);
}

function coinSymbol(machine: MachineDef): string {
  return machine.symbols.find((s) => s.kind === 'coin')!.id;
}

/**
 * The 243-ways pays on a screen: each pay symbol (or a wild in its place) on
 * reels in a row from the left, at least three, paid once for every way
 * through them. Wilds pay nothing of their own.
 */
export function waysWins(machine: MachineDef, grid: readonly (readonly string[])[], scale = 1): WayWin[] {
  const wild = machine.symbols.find((s) => s.kind === 'wild')?.id;
  const wins: WayWin[] = [];
  for (const symbol of machine.symbols) {
    if (symbol.kind !== 'pay' || !symbol.pays) continue;
    const cells: [number, number][] = [];
    let ways = 1;
    let reels = 0;
    for (let r = 0; r < grid.length; r++) {
      const hits = grid[r]!.flatMap((s, row) => (s === symbol.id || s === wild ? [row] : []));
      if (!hits.length) break;
      ways *= hits.length;
      reels++;
      for (const row of hits) cells.push([r, row]);
    }
    if (reels < 3) continue;
    wins.push({ symbol: symbol.id, reels, ways, pay: ways * symbol.pays[reels - 3]! * scale, cells });
  }
  return wins;
}

function drawCoin(machine: MachineDef, rng: Rng): CoinValue {
  const values = machine.holdSpin.values;
  const total = values.reduce((sum, v) => sum + v.weight, 0);
  let pick = rng.next() * total;
  for (const v of values) {
    pick -= v.weight;
    if (pick < 0) return v.value;
  }
  return values[values.length - 1]!.value;
}

/** What a coin pays, in total bets, with the progressives as they stand. */
export function coinPay(machine: MachineDef, value: CoinValue, meters: JackpotMeters): number {
  if (value.kind === 'cash') return value.x;
  return jackpotPay(machine, value.tier, meters);
}

export function jackpotPay(machine: MachineDef, tier: JackpotTier, meters: JackpotMeters): number {
  if (tier === 'major') return meters.major;
  if (tier === 'grand') return meters.grand;
  return machine.jackpots[tier];
}

/**
 * Hold & spin: the coins that started it stay put and every other cell
 * respins. Each coin that lands sticks and sets the respins back to the full
 * count; the feature ends when they run out or the screen fills, which wins
 * the Grand on top of every coin.
 */
export function playHoldSpin(machine: MachineDef, start: HeldCoin[], rng: Rng, meters: JackpotMeters): HoldSpinResult {
  const rules = machine.holdSpin;
  const cells = machine.reels.length * machine.rows;
  const held = new Map(start.map((c) => [c.cell, c.value]));
  const respins: HoldSpinRespin[] = [];
  let left = rules.respins;
  while (left > 0 && held.size < cells) {
    const landed: HeldCoin[] = [];
    for (let cell = 0; cell < cells; cell++) {
      if (held.has(cell)) continue;
      if (rng.next() < rules.land) landed.push({ cell, value: drawCoin(machine, rng) });
    }
    for (const c of landed) held.set(c.cell, c.value);
    left = landed.length ? rules.respins : left - 1;
    respins.push({ landed, left });
  }
  const coins = [...held.entries()].sort(([a], [b]) => a - b).map(([cell, value]) => ({ cell, value }));
  const full = coins.length === cells;
  const jackpots: JackpotTier[] = coins.flatMap((c) => (c.value.kind === 'jackpot' ? [c.value.tier] : []));
  if (full) jackpots.push('grand');
  const pay = coins.reduce((sum, c) => sum + coinPay(machine, c.value, meters), 0) + (full ? meters.grand : 0);
  return { start, respins, coins, full, pay, jackpots };
}

/**
 * One spin: the reels stop, the ways pay, and six coins or more start hold &
 * spin. Coins pay only in the feature. Seeded, so any spin replays exactly.
 */
export function spinSlot(input: SlotSpinInput): SlotSpinResult {
  const { machine } = input;
  const meters = input.meters ?? { major: machine.jackpots.major, grand: machine.jackpots.grand };
  const rng = new Rng(input.seed.run, 'slot', machine.id, input.seed.round);
  const coinRng = new Rng(input.seed.run, 'slot-coins', machine.id, input.seed.round);
  const coin = coinSymbol(machine);

  let stops: number[];
  let grid: string[][];
  for (;;) {
    stops = machine.reels.map((strip) => rng.int(strip.length));
    grid = machine.reels.map((strip, r) => windowAt(strip, stops[r]!, machine.rows));
    if (!input.forceFeature || coinCount(machine, grid) >= machine.holdSpin.trigger) break;
  }

  const coins: HeldCoin[] = [];
  grid.forEach((reel, r) =>
    reel.forEach((s, row) => {
      if (s === coin) coins.push({ cell: r * machine.rows + row, value: drawCoin(machine, coinRng) });
    }),
  );
  const wins = waysWins(machine, grid, input.waysScale ?? 1);
  const waysPay = wins.reduce((sum, w) => sum + w.pay, 0);
  const feature = coins.length >= machine.holdSpin.trigger ? playHoldSpin(machine, coins, coinRng, meters) : null;
  return { stops, grid, coins, wins, waysPay, feature, pay: waysPay + (feature?.pay ?? 0) };
}
