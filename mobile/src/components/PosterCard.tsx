import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { IMG } from '../theme';
import { usePrefs } from '../prefs';
import { prefetchSources } from '../api';

export function PosterCard({ item, width = 110 }: { item: any; width?: number }) {
  const { t } = usePrefs();
  if (!item) return null;
  const backdrop = typeof item.backdrop_path === 'string' ? item.backdrop_path : null;
  const rawPoster = typeof item.poster_path === 'string' ? item.poster_path : null;
  const poster = rawPoster || (backdrop && backdrop.startsWith('http') ? backdrop : null);
  const title = item.title || item.name || 'Untitled';
  const lang = item.language || item.displayLanguage || item._langCode || '';
  const rating = item.vote_average ? Number(item.vote_average).toFixed(1) : null;
  const isTV = item.isTV ?? (item.media_type === 'tv' || Boolean(item.first_air_date));
  const body = (
    <View style={{ width }}>
      <View style={[styles.art, { width, height: width * 1.5, backgroundColor: t.surface2, borderColor: t.border }]}>
        {poster
          ? <Image source={{ uri: poster.startsWith('http') ? poster : `${IMG}${poster}` }} style={styles.img} />
          : <Text style={[styles.fallback, { color: t.muted }]}>{title}</Text>}
        {rating ? (
          <View style={styles.rating}><Text style={styles.ratingText}>★ {rating}</Text></View>
        ) : null}
        {lang ? (
          <View style={styles.lang}><Text style={styles.langText}>{String(lang).toUpperCase().slice(0, 8)}</Text></View>
        ) : null}
      </View>
      <Text style={[styles.title, { color: t.text }]} numberOfLines={1}>{title}</Text>
      <Text style={[styles.meta, { color: t.muted }]}>{String(item.release_date || item.first_air_date || '').slice(0, 4) || (isTV ? 'Series' : 'Movie')}</Text>
      {item._hint ? <Text style={[styles.meta, { color: t.accent }]} numberOfLines={1}>{item._hint}</Text> : null}
    </View>
  );
  if (!item.id) return body;
  const route = item.isNetMirror
    ? `/play/${isTV ? 'tv' : 'movie'}/${item.id}?netmirror=true&expectedTitle=${encodeURIComponent(title)}`
    : `/details/${isTV ? 'tv' : 'movie'}/${item.id}`;
  const onPlay = () => {
    if (item.isNetMirror) {
      prefetchSources({ id: String(item.id), type: isTV ? 'tv' : 'movie', title, isNetMirror: true }).catch(() => {});
    }
    router.push(route as any);
  };
  return (
    <Pressable onPress={onPlay} style={{ width }}>
      {body}
    </Pressable>
  );
}
const styles = StyleSheet.create({
  art: { borderRadius: 12, overflow: 'hidden', borderWidth: 1 },
  img: { width: '100%', height: '100%', resizeMode: 'cover' },
  fallback: { padding: 8, fontSize: 12 },
  title: { marginTop: 6, fontSize: 12, fontWeight: '600' },
  meta: { fontSize: 10 },
  rating: { position: 'absolute', left: 6, top: 6, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  ratingText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  lang: { position: 'absolute', right: 6, top: 6, backgroundColor: 'rgba(0,0,0,0.65)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  langText: { color: '#fff', fontSize: 9, fontWeight: '700' },
});
