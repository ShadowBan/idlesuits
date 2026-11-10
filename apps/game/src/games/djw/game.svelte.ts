import {
  BLIND,
  decideDj,
  DJ_BONUSES,
  DJ_CATEGORY_NAMES,
  DJ_RULES,
  djCategoryOf,
  simulateDjRound,
  stepWithChoices,
  type BonusResult,
  type Card,
  type DjDecision,
  type DjEvent,
  type DjMove,
  type DjRoundResult,
  type RoundReport,
} from '@idlesuits/sim';
import type { TableSettled } from '@idlesuits/engine';
import { BlindHands } from '../../lib/blind.svelte';
import { player } from '../../lib/player.svelte';
import { landSettled, playTable, sidesInDollars } from '../../lib/table.svelte';
import type { BreakdownLine } from '../../lib/breakdown';
import { bankroll } from '../../lib/casino.svelte';
import { Decimal } from '../../lib/money';
import { meta } from '../../lib/meta.svelte';
import { mainBet, outcomeOf, sideBets } from '../../lib/report';
import { Sequencer } from '../../lib/sequencer.svelte';
import { bonusLine, SideStakes } from '../../lib/sidebets.svelte';
import { ChipBets } from '../../lib/stakes.svelte';
import { sfx } from '../../lib/sound';
import { tuning } from '../../lib/tuning.svelte';

const STARTING_ANTE = 5;

/** Milliseconds at 1× before each event is shown. */
const BASE_MS: Record<DjEvent['type'], number> = {
  RoundStarted: 150,
  PlayerCards: 380,
  DealerCards: 220,
  Decision: 120,
  Played: 260,
  Folded: 300,
  DealerRevealed: 700,
  Settled: 240,
  BonusSettled: 260,
  RoundSettled: 420,
};
const RESULT_HOLD_MS = 1400;

const PART_LABEL = { ante: 'Ante', blind: 'Blind', play: 'Play' } as const;

export interface HistoryEntry {
  round: number;
  player: string;
  dealer: string;
  net: Decimal;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class DjGame {
  /** The rules as designed, with anything the admin panel has changed. */
  get rules() {
    return tuning.rules('djwild', DJ_RULES);
  }
  readonly seq = new Sequencer<DjMove>();

  runSeed = $state(newSeed());
  round = $state(0);
  ante = $state(new Decimal(STARTING_ANTE));
  /** Side bets for the next hand, in dollars. */
  readonly side = new SideStakes(DJ_BONUSES);
  /** Chips on the spots for the next hand. */
  readonly bets = new ChipBets(
    () => this.ante,
    (v) => (this.ante = v),
    this.side,
    () => this.bank,
    2,
    // Enough left over for the 2× Play: no hand is dealt that the player couldn't see through.
    2,
  );
  /** Counts deals, so the table can throw each new hand in from the shoe. */
  deals = $state(0);
  /** The dealer card about to turn, for a moment of suspense. */
  dealerFocus = $state(-1);
  roundAnte = $state(new Decimal(STARTING_ANTE));
  lastAnte = $state(new Decimal(STARTING_ANTE));
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);
  /** Why the last hand couldn't be dealt or played on, for a moment on screen. */
  error = $state<string | null>(null);
  suggestion = $state<DjMove | null>(null);

  player = $state<(Card | null)[]>(Array(5).fill(null));
  dealer = $state<(Card | null)[]>(Array(5).fill(null));
  playerScore = $state<number | null>(null);
  dealerScore = $state<number | null>(null);
  played = $state(false);
  folded = $state(false);
  results = $state<Partial<Record<keyof typeof PART_LABEL, { net: number; note: string }>>>({});
  /** Side bets riding on this hand, in antes. */
  roundSide = $state<Record<string, number>>({});
  /** Hands the Lucky Seat deals blind beside the player's, played all in. */
  readonly blind = new BlindHands('djw');
  bonusResults = $state<Record<string, BonusResult>>({});
  net = $state<number | null>(null);
  breakdown = $state<BreakdownLine[]>([]);
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  folds = $state(0);
  history = $state<HistoryEntry[]>([]);

