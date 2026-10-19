import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { PrefsProvider, usePrefs } from '../prefs';
import { setApiBase } from '../api';
import { UpdateGate, WhatsNew } from '../updates';

function ApplyPrefs() {
  const { t, apiBase } = usePrefs();
  useEffect(() => { setApiBase(apiBase); }, [apiBase]);
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerStyle: { backgroundColor: t.bg }, headerTintColor: '#fff', contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="details/[type]/[id]" options={{ title: 'Details' }} />
        <Stack.Screen name="play/[type]/[id]" options={{ headerShown: false }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <PrefsProvider>
      <ApplyPrefs />
      <UpdateGate />
      <WhatsNew />
    </PrefsProvider>
  );
}
