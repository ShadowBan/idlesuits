import {
  cleanName,
  clearCookie,
  createSession,
  endSession,
  FAILURE_WINDOW_MS,
  hashPassword,
  MAX_FAILURES,
  newId,
  normalEmail,
  readCookie,
  SESSION_COOKIE,
  sessionCookie,
  sessionUser,
  validEmail,
  validPassword,
  verifyPassword,
  type SessionUser,
} from './auth';
import { cleanTuning, ENGINE_GAMES, type EngineTuning, type PlayerState } from '@idlesuits/engine';
import type { ActReply, PlayerDO } from './player';

export { PlayerDO } from './player';

export interface Env {
  DB: D1Database;
  PLAYER: DurableObjectNamespace<PlayerDO>;
  ASSETS: Fetcher;
  /** Other sites allowed to write, comma-separated: only the game's dev server, in .dev.vars. */
  ALLOWED_ORIGINS?: string;
}

/** The largest request body the API reads, in bytes. A save is the biggest thing sent. */
const MAX_BODY = 1_100_000;

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers } });
}

/**
 * Reads a JSON body. Writes must be JSON from this site: a form on another
 * site can't send JSON without asking first, and the Origin check catches the
 * rest, so a session cookie alone can't be used against the player.
 */
async function body<T>(req: Request, env: Env): Promise<T> {
  if (!(req.headers.get('content-type') ?? '').includes('application/json')) throw new HttpError(415, 'Send JSON.');
  const origin = req.headers.get('origin');
  const allowed = (env.ALLOWED_ORIGINS ?? '').split(',').map((o) => o.trim());
  if (origin && origin !== new URL(req.url).origin && !allowed.includes(origin)) throw new HttpError(403, 'Wrong origin.');
  const size = Number(req.headers.get('content-length') ?? 0);
  if (size > MAX_BODY) throw new HttpError(413, 'Too large.');
  const text = await req.text();
  if (text.length > MAX_BODY) throw new HttpError(413, 'Too large.');
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, 'That isn’t JSON.');
  }
}

function secure(req: Request): boolean {
  return new URL(req.url).protocol === 'https:';
}

async function currentUser(req: Request, env: Env): Promise<{ user: SessionUser; token: string; renewed: boolean } | null> {
  const token = readCookie(req.headers.get('cookie'), SESSION_COOKIE);
  if (!token) return null;
  const found = await sessionUser(env.DB, token);
  return found ? { ...found, token } : null;
}

async function requireUser(req: Request, env: Env) {
  const me = await currentUser(req, env);
  if (!me) throw new HttpError(401, 'Sign in first.');
  return me;
}

async function requireAdmin(req: Request, env: Env) {
  const me = await requireUser(req, env);
  if (me.user.role !== 'admin') throw new HttpError(403, 'Pit bosses only.');
  return me;
}

function player(env: Env, userId: string) {
  return env.PLAYER.get(env.PLAYER.idFromName(userId));
}

function publicUser(user: SessionUser) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt };
}

/** Signs a user in: a fresh session and its cookie. */
async function signedIn(req: Request, env: Env, user: SessionUser): Promise<Response> {
  const token = await createSession(env.DB, user.id);
  return json({ user: publicUser(user) }, 200, { 'set-cookie': sessionCookie(token, secure(req)) });
}

