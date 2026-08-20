import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { colors } from '@/constants/theme';
import { SessionProvider, useSession } from '@/providers/session-provider';

function RootNavigator() {
  const { phase, hasRequiredConsents } = useSession();
  const signedIn = phase === 'authenticated';

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'fade',
        }}>
        <Stack.Screen name="index" />
        <Stack.Protected guard={phase === 'anonymous'}>
          <Stack.Screen name="login" />
          <Stack.Screen name="register" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && !hasRequiredConsents}>
          <Stack.Screen name="consents" />
        </Stack.Protected>
        <Stack.Protected guard={signedIn && hasRequiredConsents}>
          <Stack.Screen name="home" />
          <Stack.Screen name="check-in" />
          <Stack.Screen name="analysis/[checkInId]" />
          <Stack.Screen name="diary/[checkInId]" />
          <Stack.Screen name="trends" />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <RootNavigator />
    </SessionProvider>
  );
}
