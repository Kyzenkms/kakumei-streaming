import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { getApiBase } from './api';

const DISMISS_KEY = 'kakumei.update.dismissed';

type UpdateInfo = { latest: string; min: string; url: string };

function parts(v: string): number[] {
  return String(v || '0').split(/[.\-+]/).map((n) => parseInt(n, 10) || 0);
}

export function isNewer(a: string, b: string): boolean {
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  }
  return false;
}

export function UpdateGate() {
  const [forced, setForced] = useState<UpdateInfo | null>(null);
  const [soft, setSoft] = useState<UpdateInfo | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const current = Constants.expoConfig?.version || '0.0.0';
    let alive = true;
    (async () => {
      try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 6000);
        const r = await fetch(`${getApiBase()}/version.json`, { signal: ctl.signal, cache: 'no-store' });
        clearTimeout(t);
        if (!r.ok) return;
        const info: UpdateInfo | undefined = (await r.json())?.android;
        if (!alive || !info?.latest || !info?.url) return;
        if (isNewer(info.min || '0.0.0', current)) {
          setForced(info);
          return;
        }
        if (isNewer(info.latest, current)) {
          const dismissed = await AsyncStorage.getItem(`${DISMISS_KEY}:${info.latest}`);
          if (alive && dismissed !== '1') setSoft(info);
        }
      } catch {
        /* offline — never block on the update check */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (forced) {
    return (
      <View style={styles.lockWrap}>
        <Text style={styles.lockKicker}>UPDATE REQUIRED</Text>
        <Text style={styles.lockTitle}>This version of Kakumei is no longer supported</Text>
        <Text style={styles.lockBody}>Install the latest version to keep watching. It only takes a minute.</Text>
        <Pressable style={styles.lockBtn} onPress={() => Linking.openURL(forced.url)}>
          <Text style={styles.lockBtnText}>Update now</Text>
        </Pressable>
      </View>
    );
  }

  if (!soft) return null;
  return (
    <View style={styles.banner}>
      <View style={styles.bannerTextCol}>
        <Text style={styles.bannerTitle}>Update available</Text>
        <Text style={styles.bannerBody}>Kakumei {soft.latest} is ready.</Text>
      </View>
      <Pressable style={styles.bannerBtn} onPress={() => Linking.openURL(soft.url)}>
        <Text style={styles.bannerBtnText}>Update</Text>
      </Pressable>
      <Pressable
        hitSlop={12}
        onPress={() => {
          AsyncStorage.setItem(`${DISMISS_KEY}:${soft.latest}`, '1');
          setSoft(null);
        }}
      >
        <Text style={styles.bannerX}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  lockWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
    backgroundColor: '#0a0a12',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  lockKicker: { color: '#a855f7', fontSize: 13, fontWeight: '700', letterSpacing: 3, marginBottom: 14 },
  lockTitle: { color: '#ffffff', fontSize: 24, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
  lockBody: { color: '#9b9ba8', fontSize: 15, textAlign: 'center', lineHeight: 22, marginBottom: 30 },
  lockBtn: { backgroundColor: '#a855f7', borderRadius: 999, paddingVertical: 14, paddingHorizontal: 44 },
  lockBtnText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 28,
    zIndex: 9998,
    elevation: 9998,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#17141f',
    borderColor: '#7c3aed',
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  bannerTextCol: { flex: 1 },
  bannerTitle: { color: '#ffffff', fontSize: 14, fontWeight: '700' },
  bannerBody: { color: '#a1a1b5', fontSize: 12, marginTop: 2 },
  bannerBtn: { backgroundColor: '#7c3aed', borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 },
  bannerBtnText: { color: '#ffffff', fontSize: 13, fontWeight: '700' },
  bannerX: { color: '#8b8b9e', fontSize: 16, paddingHorizontal: 4 },
});
