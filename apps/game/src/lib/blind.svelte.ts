import type { BlindDeal, BlindSettled } from '@idlesuits/engine';
import type { Card } from '@idlesuits/sim';
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

/** A face-down card, before the engine says what it is. */
const FACE_DOWN: Card = { uid: 'down', suit: 'S', rank: 2, source: 'player' };

/**
 * A table's blind hands for the round on the felt, as the engine dealt them:
 * from the seats before the player's, shown face down with their stakes,
 * turned over with the dealer, each settled as a hand of its own.
 *
 * The player sets how each seat bets between hands (`bets`); once dealt, a
 * blind hand plays all in, with no decisions.
 */
export class BlindHands {
  seats = $state<BlindSeat[]>([]);
  /** What they won or lost together this round, in dollars, once settled. */
  net = $state(new Decimal(0));
  /** How each seat bets, in seat order. Seats past what the charms give wait, unused. */
  bets = $state<BlindBets[]>([]);
  /** The settled hands' nets, held until the dealer shows. */
  private nets: Decimal[] = [];

  constructor(private readonly key: string) {
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

  /** How the seats bet, as the engine is asked to deal them. */
  request(): { mode: BlindMode; bet: string; sides: Record<string, string> }[] {
    return Array.from({ length: blindSeats() }, (_, i) => {
      const s = this.seat(i);
      return { mode: s.mode, bet: s.bet.toString(), sides: Object.fromEntries(Object.entries(s.sides).map(([id, v]) => [id, v.toString()])) };
    });
  }

  /** As the round starts: the hands the engine dealt land face down, each with its stake on it. */
  fromDeal(deals: readonly BlindDeal[], holeCards: number) {
    this.net = new Decimal(0);
    this.nets = [];
    this.seats = deals.map((d) => ({
      cards: Array.from({ length: holeCards }, () => FACE_DOWN),
      label: '',
      shown: false,
      stake: new Decimal(d.unit).mul(d.down),
      net: null,
    }));
  }

  /**
   * The round is settled: each hand's cards and what it made go under its
   * seat, still face down until the dealer shows. Returns what they came to,
   * in dollars and in units of the player's main bet `unit`, with a line each.
   */
  fromSettled(settled: readonly BlindSettled[], unit: Decimal): { money: Decimal; units: number; hands: number; lines: BreakdownLine[] } {
    let money = new Decimal(0);
    const lines: BreakdownLine[] = [];
    this.nets = settled.map((b, i) => {
      const show = b.show as { cards: Card[]; label: string };
      const seat = this.seats[i];
      if (seat) {
        seat.cards = show.cards;
        seat.label = show.label;
      }
      const m = new Decimal(b.money);
      money = money.add(m);
      lines.push({ label: `Blind ${i + 1} · ${show.label.toLowerCase() || 'hand'}`, amount: m.div(unit).toNumber() });
      return m;
    });
    return { money, units: money.div(unit).toNumber(), hands: settled.length, lines };
  }

  reveal() {
    for (const seat of this.seats) seat.shown = true;
  }

  /** As the round settles on the felt: each hand turned over, with what it won or lost. */
  showResults() {
    this.reveal();
    this.nets.forEach((m, i) => {
      const seat = this.seats[i];
      if (seat) seat.net = m;
    });
    this.net = this.nets.reduce((sum, m) => sum.add(m), new Decimal(0));
  }

  clear() {
    this.seats = [];
    this.nets = [];
    this.net = new Decimal(0);
  }
}
