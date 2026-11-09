import { BET_STEPS } from '@idlesuits/engine';
import type { RoundReport } from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { bankroll } from '../../lib/casino.svelte';
import { floor } from '../../lib/floor.svelte';
import { meta } from '../../lib/meta.svelte';
import { Decimal, formatMoney } from '../../lib/money';
import { room } from '../../lib/rooms';
import { load, save } from '../../lib/save';
import { Sequencer } from '../../lib/sequencer.svelte';
import { tuning } from '../../lib/tuning.svelte';

/** The bets an instant game takes, in the room's minimums, as the slots do. */
export { BET_STEPS };

export interface HistoryEntry {
  round: number;
  text: string;
  sub: string;
  net: Decimal;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * What every instant game shares: the bet, the bankroll, the session's stats
 * and history, auto play and speed, and settling a round through the charms.
 *
 * A round's stake leaves the bank when the round starts, as chips leave a
 * hand: a round abandoned halfway (the page closed mid-dig) is lost, never a
 * free look. When it ends, the stake comes back and the round settles its
 * net through the charms like any other hand.
 */
export class InstantGame {
  readonly seq = new Sequencer<true>();
  runSeed = $state(newSeed());
  /** Rounds started; each has its own seed. */
  round = $state(0);
  /** Index into BET_STEPS. */
  step = $state(0);
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);

  rounds = $state(0);
  wagered = $state(new Decimal(0));
  returned = $state(new Decimal(0));
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  history = $state<HistoryEntry[]>([]);
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);
  lastBet = $state(new Decimal(0));
  /** Stakes out on rounds still being played, so the bet can't outrun the bank. */
  protected out = 0;

  constructor(readonly id: string) {
    this.seq.remember(id);
    const step = load<number>(`${id}.bet`, 0);
    this.step = Number.isInteger(step) && step >= 0 && step < BET_STEPS.length ? step : 0;
    this.fit();
  }

  get bank(): Decimal {
    return bankroll.balance;
  }

  get bet(): Decimal {
    return floor.room.min.mul(BET_STEPS[this.step]!);
  }

  /** The payback the pit boss has set, as a fraction. */
  get rtp(): number {
    return tuning.values.instantPayback / 100;
  }

  get canBet(): boolean {
    return this.started && !this.gameOver && this.bet.lte(this.bank);
  }

  setStep(step: number) {
    if (step < 0 || step >= BET_STEPS.length) return;
    this.step = step;
    save(`${this.id}.bet`, step);
    this.fit();
  }

  /** Keeps the bet within the bankroll, stepping down a room if even the smallest bet here is too much. */
  protected fit() {
    if (this.bank.lt(room(0).min)) return;
    if (!this.out) floor.stepDownFor(this.bank, 1);
    while (this.step > 0 && this.bet.gt(this.bank)) this.step--;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.checkBroke();
  }

  restart() {
    this.seq.reset();
    this.runSeed = newSeed();
    this.round = 0;
    bankroll.buyIn();
    this.step = 0;
    this.autoPlay = false;
    this.rounds = 0;
    this.wagered = new Decimal(0);
    this.returned = new Decimal(0);
    this.sessionNet = new Decimal(0);
    this.biggestWin = new Decimal(0);
    this.history = [];
    this.last = null;
    this.gameOver = false;
    this.started = true;
  }

  dispose() {
    this.seq.dispose();
  }

  /** Takes a round's stake from the bank and gives the round its seed; null if the bank can't cover it. */
  stake(): { round: number; bet: Decimal } | null {
    if (!this.canBet) return null;
    const bet = this.bet;
    bankroll.settle(bet.neg());
    this.out++;
    return { round: this.round++, bet };
  }

  /**
   * Ends a round that paid `pay` bets (0 for a loss): the stake comes back
   * and the net settles through the charms. `text` and `sub` go in the
   * history; `lines` explain the pay in the breakdown.
   */
  settle(round: number, bet: Decimal, pay: number, text: string, sub: string, lines: BreakdownLine[] = [], onHouse = false) {
    // A round on the house (a free draw) staked nothing: all it pays is won.
    if (!onHouse) {
      this.out = Math.max(0, this.out - 1);
      bankroll.settle(bet);
    }
    const net = onHouse ? pay : pay - 1;
    const report: RoundReport = {
      game: this.id,
      seed: { run: this.runSeed, round },
      bets: [{ kind: 'main', stake: 1, net }],
      outcome: net > 0 ? 'win' : net === 0 ? 'push' : 'lose',
    };
    const charms = meta.settleRound(report, bet, net);
    this.record({ bet, pay, units: net + charms.extra, lines: [...(onHouse ? [] : [{ label: 'Bet', amount: -1 }]), ...lines, ...charms.lines], text, sub, onHouse });
    if (!this.gameOver) this.fit();
  }

  /**
   * Counts a settled round in the session: its stats, the history and the
   * breakdown. `units` is what the round came to in bets, stake and charms
   * included; `pay` what it paid, in bets.
   */
  protected record(r: { bet: Decimal; pay: number; units: number; lines: BreakdownLine[]; text: string; sub: string; onHouse: boolean }) {
    this.last = { lines: r.lines, net: r.units };
    const money = r.bet.mul(r.units);
    this.lastBet = r.bet;
    this.rounds++;
    if (!r.onHouse) this.wagered = this.wagered.add(r.bet);
    this.returned = this.returned.add(r.bet.mul(r.pay));
    this.sessionNet = this.sessionNet.add(money);
    if (r.bet.mul(r.pay).gt(this.biggestWin)) this.biggestWin = r.bet.mul(r.pay);
    this.history = [{ round: this.rounds, text: r.text, sub: r.sub, net: money }, ...this.history].slice(0, 12);
    this.checkBroke();
  }

  /** Busted: nothing left for even the smallest bet, and nothing still in play. */
  protected checkBroke() {
    if (!this.out && this.bank.lt(room(0).min)) {
      this.gameOver = true;
      this.autoPlay = false;
    }
  }

  /** The session's numbers for the Stats tab. */
  stats(unit: string): [string, string][] {
    return [
      [unit, String(this.rounds)],
      ['Paid back', this.wagered.gt(0) ? `${this.returned.div(this.wagered).mul(100).toNumber().toFixed(1)}%` : '—'],
      ['Biggest win', this.biggestWin.gt(0) ? formatMoney(this.biggestWin) : '—'],
    ];
  }
}
