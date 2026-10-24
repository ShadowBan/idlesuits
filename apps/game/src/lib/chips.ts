import { Decimal } from './money';

/**
 * Casino chips for any amount. Denominations follow the real ladder — 1, 5,
 * 25, 100, 500 — and repeat a thousand times larger each tier (1K, 5K, 25K,
 * 100K, 500K, 1M…), so a bankroll that grows without limit always has chips
 * that suit it. A chip is identified by its index on that ladder.
 */

const BASE = [1, 5, 25, 100, 500];

export function chipValue(index: number): Decimal {
  const tier = Math.floor(index / BASE.length);
  return new Decimal(BASE[index % BASE.length]!).mul(Decimal.pow(1000, tier));
}

/** The largest chip index whose value is at most `amount`, or -1. */
export function chipIndexAtMost(amount: Decimal): number {
  if (amount.lt(1)) return -1;
  const tier = Math.max(0, Math.floor(amount.log10().toNumber() / 3));
  for (let i = (tier + 1) * BASE.length - 1; i >= 0; i--) {
    if (chipValue(i).lte(amount)) return i;
  }
  return 0;
}

export interface ChipLook {
  /** Face colour. */
  base: string;
  /** Edge spots and inner ring. */
  edge: string;
  /** Text. */
  ink: string;
  /** A metallic ring on higher tiers, so a 1K never looks like a $1. */
  rim: string | null;
}

const LOOKS: Omit<ChipLook, 'rim'>[] = [
  { base: '#f2efe8', edge: '#2f6fd1', ink: '#1d2b4f' }, // 1: white
  { base: '#c42332', edge: '#f6efe2', ink: '#fff7ef' }, // 5: red
  { base: '#1e8a4f', edge: '#f6efe2', ink: '#f4fff8' }, // 25: green
  { base: '#1b1b21', edge: '#f2efe8', ink: '#f2efe8' }, // 100: black
  { base: '#6c3fa8', edge: '#f2d9ff', ink: '#fbf4ff' }, // 500: purple
];
const RIMS = [null, '#e8b64c', '#cfd6df', '#7fe0ff', '#ff8fd1'];

export function chipLook(index: number): ChipLook {
  const tier = Math.floor(index / BASE.length);
  return { ...LOOKS[index % BASE.length]!, rim: RIMS[Math.min(tier, RIMS.length - 1)] ?? null };
}

const TIER_SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** "5", "25", "1K", "500M", or "1e39" past the named tiers. */
export function chipLabel(index: number): string {
  const tier = Math.floor(index / BASE.length);
  const face = BASE[index % BASE.length]!;
  if (tier < TIER_SUFFIX.length) return `${face}${TIER_SUFFIX[tier]}`;
  return `${face}e${tier * 3}`;
}

/** Five chips for the rack, topping out around a tenth of the bankroll. */
export function rackFor(bank: Decimal, count = 5): number[] {
  const top = Math.max(count - 1, chipIndexAtMost(bank.div(10).max(1)));
  return Array.from({ length: count }, (_, i) => top - (count - 1) + i);
}

/**
 * The chips that make up an amount, largest first, as a dealer would stack
 * them. Capped so a stack stays readable; the label carries the exact total.
 */
export function chipsFor(amount: Decimal, max = 9): number[] {
  const chips: number[] = [];
  let left = amount;
  while (left.gte(1) && chips.length < max) {
    const i = chipIndexAtMost(left);
    chips.push(i);
    left = left.sub(chipValue(i));
  }
  // Fractions (a 3:2 blackjack on $5) or a capped stack: show one more chip so nothing reads short.
  if (left.gt(0) && chips.length === 0) chips.push(0);
  return chips;
}
