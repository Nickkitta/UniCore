import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { useEffect } from 'react';
import { CampusProvider, useCampus } from '../state/CampusProvider';
import { ThemeProvider, useTheme } from '../theme';
import { AppKeyboardProvider } from '../components/KeyboardLayout';

function Routes() {
  const { state } = useCampus();
  const { colors, setTheme } = useTheme();
  useEffect(() => {
    setTheme(state.session ? state.profile.theme || 'violet' : 'violet');
  }, [state.session, state.profile.theme, setTheme]);
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Protected guard={!state.session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
      <Stack.Protected guard={state.session}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="activity/[id]" />
        <Stack.Screen name="create" options={{ presentation: 'modal' }} />
        <Stack.Screen name="edit-profile" options={{ presentation: 'modal' }} />
      </Stack.Protected>
    </Stack>
  );
}
function App() {
  const { colors, dark } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <CampusProvider>
        <Routes />
      </CampusProvider>
    </View>
  );
}
export default function RootLayout() {
  return (
    <ThemeProvider>
      <AppKeyboardProvider>
        <App />
      </AppKeyboardProvider>
    </ThemeProvider>
  );
}
