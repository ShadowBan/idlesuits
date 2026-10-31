const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

/** A gain, which can be a fraction of a Token: +0.7, +3, +12.5, +1.2K. */
export function formatGain(n: number): string {
  if (n >= 100) return formatTokens(n);
  return `${+n.toFixed(n < 10 ? 1 : 0)}`;
}

/** Whole Tokens, compact once they get big: 42, 1,250, 38.4K, 1.2M. */
export function formatTokens(n: number): string {
  const whole = Math.floor(n + 1e-9);
  return whole < 10_000 ? whole.toLocaleString('en-US') : COMPACT.format(whole);
}
