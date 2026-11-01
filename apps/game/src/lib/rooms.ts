import { chipValue } from './chips';
import { Decimal } from './money';

/**
 * The rooms of the casino, cheapest first: the Main Floor's $5 tables, then
 * rooms whose minimums climb the chip ladder ($25, $100, $500, $1K, $5K…)
 * without end, so a bankroll of any size has somewhere to sit. A room opens
 * for good once the bankroll first reaches `opensAt`.
 */
export interface Room {
  index: number;
  name: string;
  /** The least the main bet can be, per spot that must match it. */
  min: Decimal;
  max: Decimal;
  /** Side bets have lower limits, as on a real table. */
  sideMax: Decimal;
  /** The bankroll that first opens the room. */
  opensAt: Decimal;
  /** Higher rooms comp more: Tokens earned there are multiplied by this. */
  tokenBonus: number;
}

const NAMES = ['Main Floor', 'Mezzanine', 'High Limit', 'Salon Privé', 'The Penthouse', "Owner's Suite", 'The Vault'];

/** The maximum is a hundred minimums, the usual spread on a carnival table. */
const MAX_SPREAD = 100;
const SIDE_SHARE = 5;
/** A room opens when the bankroll holds this many of its minimum bets. */
const OPENS_AT_BETS = 50;
const TOKEN_BONUS_PER_ROOM = 0.1;

function roman(n: number): string {
  const parts: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [value, mark] of parts) {
    while (n >= value) {
      out += mark;
      n -= value;
    }
  }
  return out;
}

export function room(index: number): Room {
  const min = chipValue(index + 1);
  const last = NAMES.length - 1;
  return {
    index,
    name: index <= last ? NAMES[index]! : `${NAMES[last]} ${roman(index - last + 1)}`,
    min,
    max: min.mul(MAX_SPREAD),
    sideMax: min.mul(MAX_SPREAD / SIDE_SHARE),
    opensAt: index === 0 ? new Decimal(0) : min.mul(OPENS_AT_BETS),
    tokenBonus: 1 + TOKEN_BONUS_PER_ROOM * index,
  };
}

/** The highest room a bankroll has opened, given the highest it had opened before. */
export function opened(bank: Decimal, best: number): number {
  while (bank.gte(room(best + 1).opensAt)) best++;
  return best;
}

/**
 * The room to sit in: `current`, or the best opened room below it whose
 * minimum the bankroll still covers (`units` minimums go down on a hand).
 * Room 0 when even that is out of reach; the table is then busted.
 */
export function affordable(bank: Decimal, units: number, current: number): number {
  let index = current;
  while (index > 0 && bank.lt(room(index).min.mul(units))) index--;
  return index;
}

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Short enough for a table's limit sign: $5, $2.5K, $100K, $1M, $1e39. */
export function formatLimit(value: Decimal): string {
  const exponent = Math.floor(value.max(1).log10().toNumber() + 1e-9);
  const tier = Math.floor(exponent / 3);
  const scaled = value.div(Decimal.pow(1000, tier)).toNumber();
  const face = `${+scaled.toFixed(scaled < 10 ? 1 : 0)}`;
  return tier < SUFFIXES.length ? `$${face}${SUFFIXES[tier]}` : `$${face}e${tier * 3}`;
}
