import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, Clock, Sparkles, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { db, collection, addDoc, getDocs, query, orderBy, serverTimestamp, doc, getDoc, setDoc } from '../lib/firebase';

const LOCAL_KEY = (mediaId) => `comments_${mediaId}`;

// Deterministic avatar tint per author name — same name, same color, no library.
const AVATAR_GRADIENTS = [
  ['#a855f7', '#ec4899'],
  ['#38bdf8', '#6366f1'],
  ['#f59e0b', '#ef4444'],
  ['#10b981', '#38bdf8'],
  ['#ec4899', '#f59e0b'],
  ['#8b5cf6', '#38bdf8'],
];
const avatarTint = (name = '') => {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 997;
  const [a, b] = AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
  return `linear-gradient(135deg, ${a}, ${b})`;
};

function Avatar({ name, photo, size = 40 }) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full font-black text-white select-none"
      style={{
        width: size, height: size, fontSize: size * 0.4,
        background: photo ? undefined : avatarTint(name),
        boxShadow: '0 2px 10px rgba(0,0,0,0.35)',
      }}
      aria-hidden="true"
    >
      {photo ? <img src={photo} alt="" className="h-full w-full rounded-full object-cover" /> : initial}
    </div>
  );
}

export default function Comments({ mediaId }) {
  const { user } = useAuth();
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [postError, setPostError] = useState('');
  const [loading, setLoading] = useState(true);
  const [focused, setFocused] = useState(false);
  const [justPostedId, setJustPostedId] = useState(null);
  const inputRef = useRef(null);

  // Load comments: Firestore if signed in, localStorage otherwise
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        if (user) {
          const q = query(
            collection(db, 'comments', mediaId, 'messages'),
            orderBy('timestamp', 'asc')
          );
          const snap = await getDocs(q);
          if (!cancelled) {
            setComments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
          }
        } else {
          const stored = localStorage.getItem(LOCAL_KEY(mediaId));
          if (!cancelled) {
            setComments(stored ? JSON.parse(stored) : []);
          }
        }
      } catch {
        // Fallback to localStorage on error
        if (!cancelled) {
          const stored = localStorage.getItem(LOCAL_KEY(mediaId));
          setComments(stored ? JSON.parse(stored) : []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [mediaId, user]);

  const handlePost = async (e) => {
    e?.preventDefault();
    if (!newComment.trim()) return;

    const text = newComment.trim();
    setPostError('');

    const comment = {
      text,
      author: user?.displayName || 'Guest User',
      authorId: user?.uid || null,
      timestamp: Date.now(),
    };

    // Chronological append everywhere: Firestore loads asc and the list renders
    // newest-first via reverse(), so prepending here would flip guest order.
    const persistLocal = (c) => {
      const updated = [...comments, c];
      setComments(updated);
      localStorage.setItem(LOCAL_KEY(mediaId), JSON.stringify(updated));
      return updated;
    };

    try {
      if (user) {
        // Persist to Firestore
        const docRef = await addDoc(collection(db, 'comments', mediaId, 'messages'), {
          ...comment,
          authorPhoto: user?.photoURL || null,
          timestamp: serverTimestamp(),
        });
        setComments(prev => [...prev, { ...comment, authorPhoto: user?.photoURL || null, id: docRef.id, timestamp: Date.now() }]);
        setJustPostedId(docRef.id);
      } else {
        // Persist to localStorage for guests
        const localComment = { ...comment, id: Date.now().toString() };
        persistLocal(localComment);
        setJustPostedId(localComment.id);
      }
      // Clear the draft only after the comment is safely stored.
      setNewComment('');
    } catch {
      try {
        // Fallback: save locally
        const localComment = { ...comment, id: Date.now().toString() };
        persistLocal(localComment);
        setJustPostedId(localComment.id);
        setNewComment('');
      } catch {
        // Both backends failed: keep the draft so nothing is lost.
        setPostError('Could not save your comment. Your draft is kept — please try again.');
      }
    }
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handlePost(e);
    }
  };

  const timeAgo = (timestamp) => {
    if (!timestamp) return '';
    const ts = timestamp?.toMillis ? timestamp.toMillis() : timestamp;
    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const accent = 'var(--kz-accent, #a855f7)';
  const accentSoft = 'var(--kz-accent-soft, rgba(168,85,247,0.14))';

  return (
    <div id="comments" className="mt-12 border-t border-white/10 pt-10">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <span
          className="grid h-9 w-9 place-items-center rounded-xl text-white shadow-lg"
          style={{ background: 'var(--kz-gradient, linear-gradient(135deg, #a855f7, #38bdf8))' }}
        >
          <MessageSquare size={17} />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-bold leading-tight text-white">Discussion</h2>
          <p className="text-[12px] text-zinc-500">
            {comments.length > 0 ? `${comments.length} ${comments.length === 1 ? 'comment' : 'comments'} · join the conversation` : 'Share what you think'}
          </p>
        </div>
        {comments.length > 0 && (
          <span
            className="ml-auto rounded-full px-2.5 py-1 text-[11px] font-bold"
            style={{ color: accent, background: accentSoft }}
          >
            {comments.length}
          </span>
        )}
      </div>

      {/* Composer */}
      <form onSubmit={handlePost} className="mb-8">
        <div className="flex gap-3">
          {user?.photoURL ? (
            <Avatar name={user.displayName || 'You'} photo={user.photoURL} />
          ) : (
            <Avatar name={user?.displayName || 'Guest User'} />
          )}
          <div
            className="relative flex-1 rounded-2xl border transition-all duration-200"
            style={{
              borderColor: focused ? accent : 'rgba(255,255,255,0.10)',
              background: focused ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.03)',
              boxShadow: focused ? `0 0 0 3px ${accentSoft}` : 'none',
            }}
          >
            <textarea
              ref={inputRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={onKeyDown}
              placeholder={user ? 'Share your thoughts…' : 'What did you think about this?'}
              aria-label="Write a comment"
              maxLength={500}
              className="w-full resize-none bg-transparent p-4 pb-12 text-sm text-white placeholder:text-zinc-600 focus:outline-none min-h-[104px]"
            />
            {postError && (
              <p role="alert" className="px-4 pb-1 text-[12px] font-medium text-rose-400">{postError}</p>
            )}
            <div className="absolute inset-x-3 bottom-2.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] text-zinc-600">
                {!user && <><AlertCircle size={11} /> Sign in to keep comments across devices</>}
                {user && newComment.length > 0 && <span>{newComment.length}/500</span>}
              </span>
              <button
                type="submit"
                disabled={!newComment.trim()}
                className="group flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold transition-all active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                style={{
                  background: newComment.trim() ? 'var(--kz-gradient, linear-gradient(135deg, #a855f7, #ec4899))' : 'rgba(255,255,255,0.08)',
                  color: newComment.trim() ? '#fff' : '#a1a1aa',
                  boxShadow: newComment.trim() ? '0 4px 14px -4px var(--kz-accent, #a855f7)' : 'none',
                }}
              >
                <Send size={13} className="transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
                Post
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* List */}
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading comments">
            {[0, 1].map((i) => (
              <div key={i} className="flex gap-3.5" style={{ opacity: 1 - i * 0.35 }}>
                <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-white/[0.07]" />
                <div className="flex-1 space-y-2 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
                  <div className="h-3 w-28 animate-pulse rounded-full bg-white/[0.08]" />
                  <div className="h-3 w-full animate-pulse rounded-full bg-white/[0.06]" />
                  <div className="h-3 w-2/3 animate-pulse rounded-full bg-white/[0.05]" />
                </div>
              </div>
            ))}
          </div>
        ) : comments.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-12 text-center">
            <span
              className="mb-4 grid h-14 w-14 place-items-center rounded-2xl text-white"
              style={{ background: 'var(--kz-gradient, linear-gradient(135deg, #a855f7, #38bdf8))', opacity: 0.9, boxShadow: '0 8px 30px -8px var(--kz-accent, #a855f7)' }}
            >
              <Sparkles size={22} />
            </span>
            <p className="text-sm font-semibold text-white">No comments yet</p>
            <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-zinc-500">
              Be the first to share your thoughts. No spoilers, please — someone is always on episode one.
            </p>
            <button
              type="button"
              onClick={() => inputRef.current?.focus()}
              className="mt-4 rounded-full border px-4 py-1.5 text-[12px] font-semibold transition-colors hover:brightness-125"
              style={{ borderColor: accent, color: accent, background: accentSoft }}
            >
              Write the first comment
            </button>
          </div>
        ) : (
          [...comments].reverse().map((c) => {
            const isOwn = user && c.authorId && c.authorId === user.uid;
            return (
              <div
                key={c.id}
                className="group flex gap-3.5"
                style={justPostedId === c.id ? { animation: 'kzCommentIn 0.35s ease-out' } : undefined}
              >
                <Avatar name={c.author} photo={c.authorPhoto} />
                <div
                  className="min-w-0 flex-1 rounded-2xl rounded-tl-md border p-4 transition-colors"
                  style={{
                    background: isOwn ? accentSoft : 'rgba(255,255,255,0.03)',
                    borderColor: isOwn ? 'color-mix(in srgb, var(--kz-accent, #a855f7) 35%, transparent)' : 'rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[13px] font-bold text-white">{c.author}</span>
                    {isOwn && (
                      <span className="rounded-full px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide" style={{ color: accent, background: 'rgba(255,255,255,0.07)' }}>
                        You
                      </span>
                    )}
                    {!c.authorId && (
                      <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-zinc-500">
                        Guest
                      </span>
                    )}
                    <span className="ml-auto flex items-center gap-1 text-[11px] text-zinc-500">
                      <Clock size={10} /> {timeAgo(c.timestamp)}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-zinc-300">{c.text}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <style>{`
        @keyframes kzCommentIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
