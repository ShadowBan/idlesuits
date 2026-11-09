import { cleanTuning, ENGINE_TUNING_KEYS, gameValue, rulesFor, type EngineTuning } from '@idlesuits/engine';
import { PULL_COST, TEN_PULL_COST } from '@idlesuits/sim';
import { api } from './api';
import { roomTuning } from './rooms';
import { load, save } from './save';

/**
 * Gameplay numbers the admin panel can change while testing, saved in the
 * browser. Every one defaults to the game as designed; the code reads them
 * here rather than from its constants wherever one can be tuned.
 */
export interface Knob {
  key: keyof TuningValues;
  label: string;
  hint: string;
  min: number;
  max: number;
  step: number;
}

export interface TuningValues {
  tokenRate: number;
  pullCost: number;
  tenPullCost: number;
  secretOdds: number;
  slotCostScale: number;
  roomOpensAt: number;
  roomTokenBonus: number;
  buyIn: number;
  speedBoost: number;
  /** Blind hands at every poker table, or -1 for what the charms give. */
  blindHands: number;
  /** Slot machines' payback, in percent, with the progressives at their seeds. */
  slotPayback: number;
  /** × what every hand adds to the progressive jackpots. */
  jackpotGrowth: number;
  /** The instant games' payback, in percent: Mines, the fishing line and Plinko. */
  instantPayback: number;
}

export const TUNING_DEFAULTS: Readonly<TuningValues> = {
  tokenRate: 1,
  pullCost: PULL_COST,
  tenPullCost: TEN_PULL_COST,
  secretOdds: 1,
  slotCostScale: 1,
  roomOpensAt: roomTuning.opensAtBets,
  roomTokenBonus: roomTuning.tokenBonusPerRoom,
  buyIn: 500,
  speedBoost: 1,
  blindHands: -1,
  slotPayback: 94,
  jackpotGrowth: 1,
  instantPayback: 97,
};

export const KNOBS: readonly Knob[] = [
  { key: 'tokenRate', label: 'Token rate', hint: '× every Token earned', min: 0, max: 1000, step: 0.1 },
  { key: 'pullCost', label: 'Pull cost', hint: 'Tokens for one capsule', min: 1, max: 100000, step: 1 },
  { key: 'tenPullCost', label: 'Ten-pull cost', hint: 'Tokens for ten', min: 1, max: 1000000, step: 1 },
  { key: 'secretOdds', label: 'Secret odds', hint: '× each Secret charm’s chance', min: 0, max: 100000, step: 1 },
  { key: 'slotCostScale', label: 'Slot costs', hint: '× the price of each slot', min: 0, max: 100, step: 0.1 },
  { key: 'roomOpensAt', label: 'Room opens at', hint: 'minimum bets in the bank', min: 1, max: 1000, step: 1 },
  { key: 'roomTokenBonus', label: 'Room Token bonus', hint: '+ per room up', min: 0, max: 10, step: 0.05 },
  { key: 'buyIn', label: 'Buy-in', hint: 'a fresh stake, in dollars', min: 5, max: 1e9, step: 5 },
  { key: 'speedBoost', label: 'Speed boost', hint: '× every table’s pace', min: 0.25, max: 50, step: 0.25 },
  { key: 'blindHands', label: 'Blind hands', hint: 'at poker tables; −1 = from charms', min: -1, max: 2, step: 1 },
  { key: 'slotPayback', label: 'Slot payback', hint: '% returned, jackpots at their seeds', min: 50, max: 150, step: 0.5 },
  { key: 'jackpotGrowth', label: 'Jackpot growth', hint: '× what each hand adds to the progressives', min: 0, max: 1000, step: 0.5 },
  { key: 'instantPayback', label: 'Instant payback', hint: '% returned by Mines, the fishing line and Plinko', min: 50, max: 150, step: 0.5 },
];

type Overrides = Record<string, number | boolean>;

const isEngineKey = (key: string): key is keyof EngineTuning => (ENGINE_TUNING_KEYS as string[]).includes(key);

