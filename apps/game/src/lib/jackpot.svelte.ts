import { MIDNIGHT_VAULT, type JackpotMeters } from '@idlesuits/sim';
import { load, saveSoon } from './save';
import { tuning } from './tuning.svelte';

/** Where the meters start, and go back to once hit, in total bets. */
export const JACKPOT_SEEDS: JackpotMeters = { major: MIDNIGHT_VAULT.jackpots.major, grand: MIDNIGHT_VAULT.jackpots.grand };

/** What every hand anywhere in the casino adds to each meter, in total bets, before the pit boss's growth knob. */
const GROWTH: JackpotMeters = { major: 0.01, grand: 0.04 };

/**
 * The casino-wide progressive jackpots, linked across every slot machine as
 * on a bank of linked machines. Every hand or spin at any table or machine
 * adds to them, and whichever machine hits one pays it and starts it over.
 *
 * The meters are multiples of the bet, so they mean the same in every room:
 * a Grand of 2,400× pays $12,000 on a $5 spin and $1.2M on a $500 one.
 */
class Jackpots {
  major = $state(JACKPOT_SEEDS.major);
  grand = $state(JACKPOT_SEEDS.grand);
  /** Counts hits, so a meter can flash when it resets. */
  hits = $state(0);

  constructor() {
    const saved = load<Partial<JackpotMeters>>('jackpots', {});
    if (Number.isFinite(saved.major) && saved.major! >= JACKPOT_SEEDS.major) this.major = saved.major!;
    if (Number.isFinite(saved.grand) && saved.grand! >= JACKPOT_SEEDS.grand) this.grand = saved.grand!;
  }

  get meters(): JackpotMeters {
    return { major: this.major, grand: this.grand };
  }

  /** A hand settled somewhere in the casino. */
  contribute() {
    const rate = tuning.values.jackpotGrowth;
    if (rate <= 0) return;
    this.major += GROWTH.major * rate;
    this.grand += GROWTH.grand * rate;
    this.persist();
  }

  /** A machine hit one: it starts over from its seed. */
  hit(tier: 'major' | 'grand') {
    this[tier] = JACKPOT_SEEDS[tier];
    this.hits++;
    this.persist();
  }

  /** Admin: set a meter directly. */
  set(tier: 'major' | 'grand', value: number) {
    this[tier] = Math.max(JACKPOT_SEEDS[tier], value);
    this.persist();
  }

  private persist() {
    saveSoon('jackpots', () => ({ major: this.major, grand: this.grand }));
  }
}

export const jackpots = new Jackpots();

/** The pit boss's slot switches, for testing: never saved. */
export const slotTest = $state({ forceFeature: false });
