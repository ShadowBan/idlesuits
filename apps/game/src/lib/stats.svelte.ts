import type { RoundReport } from '@idlesuits/sim';
import { Decimal } from './money';
import { load, saveSoon } from './save';

/** One game's lifetime record. Money as strings, so any size survives saving. */
export interface GameStats {
  rounds: number;
  /** Everything staked, the side bets included. */
  wagered: string;
  /** Won less lost, charms' cash included. */
  net: string;
  /** The biggest single round, in dollars, and in multiples of its bet. */
  biggestWin: string;
  bestX: number;
  wins: number;
  lastPlayed: number;
}

export interface LifetimeStats {
  /** When the first round was played here. */
  since: number;
  /** The most the bank has ever held. */
  peakBank: string;
  games: Record<string, GameStats>;
}

function emptyGame(): GameStats {
  return { rounds: 0, wagered: '0', net: '0', biggestWin: '0', bestX: 0, wins: 0, lastPlayed: 0 };
}

function savedStats(): LifetimeStats {
  const saved = load<LifetimeStats | null>('stats', null);
  if (!saved || typeof saved !== 'object' || !saved.games) return { since: 0, peakBank: '0', games: {} };
  return saved;
}

/**
 * The player's lifetime record, for the Players Club profile: every round of
 * every game, counted as it settles (through `meta.settleRound`, the one call
 * every game makes). Saved with the rest of the game, so it follows the
 * player's account.
 */
class Stats {
  data = $state<LifetimeStats>(savedStats());

  /** A round has settled: `net` is what it won or lost in bets of `unit`; `bank` the bankroll after it. */
  round(report: RoundReport, unit: Decimal, net: number, bank: Decimal) {
    const now = Date.now();
    const game = this.data.games[report.game] ?? emptyGame();
    const staked = report.bets.reduce((sum, b) => sum + Math.max(0, b.stake), 0);
    const money = unit.mul(net);
    game.rounds++;
    game.wagered = new Decimal(game.wagered).add(unit.mul(staked)).toString();
    game.net = new Decimal(game.net).add(money).toString();
    if (net > 0) {
      game.wins++;
      if (money.gt(new Decimal(game.biggestWin))) game.biggestWin = money.toString();
      game.bestX = Math.max(game.bestX, net);
    }
    game.lastPlayed = now;
    this.data.games[report.game] = game;
    if (!this.data.since) this.data.since = now;
    if (bank.gt(new Decimal(this.data.peakBank))) this.data.peakBank = bank.toString();
    saveSoon('stats', () => $state.snapshot(this.data));
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
