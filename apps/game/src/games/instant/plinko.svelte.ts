import {
  dropBall,
  FEVER_BALLS,
  FEVER_X,
  isGolden,
  plinkoPayback,
  plinkoPays,
  PLINKO_RISKS,
  PLINKO_ROWS,
  type PlinkoRisk,
  type PlinkoRows,
} from '@idlesuits/sim';
import type { Decimal } from '../../lib/money';
import { load, save } from '../../lib/save';
import { sfx } from '../../lib/sound';
import { InstantGame } from './instant.svelte';

/** Most balls on the board at once. */
const MAX_BALLS = 24;
/** Auto play's pace between balls, at 1×. */
const AUTO_MS = 650;
/** Fever's free balls follow each other this far apart. */
const FEVER_GAP_MS = 380;

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
  /** One of Fever's free balls, paying FEVER_X times. */
  fever: boolean;
}

/** Fever under way: the golden ball's round, what it has paid, and the free balls still to land. */
interface Fever {
  round: number;
  bet: Decimal;
  /** In bets: the golden ball's own slot, then each free ball's. */
  pays: number[];
  left: number;
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
    return this.balls.length > 0 || this.fever !== null;
  }

  setRows(rows: PlinkoRows) {
    if (this.locked) return;
    this.rows = rows;
    this.hits = {};
    save('plinko.rows', rows);
  }

  setRisk(risk: PlinkoRisk) {
    if (this.locked) return;
    this.risk = risk;
    this.hits = {};
    save('plinko.risk', risk);
  }

  /** Drops a ball: stakes its bet and draws its path. Not during Fever. */
  drop(): boolean {
    if (this.fever || this.balls.length >= MAX_BALLS) return false;
    const s = this.stake();
    if (!s) return false;
    const seed = { run: this.runSeed, round: s.round };
    const { path, slot } = dropBall(this.rows, seed);
    const golden = isGolden(seed);
    this.balls = [...this.balls, { id: ++this.ids, round: s.round, bet: s.bet, path, slot, rows: this.rows, golden, fever: false }];
    if (golden) sfx.bigWin();
    else sfx.chip();
    return true;
  }

  /** A ball has reached its slot: it pays, and leaves the board. */
  land(ball: Ball) {
    if (!this.balls.some((b) => b.id === ball.id)) return;
    this.balls = this.balls.filter((b) => b.id !== ball.id);
    const x = this.pays[ball.slot]! * (ball.fever ? FEVER_X : 1);
    const pay = ball.bet.mul(x);
    this.hits = { ...this.hits, [ball.slot]: { key: ball.id, pay, x, fever: ball.fever } };
    if (x >= 10) sfx.bigWin();
    else if (x >= 1) sfx.win();
    else sfx.tick();
    if (ball.golden) return this.startFever(ball, x);
    if (ball.fever && this.fever) {
      this.fever.pays = [...this.fever.pays, x];
      this.fever.left--;
      if (this.fever.left === 0) this.endFever();
      return;
    }
    const text = `${x >= 10 ? x.toFixed(0) : x.toFixed(2)}× slot`;
    this.settle(ball.round, ball.bet, x, text, `${ball.rows} rows · ${this.risk} risk`, [{ label: `Slot ${ball.slot + 1} · ${x.toFixed(2)}×`, amount: x }]);
  }

  /** The golden ball has landed: Fever's free balls follow it down, one after another. */
  private startFever(golden: Ball, x: number) {
    this.fever = { round: golden.round, bet: golden.bet, pays: [x], left: FEVER_BALLS };
    for (let i = 1; i <= FEVER_BALLS; i++) {
      this.timers.push(
        setTimeout(() => {
          const { path, slot } = dropBall(golden.rows, { run: this.runSeed, round: golden.round }, i);
          this.balls = [...this.balls, { id: ++this.ids, round: golden.round, bet: golden.bet, path, slot, rows: golden.rows, golden: false, fever: true }];
          sfx.chip();
        }, 900 + i * FEVER_GAP_MS),
      );
    }
  }

  /** Fever's last ball is in: the golden ball's round settles with everything it set off. */
  private endFever() {
    const f = this.fever!;
    this.fever = null;
    const total = f.pays.reduce((a, b) => a + b, 0);
    const lines = [
      { label: `Golden ball · ${f.pays[0]!.toFixed(2)}×`, amount: f.pays[0]! },
      { label: `Fever · ${FEVER_BALLS} free balls at ×${FEVER_X}`, amount: total - f.pays[0]! },
    ];
    sfx.bigWin();
    this.settle(f.round, f.bet, total, `Fever · ${total.toFixed(2)}×`, `golden ball + ${FEVER_BALLS} free · ${this.rows} rows`, lines);
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
