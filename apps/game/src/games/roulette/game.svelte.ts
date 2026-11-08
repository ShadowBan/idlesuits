import { rouletteBet, rouletteSettle, rouletteSpin, ROULETTE_POCKETS, type RouletteResult, type RoundReport } from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { bankroll } from '../../lib/casino.svelte';
import { floor } from '../../lib/floor.svelte';
import { ROULETTE_TOKENS } from '../../lib/gameRules';
import { meta } from '../../lib/meta.svelte';
import { Decimal, formatMoney } from '../../lib/money';
import { room } from '../../lib/rooms';
import { load, saveSoon } from '../../lib/save';
import { Sequencer } from '../../lib/sequencer.svelte';
import { sfx } from '../../lib/sound';
import { tuning } from '../../lib/tuning.svelte';

/** How long the ball spins before it drops, at 1×. */
export const SPIN_MS = 4200;
/** After the ball drops: a moment on the number, then the winners are paid. */
const LAND_MS = 700;
const RESULT_HOLD_MS = 1500;
/** Numbers kept for the board's history and hot/cold. */
const HISTORY = 100;

export interface HistoryEntry {
  round: number;
  pocket: number;
  staked: Decimal;
  net: Decimal;
}

/** A spin kept with its win: enough to spin it again exactly. */
export interface RouletteReplay {
  run: string;
  round: number;
  /** The layout it was spun with, in dollars, as strings so any size survives saving. */
  layout: Record<string, string>;
}


function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

type Layout = Record<string, Decimal>;

function toSaved(layout: Layout): Record<string, string> {
  return Object.fromEntries(Object.entries(layout).map(([id, v]) => [id, v.toString()]));
}

function fromSaved(saved: unknown): Layout {
  const out: Layout = {};
  if (!saved || typeof saved !== 'object') return out;
  for (const [id, v] of Object.entries(saved as Record<string, unknown>)) {
    if (!rouletteBet(id) || typeof v !== 'string') continue;
    try {
      const amount = new Decimal(v).floor();
      if (amount.gt(0)) out[id] = amount;
    } catch {
      // A corrupt amount is left off the layout.
    }
  }
  return out;
}

/**
 * Single-zero roulette. The player lays chips on the layout between spins;
 * the ball's pocket comes from the round's seed, and every bet settles on it.
 * The layout stays down from spin to spin (as "rebet" does at a real table),
 * so auto play keeps spinning it, and it is saved.
 *
 * Limits: the whole layout must come to at least the room's minimum, no one
 * bet past the room's maximum, and never more than the bankroll.
 */
export class RouletteGame {
  readonly seq = new Sequencer<true>();
  runSeed = $state(newSeed());
  round = $state(0);

  /** The chips on the layout for the next spin. */
  layout = $state<Layout>({});
  /** Each chip put down, newest last, to take back one at a time. */
  private placed: { id: string; amount: Decimal }[] = [];
  /** The layout as it was for the last spin, for Rebet after a clear. */
  private lastLayout: Layout = {};

