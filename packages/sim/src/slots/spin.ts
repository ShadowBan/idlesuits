import { Rng, type Seed } from '../rng';
import type {
  SlotBonusResult,
  CoinValue,
  Collect,
  CollectBonus,
  FreeSpin,
  FreeSpinsResult,
  HeldCoin,
  HoldSpinRespin,
  HoldSpinResult,
  JackpotMeters,
  JackpotTier,
  MachineDef,
  PickBoard,
  PickBonus,
  PickResult,
  PotPower,
  SlotSpinResult,
  UpgradeBonus,
  WayWin,
  Weighted,
  WheelBonus,
  WheelResult,
  WheelRound,
  WheelWedge,
} from './types';
import { JACKPOT_TIERS, powerOf } from './types';

export interface SlotSpinInput {
  machine: MachineDef;
  seed: { run: Seed; round: number };
  /** × every way-pay, base game and free spins, to set the machine's payback (see `waysScaleFor`). */
  waysScale?: number;
  /** The progressive jackpots as they stand; the machine's seeds if not given. */
  meters?: JackpotMeters;
  /** Spins the reels again until the feature lands, for testing. */
  forceFeature?: boolean;
  /** Each pot's gems as the spin starts; empty if not given. */
  pots?: readonly number[];
}

/**
 * Which pot's gem, if any, each carrier (a cell holding what starts the
 * bonus) carries: one draw a carrier, from its own stream so the rest of the
 * spin plays out the same with or without pots.
 */
export function gemsOn(machine: MachineDef, cells: readonly number[], rng: Rng): { cell: number; pot: number }[] {
  const pots = machine.pots ?? [];
  if (!pots.length) return [];
  const gems: { cell: number; pot: number }[] = [];
  for (const cell of cells) {
    let pick = rng.next();
    for (const [pot, def] of pots.entries()) {
      pick -= def.chance;
      if (pick < 0) {
        gems.push({ cell, pot });
        break;
      }
    }
  }
  return gems;
}

/** The cells holding `id`, in cell order. */
export function cellsOf(machine: MachineDef, grid: readonly (readonly string[])[], id: string): number[] {
  return grid.flatMap((reel, r) => reel.flatMap((s, row) => (s === id ? [r * machine.rows + row] : [])));
}

/** The symbols in one reel's window, top to bottom, with the reel stopped at `stop`. */
export function windowAt(strip: readonly string[], stop: number, rows: number): string[] {
  return Array.from({ length: rows }, (_, row) => strip[(stop + row) % strip.length]!);
}

/** The id of the first symbol of a kind, if the machine has one. */
export function symbolOf(machine: MachineDef, kind: MachineDef['symbols'][number]['kind']): string | undefined {
  return machine.symbols.find((s) => s.kind === kind)?.id;
}

export function countOf(grid: readonly (readonly string[])[], id: string | undefined): number {
  if (!id) return 0;
  return grid.reduce((n, reel) => n + reel.filter((s) => s === id).length, 0);
}

export function coinCount(machine: MachineDef, grid: readonly (readonly string[])[]): number {
  return countOf(grid, symbolOf(machine, 'coin'));
}

/** What starts the bonus: coins for hold & spin, the scatter for the rest. */
export function triggerSymbol(machine: MachineDef): string {
  return machine.bonus.kind === 'holdSpin' ? symbolOf(machine, 'coin')! : machine.bonus.scatter;
}

export function triggers(machine: MachineDef, grid: readonly (readonly string[])[]): boolean {
  return countOf(grid, triggerSymbol(machine)) >= machine.bonus.trigger;
}

/**
 * The 243-ways pays on a screen: each pay symbol (or a wild in its place) on
 * reels in a row from the left, at least three, paid once for every way
 * through them. Wilds pay nothing of their own; with a multiplier `wildX`,
 * every way through a wild counts that many times over, so two wilds on one
 * way multiply together.
 */
