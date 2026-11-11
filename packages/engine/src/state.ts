import {
  findCharm,
  FRESH_RUN,
  KENO_BUFF_START,
  KENO_BUFFS,
  KENO_NUMBERS,
  kenoBuffDef,
  MAX_SLOTS,
  STARTER_TOKENS,
  type CharmRunState,
  type KenoBuffKind,
  type KenoBuffState,
  type KenoDrawBuff,
} from '@idlesuits/sim';
import { amount, Decimal } from './money';

/** One game's lifetime record. Money as strings, so any size survives saving. */
export interface GameStats {
  rounds: number;
  /** Everything staked, the side bets included. */
  wagered: string;
  /** Won less lost, charms' cash included. */
  net: string;
  /** The biggest single round, in dollars, and in multiples of its bet. */
  biggestWin: string;
  bestX: number;
  wins: number;
  lastPlayed: number;
}

export interface LifetimeStats {
  /** When the first round was played. */
  since: number;
  /** The most the bank has ever held. */
  peakBank: string;
  games: Record<string, GameStats>;
}

/** A win, as the Stats tab lists it, and whatever its game needs to draw it again. */
export interface WinRecord {
  /** The round's number at its table, for the list. */
  round: number;
  text: string;
  sub?: string;
  /** What it won, net, and the bet it was counted in, as strings so any size survives saving. */
  net: string;
  unit: string;
  /** When it was won. */
  at: number;
  /** The game's own record of the round, to replay it exactly. Absent where a game can't replay. */
  replay?: unknown;
}

/** Wins kept per game. */
export const WINS_KEPT = 50;

/** The charms: Tokens, the collection, the loadout and slots, and the streaks they read. */
export interface MetaState {
  tokens: number;
  lifetimeTokens: number;
  /** Charm id → copies found. */
  collection: Record<string, number>;
  /** One entry per unlocked slot; null is an empty slot. */
  loadout: (string | null)[];
  pulls: number;
  /** A guest's seed for the Charm Machine. The server draws from its own secret instead. */
  seed: string;
  run: CharmRunState;
  hands: number;
}

/** A Keno win, kept to look back on: enough to draw it again exactly. */
export interface KenoWin {
  /** The round's seed and number. */
  run: string;
  round: number;
  /** The draw's number in the player's history, for the list. */
  draw: number;
  ticket: number[];
  /** The bet, as a string so any size survives saving. */
  bet: string;
  /** In bets: the ticket's pay and anything the Gold Card's pots added. */
  pay: number;
  hits: number;
  gold: boolean;
  /** Rows of the Gold Card it finished, and whether it filled the card. */
  rows: number;
  full: boolean;
  /** The buff it was drawn under, if any, and what that did. */
  buff?: KenoBuffKind;
  drawBuff?: KenoDrawBuff;
}

/** Keno's progress between draws: everything that changes what the next draw pays. */
export interface KenoProgress {
  /** Rounds started, each with its own seed. */
  round: number;
  /** Draws settled, to number the wins list. */
  draws: number;
  /** The Gold Card's stamps, and its pots in dollars. */
  card: number[];
  rowPot: string;
  cardPot: string;
  /** The pattern meters and the buffs waiting. */
  buffs: KenoBuffState;
  /** While a buff waits, the bet stays the one that earned it: its room and step. */
  locked: { room: number; step: number } | null;
}

/**
 * Everything about a player that decides what a round pays: the one state a
 * member's Durable Object keeps, and the one a guest's browser keeps.
 */
export interface PlayerState {
  v: 1;
  /** Goes up each time the server stores the state, so a late reply can't put an older state back on screen. */
  rev: number;
  /** The bank, as a string so any size survives saving. */
  bank: string;
  /** The room sat in, and the highest opened. */
  floor: { current: number; best: number };
  meta: MetaState;
  stats: LifetimeStats;
  /** Each game's last wins, newest first. */
  wins: Record<string, WinRecord[]>;
  keno: KenoProgress;
  /** Every other engine game's progress between rounds, by game: each game reads its own. */
  games: Record<string, unknown>;
  /** Auto play running on the host's clock, if any (see `auto.ts`). */
  auto: unknown;
  /** The player's leaderboard records, kept by the server (see apps/server). */
  boards: unknown;
}

export const STARTING_BANK = 500;

export function freshKeno(): KenoProgress {
  return { round: 0, draws: 0, card: [], rowPot: '0', cardPot: '0', buffs: { meters: { ...KENO_BUFF_START.meters }, queue: [] }, locked: null };
}

