import { Clock } from './clock';
import { tuning } from './tuning.svelte';
import { autoplay } from './autoplay.svelte';
import { load, save } from './save';

export type SpeedMode = 'smart' | '1x' | '2x' | '5x';
export const SPEEDS: SpeedMode[] = ['smart', '1x', '2x', '5x'];
/** All a table's chrome needs from its sequencer. */
export interface SpeedControl {
  speed: SpeedMode;
}

const FACTOR: Record<SpeedMode, number> = { smart: 1, '1x': 1, '2x': 2, '5x': 5 };

/**
 * The pacing and waiting a table needs: pausable delays scaled by speed, and
 * a way to stop and wait for the player. A reset cancels everything pending,
 * so a game can be abandoned mid-round without leaving a loop behind.
 */
export class Sequencer<Answer> {
  #speed = $state<SpeedMode>('smart');
  /** Where the speed is saved, once `remember` has been called. */
  private key: string | null = null;

  get speed(): SpeedMode {
    return this.#speed;
  }

  set speed(value: SpeedMode) {
    this.#speed = value;
    if (this.key) save(`speed.${this.key}`, value);
  }

  /** Saves this table's speed in the browser, and brings back the last one. */
  remember(key: string) {
    this.key = key;
    const saved = load<SpeedMode | null>(`speed.${key}`, null);
    if (saved && SPEEDS.includes(saved)) this.#speed = saved;
  }
  paused = $state(false);
  /** What the table is waiting on the player for, if anything. */
  awaiting = $state<string | null>(null);

  private readonly clock = new Clock();
  private resolve: ((answer: Answer | null) => void) | null = null;
  disposed = false;

  /** How long, in real milliseconds, `wait(ms)` takes at the current speed: for an animation that must last exactly as long. */
  duration(ms: number): number {
    return ms / FACTOR[this.speed] / tuning.values.speedBoost;
  }

  /** Waits `ms` at 1×, scaled by speed. False if the game was reset meanwhile. */
  async wait(ms: number): Promise<boolean> {
    if (!(await this.clock.wait(ms / FACTOR[this.speed]))) return false;
    // Auto play holding a big win: the table waits on, in real time, until the hold is over.
    const hold = autoplay.holdLeft();
    return hold > 0 ? this.clock.wait(hold, false) : true;
  }

  /**
   * Waits `ms` in real time, whatever the speed or the admin panel's boost,
   * for a moment meant to play out in full (a slot bonus). Pausable like any wait.
   */
  waitFull(ms: number): Promise<boolean> {
    return this.clock.wait(ms, false);
  }

  /** Waits for the player; null means the game was reset or closed. */
  ask(kind: string): Promise<Answer | null> {
    this.awaiting = kind;
    return new Promise((resolve) => (this.resolve = resolve));
  }

  answer(value: Answer | null) {
    const resolve = this.resolve;
    this.resolve = null;
    this.awaiting = null;
    resolve?.(value);
  }

  togglePause() {
    this.paused = !this.paused;
    this.clock.paused = this.paused;
  }

  /** Cancels any wait in progress; the loop that was waiting sees false or null. */
  reset() {
    this.answer(null);
    this.clock.reset();
    this.paused = false;
  }

  dispose() {
    this.disposed = true;
    this.reset();
  }
}
