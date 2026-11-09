import Decimal from 'break_eternity.js';

export { Decimal };

/** A saved amount back as a Decimal: `fallback` for anything that isn't a finite amount of at least zero. */
export function amount(text: unknown, fallback: Decimal | number = 0): Decimal {
  try {
    if (typeof text !== 'string' && typeof text !== 'number') return new Decimal(fallback);
    const d = new Decimal(text);
    return d.isFinite() && !d.isNan() && d.gte(0) ? d : new Decimal(fallback);
  } catch {
    return new Decimal(fallback);
  }
}

/**
 * Casino chips for any amount. Denominations follow the real ladder (1, 5,
 * 25, 100, 500) and repeat a thousand times larger each tier, so a bankroll
 * that grows without limit always has chips that suit it. A chip is
 * identified by its index on that ladder.
 */
const CHIP_BASE = [1, 5, 25, 100, 500];

export function chipValue(index: number): Decimal {
  const tier = Math.floor(index / CHIP_BASE.length);
  return new Decimal(CHIP_BASE[index % CHIP_BASE.length]!).mul(Decimal.pow(1000, tier));
}
