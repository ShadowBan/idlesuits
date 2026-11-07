import { Rng } from '../rng';
import type { CoinValue, MachineDef, PotDef, SlotSymbol, Weighted } from './types';

/**
 * A reel strip from how many of each symbol it holds, in a fixed shuffled
 * order: the same strip every time, as a machine's reels are set at the
 * factory. `blocks` go in whole, spaced evenly round the strip, so how often
 * they line up is set by design rather than by the shuffle.
 */
export function buildStripBlocks(counts: Readonly<Record<string, number>>, seed: string, blocks: readonly (readonly string[])[] = []): string[] {
  const filler = Object.entries(counts).flatMap(([id, n]) => Array<string>(n).fill(id));
  const rng = new Rng('strip', seed);
  for (let i = filler.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [filler[i], filler[j]] = [filler[j]!, filler[i]!];
  }
  if (!blocks.length) return filler;
  const strip: string[] = [];
  let used = 0;
  blocks.forEach((block, i) => {
    strip.push(...block);
    const end = Math.round((filler.length * (i + 1)) / blocks.length);
    strip.push(...filler.slice(used, end));
    used = end;
  });
  return strip;
}

/** A strip with stacks of coins (`coins`, each a stack's height) spaced evenly round it. */
export function buildStrip(counts: Readonly<Record<string, number>>, seed: string, coins: readonly number[] = [], coin = 'coin'): string[] {
  return buildStripBlocks(
    counts,
    seed,
    coins.map((height) => Array<string>(height).fill(coin)),
  );
}

/** `n` single `id`s for `buildStripBlocks`, spaced evenly round the strip so no window holds two. */
function spaced(id: string, n: number): string[][] {
  return Array.from({ length: n }, () => [id]);
}

const ROYALS: SlotSymbol[] = [
  { id: 'A', name: 'Ace', kind: 'pay', pays: [0.3, 0.6, 2.4] },
  { id: 'K', name: 'King', kind: 'pay', pays: [0.15, 0.45, 1.8] },
  { id: 'Q', name: 'Queen', kind: 'pay', pays: [0.15, 0.45, 1.8] },
  { id: 'J', name: 'Jack', kind: 'pay', pays: [0.15, 0.3, 1.5] },
  { id: '10', name: 'Ten', kind: 'pay', pays: [0.15, 0.3, 1.5] },
];
const WILD: SlotSymbol = { id: 'wild', name: 'Wild', kind: 'wild' };

/** Symbols paying `f` times as much, to the cent: the pots take a share of the payback from the line pays. */
function lighter(symbols: readonly SlotSymbol[], f: number): SlotSymbol[] {
  return symbols.map((s) =>
    s.pays
      ? {
          ...s,
          pays: s.pays.map((x) => Math.round(x * f * 100) / 100) as [number, number, number],
        }
      : s,
  );
}

/** The vault's pots take a share of the payback, so its line pays are a fifth lighter. */
const VAULT_SYMBOLS: SlotSymbol[] = [
  { id: 'bar', name: 'Gold bar', kind: 'pay', pays: [1.2, 3.6, 12] },
  { id: 'gem', name: 'Diamond', kind: 'pay', pays: [0.75, 2.4, 7.5] },
  { id: 'bag', name: 'Money bag', kind: 'pay', pays: [0.5, 1.5, 5] },
  { id: 'key', name: 'Vault key', kind: 'pay', pays: [0.35, 1.2, 3.6] },
  ...lighter(ROYALS, 0.8),
  WILD,
  { id: 'coin', name: 'Gold coin', kind: 'coin' },
];

const LOW = { A: 6, K: 6, Q: 7, J: 7, '10': 7 };
/** How much of their old line pays each machine keeps, to make room for its pots. */
const FORGE_PAYS = 0.85;
const HAUL_PAYS = 0.85;
const CARNIVAL_PAYS = 0.88;
const LANTERN_PAYS = 0.77;
const HIGH = { bar: 2, gem: 3, bag: 3, key: 4 };
/** Coin stacks on every reel: a single and two doubles. */
const COINS = [1, 2, 2];

