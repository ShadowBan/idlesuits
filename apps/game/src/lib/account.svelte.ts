import { api, ApiError } from './api';
import { player } from './player.svelte';
import { onSaved, playerChange, restore, snapshot } from './save';

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  role: 'player' | 'admin';
  /** When they joined the Players Club. */
  createdAt?: number;
}

/** How the account's cloud save stands. `local` is a guest, or a build with no server. */
export type SyncStatus = 'checking' | 'local' | 'syncing' | 'synced' | 'error' | 'conflict';

/**
 * Pushes wait for a quiet moment, and go at most this often: an idle game
 * saves after every hand. The cloud save holds only preferences and the bets
 * on the felt (the server keeps everything that decides a result), so a couple
 * of minutes late costs nothing; leaving the page sends it at once.
 */
const PUSH_EVERY_MS = 120_000;
/**
 * Writes this soon after the page loads are the game setting itself up (a
 * table's bets, the room), not the player playing: they don't send the save,
 * so opening the game on a device doesn't make it the latest.
 */
const BOOT_QUIET_MS = 4_000;
/** Where this browser remembers which account and which cloud version its save matches. Not part of the save. */
const META_KEY = 'idlesuits-sync';
/** Left in session storage across the reload that follows adopting a cloud save, to say why. */
const NOTICE_KEY = 'idlesuits-sync-notice';

interface SyncMeta {
  user: string;
  version: number;
}

function readMeta(): SyncMeta | null {
  try {
    const meta = JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as SyncMeta | null;
    return meta && typeof meta.user === 'string' && Number.isInteger(meta.version) ? meta : null;
  } catch {
    return null;
  }
}

function writeMeta(meta: SyncMeta | null) {
  try {
    if (meta) localStorage.setItem(META_KEY, JSON.stringify(meta));
    else localStorage.removeItem(META_KEY);
  } catch {
    // Not remembered: the next visit checks with the cloud again.
  }
}

interface CloudSave {
  version: number;
  data: Record<string, string>;
  updatedAt: number;
}

/**
 * The player's account, and the sync between this browser's save and their
 * cloud save. A guest plays from the browser's save, as before; signing in
 * ties it to the account:
 *  - a new account (no cloud save yet) takes this browser's progress with it;
 *  - an account that already has a cloud save brings it here, replacing this
 *    browser's, and the page reloads to read it;
 *  - after that every saved change goes up, at most every 15 seconds and
 *    when the page is hidden, each on top of the version it came from, so a
 *    newer save from another device is adopted rather than overwritten.
 *
 * A member's bank, Tokens, charms, stats and wins aren't in the cloud save:
 * the server keeps them, and decides their rounds (see `player`).
 */
class Account {
  user = $state<AccountUser | null>(null);
  status = $state<SyncStatus>('checking');
  /** There's an API to sign in to (false on a static build with no server). */
  online = $state(false);
  lastSync = $state<number | null>(null);
  /** Why the save changed under the player, once, after a reload. */
  notice = $state<string | null>(null);
  /** The account was played on another device since this one last saved: its save, waiting on the player's choice. */
  conflict = $state.raw<CloudSave | null>(null);
  private dirty = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private lastPush = 0;
  private pushing = false;

