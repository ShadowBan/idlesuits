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
  /** The slot machines' payback, in percent, with the progressives at their seeds. */
  slotPayback: number;
  /** × what every round adds to the progressive jackpots. */
  jackpotGrowth: number;
  /** Blind hands at every poker table, or −1 for what the charms give. */
  blindHands: number;
  /** Each game's rule overrides, by game id and path in its rules object. */
  games: GameOverrides;
}

/** A game's rules changed by the pit boss: path in its rules object → value. */
export type GameOverrides = Record<string, Record<string, number | boolean>>;

/** The numbers in the tuning, each with a range. */
export type TuningNumber = Exclude<keyof EngineTuning, 'games'>;

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
  slotPayback: 94,
  jackpotGrowth: 1,
  blindHands: -1,
  games: {},
};

/** Each number's allowed range, as the pit boss's panel offers it. */
export const ENGINE_TUNING_LIMITS: Readonly<Record<TuningNumber, [number, number]>> = {
  tokenRate: [0, 1000],
  pullCost: [1, 100_000],
  tenPullCost: [1, 1_000_000],
  secretOdds: [0, 100_000],
  slotCostScale: [0, 100],
  roomOpensAt: [1, 1000],
  roomTokenBonus: [0, 10],
  buyIn: [5, 1e9],
  instantPayback: [50, 150],
  slotPayback: [50, 150],
  jackpotGrowth: [0, 1000],
  blindHands: [-1, 2],
};

export const ENGINE_TUNING_KEYS = Object.keys(ENGINE_TUNING_LIMITS) as TuningNumber[];

/** Tuning read from anywhere (a database row, a request): every number in range, anything missing or bad at its default. */
export function cleanTuning(raw: unknown): EngineTuning {
  const src = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: EngineTuning = { ...ENGINE_TUNING, games: cleanOverrides(src.games) };
  for (const key of ENGINE_TUNING_KEYS) {
    const v = src[key];
    const [lo, hi] = ENGINE_TUNING_LIMITS[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(hi, Math.max(lo, v));
  }
  return out;
}

const SAFE_KEY = /^[A-Za-z0-9_]{1,40}$/;

/** Rule overrides read from anywhere: plain paths only, each a finite number or an on/off. */
export function cleanOverrides(raw: unknown): GameOverrides {
  const out: GameOverrides = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [game, rules] of Object.entries(raw as Record<string, unknown>)) {
    if (!SAFE_KEY.test(game) || !rules || typeof rules !== 'object') continue;
    const clean: Record<string, number | boolean> = {};
    for (const [path, v] of Object.entries(rules as Record<string, unknown>)) {
      if (!path.split('.').every((k) => SAFE_KEY.test(k) && k !== '__proto__' && k !== 'constructor' && k !== 'prototype')) continue;
      if (typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) clean[path] = v;
    }
    if (Object.keys(clean).length) out[game] = clean;
  }
  return out;
}

/** A rules object with overrides set at their paths ("pays.4", "decks"), copying only what changes. */
export function withOverrides<T extends object>(base: T, overrides: Readonly<Record<string, number | boolean>>): T {
  let out = base;
  for (const [path, value] of Object.entries(overrides)) {
    const keys = path.split('.');
    const set = (obj: Record<string, unknown>, i: number): Record<string, unknown> => {
      const copy = Array.isArray(obj) ? ([...obj] as unknown as Record<string, unknown>) : { ...obj };
      copy[keys[i]!] = i === keys.length - 1 ? value : set((obj[keys[i]!] ?? {}) as Record<string, unknown>, i + 1);
      return copy;
    };
    out = set(out as Record<string, unknown>, 0) as T;
  }
  return out;
}

const tuned = new Map<string, { key: string; base: object; rules: object }>();

/** A game's rules as tuned: the same object while the overrides stay the same, so strategy can be cached on it. */
export function rulesFor<T extends object>(t: EngineTuning, id: string, base: T): T {
  const overrides = t.games[id] ?? {};
  const key = JSON.stringify(overrides);
  const hit = tuned.get(id);
  if (hit && hit.key === key && hit.base === base) return hit.rules as T;
  const rules = withOverrides(base, overrides);
  tuned.set(id, { key, base, rules });
  return rules;
}

/** One override for a game, or `fallback` if it hasn't been set. */
export function gameValue<V extends number | boolean>(t: EngineTuning, id: string, path: string, fallback: V): V {
  const v = t.games[id]?.[path];
  return (typeof v === typeof fallback ? v : fallback) as V;
}

export function roomTuningOf(t: EngineTuning): RoomTuning {
  return { opensAtBets: t.roomOpensAt, tokenBonusPerRoom: t.roomTokenBonus };
}
