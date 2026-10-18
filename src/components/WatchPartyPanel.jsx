import React, { useState, useEffect, useRef } from 'react';
import {
  Users,
  Copy,
  Check,
  Send,
  X,
  Radio,
  Smile,
  Crown,
  LogOut,
  RefreshCw,
  MessageSquare,
  Sparkles,
  Link,
  ChevronRight,
  Minus
} from 'lucide-react';
import { watchParty } from '../services/watchparty';
import KakumeiLogo from './KyzenLogo';
import MiniAvatar from './MiniAvatar';

const QUICK_EMOJIS = ['🔥', '❤️', '😂', '🍿', '😮', '👏', '🎉', '💀'];

export default function WatchPartyPanel({
  isOpen,
  onClose,
  currentTime,
  isPlaying,
  mediaTitle,
  mediaId,
  mediaType,
  season,
  episode,
  onRemoteSync,
  onRemoteSeek,
  onRemoteMediaChange,
  partyCodeFromUrl,
  onOpen,
}) {
  const [inParty, setInParty] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [roomId, setRoomId] = useState(partyCodeFromUrl || '');
  const [minimized, setMinimized] = useState(false);
  const [unread, setUnread] = useState(0);
  // Bubble only pesters users who opened the party before (or have unread
  // chat). Auto-joined guests get no floating overlay eating control taps.
  const [partyTouched, setPartyTouched] = useState(false);
  const isOpenRef = useRef(isOpen);
  const minimizedRef = useRef(minimized);
  isOpenRef.current = isOpen;
  minimizedRef.current = minimized;
  const [username, setUsername] = useState(() => localStorage.getItem('kyzen_wp_user') || 'User_' + Math.floor(100 + Math.random() * 900));
  const [myAvatar] = useState(() => localStorage.getItem('kyzen_avatar') || '');
  const [members, setMembers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [floatingReactions, setFloatingReactions] = useState([]);
  const [showEmoji, setShowEmoji] = useState(false);
  const messagesEndRef = useRef(null);
  // Resizable panel width (desktop only). Persisted, clamped 300–560px.
  const [panelWidth, setPanelWidth] = useState(() => {
    const v = parseInt(localStorage.getItem('kyzen_wp_width') || '350', 10);
    return Number.isFinite(v) ? Math.min(560, Math.max(300, v)) : 350;
  });
  const resizingRef = useRef(false);
  useEffect(() => {
    const onMove = (e) => {
      if (!resizingRef.current) return;
      const x = e.touches ? e.touches[0].clientX : e.clientX;
      const w = Math.min(560, Math.max(300, window.innerWidth - x - 16));
      setPanelWidth(w);
    };
    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.userSelect = '';
      try { localStorage.setItem('kyzen_wp_width', String(Math.round(panelWidth))); } catch {}
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [panelWidth]);
  const startResize = (e) => {
    resizingRef.current = true;
    document.body.style.userSelect = 'none';
    e.preventDefault();
  };
  const autoJoinTried = useRef(false);

  // Root positioning: a floating slide-over card on every platform — the
  // same look as the web app.
  const panelClass = () => {
    return 'wp-panel fixed z-50 flex flex-col overflow-hidden bg-zinc-950/98 backdrop-blur-2xl border border-white/10 shadow-2xl transition-[transform,opacity] duration-300 ease-in-out'
      + ' inset-x-3 bottom-3 top-auto h-[68vh] rounded-2xl'
      + ' sm:inset-x-auto sm:right-4 sm:top-4 sm:bottom-4 sm:h-auto sm:w-[var(--wp-w)] sm:rounded-2xl'
      + ((isOpen && !minimized) ? ' translate-y-0 sm:translate-x-0 opacity-100' : ' translate-y-[120%] sm:translate-y-0 sm:translate-x-[120%] opacity-0 pointer-events-none');
  };
  // Pasting a ?party=CODE link must join by itself — otherwise the guest sits
  // unsynced (no host events arrive) and it looks like "sync is broken".
  useEffect(() => {
    if (partyCodeFromUrl && !inParty && !autoJoinTried.current) {
      autoJoinTried.current = true;
      const code = partyCodeFromUrl.trim();
      if (!code) return;
      setRoomId(code.toUpperCase());
      setLoading(true);
      setError('');
      localStorage.setItem('kyzen_wp_user', localStorage.getItem('kyzen_wp_user') || username);
      watchParty.joinRoom(code, localStorage.getItem('kyzen_wp_user') || username).catch(() => {
        // Error surfaced via watchParty 'error' event; reset so manual retry works.
        autoJoinTried.current = false;
      }).finally(() => setLoading(false));
    }
  }, [partyCodeFromUrl, inParty]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (isOpen && !minimized) setUnread(0);
    if (isOpen) setPartyTouched(true);
  }, [isOpen, minimized]);

  useEffect(() => {
    if (partyCodeFromUrl && !inParty) {
      setRoomId(partyCodeFromUrl.toUpperCase());
    }
  }, [partyCodeFromUrl, inParty]);

  useEffect(() => {
    const unsubStatus = watchParty.on('status', ({ connected, isHost: hostFlag, roomId: id }) => {
      setInParty(connected);
      setIsHost(hostFlag);
      if (id) setRoomId(id);
      if (!connected) setError('');
    });

    const unsubMembers = watchParty.on('members', (list) => {
      setMembers(list || []);
    });

    const unsubChat = watchParty.on('chat', (msg) => {
      setMessages((prev) => [...prev.slice(-60), msg]);
      if (!msg.isSystem && (!isOpenRef.current || minimizedRef.current)) {
        setUnread((u) => u + 1);
      }
    });

    const unsubReaction = watchParty.on('reaction', ({ emoji, sender }) => {
      const rxId = 'rx-' + Date.now() + '-' + Math.random();
      const left = 20 + Math.random() * 60;
      setFloatingReactions((prev) => [...prev, { id: rxId, emoji, sender, left }]);
      setTimeout(() => {
        setFloatingReactions((prev) => prev.filter((r) => r.id !== rxId));
      }, 2500);
    });

    const unsubSync = watchParty.on('sync', (data) => {
      onRemoteSync?.(data);
    });

    const unsubSeek = watchParty.on('seek', (data) => {
      onRemoteSeek?.(data);
    });

    const unsubMediaChange = watchParty.on('mediaChange', (data) => {
      onRemoteMediaChange?.(data);
    });

    const unsubRequestSync = watchParty.on('requestSync', () => {
      if (watchParty.isHost) {
        watchParty.sendSync(isPlaying ? 'playing' : 'paused', currentTime, {
          mediaId,
          mediaType,
          season,
          episode,
          mediaTitle
        });
      }
    });

    const unsubError = watchParty.on('error', (err) => {
      setError(err?.message || 'Connection error. Please try again.');
      setLoading(false);
    });

    return () => {
      unsubStatus();
      unsubMembers();
      unsubChat();
      unsubReaction();
      unsubSync();
      unsubSeek();
      unsubMediaChange();
      unsubRequestSync();
      unsubError();
    };
  }, [currentTime, isPlaying, mediaId, mediaType, season, episode, mediaTitle, onRemoteSync, onRemoteSeek, onRemoteMediaChange]);

  useEffect(() => {
    if (inParty && isHost) {
      watchParty.sendSync(isPlaying ? 'playing' : 'paused', currentTime, {
        mediaId,
        mediaType,
        season,
        episode,
        mediaTitle
      });
    }
  }, [isPlaying, inParty, isHost, mediaId, season, episode]);

  const handleCreate = async () => {
    try {
      setLoading(true);
      setError('');
      localStorage.setItem('kyzen_wp_user', username);
      await watchParty.createRoom(username);
    } catch (e) {
      setError('Could not create room: ' + (e.message || 'Error'));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e) => {
    e?.preventDefault();
    if (!roomId.trim()) return;
    try {
      setLoading(true);
      setError('');
      localStorage.setItem('kyzen_wp_user', username);
      await watchParty.joinRoom(roomId.trim(), username);
    } catch (e) {
      setError('Could not connect to room. Check code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = () => {
    watchParty.leave();
    setInParty(false);
    setMembers([]);
    setMessages([]);
  };

  // Guests open this link on their own devices, so it must always be a public
  // https URL — never a file:// Electron path or localhost dev URL.
  const buildInviteUrl = () => {
    const cur = new URL(window.location.href);
    let path = cur.pathname;
    let search = cur.search;
    if (cur.hash && cur.hash.includes('/play/')) {
      // HashRouter (Electron app + desktop dev): #/play/tv/123?x=y
      const hashPath = cur.hash.slice(1);
      const qi = hashPath.indexOf('?');
      path = qi >= 0 ? hashPath.slice(0, qi) : hashPath;
      search = qi >= 0 ? hashPath.slice(qi) : '';
    }
    // Desktop uses /watch/ for the same screen; the web app serves /play/.
    path = path.replace(/^\/watch\//, '/play/');
    const params = new URLSearchParams(search);
    params.set('party', roomId);
    const isPublicWeb = cur.protocol.startsWith('http') && cur.hostname.endsWith('kyzenhub.site');
    if (isPublicWeb) return `${cur.origin}${path}?${params.toString()}`;
    const basePath = path.startsWith('/app/') ? path : `/app${path.startsWith('/') ? path : `/${path}`}`;
    return `https://stream.kyzenhub.site${basePath}?${params.toString()}`;
  };

  const copyPartyLink = async () => {
    if (!roomId) return;
    const link = buildInviteUrl();
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // file:// / non-secure contexts may lack clipboard API — legacy fallback.
      try {
        const ta = document.createElement('textarea');
        ta.value = link;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      } catch {
        setError('Copy failed — share this code manually: ' + roomId);
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSendMsg = (e) => {
    e?.preventDefault();
    if (!inputMsg.trim()) return;
    watchParty.sendChat(inputMsg.trim());
    setInputMsg('');
  };

  const sendEmojiReaction = (emoji) => {
    watchParty.sendReaction(emoji);
  };

  return (
    <>
      {/* Mini chat bubble — only for users who opened the party (or have
          unread chat). Auto-joined guests get no overlay blocking taps. */}
      {inParty && (!isOpen || minimized) && (partyTouched || unread > 0) && (
        <button
          onClick={() => { setMinimized(false); setUnread(0); onOpen?.(); }}
          title="Open party chat"
          aria-label="Open watch party chat"
          className="group fixed bottom-24 right-4 z-50 h-12 pl-1.5 pr-3.5 rounded-full bg-zinc-900/95 backdrop-blur-xl border border-white/10 shadow-[0_6px_24px_rgba(0,0,0,0.5)] active:scale-95 transition-all flex items-center gap-2"
          onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--kz-accent)')}
          onMouseLeave={(e) => (e.currentTarget.style.borderColor = '')}
        >
          <span className="relative flex items-center justify-center w-9 h-9 rounded-full shadow-inner"
            style={{ background: 'var(--kz-gradient, linear-gradient(135deg,#a855f7,#38bdf8))' }}>
            <Users size={16} className="text-white" />
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-zinc-900" />
          </span>
          <span className="text-xs font-bold text-white/90">Party</span>
          {unread > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center">
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      )}
      {/* Floating Animated Screen Reactions */}
      <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden">
        {floatingReactions.map((r) => (
          <div
            key={r.id}
            className="absolute bottom-20 flex flex-col items-center animate-[floatUp_2.4s_ease-out_forwards]"
            style={{ left: r.left + '%' }}
          >
            <span className="text-3xl drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)] filter scale-125">
              {r.emoji}
            </span>
            <span className="text-[10px] font-black text-white/90 bg-black/60 px-1.5 py-0.5 rounded-full backdrop-blur-sm mt-1">
              {r.sender}
            </span>
          </div>
        ))}
      </div>

      {/* Backdrop (mobile) — tap to dismiss so the panel doesn't feel like it
          hijacks the whole screen with no way out. */}
      {isOpen && !minimized && (
        <div
          onClick={onClose}
          className="wp-backdrop fixed inset-0 z-40 bg-black/50 backdrop-blur-sm sm:hidden transition-opacity"
        />
      )}

      {/* Main Slide-over Panel — a floating rounded card, not an edge-to-edge
          wall. Narrower, inset with margins, so it reads as a panel. */}
      <div
        style={{ '--wp-w': panelWidth + 'px' }}
        className={panelClass()}
      >
        {/* Desktop resize handle (drag left edge) */}
        <div
          onMouseDown={startResize}
          onTouchStart={startResize}
          title="Drag to resize"
          className="wp-resize hidden sm:block absolute left-0 top-0 bottom-0 w-1.5 -ml-0.5 cursor-ew-resize z-10 group/resize"
        >
          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-10 w-1 rounded-full bg-white/15 transition-colors" />
        </div>
        {/* Panel Header — compact single row */}
        <div className="px-3 py-2.5 flex items-center justify-between bg-white/[0.03]">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white shrink-0"
              style={{ background: 'var(--kz-gradient, linear-gradient(135deg,#a855f7,#38bdf8))' }}>
              <Users size={13} />
            </div>
            <h3 className="text-[13px] font-bold text-white truncate">Watch Party</h3>
            {inParty && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase bg-emerald-500/15 text-emerald-300 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live{members.length > 0 ? ` · ${members.length}` : ''}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5 shrink-0">
          {inParty && (
            <button
              onClick={() => setMinimized(true)}
              title="Minimize"
              aria-label="Minimize watch party"
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Minus size={16} />
            </button>
          )}
          <button
            onClick={onClose}
            aria-label="Close watch party"
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
          </div>
        </div>

        {/* Panel Content */}
        {!inParty ? (
          /* Lobby — one tight card: hero, identity row, host CTA, join row. */
          <div className="flex flex-1 flex-col justify-center gap-3 overflow-y-auto p-4">
            <div
              className="relative overflow-hidden rounded-2xl p-4"
              style={{ background: 'linear-gradient(150deg, var(--kz-accent-soft, rgba(168,85,247,0.16)) 0%, rgba(255,255,255,0.02) 68%)' }}
            >
              <span aria-hidden="true" className="pointer-events-none absolute -top-10 -right-8 h-28 w-28 rounded-full blur-3xl opacity-30"
                style={{ background: 'var(--kz-accent, #a855f7)' }} />
              <div className="relative flex items-center gap-3">
                <span
                  className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white"
                  style={{ background: 'var(--kz-gradient, linear-gradient(135deg,#a855f7,#38bdf8))', boxShadow: '0 10px 26px -10px var(--kz-accent, #a855f7)' }}
                >
                  <Users size={19} />
                </span>
                <div className="min-w-0">
                  <p className="text-[13.5px] font-bold text-white leading-tight">Watch together, in sync</p>
                  <p className="mt-1 text-[11px] leading-snug text-zinc-400">Start a room and share the code — playback and chat stay locked together.</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2.5 rounded-2xl bg-white/[0.05] p-1.5 pl-2.5">
              <MiniAvatar name={username} size={30} ring emoji={myAvatar} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Your nickname"
                maxLength={20}
                aria-label="Your nickname"
                className="min-w-0 flex-1 bg-transparent px-1.5 py-1.5 text-sm text-white placeholder:text-zinc-600 focus:outline-none"
                style={{ caretColor: 'var(--kz-accent, #a855f7)' }}
              />
            </div>

            <button
              onClick={handleCreate}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-2xl py-3 text-[13.5px] font-bold transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
              style={{ background: 'var(--kz-gradient, linear-gradient(135deg,#a855f7,#38bdf8))', color: 'var(--kz-on-accent, #fff)', boxShadow: '0 12px 32px -12px var(--kz-accent, #a855f7)' }}
            >
              <Sparkles size={16} className="shrink-0" /> {loading ? 'Starting…' : 'Start New Party'}
            </button>

            <div className="rounded-2xl bg-white/[0.04] p-2.5">
              <p className="mb-2 px-1.5 text-[10px] font-bold uppercase tracking-widest text-zinc-500">Have a party code?</p>
              <form onSubmit={handleJoin} className="flex items-center gap-1.5 rounded-xl bg-black/30 p-1 pl-3.5">
                <input
                  type="text"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                  placeholder="ABC123"
                  maxLength={8}
                  aria-label="Party code"
                  className="min-w-0 flex-1 bg-transparent py-2 font-mono text-sm font-bold uppercase tracking-[0.25em] text-white placeholder:text-zinc-600 focus:outline-none"
                  style={{ caretColor: 'var(--kz-accent, #a855f7)' }}
                />
                <button
                  type="submit"
                  disabled={loading || !roomId.trim()}
                  className="shrink-0 rounded-lg px-4 py-2 text-[12.5px] font-bold transition-all hover:brightness-110 active:scale-95 disabled:opacity-40"
                  style={{ background: 'var(--kz-accent, #a855f7)', color: 'var(--kz-on-accent, #fff)' }}
                >
                  Join
                </button>
              </form>
            </div>

            {error && (
              <div className="rounded-xl bg-rose-500/10 p-3 text-xs font-medium text-rose-300">
                {error}
              </div>
            )}
            <p className="mt-auto pt-1 text-center text-[10.5px] text-zinc-600">
              Synced playback + live chat, peer-to-peer
            </p>
          </div>
        ) : (
          /* Live Party View: Chat + Members + Controls */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Room Info Bar — compact: code · copy · (sync) · leave */}
            <div className="px-3 py-2 flex items-center gap-1.5">
              <span className="text-[11px] font-mono font-black px-2 py-1 rounded-md"
                style={{ color: 'var(--kz-accent, #c084fc)', background: 'var(--kz-accent-soft, rgba(168,85,247,0.14))' }}>
                {roomId}
              </span>
              <button
                onClick={copyPartyLink}
                title="Copy invite link"
                aria-label="Copy invite link"
                className="flex items-center gap-1 text-[11px] font-semibold text-zinc-300 hover:text-white bg-white/5 hover:bg-white/10 px-2 py-1 rounded-md transition-colors"
              >
                {copied ? <Check size={12} className="text-emerald-400" /> : <Copy size={12} />}
                <span>{copied ? 'Copied' : 'Invite'}</span>
              </button>
              {!isHost && (
                <button
                  onClick={() => watchParty.requestSync()}
                  title="Sync to host"
                  aria-label="Sync to host"
                  className="flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md transition-colors"
                  style={{ color: 'var(--kz-accent, #7dd3fc)', background: 'var(--kz-accent-soft, rgba(56,189,248,0.12))' }}
                >
                  <RefreshCw size={12} /> Sync
                </button>
              )}
              <button
                onClick={handleLeave}
                title="Leave Party"
                aria-label="Leave party"
                className="ml-auto p-1.5 rounded-md text-zinc-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              >
                <LogOut size={15} />
              </button>
            </div>

            {/* Member Chips */}
            <div className="px-3 py-1.5 flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {members.map((m) => (
                <div
                  key={m.peerId}
                  className="flex items-center gap-1.5 pl-0.5 pr-2 py-0.5 rounded-full bg-white/[0.06] text-[11px] font-medium text-zinc-300 shrink-0"
                  title={m.isHost ? `${m.username} (host)` : m.username}
                >
                  <MiniAvatar name={m.username} size={18} emoji={m.username === username ? myAvatar : ''} />
                  {m.isHost && <Crown size={10} className="text-amber-400 shrink-0" />}
                  <span className={m.username === username ? 'font-bold' : ''}>
                    {m.username}{m.username === username ? ' (you)' : ''}
                  </span>
                </div>
              ))}
            </div>

            {/* Live Chat Message Feed */}
            <div className="flex-1 overflow-y-auto px-3 py-2.5 space-y-1.5">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center gap-2">
                  <span
                    className="grid h-11 w-11 place-items-center rounded-2xl text-white"
                    style={{ background: 'var(--kz-gradient, linear-gradient(135deg,#a855f7,#38bdf8))', opacity: 0.85 }}
                  >
                    <MessageSquare size={19} />
                  </span>
                  <p className="text-[11px] text-zinc-500">Say hi or drop a reaction below.</p>
                </div>
              ) : (
                messages.map((m) => (
                  <div
                    key={m.id}
                    className={m.isSystem ? "text-center my-1.5 text-zinc-500 italic text-[10.5px]" : "text-xs"}
                  >
                    {m.isSystem ? (
                      <span className="inline-block bg-white/5 px-2 py-0.5 rounded-full">{m.text}</span>
                    ) : (
                      <div className={"flex flex-col " + (m.sender === username ? "items-end" : "items-start")}>
                        <div className="flex items-center gap-1 text-[9.5px] font-bold text-zinc-500 px-1 mb-0.5">
                          {m.isHost && <Crown size={9} className="text-amber-400" />}
                          {m.sender === username
                            ? <span style={{ color: 'var(--kz-accent, #c084fc)' }}>{m.sender}</span>
                            : <span className="text-zinc-400">{m.sender}</span>}
                          <span className="text-zinc-600 font-normal">{new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                        <div
                          className={"max-w-[80%] px-2.5 py-1.5 text-[12px] leading-snug rounded-2xl " + (m.sender === username
                            ? "rounded-br-sm text-white"
                            : "rounded-bl-sm bg-white/[0.06] text-zinc-200")}
                          style={m.sender === username ? { background: 'var(--kz-accent-soft, rgba(168,85,247,0.22))' } : undefined}
                        >
                          {m.text}
                        </div>
                      </div>
                    )}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Compact Input + inline emoji popover */}
            <form onSubmit={handleSendMsg} className="p-2 flex items-center gap-1.5 relative">
              <button
                type="button"
                onClick={() => setShowEmoji((s) => !s)}
                aria-label="Emoji reactions"
                className="p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition-colors shrink-0"
              >
                <Smile size={17} />
              </button>
              {showEmoji && (
                <div className="absolute bottom-full left-2 mb-2 p-1.5 rounded-2xl bg-zinc-900/95 backdrop-blur-xl border border-white/[0.08] shadow-2xl grid grid-cols-4 gap-0.5 z-20">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => { sendEmojiReaction(emoji); setShowEmoji(false); }}
                      className="p-1.5 hover:bg-white/10 active:scale-125 rounded-lg text-lg transition-transform"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              )}
              <input
                type="text"
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                placeholder="Message…"
                maxLength={140}
                className="flex-1 min-w-0 bg-white/[0.06] rounded-full px-3.5 py-2 text-xs text-white placeholder:text-zinc-600 focus:outline-none"
                style={{ caretColor: 'var(--kz-accent, #a855f7)' }}
              />
              <button
                type="submit"
                disabled={!inputMsg.trim()}
                aria-label="Send message"
                className="p-2 rounded-full transition-all active:scale-95 shrink-0 disabled:opacity-40"
                style={{ background: 'var(--kz-accent, #a855f7)', color: 'var(--kz-on-accent, #fff)' }}
              >
                <Send size={15} />
              </button>
            </form>
          </div>
        )}
      </div>

      <style>{`
        @keyframes floatUp {
          0% { opacity: 0; transform: translateY(20px) scale(0.6); }
          15% { opacity: 1; transform: translateY(0) scale(1.1); }
          80% { opacity: 1; transform: translateY(-120px) scale(1); }
          100% { opacity: 0; transform: translateY(-180px) scale(0.8); }
        }
      `}</style>
    </>
  );
}
