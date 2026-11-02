import { Rng } from '../rng';
import type { MachineDef, SlotSymbol } from './types';

/**
 * A reel strip from how many of each symbol it holds, in a fixed shuffled
 * order: the same strip every time, as a machine's reels are set at the
 * factory. Coins go in as stacks (`coins`, each a stack's height), spaced
 * evenly round the strip, so how often they line up is set by design rather
 * than by the shuffle.
 */
export function buildStrip(counts: Readonly<Record<string, number>>, seed: string, coins: readonly number[] = [], coin = 'coin'): string[] {
  const filler = Object.entries(counts).flatMap(([id, n]) => Array<string>(n).fill(id));
  const rng = new Rng('strip', seed);
  for (let i = filler.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [filler[i], filler[j]] = [filler[j]!, filler[i]!];
  }
  if (!coins.length) return filler;
  const strip: string[] = [];
  let used = 0;
  coins.forEach((height, i) => {
    strip.push(...Array<string>(height).fill(coin));
    const end = Math.round((filler.length * (i + 1)) / coins.length);
    strip.push(...filler.slice(used, end));
    used = end;
  });
  return strip;
}

const VAULT_SYMBOLS: SlotSymbol[] = [
  { id: 'bar', name: 'Gold bar', kind: 'pay', pays: [1.5, 4.5, 15] },
  { id: 'gem', name: 'Diamond', kind: 'pay', pays: [0.9, 3, 9] },
  { id: 'bag', name: 'Money bag', kind: 'pay', pays: [0.6, 1.8, 6] },
  { id: 'key', name: 'Vault key', kind: 'pay', pays: [0.45, 1.5, 4.5] },
  { id: 'A', name: 'Ace', kind: 'pay', pays: [0.3, 0.6, 2.4] },
  { id: 'K', name: 'King', kind: 'pay', pays: [0.15, 0.45, 1.8] },
  { id: 'Q', name: 'Queen', kind: 'pay', pays: [0.15, 0.45, 1.8] },
  { id: 'J', name: 'Jack', kind: 'pay', pays: [0.15, 0.3, 1.5] },
  { id: '10', name: 'Ten', kind: 'pay', pays: [0.15, 0.3, 1.5] },
  { id: 'wild', name: 'Wild', kind: 'wild' },
  { id: 'coin', name: 'Gold coin', kind: 'coin' },
];

const LOW = { A: 6, K: 6, Q: 7, J: 7, '10': 7 };
const HIGH = { bar: 2, gem: 3, bag: 3, key: 4 };
/** Coin stacks on every reel: two singles and two doubles. */
const COINS = [1, 1, 2, 2];

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
  holdSpin: {
    trigger: 6,
    respins: 3,
    land: 0.06,
    values: [
      { value: { kind: 'cash', x: 1 }, weight: 30 },
      { value: { kind: 'cash', x: 2 }, weight: 25 },
      { value: { kind: 'cash', x: 3 }, weight: 15 },
      { value: { kind: 'cash', x: 5 }, weight: 12 },
      { value: { kind: 'cash', x: 8 }, weight: 7 },
      { value: { kind: 'cash', x: 10 }, weight: 5 },
      { value: { kind: 'cash', x: 15 }, weight: 3 },
      { value: { kind: 'cash', x: 25 }, weight: 1.5 },
      { value: { kind: 'jackpot', tier: 'mini' }, weight: 2 },
      { value: { kind: 'jackpot', tier: 'minor' }, weight: 0.8 },
      { value: { kind: 'jackpot', tier: 'major' }, weight: 0.08 },
    ],
  },
  jackpots: { mini: 10, minor: 30, major: 250, grand: 2000 },
};

/** Every machine on the slot floor. */
export const MACHINES: readonly MachineDef[] = [MIDNIGHT_VAULT];
