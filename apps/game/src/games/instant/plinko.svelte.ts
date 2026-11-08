import {
  dropBall,
  FEVER_BALLS,
  FEVER_LADDER,
  isGolden,
  plinkoPayback,
  plinkoPays,
  PLINKO_RISKS,
  PLINKO_ROWS,
  type PlinkoRisk,
  type PlinkoRows,
} from '@idlesuits/sim';
import { Decimal } from '../../lib/money';
import { load, save } from '../../lib/save';
import { sfx } from '../../lib/sound';
import { InstantGame } from './instant.svelte';

/** Most balls on the board at once. */
const MAX_BALLS = 24;
/** Auto play's pace between balls, at 1×. */
const AUTO_MS = 650;
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
}

/** A ball kept with its win: enough to drop it again exactly. */
export interface PlinkoReplay {
  run: string;
  round: number;
  rows: PlinkoRows;
  risk: PlinkoRisk;
  bet: string;
  /** What it paid, in bets: the slot's multiplier, or the whole Fever. */
  x: number;
  golden: boolean;
}


/** Fever under way: the golden ball's round, what it has paid so far, and where it is on the ladder. */
export interface Fever {
  round: number;
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
    return this.balls.length > 0 || this.fever !== null || (this.replaying !== null && !this.replayDone);
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

  /** Drops a ball: stakes its bet and draws its path. Not during Fever. */
  drop(): boolean {
    if (this.fever || (this.replaying && !this.replayDone) || this.balls.length >= MAX_BALLS) return false;
    this.leaveReplay();
    const s = this.stake();
    if (!s) return false;
    const seed = { run: this.runSeed, round: s.round };
    const { path, slot } = dropBall(this.rows, seed);
    const golden = isGolden(seed);
    this.balls = [...this.balls, { id: ++this.ids, round: s.round, bet: s.bet, path, slot, rows: this.rows, golden, fever: false, boost: 1 }];
    if (golden) sfx.bigWin();
    else sfx.chip();
    return true;
  }

  /** A ball has reached its slot: it pays, and leaves the board. */
  land(ball: Ball) {
    if (!this.balls.some((b) => b.id === ball.id)) return;
    this.balls = this.balls.filter((b) => b.id !== ball.id);
    if (ball.replay) return this.landReplay(ball);
    const x = this.pays[ball.slot]! * ball.boost;
    const pay = ball.bet.mul(x);
    this.hits = { ...this.hits, [ball.slot]: { key: ball.id, pay, x, fever: ball.fever } };
    if (x >= 10 || ball.fever) sfx.bigWin();
    else if (x >= 1) sfx.win();
    else sfx.tick();
    if (ball.golden) return this.startFever(ball, x);
    if (ball.fever && this.fever) {
      this.fever.pays = [...this.fever.pays, x];
      const next = this.fever.step + 1;
      if (next < FEVER_BALLS) {
        this.fever.step = next;
        this.later(() => this.dropFever(ball.rows), FEVER_GAP_MS);
      } else this.endFever();
      return;
    }
    const text = `${x >= 10 ? x.toFixed(0) : x.toFixed(2)}× slot`;
    this.lastReplay = { run: this.runSeed, round: ball.round, rows: ball.rows, risk: this.risk, bet: ball.bet.toString(), x, golden: false };
    this.settle(ball.round, ball.bet, x, text, `${ball.rows} rows · ${this.risk} risk`, [{ label: `Slot ${ball.slot + 1} · ${x.toFixed(2)}×`, amount: x }]);
  }

  /** The golden ball has landed: Fever starts, and its first free ball follows it down. */
  private startFever(golden: Ball, x: number) {
    this.fever = { round: golden.round, bet: golden.bet, pays: [x], step: 0, done: false };
    this.later(() => this.dropFever(golden.rows), FEVER_START_MS);
  }

  /** Fever's next free ball: its own path from the golden ball's seed, and its step on the ladder. */
  private dropFever(rows: PlinkoRows) {
    const f = this.fever;
    if (!f) return;
    const { path, slot } = dropBall(rows, { run: this.runSeed, round: f.round }, f.step + 1);
    this.balls = [...this.balls, { id: ++this.ids, round: f.round, bet: f.bet, path, slot, rows, golden: false, fever: true, boost: FEVER_LADDER[f.step]! }];
    sfx.chip();
  }

  /** What Fever has paid so far, in bets: the golden ball and every free ball in. */
  get feverTotal(): number {
    return this.fever ? this.fever.pays.reduce((a, b) => a + b, 0) : 0;
  }

  /** Fever's last ball is in: the total holds up a moment, and the golden ball's round settles with everything it set off. */
  private endFever() {
    const f = this.fever!;
    f.done = true;
    const total = this.feverTotal;
    const lines = [
      { label: `Golden ball · ${f.pays[0]!.toFixed(2)}×`, amount: f.pays[0]! },
      ...f.pays.slice(1).map((x, i) => ({ label: `Fever ball ${i + 1} · ×${FEVER_LADDER[i]}`, amount: x })),
    ];
    this.lastReplay = { run: this.runSeed, round: f.round, rows: this.rows, risk: this.risk, bet: f.bet.toString(), x: total, golden: true };
    this.settle(f.round, f.bet, total, `Fever · ${total.toFixed(2)}×`, `golden ball + ${FEVER_BALLS} free · ${this.rows} rows`, lines);
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

  private async runAuto() {
    while (this.autoPlay && !this.seq.disposed) {
      if (!this.fever && !this.drop() && !this.balls.length) {
        this.autoPlay = false;
        return;
      }
      if (!(await this.seq.wait(AUTO_MS))) return;
    }
  }

  setAutoPlay(on: boolean) {
    if (on) this.leaveReplay();
    const was = this.autoPlay;
    this.autoPlay = on && this.started && !this.gameOver;
    if (this.autoPlay && !was) void this.runAuto();
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
