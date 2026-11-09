import { jackpotState, JACKPOT_SEEDS, MAJOR_CAP, PER_SECOND, type JackpotHit } from '@idlesuits/engine';
import type { JackpotMeters } from '@idlesuits/sim';
import { player } from './player.svelte';
import { tuning } from './tuning.svelte';

export { JACKPOT_SEEDS, MAJOR_CAP, type JackpotHit };

/** The meters creep up on screen at most this long past their last update, as the engine counts it. */
const MAX_IDLE_SECONDS = 60;

/**
 * The casino-wide progressive jackpots, linked across every slot machine, as
 * the engine keeps them (on the server, for a member): every round anywhere
 * adds to them, and so does the rest of the link, a little every second the
 * player is at it. Whichever machine hits one pays it and starts it over.
 *
 * The meters are multiples of the bet, so they mean the same in every room.
 * The Major is also a must-hit-by jackpot: it pays on the first spin after it
 * passes a hidden point, which only the engine knows.
 */
class Jackpots {
  /** Ticks every second, so the meters creep up on screen between rounds as the engine will count them. */
  private now = $state(Date.now());

  constructor() {
    if (typeof window !== 'undefined') setInterval(() => (this.now = Date.now()), 1000);
  }

  private get state() {
    return jackpotState(player.shown);
  }

  /** The meter now: as last counted, plus the link's seconds since (a minute at most). */
  private creep(tier: 'major' | 'grand'): number {
    const j = this.state;
    const seconds = j.at ? Math.min(MAX_IDLE_SECONDS, Math.max(0, (this.now - j.at) / 1000)) : 0;
    const v = j[tier] + PER_SECOND[tier] * seconds * tuning.values.jackpotGrowth;
    return tier === 'major' ? Math.min(MAJOR_CAP, v) : v;
  }

  get major(): number {
    return this.creep('major');
  }

  get grand(): number {
    return this.creep('grand');
  }

  get meters(): JackpotMeters {
    return { major: this.major, grand: this.grand };
  }

  get history(): JackpotHit[] {
    return this.state.history;
  }

  /** Pit boss: set a meter directly. */
  set(tier: 'major' | 'grand', value: number) {
    void player.act({ type: 'admin.jackpot', tier, value });
  }

  /** Pit boss: the Major hits on the next spin. */
  makeMajorDue() {
    void player.act({ type: 'admin.jackpot', due: true });
  }
}

export const jackpots = new Jackpots();

/** The pit boss's slot switches, for testing: never saved, honoured only for the pit boss. */
export const slotTest = $state({
  forceFeature: false,
  /** Fills every pot on the machine of the next spin. */
  fillPots: false,
  /** Every slot charm fires whenever it can, until switched off: nudges, wild reels, pots filled, the bonus again. */
  allCharms: false,
});
