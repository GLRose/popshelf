import { create } from 'zustand';

import { signOutToAnon } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useCollection } from '@/store/useCollection';

/**
 * 'unconfigured' - no Supabase project; the app is local-only and there is
 *                  nothing to sign into. The account UI hides itself.
 * 'anonymous'    - the default identity every install gets. Real, and durable
 *                  until the device forgets it (reinstall, cleared storage, or
 *                  simply a second device). This is what an account fixes.
 * 'signedIn'     - a permanent user, reachable from anywhere by email.
 */
export type AuthStatus = 'loading' | 'unconfigured' | 'anonymous' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  email: string | null;
  userId: string | null;

  /** Reads the current session and subscribes to future changes. Idempotent. */
  hydrate: () => void;
  /** Signs out, drops this device's collection, and returns to a fresh anonymous identity. */
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

    // Fires immediately with the restored session, and again on every sign-in,
    // sign-out, token refresh, and user update - including the updateUser()
    // that links an email, so `email` lands here without being plumbed through.
    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;
      if (!user) {
        set({ status: 'anonymous', email: null, userId: null });
        return;
      }
      set({
        status: user.is_anonymous ? 'anonymous' : 'signedIn',
        email: user.email ?? null,
        userId: user.id,
      });
    });
  },

  signOut: async () => {
    await signOutToAnon();
    await useCollection.getState().resetToEmpty();
  },
}));
