import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, RefreshControl,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import Svg, { Circle, Path, Polyline, G } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { summaryApi } from '@/data/api/summary.api';
import { riskApi } from '@/data/api/risk.api';
import { anomalyApi } from '@/data/api/anomaly.api';
import { transactionApi } from '@/data/api/transaction.api';
import { notificationApi } from '@/data/api/notification.api';
import { useAuth } from '@/presentation/context/AuthContext';
import { colors, spacing, fontSizes, borderRadius, shadows } from '@/core/theme';
import { formatCurrency, formatDate, getRiskColor } from '@/core/utils';
import type {
  RiskProfile, TransactionSummary, RiskHistoryItem, Anomaly, Transaction,
} from '@/domain/entities';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const CATEGORY_PALETTE = [
  '#1B4F72', '#2E86C1', '#27AE60', '#F39C12',
  '#E74C3C', '#8E44AD', '#16A085', '#7F8C8D',
];
const RISK_BG: Record<string, string> = {
  Low: 'rgba(39,174,96,0.10)',
  Medium: 'rgba(243,156,18,0.10)',
  High: 'rgba(231,76,60,0.10)',
};
const ALGO_KEY_BY_BACKEND: Record<string, 'isolationForest' | 'zScore' | 'lof' | 'xgboost'> = {
  IsolationForest: 'isolationForest',
  ZScore: 'zScore',
  LOF: 'lof',
  XGBoost: 'xgboost',
};
const ALGO_SHORT = [
  { key: 'isolationForest', label: 'IF' },
  { key: 'zScore', label: 'Z' },
  { key: 'lof', label: 'LOF' },
  { key: 'xgboost', label: 'XGB' },
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function buildTrend(
  current: number,
  previous: number | null | undefined,
  higherIsBetter = true,
) {
  if (previous == null || previous === 0) return null;
  const diff = current - previous;
  const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const isPositive = higherIsBetter ? diff >= 0 : diff <= 0;
  return { direction, percent: Math.abs((diff / previous) * 100), isPositive };
}

function pickRiskLevel(score: number): 'Low' | 'Medium' | 'High' {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

// Backend factors.spending_trend_months ile kıyaslanan ay'ları gönderir
// ("2026-05" formatında). Web RiskDetail/Dashboard ile birebir aynı format.
// Web tarafında utils/formatters.formatTwoMonthLabel; mobile için tek-kullanım
// olduğundan inline tutuluyor (paylaşılan paket eklemeden duplication kabul).
const _MONTH_SHORT_MOBILE = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function formatTwoMonthLabel(recentYm?: string, prevYm?: string): string | null {
  if (!recentYm || !prevYm) return null;
  const parse = (ym: string): [number, number] | null => {
    const m = /^(\d{4})-(\d{2})$/.exec(ym);
    if (!m) return null;
    const y  = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    if (mo < 1 || mo > 12) return null;
    return [y, mo];
  };
  const r = parse(recentYm);
  const p = parse(prevYm);
  if (!r || !p) return null;
  const [ry, rm] = r;
  const [py, pm] = p;
  if (ry === py) return `${_MONTH_SHORT_MOBILE[rm - 1]} vs ${_MONTH_SHORT_MOBILE[pm - 1]}`;
  return `${_MONTH_SHORT_MOBILE[rm - 1]} ${ry} vs ${_MONTH_SHORT_MOBILE[pm - 1]} ${py}`;
}

function describeFactors(
  factors: {
    debt_ratio?: number;
    spending_trend?: number;
    spending_trend_months?: { recent?: string; previous?: string };
  } | undefined,
  anomalyPct: number,
) {
  const dr = Number(factors?.debt_ratio ?? 0);
  const st = Number(factors?.spending_trend ?? 1);
  const spendPct = dr * 100;
  const trendPct = (st - 1) * 100;

  const anomalyDesc =
    anomalyPct >= 30 ? `${anomalyPct.toFixed(0)}% of recent txns flagged`
      : anomalyPct >= 10 ? `Moderate flagged activity (${anomalyPct.toFixed(0)}%)`
      : anomalyPct > 0 ? `Low — ${anomalyPct.toFixed(0)}% of recent txns flagged`
      : 'No flagged transactions';
  const spendDesc =
    spendPct >= 100 ? `Expenses exceed income (${spendPct.toFixed(0)}%)`
      : spendPct >= 80 ? `Tight — ${spendPct.toFixed(0)}% of income spent`
      : `Healthy — ${spendPct.toFixed(0)}% of income spent`;
  // "vs previous period" varsayımı yerine gerçek ay isimleri; metadata yoksa
  // (eski risk kayıtları) generic "vs prior month" fallback.
  const monthsMeta  = factors?.spending_trend_months;
  const monthsLabel = formatTwoMonthLabel(monthsMeta?.recent, monthsMeta?.previous);
  const trendSuffix = monthsLabel || 'vs prior month';
  const trendDesc =
    Math.abs(trendPct) <= 5 ? `Stable — ${trendSuffix}`
      : trendPct > 0 ? `Up ${trendPct.toFixed(0)}% — ${trendSuffix}`
      : `Down ${Math.abs(trendPct).toFixed(0)}% — ${trendSuffix}`;

  return { spendPct, trendPct, spendDesc, trendDesc, anomalyDesc };
}

interface GroupedAnomaly {
  transactionId: string;
  ensembleScore: number;
  status: string;
  detectedAt: string;
  algorithms: { isolationForest: boolean; zScore: boolean; lof: boolean; xgboost: boolean };
  amount?: number | null;
  categoryName?: string | null;
  description?: string | null;
}

function groupAnomalies(rows: Anomaly[]): GroupedAnomaly[] {
  const map = new Map<string, GroupedAnomaly>();
  for (const r of rows) {
    if (!map.has(r.transactionId)) {
      map.set(r.transactionId, {
        transactionId: r.transactionId,
        ensembleScore: 0,
        status: 'Pending',
        detectedAt: r.detectedAt,
        algorithms: { isolationForest: false, zScore: false, lof: false, xgboost: false },
      });
    }
    const item = map.get(r.transactionId)!;
    if (r.algorithmName === 'Ensemble') {
      item.ensembleScore = r.score;
      item.status = r.status || 'Pending';
      item.detectedAt = r.detectedAt;
    } else {
      const k = ALGO_KEY_BY_BACKEND[r.algorithmName];
      if (k) item.algorithms[k] = r.isAnomaly;
    }
  }
  return Array.from(map.values());
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  Pending:    { bg: '#FEF3C7', fg: '#92400E' },
  Confirmed:  { bg: '#FEE2E2', fg: '#991B1B' },
  Dismissed:  { bg: '#E5E7EB', fg: '#374151' },
  Reviewed:   { bg: '#DBEAFE', fg: '#1E40AF' },
};

// ── SVG Primitives ───────────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = (deg - 90) * Math.PI / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polarToCartesian(cx, cy, r, end);
  const e = polarToCartesian(cx, cy, r, start);
  const large = end - start > 180 ? 1 : 0;
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 0 ${e.x} ${e.y}`;
}

function RiskGauge({ score, color, size = 170 }: { score: number; color: string; size?: number }) {
  const stroke = 16;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = r + stroke / 2;
  const height = r + stroke;
  const startA = -90;
  const endA = 90;
  const valueEndA = startA + ((endA - startA) * Math.min(Math.max(score, 0), 100)) / 100;
  return (
    <Svg width={size} height={height} viewBox={`0 0 ${size} ${height}`}>
      <Path
        d={arcPath(cx, cy, r, startA, endA)}
        stroke="#F1F5F9"
        strokeWidth={stroke}
        strokeLinecap="round"
        fill="none"
      />
      {score > 0 && (
        <Path
          d={arcPath(cx, cy, r, startA, valueEndA)}
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
        />
      )}
    </Svg>
  );
}

function Sparkline({ points, color, height = 56 }: { points: number[]; color: string; height?: number }) {
  if (!points || points.length < 2) {
    return (
      <View style={{ height, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 11, color: '#cbd5e1' }}>Score history will appear after analyzed transactions.</Text>
      </View>
    );
  }
  const w = 100;
  const max = 100;
  const min = 0;
  const range = max - min;
  const xs = points.map((_, i) => (i / (points.length - 1)) * w);
  const ys = points.map((p) => ((max - p) / range) * height);
  const polyStr = xs.map((x, i) => `${x},${ys[i]}`).join(' ');
  const areaPath = `M 0 ${height} L ${xs[0]} ${ys[0]} ${xs.slice(1).map((x, i) => `L ${x} ${ys[i + 1]}`).join(' ')} L ${w} ${height} Z`;
  return (
    <Svg width="100%" height={height} viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none">
      <Path d={areaPath} fill={color} opacity={0.10} />
      <Polyline
        points={polyStr}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {points.map((p, i) => (
        <Circle
          key={i}
          cx={xs[i]}
          cy={ys[i]}
          r={points.length <= 12 ? 1.5 : 0}
          fill="#fff"
          stroke={color}
          strokeWidth={1}
        />
      ))}
    </Svg>
  );
}

function DonutChart({
  data, size = 130, stroke = 22,
}: {
  data: { value: number; color: string }[];
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  let offset = 0;
  return (
    <Svg width={size} height={size}>
      <G rotation={-90} originX={size / 2} originY={size / 2}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#F1F5F9"
          strokeWidth={stroke}
        />
        {data.map((d, i) => {
          const len = (d.value / total) * c;
          const dash = `${len} ${c - len}`;
          const seg = (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={d.color}
              strokeWidth={stroke}
              strokeDasharray={dash}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return seg;
        })}
      </G>
    </Svg>
  );
}

// ── ScoreBar (anomaly row) ───────────────────────────────────────────────────

function ScoreBar({ score }: { score: number }) {
  const pct = Math.min(Math.max(score * 100, 0), 100);
  const color = pct >= 70 ? '#E74C3C' : pct >= 40 ? '#F39C12' : '#27AE60';
  return (
    <View style={styles.scoreBarRow}>
      <View style={styles.scoreBarBg}>
        <View style={[styles.scoreBarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.scoreBarText, { color }]}>{pct.toFixed(0)}</Text>
    </View>
  );
}

function AlgoBadge({ active, label }: { active: boolean; label: string }) {
  return (
    <View style={[styles.algoBadge, active ? styles.algoBadgeOn : styles.algoBadgeOff]}>
      <Text style={[styles.algoBadgeText, active ? styles.algoBadgeTextOn : styles.algoBadgeTextOff]}>{label}</Text>
    </View>
  );
}

// ── Types ────────────────────────────────────────────────────────────────────

interface DashboardState {
  summary: TransactionSummary | null;
  riskProfile: RiskProfile | null;
  riskHistory: RiskHistoryItem[];
  anomalies: GroupedAnomaly[];
  totalAnomalies: number;
  unreadCount: number;
}

// ── Screen ───────────────────────────────────────────────────────────────────

export const DashboardScreen = () => {
  const { user } = useAuth();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const now = new Date();

  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [state, setState] = useState<DashboardState>({
    summary: null,
    riskProfile: null,
    riskHistory: [],
    anomalies: [],
    totalAnomalies: 0,
    unreadCount: 0,
  });
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [isEarliestMonth, setIsEarliestMonth] = useState(false);
  const isFirstLoad = useRef(true);

  const fetchData = useCallback(async (month: number, year: number) => {
    try {
      setError('');
      const [summaryRes, riskRes, riskHistoryRes, anomalyRes, unreadRes] = await Promise.allSettled([
        summaryApi.getSummary(month, year),
        riskApi.getMyProfile(),
        riskApi.getHistory(6),
        anomalyApi.getAll({ page: 1, pageSize: 20 }),
        notificationApi.getUnreadCount(),
      ]);

      const summary = summaryRes.status === 'fulfilled' ? summaryRes.value : null;
      const riskProfile = riskRes.status === 'fulfilled' ? riskRes.value : null;
      const riskHistory = riskHistoryRes.status === 'fulfilled' && Array.isArray(riskHistoryRes.value)
        ? riskHistoryRes.value
        : [];
      const unreadCount = unreadRes.status === 'fulfilled' ? Number(unreadRes.value?.unreadCount ?? 0) : 0;

      let grouped: GroupedAnomaly[] = [];
      let totalAnomalies = 0;
      if (anomalyRes.status === 'fulfilled' && anomalyRes.value) {
        const items: Anomaly[] = (anomalyRes.value as any).items ?? [];
        totalAnomalies = Number((anomalyRes.value as any).totalCount ?? items.length);
        grouped = groupAnomalies(items).slice(0, 5);
        // Enrich top 5 with transaction details (best-effort)
        const txnResults = await Promise.allSettled(
          grouped.map((g) => transactionApi.getById(g.transactionId)),
        );
        grouped = grouped.map((g, i) => {
          const r = txnResults[i];
          if (r.status === 'fulfilled') {
            const t: Transaction | null = (r.value as Transaction) ?? null;
            return {
              ...g,
              amount: t?.amount ?? null,
              categoryName: t?.categoryName ?? null,
              description: t?.description ?? null,
            };
          }
          return g;
        });
      }

      setState({
        summary, riskProfile, riskHistory,
        anomalies: grouped, totalAnomalies, unreadCount,
      });
      setIsEarliestMonth(summary?.transactionCount === 0);
    } catch {
      setError('Failed to load dashboard data');
    } finally {
      setInitialLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; setInitialLoading(true); }
    fetchData(selectedMonth, selectedYear);
  }, [selectedMonth, selectedYear]);

  const onRefresh = () => { setRefreshing(true); fetchData(selectedMonth, selectedYear); };

  const isCurrentMonth =
    selectedMonth === now.getMonth() + 1 && selectedYear === now.getFullYear();

  const prevMonth = () => {
    if (isEarliestMonth) return;
    if (selectedMonth === 1) { setSelectedMonth(12); setSelectedYear((y) => y - 1); }
    else setSelectedMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (isCurrentMonth) return;
    if (selectedMonth === 12) { setSelectedMonth(1); setSelectedYear((y) => y + 1); }
    else setSelectedMonth((m) => m + 1);
  };

  const income = state.summary?.totalIncome ?? 0;
  const expense = state.summary?.totalExpense ?? 0;
  const balance = (state.summary?.netBalance ?? null) ?? (income - expense);
  const txnCount = state.summary?.transactionCount ?? 0;
  const anomCount = state.summary?.anomalyCount ?? 0;
  const categoryBreakdown = state.summary?.categoryBreakdown ?? [];

  const prev = state.summary?.previousPeriod;
  const trends = {
    income: buildTrend(income, prev?.totalIncome, true),
    expense: buildTrend(expense, prev?.totalExpense, false),
    balance: buildTrend(balance, prev?.netBalance, true),
    transactions: buildTrend(txnCount, prev?.transactionCount, true),
    anomalies: buildTrend(anomCount, prev?.anomalyCount, false),
  };

  // Risk metrics
  const riskScore = Math.round(Number(state.riskProfile?.score ?? 0));
  const riskLevel = state.riskProfile?.level ?? pickRiskLevel(riskScore);
  const riskColor = getRiskColor(riskScore);

  const anomalyRate = useMemo(() => {
    const flagged = Number(state.totalAnomalies);
    const total = state.riskHistory.length;
    if (!total) return 0;
    return Math.min((flagged / total) * 100, 100);
  }, [state.totalAnomalies, state.riskHistory]);

  const factorInfo = useMemo(
    () => describeFactors(state.riskProfile?.factors as any, anomalyRate),
    [state.riskProfile, anomalyRate],
  );

  const sparkPoints = useMemo(() => {
    const arr = [...state.riskHistory].reverse().slice(-20);
    return arr.map((h) => Math.max(0, Math.min(100, Number(h.score))));
  }, [state.riskHistory]);

  const trendDelta = sparkPoints.length > 1
    ? Math.round(sparkPoints[sparkPoints.length - 1] - sparkPoints[0])
    : null;

  // ── Loading ────────────────────────────────────────────────────────────────

  if (initialLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={[styles.loadingText, { marginTop: spacing.sm }]}>Loading dashboard…</Text>
      </View>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{
        paddingTop: insets.top + spacing.md,
        paddingBottom: spacing.xxl,
      }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          colors={[colors.primary]}
        />
      }
    >
      {/* ── Header ── */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pageTitle}>Dashboard</Text>
          <View style={styles.subRow}>
            <Text style={styles.greeting}>{getGreeting()}, {user?.firstName}</Text>
            <View style={styles.dot} />
            <Text style={styles.subtitle}>
              {MONTHS[selectedMonth - 1]} {selectedYear} overview
            </Text>
          </View>
        </View>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.iconBtn}
            onPress={() => navigation.navigate('Notifications')}
            accessibilityLabel="Notifications"
          >
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
              <Path
                d="M18 16v-5a6 6 0 1 0-12 0v5l-1.5 2h15L18 16Z"
                stroke="#475569"
                strokeWidth={1.8}
                strokeLinejoin="round"
              />
              <Path d="M10 21a2 2 0 0 0 4 0" stroke="#475569" strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
            {state.unreadCount > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {state.unreadCount > 9 ? '9+' : state.unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* ── Month Selector ── */}
      <View style={styles.monthSelector}>
        <TouchableOpacity
          style={[styles.monthArrow, isEarliestMonth && styles.monthArrowDisabled]}
          onPress={prevMonth}
          disabled={isEarliestMonth}
        >
          <Text style={[styles.monthArrowText, isEarliestMonth && styles.monthArrowTextDisabled]}>
            ‹
          </Text>
        </TouchableOpacity>
        <View style={styles.monthLabelContainer}>
          <Text
            style={[
              styles.monthLabel,
              !isCurrentMonth && { color: colors.textSecondary },
            ]}
          >
            {MONTHS[selectedMonth - 1]} {selectedYear}
          </Text>
          {isCurrentMonth && <View style={styles.monthUnderline} />}
        </View>
        <TouchableOpacity
          style={[styles.monthArrow, isCurrentMonth && styles.monthArrowDisabled]}
          onPress={nextMonth}
          disabled={isCurrentMonth}
        >
          <Text style={[styles.monthArrowText, isCurrentMonth && styles.monthArrowTextDisabled]}>
            ›
          </Text>
        </TouchableOpacity>
      </View>

      {state.summary?.transactionCount === 0 && (
        <View style={styles.noDataBox}>
          <Text style={styles.noDataText}>
            No transactions for {MONTHS[selectedMonth - 1]} {selectedYear}
          </Text>
        </View>
      )}

      {/* ── Balance Hero Card ── */}
      <View style={styles.balanceCard}>
        <Text style={styles.balanceLabel}>Net Balance</Text>
        <View style={styles.balanceAmountRow}>
          <Text
            style={[
              styles.balanceAmount,
              { color: balance >= 0 ? '#4ADE80' : '#F87171' },
            ]}
          >
            {formatCurrency(balance)}
          </Text>
          <TrendChip trend={trends.balance} onDark />
        </View>
        <View style={styles.balanceRow}>
          <View style={styles.balanceItem}>
            <Text style={styles.balanceItemLabel}>Income</Text>
            <Text style={[styles.balanceItemValue, { color: '#4ADE80' }]}>
              {formatCurrency(income)}
            </Text>
            <TrendChip trend={trends.income} small onDark />
          </View>
          <View style={styles.balanceDivider} />
          <View style={styles.balanceItem}>
            <Text style={styles.balanceItemLabel}>Expense</Text>
            <Text style={[styles.balanceItemValue, { color: '#F87171' }]}>
              {formatCurrency(expense)}
            </Text>
            <TrendChip trend={trends.expense} small onDark />
          </View>
        </View>
      </View>

      {/* ── Stats Row (Transactions / Anomalies) ── */}
      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: '#2E86C115' }]}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path d="M3 12h4l3-7 4 14 3-7h4" stroke="#2E86C1" strokeWidth={1.8}
                strokeLinejoin="round" strokeLinecap="round" />
            </Svg>
          </View>
          <Text style={styles.statValue}>{txnCount.toLocaleString()}</Text>
          <Text style={styles.statLabel}>Transactions</Text>
          <TrendChip trend={trends.transactions} small />
        </View>
        <View style={styles.statCard}>
          <View style={[styles.statIcon, { backgroundColor: '#E74C3C15' }]}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
              <Path
                d="M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"
                stroke="#E74C3C" strokeWidth={1.8} strokeLinejoin="round" />
              <Path d="M12 9v4" stroke="#E74C3C" strokeWidth={1.8} strokeLinecap="round" />
            </Svg>
          </View>
          <Text
            style={[
              styles.statValue,
              { color: anomCount > 0 ? colors.danger : colors.textPrimary },
            ]}
          >
            {anomCount}
          </Text>
          <Text style={styles.statLabel}>Anomalies</Text>
          <TrendChip trend={trends.anomalies} small />
        </View>
      </View>

      {/* ── Risk Profile ── */}
      {state.riskProfile && (
        <TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => navigation.navigate('Risk')}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Risk Score</Text>
              <Text style={styles.cardSubtitle}>
                ML ensemble · Isolation Forest · Z-Score · LOF
              </Text>
            </View>
            <View style={[styles.accentBar, { backgroundColor: riskColor }]} />
          </View>

          {/* Gauge + level */}
          <View style={styles.gaugeWrap}>
            <View style={styles.gaugeInner}>
              <RiskGauge score={riskScore} color={riskColor} />
              <View style={styles.gaugeOverlay}>
                <Text style={[styles.gaugeNumber, { color: riskColor }]}>{riskScore}</Text>
                <Text style={styles.gaugeOutOf}>/ 100</Text>
              </View>
            </View>
            <View
              style={[
                styles.riskBadge,
                { backgroundColor: RISK_BG[riskLevel] ?? '#F1F5F9', borderColor: `${riskColor}55` },
              ]}
            >
              {riskLevel === 'High' && (
                <View style={[styles.liveDot, { backgroundColor: riskColor }]} />
              )}
              <Text style={[styles.riskBadgeText, { color: riskColor }]}>
                {riskLevel.toUpperCase()} RISK
              </Text>
            </View>
            {trendDelta !== null && (
              <Text
                style={[
                  styles.trendDelta,
                  {
                    color: trendDelta === 0
                      ? colors.textSecondary
                      : trendDelta > 0 ? colors.danger : colors.success,
                  },
                ]}
              >
                {trendDelta === 0 && `↔ Stable over recent activity`}
                {trendDelta > 0 && `↑ +${trendDelta} pts over last ${sparkPoints.length} txns`}
                {trendDelta < 0 && `↓ ${trendDelta} pts over last ${sparkPoints.length} txns`}
              </Text>
            )}
          </View>

          {/* Sparkline */}
          <View style={styles.sectionDivider} />
          <View style={styles.sparkHeader}>
            <Text style={styles.eyebrow}>Score history</Text>
            <Text style={styles.eyebrowMuted}>
              {sparkPoints.length > 0 ? `Last ${sparkPoints.length} txns` : 'No history yet'}
            </Text>
          </View>
          <Sparkline points={sparkPoints} color="#1B4F72" />

          {/* Factors */}
          <View style={styles.sectionDivider} />
          <Text style={[styles.eyebrow, { marginBottom: 10 }]}>Key factors</Text>
          <FactorRow
            label="Spending vs Income"
            valueText={`${factorInfo.spendPct.toFixed(0)}%`}
            barPct={Math.min(factorInfo.spendPct, 200) / 2}
            desc={factorInfo.spendDesc}
            color={factorInfo.spendPct > 120 ? '#E74C3C' : factorInfo.spendPct > 80 ? '#F39C12' : '#27AE60'}
          />
          <FactorRow
            label="Spending Trend"
            valueText={`${factorInfo.trendPct >= 0 ? '+' : ''}${factorInfo.trendPct.toFixed(0)}%`}
            barPct={Math.min(Math.abs(factorInfo.trendPct), 50) * 2}
            desc={factorInfo.trendDesc}
            color={Math.abs(factorInfo.trendPct) > 30 ? '#E74C3C' : Math.abs(factorInfo.trendPct) > 10 ? '#F39C12' : '#27AE60'}
          />
          <FactorRow
            label="Anomaly Rate"
            valueText={`${anomalyRate.toFixed(0)}%`}
            barPct={Math.min(anomalyRate, 100)}
            desc={factorInfo.anomalyDesc}
            color={anomalyRate >= 30 ? '#E74C3C' : anomalyRate >= 10 ? '#F39C12' : '#27AE60'}
          />
          <View style={styles.sectionDivider} />
          <Text style={{ fontSize: 13, color: colors.secondary, fontWeight: '600', textAlign: 'center' }}>View risk details →</Text>
        </TouchableOpacity>
      )}

      {/* ── Spending by Category ── */}
      {categoryBreakdown.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <View>
              <Text style={styles.cardTitle}>Spending by Category</Text>
              <Text style={styles.cardSubtitle}>
                {MONTHS[selectedMonth - 1]} {selectedYear}
              </Text>
            </View>
            <View style={[styles.accentBar, { backgroundColor: colors.secondary }]} />
          </View>

          <View style={styles.donutWrap}>
            <View style={styles.donutHolder}>
              <DonutChart
                data={categoryBreakdown.map((c, i) => ({
                  value: Number(c.totalAmount) || 0,
                  color: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length],
                }))}
              />
              <View style={styles.donutCenter}>
                <Text style={styles.donutTotalLabel}>Total</Text>
                <Text style={styles.donutTotalValue}>
                  {formatCurrency(categoryBreakdown.reduce((s, c) => s + Number(c.totalAmount || 0), 0))}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.legendList}>
            {categoryBreakdown.slice(0, 6).map((c, i) => (
              <View key={c.categoryId ?? c.categoryName} style={styles.legendRow}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: CATEGORY_PALETTE[i % CATEGORY_PALETTE.length] },
                  ]}
                />
                <Text style={styles.legendLabel} numberOfLines={1}>
                  {c.categoryName}
                </Text>
                <Text style={styles.legendAmount}>{formatCurrency(c.totalAmount)}</Text>
                <Text style={styles.legendPct}>{Number(c.percentage).toFixed(0)}%</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* ── Recent Anomalies ── */}
      {state.anomalies.length > 0 && (
        <View style={styles.card}>
          <View style={styles.cardHeaderAction}>
            <View>
              <Text style={styles.cardTitle}>Recent Anomalies</Text>
              <Text style={styles.cardSubtitle}>Latest 5 flagged transactions</Text>
            </View>
            <TouchableOpacity
              style={styles.viewAllBtn}
              onPress={() => navigation.navigate('Anomalies')}
            >
              <Text style={styles.viewAllText}>View all →</Text>
            </TouchableOpacity>
          </View>

          {state.anomalies.map((a, i) => {
            const status = STATUS_STYLE[a.status] ?? STATUS_STYLE.Pending;
            return (
              <TouchableOpacity
                key={a.transactionId}
                style={[styles.anomalyRow, i > 0 && styles.anomalyRowBorder]}
                onPress={() => navigation.navigate('Anomalies', {
                  screen: 'AnomalyDetail',
                  params: { transactionId: a.transactionId },
                  initial: false,
                })}
                activeOpacity={0.7}
              >
                <View style={styles.anomalyTop}>
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <Text style={styles.anomalyCategory} numberOfLines={1}>
                      {a.categoryName ?? '—'}
                    </Text>
                    <Text style={styles.anomalyMeta} numberOfLines={1}>
                      {a.description ?? '—'} · {formatDate(a.detectedAt)}
                    </Text>
                  </View>
                  <Text style={styles.anomalyAmount}>
                    {a.amount != null ? formatCurrency(a.amount) : '—'}
                  </Text>
                </View>

                <View style={styles.anomalyBottom}>
                  <View style={{ flex: 1, marginRight: spacing.sm }}>
                    <ScoreBar score={a.ensembleScore} />
                  </View>
                  <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                    <Text style={[styles.statusPillText, { color: status.fg }]}>{a.status}</Text>
                  </View>
                </View>

                <View style={styles.algoRow}>
                  {ALGO_SHORT.map((al) => (
                    <AlgoBadge key={al.key} active={a.algorithms[al.key]} label={al.label} />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
};

// ── Sub-components ───────────────────────────────────────────────────────────

function TrendChip({
  trend, small = false, onDark = false,
}: {
  trend: ReturnType<typeof buildTrend>;
  small?: boolean;
  onDark?: boolean;
}) {
  if (!trend || trend.direction === 'flat') return null;
  const goodGreen = onDark ? '#4ADE80' : colors.success;
  const badRed = onDark ? '#F87171' : colors.danger;
  const color = trend.isPositive ? goodGreen : badRed;
  const arrow = trend.direction === 'up' ? '↑' : '↓';
  return (
    <Text style={[styles.trendChip, { color, fontSize: small ? 10 : 11 }]}>
      {arrow} {trend.percent.toFixed(1)}%
    </Text>
  );
}

function FactorRow({
  label, valueText, barPct, desc, color,
}: { label: string; valueText: string; barPct: number; desc: string; color: string }) {
  return (
    <View style={styles.factorRow}>
      <View style={styles.factorLabelRow}>
        <Text style={styles.factorLabel}>{label}</Text>
        <Text style={[styles.factorPct, { color }]}>{valueText}</Text>
      </View>
      <View style={styles.factorBarBg}>
        <View style={[styles.factorBarFill, { width: `${Math.min(Math.max(barPct, 0), 100)}%`, backgroundColor: color }]} />
      </View>
      <Text style={styles.factorDesc}>{desc}</Text>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Layout
  container: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  loadingText: { color: colors.textSecondary, fontSize: fontSizes.md },

  // Header
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingHorizontal: spacing.md, marginBottom: spacing.md,
  },
  pageTitle: { fontSize: 22, fontWeight: '800', color: '#0F172A', letterSpacing: -0.5, lineHeight: 26 },
  subRow: { flexDirection: 'row', alignItems: 'center', marginTop: 4, flexWrap: 'wrap' },
  greeting: { fontSize: fontSizes.sm, color: colors.primary, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginHorizontal: 8 },
  subtitle: { fontSize: fontSizes.xs, color: colors.textMuted },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  iconBtn: {
    width: 38, height: 38, borderRadius: 10,
    borderWidth: 1.5, borderColor: colors.border,
    alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface,
  },
  badge: {
    position: 'absolute', top: -4, right: -4, minWidth: 18, height: 18, borderRadius: 9,
    backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 4, borderWidth: 2, borderColor: colors.background,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  // Error
  errorBox: {
    marginHorizontal: spacing.md, marginBottom: spacing.sm,
    padding: spacing.sm, backgroundColor: '#FEE2E2', borderRadius: borderRadius.sm,
  },
  errorText: { color: colors.danger, fontSize: fontSizes.sm },

  // Month selector
  monthSelector: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: spacing.md, marginBottom: spacing.md,
    backgroundColor: colors.surface, borderRadius: borderRadius.md,
    padding: spacing.sm, ...shadows.sm,
  },
  monthArrow: { paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  monthArrowDisabled: { opacity: 0.3 },
  monthArrowText: { fontSize: fontSizes.xl, fontWeight: '700', color: colors.primary, lineHeight: 22 },
  monthArrowTextDisabled: { color: colors.textMuted },
  monthLabelContainer: { flex: 1, alignItems: 'center' },
  monthLabel: { fontSize: fontSizes.md, fontWeight: '700', color: colors.primary, letterSpacing: 0.3 },
  monthUnderline: { width: 18, height: 2, backgroundColor: colors.primary, borderRadius: 1, marginTop: 3 },

  // No data
  noDataBox: {
    marginHorizontal: spacing.md, marginBottom: spacing.md,
    padding: spacing.md, backgroundColor: colors.surface,
    borderRadius: borderRadius.md, alignItems: 'center',
    borderWidth: 1, borderColor: colors.border,
  },
  noDataText: { color: colors.textSecondary, fontSize: fontSizes.sm },

  // Balance card
  balanceCard: {
    marginHorizontal: spacing.md, marginBottom: spacing.md,
    backgroundColor: colors.primary, borderRadius: borderRadius.lg,
    padding: spacing.lg, ...shadows.md,
  },
  balanceLabel: { fontSize: fontSizes.sm, color: 'rgba(255,255,255,0.75)', marginBottom: 4 },
  balanceAmountRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.md, flexWrap: 'wrap' },
  balanceAmount: { fontSize: fontSizes.xxxl, fontWeight: '800', letterSpacing: -0.5 },
  trendChip: { fontWeight: '700' },
  balanceRow: { flexDirection: 'row', alignItems: 'center' },
  balanceItem: { flex: 1, alignItems: 'center' },
  balanceDivider: { width: 1, height: 44, backgroundColor: 'rgba(255,255,255,0.2)' },
  balanceItemLabel: { fontSize: fontSizes.xs, color: 'rgba(255,255,255,0.7)', marginBottom: 4 },
  balanceItemValue: { fontSize: fontSizes.md, fontWeight: '700' },

  // Stats row
  statsGrid: {
    flexDirection: 'row', paddingHorizontal: spacing.md,
    gap: spacing.sm, marginBottom: spacing.md,
  },
  statCard: {
    flex: 1, backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.md, alignItems: 'flex-start', ...shadows.sm,
  },
  statIcon: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  statValue: { fontSize: fontSizes.xxl, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5 },
  statLabel: { fontSize: fontSizes.xs, color: colors.textSecondary, marginTop: 2, marginBottom: 4 },

  // Generic card
  card: {
    marginHorizontal: spacing.md, marginBottom: spacing.md,
    backgroundColor: colors.surface, borderRadius: borderRadius.lg,
    padding: spacing.lg, ...shadows.sm,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: spacing.md,
  },
  cardHeaderAction: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: spacing.md,
  },
  cardTitle: { fontSize: fontSizes.md, fontWeight: '700', color: colors.textPrimary },
  cardSubtitle: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  accentBar: { width: 3, height: 22, borderRadius: 2, alignSelf: 'center' },

  // Gauge
  gaugeWrap: { alignItems: 'center', marginBottom: spacing.sm },
  gaugeInner: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  gaugeOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  gaugeNumber: { fontSize: 38, fontWeight: '800', letterSpacing: -1.5, lineHeight: 40 },
  gaugeOutOf: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: -2 },
  riskBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: spacing.md, paddingVertical: 5,
    borderRadius: borderRadius.full, borderWidth: 1.5, marginTop: 6,
  },
  riskBadgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6 },
  liveDot: { width: 7, height: 7, borderRadius: 4 },
  trendDelta: { fontSize: fontSizes.xs, marginTop: 8, fontWeight: '500' },

  // Section divider
  sectionDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.md },
  sparkHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 6,
  },
  eyebrow: {
    fontSize: 10, fontWeight: '800',
    color: '#94A3B8', letterSpacing: 1, textTransform: 'uppercase',
  },
  eyebrowMuted: { fontSize: 10, color: '#CBD5E1' },

  // Factors
  factorRow: { marginBottom: 12 },
  factorLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'baseline', marginBottom: 4,
  },
  factorLabel: { fontSize: fontSizes.sm, fontWeight: '600', color: colors.textPrimary },
  factorPct: { fontSize: fontSizes.sm, fontWeight: '700' },
  factorBarBg: { height: 4, backgroundColor: '#E9ECEF', borderRadius: borderRadius.full, overflow: 'hidden' },
  factorBarFill: { height: '100%', borderRadius: borderRadius.full },
  factorDesc: { fontSize: 11, color: colors.textMuted, marginTop: 4 },

  // Donut
  donutWrap: { alignItems: 'center', marginBottom: spacing.md },
  donutHolder: { position: 'relative', alignItems: 'center', justifyContent: 'center' },
  donutCenter: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  donutTotalLabel: { fontSize: 10, fontWeight: '700', color: '#94A3B8', letterSpacing: 0.8, textTransform: 'uppercase' },
  donutTotalValue: { fontSize: fontSizes.md, fontWeight: '800', color: colors.primary, marginTop: 2 },

  // Legend
  legendList: { gap: 8 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendLabel: { flex: 1, fontSize: fontSizes.sm, color: colors.textPrimary, fontWeight: '600' },
  legendAmount: { fontSize: fontSizes.sm, color: colors.textPrimary, fontWeight: '700' },
  legendPct: { fontSize: fontSizes.xs, color: colors.textMuted, width: 36, textAlign: 'right' },

  // Anomaly rows
  viewAllBtn: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: borderRadius.full, borderWidth: 1.5,
    borderColor: colors.primary,
  },
  viewAllText: { fontSize: 11, fontWeight: '700', color: colors.primary },
  anomalyRow: { paddingVertical: spacing.sm },
  anomalyRowBorder: { borderTopWidth: 1, borderTopColor: colors.border },
  anomalyTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 },
  anomalyCategory: { fontSize: fontSizes.sm, fontWeight: '700', color: colors.textPrimary },
  anomalyMeta: { fontSize: fontSizes.xs, color: colors.textMuted, marginTop: 2 },
  anomalyAmount: { fontSize: fontSizes.md, fontWeight: '800', color: '#E74C3C' },
  anomalyBottom: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  algoRow: { flexDirection: 'row', gap: 4, marginTop: 8 },

  // Score bar
  scoreBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreBarBg: { flex: 1, height: 5, backgroundColor: '#F1F5F9', borderRadius: borderRadius.full, overflow: 'hidden' },
  scoreBarFill: { height: '100%' },
  scoreBarText: { fontSize: 11, fontWeight: '800', width: 24, textAlign: 'right' },

  // Algo badge
  algoBadge: {
    width: 30, height: 22, borderRadius: 5,
    alignItems: 'center', justifyContent: 'center', borderWidth: 1,
  },
  algoBadgeOn: { backgroundColor: '#0F172A', borderColor: '#0F172A' },
  algoBadgeOff: { backgroundColor: colors.surface, borderColor: colors.border },
  algoBadgeText: { fontSize: 9, fontWeight: '800', letterSpacing: 0.4 },
  algoBadgeTextOn: { color: '#fff' },
  algoBadgeTextOff: { color: colors.textMuted },

  // Status
  statusPill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: borderRadius.full },
  statusPillText: { fontSize: 11, fontWeight: '700' },
});