export function freshPlayer(seed: string): PlayerState {
  return {
    v: 1,
    rev: 0,
    bank: String(STARTING_BANK),
    floor: { current: 0, best: 0 },
    meta: { tokens: STARTER_TOKENS, lifetimeTokens: 0, collection: {}, loadout: [null], pulls: 0, seed, run: FRESH_RUN, hands: 0 },
    stats: { since: 0, peakBank: '0', games: {} },
    wins: {},
    keno: freshKeno(),
    games: {},
    auto: null,
    boards: null,
  };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const count = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : fallback);
const num = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const money = (v: unknown): string => amount(v).toString();
/** An amount that may be below zero, as a string. */
function signed(v: unknown): string {
  try {
    const d = new Decimal(typeof v === 'string' || typeof v === 'number' ? v : 0);
    return d.isFinite() && !d.isNan() ? d.toString() : '0';
  } catch {
    return '0';
  }
}

function readMeta(raw: unknown, seed: string): MetaState {
  const m = obj(raw);
  const collection: Record<string, number> = {};
  for (const [id, n] of Object.entries(obj(m.collection))) if (findCharm(id) && count(n) > 0) collection[id] = count(n);
  const saved = Array.isArray(m.loadout) ? m.loadout.slice(0, MAX_SLOTS) : [];
  const loadout: (string | null)[] = [];
  for (const id of saved) loadout.push(typeof id === 'string' && collection[id] && !loadout.includes(id) ? id : null);
  if (!loadout.length) loadout.push(null);
  const r = obj(m.run);
  const outcomes = ['win', 'lose', 'push', 'fold'];
  return {
    tokens: Math.max(0, num(m.tokens, STARTER_TOKENS)),
    lifetimeTokens: Math.max(0, num(m.lifetimeTokens)),
    collection,
    loadout,
    pulls: count(m.pulls),
    seed: typeof m.seed === 'string' && m.seed ? m.seed.slice(0, 64) : seed,
    run: {
      winStreak: count(r.winStreak),
      lossStreak: count(r.lossStreak),
      lastOutcome: outcomes.includes(r.lastOutcome as string) ? (r.lastOutcome as CharmRunState['lastOutcome']) : null,
    },
    hands: count(m.hands),
  };
}

export function readStats(raw: unknown): LifetimeStats {
  const s = obj(raw);
  const games: Record<string, GameStats> = {};
  for (const [id, g] of Object.entries(obj(s.games))) {
    const row = obj(g);
    games[id.slice(0, 40)] = {
      rounds: count(row.rounds),
      wagered: money(row.wagered),
      net: signed(row.net),
      biggestWin: money(row.biggestWin),
      bestX: Math.max(0, num(row.bestX)),
      wins: count(row.wins),
      lastPlayed: count(row.lastPlayed),
    };
  }
  return { since: count(s.since), peakBank: money(s.peakBank), games };
}

export function readWins(raw: unknown): WinRecord[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((w): w is WinRecord => !!w && typeof w === 'object' && typeof w.net === 'string' && typeof w.text === 'string' && typeof w.unit === 'string')
    .slice(0, WINS_KEPT)
    .map((w) => ({ round: count(w.round), text: w.text.slice(0, 120), sub: typeof w.sub === 'string' ? w.sub.slice(0, 40) : undefined, net: w.net, unit: w.unit, at: count(w.at), replay: w.replay }));
}

const isNumber = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 1 && (n as number) <= KENO_NUMBERS;

export function readBuffs(raw: unknown): KenoBuffState {
  const saved = obj(raw);
  const meters = { ...KENO_BUFF_START.meters };
  const savedMeters = obj(saved.meters);
  for (const def of KENO_BUFFS) {
    const v = savedMeters[def.pattern];
    if (Number.isInteger(v) && (v as number) >= 0 && (v as number) < def.steps) meters[def.pattern] = v as number;
  }
  const queue = (Array.isArray(saved.queue) ? saved.queue : [])
    .map(obj)
    .filter((b) => KENO_BUFFS.some((d) => d.kind === b.kind) && Number.isInteger(b.left) && (b.left as number) > 0 && (b.left as number) <= kenoBuffDef(b.kind as KenoBuffKind).draws)
    .map((b) => ({ kind: b.kind as KenoBuffKind, left: b.left as number }));
  return { meters, queue };
}

