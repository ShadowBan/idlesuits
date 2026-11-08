import { Decimal } from './money';
import { load, saveSoon } from './save';

/** Wins kept per game. */
export const WINS_KEPT = 50;

/** A win, as the Stats tab lists it, and whatever its game needs to draw it again. */
export interface WinRecord {
  /** The round's number at its table, for the list. */
  round: number;
  text: string;
  sub?: string;
  /** What it won, net, and the bet it was counted in, as strings so any size survives saving. */
  net: string;
  unit: string;
  /** When it was won (Date.now()), so rounds that share a number after a buy-back stay apart. */
  at: number;
  /** The game's own record of the round, to replay it exactly. Absent where a game can't replay. */
  replay?: unknown;
}

/**
 * Every game's last wins, newest first: the Stats tab's "Last 50 wins". The
 * table panels record a win as each round settles in the black, so every game
 * gets the list; a game that can draw a round again gives it its replay data.
 * Kept between visits, per game.
 */
class Wins {
  #lists = $state<Record<string, WinRecord[]>>({});
  /** Lists read from the save, outside the reactive state, so reading one never changes state. */
  #saved = new Map<string, WinRecord[]>();

  list(game: string): WinRecord[] {
    const live = this.#lists[game];
    if (live) return live;
    let saved = this.#saved.get(game);
    if (!saved) {
      const raw = load<WinRecord[]>(`wins.${game}`, []);
      saved = Array.isArray(raw) ? raw.filter((w) => w && typeof w.net === 'string' && typeof w.text === 'string').slice(0, WINS_KEPT) : [];
      this.#saved.set(game, saved);
    }
    return saved;
  }

  record(game: string, win: WinRecord) {
    this.#lists[game] = [win, ...this.list(game)].slice(0, WINS_KEPT);
    saveSoon(`wins.${game}`, () => $state.snapshot(this.#lists[game]));
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
