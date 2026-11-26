import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName } from '../../components/ui';
import { useTheme } from '../../theme';

export default function TabsLayout() {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          height: 80 + insets.bottom,
          paddingTop: 6,
          paddingBottom: Math.max(insets.bottom, 8),
        },
        tabBarLabelStyle: { fontSize: 10, lineHeight: 14, fontWeight: '600', marginTop: 3 },
      }}
    >
      {(
        [
          { name: 'index', title: 'События', icon: 'albums-outline' },
          { name: 'plans', title: 'Мои планы', icon: 'calendar-outline' },
          { name: 'profile', title: 'Профиль', icon: 'person-outline' },
        ] as { name: string; title: string; icon: IconName }[]
      ).map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color }) => <Icon name={tab.icon} color={color} size={22} />,
          }}
        />
      ))}
      <Tabs.Screen name="invites" options={{ href: null }} />
    </Tabs>
  );
}
