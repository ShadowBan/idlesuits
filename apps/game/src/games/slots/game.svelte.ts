import { bonusName, bonusTitle, isSuper, jackpotsWon, jackpotState, potsOf, slotScale, TIER_NAME, type SlotRound } from '@idlesuits/engine';
import {
  cellsOf,
  coinPay,
  jackpotPay,
  Rng,
  triggerSymbol,
  upgradeMap,
  waysScaleFor,
  wedgePay,
  windowAt,
  type CoinValue,
  type Collect,
  type FreeSpinsResult,
  type HoldSpinResult,
  type JackpotMeters,
  type JackpotTier,
  type MachineDef,
  type PickResult,
  type PotDef,
  type PotPower,
  type SlotCharms,
  type SlotSpinResult,
  type WayWin,
  type WheelResult,
  type WheelWedge,
} from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { autoFeed } from '../../lib/autofeed.svelte';
import { bankroll } from '../../lib/casino.svelte';
import { floor } from '../../lib/floor.svelte';
import { jackpots, slotTest } from '../../lib/jackpot.svelte';
import { autoplay } from '../../lib/autoplay.svelte';
import { meta } from '../../lib/meta.svelte';
import { playOrAuto, SPEED } from '../../lib/autofeed.svelte';
import { player } from '../../lib/player.svelte';
import { Decimal, formatMoney } from '../../lib/money';
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
const CELL_MS = 220;
const LAST_CELL_MS = 300;
const TENSE_CELL_MS = 1100;
/** Empty cells left that count as a shot at the Grand. */
const NEAR_GRAND = 3;
/** The pause after a respin, so its result registers: longer when coins landed. */
const AFTER_LAND_MS = 1600;
const AFTER_MISS_MS = 1100;
/** The boost's pause after the cells stop, and how long the collector takes. */
const BOOST_MS = 450;
const COLLECTOR_MS = 1900;
const COUNT_MS = 320;
const COUNT_MIN_MS = 120;
const RESULT_HOLD_MS = 700;
/** Free spins: the reels turn, stop one by one, and each spin's result holds a moment. */
const FREE_SPIN_MS = 650;
const FREE_REEL_MS = 230;
const MARK_MS = 380;
const COLLECT_MS = 900;
const FREE_HOLD_MS = 700;
const LEVEL_MS = 2200;
/** A wheel's turn, from the push to the stop. */
export const WHEEL_SPIN_MS = 4600;
const WHEEL_HOLD_MS = 1300;
/** Between picks when the machine picks for you, and after each reveal. */
const AUTO_PICK_MS = 650;
const PICK_MS = 550;
/** How long the bonus win stays up, in real seconds whatever the speed, unless dismissed sooner. */
export const SUMMARY_MS = 7000;
/** The bonus symbols light up and the cabinet goes wild this long before the bonus starts. */
const TRIGGER_MS = 1700;
/** A charm at work: the pause before it acts, and how long its moment holds. */
const CHARM_PAUSE_MS = 450;
const CHARM_MS = 1500;

/** Wins big enough to stop the machine and celebrate, by how many bets they pay: a real machine's big-win ladder. */
export const WIN_LEVELS = [
  { at: 10, title: 'Big win', ms: 2600 },
  { at: 25, title: 'Huge win', ms: 3400 },
  { at: 50, title: 'Mega win', ms: 4200 },
  { at: 100, title: 'Epic win', ms: 5200 },
] as const;

/** Where a win of `x` bets sits on the big-win ladder: 0 below it, then 1 to 4. */
export function winLevel(x: number): number {
  let level = 0;
  WIN_LEVELS.forEach((l, i) => {
    if (x >= l.at) level = i + 1;
  });
  return level;
}

export { bonusName, bonusTitle, isSuper, TIER_NAME };

/** Spins auto play asks for at once. */
const AUTO_BATCH = 5;

/** What a pot's power does, in a few words, for the pot and the rules. */
export function powerText(power: PotPower, machine: MachineDef): string {
  const bonus = machine.bonus;
  switch (power.kind) {
    case 'boost':
      return 'Coins grow every respin';
    case 'extra':
      return `${power.respins} respins, not ${bonus.kind === 'holdSpin' ? bonus.respins : 3}`;
    case 'collect':
      return 'Cash pays twice';
    case 'level':
      return bonus.kind === 'collect' ? `Captains start at ${bonus.multipliers[power.levels]}×` : power.levels === 1 ? 'Starts a tier up' : `Starts ${power.levels} tiers up`;
    case 'marks':
      return `${bonus.kind === 'collect' ? 'Captains' : 'Hammers'} count ${power.times === 2 ? 'double' : `${power.times}×`}`;
    case 'wilds':
      return `Wilds are ${power.x}×`;
    case 'spins':
      return `+${power.add} free spins`;
    case 'cash':
      return power.times === 2 ? 'Doubloons pay double' : `Doubloons pay ${power.times}×`;
    case 'ups':
      return `${power.add} more Up wedges`;
    case 'ring': {
      const xs = power.values.map((v) => v.value);
      return `Cash ×${Math.min(...xs)} to ×${Math.max(...xs)}`;
    }
    case 'encore':
      return 'The wheel spins twice';
    case 'drop':
      return `No ${TIER_NAME[power.tier]} on the board`;
    case 'twin':
      return 'Two jackpots';
    case 'rise':
      return 'Jackpot climbs a tier';
  }
}

/** What carries the pots' gems, plural and lower case: gold coins, anvils, treasure maps. */
export function carrierName(machine: MachineDef): string {
  const id = triggerSymbol(machine);
  return `${(machine.symbols.find((s) => s.id === id)?.name ?? id).toLowerCase()}s`;
}

/** The power of a kind among the pots in play, if one of them has it. */
function litPower<K extends PotPower['kind']>(machine: MachineDef, lit: readonly number[], kind: K): Extract<PotPower, { kind: K }> | undefined {
  return lit.map((i) => machine.pots![i]!.power).find((p): p is Extract<PotPower, { kind: K }> => p.kind === kind);
}

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
  /** Coins that landed on the respin just played, held up so they register. */
  fresh: number[];
  /** What the respin just played did, said between respins. */
  note: string | null;
  /** Paid so far as the coins are counted, in dollars. */
  collected: Decimal;
  /** The cell being counted, or -1. */
  counting: number;
  full: boolean;
  /** What a coin puts the respins back to: more with the Extra pot. */
  respins: number;
  /** The pots' powers in play. */
  powers: PotPower['kind'][];
  /** Boost cash each coin has gathered so far, by cell, in bets. */
  boosted: Record<number, number>;
  /** Counts boosts, so the coins can flash as they grow. */
  boosts: number;
  /** The last boost, in bets, for the tag on every coin. */
  boost: number;
  /** The collector is taking every coin's cash again. */
  collecting: boolean;
  /** Every coin is counted: the meter shows the spin's whole win. */
  done: boolean;
}