const VAULT_COINS: Weighted<CoinValue>[] = [
  { value: { kind: 'cash', x: 1 }, weight: 36 },
  { value: { kind: 'cash', x: 2 }, weight: 27 },
  { value: { kind: 'cash', x: 3 }, weight: 15 },
  { value: { kind: 'cash', x: 5 }, weight: 12 },
  { value: { kind: 'cash', x: 8 }, weight: 7 },
  { value: { kind: 'cash', x: 10 }, weight: 5 },
  { value: { kind: 'cash', x: 15 }, weight: 3 },
  { value: { kind: 'cash', x: 25 }, weight: 1.5 },
  { value: { kind: 'jackpot', tier: 'mini' }, weight: 2 },
  { value: { kind: 'jackpot', tier: 'minor' }, weight: 0.8 },
  { value: { kind: 'jackpot', tier: 'major' }, weight: 0.08 },
];

/** Every machine's fixed jackpots and the progressives' seeds, in total bets: the same on the whole floor. */
const JACKPOTS = { mini: 10, minor: 30, major: 250, grand: 2000 };

/**
 * The vault's three pots, each filled by gems on the coins. A full pot joins
 * the next hold & spin, and any can join at once: all three is the Super.
 */
const VAULT_POTS: PotDef[] = [
  {
    id: 'boost',
    name: 'Boost',
    size: 8,
    chance: 0.04,
    power: {
      kind: 'boost',
      values: [
        { value: 0.1, weight: 45 },
        { value: 0.2, weight: 30 },
        { value: 0.5, weight: 18 },
        { value: 1, weight: 6 },
        { value: 2, weight: 1 },
      ],
    },
  },
  {
    id: 'extra',
    name: 'Extra',
    size: 12,
    chance: 0.025,
    power: { kind: 'extra', respins: 4 },
  },
  {
    id: 'collect',
    name: 'Collector',
    size: 16,
    chance: 0.018,
    power: { kind: 'collect' },
  },
];

/**
 * Midnight Vault: a bank vault after hours. Gold coins carry cash or a
 * jackpot; six or more start hold & spin, and filling the screen cracks the
 * Grand.
 */
export const MIDNIGHT_VAULT: MachineDef = {
  id: 'vault',
  name: 'Midnight Vault',
  rows: 3,
  reels: [
    buildStrip({ ...LOW, ...HIGH }, 'vault-1', COINS),
    buildStrip({ ...LOW, ...HIGH, wild: 3 }, 'vault-2', COINS),
    buildStrip({ ...LOW, ...HIGH, wild: 3 }, 'vault-3', COINS),
    buildStrip({ ...LOW, ...HIGH, wild: 3 }, 'vault-4', COINS),
    buildStrip({ ...LOW, ...HIGH }, 'vault-5', COINS),
  ],
  symbols: VAULT_SYMBOLS,
  coinValues: VAULT_COINS,
  bonus: { kind: 'holdSpin', trigger: 6, respins: 3, land: 0.06 },
  jackpots: JACKPOTS,
  awards: ['mini', 'minor', 'major', 'grand'],
  pots: VAULT_POTS,
};

/*
 * Lucky Forge: a blacksmith's forge. Three anvils start free spins on reels
 * rich in metal; every few hammers strike the forge and every metal moves up
 * a tier, bronze to silver to gold to crown, with extra spins each time. A
 * screen of nothing but crowns and wilds wins the Grand.
 *
 * Embers on the anvils heat three pots. The Bellows starts the forge a tier
 * up; the Heavy Hammer strikes twice for every hammer; the Golden Anvil makes
 * every wild 2×. Together, the Super Forge, they make a screen of crowns a
 * real chance.
 */
