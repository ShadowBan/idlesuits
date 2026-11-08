import {
  GOLD_BALL_X,
  KENO_CARD_SHARE,
  KENO_DRAWN,
  KENO_MAX_SPOTS,
  KENO_NUMBERS,
  KENO_ROW_SHARE,
  kenoDraw,
  kenoPayback,
  kenoPays,
  kenoQuickPick,
  kenoSettle,
  kenoStamp,
  kenoTicketRtp,
  type KenoResult,
} from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { Decimal } from '../../lib/money';
import { load, save, saveSoon } from '../../lib/save';
import { sfx } from '../../lib/sound';
import { InstantGame } from './instant.svelte';

/** Between balls, at 1×; the gold ball takes a breath longer. */
const BALL_MS = 140;
const GOLD_MS = 700;
/** A ball that could make a big win: the draw slows down for it. */
const TENSE_MS = 520;
/** A win of this many bets is big enough to slow the draw down for. */
const TENSE_X = 10;
/** After a draw, how long auto play lets it sit before the next. */
const AUTO_NEXT_MS = 1300;
/** A replay's result stays up this long before the board goes back to the player's own ticket. */
const REPLAY_HOLD_MS = 2600;
/** Wins kept to look back on and replay. */
const WINS_KEPT = 50;

/** A win, kept to look back on: enough to draw it again exactly. */
export interface KenoWin {
  /** The run seed and round it was drawn from. */
  run: string;
  round: number;
  /** The draw number in the session's history, for the list. */
  draw: number;
  ticket: number[];
  /** The bet, as a string so any size survives saving. */
  bet: string;
  /** In bets: the ticket's pay and anything the Gold Card's pots added. */
  pay: number;
  hits: number;
  gold: boolean;
  /** Rows of the Gold Card it finished, and whether it filled the card. */
  rows: number;
  full: boolean;
}

/** What a draw did to the Gold Card, for the board to show once it's in. */
export interface CardNews {
  rows: number[];
  full: boolean;
  /** What the pots paid, in dollars. */
  rowPot: Decimal;
  cardPot: Decimal;
}

function savedCard(): Set<number> {
  const saved = load<number[]>('keno.card', []);
  return new Set(Array.isArray(saved) ? saved.filter((n) => Number.isInteger(n) && n >= 1 && n <= KENO_NUMBERS) : []);
}

function savedPot(key: string): Decimal {
  try {
    const d = new Decimal(load<string>(key, '0'));
    return d.isFinite() && d.gte(0) ? d : new Decimal(0);
  } catch {
    return new Decimal(0);
  }
}

