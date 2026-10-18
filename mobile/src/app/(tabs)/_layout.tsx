import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePrefs } from '../../prefs';

export default function TabsLayout() {
  const { t } = usePrefs();
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarStyle: { backgroundColor: t.surface, borderTopColor: t.border }, tabBarActiveTintColor: t.accent, tabBarInactiveTintColor: t.muted, sceneStyle: { backgroundColor: t.bg } }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color }) => <Ionicons name="home" size={22} color={color} /> }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ({ color }) => <Ionicons name="search" size={22} color={color} /> }} />
      <Tabs.Screen name="watchlist" options={{ title: 'Watchlist', tabBarIcon: ({ color }) => <Ionicons name="bookmark" size={22} color={color} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: ({ color }) => <Ionicons name="settings" size={22} color={color} /> }} />
    </Tabs>
  );
}
