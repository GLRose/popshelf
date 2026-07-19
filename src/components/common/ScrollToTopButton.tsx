import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Animated,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Radius, T } from '@/constants/appTheme';

/** Roughly a screenful of scrolling before the button is worth offering. */
const SHOW_AFTER = 600;

/**
 * Tracks whether a list has been scrolled far enough to offer a jump back to
 * the top. Returns the props to spread onto the list.
 */
export function useScrollToTop(threshold = SHOW_AFTER) {
  const [visible, setVisible] = useState(false);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      // React bails out on an unchanged value, so this is a no-op per frame
      // until the threshold is actually crossed.
      setVisible(e.nativeEvent.contentOffset.y > threshold);
    },
    [threshold],
  );

  return { visible, onScroll, scrollEventThrottle: 16 };
}

interface Props {
  visible: boolean;
  onPress: () => void;
  /** Accent of the current series, so the button matches the screen. */
  accent?: string;
}

function buttonStyle(pressed: boolean, accent: string): StyleProp<ViewStyle> {
  if (pressed) {
    return [styles.button, { backgroundColor: accent }, styles.pressed];
  }
  return [styles.button, { backgroundColor: accent }];
}

/** Floating "back to top" button, fading in once a list is scrolled down. */
export function ScrollToTopButton({ visible, onPress, accent = T.ink }: Props) {
  // Lazy state rather than a ref: the animated value has to survive re-renders,
  // but it is read during render to build the style.
  const [anim] = useState(() => new Animated.Value(0));
  const scale = useMemo(() => {
    return anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
  }, [anim]);

  useEffect(() => {
    let target = 0;
    if (visible) {
      target = 1;
    }
    Animated.timing(anim, {
      toValue: target,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  // Untouchable while hidden, so it can't swallow taps on the figures sitting
  // underneath it.
  let pointerEvents: 'auto' | 'none' = 'none';
  if (visible) {
    pointerEvents = 'auto';
  }

  return (
    <Animated.View
      pointerEvents={pointerEvents}
      style={[
        styles.wrap,
        { opacity: anim, transform: [{ scale }] },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scroll to top"
        onPress={onPress}
        style={({ pressed }) => buttonStyle(pressed, accent)}>
        <Ionicons name="arrow-up" size={22} color="#fff" />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Sits above the tab bar, which the navigator already lays out below the
  // screen content (safe-area inset included).
  wrap: { position: 'absolute', right: 16, bottom: 20 },
  button: {
    width: 48,
    height: 48,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: T.ink,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  pressed: { opacity: 0.85 },
});
