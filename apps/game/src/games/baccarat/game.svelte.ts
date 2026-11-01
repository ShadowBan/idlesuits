import {
  BACCARAT_BONUSES,
  BACCARAT_RULES,
  cutCardOut,
  shuffleShoe,
  simulateBaccaratRound,
  type BaccaratEvent,
  type BaccaratHand,
  type BaccaratRoundResult,
  type BaccaratSide,
  type BaccaratWinner,
  type BonusResult,
  type Card,
  type RoundReport,
  type Shoe,
} from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import { bankroll } from '../../lib/casino.svelte';
import { PENETRATION } from '../../lib/gameRules';
import { meta } from '../../lib/meta.svelte';
import { Decimal } from '../../lib/money';
import { mainBet, sideBets } from '../../lib/report';
import { load, save, saveSoon } from '../../lib/save';
import { Sequencer } from '../../lib/sequencer.svelte';
import { bonusLine, SideStakes } from '../../lib/sidebets.svelte';
import { sfx } from '../../lib/sound';
import { ChipBets } from '../../lib/stakes.svelte';
import { tuning } from '../../lib/tuning.svelte';

const STARTING_BET = 5;

/** Milliseconds at 1× before each step is shown. */
const DEAL_MS = 260;
const REVEAL_MS = 380;
/** A third card is squeezed: held face down a moment before it turns. */
const SQUEEZE_MS = 650;
const SETTLE_MS = 380;
const RESULT_HOLD_MS = 1300;
const SHUFFLE_MS = 1800;
/** The bead plate keeps the last few dozen coups of the shoe. */
const ROAD_LENGTH = 66;

export interface HistoryEntry {
  round: number;
  winner: BaccaratWinner;
  player: number;
  banker: number;
  net: Decimal;
}

/** A coup on the scoreboard: who won, and whether it was a natural. */
export interface Bead {
  winner: BaccaratWinner;
  natural: boolean;
}

function newSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}

export class BaccaratGame {
  readonly seq = new Sequencer<true>();

  /** Punto Banco as designed, with anything the admin panel has changed. */
  get rules() {
    return tuning.rules('baccarat', BACCARAT_RULES);
  }

  runSeed = $state(newSeed());
  round = $state(0);
  bet = $state(new Decimal(STARTING_BET));
  /** Which hand the main bet backs; Banker, the better bet, to start. */
  side = $state<BaccaratSide>(load<BaccaratSide>('baccarat.side', 'banker') === 'player' ? 'player' : 'banker');
  /** Tie and the pairs, in dollars. */
  readonly sides = new SideStakes(BACCARAT_BONUSES);
  readonly bets = new ChipBets(
    () => this.bet,
    (v) => (this.bet = v),
    this.sides,
    () => this.bank,
    1,
  );

  private shoe: Shoe;
  private shoeSeed: string;
  private shoeNumber: number;
  private shoeDecks: number;
  shoeView = $state({ size: 0, next: 0, cut: 0 });
  shuffling = $state(false);
  /** This shoe's coups, oldest first, for the bead plate. */
  road = $state<Bead[]>([]);

  deals = $state(0);
  /** Undefined is no card there; null is a card dealt face down. */
  player = $state<(Card | null | undefined)[]>([undefined, undefined, undefined]);
  banker = $state<(Card | null | undefined)[]>([undefined, undefined, undefined]);
  /** The face-down card being squeezed. */
  focus = $state<{ hand: BaccaratHand; index: number } | null>(null);
  winner = $state<BaccaratWinner | null>(null);
  natural = $state(false);
  roundBet = $state(new Decimal(STARTING_BET));
  roundSideBet = $state<BaccaratSide>('banker');
  roundSide = $state<Record<string, number>>({});
  mainNet = $state<number | null>(null);
  bonusResults = $state<Record<string, BonusResult>>({});
  net = $state<number | null>(null);
  breakdown = $state<BreakdownLine[]>([]);
  last = $state<{ lines: BreakdownLine[]; net: number } | null>(null);
  lastBet = $state(new Decimal(STARTING_BET));
  started = $state(false);
  gameOver = $state(false);
  autoPlay = $state(false);

  hands = $state(0);
  sessionNet = $state(new Decimal(0));
  biggestWin = $state(new Decimal(0));
  wins = $state({ player: 0, banker: 0, tie: 0 });
  naturals = $state(0);
  history = $state<HistoryEntry[]>([]);