const FORGE_TIERS = ['bronze', 'silver', 'gold', 'crown'] as const;
const FORGE_SYMBOLS: SlotSymbol[] = [
  ...lighter(
    [
      { id: 'crown', name: 'Ruby crown', kind: 'pay', pays: [1.5, 4, 12] },
      { id: 'gold', name: 'Gold horseshoe', kind: 'pay', pays: [0.8, 2.4, 8] },
      {
        id: 'silver',
        name: 'Silver horseshoe',
        kind: 'pay',
        pays: [0.5, 1.5, 5],
      },
      {
        id: 'bronze',
        name: 'Bronze horseshoe',
        kind: 'pay',
        pays: [0.3, 1, 3],
      },
      ...ROYALS,
    ],
    FORGE_PAYS,
  ),
  WILD,
  { id: 'anvil', name: 'Anvil', kind: 'scatter' },
  { id: 'hammer', name: 'Hammer', kind: 'hammer' },
];
const FORGE_LOW = { A: 6, K: 6, Q: 7, J: 7, '10': 7 };
const FORGE_POTS: PotDef[] = [
  { id: 'anvil', name: 'Golden Anvil', size: 6, chance: 0.075, power: { kind: 'wilds', x: 2 } },
  { id: 'coal', name: 'Coal Cart', size: 10, chance: 0.035, power: { kind: 'spins', add: 3 } },
  { id: 'bellows', name: 'Bellows', size: 14, chance: 0.016, power: { kind: 'level', levels: 1 } },
];
const FORGE_METAL = { crown: 2, gold: 3, silver: 4, bronze: 5 };
const FORGE_BONUS_LOW = { A: 4, K: 4, Q: 4, J: 4, '10': 4 };
const FORGE_BONUS_METAL = { crown: 1, gold: 2, silver: 2, bronze: 2 };
/** In free spins, a run of metal on every reel: once upgraded it can all turn crown. */
const METAL_RUN = [['bronze', 'silver', 'bronze', 'gold', 'bronze', 'silver'], ['hammer'], ['silver', 'bronze', 'bronze']];

export const LUCKY_FORGE: MachineDef = {
  id: 'forge',
  name: 'Lucky Forge',
  rows: 3,
  reels: [
    buildStripBlocks({ ...FORGE_LOW, ...FORGE_METAL }, 'forge-1', spaced('anvil', 1)),
    buildStripBlocks({ ...FORGE_LOW, ...FORGE_METAL, wild: 3 }, 'forge-2', spaced('anvil', 2)),
    buildStripBlocks({ ...FORGE_LOW, ...FORGE_METAL, wild: 3 }, 'forge-3', spaced('anvil', 2)),
    buildStripBlocks({ ...FORGE_LOW, ...FORGE_METAL, wild: 3 }, 'forge-4', spaced('anvil', 2)),
    buildStripBlocks({ ...FORGE_LOW, ...FORGE_METAL }, 'forge-5', spaced('anvil', 1)),
  ],
  symbols: FORGE_SYMBOLS,
  bonus: {
    kind: 'upgrade',
    scatter: 'anvil',
    trigger: 3,
    spins: 10,
    reels: [
      buildStripBlocks({ ...FORGE_BONUS_LOW, ...FORGE_BONUS_METAL }, 'forge-fs-1', METAL_RUN),
      buildStripBlocks({ ...FORGE_BONUS_LOW, ...FORGE_BONUS_METAL, wild: 2 }, 'forge-fs-2', METAL_RUN),
      buildStripBlocks({ ...FORGE_BONUS_LOW, ...FORGE_BONUS_METAL, wild: 2 }, 'forge-fs-3', METAL_RUN),
      buildStripBlocks({ ...FORGE_BONUS_LOW, ...FORGE_BONUS_METAL, wild: 2 }, 'forge-fs-4', METAL_RUN),
      buildStripBlocks({ ...FORGE_BONUS_LOW, ...FORGE_BONUS_METAL }, 'forge-fs-5', METAL_RUN),
    ],
    hammer: 'hammer',
    tiers: FORGE_TIERS,
    perLevel: 3,
    maxLevel: 3,
    extraSpins: 2,
  },
  jackpots: JACKPOTS,
  awards: ['major', 'grand'],
  pots: FORGE_POTS,
};

/*
 * Pirate's Haul: doubloons land with cash or a jackpot on them, and the
 * captain takes every one on the screen. On the base game the captain only
 * sails reel 5; in free spins he's on reels 2 to 5, and every fifth captain
 * adds ten spins and raises the cash multiplier, 2×, 3× and then 10×.
 *
 * Gems on the maps fill three pots. The Powder Keg adds five free spins;
 * Loaded Cannons double every doubloon's cash; the Jolly Roger starts the
 * captains at 2×. All three is the Super Haul.
 */
