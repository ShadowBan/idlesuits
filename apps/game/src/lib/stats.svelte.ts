import type { GameStats, LifetimeStats } from '@idlesuits/engine';
import { Decimal } from './money';
import { player } from './player.svelte';

export type { GameStats, LifetimeStats };

/**
 * The player's lifetime record, for the Players Club profile: every round of
 * every game, counted by the engine as it settles. A member's practice rounds
 * don't count.
 */
class Stats {
  get data(): LifetimeStats {
    return player.shown.stats;
  }

  /** Every game added up. */
  get totals() {
    let rounds = 0;
    let wins = 0;
    let wagered = new Decimal(0);
    let net = new Decimal(0);
    let biggest = new Decimal(0);
    let bestX = 0;
    for (const g of Object.values(this.data.games)) {
      rounds += g.rounds;
      wins += g.wins;
      wagered = wagered.add(new Decimal(g.wagered));
      net = net.add(new Decimal(g.net));
      const b = new Decimal(g.biggestWin);
      if (b.gt(biggest)) biggest = b;
      bestX = Math.max(bestX, g.bestX);
    }
    return { rounds, wins, wagered, net, biggest, bestX };
  }
}

export const stats = new Stats();
