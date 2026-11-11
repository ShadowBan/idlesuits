import { jackpotState, JACKPOT_SEEDS, MAJOR_CAP, PER_SECOND, type JackpotHit } from '@idlesuits/engine';
import type { JackpotMeters } from '@idlesuits/sim';
import { api } from './api';
import { player } from './player.svelte';
import { tuning } from './tuning.svelte';

export { JACKPOT_SEEDS, MAJOR_CAP, type JackpotHit };

/** The meters creep up on screen at most this long past their last update, as the server counts them. */
const MAX_IDLE_SECONDS = 60;
/** A keep-alive on the live link, while the page is shown. */
const PING_MS = 45_000;

/** A hit on the shared jackpot, as the slot floor lists it: the winner's card name with it. */
export interface SharedHit extends JackpotHit {
  name?: string;
}

/** The shared jackpot as the server last told it. */
interface SharedView {
  meters: JackpotMeters;
  perSecond: JackpotMeters;
  at: number;
  history: SharedHit[];
}

/**
 * The progressive jackpots, linked across every slot machine. Members play
 * one shared Grand and Major, fed by every member's rounds and won by one of
 * them: the server keeps them, and a live link (a WebSocket, open while the
 * page is shown) brings the meters and every hit to each open casino as they
 * happen. A guest's spins are decided in their own browser, so a guest plays
 * a private jackpot of their own, and sees the shared one in the lobby.
 *
 * The meters are multiples of the bet, so they mean the same in every room.
 * The Major is also a must-hit-by jackpot: it pays on the first spin after it
 * passes a hidden point, which only the server knows.
 */
class Jackpots {
  /** Ticks every second, so the meters creep up on screen between updates. */
  private now = $state(Date.now());
  /** The shared jackpot, as the server last told it. */
  shared = $state.raw<SharedView | null>(null);
  private socket: WebSocket | null = null;
  private retry = 0;
  private ping: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window === 'undefined') return;
    setInterval(() => (this.now = Date.now()), 1000);
    // The live link is open while the page is shown, and closed while it's hidden: a hidden casino costs nothing.
    document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? this.connect() : this.disconnect()));
    this.connect();
  }

  /** Whether this player plays the shared jackpot: a member does; a guest plays their own. */
  get linked(): boolean {
    return player.member;
  }

  private connect() {
    if (this.socket || typeof WebSocket === 'undefined' || document.visibilityState !== 'visible') return;
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/jackpot/live`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      return;
    }
    this.socket = ws;
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data === 'pong') return;
      try {
        const msg = JSON.parse(e.data) as SharedView & { type?: string };
        if (msg.type === 'jackpot') this.shared = { meters: msg.meters, perSecond: msg.perSecond, at: Date.now(), history: msg.history ?? [] };
        this.retry = 0;
      } catch {
        // Not for us.
      }
    };
    ws.onclose = () => {
      if (this.socket === ws) this.socket = null;
      if (this.ping) clearInterval(this.ping);
      this.ping = null;
      // Reconnect while shown, backing off: no server here (a static build) settles into a slow retry.
      if (document.visibilityState === 'visible') setTimeout(() => this.connect(), Math.min(60_000, 2_000 * 2 ** this.retry++));
    };
    ws.onopen = () => {
      this.ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
    };
  }

  private disconnect() {
    const ws = this.socket;
    this.socket = null;
    if (this.ping) clearInterval(this.ping);
    this.ping = null;
    try {
      ws?.close(1000, 'hidden');
    } catch {
      // Already closed.
    }
  }

  /** The shared meter now: as last told, plus the seconds since (a minute at most). */
  private sharedMeter(tier: 'major' | 'grand'): number {
    const s = this.shared;
    if (!s) return JACKPOT_SEEDS[tier];
    const seconds = Math.min(MAX_IDLE_SECONDS, Math.max(0, (this.now - s.at) / 1000));
    const v = s.meters[tier] + s.perSecond[tier] * seconds;
    return tier === 'major' ? Math.min(MAJOR_CAP, v) : v;
  }

  /** A guest's own meter now: as last counted, plus the link's seconds since (a minute at most). */
  private ownMeter(tier: 'major' | 'grand'): number {
    const j = jackpotState(player.shown);
    const seconds = j.at ? Math.min(MAX_IDLE_SECONDS, Math.max(0, (this.now - j.at) / 1000)) : 0;
    const v = j[tier] + PER_SECOND[tier] * seconds * tuning.values.jackpotGrowth;
    return tier === 'major' ? Math.min(MAJOR_CAP, v) : v;
  }

  /** The meters this player's spins play: the shared ones for a member, their own for a guest. */
  get major(): number {
    return this.linked ? this.sharedMeter('major') : this.ownMeter('major');
  }

  get grand(): number {
    return this.linked ? this.sharedMeter('grand') : this.ownMeter('grand');
  }

  get meters(): JackpotMeters {
    return { major: this.major, grand: this.grand };
  }

  /** The shared meters, for anyone: the lobby shows them to guests as a reason to join. */
  get sharedMeters(): JackpotMeters {
    return { major: this.sharedMeter('major'), grand: this.sharedMeter('grand') };
  }

  /** The latest hits: everyone's on the shared jackpot (with names), or a guest's own. */
  get history(): SharedHit[] {
    return this.linked ? (this.shared?.history ?? []) : jackpotState(player.shown).history;
  }

  /** Pit boss: set a meter (the shared one, for a member). */
  set(tier: 'major' | 'grand', value: number) {
    if (this.linked) void this.admin({ tier, value });
    else void player.act({ type: 'admin.jackpot', tier, value });
  }

  /** Pit boss: the Major hits on the next spin. */
  makeMajorDue() {
    if (this.linked) void this.admin({ due: true });
    else void player.act({ type: 'admin.jackpot', due: true });
  }

  private async admin(body: { tier?: 'major' | 'grand'; value?: number; due?: boolean }) {
    try {
      const view = await api<SharedView>('/admin/jackpot', { method: 'PUT', body });
      this.shared = { ...view, at: Date.now() };
    } catch {
      // Not the pit boss, or offline: nothing changes.
    }
  }
}

export const jackpots = new Jackpots();

/** The pit boss's slot switches, for testing: never saved, honoured only for the pit boss. */
export const slotTest = $state({
  forceFeature: false,
  /** Fills every pot on the machine of the next spin. */
  fillPots: false,
  /** Every slot charm fires whenever it can, until switched off: nudges, wild reels, pots filled, the bonus again. */
  allCharms: false,
});
