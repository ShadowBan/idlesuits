import { Rng, type RoundReport } from '@idlesuits/sim';

/**
 * Lucky Stars: the weekly constellations and the season's star track.
 *
 * Every week (Monday to Monday, UTC) three constellations are offered and the
 * player picks one. Its six stars are missions across the games; each one
 * finished lights its star, pays Tokens, and gives stardust. Stardust climbs
 * the season's track (four weeks long), whose tiers hold Tokens, free pulls
 * at the Charm Machine, Token boosts, Starbound charms (found nowhere else)
 * and card backs.
 *
 * All three constellations count rounds until one is picked, so play before
 * choosing isn't wasted. Every settled round counts, auto play's included.
 */

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** A Monday (UTC): week 0 of season 0, the week Lucky Stars opened. */
const EPOCH = Date.UTC(2026, 10, 9);
export const SEASON_WEEKS = 4;

/** The week `now` falls in, counted from EPOCH. */
export function weekIndex(now: number): number {
  return Math.floor((now - EPOCH) / WEEK_MS);
}

/** When a week starts and ends (the next Monday, 00:00 UTC). */
export function weekStart(week: number): number {
  return EPOCH + week * WEEK_MS;
}

export function seasonOf(week: number): number {
  return Math.floor(week / SEASON_WEEKS);
}

// ---------------------------------------------------------------- games

export const TABLE_GAMES = ['blackjack', 'baccarat', 'uth', 'tcp', 'csp', 'c4p', 'stud', 'lir', 'djw', 'paigow', 'suits'];
export const POKER_GAMES = ['uth', 'tcp', 'csp', 'c4p', 'stud', 'lir', 'djw'];
export const SLOT_GAMES = ['vault', 'forge', 'haul', 'carnival', 'lanterns'];
export const INSTANT_GAMES = ['keno', 'plinko', 'mines', 'deepdrop', 'roulette'];

const GROUPS: Record<string, readonly string[] | null> = {
  any: null,
  tables: TABLE_GAMES,
  poker: POKER_GAMES,
  slots: SLOT_GAMES,
  instant: INSTANT_GAMES,
};

// ---------------------------------------------------------------- missions

/**
 * A star's mission. Each counts something about settled rounds in some games:
 * - rounds: rounds played; wins: rounds that came out ahead;
 * - x: rounds that paid at least `x` times their bet;
 * - feat: rounds where something special happened (a blackjack, a slot bonus…);
 * - hand: hands of at least poker rank `tier`;
 * - tokens: Tokens earned; games: different games played this week.
 */
export interface Mission {
  text: string;
  kind: 'rounds' | 'wins' | 'x' | 'feat' | 'hand' | 'tokens' | 'games';
  /** A group (any, tables, poker, slots, instant) or one game's id. */
  games: string;
  need: number;
  x?: number;
  feat?: Feat;
  tier?: number;
}

/** Special moments a game reports for the missions (besides a blackjack, a flush, a poker hand's rank). */
export type Feat = 'blackjack' | 'flush' | 'bonus' | 'jackpot' | 'gold' | 'row' | 'prize' | 'fever' | 'vault' | 'straight';

export interface Constellation {
  id: string;
  name: string;
  /** What it's about, for the choice. */
  blurb: string;
  /** Six stars in a 100×60 sky, in the order they light, and the lines between them. */
  stars: [number, number][];
  lines: [number, number][];
  missions: Mission[];
}

/** Stardust each star gives, in order: the later stars are harder. */
export const STAR_DUST = [1, 1, 2, 2, 3, 3];
/** Tokens each star pays, in order. */
export const STAR_TOKENS = [40, 60, 100, 150, 250, 400];
/** The whole constellation lit: this much more stardust, and a free pull. */
export const FULL_DUST = 2;
export const FULL_PULLS = 1;

