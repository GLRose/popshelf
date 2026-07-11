import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/**
 * Null until EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY are set
 * (see .env.example), so the app works fully offline/local-only before Supabase
 * is configured.
 *
 * There is no session until the user signs in, and both states are normal. A
 * signed-out device sends the anon key and hits RLS as the 'anon' role; a
 * signed-in one sends its access token instead, whose role claim is
 * 'authenticated' (see SupabaseClient._getAccessToken). Anything a browsing user
 * must be able to read has to name both roles in supabase/schema.sql, since a
 * signed-out user is a first-class user of this app - they just can't own rows.
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
 * The signed-in user's id, or null when signed out or unconfigured.
 *
 * getSession() resolves the persisted session first, so this is safe to call at
 * startup before onAuthStateChange has fired. Owned-row callers use it to decide
 * whether there is an owner at all: with no session they skip the remote mirror
 * entirely and the on-device collection stands alone.
 *
 * A restored *anonymous* session counts as no user. Devices that ran the build
 * before this one still have one persisted here, and supabase-js will hand it
 * back for as long as its refresh token lives - so without this check, an
 * upgrading user would silently keep writing rows as an identity they can never
 * sign back into. retireAnonymousSession() clears it out for good; this makes
 * sure nothing writes as it in the meantime.
 */
export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  if (!user || user.is_anonymous) return null;
  return user.id;
}
