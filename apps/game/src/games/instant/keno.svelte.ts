import {
  GOLD_BALL_X,
  KENO_BUFF_START,
  KENO_BUFFS,
  KENO_CARD_SHARE,
  KENO_DRAWN,
  KENO_MAX_SPOTS,
  KENO_NUMBERS,
  KENO_ROW_SHARE,
  kenoAfterDraw,
  kenoBuffDef,
  kenoBuffOnDraw,
  kenoBuffShare,
  kenoDraw,
  kenoPayback,
  kenoPays,
  kenoQuickPick,
  kenoSettle,
  kenoStamp,
  kenoTicketRtp,
  type KenoBuffKind,
  type KenoBuffState,
  type KenoDrawBuff,
  type KenoPattern,
  type KenoResult,
} from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { Decimal } from '../../lib/money';
import { load, save, saveSoon } from '../../lib/save';
import { sfx } from '../../lib/sound';
import { wins } from '../../lib/wins.svelte';
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
/** A buff just earned: the draw after it waits a moment longer, so it can be seen. */
const BUFF_NEWS_MS = 1600;

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
  /** The buff it was drawn under, if any, and what that did. */
  buff?: KenoBuffKind;
  drawBuff?: KenoDrawBuff;
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

/** Keno kept its own list of wins before every game had one: moved into the shared list once. */
function moveOldWins() {
  const old = load<KenoWin[] | null>('keno.wins', null);
  if (!Array.isArray(old) || !old.length || wins.list('keno').length) return;
  for (const w of [...old].reverse()) {
    if (!w || typeof w.run !== 'string' || !Array.isArray(w.ticket)) continue;
    const bet = new Decimal(w.bet);
    wins.record('keno', {
      round: w.draw,
      text: `${w.hits} of ${w.ticket.length}${w.gold ? ' · gold' : ''}`,
      sub: `${w.pay >= 10 ? w.pay.toFixed(0) : w.pay.toFixed(2)}×`,
      net: bet.mul(w.pay - 1).toString(),
      unit: w.bet,
      at: Date.now(),
      replay: w,
    });
  }
  save('keno.wins', null);
}

