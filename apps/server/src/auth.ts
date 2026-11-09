/**
 * Accounts: password hashing, sessions and their cookie. Everything here uses
 * the Web Crypto API, so it runs the same in a Worker and in Node's tests.
 *
 * Passwords are hashed with PBKDF2-SHA256 (100,000 rounds, the most a Worker
 * allows) and a random salt per account. A session is a random 32-byte token:
 * the player's cookie holds the token, the database only its SHA-256, so a
 * leaked database can't be used to sign in.
 */

const ITERATIONS = 100_000;
const SESSION_DAYS = 30;
/** A session with less than this left is extended on use. */
const RENEW_DAYS = 15;
export const SESSION_COOKIE = 'is_session';

const enc = new TextEncoder();

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromB64(text: string): Uint8Array {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

function randomBytes(n: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(n));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

/** Compares in time independent of where the first difference is. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

/** A password's stored form: `pbkdf2$rounds$salt$hash`. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, rounds, salt, hash] = stored.split('$');
  if (scheme !== 'pbkdf2' || !rounds || !salt || !hash) return false;
  const got = await pbkdf2(password, fromB64(salt), Number(rounds));
  return sameBytes(got, fromB64(hash));
}

export async function sha256(text: string): Promise<string> {
  return toB64(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(text))));
}

export function newToken(): string {
  return toB64(randomBytes(32));
}

export function newId(): string {
  return crypto.randomUUID();
}

export const DAY_MS = 86_400_000;

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: 'player' | 'admin';
  /** When they joined the Players Club. */
  createdAt: number;
}

/** Starts a session for a user: stores its hash and returns the token for the cookie. */
export async function createSession(db: D1Database, userId: string, now = Date.now()): Promise<string> {
  const token = newToken();
  await db
    .prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256(token), userId, now, now + SESSION_DAYS * DAY_MS)
    .run();
  return token;
}

/** The signed-in user for a session token, extending the session when it's getting old; null if none or expired. */
export async function sessionUser(db: D1Database, token: string, now = Date.now()): Promise<{ user: SessionUser; renewed: boolean } | null> {
  const id = await sha256(token);
  const row = await db
    .prepare('SELECT u.id, u.email, u.name, u.role, u.created_at, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?')
    .bind(id)
    .first<{ id: string; email: string; name: string; role: string; created_at: number; expires_at: number }>();
  if (!row) return null;
  if (row.expires_at <= now) {
    await db.prepare('DELETE FROM sessions WHERE id = ?').bind(id).run();
    return null;
  }
  let renewed = false;
  if (row.expires_at - now < RENEW_DAYS * DAY_MS) {
    await db.prepare('UPDATE sessions SET expires_at = ? WHERE id = ?').bind(now + SESSION_DAYS * DAY_MS, id).run();
    renewed = true;
  }
  return { user: { id: row.id, email: row.email, name: row.name, role: row.role === 'admin' ? 'admin' : 'player', createdAt: row.created_at }, renewed };
}

export async function endSession(db: D1Database, token: string) {
  await db.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256(token)).run();
}

/** The session cookie: HttpOnly so scripts can't read it, Lax so other sites can't send it with a write. */
export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 86_400}${secure ? '; Secure' : ''}`;
}

export function clearCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}

export function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return v.join('=') || null;
  }
  return null;
}

/** Sign-in failures allowed per email in the window before it locks for the rest of it. */
export const MAX_FAILURES = 10;
export const FAILURE_WINDOW_MS = 15 * 60_000;

export function normalEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function validEmail(email: string): boolean {
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validPassword(password: string): string | null {
  if (password.length < 8) return 'Passwords need at least 8 characters.';
  if (password.length > 200) return 'That password is too long.';
  return null;
}

export function cleanName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().slice(0, 32);
}
