import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PendingImageCard } from '@/components/admin/PendingImageCard';
import { T } from '@/constants/appTheme';
import { approveImage, fetchPendingImages, rejectImage, type PendingImage } from '@/lib/adminModeration';
import { supabase } from '@/lib/supabase';

export default function AdminScreen() {
  const router = useRouter();
  const [items, setItems] = useState<PendingImage[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    setItems(await fetchPendingImages());
  };

  useEffect(() => {
    if (supabase) fetchPendingImages().then(setItems);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const decide = async (id: string, action: 'approve' | 'reject') => {
    setBusyId(id);
    try {
      await (action === 'approve' ? approveImage(id) : rejectImage(id));
      setItems((prev) => prev?.filter((i) => i.id !== id) ?? null);
    } finally {
      setBusyId(null);
    }
  };

  if (!supabase) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Moderation" onClose={() => router.back()} />
        <View style={styles.center}>
          <Text style={styles.emptyText}>Supabase isn&apos;t configured on this build.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title={`Review queue${items ? ` (${items.length})` : ''}`} onClose={() => router.back()} />
      {items === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={T.text} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={items}
          keyExtractor={(i) => i.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
          renderItem={({ item }) => (
            <PendingImageCard
              item={item}
              busy={busyId === item.id}
              onApprove={(id) => decide(id, 'approve')}
              onReject={(id) => decide(id, 'reject')}
            />
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="checkmark-done-outline" size={48} color={T.muted} />
              <Text style={styles.emptyTitle}>All caught up</Text>
              <Text style={styles.emptyText}>No pending submissions right now.</Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function ScreenHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <View style={styles.header}>
      <Text style={styles.h1} numberOfLines={1}>
        {title}
      </Text>
      <Pressable onPress={onClose} hitSlop={8} style={styles.headerBtn} accessibilityLabel="Close">
        <Ionicons name="close" size={22} color={T.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  h1: { flex: 1, fontSize: 20, fontWeight: '900', color: T.text, letterSpacing: -0.4 },
  headerBtn: { padding: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: T.text },
  emptyText: { fontSize: 14, color: T.muted, textAlign: 'center', lineHeight: 20 },
  list: { padding: 16, paddingTop: 0, flexGrow: 1 },
});
