import AsyncStorage from '@react-native-async-storage/async-storage';

export const RECENT_KEY = 'kakumei-recent';

export function saveRecent(entry: any) {
  AsyncStorage.getItem(RECENT_KEY).then((raw) => {
    try {
      const list = raw ? JSON.parse(raw) : [];
      const safe = Array.isArray(list) ? list.filter(Boolean) : [];
      const next = [entry, ...safe.filter((x: any) => !(String(x.id) === String(entry.id) && (x.type || '') === (entry.type || '')))].slice(0, 20);
      AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
    } catch {}
  }).catch(() => {});
}

export async function loadRecent(): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(Boolean).slice(0, 10) : [];
  } catch { return []; }
}