async function signUp(req: Request, env: Env): Promise<Response> {
  const input = await body<{ email?: string; password?: string; name?: string }>(req, env);
  const email = normalEmail(String(input.email ?? ''));
  const password = String(input.password ?? '');
  const name = cleanName(String(input.name ?? '')) || email.split('@')[0]!.slice(0, 32);
  if (!validEmail(email)) throw new HttpError(400, 'That email doesn’t look right.');
  const weak = validPassword(password);
  if (weak) throw new HttpError(400, weak);
  const exists = await env.DB.prepare('SELECT 1 FROM users WHERE email = ?').bind(email).first();
  if (exists) throw new HttpError(409, 'There’s already an account with that email.');
  // Every account starts as a player. Pit bosses are made by hand (`npm run admin -w @idlesuits/server`), never by
  // the email signed up with: emails aren't verified, so anyone could claim one.
  const user: SessionUser = { id: newId(), email, name, role: 'player', createdAt: Date.now() };
  await env.DB.prepare('INSERT INTO users (id, email, name, pass, role, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(user.id, email, name, await hashPassword(password), user.role, user.createdAt)
    .run();
  return signedIn(req, env, user);
}

let dummy: Promise<string> | null = null;
/** A hash to check against when there's no account, so a miss takes as long as a wrong password. */
function dummyHash(): Promise<string> {
  return (dummy ??= hashPassword(crypto.randomUUID()));
}

async function signIn(req: Request, env: Env): Promise<Response> {
  const input = await body<{ email?: string; password?: string }>(req, env);
  const email = normalEmail(String(input.email ?? ''));
  const password = String(input.password ?? '');
  const now = Date.now();
  // Too many wrong passwords for this email lately: it waits out the window.
  const failures = await env.DB.prepare('SELECT COUNT(*) AS n FROM sign_in_failures WHERE email = ? AND at > ?')
    .bind(email, now - FAILURE_WINDOW_MS)
    .first<{ n: number }>();
  if ((failures?.n ?? 0) >= MAX_FAILURES) throw new HttpError(429, 'Too many tries. Wait a few minutes and try again.');
  const row = await env.DB.prepare('SELECT id, email, name, pass, role, created_at FROM users WHERE email = ?')
    .bind(email)
    .first<{ id: string; email: string; name: string; pass: string; role: string; created_at: number }>();
  // An unknown email still costs a full hash, so timing can't tell which emails have accounts.
  const ok = row ? await verifyPassword(password, row.pass) : (await verifyPassword(password, await dummyHash()), false);
  if (!row || !ok) {
    await env.DB.batch([
      env.DB.prepare('INSERT INTO sign_in_failures (email, at) VALUES (?, ?)').bind(email, now),
      env.DB.prepare('DELETE FROM sign_in_failures WHERE at < ?').bind(now - FAILURE_WINDOW_MS),
    ]);
    throw new HttpError(401, 'That email and password don’t match.');
  }
  const role: SessionUser['role'] = row.role === 'admin' ? 'admin' : 'player';
  await env.DB.prepare('DELETE FROM sign_in_failures WHERE email = ?').bind(email).run();
  return signedIn(req, env, { id: row.id, email: row.email, name: row.name, role, createdAt: row.created_at });
}

async function signOut(req: Request, env: Env): Promise<Response> {
  await body<unknown>(req, env);
  const token = readCookie(req.headers.get('cookie'), SESSION_COOKIE);
  if (token) await endSession(env.DB, token);
  return json({ ok: true }, 200, { 'set-cookie': clearCookie(secure(req)) });
}

/** The pit boss's tuning, read from the database at most this often per Worker. */
const TUNING_TTL_MS = 10_000;
let tuningCache: { at: number; tuning: EngineTuning } | null = null;

async function readTuning(env: Env): Promise<EngineTuning> {
  if (tuningCache && Date.now() - tuningCache.at < TUNING_TTL_MS) return tuningCache.tuning;
  const row = await env.DB.prepare('SELECT data FROM tuning WHERE id = 1').first<{ data: string }>();
  let raw: unknown = {};
  try {
    raw = row ? JSON.parse(row.data) : {};
  } catch {
    // A bad row reads as the defaults.
  }
  const tuning = cleanTuning(raw);
  tuningCache = { at: Date.now(), tuning };
  return tuning;
}

/** What a player's game needs from the server: their state, the tuning it's decided under, and which games the server plays. */
async function stateReply(env: Env, userId: string) {
  return { state: (await player(env, userId).getState()) as unknown as PlayerState, tuning: await readTuning(env), games: ENGINE_GAMES };
}

async function actReply(req: Request, env: Env, userId: string, opts: { admin: boolean; limited?: boolean }): Promise<Response> {
  const input = await body<{ action?: unknown }>(req, env);
  // The RPC stub's types can't follow `unknown` (a win's replay data) through, so the reply is typed here.
  const out = (await player(env, userId).act(input.action, await readTuning(env), opts)) as unknown as ActReply;
  if (!out.ok) throw new HttpError(out.status, out.error);
  return json({ state: out.state, result: out.result });
}

async function route(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  if (path === '/api/health') return json({ ok: true });
  if (path === '/api/auth/signup' && method === 'POST') return signUp(req, env);
  if (path === '/api/auth/signin' && method === 'POST') return signIn(req, env);
  if (path === '/api/auth/signout' && method === 'POST') return signOut(req, env);

  if (path === '/api/me' && method === 'GET') {
    const me = await currentUser(req, env);
    if (!me) return json({ user: null });
    // A session renewed on this request gets a fresh cookie to match.
    return json({ user: publicUser(me.user) }, 200, me.renewed ? { 'set-cookie': sessionCookie(me.token, secure(req)) } : {});
  }

  // The player's cloud save.
  if (path === '/api/save') {
    const me = await requireUser(req, env);
    if (method === 'GET') return json({ save: await player(env, me.user.id).getSave() });
    if (method === 'PUT') {
      const input = await body<{ base?: number; data?: Record<string, string> }>(req, env);
      if (!Number.isInteger(input.base) || !input.data || typeof input.data !== 'object') throw new HttpError(400, 'Send { base, data }.');
      for (const [k, v] of Object.entries(input.data)) if (typeof k !== 'string' || typeof v !== 'string') throw new HttpError(400, 'Save values are strings.');
      const result = await player(env, me.user.id).putSave(input.base!, input.data);
      if (result.ok) return json(result);
      if (result.reason === 'too-large') throw new HttpError(413, 'That save is too large.');
      return json(result, 409);
    }
  }

  // The player's state, which only the server changes: one action at a time, through the engine.
  if (path === '/api/state' && method === 'GET') {
    const me = await requireUser(req, env);
    return json(await stateReply(env, me.user.id));
  }
  if (path === '/api/act' && method === 'POST') {
    const me = await requireUser(req, env);
    // The pit boss's tools send a burst of actions at once (every charm to its top level): not limited.
    return actReply(req, env, me.user.id, { admin: me.user.role === 'admin', limited: me.user.role !== 'admin' });
  }

  // The pit boss's tuning, which the server decides rounds under.
  if (path === '/api/admin/tuning') {
    await requireAdmin(req, env);
    if (method === 'GET') return json({ tuning: await readTuning(env) });
    if (method === 'PUT') {
      const input = await body<{ tuning?: unknown }>(req, env);
      const tuning = cleanTuning(input.tuning);
      await env.DB.prepare('INSERT OR REPLACE INTO tuning (id, data, updated_at) VALUES (1, ?, ?)').bind(JSON.stringify(tuning), Date.now()).run();
      tuningCache = { at: Date.now(), tuning };
      return json({ tuning });
    }
  }

  // The pit boss: accounts, their saves and their state, for admins only.
  if (path === '/api/admin/users' && method === 'GET') {
    await requireAdmin(req, env);
    const { results } = await env.DB.prepare('SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC LIMIT 200').all();
    return json({ users: results });
  }
  const adminUser = path.match(/^\/api\/admin\/users\/([0-9a-f-]{36})\/(save|role|state|act)$/);
  if (adminUser) {
    await requireAdmin(req, env);
    const [, id, what] = adminUser as unknown as [string, string, string];
    if (what === 'save' && method === 'GET') return json({ save: await player(env, id).getSave() });
    if (what === 'state' && method === 'GET') return json(await stateReply(env, id));
    if (what === 'act' && method === 'POST') return actReply(req, env, id, { admin: true, limited: false });
    if (what === 'role' && method === 'PUT') {
      const input = await body<{ role?: string }>(req, env);
      if (input.role !== 'admin' && input.role !== 'player') throw new HttpError(400, 'Role is admin or player.');
      await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(input.role, id).run();
      return json({ ok: true });
    }
  }

  throw new HttpError(404, 'No such thing.');
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    // Everything but the API is the game itself.
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    try {
      return await route(req, env);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: 'Something went wrong on our side.' }, 500);
    }
  },
} satisfies ExportedHandler<Env>;
