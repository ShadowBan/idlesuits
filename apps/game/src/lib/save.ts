import { isOldStateKey } from '@idlesuits/engine';

/**
 * The browser save. Every piece of state that should outlive a reload goes
 * through here, under one prefix and one version, so a backend can later take
 * the whole save over (multi-device play) without each feature changing.
 *
 * Storage can be blocked or full: reads fall back to defaults and writes are
 * best-effort, so the casino always works, it just may not remember.
 */

const PREFIX = 'idlesuits.';
/** Bump when a saved shape changes in a way old saves can't be read as. */
export const SAVE_VERSION = 1;

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as { v?: number; data?: T };
    if (parsed?.v !== SAVE_VERSION || parsed.data === undefined) return fallback;
    return parsed.data;
  } catch {
    return fallback;
  }
}

export function save(key: string, data: unknown) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify({ v: SAVE_VERSION, data }));
  } catch {
    // Not remembered this time; nothing else depends on it.
  }
  if (!LOCAL_ONLY.has(key)) for (const listener of listeners) listener(key);
}

/**
 * Settings that belong to this device, not the account: they never go to the
 * cloud, and a cloud save never overwrites them.
 */
const LOCAL_ONLY = new Set([
  'admin',
  'muted',
  'panelTab',
  'lobby.tab',
  'tuning',
  'tuning.games',
  // A guest's own state, and a member's practice bankroll: a member's real state is on the server.
  'player',
  'practice',
]);
/**
 * Saved on a timer, not by anything the player does (the progressive meters
 * creep up every second): they go up with the rest of the save, but never send
 * it on their own, so an idle tab stays quiet.
 */
const AMBIENT = new Set(['jackpots']);

/** A write the player made happen: one that should send the save up. */
export function playerChange(key: string): boolean {
  return !AMBIENT.has(key);
}
const listeners = new Set<(key: string) => void>();

/** Calls `listener` after each saved write that belongs to the account. Returns the unsubscribe. */
export function onSaved(listener: (key: string) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Everything this browser has saved for the account, as stored: key (without the prefix) → JSON. */
export function snapshot(): Record<string, string> {
  flush();
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (!full?.startsWith(PREFIX)) continue;
      const key = full.slice(PREFIX.length);
      if (LOCAL_ONLY.has(key) || isOldStateKey(key)) continue;
      const value = localStorage.getItem(full);
      if (value !== null) out[key] = value;
    }
  } catch {
    // Storage blocked: nothing to send.
  }
  return out;
}

/** Everything saved in this browser, key (without the prefix) → stored JSON. */
export function storedEntries(): Record<string, string> {
  const out: Record<string, string> = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (!full?.startsWith(PREFIX)) continue;
      const value = localStorage.getItem(full);
      if (value !== null) out[full.slice(PREFIX.length)] = value;
    }
  } catch {
    // Storage blocked: nothing saved.
  }
  return out;
}

/** Forgets a saved key. */
export function unstore(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Blocked: nothing to forget.
  }
}

/** Replaces the account's part of this browser's save with `data` (from the cloud). The page reloads after, to read it. */
export function restore(data: Record<string, string>) {
  pending.clear();
  clearTimeout(timer);
  try {
    const drop: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const full = localStorage.key(i);
      if (full?.startsWith(PREFIX) && !LOCAL_ONLY.has(full.slice(PREFIX.length))) drop.push(full);
    }
    for (const full of drop) localStorage.removeItem(full);
    for (const [key, value] of Object.entries(data)) if (!LOCAL_ONLY.has(key)) localStorage.setItem(PREFIX + key, value);
  } catch {
    // Storage blocked: the cloud save can't land here.
  }
}

const pending = new Map<string, () => unknown>();
let timer: ReturnType<typeof setTimeout> | undefined;

/** Saves soon, coalescing bursts (chips tapped quickly, hands at 5×) into one write. */
export function saveSoon(key: string, data: () => unknown) {
  pending.set(key, data);
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}

function flush() {
  for (const [key, data] of pending) save(key, data());
  pending.clear();
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