export const CONSTELLATIONS: readonly Constellation[] = [
  {
    id: 'horseshoe',
    name: 'The Horseshoe',
    blurb: 'Luck at the card tables, blackjack above all.',
    stars: [[12, 48], [14, 26], [28, 10], [50, 6], [72, 10], [86, 26]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
    missions: [
      { text: 'Play 50 hands of blackjack', kind: 'rounds', games: 'blackjack', need: 50 },
      { text: 'Win 25 hands at the tables', kind: 'wins', games: 'tables', need: 25 },
      { text: 'Get dealt a blackjack 5 times', kind: 'feat', feat: 'blackjack', games: 'blackjack', need: 5 },
      { text: 'Play 300 hands at the tables', kind: 'rounds', games: 'tables', need: 300 },
      { text: 'Win 3× your bet or more at a table, 3 times', kind: 'x', x: 3, games: 'tables', need: 3 },
      { text: 'Win 150 hands at the tables', kind: 'wins', games: 'tables', need: 150 },
    ],
  },
  {
    id: 'clover',
    name: 'Four-Leaf Clover',
    blurb: 'The slot floor: spins, bonuses and big hits.',
    stars: [[50, 30], [50, 8], [72, 30], [50, 52], [28, 30], [64, 56]],
    lines: [[0, 1], [0, 2], [0, 3], [0, 4], [3, 5]],
    missions: [
      { text: 'Spin the slots 100 times', kind: 'rounds', games: 'slots', need: 100 },
      { text: 'Win 50 slot spins', kind: 'wins', games: 'slots', need: 50 },
      { text: 'Trigger a slot bonus twice', kind: 'feat', feat: 'bonus', games: 'slots', need: 2 },
      { text: 'Spin the slots 500 times', kind: 'rounds', games: 'slots', need: 500 },
      { text: 'Win 20× your spin or more, twice', kind: 'x', x: 20, games: 'slots', need: 2 },
      { text: 'Trigger a slot bonus 8 times', kind: 'feat', feat: 'bonus', games: 'slots', need: 8 },
    ],
  },
  {
    id: 'seven',
    name: 'The Lucky Seven',
    blurb: 'A bit of everything: the whole casino counts.',
    stars: [[16, 10], [40, 10], [64, 10], [86, 10], [68, 32], [54, 54]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
    missions: [
      { text: 'Play 77 rounds of anything', kind: 'rounds', games: 'any', need: 77 },
      { text: 'Play 3 different games', kind: 'games', games: 'any', need: 3 },
      { text: 'Win 77 rounds of anything', kind: 'wins', games: 'any', need: 77 },
      { text: 'Play 7 different games', kind: 'games', games: 'any', need: 7 },
      { text: 'Win 7× your bet or more, 7 times', kind: 'x', x: 7, games: 'any', need: 7 },
      { text: 'Play 777 rounds of anything', kind: 'rounds', games: 'any', need: 777 },
    ],
  },
  {
    id: 'rabbit',
    name: "Rabbit's Foot",
    blurb: 'Keno, Lucky Drop and Mines: quick games, lucky breaks.',
    stars: [[18, 50], [30, 38], [44, 32], [58, 22], [70, 10], [84, 16]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
    missions: [
      { text: 'Play 50 Keno draws', kind: 'rounds', games: 'keno', need: 50 },
      { text: 'Drop 100 balls on Lucky Drop', kind: 'rounds', games: 'plinko', need: 100 },
      { text: 'Win 25 rounds of Mines', kind: 'wins', games: 'mines', need: 25 },
      { text: 'Catch the gold ball in Keno', kind: 'feat', feat: 'gold', games: 'keno', need: 1 },
      { text: 'Light up Lucky Drop and play Prize Pins', kind: 'feat', feat: 'prize', games: 'plinko', need: 1 },
      { text: 'Win 50× your bet or more at a quick game', kind: 'x', x: 50, games: 'instant', need: 1 },
    ],
  },
  {
    id: 'wishbone',
    name: 'The Wishbone',
    blurb: 'Poker hands: wish for trips, straights and better.',
    stars: [[50, 52], [40, 36], [28, 20], [14, 8], [60, 36], [76, 12]],
    lines: [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5]],
    missions: [
      { text: 'Play 50 hands of poker', kind: 'rounds', games: 'poker', need: 50 },
      { text: 'Win 25 hands of poker', kind: 'wins', games: 'poker', need: 25 },
      { text: 'Make three of a kind or better 10 times', kind: 'hand', tier: 3, games: 'poker', need: 10 },
      { text: 'Make a straight or better 5 times', kind: 'hand', tier: 4, games: 'poker', need: 5 },
      { text: 'Make a flush or better 3 times', kind: 'hand', tier: 5, games: 'poker', need: 3 },
      { text: 'Make a full house or better', kind: 'hand', tier: 6, games: 'poker', need: 1 },
    ],
  },
  {
    id: 'koi',
    name: 'The Golden Koi',
    blurb: 'Tokens: earn them anywhere, as many as you can.',
    stars: [[10, 30], [24, 20], [42, 18], [60, 26], [78, 34], [90, 20]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
    missions: [
      { text: 'Earn 50 Tokens', kind: 'tokens', games: 'any', need: 50 },
      { text: 'Play 200 rounds of anything', kind: 'rounds', games: 'any', need: 200 },
      { text: 'Earn 250 Tokens', kind: 'tokens', games: 'any', need: 250 },
      { text: 'Win 150 rounds of anything', kind: 'wins', games: 'any', need: 150 },
      { text: 'Earn 750 Tokens', kind: 'tokens', games: 'any', need: 750 },
      { text: 'Earn 2,000 Tokens', kind: 'tokens', games: 'any', need: 2000 },
    ],
  },
  {
    id: 'ladybug',
    name: 'The Ladybug',
    blurb: 'The classics: roulette and baccarat.',
    stars: [[50, 8], [34, 24], [66, 24], [36, 44], [64, 44], [50, 56]],
    lines: [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5]],
    missions: [
      { text: 'Spin the roulette wheel 50 times', kind: 'rounds', games: 'roulette', need: 50 },
      { text: 'Play 50 hands of baccarat', kind: 'rounds', games: 'baccarat', need: 50 },
      { text: 'Win 30 roulette spins', kind: 'wins', games: 'roulette', need: 30 },
      { text: 'Hit a straight-up number in roulette', kind: 'feat', feat: 'straight', games: 'roulette', need: 1 },
      { text: 'Win 50 hands of baccarat', kind: 'wins', games: 'baccarat', need: 50 },
      { text: 'Hit a straight-up number 3 times', kind: 'feat', feat: 'straight', games: 'roulette', need: 3 },
    ],
  },
  {
    id: 'comet',
    name: 'The Shooting Star',
    blurb: 'Big wins only: the bigger the multiple, the brighter the star.',
    stars: [[88, 8], [74, 16], [60, 24], [46, 32], [32, 42], [16, 54]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]],
    missions: [
      { text: 'Win 5× your bet or more', kind: 'x', x: 5, games: 'any', need: 1 },
      { text: 'Win 10× your bet or more', kind: 'x', x: 10, games: 'any', need: 1 },
      { text: 'Win 10× your bet or more, 3 times', kind: 'x', x: 10, games: 'any', need: 3 },
      { text: 'Win 25× your bet or more', kind: 'x', x: 25, games: 'any', need: 1 },
      { text: 'Win 50× your bet or more', kind: 'x', x: 50, games: 'any', need: 1 },
      { text: 'Win 100× your bet or more', kind: 'x', x: 100, games: 'any', need: 1 },
    ],
  },
  {
    id: 'dice',
    name: 'The Loaded Dice',
    blurb: 'Deep Drop, Mines and Idle Suits: risk it for the big ones.',
    stars: [[20, 14], [40, 10], [44, 30], [24, 34], [62, 36], [80, 48]],
    lines: [[0, 1], [1, 2], [2, 3], [3, 0], [2, 4], [4, 5]],
    missions: [
      { text: 'Play 30 rounds of Deep Drop', kind: 'rounds', games: 'deepdrop', need: 30 },
      { text: 'Play 30 rounds of Mines', kind: 'rounds', games: 'mines', need: 30 },
      { text: 'Play 50 hands of Idle Suits', kind: 'rounds', games: 'suits', need: 50 },
      { text: 'Win 3× your bet or more in Deep Drop, 5 times', kind: 'x', x: 3, games: 'deepdrop', need: 5 },
      { text: 'Make a big flush in Idle Suits 3 times', kind: 'feat', feat: 'flush', games: 'suits', need: 3 },
      { text: 'Open the Gem Vault in Mines', kind: 'feat', feat: 'vault', games: 'mines', need: 1 },
    ],
  },
];

export function findConstellation(id: string): Constellation | undefined {
  return CONSTELLATIONS.find((c) => c.id === id);
}

/**
 * The three constellations offered in a week. Every three weeks each of the
 * nine comes round once, in an order drawn for that stretch.
 */
export function offerFor(week: number): string[] {
  const cycle = Math.floor(week / 3);
  const ids = CONSTELLATIONS.map((c) => c.id);
  const rng = new Rng('lucky-stars', cycle);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
  }
  const at = (((week % 3) + 3) % 3) * 3;
  return ids.slice(at, at + 3);
}

