import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline, Circle } from 'react-native-svg';
import dayjs from 'dayjs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { anomalyApi } from '@/data/api/anomaly.api';
import { transactionApi } from '@/data/api/transaction.api';
import { colors, spacing, fontSizes, borderRadius, shadows } from '@/core/theme';
import { formatCurrency, formatDate } from '@/core/utils';
import {
  ALGORITHMS, ALGO_INFO, ANOMALY_STATUS_LABELS, ENSEMBLE_THRESHOLD,
  analyzeContribs, type Contribution,
} from '@/core/anomaly/algorithms';
import type { AnomalyDetail, Transaction } from '@/domain/entities';
import type { AnomalyStackParamList } from '@/presentation/navigation/AppTabs';

type Props = NativeStackScreenProps<AnomalyStackParamList, 'AnomalyDetail'>;

const statusPill = (s: string): { color: string; bg: string } => {
  switch (s) {
    case 'Confirmed': return { color: colors.danger, bg: colors.danger + '18' };
    case 'FalsePositive': return { color: colors.success, bg: colors.success + '18' };
    case 'Reviewed': return { color: colors.info, bg: colors.info + '18' };
    default: return { color: colors.warning, bg: colors.warning + '18' };
  }
};

const ScoreGauge = ({ score }: { score: number }) => {
  const pct = Math.round(score * 100);
  const r = 52, cx = 66, cy = 62;
  const arc = (pct / 100) * Math.PI * r;
  const circ = Math.PI * r;
  const d = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return (
    <View style={{ alignItems: 'center' }}>
      <Svg width={132} height={72} viewBox="0 0 132 72">
        <Path d={d} fill="none" stroke="#F1F5F9" strokeWidth={11} strokeLinecap="round" />
        <Path d={d} fill="none" stroke={colors.danger} strokeWidth={11} strokeLinecap="round" strokeDasharray={[arc, circ]} />
      </Svg>
      <Text style={styles.gaugeNum}>{pct}</Text>
      <Text style={styles.gaugeLabel}>Anomaly Score</Text>
    </View>
  );
};

const InfoRow = ({ label, value }: { label: string; value: string }) => (
  <View style={styles.infoRow}>
    <Text style={styles.infoLabel}>{label}</Text>
    <Text style={styles.infoValue} numberOfLines={2}>{value || '—'}</Text>
  </View>
);

// Hero: Score Composition — weighted stacked bar + weight/contribution + "driven by".
const ScoreComposition = ({ contribs, influence }: { contribs: Contribution[]; influence: ReturnType<typeof analyzeContribs>['influence'] }) => (
  <View style={{ width: '100%' }}>
    <Text style={styles.compTitle}>Score Composition</Text>
    <View style={styles.stackBar}>
      {contribs.map((c) => {
        const flagged = c.isAnomaly && !c.skipped;
        const bg = flagged
          ? `rgba(231,76,60,${Math.max(0.25, c.score)})`
          : `rgba(148,163,184,${Math.max(0.18, c.score * 0.5)})`;
        return (
          <View key={c.key} style={{ flexGrow: c.weight, flexBasis: 0, minWidth: 38, backgroundColor: bg, borderRightWidth: 1, borderRightColor: '#fff', alignItems: 'center', justifyContent: 'center', paddingVertical: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '800', color: flagged && c.score > 0.5 ? '#fff' : '#475569' }}>{c.shortName}</Text>
          </View>
        );
      })}
    </View>
    <View style={styles.stackUnder}>
      {contribs.map((c) => (
        <View key={c.key} style={{ flexGrow: c.weight, flexBasis: 0, minWidth: 38, alignItems: 'center' }}>
          <Text style={styles.weightTxt}>{c.weight.toFixed(2)}</Text>
          <Text style={styles.contribTxt}>+{c.contribution.toFixed(2)}</Text>
        </View>
      ))}
    </View>
    {influence && (
      <Text style={styles.drivenBy}>
        {influence.primary ? (
          <>Primarily driven by <Text style={styles.drivenStrong}>{influence.items[0].name}</Text> ({influence.items[0].pct}%)</>
        ) : (
          <>Most influential: <Text style={styles.drivenStrong}>{influence.items[0].name}</Text> ({influence.items[0].pct}%) · <Text style={styles.drivenStrong}>{influence.items[1].name}</Text> ({influence.items[1].pct}%)</>
        )}
      </Text>
    )}
  </View>
);

