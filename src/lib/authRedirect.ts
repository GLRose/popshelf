import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/**
 * Where Supabase should send the user after it verifies an email link.
 *
 * Supplying this explicitly, rather than letting Supabase fall back to the
 * project's Site URL, is what makes the link work in development as well as
 * production: Site URL is a single value, and it cannot be both. Every origin
 * returned here has to appear in the project's redirect allow list, or Supabase
 * silently discards it and uses Site URL anyway. See scripts/push-auth-config.mjs.
 */
export function authRedirectTo(): string {
  if (Platform.OS === 'web') return window.location.origin;
  return Linking.createURL('/');
}

/**
 * The link lands back on the app with the session in the URL *fragment*
 * (`#access_token=...`), because supabase-js defaults to the implicit flow.
 *
 * Read once and erase. The tokens are single-use and already spent by the time
 * we hold them, so leaving them in the address bar means a refresh replays a
 * dead link and shows the user an expired-link error they did not earn. Erasing
 * with replaceState also keeps the access token out of the back/forward history.
 */
export async function takeInitialAuthUrl(): Promise<string | null> {
  if (Platform.OS !== 'web') return Linking.getInitialURL();

  const { href, hash, pathname, search } = window.location;
  if (hash.length < 2) return null;
  window.history.replaceState(null, '', pathname + search);
  return href;
}

/** Warm start on native: the app is already open when the link is tapped. */
export function addAuthUrlListener(onUrl: (url: string) => void): () => void {
  if (Platform.OS === 'web') return () => {};
  const sub = Linking.addEventListener('url', ({ url }) => onUrl(url));
  return () => sub.remove();
}

/**
 * Hand-rolled rather than URLSearchParams, whose React Native polyfill has not
 * always shipped the whole surface. A fragment is a flat, percent-encoded
 * key=value list, so this is the whole grammar.
 */
export function fragmentParams(url: string): Record<string, string> | null {
  const at = url.indexOf('#');
  if (at === -1) return null;

  const out: Record<string, string> = {};
  for (const pair of url.slice(at + 1).split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    const key = decodeURIComponent((eq === -1 ? pair : pair.slice(0, eq)).replace(/\+/g, ' '));
    const value = eq === -1 ? '' : decodeURIComponent(pair.slice(eq + 1).replace(/\+/g, ' '));
    if (key) out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}
