import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Svg, { Path, Circle } from 'react-native-svg';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import { notificationApi } from '@/data/api/notification.api';
import { colors, spacing, fontSizes, borderRadius, shadows } from '@/core/theme';

dayjs.extend(relativeTime);

// Backend NotificationType enum: AnomalyAlert | HighRisk | System (PascalCase).
interface Noti { id: string; type: string; title: string; message: string; isRead: boolean; relatedId?: string; createdAt: string; }

const TYPE_META: Record<string, { color: string; label: string }> = {
  AnomalyAlert: { color: colors.danger, label: 'Anomaly' },
  HighRisk: { color: colors.warning, label: 'Risk' },
  System: { color: colors.secondary, label: 'System' },
};
const FALLBACK = { color: colors.textMuted, label: 'Info' };
const getMeta = (t: string) => TYPE_META[t] || FALLBACK;
const CTA_LABEL: Record<string, string | null> = { HighRisk: 'View risk', AnomalyAlert: 'Review', System: null };
const GROUP_TYPES = new Set(['HighRisk']);

const TypeIcon = ({ type, color }: { type: string; color: string }) => {
  if (type === 'AnomalyAlert') {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z" stroke={color} strokeWidth={2} strokeLinejoin="round" />
        <Path d="M12 9v4" stroke={color} strokeWidth={2} strokeLinecap="round" />
        <Circle cx={12} cy={17} r={1} fill={color} />
      </Svg>
    );
  }
  if (type === 'HighRisk') {
    return (
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
        <Path d="M3 17l6-6 4 4 7-7" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <Path d="M17 7h4v4" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    );
  }
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <Path d="M8.5 12.2l2.4 2.4 4.6-4.8" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
};

const BackArrow = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
    <Path d="M15 18l-6-6 6-6" stroke={colors.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Svg>
);

type Filter = 'all' | 'unread' | 'AnomalyAlert' | 'HighRisk';
interface Group { representative: Noti; count: number; allIds: string[] }

