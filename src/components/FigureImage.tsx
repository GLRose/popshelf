import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { readableOn, shade } from '@/lib/color';
import { useUserImages } from '@/store/useUserImages';
import type { Figure } from '@/types';

interface Props {
  figure: Figure;
  size: number;
  /** Rounded corners for the card view; shelf uses square-ish + no bg */
  rounded?: boolean;
  /** Transparent mode for the shelf (no card background, just the figure) */
  bare?: boolean;
}

/**
 * Renders a figure's transparent cutout when there is one, otherwise a styled
 * gradient placeholder so the app is fully usable for figures with no art yet.
 *
 * Every image comes from Supabase. The app bundles none: cutouts used to be
 * committed under assets/figures/ and required() straight into the binary,
 * where they beat everything else and could never be updated without shipping a
 * new build. They are catalog rows in `figure_images` now, synced down and
 * cached on disk like any other approved image (see src/store/useUserImages.ts).
 */
export function FigureImage({ figure, size, rounded = true, bare = false }: Props) {
  // The user's own pick beats what the server serves: it's an explicit choice,
  // and removing it reveals the server's image underneath - the community's if
  // one was approved, the catalog artwork if not - rather than clearing the
  // figure. fetchApprovedImages() already collapsed those two into one.
  const mineUri = useUserImages((s) => s.mine[figure.id]);
  const communityUri = useUserImages((s) => s.community[figure.id]);
  const src = mineUri ?? communityUri;
  const accent = figure.color ?? '#8A7BF0';

  if (src) {
    return (
      <Image
        source={src}
        style={{ width: size, height: size }}
        contentFit="contain"
        transition={150}
      />
    );
  }

  // Placeholder
  const glyph =
    figure.series === 'skullpanda' ? 'skull' : figure.series === 'hirono' ? 'paw' : 'flame';
  const fg = readableOn(shade(accent, -0.1));
  const label = initials(figure.set);

  if (bare) {
    return (
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'flex-end' }}>
        <View
          style={{
            width: size * 0.78,
            height: size * 0.9,
            borderRadius: size * 0.2,
            borderBottomLeftRadius: size * 0.12,
            borderBottomRightRadius: size * 0.12,
            overflow: 'hidden',
          }}>
          <LinearGradient
            colors={[shade(accent, 0.18), accent, shade(accent, -0.22)]}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.center}>
            <Ionicons name={glyph} size={size * 0.34} color={fg} />
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[
        { width: size, height: size, borderRadius: rounded ? 16 : 0, overflow: 'hidden' },
      ]}>
      <LinearGradient
        colors={[shade(accent, 0.22), accent, shade(accent, -0.2)]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.center}>
        <Ionicons name={glyph} size={size * 0.3} color={fg} />
        <Text style={[styles.initials, { color: fg }]}>{label}</Text>
      </View>
    </View>
  );
}

function initials(set: string) {
  return set
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

const styles = StyleSheet.create({
  center: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { marginTop: 6, fontWeight: '800', fontSize: 13, letterSpacing: 1, opacity: 0.9 },
});
