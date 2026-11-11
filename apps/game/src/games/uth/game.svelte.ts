import {
  BLIND,
  bestFive,
  decideUth,
  PREFLOP_CHART,
  riverOdds,
  simulateUthRound,
  standardDeck,
  stepWithChoices,
  UTH_BONUSES,
  UTH_RULES,
  type BonusResult,
  type Card,
  type PokerHand,
  type RiverOdds,
  type UthDecision,
  type UthEvent,
  type UthMove,
  type UthRoundResult,
  type RoundReport,
} from '@idlesuits/sim';
import type { TableSettled } from '@idlesuits/engine';
import { BlindHands } from '../../lib/blind.svelte';
import { autoFeed, SPEED } from '../../lib/autofeed.svelte';
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

type Choice = { move: UthMove; raise?: number };

const STARTING_ANTE = 5;
const DECK = standardDeck('player');
const STRATEGY = { chart: PREFLOP_CHART };

/** Milliseconds at 1× before each event is shown. */
const BASE_MS: Record<UthEvent['type'], number> = {
  RoundStarted: 150,
  HoleCards: 320,
  DealerCards: 220,
  Decision: 120,
  Played: 300,
  Checked: 220,
  Folded: 300,
  BoardRevealed: 360,
  PlayerHand: 200,
  DealerRevealed: 700,
  Settled: 240,
  BonusCards: 420,
  BonusSettled: 260,
  RoundSettled: 420,
};
const RESULT_HOLD_MS = 1600;

const PART_LABEL = { ante: 'Ante', blind: 'Blind', play: 'Play' } as const;

export interface Pending {
  decision: UthDecision;
  suggestion: Choice;
  /** Only on the river, where the odds can be computed exactly. */
  odds: RiverOdds | null;
}

