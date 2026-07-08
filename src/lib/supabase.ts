import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Null until EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are set
 * (see .env.example), so the app works fully offline/local-only before
 * Supabase is configured.
 *
 * Regular users never call supabase.auth.* - browsing/submitting always run
 * as the 'anon' role and nothing is ever written to AsyncStorage for them.
 * Session persistence is enabled here solely so the hidden admin/moderation
 * screen (src/app/admin.tsx) can keep a signed-in reviewer session across app
 * launches; see supabase/schema.sql for the RLS that gates what a signed-in
 * session can actually do.
 */
export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: {
          storage: AsyncStorage,
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false,
        },
      })
    : null;

/**
 * Every install gets its own anonymous Supabase session so per-device data
 * (shelves, favorites - see src/lib/remoteCollection.ts) can be scoped to a
 * real auth.uid() under RLS, without requiring a login. The session persists
 * across launches via the AsyncStorage-backed auth storage configured above,
 * so this only signs in once per install. Requires "Anonymous Sign-Ins" to be
 * enabled in the Supabase dashboard (Authentication > Sign In / Providers).
 */
export async function ensureAnonSession(): Promise<string | null> {
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  if (data.session) return data.session.user.id;

  const { data: signInData, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.warn('Failed to start anonymous session', error);
    return null;
  }
  return signInData.user?.id ?? null;
}
