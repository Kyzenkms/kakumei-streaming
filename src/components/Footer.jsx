import KakumeiLogo from './KyzenLogo';
import { Link } from 'react-router-dom';
import { Zap, Film, Tv, Sparkles, Flame, Star, Shield, Heart, ExternalLink } from 'lucide-react';

const LINKS = {
  Browse: [
    { label: 'Movies',    path: '/discover/movie' },
    { label: 'TV Shows',  path: '/discover/tv' },
    { label: 'Anime',     path: '/anime' },
    { label: 'Popular',   path: '/discover/popular' },
    { label: 'Top Rated', path: '/discover/top-rated' },
  ],
  Legal: [
    { label: 'DMCA',           path: '/legal#dmca' },
    { label: 'Privacy Policy', path: '/legal#privacy' },
    { label: 'Terms',          path: '/legal#terms' },
    { label: 'Contact',        path: '/legal#contact' },
  ],
};

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-white/[0.06] bg-zinc-950/95 mt-16">
      <div className="px-4 sm:px-6 lg:px-8 pt-10 pb-8 max-w-[1400px] mx-auto">

        {/* Top grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-8 mb-10">

          {/* Brand */}
          <div className="col-span-2 sm:col-span-1">
            <div className="mb-4">
              <KakumeiLogo size={34} textClassName="text-base font-display" />
            </div>
            <p className="text-xs text-zinc-600 leading-relaxed max-w-[200px] mb-4">
              Your gateway to movies, TV shows, and anime across multiple streaming sources.
            </p>
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-emerald-500/8 border border-emerald-500/15 rounded-full">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
              <span className="text-xs font-medium text-emerald-400">All systems operational</span>
            </div>
          </div>

          {/* Link columns */}
          {Object.entries(LINKS).map(([heading, items]) => (
            <div key={heading}>
              <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-3">{heading}</h3>
              <ul className="space-y-2.5 list-none p-0 m-0">
                {items.map(({ label, path }) => (
                  <li key={label}>
                    <Link to={path} className="text-sm text-zinc-500 hover:text-zinc-200 transition-colors no-underline">
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Info */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-600 mb-3">Sources</h3>
            <div className="space-y-2.5">
              {[
                { icon: Shield, label: 'Ad Shield Active',      color: '#34d399' },
                { icon: Film,   label: '7 Streaming Sources',   color: '#a855f7' },
                { icon: Star,   label: 'TMDb Powered',          color: '#fbbf24' },
              ].map(({ icon: Icon, label, color }) => (
                <div key={label} className="flex items-center gap-2 text-xs text-zinc-600">
                  <Icon size={12} style={{ color }} /> {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="h-px bg-white/[0.06] mb-6" />

        {/* Bottom row */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-600">
          <span>© {year} Kakumei. All rights reserved.</span>
          <span className="flex items-center gap-1">
            Made with <Heart size={10} className="text-red-500 fill-red-500" /> for streamers
          </span>
          <span className="text-right leading-relaxed max-w-sm">
            This site does not host any content. All streams are provided by third-party sources.{' '}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="text-zinc-500 hover:text-zinc-300 transition-colors">
              Data © TMDb
            </a>
          </span>
        </div>
      </div>
    </footer>
  );
}