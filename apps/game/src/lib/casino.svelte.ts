import { Decimal } from './money';
import { load, saveSoon } from './save';

const STARTING_BANK = 500;

function saved(): Decimal {
  try {
    const value = new Decimal(load('bank', String(STARTING_BANK)));
    // A save left at zero would sit every table at "Busted": start that player afresh.
    return value.gt(0) && value.isFinite() ? value : new Decimal(STARTING_BANK);
  } catch {
    return new Decimal(STARTING_BANK);
  }
}

/**
 * One wallet for the whole casino. Every game draws from and pays into this,
 * so switching tables carries your money with you. Saved in the browser.
 */
export class Bankroll {
  balance = $state(saved());
  /** True once the balance hits zero and the player has to buy back in. */
  broke = $derived(this.balance.lte(0));

  /** Applies a round's result. Returns the new balance. */
  settle(amount: Decimal): Decimal {
    this.balance = this.balance.add(amount);
    this.persist();
    return this.balance;
  }

  canAfford(amount: Decimal): boolean {
    return this.balance.gte(amount);
  }

  buyIn(amount: Decimal = new Decimal(STARTING_BANK)): void {
    this.balance = amount;
    this.persist();
  }

  private persist() {
    saveSoon('bank', () => this.balance.toString());
  }
}

/** The wallet every table in this session shares. */
export const bankroll = new Bankroll();