  constructor() {
    if (typeof window === 'undefined') return;
    try {
      this.notice = sessionStorage.getItem(NOTICE_KEY);
      sessionStorage.removeItem(NOTICE_KEY);
    } catch {
      // No session storage: no notice.
    }
    onSaved((key) => playerChange(key) && this.changed());
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') void this.push(true, true);
    });
    window.addEventListener('pagehide', () => void this.push(true, true));
    void this.check();
  }

  get admin(): boolean {
    return this.user?.role === 'admin';
  }

  /** Who's signed in, if anyone, then the cloud save. */
  private async check() {
    try {
      const { user } = await api<{ user: AccountUser | null }>('/me');
      this.online = true;
      this.user = user;
      if (user) await this.welcome(user);
      else {
        this.status = 'local';
        player.guest();
      }
    } catch {
      this.online = false;
      this.status = 'local';
      player.guest();
    }
  }

  async signUp(email: string, password: string, name: string) {
    const { user } = await api<{ user: AccountUser }>('/auth/signup', { method: 'POST', body: { email, password, name } });
    this.user = user;
    await this.welcome(user);
  }

  async signIn(email: string, password: string) {
    const { user } = await api<{ user: AccountUser }>('/auth/signin', { method: 'POST', body: { email, password } });
    this.user = user;
    await this.welcome(user);
  }

  /** Signs out after sending the last changes. This browser keeps its save, to play on as a guest. */
  async signOut() {
    await this.push(true);
    await api('/auth/signout', { method: 'POST', body: {} }).catch(() => {});
    writeMeta(null);
    this.user = null;
    this.status = 'local';
    this.lastSync = null;
    player.leave();
  }

  /**
   * A member is known: their state comes from the server (made there the
   * first time, from their cloud save if they had one), then their cloud
   * save, which now holds only preferences and the bets left on the felt.
   */
  private async welcome(user: AccountUser) {
    await player.join();
    await this.adopt(user);
  }

  /** Brings this browser and the account's cloud save together, once a user is known. */
  private async adopt(user: AccountUser) {
    this.status = 'syncing';
    try {
      const { save } = await api<{ save: CloudSave | null }>('/save');
      const meta = readMeta();
      if (!save) {
        // A new account: this browser's progress becomes the account's.
        const done = await api<{ ok: true; version: number; updatedAt: number }>('/save', { method: 'PUT', body: { base: 0, data: snapshot() } });
        writeMeta({ user: user.id, version: done.version });
        this.synced(done.updatedAt);
        return;
      }
      if (meta?.user === user.id && meta.version === save.version) {
        // This browser already holds the account's latest save.
        this.synced(save.updatedAt);
        if (this.dirty) this.schedule();
        return;
      }
      this.land(user, save, meta?.user === user.id ? 'Your progress was updated from another device.' : `Welcome back to the Players Club, ${user.name}: your progress is loaded.`);
    } catch {
      this.status = 'error';
    }
  }

  /** Puts a cloud save in place of this browser's and reloads to read it. */
  private land(user: AccountUser, save: CloudSave, why: string) {
    restore(save.data);
    writeMeta({ user: user.id, version: save.version });
    try {
      sessionStorage.setItem(NOTICE_KEY, why);
    } catch {
      // The reload happens anyway; just without the notice.
    }
    location.reload();
  }

  /** Settles a conflict with the other device's progress: it loads here, in place of this browser's. */
  useCloud() {
    const user = this.user;
    const current = this.conflict;
    if (!user || !current) return;
    this.conflict = null;
    this.land(user, current, 'Loaded your progress from the other device.');
  }

  /** Settles a conflict with this browser's progress: it goes up over the other device's, whatever it has saved since. */
  async keepThis() {
    const user = this.user;
    if (!user || !this.conflict) return;
    this.status = 'syncing';
    try {
      // On top of the newest save, not the one the conflict showed: the other device may have saved again since.
      const { save } = await api<{ save: CloudSave | null }>('/save');
      this.conflict = null;
      writeMeta({ user: user.id, version: save?.version ?? 0 });
      this.dirty = true;
      await this.push(true);
    } catch {
      this.status = 'conflict';
    }
  }

  private synced(at: number) {
    this.status = 'synced';
    this.lastSync = at;
  }

  private readonly bootedAt = typeof performance !== 'undefined' ? performance.now() : 0;

  private changed() {
    if (performance.now() - this.bootedAt < BOOT_QUIET_MS) return;
    this.dirty = true;
    if (this.user) this.schedule();
  }

  private schedule() {
    if (this.timer) return;
    const wait = Math.max(2_000, PUSH_EVERY_MS - (Date.now() - this.lastPush));
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.push();
    }, wait);
  }

  /**
   * Sends the save up on top of the version this browser came from. `now`
   * skips the wait (signing out, settling a conflict); `leaving` is the page
   * being hidden or closed, when a small save can be sent to outlive it.
   */
  private async push(now = false, leaving = false) {
    const user = this.user;
    const meta = readMeta();
    if (!user || !meta || meta.user !== user.id || !this.dirty || this.pushing || this.conflict) return;
    if (!now && Date.now() - this.lastPush < PUSH_EVERY_MS) return this.schedule();
    this.pushing = true;
    this.dirty = false;
    this.lastPush = Date.now();
    this.status = 'syncing';
    try {
      const data = snapshot();
      // A request sent as the page closes can outlive it, but browsers cap those at 64 KB.
      const keepalive = leaving && JSON.stringify(data).length < 60_000;
      const done = await api<{ ok: true; version: number; updatedAt: number }>('/save', { method: 'PUT', body: { base: meta.version, data }, keepalive });
      writeMeta({ user: user.id, version: done.version });
      this.synced(done.updatedAt);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        // Another device saved since. Nothing is overwritten either way until the player picks which progress to keep.
        const current = (e.body as { current?: CloudSave } | null)?.current;
        if (current) {
          this.conflict = current;
          this.status = 'conflict';
          this.dirty = true;
          return;
        }
      }
      if (e instanceof ApiError && e.status === 401) {
        this.user = null;
        this.status = 'local';
        player.leave();
        return;
      }
      this.dirty = true;
      this.status = 'error';
    } finally {
      this.pushing = false;
    }
    if (this.dirty) this.schedule();
  }
}

export const account = new Account();
