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

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** $1,234 → $12.3M → $4.56e45. Works for any size break_eternity can hold. */
export function formatMoney(value: Decimal, signed = false): string {
  const sign = value.lt(0) ? '-' : signed && value.gt(0) ? '+' : '';
  const abs = value.abs();
  if (abs.lt(1e6)) {
    const n = abs.toNumber();
    const digits = n < 100 && n % 1 !== 0 ? 2 : 0;
    return `${sign}$${n.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
  }
  const exponent = Math.floor(abs.log10().toNumber());
  const tier = Math.floor(exponent / 3);
  if (tier < SUFFIXES.length) {
    const scaled = abs.div(Decimal.pow(10, tier * 3)).toNumber();
    return `${sign}$${scaled.toFixed(scaled < 10 ? 2 : scaled < 100 ? 1 : 0)}${SUFFIXES[tier]}`;
  }
  const mantissa = abs.div(Decimal.pow(10, exponent)).toNumber();
  return `${sign}$${mantissa.toFixed(2)}e${exponent}`;
}
