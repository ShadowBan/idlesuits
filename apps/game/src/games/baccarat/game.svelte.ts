import {
  BACCARAT_BONUSES,
  BACCARAT_RULES,
  type BaccaratEvent,
  type BaccaratHand,
  type BaccaratRoundResult,
  type BaccaratSide,
  type BaccaratWinner,
  type BonusResult,
  type Card,
} from '@idlesuits/sim';
import type { BreakdownLine } from '../../lib/breakdown';
import type { TableSettled } from '@idlesuits/engine';
import { autoplay } from '../../lib/autoplay.svelte';
import { bankroll } from '../../lib/casino.svelte';
import { floor } from '../../lib/floor.svelte';
import { Decimal } from '../../lib/money';
import { player } from '../../lib/player.svelte';
import { load, save, saveSoon } from '../../lib/save';
import { landSettled, sidesInDollars, tableAct } from '../../lib/table.svelte';
import { Sequencer } from '../../lib/sequencer.svelte';
import { bonusLine, SideStakes } from '../../lib/sidebets.svelte';
import { sfx } from '../../lib/sound';
import { ChipBets } from '../../lib/stakes.svelte';
import { tuning } from '../../lib/tuning.svelte';

const STARTING_BET = 5;
/** Coups auto play asks for at once. */
const AUTO_BATCH = 5;

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

/** What the table waits on the player for: the deal, or which face-down card to turn (-1 turns them all). */
type Answer = true | number;

export class BaccaratGame {
  readonly seq = new Sequencer<Answer>();

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

  /** Why the last coup couldn't be dealt, for a moment on screen. */
  error = $state<string | null>(null);
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
  /** The hand whose face-down cards wait for the player to turn them: the one they bet on. */
  turning = $state<BaccaratHand | null>(null);
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
    // The shoe's place, as the engine keeps it (its order is the engine's secret); the bead plate is this browser's.
    const shoe = (player.shown.games.baccarat as { shoe?: { next: number; decks: number } } | undefined)?.shoe;
    if (shoe) this.shoeView = { size: shoe.decks * 52, next: shoe.next, cut: Math.round(shoe.decks * 52 * 0.75) };
    const road = load<Bead[]>('baccarat.road', []);
    this.road = Array.isArray(road) ? road.slice(-ROAD_LENGTH) : [];
  }

  get broke(): boolean {
    return this.bank.lt(this.bets.minimum);
  }

  get bank(): Decimal {
    return bankroll.balance;
  }

  private saveRoad() {
    saveSoon('baccarat.road', () => $state.snapshot(this.road));
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
    // Auto play turns the cards itself.
    if (on && this.seq.awaiting === 'turn') this.seq.answer(-1);
  }

  deal() {
    if (this.seq.awaiting === 'deal' && this.bets.canDeal) this.seq.answer(true);
  }

  /** Turns one of the player's face-down cards, by slot. */
  turn(index: number) {
    if (this.seq.awaiting === 'turn') this.seq.answer(index);
  }

  /** Turns the player's next face-down card, left to right. */
  turnNext() {
    if (!this.turning) return;
    const row = this.turning === 'player' ? this.player : this.banker;
    const index = row.indexOf(null);
    if (index >= 0) this.turn(index);
  }

  turnAll() {
    this.turn(-1);
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

  /**
   * Deals a coup, as the engine decides it (on the server, for a member), or a
   * few for auto play, and shows each in turn.
   */
  private async playRound(): Promise<boolean> {
    const bet = this.bet;
    const bonuses = this.sides.units(bet);
    const req = { game: 'baccarat', room: floor.current, bet: bet.toString(), sides: sidesInDollars(bonuses, bet), options: { side: this.side } };
    const s = autoplay.settings;
    const reply = this.autoPlay
      ? await tableAct({
          type: 'table.auto',
          ...req,
          rounds: Math.min(AUTO_BATCH, s.stopAfter ? Math.max(1, s.stopRounds - autoplay.rounds) : AUTO_BATCH),
          stop: { winX: s.stopOnWin ? s.stopWinX : undefined, below: s.stopBelow ? s.stopBelowAmount : undefined, above: s.stopAbove ? s.stopAboveAmount : undefined },
        })
      : await tableAct({ type: 'table.deal', ...req });
    if (!reply.ok) {
      this.error = reply.error ?? 'The coup couldn’t be dealt.';
      this.autoPlay = false;
      return true;
    }
    this.error = null;
    for (let i = 0; i < reply.plays.length; i++) {
      const play = reply.plays[i]!;
      if (i > 0 && !(await this.seq.wait(RESULT_HOLD_MS))) return false;
      reply.begin(i);
      const shoe = play.info.shoe as { size: number; next: number; cut: number } | undefined;
      if (play.info.shuffled) {
        // The cut card came out: the dealer shuffles before dealing on, and a new shoe starts a new scoreboard.
        this.shuffling = true;
        sfx.shuffle();
        const ok = await this.seq.wait(SHUFFLE_MS);
        this.shuffling = false;
        this.road = [];
        this.saveRoad();
        if (!ok) return false;
      }
      if (shoe) this.shoeView = { ...shoe };
      this.roundBet = bet;
      if (!(await this.show(play.events as BaccaratEvent[]))) return false;
      if (play.settled) this.settle(play.result as BaccaratRoundResult, play.settled, reply.holds[i] ?? null, bet);
    }
    return true;
  }

  private ms(base: number): Promise<boolean> {
    return this.seq.wait(base);
  }

  /**
   * The bettor turns the cards of the hand they backed, as the biggest bet on
   * each side does at a real baccarat table: waits until every one of `cards`
   * is face up. False if the game was reset meanwhile.
   */
  private async playerTurns(to: BaccaratHand, cards: { index: number; card: Card }[]): Promise<boolean> {
    const row = to === 'player' ? this.player : this.banker;
    this.turning = to;
    while (cards.some((c) => row[c.index] === null)) {
      const answer = await this.seq.ask('turn');
      if (answer === null) return false;
      for (const c of cards) {
        if (row[c.index] === null && (answer === -1 || answer === c.index)) row[c.index] = c.card;
      }
      sfx.flip();
    }
    this.turning = null;
    return true;
  }

  /** Whether the player turns this hand's cards: the one they bet on, unless auto play is dealing. */
  private turnsOwn(to: BaccaratHand): boolean {
    return !this.autoPlay && to === this.roundSideBet;
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
          this.turning = null;
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
                const own = first.filter((c) => c.to === to);
                if (this.turnsOwn(to)) {
                  if (!(await this.playerTurns(to, own))) return false;
                  continue;
                }
                if (!(await this.ms(REVEAL_MS))) return false;
                const row = to === 'player' ? this.player : this.banker;
                for (const e of own) row[e.index] = e.card;
                sfx.flip();
              }
            }
          } else {
            if (!(await this.ms(DEAL_MS))) return false;
            hand[2] = null;
            sfx.flip();
            if (this.turnsOwn(event.to)) {
              if (!(await this.playerTurns(event.to, [{ index: 2, card: event.card }]))) return false;
              break;
            }
            this.focus = { hand: event.to, index: 2 };
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

  private settle(result: BaccaratRoundResult, settled: TableSettled, hold: number | null, bet: Decimal) {
    // The coup as the engine settled it, charms and all, shows now that the table has dealt it out.
    const charms = landSettled(settled, hold);
    const units = charms.units;
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
    this.saveRoad();
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
