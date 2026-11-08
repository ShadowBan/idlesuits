import { Decimal } from './money';
import { load, saveSoon } from './save';

/** What auto play does on its own, at every table: saved, and the same wherever the player sits. */
export interface AutoSettings {
  /** Hold on a big win: the next round waits a few seconds so the win can be seen. */
  holdBig: boolean;
  /** A win of this many bets or more is big. */
  holdX: number;
  /** How long a big win holds, in seconds. */
  holdSeconds: number;
  /** Stop on a win of `stopWinX` bets or more. */
  stopOnWin: boolean;
  stopWinX: number;
  /** Stop after `stopRounds` rounds. */
  stopAfter: boolean;
  stopRounds: number;
  /** Stop if the bank falls below `stopBelowAmount`, or reaches `stopAboveAmount`. In dollars, as strings so any size survives saving. */
  stopBelow: boolean;
  stopBelowAmount: string;
  stopAbove: boolean;
  stopAboveAmount: string;
}

export const AUTO_DEFAULTS: Readonly<AutoSettings> = {
  holdBig: true,
  holdX: 10,
  holdSeconds: 3,
  stopOnWin: false,
  stopWinX: 100,
  stopAfter: false,
  stopRounds: 100,
  stopBelow: false,
  stopBelowAmount: '100',
  stopAbove: false,
  stopAboveAmount: '10000',
};

function money(text: string): Decimal | null {
  try {
    const d = new Decimal(text);
    return d.isFinite() && d.gte(0) ? d : null;
  } catch {
    return null;
  }
}

/**
 * Auto play's own rules, shared by every table. A table's auto play turns on
 * and off through the table shell, which tells this when it starts; every
 * settled round passes through `round` (from the one call every table makes
 * to settle, `meta.settleRound`), which holds a big win and asks the shell to
 * stop when a rule says so. The hold works through the table's sequencer: its
 * next wait runs on until the hold is over.
 */
class AutoPlay {
  settings = $state<AutoSettings>({ ...AUTO_DEFAULTS, ...load<Partial<AutoSettings>>('autoplay', {}) });
  /** Auto play is running at the table the player is at. */
  active = $state(false);
  /** Rounds settled since auto play last started. */
  rounds = $state(0);
  /** Waits run on until this time (performance.now()), to hold a big win. */
  holdUntil = 0;
  /** A big win is being held: its size in bets, for the table to show. */
  holding = $state<number | null>(null);
  /** Goes up each time a rule stops auto play; the shell watches it. */
  stops = $state(0);
  /** Why auto play last stopped, for a moment on screen. */
  reason = $state<string | null>(null);
  private holdTimer: ReturnType<typeof setTimeout> | null = null;

  set<K extends keyof AutoSettings>(key: K, value: AutoSettings[K]) {
    this.settings = { ...this.settings, [key]: value };
    saveSoon('autoplay', () => $state.snapshot(this.settings));
  }

  reset() {
    this.settings = { ...AUTO_DEFAULTS };
    saveSoon('autoplay', () => $state.snapshot(this.settings));
  }

  /** Auto play has turned on or off at the table. Turning on starts the round count afresh. */
  setActive(on: boolean) {
    if (on && !this.active) {
      this.rounds = 0;
      this.reason = null;
    }
    this.active = on;
    if (!on) this.clearHold();
  }

  private clearHold() {
    this.holdUntil = 0;
    this.holding = null;
    if (this.holdTimer) clearTimeout(this.holdTimer);
    this.holdTimer = null;
  }

  /**
   * A round has settled: `net` is what it won or lost in bets (of `unit`),
   * and `bank` the bankroll after it. Holds a big win, and stops auto play when
   * a rule says so.
   */
  round(net: number, bank: Decimal) {
    if (!this.active) return;
    const s = this.settings;
    this.rounds++;
    if (s.holdBig && net >= s.holdX) {
      const ms = Math.max(0, s.holdSeconds) * 1000;
      this.holdUntil = performance.now() + ms;
      this.holding = net;
      if (this.holdTimer) clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(() => this.clearHold(), ms);
    }
    let reason: string | null = null;
    if (s.stopOnWin && net >= s.stopWinX) reason = `a win of ${net >= 100 ? net.toFixed(0) : net.toFixed(1)}× the bet`;
    else if (s.stopAfter && this.rounds >= s.stopRounds) reason = `${this.rounds} rounds`;
    else if (s.stopBelow && money(s.stopBelowAmount) && bank.lt(money(s.stopBelowAmount)!)) reason = 'the bank fell below your floor';
    else if (s.stopAbove && money(s.stopAboveAmount) && bank.gte(money(s.stopAboveAmount)!)) reason = 'the bank reached your target';
    if (reason) {
      this.reason = reason;
      this.stops++;
    }
  }

  /** How much longer a wait must run to finish holding a big win, in milliseconds. */
  holdLeft(): number {
    return this.active ? Math.max(0, this.holdUntil - performance.now()) : 0;
  }
}

export const autoplay = new AutoPlay();
