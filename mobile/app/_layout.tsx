import '@/global.css';

import { SessionProvider, useSession } from '@/lib/session';
import { NAV_THEME } from '@/lib/theme';
import { ToastProvider } from '@/lib/toast';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { ThemeProvider } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <SafeAreaProvider>
      <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
        <ToastProvider>
          <SessionProvider>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <Routes />
            <PortalHost />
          </SessionProvider>
        </ToastProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

/** Shows the connect screen until signed in, then the tabs. */
function Routes() {
  const { state } = useSession();

  React.useEffect(() => {
    if (state.status !== 'loading') SplashScreen.hideAsync();
  }, [state.status]);

  if (state.status === 'loading') return null;
  const signedIn = state.status === 'signedIn';

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(tabs)" />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="connect" />
      </Stack.Protected>
    </Stack>
  );
}
