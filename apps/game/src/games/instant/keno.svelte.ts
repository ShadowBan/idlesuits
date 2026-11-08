import { GOLD_BALL_X, KENO_DRAWN, KENO_MAX_SPOTS, KENO_NUMBERS, kenoDraw, kenoPayback, kenoPays, kenoQuickPick, kenoSettle, type KenoResult } from '@idlesuits/sim';
import { load, save } from '../../lib/save';
import { sfx } from '../../lib/sound';
import { InstantGame } from './instant.svelte';

/** Between balls, at 1×; the gold ball takes a breath longer. */
const BALL_MS = 140;
const GOLD_MS = 700;
/** After a draw, how long auto play lets it sit before the next. */
const AUTO_NEXT_MS = 1300;

/**
 * Golden Keno: mark 1 to 10 numbers of 80, then 20 balls are drawn. The
 * ticket pays by how many of its numbers come up, from that many spots' table.
 * The 20th ball is gold: if it's one of the ticket's numbers, the win is
 * multiplied. The ticket stays marked from draw to draw, so auto play replays
 * it, and its numbers are saved.
 */
export class KenoGame extends InstantGame {
  picks = $state<number[]>([]);
  /** This draw's balls, as they've come out so far. */
  balls = $state<number[]>([]);
  drawing = $state(false);
  /** The last finished draw's result, until the ticket changes or the next draw starts. */
  result = $state<KenoResult | null>(null);

  constructor() {
    super('keno');
    const saved = load<number[]>('keno.picks', []);
    const valid = Array.isArray(saved) ? [...new Set(saved.filter((n) => Number.isInteger(n) && n >= 1 && n <= KENO_NUMBERS))] : [];
    this.picks = valid.slice(0, KENO_MAX_SPOTS).sort((a, b) => a - b);
  }

  /** What each number of hits pays on this ticket, 0 to its spots. */
  get pays(): number[] {
    return kenoPays(Math.max(1, this.picks.length), this.rtp);
  }

  get payback(): number {
    return kenoPayback(Math.max(1, this.picks.length), this.rtp);
  }

  /** The draw's balls so far, as a set, for marking the board. */
  get drawn(): Set<number> {
    return new Set(this.balls);
  }

  /** The ticket's numbers drawn so far. */
  get hits(): number {
    return this.picks.filter((n) => this.drawn.has(n)).length;
  }

  get canPlay(): boolean {
    return this.canBet && !this.drawing && this.picks.length > 0;
  }

  private setPicks(picks: number[]) {
    this.picks = [...picks].sort((a, b) => a - b);
    save('keno.picks', this.picks);
    // A new ticket: the last draw's marks come off the board.
    this.balls = [];
    this.result = null;
  }

  /** Marks a number, or unmarks it. Up to ten. Not while balls are coming out. */
  toggle(n: number) {
    if (this.drawing) return;
    if (this.picks.includes(n)) this.setPicks(this.picks.filter((p) => p !== n));
    else if (this.picks.length < KENO_MAX_SPOTS) this.setPicks([...this.picks, n]);
    else return;
    sfx.chip();
  }

  /** A fresh ticket of `count` random numbers: as many as are marked now, or five. */
  quickPick(count = this.picks.length || 5) {
    if (this.drawing) return;
    this.setPicks(kenoQuickPick(Math.min(KENO_MAX_SPOTS, Math.max(1, count)), { run: this.runSeed, round: this.round }, Date.now() % 100_000));
    sfx.chip();
  }

  clearPicks() {
    if (this.drawing) return;
    this.setPicks([]);
  }

  /** Stakes the bet and draws the 20 balls, one by one, then pays the ticket. False if it couldn't start. */
  async play(): Promise<boolean> {
    if (!this.canPlay) return false;
    const s = this.stake();
    if (!s) return false;
    const ticket = [...this.picks];
    const balls = kenoDraw({ run: this.runSeed, round: s.round });
    this.drawing = true;
    this.result = null;
    this.balls = [];
    sfx.spin();
    for (let i = 0; i < KENO_DRAWN; i++) {
      const last = i === KENO_DRAWN - 1;
      if (!(await this.seq.wait(last ? GOLD_MS : BALL_MS))) return false;
      const ball = balls[i]!;
      this.balls = [...this.balls, ball];
      if (ticket.includes(ball)) sfx.coin(this.hits);
      else sfx.tick();
    }
    const result = kenoSettle(ticket, balls, this.rtp);
    this.result = result;
    this.drawing = false;
    const x = result.pay;
    if (x >= 10) sfx.bigWin();
    else if (x > 0) sfx.win();
    const base = result.gold && x > 0 ? x / GOLD_BALL_X : x;
    const lines = x > 0 ? [{ label: `${result.hits.length} of ${ticket.length} · ${base.toFixed(2)}×`, amount: base }] : [];
    if (result.gold && x > 0) lines.push({ label: `Gold ball · ×${GOLD_BALL_X}`, amount: x - base });
    const text = `${result.hits.length} of ${ticket.length}${result.gold ? ' · gold' : ''}`;
    this.settle(s.round, s.bet, x, text, x > 0 ? `${x >= 10 ? x.toFixed(0) : x.toFixed(2)}×` : 'no win', lines);
    return true;
  }

  private looping = false;

  /** Auto play: the same ticket, draw after draw. Turned on mid-draw, it takes over once that draw is in. */
  private async runAuto() {
    if (this.looping) return;
    this.looping = true;
    try {
      while (this.autoPlay && !this.seq.disposed) {
        while (this.drawing) if (!(await this.seq.wait(100))) return;
        if (!this.autoPlay) return;
        if (!(await this.play())) {
          if (!this.drawing) this.autoPlay = false;
          return;
        }
        if (!(await this.seq.wait(AUTO_NEXT_MS))) return;
      }
    } finally {
      this.looping = false;
    }
  }

  setAutoPlay(on: boolean) {
    this.autoPlay = on && this.started && !this.gameOver && this.picks.length > 0;
    if (this.autoPlay) void this.runAuto();
  }
}