export function waysWins(machine: MachineDef, grid: readonly (readonly string[])[], scale = 1, wildX = 1): WayWin[] {
  const wild = symbolOf(machine, 'wild');
  const wins: WayWin[] = [];
  for (const symbol of machine.symbols) {
    if (symbol.kind !== 'pay' || !symbol.pays) continue;
    const cells: [number, number][] = [];
    let ways = 1;
    let reels = 0;
    for (let r = 0; r < grid.length; r++) {
      const hits = grid[r]!.flatMap((s, row) => (s === symbol.id || s === wild ? [row] : []));
      if (!hits.length) break;
      ways *= hits.reduce((sum, row) => sum + (grid[r]![row] === wild ? wildX : 1), 0);
      reels++;
      for (const row of hits) cells.push([r, row]);
    }
    if (reels < 3) continue;
    wins.push({ symbol: symbol.id, reels, ways, pay: ways * symbol.pays[reels - 3]! * scale, cells });
  }
  return wins;
}

export function drawWeighted<T>(values: readonly Weighted<T>[], rng: Rng): T {
  const total = values.reduce((sum, v) => sum + v.weight, 0);
  let pick = rng.next() * total;
  for (const v of values) {
    pick -= v.weight;
    if (pick < 0) return v.value;
  }
  return values[values.length - 1]!.value;
}

