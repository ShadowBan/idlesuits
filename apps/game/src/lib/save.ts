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