const HAUL_SYMBOLS: SlotSymbol[] = [
  ...lighter(
    [
      { id: 'ship', name: 'Galleon', kind: 'pay', pays: [1.5, 4.5, 15] },
      { id: 'parrot', name: 'Parrot', kind: 'pay', pays: [0.9, 3, 9] },
      { id: 'chest', name: 'Treasure chest', kind: 'pay', pays: [0.6, 1.8, 6] },
      { id: 'compass', name: 'Compass', kind: 'pay', pays: [0.45, 1.5, 4.5] },
      ...ROYALS,
    ],
    HAUL_PAYS,
  ),
  WILD,
  { id: 'doubloon', name: 'Doubloon', kind: 'coin' },
  { id: 'captain', name: 'Captain', kind: 'collector' },
  { id: 'map', name: 'Treasure map', kind: 'scatter' },
];
const HAUL_HIGH = { ship: 2, parrot: 3, chest: 3, compass: 4 };
const HAUL_COINS: Weighted<CoinValue>[] = [
  { value: { kind: 'cash', x: 0.5 }, weight: 30 },
  { value: { kind: 'cash', x: 1 }, weight: 30 },
  { value: { kind: 'cash', x: 2 }, weight: 18 },
  { value: { kind: 'cash', x: 3 }, weight: 10 },
  { value: { kind: 'cash', x: 5 }, weight: 6 },
  { value: { kind: 'cash', x: 10 }, weight: 3 },
  { value: { kind: 'cash', x: 25 }, weight: 1 },
  { value: { kind: 'jackpot', tier: 'mini' }, weight: 1 },
  { value: { kind: 'jackpot', tier: 'minor' }, weight: 0.3 },
  { value: { kind: 'jackpot', tier: 'major' }, weight: 0.02 },
  { value: { kind: 'jackpot', tier: 'grand' }, weight: 0.002 },
];
const HAUL_BONUS_LOW = { A: 4, K: 4, Q: 4, J: 4, '10': 4 };
const HAUL_POTS: PotDef[] = [
  { id: 'roger', name: 'Jolly Roger', size: 6, chance: 0.08, power: { kind: 'level', levels: 1 } },
  { id: 'keg', name: 'Powder Keg', size: 10, chance: 0.04, power: { kind: 'spins', add: 3 } },
  { id: 'cannons', name: 'Loaded Cannons', size: 14, chance: 0.018, power: { kind: 'cash', times: 2 } },
];

export const PIRATES_HAUL: MachineDef = {
  id: 'haul',
  name: "Pirate's Haul",
  rows: 3,
  reels: [
    buildStripBlocks({ ...LOW, ...HAUL_HIGH, doubloon: 3 }, 'haul-1', spaced('map', 1)),
    buildStripBlocks({ ...LOW, ...HAUL_HIGH, doubloon: 3, wild: 3 }, 'haul-2', spaced('map', 2)),
    buildStripBlocks({ ...LOW, ...HAUL_HIGH, doubloon: 3, wild: 3 }, 'haul-3', spaced('map', 1)),
    buildStripBlocks({ ...LOW, ...HAUL_HIGH, doubloon: 3, wild: 3 }, 'haul-4', spaced('map', 2)),
    buildStripBlocks({ ...LOW, ...HAUL_HIGH }, 'haul-5', [['map'], ['captain'], ['map']]),
  ],
  symbols: HAUL_SYMBOLS,
  coinValues: HAUL_COINS,
  bonus: {
    kind: 'collect',
    scatter: 'map',
    trigger: 3,
    spins: 10,
    reels: [
      buildStripBlocks({ ...HAUL_BONUS_LOW, ...HAUL_HIGH, doubloon: 8 }, 'haul-fs-1'),
      buildStripBlocks({ ...HAUL_BONUS_LOW, ...HAUL_HIGH, doubloon: 8 }, 'haul-fs-2', spaced('captain', 1)),
      buildStripBlocks({ ...HAUL_BONUS_LOW, ...HAUL_HIGH, doubloon: 7 }, 'haul-fs-3', spaced('captain', 1)),
      buildStripBlocks({ ...HAUL_BONUS_LOW, ...HAUL_HIGH, doubloon: 6 }, 'haul-fs-4', spaced('captain', 1)),
      buildStripBlocks({ ...HAUL_BONUS_LOW, ...HAUL_HIGH, doubloon: 5 }, 'haul-fs-5', spaced('captain', 1)),
    ],
    perLevel: 5,
    maxLevel: 3,
    extraSpins: 10,
    multipliers: [1, 2, 3, 10],
  },
  jackpots: JACKPOTS,
  awards: ['mini', 'minor', 'major', 'grand'],
  pots: HAUL_POTS,
};