function drawCoin(machine: MachineDef, rng: Rng): CoinValue {
  return drawWeighted(machine.coinValues!, rng);
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

/** Every coin on a screen, with a value drawn for each, in cell order. */
function coinsOn(machine: MachineDef, grid: readonly (readonly string[])[], rng: Rng): HeldCoin[] {
  const coin = symbolOf(machine, 'coin');
  const coins: HeldCoin[] = [];
  if (!coin) return coins;
  grid.forEach((reel, r) =>
    reel.forEach((s, row) => {
      if (s === coin) coins.push({ cell: r * machine.rows + row, value: drawCoin(machine, rng) });
    }),
  );
  return coins;
}

/** Every collector on the screen takes every coin: cash × the multiplier, and jackpots as they are. */
function collectAll(machine: MachineDef, grid: readonly (readonly string[])[], coins: readonly HeldCoin[], mult: number, meters: JackpotMeters): Collect[] {
  const collector = symbolOf(machine, 'collector');
  if (!collector || !coins.length) return [];
  const cash = coins.reduce((sum, c) => sum + (c.value.kind === 'cash' ? c.value.x : 0), 0);
  const jackpots = coins.flatMap((c) => (c.value.kind === 'jackpot' ? [c.value.tier] : []));
  const jackpotSum = jackpots.reduce((sum, t) => sum + jackpotPay(machine, t, meters), 0);
  const collects: Collect[] = [];
  grid.forEach((reel, r) =>
    reel.forEach((s, row) => {
      if (s === collector) collects.push({ cell: r * machine.rows + row, pay: cash * mult + jackpotSum, jackpots: [...jackpots] });
    }),
  );
  return collects;
}

/**
 * Hold & spin: the coins that started it stay put and every other cell
 * respins. Each coin that lands sticks and sets the respins back to the full
 * count; the feature ends when they run out or the screen fills, which wins
 * the Grand on top of every coin. Full pots add their powers: a boost on every
 * coin after each respin, more respins, or a collector at the end.
 */
export function playHoldSpin(machine: MachineDef, start: HeldCoin[], rng: Rng, meters: JackpotMeters, powers: readonly PotPower[] = []): HoldSpinResult {
  if (machine.bonus.kind !== 'holdSpin') throw new Error(`${machine.id} has no hold & spin`);
  const rules = machine.bonus;
  const boost = powers.find((p) => p.kind === 'boost');
  const extra = powers.find((p) => p.kind === 'extra');
  const collector = powers.some((p) => p.kind === 'collect');
  const full = extra?.respins ?? rules.respins;
  const cells = machine.reels.length * machine.rows;
  const held = new Map(start.map((c) => [c.cell, c.value]));
  const boosted: Record<number, number> = {};
  const respins: HoldSpinRespin[] = [];
  let left = full;
  while (left > 0 && held.size < cells) {
    const landed: HeldCoin[] = [];
    for (let cell = 0; cell < cells; cell++) {
      if (held.has(cell)) continue;
      if (rng.next() < rules.land) landed.push({ cell, value: drawCoin(machine, rng) });
    }
    for (const c of landed) held.set(c.cell, c.value);
    left = landed.length ? full : left - 1;
    const add = boost ? drawWeighted(boost.values, rng) : 0;
    if (add) for (const cell of held.keys()) boosted[cell] = (boosted[cell] ?? 0) + add;
    respins.push({ landed, left, boost: add });
  }
  const coins = [...held.entries()].sort(([a], [b]) => a - b).map(([cell, value]) => ({ cell, value }));
  const isFull = coins.length === cells;
  const jackpots: JackpotTier[] = coins.flatMap((c) => (c.value.kind === 'jackpot' ? [c.value.tier] : []));
  if (isFull) jackpots.push('grand');
  const boostSum = Object.values(boosted).reduce((a, b) => a + b, 0);
  const cash = coins.reduce((sum, c) => sum + (c.value.kind === 'cash' ? c.value.x : 0), 0) + boostSum;
  const collected = collector ? cash : 0;
  const pay = coins.reduce((sum, c) => sum + coinPay(machine, c.value, meters), 0) + boostSum + collected + (isFull ? meters.grand : 0);
  return { kind: 'holdSpin', start, respins, coins, full: isFull, powers: powers.map((p) => p.kind), boosted, collected, pay, jackpots };
}

/** The level a meter reading stands at. */
export function levelAt(bonus: UpgradeBonus | CollectBonus, meter: number): number {
  return Math.min(Math.floor(meter / bonus.perLevel), bonus.maxLevel);
}

/** How every symbol shows at an upgrade level: each tier moves up that many, capped at the top. */
export function upgradeMap(bonus: UpgradeBonus, level: number): Record<string, string> {
  const n = bonus.tiers.length;
  return Object.fromEntries(bonus.tiers.map((id, i) => [id, bonus.tiers[Math.min(i + level, n - 1)]!]));
}

/** A screen of nothing but the top tier and wilds. */
export function isFullTop(machine: MachineDef, bonus: UpgradeBonus, grid: readonly (readonly string[])[]): boolean {
  const top = bonus.tiers[bonus.tiers.length - 1]!;
  const wild = symbolOf(machine, 'wild');
  return grid.every((reel) => reel.every((s) => s === top || s === wild));
}

/** Where free spins start, with the pots' powers: how many spins, and how full the meter. */
export function freeSpinsStart(bonus: UpgradeBonus | CollectBonus, powers: readonly PotPower[] = []): { spins: number; meter: number; level: number } {
  const levels = Math.min(powerOf(powers, 'level')?.levels ?? 0, bonus.maxLevel);
  return { spins: bonus.spins + (powerOf(powers, 'spins')?.add ?? 0), meter: levels * bonus.perLevel, level: levels };
}

/**
 * Free spins on the bonus reels. Hammers or collectors fill a meter; every
 * `perLevel` of them adds spins and a level from the next spin: symbols
 * upgrade a tier, or collected cash pays a bigger multiplier. Full pots can
 * start it more spins or levels up, fill the meter faster, multiply the wilds
 * or the doubloons' cash.
 */
export function playFreeSpins(
  machine: MachineDef,
  bonus: UpgradeBonus | CollectBonus,
  rng: Rng,
  meters: JackpotMeters,
  scale: number,
  powers: readonly PotPower[] = [],
): FreeSpinsResult {
  const mark = bonus.kind === 'upgrade' ? bonus.hammer : symbolOf(machine, 'collector')!;
  const cap = bonus.perLevel * bonus.maxLevel;
  const times = powerOf(powers, 'marks')?.times ?? 1;
  const wildX = powerOf(powers, 'wilds')?.x ?? 1;
  const cashX = powerOf(powers, 'cash')?.times ?? 1;
  const start = freeSpinsStart(bonus, powers);
  const spins: FreeSpin[] = [];
  const jackpots: JackpotTier[] = [];
  let left = start.spins;
  let meter = start.meter;
  let grandWon = false;
  let total = 0;
  while (left > 0) {
    left--;
    const level = levelAt(bonus, meter);
    const map = bonus.kind === 'upgrade' ? upgradeMap(bonus, level) : {};
    const grid = bonus.reels.map((strip) => windowAt(strip, rng.int(strip.length), machine.rows).map((s) => map[s] ?? s));
    const coins = coinsOn(machine, grid, rng).map((c) => (cashX !== 1 && c.value.kind === 'cash' ? { ...c, value: { kind: 'cash' as const, x: c.value.x * cashX } } : c));
    const wins = waysWins(machine, grid, scale, wildX);
    const waysPay = wins.reduce((sum, w) => sum + w.pay, 0);
    const collects = bonus.kind === 'collect' ? collectAll(machine, grid, coins, bonus.multipliers[level]!, meters) : [];
    const marks = grid.flatMap((reel, r) => reel.flatMap((s, row) => (s === mark ? [r * machine.rows + row] : [])));
    const grand = bonus.kind === 'upgrade' && !grandWon && isFullTop(machine, bonus, grid);
    if (grand) {
      grandWon = true;
      jackpots.push('grand');
    }
    const next = Math.min(meter + marks.length * times, cap);
    const levelUps = levelAt(bonus, next) - level;
    meter = next;
    left += levelUps * bonus.extraSpins;
    for (const c of collects) jackpots.push(...c.jackpots);
    const pay = waysPay + collects.reduce((sum, c) => sum + c.pay, 0) + (grand ? meters.grand : 0);
    total += pay;
    spins.push({ grid, coins, wins, waysPay, collects, marks, level, meter, levelUps, added: levelUps * bonus.extraSpins, left, grand, pay });
  }
  return { kind: 'freeSpins', powers: powers.map((p) => p.kind), start, spins, level: levelAt(bonus, meter), pay: total, jackpots };
}

export function wedgePay(machine: MachineDef, wedge: WheelBonus['wheels'][number][number], meters: JackpotMeters): number {
  if (wedge.kind === 'cash') return wedge.x;
  if (wedge.kind === 'jackpot') return jackpotPay(machine, wedge.tier, meters);
  return 0;
}

/** The wheels as the pots leave them: the outer wheel's smallest cash wedges turned to Up. */
export function wheelsFor(bonus: WheelBonus, powers: readonly PotPower[] = []): WheelWedge[][] {
  const wheels = bonus.wheels.map((w) => [...w]);
  const add = powerOf(powers, 'ups')?.add ?? 0;
  if (!add) return wheels;
  const outer = wheels[0]!;
  const smallest = outer
    .flatMap((w, i) => (w.kind === 'cash' ? [{ i, x: w.x }] : []))
    .sort((a, b) => a.x - b.x || a.i - b.i)
    .slice(0, add);
  for (const { i } of smallest) outer[i] = { kind: 'up' };
  return wheels;
}

/**
 * The wheel: it stops on any wedge as likely as another, and "up" moves to
 * the next wheel in. Full pots add Up wedges, a ring that multiplies the cash,
 * or an encore: a second play from the outer wheel.
 */
export function spinWheel(machine: MachineDef, bonus: WheelBonus, rng: Rng, meters: JackpotMeters, powers: readonly PotPower[] = []): WheelResult {
  const wheels = wheelsFor(bonus, powers);
  const ring = powerOf(powers, 'ring');
  const rounds: WheelRound[] = [];
  const jackpots: JackpotTier[] = [];
  const plays = powers.some((p) => p.kind === 'encore') ? 2 : 1;
  for (let play = 0; play < plays; play++) {
    const stops: WheelRound['stops'] = [];
    for (let wheel = 0; ; wheel++) {
      const wedges = wheels[wheel]!;
      const wedge = rng.int(wedges.length);
      stops.push({ wheel, wedge });
      const w = wedges[wedge]!;
      if (w.kind === 'up') continue;
      const x = ring ? drawWeighted(ring.values, rng) : 1;
      if (w.kind === 'jackpot') jackpots.push(w.tier);
      rounds.push({ stops, ring: x, pay: w.kind === 'cash' ? w.x * x : wedgePay(machine, w, meters) });
      break;
    }
  }
  return { kind: 'wheel', powers: powers.map((p) => p.kind), wheels, rounds, pay: rounds.reduce((sum, r) => sum + r.pay, 0), jackpots };
}

/** The jackpots on the pick's board, without any a pot drops. */
export function pickTiers(powers: readonly PotPower[] = []): JackpotTier[] {
  const drop = powerOf(powers, 'drop')?.tier;
  return JACKPOT_TIERS.filter((t) => t !== drop);
}

/** The jackpot a match pays: a tier up with the rise, as far as its top. */
export function risen(tier: JackpotTier, powers: readonly PotPower[] = []): JackpotTier {
  const rise = powerOf(powers, 'rise');
  if (!rise) return tier;
  const i = JACKPOT_TIERS.indexOf(tier);
  return i < JACKPOT_TIERS.indexOf(rise.top) ? JACKPOT_TIERS[i + 1]! : tier;
}

/**
 * Pick to match. The jackpot is drawn by weight; then the picks are laid out
 * the way a real machine does it: two of that jackpot and up to two of each
 * other, shuffled, then the third of it. Full pots can drop a jackpot from the
 * board, raise the one matched a tier, or play a second board.
 */
export function playPick(machine: MachineDef, bonus: PickBonus, rng: Rng, meters: JackpotMeters, powers: readonly PotPower[] = []): PickResult {
  const tiers = pickTiers(powers);
  const boards: PickBoard[] = [];
  const plays = powers.some((p) => p.kind === 'twin') ? 2 : 1;
  for (let play = 0; play < plays; play++) {
    const tier = drawWeighted(
      tiers.map((t) => ({ value: t, weight: bonus.weights[t] })),
      rng,
    );
    const picks: JackpotTier[] = [tier, tier];
    for (const t of tiers) if (t !== tier) for (let n = rng.int(3); n > 0; n--) picks.push(t);
    for (let i = picks.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [picks[i], picks[j]] = [picks[j]!, picks[i]!];
    }
    picks.push(tier);
    boards.push({ picks, tier, won: risen(tier, powers) });
  }
  const jackpots = boards.map((b) => b.won);
  return { kind: 'pick', powers: powers.map((p) => p.kind), tiers, boards, pay: jackpots.reduce((sum, t) => sum + jackpotPay(machine, t, meters), 0), jackpots };
}

/** Plays whatever bonus the machine has, with the powers of any full pots. */
export function playBonus(machine: MachineDef, coins: HeldCoin[], rng: Rng, meters: JackpotMeters, scale: number, powers: readonly PotPower[] = []): SlotBonusResult {
  const bonus = machine.bonus;
  switch (bonus.kind) {
    case 'holdSpin':
      return playHoldSpin(machine, coins, rng, meters, powers);
    case 'upgrade':
    case 'collect':
      return playFreeSpins(machine, bonus, rng, meters, scale, powers);
    case 'wheel':
      return spinWheel(machine, bonus, rng, meters, powers);
    case 'pick':
      return playPick(machine, bonus, rng, meters, powers);
  }
}

/**
 * One spin: the reels stop, the ways pay, any collectors take the coins, and
 * enough coins or scatters start the bonus. Seeded, so any spin replays exactly.
 */
export function spinSlot(input: SlotSpinInput): SlotSpinResult {
  const { machine } = input;
  const meters = input.meters ?? { major: machine.jackpots.major, grand: machine.jackpots.grand };
  const scale = input.waysScale ?? 1;
  const rng = new Rng(input.seed.run, 'slot', machine.id, input.seed.round);
  const coinRng = new Rng(input.seed.run, 'slot-coins', machine.id, input.seed.round);

  let stops: number[];
  let grid: string[][];
  for (;;) {
    stops = machine.reels.map((strip) => rng.int(strip.length));
    grid = machine.reels.map((strip, r) => windowAt(strip, stops[r]!, machine.rows));
    if (!input.forceFeature || triggers(machine, grid)) break;
  }

  const coins = machine.coinValues ? coinsOn(machine, grid, coinRng) : [];
  const wins = waysWins(machine, grid, scale);
  const waysPay = wins.reduce((sum, w) => sum + w.pay, 0);
  const collects = collectAll(machine, grid, coins, 1, meters);
  const collectPay = collects.reduce((sum, c) => sum + c.pay, 0);

  // Gems on whatever starts the bonus fill the pots; the bonus takes the power of every full one, and empties it.
  const potDefs = machine.pots ?? [];
  const carriers = potDefs.length ? cellsOf(machine, grid, triggerSymbol(machine)) : [];
  const gems = gemsOn(machine, carriers, new Rng(input.seed.run, 'slot-gems', machine.id, input.seed.round));
  const filled = potDefs.map((def, i) => Math.min(def.size, Math.max(0, Math.floor(input.pots?.[i] ?? 0)) + gems.filter((g) => g.pot === i).length));
  const starts = triggers(machine, grid);
  const lit = starts ? potDefs.flatMap((def, i) => (filled[i]! >= def.size ? [i] : [])) : [];
  const pots = filled.map((n, i) => (lit.includes(i) ? 0 : n));

  const feature = starts ? playBonus(machine, coins, coinRng, meters, scale, lit.map((i) => potDefs[i]!.power)) : null;
  return { stops, grid, coins, wins, waysPay, collects, collectPay, feature, pay: waysPay + collectPay + (feature?.pay ?? 0), gems, filled, lit, pots };
}
