import {
  coinPay,
  jackpotPay,
  Rng,
  spinSlot,
  waysScaleFor,
  windowAt,
  type CoinValue,
  type HoldSpinResult,
  type JackpotTier,
  type MachineDef,
  type RoundReport,
  type SlotSpinResult,
} from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { bankroll } from '../../lib/casino.svelte';
import { floor } from '../../lib/floor.svelte';
import { jackpots, slotTest } from '../../lib/jackpot.svelte';
import { meta } from '../../lib/meta.svelte';
import { Decimal } from '../../lib/money';
import { room } from '../../lib/rooms';
import { load, save } from '../../lib/save';
import { Sequencer } from '../../lib/sequencer.svelte';
import { sfx } from '../../lib/sound';
import { tuning } from '../../lib/tuning.svelte';

/** The bets a machine takes, in the room's minimums: $5 to $500 on the Main Floor. */
export const BET_STEPS = [1, 2, 3, 5, 10, 20, 50, 100] as const;

/** Milliseconds at 1× before each step is shown. */
const SPIN_MS = 450;
const REEL_MS = 170;
/** A reel that could still bring the feature turns slowly. */
const ANTICIPATE_MS = 900;
const WIN_MS = 900;
const BANNER_MS = 1300;
const RESPIN_MS = 650;
const LAND_MS = 450;
const COUNT_MS = 200;
const RESULT_HOLD_MS = 700;

export interface HistoryEntry {
  round: number;
  text: string;
  sub: string;
  net: Decimal;
}

/** Hold & spin as the screen shows it. */
export interface FeatureView {
  /** Coins on the screen, by cell. */
  held: Record<number, CoinValue>;
  /** The empty cells are spinning. */
  spinning: boolean;
  left: number;
  /** Paid so far as the coins are counted, in dollars. */
  collected: Decimal;
  /** The cell being counted, or -1. */
  counting: number;
  full: boolean;
  /** Every coin is counted: the meter shows the spin's whole win. */
  done: boolean;
}

