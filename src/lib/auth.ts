import type { Session } from '@supabase/supabase-js';

import { authRedirectTo, fragmentParams } from '@/lib/authRedirect';
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
export type LinkMode = 'link' | 'signin';

export interface LinkRequest {
  mode: LinkMode;
  /** True when the project has email confirmations off and 'link' completed outright, so no mail is coming. */
  alreadyLinked: boolean;
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

/**
 * Both flows below mail a verification link, and the user finishes by opening
 * it. completeAuthFromUrl() below picks the session back up when Supabase
 * bounces them into the app.
 *
 * Supabase mints a 6-digit token alongside that link, and this used to be a
 * code-entry flow. It cannot be, on this project: a free-tier project using the
 * built-in email sender is forbidden from editing its email templates, and the
 * stock templates render {{ .ConfirmationURL }} and never {{ .Token }}, so no
 * code ever reaches the user. The link and the code are the same single-use
 * token either way, so a link-only flow loses nothing.
 *
 * That same built-in sender also refuses to deliver to any address outside the
 * project's organization. Until custom SMTP is configured, sign-in works for
 * the project's own members and for nobody else.
 */

/**
 * Emails a sign-in link to an address that is expected to already have an
 * account, skipping the link attempt entirely.
 *
 * This is the "I already have an account" path, and it is what makes a second
 * device work deterministically. sendEmailLink() below can only *infer* the
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
export async function sendSignInLink(email: string): Promise<LinkRequest> {
  const sb = client();
  await ensureAnonSession();

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: authRedirectTo() },
  });
  if (error) throw error;

  return { mode: 'signin', alreadyLinked: false };
}

/**
 * Emails a verification link, choosing between linking and signing in based on
 * whether the address is already taken. Deliberately does not tell the caller
 * (or the user) which one happened before the link is opened: "is this email
 * registered?" is not a question an unprompted form should answer.
 *
 * Used when the user has expressed no intent either way. If they have said they
 * already have an account, call sendSignInLink() - it does not have to guess.
 */
export async function sendEmailLink(email: string): Promise<LinkRequest> {
  const sb = client();
  await ensureAnonSession();

  // Try to claim the address for the anonymous user we already are. Supabase
  // mails a confirmation to the new address; opening it lands back in
  // completeAuthFromUrl() with type=email_change.
  const { data, error } = await sb.auth.updateUser(
    { email },
    { emailRedirectTo: authRedirectTo() },
  );

  if (!error) {
    // With "Confirm email" disabled project-side, updateUser applies
    // immediately and no mail is ever sent. Detect that rather than parking
    // the user on a "check your inbox" screen forever waiting for a link
    // that isn't coming.
    const pendingConfirmation = Boolean(data.user?.new_email);
    return { mode: 'link', alreadyLinked: !pendingConfirmation };
  }

  if (error.code !== 'email_exists') throw error;

  // The address belongs to someone already, so sign in as them instead.
  return sendSignInLink(email);
}

export type AuthLinkResult =
  | {
      ok: true;
      userId: string;
      /**
       * The anonymous user we abandoned to sign in as someone else, if any. Its
       * shelves and favorites have already been deleted by the time this returns;
       * the device's local copy is what gets merged into the account.
       */
      abandonedUserId: string | null;
    }
  | { ok: false; errorCode: string | null; message: string };

/**
 * Supabase states this failure as "Email link is invalid or has expired", which
 * tells a user who clicked a link they were mailed twenty minutes ago nothing
 * they can act on. Both codes arrive together on a spent link.
 */
const LINK_ERRORS: Record<string, string> = {
  otp_expired: 'That link has expired or was already used. Request a new one.',
  access_denied: 'That link has expired or was already used. Request a new one.',
};

/**
 * Adopts the session Supabase put in the URL fragment after verifying an email
 * link, and returns null for an ordinary launch with no link in the URL.
 *
 * On the 'signin' path this changes auth.uid(), so it also clears the rows the
 * old anonymous user owned - otherwise they would collide, unfixably, with the
 * merge that follows: shelves.id is a global primary key, and RLS's
 * `using (owner_id = auth.uid())` forbids re-owning a row you no longer own, so
 * the upsert would be denied rather than reassigned.
 *
 * The anonymous session has to be read *before* setSession() replaces it, which
 * is also why the client sets detectSessionInUrl: false. Left to its own
 * devices supabase-js swallows the fragment during construction, and by the
 * time any of our code runs the identity we needed to clean up is gone.
 */
export async function completeAuthFromUrl(url: string): Promise<AuthLinkResult | null> {
  const sb = client();

  const params = fragmentParams(url);
  if (!params) return null;

  if (params.error || params.error_code) {
    const code = params.error_code ?? params.error ?? null;
    return {
      ok: false,
      errorCode: code,
      message:
        (code && LINK_ERRORS[code]) ||
        params.error_description ||
        'That sign-in link did not work.',
    };
  }

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  if (!accessToken || !refreshToken) return null;

  const { data: before } = await sb.auth.getSession();
  const anonSession = before.session?.user.is_anonymous ? before.session : null;

  const { data, error } = await sb.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) return { ok: false, errorCode: error.code ?? null, message: error.message };

  const user = data.user ?? data.session?.user;
  if (!user) return { ok: false, errorCode: null, message: 'That link returned no user.' };

  if (anonSession && anonSession.user.id !== user.id) {
    await purgeAbandonedAnon(anonSession);
    return { ok: true, userId: user.id, abandonedUserId: anonSession.user.id };
  }
  return { ok: true, userId: user.id, abandonedUserId: null };
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
