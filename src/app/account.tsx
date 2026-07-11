import { Ionicons } from '@expo/vector-icons';
import { isAuthError } from '@supabase/supabase-js';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { Radius, T } from '@/constants/appTheme';
import { MIN_PASSWORD_LENGTH } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/useAuth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Auth errors reach the user verbatim otherwise, and Supabase's wording assumes
 * you know what an identity and a credential grant are. Anything unmapped keeps
 * its own message: an unfamiliar failure is more useful spelled out than
 * flattened into "something went wrong".
 */
function friendlyError(e: unknown): string {
  if (!isAuthError(e)) return e instanceof Error ? e.message : 'Something went wrong.';
  switch (e.code) {
    case 'invalid_credentials':
      return "That email and password don't match an account.";
    case 'user_already_exists':
    case 'email_exists':
      return 'An account already exists for that email address. Sign in instead.';
    case 'weak_password':
      return `Pick a longer password - at least ${MIN_PASSWORD_LENGTH} characters.`;
    case 'email_not_confirmed':
      return 'Confirm your email address first, then sign in.';
    case 'email_address_invalid':
    case 'validation_failed':
      return "That doesn't look like a valid email address.";
    case 'over_request_rate_limit':
      return 'Too many attempts. Wait a minute, then try again.';
    case 'signup_disabled':
      return 'New accounts are turned off for this app.';
    default:
      return e.message;
  }
}