  constructor() {
    // Sit back down and the chips and the speed are as you left them.
    this.bets.remember('djw');
    this.seq.remember('djw');
  }

  /** Too little left to deal a hand at this table, even at the smallest bet. */
  get broke(): boolean {
    return this.bank.lt(this.bets.minimum);
  }

  get bank(): Decimal {
    return bankroll.balance;
  }

  start() {
    if (this.started || this.seq.disposed) return;
    this.started = true;
    // Sitting down with too little to bet goes straight to the buy-back.
    if (this.broke) {
      // Losing it all is the penalty for running unattended: auto play stops until it's pressed again.
      this.gameOver = true;
      this.autoPlay = false;
    }
    void this.loop();
  }

  setAutoPlay(on: boolean) {
    this.autoPlay = on;
    if (!on) return;
    if (this.seq.awaiting === 'move') this.seq.answer(this.suggestion!);
    else if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer('play');
  }

  choose(move: DjMove) {
    if (this.seq.awaiting === 'move') this.seq.answer(move);
  }

  deal() {
    if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer('play');
  }

  advance() {
    if (this.seq.awaiting === 'move') this.seq.answer(this.suggestion!);
    else this.deal();
  }


  dispose() {
    // Anything still held back for this table's show is shown as it is.
    player.releaseAll();
    this.seq.dispose();
    this.started = false;
  }

  restart() {
    this.seq.reset();
    this.runSeed = newSeed();
    this.round = 0;
    bankroll.buyIn();
    this.ante = new Decimal(STARTING_ANTE);
    this.side.reset();
    // A buy-back starts from the table's opening bets, with auto play off.
    this.bets.save();
    this.autoPlay = false;
    this.hands = 0;
    this.folds = 0;
    this.sessionNet = new Decimal(0);
    this.biggestWin = new Decimal(0);
    this.history = [];
    this.last = null;
    this.blind.clear();
    this.gameOver = false;
    this.started = false;
    this.start();
  }

  /** Bets go down before every hand; auto play deals on its own once there is a bet. */
  private async loop() {
    while (this.started && !this.gameOver && !this.seq.disposed) {
      const auto = this.autoPlay && this.bets.canDeal && this.hands > 0;
      const ok = auto ? await this.seq.wait(RESULT_HOLD_MS) : (await this.seq.ask('deal')) !== null;
      if (!ok) return;
      if (!this.bets.canDeal) continue;
      if (!(await this.playRound())) return;
    }
  }

  /**
   * Plays a hand through the engine (on the server, for a member), or a few
   * under auto play: the bets go down, each decision goes to the engine, and
   * the felt shows what comes back. A hand left mid-way picks up where it was.
   */
  private async playRound(): Promise<boolean> {
    return playTable<DjDecision, DjMove>({
      game: 'djwild',
      request: () => ({ bet: this.ante.toString(), sides: sidesInDollars(this.side.units(this.ante), this.ante), blind: this.blind.request() }),
      autoPlay: () => this.autoPlay,
      wait: (ms) => this.seq.wait(ms),
      between: RESULT_HOLD_MS,
      start: (play, unit) => {
        this.roundAnte = unit;
        this.blind.fromDeal(play.blind, Number(play.info.holeCards) || 0);
      },
      ready: (play, unit) => void this.blind.fromSettled(play.settled!.blind, unit),
      show: (events) => this.show(events as DjEvent[]),
      decide: async (decision) => {
        const suggestion = decideDj(decision.cards);
        if (this.autoPlay) return suggestion;
        this.suggestion = suggestion;
        const choice = await this.seq.ask('move');
        this.suggestion = null;
        return choice;
      },
      settled: (play, hold, unit) => this.settle(play.result as DjRoundResult, play.settled!, hold, unit),
      failed: (error) => {
        this.error = error;
        this.autoPlay = false;
      },
    });
  }

