import Peer from 'peerjs';

// ICE servers for WebRTC NAT traversal. STUN alone only works when at least one
// peer has a cone NAT — it FAILS across symmetric NATs (most mobile carriers,
// corporate/hotel/campus wifi, and many international ISPs), which is why the
// party "couldn't connect internationally". TURN relays the media/data through
// a public server when direct hole-punching fails, so it connects on any
// network on earth. transport=tcp on :443 additionally tunnels through firewalls
// that block UDP. These are the free OpenRelay (metered.ca) project servers.
const ICE_SERVERS = [
  // ── PRIMARY: coturn on our own app VPS (Mumbai — closest to most users).
  // Raw IP straight to the box: TURN can't go through Cloudflare's HTTP proxy.
  // UDP for the fast path, TCP:3478 to tunnel through UDP-blocking networks
  // (common on mobile carriers / Indian & Pakistani ISPs).
  { urls: 'stun:137.23.45.53:3478' },
  {
    urls: [
      'turn:137.23.45.53:3478?transport=udp',
      'turn:137.23.45.53:3478?transport=tcp',
    ],
    username: 'kyzen',
    credential: 'WbpDznFC1Oe8XTxly3sBr2VR',
  },
  // ── SECONDARY: our other VPS (Europe) — kept as fallback.
  { urls: 'stun:13.48.248.209:3478' },
  {
    urls: [
      'turn:13.48.248.209:3478?transport=udp',
      'turn:13.48.248.209:3478?transport=tcp',
    ],
    username: 'kyzen',
    credential: 'WbpDznFC1Oe8XTxly3sBr2VR',
  },
  // Public STUN for direct-path discovery.
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // ── BACKUP: OpenRelay, only used if our box is ever unreachable.
  {
    urls: [
      'turn:openrelay.metered.ca:443',
      'turn:openrelay.metered.ca:443?transport=tcp',
      'turns:openrelay.metered.ca:443?transport=tcp',
    ],
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

// Self-hosted PeerJS signaling on our own VPS (behind Caddy :443). The default
// PeerJS cloud broker is rate-limited and unreliable across regions (e.g.
// India ↔ Pakistan), which surfaced as "Host not reachable". Our own broker on
// the app's domain is globally reachable over 443.
const PEER_SERVER = {
  host: 'stream.kyzenhub.site',
  port: 443,
  path: '/myapp',
  secure: true,
  key: 'peerjs',
};

class WatchPartyService {
  constructor() {
    this.peer = null;
    this.connections = new Map();
    this.hostConnection = null;
    this.isHost = false;
    this.roomId = null;
    this.username = 'Guest';
    this.listeners = new Map();
    this.members = new Map();
  }

  on(event, fn) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  emit(event, data) {
    this.listeners.get(event)?.forEach(fn => {
      try { fn(data); } catch (e) { console.error('[WatchParty]', event, e); }
    });
  }

  genRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let res = '';
    for (let i = 0; i < 6; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    return res;
  }

  async createRoom(username = 'Host', retries = 2) {
    this.leave();
    this.username = username || 'Host';
    this.isHost = true;
    this.roomId = this.genRoomId();
    const peerId = 'kyzen-room-' + this.roomId.toLowerCase();

    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer(peerId, {
          ...PEER_SERVER,
          debug: 1,
          config: {
            iceServers: ICE_SERVERS,
            // Gather relay candidates too (not just host/srflx) so a symmetric-NAT
            // guest still gets a working path via TURN.
            iceCandidatePoolSize: 4,
          }
        });

        this.peer.on('open', (id) => {
          this.members.set(id, { peerId: id, username: this.username, isHost: true });
          this.emit('status', { connected: true, isHost: true, roomId: this.roomId });
          this.emit('members', Array.from(this.members.values()));
          resolve({ roomId: this.roomId, peerId: id });
        });

        this.peer.on('connection', (conn) => {
          this.setupHostPeerConnection(conn);
        });

        this.peer.on('error', (err) => {
          // Room id collision (reload/re-host race) — regen id and retry.
          if ((err?.type === 'unavailable-id' || err?.type === 'taken') && retries > 0) {
            try { this.peer.destroy(); } catch (_) {}
            this.peer = null;
            setTimeout(() => this.createRoom(username, retries - 1).then(resolve, reject), 500);
            return;
          }
          console.warn('[WatchParty] Peer error:', err);
          this.emit('error', err);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  setupHostPeerConnection(conn) {
    conn.on('open', () => {
      this.connections.set(conn.peer, conn);
    });

    conn.on('data', (data) => {
      if (!data || typeof data !== 'object') return;

      if (data.type === 'JOIN') {
        const member = { peerId: conn.peer, username: data.username || 'Friend', isHost: false };
        this.members.set(conn.peer, member);
        this.broadcastMembers();
        this.emit('chat', {
          id: 'sys-' + Date.now(),
          sender: 'System',
          text: (data.username || 'Friend') + ' joined the party! 🎉',
          isSystem: true,
          timestamp: Date.now()
        });
      } else if (data.type === 'CHAT') {
        this.broadcast(data);
        this.emit('chat', data);
      } else if (data.type === 'REACTION') {
        this.broadcast(data);
        this.emit('reaction', data);
      } else if (data.type === 'REQUEST_SYNC') {
        this.emit('requestSync', { targetPeer: conn.peer });
      }
    });

    conn.on('close', () => {
      const mem = this.members.get(conn.peer);
      if (mem) {
        this.emit('chat', {
          id: 'sys-' + Date.now(),
          sender: 'System',
          text: mem.username + ' left the party.',
          isSystem: true,
          timestamp: Date.now()
        });
      }
      this.members.delete(conn.peer);
      this.connections.delete(conn.peer);
      this.broadcastMembers();
    });
  }

  async joinRoom(roomId, username = 'Guest', retries = 3) {
    this.leave();
    this.username = username || 'Guest';
    this.isHost = false;
    this.roomId = roomId.trim().toUpperCase();
    this._rejoinTries = retries;
    const hostPeerId = 'kyzen-room-' + this.roomId.toLowerCase();

    return new Promise((resolve, reject) => {
      let settled = false;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(joinTimer);
        this.emit('error', err);
        reject(err);
      };
      // Don't hang forever when the host isn't up yet — surfaced as a
      // readable error so the panel can offer retry.
      // 15s was too tight: when a direct path fails, WebRTC must allocate a
      // TURN relay first, and across continents that round-trip alone can eat
      // most of it — so international pairs timed out even when TURN worked.
      const joinTimer = setTimeout(() => {
        fail({ type: 'join-timeout', message: 'Host not reachable. Check the code, and make sure the host still has the party open.' });
      }, 35000);
      try {
        this.peer = new Peer({
          ...PEER_SERVER,
          debug: 1,
          config: {
            iceServers: ICE_SERVERS,
            iceCandidatePoolSize: 4,
          }
        });

        this.peer.on('open', (myId) => {
          console.log('[WatchParty] signaling open, my id:', myId, '→ connecting to host', hostPeerId);
          const conn = this.peer.connect(hostPeerId, { reliable: true });
          this.hostConnection = conn;

          // ICE diagnostics: the #1 cause of "host not reachable" with signaling
          // working is the data channel's ICE failing to find a path (symmetric
          // NAT with no working TURN). PeerJS never surfaces this, so we watch
          // the underlying RTCPeerConnection and turn a silent hang into a clear
          // TURN-specific error. Logs are visible in the browser console.
          const watchIce = () => {
            const pc = conn.peerConnection;
            if (!pc) { setTimeout(watchIce, 300); return; }
            pc.oniceconnectionstatechange = () => {
              console.log('[WatchParty] ICE state:', pc.iceConnectionState);
              if ((pc.iceConnectionState === 'failed' || pc.iceConnectionState === 'disconnected') && !settled) {
                fail({ type: 'ice-failed', message: 'Connected to signaling but could not establish a peer link (network/NAT blocked). This usually means TURN relay is unreachable on your network.' });
              }
            };
          };
          watchIce();

          conn.on('open', () => {
            if (settled) return;
            settled = true;
            clearTimeout(joinTimer);
            console.log('[WatchParty] data channel OPEN — joined room', this.roomId);
            conn.send({ type: 'JOIN', username: this.username });
            // Snap to host position/state immediately on join.
            conn.send({ type: 'REQUEST_SYNC' });
            this.emit('status', { connected: true, isHost: false, roomId: this.roomId });
            resolve({ roomId: this.roomId });
          });

          conn.on('data', (data) => {
            if (!data || typeof data !== 'object') return;
            if (data.type === 'MEMBERS') {
              this.members = new Map(data.members.map(m => [m.peerId, m]));
              this.emit('members', data.members);
            } else if (data.type === 'SYNC') {
              this.emit('sync', data);
            } else if (data.type === 'SEEK') {
              this.emit('seek', data);
            } else if (data.type === 'MEDIA_CHANGE') {
              this.emit('mediaChange', data);
            } else if (data.type === 'CHAT') {
              this.emit('chat', data);
            } else if (data.type === 'REACTION') {
              this.emit('reaction', data);
            }
          });

          conn.on('close', () => {
            clearTimeout(joinTimer);
            if (!settled) {
              fail({ type: 'join-refused', message: 'Host closed the connection.' });
              return;
            }
            this.emit('status', { connected: false, disconnected: true, isHost: false });
            this.emit('chat', {
              id: 'sys-' + Date.now(),
              sender: 'System',
              text: 'Host disconnected or room closed.',
              isSystem: true,
              timestamp: Date.now()
            });
            // Auto-rejoin (host reloads, blips) with backoff, then give up.
            if ((this._rejoinTries ?? 0) > 0 && this.roomId) {
              const left = this._rejoinTries - 1;
              const room = this.roomId, user = this.username;
              setTimeout(() => {
                if (!this.roomId) return;
                this.joinRoom(room, user, left).catch(() => {});
              }, (3 - left) * 2000);
            }
          });

          conn.on('error', (err) => {
            fail(err);
          });
        });

        this.peer.on('error', (err) => {
          console.warn('[WatchParty] peer error:', err?.type, err?.message || err);
          // No host behind that code (yet) — surface cleanly instead of hanging.
          if (err?.type === 'peer-unavailable') {
            fail({ type: 'peer-unavailable', message: 'No party with that code. Make sure the host created the party and the code is exact.' });
            return;
          }
          // Signaling broker unreachable (network blocks wss, broker down).
          if (err?.type === 'network' || err?.type === 'server-error' || err?.type === 'socket-error' || err?.type === 'socket-closed') {
            fail({ type: 'signal-down', message: 'Could not reach the party server. Check your internet and try again.' });
            return;
          }
          fail(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  broadcast(data) {
    if (!this.isHost) {
      if (this.hostConnection && this.hostConnection.open) {
        this.hostConnection.send(data);
      }
      return;
    }
    this.connections.forEach(conn => {
      if (conn.open) {
        try { conn.send(data); } catch (e) {}
      }
    });
  }

  broadcastMembers() {
    const list = Array.from(this.members.values());
    this.broadcast({ type: 'MEMBERS', members: list });
    this.emit('members', list);
  }

  sendSync(state, currentTime, mediaInfo = {}) {
    if (!this.isHost) return;
    this.broadcast({
      type: 'SYNC',
      state,
      currentTime,
      mediaInfo,
      sentAt: Date.now()
    });
  }

  sendSeek(currentTime) {
    if (!this.isHost) return;
    this.broadcast({
      type: 'SEEK',
      currentTime,
      sentAt: Date.now()
    });
  }

  // Guest → host: "send me your exact state now". Host answers via the
  // requestSync → sendSync path the panel already runs.
  requestSync() {
    if (this.isHost) return;
    this.broadcast({ type: 'REQUEST_SYNC' });
  }

  sendMediaChange(mediaType, mediaId, season = 1, episode = 1, title = '') {
    if (!this.isHost) return;
    this.broadcast({
      type: 'MEDIA_CHANGE',
      mediaType,
      mediaId,
      season,
      episode,
      title,
      sentAt: Date.now()
    });
  }

  sendChat(text) {
    if (!text || !text.trim()) return;
    const msg = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      sender: this.username,
      text: text.trim(),
      timestamp: Date.now(),
      isHost: this.isHost
    };
    this.broadcast({ type: 'CHAT', ...msg });
    this.emit('chat', msg);
  }

  sendReaction(emoji) {
    const reaction = {
      id: 'rx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      sender: this.username,
      emoji,
      timestamp: Date.now()
    };
    this.broadcast({ type: 'REACTION', ...reaction });
    this.emit('reaction', reaction);
  }

  leave() {
    this.connections.forEach(conn => conn.close());
    this.connections.clear();
    if (this.hostConnection) {
      this.hostConnection.close();
      this.hostConnection = null;
    }
    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }
    this.isHost = false;
    this.roomId = null;
    this.members.clear();
    this.emit('status', { connected: false, roomId: null });
  }
}

export const watchParty = new WatchPartyService();
