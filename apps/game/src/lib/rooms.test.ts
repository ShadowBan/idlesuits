import { describe, expect, it } from 'vitest';
import { Decimal } from './money';
import { affordable, formatLimit, opened, room } from './rooms';

describe('rooms', () => {
  it('climbs the chip ladder from the $5 Main Floor', () => {
    expect(room(0).name).toBe('Main Floor');
    expect([0, 1, 2, 3, 4, 5].map((i) => room(i).min.toNumber())).toEqual([5, 25, 100, 500, 1000, 5000]);
    expect(room(0).max.toNumber()).toBe(500);
    expect(room(0).sideMax.toNumber()).toBe(100);
    expect(room(0).opensAt.toNumber()).toBe(0);
    expect(room(1).opensAt.toNumber()).toBe(1250);
  });

  it('names rooms past the last one by number', () => {
    expect(room(6).name).toBe('The Vault');
    expect(room(7).name).toBe('The Vault II');
    expect(room(10).name).toBe('The Vault V');
  });

  it('opens every room a bankroll has reached, and never closes one', () => {
    expect(opened(new Decimal(500), 0)).toBe(0);
    expect(opened(new Decimal(1250), 0)).toBe(1);
    expect(opened(new Decimal(30_000), 0)).toBe(3);
    expect(opened(new Decimal(10), 3)).toBe(3);
  });

  it('steps down to the best room whose minimum the bankroll covers', () => {
    expect(affordable(new Decimal(400), 1, 3)).toBe(2);
    expect(affordable(new Decimal(60), 2, 2)).toBe(1);
    expect(affordable(new Decimal(40), 2, 2)).toBe(0);
    expect(affordable(new Decimal(1), 1, 2)).toBe(0);
    expect(affordable(new Decimal(5000), 1, 2)).toBe(2);
  });

  it('writes limits short enough for the table sign', () => {
    expect(formatLimit(new Decimal(5))).toBe('$5');
    expect(formatLimit(new Decimal(2500))).toBe('$2.5K');
    expect(formatLimit(new Decimal(100_000))).toBe('$100K');
    expect(formatLimit(new Decimal(1e6))).toBe('$1M');
    expect(formatLimit(new Decimal(5e40))).toBe('$50e39');
  });
});
