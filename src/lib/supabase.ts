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
