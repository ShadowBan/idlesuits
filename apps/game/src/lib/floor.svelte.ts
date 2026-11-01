import type { Decimal } from './money';
import { affordable, opened, room, type Room } from './rooms';
import { load, saveSoon } from './save';

/**
 * Which room of the casino the player is sitting in, and how far up they've
 * been let in. Every table plays at the current room's limits. Saved in the
 * browser; an opened room stays open even after the bankroll falls.
 */
class Floor {
  current = $state(0);
  /** The highest room opened so far. */
  best = $state(0);
  /** Counts forced moves down a room, so the table's limit sign can flash. */
  moves = $state(0);

  constructor() {
    const saved = load<{ current: number; best: number } | null>('floor', null);
    if (saved && Number.isInteger(saved.best) && saved.best >= 0) {
      this.best = saved.best;
      this.current = Math.min(Math.max(0, saved.current | 0), saved.best);
    }
  }

  get room(): Room {
    return room(this.current);
  }

  /** Opens any rooms this bankroll has earned. */
  reach(bank: Decimal) {
    const best = opened(bank, this.best);
    if (best === this.best) return;
    this.best = best;
    this.persist();
  }

  enter(index: number) {
    if (index < 0 || index > this.best || index === this.current) return;
    this.current = index;
    this.persist();
  }

  /**
   * Walks down to the best room whose minimum the bankroll still covers, as a
   * player short of a table's minimum moves to a cheaper one. True if it moved.
   */
  stepDownFor(bank: Decimal, units: number): boolean {
    const index = affordable(bank, units, this.current);
    if (index === this.current) return false;
    this.current = index;
    this.moves++;
    this.persist();
    return true;
  }

  private persist() {
    saveSoon('floor', () => ({ current: this.current, best: this.best }));
  }
}

export const floor = new Floor();
