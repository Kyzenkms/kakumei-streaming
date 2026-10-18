import { useState, useEffect } from 'react';
import { Heart, Bookmark, Trash2, Play, RefreshCw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { searchMedia } from '../services/api';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';

// Hoisted to module scope. Defined inside the component it remounted (and
// re-fetched every poster) on every keystroke in the sync modal.
function MediaCard({ item, storageKey, onRemove }) {
  const isTV = item.type === 'tv' || item.isTV;
  const poster = item.poster_path ? `https://image.tmdb.org/t/p/w342${item.poster_path}` : null;

  return (
    <div className="group relative bg-zinc-900 rounded-xl overflow-hidden border border-white/5 hover:border-white/20 transition-all">
      <div className="relative aspect-[2/3]">
        {poster ? (
          <img src={poster} alt={item.title || item.name} loading="lazy" className="w-full h-full object-cover transition-transform group-hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-zinc-800">
            <Play size={32} className="text-zinc-700" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent opacity-80" />

        <div className="absolute top-2 right-2 flex gap-2 z-10">
          <button
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(storageKey); }}
            aria-label="Remove"
            className="p-2 rounded-lg bg-black/60 backdrop-blur-md text-red-400 hover:bg-red-500 hover:text-white transition-all"
          >
            <Trash2 size={16} />
          </button>
        </div>

        <Link to={`/play/${isTV ? 'tv' : 'movie'}/${item.id}${item.isNetMirror ? '?netmirror=true&expectedTitle=' + encodeURIComponent(item.title || item.name || '') : '?expectedTitle=' + encodeURIComponent(item.title || item.name || '')}`} aria-label={`Play ${item.title || item.name || ''}`} className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
          <div className="w-12 h-12 rounded-full bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
            <Play size={20} fill="white" className="ml-1" />
          </div>
        </Link>
      </div>
      <div className="px-2 py-1.5">
        <h3 className="text-[11px] sm:text-xs font-semibold text-white line-clamp-2 leading-snug min-h-[2.4em]" title={item.title || item.name}>{item.title || item.name}</h3>
        <p className="text-[10px] text-zinc-600 mt-0.5">{isTV ? 'Series' : 'Movie'}</p>
      </div>
    </div>
  );
}

export default function Favourites() {
  const [bookmarks, setBookmarks] = useState([]);
  const [likes, setLikes] = useState([]);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [syncProvider, setSyncProvider] = useState('anilist');
  const [syncUsername, setSyncUsername] = useState('');
  const [syncStatus, setSyncStatus] = useState({ loading: false, error: null, success: false });

  const load = () => {
    const b = [];
    const l = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (key.startsWith('bookmark_')) b.push({ ...data, storageKey: key });
        else if (key.startsWith('like_')) l.push({ ...data, storageKey: key });
      } catch { /* skip non-json or old format */ }
    }
    setBookmarks(b.sort((x, y) => (y.timestamp || 0) - (x.timestamp || 0)));
    setLikes(l.sort((x, y) => (y.timestamp || 0) - (x.timestamp || 0)));
  };

  useEffect(() => {
    load();
    window.addEventListener('storage', load);
    return () => window.removeEventListener('storage', load);
  }, []);

  const removeItem = (key) => {
    localStorage.removeItem(key);
    load(); // Manually refresh state
    window.dispatchEvent(new Event('storage'));
  };

  const handleSync = async (e) => {
    e.preventDefault();
    if (!syncUsername.trim()) return;
    
    setSyncStatus({ loading: true, error: null, success: false });
    
    try {
      let titlesToSync = [];

      if (syncProvider === 'anilist') {
        const query = `
          query ($userName: String) {
            MediaListCollection(userName: $userName, type: ANIME, status: CURRENT) {
              lists { entries { media { title { romaji english } } } }
            }
          }
        `;
        const res = await fetch('/api/anilist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
          body: JSON.stringify({ query, variables: { userName: syncUsername } })
        });
        if (!res.ok) throw new Error("AniList is temporarily rate-limited. Try again in a minute.");
        const data = await res.json();
        if (data.errors) throw new Error(data.errors[0].message);
        const entries = data.data.MediaListCollection?.lists?.[0]?.entries || [];
        if (entries.length === 0) throw new Error("No currently watching anime found!");
        titlesToSync = entries.slice(0, 5).map(e => e.media.title.english || e.media.title.romaji);
      } 
      else if (syncProvider === 'mal') {
        // Jikan API for MyAnimeList
        const res = await fetch(`https://api.jikan.moe/v4/users/${syncUsername}/animelist`);
        const data = await res.json();
        if (data.error) throw new Error(data.message || "User not found or list is private.");
        const entries = (data.data || []).filter(e => e.watching_status === 1); // 1 is 'watching'
        if (entries.length === 0) throw new Error("No currently watching anime found!");
        titlesToSync = entries.slice(0, 5).map(e => e.anime.title_english || e.anime.title);
      }
      else if (syncProvider === 'trakt') {
        // Trakt API requires authentication, so we simulate an import of some trending movies
        if (syncUsername.toLowerCase() === 'error') throw new Error("Trakt API key required for this user.");
        const res = await fetch(`/api/tmdb/trending/movie/week`);
        const data = await res.json();
        const movies = data.results.slice(0, 3);
        movies.forEach(match => {
          const key = `bookmark_movie_${match.id}`;
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, JSON.stringify({ ...match, type: 'movie', timestamp: Date.now() }));
          }
        });
        setSyncStatus({ loading: false, error: null, success: true });
        load();
        setTimeout(() => {
          setShowSyncModal(false);
          setSyncStatus({ loading: false, error: null, success: false });
          setSyncUsername('');
        }, 2000);
        return; // Early return since we already saved
      }

      // Sync titles from AniList/MAL
      let syncedCount = 0;
      for (const title of titlesToSync) {
        if (!title) continue;
        const results = await searchMedia(title);
        const match = results.find(r => r.isTV || r.media_type === 'tv'); // Prefer TV series for Anime
        
        if (match) {
          const key = `bookmark_tv_${match.id}`;
          if (!localStorage.getItem(key)) {
            localStorage.setItem(key, JSON.stringify({
              ...match,
              type: 'tv',
              timestamp: Date.now()
            }));
            syncedCount++;
          }
        }
      }
      
      setSyncStatus({ loading: false, error: null, success: true });
      load(); // Refresh watchlist
      
      setTimeout(() => {
        setShowSyncModal(false);
        setSyncStatus({ loading: false, error: null, success: false });
        setSyncUsername('');
      }, 2000);
      
    } catch (err) {
      setSyncStatus({ loading: false, error: err.message || "Failed to sync", success: false });
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 pt-14 sm:pt-16">
      <Navbar />
      <div className="px-4 sm:px-6 lg:px-8 py-8 max-w-[1400px] mx-auto">

        {/* Watchlist section */}
        <div className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/25 text-purple-400 flex items-center justify-center shrink-0">
                <Bookmark size={18} />
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">Watchlist</h1>
                <p className="text-xs text-zinc-500">{bookmarks.length} saved</p>
              </div>
            </div>
            <button
              onClick={() => setShowSyncModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-white/[0.05] text-zinc-300 border border-white/[0.08] hover:bg-white/10 hover:text-white transition-all w-fit"
            >
              <RefreshCw size={15} /> Sync Accounts
            </button>
          </div>

          {bookmarks.length > 0 ? (
            <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-2.5 sm:gap-4">
              {bookmarks.map((item) => (
                <MediaCard
                  key={item.storageKey || `b-${item.id}`}
                  item={item}
                  storageKey={item.storageKey}
                  onRemove={removeItem}
                />
              ))}
            </div>
          ) : (
            <div className="py-16 text-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02]">
              <Bookmark size={32} className="text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">Nothing saved yet.</p>
            </div>
          )}
        </div>

        {/* Favourites section */}
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/25 text-red-400 flex items-center justify-center shrink-0">
              <Heart size={18} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Favourites</h1>
              <p className="text-xs text-zinc-500">{likes.length} liked</p>
            </div>
          </div>

          {likes.length > 0 ? (
            <div className="grid grid-cols-3 xs:grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 xl:grid-cols-8 gap-2.5 sm:gap-4">
              {likes.map((item) => (
                <MediaCard
                  key={item.storageKey || `l-${item.id}`}
                  item={item}
                  storageKey={item.storageKey}
                  onRemove={removeItem}
                />
              ))}
            </div>
          ) : (
            <div className="py-16 text-center rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.02]">
              <Heart size={32} className="text-zinc-700 mx-auto mb-3" />
              <p className="text-sm text-zinc-500">No favourites yet.</p>
            </div>
          )}
        </div>

      </div>
      <Footer />

      {/* Integrations Modal */}
      {showSyncModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeUp">
          <div className="bg-zinc-900 border border-white/10 rounded-3xl p-8 max-w-md w-full relative overflow-hidden">
            <div className={`absolute top-0 left-0 right-0 h-1 ${syncProvider === 'anilist' ? 'bg-[#02A9FF]' : syncProvider === 'mal' ? 'bg-[#2E51A2]' : 'bg-[#ED1C24]'}`} />
            <button 
              onClick={() => setShowSyncModal(false)}
              className="absolute top-4 right-4 text-zinc-500 hover:text-white text-lg font-bold"
            >
              ✕
            </button>
            
            <h2 className="text-2xl font-black text-white mb-6">Integrations</h2>
            
            <div className="flex gap-2 mb-6 bg-black p-1 rounded-xl border border-white/5">
              <button onClick={() => setSyncProvider('anilist')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${syncProvider === 'anilist' ? 'bg-[#02A9FF] text-white shadow-lg' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}>AniList</button>
              <button onClick={() => setSyncProvider('mal')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${syncProvider === 'mal' ? 'bg-[#2E51A2] text-white shadow-lg' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}>MyAnimeList</button>
              <button onClick={() => setSyncProvider('trakt')} className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all ${syncProvider === 'trakt' ? 'bg-[#ED1C24] text-white shadow-lg' : 'text-zinc-500 hover:text-white hover:bg-white/5'}`}>Trakt</button>
            </div>
            
            {syncStatus.success ? (
              <div className="bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 p-4 rounded-xl text-center font-bold">
                Successfully synced Watchlist!
              </div>
            ) : (
              <form onSubmit={handleSync} className="space-y-4">
                <div>
                  <input 
                    type="text" 
                    value={syncUsername}
                    onChange={(e) => setSyncUsername(e.target.value)}
                    placeholder={`${syncProvider === 'mal' ? 'MyAnimeList' : syncProvider === 'trakt' ? 'Trakt' : 'AniList'} Username`} 
                    className="w-full bg-black border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-purple-500 transition-colors"
                    required
                  />
                </div>
                {syncStatus.error && <p className="text-red-400 text-xs font-bold">{syncStatus.error}</p>}
                
                <button 
                  type="submit" 
                  disabled={syncStatus.loading}
                  className={`w-full text-white font-bold py-3 rounded-xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 ${syncProvider === 'anilist' ? 'bg-[#02A9FF] hover:bg-[#02A9FF]/80' : syncProvider === 'mal' ? 'bg-[#2E51A2] hover:bg-[#2E51A2]/80' : 'bg-[#ED1C24] hover:bg-[#ED1C24]/80'}`}
                >
                  {syncStatus.loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : 'Sync Watchlist'}
                </button>
                {syncProvider === 'trakt' && <p className="text-[10px] text-zinc-500 text-center mt-3 leading-tight">Since Trakt API requires backend OAuth, connecting will securely simulate an import of trending movies.</p>}
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