/** Free spins as the screen shows them; the reels themselves are the main grid. */
export interface FreeView {
  kind: 'upgrade' | 'collect';
  /** The spin playing, from 1, and how many there are so far. */
  played: number;
  total: number;
  /** Hammers or captains so far. */
  meter: number;
  level: number;
  /** Cells that just filled the meter, lit. */
  marks: number[];
  /** Counts level-ups, so the meter can flash. */
  levelUps: number;
  /** Symbols just upgraded on the screen, lit. */
  forged: number[];
  /** Paid so far in the feature, in dollars. */
  collected: Decimal;
  note: string | null;
  /** Each wild multiplies the ways through it this many times: 1 unless a pot makes it more. */
  wildX: number;
  done: boolean;
}

/** The wheel bonus as the screen shows it. */
export interface WheelView {
  /** The wheels as played: a pot can turn outer wedges to Up. */
  wheels: WheelWedge[][];
  /** The play, from 1, and how many there are: two with an encore. */
  round: number;
  rounds: number;
  /** The ring's multiplier on the cash just landed, while it shows. */
  ring: number | null;
  /** The wheel in play, outermost 0. */
  at: number;
  /** Each wheel's turn, in degrees; it only ever grows, so the wheel always turns forward. */
  angles: number[];
  /** How long the current turn takes, in real milliseconds. */
  ms: number;
  spinning: boolean;
  /** The wedge the current wheel stopped on, lit. */
  landed: number | null;
  collected: Decimal;
  done: boolean;
}

/** The jackpot pick as the screen shows it. */
export interface PickView {
  /** The jackpots on the board: all four, unless a pot dropped one. */
  tiers: JackpotTier[];
  /** The board, from 1, and how many there are: two with the twin. */
  board: number;
  boards: number;
  /** What each tile shows, once picked or revealed at the end. */
  tiles: (JackpotTier | null)[];
  /** Tiles picked, in order: the rest are revealed dimmed at the end. */
  picked: number[];
  counts: Record<JackpotTier, number>;
  /** The jackpot that made three. */
  won: JackpotTier | null;
  /** The tile just picked, lit. */
  last: number;
  done: boolean;
}

/** What the bonus paid, up over the reels once it ends. */
export interface BonusSummary {
  key: number;
  title: string;
  /** The feature's pay, in dollars. */
  bonus: Decimal;
  /** Everything the spin paid, ways included. */
  total: Decimal;
  details: string[];
  jackpots: JackpotTier[];
  /** Gold trim: the Grand was won. */
  grand: boolean;
  /** Where the bonus's pay sits on the big-win ladder, for the celebration around it. */
  level: number;
}

/** A base-game win big enough to celebrate: it counts up over the reels. */
export interface BigWin {
  key: number;
  /** 1 to 4: big, huge, mega, epic. */
  level: number;
  title: string;
  amount: Decimal;
  /** How long it counts up, in real milliseconds. */
  ms: number;
}

/** A big moment across the reels: the feature starting, a jackpot, a big win. */
export interface SlotBanner {
  key: number;
  title: string;
  amount: Decimal | null;
  tier?: JackpotTier;
  sub?: string;
}

