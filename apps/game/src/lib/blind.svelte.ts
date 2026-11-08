import type { Card, RoundReport, Seat } from '@idlesuits/sim';
import type { BreakdownLine } from './breakdown';
import { floor } from './floor.svelte';
import { Decimal } from './money';
import { meta } from './meta.svelte';
import { load, saveSoon } from './save';
import { tuning } from './tuning.svelte';

/** One blind hand on the felt, for BlindSeats. */
export interface BlindSeat {
  cards: Card[];
  /** Face up once the dealer shows; until then nobody, the player included, has seen them. */
  shown: boolean;
  /** The hand made, shown with the cards. */
  label: string;
  /** Everything this hand put down. */
  stake: Decimal;
  /** What it won or lost, once settled. */
  net: Decimal | null;
}

/** What one blind hand plays for: its main bet, and its side bets in units of it. */
export interface BlindStake {
  unit: Decimal;
  sides: Record<string, number>;
}

/**
 * How a blind seat bets: the same as the player's hand, bets of its own, or
 * not at all this round.
 */
export type BlindMode = 'match' | 'own' | 'out';

/** A blind seat's bets as the player set them, in dollars. */
export interface BlindBets {
  mode: BlindMode;
  bet: Decimal;
  sides: Record<string, Decimal>;
}

/** How many blind hands this table may deal: as many as the Lucky Seat gives, or the admin panel sets. */
export function blindSeats(): number {
  return tuning.values.blindHands >= 0 ? tuning.values.blindHands : meta.extraHands;
}

/** What a hand puts down, in base bets: its main bets plus its side bets. */
export function unitsDown(main: number, sides: Readonly<Record<string, number>>): number {
  return Object.values(sides).reduce((sum, s) => sum + s, main);
}

interface BlindRules<R> {
  /** The hand's cards and what it made. */
  show: (result: R) => { cards: Card[]; label: string };
  /** What the casino is told about the hand, given the side bets it had riding, in units. */
  report: (result: R, sides: Record<string, number>) => RoundReport;
  /** Everything the hand won or lost, in base bets. */
  net: (result: R) => number;
}

/**
 * A table's blind hands for the round on the felt: dealt (simulated) up front
 * from the seats before the player's, shown face down, turned over with the
 * dealer, and settled one by one, each a hand of its own to the charms.
 *
 * The player sets how each seat bets between hands (`bets`); once dealt, a
 * blind hand plays all in, with no decisions.
 */
export class BlindHands<R> {
  seats = $state<BlindSeat[]>([]);
  /** What they won or lost together this round, in dollars, once settled. */
  net = $state(new Decimal(0));
  /** How each seat bets, in seat order. Seats past what the charms give wait, unused. */
  bets = $state<BlindBets[]>([]);
  private hands: { stake: BlindStake; result: R }[] = [];
  /** What this round's blind hands have down, all in: money the player's own hand can't raise with. */
  private held = new Decimal(0);

  /**
   * Whether the bankroll covers `more` on the player's own hand, on top of
   * `down` already bet on it this round and everything the blind hands hold.
   * Bets are paid from the bankroll when the hand settles, so a raise the
   * player can't cover is never offered.
   */
  covers(bank: Decimal, down: Decimal, more: Decimal): boolean {
    return bank.sub(this.held).sub(down).gte(more);
  }

  constructor(
    private readonly key: string,
    private readonly rules: BlindRules<R>,
  ) {
    const saved = load<{ mode: BlindMode; bet: string; sides: Record<string, string> }[] | null>(`blind.${key}`, null);
    try {
      this.bets = (saved ?? []).map((s) => ({
        mode: s.mode === 'own' || s.mode === 'out' ? s.mode : 'match',
        bet: new Decimal(s.bet).floor().max(0),
        sides: Object.fromEntries(Object.entries(s.sides).map(([id, v]) => [id, new Decimal(v).floor().max(0)])),
      }));
    } catch {
      this.bets = [];
    }
  }

  /** Seat `index`'s bets; a seat never set matches the player's hand. */
  seat(index: number): BlindBets {
    return this.bets[index] ?? { mode: 'match', bet: floor.room.min, sides: {} };
  }

