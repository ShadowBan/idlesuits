import { BET_STEPS, type KenoRound, type KenoWin } from '@idlesuits/engine';
import {
  GOLD_BALL_X,
  KENO_CARD_SHARE,
  KENO_DRAWN,
  KENO_MAX_SPOTS,
  KENO_NUMBERS,
  KENO_ROW_SHARE,
  kenoBuffShare,
  kenoDraw,
  kenoPayback,
  kenoPays,
  kenoQuickPick,
  kenoSettle,
  kenoTicketRtp,
  type KenoBuffKind,
  type KenoBuffState,
  type KenoDrawBuff,
  type KenoPattern,
  type KenoResult,
} from '@idlesuits/sim';
import { autoplay } from '../../lib/autoplay.svelte';
import { floor } from '../../lib/floor.svelte';
import { meta } from '../../lib/meta.svelte';
import { Decimal } from '../../lib/money';
import { playOrAuto, SPEED } from '../../lib/autofeed.svelte';
import { player } from '../../lib/player.svelte';
import { room } from '../../lib/rooms';
import { load, save } from '../../lib/save';
import { sfx } from '../../lib/sound';
import { InstantGame } from './instant.svelte';

export type { KenoWin };

/** Between balls, at 1×; the gold ball takes a breath longer. */
const BALL_MS = 140;
const GOLD_MS = 700;
/** A ball that could make a big win: the draw slows down for it. */
const TENSE_MS = 520;
/** A win of this many bets is big enough to slow the draw down for. */
const TENSE_X = 10;
/** After a draw, how long auto play lets it sit before the next. */
const AUTO_NEXT_MS = 1300;
/** A buff just earned: the draw after it waits a moment longer, so it can be seen. */
const BUFF_NEWS_MS = 1600;

/** What a draw did to the Gold Card, for the board to show once it's in. */
export interface CardNews {
  rows: number[];
  full: boolean;
  /** What the pots paid, in dollars. */
  rowPot: Decimal;
  cardPot: Decimal;
}

/** Draws auto play asks for at once: the server decides them together, and the table shows them one by one. */
const AUTO_BATCH = 5;

/**
 * Golden Keno: mark 1 to 10 numbers of 80, then 20 balls are drawn. The
 * ticket pays by how many of its numbers come up, from that many spots' table.
 * The 20th ball is gold: if it's one of the ticket's numbers, the win is
 * multiplied. The ticket stays marked from draw to draw, so auto play replays
 * it, and its numbers are saved.
 *
 * The Gold Card: the board keeps a stamp on every number the ticket catches
 * and on every gold ball. A finished row of ten wins the Row pot, a full card
 * the Card pot; each draw feeds both a share of its bet (see `kenoStamp`).
 *
 * Pattern meters: patterns among a paid draw's balls fill four meters, and a
 * full meter earns a buff for the draws after it (see `kenoAfterDraw`). Buffs
 * wait their turn; the bet can't change while one waits or runs, so a buff
 * plays at the bet that earned it. The card, pots, meters and buffs are all
 * kept between visits.
 *
 * Every draw is decided by the engine (on the server, for a member): this
 * asks for a draw, or a batch for auto play, and shows what comes back.
 */
export class KenoGame extends InstantGame {
  picks = $state<number[]>([]);
  /** This draw's balls, as they've come out so far. */
  balls = $state<number[]>([]);
  drawing = $state(false);
  /** The last finished draw's result, until the ticket changes or the next draw starts. */
  result = $state<KenoResult | null>(null);
  /** What the last draw (or the replay) paid in all, ticket and pots, and on what bet. */
  paid = $state<{ x: number; bet: Decimal } | null>(null);
  /** The ball now coming could make a big win: the draw is holding its breath. */
  tense = $state(false);

  /** The Gold Card's stamps, and its pots, in dollars, as shown. */
  card = $derived(new Set(player.shown.keno.card));
  rowPot = $derived(new Decimal(player.shown.keno.rowPot));
  cardPot = $derived(new Decimal(player.shown.keno.cardPot));
  /** What the last draw did to the card: rows finished, the card filled, what the pots paid. */
  cardNews = $state<CardNews | null>(null);
  /** Numbers stamped by the draw just shown, to flash on the board. */
  freshStamps = $state<Set<number>>(new Set());

  /** Why the last draw couldn't be played, for a moment on screen. */
  error = $state<string | null>(null);
  /** A batch of decided draws is being shown. */
  private batching = $state(false);
  /** The buff the draw on screen is playing under, and its free number for a Free Spot. */
  drawBuff = $state<{ kind: KenoBuffKind; free?: number } | null>(null);
  /** The patterns the last draw made, with their numbers, to light on the board. */
  patterns = $state<Partial<Record<KenoPattern, number[]>>>({});
  /** Buffs the last draw earned, for a moment on screen. */
  earned = $state<KenoBuffKind[]>([]);

