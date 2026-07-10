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
import { sendEmailCode, verifyEmailCode, type CodeMode } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/store/useAuth';
import { useCollection } from '@/store/useCollection';

const CODE_LENGTH = 6;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Auth errors reach the user verbatim otherwise, and Supabase's wording assumes
 * you know what an OTP and an identity are. Anything unmapped keeps its own
 * message: an unfamiliar failure is more useful spelled out than flattened into
 * "something went wrong".
 */
function friendlyError(e: unknown): string {
  if (!isAuthError(e)) return e instanceof Error ? e.message : 'Something went wrong.';
  switch (e.code) {
    case 'over_email_send_rate_limit':
    case 'over_request_rate_limit':
      return 'Too many codes requested. Wait a minute, then try again.';
    case 'otp_expired':
      return 'That code has expired or is wrong. Request a new one.';
    case 'email_address_invalid':
    case 'validation_failed':
      return "That doesn't look like a valid email address.";
    case 'email_provider_disabled':
      return 'Email sign-in is turned off for this app.';
    case 'signup_disabled':
      return 'New accounts are turned off for this app.';
    case 'user_not_found':
      return 'No account exists for that email address.';
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
            <SignIn onDone={() => router.back()} />
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

type Step = 'email' | 'code';

function SignIn({ onDone }: { onDone: () => void }) {
  const adoptRemoteCollection = useCollection((s) => s.adoptRemoteCollection);

  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [mode, setMode] = useState<CodeMode>('link');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const address = email.trim().toLowerCase();

  /** Both paths end here: the account is settled, so fold this device's shelves into it. */
  const finish = async () => {
    await adoptRemoteCollection();
    onDone();
  };

  const send = async () => {
    if (!EMAIL_RE.test(address)) {
      setError("That doesn't look like a valid email address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { mode: next, alreadyLinked } = await sendEmailCode(address);
      setMode(next);
      if (alreadyLinked) {
        await finish();
        return;
      }
      setCode('');
      setStep('code');
    } catch (e) {
      console.warn('Failed to send the sign-in code', e);
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await verifyEmailCode(address, code.trim(), mode);
      await finish();
    } catch (e) {
      console.warn('Failed to verify the sign-in code', e);
      setError(friendlyError(e));
      setBusy(false);
    }
  };

  if (step === 'code') {
    return (
      <>
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="mail-open-outline" size={26} color={T.gold} />
          </View>
          <Text style={styles.title}>Check your email</Text>
          <Text style={styles.body_}>
            We sent a {CODE_LENGTH}-digit code to <Text style={styles.strong}>{address}</Text>.
          </Text>
        </View>

        {error && <ErrorBanner message={error} />}

        <TextInput
          style={[styles.input, styles.codeInput]}
          value={code}
          onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          placeholder="000000"
          placeholderTextColor={T.muted}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          maxLength={CODE_LENGTH}
          editable={!busy}
          accessibilityLabel="Verification code"
        />

        <PrimaryButton
          label="Verify"
          onPress={verify}
          busy={busy}
          disabled={code.length < CODE_LENGTH}
        />
        <View style={styles.linkRow}>
          <LinkButton label="Use a different email" onPress={() => setStep('email')} disabled={busy} />
          <LinkButton label="Resend code" onPress={send} disabled={busy} />
        </View>
      </>
    );
  }

  return (
    <>
      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <Ionicons name="bookmark-outline" size={26} color={T.gold} />
        </View>
        <Text style={styles.title}>Keep your shelves forever</Text>
        <Text style={styles.body_}>
          Right now your figures live on this device only. Add an email and they&apos;ll survive a
          reinstall, a new phone, or a cleared browser.
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
        onSubmitEditing={send}
        accessibilityLabel="Email address"
      />

      <PrimaryButton label="Send code" onPress={send} busy={busy} disabled={!address} />
      <Text style={styles.fineprint}>
        No password. We&apos;ll email you a {CODE_LENGTH}-digit code to confirm it&apos;s you.
      </Text>
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
      {busy ? (
        <ActivityIndicator color={T.bg} />
      ) : (
        <Text style={styles.primaryText}>{label}</Text>
      )}
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
  title: { fontSize: 22, fontWeight: '900', color: T.text, letterSpacing: -0.4, textAlign: 'center' },
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
  codeInput: {
    textAlign: 'center',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 8,
    paddingVertical: 14,
  },

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

  linkRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 4 },
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
