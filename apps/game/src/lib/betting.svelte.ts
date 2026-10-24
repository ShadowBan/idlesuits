import { chipIndexAtMost, chipValue, rackFor } from './chips';
import type { Decimal } from './money';

/**
 * The chip the player has picked up from the rack. Shared by every table, so
 * walking to a new game keeps the same chip in hand.
 */
export const chipInHand = $state({ index: 1 });

/** The picked chip, kept within what this bankroll's rack offers. */
export function heldChip(bank: Decimal): number {
  const rack = rackFor(bank);
  const index = Math.min(Math.max(chipInHand.index, rack[0]!), rack[rack.length - 1]!);
  return index;
}

export function heldValue(bank: Decimal): Decimal {
  return chipValue(heldChip(bank));
}

/** Picks the chip closest to an amount, as when a table opens with a $5 bet. */
export function holdChipFor(amount: Decimal) {
  chipInHand.index = Math.max(0, chipIndexAtMost(amount));
}
