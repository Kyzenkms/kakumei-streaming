import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTokens, Tokens } from './theme';

export type Prefs = {
  theme: string;
  accent: string | null;
  apiBase: string | null; // null = env default
  dub: string; // preferred dub: 'english' | 'hindi' | 'original'
};

const DEFAULT_API = process.env.EXPO_PUBLIC_API_URL || 'https://stream.kyzenhub.site';
const KEY = 'kakumei-prefs-v1';

const DEFAULTS: Prefs = { theme: 'midnight', accent: null, apiBase: null, dub: 'english' };

type Ctx = { prefs: Prefs; t: Tokens; apiBase: string; set: (p: Partial<Prefs>) => void; ready: boolean };
const PrefsCtx = createContext<Ctx>({ prefs: DEFAULTS, t: getTokens('midnight', null), apiBase: DEFAULT_API, set: () => {}, ready: false });

export function PrefsProvider({ children }: { children: React.ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      try {
        const saved = raw ? JSON.parse(raw) : {};
        setPrefs({ ...DEFAULTS, ...saved });
      } catch {}
      setReady(true);
    }).catch(() => setReady(true));
  }, []);
  const set = useCallback((p: Partial<Prefs>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...p };
      AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);
  const t = getTokens(prefs.theme, prefs.accent);
  const apiBase = (prefs.apiBase || DEFAULT_API).replace(/\/$/, '');
  return <PrefsCtx.Provider value={{ prefs, t, apiBase, set, ready }}>{children}</PrefsCtx.Provider>;
}

export const usePrefs = () => useContext(PrefsCtx);