  /** The spin in progress or just finished. */
  spinning = $state(false);
  pocket = $state<number | null>(null);
  /** Each bet's result on the last spin, by id: what it won (or lost). */
  results = $state<Record<string, number>>({});
  /** The spin being shown: the layout it was spun with, and its seed's pocket. */
  spinLayout = $state<Layout>({});
  /** Counts the spins this table has animated, so the wheel turns afresh each time. */
  spins = $state(0);
  /** The spin that just settled, as the wins list keeps it to replay. */
  lastReplay = $state<RouletteReplay | null>(null);
  /** A kept spin being spun again, and what it won then: nothing staked, nothing paid. */
  replaying = $state.raw<RouletteReplay | null>(null);
  /** The replay's ball has landed: its spin holds on the table until the player moves on. */
  replayDone = $state(false);
  replayNet = $state<Decimal | null>(null);

  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  history = $state<HistoryEntry[]>([]);
  /** The last numbers to come up, newest first, kept between visits. */
  numbers = $state<number[]>([]);
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);
  lastUnit = $state(new Decimal(1));
  /**
   * The base Tokens each way of counting would have paid this session, before
   * charms, the room bonus and the Token rate (which multiply both alike): by
   * the spin's net, and by every winning bet's share of the chips.
   */
  tokensBySpin = $state(0);
  tokensByBet = $state(0);

  constructor() {
    this.seq.remember('roulette');
    this.layout = fromSaved(load('roulette.layout', {}));
    this.lastLayout = { ...this.layout };
    const numbers = load<number[]>('roulette.numbers', []);
    this.numbers = Array.isArray(numbers) ? numbers.filter((n) => Number.isInteger(n) && n >= 0 && n < ROULETTE_POCKETS).slice(0, HISTORY) : [];
  }

  get bank(): Decimal {
    return bankroll.balance;
  }

  get total(): Decimal {
    return Object.values(this.layout).reduce((sum, v) => sum.add(v), new Decimal(0));
  }

  get minimum(): Decimal {
    return room(0).min;
  }

  get broke(): boolean {
    return this.bank.lt(this.minimum);
  }

  get canSpin(): boolean {
    const total = this.total;
    return this.started && !this.gameOver && !this.spinning && (!this.replaying || this.replayDone) && total.gte(floor.room.min) && total.lte(this.bank);
  }

  /** Why the layout can't be spun yet, if the table's limits are what stop it. */
  get hint(): string | null {
    const total = this.total;
    if (total.gt(0) && total.lt(floor.room.min)) return `Table minimum ${formatMoney(floor.room.min)}`;
    if (total.gt(this.bank)) return 'More than your bank';
    return null;
  }

  private persist() {
    saveSoon('roulette.layout', () => toSaved(this.layout));
  }

  /** Puts a chip of `amount` on a bet, up to the room's maximum per bet and what the bankroll covers. */
  place(id: string, amount: Decimal): boolean {
    if (this.spinning || (this.replaying && !this.replayDone) || !rouletteBet(id)) return false;
    this.leaveReplay();
    const now = this.layout[id] ?? new Decimal(0);
    const headroom = floor.room.max.sub(now);
    const spare = this.bank.sub(this.total);
    const add = Decimal.min(amount, Decimal.min(headroom, spare)).floor();
    if (add.lte(0)) return false;
    this.layout = { ...this.layout, [id]: now.add(add) };
    this.placed.push({ id, amount: add });
    this.results = {};
    this.persist();
    sfx.chip();
    return true;
  }

  /** Takes back the last chip put down. */
  undo() {
    if (this.spinning) return;
    this.leaveReplay();
    const chip = this.placed.pop();
    if (!chip) return;
    const left = (this.layout[chip.id] ?? new Decimal(0)).sub(chip.amount);
    const next = { ...this.layout };
    if (left.gt(0)) next[chip.id] = left;
    else delete next[chip.id];
    this.layout = next;
    this.persist();
  }

  /** Takes every chip off one bet. */
  take(id: string) {
    if (this.spinning || !this.layout[id]) return;
    this.leaveReplay();
    const next = { ...this.layout };
    delete next[id];
    this.layout = next;
    this.placed = this.placed.filter((p) => p.id !== id);
    this.results = {};
    this.persist();
  }

  get canUndo(): boolean {
    return !this.spinning && this.placed.length > 0;
  }

  clear() {
    if (this.spinning) return;
    this.leaveReplay();
    this.layout = {};
    this.placed = [];
    this.results = {};
    this.persist();
  }

  /** Puts the last spin's layout back down, if the bankroll covers it. */
  rebet() {
    if (this.spinning) return;
    this.leaveReplay();
    const total = Object.values(this.lastLayout).reduce((sum, v) => sum.add(v), new Decimal(0));
    if (total.lte(0) || total.gt(this.bank)) return;
    this.layout = { ...this.lastLayout };
    this.placed = [];
    this.persist();
    sfx.chip();
  }

  get canRebet(): boolean {
    return !this.spinning && Object.keys(this.layout).length === 0 && Object.keys(this.lastLayout).length > 0;
  }

  /** Doubles every bet, within the room's maximum, if the bankroll covers it. */
  double() {
    if (this.spinning) return;
    this.leaveReplay();
    const next: Layout = {};
    for (const [id, v] of Object.entries(this.layout)) next[id] = Decimal.min(v.mul(2), floor.room.max);
    const total = Object.values(next).reduce((sum, v) => sum.add(v), new Decimal(0));
    if (total.lte(this.total) || total.gt(this.bank)) return;
    this.layout = next;
    this.placed = [];
    this.persist();
    sfx.chip();
  }

  /** Keeps a standing layout within the bankroll after a spin: scaled down if it no longer fits, cleared if even that won't do. */
  private fit() {
    floor.stepDownFor(this.bank, 1);
    const total = this.total;
    if (total.lte(this.bank)) return;
    const scale = this.bank.div(total);
    const next: Layout = {};
    for (const [id, v] of Object.entries(this.layout)) {
      const s = v.mul(scale).floor();
      if (s.gt(0)) next[id] = s;
    }
    const scaled = Object.values(next).reduce((sum, v) => sum.add(v), new Decimal(0));
    this.layout = scaled.gte(floor.room.min) ? next : {};
    this.placed = [];
    this.persist();
  }

  /**
   * Spins a kept spin again, exactly: its layout on the table and the ball into
   * the same pocket, each bet lit as it won or lost. Nothing is staked or paid,
   * and the player's own chips come back after. Auto play stops for it.
   */
  async replay(d: RouletteReplay) {
    if (this.spinning || (this.replaying && !this.replayDone)) return;
    this.setAutoPlay(false);
    this.leaveReplay();
    const layout = fromSaved(d.layout);
    const unit = Object.values(layout).reduce((sum, v) => sum.add(v), new Decimal(0));
    if (unit.lte(0)) return;
    this.replaying = d;
    this.replayDone = false;
    this.replayNet = null;
    this.spinLayout = layout;
    this.results = {};
    this.pocket = rouletteSpin({ run: d.run, round: d.round });
    this.spinning = true;
    this.spins++;
    sfx.spin();
    const done = () => this.replaying === d;
    if (!(await this.seq.wait(SPIN_MS)) || !done()) return this.endReplay();
    sfx.chip();
    if (!(await this.seq.wait(LAND_MS)) || !done()) return this.endReplay();
    const stakes = Object.fromEntries(Object.entries(layout).map(([id, v]) => [id, v.div(unit).toNumber()]));
    const result = rouletteSettle(stakes, this.pocket);
    this.results = Object.fromEntries(result.bets.map((b) => [b.id, b.net]));
    this.replayNet = unit.mul(result.net);
    this.spinning = false;
    sfx.win();
    // The replay holds here, its chips and number on the table, until the player moves on.
    this.replayDone = true;
  }

  private endReplay() {
    this.replaying = null;
    this.replayDone = false;
    this.replayNet = null;
    this.spinning = false;
    this.results = {};
  }

  /** A finished replay steps aside for whatever the player does next. */
  private leaveReplay() {
    if (this.replaying && this.replayDone) this.endReplay();
  }

  /** Puts a replay away, held or mid-spin. */
  closeReplay() {
    if (this.replayDone) this.endReplay();
  }

  start() {
    if (this.started || this.seq.disposed) return;
    this.started = true;
    if (this.broke) {
      this.gameOver = true;
      this.autoPlay = false;
    }
    void this.loop();
  }

  setAutoPlay(on: boolean) {
    if (on) this.leaveReplay();
    this.autoPlay = on;
    if (on && this.seq.awaiting === 'spin' && this.canSpin) this.seq.answer(true);
  }

  spin() {
    if (this.seq.awaiting === 'spin' && this.canSpin) this.seq.answer(true);
  }

  dispose() {
    this.seq.dispose();
    this.started = false;
  }

  restart() {
    this.seq.reset();
    this.runSeed = newSeed();
    this.round = 0;
    bankroll.buyIn();
    this.layout = {};
    this.placed = [];
    this.results = {};
    this.persist();
    this.autoPlay = false;
    this.hands = 0;
    this.sessionNet = new Decimal(0);
    this.biggestWin = new Decimal(0);
    this.tokensBySpin = 0;
    this.tokensByBet = 0;
    this.history = [];
    this.last = null;
    this.pocket = null;
    this.gameOver = false;
    this.started = false;
    this.start();
  }

  private async loop() {
    while (this.started && !this.gameOver && !this.seq.disposed) {
      const auto = this.autoPlay && this.canSpin && this.hands > 0;
      const ok = auto ? await this.seq.wait(RESULT_HOLD_MS) : (await this.seq.ask('spin')) !== null;
      if (!ok) return;
      if (!this.canSpin) {
        // Auto play with nothing it can spin: it stops and waits for the player.
        if (this.autoPlay && !this.total.gt(0)) this.autoPlay = false;
        if (this.autoPlay && !(await this.seq.wait(RESULT_HOLD_MS))) return;
        continue;
      }
      if (!(await this.playRound())) return;
    }
  }

  private async playRound(): Promise<boolean> {
    this.leaveReplay();
    const layout = { ...this.layout };
    const unit = Object.values(layout).reduce((sum, v) => sum.add(v), new Decimal(0));
    const pocket = rouletteSpin({ run: this.runSeed, round: this.round });
    this.spinLayout = layout;
    this.lastLayout = layout;
    this.results = {};
    this.pocket = pocket;
    this.spinning = true;
    this.spins++;
    sfx.spin();
    if (!(await this.seq.wait(SPIN_MS))) return false;
    sfx.chip();
    if (!(await this.seq.wait(LAND_MS))) return false;

    // Every bet in units of the whole layout, so the charms see the spin as one bet.
    const stakes = Object.fromEntries(Object.entries(layout).map(([id, v]) => [id, v.div(unit).toNumber()]));
    const result = rouletteSettle(stakes, pocket);
    this.results = Object.fromEntries(result.bets.map((b) => [b.id, b.net]));
    this.spinning = false;
    if (result.net >= 5) sfx.bigWin();
    else if (result.net > 0) sfx.win();
    else if (result.net < 0) sfx.lose();
    this.settle(result, unit, layout);
    return true;
  }

  /** Which way the pit boss has roulette pay Tokens: by each winning bet, or by the spin as a whole. */
  get tokensPerBet(): boolean {
    return tuning.gameValue('roulette', ROULETTE_TOKENS.path, ROULETTE_TOKENS.value as boolean);
  }

  /**
   * The spin as the charms see it, in units of the whole layout. Tokens are a
   * winning bet's net over its stake, so:
   *  - by the spin: one bet, the whole layout, earning its net odds only when the spin wins overall;
   *  - by each bet: every winning bet as a bet of stake 1 (the layout) and its win, so each earns its odds
   *    weighted by its share of the chips, and the losers together as one losing bet.
   * Either way the bets add up to the spin's stake and net, so the charms' cash sees the same spin.
   * Covering every number can't farm Tokens either way: a whole layout earns at most 35/37 a spin on average.
   */
  private reportFor(result: RouletteResult): RoundReport {
    const bets: RoundReport['bets'] = [];
    if (this.tokensPerBet) {
      for (const b of result.bets) if (b.net > 0) bets.push({ kind: 'main', stake: 1, net: b.net });
      const lost = result.bets.filter((b) => b.net < 0).reduce((sum, b) => sum + b.stake, 0);
      if (lost > 0) bets.push({ kind: 'main', stake: lost, net: -lost });
    } else bets.push({ kind: 'main', stake: 1, net: result.net });
    return {
      game: 'roulette',
      seed: { run: this.runSeed, round: this.round },
      bets,
      outcome: result.net > 0 ? 'win' : result.net < 0 ? 'lose' : 'push',
    };
  }

  private settle(result: RouletteResult, unit: Decimal, layout: Layout) {
    this.tokensBySpin += Math.max(0, result.net);
    this.tokensByBet += result.bets.reduce((sum, b) => sum + Math.max(0, b.net), 0);
    this.lastReplay = { run: this.runSeed, round: this.round, layout: toSaved(layout) };
    const charms = meta.settleRound(this.reportFor(result), unit, result.net);
    const units = result.net + charms.extra;
    const lines: BreakdownLine[] = result.bets
      .filter((b) => b.net > 0)
      .map((b) => ({ label: `${rouletteBet(b.id)!.label} · ${rouletteBet(b.id)!.pays}:1`, amount: b.net }));
    const lost = result.bets.filter((b) => b.net < 0).reduce((sum, b) => sum + b.net, 0);
    if (lost < 0) lines.push({ label: `${result.bets.filter((b) => b.net < 0).length} losing ${result.bets.filter((b) => b.net < 0).length === 1 ? 'bet' : 'bets'}`, amount: lost });
    this.last = { lines: [...lines, ...charms.lines], net: units };
    this.lastUnit = unit;
    const net = unit.mul(units);
    this.sessionNet = this.sessionNet.add(net);
    if (net.gt(this.biggestWin)) this.biggestWin = net;
    this.hands++;
    this.round++;
    this.numbers = [result.pocket, ...this.numbers].slice(0, HISTORY);
    saveSoon('roulette.numbers', () => $state.snapshot(this.numbers));
    const staked = Object.values(layout).reduce((sum, v) => sum.add(v), new Decimal(0));
    this.history = [{ round: this.round, pocket: result.pocket, staked, net }, ...this.history].slice(0, 12);
    if (this.broke) {
      this.gameOver = true;
      this.autoPlay = false;
    } else this.fit();
  }
}