// ---------------------------------------------------------------- the track

export type Reward =
  | { kind: 'tokens'; n: number }
  | { kind: 'pulls'; n: number }
  /** Tokens earned count double for this many minutes. */
  | { kind: 'boost'; minutes: number }
  | { kind: 'charm'; slot: 0 | 1 }
  | { kind: 'back'; slot: 0 | 1 };

export interface TrackTier {
  dust: number;
  reward: Reward;
}

/** The season's track: the stardust each tier takes, and what it gives. A perfect season has 56. */
export const TRACK: readonly TrackTier[] = [
  { dust: 3, reward: { kind: 'tokens', n: 200 } },
  { dust: 6, reward: { kind: 'pulls', n: 2 } },
  { dust: 10, reward: { kind: 'boost', minutes: 60 } },
  { dust: 14, reward: { kind: 'back', slot: 0 } },
  { dust: 18, reward: { kind: 'tokens', n: 500 } },
  { dust: 22, reward: { kind: 'charm', slot: 0 } },
  { dust: 26, reward: { kind: 'pulls', n: 5 } },
  { dust: 30, reward: { kind: 'boost', minutes: 180 } },
  { dust: 34, reward: { kind: 'back', slot: 1 } },
  { dust: 38, reward: { kind: 'tokens', n: 1000 } },
  { dust: 43, reward: { kind: 'pulls', n: 10 } },
  { dust: 48, reward: { kind: 'charm', slot: 1 } },
];

