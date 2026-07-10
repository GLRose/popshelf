import { useFonts } from 'expo-font';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useRef } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';

import { completeAuthFromUrl, type AuthLinkResult } from '@/lib/auth';
import { addAuthUrlListener, takeInitialAuthUrl } from '@/lib/authRedirect';
import { FONT_FAMILY } from '@/lib/globalFont';
import { useAuth } from '@/store/useAuth';
import { useCollection } from '@/store/useCollection';
import { useUserImages } from '@/store/useUserImages';

SplashScreen.preventAutoHideAsync();

/**
 * Folds this device's shelves into whatever account the link turned out to
 * belong to, or reports why it could not.
 *
 * Must run *after* useCollection.hydrate(). adoptRemoteCollection() merges
 * whatever is in the store right now, and before hydration that is the empty
 * starter shelf, not the device's real collection. Merging too early pushes a
 * phantom shelf into the account and leaves the genuine ones to be synced up
 * separately afterwards, so the user lands on a duplicate.
 */
async function settleAuthLink(result: AuthLinkResult): Promise<void> {
  if (!result.ok) {
    console.warn('Email link rejected', result.errorCode, result.message);
    useAuth.getState().setLinkError(result.message);
    return;
  }
  await useCollection.getState().adoptRemoteCollection();
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    [FONT_FAMILY]: require('../../assets/fonts/BricolageGrotesque.ttf'),
  });
  /**
   * The link can finish before or after the navigator mounts, and only the
   * second of the two to arrive can act. Tracked in a ref because neither is
   * rendered: waking the tree up to carry a flag between two effects would just
   * be a re-render that paints nothing.
   */
  const nav = useRef({ handled: false, mounted: false, done: false });

  const showResultWhenReady = () => {
    const state = nav.current;
    if (!state.handled || !state.mounted || state.done) return;
    state.done = true;
    router.push('/account');
  };

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
      nav.current.mounted = true;
      showResultWhenReady();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Claim the session before anything else touches Supabase. hydrate() opens
      // an anonymous session on first reach, and completeAuthFromUrl() has to see
      // the *outgoing* anonymous identity in order to clean up after it.
      const url = await takeInitialAuthUrl();
      const result = url
        ? await completeAuthFromUrl(url).catch((e) => {
            console.warn('Failed to complete sign-in from the email link', e);
            return { ok: false, errorCode: null, message: 'That sign-in link did not work.' } as const;
          })
        : null;

      // Subscribe before hydrating: useCollection.hydrate() establishes the
      // anonymous session, and the auth store should see that arrive.
      useAuth.getState().hydrate();
      useUserImages.getState().hydrate();
      await useCollection.getState().hydrate();

      if (result) await settleAuthLink(result);
      if (cancelled || !result) return;
      nav.current.handled = true;
      showResultWhenReady();
    })();

    // Native only: the app was already open, and hydrated, when the link was tapped.
    const unsubscribe = addAuthUrlListener((url) => {
      completeAuthFromUrl(url)
        .then(async (result) => {
          if (!result) return;
          await settleAuthLink(result);
          if (cancelled) return;
          nav.current = { ...nav.current, handled: true, done: false };
          showResultWhenReady();
        })
        .catch((e) => console.warn('Failed to complete sign-in from the email link', e));
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="admin" options={{ presentation: 'modal' }} />
          <Stack.Screen name="account" options={{ presentation: 'modal' }} />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