function readKeno(raw: unknown): KenoProgress {
  const k = obj(raw);
  const lock = obj(k.locked);
  return {
    round: count(k.round),
    draws: count(k.draws),
    card: Array.isArray(k.card) ? [...new Set(k.card.filter(isNumber))] : [],
    rowPot: money(k.rowPot),
    cardPot: money(k.cardPot),
    buffs: readBuffs(k.buffs),
    locked: k.locked && Number.isInteger(lock.room) && Number.isInteger(lock.step) ? { room: Math.max(0, lock.room as number), step: Math.max(0, lock.step as number) } : null,
  };
}

/**
 * A player's state read from storage or a save: every field checked, anything
 * missing or malformed at its fresh value. `seed` is the Charm Machine seed a
 * state gets if it has none.
 */
export function readPlayer(raw: unknown, seed: string): PlayerState {
  const p = obj(raw);
  const f = obj(p.floor);
  const best = count(f.best);
  const wins: Record<string, WinRecord[]> = {};
  for (const [game, list] of Object.entries(obj(p.wins))) {
    const read = readWins(list);
    if (read.length) wins[game.slice(0, 40)] = read;
  }
  return {
    v: 1,
    rev: count(p.rev),
    bank: amount(p.bank, STARTING_BANK).toString(),
    floor: { best, current: Math.min(count(f.current), best) },
    meta: readMeta(p.meta, seed),
    stats: readStats(p.stats),
    wins,
    keno: readKeno(p.keno),
    games: Object.fromEntries(Object.entries(obj(p.games)).filter(([, g]) => g && typeof g === 'object' && !Array.isArray(g))),
    auto: p.auto && typeof p.auto === 'object' ? p.auto : null,
    boards: p.boards && typeof p.boards === 'object' ? p.boards : null,
  };
}

/** What the browser saved before the engine, key by key, as stored: `{"v":1,"data":…}`. */
function unwrap(save: Record<string, string>, key: string): unknown {
  const raw = save[key];
  if (typeof raw !== 'string') return undefined;
  try {
    const parsed = JSON.parse(raw) as { v?: number; data?: unknown };
    return parsed?.v === 1 ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** The keys the browser kept player state under before the engine, now all in one state. */
export function isOldStateKey(key: string): boolean {
  return (
    ['bank', 'floor', 'meta', 'stats', 'keno.card', 'keno.rowPot', 'keno.cardPot', 'keno.buffs', 'keno.wins', 'mines.vault', 'jackpots'].includes(key) ||
    key.startsWith('wins.') ||
    /^slot\.[a-z]+\.pots$/.test(key)
  );
}

/**
 * A player's state from a save made before the engine: the bank, the floor,
 * the charms, the lifetime stats, every game's wins, and Keno's card, pots and
 * meters, each under its own key. Null if the save holds none of them.
 */
export function playerFromSave(save: Record<string, string>, seed: string): PlayerState | null {
  if (!Object.keys(save).some(isOldStateKey)) return null;
  const wins: Record<string, unknown> = {};
  for (const key of Object.keys(save)) if (key.startsWith('wins.')) wins[key.slice(5)] = unwrap(save, key);
  // Each game's own progress that carries over: the Gem Vault, the slot machines' pots, the progressive meters.
  const games: Record<string, unknown> = {};
  const vault = unwrap(save, 'mines.vault');
  if (vault && typeof vault === 'object') games.mines = { round: 0, vault, live: null };
  for (const key of Object.keys(save)) {
    const m = key.match(/^slot\.([a-z]+)\.pots$/);
    const pots = m ? unwrap(save, key) : undefined;
    if (m && Array.isArray(pots)) games[m[1]!] = { round: 0, pots };
  }
  const meters = unwrap(save, 'jackpots') as { major?: unknown; grand?: unknown; history?: unknown } | undefined;
  if (meters && typeof meters === 'object') games.jackpots = { major: meters.major, grand: meters.grand, history: meters.history, majorHits: 0, at: 0 };
  return readPlayer(
    {
      bank: unwrap(save, 'bank'),
      floor: unwrap(save, 'floor'),
      meta: unwrap(save, 'meta'),
      stats: unwrap(save, 'stats'),
      wins,
      keno: { card: unwrap(save, 'keno.card'), rowPot: unwrap(save, 'keno.rowPot'), cardPot: unwrap(save, 'keno.cardPot'), buffs: unwrap(save, 'keno.buffs') },
      games,
    },
    seed,
  );
}