class Tuning {
  /** This browser's own numbers: all of them for a guest, the ones the server doesn't keep for a member. */
  private local = $state<TuningValues>({ ...TUNING_DEFAULTS, ...load<Partial<TuningValues>>('tuning', {}) });
  /** A member's: the server's numbers that decide rounds and prices, which the pit boss sets for everyone. */
  server = $state.raw<EngineTuning | null>(null);
  /** This browser's own rule overrides, by game id and path in its rules object: a guest's. */
  private localGames = $state<Record<string, Overrides>>(load('tuning.games', {}));

  constructor() {
    this.sync();
  }

  /** The numbers in force: the server's where it keeps them, this browser's for the rest. */
  get values(): TuningValues {
    if (!this.server) return this.local;
    const out = { ...this.local };
    for (const key of ENGINE_TUNING_KEYS) out[key] = this.server[key];
    return out;
  }

  /** Each game's rule overrides in force: the server's for a member, by game id and path in its rules object. */
  get games(): Record<string, Overrides> {
    return this.server ? this.server.games : this.localGames;
  }

  /** A guest's tuning as the engine reads it, worked out again only when it changes. */
  private localEngine = $derived(cleanTuning({ ...$state.snapshot(this.local), games: $state.snapshot(this.localGames) }));

  /** The numbers the engine reads, as in force here. */
  get engine(): EngineTuning {
    return this.server ?? this.localEngine;
  }

  /** Signed in: the server's numbers take over the ones it keeps. Null when signed out. */
  useServer(server: EngineTuning | null) {
    this.server = server;
    this.sync();
  }

  set<K extends keyof TuningValues>(key: K, value: TuningValues[K]) {
    if (!Number.isFinite(value)) return;
    if (this.server && isEngineKey(key)) return this.setServer({ ...this.server, [key]: value });
    this.local[key] = value;
    this.persist();
  }

  reset() {
    this.local = { ...TUNING_DEFAULTS };
    this.persist();
    if (this.server) void this.setServer(cleanTuning({}));
  }

  /** The pit boss changes the server's numbers: for every member, at once. */
  private async setServer(next: EngineTuning) {
    const before = this.server;
    this.server = cleanTuning(next);
    this.sync();
    try {
      const { tuning } = await api<{ tuning: EngineTuning }>('/admin/tuning', { method: 'PUT', body: { tuning: this.server } });
      this.server = tuning;
    } catch {
      // Not the pit boss, or offline: the numbers go back.
      this.server = before;
    }
    this.sync();
  }

  /** A game's rules with any overrides set: the same object until they change, so strategy can be cached on it. */
  rules<T extends object>(id: string, base: T): T {
    return rulesFor(this.engine, id, base);
  }

  /** One override for a game, or `fallback` if it hasn't been set. */
  gameValue<V extends number | boolean>(id: string, path: string, fallback: V): V {
    return gameValue(this.engine, id, path, fallback);
  }

  setRule(id: string, path: string, value: number | boolean, designed: number | boolean) {
    if (typeof value === 'number' && !Number.isFinite(value)) return;
    const game = { ...this.games[id] };
    if (value === designed) delete game[path];
    else game[path] = value;
    this.setGames({ ...this.games, [id]: game });
  }

  resetGame(id: string) {
    const { [id]: _, ...rest } = this.games;
    this.setGames(rest);
  }

  /** A member's rule overrides are the server's (the pit boss sets them for everyone); a guest's are this browser's. */
  private setGames(games: Record<string, Overrides>) {
    if (this.server) {
      void this.setServer({ ...this.server, games });
      return;
    }
    this.localGames = games;
    save('tuning.games', $state.snapshot(this.localGames));
  }

  /** Knobs moved off their defaults. */
  get changed(): number {
    return KNOBS.filter((k) => this.values[k.key] !== TUNING_DEFAULTS[k.key]).length;
  }

  private persist() {
    this.sync();
    save('tuning', $state.snapshot(this.local));
  }

  /** The room ladder is pure; it reads its two numbers from here. */
  private sync() {
    roomTuning.opensAtBets = this.values.roomOpensAt;
    roomTuning.tokenBonusPerRoom = this.values.roomTokenBonus;
  }
}

export const tuning = new Tuning();
