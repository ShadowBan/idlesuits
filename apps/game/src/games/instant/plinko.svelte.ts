import type { PlinkoReplay, PlinkoRound } from '@idlesuits/engine';
import {
  dropBall,
  FEVER_BALLS,
  plinkoPayback,
  plinkoPays,
  PLINKO_RISKS,
  PLINKO_ROWS,
  type PlinkoRisk,
  type PlinkoRows,
} from '@idlesuits/sim';
import { autoplay } from '../../lib/autoplay.svelte';
import { floor } from '../../lib/floor.svelte';
import { meta } from '../../lib/meta.svelte';
import { Decimal } from '../../lib/money';
import { player } from '../../lib/player.svelte';
import { load, save } from '../../lib/save';
import { sfx } from '../../lib/sound';
import { InstantGame } from './instant.svelte';

/** Most balls on the board at once. */
const MAX_BALLS = 24;
/** Auto play's pace between balls, at 1×. */
const AUTO_MS = 650;
/** Balls auto play asks for at once: decided together, dropped on auto play's beat. */
const AUTO_BATCH = 8;
/** Fever: a breath after the golden ball lands, a beat between free balls, and the total held up at the end. */
const FEVER_START_MS = 1400;
const FEVER_GAP_MS = 700;
const FEVER_END_MS = 3200;

export interface Ball {
  id: number;
  round: number;
  bet: Decimal;
  /** Left (0) or right (1) at each row. */
  path: (0 | 1)[];
  slot: number;
  /** The board it was dropped on. */
  rows: PlinkoRows;
  /** It drops golden: it sets off Fever when it lands. */
  golden: boolean;
  /** One of Fever's free balls. */
  fever: boolean;
  /** What a free ball multiplies its slot by: its step on Fever's ladder. 1 for any other ball. */
  boost: number;
  /** A kept ball dropped again: it lands and lights its slot, and pays nothing. */
  replay?: boolean;
  /** The decided round this ball shows, and the id its result is held back under until it lands. */
  decided?: { r: PlinkoRound; hold: number };
}

export type { PlinkoReplay };

/** Fever under way: the golden ball's round, what it has paid so far, and where it is on the ladder. */
export interface Fever {
  round: number;
  /** The decided round it belongs to, and its held result. */
  decided: { r: PlinkoRound; hold: number };
  bet: Decimal;
  /** In bets: the golden ball's own slot, then each free ball's, ladder and all. */
  pays: number[];
  /** The free ball falling now (or next), as its step on the ladder. */
  step: number;
  /** Every free ball is in: the total is up. */
  done: boolean;
}

/**
 * Lucky Drop: Plinko. Each ball is a round of its own: its stake leaves the
 * bank as it drops, its path is drawn from its seed, and it settles when it
 * lands. A golden ball sets off Fever: free balls on the same board, every
 * slot paying double, and its round settles once they've all landed. The
 * board can't change while anything is falling.
 *
 * Every ball is decided by the engine (on the server, for a member) as it's
 * dropped, Fever and all: the table lets it fall, and shows what it paid when
 * it lands.
 */
export class PlinkoGame extends InstantGame {
  rows = $state<PlinkoRows>(12);
  risk = $state<PlinkoRisk>('medium');
  balls = $state<Ball[]>([]);
  /** Each slot's latest landing, keyed so it flashes afresh. */
  hits = $state<Record<number, { key: number; pay: Decimal; x: number; fever: boolean }>>({});
  fever = $state<Fever | null>(null);
  private ids = 0;
  /** The ball that just settled, as the wins list keeps it to replay. */
  lastReplay = $state<PlinkoReplay | null>(null);
  /** A kept ball being dropped again, and the board to go back to after. */
  replaying = $state.raw<PlinkoReplay | null>(null);
  /** The replayed ball has landed: its board holds until the player moves on. */
  replayDone = $state(false);
  private before: { rows: PlinkoRows; risk: PlinkoRisk } | null = null;
  private timers: ReturnType<typeof setTimeout>[] = [];
  /** Decided balls waiting their turn to drop (auto play's batch), with their held results. */
  private queue: { r: PlinkoRound; hold: number }[] = [];
  /** A request for balls is on its way. */
  private asking = $state(false);
  /** Why the last drop couldn't be played, for a moment on screen. */
  error = $state<string | null>(null);

  constructor() {
    super('plinko');
    const rows = load<number>('plinko.rows', 12);
    this.rows = (PLINKO_ROWS as readonly number[]).includes(rows) ? (rows as PlinkoRows) : 12;
    const risk = load<string>('plinko.risk', 'medium');
    this.risk = (PLINKO_RISKS as readonly string[]).includes(risk) ? (risk as PlinkoRisk) : 'medium';
  }

  /** Every slot's multiplier on this board at the floor's payback. */
  get pays(): number[] {
    return plinkoPays(this.rows, this.risk, this.rtp);
  }

  /** This board's exact payback, Fever included. */
  get payback(): number {
    return plinkoPayback(this.rows, this.risk, this.rtp);
  }