  constructor() {
    this.bets.remember('baccarat');
    this.seq.remember('baccarat');
    const saved = load<{ seed: string; number: number; next: number; decks: number; road: Bead[] } | null>(
      'shoe.baccarat',
      null,
    );
    this.shoeSeed = saved?.seed ?? newSeed();
    this.shoeNumber = saved?.number ?? 0;
    this.shoeDecks = saved?.decks ?? this.rules.decks;
    this.shoe = shuffleShoe(this.shoeDecks, [this.shoeSeed, this.shoeNumber], this.cutRange());
    if (saved && saved.next > this.shoe.next && saved.next < this.shoe.cards.length) {
      this.shoe.next = saved.next;
      this.road = saved.road ?? [];
    }
    this.refreshShoe();
  }

  get broke(): boolean {
    return this.bank.lt(this.bets.minimum);
  }

  get bank(): Decimal {
    return bankroll.balance;
  }

  private cutRange(): [number, number] {
    const at = tuning.gameValue('baccarat', PENETRATION.path, PENETRATION.value as number) / 100;
    return [Math.max(0.1, at - 0.05), Math.min(0.97, at + 0.05)];
  }

  private refreshShoe() {
    this.shoeView = { size: this.shoe.cards.length, next: this.shoe.next, cut: this.shoe.cut };
    saveSoon('shoe.baccarat', () => ({
      seed: this.shoeSeed,
      number: this.shoeNumber,
      next: this.shoe.next,
      decks: this.shoeDecks,
      road: $state.snapshot(this.road),
    }));
  }

  /** Moves the main bet to the other hand. Only between coups. */
  setSide(side: BaccaratSide) {
    if (side === this.side || this.seq.awaiting !== 'deal') return;
    this.side = side;
    this.bets.touched = true;
    save('baccarat.side', side);
  }

  start() {
    if (this.started || this.seq.disposed) return;
    this.started = true;
    if (this.broke) {
      // Losing it all is the penalty for running unattended: auto play stops until it's pressed again.
      this.gameOver = true;
      this.autoPlay = false;
    }
    void this.loop();
  }

