import { useState, useEffect } from 'react';
import { Calendar, ChevronRight, Play, Sparkles, Bookmark, Tv } from 'lucide-react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

const TMDB_BASE = '/api/tmdb';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function Schedule() {
  const [scheduleType, setScheduleType] = useState('anime'); // 'anime' or 'tv'
  const [schedule, setSchedule] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState(DAYS[new Date().getDay()]);

  useEffect(() => {
    window.scrollTo(0, 0);
    setLoading(true);
    
    const fetchAiring = async () => {
      try {
        const url = scheduleType === 'anime' 
          ? `${TMDB_BASE}/discover/tv?with_genres=16&with_original_language=ja&sort_by=popularity.desc&page=1&first_air_date.gte=2024-01-01`
          : `${TMDB_BASE}/discover/tv?without_genres=16&sort_by=popularity.desc&page=1&first_air_date.gte=2024-01-01`;
          
        const res = await fetch(url);
        const data = await res.json();
        
        const grouped = {};
        DAYS.forEach(d => grouped[d] = []);
        
        (data.results || []).forEach((item) => {
          const date = item.first_air_date ? new Date(item.first_air_date) : null;
          const dayIndex = date ? date.getDay() : Math.floor(Math.random() * 7);
          grouped[DAYS[dayIndex]].push({ ...item, isTV: true });
        });
        
        setSchedule(grouped);
        setLoading(false);
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    };
    
    fetchAiring();
  }, [scheduleType]);

  const ScheduleItem = ({ item }) => {
    const [bookmarked, setBookmarked] = useState(() => localStorage.getItem(`bookmark_tv_${item.id}`) !== null);
    const toggleBookmark = (e) => {
      e.preventDefault(); e.stopPropagation();
      const next = !bookmarked;
      setBookmarked(next);
      const key = `bookmark_tv_${item.id}`;
      if (next) {
        localStorage.setItem(key, JSON.stringify({ ...item, isTV: true, timestamp: Date.now() }));
      } else {
        localStorage.removeItem(key);
      }
      window.dispatchEvent(new Event('storage'));
    };
    
    return (
      <div className="group flex gap-3 sm:gap-4 bg-white/5 border border-white/10 rounded-2xl p-3 sm:p-4 hover:bg-white/10 hover:border-orange-500/30 transition-all">
        <div className="w-20 sm:w-24 shrink-0 aspect-[2/3] rounded-xl overflow-hidden relative shadow-lg">
          {item.poster_path ? (
            <img src={`https://image.tmdb.org/t/p/w342${item.poster_path}`} alt={item.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" />
          ) : (
            <div className="w-full h-full bg-zinc-800 flex items-center justify-center"><Calendar className="text-zinc-600" /></div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center pb-2">
            <Link to={`/play/tv/${item.id}${item.name || item.original_name ? '?expectedTitle=' + encodeURIComponent(item.name || item.original_name || '') : ''}`} className="bg-orange-500 text-white p-2 rounded-full hover:scale-110 transition-transform shadow-[0_0_15px_rgba(249,115,22,0.5)]">
              <Play size={14} fill="currentColor" className="ml-0.5" />
            </Link>
          </div>
        </div>
        <div className="flex flex-col justify-center flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[8px] sm:text-[9px] font-black tracking-widest text-orange-400 uppercase bg-orange-500/10 px-1.5 sm:px-2 py-0.5 rounded border border-orange-500/20">Airing</span>
              <span className="text-[10px] sm:text-xs font-bold text-amber-400 flex items-center gap-1">★ {item.vote_average?.toFixed(1) || 'N/A'}</span>
            </div>
            <button onClick={toggleBookmark} className={`p-1.5 rounded-lg transition-all ${bookmarked ? 'bg-purple-600/20 text-purple-400 border border-purple-500/30' : 'bg-white/5 text-zinc-500 hover:text-white hover:bg-white/10 border border-white/5'}`} title="Watchlist">
              <Bookmark size={14} fill={bookmarked ? "currentColor" : "none"} />
            </button>
          </div>
          <h3 className="text-xs sm:text-sm font-bold text-white leading-tight mb-1.5 sm:mb-2 line-clamp-2">{item.name || item.title}</h3>
          <p className="text-[10px] sm:text-xs text-zinc-400 line-clamp-2 sm:line-clamp-3 leading-relaxed mb-2 sm:mb-3">{item.overview || 'No synopsis available.'}</p>
          <Link to={`/details/tv/${item.id}`} className="text-[10px] sm:text-xs font-bold text-zinc-500 hover:text-orange-400 flex items-center gap-1 mt-auto w-fit transition-colors">
            View Details <ChevronRight size={12} />
          </Link>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white font-sans pt-14 sm:pt-16">
      <Navbar />
      
      <div className="px-4 sm:px-6 py-8 sm:py-12 max-w-[1400px] mx-auto pb-24 lg:pb-12">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-orange-500/10 flex items-center justify-center border border-orange-500/20">
              <Calendar size={24} className="text-orange-400 sm:w-[28px] sm:h-[28px]" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-4xl font-black tracking-tight flex items-center gap-2 sm:gap-3">
                Schedule <Sparkles size={20} className="text-orange-400 sm:w-[24px] sm:h-[24px]" />
              </h1>
              <p className="text-zinc-500 text-xs sm:text-sm mt-0.5 sm:mt-1">Track ongoing series releases.</p>
            </div>
          </div>
          
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/10 w-fit">
            <button onClick={() => setScheduleType('anime')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${scheduleType === 'anime' ? 'bg-orange-500 text-white shadow-lg' : 'text-zinc-400 hover:text-white'}`}>
              <Sparkles size={14} /> Anime
            </button>
            <button onClick={() => setScheduleType('tv')} className={`px-5 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${scheduleType === 'tv' ? 'bg-blue-500 text-white shadow-lg' : 'text-zinc-400 hover:text-white'}`}>
              <Tv size={14} /> TV Shows
            </button>
          </div>
        </div>

        {/* Days Navigation */}
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto pb-6 hide-scrollbar mb-8 border-b border-white/5 snap-x">
          {DAYS.map(day => {
            const isActive = day === activeDay;
            const isToday = day === DAYS[new Date().getDay()];
            return (
              <button
                key={day}
                onClick={() => setActiveDay(day)}
                className={`relative px-5 py-3.5 sm:px-6 sm:py-4 rounded-2xl font-black text-[11px] sm:text-sm transition-all whitespace-nowrap snap-start border ${
                  isActive 
                    ? 'bg-orange-500/10 border-orange-500/30 text-orange-400 shadow-lg shadow-orange-500/5' 
                    : 'bg-white/5 border-transparent text-zinc-500 hover:text-white hover:bg-white/10'
                }`}
              >
                {day.slice(0, 3)}
                {isToday && (
                  <span className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-orange-500 border-2 border-zinc-950 rounded-full animate-pulse" />
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-6 animate-fadeUp">
            {schedule[activeDay]?.length > 0 ? (
              schedule[activeDay].map(item => (
                <ScheduleItem key={item.id} item={item} />
              ))
            ) : (
              <div className="col-span-full py-20 text-center bg-white/5 rounded-3xl border border-dashed border-white/10">
                <Calendar size={48} className="mx-auto mb-4 text-zinc-700" />
                <h3 className="text-xl font-bold text-white mb-2">No Releases Scheduled</h3>
                <p className="text-zinc-500">There are no major simulcasts scheduled for {activeDay}.</p>
              </div>
            )}
          </div>
        )}
      </div>
      
      <Footer />
    </div>
  );
}
