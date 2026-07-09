import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type AuthError, type SupabaseClient } from '@supabase/supabase-js';

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

let lastError: AuthError | null = null;
let reportedCode: string | undefined;

/** Why the last anonymous sign-in failed, for callers that need to explain themselves. */
export function anonSessionError(): AuthError | null {
  return lastError;
}

/**
 * Every install gets its own anonymous Supabase session so per-device data
 * (shelves, favorites - see src/lib/remoteCollection.ts) and owned image
 * submissions (figure_images.owner_id) can be scoped to a real auth.uid() under
 * RLS, without requiring a login. The session persists across launches via the
 * AsyncStorage-backed auth storage configured above, so this only signs in once
 * per install. Requires "Anonymous Sign-Ins" to be enabled in the Supabase
 * dashboard (Authentication > Sign In / Providers).
 *
 * Still returns null rather than throwing, because most callers legitimately
 * treat "no session" as "skip the remote mirror" - but it says so at error
 * level, once per distinct reason. A silent warn was survivable when a missing
 * session only meant shelves didn't sync; now it also means a submitted image
 * can never be shared with anyone, which is worth shouting about.
 */
export async function ensureAnonSession(): Promise<string | null> {
  if (!supabase) return null;

  const { data } = await supabase.auth.getSession();
  if (data.session) return succeed(data.session.user.id);

  const { data: signInData, error } = await supabase.auth.signInAnonymously();
  if (error) {
    lastError = error;
    // Deduped: six call sites hit this per launch, and six identical stack
    // traces bury the one line that explains the cause.
    if (reportedCode !== error.code) {
      reportedCode = error.code;
      console.error(
        `Anonymous sign-in failed (${error.code ?? error.status ?? 'unknown'}): ${error.message}. ` +
          'Until this succeeds, shelves and favorites never reach Supabase, and any image ' +
          'submitted for review is stranded on this device. In Authentication > Sign In / ' +
          'Providers, BOTH "Anonymous Sign-Ins" and "Allow new users to sign up" must be on: ' +
          'signInAnonymously() is implemented as a signup, so disabling signups disables it too.',
        error,
      );
    }
    return null;
  }
  return succeed(signInData.user?.id ?? null);
}

function succeed(id: string | null): string | null {
  lastError = null;
  reportedCode = undefined;
  return id;
}
