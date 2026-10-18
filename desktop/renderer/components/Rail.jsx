import { useEffect, useRef, useState } from 'react';
import { CaretLeft, CaretRight, CaretDown } from '@phosphor-icons/react';
import { loadUiPrefs, saveUiPrefs } from '../ui-prefs';
import MediaCard from './MediaCard';

// Horizontal content rail — minimizable to its header (persisted), with
// scroll affordances and a skeleton loading state.
export default function Rail({ railKey, title, loader }) {
  const [items, setItems] = useState(null); // null = loading, [] = empty
  const [collapsed, setCollapsed] = useState(() => !!loadUiPrefs().collapsedRails[railKey]);
  const scroller = useRef(null);

  useEffect(() => {
    let alive = true;
    Promise.resolve(loader())
      .then((d) => {
        if (!alive) return;
        const list = Array.isArray(d) ? d.filter((x) => x && x.id) : [];
        // Same TMDB id can appear twice (movie + tv rows, merged lists) —
        // dedupe so React keys stay unique and cards aren't omitted.
        const seen = new Set();
        setItems(list.filter((x) => {
          const k = `${x.id}-${x.media_type || ''}`;
          if (seen.has(k)) return false;
          seen.add(k);
          return true;
        }));
      })
      .catch(() => { if (alive) setItems([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  // Pick up collapse changes made in Settings while Home is open.
  useEffect(() => {
    const sync = () => setCollapsed(!!loadUiPrefs().collapsedRails[railKey]);
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, [railKey]);

  const toggle = () => {
    const prefs = loadUiPrefs();
    const next = { ...prefs.collapsedRails, [railKey]: !collapsed };
    if (collapsed) delete next[railKey];
    setCollapsed(!collapsed);
    saveUiPrefs({ ...prefs, collapsedRails: next });
  };

  const nudge = (dir) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' });
  };

  if (items && items.length === 0) return null; // hide empty rails rather than show a dead row

  return (
    <section className="group/rail">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={toggle} title={collapsed ? `Expand ${title}` : `Minimize ${title}`} aria-expanded={!collapsed}
          className="flex items-center gap-1.5 kz-focus-ring">
          <h2 className="kz-display text-[17px] font-semibold text-[var(--kz-text)]">{title}</h2>
          <CaretDown size={15} weight="bold" className="text-[var(--kz-text-muted)] transition-transform duration-200" style={{ transform: collapsed ? 'rotate(-90deg)' : 'none' }} />
        </button>
        {!collapsed && (
          <div className="flex gap-1 opacity-0 transition-opacity duration-200 group-hover/rail:opacity-100">
            <button aria-label="Scroll left" onClick={() => nudge(-1)}
              className="grid h-8 w-8 place-items-center rounded-lg text-[var(--kz-text-secondary)] hover:text-white hover:bg-white/[0.06] kz-focus-ring">
              <CaretLeft size={16} weight="bold" />
            </button>
            <button aria-label="Scroll right" onClick={() => nudge(1)}
              className="grid h-8 w-8 place-items-center rounded-lg text-[var(--kz-text-secondary)] hover:text-white hover:bg-white/[0.06] kz-focus-ring">
              <CaretRight size={16} weight="bold" />
            </button>
          </div>
        )}
      </div>
      {!collapsed && (
        <div ref={scroller} className="flex gap-4 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items === null
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[2/3] w-[150px] shrink-0 rounded-lg kz-skeleton" />
              ))
            : items.map((it, idx) => <MediaCard key={`${it.id}-${it.media_type || ''}-${idx}`} item={it} />)}
        </div>
      )}
    </section>
  );
}