  setAutoPlay(on: boolean) {
    this.autoPlay = on;
    if (on && this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer(true);
  }

  deal() {
    if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer(true);
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
    this.bet = new Decimal(STARTING_BET);
    this.sides.reset();
    // A buy-back starts from the table's opening bets, with auto play off.
    this.bets.save();
    this.autoPlay = false;
    this.hands = 0;
    this.sessionNet = new Decimal(0);
    this.biggestWin = new Decimal(0);
    this.wins = { player: 0, banker: 0, tie: 0 };
    this.naturals = 0;
    this.history = [];
    this.last = null;
    this.gameOver = false;
    this.started = false;
    this.start();
  }

  private async loop() {
    while (this.started && !this.gameOver && !this.seq.disposed) {
      const auto = this.autoPlay && this.bets.canDeal && this.hands > 0;
      const ok = auto ? await this.seq.wait(RESULT_HOLD_MS) : (await this.seq.ask('deal')) !== null;
      if (!ok) return;
      if (!this.bets.canDeal) continue;
      if (!(await this.playRound())) return;
    }
  }

  private async playRound(): Promise<boolean> {
    // The cut card came out, or the shoe should hold a different number of decks: shuffle before dealing on.
    if (cutCardOut(this.shoe) || this.shoeDecks !== this.rules.decks) {
      this.shuffling = true;
      sfx.shuffle();
      const ok = await this.seq.wait(SHUFFLE_MS);
      this.shoeDecks = this.rules.decks;
      this.shoe = shuffleShoe(this.shoeDecks, [this.shoeSeed, ++this.shoeNumber], this.cutRange());
      // A new shoe, a new scoreboard.
      this.road = [];
      this.refreshShoe();
      this.shuffling = false;
      if (!ok) return false;
    }
    const bet = this.bet;
    const bonuses = this.sides.units(bet);
    const result = simulateBaccaratRound({
      rules: this.rules,
      seed: { run: this.runSeed, round: this.round },
      side: this.side,
      bonuses,
      shoe: this.shoe,
      recordEvents: true,
    });
    this.roundBet = bet;
    if (!(await this.show(result.events))) return false;
    this.shoe.next += result.cardsUsed;
    this.refreshShoe();
    this.settle(result, bet);
    return true;
  }

  private ms(base: number): Promise<boolean> {
    return this.seq.wait(base);
  }

  /** Plays the coup out: four cards face down, turned Player then Banker, then any third cards squeezed. */
  private async show(events: BaccaratEvent[]): Promise<boolean> {
    for (const event of events) {
      switch (event.type) {
        case 'RoundStarted':
          this.deals++;
          this.bets.touched = false;
          this.player = [undefined, undefined, undefined];
          this.banker = [undefined, undefined, undefined];
          this.focus = null;
          this.winner = null;
          this.natural = false;
          this.roundSideBet = event.side;
          this.roundSide = event.bonuses;
          this.mainNet = null;
          this.bonusResults = {};
          this.net = null;
          this.breakdown = [];
          break;
        case 'CardDealt': {
          const hand = event.to === 'player' ? this.player : this.banker;
          // The shoe empties card by card as the table sees them dealt.
          this.shoeView.next++;
          if (event.index < 2) {
            if (!(await this.ms(DEAL_MS * 0.6))) return false;
            hand[event.index] = null;
            sfx.flip();
            // The fourth card is down: turn the Player's two, then the Banker's.
            if (event.to === 'banker' && event.index === 1) {
              const first = events.filter((e) => e.type === 'CardDealt' && e.index < 2) as Extract<BaccaratEvent, { type: 'CardDealt' }>[];
              for (const to of ['player', 'banker'] as const) {
                if (!(await this.ms(REVEAL_MS))) return false;
                const row = to === 'player' ? this.player : this.banker;
                for (const e of first.filter((c) => c.to === to)) row[e.index] = e.card;
                sfx.flip();
              }
            }
          } else {
            if (!(await this.ms(DEAL_MS))) return false;
            hand[2] = null;
            this.focus = { hand: event.to, index: 2 };
            sfx.flip();
            if (this.seq.speed === 'smart') sfx.tension();
            if (!(await this.ms(this.seq.speed === 'smart' ? SQUEEZE_MS : REVEAL_MS))) return false;
            hand[2] = event.card;
            this.focus = null;
            sfx.flip();
          }
          break;
        }
        case 'Natural':
          this.natural = true;
          break;
        case 'Winner':
          if (!(await this.ms(SETTLE_MS))) return false;
          this.winner = event.winner;
          break;
        case 'MainSettled': {
          this.mainNet = event.net;
          const name = this.roundSideBet === 'banker' ? 'Banker' : 'Player';
          this.breakdown.push({ label: `${name} · ${event.note}`, amount: event.net });
          break;
        }
        case 'BonusSettled':
          this.bonusResults[event.result.id] = event.result;
          this.breakdown.push(bonusLine(BACCARAT_BONUSES, event.result));
          if (event.result.net > 0) sfx.chip();
          break;
        case 'RoundSettled':
          this.net = event.net;
          this.last = { lines: [...this.breakdown], net: event.net };
          if (event.net >= 5) sfx.bigWin();
          else if (event.net > 0) sfx.win();
          else if (event.net < 0) sfx.lose();
          break;
      }
    }
    return true;
  }

  private reportFor(r: BaccaratRoundResult): RoundReport {
    return {
      game: 'baccarat',
      seed: { run: this.runSeed, round: this.round },
      bets: [...mainBet(1, r.main), ...sideBets(r.bonuses, this.roundSide)],
      outcome: r.winner === 'tie' ? 'push' : r.main > 0 ? 'win' : 'lose',
    };
  }

  private settle(result: BaccaratRoundResult, bet: Decimal) {
    // Charms act on the settled coup; the bankroll is paid the coup and whatever they add.
    const charms = meta.settleRound(this.reportFor(result), bet, result.net);
    const units = result.net + charms.extra;
    if (charms.lines.length) {
      this.net = units;
      this.last = { lines: [...(this.last?.lines ?? []), ...charms.lines], net: units };
    }
    const net = bet.mul(units);
    this.lastBet = bet;
    this.sessionNet = this.sessionNet.add(net);
    if (net.gt(this.biggestWin)) this.biggestWin = net;
    this.wins[result.winner]++;
    if (result.natural) this.naturals++;
    this.road = [...this.road, { winner: result.winner, natural: result.natural }].slice(-ROAD_LENGTH);
    this.refreshShoe();
    this.hands++;
    this.round++;
    const entry: HistoryEntry = {
      round: this.round,
      winner: result.winner,
      player: result.playerTotal,
      banker: result.bankerTotal,
      net,
    };
    this.history = [entry, ...this.history].slice(0, 12);
    if (this.broke) {
      // Losing it all is the penalty for running unattended: auto play stops until it's pressed again.
      this.gameOver = true;
      this.autoPlay = false;
    } else this.bets.fit();
  }
}