/** The Starbound charms, two a season in turn. Found only on the track. */
export const STARBOUND = ['north-star', 'shooting-star', 'star-sapphire', 'comet-tail'];
/** The card backs, two a season in turn. Found only on the track. */
export const CARD_BACKS = ['midnight', 'aurora', 'nebula', 'eclipse'];

/** A season's Starbound charm or card back, by its slot on the track. */
export function seasonCharm(season: number, slot: 0 | 1): string {
  return STARBOUND[(season * 2 + slot) % STARBOUND.length]!;
}

export function seasonBack(season: number, slot: 0 | 1): string {
  return CARD_BACKS[(season * 2 + slot) % CARD_BACKS.length]!;
}

// ---------------------------------------------------------------- state

/** A player's Lucky Stars: this week's constellations, the season's stardust, and what's been won. */
export interface PassState {
  /** The week the progress is for. */
  week: number;
  /** The constellation picked this week, if any. */
  chosen: string | null;
  /** Each constellation's count toward each star's mission this week: all three until one is picked. */
  progress: Record<string, number[]>;
  /** Stars lit this week, by index in the chosen constellation. */
  lit: number[];
  /** The games played this week, for the variety missions. */
  played: string[];
  season: number;
  dust: number;
  /** Tiers of the season's track claimed. */
  claimed: number[];
  /** Free pulls at the Charm Machine, kept until used. */
  freePulls: number;
  /** Tokens count double until then. */
  boostUntil: number;
  /** Card backs won, kept for good. */
  backs: string[];
}

