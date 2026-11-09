import { affordable as engineAffordable, opened as engineOpened, room as engineRoom, type Room } from '@idlesuits/engine';
import { Decimal } from './money';

export type { Room };

/**
 * The rooms of the casino: the ladder lives in the engine, which the server
 * runs too; these read its two tunable numbers from here, where the pit boss's
 * tuning sets them.
 */
export const roomTuning = { opensAtBets: 50, tokenBonusPerRoom: 0.1 };

export function room(index: number): Room {
  return engineRoom(index, roomTuning);
}

/** The highest room a bankroll has opened, given the highest it had opened before. */
export function opened(bank: Decimal, best: number): number {
  return engineOpened(bank, best, roomTuning);
}

/** The room to sit in: `current`, or the best opened room below it whose minimum the bankroll still covers. */
export function affordable(bank: Decimal, units: number, current: number): number {
  return engineAffordable(bank, units, current, roomTuning);
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
