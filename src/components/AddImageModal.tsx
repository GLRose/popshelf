import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Radius, T } from '@/constants/appTheme';
import { processFigureImage } from '@/lib/processFigureImage';
import type { ProcessedImage } from '@/lib/processFigureImage.types';
import { useUserImages } from '@/store/useUserImages';
import type { Figure } from '@/types';

interface Props {
  figure: Figure;
  onClose: () => void;
}

/**
 * Sheet for adding a user image to a figure that has no bundled cutout:
 * pick an image, preview the auto background removal, then save it to the
 * on-device image store. Existing user images can be replaced, removed, or
 * (on web) downloaded as `<id>.png` to graduate into the bundled assets.
 */
export function AddImageModal({ figure, onClose }: Props) {
  const existingUri = useUserImages((s) => s.uris[figure.id]);
  const add = useUserImages((s) => s.add);
  const remove = useUserImages((s) => s.remove);

  const [pickedUri, setPickedUri] = useState<string | null>(null);
  const [processed, setProcessed] = useState<ProcessedImage | null>(null);
  const [cutout, setCutout] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewUri = processed?.uri ?? existingUri;
  const weakCutout = !!processed && cutout && processed.removedFraction < 0.05;

  const runProcess = async (uri: string, useCutout: boolean) => {
    setBusy(true);
    setError(null);
    try {
      setProcessed(await processFigureImage(uri, { cutout: useCutout }));
    } catch (e) {
      setProcessed(null);
      setError(e instanceof Error ? e.message : 'Could not process that image.');
    } finally {
      setBusy(false);
    }
  };

  const pick = async () => {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    setPickedUri(uri);
    await runProcess(uri, cutout);
  };

  const toggleCutout = async () => {
    const next = !cutout;
    setCutout(next);
    if (pickedUri) await runProcess(pickedUri, next);
  };

  const save = async () => {
    if (!processed) return;
    setBusy(true);
    setError(null);
    try {
      const { submitted } = await add(figure.id, processed.uri);
      if (!submitted) {
        setError(
          "Saved on this device, but it couldn't be sent for review, so it won't show up for anyone else. Check your connection and try again.",
        );
        setBusy(false);
        return;
      }
      onClose();
    } catch {
      setError('Could not save the image on this device.');
      setBusy(false);
    }
  };

  const removeImage = async () => {
    setBusy(true);
    try {
      await remove(figure.id);
      onClose();
    } catch {
      setError('Could not remove the image.');
      setBusy(false);
    }
  };

  const download = () => {
    if (Platform.OS !== 'web' || !previewUri) return;
    const a = document.createElement('a');
    a.href = previewUri;
    a.download = `${figure.id}.png`;
    a.click();
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <Text style={styles.title} numberOfLines={1}>
                {existingUri ? 'Edit image' : 'Add image'}
              </Text>
              <Text style={styles.subtitle} numberOfLines={1}>
                {figure.name} · {figure.set}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={8} style={styles.close}>
              <Ionicons name="close" size={20} color={T.text} />
            </Pressable>
          </View>

          <View style={styles.preview}>
            {previewUri ? (
              <Image source={previewUri} style={styles.previewImage} contentFit="contain" />
            ) : (
              <View style={styles.previewEmpty}>
                <Ionicons name="image-outline" size={40} color={T.muted} />
                <Text style={styles.previewHint}>
                  Pick a product render on a plain white background so the cutout comes out clean.
                </Text>
              </View>
            )}
            {busy && (
              <View style={styles.busyOverlay}>
                <ActivityIndicator color={T.text} />
              </View>
            )}
          </View>

          {processed && !existingUri && (
            <Text style={styles.hint}>
              You&apos;ll see it right away; it&apos;ll be shared with everyone else after a quick
              review.
            </Text>
          )}
          {weakCutout && (
            <Text style={styles.warn}>
              That background doesn&apos;t look white, so nothing was cut out. You can still save
              it as-is or try another image.
            </Text>
          )}
          {error && <Text style={styles.error}>{error}</Text>}

          {Platform.OS === 'web' && (
            <Pressable
              onPress={toggleCutout}
              disabled={busy}
              style={styles.toggleRow}
              accessibilityRole="switch"
              accessibilityState={{ checked: cutout }}>
              <Ionicons
                name={cutout ? 'checkbox' : 'square-outline'}
                size={20}
                color={cutout ? T.text : T.muted}
              />
              <Text style={styles.toggleText}>Remove white background</Text>
            </Pressable>
          )}

          <View style={styles.actions}>
            <ActionButton
              icon="images-outline"
              label={previewUri ? 'Choose a different image' : 'Choose image'}
              onPress={pick}
              disabled={busy}
            />
            {processed && (
              <ActionButton icon="checkmark" label="Save image" onPress={save} disabled={busy} primary />
            )}
            {Platform.OS === 'web' && !!previewUri && (
              <ActionButton icon="download-outline" label="Download PNG" onPress={download} disabled={busy} />
            )}
            {!!existingUri && (
              <ActionButton
                icon="trash-outline"
                label="Remove image"
                onPress={removeImage}
                disabled={busy}
                danger
              />
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function ActionButton({
  icon,
  label,
  onPress,
  disabled,
  primary,
  danger,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  danger?: boolean;
}) {
  const color = primary ? '#fff' : danger ? T.danger : T.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        primary && styles.btnPrimary,
        danger && styles.btnDanger,
        (pressed || disabled) && styles.pressed,
      ]}
      accessibilityLabel={label}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.btnText, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  // Positioning lives on a flex wrapper because react-native-web ignores
  // alignSelf/auto margins on absolutely-positioned views, which pinned the
  // sheet to the left edge on wide viewports.
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    maxHeight: '90%',
  },
  sheet: {
    backgroundColor: T.card,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    padding: 20,
    paddingBottom: 34,
    maxWidth: 560,
    width: '100%',
    maxHeight: '100%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: T.border,
    marginBottom: 12,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { flex: 1, marginRight: 8 },
  title: { fontSize: 18, fontWeight: '800', color: T.text },
  subtitle: { marginTop: 1, fontSize: 12, color: T.muted },
  close: { padding: 4 },
  preview: {
    marginTop: 16,
    height: 220,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: T.border,
    backgroundColor: T.chip,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  previewImage: { width: '90%', height: '90%' },
  previewEmpty: { alignItems: 'center', gap: 10, paddingHorizontal: 28 },
  previewHint: { fontSize: 12, color: T.muted, textAlign: 'center', lineHeight: 17 },
  busyOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  hint: { marginTop: 10, fontSize: 12, color: T.muted, lineHeight: 17 },
  warn: { marginTop: 10, fontSize: 12, color: '#B26A00', lineHeight: 17 },
  error: { marginTop: 10, fontSize: 12, color: T.danger, lineHeight: 17 },
  toggleRow: { marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  toggleText: { fontSize: 13, fontWeight: '600', color: T.text },
  actions: { marginTop: 16, gap: 10 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: Radius.pill,
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.chip,
  },
  btnPrimary: { backgroundColor: '#4CAF6E', borderColor: '#4CAF6E' },
  btnDanger: { backgroundColor: T.card, borderColor: T.danger },
  btnText: { fontSize: 13, fontWeight: '700' },
  pressed: { opacity: 0.65 },
});
