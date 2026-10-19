import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { ACCENTS, THEMES } from '../../theme';
import { usePrefs } from '../../prefs';
import { api, setApiBase } from '../../api';

export default function SettingsScreen() {
  const { t, prefs, set, apiBase } = usePrefs();
  const [url, setUrl] = useState(prefs.apiBase || '');
  const [testing, setTesting] = useState(false);
  const [health, setHealth] = useState<any>(null);
  const [cdns, setCdns] = useState<any>(null);
  const [wheel, setWheel] = useState(false);

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
          <Pressable onPress={() => setWheel(true)} style={[styles.swatch, styles.wheelSwatch, { borderColor: prefs.accent?.startsWith('#') ? '#fff' : t.border, borderWidth: prefs.accent?.startsWith('#') ? 3 : 1 }]}>
            <Text style={styles.wheelGlyph}>◒</Text>
          </Pressable>
        </View>
        <Pressable onPress={() => setWheel(true)} style={styles.wheelRow}>
          <Text style={[styles.wheelLabel, { color: t.secondary }]}>Custom colour</Text>
          <View style={[styles.wheelDot, { backgroundColor: prefs.accent?.startsWith('#') ? prefs.accent : t.accent }]} />
          <Text style={[styles.wheelHex, { color: t.muted }]}>{prefs.accent?.startsWith('#') ? prefs.accent.toUpperCase() : 'Wheel'}</Text>
        </Pressable>
      </View>

      <View style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}>
        <Text style={[styles.h2, { color: t.text }]}>Playback</Text>
        <View style={styles.toggleRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[styles.body, { color: t.secondary, marginTop: 0 }]}>Background play</Text>
            <Text style={[styles.body, { color: t.muted, marginTop: 2 }]}>Keep audio playing when you leave the app.</Text>
          </View>
          <Switch
            value={prefs.bgPlay}
            onValueChange={(v) => set({ bgPlay: v })}
            trackColor={{ false: t.surface2, true: t.accentSoft }}
            thumbColor={prefs.bgPlay ? t.accent : '#8b8b96'}
          />
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

      <ColourWheel
        visible={wheel}
        value={prefs.accent}
        accent={t.accent}
        bg={t.surface}
        border={t.border}
        onClose={() => setWheel(false)}
        onPick={(hex) => { set({ accent: hex }); setWheel(false); }}
      />
    </ScrollView>
  );
}

const RING_STEPS = 24;
function hueAt(i: number): string {
  const h = (i / RING_STEPS) * 360;
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return 255 * (1 - Math.max(Math.min(k, 4 - k, 1), 0));
  };
  const hex = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${hex(f(5))}${hex(f(3))}${hex(f(1))}`;
}
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    .map((v) => Math.round(amt >= 0 ? v + (255 - v) * amt : v * (1 + amt)));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
const TONES = [-0.6, -0.3, 0, 0.4, 0.75];

function ColourWheel({ visible, value, accent, bg, border, onClose, onPick }: {
  visible: boolean; value: string | null; accent: string; bg: string; border: string;
  onClose: () => void; onPick: (hex: string | null) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const [hue, setHue] = useState<string | null>(null);
  const current = draft || (value?.startsWith('#') ? value : accent);
  const toneBase = hue || current;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalDim} onPress={onClose} />
      <View style={styles.modalWrap} pointerEvents="box-none">
        <View style={[styles.modalCard, { backgroundColor: bg, borderColor: border }]}>
          <Text style={[styles.modalTitle, { color: '#fff' }]}>Custom accent</Text>
          <Text style={[styles.modalSub, { color: 'rgba(255,255,255,0.55)' }]}>Tap a hue, then a tone.</Text>
          <View style={styles.wheelStage}>
            {Array.from({ length: RING_STEPS }).map((_, i) => {
              const a = (i / RING_STEPS) * Math.PI * 2;
              const hex = hueAt(i);
              return (
                <Pressable
                  key={hex}
                  onPress={() => { setHue(hex); setDraft(hex); }}
                  style={[styles.hueChip, {
                    backgroundColor: hex,
                    left: 116 + Math.cos(a) * 92 - 13,
                    top: 116 + Math.sin(a) * 92 - 13,
                    borderColor: hue === hex ? '#fff' : 'rgba(0,0,0,0.35)',
                    borderWidth: hue === hex ? 3 : 2,
                  }]}
                />
              );
            })}
            <View style={[styles.wheelCenter, { backgroundColor: current }]} pointerEvents="none" />
          </View>
          <View style={styles.toneRow}>
            {TONES.map((amt) => {
              const hex = shade(toneBase, amt);
              return (
                <Pressable
                  key={amt}
                  onPress={() => setDraft(hex)}
                  style={[styles.toneChip, { backgroundColor: hex, borderColor: draft === hex ? '#fff' : 'rgba(255,255,255,0.25)' }]}
                />
              );
            })}
          </View>
          <View style={styles.previewRow}>
            <View style={[styles.previewDot, { backgroundColor: current }]} />
            <Text style={[styles.previewHex, { color: '#fff' }]}>{current.toUpperCase()}</Text>
          </View>
          <View style={styles.modalBtns}>
            <Pressable onPress={() => { setDraft(null); onPick(null); }} style={[styles.btn, { backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1, borderColor: border }]}>
              <Text style={[styles.btnText, { color: '#fff' }]}>Reset</Text>
            </Pressable>
            <Pressable onPress={() => { onPick(current); }} style={[styles.btn, { backgroundColor: current }]}>
              <Text style={[styles.btnText, { color: '#ffffff' }]}>Use colour</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function accentPreview(themeKey: string, accentName: string | null): string {
  if (accentName?.startsWith('#')) return accentName;
  if (accentName) {
    const a = ACCENTS.find((x) => x.name === accentName);
    if (a) return a.accent;
  }
  const map: Record<string, string> = { midnight: '#a855f7', oled: '#8b5cf6', ocean: '#22d3ee', ember: '#fb923c', synthwave: '#f861b4', dracula: '#ff79c6', forest: '#1fb854', night: '#3abdf7', luxury: '#d4af37' };  return map[themeKey] || '#a855f7';
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
  wheelSwatch: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  wheelGlyph: { color: '#fff', fontSize: 18, marginTop: -1 },
  wheelRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  wheelLabel: { fontSize: 13, fontWeight: '600', flex: 1 },
  wheelDot: { width: 16, height: 16, borderRadius: 8 },
  wheelHex: { fontSize: 12, fontWeight: '600' },
  toggleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10 },
  modalDim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)' },
  modalWrap: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modalCard: { width: '100%', maxWidth: 360, borderRadius: 24, borderWidth: 1, padding: 20 },
  modalTitle: { fontSize: 20, fontWeight: '800' },
  modalSub: { fontSize: 12, marginTop: 4 },
  wheelStage: { width: 232, height: 232, marginTop: 16, alignSelf: 'center' },
  hueChip: { position: 'absolute', width: 26, height: 26, borderRadius: 13 },
  wheelCenter: { position: 'absolute', left: 63, top: 63, width: 106, height: 106, borderRadius: 53, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  toneRow: { flexDirection: 'row', gap: 10, justifyContent: 'center', marginTop: 16 },
  toneChip: { width: 30, height: 30, borderRadius: 15, borderWidth: 2 },
  previewRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 14 },
  previewDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  previewHex: { fontSize: 14, fontWeight: '700', letterSpacing: 1 },
  modalBtns: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 16 },
});
