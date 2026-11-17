import { Redirect, Tabs } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '../../components/Icon';
import { colors, fonts } from '../../lib/theme';
import { useUser } from '../../lib/UserContext';

const icon = (name: IconName) =>
  function TabIcon({ focused }: { focused: boolean }) {
    return <Icon name={name} size={26} color={focused ? colors.pink : colors.faint} strokeWidth={focused ? 2.8 : 2.2} />;
  };

/** The app shell: Learn (the path), Review (spaced repetition) and You (progress and settings). */
export default function TabsLayout() {
  const { ready, userId, user } = useUser();
  const insets = useSafeAreaInsets();

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.pink} />
      </View>
    );
  }
  if (!userId) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.pink,
        tabBarInactiveTintColor: colors.faint,
        tabBarLabelStyle: { fontFamily: fonts.bodyBold, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: colors.panel,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          height: 62 + insets.bottom,
          paddingTop: 6,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Learn', tabBarIcon: icon('learn') }} />
      <Tabs.Screen
        name="review"
        options={{
          title: 'Review',
          tabBarIcon: icon('review'),
          tabBarBadge: user && user.due_count > 0 ? user.due_count : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.gold, color: colors.pinkInk, fontFamily: fonts.bodyBold, fontSize: 11 },
        }}
      />
      <Tabs.Screen name="gear" options={{ title: 'Gear', tabBarIcon: icon('loot') }} />
      <Tabs.Screen name="you" options={{ title: 'You', tabBarIcon: icon('user') }} />
    </Tabs>
  );
}
