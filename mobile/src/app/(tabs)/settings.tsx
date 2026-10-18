import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { ACCENTS, THEMES } from '../../theme';
import { usePrefs } from '../../prefs';
import { api, setApiBase } from '../../api';

export default function SettingsScreen() {
  const { t, prefs, set, apiBase } = usePrefs();
  const [url, setUrl] = useState(prefs.apiBase || '');
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [cdns, setCdns] = useState<any>(null);

  const saveUrl = () => {
    const clean = url.trim().replace(/\/$/, '');
    set({ apiBase: clean || null });
    setApiBase(clean || (process.env.EXPO_PUBLIC_API_URL || 'https://stream.kyzenhub.site'));
    setHealth(null);
  };

  const testBackend = async () => {
    setTesting(true);
    try {
      const [h, c] = await Promise.all([api.health(), api.cdns()]);
      setHealth(h);
      setCdns(c);
    } catch {
      setHealth({ ok: false });
      setCdns(null);
    }
    setTesting(false);
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={[styles.h1, { color: t.text }]}>Settings</Text>

      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.h2, { color: t.text }]}>Appearance</Text>
        <View style={styles.grid}>
          {Object.entries(THEMES).map(([key, th]) => (
            <Pressable key={key} onPress={() => set({ theme: key })} style={[styles.theme, { borderColor: prefs.theme === key ? t.accent : t.border, backgroundColor: t.surface2 }]}>
              <View style={[styles.dot, { backgroundColor: accentPreview(key, prefs.accent) }]} />
              <Text style={[styles.themeName, { color: t.text }]}>{th.name}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.sub, { color: t.muted }]}>Accent</Text>
        <View style={styles.grid}>
          {ACCENTS.map((a) => (
            <Pressable key={a.name} onPress={() => set({ accent: prefs.accent === a.name ? null : a.name })} style={[styles.swatch, { backgroundColor: a.accent, borderWidth: prefs.accent === a.name ? 3 : 0, borderColor: '#fff' }]} />
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.h2, { color: t.text }]}>Preferred dub</Text>
        <Text style={[styles.body, { color: t.secondary }]}>Used when you press Play without picking a language.</Text>
        <View style={styles.row}>
          {['english', 'hindi', 'original'].map((d) => (
            <Pressable key={d} onPress={() => set({ dub: d })} style={[styles.pill, { borderColor: prefs.dub === d ? t.accent : t.border, backgroundColor: prefs.dub === d ? t.accentSoft : 'transparent' }]}>
              <Text style={[styles.pillText, { color: prefs.dub === d ? t.accent : t.secondary }]}>{d}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.h2, { color: t.text }]}>Streaming backend</Text>
        <Text style={[styles.body, { color: t.secondary }]}>Uses the public Kakumei server by default. To use your own backend instead (same Wi-Fi), enter its address, e.g. http://192.168.1.5:3005</Text>
        <TextInput value={url} onChangeText={setUrl} placeholder={apiBase} placeholderTextColor={t.muted} autoCapitalize="none" autoCorrect={false} style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface2 }]} />
        <View style={styles.row}>
          <Pressable onPress={saveUrl} style={[styles.btn, { backgroundColor: t.accent }]}>
            <Text style={[styles.btnText, { color: t.onAccent }]}>Save</Text>
          </Pressable>
          <Pressable onPress={testBackend} disabled={testing} style={[styles.btn, { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border }]}>
            <Text style={[styles.btnText, { color: t.text }]}>{testing ? 'Testing…' : 'Test connection'}</Text>
          </Pressable>
        </View>
        {testing && <ActivityIndicator color={t.accent} style={{ marginTop: 10 }} />}
        {health && (
          <View style={{ marginTop: 10, gap: 4 }}>
            <Text style={[styles.body, { color: health.ok ? '#34d399' : t.danger }]}>
              {health.ok ? `● Backend live · up ${Math.floor((health.uptimeSec || 0) / 60)}m` : '● Backend unreachable'}
            </Text>
            {!!health.upstreams && (
              <Text style={[styles.body, { color: t.muted }]}>
                {Object.values(health.upstreams).map((u: any) => `${u.name} ${u.ok ? `${u.ms}ms` : 'down'}`).join(' · ')}
              </Text>
            )}
            {!!cdns?.hosts && (
              <Text style={[styles.body, { color: t.muted }]}>
                CDN: {(cdns.hosts || []).filter((h: any) => h.status === 'live').length}/{cdns.hosts.length} live
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.h2, { color: t.text }]}>About</Text>
        <Text style={[styles.body, { color: t.secondary }]}>Kakumei mobile — anime-first streaming. Streams resolve via your backend; the app never proxies video.</Text>
      </View>
    </ScrollView>
  );
}

function accentPreview(themeKey: string, accentName: string | null): string {
  if (accentName) {
    const a = ACCENTS.find((x) => x.name === accentName);
    if (a) return a.accent;
  }
  const map: Record<string, string> = { midnight: '#a855f7', oled: '#8b5cf6', ocean: '#22d3ee', ember: '#fb923c', synthwave: '#f861b4', dracula: '#ff79c6', forest: '#1fb854', night: '#3abdf7', luxury: '#d4af37' };
  return map[themeKey] || '#a855f7';
}

const styles = StyleSheet.create({
  h1: { fontSize: 28, fontWeight: '800', marginBottom: 16 },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  h2: { fontSize: 16, fontWeight: '700' },
  body: { fontSize: 13, marginTop: 6, lineHeight: 20 },
  sub: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginTop: 14, marginBottom: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  theme: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1.5, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9 },
  dot: { width: 14, height: 14, borderRadius: 7 },
  themeName: { fontSize: 13, fontWeight: '600' },
  swatch: { width: 34, height: 34, borderRadius: 17 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  pill: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
  pillText: { fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, marginTop: 10 },
  btn: { borderRadius: 12, paddingHorizontal: 20, paddingVertical: 11 },
  btnText: { fontSize: 14, fontWeight: '700' },
});
