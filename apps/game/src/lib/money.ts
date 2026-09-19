import Decimal from 'break_eternity.js';

export { Decimal };

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
