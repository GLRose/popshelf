import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Null until EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are set
 * (see .env.example), so the app works fully offline/local-only before
 * Supabase is configured.
 *
 * Note that once ensureAnonSession() below has run - which it does on every
 * launch, via useCollection.hydrate() - this client stops sending the anon key
 * on rest/storage requests and sends the session's access token instead, whose
 * role claim is 'authenticated' (see SupabaseClient._getAccessToken). So a
 * plain browsing/submitting user hits RLS as 'authenticated', not as 'anon'.
 * Any policy in supabase/schema.sql that should apply to regular users has to
 * name both roles; granting only `to anon` silently denies everyone.
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
