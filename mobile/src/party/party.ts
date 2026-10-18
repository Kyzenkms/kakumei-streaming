// Watch party service for React Native.
//
// Wire-compatible with the web/desktop service (src/services/watchparty.js):
// same room ids (`kyzen-room-<code>`), same signaling broker, same ICE/TURN
// config and the same data-channel message protocol, so a phone can host or
// join a party created on the website (and vice versa) without either side
// knowing the other exists.
import {
  RTCPeerConnection,
  RTCIceCandidate,
  RTCSessionDescription,
} from 'react-native-webrtc';
import { SignalClient, randomToken, SignalMessage } from './signal';
import { encodeMsg, decodeMsg, concatBuffers } from './binary';

export type PartyMember = { peerId: string; username: string; isHost: boolean };

// Same ICE servers as the web service: our own coturn boxes first (UDP fast
// path + TCP for UDP-blocking carrier networks), public STUN then OpenRelay.
const ICE_SERVERS = [
  { urls: 'stun:137.23.45.53:3478' },
  {
    urls: [
      'turn:137.23.45.53:3478?transport=udp',
      'turn:137.23.45.53:3478?transport=tcp',
    ],
    username: 'kyzen',
    credential: 'WbpDznFC1Oe8XTxly3sBr2VR',
  },
  { urls: 'stun:13.48.248.209:3478' },
  {
    urls: [
      'turn:13.48.248.209:3478?transport=udp',
      'turn:13.48.248.209:3478?transport=tcp',
    ],
    username: 'kyzen',
    credential: 'WbpDznFC1Oe8XTxly3sBr2VR',
  },
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
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

const RTC_CONFIG: any = { iceServers: ICE_SERVERS, iceCandidatePoolSize: 4 };

type Listener = (data: any) => void;

type PeerLink = {
  pc: any;
  dc: any;
  pendingIce: any[];
  chunk: { total: number; parts: (ArrayBuffer | null)[]; count: number } | null;
};

function genRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let res = '';
  for (let i = 0; i < 6; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
  return res;
}

class PartyService {
  private signal: SignalClient | null = null;
  private links = new Map<string, PeerLink>();
  private hostLink: PeerLink | null = null;
  private rejoinTries = 0;
  isHost = false;
  roomId: string | null = null;
  username = 'Guest';
  members = new Map<string, PartyMember>();
  private listeners = new Map<string, Set<Listener>>();

  on(event: string, fn: Listener): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(fn);
    return () => this.listeners.get(event)?.delete(fn);
  }

  private emit(event: string, data?: any) {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(data);
      } catch {}
    });
  }

  private makeLink(pc: any): PeerLink {
    return { pc, dc: null, pendingIce: [], chunk: null };
  }

  // ── Host ────────────────────────────────────────────────────────────────

  async createRoom(username = 'Host', retries = 2): Promise<{ roomId: string }> {
    this.leave();
    this.username = username || 'Host';
    this.isHost = true;
    this.roomId = genRoomId();
    const peerId = 'kyzen-room-' + this.roomId.toLowerCase();

    const signal = new SignalClient(peerId);
    try {
      await signal.connect();
    } catch (e: any) {
      if (retries > 0) return this.createRoom(username, retries - 1);
      throw e;
    }
    this.signal = signal;
    signal.on('OFFER', (msg) => this.handleOffer(msg));
    signal.on('CANDIDATE', (msg) => this.handleCandidate(msg));
    signal.on('closed', () => this.handleSignalClosed());

    this.members.set(peerId, { peerId, username: this.username, isHost: true });
    this.emit('status', { connected: true, isHost: true, roomId: this.roomId });
    this.emit('members', Array.from(this.members.values()));
    return { roomId: this.roomId };
  }

  private handleSignalClosed() {
    if (!this.roomId) return;
    this.emit('status', { connected: false, disconnected: true, isHost: this.isHost });
  }

  private async handleOffer(msg: SignalMessage) {
    const src = msg.src;
    if (!src || !this.signal) return;
    const payload = msg.payload || {};

    const old = this.links.get(src);
    if (old) {
      try {
        old.dc?.close();
        old.pc?.close();
      } catch {}
      this.links.delete(src);
    }

    const pc = new RTCPeerConnection(RTC_CONFIG);
    const link = this.makeLink(pc);
    this.links.set(src, link);
    // Web initiator creates the channel with its label; we receive it here.
    pc.ondatachannel = (event: any) => {
      link.dc = event.channel;
      this.setupChannel(src, link);
    };
    pc.onicecandidate = (event: any) => {
      if (!event.candidate) return;
      this.signal?.send(
        'CANDIDATE',
        {
          candidate: {
            candidate: event.candidate.candidate,
            sdpMid: event.candidate.sdpMid,
            sdpMLineIndex: event.candidate.sdpMLineIndex,
          },
          type: 'data',
          connectionId: payload.connectionId,
        },
        src,
      );
    };
    pc.oniceconnectionstatechange = () => {
      const st = pc.iceConnectionState;
      if (st === 'failed' || st === 'closed' || st === 'disconnected') {
        this.dropPeer(src);
      }
    };

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      for (const ice of link.pendingIce.splice(0)) {
        try {
          await pc.addIceCandidate(ice);
        } catch {}
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.signal.send('ANSWER', { sdp: answer, type: 'data', connectionId: payload.connectionId }, src);
    } catch {
      this.dropPeer(src);
    }
  }

  private handleCandidate(msg: SignalMessage) {
    const src = msg.src;
    const cand = msg.payload?.candidate;
    if (!src || !cand) return;
    const link = this.isHost ? this.links.get(src) : this.hostLink;
    if (!this.isHost && msg.src !== this.hostPeerId()) return;
    if (!link) return;
    const ice = new RTCIceCandidate({
      candidate: cand.candidate,
      sdpMid: cand.sdpMid,
      sdpMLineIndex: cand.sdpMLineIndex,
    });
    link.pc
      .addIceCandidate(ice)
      .catch(() => {
        // Remote description may not be set yet on the host side; replay after.
        link.pendingIce.push(ice);
      });
  }

  private dropPeer(peerId: string) {
    const link = this.links.get(peerId);
    if (!link) return;
    try {
      link.dc?.close();
      link.pc?.close();
    } catch {}
    this.links.delete(peerId);
    const mem = this.members.get(peerId);
    if (mem) {
      this.emit('chat', {
        id: 'sys-' + Date.now(),
        sender: 'System',
        text: mem.username + ' left the party.',
        isSystem: true,
        timestamp: Date.now(),
      });
    }
    this.members.delete(peerId);
    this.broadcastMembers();
  }

  // ── Guest ───────────────────────────────────────────────────────────────

  private hostPeerId(): string {
    return 'kyzen-room-' + String(this.roomId || '').toLowerCase();
  }

  async joinRoom(roomId: string, username = 'Guest', retries = 3): Promise<{ roomId: string }> {
    this.leave();
    this.username = username || 'Guest';
    this.isHost = false;
    this.roomId = roomId.trim().toUpperCase();
    this.rejoinTries = retries;
    const hostPeerId = this.hostPeerId();

    return new Promise((resolve, reject) => {
      let settled = false;
      let joinTimer: ReturnType<typeof setTimeout>;
      const fail = (type: string, message: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(joinTimer);
        this.emit('error', { type, message });
        reject(new Error(message));
      };
      joinTimer = setTimeout(() => {
        fail('join-timeout', 'Host not reachable. Check the code, and make sure the host still has the party open.');
      }, 35000);

      const signal = new SignalClient();
      this.signal = signal;

      const pc = new RTCPeerConnection(RTC_CONFIG);
      const link = this.makeLink(pc);
      this.hostLink = link;

      pc.onicecandidate = (event: any) => {
        if (!event.candidate) return;
        signal.send(
          'CANDIDATE',
          {
            candidate: {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            },
            type: 'data',
            connectionId: this.offeringId,
          },
          hostPeerId,
        );
      };
      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState;
        if (st === 'failed' && !settled) {
          fail('ice-failed', 'Connected to signaling but could not establish a peer link (network/NAT blocked).');
        } else if ((st === 'disconnected' || st === 'closed') && settled) {
          this.emit('status', { connected: false, disconnected: true, isHost: false });
        }
      };

      signal.on('ANSWER', async (msg) => {
        if (msg.src !== hostPeerId) return;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(msg.payload.sdp));
          for (const ice of link.pendingIce.splice(0)) {
            try {
              await pc.addIceCandidate(ice);
            } catch {}
          }
        } catch {
          fail('answer-failed', 'Could not establish the party connection.');
        }
      });
      signal.on('CANDIDATE', (msg) => this.handleCandidate(msg));
      signal.on('EXPIRE', () => {
        fail('peer-unavailable', 'No party with that code. Make sure the host created the party and the code is exact.');
      });
      signal.on('error', (msg) => {
        if (!settled) fail('signal-down', msg?.payload?.msg || 'Could not reach the party server. Check your internet and try again.');
      });
      signal.on('closed', () => {
        if (!settled) {
          fail('signal-down', 'Could not reach the party server. Check your internet and try again.');
          return;
        }
        this.emit('status', { connected: false, disconnected: true, isHost: false });
      });

      (async () => {
        try {
          await signal.connect();
          const dc = pc.createDataChannel('dc', { ordered: true });
          link.dc = dc;
          dc.onopen = () => {
            if (settled) return;
            settled = true;
            clearTimeout(joinTimer);
            dc.send(encodeMsg({ type: 'JOIN', username: this.username }));
            dc.send(encodeMsg({ type: 'REQUEST_SYNC' }));
            this.emit('status', { connected: true, isHost: false, roomId: this.roomId });
            resolve({ roomId: this.roomId! });
          };
          this.setupChannel(hostPeerId, link);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          signal.send(
            'OFFER',
            {
              sdp: offer,
              type: 'data',
              connectionId: this.offeringId,
              label: 'dc',
              reliable: true,
              serialization: 'binary',
            },
            hostPeerId,
          );
        } catch (e: any) {
          fail('signal-down', e?.message || 'Could not reach the party server.');
        }
      })();
    });
  }

  private offeringId = randomToken('dc-');

  // ── Data channel ────────────────────────────────────────────────────────

  private setupChannel(peerId: string, link: PeerLink) {
    const dc = link.dc;
    if (!dc) return;
    dc.onmessage = (event: any) => {
      const raw = event.data;
      let data: any;
      try {
        data = typeof raw === 'string' ? JSON.parse(raw) : decodeMsg(raw);
      } catch {
        return;
      }
      if (!this.isHost) {
        const peerData = data?.__peerData;
        if (peerData?.type === 'close') {
          this.emit('status', { connected: false, disconnected: true, isHost: false });
          return;
        }
        this.handleGuestData(peerId, data);
        return;
      }
      // Host side: web guests may chunk messages >16KB (PeerJS chunker).
      const peerData = data?.__peerData;
      if (peerData?.type === 'chunk') {
        const merged = this.handleChunk(link, peerData, data.data);
        if (!merged) return;
        data = merged;
      } else if (peerData?.type === 'close') {
        this.dropPeer(peerId);
        return;
      }
      this.handleHostData(peerId, data);
    };
    dc.onclose = () => {
      if (this.isHost) {
        this.dropPeer(peerId);
        return;
      }
      this.emit('status', { connected: false, disconnected: true, isHost: false });
      this.emit('chat', {
        id: 'sys-' + Date.now(),
        sender: 'System',
        text: 'Host disconnected or room closed.',
        isSystem: true,
        timestamp: Date.now(),
      });
      if ((this.rejoinTries ?? 0) > 0 && this.roomId) {
        const left = this.rejoinTries - 1;
        const room = this.roomId;
        const user = this.username;
        setTimeout(() => {
          if (!this.roomId) return;
          this.joinRoom(room, user, left).catch(() => {});
        }, (3 - left) * 2000);
      }
    };
  }

  private handleChunk(link: PeerLink, peerData: any, part: any): any | null {
    const total = Number(peerData.total) || 0;
    if (!link.chunk || link.chunk.total !== total) {
      link.chunk = { total, parts: new Array(total).fill(null), count: 0 };
    }
    const idx = Number(peerData.n) || 0;
    const buf = part instanceof ArrayBuffer ? part : part?.buffer ?? new Uint8Array(part || []).buffer;
    if (link.chunk.parts[idx] === null) {
      link.chunk.parts[idx] = buf as ArrayBuffer;
      link.chunk.count++;
    }
    if (link.chunk.count < total) return null;
    const merged = concatBuffers(link.chunk.parts as ArrayBuffer[]);
    link.chunk = null;
    try {
      return decodeMsg(merged);
    } catch {
      return null;
    }
  }

  private handleHostData(peerId: string, data: any) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'JOIN') {
      this.members.set(peerId, { peerId, username: data.username || 'Friend', isHost: false });
      this.broadcastMembers();
      this.emit('chat', {
        id: 'sys-' + Date.now(),
        sender: 'System',
        text: (data.username || 'Friend') + ' joined the party!',
        isSystem: true,
        timestamp: Date.now(),
      });
    } else if (data.type === 'CHAT') {
      this.broadcast(data);
      this.emit('chat', data);
    } else if (data.type === 'REACTION') {
      this.broadcast(data);
      this.emit('reaction', data);
    } else if (data.type === 'REQUEST_SYNC') {
      this.emit('requestSync', { targetPeer: peerId });
    }
  }

  private handleGuestData(_peerId: string, data: any) {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'MEMBERS') {
      this.members = new Map((data.members || []).map((m: PartyMember) => [m.peerId, m]));
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
  }

  // ── Send API (same shapes as the web service) ──────────────────────────

  broadcast(data: any) {
    const payload = encodeMsg(data);
    if (!this.isHost) {
      try {
        if (this.hostLink?.dc?.readyState === 'open') this.hostLink.dc.send(payload);
      } catch {}
      return;
    }
    this.links.forEach((link) => {
      try {
        if (link.dc?.readyState === 'open') link.dc.send(payload);
      } catch {}
    });
  }

  private broadcastMembers() {
    const list = Array.from(this.members.values());
    this.broadcast({ type: 'MEMBERS', members: list });
    this.emit('members', list);
  }

  sendSync(state: 'playing' | 'paused', currentTime: number, mediaInfo: Record<string, any> = {}) {
    if (!this.isHost) return;
    this.broadcast({ type: 'SYNC', state, currentTime, mediaInfo, sentAt: Date.now() });
  }

  sendSeek(currentTime: number) {
    if (!this.isHost) return;
    this.broadcast({ type: 'SEEK', currentTime, sentAt: Date.now() });
  }

  requestSync() {
    if (this.isHost) return;
    this.broadcast({ type: 'REQUEST_SYNC' });
  }

  sendMediaChange(mediaType: string, mediaId: string, season = 1, episode = 1, title = '') {
    if (!this.isHost) return;
    this.broadcast({ type: 'MEDIA_CHANGE', mediaType, mediaId, season, episode, title, sentAt: Date.now() });
  }

  sendChat(text: string) {
    if (!text || !text.trim()) return;
    const msg = {
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      sender: this.username,
      text: text.trim(),
      timestamp: Date.now(),
      isHost: this.isHost,
    };
    this.broadcast({ type: 'CHAT', ...msg });
    this.emit('chat', msg);
  }

  sendReaction(emoji: string) {
    const reaction = {
      id: 'rx-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      sender: this.username,
      emoji,
      timestamp: Date.now(),
    };
    this.broadcast({ type: 'REACTION', ...reaction });
    this.emit('reaction', reaction);
  }

  leave() {
    this.links.forEach((link) => {
      try {
        link.dc?.close();
        link.pc?.close();
      } catch {}
    });
    this.links.clear();
    if (this.hostLink) {
      try {
        this.hostLink.dc?.close();
        this.hostLink.pc?.close();
      } catch {}
      this.hostLink = null;
    }
    this.signal?.destroy();
    this.signal = null;
    this.isHost = false;
    this.roomId = null;
    this.members.clear();
    this.emit('status', { connected: false, roomId: null });
  }
}

export const party = new PartyService();
