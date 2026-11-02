import { MIDNIGHT_VAULT, type JackpotMeters } from '@idlesuits/sim';
import { load, saveSoon } from './save';
import { tuning } from './tuning.svelte';

/** Where the meters start, and go back to once hit, in total bets. */
export const JACKPOT_SEEDS: JackpotMeters = { major: MIDNIGHT_VAULT.jackpots.major, grand: MIDNIGHT_VAULT.jackpots.grand };

/** The Major must hit before it reaches this, in total bets. */
export const MAJOR_CAP = JACKPOT_SEEDS.major * 1.5;

/** What every hand anywhere in the casino adds to each meter, in total bets, before the pit boss's growth knob. */
const PER_HAND: JackpotMeters = { major: 0.003, grand: 0.04 };
/** What the rest of the link adds every second the casino is open: other players, as on a real bank of machines. */
const PER_SECOND: JackpotMeters = { major: 0.002, grand: 0.01 };

/** A jackpot someone hit, for the floor's record. */
export interface JackpotHit {
  tier: 'major' | 'grand';
  /** The meter when it hit, in bets, and what it paid in dollars (saved as a string: it can be any size). */
  x: number;
  paid: string;
  machine: string;
  /** Date.now(). */
  at: number;
  /** Won by the must-hit-by draw rather than coins. */
  mystery?: boolean;
}

function pickHitPoint(from: number): number {
  return from + Math.random() * (MAJOR_CAP - from);
}

/**
 * The casino-wide progressive jackpots, linked across every slot machine as
 * on a bank of linked machines. Every hand or spin at any table or machine
 * adds to them, and so does the rest of the link, a little every second;
 * whichever machine hits one pays it and starts it over.
 *
 * The meters are multiples of the bet, so they mean the same in every room:
 * a Grand of 2,400× pays $12,000 on a $5 spin and $1.2M on a $500 one.
 *
 * The Major is also a must-hit-by jackpot: it pays on the first spin after it
 * passes a hidden point, drawn somewhere between its seed and its cap, so it
 * always pays before the cap. Coins can still hit it sooner.
 */
class Jackpots {
  major = $state(JACKPOT_SEEDS.major);
  grand = $state(JACKPOT_SEEDS.grand);
  /** The hidden point where the Major must hit. */
  private majorAt: number;
  history = $state<JackpotHit[]>([]);
  /** Counts hits, so a meter can flash when it resets. */
  hits = $state(0);

  constructor() {
    const saved = load<Partial<JackpotMeters & { majorAt: number; history: JackpotHit[] }>>('jackpots', {});
    if (Number.isFinite(saved.major) && saved.major! >= JACKPOT_SEEDS.major) this.major = Math.min(saved.major!, MAJOR_CAP);
    if (Number.isFinite(saved.grand) && saved.grand! >= JACKPOT_SEEDS.grand) this.grand = saved.grand!;
    this.majorAt =
      Number.isFinite(saved.majorAt) && saved.majorAt! >= JACKPOT_SEEDS.major && saved.majorAt! <= MAJOR_CAP
        ? saved.majorAt!
        : pickHitPoint(this.major);
    this.history = Array.isArray(saved.history) ? saved.history.slice(0, 10) : [];
    // The rest of the link plays on while the casino is open.
    if (typeof window !== 'undefined') setInterval(() => this.grow(PER_SECOND), 1000);
  }

  get meters(): JackpotMeters {
    return { major: this.major, grand: this.grand };
  }

  /** The Major has passed its hidden point: the next spin on any machine wins it. */
  get majorDue(): boolean {
    return this.major >= this.majorAt;
  }

  /** A hand settled somewhere in the casino. */
  contribute() {
    this.grow(PER_HAND);
  }

  private grow(by: JackpotMeters) {
    const rate = tuning.values.jackpotGrowth;
    if (rate <= 0) return;
    this.major = Math.min(MAJOR_CAP, this.major + by.major * rate);
    this.grand += by.grand * rate;
    this.persist();
  }

  /** A machine hit one: it's recorded and starts over from its seed. */
  hit(hit: Omit<JackpotHit, 'at'>) {
    this.history = [{ ...hit, at: Date.now() }, ...this.history].slice(0, 10);
    this[hit.tier] = JACKPOT_SEEDS[hit.tier];
    if (hit.tier === 'major') this.majorAt = pickHitPoint(this.major);
    this.hits++;
    this.persist();
  }

  /** Admin: set a meter directly. */
  set(tier: 'major' | 'grand', value: number) {
    this[tier] = Math.max(JACKPOT_SEEDS[tier], tier === 'major' ? Math.min(value, MAJOR_CAP) : value);
    this.persist();
  }

  /** Admin: the Major hits on the next spin. */
  makeMajorDue() {
    this.majorAt = this.major;
    this.persist();
  }

  private persist() {
    saveSoon('jackpots', () => ({ major: this.major, grand: this.grand, majorAt: this.majorAt, history: $state.snapshot(this.history) }));
  }
}

export const jackpots = new Jackpots();

/** The pit boss's slot switches, for testing: never saved. */
export const slotTest = $state({ forceFeature: false });
