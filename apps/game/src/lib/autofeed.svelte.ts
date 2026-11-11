import { autoSession, formatMoney, type Action, type ActOutcome, type AutoReply, type AutoSession, type AutoSummary } from '@idlesuits/engine';
import { account } from './account.svelte';
import { autoplay } from './autoplay.svelte';
import { findGame } from './games';
import { Decimal } from './money';
import { player } from './player.svelte';

/** The least time between check-ins while the table is shown: about a minute's play comes back each time. */
const MIN_GAP_MS = 30_000;

type Landed = (out: Extract<ActOutcome, { ok: true }>) => void;

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Until the page is shown again: a hidden tab asks the server nothing; the rounds wait for it there. */
function visible(): Promise<void> {
  if (typeof document === 'undefined' || document.visibilityState === 'visible') return Promise.resolve();
  return new Promise((resolve) => {
    const on = () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', on);
      resolve();
    };
    document.addEventListener('visibilitychange', on);
  });
}

/** What a stretch of play away from the screen came to, in a sentence. */
export function awayText(s: AutoSummary): string {
  const name = findGame(s.game)?.name ?? s.game;
  const net = new Decimal(s.net);
  const big = s.biggest ? ` Biggest win ${formatMoney(new Decimal(s.biggest.money))} (${s.biggest.text}).` : '';
  return `While you were away: ${s.rounds.toLocaleString('en-US')} rounds of ${name} on auto play, ${formatMoney(net, true)}.${big}`;
}

/**
 * Auto play as the engine runs it (on the server, for a member): on the
 * engine's clock, so it carries on while the table isn't shown, or the browser
 * is closed. A table showing it checks in about once a minute for the rounds
 * that came due, and shows them; a hidden tab doesn't check in at all.
 */
class AutoFeed {
  private lastSync = 0;
  /** Rounds settled out of sight (a hidden tab, a long time away), waiting to be told about. */
  private away: AutoSummary | null = null;

  get session(): AutoSession | null {
    return autoSession(player.shown);
  }

  /** Auto play is running at this game. */
  isOn(game: string): boolean {
    const s = this.session;
    return !!s?.on && s.game === game;
  }

  /** The stop rules and round limit the player set, as the engine takes them. */
  private rules() {
    const s = autoplay.settings;
    return {
      stop: { winX: s.stopOnWin ? s.stopWinX : undefined, below: s.stopBelow ? s.stopBelowAmount : undefined, above: s.stopAbove ? s.stopAboveAmount : undefined },
      limit: s.stopAfter ? Math.max(1, s.stopRounds - autoplay.rounds) : undefined,
    };
  }

  /**
   * The next stretch of auto play at `game`: starts it (with `action`, the
   * game's batch, and the table's `speed`) if it isn't running there, or
   * checks in for the rounds due, no sooner than MIN_GAP_MS after the last and
   * only while the page is shown. `landed` runs as the rounds land, as for any
   * action, so they can be held back until shown.
   */
  async next(game: string, action: Record<string, unknown>, speed: number, landed: Landed): Promise<ActOutcome> {
    if (!this.isOn(game)) {
      this.lastSync = Date.now();
      const { stop, limit } = this.rules();
      const out = await player.act({ type: 'auto.start', game, action, stop, limit, speed } as Action, landed);
      return this.after(out, true);
    }
    await visible();
    const gap = MIN_GAP_MS - (Date.now() - this.lastSync);
    if (gap > 0) await wait(gap);
    await visible();
    this.lastSync = Date.now();
    const out = await player.act({ type: 'auto.sync' } as Action, landed);
    return this.after(out, false);
  }

  /** After a check-in: rounds settled beyond what comes back to show are told about; a stop says why. */
  private after(out: ActOutcome, started: boolean): ActOutcome {
    if (!out.ok) return out;
    const reply = out.result as unknown as AutoReply & { rounds?: unknown[]; plays?: unknown[] };
    const shown = (reply.plays ?? reply.rounds ?? []).length;
    const s = reply.summary;
    if (s && s.rounds > shown + 2 && !started) this.tell(s);
    if (reply.auto && !reply.auto.on && reply.auto.reason) {
      autoplay.reason = `auto play stopped: ${reply.auto.reason}`;
      autoplay.stops++;
    }
    return out;
  }

  private tell(s: AutoSummary) {
    const a = this.away;
    this.away = a ? { ...s, rounds: a.rounds + s.rounds, net: new Decimal(a.net).add(new Decimal(s.net)).toString(), from: a.from } : s;
    account.notice = awayText(this.away);
    setTimeout(() => (this.away = null), 1_000);
  }

  /** Stops auto play. Rounds that came due but weren't settled aren't played. */
  stop() {
    if (this.session?.on) void player.act({ type: 'auto.stop' } as Action);
  }

  /**
   * Back at the casino (the page opened, or shown again) with auto play
   * running: everything due settles now, and what it came to is told.
   */
  async catchUp() {
    for (let i = 0; i < 100 && this.session?.on; i++) {
      this.lastSync = Date.now();
      const out = await player.act({ type: 'auto.sync' } as Action);
      if (!out.ok) return;
      const reply = out.result as unknown as AutoReply;
      if (reply.summary && reply.summary.rounds > 0) this.tell(reply.summary);
      if (!reply.more) return;
    }
  }
}

export const autoFeed = new AutoFeed();

/** The table's deal speed as auto play's pace multiplier. */
export const SPEED: Record<string, number> = { smart: 1, '1x': 1, '2x': 2, '5x': 5 };

/**
 * A batch of rounds: under auto play, the next stretch from the engine's own
 * auto play (the action's count and stop rules are the session's); otherwise
 * the action as asked.
 */
export function playOrAuto(auto: boolean, game: string, action: Record<string, unknown>, speed: number, landed: Landed): Promise<ActOutcome> {
  if (!auto) return player.act(action as Action, landed);
  const { rounds: _rounds, stop: _stop, test: _test, ...rest } = action;
  return autoFeed.next(game, rest, speed, landed);
}
