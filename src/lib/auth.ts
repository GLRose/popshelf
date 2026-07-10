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
 * Emails a 6-digit code, choosing between linking and signing in based on
 * whether the address is already taken. Deliberately does not tell the caller
 * (or the user) which one happened before the code is verified: "is this email
 * registered?" is not a question an unauthenticated form should answer.
 */
export async function sendEmailCode(email: string): Promise<CodeRequest> {
  const sb = client();
  await ensureAnonSession();

  // Try to claim the address for the anonymous user we already are. Supabase
  // sends a confirmation to the new address containing both a link and a
  // 6-digit code; we verify the code below with type 'email_change'.
  const { data, error } = await sb.auth.updateUser({ email });

  if (!error) {
    // With "Confirm email change" disabled project-side, updateUser applies
    // immediately and no code is ever sent. Detect that rather than parking
    // the user on a code screen forever waiting for mail that isn't coming.
    const pendingConfirmation = Boolean(data.user?.new_email);
    return { mode: 'link', alreadyLinked: !pendingConfirmation };
  }

  if (error.code !== 'email_exists') throw error;

  // The address belongs to someone already. Sign in as them instead. Never
  // create a user here: `email_exists` proves one exists, and shouldCreateUser
  // would otherwise silently mint an empty account on a typo'd address.
  const { error: otpError } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false },
  });
  if (otpError) throw otpError;

  return { mode: 'signin', alreadyLinked: false };
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