  /** The draw that just settled, as the wins list keeps it to replay. */
  lastReplay = $state<KenoWin | null>(null);
  /** A win being replayed: the board shows its ticket and its draw. */
  replaying = $state.raw<KenoWin | null>(null);
  /** The replay has finished drawing and holds its last state until the player moves on. */
  replayDone = $state(false);

  constructor() {
    super('keno');
    const saved = load<number[]>('keno.picks', []);
    const valid = Array.isArray(saved) ? [...new Set(saved.filter((n) => Number.isInteger(n) && n >= 1 && n <= KENO_NUMBERS))] : [];
    this.picks = valid.slice(0, KENO_MAX_SPOTS).sort((a, b) => a - b);
  }

  /** The pattern meters and the buffs waiting. */
  get buffs(): KenoBuffState {
    return player.shown.keno.buffs;
  }

  /** While a buff waits, the bet is the one that earned it. */
  get bet(): Decimal {
    const locked = player.shown.keno.locked;
    return locked ? room(locked.room).min.mul(BET_STEPS[locked.step] ?? 1) : super.bet;
  }

  /** The ticket on the board: the player's own, or a replayed win's. */
  get ticket(): number[] {
    return this.replaying?.ticket ?? this.picks;
  }

  /** The ticket's own payback: the floor's, less the pots' shares and what the buffs pay on average. */
  get ticketRtp(): number {
    return kenoTicketRtp(this.rtp, Math.max(1, this.ticket.length));
  }

  /** What each number of hits pays on this ticket, 0 to its spots. */
  get pays(): number[] {
    return kenoPays(Math.max(1, this.ticket.length), this.ticketRtp);
  }

  /** The ticket's own payback, before buffs and pots. */
  get ticketPayback(): number {
    return kenoPayback(Math.max(1, this.ticket.length), this.ticketRtp);
  }

  /** What the buffs pay back on average. */
  get buffPayback(): number {
    return this.ticketPayback * kenoBuffShare(Math.max(1, this.ticket.length));
  }

  /** Everything together, ticket, buffs and pots: the floor's payback. */
  get payback(): number {
    return this.ticketPayback + this.buffPayback + KENO_ROW_SHARE + KENO_CARD_SHARE;
  }

  /** The buff the next draw plays under, if any. */
  get nextBuff(): { kind: KenoBuffKind; left: number } | null {
    return this.buffs.queue[0] ?? null;
  }

  /** The next draw is on the house. */
  get freeDraw(): boolean {
    return this.nextBuff?.kind === 'freeDraws';
  }

  /** A buff is waiting or running: the bet stays where it is until they're used. */
  get betLocked(): boolean {
    return this.buffs.queue.length > 0;
  }

  setStep(step: number) {
    if (this.betLocked) return;
    super.setStep(step);
  }

  /** The draw's balls so far, as a set, for marking the board. */
  get drawn(): Set<number> {
    return new Set(this.balls);
  }

  /** The ticket's numbers drawn so far, a Free Spot's included. */
  get hits(): number {
    const free = this.drawBuff?.free;
    return [...this.ticket, ...(free !== undefined ? [free] : [])].filter((n) => this.drawn.has(n)).length;
  }

  get busy(): boolean {
    return this.drawing || this.batching || (this.replaying !== null && !this.replayDone);
  }

  get canPlay(): boolean {
    if (!player.ready || !this.started || this.gameOver || this.busy || !this.picks.length) return false;
    return this.freeDraw || this.canBet;
  }

  private setPicks(picks: number[]) {
    this.picks = [...picks].sort((a, b) => a - b);
    save('keno.picks', this.picks);
    // A new ticket: the last draw's marks come off the board.
    this.balls = [];
    this.result = null;
    this.cardNews = null;
    this.freshStamps = new Set();
    this.patterns = {};
    this.drawBuff = null;
  }

  /** Marks a number, or unmarks it. Up to ten. Not while balls are coming out. */
  toggle(n: number) {
    if (this.busy) return;
    this.leaveReplay();
    if (this.picks.includes(n)) this.setPicks(this.picks.filter((p) => p !== n));
    else if (this.picks.length < KENO_MAX_SPOTS) this.setPicks([...this.picks, n]);
    else return;
    sfx.chip();
  }

