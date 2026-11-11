import {
  claimable,
  findConstellation,
  offerFor,
  passClock,
  rollPass,
  seasonBack,
  seasonCharm,
  STAR_DUST,
  STAR_TOKENS,
  TRACK,
  type Action,
  type Constellation,
  type PassState,
  type Reward,
} from '@idlesuits/engine';
import { findCharm } from '@idlesuits/sim';
import { account } from './account.svelte';
import { formatTokens } from '../components/charms/format';
import { player } from './player.svelte';

/** The card backs Lucky Stars gives, as the cards draw them: a colour and the glyph in the medallion. */
export const BACKS: Record<string, { name: string; color: string; glyph: string }> = {
  midnight: { name: 'Midnight', color: '#1f2f6b', glyph: '★' },
  aurora: { name: 'Aurora', color: '#0f6b5c', glyph: '✦' },
  nebula: { name: 'Nebula', color: '#5a2a86', glyph: '✧' },
  eclipse: { name: 'Eclipse', color: '#2b2420', glyph: '☾' },
};

/** A reward in a few words. */
export function rewardText(r: Reward, season: number): string {
  switch (r.kind) {
    case 'tokens':
      return `◉ ${formatTokens(r.n)} Tokens`;
    case 'pulls':
      return `${r.n} free ${r.n === 1 ? 'pull' : 'pulls'}`;
    case 'boost':
      return `Tokens ×2 for ${r.minutes >= 60 ? `${r.minutes / 60} ${r.minutes === 60 ? 'hour' : 'hours'}` : `${r.minutes} min`}`;
    case 'charm':
      return findCharm(seasonCharm(season, r.slot))?.name ?? 'A Starbound charm';
    case 'back':
      return `${BACKS[seasonBack(season, r.slot)]?.name ?? 'A'} card back`;
  }
}

/** A stretch of time ahead, roughly: "3d 4h", "5h 12m", "8m". */
export function timeLeft(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

/**
 * Lucky Stars, as the player sees it: this week's constellations (rolled to
 * the week it is, so a new week shows at once, even before a round is
 * played), the season's track, and the actions that pick and claim.
 */
class Stars {
  /** Ticks every half minute: the week, the countdowns and the boost follow it. */
  now = $state(Date.now());

  constructor() {
    if (typeof window === 'undefined') return;
    setInterval(() => (this.now = Date.now()), 30_000);
  }

  get pass(): PassState {
    return rollPass(player.shown, this.now).pass;
  }

  get clock() {
    return passClock(this.now);
  }

  /** The three constellations on offer this week. */
  get offer(): Constellation[] {
    return offerFor(this.pass.week).map((id) => findConstellation(id)!);
  }

  get chosen(): Constellation | null {
    const id = this.pass.chosen;
    return id ? (findConstellation(id) ?? null) : null;
  }

  /** A constellation's count toward each of its stars this week. */
  counts(id: string): number[] {
    return this.pass.progress[id] ?? [0, 0, 0, 0, 0, 0];
  }

  get claimable(): number[] {
    return claimable(this.pass);
  }

  /** Something here wants the player: a constellation to pick, or a tier to claim. */
  get waiting(): number {
    return (this.pass.chosen ? 0 : 1) + this.claimable.length;
  }

  /** The boost's minutes left, if one is running. */
  get boostLeft(): number {
    return Math.max(0, this.pass.boostUntil - this.now);
  }

  /** The next tier of the track, if any are left. */
  get nextTier(): number {
    return TRACK.findIndex((t) => this.pass.dust < t.dust);
  }

  choose(id: string) {
    this.now = Date.now();
    return player.act({ type: 'pass.choose', id } as Action);
  }

  claim(tiers?: number[]) {
    this.now = Date.now();
    return player.act({ type: 'pass.claim', tiers } as Action);
  }
}

export const stars = new Stars();

/**
 * Tells the player when a star lights, wherever they are: watches the chosen
 * constellation's lit stars, as shown.
 */
let seen: { week: number; chosen: string | null; lit: number[] } | null = null;
export function watchStars() {
  const p = player.shown.pass;
  const now = { week: p.week, chosen: p.chosen, lit: p.lit };
  const before = seen;
  seen = now;
  if (!before || !player.ready || before.week !== now.week || before.chosen !== now.chosen) return;
  const fresh = now.lit.filter((i) => !before.lit.includes(i));
  if (!fresh.length) return;
  const c = findConstellation(now.chosen ?? '');
  if (!c) return;
  const tokens = fresh.reduce((sum, i) => sum + STAR_TOKENS[i]!, 0);
  const dust = fresh.reduce((sum, i) => sum + STAR_DUST[i]!, 0);
  const what = fresh.length === 1 ? `“${c.missions[fresh[0]!]!.text}”` : `${fresh.length} stars`;
  const full = now.lit.length === c.missions.length ? ` ${c.name} is complete!` : '';
  account.notice = `★ Star lit in ${c.name}: ${what}. +◉ ${formatTokens(tokens)} Tokens, +${dust} stardust.${full}`;
}
