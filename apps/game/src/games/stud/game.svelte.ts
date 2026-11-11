import {
  BLIND,
  bestFive,
  decideStud,
  simulateStudRound,
  stepWithChoices,
  STUD_BONUSES,
  STUD_RULES,
  type BonusResult,
  type Card,
  type PokerHand,
  type StudChoice,
  type StudDecision,
  type StudEvent,
  type StudRoundResult,
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

const STARTING_ANTE = 5;

const BASE_MS: Record<StudEvent['type'], number> = {
  RoundStarted: 150,
  HoleCards: 320,
  Decision: 120,
  Bet: 260,
  Folded: 300,
  CommunityCard: 520,
  FinalHand: 360,
  BonusSettled: 300,
  RoundSettled: 420,
};
const RESULT_HOLD_MS = 1500;

export interface Pending {
  decision: StudDecision;
  suggestion: StudChoice;
}

export interface HistoryEntry {
  round: number;
  hand: string;
  net: Decimal;
}

const STREET_NAME = { 3: '3rd street', 4: '4th street', 5: '5th street' } as const;

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class StudGame {
  /** The rules as designed, with anything the admin panel has changed. */
  get rules() {
    return tuning.rules('stud', STUD_RULES);
  }
  readonly seq = new Sequencer<StudChoice>();

  runSeed = $state(newSeed());
  round = $state(0);
  ante = $state(new Decimal(STARTING_ANTE));
  /** Side bets for the next hand, in dollars. */
  readonly side = new SideStakes(STUD_BONUSES);
  /** Chips on the spots for the next hand. */
  readonly bets = new ChipBets(
    () => this.ante,
    (v) => (this.ante = v),
    this.side,
    () => this.bank,
    1,
    // Enough left over for a 1× bet on each of the three streets: no hand is dealt that the player couldn't see through.
    3,
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

  hole = $state<(Card | null)[]>([null, null]);
  community = $state<(Card | null)[]>([null, null, null]);
  /** Street bets in antes, in order; nulls are streets not reached yet. */
  streetBets = $state<(number | null)[]>([null, null, null]);
  folded = $state(false);
  /** Side bets riding on this hand, in antes. */
  roundSide = $state<Record<string, number>>({});
  /** Hands the Lucky Seat deals blind beside the player's, played all in. */
  readonly blind = new BlindHands('stud');
  bonusResults = $state<Record<string, BonusResult>>({});
  hand = $state<PokerHand | null>(null);
  multiplier = $state<number | null>(null);
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
    this.bets.remember('stud');
    this.seq.remember('stud');
  }

  /** Too little left to deal a hand at this table, even at the smallest bet. */
  get broke(): boolean {
    return this.bank.lt(this.bets.minimum);
  }

  get bank(): Decimal {
    return bankroll.balance;
  }

  get best(): Set<string> {
    const shown = [...this.hole, ...this.community].filter((c): c is Card => c !== null);
    if (shown.length < 5) return new Set();
    return new Set(bestFive(shown).map((c) => c.uid));
  }

  /** Everything on the table so far: ante plus street bets. */
  get wagered(): number {
    return 1 + this.streetBets.reduce<number>((sum, b) => sum + (b ?? 0), 0);
  }

  start() {
    if (this.started || this.seq.disposed) return;
    this.started = true;
    // Auto play still running here on the engine's clock (left on, or away): the table picks it back up.
    if (autoFeed.isOn('stud')) queueMicrotask(() => this.setAutoPlay(true));
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
    else if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer({ move: 'fold' });
  }

  choose(choice: StudChoice) {
    if (choice.move === 'bet' && !this.pending?.decision.raises.includes(choice.size)) return;
    if (this.seq.awaiting === 'move') this.seq.answer(choice);
  }

  deal() {
    if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer({ move: 'fold' });
  }

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
    return playTable<StudDecision, StudChoice>({
      game: 'stud',
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
      show: (events) => this.show(events as StudEvent[]),
      decide: async (decision) => {
        // Only bets the bankroll covers come back from the engine, keeping 1× back for every street still to come.
        let suggestion = decideStud(decision);
        if (suggestion.move === 'bet' && !decision.raises.includes(suggestion.size)) {
          const wanted = suggestion.size;
          const fits = decision.raises.filter((r) => r <= wanted);
          suggestion = fits.length ? { move: 'bet', size: Math.max(...fits) } : { move: 'fold' };
        }
        if (this.autoPlay) return suggestion;
        this.pending = { decision, suggestion };
        const choice = await this.seq.ask('move');
        this.pending = null;
        return choice;
      },
      settled: (play, hold, unit) => this.settle(play.result as StudRoundResult, play.settled!, hold, unit),
      failed: (error) => {
        this.error = error;
        this.autoPlay = false;
      },
    });
  }

  private async show(events: StudEvent[]): Promise<boolean> {
    for (const event of events) {
      const smart = this.seq.speed === 'smart';
      let ms = BASE_MS[event.type];
      // Smart pacing: the last card is the one everyone is waiting for.
      if (smart && event.type === 'CommunityCard') ms *= event.index === 2 ? 1.6 : 0.8;
      if (smart && event.type === 'Bet') ms *= 0.7;
      if (!(await this.seq.wait(ms))) return false;
      this.apply(event);
    }
    return true;
  }

  private apply(event: StudEvent) {
    switch (event.type) {
      case 'RoundStarted':
        this.deals++;
        this.bets.touched = false;
        this.dealerFocus = -1;
        this.hole = [null, null];
        this.community = [null, null, null];
        this.streetBets = [null, null, null];
        this.folded = false;
        this.bonusResults = {};
        this.hand = null;
        this.multiplier = null;
        this.net = null;
        this.breakdown = [];
        break;
      case 'HoleCards':
        this.hole = [...event.cards];
        sfx.flip();
        break;
      case 'Bet':
        this.streetBets[event.street - 3] = event.size;
        sfx.chip();
        break;
      case 'Folded':
        this.folded = true;
        this.breakdown = [{ label: `Folded on ${STREET_NAME[event.street]}`, amount: -event.lost }];
        sfx.lose();
        break;
      case 'CommunityCard':
        this.community[event.index] = event.card;
        sfx.flip();
        break;
      case 'FinalHand': {
        this.blind.reveal();
        this.hand = event.hand;
        this.multiplier = event.multiplier;
        const label =
          event.multiplier > 0 ? `pays ${event.multiplier}:1` : event.multiplier === 0 ? 'push' : 'loses';
        this.breakdown = [
          { label: `Ante · ${label}`, amount: event.multiplier },
          ...this.streetBets.map((b, i) => ({
            label: `${STREET_NAME[(i + 3) as 3 | 4 | 5]} ${b}× · ${label}`,
            amount: (b ?? 0) * event.multiplier,
          })),
        ];
        break;
      }
      case 'BonusSettled':
        this.bonusResults[event.result.id] = event.result;
        this.breakdown.push(bonusLine(STUD_BONUSES, event.result));
        if (event.result.net > 0) sfx.chip();
        break;
      case 'RoundSettled':
        this.blind.showResults();
        this.net = event.net;
        this.last = { lines: [...this.breakdown], net: event.net };
        if (event.net >= 10) sfx.bigWin();
        else if (event.net > 0) sfx.win();
        else if (event.net < 0 && !this.folded) sfx.lose();
        break;
      case 'Decision':
        break;
    }
  }

  /** What the casino is told about one settled hand, for charms and Tokens. */

  private settle(result: StudRoundResult, settled: TableSettled, hold: number | null, ante: Decimal) {
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
      hand: result.folded ? `fold ${STREET_NAME[(3 + result.bets.length) as 3 | 4 | 5]}` : (result.hand ? shortName(result.hand) : ''),
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

const SHORT = ['High card', 'Pair', 'Two pair', 'Trips', 'Straight', 'Flush', 'Full house', 'Quads', 'Str flush', 'Royal'];
function shortName(hand: PokerHand): string {
  if (hand.category === 1 && hand.madeRank) return `Pair of ${hand.madeRank >= 11 ? ['J', 'Q', 'K', 'A'][hand.madeRank - 11] : hand.madeRank}s`;
  return SHORT[hand.category]!;
}
