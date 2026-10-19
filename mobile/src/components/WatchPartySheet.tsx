// Watch party bottom sheet — mobile face of the shared party service.
// Same rooms, same protocol as the website; this is purely presentational.
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { party, PartyMember } from '../party/party';
import { usePrefs } from '../prefs';

const QUICK_EMOJIS = ['😂', '🔥', '😍', '👏', '🎉', '😱', '💀', '❤️'];

type Props = {
  visible: boolean;
  onClose: () => void;
  mediaTitle: string;
  mediaId: string;
  mediaType: string;
  season: number;
  episode: number;
  getTime: () => number;
  isPlaying: () => boolean;
  onRemoteSync: (data: any) => void;
  onRemoteSeek: (data: any) => void;
  onRemoteMediaChange: (data: any) => void;
};

export function WatchPartySheet(props: Props) {
  const { t } = usePrefs();
  const insets = useSafeAreaInsets();
  const [inParty, setInParty] = useState(false);
  const [isHost, setIsHost] = useState(false);
  const [roomId, setRoomId] = useState('');
  const [joinedCode, setJoinedCode] = useState('');
  const [codeInput, setCodeInput] = useState('');
  const [username, setUsername] = useState('Guest');
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [messages, setMessages] = useState<any[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const listRef = useRef<FlatList<any>>(null);
  const propsRef = useRef(props);
  useEffect(() => { propsRef.current = props; });

  useEffect(() => {
    AsyncStorage.getItem('kyzen_wp_user').then((u) => {
      setUsername(u || 'User_' + Math.floor(100 + Math.random() * 900));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    const unsubStatus = party.on('status', ({ connected, isHost: hostFlag, roomId: id }) => {
      setInParty(connected);
      setIsHost(!!hostFlag);
      if (id) setRoomId(id);
      if (!connected) setLoading(false);
    });
    const unsubMembers = party.on('members', (list) => setMembers(list || []));
    const unsubChat = party.on('chat', (msg) => setMessages((prev) => [...prev.slice(-60), msg]));
    const unsubSync = party.on('sync', (data) => propsRef.current.onRemoteSync(data));
    const unsubSeek = party.on('seek', (data) => propsRef.current.onRemoteSeek(data));
    const unsubMedia = party.on('mediaChange', (data) => propsRef.current.onRemoteMediaChange(data));
    const unsubRequest = party.on('requestSync', () => {
      if (!party.isHost) return;
      const p = propsRef.current;
      party.sendSync(p.isPlaying() ? 'playing' : 'paused', p.getTime(), {
        mediaId: p.mediaId,
        mediaType: p.mediaType,
        season: p.season,
        episode: p.episode,
        mediaTitle: p.mediaTitle,
      });
    });
    const unsubError = party.on('error', (err) => {
      setError(err?.message || 'Connection error. Please try again.');
      setLoading(false);
    });
    return () => {
      unsubStatus();
      unsubMembers();
      unsubChat();
      unsubSync();
      unsubSeek();
      unsubMedia();
      unsubRequest();
      unsubError();
    };
  }, []);

  const persistName = () => AsyncStorage.setItem('kyzen_wp_user', username).catch(() => {});

  const handleCreate = async () => {
    try {
      setLoading(true);
      setError('');
      persistName();
      const res = await party.createRoom(username);
      setJoinedCode(res.roomId);
    } catch (e: any) {
      setError('Could not create room: ' + (e?.message || 'Error'));
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async () => {
    const code = codeInput.trim().toUpperCase();
    if (!code) return;
    try {
      setLoading(true);
      setError('');
      persistName();
      await party.joinRoom(code, username);
      setJoinedCode(code);
    } catch (e: any) {
      setError(e?.message || 'Could not connect to room. Check code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLeave = () => {
    party.leave();
    setInParty(false);
    setJoinedCode('');
    setMembers([]);
    setMessages([]);
  };

  const shareInvite = () => {
    const link = `https://stream.kyzenhub.site/app/play/${props.mediaType}/${props.mediaId}?netmirror=${props.mediaId.includes('_') || Number.isNaN(Number(props.mediaId)) ? 'true' : 'false'}&party=${roomId}`;
    Share.share({
      message: `Join my Kakumei watch party!\nCode: ${roomId}\n${link}`,
    }).catch(() => {});
  };

  const sendChat = () => {
    if (!inputMsg.trim()) return;
    party.sendChat(inputMsg.trim());
    setInputMsg('');
  };

  const renderMessage = ({ item }: { item: any }) => {
    if (item.isSystem) {
      return <Text style={[s.sysMsg, { color: t.muted }]}>{item.text}</Text>;
    }
    const mine = item.sender === username;
    return (
      <View style={[s.msgRow, mine && { justifyContent: 'flex-end' }]}>
        <View style={[s.bubble, { backgroundColor: mine ? t.accentSoft : 'rgba(255,255,255,0.06)', borderColor: t.border }]}>
          {!mine && <Text style={[s.msgSender, { color: t.accent }]}>{item.sender}{item.isHost ? ' ♛' : ''}</Text>}
          <Text style={[s.msgText, { color: t.text }]}>{item.text}</Text>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={props.visible} transparent animationType="fade" onRequestClose={props.onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
        <Pressable style={s.backdrop} onPress={props.onClose} />
        <View style={[s.sheet, { backgroundColor: t.bg, borderColor: t.border, paddingTop: insets.top + 10, paddingBottom: insets.bottom + 10 }]}>
          <View style={s.header}>
            <Ionicons name="people" size={20} color={t.accent} />
            <Text style={[s.headerTitle, { color: t.text }]}>Watch Party</Text>
            {!!roomId && <Text style={[s.headerCode, { color: t.accent }]}>{roomId}</Text>}
            <View style={{ flex: 1 }} />
            <Pressable onPress={props.onClose} hitSlop={12}>
              <Ionicons name="close" size={22} color={t.secondary} />
            </Pressable>
          </View>

          {!inParty ? (
            <View style={s.body}>
              <Text style={[s.label, { color: t.muted }]}>YOUR NAME</Text>
              <TextInput
                value={username}
                onChangeText={setUsername}
                style={[s.input, { color: t.text, borderColor: t.border }]}
                maxLength={20}
                autoCorrect={false}
              />
              <Pressable onPress={handleCreate} disabled={loading} style={[s.primaryBtn, { backgroundColor: t.accent, opacity: loading ? 0.6 : 1 }]}>
                {loading ? <ActivityIndicator color={t.onAccent} /> : <Text style={[s.primaryBtnText, { color: t.onAccent }]}>Create a party</Text>}
              </Pressable>
              <View style={s.dividerRow}>
                <View style={[s.divider, { backgroundColor: t.border }]} />
                <Text style={[s.dividerText, { color: t.muted }]}>or join with a code</Text>
                <View style={[s.divider, { backgroundColor: t.border }]} />
              </View>
              <View style={s.joinRow}>
                <TextInput
                  value={codeInput}
                  onChangeText={setCodeInput}
                  placeholder="ABC123"
                  placeholderTextColor={t.muted}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  maxLength={8}
                  style={[s.input, s.codeInput, { color: t.text, borderColor: t.border }]}
                />
                <Pressable onPress={handleJoin} disabled={loading || !codeInput.trim()} style={[s.primaryBtn, s.joinBtn, { backgroundColor: t.accent, opacity: loading || !codeInput.trim() ? 0.5 : 1 }]}>
                  <Text style={[s.primaryBtnText, { color: t.onAccent }]}>Join</Text>
                </Pressable>
              </View>
              {!!error && <Text style={[s.error, { color: t.danger }]}>{error}</Text>}
              <Text style={[s.hint, { color: t.muted }]}>
                Works with the website and desktop app — anyone with the code joins the same room, phone or PC.
              </Text>
            </View>
          ) : (
            <View style={s.bodyFill}>
              <View style={s.membersRow}>
                <View style={[s.chip, { borderColor: isHost ? t.accent : t.border }]}>
                  <Ionicons name={isHost ? 'star' : 'person'} size={12} color={isHost ? t.accent : t.secondary} />
                  <Text style={[s.chipText, { color: isHost ? t.accent : t.secondary }]}>
                    {isHost ? 'You are host' : 'Guest'} · {members.length || 1}
                  </Text>
                </View>
                {!!joinedCode && (
                  <Pressable onPress={shareInvite} style={[s.chip, { borderColor: t.border }]}>
                    <Ionicons name="share-outline" size={12} color={t.secondary} />
                    <Text style={[s.chipText, { color: t.secondary }]}>Invite</Text>
                  </Pressable>
                )}
                {!isHost && (
                  <Pressable onPress={() => party.requestSync()} style={[s.chip, { borderColor: t.border }]}>
                    <Ionicons name="sync" size={12} color={t.secondary} />
                    <Text style={[s.chipText, { color: t.secondary }]}>Sync now</Text>
                  </Pressable>
                )}
                <View style={{ flex: 1 }} />
                <Pressable onPress={handleLeave} style={[s.chip, { borderColor: t.danger }]}>
                  <Ionicons name="exit-outline" size={12} color={t.danger} />
                  <Text style={[s.chipText, { color: t.danger }]}>Leave</Text>
                </Pressable>
              </View>

              <FlatList
                ref={listRef}
                data={messages}
                keyExtractor={(m, i) => m.id || String(i)}
                renderItem={renderMessage}
                onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
                style={s.chat}
                contentContainerStyle={{ paddingVertical: 8, gap: 6 }}
              />

              <View style={s.emojiRow}>
                {QUICK_EMOJIS.map((e) => (
                  <Pressable key={e} onPress={() => party.sendReaction(e)} hitSlop={6} style={[s.emojiBtn, { borderColor: t.border }]}>
                    <Text style={s.emoji}>{e}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={s.chatRow}>
                <TextInput
                  value={inputMsg}
                  onChangeText={setInputMsg}
                  placeholder="Message the party…"
                  placeholderTextColor={t.muted}
                  style={[s.input, s.chatInput, { color: t.text, borderColor: t.border }]}
                  onSubmitEditing={sendChat}
                  returnKeyType="send"
                  maxLength={500}
                />
                <Pressable onPress={sendChat} style={[s.sendBtn, { backgroundColor: t.accent, opacity: inputMsg.trim() ? 1 : 0.5 }]}>
                  <Ionicons name="send" size={16} color={t.onAccent} />
                </Pressable>
              </View>
              {!!error && <Text style={[s.error, { color: t.danger }]}>{error}</Text>}
            </View>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.55)' },
  sheet: { width: 340, maxWidth: '50%', height: '100%', borderTopLeftRadius: 22, borderBottomLeftRadius: 22, borderWidth: 1, borderRightWidth: 0 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingTop: 6, paddingBottom: 10 },
  headerTitle: { fontSize: 15, fontWeight: '800' },
  headerCode: { fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  body: { paddingHorizontal: 14, paddingTop: 4, gap: 10 },
  bodyFill: { paddingHorizontal: 12, flex: 1 },
  label: { fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14 },
  primaryBtn: { borderRadius: 12, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  primaryBtnText: { fontSize: 14, fontWeight: '800' },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginVertical: 4 },
  divider: { flex: 1, height: 1 },
  dividerText: { fontSize: 11 },
  joinRow: { flexDirection: 'row', gap: 8 },
  codeInput: { flex: 1, letterSpacing: 3, fontWeight: '800' },
  joinBtn: { paddingHorizontal: 22 },
  error: { fontSize: 12, textAlign: 'center' },
  hint: { fontSize: 11, lineHeight: 16, marginTop: 4 },
  membersRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, marginBottom: 4, flexWrap: 'wrap' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  chipText: { fontSize: 11, fontWeight: '700' },
  chat: { flex: 1 },
  msgRow: { flexDirection: 'row' },
  bubble: { maxWidth: '82%', borderWidth: 1, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  msgSender: { fontSize: 10, fontWeight: '800', marginBottom: 1 },
  msgText: { fontSize: 13 },
  sysMsg: { fontSize: 11, textAlign: 'center', fontStyle: 'italic' },
  emojiRow: { flexDirection: 'row', gap: 4, paddingVertical: 8, flexWrap: 'wrap' },
  emojiBtn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  emoji: { fontSize: 16 },
  chatRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  chatInput: { flex: 1 },
  sendBtn: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
});
