import { Decimal } from './money';

const STARTING_BANK = 500;

/**
 * One wallet for the whole casino. Every game draws from and pays into this,
 * so switching tables carries your money with you.
 */
export class Bankroll {
  balance = $state(new Decimal(STARTING_BANK));
  /** True once the balance hits zero and the player has to buy back in. */
  broke = $derived(this.balance.lte(0));

  /** Applies a round's result. Returns the new balance. */
  settle(amount: Decimal): Decimal {
    this.balance = this.balance.add(amount);
    return this.balance;
  }

  canAfford(amount: Decimal): boolean {
    return this.balance.gte(amount);
  }

  buyIn(amount: Decimal = new Decimal(STARTING_BANK)): void {
    this.balance = amount;
  }
}

/** The wallet every table in this session shares. */
export const bankroll = new Bankroll();
