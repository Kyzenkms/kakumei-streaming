import { useEffect, useState } from 'react';
import { BookmarkSimple, Heart, ClockCounterClockwise } from '@phosphor-icons/react';
import MediaCard from '../components/MediaCard';

function scan(prefix) {
  return Object.keys(localStorage)
    .filter((k) => k.startsWith(prefix))
    .map((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } })
    .filter(Boolean)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
}

function Section({ title, icon: Icon, items }) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={18} style={{ color: 'var(--kz-accent)' }} />
        <h2 className="kz-display text-lg font-semibold text-white">{title}</h2>
        <span className="text-xs text-[var(--kz-text-muted)]">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="rounded-xl border border-dashed p-8 text-center text-sm text-[var(--kz-text-muted)]" style={{ borderColor: 'var(--kz-border)' }}>Nothing here yet.</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {items.map((it, i) => <MediaCard key={`${it.id}-${i}`} item={it} />)}
        </div>
      )}
    </section>
  );
}

export default function Favourites() {
  const [bookmarks, setBookmarks] = useState([]);
  const [likes, setLikes] = useState([]);
  const [recent, setRecent] = useState([]);
  const refresh = () => { setBookmarks(scan('bookmark_')); setLikes(scan('like_')); setRecent(scan('recent_')); };
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { refresh(); const fn = () => refresh(); window.addEventListener('storage', fn); return () => window.removeEventListener('storage', fn); }, []);

  return (
    <div className="h-full overflow-y-auto px-10 py-6">
      <h1 className="kz-display text-3xl font-bold text-white">Watchlist</h1>
      <p className="mb-8 text-sm text-[var(--kz-text-muted)]">Bookmarks, likes and continue-watching synced from the same local profile as the web app.</p>
      <Section title="Bookmarks" icon={BookmarkSimple} items={bookmarks} />
      <Section title="Liked" icon={Heart} items={likes} />
      <Section title="Recently Watched" icon={ClockCounterClockwise} items={recent} />
    </div>
  );
}
