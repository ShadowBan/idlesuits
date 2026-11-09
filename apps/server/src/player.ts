import {
  act,
  freshPlayer,
  isOldStateKey,
  KENO_BATCH_MAX,
  playerFromSave,
  readPlayer,
  type ActResult,
  type EngineTuning,
  type PlayerState,
} from '@idlesuits/engine';
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';
import { newSeedKey, seedsFor } from './seeds';

/** The largest save a player can store, in bytes of JSON. */
export const MAX_SAVE_BYTES = 1_000_000;

/**
 * Requests a player may make in a burst, and how fast the allowance comes
 * back. Auto play asks for a batch of draws at a time and animates them for
 * several seconds each, so an honest table is far inside this.
 */
const BURST = 30;
const REFILL_PER_SEC = 4;

export interface SaveRecord {
  /** Goes up by one with every save, so two devices can't overwrite each other unseen. */
  version: number;
  /** The game's save, as the client keeps it: key → stored JSON. */
  data: Record<string, string>;
  updatedAt: number;
}

export type PutResult = { ok: true; version: number; updatedAt: number } | { ok: false; reason: 'conflict'; current: SaveRecord | null } | { ok: false; reason: 'too-large' };

export type ActReply = { ok: true; state: PlayerState; result: ActResult } | { ok: false; error: string; status: number };

/** The parts of a cloud save the server keeps for itself: the save holds only the rest (bets on the felt, preferences). */
function cosmetic(data: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(data)) if (!isOldStateKey(k) && k !== 'player') out[k] = v;
  return out;
}

/**
 * One player's own server: a Durable Object per account, so everything about
 * a player is handled one request at a time, in one place. It keeps:
 *  - their state (bank, Tokens, charms, stats, wins, each moved game's
 *    progress), which only the engine changes, one action at a time;
 *  - the secret key their rounds' seeds come from;
 *  - their cloud save, which now holds only what can't change a result.
 */
export class PlayerDO extends DurableObject<Env> {
  private sql: SqlStorage;
  private allowance = BURST;
  private refilledAt = Date.now();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS save (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      data TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      data TEXT NOT NULL,
      seed_key TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )`);
  }

  async getSave(): Promise<SaveRecord | null> {
    const row = this.sql.exec<{ version: number; data: string; updated_at: number }>('SELECT version, data, updated_at FROM save WHERE id = 1').toArray()[0];
    if (!row) return null;
    return { version: row.version, data: JSON.parse(row.data) as Record<string, string>, updatedAt: row.updated_at };
  }

  /**
   * Stores a save written on top of version `base` (0 for the first). If the
   * stored save has moved on since (another device saved), nothing is written
   * and the newer save comes back instead. Anything in it that's the server's
   * to keep (the bank, the charms…) is dropped.
   */
  async putSave(base: number, data: Record<string, string>): Promise<PutResult> {
    // The state is moved in from the old save before anything can overwrite it.
    this.load();
    const text = JSON.stringify(cosmetic(data));
    if (text.length > MAX_SAVE_BYTES) return { ok: false, reason: 'too-large' };
    const current = await this.getSave();
    if ((current?.version ?? 0) !== base) return { ok: false, reason: 'conflict', current };
    const version = base + 1;
    const updatedAt = Date.now();
    this.sql.exec('INSERT OR REPLACE INTO save (id, version, data, updated_at) VALUES (1, ?, ?, ?)', version, text, updatedAt);
    return { ok: true, version, updatedAt };
  }

  /**
   * The player's state and seed key. The first time, it's made: from the
   * cloud save, if the player had one from before the server kept their
   * state (moved once, then the save keeps only its cosmetic part), or fresh.
   */
  private load(): { state: PlayerState; key: string } {
    const row = this.sql.exec<{ data: string; seed_key: string }>('SELECT data, seed_key FROM state WHERE id = 1').toArray()[0];
    if (row) return { state: readPlayer(JSON.parse(row.data), 'server'), key: row.seed_key };
    const saveRow = this.sql.exec<{ data: string }>('SELECT data FROM save WHERE id = 1').toArray()[0];
    const old = saveRow ? (JSON.parse(saveRow.data) as Record<string, string>) : null;
    const state = (old && playerFromSave(old, 'server')) ?? freshPlayer('server');
    const key = newSeedKey();
    this.store(state, key);
    if (old && saveRow) this.sql.exec('UPDATE save SET data = ? WHERE id = 1', JSON.stringify(cosmetic(old)));
    return { state, key };
  }

  private store(state: PlayerState, key: string) {
    state.rev++;
    this.sql.exec('INSERT OR REPLACE INTO state (id, data, seed_key, updated_at) VALUES (1, ?, ?, ?)', JSON.stringify(state), key, Date.now());
  }

  async getState(): Promise<PlayerState> {
    return this.load().state;
  }

  /** One request's worth of the allowance; false if the player is going faster than any table plays. */
  private spend(): boolean {
    const now = Date.now();
    this.allowance = Math.min(BURST, this.allowance + ((now - this.refilledAt) / 1000) * REFILL_PER_SEC);
    this.refilledAt = now;
    if (this.allowance < 1) return false;
    this.allowance--;
    return true;
  }

  /**
   * Runs one action through the engine and keeps the result. `admin` lets
   * the pit boss's tools through; `limited` is false for the pit boss acting
   * on someone else's account.
   */
  async act(action: unknown, tuning: EngineTuning, opts: { admin: boolean; limited?: boolean }): Promise<ActReply> {
    if (opts.limited !== false && !this.spend()) return { ok: false, error: 'Slow down a little.', status: 429 };
    // One action at a time, start to finish: nothing else runs while the seeds are worked out, so two
    // requests can't both play from the same state.
    return this.ctx.blockConcurrencyWhile(async (): Promise<ActReply> => {
      const { state, key } = this.load();
      // Every seed this action could need, worked out before it runs.
      const seed = await seedsFor(key, [
        { game: 'keno', from: state.keno.round, count: KENO_BATCH_MAX },
        { game: 'charms', from: 0, count: 1 },
      ]);
      const out = act(state, action, { now: Date.now(), tuning, seed }, { admin: opts.admin });
      if (!out.ok) return { ok: false, error: out.error, status: 400 };
      this.store(out.state, key);
      return out;
    });
  }
}
