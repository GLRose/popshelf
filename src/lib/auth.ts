import { supabase } from '@/lib/supabase';

/**
 * Email + password, and nothing else. No anonymous sessions, no emailed codes,
 * no magic links.
 *
 * The app is local-first: a signed-out device keeps its shelves and favorites in
 * AsyncStorage (src/lib/localCollection.ts) and never talks to auth at all.
 * Signing in is what gives those rows an owner, after which they sync and follow
 * the account to any other device. So the only thing this module does is settle
 * *who* the user is; useCollection is what moves the data.
 *
 * Deliberately no OTP flow. The previous one emailed a 6-digit code and had to
 * guess, from an `email_exists` error, whether to link the address to the
 * device's anonymous user or sign in as an existing one - two paths with
 * different auth.uid() outcomes, one of which had to purge and re-upload the
 * whole collection. It also depended on Supabase's built-in SMTP, which the free
 * tier rate-limits and only delivers to project team members. Passwords need no
 * mail server, so nothing here can be throttled or undelivered.
 */

/**
 * Supabase enforces its own minimum (Authentication > Sign In / Providers), 6
 * characters by default. This is checked client-side purely so the user hears
 * about it while typing rather than after a round trip; raising the dashboard
 * setting to match is what actually enforces it.
 */
export const MIN_PASSWORD_LENGTH = 8;

export interface SignUpResult {
  /**
   * True when the project requires email confirmation, so signUp() returned no
   * session and the user is not signed in yet.
   *
   * Expected to be false: with "Confirm email" off (see supabase/schema.sql),
   * signUp() mints a session immediately and account creation is a single step.
   * Handled anyway so that turning confirmation on - once a real SMTP provider
   * is configured - is a dashboard change and not a code change.
   */
  needsConfirmation: boolean;
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

/**
 * Creates an account and, unless the project demands email confirmation, signs
 * straight into it.
 */
export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const sb = client();
  const { data, error } = await sb.auth.signUp({ email, password });
  if (error) throw error;

  // With confirmation ON, Supabase will not admit that an address is taken -
  // signUp() succeeds with a decoy user carrying no identities rather than
  // returning `user_already_exists`, so that signup cannot be used to enumerate
  // accounts. Left unhandled, that decoy reads as a fresh account and parks the
  // user on "check your email" forever, waiting for mail that only says "someone
  // tried to sign up as you". With confirmation OFF this cannot happen (the real
  // error comes back), which is exactly why it is worth handling here: it is the
  // failure that would appear the day the toggle is flipped.
  if (data.user && data.user.identities?.length === 0) {
    throw new Error('An account already exists for that email address. Sign in instead.');
  }

  return { needsConfirmation: !data.session };
}

/** Signs into an existing account. */
export async function signIn(email: string, password: string): Promise<void> {
  const sb = client();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

/** Ends the session. The device drops back to local-only. */
export async function signOut(): Promise<void> {
  const sb = client();
  const { error } = await sb.auth.signOut();
  if (error) throw error;
}

/**
 * Discards a leftover anonymous session from the build that had one, so an
 * upgrading device starts out plainly signed out rather than holding an identity
 * with no email that it could never sign back into.
 *
 * Deliberately does NOT touch the local collection, unlike the sign-out above.
 * The shelves on this device are exactly what the anonymous user owned, they are
 * the user's real collection, and they stay put in AsyncStorage - the first
 * sign-up or sign-in folds them into a proper account (see
 * useCollection.adoptRemoteCollection). Clearing them here would delete the data
 * this whole change exists to preserve.
 *
 * The rows that anonymous user owned in Supabase are now unreachable; see the
 * cleanup note at the bottom of supabase/schema.sql.
 */
export async function retireAnonymousSession(): Promise<void> {
  if (!supabase) return;

  const { data } = await supabase.auth.getSession();
  if (!data.session?.user.is_anonymous) return;

  await supabase.auth.signOut();
}