/** A big moment across the reels: the feature starting, a jackpot, a big win. */
export interface SlotBanner {
  key: number;
  title: string;
  amount: Decimal | null;
  tier?: JackpotTier;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class SlotGame {
  readonly seq = new Sequencer<true>();

  runSeed = $state(newSeed());
  round = $state(0);
  /** Index into BET_STEPS. */
  step = $state(0);

  /** Symbol ids by reel, then row. */
  grid = $state<string[][]>([]);
  /** Which reels are spinning. */
  spinning = $state<boolean[]>([]);
  /** The reel turning slowly because it could still bring the feature. */
  anticipating = $state(-1);
  /** Coins on the screen after a spin, by cell. */
  coins = $state<Record<number, CoinValue>>({});
  /** Cells in a paying way, as "reel:row". */
  lit = $state<string[]>([]);
  /** The win meter, in dollars. */
  win = $state<Decimal | null>(null);
  feature = $state<FeatureView | null>(null);
  banner = $state<SlotBanner | null>(null);
  roundBet = $state(new Decimal(0));
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);
  lastBet = $state(new Decimal(0));
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);

  spins = $state(0);
  features = $state(0);
  wagered = $state(new Decimal(0));
  returned = $state(new Decimal(0));
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  history = $state<HistoryEntry[]>([]);
  private banners = 0;

  constructor(readonly machine: MachineDef) {
    this.seq.remember(`slot.${machine.id}`);
    const step = load<number>(`slot.${machine.id}.bet`, 0);
    this.step = Number.isInteger(step) && step >= 0 && step < BET_STEPS.length ? step : 0;
    // A screen to look at before the first spin.
    const rng = new Rng(this.runSeed, 'idle');
    this.grid = machine.reels.map((strip) => windowAt(strip, rng.int(strip.length), machine.rows));
    this.spinning = machine.reels.map(() => false);
    this.fit();
  }

  get bank(): Decimal {
    return bankroll.balance;
  }

  get bet(): Decimal {
    return floor.room.min.mul(BET_STEPS[this.step]!);
  }

  /** Way-pays scaled so the machine pays back what the pit boss has set. */
  get waysScale(): number {
    return waysScaleFor(this.machine, tuning.values.slotPayback / 100);
  }

  get broke(): boolean {
    return this.bank.lt(room(0).min);
  }

  get canSpin(): boolean {
    return this.seq.awaiting === 'spin' && this.bet.lte(this.bank);
  }

  setStep(step: number) {
    // A change mid-spin takes effect from the next spin.
    if (step < 0 || step >= BET_STEPS.length) return;
    this.step = step;
    save(`slot.${this.machine.id}.bet`, step);
    this.fit();
  }

  /** Keeps the bet within the bankroll, stepping down a room if even the smallest bet here is too much. */
  private fit() {
    if (this.broke) return;
    floor.stepDownFor(this.bank, 1);
    while (this.step > 0 && this.bet.gt(this.bank)) this.step--;
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
    this.autoPlay = on;
    if (on && this.canSpin) this.seq.answer(true);
  }

  spin() {
    if (this.canSpin) this.seq.answer(true);
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
    this.step = 0;
    this.autoPlay = false;
    this.spins = 0;
    this.features = 0;
    this.wagered = new Decimal(0);
    this.returned = new Decimal(0);
    this.sessionNet = new Decimal(0);
    this.biggestWin = new Decimal(0);
    this.history = [];
    this.last = null;
    this.gameOver = false;
    this.started = false;
    this.start();
  }

  private async loop() {
    while (this.started && !this.gameOver && !this.seq.disposed) {
      const auto = this.autoPlay && this.bet.lte(this.bank) && this.spins > 0;
      const ok = auto ? await this.seq.wait(RESULT_HOLD_MS) : (await this.seq.ask('spin')) !== null;
      if (!ok) return;
      if (this.bet.gt(this.bank)) continue;
      if (!(await this.playRound())) return;
    }
  }

  private wait(ms: number): Promise<boolean> {
    return this.seq.wait(ms);
  }

  private showBanner(title: string, amount: Decimal | null, tier?: JackpotTier) {
    this.banner = { key: ++this.banners, title, amount, tier };
  }

  private async playRound(): Promise<boolean> {
    const bet = this.bet;
    const result = spinSlot({
      machine: this.machine,
      seed: { run: this.runSeed, round: this.round },
      waysScale: this.waysScale,
      meters: jackpots.meters,
      forceFeature: slotTest.forceFeature,
    });
    slotTest.forceFeature = false;
    this.roundBet = bet;
    if (!(await this.show(result, bet))) return false;
    this.settle(result, bet);
    return true;
  }

  /** The reels spin and stop left to right; the ways light up; then any feature plays out. */
  private async show(result: SlotSpinResult, bet: Decimal): Promise<boolean> {
    const { machine } = this;
    this.win = null;
    this.lit = [];
    this.coins = {};
    this.feature = null;
    this.banner = null;
    this.spinning = machine.reels.map(() => true);
    sfx.spin();
    if (!(await this.wait(SPIN_MS))) return false;

    const coinsOn = (r: number) => result.coins.filter((c) => Math.floor(c.cell / machine.rows) === r);
    let landed = 0;
    for (let r = 0; r < machine.reels.length; r++) {
      // Close to the feature with reels to come: this one turns slowly.
      const left = machine.reels.length - r;
      const tense = landed >= 3 && landed + left * machine.rows >= machine.holdSpin.trigger && landed < machine.holdSpin.trigger;
      this.anticipating = tense ? r : -1;
      if (tense && this.seq.speed === 'smart') sfx.tension();
      if (!(await this.wait(tense ? ANTICIPATE_MS : REEL_MS))) return false;
      this.grid[r] = result.grid[r]!;
      this.spinning[r] = false;
      const coins = coinsOn(r);
      for (const c of coins) this.coins[c.cell] = c.value;
      landed += coins.length;
      if (coins.length) sfx.coin();
      else sfx.reel();
    }
    this.anticipating = -1;

    if (result.wins.length) {
      this.lit = [...new Set(result.wins.flatMap((w) => w.cells.map(([r, row]) => `${r}:${row}`)))];
      this.win = bet.mul(result.waysPay);
      if (result.waysPay >= 5) sfx.bigWin();
      else sfx.win();
      if (!(await this.wait(WIN_MS))) return false;
    }

    if (result.feature) {
      this.lit = [];
      if (!(await this.playFeature(result.feature, bet))) return false;
      this.win = bet.mul(result.pay);
      this.feature!.done = true;
    }
    return true;
  }

  private async playFeature(f: HoldSpinResult, bet: Decimal): Promise<boolean> {
    const { machine } = this;
    const meters = { major: jackpots.major, grand: jackpots.grand };
    this.feature = {
      held: Object.fromEntries(f.start.map((c) => [c.cell, c.value])),
      spinning: false,
      left: machine.holdSpin.respins,
      collected: new Decimal(0),
      counting: -1,
      full: false,
      done: false,
    };
    this.showBanner('Hold & spin', null);
    sfx.bigWin();
    if (!(await this.wait(BANNER_MS))) return false;
    this.banner = null;

    for (const respin of f.respins) {
      this.feature.spinning = true;
      if (!(await this.wait(RESPIN_MS))) return false;
      this.feature.spinning = false;
      for (const c of respin.landed) this.feature.held[c.cell] = c.value;
      this.feature.left = respin.left;
      if (respin.landed.length) sfx.coin();
      else sfx.reel();
      if (!(await this.wait(respin.landed.length ? LAND_MS : LAND_MS * 0.6))) return false;
    }

    // Count the coins in, one by one, then any Grand for the full screen.
    for (const c of f.coins) {
      this.feature.counting = c.cell;
      this.feature.collected = this.feature.collected.add(bet.mul(coinPay(machine, c.value, meters)));
      sfx.chip();
      if (c.value.kind === 'jackpot' && c.value.tier !== 'mini') {
        this.showBanner(`${c.value.tier} jackpot`, bet.mul(jackpotPay(machine, c.value.tier, meters)), c.value.tier);
        sfx.bigWin();
        if (!(await this.wait(BANNER_MS))) return false;
        this.banner = null;
      } else if (!(await this.wait(COUNT_MS))) return false;
    }
    this.feature.counting = -1;
    if (f.full) {
      this.feature.full = true;
      this.feature.collected = this.feature.collected.add(bet.mul(meters.grand));
      this.showBanner('Grand jackpot', bet.mul(meters.grand), 'grand');
      sfx.bigWin();
      if (!(await this.wait(BANNER_MS * 1.5))) return false;
      this.banner = null;
    }
    return true;
  }

  private reportFor(result: SlotSpinResult): RoundReport {
    const net = result.pay - 1;
    return {
      game: this.machine.id,
      seed: { run: this.runSeed, round: this.round },
      bets: [{ kind: 'main', stake: 1, net }],
      outcome: net > 0 ? 'win' : net === 0 ? 'push' : 'lose',
    };
  }

  /** The spin's lines for the breakdown, in bets. */
  private linesFor(result: SlotSpinResult): BreakdownLine[] {
    const lines: BreakdownLine[] = [{ label: 'Spin', amount: -1 }];
    if (result.wins.length) {
      const n = result.wins.reduce((sum, w) => sum + w.ways, 0);
      lines.push({ label: `Ways · ${n} ${n === 1 ? 'way' : 'ways'}`, amount: result.waysPay });
    }
    const f = result.feature;
    if (f) {
      const cash = f.coins.reduce((sum, c) => sum + (c.value.kind === 'cash' ? c.value.x : 0), 0);
      lines.push({ label: `Hold & spin · ${f.coins.length} coins`, amount: cash });
      for (const tier of f.jackpots) {
        lines.push({ label: `${tier[0]!.toUpperCase()}${tier.slice(1)} jackpot`, amount: jackpotPay(this.machine, tier, jackpots.meters) });
      }
    }
    return lines;
  }

  private settle(result: SlotSpinResult, bet: Decimal) {
    const net = result.pay - 1;
    const lines = this.linesFor(result);
    // Charms act on the settled spin; the bankroll is paid the spin and whatever they add.
    const charms = meta.settleRound(this.reportFor(result), bet, net);
    const units = net + charms.extra;
    this.last = { lines: [...lines, ...charms.lines], net: units };
    // Whoever hits a progressive starts it over, for every machine on the floor.
    for (const tier of result.feature?.jackpots ?? []) if (tier === 'major' || tier === 'grand') jackpots.hit(tier);
    const money = bet.mul(units);
    this.lastBet = bet;
    this.spins++;
    if (result.feature) this.features++;
    this.wagered = this.wagered.add(bet);
    this.returned = this.returned.add(bet.mul(result.pay));
    this.sessionNet = this.sessionNet.add(money);
    if (bet.mul(result.pay).gt(this.biggestWin)) this.biggestWin = bet.mul(result.pay);
    this.round++;
    if (result.pay > 0) {
      const top = [...result.wins].sort((a, b) => b.pay - a.pay)[0];
      const name = top ? this.machine.symbols.find((s) => s.id === top.symbol)!.name : '';
      const entry: HistoryEntry = {
        round: this.round,
        text: result.feature ? 'Hold & spin' : `${top!.reels} ${name}`,
        sub: result.feature ? `${result.feature.coins.length} coins` : `${result.wins.length} win${result.wins.length > 1 ? 's' : ''}`,
        net: money,
      };
      this.history = [entry, ...this.history].slice(0, 12);
    }
    if (this.broke) {
      // Losing it all is the penalty for running unattended: auto play stops until it's pressed again.
      this.gameOver = true;
      this.autoPlay = false;
    } else this.fit();
  }
}