export interface HistoryEntry {
  round: number;
  player: string;
  dealer: string;
  net: Decimal;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class UthGame {
  /** The rules as designed, with anything the admin panel has changed. */
  get rules() {
    return tuning.rules('uth', UTH_RULES);
  }
  readonly seq = new Sequencer<Choice>();

  runSeed = $state(newSeed());
  round = $state(0);
  ante = $state(new Decimal(STARTING_ANTE));
  /** Side bets for the next hand, in dollars. */
  readonly side = new SideStakes(UTH_BONUSES);
  /** Chips on the spots for the next hand: Ante (with its matching Blind) and side bets. */
  readonly bets = new ChipBets(
    () => this.ante,
    (v) => (this.ante = v),
    this.side,
    () => this.bank,
    2,
    // Enough left over for the 1× Play at the river: no hand is dealt that the player couldn't see through.
    1,
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
  pending = $state<Pending | null>(null);

  // The table, as the events have revealed it.
  hole = $state<(Card | null)[]>([null, null]);
  dealer = $state<(Card | null)[]>([null, null]);
  board = $state<(Card | null)[]>([null, null, null, null, null]);
  playerHand = $state<PokerHand | null>(null);
  dealerHand = $state<PokerHand | null>(null);
  dealerQualified = $state<boolean | null>(null);
  /** Play bet in antes, once made. */
  play = $state(0);
  /** Side bets riding on this hand, in antes. */
  roundSide = $state<Record<string, number>>({});
  /** Hands the Lucky Seat deals blind beside the player's, played all in. */
  readonly blind = new BlindHands('uth');
  bonusResults = $state<Record<string, BonusResult>>({});
  /** The 6-Card Bonus's own four cards, once shown. */
  bonusCards = $state<Card[]>([]);
  folded = $state(false);
  checks = $state(0);
  results = $state<Partial<Record<keyof typeof PART_LABEL, { net: number; note: string }>>>({});
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
    this.bets.remember('uth');
    this.seq.remember('uth');
  }

  /** Too little left to deal a hand at this table, even at the smallest bet. */
  get broke(): boolean {
    return this.bank.lt(this.bets.minimum);
  }

  get bank(): Decimal {
    return bankroll.balance;
  }

  /** The player's best five, for highlighting on the felt. */
  get playerBest(): Set<string> {
    const shown = [...this.hole, ...this.board].filter((c): c is Card => c !== null);
    if (shown.length < 5) return new Set();
    return new Set(bestFive(shown).map((c) => c.uid));
  }

  start() {
    if (this.started || this.seq.disposed) return;
    this.started = true;
    // Auto play still running here on the engine's clock (left on, or away): the table picks it back up.
    if (autoFeed.isOn('uth')) queueMicrotask(() => this.setAutoPlay(true));
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
    if (this.seq.awaiting === 'move') this.seq.answer(this.pending!.suggestion);
    else if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer({ move: 'check' });
  }

  choose(choice: Choice) {
    if (choice.move === 'raise' && !this.pending?.decision.raises.includes(choice.raise ?? 0)) return;
    if (this.seq.awaiting === 'move') this.seq.answer(choice);
  }

  deal() {
    if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer({ move: 'check' });
  }

  /** Space: take the suggestion, or deal. */
  advance() {
    if (this.seq.awaiting === 'move') this.seq.answer(this.pending!.suggestion);
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
    return playTable<UthDecision, Choice>({
      game: 'uth',
      request: () => ({ bet: this.ante.toString(), sides: sidesInDollars(this.side.units(this.ante), this.ante), blind: this.blind.request() }),
      autoPlay: () => this.autoPlay,
      wait: (ms) => this.seq.wait(ms),
      between: RESULT_HOLD_MS,
      speed: SPEED[this.seq.speed] ?? 1,
      start: (play, unit) => {
        this.roundAnte = unit;
        this.blind.fromDeal(play.blind, Number(play.info.holeCards) || 0);
      },
      ready: (play, unit) => void this.blind.fromSettled(play.settled!.blind, unit),
      show: (events) => this.show(events as UthEvent[]),
      decide: async (decision) => {
        let suggestion = decideUth(STRATEGY, decision, DECK);
        if (suggestion.move === 'raise' && !decision.raises.includes(suggestion.raise ?? 0)) {
          suggestion = decision.raises.length ? { move: 'raise', raise: Math.max(...decision.raises) } : { move: decision.canCheck ? 'check' : 'fold' };
        }
        if (this.autoPlay) return suggestion;
        const odds = decision.street === 'river' ? riverOdds(decision.hole, decision.board, DECK) : null;
        this.pending = { decision, suggestion, odds };
        const choice = await this.seq.ask('move');
        this.pending = null;
        return choice;
      },
      settled: (play, hold, unit) => this.settle(play.result as UthRoundResult, play.settled!, hold, unit),
      failed: (error) => {
        this.error = error;
        this.autoPlay = false;
      },
    });
  }

  private async show(events: UthEvent[]): Promise<boolean> {
    for (const event of events) {
      if (event.type === 'BoardRevealed') {
        // Turn the board cards one at a time.
        const offset = event.street === 'flop' ? 0 : 3;
        for (let i = 0; i < event.cards.length; i++) {
          if (!(await this.seq.wait(BASE_MS.BoardRevealed * (this.seq.speed === 'smart' ? 0.6 : 1)))) return false;
          this.board[offset + i] = event.cards[i]!;
          sfx.flip();
        }
        continue;
      }
      if (event.type === 'DealerRevealed') {
        // The dealer turns over one card at a time; the next one lifts first.
        for (let i = 0; i < event.cards.length; i++) {
          this.dealerFocus = i;
          if (!(await this.seq.wait(BASE_MS.DealerRevealed * 0.55))) return false;
          this.dealer[i] = event.cards[i]!;
          sfx.flip();
        }
      }
      if (!(await this.seq.wait(this.delay(event)))) return false;
      this.apply(event);
    }
    return true;
  }

  private delay(event: UthEvent): number {
    const base = BASE_MS[event.type];
    if (this.seq.speed !== 'smart') return base;
    // Linger on the dealer's reveal and on anything big; hurry the rest.
    if (event.type === 'DealerRevealed') return base * (this.play >= 2 ? 1.4 : 1);
    if (event.type === 'Settled') return base * (Math.abs(event.net) >= 3 ? 1.5 : 0.7);
    if (event.type === 'BonusSettled') return base * (event.result.net >= 3 ? 1.5 : 0.7);
    return base * 0.8;
  }

  private apply(event: UthEvent) {
    switch (event.type) {
      case 'RoundStarted':
        this.deals++;
        this.bets.touched = false;
        this.dealerFocus = -1;
        this.hole = [null, null];
        this.dealer = [null, null];
        this.board = [null, null, null, null, null];
        this.playerHand = null;
        this.dealerHand = null;
        this.dealerQualified = null;
        this.play = 0;
        this.roundSide = event.bonuses;
        this.bonusResults = {};
        this.bonusCards = [];
        this.folded = false;
        this.checks = 0;
        this.results = {};
        this.net = null;
        this.breakdown = [];
        break;
      case 'HoleCards':
        this.hole = [...event.cards];
        sfx.flip();
        break;
      case 'DealerCards':
        this.dealer = [null, null];
        break;
      case 'Played':
        this.play = event.raise;
        sfx.chip();
        break;
      case 'Checked':
        this.checks++;
        break;
      case 'Folded':
        this.folded = true;
        sfx.lose();
        break;
      case 'PlayerHand':
        this.playerHand = event.hand;
        break;
      case 'DealerRevealed':
        this.blind.reveal();
        this.dealerFocus = -1;
        this.dealer = [...event.cards];
        this.dealerHand = event.hand;
        this.dealerQualified = event.qualified;
        break;
      case 'Settled':
        this.results[event.part] = { net: event.net, note: event.note };
        this.breakdown.push({ label: `${PART_LABEL[event.part]} · ${event.note}`, amount: event.net });
        break;
      case 'BonusCards':
        this.bonusCards = event.cards;
        sfx.flip();
        break;
      case 'BonusSettled':
        this.bonusResults[event.result.id] = event.result;
        this.breakdown.push(bonusLine(UTH_BONUSES, event.result));
        if (event.result.net > 0) sfx.chip();
        break;
      case 'RoundSettled':
        this.blind.showResults();
        this.net = event.net;
        this.last = { lines: [...this.breakdown], net: event.net };
        if (event.net >= 6) sfx.bigWin();
        else if (event.net > 0) sfx.win();
        else if (event.net < 0) sfx.lose();
        break;
      case 'Decision':
      case 'BoardRevealed':
        break;
    }
  }

  /** What the casino is told about one settled hand, for charms and Tokens. */

  private settle(result: UthRoundResult, settled: TableSettled, hold: number | null, ante: Decimal) {
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
    const entry: HistoryEntry = {
      round: this.round,
      player: result.folded ? 'fold' : shortName(result.playerHand),
      dealer: shortName(result.dealerHand),
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

const SHORT = ['High', 'Pair', '2 pair', 'Trips', 'Straight', 'Flush', 'Full', 'Quads', 'Str flush', 'Royal'];
function shortName(hand: PokerHand): string {
  return SHORT[hand.category]!;
}
