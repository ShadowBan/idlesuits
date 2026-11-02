import {
  coinPay,
  jackpotPay,
  Rng,
  spinSlot,
  waysScaleFor,
  windowAt,
  type CoinValue,
  type HoldSpinResult,
  type JackpotMeters,
  type JackpotTier,
  type MachineDef,
  type RoundReport,
  type SlotSpinResult,
  type WayWin,
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
/** The bonus, at normal speed. It keeps these timings even at 5× unless the player lets it follow the table. */
const BONUS_INTRO_MS = 1800;
const BONUS_BREATH_MS = 500;
/** Every empty cell spins this long before the first one stops. */
const RESPIN_SPIN_MS = 1000;
/** Between cells stopping; slower on the last respin, and slowest with a full screen in reach. */
const CELL_MS = 150;
const LAST_CELL_MS = 300;
const TENSE_CELL_MS = 1100;
/** Empty cells left that count as a shot at the Grand. */
const NEAR_GRAND = 3;
const AFTER_LAND_MS = 800;
const AFTER_MISS_MS = 550;
const COUNT_MS = 320;
const COUNT_MIN_MS = 120;
const RESULT_HOLD_MS = 700;
/** How long the bonus win stays up, in real seconds whatever the speed, unless dismissed sooner. */
export const SUMMARY_MS = 7000;

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
  /** Empty cells still spinning, each a reel of its own. */
  spinning: number[];
  /** Spinning cells taking their time: a full screen is in reach. */
  tense: number[];
  left: number;
  /** Counts the respins going back to full, so the counter can flash. */
  resets: number;
  /** This is the last respin unless a coin lands. */
  last: boolean;
  /** Paid so far as the coins are counted, in dollars. */
  collected: Decimal;
  /** The cell being counted, or -1. */
  counting: number;
  full: boolean;
  /** Every coin is counted: the meter shows the spin's whole win. */
  done: boolean;
}

/** What the bonus paid, up over the reels once it ends. */
export interface BonusSummary {
  key: number;
  /** The feature's coins and jackpots, in dollars. */
  bonus: Decimal;
  /** Everything the spin paid, ways included. */
  total: Decimal;
  coins: number;
  jackpots: JackpotTier[];
  full: boolean;
}

/** A big moment across the reels: the feature starting, a jackpot, a big win. */
export interface SlotBanner {
  key: number;
  title: string;
  amount: Decimal | null;
  tier?: JackpotTier;
}

