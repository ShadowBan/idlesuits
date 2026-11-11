import { roundMoney, type AutoSummary } from './auto';
import { Decimal } from './money';

/** What an action's rounds did for the leaderboards: its best round, both ways, and the Tokens it earned. */
export interface RoundScores {
  rounds: number;
  /** The biggest single win, in dollars, and what it was. */
  biggest: { money: string; text: string; game: string } | null;
  /** The best win as a multiple of its bet. */
  bestX: { x: number; text: string; game: string } | null;
  tokens: number;
}

/**
 * The leaderboard view of an action's result, whatever its game. Auto play's
 * summary covers every round it settled (the rounds that come back are only
 * the latest), so it's used where there is one.
 */
export function scoreOf(result: unknown): RoundScores | null {
  if (!result || typeof result !== 'object') return null;
  const r = result as { rounds?: unknown[]; plays?: unknown[]; summary?: AutoSummary | null };
  if ('summary' in r && r.summary !== undefined) {
    const s = r.summary;
    if (!s) return null;
    return {
      rounds: s.rounds,
      biggest: s.biggest ? { ...s.biggest, game: s.game } : null,
      bestX: s.bestX ? { ...s.bestX, game: s.game } : null,
      tokens: s.tokens,
    };
  }
  const rounds = ((r.plays ?? r.rounds ?? []) as Record<string, unknown>[]).filter((x) => x && (x.settled || x.net !== undefined));
  if (!rounds.length) return null;
  let biggest: RoundScores['biggest'] = null;
  let bestX: RoundScores['bestX'] = null;
  let tokens = 0;
  for (const round of rounds) {
    const m = roundMoney(round);
    tokens += m.tokens;
    if (m.money.gt(0) && (!biggest || m.money.gt(new Decimal(biggest.money)))) biggest = { money: m.money.toString(), text: m.text, game: m.game };
    if (m.x > 0 && (!bestX || m.x > bestX.x)) bestX = { x: m.x, text: m.text, game: m.game };
  }
  return { rounds: rounds.length, biggest, bestX, tokens };
}