  /** A fresh ticket of `count` random numbers: as many as are marked now, or five. */
  quickPick(count = this.picks.length || 5) {
    if (this.busy) return;
    this.leaveReplay();
    this.setPicks(kenoQuickPick(Math.min(KENO_MAX_SPOTS, Math.max(1, count)), { run: this.runSeed, round: this.round }, Date.now() % 100_000));
    sfx.chip();
  }

  clearPicks() {
    if (this.busy) return;
    this.leaveReplay();
    this.setPicks([]);
  }

  /**
   * Draws the balls one by one onto the board for `ticket` (and a Free
   * Spot's number). The pace slows for a ball that could make a big win: one
   * more catch away from paying TENSE_X bets or more, near the end. False if
   * the game was reset.
   */
  private async reveal(ticket: readonly number[], balls: readonly number[], pays: readonly number[], buff: KenoDrawBuff): Promise<boolean> {
    this.balls = [];
    sfx.spin();
    const marked = buff.free !== undefined ? [...ticket, buff.free] : ticket;
    let caught = 0;
    for (let i = 0; i < KENO_DRAWN; i++) {
      const last = i === KENO_DRAWN - 1;
      const left = KENO_DRAWN - i;
      const next = (pays[Math.min(caught + 1, ticket.length)] ?? 0) * (last ? (buff.goldX ?? GOLD_BALL_X) : 1) * (buff.times ?? 1);
      this.tense = left <= 5 && next >= TENSE_X;
      if (!(await this.seq.wait(last ? GOLD_MS : this.tense ? TENSE_MS : BALL_MS))) {
        this.tense = false;
        return false;
      }
      const ball = balls[i]!;
      this.balls = [...this.balls, ball];
      if (marked.includes(ball)) {
        caught++;
        sfx.coin(caught);
      } else sfx.tick();
    }
    this.tense = false;
    return true;
  }

  /** Plays a draw. False if it couldn't start. */
  async play(): Promise<boolean> {
    if (!this.canPlay) return false;
    this.leaveReplay();
    return this.playBatch(1);
  }

