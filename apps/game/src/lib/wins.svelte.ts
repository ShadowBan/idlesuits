import { recordWin, WINS_KEPT, type WinRecord } from '@idlesuits/engine';
import { Decimal } from './money';
import { player } from './player.svelte';

export { WINS_KEPT, type WinRecord };

const NONE: WinRecord[] = [];

/**
 * Every game's last wins, newest first: the Stats tab's "Last 50 wins". Part
 * of the player's state. The engine records a win in the games it plays; the
 * table panels record the rest as each round settles in the black, for a
 * guest (a member's rounds at those tables are practice, and aren't kept).
 */
class Wins {
  list(game: string): WinRecord[] {
    return player.shown.wins[game] ?? NONE;
  }

  record(game: string, win: WinRecord) {
    if (player.plays(game) || player.member) return;
    player.local((state) => recordWin(state, game, win));
  }

  /** In bets: what a win came to over its unit. */
  times(win: WinRecord): number {
    try {
      const unit = new Decimal(win.unit);
      return unit.gt(0) ? new Decimal(win.net).div(unit).toNumber() : 0;
    } catch {
      return 0;
    }
  }
}

export const wins = new Wins();
