import { useEffect, useState } from 'react';
import { fetchAnilistTrending, fetchAnilistOngoing } from '@app/services/anilist';
import Rail from '../components/Rail';
import SyncButton from '@app/components/SyncButton';
import { Sparkle } from '@phosphor-icons/react';

const GENRES = ['Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 'Horror', 'Mystery', 'Psychological', 'Romance', 'Sci-Fi', 'Slice of Life', 'Sports', 'Supernatural', 'Thriller'];

function TopicRow({ title, loader }) {
  return <Rail title={title} loader={loader} />;
}

export default function Anime() {
  const [genre, setGenre] = useState('');
  const [heroFrom, setHeroFrom] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchAnilistTrending(1, 1, genre || null).then((l) => { if (alive && l?.length) setHeroFrom(l[0]); }).catch(() => {});
    return () => { alive = false; };
  }, [genre]);

  const heroBg = heroFrom?.backdrop_path || heroFrom?.poster_path;

  return (
    <div className="h-full overflow-y-auto">
      <section className="relative flex min-h-[42vh] flex-col justify-end overflow-hidden px-10 py-10">
        {heroBg && <img src={heroBg} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent" />
        <div className="relative">
          <div className="mb-3 flex items-center gap-3">
            <Sparkle size={18} style={{ color: 'var(--kz-accent)' }} />
            <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[var(--kz-text-secondary)]">AniList spotlight</span>
          </div>
          <h1 className="kz-display text-4xl font-bold text-white">Anime, tuned to you</h1>
          <p className="mt-2 max-w-xl text-sm text-[var(--kz-text-secondary)]">Trending, ongoing, and genre-curated rows synced with AniList / MyAnimeList taste.</p>
          <div className="mt-5 flex gap-2"><SyncButton type="anilist" /><SyncButton type="mal" /></div>
        </div>
      </section>

      <div className="flex flex-wrap gap-2 px-10 pb-2">
        {['', ...GENRES].map((g) => (
          <button key={g || 'all'} onClick={() => setGenre(g)}
                  className={`rounded-full border px-3.5 py-1.5 text-[12px] font-medium transition-colors ${genre === g ? 'nm-active-chip' : 'border-[var(--kz-border)] text-[var(--kz-text-muted)] hover:text-white hover:border-[var(--kz-border-strong, rgba(255,255,255,0.22))]'}`}>
            {g || 'All genres'}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-8 px-10 py-8">
        <TopicRow title="Trending Anime" loader={() => fetchAnilistTrending(1, 24, genre || null)} />
        <TopicRow title="Ongoing This Season" loader={() => fetchAnilistOngoing(1, 24, genre || null)} />
        <TopicRow title="Action & Adventure" loader={() => fetchAnilistTrending(1, 24, genre || 'Action')} />
        <TopicRow title="Fantasy Realms" loader={() => fetchAnilistTrending(1, 24, genre || 'Fantasy')} />
        <TopicRow title="Quiet & Beautiful" loader={() => fetchAnilistTrending(1, 24, genre || 'Slice of Life')} />
      </div>
    </div>
  );
}
