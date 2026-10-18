import { Home, Tv, Bookmark, Calendar, Menu } from 'lucide-react';
import { NavLink, useLocation } from 'react-router-dom';

export default function BottomNav({ onMenuClick }) {
  const location = useLocation();

  const links = [
    { name: 'Home', icon: Home, path: '/' },
    { name: 'Schedule', icon: Calendar, path: '/schedule' },
    { name: 'Anime', icon: Tv, path: '/anime' },
    { name: 'Watchlist', icon: Bookmark, path: '/favourites' },
  ];

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-[100] bg-zinc-950/98 backdrop-blur-md border-t border-white/[0.06] pb-safe">
      <div className="flex items-center justify-around h-14 px-2">
        {links.map(({ name, icon: Icon, path }) => {
          const isActive = location.pathname === path;
          return (
            <NavLink
              key={name}
              to={path}
              className={({ isActive }) => `
                flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors duration-150
                ${isActive ? 'text-purple-400' : 'text-zinc-600'}
              `}
            >
              <div className={`
                p-1.5 rounded-xl transition-all duration-200
                ${isActive ? 'bg-purple-500/15 scale-105' : 'bg-transparent'}
              `}>
                <Icon size={19} strokeWidth={isActive ? 2.5 : 1.8} />
              </div>
              <span className={`text-[9px] font-bold tracking-tight transition-colors duration-150 ${isActive ? 'text-purple-400' : 'text-zinc-600'}`}>{name}</span>
            </NavLink>
          );
        })}

        <button
          onClick={onMenuClick}
          className="flex flex-col items-center justify-center gap-0.5 w-full h-full text-zinc-600 active:text-zinc-300 transition-colors"
        >
          <div className="p-1.5 bg-transparent rounded-xl">
            <Menu size={19} strokeWidth={1.8} />
          </div>
          <span className="text-[9px] font-bold tracking-tight">More</span>
        </button>
      </div>
    </div>
  );
}