/*
 * Carnival Crown: a big top. Three wheel tickets on reels 2, 3 and 4 spin the
 * carnival wheel; an "Up" wedge climbs to the next wheel in, for bigger cash
 * and the jackpots, and the crown wheel at the middle holds the Grand.
 *
 * Gems on the tickets fill three pots. Lucky Ups turns the outer wheel's two
 * smallest wedges to Up; the Ringmaster spins a ring that multiplies the
 * cash; the Encore plays the wheel twice. All three is the Super Carnival.
 */
const CARNIVAL_SYMBOLS: SlotSymbol[] = [
  ...lighter(
    [
      { id: 'hat', name: 'Top hat', kind: 'pay', pays: [1.5, 4.5, 15] },
      { id: 'lion', name: 'Lion', kind: 'pay', pays: [0.9, 3, 9] },
      { id: 'balloon', name: 'Balloons', kind: 'pay', pays: [0.6, 1.8, 6] },
      { id: 'popcorn', name: 'Popcorn', kind: 'pay', pays: [0.45, 1.5, 4.5] },
      ...ROYALS,
    ],
    CARNIVAL_PAYS,
  ),
  WILD,
  { id: 'ticket', name: 'Wheel ticket', kind: 'scatter' },
];
const CARNIVAL_HIGH = { hat: 2, lion: 3, balloon: 3, popcorn: 4 };
const CARNIVAL_POTS: PotDef[] = [
  { id: 'ups', name: 'Lucky Ups', size: 6, chance: 0.075, power: { kind: 'ups', add: 2 } },
  {
    id: 'ring',
    name: 'Ringmaster',
    size: 10,
    chance: 0.033,
    power: {
      kind: 'ring',
      values: [
        { value: 1, weight: 40 },
        { value: 2, weight: 35 },
        { value: 3, weight: 18 },
        { value: 5, weight: 7 },
      ],
    },
  },
  { id: 'encore', name: 'Encore', size: 14, chance: 0.014, power: { kind: 'encore' } },
];

export const CARNIVAL_CROWN: MachineDef = {
  id: 'carnival',
  name: 'Carnival Crown',
  rows: 3,
  reels: [
    buildStripBlocks({ ...LOW, ...CARNIVAL_HIGH }, 'carnival-1'),
    buildStripBlocks({ ...LOW, ...CARNIVAL_HIGH, wild: 3 }, 'carnival-2', spaced('ticket', 3)),
    buildStripBlocks({ ...LOW, ...CARNIVAL_HIGH, wild: 3 }, 'carnival-3', spaced('ticket', 4)),
    buildStripBlocks({ ...LOW, ...CARNIVAL_HIGH, wild: 3 }, 'carnival-4', spaced('ticket', 3)),
    buildStripBlocks({ ...LOW, ...CARNIVAL_HIGH }, 'carnival-5'),
  ],
  symbols: CARNIVAL_SYMBOLS,
  bonus: {
    kind: 'wheel',
    scatter: 'ticket',
    trigger: 3,
    wheels: [
      [
        { kind: 'cash', x: 10 },
        { kind: 'cash', x: 25 },
        { kind: 'up' },
        { kind: 'cash', x: 12 },
        { kind: 'cash', x: 20 },
        { kind: 'jackpot', tier: 'mini' },
        { kind: 'cash', x: 8 },
        { kind: 'cash', x: 40 },
        { kind: 'cash', x: 15 },
        { kind: 'up' },
        { kind: 'cash', x: 10 },
        { kind: 'cash', x: 30 },
        { kind: 'jackpot', tier: 'mini' },
        { kind: 'cash', x: 15 },
        { kind: 'cash', x: 50 },
        { kind: 'cash', x: 20 },
      ],
      [
        { kind: 'cash', x: 50 },
        { kind: 'jackpot', tier: 'minor' },
        { kind: 'cash', x: 30 },
        { kind: 'up' },
        { kind: 'cash', x: 75 },
        { kind: 'cash', x: 25 },
        { kind: 'jackpot', tier: 'minor' },
        { kind: 'cash', x: 100 },
        { kind: 'cash', x: 40 },
        { kind: 'up' },
      ],
      [
        { kind: 'jackpot', tier: 'grand' },
        { kind: 'cash', x: 150 },
        { kind: 'jackpot', tier: 'major' },
        { kind: 'cash', x: 250 },
        { kind: 'cash', x: 200 },
        { kind: 'jackpot', tier: 'minor' },
        { kind: 'cash', x: 400 },
        { kind: 'jackpot', tier: 'major' },
        { kind: 'cash', x: 300 },
        { kind: 'cash', x: 500 },
      ],
    ],
  },
  jackpots: JACKPOTS,
  awards: ['mini', 'minor', 'major', 'grand'],
  pots: CARNIVAL_POTS,
};