  private async show(events: DjEvent[]): Promise<boolean> {
    for (const event of events) {
      if (event.type === 'DealerRevealed') {
        // The dealer turns over one card at a time; the next one lifts first.
        const step = BASE_MS.DealerRevealed * (event.cards.length > 4 ? 0.3 : 0.45);
        for (let i = 0; i < event.cards.length; i++) {
          if (this.dealer[i]) continue;
          this.dealerFocus = i;
          if (!(await this.seq.wait(step))) return false;
          this.dealer[i] = event.cards[i]!;
          sfx.flip();
        }
        this.dealerFocus = -1;
      }
      let ms = BASE_MS[event.type];
      if (this.seq.speed === 'smart') {
        if (event.type === 'Settled' || event.type === 'BonusSettled') ms *= 0.7;
        else if (event.type !== 'DealerRevealed') ms *= 0.8;
      }
      if (!(await this.seq.wait(ms))) return false;
      this.apply(event);
    }
    return true;
  }

  private apply(event: DjEvent) {
    switch (event.type) {
      case 'RoundStarted':
        this.deals++;
        this.bets.touched = false;
        this.dealerFocus = -1;
        this.player = Array(5).fill(null);
        this.dealer = Array(5).fill(null);
        this.playerScore = null;
        this.dealerScore = null;
        this.played = false;
        this.folded = false;
        this.results = {};
        this.roundSide = event.bonuses;
        this.bonusResults = {};
        this.net = null;
        this.breakdown = [];
        break;
      case 'PlayerCards':
        this.player = [...event.cards];
        this.playerScore = event.score;
        sfx.flip();
        break;
      case 'Played':
        this.played = true;
        sfx.chip();
        break;
      case 'Folded':
        this.folded = true;
        sfx.lose();
        break;
      case 'DealerRevealed':
        this.blind.reveal();
        this.dealer = [...event.cards];
        this.dealerScore = event.score;
        sfx.flip();
        break;
      case 'Settled':
        this.results[event.part] = { net: event.net, note: event.note };
        this.breakdown.push({ label: `${PART_LABEL[event.part]} · ${event.note}`, amount: event.net });
        break;
      case 'BonusSettled':
        this.bonusResults[event.result.id] = event.result;
        this.breakdown.push(bonusLine(DJ_BONUSES, event.result));
        if (event.result.net > 0) sfx.chip();
        break;
      case 'RoundSettled':
        this.blind.showResults();
        this.net = event.net;
        this.last = { lines: [...this.breakdown], net: event.net };
        if (event.net >= 8) sfx.bigWin();
        else if (event.net > 0) sfx.win();
        else if (event.net < 0 && !this.folded) sfx.lose();
        break;
      case 'DealerCards':
      case 'Decision':
        break;
    }
  }

  /** What the casino is told about one settled hand, for charms and Tokens. */

  private settle(result: DjRoundResult, settled: TableSettled, hold: number | null, ante: Decimal) {
    const blind = this.blind.fromSettled(settled.blind, ante);
    // Charms act on the settled hand; the bankroll is paid the hand and whatever they add.
    // The hand as the engine settled it, charms and all, shows now that the felt has dealt it out.
    const charms = landSettled(settled, hold);
    const units = charms.units;
    if (charms.lines.length) this.net = units;
    if (charms.lines.length || blind.hands) {
      this.last = { lines: [...(this.last?.lines ?? []), ...charms.lines, ...blind.lines], net: units + blind.units };
    }
    const net = ante.mul(units);
    this.lastAnte = ante;
    this.sessionNet = this.sessionNet.add(net).add(blind.money);
    if (net.gt(this.biggestWin)) this.biggestWin = net;
    if (result.folded) this.folds++;
    this.hands += 1 + blind.hands;
    this.round++;
    const short = (score: number) => DJ_CATEGORY_NAMES[djCategoryOf(score)];
    const entry: HistoryEntry = {
      round: this.round,
      player: result.folded ? 'fold' : short(result.playerScore),
      dealer: short(result.dealerScore),
      net,
    };
    this.history = [entry, ...this.history].slice(0, 12);
    if (this.broke) {
      // Losing it all is the penalty for running unattended: auto play stops until it's pressed again.
      this.gameOver = true;
      this.autoPlay = false;
    }
    else this.bets.fit();
  }
}
