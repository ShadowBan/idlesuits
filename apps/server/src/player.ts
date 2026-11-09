import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';

/** The largest save a player can store, in bytes of JSON. */
export const MAX_SAVE_BYTES = 1_000_000;

export interface SaveRecord {
  /** Goes up by one with every save, so two devices can't overwrite each other unseen. */
  version: number;
  /** The game's save, as the client keeps it: key → stored JSON. */
  data: Record<string, string>;
  updatedAt: number;
}

export type PutResult = { ok: true; version: number; updatedAt: number } | { ok: false; reason: 'conflict'; current: SaveRecord | null } | { ok: false; reason: 'too-large' };

/**
 * One player's own server: a Durable Object per account, so everything about
 * a player is handled one request at a time, in one place. For now it keeps
 * their cloud save; next it takes over their wallet and their rounds, with the
 * seeds that decide them, so results can be trusted.
 */
export class PlayerDO extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS save (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version INTEGER NOT NULL,
      data TEXT NOT NULL,
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
   * and the newer save comes back instead.
   */
  async putSave(base: number, data: Record<string, string>): Promise<PutResult> {
    const text = JSON.stringify(data);
    if (text.length > MAX_SAVE_BYTES) return { ok: false, reason: 'too-large' };
    const current = await this.getSave();
    if ((current?.version ?? 0) !== base) return { ok: false, reason: 'conflict', current };
    const version = base + 1;
    const updatedAt = Date.now();
    this.sql.exec('INSERT OR REPLACE INTO save (id, version, data, updated_at) VALUES (1, ?, ?, ?)', version, text, updatedAt);
    return { ok: true, version, updatedAt };
  }
}
