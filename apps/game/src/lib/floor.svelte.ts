import type { Decimal } from './money';
import { player } from './player.svelte';
import { affordable, room, type Room } from './rooms';

/**
 * Which room of the casino the player is sitting in, and how far up they've
 * been let in. Every table plays at the current room's limits. Part of the
 * player's state: the engine opens rooms as the bank grows, and an opened room
 * stays open even after the bankroll falls.
 */
class Floor {
  /** Counts forced moves down a room, so the table's limit sign can flash. */
  moves = $state(0);

  get current(): number {
    return player.shown.floor.current;
  }

  /** The highest room opened so far. */
  get best(): number {
    return player.shown.floor.best;
  }

  get room(): Room {
    return room(this.current);
  }

  /** Opens every room up to `index`, for the pit boss. */
  openTo(index: number) {
    void player.act({ type: 'admin.rooms', best: Math.max(0, Math.floor(index)) });
  }

  enter(index: number) {
    if (index < 0 || index > this.best || index === this.current) return;
    void player.act({ type: 'room', index });
  }

  /**
   * Walks down to the best room whose minimum the bankroll still covers, as a
   * player short of a table's minimum moves to a cheaper one. True if it moved.
   */
  stepDownFor(bank: Decimal, units: number): boolean {
    const index = affordable(bank, units, this.current);
    if (index === this.current) return false;
    this.enter(index);
    this.moves++;
    return true;
  }
}

export const floor = new Floor();
