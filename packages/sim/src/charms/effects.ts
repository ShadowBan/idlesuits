import { Rng } from '../rng';
import { CHARM_SETS, findCharm } from './catalog';
import { MAX_LEVEL } from './machine';
import type { CharmOutcome, CharmRunState, CharmTrigger, Effect, Equipped, RoundReport, Scale } from './types';

export const FRESH_RUN: CharmRunState = { winStreak: 0, lossStreak: 0, lastOutcome: null };

/** An effect's value at a level: level 1 is the minimum, the top level the maximum. */
export function valueAt(scale: Scale, level: number): number {
  const t = (Math.min(Math.max(level, 1), MAX_LEVEL) - 1) / (MAX_LEVEL - 1);
  return scale.min + (scale.max - scale.min) * t;
}

/** Each winning bet earns its pay odds in Tokens, whatever its stake. */
export function baseTokens(report: RoundReport): number {
  let tokens = 0;
  for (const bet of report.bets) if (bet.net > 0 && bet.stake > 0) tokens += bet.net / bet.stake;
  return tokens;
}

function isFlush(report: RoundReport): boolean {
  if (report.flush) return true;
  return report.tier === 5 || report.tier === 8 || report.tier === 9;
}

/**
 * Applies the equipped charms (and any complete set) to a settled hand.
 * Pure and seeded: the same report, loadout and streaks always give the same
 * result, so a hand with charms replays exactly.
 */
export function applyCharms(report: RoundReport, equipped: readonly Equipped[], run: CharmRunState): CharmOutcome {
  const base = baseTokens(report);
  const main = report.bets.filter((b) => b.kind === 'main');
  const mainStake = main.reduce((sum, b) => sum + b.stake, 0);
  const mainLost = -Math.min(0, main.reduce((sum, b) => sum + b.net, 0));
  const wagered = report.bets.reduce((sum, b) => sum + b.stake, 0);
  const sideMissed = report.bets.filter((b) => b.kind === 'side' && b.net < 0).reduce((sum, b) => sum + b.stake, 0);
  const wins = report.bets.filter((b) => b.net > 0 && b.stake > 0);
  const winnings = wins.reduce((sum, b) => sum + b.net, 0);
  const won = report.outcome === 'win';
  const lost = report.outcome === 'lose' || report.outcome === 'fold';

  // Every source of effects: each equipped charm, then each set with all three members on.
  const sources: { id: string; name: string; level: number; effects: Effect[] }[] = [];
  for (const e of equipped) {
    const def = findCharm(e.id);
    if (def) sources.push({ id: def.id, name: def.name, level: e.level, effects: def.effects });
  }
  for (const set of CHARM_SETS) {
    const levels = set.members.map((m) => equipped.find((e) => e.id === m)?.level ?? 0);
    if (levels.every((l) => l > 0)) {
      sources.push({ id: `set:${set.id}`, name: set.name, level: Math.min(...levels), effects: set.bonus });
    }
  }

  let cash = 0;
  let extraTokens = 0;
  const triggers: CharmTrigger[] = [];
  // Token doubling is decided per source but applied once everything else is in.
  const doublers: { id: string; name: string }[] = [];

  for (const source of sources) {
    const rng = new Rng(report.seed.run, report.seed.round, 'charm', source.id);
    let c = 0;
    let t = 0;
    for (const effect of source.effects) {
      const v = valueAt(effect.v, source.level);
      switch (effect.kind) {
        case 'tokenPct':
          t += base * v;
          break;
        case 'tokenPerHand':
          t += v;
          break;
        case 'tokenOnLoss':
          if (lost) t += v;
          break;
        case 'longshotTokens':
          for (const bet of wins) if (bet.net / bet.stake >= effect.minOdds) t += (bet.net / bet.stake) * v;
          break;
        case 'tokenDouble':
          if (base > 0 && rng.next() < v) doublers.push(source);
          break;
        case 'comp':
          c += wagered * v;
          break;
        case 'sideRefund':
          c += sideMissed * v;
          break;
        case 'pushPay':
          if (report.outcome === 'push') c += mainStake * v;
          break;
        case 'tierBonus':
          if (report.tier !== undefined && report.tier >= effect.minTier && report.outcome !== 'fold') c += v;
          break;
        case 'flushBonus':
          if (isFlush(report) && report.outcome !== 'fold') c += v;
          break;
        case 'comeback':
          if (won && (run.lastOutcome === 'lose' || run.lastOutcome === 'fold')) c += v;
          break;
        case 'streak':
          if (won) c += v * Math.min(run.winStreak, 5);
          break;
        case 'lossShield':
          if (lost && mainLost > 0 && rng.next() < v) c += mainLost * effect.refund;
          break;
        case 'losingStreakShield':
          if (lost && mainLost > 0 && run.lossStreak >= 3) c += mainLost * v;
          break;
        case 'blackjackBonus':
          if (report.blackjack) c += v;
          break;
        case 'bigHit':
          for (const bet of wins) if (bet.net / bet.stake >= effect.minOdds) c += bet.net * v;
          break;
        case 'doubleWin':
          if (winnings > 0 && rng.next() < v) c += winnings;
          break;
      }
    }
    cash += c;
    extraTokens += t;
    if (c > 0 || t > 0) triggers.push({ source: source.id, name: source.name, cash: c, tokens: t });
  }

  let tokens = base + extraTokens;
  for (const d of doublers) {
    triggers.push({ source: d.id, name: d.name, cash: 0, tokens });
    tokens *= 2;
  }

  const state: CharmRunState = {
    winStreak: won ? run.winStreak + 1 : report.outcome === 'push' ? run.winStreak : 0,
    lossStreak: lost ? (run.lossStreak >= 3 && mainLost > 0 && hasStreakShield(sources) ? 0 : run.lossStreak + 1) : won ? 0 : run.lossStreak,
    lastOutcome: report.outcome,
  };

  return { cash, tokens, baseTokens: base, triggers, state };
}

