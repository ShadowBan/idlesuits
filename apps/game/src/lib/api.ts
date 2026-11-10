/** A request to the game's API that failed: its status, message and body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message);
  }
}

/** How long a request may go unanswered before it's given up on; a watched line can wait out its snap. */
const TIMEOUT_MS = 15_000;
const WATCH_TIMEOUT_MS = 150_000;

/** Calls the API: JSON in and out, the session cookie along. Throws an ApiError on any failure, or after no answer for a while. */
export async function api<T>(path: string, init: { method?: string; body?: unknown; keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: init.method ?? 'GET',
      credentials: 'same-origin',
      keepalive: init.keepalive,
      headers: init.body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(path === '/watch' ? WATCH_TIMEOUT_MS : TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the casino. Check your connection.');
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // Not JSON: a static host with no API.
    throw new ApiError(res.status || 404, 'No server here.');
  }
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string } | null)?.error ?? 'Something went wrong.', data);
  return data as T;
}