  /** Changes how seat `index` bets, from the next hand on. */
  setSeat(index: number, change: Partial<BlindBets>) {
    const next = [...this.bets];
    for (let i = next.length; i <= index; i++) next.push(this.seat(i));
    next[index] = { ...next[index]!, ...change };
    this.bets = next;
    saveSoon(`blind.${this.key}`, () =>
      this.bets.map((b) => ({
        mode: b.mode,
        bet: b.bet.toString(),
        sides: Object.fromEntries(Object.entries(b.sides).map(([id, v]) => [id, v.toString()])),
      })),
    );
  }

  /**
   * What each seat in play stakes this hand, kept within the room's limits.
   * `mine` is the player's own hand. A blind hand risks `main` base bets all
   * in plus its side bets; seats are dealt in order while the bankroll could
   * cover every hand, the player's included, losing all of it.
   */
  stakes(bank: Decimal, mine: BlindStake, main: number): BlindStake[] {
    const room = floor.room;
    const exposure = (s: BlindStake) => s.unit.mul(unitsDown(main, s.sides));
    let total = exposure(mine);
    const out: BlindStake[] = [];
    for (let i = 0; i < blindSeats(); i++) {
      const seat = this.seat(i);
      if (seat.mode === 'out') continue;
      let stake = mine;
      if (seat.mode === 'own') {
        const unit = Decimal.min(Decimal.max(seat.bet, room.min), room.max);
        const sides: Record<string, number> = {};
        for (const [id, v] of Object.entries(seat.sides)) {
          if (v.gt(0)) sides[id] = Decimal.min(v, room.sideMax).div(unit).toNumber();
        }
        stake = { unit, sides };
      }
      if (bank.lt(total.add(exposure(stake)))) break;
      total = total.add(exposure(stake));
      out.push(stake);
    }
    return out;
  }

  /**
   * Plays the round's blind hands out before the player's round starts: one
   * for each seat in play, dealt from the seats before the player's. Returns
   * the player's own seat.
   */
  deal(bank: Decimal, mine: BlindStake, main: number, play: (stake: BlindStake, seat: Seat) => R): Seat {
    const stakes = this.stakes(bank, mine, main);
    this.held = stakes.reduce((sum, s) => sum.add(s.unit.mul(unitsDown(main, s.sides))), new Decimal(0));
    const of = stakes.length + 1;
    this.hands = stakes.map((stake, index) => ({ stake, result: play(stake, { index, of }) }));
    return { index: stakes.length, of };
  }

  /** As the round starts: the hands land face down, each with its stake on it, `main` base bets plus its side bets. */
  start(main: (result: R) => number) {
    this.net = new Decimal(0);
    this.seats = this.hands.map(({ stake, result }) => ({
      ...this.rules.show(result),
      shown: false,
      stake: stake.unit.mul(unitsDown(main(result), stake.sides)),
      net: null,
    }));
  }

  reveal() {
    for (const seat of this.seats) seat.shown = true;
  }

  /**
   * As the round settles on the felt: each hand's result, before charms. Turns
   * them over too, for a round that ends early (the player folds before the
   * last card) without a showdown.
   */
  showResults() {
    this.reveal();
    this.hands.forEach(({ stake, result }, i) => {
      const seat = this.seats[i];
      if (seat) seat.net = stake.unit.mul(this.rules.net(result));
    });
  }

  /**
   * Pays each blind hand through the charms. Settle them before the player's
   * own hand, so the player's charms are the ones the banner shows. `units`
   * is counted in the player's main bet, `unit`, for the hand's breakdown.
   */
  settle(unit: Decimal): { money: Decimal; units: number; hands: number; lines: BreakdownLine[] } {
    let money = new Decimal(0);
    const lines: BreakdownLine[] = [];
    this.hands.forEach(({ stake, result }, i) => {
      const charms = meta.settleRound(this.rules.report(result, stake.sides), stake.unit, this.rules.net(result));
      const net = this.rules.net(result) + charms.extra;
      const seat = this.seats[i];
      if (seat) seat.net = stake.unit.mul(net);
      money = money.add(stake.unit.mul(net));
      lines.push({ label: `Blind ${i + 1} · ${seat?.label.toLowerCase() ?? 'hand'}`, amount: stake.unit.mul(net).div(unit).toNumber() });
    });
    this.net = money;
    return { money, units: money.div(unit).toNumber(), hands: this.hands.length, lines };
  }

  clear() {
    this.hands = [];
    this.held = new Decimal(0);
    this.seats = [];
    this.net = new Decimal(0);
  }
}
