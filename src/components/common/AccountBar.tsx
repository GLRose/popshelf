import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/constants/appTheme';
import { useAuth } from '@/store/useAuth';

const H_PADDING = 16;
const MAX_WIDTH = 900;

/**
 * The way into the account screen. An account is app-wide - it owns the shelves,
 * the favorites, and the browse progress - so it appears on every tab rather
 * than only under Shelf, where it used to hide.
 *
 * Two shapes, because the three tabs are not built alike:
 *
 *   AccountButton - the button itself, for a screen that already has a row of
 *                   header actions to sit in (Shelf, alongside customize/edit).
 *   AccountBar    - the same button in a right-aligned row of its own, for the
 *                   screens that have no such row (Browse, Favorites).
 *
 * The bar exists because Browse and Favorites keep their titles *inside* their
 * scrolling list, and an icon there would scroll out of view precisely when
 * someone goes hunting for it. Its padding and max-width match the content
 * column on those screens, which lands it at the same height as Shelf's action
 * row - so the button is in the same place on all three tabs either way.
 */
export function AccountButton() {
  const router = useRouter();
  const status = useAuth((s) => s.status);

  // No Supabase project on this build, so there is nothing to sign in to.
  if (status === 'unconfigured') return null;

  const signedIn = status === 'signedIn';

  return (
    <Pressable
      onPress={() => router.push('/account')}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={signedIn ? 'Account' : 'Save your shelves'}
      style={({ pressed }) => [styles.btn, pressed && styles.pressed]}>
      <Ionicons
        name={signedIn ? 'person-circle' : 'person-circle-outline'}
        size={20}
        color={T.text}
      />
    </Pressable>
  );
}

export function AccountBar() {
  const status = useAuth((s) => s.status);
  if (status === 'unconfigured') return null;

  return (
    <View style={styles.bar}>
      <AccountButton />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: H_PADDING,
    paddingTop: 8,
    maxWidth: MAX_WIDTH,
    width: '100%',
    alignSelf: 'center',
  },
  // Matches the IconBtn on the shelf screen, so the two rows of controls read as
  // the same kind of thing.
  btn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.6 },
});