  get locked(): boolean {
    return this.balls.length > 0 || this.fever !== null || this.asking || this.queue.length > 0 || (this.replaying !== null && !this.replayDone);
  }

  get canBet(): boolean {
    return player.ready && super.canBet;
  }

  setRows(rows: PlinkoRows) {
    if (this.locked) return;
    this.leaveReplay();
    this.rows = rows;
    this.hits = {};
    save('plinko.rows', rows);
  }

  setRisk(risk: PlinkoRisk) {
    if (this.locked) return;
    this.leaveReplay();
    this.risk = risk;
    this.hits = {};
    save('plinko.risk', risk);
  }

  /** Drops a ball: the engine decides it, then it falls. Not during Fever. */
  drop(): boolean {
    if (this.fever || (this.replaying && !this.replayDone) || this.balls.length >= MAX_BALLS || !this.canBet) return false;
    this.leaveReplay();
    void this.ask(1);
    return true;
  }

  /**
   * Asks the engine for `count` balls on this board and bet, holds their
   * results back, and drops the first (the rest wait their turn in the queue).
   * False if none came back.
   */
  private async ask(count: number): Promise<boolean> {
    const before = player.shown.floor.best;
    const s = autoplay.settings;
    const stop = this.autoPlay
      ? { winX: s.stopOnWin ? s.stopWinX : undefined, below: s.stopBelow ? s.stopBelowAmount : undefined, above: s.stopAbove ? s.stopAboveAmount : undefined }
      : undefined;
    let decided: { r: PlinkoRound; hold: number }[] = [];
    this.asking = true;
    this.out += count;
    const out = await player.act({ type: 'plinko.play', rows: this.rows, risk: this.risk, step: this.step, room: floor.current, rounds: count, stop }, (landed) => {
      const rounds = landed.result && 'rounds' in landed.result ? (landed.result.rounds as PlinkoRound[]) : [];
      const ids = player.holdBack(rounds, before);
      decided = rounds.map((r, i) => ({ r, hold: ids[i]! }));
    });
    this.asking = false;
    this.out = Math.max(0, this.out - count);
    if (!out.ok || !decided.length) {
      this.error = out.ok ? 'No ball came back.' : out.error;
      this.autoPlay = false;
      return false;
    }
    this.error = null;
    this.queue.push(...decided);
    this.dropNext();
    return true;
  }

  /** The next decided ball falls: its stake goes down as it drops. */
  private dropNext(): boolean {
    const d = this.queue.shift();
    if (!d) return false;
    const r = d.r;
    player.start(d.hold, r);
    this.out++;
    const bet = new Decimal(r.bet);
    this.balls = [...this.balls, { id: ++this.ids, round: r.round, bet, path: r.ball.path, slot: r.ball.slot, rows: r.rows, golden: r.golden, fever: false, boost: 1, decided: d }];
    if (r.golden) sfx.bigWin();
    else sfx.chip();
    return true;
  }

  /** A ball has reached its slot: it lights its slot, and its result is shown. */
  land(ball: Ball) {
    if (!this.balls.some((b) => b.id === ball.id)) return;
    this.balls = this.balls.filter((b) => b.id !== ball.id);
    if (ball.replay) return this.landReplay(ball);
    const d = ball.decided;
    if (!d) return;
    const x = ball.fever ? d.r.fever[this.fever?.step ?? 0]!.x : d.r.ball.x;
    const pay = ball.bet.mul(x);
    this.hits = { ...this.hits, [ball.slot]: { key: ball.id, pay, x, fever: ball.fever } };
    if (x >= 10 || ball.fever) sfx.bigWin();
    else if (x >= 1) sfx.win();
    else sfx.tick();
    if (ball.golden) return this.startFever(d, x);
    if (ball.fever && this.fever) {
      this.fever.pays = [...this.fever.pays, x];
      const next = this.fever.step + 1;
      if (next < FEVER_BALLS) {
        this.fever.step = next;
        this.later(() => this.dropFever(), FEVER_GAP_MS);
      } else this.endFever();
      return;
    }
    this.finish(d);
  }

  /** A decided round is all on screen: its result is shown, and counted in the session. */
  private finish(d: { r: PlinkoRound; hold: number }) {
    const r = d.r;
    const bet = new Decimal(r.bet);
    this.out = Math.max(0, this.out - 1);
    player.reveal(d.hold);
    this.lastReplay = r.replay;
    meta.showFlash(r.triggers, r.tokens, bet);
    this.record({ bet, pay: r.x, units: r.net, lines: r.lines, text: r.text, sub: r.sub, onHouse: r.onHouse });
    autoplay.round(r.net, this.bank);
  }

  /** The golden ball has landed: Fever starts, and its first free ball follows it down. */
  private startFever(d: { r: PlinkoRound; hold: number }, x: number) {
    this.fever = { round: d.r.round, decided: d, bet: new Decimal(d.r.bet), pays: [x], step: 0, done: false };
    this.later(() => this.dropFever(), FEVER_START_MS);
  }

