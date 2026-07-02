import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { anomalyApi } from '@/data/api/anomaly.api';
import { transactionApi } from '@/data/api/transaction.api';
import { colors, spacing, fontSizes, borderRadius, shadows } from '@/core/theme';
import { formatCurrency, formatDate } from '@/core/utils';
import { ALGORITHMS, ALGO_KEY_BY_BACKEND, ANOMALY_STATUS_LABELS, type AlgoKey } from '@/core/anomaly/algorithms';
import type { Anomaly, Transaction } from '@/domain/entities';
import type { AnomalyStackParamList } from '@/presentation/navigation/AppTabs';

type Props = NativeStackScreenProps<AnomalyStackParamList, 'AnomalyList'>;

const STATUS_FILTERS = ['All', 'Pending', 'Confirmed', 'FalsePositive'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];
const filterLabel = (f: string) => (f === 'FalsePositive' ? 'False+' : f);

interface Grouped {
  transactionId: string;
  txn?: Transaction | null;
  ensembleScore: number;
  status: string;
  detectedAt: string;
  algorithms: Record<AlgoKey, boolean>;
}

const statusPill = (s: string): { color: string; bg: string } => {
  switch (s) {
    case 'Confirmed': return { color: colors.danger, bg: colors.danger + '18' };
    case 'FalsePositive': return { color: colors.success, bg: colors.success + '18' };
    case 'Reviewed': return { color: colors.info, bg: colors.info + '18' };
    default: return { color: colors.warning, bg: colors.warning + '18' };
  }
};

// 30×22 detector pill (web AlgoBadge): active = navy + white, inactive = gray.
const AlgoBadge = ({ active, label }: { active: boolean; label: string }) => (
  <View style={[styles.algoBadge, { backgroundColor: active ? colors.primary : '#F1F5F9' }]}>
    <Text style={[styles.algoBadgeText, { color: active ? '#fff' : colors.textMuted }]}>{label}</Text>
  </View>
);

// 44px ensemble-score bar + 0–100 number (Dashboard ScoreBar ile aynı format).
const ScoreBar = ({ score }: { score: number }) => (
  <View style={styles.scoreBarWrap}>
    <View style={styles.scoreTrack}>
      <View style={[styles.scoreFill, { width: `${Math.min(score, 1) * 100}%` }]} />
    </View>
    <Text style={styles.scoreNum}>{Math.round(Math.min(Math.max(score, 0), 1) * 100)}</Text>
  </View>
);

function groupRows(rows: Anomaly[]): Grouped[] {
  const map = new Map<string, Grouped>();
  for (const row of rows) {
    if (!map.has(row.transactionId)) {
      map.set(row.transactionId, {
        transactionId: row.transactionId,
        ensembleScore: 0,
        status: 'Pending',
        detectedAt: row.detectedAt,
        algorithms: { isolationForest: false, zScore: false, lof: false, xgboost: false },
      });
    }
    const item = map.get(row.transactionId)!;
    if (row.algorithmName === 'Ensemble') {
      item.ensembleScore = row.score;
      item.status = row.status || 'Pending';
      item.detectedAt = row.detectedAt;
    } else {
      const key = ALGO_KEY_BY_BACKEND[row.algorithmName];
      if (key) item.algorithms[key] = row.isAnomaly;
    }
  }
  return Array.from(map.values());
}