export const NotificationListScreen = () => {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [items, setItems] = useState<Noti[]>([]);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');

  const reload = useCallback(async () => {
    try {
      const res: any = await notificationApi.getAll({ page: 1, pageSize: 50 });
      setItems(res?.items ?? []);
    } catch { /* empty state */ }
    try {
      const u: any = await notificationApi.getUnreadCount();
      setUnreadTotal(Number(u?.unreadCount ?? 0));
    } catch { /* non-blocking */ }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);
  const onRefresh = () => { setRefreshing(true); reload(); };

  const typeFilter = filter in TYPE_META ? filter : null;

  // Filter (read-state + type) → group (HighRisk only) → newest representative first.
  const groups = useMemo<Group[]>(() => {
    let list = items;
    if (filter === 'unread') list = list.filter((n) => !n.isRead);
    if (typeFilter) list = list.filter((n) => n.type === typeFilter);

    const buckets = new Map<string, Noti[]>();
    const singletons: Group[] = [];
    for (const n of list) {
      if (!GROUP_TYPES.has(n.type)) {
        singletons.push({ representative: n, count: 1, allIds: [n.id] });
        continue;
      }
      const norm = (n.title || '').replace(/[\d.,]+/g, '_').trim();
      const key = `${n.type}|${norm}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(n);
    }
    const grouped: Group[] = Array.from(buckets.values()).map((arr) => {
      arr.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      return { representative: arr[0], count: arr.length, allIds: arr.map((i) => i.id) };
    });
    return [...singletons, ...grouped].sort(
      (a, b) => +new Date(b.representative.createdAt) - +new Date(a.representative.createdAt),
    );
  }, [items, filter, typeFilter]);

  const markIds = async (ids: string[]) => {
    const unique = [...new Set(ids)];
    await Promise.all(unique.map((id) => notificationApi.markAsRead(id).catch(() => null)));
    await reload();
  };

  const handlePress = async (g: Group) => {
    const n = g.representative;
    const ids = g.allIds.filter(() => !n.isRead || g.allIds.length > 1);
    if (ids.length) { await markIds(ids); }
    if (n.type === 'AnomalyAlert' && n.relatedId) {
      // initial:false keeps AnomalyList beneath the detail so back / tab-switch
      // returns to the list instead of stranding the user on the detail screen.
      navigation.navigate('Anomalies', { screen: 'AnomalyDetail', params: { transactionId: n.relatedId }, initial: false });
    } else if (n.type === 'HighRisk') {
      navigation.navigate('Risk');
    }
    // System: stay
  };

  const markAllRead = async () => {
    try { await notificationApi.markAllAsRead(); await reload(); } catch {}
  };

  const renderItem = ({ item: g }: { item: Group }) => {
    const n = g.representative;
    const meta = getMeta(n.type);
    const cta = CTA_LABEL[n.type] ?? null;
    const grouped = g.count > 1;
    return (
      <TouchableOpacity style={[styles.card, !n.isRead && styles.cardUnread]} activeOpacity={0.7} onPress={() => handlePress(g)}>
        <View style={[styles.iconBox, { backgroundColor: meta.color + '1A' }]}>
          <TypeIcon type={n.type} color={meta.color} />
        </View>
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={[styles.title, n.isRead ? styles.titleRead : styles.titleUnread]} numberOfLines={1}>{n.title}</Text>
            {grouped && (
              <View style={[styles.countBadge, { backgroundColor: meta.color + '1A' }]}>
                <Text style={[styles.countText, { color: meta.color }]}>× {g.count}</Text>
              </View>
            )}
            {!n.isRead && <View style={styles.unreadDot} />}
          </View>
          <Text style={styles.message} numberOfLines={2}>{n.message}</Text>
        </View>
        <View style={styles.rightCol}>
          <Text style={styles.time}>{dayjs(n.createdAt).fromNow()}</Text>
          {cta && (
            <View style={styles.ctaPill}><Text style={styles.ctaText}>{cta} →</Text></View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const FilterChip = ({ value, label }: { value: Filter; label: string }) => (
    <TouchableOpacity
      style={[styles.chip, filter === value && styles.chipActive]}
      onPress={() => setFilter(value)}
    >
      <Text style={[styles.chipText, filter === value && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.backBtn}>
          <BackArrow />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.screenTitle}>Notifications</Text>
          <Text style={styles.subtitle}>Stay updated on anomalies, risk changes, and system events</Text>
        </View>
        {unreadTotal > 0 && (
          <TouchableOpacity style={styles.markAllBtn} onPress={markAllRead}>
            <Text style={styles.markAllText}>Mark all</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
        <FilterChip value="all" label="All" />
        <FilterChip value="unread" label={`Unread${unreadTotal > 0 ? ` (${unreadTotal})` : ''}`} />
        <View style={styles.filterDivider} />
        <FilterChip value="AnomalyAlert" label="Anomalies" />
        <FilterChip value="HighRisk" label="Risk" />
      </ScrollView>

      <FlatList
        data={groups}
        keyExtractor={(g) => g.representative.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>
                {filter === 'unread' ? 'No unread notifications'
                  : typeFilter ? `No ${getMeta(typeFilter).label.toLowerCase()} notifications`
                  : 'No notifications to show'}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  headerRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
  backBtn: { padding: 2 },
  screenTitle: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  markAllBtn: { paddingHorizontal: spacing.sm + 2, paddingVertical: 6, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: colors.border },
  markAllText: { fontSize: fontSizes.xs, color: colors.textSecondary, fontWeight: '700' },
  filterRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  chip: { paddingHorizontal: spacing.sm + 2, paddingVertical: 6, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: fontSizes.xs, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  filterDivider: { width: 1.5, height: 22, backgroundColor: colors.border, borderRadius: 1, marginHorizontal: 2 },
  list: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  card: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: borderRadius.md, marginBottom: spacing.sm, padding: spacing.md, ...shadows.sm },
  cardUnread: { backgroundColor: '#EFF6FF' },
  iconBox: { width: 36, height: 36, borderRadius: borderRadius.sm, alignItems: 'center', justifyContent: 'center', marginRight: spacing.sm },
  body: { flex: 1, marginRight: spacing.sm },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { fontSize: fontSizes.sm, flexShrink: 1 },
  titleRead: { fontWeight: '500', color: colors.textSecondary },
  titleUnread: { fontWeight: '700', color: colors.textPrimary },
  countBadge: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4 },
  countText: { fontSize: 10, fontWeight: '700' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.secondary },
  message: { fontSize: fontSizes.xs, color: colors.textSecondary, lineHeight: 17, marginTop: 3 },
  rightCol: { alignItems: 'flex-end', justifyContent: 'space-between', minWidth: 64 },
  time: { fontSize: fontSizes.xs, color: colors.textMuted },
  ctaPill: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 2, borderRadius: borderRadius.full, marginTop: 6 },
  ctaText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyText: { color: colors.textMuted, fontSize: fontSizes.md },
});