/** A spin as played: the result, the meters it paid from, and any must-hit Major. */
interface Spin {
  result: SlotSpinResult;
  meters: JackpotMeters;
  mystery: boolean;
  /** Everything paid, the must-hit Major included, in bets. */
  pay: number;
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
  /** The spin's way-pays, for the screen to show one by one. */
  wins = $state<WayWin[]>([]);
  /** The win meter, in dollars. */
  win = $state<Decimal | null>(null);
  feature = $state<FeatureView | null>(null);
  banner = $state<SlotBanner | null>(null);
  summary = $state<BonusSummary | null>(null);
  roundBet = $state(new Decimal(0));
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);
  lastBet = $state(new Decimal(0));
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);
  /** The bonus plays at normal speed whatever the deal speed. Saved per machine. */
  bonusFull = $state(true);

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
    this.bonusFull = load<boolean>(`slot.${machine.id}.bonusFull`, true) !== false;
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

  setBonusFull(on: boolean) {
    this.bonusFull = on;
    save(`slot.${this.machine.id}.bonusFull`, on);
  }

  /** Closes the bonus win early. */
  dismiss() {
    if (this.seq.awaiting === 'summary') this.seq.answer(true);
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
    // The meters as the reels start: they keep ticking, but this spin pays what they showed.
    const meters = jackpots.meters;
    const result = spinSlot({
      machine: this.machine,
      seed: { run: this.runSeed, round: this.round },
      waysScale: this.waysScale,
      meters,
      forceFeature: slotTest.forceFeature,
    });
    slotTest.forceFeature = false;
    // The Major past its hidden point goes to this spin, unless coins win it first.
    const mystery = jackpots.majorDue && !result.feature?.jackpots.includes('major');
    const spin: Spin = { result, meters, mystery, pay: result.pay + (mystery ? meters.major : 0) };
    this.roundBet = bet;
    if (!(await this.show(spin, bet))) return false;
    this.settle(spin, bet);
    return true;
  }

  /** The reels spin and stop left to right; the ways light up; then any feature plays out. */
  private async show(spin: Spin, bet: Decimal): Promise<boolean> {
    const { machine } = this;
    const { result } = spin;
    this.win = null;
    this.wins = [];
    this.coins = {};
    this.feature = null;
    this.banner = null;
    this.summary = null;
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
      this.wins = result.wins;
      this.win = bet.mul(result.waysPay);
      if (result.waysPay >= 5) sfx.bigWin();
      else sfx.win();
      if (!(await this.wait(WIN_MS))) return false;
    }

    if (result.feature) {
      this.wins = [];
      if (!(await this.playFeature(result.feature, bet, spin.meters))) return false;
      this.win = bet.mul(result.pay);
      this.feature!.done = true;
      // The bonus win stays up for a few seconds, in real time, or until the player closes it.
      this.summary = {
        key: ++this.banners,
        bonus: bet.mul(result.feature.pay),
        total: bet.mul(result.pay),
        coins: result.feature.coins.length,
        jackpots: result.feature.jackpots,
        full: result.feature.full,
      };
      const timer = setTimeout(() => this.dismiss(), SUMMARY_MS);
      const closed = await this.seq.ask('summary');
      clearTimeout(timer);
      this.summary = null;
      if (closed === null) return false;
    }

    if (spin.mystery) {
      this.showBanner('Must-hit Major', bet.mul(spin.meters.major), 'major');
      sfx.bigWin();
      if (!(await this.bonusWait(BANNER_MS * 1.5))) return false;
      this.banner = null;
      this.win = bet.mul(spin.pay);
    }
    return true;
  }

  /** A wait in the bonus: at full length when the bonus plays at normal speed, else at the table's speed. */
  private bonusWait(ms: number): Promise<boolean> {
    return this.bonusFull ? this.seq.waitFull(ms) : this.wait(ms);
  }

  /**
   * Hold & spin, paced like a real machine's: the empty cells spin a while,
   * then stop one by one; the last respin stops slowly; and with only a few
   * cells left before a full screen, each of them takes its time.
   */
  private async playFeature(f: HoldSpinResult, bet: Decimal, meters: JackpotMeters): Promise<boolean> {
    const { machine } = this;
    const cells = machine.reels.length * machine.rows;
    const respins = machine.holdSpin.respins;
    const drama = this.bonusFull || this.seq.speed === 'smart';
    const wait = (ms: number) => this.bonusWait(ms);
    this.feature = {
      held: Object.fromEntries(f.start.map((c) => [c.cell, c.value])),
      spinning: [],
      tense: [],
      left: respins,
      resets: 0,
      last: false,
      collected: new Decimal(0),
      counting: -1,
      full: false,
      done: false,
    };
    this.showBanner('Hold & spin', null);
    sfx.bigWin();
    if (!(await wait(BONUS_INTRO_MS))) return false;
    this.banner = null;
    if (!(await wait(BONUS_BREATH_MS))) return false;

    let streak = 0;
    for (const respin of f.respins) {
      const view = this.feature;
      // Every empty cell is a reel of its own: they all spin, then stop one by one, left to right.
      const empty = Array.from({ length: cells }, (_, c) => c).filter((c) => !(c in view.held));
      const landed = new Map(respin.landed.map((c) => [c.cell, c.value]));
      // The last respin is the last chance; a nearly full screen is a shot at the Grand.
      view.last = view.left === 1;
      const nearGrand = empty.length <= NEAR_GRAND;
      view.spinning = empty;
      view.tense = nearGrand ? empty : [];
      if (drama && (view.last || nearGrand)) sfx.tension();
      if (!(await wait(view.last || nearGrand ? RESPIN_SPIN_MS * 1.4 : RESPIN_SPIN_MS))) return false;

      for (const cell of empty) {
        const pause = nearGrand ? TENSE_CELL_MS : view.last ? LAST_CELL_MS : CELL_MS;
        if (!(await wait(pause))) return false;
        view.spinning = view.spinning.filter((c) => c !== cell);
        view.tense = view.tense.filter((c) => c !== cell);
        const value = landed.get(cell);
        if (value) {
          view.held[cell] = value;
          // A coin puts the respins back to full, and the counter flashes to say so.
          if (view.left !== respins) view.resets++;
          view.left = respins;
          view.last = false;
          sfx.coin(streak++);
        } else if (drama) sfx.tick();
      }
      view.left = respin.left;
      view.last = false;
      if (respin.landed.length) sfx.reset();
      if (!(await wait(respin.landed.length ? AFTER_LAND_MS : AFTER_MISS_MS))) return false;
    }

    // Count the coins in, one by one and faster as they go, then any Grand for the full screen.
    if (!(await wait(BONUS_BREATH_MS))) return false;
    for (const [i, c] of f.coins.entries()) {
      this.feature.counting = c.cell;
      this.feature.collected = this.feature.collected.add(bet.mul(coinPay(machine, c.value, meters)));
      sfx.coin(i);
      if (c.value.kind === 'jackpot' && c.value.tier !== 'mini') {
        this.showBanner(`${c.value.tier} jackpot`, bet.mul(jackpotPay(machine, c.value.tier, meters)), c.value.tier);
        sfx.bigWin();
        if (!(await wait(BANNER_MS))) return false;
        this.banner = null;
      } else if (!(await wait(Math.max(COUNT_MIN_MS, COUNT_MS - i * 18)))) return false;
    }
    this.feature.counting = -1;
    if (f.full) {
      this.feature.full = true;
      this.feature.collected = this.feature.collected.add(bet.mul(meters.grand));
      this.showBanner('Grand jackpot', bet.mul(meters.grand), 'grand');
      sfx.bigWin();
      if (!(await wait(BANNER_MS * 1.8))) return false;
      this.banner = null;
    }
    return true;
  }

  private reportFor(spin: Spin): RoundReport {
    const net = spin.pay - 1;
    return {
      game: this.machine.id,
      seed: { run: this.runSeed, round: this.round },
      bets: [{ kind: 'main', stake: 1, net }],
      outcome: net > 0 ? 'win' : net === 0 ? 'push' : 'lose',
    };
  }

  /** The spin's lines for the breakdown, in bets. */
  private linesFor({ result, meters, mystery }: Spin): BreakdownLine[] {
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
        lines.push({ label: `${tier[0]!.toUpperCase()}${tier.slice(1)} jackpot`, amount: jackpotPay(this.machine, tier, meters) });
      }
    }
    if (mystery) lines.push({ label: 'Must-hit Major', amount: meters.major });
    return lines;
  }

  private settle(spin: Spin, bet: Decimal) {
    const { result } = spin;
    const net = spin.pay - 1;
    const lines = this.linesFor(spin);
    // Charms act on the settled spin; the bankroll is paid the spin and whatever they add.
    const charms = meta.settleRound(this.reportFor(spin), bet, net);
    const units = net + charms.extra;
    this.last = { lines: [...lines, ...charms.lines], net: units };
    // Whoever hits a progressive starts it over, for every machine on the floor.
    const hits = [...(result.feature?.jackpots ?? []), ...(spin.mystery ? ['major' as const] : [])];
    for (const tier of hits) {
      if (tier !== 'major' && tier !== 'grand') continue;
      const x = spin.meters[tier];
      jackpots.hit({ tier, x, paid: bet.mul(x).toString(), machine: this.machine.name, mystery: spin.mystery && tier === 'major' });
    }
    const money = bet.mul(units);
    this.lastBet = bet;
    this.spins++;
    if (result.feature) this.features++;
    this.wagered = this.wagered.add(bet);
    this.returned = this.returned.add(bet.mul(spin.pay));
    this.sessionNet = this.sessionNet.add(money);
    if (bet.mul(spin.pay).gt(this.biggestWin)) this.biggestWin = bet.mul(spin.pay);
    this.round++;
    if (spin.pay > 0) {
      const top = [...result.wins].sort((a, b) => b.pay - a.pay)[0];
      const name = top ? this.machine.symbols.find((s) => s.id === top.symbol)!.name : '';
      const entry: HistoryEntry = {
        round: this.round,
        text: spin.mystery ? 'Must-hit Major' : result.feature ? 'Hold & spin' : `${top!.reels} ${name}`,
        sub: result.feature ? `${result.feature.coins.length} coins` : `${result.wins.length} win${result.wins.length === 1 ? '' : 's'}`,
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
