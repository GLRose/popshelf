import type { Session } from '@supabase/supabase-js';

import { purgeCollectionAs } from '@/lib/remoteCollection';
import { ensureAnonSession, supabase } from '@/lib/supabase';

/**
 * How the email a user typed is being turned into a permanent account.
 *
 * 'link'   - the address is unclaimed, so it gets attached to the anonymous
 *            user we already are. auth.uid() is preserved, which means every
 *            shelf, favorite, and submitted image row already points at the
 *            right owner and nothing has to be moved.
 *
 * 'signin' - the address already belongs to a permanent user (a second device,
 *            or a reinstall after clearing storage). We cannot link to it, so
 *            we sign in as them and get a *different* auth.uid(). The device's
 *            shelves are merged up into that account afterwards.
 */
export type CodeMode = 'link' | 'signin';

export interface CodeRequest {
  mode: CodeMode;
  /** True when the project has email confirmations off and 'link' completed outright, so no code is coming. */
  alreadyLinked: boolean;
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

/**
 * Both flows below mail a 6-digit code, but only if the project's email
 * templates render it. Supabase always mints the token and verifyOtp() always
 * accepts it, yet the stock "Magic Link" and "Change email address" templates
 * interpolate `{{ .ConfirmationURL }}` alone, so the user receives a link and
 * no code. Both templates must include `{{ .Token }}`; neither should keep the
 * URL, since the app sets detectSessionInUrl: false and registers no deep-link
 * handler, making that link a dead end. This is dashboard state, invisible to
 * supabase/schema.sql, and it is not something the client can detect.
 */

/**
 * Emails a code to an address that is expected to already have an account,
 * skipping the link attempt entirely.
 *
 * This is the "I already have an account" path, and it is what makes a second
 * device work deterministically. sendEmailCode() below can only *infer* the
 * same intent from an `email_exists` error, which assumes updateUser() reports
 * the collision rather than swallowing it for enumeration reasons - a project
 * setting we cannot see from here. When the user tells us outright, believe
 * them instead of probing.
 *
 * Never creates a user: on a typo'd address shouldCreateUser would silently
 * mint an empty account and strand the real one. `user_not_found` surfaces to
 * the user as "no account exists for that email", which is the honest answer
 * once they have claimed one exists.
 */
export async function sendSignInCode(email: string): Promise<CodeRequest> {
  const sb = client();
  await ensureAnonSession();

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;

  return { mode: 'signin', alreadyLinked: false };
}

/**
 * Emails a 6-digit code, choosing between linking and signing in based on
 * whether the address is already taken. Deliberately does not tell the caller
 * (or the user) which one happened before the code is verified: "is this email
 * registered?" is not a question an unprompted form should answer.
 *
 * Used when the user has expressed no intent either way. If they have said they
 * already have an account, call sendSignInCode() - it does not have to guess.
 */
export async function sendEmailCode(email: string): Promise<CodeRequest> {
  const sb = client();
  await ensureAnonSession();

  // Try to claim the address for the anonymous user we already are. Supabase
  // sends a confirmation to the new address containing a 6-digit code; we
  // verify it below with type 'email_change'.
  const { data, error } = await sb.auth.updateUser({ email });

  if (!error) {
    // With "Confirm email change" disabled project-side, updateUser applies
    // immediately and no code is ever sent. Detect that rather than parking
    // the user on a code screen forever waiting for mail that isn't coming.
    const pendingConfirmation = Boolean(data.user?.new_email);
    return { mode: 'link', alreadyLinked: !pendingConfirmation };
  }

  if (error.code !== 'email_exists') throw error;

  // The address belongs to someone already, so sign in as them instead.
  return sendSignInCode(email);
}

export interface VerifyResult {
  userId: string;
  /**
   * The anonymous user we abandoned to sign in as someone else, if any. Its
   * shelves and favorites have already been deleted by the time this returns;
   * the device's local copy is what gets merged into the account.
   */
  abandonedUserId: string | null;
}

/**
 * Confirms the 6-digit code. On the 'signin' path this changes auth.uid(), so
 * it also clears the rows the old anonymous user owned - otherwise they would
 * collide, unfixably, with the merge that follows: shelves.id is a global
 * primary key, and RLS's `using (owner_id = auth.uid())` forbids re-owning a
 * row you no longer own, so the upsert would be denied rather than reassigned.
 *
 * The purge runs only after the code is known good, using a detached client
 * still holding the anonymous session. A wrong code must not destroy anything.
 */
export async function verifyEmailCode(
  email: string,
  token: string,
  mode: CodeMode,
): Promise<VerifyResult> {
  const sb = client();

  if (mode === 'link') {
    const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email_change' });
    if (error) throw error;
    if (!data.user) throw new Error('Verification returned no user');
    return { userId: data.user.id, abandonedUserId: null };
  }

  const { data: before } = await sb.auth.getSession();
  const anonSession = before.session?.user.is_anonymous ? before.session : null;

  const { data, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
  if (!data.user) throw new Error('Verification returned no user');

  if (anonSession && anonSession.user.id !== data.user.id) {
    await purgeAbandonedAnon(anonSession);
    return { userId: data.user.id, abandonedUserId: anonSession.user.id };
  }
  return { userId: data.user.id, abandonedUserId: null };
}

/**
 * Best-effort: the account is already signed into and the device still holds
 * the full collection, so a failed cleanup costs some orphaned rows, not data.
 * Worth a warning, not a thrown error in the user's face.
 *
 * Note that images this anonymous user submitted stay theirs (figure_images
 * .owner_id), so the signed-in user loses the ability to delete them. That is
 * inherent to joining an account from a device that was never part of it, and
 * it is why the 'link' path above is the one that preserves auth.uid().
 */
async function purgeAbandonedAnon(session: Session): Promise<void> {
  try {
    await purgeCollectionAs(session);
  } catch (e) {
    console.warn('Failed to clean up the abandoned anonymous collection', e);
  }
}

/** Ends the session and returns to a fresh anonymous identity. */
export async function signOutToAnon(): Promise<void> {
  const sb = client();
  await sb.auth.signOut();
  await ensureAnonSession();
}