/** The streak shield is spent once it fires: the next three losses build it again. */
function hasStreakShield(sources: { effects: Effect[] }[]): boolean {
  return sources.some((s) => s.effects.some((e) => e.kind === 'losingStreakShield'));
}

const pct = (v: number) => `${+(v * 100).toFixed(v < 0.01 ? 2 : v < 0.1 ? 1 : 0)}%`;
const units = (v: number) => `${+(v * 100).toFixed(v < 0.01 ? 2 : 1)}% of a bet`;
const num = (v: number) => `${+v.toFixed(2)}`;
const TIER_NAMES: Record<number, string> = { 1: 'A pair', 2: 'Two pair', 3: 'Three of a kind', 4: 'A straight', 5: 'A flush' };

/** What an effect does at a level, in a line a player can read. */
export function describeEffect(effect: Effect, level: number): string {
  const v = valueAt(effect.v, level);
  switch (effect.kind) {
    case 'tokenPct':
      return `+${pct(v)} Tokens from wins`;
    case 'tokenPerHand':
      return `+${num(v)} Tokens every hand`;
    case 'tokenOnLoss':
      return `+${num(v)} Tokens on a losing hand`;
    case 'longshotTokens':
      return `Wins at ${effect.minOdds}:1 or longer earn +${pct(v)} Tokens`;
    case 'tokenDouble':
      return `${pct(v)} chance a hand’s Tokens double`;
    case 'comp':
      return `${pct(v)} of everything you bet comes back`;
    case 'sideRefund':
      return `Side bets that miss refund ${pct(v)}`;
    case 'pushPay':
      return `A push pays ${pct(v)} of your bet`;
    case 'tierBonus':
      return `${TIER_NAMES[effect.minTier] ?? 'A big hand'} or better pays ${units(v)}`;
    case 'flushBonus':
      return `A flush or better pays ${units(v)}`;
    case 'comeback':
      return `A win right after a loss pays ${units(v)}`;
    case 'streak':
      return `Each win in a row adds ${units(v)}, up to five`;
    case 'lossShield':
      return `${pct(v)} chance a loss refunds ${effect.refund >= 1 ? 'in full' : pct(effect.refund)}`;
    case 'losingStreakShield':
      return `After three losses in a row, the next loss refunds ${pct(v)}`;
    case 'blackjackBonus':
      return `A blackjack pays ${units(v)} more`;
    case 'bigHit':
      return effect.minOdds > 0 ? `Wins at ${effect.minOdds}:1 or longer pay +${pct(v)}` : `Every win pays +${pct(v)}`;
    case 'doubleWin':
      return `${pct(v)} chance a win pays double`;
  }
}
