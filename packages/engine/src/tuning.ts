import { PULL_COST, TEN_PULL_COST } from '@idlesuits/sim';
import { ROOM_DEFAULTS, type RoomTuning } from './rooms';

/**
 * The pit boss's numbers that change what a round pays or what Tokens buy.
 * For members they live on the server, which reads them as it decides rounds;
 * a guest's browser keeps its own.
 */
export interface EngineTuning {
  /** × every Token earned. */
  tokenRate: number;
  /** Tokens for one capsule, and for ten. */
  pullCost: number;
  tenPullCost: number;
  /** × each Secret charm's chance. */
  secretOdds: number;
  /** × the price of each charm slot. */
  slotCostScale: number;
  /** A room opens when the bank holds this many of its minimum bets. */
  roomOpensAt: number;
  /** + to the Token bonus per room up. */
  roomTokenBonus: number;
  /** A fresh stake, in dollars. */
  buyIn: number;
  /** The instant games' payback, in percent. */
  instantPayback: number;
}

export const ENGINE_TUNING: Readonly<EngineTuning> = {
  tokenRate: 1,
  pullCost: PULL_COST,
  tenPullCost: TEN_PULL_COST,
  secretOdds: 1,
  slotCostScale: 1,
  roomOpensAt: ROOM_DEFAULTS.opensAtBets,
  roomTokenBonus: ROOM_DEFAULTS.tokenBonusPerRoom,
  buyIn: 500,
  instantPayback: 97,
};

/** Each number's allowed range, as the pit boss's panel offers it. */
export const ENGINE_TUNING_LIMITS: Readonly<Record<keyof EngineTuning, [number, number]>> = {
  tokenRate: [0, 1000],
  pullCost: [1, 100_000],
  tenPullCost: [1, 1_000_000],
  secretOdds: [0, 100_000],
  slotCostScale: [0, 100],
  roomOpensAt: [1, 1000],
  roomTokenBonus: [0, 10],
  buyIn: [5, 1e9],
  instantPayback: [50, 150],
};

export const ENGINE_TUNING_KEYS = Object.keys(ENGINE_TUNING) as (keyof EngineTuning)[];

/** Tuning read from anywhere (a database row, a request): every number in range, anything missing or bad at its default. */
export function cleanTuning(raw: unknown): EngineTuning {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out = { ...ENGINE_TUNING };
  for (const key of ENGINE_TUNING_KEYS) {
    const v = src[key];
    const [lo, hi] = ENGINE_TUNING_LIMITS[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(hi, Math.max(lo, v));
  }
  return out;
}

export function roomTuningOf(t: EngineTuning): RoomTuning {
  return { opensAtBets: t.roomOpensAt, tokenBonusPerRoom: t.roomTokenBonus };
}
