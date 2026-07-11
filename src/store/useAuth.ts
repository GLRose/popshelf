import { create } from 'zustand';

import * as auth from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useCollection } from '@/store/useCollection';

/**
 * 'unconfigured' - no Supabase project; the app is local-only and there is
 *                  nothing to sign into. The account UI hides itself.
 * 'signedOut'    - the default. Shelves and favorites live on this device only,
 *                  and vanish with a reinstall, a cleared browser, or a new
 *                  phone. This is what an account fixes.
 * 'signedIn'     - a permanent user, reachable from anywhere by email.
 */
export type AuthStatus = 'loading' | 'unconfigured' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  email: string | null;
  userId: string | null;

  /** Reads the current session and subscribes to future changes. Idempotent. */
  hydrate: () => void;
  /** Creates an account, then folds this device's shelves into it. */
  signUp: (email: string, password: string) => Promise<auth.SignUpResult>;
  /** Signs in, then merges this device's shelves with the ones already in the account. */
  signIn: (email: string, password: string) => Promise<void>;
  /** Signs out and drops this device's copy of the collection. */
  signOut: () => Promise<void>;
}

let subscribed = false;

export const useAuth = create<AuthState>()((set) => ({
  status: supabase ? 'loading' : 'unconfigured',
  email: null,
  userId: null,

  hydrate: () => {
    if (!supabase || subscribed) return;
    subscribed = true;

    // Fires immediately with the restored session (or with none), and again on
    // every sign-in, sign-out, and token refresh. This is the only writer of
    // `status`: the actions below call into src/lib/auth.ts and let the
    // resulting event land here, so a session restored at startup and one
    // created by a tap take exactly the same path.
    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;

      // An anonymous session left behind by the previous build. It is not an
      // account - it has no email and can never be signed back into - so report
      // signed out, and clear it so this only happens once. The resulting
      // sign-out re-enters here with no session, which is the same state.
      if (user?.is_anonymous) {
        auth
          .retireAnonymousSession()
          .catch((e) => console.warn('Failed to retire the anonymous session', e));
        set({ status: 'signedOut', email: null, userId: null });
        return;
      }

      set({
        status: user ? 'signedIn' : 'signedOut',
        email: user?.email ?? null,
        userId: user?.id ?? null,
      });
    });
  },

  signUp: async (email, password) => {
    const result = await auth.signUp(email, password);
    // Nothing to adopt while the account is unconfirmed: there is no session
    // yet, so every write would be rejected by RLS. The shelves stay on the
    // device and are adopted by the first successful sign-in instead.
    if (!result.needsConfirmation) {
      await useCollection.getState().adoptRemoteCollection();
    }
    return result;
  },

  signIn: async (email, password) => {
    await auth.signIn(email, password);
    await useCollection.getState().adoptRemoteCollection();
  },

  signOut: async () => {
    await auth.signOut();
    await useCollection.getState().resetToEmpty();
  },
}));
