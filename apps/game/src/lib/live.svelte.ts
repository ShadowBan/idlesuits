/** A keep-alive while the link is open (answered by the server without waking anything). */
const PING_MS = 45_000;
/** An action unanswered this long on the link goes by a plain request instead. */
const REPLY_MS = 20_000;

interface Waiting {
  resolve: (reply: { state: unknown; result: unknown }) => void;
  reject: (error: LinkError) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** An action the server turned down over the link: its message and status, as a request would have had. */
export class LinkError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * A member's live link to their own server: a WebSocket, open while the
 * casino is shown, that carries their actions. Each costs the server a
 * fraction of a request. Closed while the page is hidden (a hidden casino
 * sends nothing), and reopened when it's shown. When it isn't open, actions
 * go by plain requests, so nothing waits on it.
 */
class LiveLink {
  /** The link is open and ready for actions. */
  open = $state(false);
  private socket: WebSocket | null = null;
  private wanted = false;
  private retry = 0;
  private next = 1;
  private waiting = new Map<number, Waiting>();
  private ping: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof document === 'undefined') return;
    document.addEventListener('visibilitychange', () => (document.visibilityState === 'visible' ? this.connect() : this.drop()));
  }

  /** Signed in: keep a link open while the page is shown. */
  start() {
    this.wanted = true;
    this.connect();
  }

  /** Signed out: no link. */
  stop() {
    this.wanted = false;
    this.drop();
  }

  private connect() {
    if (!this.wanted || this.socket || typeof WebSocket === 'undefined' || document.visibilityState !== 'visible') return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/live`);
    } catch {
      return;
    }
    this.socket = ws;
    ws.onopen = () => {
      if (this.socket !== ws) return;
      this.open = true;
      this.retry = 0;
      this.ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('ping'), PING_MS);
    };
    ws.onmessage = (e) => {
      if (typeof e.data !== 'string' || e.data === 'pong') return;
      let msg: { n?: number; state?: unknown; result?: unknown; error?: string; status?: number };
      try {
        msg = JSON.parse(e.data);
      } catch {
        return;
      }
      const w = typeof msg.n === 'number' ? this.waiting.get(msg.n) : undefined;
      if (!w) return;
      this.waiting.delete(msg.n!);
      clearTimeout(w.timer);
      if (msg.error) w.reject(new LinkError(msg.error, msg.status ?? 400));
      else w.resolve({ state: msg.state, result: msg.result });
    };
    ws.onclose = () => {
      if (this.socket === ws) this.socket = null;
      this.open = false;
      if (this.ping) clearInterval(this.ping);
      this.ping = null;
      // Anything still waiting goes by a plain request instead.
      for (const [n, w] of this.waiting) {
        clearTimeout(w.timer);
        w.reject(new LinkError('The live link closed.', 0));
        this.waiting.delete(n);
      }
      if (this.wanted && document.visibilityState === 'visible') setTimeout(() => this.connect(), Math.min(60_000, 2_000 * 2 ** this.retry++));
    };
  }

  private drop() {
    const ws = this.socket;
    this.socket = null;
    this.open = false;
    try {
      ws?.close(1000, 'hidden');
    } catch {
      // Already closed.
    }
  }

  /**
   * Sends an action over the link and waits for its answer. Rejects with
   * status 0 if the link isn't open or doesn't answer in time: the caller
   * sends it by a plain request then.
   */
  send(action: unknown): Promise<{ state: unknown; result: unknown }> {
    const ws = this.socket;
    if (!ws || !this.open || ws.readyState !== WebSocket.OPEN) return Promise.reject(new LinkError('No live link.', 0));
    const n = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(n);
        reject(new LinkError('No answer on the live link.', 0));
      }, REPLY_MS);
      this.waiting.set(n, { resolve, reject, timer });
      ws.send(JSON.stringify({ n, action }));
    });
  }
}

export const live = new LiveLink();
