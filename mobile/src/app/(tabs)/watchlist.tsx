import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { usePrefs } from '../../prefs';
import { PosterCard } from '../../components/PosterCard';

const KEY = 'kyzen-watchlist';

export default function WatchlistScreen() {
  const { t } = usePrefs();
  const [items, setItems] = useState<any[]>([]);
  useFocusEffect(useCallback(() => {
    AsyncStorage.getItem(KEY).then((raw) => {
      try {
        const parsed = raw ? JSON.parse(raw) : [];
        setItems(Array.isArray(parsed) ? parsed.filter(Boolean) : []);
      } catch { setItems([]); }
    }).catch(() => setItems([]));
  }, []));
  return (
    <View style={{ flex: 1, backgroundColor: t.bg, padding: 16 }}>
      <Text style={[styles.title, { color: t.text }]}>Watchlist</Text>
      <FlatList data={items} numColumns={3} columnWrapperStyle={{ gap: 12 }} contentContainerStyle={{ gap: 16 }} keyExtractor={(i, idx) => `${i?.id ?? idx}-${i?.media_type || ''}`}
        ListEmptyComponent={<Text style={[styles.empty, { color: t.muted }]}>Bookmark titles on details pages — they appear here.</Text>}
        renderItem={({ item }) => <View style={{ flex: 1 }}><PosterCard item={item} width={110} /></View>} />
    </View>
  );
}
const styles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '800', marginBottom: 12 },
  empty: { textAlign: 'center', marginTop: 60 },
});
