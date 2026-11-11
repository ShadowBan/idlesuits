import { Rng } from '../rng';
import { CHARMS, findCharm } from './catalog';
import type { Rarity } from './types';

export const MAX_LEVEL = 10;

/** The odds of each ordinary rarity, per pull. Secret charms are drawn apart, by SECRET_ODDS. */
export const RARITY_WEIGHTS: Record<Exclude<Rarity, 'secret' | 'starbound'>, number> = {
  common: 0.62,
  uncommon: 0.25,
  rare: 0.09,
  epic: 0.032,
  legendary: 0.008,
};

/**
 * Secret charms bend the rules, so each has its own odds per pull, checked
 * before the ordinary draw: about one in a hundred thousand to start, so a
 * machine pulling for a long time finds them, and finding a second copy (the
 * next level) takes far longer. Tune each one here.
 */
export const SECRET_ODDS: Readonly<Record<string, number>> = {
  'lucky-seat': 0.00001,
  'thin-shoe': 0.00001,
};

export const PULL_COST = 50;
export const TEN_PULL_COST = 450;
/** Tokens to unlock each slot, by slot index; the first is free. */
export const SLOT_COSTS = [0, 500, 2_500, 10_000, 50_000] as const;
export const MAX_SLOTS = SLOT_COSTS.length;
/** Given once to a new save: three pulls to see the machine work. */
export const STARTER_TOKENS = 150;

/** The highest level a charm reaches: ten, or one or two for a Secret charm. */
export function maxLevelOf(id: string): number {
  return findCharm(id)?.maxLevel ?? MAX_LEVEL;
}

/** 1 copy is level 1, 2 is level 2, 4 is 3, 8 is 4 … 512 is the top level. */
export function levelOf(copies: number, maxLevel = MAX_LEVEL): number {
  if (copies <= 0) return 0;
  return Math.min(maxLevel, Math.floor(Math.log2(copies)) + 1);
}

/** Copies needed for a level: the next one doubles everything before it. */
export function copiesFor(level: number): number {
  return 2 ** (level - 1);
}

/** Progress toward the next level, 0–1, and the copies it takes; null at the top. */
export function nextLevel(copies: number, maxLevel = MAX_LEVEL): { need: number; have: number } | null {
  const level = levelOf(copies, maxLevel);
  if (level >= maxLevel) return null;
  const from = copiesFor(level);
  return { need: copiesFor(level + 1) - from, have: copies - from };
}

/**
 * One capsule from the machine. Seeded by the save's seed and the pull's
 * number, so a collection can be replayed exactly. The rarity is drawn
 * first, then a charm of that rarity. `secretScale` multiplies the Secret
 * odds, for testing.
 */
export function drawCharm(seed: string, pull: number, secretScale = 1): string {
  // A separate stream, so the ordinary draw is the same as it always was.
  let secret = new Rng(seed, 'secret', pull).next();
  for (const [id, odds] of Object.entries(SECRET_ODDS)) {
    if (secret < odds * secretScale) return id;
    secret -= odds * secretScale;
  }
  const rng = new Rng(seed, 'machine', pull);
  let roll = rng.next();
  let rarity: Rarity = 'common';
  for (const [r, weight] of Object.entries(RARITY_WEIGHTS) as [Exclude<Rarity, 'secret' | 'starbound'>, number][]) {
    if (roll < weight) {
      rarity = r;
      break;
    }
    roll -= weight;
  }
  const pool = CHARMS.filter((c) => c.rarity === rarity);
  return rng.pick(pool).id;
}
