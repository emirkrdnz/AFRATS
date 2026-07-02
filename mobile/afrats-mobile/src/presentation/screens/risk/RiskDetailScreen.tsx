import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';
import dayjs from 'dayjs';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import { riskApi } from '@/data/api/risk.api';
import { anomalyApi } from '@/data/api/anomaly.api';
import { summaryApi } from '@/data/api/summary.api';
import { colors, spacing, fontSizes, borderRadius, shadows } from '@/core/theme';
import {
  RISK_COLORS, STATUS_COLOR, pickRiskLevel, buildFactorRows, factorHint,
  buildBenchmarks, parseOverride, BENCHMARK_BAR_SCALE,
  type FactorRow as FactorRowT, type Benchmark,
} from '@/core/risk/factors';
import type { RiskProfile, RiskHistoryItem } from '@/domain/entities';
import type { AppTabsParamList } from '@/presentation/navigation/AppTabs';

type Props = BottomTabScreenProps<AppTabsParamList, 'Risk'>;

const Gauge = ({ score, color }: { score: number; color: string }) => {
  const pct = Math.max(0, Math.min(100, score));
  const r = 64, cx = 78, cy = 74;
  const arc = (pct / 100) * Math.PI * r;
  const circ = Math.PI * r;
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={156} height={84} viewBox="0 0 156 84">
        <Path d={d} fill="none" stroke="#F1F5F9" strokeWidth={12} strokeLinecap="round" />
        <Path d={d} fill="none" stroke={color} strokeWidth={12} strokeLinecap="round" strokeDasharray={[arc, circ]} />
      </Svg>
      <Text style={[styles.gaugeNum, { color }]}>{Math.round(score)}</Text>
      <Text style={styles.gaugeOutOf}>/ 100</Text>
    </View>
  );
};

const Sparkline = ({ points, color }: { points: number[]; color: string }) => {
  if (points.length < 2) return null;
  const W = 280, H = 44, pad = 3;
  const max = 100, min = 0;
  const step = (W - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * step;
    const y = pad + (1 - (p - min) / (max - min)) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none">
      <Polyline points={coords} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </Svg>
  );
};

