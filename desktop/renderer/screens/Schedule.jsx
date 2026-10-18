import { useEffect, useState } from 'react';
import { CalendarBlank, Television, Sparkle } from '@phosphor-icons/react';
import MediaCard from '../components/MediaCard';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TMDB_BASE = '/api/tmdb';

export default function Schedule() {
  const [type, setType] = useState('anime');
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState(DAYS[new Date().getDay()]);

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    const url = type === 'anime'
      ? `${TMDB_BASE}/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=1&first_air_date.gte=2024-01-01`
      : `${TMDB_BASE}/discover/tv?without_genres=16&sort_by=popularity.desc&page=1&first_air_date.gte=2024-01-01`;
    fetch(url).then(r => r.json()).then(data => {
      if (!alive) return;
      const grouped = {}; DAYS.forEach(d => grouped[d] = []);
      const today = DAYS[new Date().getDay()];
      (data.results || []).forEach(item => {
        const d = item.first_air_date ? new Date(item.first_air_date) : null;
        grouped[DAYS[d ? d.getDay() : DAYS.indexOf(today)]].push({ ...item, isTV: true });
      });
      setSchedule(grouped); setLoading(false);
    }).catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [type]);

  return (
    <div className="flex h-full flex-col overflow-y-auto px-10 py-6">
      <div className="mb-5 flex items-center gap-4">
        <CalendarBlank size={28} style={{ color: 'var(--kz-accent)' }} />
        <div>
          <h1 className="kz-display text-3xl font-bold text-white">Airing Schedule</h1>
          <p className="text-sm text-[var(--kz-text-muted)]">When the next simulcasts land.</p>
        </div>
      </div>

      <div className="mb-5 flex gap-2">
        <button onClick={() => setType('anime')} className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors ${type === 'anime' ? 'nm-active-chip' : 'border-[var(--kz-border)] text-[var(--kz-text-muted)] hover:text-white hover:border-[var(--kz-border-strong, rgba(255,255,255,0.22))]'}`}><Sparkle size={14}/> Anime</button>
        <button onClick={() => setType('tv')} className={`flex items-center gap-2 rounded-full border px-4 py-1.5 text-[13px] font-medium transition-colors ${type === 'tv' ? 'nm-active-chip' : 'border-[var(--kz-border)] text-[var(--kz-text-muted)] hover:text-white hover:border-[var(--kz-border-strong, rgba(255,255,255,0.22))]'}`}><Television size={14}/> TV</button>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {DAYS.map(d => (
          <button key={d} onClick={() => setActiveDay(d)} className={`rounded-full border px-4 py-1.5 text-[12px] font-medium transition-colors ${activeDay === d ? 'nm-active-chip' : 'border-[var(--kz-border)] text-[var(--kz-text-muted)] hover:text-white hover:border-[var(--kz-border-strong, rgba(255,255,255,0.22))]'}`}>{d.slice(0, 3)}</button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="aspect-[2/3] rounded-lg kz-skeleton" />)}</div>
      ) : schedule[activeDay]?.length > 0 ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-5">{schedule[activeDay].map((it, idx) => <MediaCard key={`${it.id}-${idx}`} item={it} />)}</div>
      ) : (
        <p className="py-20 text-center text-sm text-[var(--kz-text-muted)]">No major simulcasts scheduled for {activeDay}.</p>
      )}
    </div>
  );
}
