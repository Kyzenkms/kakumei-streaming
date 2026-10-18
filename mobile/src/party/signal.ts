// Minimal PeerJS-protocol signaling client.
//
// The web/desktop watch party runs on PeerJS against our own broker
// (stream.kyzenhub.site/myapp -> peerjs server :9000). PeerJS itself is a
// browser library; on React Native we only need its signaling wire protocol
// (plain JSON over a WebSocket) plus, separately, react-native-webrtc for the
// actual RTC connection. This class implements exactly the parts of the
// protocol the party uses: OPEN / OFFER / ANSWER / CANDIDATE / ID-TAKEN /
// EXPIRE / LEAVE + HEARTBEAT keepalive.

const PEER_HOST = 'stream.kyzenhub.site';
const PEER_PATH = '/myapp';
const PEER_KEY = 'peerjs';

export type SignalMessage = {
  type: string;
  src?: string;
  dst?: string;
  payload?: any;
};

type Handler = (msg: SignalMessage) => void;

export function randomToken(prefix = ''): string {
  return prefix + Math.random().toString(36).slice(2, 12) + Math.random().toString(36).slice(2, 6);
}

export class SignalClient {
  private ws: WebSocket | null = null;
  private token = randomToken('tk-');
  private handlers = new Map<string, Set<Handler>>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;

  constructor(private peerId?: string) {}

  on(type: string, fn: Handler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(fn);
    return () => this.handlers.get(type)?.delete(fn);
  }

  private emit(type: string, msg: SignalMessage) {
    this.handlers.get(type)?.forEach((fn) => {
      try {
        fn(msg);
      } catch {}
    });
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err: string) => {
        if (settled) return;
        settled = true;
        reject(new Error(err));
      };
      const url =
        `wss://${PEER_HOST}${PEER_PATH}/peerjs?key=${PEER_KEY}` +
        (this.peerId ? `&id=${encodeURIComponent(this.peerId)}` : '') +
        `&token=${this.token}&version=1.5.5`;
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch {
        fail('signal-unreachable');
        return;
      }
      this.ws = ws;
      ws.onopen = () => {
        this.pingTimer = setInterval(() => {
          try {
            ws.send(JSON.stringify({ type: 'HEARTBEAT' }));
          } catch {}
        }, 5000);
      };
      ws.onerror = () => {
        if (!settled) fail('signal-unreachable');
      };
      ws.onclose = () => {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
        if (!this.closed) this.emit('closed', { type: 'CLOSED' });
      };
      ws.onmessage = (ev) => {
        let msg: SignalMessage;
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (!msg || typeof msg.type !== 'string') return;
        if (msg.type === 'OPEN') {
          if (!settled) {
            settled = true;
            resolve();
          }
          return;
        }
        if (msg.type === 'ID-TAKEN') {
          fail('id-taken');
          return;
        }
        if (msg.type === 'ERROR') {
          if (!settled) fail(msg.payload?.msg || 'signal-error');
          this.emit('error', msg);
          return;
        }
        this.emit(msg.type, msg);
      };
    });
  }

  send(type: string, payload: any, dst?: string) {
    if (!this.ws) return;
    try {
      this.ws.send(JSON.stringify(dst ? { type, payload, dst } : { type, payload }));
    } catch {}
  }

  destroy() {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    try {
      this.ws?.send(JSON.stringify({ type: 'LEAVE' }));
    } catch {}
    try {
      this.ws?.close();
    } catch {}
    this.ws = null;
    this.handlers.clear();
  }
}
