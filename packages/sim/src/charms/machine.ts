import { Rng } from '../rng';
import { CHARMS } from './catalog';
import type { Rarity } from './types';

export const MAX_LEVEL = 10;

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 0.62,
  uncommon: 0.25,
  rare: 0.09,
  epic: 0.032,
  legendary: 0.008,
};

export const PULL_COST = 50;
export const TEN_PULL_COST = 450;
/** Tokens to unlock each slot, by slot index; the first is free. */
export const SLOT_COSTS = [0, 500, 2_500, 10_000, 50_000] as const;
export const MAX_SLOTS = SLOT_COSTS.length;
/** Given once to a new save: three pulls to see the machine work. */
export const STARTER_TOKENS = 150;

/** 1 copy is level 1, 2 is level 2, 4 is 3, 8 is 4 … 512 is the top level. */
export function levelOf(copies: number): number {
  if (copies <= 0) return 0;
  return Math.min(MAX_LEVEL, Math.floor(Math.log2(copies)) + 1);
}

/** Copies needed for a level: the next one doubles everything before it. */
export function copiesFor(level: number): number {
  return 2 ** (level - 1);
}

/** Progress toward the next level, 0–1, and the copies it takes; null at the top. */
export function nextLevel(copies: number): { need: number; have: number } | null {
  const level = levelOf(copies);
  if (level >= MAX_LEVEL) return null;
  const from = copiesFor(level);
  return { need: copiesFor(level + 1) - from, have: copies - from };
}

/**
 * One capsule from the machine. Seeded by the save's seed and the pull's
 * number, so a collection can be replayed exactly. The rarity is drawn
 * first, then a charm of that rarity.
 */
export function drawCharm(seed: string, pull: number): string {
  const rng = new Rng(seed, 'machine', pull);
  let roll = rng.next();
  let rarity: Rarity = 'common';
  for (const [r, weight] of Object.entries(RARITY_WEIGHTS) as [Rarity, number][]) {
    if (roll < weight) {
      rarity = r;
      break;
    }
    roll -= weight;
  }
  const pool = CHARMS.filter((c) => c.rarity === rarity);
  return rng.pick(pool).id;
}
