import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { T } from '@/constants/appTheme';
import { Palette } from '@/constants/palette';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Palette.skullpanda,
        tabBarInactiveTintColor: T.muted,
        tabBarStyle: {
          backgroundColor: T.card,
          borderTopColor: T.border,
        },
        tabBarLabelStyle: { fontWeight: '600', fontSize: 11 },
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
