import { JACKPOT_SEEDS, MAJOR_CAP, PER_HAND, PER_SECOND, type JackpotClaim } from '@idlesuits/engine';
import { Rng, type JackpotMeters } from '@idlesuits/sim';
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import { newSeedKey, seedFn } from './seeds';

/** The link only grows while someone is playing: no more than this many seconds count between rounds. */
const MAX_IDLE_SECONDS = 60;
/** How long the Major is held for the player told it's due: their next spin wins it, or it goes to the next player to ask. */
const HOLD_MS = 60_000;
/** Live updates go out at most this often, unless someone hits. */
const BROADCAST_MS = 3_000;
/** Hits kept for the slot floor's list. */
const HISTORY = 12;

/** A hit on the shared jackpot, for the slot floor's list. */
export interface SharedHit extends JackpotClaim {
  /** The winner's Players Club card name. */
  name: string;
  at: number;
}

interface Shared {
  major: number;
  grand: number;
  /** Majors hit so far: which secret seed the Major's must-hit point comes from. */
  majorHits: number;
  history: SharedHit[];
  /** When the meters last grew. */
  at: number;
  /** The Major is due and held for this player until then. */
  held: { player: string; until: number } | null;
  /** The pit boss made the Major due on the next spin. */
  forceDue: boolean;
}

/** What everyone sees: the meters, how fast they creep, and the latest hits. */
export interface JackpotView {
  meters: JackpotMeters;
  /** The per-second growth to creep the meters by on screen, and when they were last counted. */
  perSecond: JackpotMeters;
  at: number;
  history: SharedHit[];
}

/** What a player's own server gets back: the meters to play against, and whether the Major is due for them. */
export interface Exchange {
  meters: JackpotMeters;
  due: boolean;
}

/**
 * The shared progressive jackpot: one Grand and one Major, linked across
 * every member's machines. Every member's rounds feed the meters (their own
 * server reports them); a hit resets it for everyone. The Major must hit by
 * a hidden point drawn from a secret seed per Major; once past it, it's held
 * for the next member about to spin, so only one can win it. Every open
 * casino holds a hibernating WebSocket here and sees the meters climb live.
 */
export class JackpotDO extends DurableObject<Env> {
  private sql: SqlStorage;
  private lastBroadcast = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS jackpot (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, seed_key TEXT NOT NULL)');
    // Keep-alives are answered without waking the object.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }

  private load(): { j: Shared; key: string } {
    const row = this.sql.exec<{ data: string; seed_key: string }>('SELECT data, seed_key FROM jackpot WHERE id = 1').toArray()[0];
    if (row) return { j: JSON.parse(row.data) as Shared, key: row.seed_key };
    const j: Shared = { major: JACKPOT_SEEDS.major, grand: JACKPOT_SEEDS.grand, majorHits: 0, history: [], at: Date.now(), held: null, forceDue: false };
    const key = newSeedKey();
    this.sql.exec('INSERT INTO jackpot (id, data, seed_key) VALUES (1, ?, ?)', JSON.stringify(j), key);
    return { j, key };
  }

  private save(j: Shared) {
    this.sql.exec('UPDATE jackpot SET data = ? WHERE id = 1', JSON.stringify(j));
  }

  /** Where this Major must hit: from the secret seed for it. */
  private majorAt(j: Shared, key: string): number {
    if (j.forceDue) return JACKPOT_SEEDS.major;
    const u = new Rng(seedFn(key)('jackpot', j.majorHits), 'major-at').next();
    return JACKPOT_SEEDS.major + u * (MAJOR_CAP - JACKPOT_SEEDS.major);
  }

  /** The meters after the seconds since they last grew (a minute at most) and `rounds` more rounds. */
  private grow(j: Shared, rounds: number, rate: number, now: number) {
    const seconds = Math.min(MAX_IDLE_SECONDS, Math.max(0, (now - j.at) / 1000));
    j.major = Math.min(MAJOR_CAP, j.major + (PER_SECOND.major * seconds + PER_HAND.major * rounds) * rate);
    j.grand += (PER_SECOND.grand * seconds + PER_HAND.grand * rounds) * rate;
    j.at = now;
  }

