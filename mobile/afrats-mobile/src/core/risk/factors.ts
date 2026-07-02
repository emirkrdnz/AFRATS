// Mirror of web/afrats-web/src/pages/risk/RiskDetail.jsx logic:
// FACTOR_RULES (single source of truth) + buildFactorRows + factorHint +
// TR_BASELINES/buildBenchmarks + override parsing. Keeps mobile in sync with web.
import dayjs from 'dayjs';
import type { RiskFactors } from '@/domain/entities';

export const RISK_COLORS: Record<string, string> = { Low: '#27AE60', Medium: '#F39C12', High: '#E74C3C' };
export const STATUS_COLOR: Record<string, string> = { good: '#27AE60', warning: '#F39C12', bad: '#E74C3C' };

export function pickRiskLevel(score: number): 'Low' | 'Medium' | 'High' {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

interface Rule { warningAt: number; badAt: number; barScaleMax: number; barTickAt?: number; target: string; signed?: boolean; }
export const FACTOR_RULES: Record<string, Rule> = {
  debt_ratio:     { warningAt: 80, badAt: 120, barScaleMax: 150, barTickAt: 100, target: 'target ≤ 80% of income' },
  spending_trend: { warningAt: 10, badAt: 30,  barScaleMax: 50,  target: 'target within ±10% vs last month', signed: true },
  anomaly_rate:   { warningAt: 10, badAt: 30,  barScaleMax: 100, target: 'target ≤ 10%' },
};

export function statusOf(rule: Rule, value: number): 'good' | 'warning' | 'bad' {
  if (rule.signed) {
    if (value > rule.badAt) return 'bad';
    if (Math.abs(value) > rule.warningAt) return 'warning';
    return 'good';
  }
  if (value > rule.badAt) return 'bad';
  if (value > rule.warningAt) return 'warning';
  return 'good';
}

function fmtTwoMonth(recent?: string, previous?: string): string | null {
  if (!recent || !previous) return null;
  const f = (s: string) => dayjs(`${s}-01`).format('MMM');
  return `${f(recent)} vs ${f(previous)}`;
}

export interface FactorRow {
  key: 'debt_ratio' | 'spending_trend' | 'anomaly_rate';
  label: string;
  pct: number;
  barPct: number;
  barMarker?: { atPct: number; label: string };
  target: string;
  description: string;
  status: 'good' | 'warning' | 'bad';
  signed?: boolean;
}

export function buildFactorRows(factors: RiskFactors | undefined, anomalyRate: number): FactorRow[] {
  if (!factors) return [];
  const debtRatio = Number(factors.debt_ratio ?? 0);
  const spendingTrend = Number(factors.spending_trend ?? 1);
  const anomalyPct = Number(anomalyRate ?? 0);

  const r1 = FACTOR_RULES.debt_ratio;
  const spendPct = debtRatio * 100;
  const spendDesc =
    spendPct >= 100 ? `Expenses exceed income (${spendPct.toFixed(0)}%)`
    : spendPct >= r1.warningAt ? `Tight margin — ${spendPct.toFixed(0)}% of income spent`
    : `Healthy — ${spendPct.toFixed(0)}% of income spent`;

  const r2 = FACTOR_RULES.spending_trend;
  const trendPct = (spendingTrend - 1) * 100;
  const trendAbs = Math.abs(trendPct);
  const trendSuffix = fmtTwoMonth(factors.spending_trend_months?.recent, factors.spending_trend_months?.previous) || 'vs prior month';
  const trendDesc =
    trendAbs <= 5 ? `Stable — ${trendSuffix}`
    : trendPct > 0 ? `Up ${trendPct.toFixed(0)}% — ${trendSuffix}`
    : `Down ${trendAbs.toFixed(0)}% — ${trendSuffix}`;

  const r3 = FACTOR_RULES.anomaly_rate;
  const anomalyDesc =
    anomalyPct >= r3.badAt ? `${anomalyPct.toFixed(0)}% of recent txns flagged`
    : anomalyPct >= r3.warningAt ? `${anomalyPct.toFixed(0)}% flagged — review recent activity`
    : anomalyPct > 0 ? `Low — ${anomalyPct.toFixed(0)}% of recent txns flagged`
    : 'No flagged transactions';

  return [
    { key: 'debt_ratio', label: 'Spending vs Income', pct: spendPct,
      barPct: Math.min(spendPct, r1.barScaleMax) / r1.barScaleMax * 100,
      barMarker: { atPct: (r1.barTickAt! / r1.barScaleMax) * 100, label: '100% of income' },
      target: r1.target, description: spendDesc, status: statusOf(r1, spendPct) },
    { key: 'spending_trend', label: 'Spending Trend', pct: trendPct,
      barPct: Math.min(trendAbs, r2.barScaleMax) / r2.barScaleMax * 100,
      target: r2.target, description: trendDesc, status: statusOf(r2, trendPct), signed: true },
    { key: 'anomaly_rate', label: 'Anomaly Rate', pct: anomalyPct,
      barPct: Math.min(anomalyPct, r3.barScaleMax),
      target: r3.target, description: anomalyDesc, status: statusOf(r3, anomalyPct) },
  ];
}

export function factorHint(key: string, factors: RiskFactors | undefined, anomalyRate: number): string {
  const debtRatio = Number(factors?.debt_ratio ?? 0);
  const spendingTrend = Number(factors?.spending_trend ?? 1);
  const anomalyPct = Number(anomalyRate ?? 0);
  if (key === 'debt_ratio') {
    if (debtRatio >= 1.5) return 'Reduce expenses immediately — cut discretionary categories.';
    if (debtRatio >= 1.0) return `Cap top 3 expense categories — spending is ${((debtRatio - 1) * 100).toFixed(0)}% over income.`;
    if (debtRatio >= 0.8) return 'Tight margin — build a small buffer for unexpected costs.';
    return 'Healthy spend-to-income ratio. Keep the pattern.';
  }
  if (key === 'spending_trend') {
    if (spendingTrend >= 1.3) return 'Investigate sudden spending increase.';
    if (spendingTrend >= 1.1) return 'Watch the upward trend — small correction now beats bigger one later.';
    if (spendingTrend <= 0.9) return 'Spending dropped notably — check whether it is sustainable.';
    return 'Stable pattern vs last month.';
  }
  if (key === 'anomaly_rate') {
    if (anomalyPct >= 30) return 'Review flagged transactions on the Anomalies page.';
    if (anomalyPct >= 10) return 'A few transactions stood out — confirm they were intentional.';
    return 'Spending pattern looks consistent.';
  }
  return '';
}

export const TR_BASELINES: Record<string, number> = {
  Rent: 30, 'Rent/Mortgage': 30, Mortgage: 30, Housing: 30,
  Food: 15, 'Food & Dining': 15, Grocery: 12, Groceries: 12,
  Transport: 10, Transportation: 10,
  Utilities: 8, Entertainment: 8, Shopping: 8, Clothing: 6,
  Healthcare: 5, Health: 5, Education: 5, Savings: 20,
  'Other Expense': 5, Other: 5, Bills: 8,
};
const BENCHMARK_CAP = 300;
export const BENCHMARK_BAR_SCALE = 40;

export interface Benchmark { category: string; userPercent: number; rawPercent: number; baselinePercent: number; healthy: boolean; }

export function buildBenchmarks(categoryBreakdown: any[], totalIncome: number): Benchmark[] {
  if (!Array.isArray(categoryBreakdown) || categoryBreakdown.length === 0) return [];
  if (!totalIncome || totalIncome <= 0) return [];
  return categoryBreakdown
    .map((c) => {
      const rawPercent = (Number(c.totalAmount || c.amount || 0) / totalIncome) * 100;
      const userPercent = Math.min(rawPercent, BENCHMARK_CAP);
      const baseline = TR_BASELINES[c.categoryName] ?? 8;
      return {
        category: c.categoryName,
        userPercent: Number(userPercent.toFixed(1)),
        rawPercent: Number(rawPercent.toFixed(1)),
        baselinePercent: baseline,
        healthy: rawPercent <= baseline * 1.1,
      };
    })
    .filter((b) => b.userPercent > 0)
    .sort((a, b) => b.rawPercent - a.rawPercent);
}

// Override banner: parse "model: X.XX" from factors.override_reasons[0].
export function parseOverride(factors: RiskFactors | undefined): { modelScore: number | null; reasons: string[] } | null {
  const reasons = factors?.override_reasons;
  if (!Array.isArray(reasons) || reasons.length === 0) return null;
  const m = reasons[0].match(/model:\s*([\d.]+)/);
  return { modelScore: m ? Math.round(Number(m[1])) : null, reasons };
}
