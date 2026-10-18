import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ImageBackground, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { api } from '../../api';
import { IMG, IMG_LARGE } from '../../theme';
import { usePrefs } from '../../prefs';
import { loadRecent } from '../../recent';
import { PosterCard } from '../../components/PosterCard';

export default function HomeScreen() {
  const { t } = usePrefs();
  const [movies, setMovies] = useState<any[] | null>(null);
  const [shows, setShows] = useState<any[] | null>(null);
  const [anime, setAnime] = useState<any[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [recent, setRecent] = useState<any[]>([]);

  useEffect(() => {
    api.trending('movie').then((r) => setMovies(Array.isArray(r) ? r : [])).catch(() => { setMovies([]); setFailed(true); });
    api.trending('tv').then((r) => setShows(Array.isArray(r) ? r : [])).catch(() => { setShows([]); setFailed(true); });
    api.discover('tv', 'anime', 'with_genres=16&with_original_language=ja&sort_by=popularity.desc').then((r) => setAnime(Array.isArray(r) ? r : [])).catch(() => { setAnime([]); setFailed(true); });
  }, []);

  useFocusEffect(useCallback(() => {
    loadRecent().then(setRecent).catch(() => setRecent([]));
  }, []));

  const safeMovies = Array.isArray(movies) ? movies : [];
  const safeShows = Array.isArray(shows) ? shows : [];
  const safeAnime = Array.isArray(anime) ? anime : [];
  const hero = safeMovies.find((m) => m && typeof m.backdrop_path === 'string' && m.backdrop_path);
  const heroTitle = hero ? (hero.title || hero.name || 'Featured') : '';

  return (
    <ScrollView style={{ backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
      {hero ? (
        <ImageBackground source={{ uri: hero.backdrop_path.startsWith('http') ? hero.backdrop_path : `${IMG_LARGE}${hero.backdrop_path}` }} style={styles.hero} imageStyle={{ opacity: 0.5 }}>
          <View style={styles.heroShade} />
          <View style={styles.heroContent}>
            <Text style={[styles.eyebrow, { color: t.accent }]}>Featured Film</Text>
            <Text style={styles.heroTitle}>{heroTitle}</Text>
            {!!hero.overview && <Text numberOfLines={3} style={[styles.heroOverview, { color: t.secondary }]}>{String(hero.overview)}</Text>}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <Pressable onPress={() => router.push(`/play/movie/${hero.id}?expectedTitle=${encodeURIComponent(heroTitle)}` as any)} style={[styles.heroBtn, { backgroundColor: t.play }]}>
                <Text style={styles.heroBtnText}>▶ Play</Text>
              </Pressable>
              <Pressable onPress={() => router.push(`/details/movie/${hero.id}` as any)} style={[styles.heroBtnGhost, { borderColor: t.border }]}>
                <Text style={[styles.heroBtnGhostText, { color: t.secondary }]}>More Info</Text>
              </Pressable>
            </View>
          </View>
        </ImageBackground>
      ) : failed && movies !== null ? (
        <Text style={[styles.error, { color: t.danger }]}>Catalog unavailable. Check backend, then reopen.</Text>
      ) : <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />}

      {recent.length > 0 && (
        <View style={{ marginTop: 24 }}>
          <Text style={[styles.rowTitle, { color: t.text }]}>Continue Watching</Text>
          <FlatList data={recent} keyExtractor={(i, idx) => `recent-${i?.id ?? idx}-${i?.type || ''}`} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }} renderItem={({ item }) => <ContinueCard item={item} />} />
        </View>
      )}

      {movies !== null && <Row title="Trending Movies" items={safeMovies} />}
      {shows !== null && <Row title="Trending Series" items={safeShows} />}
      {anime !== null && <Row title="Trending Anime" items={safeAnime} />}
    </ScrollView>
  );
}

function ContinueCard({ item }: { item: any }) {
  const { t } = usePrefs();
  const isTV = item.isTV ?? item.type === 'tv';
  const type = item.type || (isTV ? 'tv' : 'movie');
  const title = item.title || 'Untitled';
  const img = item.poster_path || item.backdrop_path;
  const uri = img ? (String(img).startsWith('http') ? String(img) : `${IMG}${img}`) : null;
  const route = `/play/${type}/${item.id}?expectedTitle=${encodeURIComponent(title)}${item.language ? `&language=${encodeURIComponent(item.language)}` : ''}${item.isNetMirror ? '&netmirror=true' : ''}`;
  return (
    <Pressable onPress={() => router.push(route as any)} style={[styles.ccard, { borderColor: t.border, backgroundColor: t.surface }]}>
      {uri ? <Image source={{ uri }} style={styles.cimg} /> : <View style={[styles.cimg, { backgroundColor: t.surface2 }]} />}
      {item.language ? (
        <View style={styles.clang}><Text style={styles.clangText}>{String(item.language).toUpperCase().slice(0, 8)}</Text></View>
      ) : null}
      <View style={{ padding: 10 }}>
        <Text style={[styles.ctitle, { color: t.text }]} numberOfLines={1}>{title}</Text>
        <Text style={[styles.csub, { color: t.muted }]}>Resume{item.language ? ` · ${item.language}` : ''}</Text>
      </View>
    </Pressable>
  );
}

function Row({ title, items }: { title: string; items: any[] }) {
  const { t } = usePrefs();
  const safe = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!safe.length) return null;
  return (
    <View style={{ marginTop: 24 }}>
      <Text style={[styles.rowTitle, { color: t.text }]}>{title}</Text>
      <FlatList data={safe.slice(0, 16)} keyExtractor={(i, idx) => `${i?.id ?? idx}-${i?.media_type || ''}`} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }} renderItem={({ item }) => <PosterCard item={item} />} />
    </View>
  );
}
const styles = StyleSheet.create({
  hero: { height: 460, justifyContent: 'flex-end', padding: 18 },
  heroShade: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.45)' },
  heroContent: { paddingBottom: 12 },
  heroBtn: { borderRadius: 12, paddingHorizontal: 22, paddingVertical: 12 },
  heroBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  heroBtnGhost: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12, borderWidth: 1 },
  heroBtnGhostText: { fontSize: 14, fontWeight: '600' },
  eyebrow: { fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 32, fontWeight: '800', marginTop: 8 },
  heroOverview: { fontSize: 14, marginTop: 8, lineHeight: 20 },
  rowTitle: { fontSize: 18, fontWeight: '700', paddingHorizontal: 16, marginBottom: 10 },
  error: { textAlign: 'center', marginTop: 60, paddingHorizontal: 24 },
  ccard: { width: 220, borderRadius: 12, overflow: 'hidden', borderWidth: 1 },
  cimg: { width: '100%', height: 110 },
  clang: { position: 'absolute', right: 6, top: 6, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  clangText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  ctitle: { fontSize: 13, fontWeight: '600' },
  csub: { fontSize: 11, marginTop: 2 },
});
