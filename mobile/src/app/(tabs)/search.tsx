import { useEffect, useRef, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { api } from '../../api';
import { usePrefs } from '../../prefs';
import { PosterCard } from '../../components/PosterCard';

export default function SearchScreen() {
  const { t } = usePrefs();
  const [q, setQ] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [lang, setLang] = useState('all');
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const requestId = useRef(0);
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  // Language chips only — media_type leaked into this list before.
  const langs = Array.from(new Set(safeItems.map((i) => String(i.language || i.displayLanguage || i._langCode || '').toLowerCase()).filter(Boolean))).slice(0, 8);

  const onChange = (v: string) => {
    setQ(v);
    if (!v.trim()) { setItems([]); setFailed(false); setSearching(false); setLang('all'); }
    else { setSearching(true); setFailed(false); }
  };

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const query = q.trim();
    if (!query) return;
    timer.current = setTimeout(() => {
      const current = ++requestId.current;
      api.search(query)
        .then((r) => { if (current !== requestId.current) return; setItems(Array.isArray(r) ? r : []); setSearching(false); })
        .catch(() => { if (current !== requestId.current) return; setItems([]); setFailed(true); setSearching(false); });
    }, 350);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [q]);

  const visible = lang === 'all' ? safeItems : safeItems.filter((i) => String(i.language || i.displayLanguage || i._langCode || '').toLowerCase() === lang);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 16 }}>
      <TextInput autoFocus value={q} onChangeText={onChange} placeholder="Search movies, series, anime…" placeholderTextColor={t.muted} style={[styles.input, { backgroundColor: t.surface, color: t.text, borderColor: t.border }]} />
      {langs.length > 1 && (
        <View style={styles.chips}>
          {['all', ...langs].map((l) => (
            <Pressable key={l} onPress={() => setLang(l)} style={[styles.chip, { borderColor: lang === l ? t.accent : t.border, backgroundColor: lang === l ? t.accentSoft : 'transparent' }]}><Text style={[styles.chipText, { color: lang === l ? t.text : t.secondary }]}>{l}</Text></Pressable>
          ))}
        </View>
      )}
      <FlatList data={visible} numColumns={3} columnWrapperStyle={{ gap: 12 }} contentContainerStyle={{ gap: 16, paddingTop: 12 }} keyExtractor={(i, idx) => `${i?.id ?? idx}-${i?.media_type || ''}-${i?.isNetMirror ? 'nm' : ''}`}
        ListEmptyComponent={<Text style={[styles.empty, { color: t.muted }]}>{failed ? 'Search failed. Check backend, then retry.' : searching ? 'Searching…' : q ? 'No results yet…' : 'Type to search the catalog.'}</Text>}
        renderItem={({ item }) => <View style={{ flex: 1 }}><PosterCard item={item} width={110} /></View>} />
    </View>
  );
}
const styles = StyleSheet.create({
  input: { borderRadius: 16, padding: 14, fontSize: 15, borderWidth: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  chip: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6 },
  chipText: { fontSize: 12, textTransform: 'capitalize' },
  empty: { textAlign: 'center', marginTop: 60 },
});
