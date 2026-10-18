import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, prefetchSources } from '../../../api';
import { IMG_LARGE } from '../../../theme';
import { usePrefs } from '../../../prefs';
import { PosterCard } from '../../../components/PosterCard';

const WL_KEY = 'kyzen-watchlist';
const LIKE_KEY = 'kyzen-likes';

async function readList(key: string): Promise<any[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter(Boolean) : [];
  } catch { return []; }
}

export default function DetailsScreen() {
  const { t, prefs } = usePrefs();
  const params = useLocalSearchParams<{ type: string; id: string }>();
  const type = Array.isArray(params.type) ? params.type[0] : params.type;
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const isTV = type === 'tv';
  const [media, setMedia] = useState<any>(null);
  const [shownFor, setShownFor] = useState('');
  const [recs, setRecs] = useState<any[]>([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [liked, setLiked] = useState(false);
  const [dubs, setDubs] = useState<any[]>([]);
  const [seasons, setSeasons] = useState<any[]>([]);
  const [activeSeason, setActiveSeason] = useState(1);
  const [episodes, setEpisodes] = useState<any[]>([]);
  const badParams = !type || !id;

  useEffect(() => {
    if (badParams) return;
    let alive = true;
    const key = `${type}|${id}`;
    api.details(type, id).then((m) => { if (alive) { setMedia(m || null); setShownFor(key); setError(m ? '' : 'Title unavailable'); } }).catch(() => { if (alive) { setMedia(null); setShownFor(key); setError('Title unavailable'); } });
    api.recs(type, id).then((r: any) => { if (alive) setRecs(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setRecs([]); });
    return () => { alive = false; };
  }, [type, id, badParams]);

  useEffect(() => {
    if (!media?.id) return;
    let alive = true;
    const title = media.title || media.name || '';
    readList(WL_KEY).then((list) => { if (alive) setSaved(list.some((x: any) => String(x.id) === String(media.id))); }).catch(() => {});
    readList(LIKE_KEY).then((list) => { if (alive) setLiked(list.some((x: any) => String(x.id) === String(media.id))); }).catch(() => {});
    if (title) api.languages(title).then((l) => { if (alive) setDubs(Array.isArray(l) ? l : []); }).catch(() => {});
    if (isTV) api.seasons(String(media.id)).then((s) => {
      if (!alive) return;
      const list = (Array.isArray(s) ? s : []).filter((x: any) => x && x.season_number > 0);
      setSeasons(list);
      if (list.length) setActiveSeason(list[0].season_number);
    }).catch(() => {});
    return () => { alive = false; };
  }, [media?.id, isTV, media?.title, media?.name]);

  useEffect(() => {
    if (!isTV || !media?.id) return;
    let alive = true;
    api.episodes(String(media.id), activeSeason).then((e) => { if (alive) setEpisodes(Array.isArray(e) ? e : []); }).catch(() => { if (alive) setEpisodes([]); });
    return () => { alive = false; };
  }, [media?.id, activeSeason, isTV]);

  const toggleList = async (key: string, flip: (v: boolean) => void) => {
    if (!media?.id) return;
    try {
      const list = await readList(key);
      const exists = list.some((x: any) => String(x.id) === String(media.id));
      const next = exists ? list.filter((x: any) => String(x.id) !== String(media.id)) : [...list, { ...media, isTV, media_type: type }];
      await AsyncStorage.setItem(key, JSON.stringify(next));
      flip(!exists);
    } catch { setError('Could not update list'); }
  };

  if (badParams) return <View style={[styles.center, { backgroundColor: t.bg }]}><Text style={[styles.error, { color: t.danger }]}>Missing title id</Text></View>;
  if (error && (!media || shownFor !== `${type}|${id}`)) return (
    <View style={[styles.center, { backgroundColor: t.bg }]}>
      <Text style={[styles.error, { color: t.danger }]}>{error}</Text>
      <Pressable onPress={() => router.back()} style={[styles.retry, { borderColor: t.border }]}><Text style={{ color: t.text }}>Go back</Text></Pressable>
    </View>
  );
  if (!media || shownFor !== `${type}|${id}`) return <ActivityIndicator color={t.accent} style={{ marginTop: 60 }} />;

  const title = media.title || media.name || 'Untitled';
  const art = media.backdrop_path || media.poster_path;
  const artUri = art ? (String(art).startsWith('http') ? String(art) : `${IMG_LARGE}${art}`) : null;
  const year = String(media.release_date || media.first_air_date || '').slice(0, 4);
  const epRuntime = Array.isArray(media.episode_run_time) ? media.episode_run_time[0] : null;
  const runtime = media.runtime ? `${Math.floor(media.runtime / 60)}h ${media.runtime % 60}m` : epRuntime ? `${epRuntime}m/episode` : null;
  const playUrl = (lang?: string, s?: number, e?: number) =>
    `/play/${type}/${media.id}?expectedTitle=${encodeURIComponent(title)}${lang ? `&language=${encodeURIComponent(lang)}` : ''}${isTV ? `&season=${s || activeSeason}&episode=${e || 1}` : ''}`;
  const play = (lang?: string, s?: number, e?: number) => {
    prefetchSources({ id: String(media.id), type, season: isTV ? (s || activeSeason) : 1, episode: isTV ? (e || 1) : 1, title, language: lang || '' }).catch(() => {});
    router.push(playUrl(lang, s, e) as any);
  };

  return (
    <ScrollView style={{ backgroundColor: t.bg }}>
      {artUri
        ? <Image source={{ uri: artUri }} style={{ width: '100%', height: 230 }} resizeMode="cover" />
        : <View style={[styles.noArt, { backgroundColor: t.surface2 }]}><Text style={{ color: t.muted }}>{title}</Text></View>}
      <View style={styles.pad}>
        <Text style={[styles.kicker, { color: t.muted }]}>{isTV ? 'Series' : 'Film'}{year ? ` · ${year}` : ''}{media.vote_average > 0 ? ` · ★ ${Number(media.vote_average).toFixed(1)}` : ''}{runtime ? ` · ${runtime}` : ''}</Text>
        <Text style={[styles.title, { color: t.text }]}>{title}</Text>
        {!!media.genres?.length && (
          <View style={styles.genres}>
            {media.genres.slice(0, 4).map((g: any) => (
              <View key={g.id || g.name} style={[styles.genre, { borderColor: t.border }]}><Text style={[styles.genreText, { color: t.secondary }]}>{g.name}</Text></View>
            ))}
          </View>
        )}
        {!!media.overview && <Text style={[styles.overview, { color: t.secondary }]}>{media.overview}</Text>}
        <Pressable onPress={() => play(prefs.dub !== 'original' ? prefs.dub : undefined)} style={[styles.play, { backgroundColor: t.play }]}>
          <Text style={[styles.playText, { color: t.onAccent }]}>▶ Play{isTV ? ` S${activeSeason} E1` : ''}</Text>
        </Pressable>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
          <Pressable onPress={() => toggleList(WL_KEY, setSaved)} style={[styles.half, { borderColor: saved ? t.accent : t.border, backgroundColor: saved ? t.accentSoft : 'transparent' }]}>
            <Text style={[styles.halfText, { color: saved ? t.accent : t.secondary }]}>{saved ? '★ Watchlisted' : '☆ Watchlist'}</Text>
          </Pressable>
          <Pressable onPress={() => toggleList(LIKE_KEY, setLiked)} style={[styles.half, { borderColor: liked ? '#f87171' : t.border, backgroundColor: liked ? 'rgba(248,113,113,0.12)' : 'transparent' }]}>
            <Text style={[styles.halfText, { color: liked ? '#f87171' : t.secondary }]}>{liked ? '♥ Liked' : '♡ Like'}</Text>
          </Pressable>
        </View>

        {dubs.length > 0 && (
          <View style={{ marginTop: 18 }}>
            <Text style={[styles.h2, { color: t.text }]}>Available dubs</Text>
            <View style={styles.dubRow}>
              {dubs.slice(0, 10).map((d: any) => (
                <Pressable key={String(d.id)} onPress={() => play(d.language)} style={[styles.dub, { borderColor: t.border }]}>
                  <Text style={[styles.dubText, { color: t.secondary }]}>{String(d.language || 'dub').toUpperCase()}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        {isTV && seasons.length > 0 && (
          <View style={{ marginTop: 18 }}>
            <Text style={[styles.h2, { color: t.text }]}>Episodes</Text>
            <View style={styles.dubRow}>
              {seasons.map((s: any) => (
                <Pressable key={s.season_number} onPress={() => setActiveSeason(s.season_number)} style={[styles.dub, { borderColor: activeSeason === s.season_number ? t.accent : t.border, backgroundColor: activeSeason === s.season_number ? t.accentSoft : 'transparent' }]}>
                  <Text style={[styles.dubText, { color: activeSeason === s.season_number ? t.accent : t.secondary }]}>S{s.season_number}</Text>
                </Pressable>
              ))}
            </View>
            {episodes.slice(0, 30).map((ep: any) => (
              <Pressable key={ep.id} onPress={() => play(undefined, activeSeason, ep.episode_number)} style={[styles.ep, { borderColor: t.border }]}>
                <Text style={[styles.epTitle, { color: t.text }]} numberOfLines={1}>E{ep.episode_number} · {ep.name || 'Episode'}</Text>
                {!!ep.air_date && <Text style={[styles.epSub, { color: t.muted }]}>{ep.air_date}</Text>}
              </Pressable>
            ))}
          </View>
        )}

        <Text style={[styles.h2, { color: t.text }]}>More Like This</Text>
        <FlatList data={(Array.isArray(recs) ? recs : []).slice(0, 18)} keyExtractor={(i, idx) => `${i?.id ?? idx}-${i?.media_type || ''}`} horizontal showsHorizontalScrollIndicator={false} renderItem={({ item }) => <View style={{ marginRight: 12 }}><PosterCard item={item} /></View>} />
      </View>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  error: { textAlign: 'center' },
  retry: { marginTop: 14, borderWidth: 1, borderRadius: 12, paddingHorizontal: 20, paddingVertical: 10 },
  noArt: { width: '100%', height: 200, justifyContent: 'center', alignItems: 'center' },
  pad: { padding: 16 },
  kicker: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.5 },
  title: { fontSize: 26, fontWeight: '800', marginTop: 6 },
  genres: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  genre: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  genreText: { fontSize: 11 },
  overview: { fontSize: 14, marginTop: 12, lineHeight: 20 },
  play: { borderRadius: 16, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  playText: { fontSize: 16, fontWeight: '700' },
  half: { flex: 1, borderWidth: 1, borderRadius: 14, paddingVertical: 11, alignItems: 'center' },
  halfText: { fontSize: 13, fontWeight: '600' },
  h2: { fontSize: 17, fontWeight: '700', marginTop: 20, marginBottom: 10 },
  dubRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dub: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  dubText: { fontSize: 12, fontWeight: '700' },
  ep: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 8 },
  epTitle: { fontSize: 13, fontWeight: '600' },
  epSub: { fontSize: 11, marginTop: 2 },
});
