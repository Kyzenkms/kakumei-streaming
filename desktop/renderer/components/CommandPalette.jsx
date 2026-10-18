import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { House, MagnifyingGlass, Sparkle, FilmSlate, Television, CalendarBlank, BookmarkSimple, Scales } from '@phosphor-icons/react';

const ACTIONS = [
  { to: '/', label: 'Go Home', icon: House },
  { to: '/search', label: 'Search', icon: MagnifyingGlass },
  { to: '/anime', label: 'Anime', icon: Sparkle },
  { to: '/discover/movie', label: 'Movies', icon: FilmSlate },
  { to: '/discover/tv', label: 'Series', icon: Television },
  { to: '/schedule', label: 'Schedule', icon: CalendarBlank },
  { to: '/favourites', label: 'Watchlist', icon: BookmarkSimple },
  { to: '/legal', label: 'Legal', icon: Scales },
];

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen((v) => !v); }
      if (e.key === 'Escape') setOpen(false);
    };
    // Titlebar search pill opens the palette without keyboard.
    const onExternal = () => { setQ(''); setOpen(true); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('kakumei:palette', onExternal);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('kakumei:palette', onExternal); };
  }, []);

  if (!open) return null;
  const filtered = ACTIONS.filter((a) => a.label.toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="fixed inset-0 z-[10000] grid place-items-start bg-black/60 p-[12vh] backdrop-blur-sm" onClick={() => setOpen(false)}>
      <div className="w-full max-w-xl overflow-hidden rounded-2xl border" style={{ borderColor: 'var(--kz-border-strong)', background: 'var(--kz-surface-1)' }} onClick={(e) => e.stopPropagation()}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)}
               placeholder="Search commands…" className="w-full bg-transparent px-5 py-4 text-[15px] outline-none" />
        <div className="border-t" style={{ borderColor: 'var(--kz-border)' }}>
          {filtered.map(({ to, label, icon: Icon }) => (
            <button key={to} onClick={() => { navigate(to); setOpen(false); }}
                    className="flex w-full items-center gap-3 px-5 py-3 text-left text-sm hover:bg-white/[0.06]">
              <Icon size={18} /> {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
