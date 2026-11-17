import { Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_800ExtraBold, useFonts } from '@expo-google-fonts/nunito';
import * as Notifications from 'expo-notifications';
import { Stack, router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { colors, fonts } from '../lib/theme';
import { UserProvider, useUser } from '../lib/UserContext';

function NotificationTapHandler() {
  // Tapping a reminder opens the home screen, where the next lesson and any due reviews are waiting.
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.notification.request.content.data?.type === 'reminder') router.navigate('/');
    });
    return () => sub.remove();
  }, []);
  return null;
}

function RefreshOnForeground() {
  // Coming back to the app (e.g. the next day) refreshes the streak and reschedules reminders.
  const { refresh } = useUser();
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_800ExtraBold,
  });
  if (!fontsLoaded && !fontError) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaProvider>
      <UserProvider>
        <StatusBar style="light" />
        <NotificationTapHandler />
        <RefreshOnForeground />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTintColor: colors.text,
            headerTitleStyle: { fontFamily: fonts.display, fontSize: 20 },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
          <Stack.Screen name="lesson" options={{ headerShown: false, gestureEnabled: false, presentation: 'fullScreenModal' }} />
          <Stack.Screen name="tracks" options={{ title: 'Your tracks' }} />
        </Stack>
      </UserProvider>
    </SafeAreaProvider>
  );
}