/** A spin as played: the result, the meters it paid from, and any must-hit Major. */
interface Spin {
  result: SlotSpinResult;
  meters: JackpotMeters;
  mystery: boolean;
  /** Everything paid, the must-hit Major included, in bets. */
  pay: number;
  /** Which charm did each thing a charm did, for the screen to name. */
  charms: Partial<Record<keyof SlotCharms, string>>;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
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
  /** A collector taking the coins: its cell and what it took, in dollars. */
  collecting = $state<{ cell: number; pay: Decimal } | null>(null);
  /** The win meter, in dollars. */
  win = $state<Decimal | null>(null);
  feature = $state<FeatureView | null>(null);
  free = $state<FreeView | null>(null);
  wheel = $state<WheelView | null>(null);
  pick = $state<PickView | null>(null);
  banner = $state<SlotBanner | null>(null);
  summary = $state<BonusSummary | null>(null);
  bigWin = $state<BigWin | null>(null);
  /** The cells that started the bonus, lit up while the cabinet celebrates. */
  triggered = $state<number[]>([]);
  /** A charm nudging a reel a step: which, and which way (-1 up, +1 down), so the reel can slide. */
  nudging = $state<{ reel: number; dir: -1 | 1; key: number } | null>(null);
  /** A charm turning a reel wild, or -1. */
  wilding = $state(-1);
  roundBet = $state(new Decimal(0));
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);
  lastBet = $state(new Decimal(0));
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);
  /** The bonus plays at normal speed whatever the deal speed. Saved per machine. */
  bonusFull = $state(true);
  /** The bonus waits for the player at each step, auto play or not. Saved per machine. */
  bonusControl = $state(true);

  spins = $state(0);
  features = $state(0);
  wagered = $state(new Decimal(0));
  returned = $state(new Decimal(0));
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  history = $state<HistoryEntry[]>([]);
  /** Each pot's gems as the machine holds them between spins, at any bet. Saved per machine. */
  private potState: number[];
  /** Each pot's gems as the screen shows them: they fill as the reels stop and empty into the bonus. */
  pots = $state<number[]>([]);
  /** The pot each gem on the screen belongs to, by cell. */
  gems = $state<Record<number, number>>({});
  /** Pots whose powers are in the bonus now. */
  potsInPlay = $state<number[]>([]);
  /** Counts the gems into each pot, so it can flash. */
  potHits = $state<number[]>([]);
  private banners = 0;
  /** The tile the player chose, while the pick waits for one. */
  private chosen = -1;

  constructor(readonly machine: MachineDef) {
    this.seq.remember(`slot.${machine.id}`);
    const step = load<number>(`slot.${machine.id}.bet`, 0);
    this.step = Number.isInteger(step) && step >= 0 && step < BET_STEPS.length ? step : 0;
    this.bonusFull = load<boolean>(`slot.${machine.id}.bonusFull`, true) !== false;
    this.bonusControl = load<boolean>(`slot.${machine.id}.bonusControl`, true) !== false;
    const defs = machine.pots ?? [];
    this.potState = potsOf(player.shown, machine);
    this.pots = [...this.potState];
    this.potHits = defs.map(() => 0);
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
    return slotScale(this.machine, tuning.values.slotPayback / 100);
  }

  get broke(): boolean {
    return this.bank.lt(room(0).min);
  }

  get canSpin(): boolean {
    return player.ready && this.seq.awaiting === 'spin' && this.bet.lte(this.bank);
  }

  /** Why the last spin couldn't be played, for a moment on screen. */
  error = $state<string | null>(null);

  /** Any bonus on the screen. */
  get inBonus(): boolean {
    return this.feature !== null || this.free !== null || this.wheel !== null || this.pick !== null;
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
    // Auto play still running here on the engine's clock (left on, or away): the table picks it back up.
    if (autoFeed.isOn(this.machine.id)) queueMicrotask(() => this.setAutoPlay(true));
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

  /** Spins, or takes the bonus's next step when it's waiting for one: a respin, the free spins, the wheel, or a pick for you. */
  spin() {
    const waiting = this.seq.awaiting;
    if (waiting === 'pick') return this.choose(-1);
    if (this.canSpin || waiting === 'respin' || waiting === 'free' || waiting === 'wheel') this.seq.answer(true);
  }

  /** The player picks a tile; -1 picks one for them. */
  choose(tile: number) {
    if (this.seq.awaiting !== 'pick' || !this.pick) return;
    if (tile >= 0 && this.pick.tiles[tile] !== null) return;
    this.chosen = tile;
    this.seq.answer(true);
  }

  setBonusFull(on: boolean) {
    this.bonusFull = on;
    save(`slot.${this.machine.id}.bonusFull`, on);
  }

  setBonusControl(on: boolean) {
    this.bonusControl = on;
    save(`slot.${this.machine.id}.bonusControl`, on);
    // Switched off while the bonus waits: it goes now.
    if (!on && this.seq.awaiting === 'pick') this.choose(-1);
    else if (!on && ['respin', 'free', 'wheel'].includes(this.seq.awaiting ?? '')) this.seq.answer(true);
  }

  /** Closes the bonus win or the big win early. */
  dismiss() {
    if (this.seq.awaiting === 'summary' || this.seq.awaiting === 'bigwin') this.seq.answer(true);
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

  private showBanner(title: string, amount: Decimal | null, tier?: JackpotTier, sub?: string) {
    this.banner = { key: ++this.banners, title, amount, tier, sub };
  }

  /**
   * Spins: once, or a batch for auto play, each decided whole by the engine
   * (on the server, for a member), bonus and all, and shown one by one. What a
   * spin pays, and the progressives it hits, stay off the screen until it's shown.
   */
  private async playRound(): Promise<boolean> {
    const s = autoplay.settings;
    const count = this.autoPlay ? Math.min(AUTO_BATCH, s.stopAfter ? Math.max(1, s.stopRounds - autoplay.rounds) : AUTO_BATCH) : 1;
    const stop = this.autoPlay
      ? { winX: s.stopOnWin ? s.stopWinX : undefined, below: s.stopBelow ? s.stopBelowAmount : undefined, above: s.stopAbove ? s.stopAboveAmount : undefined }
      : undefined;
    const test = { forceFeature: slotTest.forceFeature, fillPots: slotTest.fillPots, allCharms: slotTest.allCharms };
    slotTest.forceFeature = false;
    slotTest.fillPots = false;
    const before = { best: player.shown.floor.best, jackpots: jackpotState(player.shown) };
    let rounds: SlotRound[] = [];
    let holds: number[] = [];
    const out = await playOrAuto(this.autoPlay, this.machine.id, { type: 'slot.spin', machine: this.machine.id, step: this.step, room: floor.current, rounds: count, stop, test }, SPEED[this.seq.speed] ?? 1, (landed) => {
      rounds = landed.result && 'rounds' in landed.result ? (landed.result.rounds as SlotRound[]) : [];
      holds = player.holdBack(rounds, before.best);
      // The meters stay as the reels started until each spin is shown.
      player.view('jackpots', before.jackpots);
    });
    if (!out.ok || !rounds.length) {
      this.error = out.ok ? 'No spin came back.' : out.error;
      this.autoPlay = false;
      return true;
    }
    this.error = null;
    try {
      for (let i = 0; i < rounds.length; i++) {
        const r = rounds[i]!;
        const bet = new Decimal(r.bet);
        const spin: Spin = { result: r.result, meters: r.meters, mystery: r.mystery, pay: r.x, charms: r.names };
        player.start(holds[i]!, r);
        this.roundBet = bet;
        if (i > 0 && !this.autoPlay) {
          // Stopped partway: the spins already decided land at once.
          this.clear();
          this.grid = r.result.grid.map((col) => [...col]);
        } else {
          if (i > 0 && !(await this.seq.wait(RESULT_HOLD_MS))) return false;
          if (!(await this.show(spin, bet))) return false;
        }
        player.reveal(holds[i]!);
        player.view('jackpots', i === rounds.length - 1 ? null : { ...jackpotState(player.truth), major: r.after.meters.major, grand: r.after.meters.grand });
        this.settle(spin, bet, r);
      }
      return true;
    } finally {
      player.reveal(...holds);
      player.view('jackpots', null);
    }
  }

  /** Clears the screen of the last spin's bonus and wins. */
  private clear() {
    this.win = null;
    this.wins = [];
    this.coins = {};
    this.collecting = null;
    this.feature = null;
    this.free = null;
    this.wheel = null;
    this.pick = null;
    this.banner = null;
    this.summary = null;
    this.bigWin = null;
    this.triggered = [];
    this.gems = {};
    this.potsInPlay = [];
    this.nudging = null;
    this.wilding = -1;
  }

  /**
   * The reels spin and stop left to right. A reel that could still bring the
   * bonus turns slowly first. `wait` paces it: the table's speed on the base
   * game, the bonus's in free spins.
   */
  private async spinReels(
    grid: string[][],
    coins: { cell: number; value: CoinValue }[],
    wait: (ms: number) => Promise<boolean>,
    opts: {
      spinMs: number;
      reelMs: number;
      tension: boolean;
      gems?: { cell: number; pot: number }[];
      /** Charms at work on the base game: a reel stops where it was before a nudge, or before it turned wild. */
      nudge?: SlotSpinResult['nudge'];
      wildReel?: SlotSpinResult['wildReel'];
      names?: Spin['charms'];
    },
  ): Promise<boolean> {
    const { machine } = this;
    const { nudge, wildReel } = opts;
    this.spinning = machine.reels.map(() => true);
    sfx.spin();
    if (!(await wait(opts.spinMs))) return false;
    const trigger = triggerSymbol(machine);
    const need = machine.bonus.trigger;
    // Hold & spin needs six coins, so it gets tense from three; a scatter needs one more.
    const from = machine.bonus.kind === 'holdSpin' ? need - 3 : need - 1;
    let landed = 0;
    for (let r = 0; r < machine.reels.length; r++) {
      const rest = machine.reels.slice(r).filter((strip) => strip.includes(trigger)).length;
      const tense = opts.tension && landed >= from && landed < need && machine.reels[r]!.includes(trigger) && landed + rest * machine.rows >= need;
      this.anticipating = tense ? r : -1;
      if (tense && this.seq.speed === 'smart') sfx.tension();
      if (!(await wait(tense ? ANTICIPATE_MS : opts.reelMs))) return false;
      // A reel a charm is about to nudge or turn wild stops where it was first.
      const shown = nudge?.reel === r ? nudge.before : wildReel?.reel === r ? wildReel.before : grid[r]!;
      this.grid[r] = shown;
      this.spinning[r] = false;
      const here = nudge?.reel === r ? [] : this.landReel(r, coins, opts.gems);
      const hits = shown.filter((s) => s === trigger).length;
      landed += hits;
      if (here.length || (hits && trigger !== 'coin')) sfx.coin(landed);
      else sfx.reel();
    }
    this.anticipating = -1;

    // The Lever Knob: one short, and a reel slides a step to bring the bonus in.
    if (nudge) {
      if (!(await wait(CHARM_PAUSE_MS))) return false;
      this.nudging = { reel: nudge.reel, dir: nudge.dir, key: this.round };
      this.grid[nudge.reel] = wildReel?.reel === nudge.reel ? wildReel.before : grid[nudge.reel]!;
      this.landReel(nudge.reel, coins, opts.gems);
      sfx.reset();
      this.showBanner('Nudge!', null, undefined, opts.names?.nudge);
      if (!(await wait(CHARM_MS))) return false;
      this.banner = null;
      this.nudging = null;
    }
    // The Joker's Cap: a reel turns wild.
    if (wildReel) {
      if (!(await wait(CHARM_PAUSE_MS))) return false;
      this.wilding = wildReel.reel;
      this.grid[wildReel.reel] = grid[wildReel.reel]!;
      sfx.bigWin();
      this.showBanner('Wild reel!', null, undefined, opts.names?.wild);
      if (!(await wait(CHARM_MS))) return false;
      this.banner = null;
    }
    return true;
  }

  /** A reel has stopped: its coins show, and the gems on them drop into their pots. Returns its coins. */
  private landReel(r: number, coins: { cell: number; value: CoinValue }[], gems: { cell: number; pot: number }[] = []): { cell: number; value: CoinValue }[] {
    const { machine } = this;
    const here = coins.filter((c) => Math.floor(c.cell / machine.rows) === r);
    for (const c of here) this.coins[c.cell] = c.value;
    for (const g of gems) {
      if (Math.floor(g.cell / machine.rows) !== r) continue;
      this.gems[g.cell] = g.pot;
      this.pots[g.pot] = Math.min(machine.pots![g.pot]!.size, this.pots[g.pot]! + 1);
      this.potHits[g.pot]!++;
    }
    return here;
  }

  /** Each collector on the screen takes every coin in turn, adding to `onto`. */
  private async collect(collects: Collect[], bet: Decimal, wait: (ms: number) => Promise<boolean>, onto: (pay: Decimal) => void): Promise<boolean> {
    for (const [i, c] of collects.entries()) {
      const pay = bet.mul(c.pay);
      this.collecting = { cell: c.cell, pay };
      onto(pay);
      sfx.coin(6 + i * 2);
      if (!(await wait(COLLECT_MS))) return false;
    }
    this.collecting = null;
    return true;
  }

  /** The reels spin and stop left to right; the ways light up; collectors collect; then any feature plays out. */
  private async show(spin: Spin, bet: Decimal): Promise<boolean> {
    const { result } = spin;
    this.clear();
    const reels = { spinMs: SPIN_MS, reelMs: REEL_MS, tension: true, gems: result.gems, nudge: result.nudge, wildReel: result.wildReel, names: spin.charms };
    if (!(await this.spinReels(result.grid, result.coins, (ms) => this.wait(ms), reels))) return false;
    // A pot a charm tops up shows what the gems gave it until the bonus starts.
    this.pots = result.filled.map((n, i) => (result.topped.includes(i) ? this.pots[i]! : n));

    if (result.wins.length) {
      this.wins = result.wins;
      this.win = bet.mul(result.waysPay);
      if (result.waysPay >= 5) sfx.bigWin();
      else sfx.win();
      if (!(await this.wait(WIN_MS))) return false;
    }
    if (result.collects.length) {
      this.wins = [];
      if (!(await this.collect(result.collects, bet, (ms) => this.wait(ms), (pay) => (this.win = (this.win ?? new Decimal(0)).add(pay))))) return false;
    }

    const f = result.feature;
    // A big base-game win stops the machine to celebrate; with a bonus to come, the bonus's own win does instead.
    const base = result.waysPay + result.collectPay;
    if (!f && winLevel(base) > 0) {
      if (!(await this.celebrate(bet, base))) return false;
    }
    if (f) {
      this.wins = [];
      this.collecting = null;
      // The symbols that started it light up, and the whole cabinet with them.
      this.triggered = cellsOf(this.machine, result.grid, triggerSymbol(this.machine));
      sfx.bigWin();
      if (!(await this.bonusWait(TRIGGER_MS))) return false;
      this.triggered = [];
      // The Piggy Bank: pots that weren't full fill anyway.
      if (result.topped.length) {
        const pots = this.machine.pots ?? [];
        for (const i of result.topped) {
          this.pots[i] = pots[i]!.size;
          this.potHits[i]!++;
        }
        sfx.reset();
        this.showBanner(`${result.topped.map((i) => pots[i]!.name).join(' + ')} ${result.topped.length > 1 ? 'fill' : 'fills'}!`, null, undefined, spin.charms.fill);
        if (!(await this.bonusWait(CHARM_MS))) return false;
        this.banner = null;
      }
      // Full pots empty into the bonus, their powers with them.
      this.potsInPlay = result.lit;
      if (!(await this.playFeature(f, bet, spin.meters, result.lit))) return false;
      this.win = bet.mul(result.pay - (result.encore?.pay ?? 0));
      if (!(await this.showSummary(this.summaryOf(f, bet, result)))) return false;
      // The Boomerang: the whole bonus comes back for another go.
      if (result.encore) {
        this.feature = this.free = this.wheel = this.pick = null;
        this.showBanner('It comes back!', null, undefined, `${spin.charms.encore ?? 'A charm'}: the bonus plays again`);
        sfx.bigWin();
        if (!(await this.bonusWait(BANNER_MS * 1.4))) return false;
        this.banner = null;
        this.potsInPlay = result.lit;
        if (!(await this.playFeature(result.encore, bet, spin.meters, result.lit))) return false;
        this.win = bet.mul(result.pay);
        const again = this.summaryOf(result.encore, bet, result);
        if (!(await this.showSummary({ ...again, title: `${again.title}, again` }))) return false;
      }
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

  /** Plays whichever bonus the spin started, with the pots' powers in it. */
  private playFeature(f: SlotSpinResult['feature'] & {}, bet: Decimal, meters: JackpotMeters, lit: number[]): Promise<boolean> {
    switch (f.kind) {
      case 'holdSpin':
        return this.playHoldSpin(f, bet, meters, lit);
      case 'freeSpins':
        return this.playFreeSpins(f, bet, meters, lit);
      case 'wheel':
        return this.playWheel(f, bet, meters, lit);
      case 'pick':
        return this.playPick(f, bet, meters, lit);
    }
  }

  /** The bonus win stays up for a few seconds, in real time, or until the player closes it. */
  private async showSummary(summary: BonusSummary): Promise<boolean> {
    this.summary = summary;
    const timer = setTimeout(() => this.dismiss(), SUMMARY_MS);
    const closed = await this.seq.ask('summary');
    clearTimeout(timer);
    this.summary = null;
    return closed !== null;
  }

  /**
   * The big-win ladder: the win counts up over the reels, longer the bigger it
   * is, until it's done or the player taps to collect.
   */
  private async celebrate(bet: Decimal, x: number): Promise<boolean> {
    const level = winLevel(x);
    const step = WIN_LEVELS[level - 1]!;
    const fast = this.seq.speed === '5x' ? 3 : this.seq.speed === '2x' ? 1.6 : 1;
    const ms = step.ms / fast;
    this.bigWin = { key: ++this.banners, level, title: step.title, amount: bet.mul(x), ms };
    sfx.bigWin();
    const timer = setTimeout(() => this.dismiss(), ms + 900);
    const closed = await this.seq.ask('bigwin');
    clearTimeout(timer);
    this.bigWin = null;
    return closed !== null;
  }

  private summaryOf(f: SlotSpinResult['feature'] & {}, bet: Decimal, result: SlotSpinResult): BonusSummary {
    const details: string[] = [];
    let title = bonusTitle(this.machine, result.lit);
    const lit = result.lit;
    switch (f.kind) {
      case 'holdSpin': {
        details.push(plural(f.coins.length, 'coin'));
        const boost = Object.values(f.boosted).reduce((a, b) => a + b, 0);
        if (boost) details.push(`boost ${formatMoney(bet.mul(boost))}`);
        const extra = this.machine.pots?.find((p) => p.power.kind === 'extra')?.power;
        if (f.powers.includes('extra') && extra?.kind === 'extra') details.push(`${extra.respins} respins`);
        if (f.collected) details.push(`collector ${formatMoney(bet.mul(f.collected))}`);
        break;
      }
      case 'freeSpins': {
        details.push(plural(f.spins.length, 'free spin'));
        const b = this.machine.bonus;
        if (b.kind === 'upgrade' && f.level > 0) details.push(`forged to ${TIER_LABEL[upgradeMap(b, f.level).bronze!] ?? 'level ' + f.level}`);
        if (b.kind === 'collect' && f.level > 0) details.push(`up to ${b.multipliers[f.level]}× cash`);
        const wilds = litPower(this.machine, lit, 'wilds');
        if (wilds) details.push(`${wilds.x}× wilds`);
        const cash = litPower(this.machine, lit, 'cash');
        if (cash) details.push(`doubloons ${cash.times}×`);
        break;
      }
      case 'wheel': {
        // Where each play stopped and what it paid; the jackpots are named there, so not again after.
        for (const r of f.rounds) {
          const last = r.stops.at(-1)!;
          const wedge = f.wheels[last.wheel]![last.wedge]!;
          const where = WHEEL_NAMES[last.wheel]!.replace(/^./, (c) => c.toUpperCase());
          const what = wedge.kind === 'jackpot' ? TIER_NAME[wedge.tier] : wedge.kind === 'cash' ? formatMoney(bet.mul(wedge.x)) : '';
          details.push(`${where}: ${what}${r.ring > 1 ? ` ×${r.ring}` : ''}`);
        }
        return { key: ++this.banners, title, bonus: bet.mul(f.pay), total: bet.mul(result.pay), details, jackpots: [], grand: f.jackpots.includes('grand'), level: winLevel(f.pay) };
      }
      case 'pick': {
        const won = f.boards.map((b) => TIER_NAME[b.won]);
        title = won.length > 1 ? `${won.join(' + ')} jackpots` : `${won[0]} jackpot`;
        if (isSuper(this.machine, lit)) details.push('Super pick');
        details.push(plural(f.boards.reduce((n, b) => n + b.picks.length, 0), 'pick'));
        for (const b of f.boards) if (b.won !== b.tier) details.push(`${TIER_NAME[b.tier]} rose to ${TIER_NAME[b.won]}`);
        // The jackpots are the title: no need to list them again.
        return { key: ++this.banners, title, bonus: bet.mul(f.pay), total: bet.mul(result.pay), details, jackpots: [], grand: f.jackpots.includes('grand'), level: winLevel(f.pay) };
      }
    }
    return {
      key: ++this.banners,
      title,
      bonus: bet.mul(f.pay),
      total: bet.mul(result.pay),
      details,
      jackpots: f.jackpots,
      grand: f.jackpots.includes('grand'),
      level: winLevel(f.pay),
    };
  }

  /**
   * The bonus starts: the full pots tip into it and empty, and a banner names
   * them, or says what the bonus is about when none are in it.
   */
  private async openPots(lit: readonly number[], title: string, wait: (ms: number) => Promise<boolean>, plain?: string): Promise<boolean> {
    const pots: readonly PotDef[] = this.machine.pots ?? [];
    for (const i of lit) this.pots[i] = 0;
    // The gems are in their pots now: off the reels, which the bonus may play on.
    this.gems = {};
    const names = lit.map((i) => pots[i]!.name);
    const sub = names.length ? `${names.join(' + ')}${isSuper(this.machine, lit) ? ': every pot' : ''}` : plain;
    this.showBanner(title, null, undefined, sub);
    sfx.bigWin();
    if (!(await wait(names.length ? BONUS_INTRO_MS * 1.3 : BONUS_INTRO_MS))) return false;
    this.banner = null;
    return true;
  }

  /** A wait in the bonus: at full length when the bonus plays at normal speed, else at the table's speed. */
  private bonusWait(ms: number): Promise<boolean> {
    return this.bonusFull ? this.seq.waitFull(ms) : this.wait(ms);
  }

  /** The bonus pauses for the player when they play it themselves. */
  private async askBonus(kind: string): Promise<boolean> {
    if (!this.bonusControl) return true;
    return (await this.seq.ask(kind)) !== null;
  }

  /**
   * Hold & spin, paced like a real machine's: the empty cells spin a while,
   * then stop one by one; the last respin stops slowly; and with only a few
   * cells left before a full screen, each of them takes its time.
   */
  private async playHoldSpin(f: HoldSpinResult, bet: Decimal, meters: JackpotMeters, lit: number[]): Promise<boolean> {
    const { machine } = this;
    if (machine.bonus.kind !== 'holdSpin') return false;
    const cells = machine.reels.length * machine.rows;
    const extra = machine.pots?.find((p) => p.power.kind === 'extra')?.power;
    const respins = f.powers.includes('extra') && extra?.kind === 'extra' ? extra.respins : machine.bonus.respins;
    const drama = this.bonusFull || this.seq.speed === 'smart';
    const wait = (ms: number) => this.bonusWait(ms);
    this.feature = {
      held: Object.fromEntries(f.start.map((c) => [c.cell, c.value])),
      spinning: [],
      tense: [],
      left: respins,
      resets: 0,
      last: false,
      fresh: [],
      note: null,
      collected: new Decimal(0),
      counting: -1,
      full: false,
      done: false,
      respins,
      powers: f.powers,
      boosted: {},
      boosts: 0,
      boost: 0,
      collecting: false,
    };
    if (!(await this.openPots(lit, bonusTitle(machine, lit), wait))) return false;
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
      // Played by hand, each respin waits for the player; the last one's result stays up meanwhile.
      if (!(await this.askBonus('respin'))) return false;
      view.fresh = [];
      view.note = null;
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
          view.fresh = [...view.fresh, cell];
          // A coin puts the respins back to full, and the counter flashes to say so.
          if (view.left !== respins) view.resets++;
          view.left = respins;
          view.last = false;
          sfx.coin(streak++);
        } else if (drama) sfx.tick();
      }
      view.left = respin.left;
      view.last = false;
      // The boost: every coin on the screen grows by the same cash.
      if (respin.boost) {
        if (!(await wait(BOOST_MS))) return false;
        for (const cell of Object.keys(view.held)) view.boosted[+cell] = (view.boosted[+cell] ?? 0) + respin.boost;
        view.boost = respin.boost;
        view.boosts++;
        sfx.coin(8);
      }
      // Hold the result up long enough to take in: what landed, and where that leaves the respins.
      const n = respin.landed.length;
      if (n) {
        sfx.reset();
        view.note = Object.keys(view.held).length === cells ? 'Full screen!' : `+${n} ${n === 1 ? 'coin' : 'coins'} · back to ${respins} respins`;
      } else view.note = respin.left ? `No coins · ${respin.left} ${respin.left === 1 ? 'respin' : 'respins'} left` : 'No coins · that’s the last respin';
      if (respin.boost) view.note += ` · boost +${formatMoney(bet.mul(respin.boost))} a coin`;
      // Played by hand, the result stays up until the next respin; played for you, it holds a moment.
      if (!this.bonusControl || respin === f.respins.at(-1)) {
        if (!(await wait(n ? AFTER_LAND_MS : AFTER_MISS_MS))) return false;
        view.fresh = [];
        view.note = null;
      }
    }

    // Count the coins in, one by one and faster as they go, then any Grand for the full screen.
    if (!(await wait(BONUS_BREATH_MS))) return false;
    for (const [i, c] of f.coins.entries()) {
      this.feature.counting = c.cell;
      this.feature.collected = this.feature.collected.add(bet.mul(coinPay(machine, c.value, meters) + (f.boosted[c.cell] ?? 0)));
      sfx.coin(i);
      if (c.value.kind === 'jackpot' && c.value.tier !== 'mini') {
        this.showBanner(`${c.value.tier} jackpot`, bet.mul(jackpotPay(machine, c.value.tier, meters)), c.value.tier);
        sfx.bigWin();
        if (!(await wait(BANNER_MS))) return false;
        this.banner = null;
      } else if (!(await wait(Math.max(COUNT_MIN_MS, COUNT_MS - i * 18)))) return false;
    }
    this.feature.counting = -1;
    // The collector takes every coin's cash again, boost and all.
    if (f.collected) {
      this.feature.collecting = true;
      this.feature.collected = this.feature.collected.add(bet.mul(f.collected));
      this.showBanner('Collector', bet.mul(f.collected), undefined, 'Every coin’s cash, again');
      sfx.bigWin();
      if (!(await wait(COLLECTOR_MS))) return false;
      this.banner = null;
      this.feature.collecting = false;
    }
    if (f.full) {
      this.feature.full = true;
      this.feature.collected = this.feature.collected.add(bet.mul(meters.grand));
      this.showBanner('Grand jackpot', bet.mul(meters.grand), 'grand');
      sfx.bigWin();
      if (!(await wait(BANNER_MS * 1.8))) return false;
      this.banner = null;
    }
    this.feature.done = true;
    return true;
  }

  /**
   * Free spins on the bonus reels. Each spin stops reel by reel; hammers or
   * captains light up and fill the meter one by one; ways pay; captains take
   * the coins; and a full meter levels up with a banner and extra spins. On
   * the forge, the metal on the screen is struck up a tier right away, to show
   * what the next spins will hold.
   */
  private async playFreeSpins(f: FreeSpinsResult, bet: Decimal, meters: JackpotMeters, lit: number[]): Promise<boolean> {
    const { machine } = this;
    const bonus = machine.bonus;
    if (bonus.kind !== 'upgrade' && bonus.kind !== 'collect') return false;
    const wait = (ms: number) => this.bonusWait(ms);
    const times = litPower(machine, lit, 'marks')?.times ?? 1;
    const view: FreeView = {
      kind: bonus.kind,
      played: 0,
      total: f.start.spins,
      meter: f.start.meter,
      level: f.start.level,
      marks: [],
      levelUps: 0,
      forged: [],
      collected: new Decimal(0),
      note: null,
      wildX: litPower(machine, lit, 'wilds')?.x ?? 1,
      done: false,
    };
    this.free = view;
    const free = this.free;
    const title = isSuper(machine, lit) ? `Super free spins · ${f.start.spins}` : `${f.start.spins} free spins`;
    const plain = bonus.kind === 'upgrade' ? `Every ${bonus.perLevel} hammers forge the metal up a tier` : 'Every captain takes every doubloon';
    if (!(await this.openPots(lit, title, wait, plain))) return false;
    if (!(await this.askBonus('free'))) return false;

    for (const s of f.spins) {
      free.played++;
      free.marks = [];
      free.forged = [];
      free.note = null;
      this.wins = [];
      this.coins = {};
      if (!(await this.spinReels(s.grid, s.coins, wait, { spinMs: FREE_SPIN_MS, reelMs: FREE_REEL_MS, tension: false }))) return false;

      // The hammers or captains light up, one by one, and fill the meter.
      for (const cell of s.marks) {
        free.marks = [...free.marks, cell];
        free.meter = Math.min(free.meter + times, bonus.perLevel * bonus.maxLevel);
        if (bonus.kind === 'upgrade') sfx.chip();
        else sfx.reset();
        if (!(await wait(MARK_MS))) return false;
      }
      if (s.wins.length) {
        this.wins = s.wins;
        free.collected = free.collected.add(bet.mul(s.waysPay));
        if (s.waysPay >= 5) sfx.bigWin();
        else sfx.win();
        if (!(await wait(WIN_MS))) return false;
      }
      if (s.collects.length) {
        this.wins = [];
        if (!(await this.collect(s.collects, bet, wait, (pay) => (free.collected = free.collected.add(pay))))) return false;
        for (const t of s.collects.flatMap((c) => c.jackpots)) {
          if (t === 'mini') continue;
          this.showBanner(`${TIER_NAME[t]} jackpot`, bet.mul(jackpotPay(machine, t, meters)), t);
          sfx.bigWin();
          if (!(await wait(BANNER_MS))) return false;
          this.banner = null;
        }
      }
      if (s.grand) {
        free.collected = free.collected.add(bet.mul(meters.grand));
        this.showBanner('Grand jackpot', bet.mul(meters.grand), 'grand', 'A screen full of crowns');
        sfx.bigWin();
        if (!(await wait(BANNER_MS * 1.8))) return false;
        this.banner = null;
      }
      if (s.levelUps) {
        free.level += s.levelUps;
        free.levelUps++;
        free.total += s.added;
        if (bonus.kind === 'upgrade') {
          // Strike the metal on the screen up a tier, as the next spins will show it.
          const map = upgradeMap(bonus, s.levelUps);
          const forged: number[] = [];
          this.grid = this.grid.map((reel, r) =>
            reel.map((id, row) => {
              const up = map[id];
              if (up && up !== id) forged.push(r * machine.rows + row);
              return up ?? id;
            }),
          );
          free.forged = forged;
          this.wins = [];
          this.showBanner('The forge strikes!', null, undefined, `${TIER_LABEL[upgradeMap(bonus, free.level).bronze!]} and up · +${s.added} spins`);
        } else {
          this.showBanner(`${bonus.multipliers[free.level]}× cash`, null, undefined, `Captains pay ${bonus.multipliers[free.level]}× · +${s.added} spins`);
        }
        sfx.bigWin();
        if (!(await wait(LEVEL_MS))) return false;
        this.banner = null;
      }
      free.note = s.pay > 0 ? `Spin ${free.played} paid ${formatMoney(bet.mul(s.pay))}` : null;
      if (!(await wait(s.pay > 0 ? FREE_HOLD_MS * 1.4 : FREE_HOLD_MS))) return false;
    }
    free.marks = [];
    free.forged = [];
    free.note = null;
    free.done = true;
    return true;
  }

  /**
   * The wheel: it turns several times round and eases to a stop on its wedge.
   * "Up" lights the next wheel in, which turns in its turn.
   */
  private async playWheel(f: WheelResult, bet: Decimal, meters: JackpotMeters, lit: number[]): Promise<boolean> {
    const { machine } = this;
    const bonus = machine.bonus;
    if (bonus.kind !== 'wheel') return false;
    const wait = (ms: number) => this.bonusWait(ms);
    this.wheel = {
      wheels: f.wheels,
      round: 1,
      rounds: f.rounds.length,
      ring: null,
      at: 0,
      angles: f.wheels.map(() => 0),
      ms: WHEEL_SPIN_MS,
      spinning: false,
      landed: null,
      collected: new Decimal(0),
      done: false,
    };
    const view = this.wheel;
    if (!(await this.openPots(lit, bonusTitle(machine, lit), wait, 'Up climbs to the next wheel in'))) return false;

    for (const [r, round] of f.rounds.entries()) {
      if (r > 0) {
        // The encore: back to the outer wheel for another go.
        view.round = r + 1;
        view.at = 0;
        view.landed = null;
        view.ring = null;
        this.showBanner('Encore!', null, undefined, 'The wheel spins again');
        sfx.reset();
        if (!(await wait(WHEEL_HOLD_MS))) return false;
        this.banner = null;
      }
      if (!(await this.playWheelRound(round, bet, meters))) return false;
    }
    view.done = true;
    return true;
  }

  /** One play of the wheel, from the outer wheel in until it lands on cash or a jackpot. */
  private async playWheelRound(round: WheelResult['rounds'][number], bet: Decimal, meters: JackpotMeters): Promise<boolean> {
    const { machine } = this;
    const view = this.wheel!;
    const wait = (ms: number) => this.bonusWait(ms);
    for (const stop of round.stops) {
      const wedges = view.wheels[stop.wheel]!;
      view.at = stop.wheel;
      view.landed = null;
      if (!(await this.askBonus('wheel'))) return false;
      // A few turns, then the wedge's middle under the pointer at the top.
      const size = 360 / wedges.length;
      const now = view.angles[stop.wheel]!;
      const target = 360 - (stop.wedge + 0.5) * size;
      const turns = 4 + stop.wheel;
      const next = now - (now % 360) + 360 * turns + target;
      view.ms = this.bonusFull || this.seq.speed === 'smart' || this.seq.speed === '1x' ? WHEEL_SPIN_MS : WHEEL_SPIN_MS / (this.seq.speed === '2x' ? 2 : 5);
      view.angles[stop.wheel] = next;
      view.spinning = true;
      sfx.spin();
      // Ticks as wedges pass, slowing with the wheel.
      const ticks = [0.08, 0.16, 0.25, 0.34, 0.44, 0.55, 0.66, 0.76, 0.85, 0.92, 0.97];
      let at = 0;
      for (const t of ticks) {
        if (!(await this.seq.waitFull(view.ms * t - at))) return false;
        at = view.ms * t;
        sfx.tick();
      }
      if (!(await this.seq.waitFull(view.ms - at))) return false;
      view.spinning = false;
      view.landed = stop.wedge;
      const wedge = wedges[stop.wedge]!;
      if (wedge.kind === 'up') {
        sfx.reset();
        this.showBanner('Up!', null, undefined, `On to the ${WHEEL_NAMES[stop.wheel + 1]}`);
        if (!(await wait(WHEEL_HOLD_MS))) return false;
        this.banner = null;
        continue;
      }
      const pay = bet.mul(wedgePay(machine, wedge, meters));
      if (wedge.kind === 'jackpot') this.showBanner(`${TIER_NAME[wedge.tier]} jackpot`, pay, wedge.tier);
      else this.showBanner(stop.wheel ? 'Big win' : 'Win', pay);
      sfx.bigWin();
      if (!(await wait(BANNER_MS * 1.4))) return false;
      this.banner = null;
      // The ringmaster's ring multiplies the cash it landed on.
      if (wedge.kind === 'cash' && round.ring > 1) {
        view.ring = round.ring;
        this.showBanner(`Ring ×${round.ring}`, bet.mul(round.pay), undefined, `${formatMoney(pay)} × ${round.ring}`);
        sfx.bigWin();
        if (!(await wait(BANNER_MS * 1.4))) return false;
        this.banner = null;
      }
      view.collected = view.collected.add(bet.mul(round.pay));
    }
    return true;
  }

  /**
   * The pick: a board of lanterns, three for each jackpot. The player picks
   * (or the machine picks for them) until one jackpot shows three times; then
   * the rest of the board is shown.
   */
  private async playPick(f: PickResult, bet: Decimal, meters: JackpotMeters, lit: number[]): Promise<boolean> {
    const { machine } = this;
    const bonus = machine.bonus;
    if (bonus.kind !== 'pick') return false;
    const wait = (ms: number) => this.bonusWait(ms);
    const size = bonus.per * f.tiers.length;
    const fresh = () => ({ tiles: Array<JackpotTier | null>(size).fill(null), picked: [], counts: { mini: 0, minor: 0, major: 0, grand: 0 }, won: null, last: -1 });
    this.pick = { tiers: f.tiers, board: 1, boards: f.boards.length, ...fresh(), done: false };
    const view = this.pick;
    if (!(await this.openPots(lit, bonusTitle(machine, lit), wait, 'Match three to win that jackpot'))) return false;
    // Where the machine picks for you, and how the rest of the board falls: random, as it changes nothing.
    const rng = new Rng(this.runSeed, 'pick-board', this.round);
    for (const [b, board] of f.boards.entries()) {
      if (b > 0) {
        // The twin: a fresh board for a second jackpot.
        if (!(await wait(BONUS_BREATH_MS * 2))) return false;
        Object.assign(view, fresh(), { board: b + 1 });
        this.showBanner('Second board', null, undefined, 'Match three again for another jackpot');
        sfx.reset();
        if (!(await wait(BANNER_MS))) return false;
        this.banner = null;
      }
      if (!(await this.playPickBoard(board, bet, meters, rng))) return false;
    }
    view.done = true;
    if (!(await wait(BONUS_BREATH_MS * 2))) return false;
    return true;
  }

  /** One board of the pick: picks until a jackpot shows three times, then the rest of the board. */
  private async playPickBoard(board: PickResult['boards'][number], bet: Decimal, meters: JackpotMeters, rng: Rng): Promise<boolean> {
    const { machine } = this;
    const bonus = machine.bonus;
    if (bonus.kind !== 'pick') return false;
    const view = this.pick!;
    const wait = (ms: number) => this.bonusWait(ms);
    const free = () => view.tiles.flatMap((t, i) => (t === null ? [i] : []));

    for (const tier of board.picks) {
      let tile: number;
      if (this.bonusControl) {
        this.chosen = -1;
        if ((await this.seq.ask('pick')) === null) return false;
        tile = this.chosen;
      } else {
        if (!(await wait(AUTO_PICK_MS))) return false;
        tile = -1;
      }
      if (tile < 0 || view.tiles[tile] !== null) {
        const open = free();
        tile = open[rng.int(open.length)]!;
      }
      view.tiles[tile] = tier;
      view.picked = [...view.picked, tile];
      view.last = tile;
      view.counts[tier]++;
      sfx.coin(view.counts[tier] * 3);
      if (!(await wait(PICK_MS))) return false;
    }
    view.won = board.tier;
    this.showBanner(`${TIER_NAME[board.tier]} jackpot`, bet.mul(jackpotPay(machine, board.tier, meters)), board.tier);
    sfx.bigWin();
    if (!(await wait(BANNER_MS * (board.tier === 'grand' ? 1.8 : 1.3)))) return false;
    this.banner = null;
    // The rise: the jackpot matched climbs a tier.
    if (board.won !== board.tier) {
      view.won = board.won;
      this.showBanner(`${TIER_NAME[board.won]} jackpot`, bet.mul(jackpotPay(machine, board.won, meters)), board.won, `${TIER_NAME[board.tier]} rises to ${TIER_NAME[board.won]}`);
      sfx.bigWin();
      if (!(await wait(BANNER_MS * 1.6))) return false;
      this.banner = null;
    }
    // The rest of the board: what was left of each jackpot.
    const rest = view.tiers.flatMap((t) => Array<JackpotTier>(bonus.per - view.counts[t]).fill(t));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [rest[i], rest[j]] = [rest[j]!, rest[i]!];
    }
    free().forEach((tile, i) => (view.tiles[tile] = rest[i]!));
    return true;
  }



  /** A spin the engine settled: its place in the session, and the pots as it left them. */
  private settle(spin: Spin, bet: Decimal, r: SlotRound) {
    const { result } = spin;
    const units = r.net;
    this.last = { lines: r.lines, net: units };
    meta.showFlash(r.triggers, r.tokens, bet);
    autoplay.round(r.net, this.bank);
    // The pots keep what they hold for the next spin, whatever its bet.
    if (this.machine.pots) {
      this.potState = [...r.pots];
      this.pots = [...r.pots];
      this.potsInPlay = [];
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
    if (spin.pay > 0) this.history = [{ round: this.round, text: r.text, sub: r.sub, net: money }, ...this.history].slice(0, 12);
    if (this.broke) {
      // Losing it all is the penalty for running unattended: auto play stops until it's pressed again.
      this.gameOver = true;
      this.autoPlay = false;
    } else this.fit();
  }
}

export { jackpotsWon };

/** The wheels by name, outermost first. */
export const WHEEL_NAMES = ['outer wheel', 'middle wheel', 'crown wheel'];

/** The forge's tiers, as the screen names them. */
export const TIER_LABEL: Record<string, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', crown: 'Crown' };
