import { Rng, type Seed } from '../rng';

/**
 * Crash, as a line sinking into deep water: the multiplier climbs from 1×
 * as the hook sinks, until something takes it and the line snaps. The player
 * reels in (cashes out) before then, by hand or at a depth marked beforehand.
 *
 * The snap point is drawn so the chance the line lasts to x is `rtp ÷ x`, for
 * every x from 1.01× up to the cap: whatever the player aims for, the payback
 * is exactly `rtp`. The house's cut shows as lines that snap at once, on
 * 1.00×, before the first cash-out the player can take (1.01×): 1 − rtp ÷ 1.01
 * of the time.
 *
 * Golden lines: now and then (`GOLD_CHANCE`, decided as the line drops and
 * shown at once) the hook is gold, and whatever it lands pays `GOLD_X` times
 * over. Its worth comes out of the line's own payback (`crashLineRtp`), so the
 * two together pay exactly the floor's payback, wherever the player reels in.
 */
export const CRASH_CAP = 10_000;
/** How fast the multiplier climbs: double every this many milliseconds, at normal speed. */
export const CRASH_DOUBLE_MS = 5_000;

export const GOLD_CHANCE = 1 / 30;
export const GOLD_X = 2;

/** The payback a line's snap point is drawn to, so lines and golden lines together pay `rtp`. */
export function crashLineRtp(rtp: number): number {
  return rtp / (1 + GOLD_CHANCE * (GOLD_X - 1));
}

/** Whether this round's line drops golden. */
export function isGoldenLine(seed: { run: Seed; round: number }): boolean {
  return new Rng(seed.run, 'crash-gold', seed.round).next() < GOLD_CHANCE;
}

/** Where this round's line snaps, to the hundredth; 1.00 is at once. `rtp` is the line's own (see `crashLineRtp`). */
export function crashPoint(rtp: number, seed: { run: Seed; round: number }): number {
  const u = new Rng(seed.run, 'crash', seed.round).next();
  const x = rtp / (1 - u);
  if (x < 1) return 1;
  return Math.min(CRASH_CAP, Math.floor(x * 100 + 1e-9) / 100);
}

/** The chance the line lasts to `target` (a hundredth, at least 1.01). */
export function crashChance(rtp: number, target: number): number {
  if (target <= 1) return 1;
  if (target > CRASH_CAP) return 0;
  return Math.min(1, rtp / target);
}

/** The multiplier after `ms` of sinking, to the hundredth. */
export function crashAt(ms: number): number {
  return Math.floor(2 ** (Math.max(0, ms) / CRASH_DOUBLE_MS) * 100 + 1e-9) / 100;
}

/** How long the hook takes to reach a multiplier. */
export function crashTimeTo(x: number): number {
  return Math.log2(Math.max(1, x)) * CRASH_DOUBLE_MS;
}
