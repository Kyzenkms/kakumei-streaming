import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { db, doc, getDoc, setDoc, updateDoc, firebaseReady } from '../lib/firebase';

export function usePersistence() {
  const { user } = useAuth();
  if (!firebaseReady) return {};

  // Sync LOCAL to CLOUD
  const syncLocalToCloud = async () => {
    if (!user) return;
    
    const getItems = (prefix) => {
      return Object.keys(localStorage)
        .filter(k => k.startsWith(prefix))
        .map(k => {
          try {
            const val = localStorage.getItem(k);
            if (val === 'true') return null; // Skip legacy status flags
            return JSON.parse(val);
          } catch { return null; }
        })
        .filter(Boolean);
    };

    const bookmarks = getItems('bookmark_');
    const likes     = getItems('like_');
    const recent    = getItems('recent_');

    const userRef = doc(db, 'users', user.uid);
    await setDoc(userRef, { bookmarks, likes, recent }, { merge: true });
  };

  // Sync CLOUD to LOCAL
  const syncCloudToLocal = async () => {
    if (!user) return;
    const userRef = doc(db, 'users', user.uid);
    const userSnap = await getDoc(userRef);
    
    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.bookmarks) {
        data.bookmarks.forEach(item => {
          const type = item.type || (item.isTV ? 'tv' : 'movie');
          localStorage.setItem(`bookmark_${type}_${item.id}`, JSON.stringify(item));
          localStorage.setItem(`bookmark_${type}_${item.id}`, 'true'); // Backward compatibility for some parts of UI
        });
      }
      if (data.likes) {
        data.likes.forEach(item => {
          const type = item.type || (item.isTV ? 'tv' : 'movie');
          localStorage.setItem(`like_${type}_${item.id}`, JSON.stringify(item));
          localStorage.setItem(`like_${type}_${item.id}`, 'true');
        });
      }
      if (data.recent) {
        data.recent.forEach(item => {
          const type = item.type || (item.isTV ? 'tv' : 'movie');
          localStorage.setItem(`recent_${type}_${item.id}`, JSON.stringify(item));
        });
      }
      window.dispatchEvent(new Event('storage'));
    }
  };

  useEffect(() => {
    if (user) {
      syncCloudToLocal();
    }
  }, [user]);

  // Sync LOCAL to CLOUD on changes
  useEffect(() => {
    if (!user) return;
    const handleSync = () => syncLocalToCloud();
    window.addEventListener('storage', handleSync);
    return () => window.removeEventListener('storage', handleSync);
  }, [user]);

  return { syncLocalToCloud };
}