export function freshPass(now: number): PassState {
  const week = weekIndex(now);
  return { week, chosen: null, progress: {}, lit: [], played: [], season: seasonOf(week), dust: 0, claimed: [], freePulls: 0, boostUntil: 0, backs: [] };
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const int = (v: unknown, fallback = 0): number => (typeof v === 'number' && Number.isInteger(v) ? v : fallback);
const count = (v: unknown): number => Math.max(0, int(v));
const ints = (v: unknown, max: number): number[] => (Array.isArray(v) ? [...new Set(v.filter((n): n is number => Number.isInteger(n) && n >= 0 && n < max))].sort((a, b) => a - b) : []);

/** A pass read from storage: anything malformed at its fresh value. */
export function readPass(raw: unknown, now: number): PassState {
  if (!raw || typeof raw !== 'object') return freshPass(now);
  const p = obj(raw);
  const progress: Record<string, number[]> = {};
  for (const [id, list] of Object.entries(obj(p.progress))) {
    if (findConstellation(id) && Array.isArray(list)) progress[id] = Array.from({ length: 6 }, (_, i) => Math.max(0, Number(list[i]) || 0));
  }
  const chosen = typeof p.chosen === 'string' && findConstellation(p.chosen) ? p.chosen : null;
  return {
    week: int(p.week, weekIndex(now)),
    chosen,
    progress,
    lit: chosen ? ints(p.lit, 6) : [],
    played: Array.isArray(p.played) ? [...new Set(p.played.filter((g): g is string => typeof g === 'string').map((g) => g.slice(0, 20)))].slice(0, 40) : [],
    season: int(p.season, seasonOf(weekIndex(now))),
    dust: count(p.dust),
    claimed: ints(p.claimed, TRACK.length),
    freePulls: count(p.freePulls),
    boostUntil: count(p.boostUntil),
    backs: Array.isArray(p.backs) ? CARD_BACKS.filter((b) => (p.backs as unknown[]).includes(b)) : [],
  };
}

/** What claiming a reward adds to a player: Tokens, free pulls, a boost, a charm, a card back. */
export interface Grant {
  tokens: number;
  pulls: number;
  /** Minutes of boost. */
  boost: number;
  charms: string[];
  backs: string[];
}

const noGrant = (): Grant => ({ tokens: 0, pulls: 0, boost: 0, charms: [], backs: [] });

function grantOf(reward: Reward, season: number): Grant {
  const g = noGrant();
  if (reward.kind === 'tokens') g.tokens = reward.n;
  else if (reward.kind === 'pulls') g.pulls = reward.n;
  else if (reward.kind === 'boost') g.boost = reward.minutes;
  else if (reward.kind === 'charm') g.charms.push(seasonCharm(season, reward.slot));
  else g.backs.push(seasonBack(season, reward.slot));
  return g;
}

/** The tiers reached and not yet claimed. */
export function claimable(pass: PassState): number[] {
  return TRACK.map((t, i) => (pass.dust >= t.dust && !pass.claimed.includes(i) ? i : -1)).filter((i) => i >= 0);
}

/** The minimal player shape the pass needs: its own state, and Tokens and charms to pay into. */
interface Holder {
  pass: PassState;
  meta: { tokens: number; lifetimeTokens: number; collection: Record<string, number> };
}

/** Pays a grant into a player. */
function pay<S extends Holder>(state: S, g: Grant, now: number): S {
  const collection = { ...state.meta.collection };
  for (const id of g.charms) collection[id] = (collection[id] ?? 0) + 1;
  const p = state.pass;
  return {
    ...state,
    meta: { ...state.meta, tokens: state.meta.tokens + g.tokens, lifetimeTokens: state.meta.lifetimeTokens + g.tokens, collection },
    pass: {
      ...p,
      freePulls: p.freePulls + g.pulls,
      boostUntil: g.boost ? Math.max(p.boostUntil, now) + g.boost * 60_000 : p.boostUntil,
      backs: CARD_BACKS.filter((b) => p.backs.includes(b) || g.backs.includes(b)),
    },
  };
}

/** Claims tiers of the season's track that have been reached. */
export function claimTiers<S extends Holder>(state: S, tiers: number[], now: number): S {
  let next = state;
  for (const i of tiers) {
    const tier = TRACK[i];
    if (!tier || next.pass.dust < tier.dust || next.pass.claimed.includes(i)) continue;
    next = pay(next, grantOf(tier.reward, next.pass.season), now);
    next = { ...next, pass: { ...next.pass, claimed: [...next.pass.claimed, i].sort((a, b) => a - b) } };
  }
  return next;
}

/**
 * The pass as of `now`: a new week starts the constellations over; a new
 * season claims whatever the last one reached and wasn't claimed, and starts
 * the track over. Free pulls, the boost and card backs carry on.
 */
export function rollPass<S extends Holder>(state: S, now: number): S {
  const week = weekIndex(now);
  const p = state.pass;
  if (p.week === week) return state;
  let next = state;
  const season = seasonOf(week);
  if (p.season !== season) {
    next = claimTiers(next, claimable(p), now);
    next = { ...next, pass: { ...next.pass, season, dust: 0, claimed: [] } };
  }
  return { ...next, pass: { ...next.pass, week, chosen: null, progress: {}, lit: [], played: [] } };
}

/** The constellations counted this week: the one picked, or all three offered. */
function counted(p: PassState): string[] {
  return p.chosen ? [p.chosen] : offerFor(p.week);
}

/** The feats in a round's report, its own and those read from its other fields. */
function featsOf(report: RoundReport): Set<string> {
  const feats = new Set<string>(report.feats ?? []);
  if (report.blackjack) feats.add('blackjack');
  if (report.flush) feats.add('flush');
  return feats;
}

function inGroup(games: string, game: string): boolean {
  const group = GROUPS[games];
  if (group === null) return true;
  return group ? group.includes(game) : games === game;
}

/** What one round adds to a mission's count. */
function step(m: Mission, report: RoundReport, net: number, tokens: number, feats: Set<string>): number {
  if (!inGroup(m.games, report.game)) return 0;
  switch (m.kind) {
    case 'rounds':
      return 1;
    case 'wins':
      return net > 0 ? 1 : 0;
    case 'x':
      return net >= (m.x ?? 1) ? 1 : 0;
    case 'feat':
      return m.feat && feats.has(m.feat) ? 1 : 0;
    case 'hand':
      return typeof report.tier === 'number' && report.tier >= (m.tier ?? 0) ? 1 : 0;
    case 'tokens':
      return tokens;
    default:
      return 0;
  }
}

/** Lights the chosen constellation's stars whose missions are done, paying each. */
function light<S extends Holder>(state: S, now: number): S {
  const p = state.pass;
  const c = p.chosen ? findConstellation(p.chosen) : undefined;
  if (!c) return state;
  const counts = p.progress[c.id] ?? [];
  const fresh = c.missions.map((m, i) => (!p.lit.includes(i) && (counts[i] ?? 0) >= m.need ? i : -1)).filter((i) => i >= 0);
  if (!fresh.length) return state;
  const lit = [...p.lit, ...fresh].sort((a, b) => a - b);
  const g = noGrant();
  let dust = 0;
  for (const i of fresh) {
    g.tokens += STAR_TOKENS[i]!;
    dust += STAR_DUST[i]!;
  }
  if (lit.length === c.missions.length) {
    dust += FULL_DUST;
    g.pulls += FULL_PULLS;
  }
  const next = pay(state, g, now);
  return { ...next, pass: { ...next.pass, lit, dust: next.pass.dust + dust } };
}

/**
 * A settled round counts toward this week's missions: `net` in bets (charms'
 * cash included), `tokens` the Tokens it earned. Stars finished light at once.
 */
export function trackPass<S extends Holder>(state: S, report: RoundReport, net: number, tokens: number, now: number): S {
  let next = rollPass(state, now);
  const p = next.pass;
  const played = p.played.includes(report.game) ? p.played : [...p.played, report.game].slice(-40);
  const feats = featsOf(report);
  const progress = { ...p.progress };
  for (const id of counted(p)) {
    const c = findConstellation(id);
    if (!c) continue;
    const old = progress[id] ?? [0, 0, 0, 0, 0, 0];
    progress[id] = c.missions.map((m, i) => {
      // Kept to its need, so a count never runs away.
      return Math.min(m.need, m.kind === 'games' ? played.length : old[i]! + step(m, report, net, tokens, feats));
    });
  }
  next = { ...next, pass: { ...p, progress, played } };
  return light(next, now);
}

/** Picks this week's constellation: one of the three offered, once a week. Its stars already done light. */
export function choosePass<S extends Holder>(state: S, id: string, now: number): S | null {
  const next = rollPass(state, now);
  const p = next.pass;
  if (p.chosen || !offerFor(p.week).includes(id)) return null;
  const progress = { [id]: p.progress[id] ?? [0, 0, 0, 0, 0, 0] };
  return light({ ...next, pass: { ...p, chosen: id, progress } }, now);
}

/** Uses free pulls, if there are enough: null if not. */
export function useFreePulls<S extends Holder>(state: S, n: number): S | null {
  if (state.pass.freePulls < n) return null;
  return { ...state, pass: { ...state.pass, freePulls: state.pass.freePulls - n } };
}

/** Tokens count double while a boost runs. */
export function tokenBoost(pass: PassState, now: number): number {
  return now < pass.boostUntil ? 2 : 1;
}

/** When this week's constellations end, and this season's track. */
export function passClock(now: number): { weekEnds: number; seasonEnds: number; week: number; weekOfSeason: number; season: number } {
  const week = weekIndex(now);
  const season = seasonOf(week);
  return { week, season, weekOfSeason: week - season * SEASON_WEEKS + 1, weekEnds: weekStart(week + 1), seasonEnds: weekStart((season + 1) * SEASON_WEEKS) };
}

/** The pit boss, for testing: the first `n` missions of the constellations counted this week are done. */
export function finishMissions<S extends Holder>(state: S, n: number, now: number): S {
  const next = rollPass(state, now);
  const p = next.pass;
  const progress = { ...p.progress };
  for (const id of counted(p)) {
    const c = findConstellation(id)!;
    const old = progress[id] ?? [0, 0, 0, 0, 0, 0];
    progress[id] = c.missions.map((m, i) => (i < n ? m.need : old[i]!));
  }
  return light({ ...next, pass: { ...p, progress } }, now);
}
