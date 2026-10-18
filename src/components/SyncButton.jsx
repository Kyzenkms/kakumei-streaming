import { useState, useEffect } from 'react';
import { RefreshCw, Check, AlertCircle, ExternalLink } from 'lucide-react';

export default function SyncButton({ type = 'anilist' }) {
  const [syncing, setSyncing] = useState(false);
  const [status, setStatus] = useState('idle'); // idle, loading, success, error

  const handleSync = async () => {
    setSyncing(true);
    setStatus('loading');
    
    // Simulating an OAuth / API Sync process
    // In a real scenario, this would redirect to AniList/MAL for auth
    // or use a stored token to fetch/push data.
    try {
      await new Promise(r => setTimeout(r, 1800));
      
      // Example: Merge local bookmarks with external list
      const keys = Object.keys(localStorage).filter(k => k.startsWith('bookmark_'));
      console.log(`Syncing ${keys.length} items with ${type}...`);
      
      setStatus('success');
      setTimeout(() => setStatus('idle'), 3000);
    } catch (err) {
      setStatus('error');
    } finally {
      setSyncing(false);
    }
  };

  const config = {
    anilist: { label: 'AniList', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
    mal:     { label: 'MyAnimeList', color: '#2e51a2', bg: 'rgba(46,81,162,0.1)' }
  };

  const theme = config[type] || config.anilist;

  return (
    <button
      onClick={handleSync}
      disabled={syncing}
      className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold transition-all border"
      style={{
        background: theme.bg,
        borderColor: `${theme.color}40`,
        color: theme.color,
        cursor: syncing ? 'not-allowed' : 'pointer',
        fontSize: '13px'
      }}
    >
      {status === 'loading' ? (
        <RefreshCw size={14} className="animate-spin" />
      ) : status === 'success' ? (
        <Check size={14} />
      ) : status === 'error' ? (
        <AlertCircle size={14} />
      ) : (
        <ExternalLink size={14} />
      )}
      
      {status === 'loading' ? 'Syncing...' : 
       status === 'success' ? 'Synced!' : 
       status === 'error' ? 'Failed' : `Sync with ${theme.label}`}
    </button>
  );
}