  private view(j: Shared, rate: number): JackpotView {
    return {
      meters: { major: j.major, grand: j.grand },
      perSecond: { major: PER_SECOND.major * rate, grand: PER_SECOND.grand * rate },
      at: j.at,
      history: j.history,
    };
  }

  /**
   * A member's server checks in: the rounds they've played since (they feed
   * the meters), any hits (reset for everyone, and listed), and, before slot
   * spins (`slots`), the meters to play against and whether the Major is due
   * for them.
   */
  async exchange(req: { player: string; name: string; rounds: number; claims: JackpotClaim[]; slots: boolean; rate: number }): Promise<Exchange> {
    const now = Date.now();
    const { j, key } = this.load();
    const rate = Math.max(0, req.rate);
    this.grow(j, Math.max(0, Math.floor(req.rounds) || 0), rate, now);
    for (const claim of req.claims ?? []) {
      if (claim.tier !== 'major' && claim.tier !== 'grand') continue;
      j.history = [{ ...claim, name: req.name, at: Math.max(now, (j.history[0]?.at ?? 0) + 1) }, ...j.history].slice(0, HISTORY);
      j[claim.tier] = JACKPOT_SEEDS[claim.tier];
      if (claim.tier === 'major') {
        j.majorHits++;
        j.held = null;
        j.forceDue = false;
      }
    }
    let due = false;
    if (req.slots && j.major >= this.majorAt(j, key)) {
      // Held for one player at a time, so two can't both win it.
      if (!j.held || j.held.until < now || j.held.player === req.player) {
        j.held = { player: req.player, until: now + HOLD_MS };
        due = true;
      }
    }
    this.save(j);
    this.broadcast(j, rate, (req.claims ?? []).length > 0);
    return { meters: { major: j.major, grand: j.grand }, due };
  }

  /** The meters as they stand, for a page opening (and the pit boss). */
  async snapshot(rate: number): Promise<JackpotView> {
    const { j } = this.load();
    return this.view(j, rate);
  }

  /** The pit boss: set a meter, or make the Major due on the next spin. */
  async admin(req: { tier?: 'major' | 'grand'; value?: number; due?: boolean }, rate: number): Promise<JackpotView> {
    const { j } = this.load();
    if (req.due) j.forceDue = true;
    if ((req.tier === 'major' || req.tier === 'grand') && typeof req.value === 'number' && Number.isFinite(req.value)) {
      j[req.tier] = Math.max(JACKPOT_SEEDS[req.tier], req.tier === 'major' ? Math.min(req.value, MAJOR_CAP) : req.value);
    }
    this.save(j);
    this.broadcast(j, rate, true);
    return this.view(j, rate);
  }

  /** Tells every open casino the meters, at most every few seconds (a hit at once). */
  private broadcast(j: Shared, rate: number, now: boolean) {
    const t = Date.now();
    if (!now && t - this.lastBroadcast < BROADCAST_MS) return;
    this.lastBroadcast = t;
    const message = JSON.stringify({ type: 'jackpot', ...this.view(j, rate) });
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(message);
      } catch {
        // A socket closing as we send: it's gone either way.
      }
    }
  }

  /** A casino opening its live link: a hibernating WebSocket, sent the meters at once. */
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade') !== 'websocket') return new Response('Expected a WebSocket.', { status: 426 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    const rate = Number(new URL(request.url).searchParams.get('rate')) || 1;
    const { j } = this.load();
    server.send(JSON.stringify({ type: 'jackpot', ...this.view(j, rate) }));
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Nothing to hear from a casino but keep-alives. */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    if (message === 'ping') ws.send('pong');
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code, 'closing');
    } catch {
      // Already closed.
    }
  }
}