/*
 * Paper Lanterns: a night festival. Three lanterns start the pick: twelve
 * lanterns hide three of each jackpot, and the first jackpot to show three
 * times pays.
 *
 * Gems on the lanterns fill three pots. The Moon clears the Mini off the
 * board; the Dragon plays a second board; the Phoenix raises the jackpot won
 * a tier, as far as the Major. All three, the Super pick, is a Major or better
 * twice over.
 */
const LANTERN_SYMBOLS: SlotSymbol[] = [
  ...lighter(
    [
      { id: 'koi', name: 'Koi', kind: 'pay', pays: [1.5, 4.5, 15] },
      { id: 'fan', name: 'Fan', kind: 'pay', pays: [0.9, 3, 9] },
      { id: 'kite', name: 'Kite', kind: 'pay', pays: [0.6, 1.8, 6] },
      { id: 'teapot', name: 'Teapot', kind: 'pay', pays: [0.45, 1.5, 4.5] },
      ...ROYALS,
    ],
    LANTERN_PAYS,
  ),
  WILD,
  { id: 'lantern', name: 'Lantern', kind: 'scatter' },
];
const LANTERN_HIGH = { koi: 2, fan: 3, kite: 3, teapot: 4 };
const LANTERN_POTS: PotDef[] = [
  { id: 'dragon', name: 'Dragon', size: 6, chance: 0.065, power: { kind: 'twin' } },
  { id: 'moon', name: 'Moon', size: 10, chance: 0.028, power: { kind: 'drop', tier: 'mini' } },
  { id: 'phoenix', name: 'Phoenix', size: 14, chance: 0.012, power: { kind: 'rise', top: 'major' } },
];

export const PAPER_LANTERNS: MachineDef = {
  id: 'lanterns',
  name: 'Paper Lanterns',
  rows: 3,
  reels: [
    buildStripBlocks({ ...LOW, ...LANTERN_HIGH }, 'lanterns-1', spaced('lantern', 1)),
    buildStripBlocks({ ...LOW, ...LANTERN_HIGH, wild: 3 }, 'lanterns-2', spaced('lantern', 2)),
    buildStripBlocks({ ...LOW, ...LANTERN_HIGH, wild: 3 }, 'lanterns-3', spaced('lantern', 2)),
    buildStripBlocks({ ...LOW, ...LANTERN_HIGH, wild: 3 }, 'lanterns-4', spaced('lantern', 2)),
    buildStripBlocks({ ...LOW, ...LANTERN_HIGH }, 'lanterns-5', spaced('lantern', 1)),
  ],
  symbols: LANTERN_SYMBOLS,
  bonus: {
    kind: 'pick',
    scatter: 'lantern',
    trigger: 3,
    per: 3,
    weights: { mini: 700, minor: 280, major: 25, grand: 2 },
  },
  jackpots: JACKPOTS,
  awards: ['mini', 'minor', 'major', 'grand'],
  pots: LANTERN_POTS,
};

/** Every machine on the slot floor. */
export const MACHINES: readonly MachineDef[] = [MIDNIGHT_VAULT, LUCKY_FORGE, PIRATES_HAUL, CARNIVAL_CROWN, PAPER_LANTERNS];