  /** Fever's next free ball, as the engine decided it, and its step on the ladder. */
  private dropFever() {
    const f = this.fever;
    if (!f) return;
    const fall = f.decided.r.fever[f.step]!;
    this.balls = [...this.balls, { id: ++this.ids, round: f.round, bet: f.bet, path: fall.path, slot: fall.slot, rows: f.decided.r.rows, golden: false, fever: true, boost: fall.boost, decided: f.decided }];
    sfx.chip();
  }

  /** What Fever has paid so far, in bets: the golden ball and every free ball in. */
  get feverTotal(): number {
    return this.fever ? this.fever.pays.reduce((a, b) => a + b, 0) : 0;
  }

  /** Fever's last ball is in: the total holds up a moment, and the golden ball's round is shown with everything it set off. */
  private endFever() {
    const f = this.fever!;
    f.done = true;
    this.finish(f.decided);
    this.later(() => (this.fever = null), FEVER_END_MS);
  }

  private later(fn: () => void, ms: number) {
    this.timers.push(setTimeout(fn, ms));
  }

  /**
   * Drops a kept ball again, exactly, on the board it fell on: the same path
   * into the same slot. A Fever round drops its golden ball. Nothing is staked
   * or paid; afterwards the board goes back to how it was. Auto play stops for it.
   */
  replay(d: PlinkoReplay) {
    if (this.balls.length || this.fever || (this.replaying && !this.replayDone)) return;
    this.setAutoPlay(false);
    this.leaveReplay();
    this.replayDone = false;
    this.before = { rows: this.rows, risk: this.risk };
    this.rows = d.rows;
    this.risk = d.risk;
    this.hits = {};
    this.replaying = d;
    const { path, slot } = dropBall(d.rows, { run: d.run, round: d.round });
    this.balls = [{ id: ++this.ids, round: d.round, bet: new Decimal(d.bet), path, slot, rows: d.rows, golden: d.golden, fever: false, boost: 1, replay: true }];
    sfx.chip();
  }

  private landReplay(ball: Ball) {
    const d = this.replaying;
    if (!d) return;
    const x = this.pays[ball.slot]!;
    this.hits = { ...this.hits, [ball.slot]: { key: ball.id, pay: ball.bet.mul(d.golden ? d.x : x), x: d.golden ? d.x : x, fever: false } };
    if (x >= 10 || d.golden) sfx.bigWin();
    else sfx.win();
    // The replay holds here, its board and slot lit, until the player moves on.
    this.replayDone = true;
  }

  /** A finished replay steps aside: the player's own board comes back. */
  private leaveReplay() {
    if (!this.replaying || !this.replayDone) return;
    this.replaying = null;
    this.replayDone = false;
    if (this.before) {
      this.rows = this.before.rows;
      this.risk = this.before.risk;
    }
    this.before = null;
    this.hits = {};
  }

  /** Puts a finished replay away. */
  closeReplay() {
    this.leaveReplay();
  }

  /** A ball's bounce as it passes a row, sparing the speakers when many fall at once. */
  bounce() {
    if (this.balls.length <= 3) sfx.tick();
  }

  /** Auto play: a ball on every beat, asked for a batch at a time; balls already decided still drop once it stops. */
  private looping = false;

  private async runAuto() {
    if (this.looping) return;
    this.looping = true;
    try {
      await this.autoLoop();
    } finally {
      this.looping = false;
    }
  }

  private async autoLoop() {
    while (!this.seq.disposed) {
      if (!this.autoPlay) {
        // Stopped with balls decided: they drop anyway, quickly, since they're already paid.
        if (!this.queue.length) return;
        if (!this.fever) this.dropNext();
        if (!(await this.seq.wait(AUTO_MS / 3))) return;
        continue;
      }
      if (!this.fever && this.balls.length < MAX_BALLS) {
        if (this.queue.length) this.dropNext();
        else if (!this.asking) {
          if (!this.canBet) {
            if (!this.balls.length) this.autoPlay = false;
          } else {
            const s = autoplay.settings;
            const left = s.stopAfter ? Math.max(1, s.stopRounds - autoplay.rounds - this.out) : AUTO_BATCH;
            if (!(await this.ask(Math.min(AUTO_BATCH, left)))) return;
          }
        }
      }
      if (!(await this.seq.wait(AUTO_MS))) return;
    }
  }

  setAutoPlay(on: boolean) {
    if (on) this.leaveReplay();
    const was = this.autoPlay;
    this.autoPlay = on && this.started && !this.gameOver;
    if (this.autoPlay && !was) void this.runAuto();
    else if (!this.autoPlay && this.queue.length) void this.runAuto();
  }

  /** How fast a ball falls, at the deal speed: milliseconds per row. */
  get rowMs(): number {
    const pace = { smart: 1, '1x': 1, '2x': 1.6, '5x': 2.6 }[this.seq.speed] ?? 1;
    return 150 / pace;
  }

  dispose() {
    this.timers.forEach(clearTimeout);
    super.dispose();
  }
}