  /**
   * Asks the engine for `count` draws on the ticket (one, or a batch for auto
   * play), then shows them one by one: each draw's stake goes down as it
   * starts, its balls come out, then its pay, its stamps and its meters land.
   * Until a draw is shown, what it changed is held off the screen. If auto
   * play stops partway, the draws already decided are shown at once.
   */
  private async playBatch(count: number): Promise<boolean> {
    const before = { keno: player.shown.keno, best: player.shown.floor.best };
    const s = autoplay.settings;
    const stop = this.autoPlay
      ? { winX: s.stopOnWin ? s.stopWinX : undefined, below: s.stopBelow ? s.stopBelowAmount : undefined, above: s.stopAbove ? s.stopAboveAmount : undefined }
      : undefined;
    let rounds: KenoRound[] = [];
    let ids: number[] = [];
    this.batching = true;
    this.error = null;
    const out = await playOrAuto(this.autoPlay, 'keno', { type: 'keno.play', ticket: [...this.picks], step: this.step, room: floor.current, rounds: count, stop }, SPEED[this.seq.speed] ?? 1, (landed) => {
      rounds = landed.result && 'rounds' in landed.result ? (landed.result.rounds as KenoRound[]) : [];
      // The decided draws stay off the screen until they're shown.
      ids = player.holdBack(rounds, before.best);
      player.view('keno', before.keno);
    });
    if (!out.ok || !rounds.length) {
      this.batching = false;
      this.error = out.ok ? 'No draw came back.' : out.error;
      this.autoPlay = false;
      return false;
    }
    try {
      for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i]!;
        player.start(ids[i]!, r);
        // A draw past the first is shown only while auto play runs; stopped, the rest land at once.
        const show = i === 0 || this.autoPlay;
        if (!(await this.showDraw(r, show))) return false;
        player.reveal(ids[i]!);
        player.view('keno', r.keno);
        this.landDraw(r);
        if (i < rounds.length - 1 && show && this.autoPlay) {
          // A buff just earned gets a moment on screen before the next draw.
          if (!(await this.seq.wait(AUTO_NEXT_MS + (r.granted.length ? BUFF_NEWS_MS : 0)))) return false;
        }
      }
      return true;
    } finally {
      player.reveal(...ids);
      player.view('keno', null);
      this.drawing = false;
      this.batching = false;
    }
  }

  /** Puts a decided draw's balls on the board: drawn one by one, or all at once. False if the game was reset. */
  private async showDraw(r: KenoRound, animate: boolean): Promise<boolean> {
    this.drawing = true;
    this.result = null;
    this.paid = null;
    this.cardNews = null;
    this.freshStamps = new Set();
    this.patterns = {};
    this.earned = [];
    this.drawBuff = r.buff ? { kind: r.buff, free: r.drawBuff.free } : null;
    if (animate) return this.reveal(r.ticket, r.balls, kenoPays(r.ticket.length, r.ticketRtp), r.drawBuff);
    this.balls = [...r.balls];
    return true;
  }

  /** A shown draw's results land: its pay, its stamps and pots, its meters, and its place in the session. */
  private landDraw(r: KenoRound) {
    const bet = new Decimal(r.bet);
    this.result = r.result;
    this.freshStamps = new Set(r.stamped);
    const rowPaid = new Decimal(r.rowPaid);
    const cardPaid = new Decimal(r.cardPaid);
    this.cardNews = r.rows.length || r.full ? { rows: r.rows, full: r.full, rowPot: rowPaid, cardPot: cardPaid } : null;
    this.patterns = r.patterns;
    this.earned = r.granted;
    this.drawing = false;
    this.paid = { x: r.x, bet };
    if (r.x >= 10 || r.full || r.granted.length) sfx.bigWin();
    else if (r.x > 0) sfx.win();
    this.lastReplay = r.replay;
    // The bet the engine played at, stepped down if the bank couldn't cover the one asked for.
    if (r.step !== this.step && !player.shown.keno.locked) {
      this.step = r.step;
      save('keno.bet', r.step);
    }
    meta.showFlash(r.triggers, r.tokens, bet);
    this.record({ bet, pay: r.x, units: r.net, lines: r.lines, text: r.text, sub: r.sub, onHouse: r.onHouse });
    autoplay.round(r.net, this.bank);
  }

  /**
   * Draws a past win again, exactly, from its seed: its ticket on the board,
   * the same balls in the same order, the same gold ball, under the same buff.
   * Nothing is staked or paid, and the card and meters are left as they are.
   * Auto play stops for it.
   */
  async replay(win: KenoWin) {
    if (this.busy) return;
    this.setAutoPlay(false);
    this.leaveReplay();
    this.replaying = win;
    this.replayDone = false;
    this.result = null;
    this.paid = null;
    this.cardNews = null;
    this.freshStamps = new Set();
    this.patterns = {};
    this.earned = [];
    const buff = win.drawBuff ?? {};
    this.drawBuff = win.buff ? { kind: win.buff, free: buff.free } : null;
    const balls = kenoDraw({ run: win.run, round: win.round });
    if (!(await this.reveal(win.ticket, balls, this.pays, buff))) {
      this.replaying = null;
      return;
    }
    this.result = kenoSettle(win.ticket, balls, this.ticketRtp, buff);
    this.paid = { x: win.pay, bet: new Decimal(win.bet) };
    sfx.win();
    // The replay holds here, its draw on the board, until the player moves on.
    this.replayDone = true;
  }

  private endReplay() {
    this.replaying = null;
    this.replayDone = false;
    this.balls = [];
    this.result = null;
    this.paid = null;
    this.drawBuff = null;
  }

  /** A finished replay steps aside for whatever the player does next. */
  private leaveReplay() {
    if (this.replaying && this.replayDone) this.endReplay();
  }

  /** Ends a replay, mid-draw or held, back to the player's own ticket. */
  stopReplay() {
    if (!this.replaying) return;
    if (!this.replayDone) this.seq.reset();
    this.endReplay();
    this.tense = false;
  }

  private looping = false;

  /**
   * Auto play: the same ticket, draw after draw, asked for a batch at a time
   * (no more than the rounds left before a stop). Turned on mid-draw, it takes
   * over once that draw is in.
   */
  private async runAuto() {
    if (this.looping) return;
    this.looping = true;
    try {
      while (this.autoPlay && !this.seq.disposed) {
        while (this.busy) if (!(await this.seq.wait(100))) return;
        if (!this.autoPlay || !this.canPlay) {
          this.autoPlay = false;
          return;
        }
        const s = autoplay.settings;
        const left = s.stopAfter ? Math.max(1, s.stopRounds - autoplay.rounds) : AUTO_BATCH;
        if (!(await this.playBatch(Math.min(AUTO_BATCH, left)))) {
          this.autoPlay = false;
          return;
        }
        if (!(await this.seq.wait(AUTO_NEXT_MS + (this.earned.length ? BUFF_NEWS_MS : 0)))) return;
      }
    } finally {
      this.looping = false;
    }
  }

  setAutoPlay(on: boolean) {
    if (on) this.leaveReplay();
    this.autoPlay = on && this.started && !this.gameOver && this.picks.length > 0;
    if (this.autoPlay) void this.runAuto();
  }
}
