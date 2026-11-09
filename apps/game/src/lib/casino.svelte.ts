import { moveBank, MIN_BET as ENGINE_MIN_BET } from '@idlesuits/engine';
import { floor } from './floor.svelte';
import { Decimal } from './money';
import { player } from './player.svelte';
import { route } from './route.svelte';
import { load, saveSoon } from './save';
import { tuning } from './tuning.svelte';

/** The Main Floor's minimum: below this a player can't sit at any table. */
export const MIN_BET = ENGINE_MIN_BET;

/**
 * A member's practice bankroll: their own money for the games the server
 * doesn't decide yet. It never touches their real bank, Tokens, charms,
 * stats or wins, and stays in this browser.
 */
class Practice {
  balance = $state(this.saved());

  private saved(): Decimal {
    try {
      const d = new Decimal(load<string>('practice', String(tuning.values.buyIn)));
      return d.isFinite() && d.gte(0) ? d : new Decimal(tuning.values.buyIn);
    } catch {
      return new Decimal(tuning.values.buyIn);
    }
  }

  set(amount: Decimal) {
    this.balance = amount.max(0);
    saveSoon('practice', () => this.balance.toString());
  }
}

const practice = new Practice();

/**
 * The wallet the table in front of the player plays from. Their bank, as the
 * engine keeps it (on the server for a member), except for a member at a
 * table the server doesn't decide yet: that plays from the practice bankroll.
 */
export class Bankroll {
  /** The table here plays from the practice bankroll. */
  get practice(): boolean {
    return player.practicing(route.current);
  }

  get balance(): Decimal {
    return this.practice ? practice.balance : player.bank;
  }

  /**
   * Too little left for the cheapest table's minimum, and the player has to
   * buy back in. Not just zero: Pai Gow's commission and charm payouts leave cents.
   */
  get broke(): boolean {
    return this.balance.lt(MIN_BET);
  }

  /**
   * Applies a round's money, for a game settled in the browser. Returns the
   * new balance. A member's real bank only moves on the server.
   */
  settle(amount: Decimal): Decimal {
    if (this.practice) practice.set(practice.balance.add(amount));
    else player.local((state) => moveBank(state, amount, tuning.engine));
    return this.balance;
  }

  canAfford(amount: Decimal): boolean {
    return this.balance.gte(amount);
  }

  /** A fresh stake, back on the Main Floor; rooms already opened stay open. */
  buyIn(): void {
    if (this.practice) {
      practice.set(new Decimal(tuning.values.buyIn));
      floor.enter(0);
      return;
    }
    void player.act({ type: 'buyIn' });
  }

  /** Sets the bank outright, for the pit boss. */
  set(amount: Decimal) {
    if (this.practice) practice.set(amount);
    else void player.act({ type: 'admin.bank', set: amount.max(0).toString() });
  }
}

/** The wallet every table in this session shares. */
export const bankroll = new Bankroll();