function savedBuffs(): KenoBuffState {
  const saved = load<KenoBuffState | null>('keno.buffs', null);
  if (!saved || typeof saved !== 'object') return structuredClone(KENO_BUFF_START);
  const meters = { ...KENO_BUFF_START.meters };
  for (const def of KENO_BUFFS) {
    const v = saved.meters?.[def.pattern];
    if (Number.isInteger(v) && v >= 0 && v < def.steps) meters[def.pattern] = v;
  }
  const queue = Array.isArray(saved.queue)
    ? saved.queue.filter((b) => KENO_BUFFS.some((d) => d.kind === b?.kind) && Number.isInteger(b.left) && b.left > 0 && b.left <= kenoBuffDef(b.kind).draws)
    : [];
  return { meters, queue };
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
 *
 * Pattern meters: patterns among a paid draw's balls fill four meters, and a
 * full meter earns a buff for the draws after it (see `kenoAfterDraw`). Buffs
 * wait their turn; the bet can't change while one waits or runs, so a buff
 * plays at the bet that earned it. The card, pots, meters and buffs are all
 * kept between visits.
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

  /** The pattern meters and the buffs waiting. */
  buffs = $state<KenoBuffState>(savedBuffs());
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
    moveOldWins();
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
    return this.drawing || (this.replaying !== null && !this.replayDone);
  }

  get canPlay(): boolean {
    if (!this.started || this.gameOver || this.busy || !this.picks.length) return false;
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

  /**
   * Plays a draw: stakes the bet (unless a Free Draw is up), draws the 20
   * balls under any buff, then pays the ticket, stamps the card and fills the
   * meters. False if it couldn't start.
   */
  async play(): Promise<boolean> {
    if (!this.canPlay) return false;
    this.leaveReplay();
    const head = this.nextBuff;
    const onHouse = head?.kind === 'freeDraws';
    let round: number;
    let bet: Decimal;
    if (onHouse) {
      round = this.round++;
      bet = this.bet;
    } else {
      const s = this.stake();
      if (!s) return false;
      ({ round, bet } = s);
    }
    const ticket = [...this.picks];
    const seed = { run: this.runSeed, round };
    const balls = kenoDraw(seed);
    const buff = kenoBuffOnDraw(head?.kind, ticket, seed);
    const pays = this.pays;
    this.drawing = true;
    this.result = null;
    this.paid = null;
    this.cardNews = null;
    this.freshStamps = new Set();
    this.patterns = {};
    this.earned = [];
    this.drawBuff = head ? { kind: head.kind, free: buff.free } : null;
    if (!(await this.reveal(ticket, balls, pays, buff))) return false;

    const result = kenoSettle(ticket, balls, this.ticketRtp, buff);
    this.result = result;

    // The Gold Card: a paid draw's shares go in the pots; then the stamps, and anything they finish pays.
    if (!onHouse) {
      this.rowPot = this.rowPot.add(bet.mul(KENO_ROW_SHARE));
      this.cardPot = this.cardPot.add(bet.mul(KENO_CARD_SHARE));
    }
    const stamp = kenoStamp(this.card, buff.free !== undefined ? [...ticket, buff.free] : ticket, balls);
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

    // The meters: the buff this draw played under uses up a draw; a paid draw's patterns fill their meters.
    const after = kenoAfterDraw(this.buffs, balls, !onHouse);
    this.buffs = after.state;
    this.patterns = after.patterns;
    this.earned = after.granted;
    this.saveCard();
    this.drawing = false;

    const potX = rowPaid.add(cardPaid).div(bet).toNumber();
    const x = result.pay + potX;
    this.paid = { x, bet };
    if (x >= 10 || stamp.full || after.granted.length) sfx.bigWin();
    else if (x > 0) sfx.win();

    const times = buff.times ?? 1;
    const goldX = buff.goldX ?? GOLD_BALL_X;
    const base = result.pay / times / (result.gold && result.pay > 0 ? goldX : 1);
    const lines: BreakdownLine[] = [];
    if (result.pay > 0) {
      lines.push({ label: `${result.hits.length} of ${ticket.length}${buff.free !== undefined ? ' with the free spot' : ''} · ${base.toFixed(2)}×`, amount: base });
      if (result.gold) lines.push({ label: `Gold ball · ×${goldX}${head?.kind === 'goldRush' ? ' (Gold Rush)' : ''}`, amount: base * (goldX - 1) });
      if (times > 1) lines.push({ label: `Double Up · ×${times}`, amount: result.pay - result.pay / times });
    }
    if (rowPaid.gt(0)) lines.push({ label: `Gold Card · ${stamp.rows.length === 1 ? 'row' : `${stamp.rows.length} rows`} done · Row pot`, amount: rowPaid.div(bet).toNumber() });
    if (cardPaid.gt(0)) lines.push({ label: 'Gold Card full · Card pot', amount: cardPaid.div(bet).toNumber() });
    const tag = head ? ` · ${kenoBuffDef(head.kind).name}` : '';
    const card$ = stamp.full ? ' · card full!' : stamp.rows.length ? ' · row!' : '';
    const text = `${result.hits.length} of ${ticket.length}${result.gold ? ' · gold' : ''}${tag}${card$}`;
    // What the wins list keeps to draw this again, set before the round settles into the history.
    this.lastReplay = {
      run: this.runSeed,
      round,
      draw: this.rounds + 1,
      ticket,
      bet: bet.toString(),
      pay: x,
      hits: result.hits.length,
      gold: result.gold,
      rows: stamp.rows.length,
      full: stamp.full,
      buff: head?.kind,
      drawBuff: buff.free !== undefined || buff.goldX || buff.times ? { free: buff.free, goldX: buff.goldX, times: buff.times } : undefined,
    };
    this.settle(round, bet, x, text, x > 0 ? `${x >= 10 ? x.toFixed(0) : x.toFixed(2)}×` : 'no win', lines, onHouse);

    return true;
  }

  private saveCard() {
    saveSoon('keno.card', () => [...this.card]);
    saveSoon('keno.rowPot', () => this.rowPot.toString());
    saveSoon('keno.cardPot', () => this.cardPot.toString());
    saveSoon('keno.buffs', () => $state.snapshot(this.buffs));
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
        // A buff just earned gets a moment on screen before the next draw.
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
