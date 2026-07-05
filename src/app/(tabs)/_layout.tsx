import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { T } from '@/constants/appTheme';
import { Palette } from '@/constants/palette';

// The uikit tab bar reserves a fixed 49px content region and top-aligns each
// item (28px icon box + label). A bold 11px label needs more vertical room than
// that leaves, so its descenders were being clipped off the bottom. Give the bar
// enough height for the icon + label, then add the bottom safe-area inset on top.
const TAB_BAR_CONTENT_HEIGHT = 60;

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Palette.skullpanda,
        tabBarInactiveTintColor: T.muted,
        tabBarStyle: {
          backgroundColor: T.card,
          borderTopColor: T.border,
          height: TAB_BAR_CONTENT_HEIGHT + insets.bottom,
          paddingTop: 4,
        },
        tabBarLabelStyle: { fontWeight: '600', fontSize: 11, lineHeight: 14 },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Browse',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="shelf"
        options={{
          title: 'Shelf',
          tabBarIcon: ({ color, size }) => <Ionicons name="albums" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="favorites"
        options={{
          title: 'Favorites',
          tabBarIcon: ({ color, size }) => <Ionicons name="heart" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
