import { deepdropProgress, MIN_REEL, type CrashReplay, type DeepDropLive, type DeepDropRound } from '@idlesuits/engine';
import { crashAt, CRASH_CAP, GOLD_X } from '@idlesuits/sim';
import { autoplay } from '../../lib/autoplay.svelte';
import { floor } from '../../lib/floor.svelte';
import { meta } from '../../lib/meta.svelte';
import { Decimal } from '../../lib/money';
import { player } from '../../lib/player.svelte';
import { load, save } from '../../lib/save';
import { sfx } from '../../lib/sound';
import { InstantGame } from './instant.svelte';

export { MIN_REEL, type CrashReplay };

/** The deal speed's pace on the line, so auto play at 5× isn't a slow watch. */
const PACE: Record<string, number> = { smart: 1, '1x': 1, '2x': 2, '5x': 5 };
/** After a round: how long its result holds before auto play drops again, at 1×. */
const AUTO_NEXT_MS = 1600;
/** Lines auto play asks for at once. */
const AUTO_BATCH = 5;

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
 *
 * The snap point is the engine's secret (the server's, for a member). A line
 * by hand sinks here while the engine watches it: reeling in asks the engine,
 * which pays it if the line held that far by its own clock, and the engine
 * says when the line snaps. Auto play's lines are reeled in at the marker,
 * set before they drop, so they're decided at once, a batch at a time.
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
  /** The line down: its stake, and the line the engine dropped (by hand), or the line it decided (auto play). */
  private live: { bet: Decimal; hand: DeepDropLive | null; decided: DeepDropRound | null; hold: number | null } | null = null;
  /** A reel-in is on its way to the engine: the line stops on screen while it goes. */
  reeling = $state(false);
  /** Why the last line couldn't drop, for a moment on screen. */
  error = $state<string | null>(null);
  /** The line that just settled, as the wins list keeps it to replay. */
  lastReplay = $state<CrashReplay | null>(null);
  /** A kept line being sunk again: nothing staked, nothing paid. */
  replaying = $state.raw<CrashReplay | null>(null);
  private frame = 0;

  constructor() {
    super('deepdrop');
    const marker = load<number>('deepdrop.marker', 2);
    this.marker = typeof marker === 'number' && marker >= MIN_REEL && marker <= CRASH_CAP ? marker : 2;
    // A line left down (the page closed mid-drop): it sinks on, for the engine to call.
    const hand = deepdropProgress(player.truth).live;
    if (hand) this.sinkHand(hand, Math.max(0, Date.now() - hand.startedAt));
  }

  get canBet(): boolean {
    return player.ready && super.canBet;
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

  /** Drops a line by hand: the engine stakes it and keeps its snap point. */
  drop(): boolean {
    if (this.live || this.phase === 'sinking' || !this.canBet) return false;
    // A replay holding its catch steps aside for a real line.
    this.replaying = null;
    void this.dropHand();
    return true;
  }

  private async dropHand() {
    const pace = PACE[this.seq.speed] ?? 1;
    this.live = { bet: this.bet, hand: null, decided: null, hold: null };
    const out = await player.act({ type: 'deepdrop.drop', step: this.step, room: floor.current, pace });
    if (!out.ok || !out.result || !('live' in out.result)) {
      this.live = null;
      this.error = out.ok ? 'The line didn’t drop.' : out.error;
      return;
    }
    this.error = null;
    const r = out.result;
    // An instant snap comes back settled.
    if (r.rounds[0]) {
      this.golden = r.rounds[0].golden;
      this.m = 1;
      this.phase = 'sinking';
      this.live = { bet: new Decimal(r.rounds[0].bet), hand: null, decided: r.rounds[0], hold: null };
      this.frame = requestAnimationFrame(() => this.end(r.rounds[0]!));
      return;
    }
    if (r.live) this.sinkHand(r.live, 0);
  }

  /** A line by hand sinks until it's reeled in, or the engine says it snapped. */
  private sinkHand(hand: DeepDropLive, elapsed: number) {
    this.live = { bet: new Decimal(hand.bet), hand, decided: null, hold: null };
    this.golden = hand.golden;
    this.result = null;
    this.phase = 'sinking';
    if (this.golden) sfx.bigWin();
    else sfx.spin();
    const start = performance.now() - elapsed;
    let ticked = 1;
    const step = (now: number) => {
      if (this.live?.hand !== hand) return;
      if (!this.reeling) {
        const m = crashAt((now - start) * hand.pace);
        if (Math.floor(m) > ticked) {
          ticked = Math.floor(m);
          sfx.tick();
        }
        this.m = Math.min(m, CRASH_CAP);
      }
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
    void this.watch(hand);
  }

  /** The engine says when the line snaps: it ends there, unless it's been reeled in first. */
  private async watch(hand: DeepDropLive) {
    const out = await player.watch();
    if (this.live?.hand !== hand) return;
    const r = out.ok && out.result && 'live' in out.result ? out.result.rounds[0] : undefined;
    if (r) this.end(r);
  }

  /** Reels in by hand, at the multiplier now: the engine pays it if the line held that far. */
  async reelIn() {
    const live = this.live;
    if (!live?.hand || this.reeling || this.m < MIN_REEL) return;
    this.reeling = true;
    const out = await player.act({ type: 'deepdrop.reel', at: this.m });
    this.reeling = false;
    if (this.live !== live) return;
    const r = out.ok && out.result && 'live' in out.result ? out.result.rounds[0] : undefined;
    if (r) this.end(r);
  }

  /** A line has ended, as the engine settled it: reeled in, or snapped. */
  private end(r: DeepDropRound) {
    const live = this.live;
    if (!live) return;
    cancelAnimationFrame(this.frame);
    this.live = null;
    const bet = new Decimal(r.bet);
    this.m = r.at;
    this.phase = r.landed ? 'landed' : 'snapped';
    this.result = { at: r.at, pay: bet.mul(r.x), snap: r.snap };
    this.recent = [r.snap, ...this.recent].slice(0, 14);
    save('deepdrop.recent', this.recent);
    if (r.landed) sfx.win();
    else sfx.lose();
    if (live.hold !== null) player.reveal(live.hold);
    this.lastReplay = r.replay;
    meta.showFlash(r.triggers, r.tokens, bet);
    this.record({ bet, pay: r.x, units: r.net, lines: r.lines, text: r.text, sub: r.sub, onHouse: r.onHouse });
    autoplay.round(r.net, this.bank);
  }

  /** Shows a line auto play's batch decided: it sinks to the marker, or to its snap. Resolves when it's over. */
  private sinkDecided(r: DeepDropRound, hold: number): Promise<void> {
    return new Promise((resolve) => {
      player.start(hold, r);
      this.live = { bet: new Decimal(r.bet), hand: null, decided: r, hold };
      this.golden = r.golden;
      this.m = 1;
      this.result = null;
      this.phase = 'sinking';
      if (this.golden) sfx.bigWin();
      else sfx.spin();
      const stopAt = r.landed ? r.at : r.snap;
      const start = performance.now();
      const pace = PACE[this.seq.speed] ?? 1;
      let ticked = 1;
      const step = (now: number) => {
        if (this.live?.decided !== r) return resolve();
        const m = crashAt((now - start) * pace);
        // An instant snap, or the line reaching where it ends.
        if (stopAt <= 1 || m >= stopAt) {
          this.end(r);
          return resolve();
        }
        this.m = m;
        if (Math.floor(m) > ticked) {
          ticked = Math.floor(m);
          sfx.tick();
        }
        this.frame = requestAnimationFrame(step);
      };
      this.frame = requestAnimationFrame(step);
    });
  }

  /**
   * Sinks a kept line again, exactly: the same golden hook, the same climb,
   * reeled in at the same depth, and where it would have snapped. Nothing is
   * staked or paid. Auto play stops for it.
   */
  replay(d: CrashReplay) {
    if (this.live || this.phase === 'sinking') return;
    this.setAutoPlay(false);
    this.replaying = d;
    this.golden = d.golden;
    this.result = null;
    this.m = 1;
    this.phase = 'sinking';
    sfx.spin();
    const start = performance.now();
    const pace = PACE[this.seq.speed] ?? 1;
    const step = (now: number) => {
      if (this.replaying !== d) return;
      const m = crashAt((now - start) * pace);
      if (m >= d.at) {
        this.m = d.at;
        this.phase = 'landed';
        this.result = { at: d.at, pay: new Decimal(d.bet).mul(d.at * (d.golden ? GOLD_X : 1)), snap: d.snap };
        // The replay holds here, the catch on the hook and the snap point shown, until the player moves on.
        sfx.win();
        return;
      }
      this.m = m;
      this.frame = requestAnimationFrame(step);
    };
    this.frame = requestAnimationFrame(step);
  }

  /** Puts a held replay away: the line comes back up to the boat. */
  closeReplay() {
    if (!this.replaying || this.phase === 'sinking') return;
    this.replaying = null;
    this.result = null;
    this.m = 1;
    this.phase = 'idle';
  }

  /** Auto play: line after line, reeling in at the marker, asked for a batch at a time. */
  private async runAuto() {
    while (this.autoPlay && !this.seq.disposed) {
      // A line by hand still down: it plays out first.
      while (this.live) if (!(await this.seq.wait(100))) return;
      if (!this.autoPlay) return;
      if (!this.canBet) {
        this.autoPlay = false;
        return;
      }
      const s = autoplay.settings;
      const left = s.stopAfter ? Math.max(1, s.stopRounds - autoplay.rounds) : AUTO_BATCH;
      const stop = { winX: s.stopOnWin ? s.stopWinX : undefined, below: s.stopBelow ? s.stopBelowAmount : undefined, above: s.stopAbove ? s.stopAboveAmount : undefined };
      const before = player.shown.floor.best;
      let rounds: DeepDropRound[] = [];
      let holds: number[] = [];
      const out = await player.act(
        { type: 'deepdrop.drop', step: this.step, room: floor.current, pace: PACE[this.seq.speed] ?? 1, target: this.marker, rounds: Math.min(AUTO_BATCH, left), stop },
        (landed) => {
          rounds = landed.result && 'live' in landed.result ? landed.result.rounds : [];
          holds = player.holdBack(rounds, before);
        },
      );
      if (!out.ok || !rounds.length) {
        this.error = out.ok ? 'No line came back.' : out.error;
        this.autoPlay = false;
        return;
      }
      this.error = null;
      try {
        for (let i = 0; i < rounds.length; i++) {
          // Stopped partway: the lines already decided are shown at once.
          if (!this.autoPlay) {
            for (let j = i; j < rounds.length; j++) {
              player.start(holds[j]!, rounds[j]!);
              this.live = { bet: new Decimal(rounds[j]!.bet), hand: null, decided: rounds[j]!, hold: holds[j]! };
              this.end(rounds[j]!);
            }
            return;
          }
          await this.sinkDecided(rounds[i]!, holds[i]!);
          if (!(await this.seq.wait(AUTO_NEXT_MS))) return;
        }
      } finally {
        player.reveal(...holds);
      }
    }
  }

  setAutoPlay(on: boolean) {
    if (on) this.closeReplay();
    const was = this.autoPlay;
    this.autoPlay = on && this.started && !this.gameOver;
    if (this.autoPlay && !was) void this.runAuto();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    super.dispose();
  }
}