export default function AccountScreen() {
  const router = useRouter();
  const status = useAuth((s) => s.status);
  const email = useAuth((s) => s.email);

  if (status === 'unconfigured' || !supabase) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Account" onClose={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.emptyText}>Supabase isn&apos;t configured on this build.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Account" onClose={() => router.back()} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {status === 'signedIn' ? (
            <SignedIn email={email} onDone={() => router.back()} />
          ) : (
            <SignedOut onDone={() => router.back()} />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function SignedIn({ email, onDone }: { email: string | null; onDone: () => void }) {
  const signOut = useAuth((s) => s.signOut);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      onDone();
    } catch (e) {
      console.warn('Failed to sign out', e);
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="shield-checkmark" size={26} color={T.gold} />
        </View>
        <Text style={styles.title}>Your shelves are saved</Text>
        <Text style={styles.body_}>
          Signed in as <Text style={styles.strong}>{email}</Text>. Your figures follow this email
          onto any device.
        </Text>
      </View>

      {error && <ErrorBanner message={error} />}

      {confirming ? (
        // An inline confirm rather than Alert.alert, which react-native-web
        // renders as nothing at all.
        <View style={styles.confirm}>
          <Text style={styles.confirmText}>
            Sign out? This device goes back to an empty shelf. Your figures stay in your account and
            come back when you sign in again.
          </Text>
          <View style={styles.confirmRow}>
            <SecondaryButton label="Cancel" onPress={() => setConfirming(false)} disabled={busy} />
            <DangerButton label="Sign out" onPress={handleSignOut} busy={busy} />
          </View>
        </View>
      ) : (
        <SecondaryButton label="Sign out" onPress={() => setConfirming(true)} />
      )}
    </>
  );
}

/**
 * 'signin' - the default. Over the app's life returning users outnumber new
 *            ones, and a wrong guess costs one tap to correct.
 * 'signup' - creating an account. Whatever shelves this device already holds
 *            are folded into it, so nothing built before signing up is lost.
 */
type Mode = 'signin' | 'signup';

function SignedOut({ onDone }: { onDone: () => void }) {
  const authSignIn = useAuth((s) => s.signIn);
  const authSignUp = useAuth((s) => s.signUp);

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  const address = email.trim().toLowerCase();
  const signingUp = mode === 'signup';

  const switchMode = () => {
    setMode(signingUp ? 'signin' : 'signup');
    setError(null);
  };

  const submit = async () => {
    if (!EMAIL_RE.test(address)) {
      setError("That doesn't look like a valid email address.");
      return;
    }
    // Enforced on the way in only. An existing account may predate this minimum,
    // and rejecting its owner's correct password would lock them out of their
    // own shelves over a rule that did not exist when they signed up.
    if (signingUp && password.length < MIN_PASSWORD_LENGTH) {
      setError(`Pick a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (signingUp) {
        const { needsConfirmation } = await authSignUp(address, password);
        if (needsConfirmation) {
          setCheckEmail(true);
          return;
        }
      } else {
        await authSignIn(address, password);
      }
      onDone();
    } catch (e) {
      console.warn(`Failed to ${signingUp ? 'create the account' : 'sign in'}`, e);
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  // Only reachable if "Confirm email" is turned back on in the dashboard; with
  // it off, signUp() signs the user straight in and this screen never shows.
  // See SignUpResult in src/lib/auth.ts.
  if (checkEmail) {
    return (
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="mail-open-outline" size={26} color={T.gold} />
        </View>
        <Text style={styles.title}>Check your email</Text>
        <Text style={styles.body_}>
          Confirm <Text style={styles.strong}>{address}</Text> to finish creating your account, then
          come back and sign in. Your shelves stay safe on this device in the meantime.
        </Text>
      </View>
    );
  }

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons
            name={signingUp ? 'bookmark-outline' : 'log-in-outline'}
            size={26}
            color={T.gold}
          />
        </View>
        <Text style={styles.title}>{signingUp ? 'Keep your shelves forever' : 'Welcome back'}</Text>
        <Text style={styles.body_}>
          {signingUp
            ? "Right now your figures live on this device only. Create an account and they'll survive a reinstall, a new phone, or a cleared browser."
            : 'Sign in and the shelves from your account appear on this device, alongside anything already here.'}
        </Text>
      </View>

      {error && <ErrorBanner message={error} />}

      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        placeholderTextColor={T.muted}
        keyboardType="email-address"
        textContentType="emailAddress"
        autoComplete="email"
        autoCapitalize="none"
        autoCorrect={false}
        editable={!busy}
        accessibilityLabel="Email address"
      />

      <View style={styles.passwordRow}>
        <TextInput
          style={[styles.input, styles.passwordInput]}
          value={password}
          onChangeText={setPassword}
          placeholder="Password"
          placeholderTextColor={T.muted}
          secureTextEntry={!showPassword}
          // 'newPassword' asks the keychain / password manager to offer a strong
          // one and save it; 'password' asks it to fill the existing entry.
          textContentType={signingUp ? 'newPassword' : 'password'}
          autoComplete={signingUp ? 'new-password' : 'current-password'}
          autoCapitalize="none"
          autoCorrect={false}
          editable={!busy}
          onSubmitEditing={submit}
          accessibilityLabel="Password"
        />
        <Pressable
          onPress={() => setShowPassword((v) => !v)}
          hitSlop={8}
          style={styles.reveal}
          accessibilityRole="button"
          accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}>
          <Ionicons
            name={showPassword ? 'eye-off-outline' : 'eye-outline'}
            size={20}
            color={T.muted}
          />
        </Pressable>
      </View>

      <PrimaryButton
        label={signingUp ? 'Create account' : 'Sign in'}
        onPress={submit}
        busy={busy}
        disabled={!address || !password}
      />
      {signingUp && (
        <Text style={styles.fineprint}>
          At least {MIN_PASSWORD_LENGTH} characters. The shelves on this device come with you.
        </Text>
      )}

      <View style={styles.switchRow}>
        <LinkButton
          label={signingUp ? 'I already have an account' : "I don't have an account yet"}
          onPress={switchMode}
          disabled={busy}
        />
      </View>
    </>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <View style={styles.banner}>
      <Ionicons name="alert-circle" size={18} color={T.danger} />
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

function PrimaryButton({
  label,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
}) {
  const off = busy || disabled;
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      style={({ pressed }) => [styles.primary, off && styles.disabled, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color={T.bg} /> : <Text style={styles.primaryText}>{label}</Text>}
    </Pressable>
  );
}

function SecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.secondary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}>
      <Text style={styles.secondaryText}>{label}</Text>
    </Pressable>
  );
}

function DangerButton({
  label,
  onPress,
  busy,
}: {
  label: string;
  onPress: () => void;
  busy?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={busy}
      accessibilityRole="button"
      style={({ pressed }) => [styles.danger, busy && styles.disabled, pressed && styles.pressed]}>
      {busy ? <ActivityIndicator color={T.bg} /> : <Text style={styles.dangerText}>{label}</Text>}
    </Pressable>
  );
}

function LinkButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={8} accessibilityRole="button">
      <Text style={[styles.link, disabled && styles.disabled]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  flex: { flex: 1 },
  body: { padding: 16, paddingTop: 8, gap: 12, maxWidth: 480, width: '100%', alignSelf: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },

  hero: { alignItems: 'center', gap: 8, paddingVertical: 18 },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: T.chip,
    marginBottom: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '900',
    color: T.text,
    letterSpacing: -0.4,
    textAlign: 'center',
  },
  body_: { fontSize: 14, color: T.muted, textAlign: 'center', lineHeight: 20 },
  strong: { color: T.text, fontWeight: '700' },
  emptyText: { fontSize: 14, color: T.muted, textAlign: 'center', lineHeight: 20 },

  input: {
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.card,
    borderRadius: Radius.sm,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: T.text,
  },
  passwordRow: { justifyContent: 'center' },
  // Room for the reveal button, so a long password never runs underneath it.
  passwordInput: { paddingRight: 48 },
  reveal: { position: 'absolute', right: 0, paddingHorizontal: 14, paddingVertical: 13 },

  primary: {
    backgroundColor: T.text,
    borderRadius: Radius.sm,
    paddingVertical: 15,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  primaryText: { color: T.bg, fontSize: 15, fontWeight: '800' },
  secondary: {
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.card,
    borderRadius: Radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
    flex: 1,
  },
  secondaryText: { color: T.text, fontSize: 15, fontWeight: '700' },
  danger: {
    backgroundColor: T.danger,
    borderRadius: Radius.sm,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    minHeight: 46,
  },
  dangerText: { color: T.bg, fontSize: 15, fontWeight: '800' },

  confirm: {
    gap: 12,
    padding: 14,
    borderRadius: Radius.sm,
    backgroundColor: T.card,
    borderWidth: 1.5,
    borderColor: T.border,
  },
  confirmText: { fontSize: 13, color: T.text, lineHeight: 19 },
  confirmRow: { flexDirection: 'row', gap: 10 },

  switchRow: { alignItems: 'center', paddingTop: 4 },
  link: { fontSize: 13, fontWeight: '700', color: T.muted },
  fineprint: { fontSize: 12, color: T.muted, textAlign: 'center', lineHeight: 17 },

  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.65 },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: Radius.sm,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.danger,
  },
  bannerText: { flex: 1, fontSize: 13, color: T.text, lineHeight: 18 },
});