function savedWins(): KenoWin[] {
  const saved = load<KenoWin[]>('keno.wins', []);
  return Array.isArray(saved) ? saved.filter((w) => w && typeof w.run === 'string' && Array.isArray(w.ticket)).slice(0, WINS_KEPT) : [];
}

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
 * The card and the pots are kept between visits.
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

  /** The Gold Card's stamps, and its pots, in dollars. */
  card = $state<Set<number>>(savedCard());
  rowPot = $state<Decimal>(savedPot('keno.rowPot'));
  cardPot = $state<Decimal>(savedPot('keno.cardPot'));
  /** What the last draw did to the card: rows finished, the card filled, what the pots paid. */
  cardNews = $state<CardNews | null>(null);
  /** Numbers stamped by the draw just shown, to flash on the board. */
  freshStamps = $state<Set<number>>(new Set());

  /** The last wins, newest first, to look back on and replay. */
  wins = $state<KenoWin[]>(savedWins());
  /** A win being replayed: the board shows its ticket and its draw. */
  replaying = $state<KenoWin | null>(null);

  constructor() {
    super('keno');
    const saved = load<number[]>('keno.picks', []);
    const valid = Array.isArray(saved) ? [...new Set(saved.filter((n) => Number.isInteger(n) && n >= 1 && n <= KENO_NUMBERS))] : [];
    this.picks = valid.slice(0, KENO_MAX_SPOTS).sort((a, b) => a - b);
  }

  /** The ticket on the board: the player's own, or a replayed win's. */
  get ticket(): number[] {
    return this.replaying?.ticket ?? this.picks;
  }

  /** What each number of hits pays on this ticket, 0 to its spots: the floor's payback less the pots' shares. */
  get pays(): number[] {
    return kenoPays(Math.max(1, this.ticket.length), kenoTicketRtp(this.rtp));
  }

  /** The ticket's own payback, before the pots. */
  get ticketPayback(): number {
    return kenoPayback(Math.max(1, this.ticket.length), kenoTicketRtp(this.rtp));
  }

  /** Everything together, ticket and pots: the floor's payback. */
  get payback(): number {
    return this.ticketPayback + KENO_ROW_SHARE + KENO_CARD_SHARE;
  }

  /** The draw's balls so far, as a set, for marking the board. */
  get drawn(): Set<number> {
    return new Set(this.balls);
  }

  /** The ticket's numbers drawn so far. */
  get hits(): number {
    return this.ticket.filter((n) => this.drawn.has(n)).length;
  }

  get busy(): boolean {
    return this.drawing || this.replaying !== null;
  }

  get canPlay(): boolean {
    return this.canBet && !this.busy && this.picks.length > 0;
  }

  private setPicks(picks: number[]) {
    this.picks = [...picks].sort((a, b) => a - b);
    save('keno.picks', this.picks);
    // A new ticket: the last draw's marks come off the board.
    this.balls = [];
    this.result = null;
    this.cardNews = null;
    this.freshStamps = new Set();
  }

  /** Marks a number, or unmarks it. Up to ten. Not while balls are coming out. */
  toggle(n: number) {
    if (this.busy) return;
    if (this.picks.includes(n)) this.setPicks(this.picks.filter((p) => p !== n));
    else if (this.picks.length < KENO_MAX_SPOTS) this.setPicks([...this.picks, n]);
    else return;
    sfx.chip();
  }

  /** A fresh ticket of `count` random numbers: as many as are marked now, or five. */
  quickPick(count = this.picks.length || 5) {
    if (this.busy) return;
    this.setPicks(kenoQuickPick(Math.min(KENO_MAX_SPOTS, Math.max(1, count)), { run: this.runSeed, round: this.round }, Date.now() % 100_000));
    sfx.chip();
  }

  clearPicks() {
    if (this.busy) return;
    this.setPicks([]);
  }

  /**
   * Draws the balls one by one onto the board for `ticket`. The pace slows
   * for a ball that could make a big win: one more catch away from paying
   * TENSE_X bets or more, near the end. False if the game was reset.
   */
  private async reveal(ticket: readonly number[], balls: readonly number[], pays: readonly number[]): Promise<boolean> {
    this.balls = [];
    sfx.spin();
    let caught = 0;
    for (let i = 0; i < KENO_DRAWN; i++) {
      const last = i === KENO_DRAWN - 1;
      const left = KENO_DRAWN - i;
      const next = (pays[caught + 1] ?? 0) * (last ? GOLD_BALL_X : 1);
      this.tense = left <= 5 && next >= TENSE_X;
      if (!(await this.seq.wait(last ? GOLD_MS : this.tense ? TENSE_MS : BALL_MS))) {
        this.tense = false;
        return false;
      }
      const ball = balls[i]!;
      this.balls = [...this.balls, ball];
      if (ticket.includes(ball)) {
        caught++;
        sfx.coin(caught);
      } else sfx.tick();
    }
    this.tense = false;
    return true;
  }

  /** Stakes the bet and draws the 20 balls, one by one, then pays the ticket and stamps the card. False if it couldn't start. */
  async play(): Promise<boolean> {
    if (!this.canPlay) return false;
    const s = this.stake();
    if (!s) return false;
    const ticket = [...this.picks];
    const balls = kenoDraw({ run: this.runSeed, round: s.round });
    const pays = this.pays;
    this.drawing = true;
    this.result = null;
    this.paid = null;
    this.cardNews = null;
    this.freshStamps = new Set();
    if (!(await this.reveal(ticket, balls, pays))) return false;

    const result = kenoSettle(ticket, balls, kenoTicketRtp(this.rtp));
    this.result = result;

    // The Gold Card: this bet's shares go in the pots, then the stamps, and anything they finish pays.
    this.rowPot = this.rowPot.add(s.bet.mul(KENO_ROW_SHARE));
    this.cardPot = this.cardPot.add(s.bet.mul(KENO_CARD_SHARE));
    const stamp = kenoStamp(this.card, ticket, balls);
    const card = new Set(this.card);
    for (const n of stamp.stamped) card.add(n);
    let rowPaid = new Decimal(0);
    let cardPaid = new Decimal(0);
    if (stamp.rows.length) {
      rowPaid = this.rowPot;
      this.rowPot = new Decimal(0);
    }
    if (stamp.full) {
      cardPaid = this.cardPot;
      this.cardPot = new Decimal(0);
    }
    this.card = stamp.full ? new Set() : card;
    this.freshStamps = new Set(stamp.stamped);
    this.cardNews = stamp.rows.length || stamp.full ? { rows: stamp.rows, full: stamp.full, rowPot: rowPaid, cardPot: cardPaid } : null;
    this.saveCard();
    this.drawing = false;

    const potX = rowPaid.add(cardPaid).div(s.bet).toNumber();
    const x = result.pay + potX;
    this.paid = { x, bet: s.bet };
    if (x >= 10 || stamp.full) sfx.bigWin();
    else if (x > 0) sfx.win();
    const base = result.gold && result.pay > 0 ? result.pay / GOLD_BALL_X : result.pay;
    const lines: BreakdownLine[] = result.pay > 0 ? [{ label: `${result.hits.length} of ${ticket.length} · ${base.toFixed(2)}×`, amount: base }] : [];
    if (result.gold && result.pay > 0) lines.push({ label: `Gold ball · ×${GOLD_BALL_X}`, amount: result.pay - base });
    if (rowPaid.gt(0)) lines.push({ label: `Gold Card · ${stamp.rows.length === 1 ? 'row' : `${stamp.rows.length} rows`} done · Row pot`, amount: rowPaid.div(s.bet).toNumber() });
    if (cardPaid.gt(0)) lines.push({ label: 'Gold Card full · Card pot', amount: cardPaid.div(s.bet).toNumber() });
    const card$ = stamp.full ? ' · card full!' : stamp.rows.length ? ' · row!' : '';
    const text = `${result.hits.length} of ${ticket.length}${result.gold ? ' · gold' : ''}${card$}`;
    this.settle(s.round, s.bet, x, text, x > 0 ? `${x >= 10 ? x.toFixed(0) : x.toFixed(2)}×` : 'no win', lines);
    // A win worth keeping: more back than the bet, or a full card.
    if (x > 1 || stamp.full) {
      const win: KenoWin = {
        run: this.runSeed,
        round: s.round,
        draw: this.rounds,
        ticket,
        bet: s.bet.toString(),
        pay: x,
        hits: result.hits.length,
        gold: result.gold,
        rows: stamp.rows.length,
        full: stamp.full,
      };
      this.wins = [win, ...this.wins].slice(0, WINS_KEPT);
      saveSoon('keno.wins', () => $state.snapshot(this.wins));
    }
    return true;
  }

  private saveCard() {
    saveSoon('keno.card', () => [...this.card]);
    saveSoon('keno.rowPot', () => this.rowPot.toString());
    saveSoon('keno.cardPot', () => this.cardPot.toString());
  }

  /**
   * Draws a past win again, exactly, from its seed: its ticket on the board,
   * the same balls in the same order, the same gold ball. Nothing is staked
   * or paid, and the card is left as it is. Auto play stops for it.
   */
  async replay(win: KenoWin) {
    if (this.busy) return;
    this.setAutoPlay(false);
    this.replaying = win;
    this.result = null;
    this.paid = null;
    this.cardNews = null;
    this.freshStamps = new Set();
    const balls = kenoDraw({ run: win.run, round: win.round });
    if (!(await this.reveal(win.ticket, balls, this.pays))) {
      this.replaying = null;
      return;
    }
    // The result as it paid then: the same ticket, balls and payback setting may differ, so show what it paid.
    this.result = kenoSettle(win.ticket, balls, kenoTicketRtp(this.rtp));
    this.paid = { x: win.pay, bet: new Decimal(win.bet) };
    sfx.win();
    if (!(await this.seq.wait(REPLAY_HOLD_MS))) {
      this.replaying = null;
      return;
    }
    if (this.replaying === win) {
      this.replaying = null;
      this.balls = [];
      this.result = null;
    }
  }

  /** Ends a replay at once, back to the player's own ticket. */
  stopReplay() {
    if (!this.replaying) return;
    this.seq.reset();
    this.replaying = null;
    this.balls = [];
    this.result = null;
    this.tense = false;
  }

  private looping = false;

  /** Auto play: the same ticket, draw after draw. Turned on mid-draw, it takes over once that draw is in. */
  private async runAuto() {
    if (this.looping) return;
    this.looping = true;
    try {
      while (this.autoPlay && !this.seq.disposed) {
        while (this.busy) if (!(await this.seq.wait(100))) return;
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