interface SeriesPoint { label: string; amount: number; date: string | null; isAnomaly: boolean }
// Per-transaction series for the anomaly's category (mirror of web buildSeries).
function buildSeries(txns: any[], anomalyId: string): SeriesPoint[] {
  if (!Array.isArray(txns)) return [];
  const sorted = [...txns].sort((a, b) => {
    const da = new Date(a.transactionDate || 0).getTime();
    const db = new Date(b.transactionDate || 0).getTime();
    if (da !== db) return da - db;
    return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
  });
  return sorted.map((t, i) => ({ label: `#${i + 1}`, amount: Math.abs(t.amount || 0), date: t.transactionDate || null, isAnomaly: t.id === anomalyId }));
}

const SpendingContext = ({ series, categoryName }: { series: SeriesPoint[]; categoryName?: string }) => {
  const W = 320, H = 120, pad = 10;
  const n = series.length;
  const max = Math.max(...series.map((s) => s.amount), 1);
  const xAt = (i: number) => (n <= 1 ? W / 2 : pad + (i * (W - pad * 2)) / (n - 1));
  const yAt = (a: number) => H - pad - (a / max) * (H - pad * 2);
  const poly = series.map((s, i) => `${xAt(i).toFixed(1)},${yAt(s.amount).toFixed(1)}`).join(' ');
  const anomalyIdx = series.findIndex((s) => s.isAnomaly);
  return (
    <View style={styles.card}>
      <View style={styles.scHead}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Spending Context</Text>
          <Text style={styles.scSub}>{n} transaction{n !== 1 ? 's' : ''} · {categoryName ?? 'Category'}</Text>
        </View>
        <View>
          <View style={styles.scLegendItem}><View style={[styles.scLine, { backgroundColor: colors.secondary }]} /><Text style={styles.scLegendText}>Amount</Text></View>
          <View style={styles.scLegendItem}><View style={[styles.scDotLegend, { backgroundColor: colors.danger }]} /><Text style={styles.scLegendText}>Anomaly</Text></View>
        </View>
      </View>
      {n === 0 ? (
        <Text style={styles.scEmpty}>No spending history.</Text>
      ) : (
        <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
          {n > 1 && <Polyline points={poly} fill="none" stroke={colors.secondary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
          {anomalyIdx >= 0 && <Circle cx={xAt(anomalyIdx)} cy={yAt(series[anomalyIdx].amount)} r={5} fill={colors.danger} stroke="#fff" strokeWidth={2} />}
        </Svg>
      )}
    </View>
  );
};

export const AnomalyDetailScreen = ({ route, navigation }: Props) => {
  const { transactionId: id } = route.params;
  const insets = useSafeAreaInsets();
  const autoReviewRef = useRef(false);
  const [detail, setDetail] = useState<AnomalyDetail | null>(null);
  const [txn, setTxn] = useState<Transaction | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusBusy, setStatusBusy] = useState(false);
  const [series, setSeries] = useState<SeriesPoint[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [d, t] = await Promise.all([
        anomalyApi.getById(id),
        transactionApi.getById(id).catch(() => null),
      ]);
      setDetail(d);
      setTxn(t);
      if (t?.categoryId) {
        try {
          const h = await transactionApi.getAll({ categoryId: t.categoryId, page: 1, pageSize: 100 });
          setSeries(buildSeries(h.items || [], id));
        } catch { setSeries([]); }
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    if (detail?.status === 'Pending' && !autoReviewRef.current) {
      autoReviewRef.current = true;
      anomalyApi.updateStatus(id, 'Reviewed')
        .then(() => setDetail(p => p ? { ...p, status: 'Reviewed' } : p))
        .catch(() => {});
    }
  }, [detail, id]);

  const handleStatus = async (newStatus: string) => {
    setStatusBusy(true);
    try {
      await anomalyApi.updateStatus(id, newStatus);
      setDetail(p => p ? { ...p, status: newStatus } : p);
    } catch {
    } finally {
      setStatusBusy(false);
    }
  };

  const askDecision = (newStatus: string) => {
    const confirming = newStatus === 'Confirmed';
    Alert.alert(
      confirming ? 'Confirm this anomaly?' : 'Mark as false positive?',
      confirming
        ? 'This marks the transaction as a confirmed anomaly.'
        : 'This dismisses the alert. You can change your decision later.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: confirming ? 'Confirm Anomaly' : 'Mark False Positive',
          style: confirming ? 'destructive' : 'default',
          onPress: () => handleStatus(newStatus),
        },
      ],
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (!detail) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={styles.emptyText}>Anomaly not found.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backLink}><Text style={styles.backLinkText}>← Back</Text></TouchableOpacity>
      </View>
    );
  }

  const finalScore = detail.ensemble?.finalScore ?? detail.anomalyScore ?? 0;
  const { contribs, total, isAnomaly, influence } = analyzeContribs(detail.algorithmResults, finalScore);
  const sp = statusPill(detail.status);
  const isFinal = detail.status === 'Confirmed' || detail.status === 'FalsePositive';

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.back}>← Back to anomalies</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {/* ACTION BAR */}
        {isFinal ? (
          <View style={styles.card}>
            <View style={styles.actionFinalRow}>
              <View style={{ flex: 1, marginRight: spacing.sm }}>
                <Text style={styles.actionFinalTitle}>
                  {detail.status === 'Confirmed' ? 'Confirmed as genuine anomaly' : 'Marked as false positive'}
                </Text>
                <Text style={styles.actionFinalSub}>
                  {detail.status === 'Confirmed'
                    ? 'This transaction has been confirmed and recorded.'
                    : 'This alert has been dismissed. No further action needed.'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.changeBtn}
                onPress={() => askDecision(detail.status === 'Confirmed' ? 'FalsePositive' : 'Confirmed')}
              >
                <Text style={styles.changeBtnText}>Change decision</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.assessTitle}>Your assessment is needed</Text>
            <Text style={styles.assessSub}>Review and take action</Text>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: colors.danger + '55', backgroundColor: colors.danger + '0D' }, statusBusy && styles.btnDisabled]}
                disabled={statusBusy} onPress={() => askDecision('Confirmed')} activeOpacity={0.85}
              >
                <Text style={[styles.actionBtnText, { color: colors.danger }]}>⚠ Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { borderColor: colors.success + '55', backgroundColor: colors.success + '0D' }, statusBusy && styles.btnDisabled]}
                disabled={statusBusy} onPress={() => askDecision('FalsePositive')} activeOpacity={0.85}
              >
                <Text style={[styles.actionBtnText, { color: colors.success }]}>✓ False Positive</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* HERO */}
        <View style={styles.card}>
          <View style={styles.heroTop}>
            <Text style={styles.heroTitle}>Anomaly Detected</Text>
            <View style={[styles.statusBadge, { backgroundColor: sp.bg }]}>
              <Text style={[styles.statusBadgeText, { color: sp.color }]}>{ANOMALY_STATUS_LABELS[detail.status] ?? detail.status}</Text>
            </View>
          </View>
          <InfoRow label="Category" value={txn?.categoryName ?? '—'} />
          <InfoRow label="Description" value={txn?.description ?? '—'} />
          <InfoRow label="Transaction Date" value={txn ? formatDate(txn.transactionDate) : '—'} />
          <InfoRow label="Detected" value={dayjs(detail.detectedAt).format('DD MMM YYYY, HH:mm')} />
          <View style={styles.amountWrap}>
            <Text style={styles.amountLabel}>Amount</Text>
            <Text style={styles.amountValue}>{txn ? formatCurrency(txn.amount) : '—'}</Text>
          </View>
        </View>

        {/* SPENDING CONTEXT */}
        <SpendingContext series={series} categoryName={txn?.categoryName} />

        {/* SCORE + COMPOSITION */}
        <View style={[styles.card, { alignItems: 'center' }]}>
          <ScoreGauge score={detail.anomalyScore} />
          <View style={styles.divider} />
          <ScoreComposition contribs={contribs} influence={influence} />
        </View>

        {/* ALGORITHM BREAKDOWN */}
        <Text style={styles.sectionTitle}>Algorithm Breakdown</Text>
        <Text style={styles.sectionSub}>Each algorithm's score × weight = contribution. The sum is the final ensemble score.</Text>
        {contribs.map((c) => {
          const info = ALGO_INFO[c.key];
          const flagged = c.isAnomaly && !c.skipped;
          const color = c.skipped ? colors.textMuted : flagged ? colors.danger : colors.success;
          return (
            <View key={c.key} style={[styles.card, styles.algoCard]}>
              <View style={[styles.algoTopBar, { backgroundColor: c.skipped ? colors.border : color }]} />
              <View style={styles.algoBody}>
                <View style={styles.algoHead}>
                  <View style={styles.algoHeadLeft}>
                    <View style={[styles.algoChip, { backgroundColor: c.skipped ? '#F1F5F9' : color }]}>
                      <Text style={[styles.algoChipText, { color: c.skipped ? colors.textMuted : '#fff' }]}>{c.shortName}</Text>
                    </View>
                    <View style={{ flexShrink: 1 }}>
                      <Text style={styles.algoName}>{c.name}</Text>
                      <Text style={styles.algoMeta}>{c.type} · {(c.weight * 100).toFixed(0)}% weight</Text>
                    </View>
                  </View>
                  <Text style={[styles.algoVerdict, { color }]}>
                    {c.skipped ? 'skipped' : flagged ? '⚠ flagged' : '✓ normal'}
                  </Text>
                </View>

                <Text style={styles.algoDesc}>{info.desc}</Text>

                <View style={styles.calcBox}>
                  <View style={styles.calcCell}><Text style={styles.calcCap}>Score</Text><Text style={styles.calcNum}>{c.score.toFixed(2)}</Text></View>
                  <Text style={styles.calcOp}>×</Text>
                  <View style={styles.calcCell}><Text style={styles.calcCap}>Weight</Text><Text style={styles.calcNum}>{c.weight.toFixed(2)}</Text></View>
                  <Text style={styles.calcOp}>=</Text>
                  <View style={styles.calcCell}><Text style={styles.calcCap}>Contribution</Text><Text style={[styles.calcNum, { color }]}>{c.contribution.toFixed(3)}</Text></View>
                </View>

                {c.skipped ? (
                  <Text style={styles.skippedNote}>Model unavailable server-side — contributes 0.</Text>
                ) : (
                  <View style={{ marginTop: spacing.sm }}>
                    {info.metrics.map((row) => (
                      <View key={row.key} style={styles.metricRow}>
                        <Text style={styles.metricLabel}>{row.label}</Text>
                        <Text style={styles.metricValue}>{c.metrics?.[row.key] != null ? row.fmt(c.metrics[row.key]) : '—'}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>
          );
        })}

        {/* RUNNING TOTAL */}
        <View style={[styles.totalBox, { borderColor: isAnomaly ? colors.danger + '40' : colors.success + '40', backgroundColor: isAnomaly ? colors.danger + '0F' : colors.success + '0F' }]}>
          <Text style={styles.totalCap}>Sum of contributions</Text>
          <Text style={styles.totalSum}>{contribs.map(c => c.contribution.toFixed(2)).join(' + ')} =</Text>
          <View style={styles.totalResult}>
            <Text style={[styles.totalNum, { color: isAnomaly ? colors.danger : colors.success }]}>{total.toFixed(2)}</Text>
            <Text style={[styles.totalVerdict, { color: isAnomaly ? colors.danger : colors.success }]}>→ {isAnomaly ? 'ANOMALY' : 'NORMAL'}</Text>
          </View>
        </View>
        <View style={{ height: spacing.xl }} />
      </ScrollView>
    </View>
  );
};

const mono = 'monospace';
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  container: { flex: 1, backgroundColor: colors.background },
  header: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  back: { fontSize: fontSizes.sm, color: colors.textSecondary, fontWeight: '600' },
  scroll: { paddingHorizontal: spacing.md, paddingBottom: spacing.sm },
  card: { backgroundColor: colors.surface, borderRadius: borderRadius.md, padding: spacing.md, marginBottom: spacing.sm, ...shadows.sm },
  cardTitle: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary },

  // action bar
  assessTitle: { fontSize: fontSizes.md, fontWeight: '700', color: colors.textPrimary },
  assessSub: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  actionBtn: { flex: 1, paddingVertical: spacing.sm + 1, borderRadius: borderRadius.md, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
  actionBtnText: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textSecondary },
  btnDisabled: { opacity: 0.5 },
  actionFinalRow: { flexDirection: 'row', alignItems: 'center' },
  actionFinalTitle: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textPrimary },
  actionFinalSub: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  changeBtn: { paddingHorizontal: spacing.sm + 2, paddingVertical: 7, borderRadius: borderRadius.sm, borderWidth: 1.5, borderColor: colors.border },
  changeBtnText: { fontSize: fontSizes.xs, fontWeight: '700', color: colors.textSecondary },

  // hero
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  heroTitle: { fontSize: fontSizes.lg, fontWeight: '800', color: colors.textPrimary },
  statusBadge: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: borderRadius.sm },
  statusBadgeText: { fontSize: fontSizes.xs, fontWeight: '700' },
  infoRow: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  infoLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  infoValue: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textPrimary, marginTop: 2 },
  amountWrap: { marginTop: spacing.md },
  amountLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.5 },
  amountValue: { fontSize: fontSizes.xxl, fontWeight: '800', color: colors.textPrimary, marginTop: 2 },

  // gauge
  gaugeNum: { marginTop: -8, fontSize: 38, fontWeight: '900', color: colors.danger, lineHeight: 40 },
  gaugeLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.7, marginTop: 4 },
  divider: { width: '100%', height: 1, backgroundColor: '#F1F5F9', marginVertical: spacing.md },

  // composition
  compTitle: { fontSize: fontSizes.sm, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm },
  stackBar: { flexDirection: 'row', height: 26, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
  stackUnder: { flexDirection: 'row', marginTop: 5 },
  weightTxt: { fontSize: 10, color: colors.textMuted },
  contribTxt: { fontSize: 10, color: colors.textSecondary, fontWeight: '700' },
  drivenBy: { fontSize: fontSizes.xs, color: colors.textSecondary, lineHeight: 18, marginTop: spacing.md, textAlign: 'center' },
  drivenStrong: { fontWeight: '800', color: colors.textPrimary },

  // breakdown
  sectionTitle: { fontSize: fontSizes.md, fontWeight: '800', color: colors.textPrimary, marginTop: spacing.sm, marginLeft: 2 },
  sectionSub: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2, marginBottom: spacing.sm, marginLeft: 2 },
  scHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: spacing.sm },
  scSub: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  scLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 },
  scLine: { width: 14, height: 2, borderRadius: 1 },
  scDotLegend: { width: 7, height: 7, borderRadius: 4, borderWidth: 1.5, borderColor: '#fff' },
  scLegendText: { fontSize: 10, color: colors.textSecondary },
  scEmpty: { fontSize: fontSizes.xs, color: colors.textMuted, textAlign: 'center', paddingVertical: spacing.lg },
  algoCard: { padding: 0, overflow: 'hidden' },
  algoTopBar: { height: 3, width: '100%' },
  algoBody: { padding: spacing.md },
  algoHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  algoHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 9, flexShrink: 1 },
  algoChip: { width: 36, height: 28, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  algoChipText: { fontSize: 11, fontWeight: '800' },
  algoName: { fontSize: fontSizes.sm, fontWeight: '800', color: colors.textPrimary },
  algoMeta: { fontSize: 10, color: colors.textMuted, marginTop: 1 },
  algoVerdict: { fontSize: 11, fontWeight: '700', marginLeft: spacing.sm },
  algoDesc: { fontSize: fontSizes.xs, color: colors.textSecondary, lineHeight: 17, marginBottom: spacing.md },
  calcBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, backgroundColor: colors.background, borderRadius: borderRadius.sm, borderWidth: 1, borderColor: '#F1F5F9' },
  calcCell: { alignItems: 'center', flex: 1 },
  calcCap: { fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.3 },
  calcNum: { fontSize: fontSizes.md, fontWeight: '800', fontFamily: mono, color: colors.textPrimary, marginTop: 2 },
  calcOp: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textMuted, marginHorizontal: 2 },
  skippedNote: { fontSize: fontSizes.xs, color: colors.textMuted, textAlign: 'center', marginTop: spacing.md },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  metricLabel: { fontSize: fontSizes.xs, color: colors.textMuted },
  metricValue: { fontSize: fontSizes.xs, fontFamily: mono, fontWeight: '700', color: colors.textPrimary },

  // total
  totalBox: { borderWidth: 1, borderRadius: borderRadius.md, padding: spacing.md, marginTop: spacing.sm },
  totalCap: { fontSize: fontSizes.xs, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5 },
  totalSum: { fontSize: fontSizes.xs, color: colors.textMuted, fontFamily: mono, marginTop: 4 },
  totalResult: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 6 },
  totalNum: { fontSize: fontSizes.xxl, fontWeight: '900', fontFamily: mono },
  totalVerdict: { fontSize: fontSizes.sm, fontWeight: '800' },

  emptyText: { fontSize: fontSizes.md, color: colors.textMuted, marginBottom: spacing.md },
  backLink: { padding: spacing.sm },
  backLinkText: { color: colors.primary, fontWeight: '600', fontSize: fontSizes.md },
});
