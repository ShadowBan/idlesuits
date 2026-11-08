import { crashAt, crashLineRtp, crashPoint, CRASH_CAP, GOLD_X, isGoldenLine } from '@idlesuits/sim';
import { type Decimal } from '../../lib/money';
import { load, save } from '../../lib/save';
import { sfx } from '../../lib/sound';
import { InstantGame } from './instant.svelte';

/** The deal speed's pace on the line, so auto play at 5× isn't a slow watch. */
const PACE: Record<string, number> = { smart: 1, '1x': 1, '2x': 2, '5x': 5 };
/** After a round: how long its result holds before auto play drops again, at 1×. */
const AUTO_NEXT_MS = 1600;
/** The lowest multiplier a line can be reeled in at: an instant snap is 1.00×. */
export const MIN_REEL = 1.01;

export type LinePhase = 'idle' | 'sinking' | 'landed' | 'snapped';

/**
 * Deep Drop: Crash on a fishing line. The bet is staked as the line drops;
 * the multiplier climbs as the hook sinks, and the line snaps at the round's
 * point (drawn when it drops, from its seed). Reel in before then, by hand or
 * at auto play's marker, and the bet pays the multiplier reached.
 *
 * The line only snaps once the multiplier goes past its point, so a reel-in
 * at m is paid whenever the point is at least m: the chance is the line's
 * payback ÷ m. Golden lines (shown as they drop) pay GOLD_X times whatever
 * they land; their worth comes out of every line's payback, so together they
 * pay exactly rtp, whatever the strategy.
 */
export class CrashGame extends InstantGame {
  /** Where auto play reels in. Lines played by hand are reeled in by hand. Saved. */
  marker = $state(2);
  phase = $state<LinePhase>('idle');
  /** The multiplier now, as the hook sinks. */
  m = $state(1);
  /** Where the last line ended (reeled in, or snapped), and where it would have snapped had it stayed down. */
  result = $state<{ at: number; pay: Decimal; snap: number } | null>(null);
  /** This line is golden: whatever it lands pays double. */
  golden = $state(false);
  /** The last lines' snap points, newest first: what the deep has been doing. */
  recent = $state<number[]>(load<number[]>('deepdrop.recent', []).filter((x) => typeof x === 'number').slice(0, 14));
  private live: { round: number; bet: Decimal; snap: number } | null = null;
  private frame = 0;

  constructor() {
    super('deepdrop');
    const marker = load<number>('deepdrop.marker', 2);
    this.marker = typeof marker === 'number' && marker >= MIN_REEL && marker <= CRASH_CAP ? marker : 2;
  }

  get sinking(): boolean {
    return this.phase === 'sinking';
  }

  /** What the line pays for each 1× it lands: GOLD_X on a golden line. */
  get times(): number {
    return this.golden ? GOLD_X : 1;
  }

  /** What reeling in now pays, in dollars. */
  get reelPay(): Decimal | null {
    return this.live && this.m >= MIN_REEL ? this.live.bet.mul(this.m * this.times) : null;
  }

  setMarker(x: number) {
    if (!Number.isFinite(x)) return;
    this.marker = Math.min(CRASH_CAP, Math.max(MIN_REEL, Math.round(x * 100) / 100));
    save('deepdrop.marker', this.marker);
  }

  /** Stakes the bet and drops the line. */
  drop(): boolean {
    if (this.live) return false;
    const s = this.stake();
    if (!s) return false;
    const seed = { run: this.runSeed, round: s.round };
    const snap = crashPoint(crashLineRtp(this.rtp), seed);
    this.golden = isGoldenLine(seed);
    this.live = { ...s, snap };
    this.m = 1;
    this.result = null;
    this.phase = 'sinking';
    if (this.golden) sfx.bigWin();
    else sfx.spin();
    // An instant snap: the line parts at the surface.
    if (snap <= 1) {
      this.frame = requestAnimationFrame(() => this.end(false));
      return true;
    }
    const start = performance.now();
    const pace = PACE[this.seq.speed] ?? 1;
    let ticked = 1;
    const step = (now: number) => {
      if (!this.live) return;
      const m = crashAt((now - start) * pace);
      // It snaps only once past its point; at the point itself it can still be reeled in.
      if (m > this.live.snap) {
        this.m = this.live.snap;
        return this.end(false);
      }
      this.m = m;
      // Auto play reels in at its marker; a line played by hand waits for the player.
      if (this.autoPlay && m >= this.marker) {
        this.m = this.marker;
        return this.end(true);
      }
      if (Math.floor(m) > ticked) {
        ticked = Math.floor(m);
        sfx.tick();
      }
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
    return true;
  }

  /** Reels in by hand, at the multiplier now. */
  reelIn() {
    if (!this.live || this.m < MIN_REEL) return;
    this.end(true);
  }

  private end(landed: boolean) {
    const live = this.live;
    if (!live) return;
    cancelAnimationFrame(this.frame);
    this.live = null;
    const pay = landed ? this.m * this.times : 0;
    this.phase = landed ? 'landed' : 'snapped';
    this.result = { at: landed ? this.m : live.snap, pay: live.bet.mul(pay), snap: live.snap };
    this.recent = [live.snap, ...this.recent].slice(0, 14);
    save('deepdrop.recent', this.recent);
    if (landed) sfx.win();
    else sfx.lose();
    const gold = this.golden ? 'Golden line · ' : '';
    const text = landed ? `${gold}Reeled in ${this.m.toFixed(2)}×` : live.snap <= 1 ? `${gold}Snapped at once` : `${gold}Snapped at ${live.snap.toFixed(2)}×`;
    const sub = landed ? `line held to ${live.snap.toFixed(2)}×` : this.autoPlay ? `auto play at ${this.marker.toFixed(2)}×` : 'reeled by hand';
    const lines = landed ? [{ label: `Reeled in at ${this.m.toFixed(2)}×${this.golden ? `, golden ×${GOLD_X}` : ''}`, amount: pay }] : [];
    this.settle(live.round, live.bet, pay, text, sub, lines);
  }

  /** Auto play: line after line, reeling in at the marker. */
  private async runAuto() {
    while (this.autoPlay && !this.seq.disposed) {
      if (!this.live && !this.drop()) {
        this.autoPlay = false;
        return;
      }
      while (this.live) if (!(await this.seq.wait(100))) return;
      if (!(await this.seq.wait(AUTO_NEXT_MS))) return;
    }
  }

  setAutoPlay(on: boolean) {
    const was = this.autoPlay;
    this.autoPlay = on && this.started && !this.gameOver;
    if (this.autoPlay && !was) void this.runAuto();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    super.dispose();
  }
}