const FactorRowView = ({ f, selected, onPress }: { f: FactorRowT; selected: boolean; onPress: () => void }) => {
  const c = STATUS_COLOR[f.status];
  const valueText = f.signed ? `${f.pct >= 0 ? '+' : ''}${f.pct.toFixed(0)}%` : `${f.pct.toFixed(0)}%`;
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={[styles.factorRow, selected && { backgroundColor: c + '12', borderLeftColor: c }]}
    >
      <View style={styles.factorTop}>
        <Text style={styles.factorLabel}>{f.label}</Text>
        <Text style={[styles.factorValue, { color: c }]}>{valueText}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${f.barPct}%`, backgroundColor: c }]} />
        {f.barMarker && <View style={[styles.barMarker, { left: `${f.barMarker.atPct}%` }]} />}
      </View>
      <Text style={styles.factorDesc}>
        {f.description}<Text style={styles.factorTarget}>{'   ·   '}{f.target}</Text>
      </Text>
    </TouchableOpacity>
  );
};

const BenchmarkRowView = ({ b }: { b: Benchmark }) => {
  const over = !b.healthy;
  const delta = b.rawPercent - b.baselinePercent;
  const userBarPct = Math.min((b.userPercent / BENCHMARK_BAR_SCALE) * 100, 100);
  const tickPos = Math.min((b.baselinePercent / BENCHMARK_BAR_SCALE) * 100, 100);
  const fill = over ? colors.danger : colors.secondary;
  return (
    <View style={styles.benchRow}>
      <View style={styles.benchTop}>
        <Text style={styles.benchCat}>{b.category}</Text>
        {over
          ? <Text style={[styles.benchDelta, { color: colors.danger }]}>↑ {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%</Text>
          : <Text style={[styles.benchDelta, { color: colors.success }]}>✓ Healthy</Text>}
      </View>
      <View style={styles.benchBarRow}>
        <Text style={[styles.benchPct, { color: fill }]}>{b.userPercent.toFixed(0)}%</Text>
        <View style={styles.benchTrack}>
          <View style={[styles.benchFill, { width: `${userBarPct}%`, backgroundColor: fill }]} />
          <View style={[styles.benchTick, { left: `${tickPos}%` }]} />
        </View>
        <Text style={styles.benchBaseline}>vs {b.baselinePercent}%</Text>
      </View>
    </View>
  );
};

export const RiskDetailScreen = ({ navigation }: Props) => {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [current, setCurrent] = useState<RiskProfile | null>(null);
  const [history, setHistory] = useState<RiskHistoryItem[]>([]);
  const [flaggedCount, setFlaggedCount] = useState(0);
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [selected, setSelected] = useState<string>('debt_ratio');

  const load = useCallback(async () => {
    const now = new Date();
    const months = Array.from({ length: 4 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      return { month: d.getMonth() + 1, year: d.getFullYear() };
    });
    const [cur, hist, anom, ...sums] = await Promise.allSettled([
      riskApi.getMyProfile(),
      riskApi.getHistory(6),
      anomalyApi.getAll({ page: 1, pageSize: 1 }),
      ...months.map((m) => summaryApi.getSummary(m.month, m.year)),
    ]);
    if (cur.status === 'fulfilled') setCurrent(cur.value);
    if (hist.status === 'fulfilled' && Array.isArray(hist.value)) setHistory(hist.value);
    if (anom.status === 'fulfilled') setFlaggedCount(Number((anom.value as any)?.totalCount ?? 0));

    let income = 0;
    const catMap: Record<string, { categoryName: string; totalAmount: number }> = {};
    sums.forEach((s) => {
      if (s.status !== 'fulfilled') return;
      const v: any = s.value;
      income += Number(v?.totalIncome || 0);
      (v?.categoryBreakdown || []).forEach((c: any) => {
        if (!catMap[c.categoryName]) catMap[c.categoryName] = { categoryName: c.categoryName, totalAmount: 0 };
        catMap[c.categoryName].totalAmount += Number(c.totalAmount ?? c.amount ?? 0);
      });
    });
    setBenchmarks(buildBenchmarks(Object.values(catMap), income));
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => { load(); }, [load]);
  const onRefresh = () => { setRefreshing(true); load(); };

  const anomalyRate = useMemo(
    () => (history.length ? Math.min((flaggedCount / history.length) * 100, 100) : 0),
    [flaggedCount, history.length],
  );
  const factorRows = useMemo(() => buildFactorRows(current?.factors, anomalyRate), [current, anomalyRate]);
  const sparkPoints = useMemo(() => [...history].reverse().slice(-30).map((h) => Number(h.score) || 0), [history]);
  const typical = useMemo(() => {
    if (!history.length) return null;
    const w = history.slice(0, Math.min(30, history.length));
    return w.reduce((a, h) => a + Number(h.score || 0), 0) / w.length;
  }, [history]);

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;

  if (!current) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>No risk score yet. Add transactions to trigger ML analysis.</Text>
      </View>
    );
  }

  const score = Number(current.score || 0);
  const level = current.level || pickRiskLevel(score);
  const color = RISK_COLORS[level] || colors.primary;
  const delta = typical != null ? score - typical : 0;
  const atTypical = typical != null && Math.abs(delta) < 3;
  const override = parseOverride(current.factors);
  const debtPct = Math.round(Number(current.factors?.debt_ratio ?? 0) * 100);
  const selectedHint = factorHint(selected, current.factors, anomalyRate);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Risk Score</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[colors.primary]} />}
      >
        <Text style={styles.pageSub}>Detailed analysis of your financial risk profile</Text>

        {/* OVERVIEW */}
        <View style={styles.card}>
          <View style={styles.overviewTop}>
            <Gauge score={score} color={color} />
            <View style={[styles.levelBadge, { backgroundColor: color + '18', borderColor: color + '55' }]}>
              <Text style={[styles.levelBadgeText, { color }]}>{level.toUpperCase()} RISK</Text>
            </View>
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={styles.statCap}>vs Typical</Text>
              {typical == null ? (
                <Text style={styles.statMutedLg}>First period</Text>
              ) : atTypical ? (
                <>
                  <Text style={styles.statBig}>At typical</Text>
                  <Text style={styles.statSub}>Avg {Math.round(typical)} ({pickRiskLevel(typical)}) · last 30</Text>
                </>
              ) : (
                <>
                  <Text style={[styles.statBig, { color: delta > 0 ? colors.danger : colors.success }]}>
                    {delta > 0 ? '↑' : '↓'} {Math.abs(delta).toFixed(1)} pts
                  </Text>
                  <Text style={styles.statSub}>Avg {Math.round(typical)} ({pickRiskLevel(typical)}) · last 30</Text>
                </>
              )}
            </View>
            <View style={[styles.statCell, styles.statCellRight]}>
              <Text style={styles.statCap}>Last Calculated</Text>
              <Text style={styles.statBigSm}>{current.calculatedAt ? dayjs(current.calculatedAt).format('DD.MM.YYYY') : '—'}</Text>
              <Text style={styles.statSub}>{current.calculatedAt ? dayjs(current.calculatedAt).format('HH:mm') : ''}</Text>
            </View>
          </View>

          {sparkPoints.length >= 2 && (
            <>
              <View style={styles.divider} />
              <View style={styles.sparkHead}>
                <Text style={styles.eyebrow}>Risk Score History</Text>
                <Text style={styles.eyebrowMuted}>last {sparkPoints.length}</Text>
              </View>
              <Sparkline points={sparkPoints} color={colors.primary} />
            </>
          )}

          {override && override.modelScore != null && (
            <View style={styles.overrideBox}>
              <Text style={styles.overrideText}>
                AI's base score was <Text style={styles.overrideStrong}>{override.modelScore}</Text>, raised to <Text style={styles.overrideStrong}>{Math.round(score)}</Text> by the policy floor — {debtPct >= 100 ? `expenses are ${debtPct}% of income` : 'the policy floor minimum was applied'}.
              </Text>
            </View>
          )}
        </View>

        {/* SCORE BREAKDOWN */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Score Breakdown</Text>
          <Text style={styles.cardSub}>Tap a factor for guidance</Text>
          {factorRows.map((f) => (
            <FactorRowView key={f.key} f={f} selected={selected === f.key} onPress={() => setSelected(f.key)} />
          ))}
          {selectedHint ? (
            <View style={styles.hintBox}>
              <Text style={styles.hintText}>{selectedHint}</Text>
              {selected === 'anomaly_rate' && (
                <TouchableOpacity onPress={() => navigation.navigate('Anomalies')} style={styles.hintBtn}>
                  <Text style={styles.hintBtnText}>Review anomalies →</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}
        </View>

        {/* CATEGORY BENCHMARKS */}
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Category Benchmarks</Text>
          <Text style={styles.cardSub}>Last 4 months avg — % of income vs Turkish household baselines</Text>
          {benchmarks.length === 0 ? (
            <Text style={styles.benchEmpty}>Not enough income/expense data to compute benchmarks.</Text>
          ) : (
            <>
              {benchmarks.slice(0, 6).map((b) => <BenchmarkRowView key={b.category} b={b} />)}
              <View style={styles.legendRow}>
                <View style={styles.legendItem}><View style={[styles.legendTick]} /><Text style={styles.legendText}>Baseline</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: colors.secondary }]} /><Text style={styles.legendText}>Your spend</Text></View>
                <View style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: colors.danger }]} /><Text style={styles.legendText}>Over</Text></View>
              </View>
            </>
          )}
        </View>
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, padding: spacing.lg },
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { fontSize: fontSizes.md, color: colors.primary, fontWeight: '600' },
  headerTitle: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.textPrimary },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  pageSub: { fontSize: fontSizes.xs, color: colors.textMuted, marginBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  overviewTop: { alignItems: 'center' },
  gaugeNum: { marginTop: -10, fontSize: 40, fontWeight: '900', lineHeight: 42 },
  gaugeOutOf: { fontSize: fontSizes.xs, color: colors.textMuted },
  levelBadge: { marginTop: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: borderRadius.full, borderWidth: 1 },
  levelBadgeText: { fontSize: fontSizes.xs, fontWeight: '800', letterSpacing: 0.5 },
  statsRow: { flexDirection: 'row', marginTop: spacing.md },
  statCell: { flex: 1 },
  statCellRight: { alignItems: 'flex-end' },
  statCap: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  statBig: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.textPrimary },
  statBigSm: { fontSize: fontSizes.md, fontWeight: '700', color: colors.textPrimary },
  statMutedLg: { fontSize: fontSizes.sm, color: colors.textMuted, marginTop: 2 },
  statSub: { fontSize: 11, color: colors.textMuted, marginTop: 3 },
  divider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: spacing.md },
  sparkHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  eyebrow: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  eyebrowMuted: { fontSize: 11, color: colors.textMuted },
  overrideBox: { flexDirection: 'row', marginTop: spacing.md, padding: spacing.sm, backgroundColor: '#F8FAFC', borderRadius: borderRadius.sm, borderLeftWidth: 3, borderLeftColor: colors.secondary },
  overrideText: { flex: 1, fontSize: fontSizes.xs, color: colors.textSecondary, lineHeight: 18 },
  overrideStrong: { fontWeight: '800', color: colors.textPrimary },
  cardTitle: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary },
  cardSub: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm },
  factorRow: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderLeftWidth: 3, borderLeftColor: 'transparent', borderRadius: borderRadius.sm, marginBottom: 4 },
  factorTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  factorLabel: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textPrimary },
  factorValue: { fontSize: fontSizes.lg, fontWeight: '800' },
  barTrack: { height: 6, backgroundColor: '#F1F5F9', borderRadius: 99, overflow: 'visible', justifyContent: 'center' },
  barFill: { height: 6, borderRadius: 99 },
  barMarker: { position: 'absolute', top: -3, bottom: -3, width: 2, backgroundColor: '#475569', borderRadius: 1 },
  factorDesc: { fontSize: 11.5, color: colors.textSecondary, lineHeight: 16, marginTop: 7 },
  factorTarget: { color: colors.textMuted },
  hintBox: { marginTop: spacing.sm, padding: spacing.sm, backgroundColor: '#F8FAFC', borderRadius: borderRadius.sm, borderLeftWidth: 3, borderLeftColor: colors.secondary },
  hintText: { fontSize: fontSizes.xs, color: colors.textSecondary, lineHeight: 18 },
  hintBtn: { marginTop: spacing.sm, alignSelf: 'flex-start' },
  hintBtnText: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.primary },
  benchRow: { paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  benchTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  benchCat: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textPrimary },
  benchDelta: { fontSize: 11, fontWeight: '700' },
  benchBarRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  benchPct: { fontSize: fontSizes.sm, fontWeight: '800', minWidth: 38 },
  benchTrack: { flex: 1, height: 8, backgroundColor: '#F1F5F9', borderRadius: 4, justifyContent: 'center' },
  benchFill: { position: 'absolute', left: 0, height: 8, borderRadius: 4 },
  benchTick: { position: 'absolute', top: -3, bottom: -3, width: 2, backgroundColor: '#475569', borderRadius: 1 },
  benchBaseline: { fontSize: 11, color: colors.textMuted, minWidth: 52, textAlign: 'right' },
  benchEmpty: { fontSize: fontSizes.xs, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  legendRow: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendTick: { width: 8, height: 2, backgroundColor: '#475569' },
  legendSwatch: { width: 10, height: 6, borderRadius: 2 },
  legendText: { fontSize: 10, color: colors.textMuted },
  emptyText: { fontSize: fontSizes.md, color: colors.textMuted, textAlign: 'center', marginBottom: spacing.md },
  backLink: { padding: spacing.sm },
  backLinkText: { color: colors.primary, fontWeight: '600', fontSize: fontSizes.md },
});