export const AnomalyListScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Grouped[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<StatusFilter>('All');

  const fetchAnomalies = useCallback(async () => {
    try {
      const params: any = {};
      if (filter !== 'All') params.status = filter;
      const res = await anomalyApi.getAll(params);
      const grouped = groupRows(res.items);
      await Promise.allSettled(
        grouped.map(async (g) => {
          try { g.txn = await transactionApi.getById(g.transactionId); } catch { g.txn = null; }
        })
      );
      const valid = grouped.filter(g => g.txn);
      valid.sort((a, b) => new Date(b.detectedAt).getTime() - new Date(a.detectedAt).getTime());
      setItems(valid);
    } catch {
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [filter]);

  useEffect(() => { setLoading(true); fetchAnomalies(); }, [filter]);
  const onRefresh = () => { setRefreshing(true); fetchAnomalies(); };

  const renderItem = ({ item }: { item: Grouped }) => {
    const sp = statusPill(item.status);
    return (
      <TouchableOpacity
        style={styles.card}
        activeOpacity={0.7}
        onPress={() => navigation.navigate('AnomalyDetail', { transactionId: item.transactionId })}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardLeft}>
            <Text style={styles.category}>{item.txn?.categoryName ?? '—'}</Text>
            {item.txn?.description ? (
              <Text style={styles.description} numberOfLines={1}>{item.txn.description}</Text>
            ) : null}
          </View>
          <View style={styles.cardRight}>
            <Text style={styles.amount}>{item.txn ? formatCurrency(item.txn.amount) : '—'}</Text>
            <Text style={styles.date}>
              {item.txn?.transactionDate ? formatDate(item.txn.transactionDate) : formatDate(item.detectedAt)}
            </Text>
          </View>
        </View>

        <View style={styles.midRow}>
          <ScoreBar score={item.ensembleScore} />
          <View style={[styles.statusBadge, { backgroundColor: sp.bg }]}>
            <Text style={[styles.statusBadgeText, { color: sp.color }]}>{ANOMALY_STATUS_LABELS[item.status] ?? item.status}</Text>
          </View>
        </View>

        <View style={styles.algoRow}>
          {ALGORITHMS.map(a => (
            <AlgoBadge key={a.key} active={item.algorithms[a.key]} label={a.shortName} />
          ))}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Anomalies</Text>
        <Text style={styles.subtitle}>Transactions flagged by the ML ensemble — review and confirm.</Text>
      </View>
      <View style={styles.filterRow}>
        {STATUS_FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterBtn, filter === f && styles.filterBtnActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>{filterLabel(f)}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.count}>
        {loading ? 'Loading…' : `${items.length} flagged transaction${items.length !== 1 ? 's' : ''}`}
      </Text>
      <FlatList
        data={items}
        keyExtractor={item => item.transactionId}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}><Text style={styles.emptyText}>No anomalies detected yet</Text></View>
          ) : null
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  title: { fontSize: fontSizes.xl, fontWeight: '800', color: colors.textPrimary },
  subtitle: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 3 },
  filterRow: { flexDirection: 'row', paddingHorizontal: spacing.md, gap: spacing.sm, marginTop: spacing.md },
  filterBtn: { paddingHorizontal: spacing.sm, paddingVertical: 5, borderRadius: borderRadius.full, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  filterBtnActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterText: { fontSize: fontSizes.xs, color: colors.textSecondary, fontWeight: '500' },
  filterTextActive: { color: '#fff' },
  count: { fontSize: fontSizes.xs, color: colors.textMuted, paddingHorizontal: spacing.md, marginTop: spacing.sm },
  list: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, paddingBottom: spacing.xl },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.md, marginBottom: spacing.sm, padding: spacing.md, ...shadows.sm },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between' },
  cardLeft: { flex: 1, marginRight: spacing.sm },
  category: { fontSize: fontSizes.md, fontWeight: '700', color: colors.textPrimary },
  description: { fontSize: fontSizes.sm, color: colors.textSecondary, marginTop: 2 },
  cardRight: { alignItems: 'flex-end' },
  amount: { fontSize: fontSizes.md, fontWeight: '800', color: colors.danger },
  date: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  midRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: spacing.md },
  scoreBarWrap: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scoreTrack: { width: 44, height: 5, borderRadius: 3, backgroundColor: '#F1F5F9', overflow: 'hidden' },
  scoreFill: { height: '100%', borderRadius: 3, backgroundColor: colors.danger },
  scoreNum: { fontSize: fontSizes.sm, fontWeight: '800', color: colors.danger, fontFamily: 'monospace' },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.full },
  statusBadgeText: { fontSize: fontSizes.xs, fontWeight: '700' },
  algoRow: { flexDirection: 'row', gap: 5, marginTop: spacing.md },
  algoBadge: { width: 30, height: 22, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  algoBadgeText: { fontSize: 11, fontWeight: '800' },
  empty: { alignItems: 'center', paddingTop: spacing.xxl },
  emptyText: { color: colors.textMuted, fontSize: fontSizes.md },
});
