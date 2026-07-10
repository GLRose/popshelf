import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScreenHeader } from '@/components/ScreenHeader';
import { ApprovedImageCard } from '@/components/admin/ApprovedImageCard';
import { PendingImageCard } from '@/components/admin/PendingImageCard';
import { T } from '@/constants/appTheme';
import {
  approveImage,
  fetchApprovedImages,
  fetchPendingImages,
  purgeRejected,
  rejectImage,
  type ReviewImage,
} from '@/lib/adminModeration';
import { supabase } from '@/lib/supabase';

type Tab = 'pending' | 'approved';

interface Queues {
  pending: ReviewImage[];
  approved: ReviewImage[];
  error: string | null;
}

/**
 * Never rejects: turns a failed fetch into a queue-level error to render.
 *
 * Sweeps tombstoned images first. A delete that died between removing an
 * image's bytes and removing its row leaves a 'rejected' row behind, so every
 * visit to this screen finishes the job. A failed sweep isn't worth reporting -
 * it retries on the next visit, and nothing user-visible depends on it.
 */
async function loadQueues(): Promise<Queues> {
  try {
    await purgeRejected();
  } catch (e) {
    console.warn('Failed to purge rejected images; they will be swept up later', e);
  }

  try {
    const [pending, approved] = await Promise.all([fetchPendingImages(), fetchApprovedImages()]);
    return { pending, approved, error: null };
  } catch (e) {
    console.warn('Failed to load the moderation queues', e);
    return { pending: [], approved: [], error: 'Could not reach the review queue.' };
  }
}

export default function AdminScreen() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('pending');
  const [queues, setQueues] = useState<Queues | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    let cancelled = false;
    loadQueues().then((res) => {
      if (cancelled) return;
      setQueues(res);
      setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    const res = await loadQueues();
    setQueues(res);
    setError(res.error);
    setRefreshing(false);
  };

  const drop = useCallback((from: Tab, id: string) => {
    setQueues((q) => (q ? { ...q, [from]: q[from].filter((i) => i.id !== id) } : q));
  }, []);

  const approve = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await approveImage(id);
      drop('pending', id);
    } catch (e) {
      console.warn(`Failed to approve image ${id}`, e);
      setError("Could not approve that image - it's still in the queue.");
      setBusyId(null);
      return;
    }

    // Approving displaces whatever was live for that figure, so the approved
    // list is stale in two ways at once. Refetch rather than guess.
    try {
      const approved = await fetchApprovedImages();
      setQueues((q) => (q ? { ...q, approved } : q));
    } catch (e) {
      console.warn('Approved, but failed to refresh the approved list', e);
    }
    setBusyId(null);
  };

  /** Rejecting and revoking are the same operation; only the list it leaves differs. */
  const takeDown = async (from: Tab, id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await rejectImage(id);
      drop(from, id);
    } catch (e) {
      console.warn(`Failed to remove image ${id}`, e);
      setError(
        from === 'pending'
          ? "Could not reject that image - it's still in the queue."
          : "Could not remove that image - it's still published.",
      );
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

  const items = queues?.[tab] ?? [];

  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Moderation" onClose={() => router.back()} />
      <View style={styles.tabs}>
        <TabButton
          label="Pending"
          count={queues?.pending.length}
          active={tab === 'pending'}
          onPress={() => setTab('pending')}
        />
        <TabButton
          label="Approved"
          count={queues?.approved.length}
          active={tab === 'approved'}
          onPress={() => setTab('approved')}
        />
      </View>

      {queues === null ? (
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
          ListHeaderComponent={
            error && items.length > 0 ? (
              <View style={styles.banner}>
                <Ionicons name="alert-circle" size={16} color={T.danger} />
                <Text style={styles.bannerText}>{error}</Text>
              </View>
            ) : null
          }
          renderItem={({ item }) =>
            tab === 'pending' ? (
              <PendingImageCard
                item={item}
                busy={busyId === item.id}
                onApprove={approve}
                onReject={(id) => takeDown('pending', id)}
              />
            ) : (
              <ApprovedImageCard
                item={item}
                busy={busyId === item.id}
                onRevoke={(id) => takeDown('approved', id)}
              />
            )
          }
          ListEmptyComponent={
            <View style={styles.center}>
              {error ? (
                <>
                  <Ionicons name="alert-circle-outline" size={48} color={T.danger} />
                  <Text style={styles.emptyTitle}>Couldn&apos;t load the queue</Text>
                  <Text style={styles.emptyText}>{error} Pull down to retry.</Text>
                </>
              ) : tab === 'pending' ? (
                <>
                  <Ionicons name="checkmark-done-outline" size={48} color={T.muted} />
                  <Text style={styles.emptyTitle}>All caught up</Text>
                  <Text style={styles.emptyText}>No pending submissions right now.</Text>
                </>
              ) : (
                <>
                  <Ionicons name="images-outline" size={48} color={T.muted} />
                  <Text style={styles.emptyTitle}>Nothing published</Text>
                  <Text style={styles.emptyText}>
                    Approved images show up here, where you can take them back down.
                  </Text>
                </>
              )}
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

function TabButton({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number | undefined;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.tab, active && styles.tabActive, pressed && styles.pressed]}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>
        {count === undefined ? label : `${label} (${count})`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: T.bg },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  tab: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: T.border,
    backgroundColor: T.chip,
  },
  tabActive: { backgroundColor: T.text, borderColor: T.text },
  tabText: { fontSize: 13, fontWeight: '700', color: T.muted },
  tabTextActive: { color: T.bg },
  pressed: { opacity: 0.65 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 18, fontWeight: '800', color: T.text },
  emptyText: { fontSize: 14, color: T.muted, textAlign: 'center', lineHeight: 20 },
  list: { padding: 16, paddingTop: 0, flexGrow: 1 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: T.card,
    borderWidth: 1,
    borderColor: T.danger,
  },
  bannerText: { flex: 1, fontSize: 13, color: T.text, lineHeight: 18 },
});
