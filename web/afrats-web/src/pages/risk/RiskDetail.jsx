// src/pages/risk/RiskDetail.jsx
// Real backend wire-up:
//   mlApi.getCurrentRisk()        → { score, level, factors{}, calculatedAt }
//   mlApi.getRiskHistory(months)  → history array with monthly aggregation
//   transactionApi.getSummary()   → { totalIncome, categoryBreakdown[] }

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Doughnut, Line, Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement, CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Filler, Tooltip, Legend,
} from 'chart.js';
import { parseAsUtc, formatTwoMonthLabel } from '../../utils/formatters';
import {
  FiArrowUp, FiArrowDown, FiMinus, FiInfo,
  FiCheckCircle, FiAlertCircle, FiTrendingUp,
  FiChevronLeft, FiChevronRight,
} from 'react-icons/fi';

import mlApi from '../../api/mlApi';
import transactionApi from '../../api/transactionApi';
import { extractErrorMessage } from '../../api/errorHelper';
import Badge, { riskLevelVariant } from '../../components/Badge';
import Card from '../../components/Card';
import Skeleton from '../../components/Skeleton';
import EmptyState from '../../components/EmptyState';

ChartJS.register(
  ArcElement, CategoryScale, LinearScale,
  PointElement, LineElement, BarElement,
  Filler, Tooltip, Legend,
);

// ─── tokens ───────────────────────────────────────────────────────────────────
const RISK_COLORS = { Low: '#27AE60', Medium: '#F39C12', High: '#E74C3C' };

// Not: Eskiden Income transaction'larından gelen "score ~10, Low, dummy
// factors" artefact'lerini filtrelemek için bir isRiskArtifact() helper'ı
// vardı. Backend tarafında consumer.py'da Income için risk_service skip
// edildikten sonra bu artefact kaynağı kuruduğu için filter kaldırıldı.
// İlk 10 expense tx'inin "insufficient history" fallback'i ile yine ~10
// puan oluşur — bu ARTIK artefact değil, "warming up" fazı; grafikte
// görünmesi demo için tercih edilen davranış (veri biriktikçe modelin
// kendine güveni artışını gösterir).

// Risk score'da policy rule override var mı kontrol et — backend
// `factors.override_reasons` array'ine ekliyor (örn. "debt_medium: ratio=1.29
// → score floored to 60.0 (model: 51.29)").
function hasRuleOverride(h) {
  const reasons = h?.factors?.override_reasons;
  return Array.isArray(reasons) && reasons.length > 0;
}

// Override reason text'inden "model: X.XX" değerini parse eder — kuralın
// override etmeden önce ML modelinin gerçekten ne öngördüğünü çıkarır.
// "ML raw" görünümünde her event'te ML'in gerçek perspektifini sürekli
// göstermek için. Override yoksa stored score zaten ML çıktısıdır.
function parseRawMlScore(h) {
  const stored = Number(h?.score ?? 0);
  if (!hasRuleOverride(h)) return stored;
  const match = h.factors.override_reasons[0].match(/model:\s*([\d.]+)/);
  return match ? Number(match[1]) : stored;
}

function pickRiskLevel(score) {
  if (score >= 70) return 'High';
  if (score >= 40) return 'Medium';
  return 'Low';
}

// ─── factor rules (single source of truth) ───────────────────────────────────
// Eşikler, bar skalası, target metni, chart konfigürasyonu — hepsi buradan.
// Score Breakdown satırı, drill-down chart ve healthy band hep bu objeyi okur,
// bu yüzden bir yerde 80 değişirse diğer yerlere drift olmaz.
const FACTOR_RULES = {
  debt_ratio: {
    warningAt:    80,    // > warningAt → status: warning
    badAt:        120,   // > badAt     → status: bad
    barScaleMax:  150,   // bar full-width bu %'yi temsil eder
    barTickAt:    100,   // bar üzerinde dikey income tick'i
    target:       'target ≤ 80% of income',
    chartBandTop: 80,    // drill-down chart'taki yeşil healthy band'in üst sınırı
    chartStep:    25,    // Y eksenindeki tick aralığı
  },
  spending_trend: {
    warningAt:    10,
    badAt:        30,
    barScaleMax:  50,
    target:       'target within ±10% vs last month',
    signed:       true,  // status mutlak değere göre, chart simetrik
    chartBandTop: 10,
    chartStep:    10,
  },
  anomaly_rate: {
    warningAt:    10,
    badAt:        30,
    barScaleMax:  100,
    target:       'target ≤ 10%',
  },
};

function statusOf(rule, value) {
  // Signed factors (spending_trend) ASIMETRIK: artış riskli (bad/red),
  // düşüş asla 'bad' değil — spending düşüşü tek başına alarm sebebi değil
  // ("check whether sustainable" hint zaten gerekli mesajı veriyor).
  // Eski symmetric mantık -%98 gibi partial-month false-positive'lerinde
  // (June 2'de Mayıs/Haziran kıyası) kullanıcıya gereksiz kırmızı banner
  // gösteriyordu. Backend'de current month skip'i landed; bu UI guard'ı
  // gelecekte gerçek düşüş senaryolarında da abartısız renk verir.
  if (rule.signed) {
    if (value > rule.badAt) return 'bad';
    if (Math.abs(value) > rule.warningAt) return 'warning';
    return 'good';
  }
  if (value > rule.badAt) return 'bad';
  if (value > rule.warningAt) return 'warning';
  return 'good';
}

// ─── factor rows ──────────────────────────────────────────────────────────────
// Each row exposes a *meaningful* percentage plus a rule-driven status. Shared
// between Dashboard and RiskDetail; thresholds come from FACTOR_RULES.
function buildFactorRows(factors, anomalyRate) {
  if (!factors) return [];

  const debtRatio     = Number(factors.debt_ratio     ?? 0);
  const spendingTrend = Number(factors.spending_trend ?? 1);
  const anomalyPct    = Number(anomalyRate ?? 0);

  // 1. Spending vs Income
  const r1 = FACTOR_RULES.debt_ratio;
  const spendPct = debtRatio * 100;
  const spendDesc =
    spendPct >= 100 ? `Expenses exceed income (${spendPct.toFixed(0)}%)`
    : spendPct >= r1.warningAt ? `Tight margin — ${spendPct.toFixed(0)}% of income spent`
    : `Healthy — ${spendPct.toFixed(0)}% of income spent`;

  // 2. Spending Trend (month-over-month)
  // Backend artık current calendar month'u skip ediyor; kıyaslanan 2 ay
  // factors.spending_trend_months içinde dürüstçe iletilir. Etiket bu
  // metadata varsa "Up 27% — May vs April" formatında, yoksa eski risk
  // kayıtları için "vs prior month" fallback. "vs last month" varsayımı
  // partial-month bug ile birlikte ölüyor.
  const r2 = FACTOR_RULES.spending_trend;
  const trendPct = (spendingTrend - 1) * 100;
  const trendAbs = Math.abs(trendPct);
  const monthsMeta  = factors.spending_trend_months;
  const monthsLabel = monthsMeta
    ? formatTwoMonthLabel(monthsMeta.recent, monthsMeta.previous)
    : null;
  const trendSuffix = monthsLabel || 'vs prior month';
  const trendDesc =
    trendAbs <= 5 ? `Stable — ${trendSuffix}`
    : trendPct > 0 ? `Up ${trendPct.toFixed(0)}% — ${trendSuffix}`
    : `Down ${trendAbs.toFixed(0)}% — ${trendSuffix}`;

  // 3. Anomaly Rate
  const r3 = FACTOR_RULES.anomaly_rate;
  const anomalyDesc =
    anomalyPct >= r3.badAt     ? `${anomalyPct.toFixed(0)}% of recent txns flagged`
    : anomalyPct >= r3.warningAt ? `${anomalyPct.toFixed(0)}% flagged — review recent activity`
    : anomalyPct > 0             ? `Low — ${anomalyPct.toFixed(0)}% of recent txns flagged`
    : 'No flagged transactions';

  return [
    {
      key:         'debt_ratio',
      label:       'Spending vs Income',
      pct:         spendPct,
      barPct:      Math.min(spendPct, r1.barScaleMax) / r1.barScaleMax * 100,
      barMarker:   { atPct: r1.barTickAt / r1.barScaleMax * 100, label: '100% of income' },
      target:      r1.target,
      description: spendDesc,
      status:      statusOf(r1, spendPct),
    },
    {
      key:         'spending_trend',
      label:       'Spending Trend',
      pct:         trendPct,
      barPct:      Math.min(trendAbs, r2.barScaleMax) / r2.barScaleMax * 100,
      target:      r2.target,
      description: trendDesc,
      status:      statusOf(r2, trendPct),
      signed:      true,
    },
    {
      key:         'anomaly_rate',
      label:       'Anomaly Rate',
      pct:         anomalyPct,
      barPct:      Math.min(anomalyPct, r3.barScaleMax),
      target:      r3.target,
      description: anomalyDesc,
      status:      statusOf(r3, anomalyPct),
    },
  ];
}

// ─── single-line factor hints (shown under drill-down chart) ──────────────────
function factorHint(factorKey, factors, anomalyRate) {
  const debtRatio     = Number(factors?.debt_ratio     ?? 0);
  const spendingTrend = Number(factors?.spending_trend ?? 1);
  const anomalyPct    = Number(anomalyRate ?? 0);

  if (factorKey === 'debt_ratio') {
    if (debtRatio >= 1.5) return 'Reduce expenses immediately — cut discretionary categories.';
    if (debtRatio >= 1.0) return `Cap top 3 expense categories — spending is ${((debtRatio - 1) * 100).toFixed(0)}% over income.`;
    if (debtRatio >= 0.8) return 'Tight margin — build a small buffer for unexpected costs.';
    return 'Healthy spend-to-income ratio. Keep the pattern.';
  }
  if (factorKey === 'spending_trend') {
    if (spendingTrend >= 1.3) return 'Investigate sudden spending increase.';
    if (spendingTrend >= 1.1) return 'Watch the upward trend — small correction now beats bigger one later.';
    if (spendingTrend <= 0.9) return 'Spending dropped notably — check whether it is sustainable.';
    return 'Stable pattern vs last month.';
  }
  if (factorKey === 'anomaly_rate') {
    if (anomalyPct >= 30) return 'Review flagged transactions on the Anomalies page.';
    if (anomalyPct >= 10) return 'A few transactions stood out — confirm they were intentional.';
    return 'Spending pattern looks consistent.';
  }
  return '';
}

// ─── benchmarks ──────────────────────────────────────────────────────────────
const TR_BASELINES = {
  Rent: 30, 'Rent/Mortgage': 30, Mortgage: 30, Housing: 30,
  Food: 15, 'Food & Dining': 15, Grocery: 12, Groceries: 12,
  Transport: 10, Transportation: 10,
  Utilities: 8, Entertainment: 8, Shopping: 8, Clothing: 6,
  Healthcare: 5, Health: 5, Education: 5, Savings: 20,
  'Other Expense': 5, Other: 5, Bills: 8,
};
const BENCHMARK_CAP = 300; // cap display at 300% to prevent chart explosion

// BenchmarkRow bar'larının tüm satırlarda paylaştığı sabit skala. Önceki
// per-row dinamik scale (Math.max(baseline*2, user*1.2, baseline+10))
// baseline tick'ini her satırda farklı pozisyona koyup gözle satır-arası
// karşılaştırmayı imkansız hale getiriyordu — bir kategori overshoot
// yapınca diğer satırların skalası da değişiyor, "okunabilirlik bozuluyor"
// dedik. 40% cap = max baseline (Rent 30%) + buffer; user spend bunu
// aşarsa bar clip olur ama renk (kırmızı) + sağdaki "+X%" delta zaten
// overshoot'u net iletiyor.
const BENCHMARK_BAR_SCALE = 40;

function buildBenchmarks(categoryBreakdown, totalIncome) {
  if (!Array.isArray(categoryBreakdown) || categoryBreakdown.length === 0) return [];
  if (!totalIncome || totalIncome <= 0) return [];

  return categoryBreakdown
    .map((c) => {
      const rawPercent  = (Number(c.totalAmount || c.amount || 0) / totalIncome) * 100;
      const userPercent = Math.min(rawPercent, BENCHMARK_CAP); // cap for display
      const baseline    = TR_BASELINES[c.categoryName] ?? 8;
      return {
        category:        c.categoryName,
        userPercent:     Number(userPercent.toFixed(1)),
        rawPercent:      Number(rawPercent.toFixed(1)),
        baselinePercent: baseline,
        healthy:         rawPercent <= baseline * 1.1,
        capped:          rawPercent > BENCHMARK_CAP,
      };
    })
    .filter((b) => b.userPercent > 0)
    .sort((a, b) => b.rawPercent - a.rawPercent);
}

// ─── loading skeleton ─────────────────────────────────────────────────────────
function Loading() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <Skeleton height={10} width="60%" style={{ marginBottom: 12 }} />
              <Skeleton height={40} width="50%" style={{ marginBottom: 10 }} />
              <Skeleton height={6} />
            </div>
          ))}
        </div>
      </div>
      <div style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
        <Skeleton height={12} width="30%" style={{ marginBottom: 14 }} />
        <Skeleton height={180} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ background: '#fff', border: '1px solid var(--color-border)', borderRadius: 12, padding: 20 }}>
            <Skeleton height={12} width="40%" style={{ marginBottom: 14 }} />
            {[0, 1, 2].map((j) => (
              <div key={j} style={{ marginBottom: 12 }}>
                <Skeleton height={10} width="60%" style={{ marginBottom: 6 }} />
                <Skeleton height={5} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── OVERVIEW CARD ────────────────────────────────────────────────────────────
// Tek satır: [gauge] [Change+Last Calc stacked] [history chart — kalan alanı doldurur].
// Override banner card'ın son satırında. Period selector kaldırıldı — history sabit
// 6 ay penceresinden çekiliyor.
function RiskOverviewCard({ current, overrideReasons, history, expenseTxs }) {
  const color    = RISK_COLORS[current.level] || '#1B4F72';

  // CHANGE artık "ardışık iki risk score arasındaki delta" değil — rule
  // override genellikle 60'a sabitlediği için ardışık 2 score sürekli aynı
  // çıkıyordu → "Stable 0.0 pts" sonsuza dek → bilgi sıfır. Yeni mantık:
  // "current vs son 30 score'un ortalaması" → kullanıcının tipik durumundan
  // ne kadar uzakta olduğunu net gösterir.
  const typicalScore = useMemo(() => {
    if (!history || history.length === 0) return null;
    const window = history.slice(0, Math.min(30, history.length));
    const sum    = window.reduce((a, h) => a + Number(h.score || 0), 0);
    return sum / window.length;
  }, [history]);

  const delta        = typicalScore != null ? current.score - typicalScore : 0;
  const isAtTypical  = typicalScore != null && Math.abs(delta) < 3;
  const DeltaIcon    = delta > 0 ? FiArrowUp : delta < 0 ? FiArrowDown : FiMinus;
  const deltaColor   = delta > 0 ? '#E74C3C' : delta < 0 ? '#27AE60' : '#94A3B8';

  // Toggle: Final / ML raw — saf ML davranışını policy override sonrası ile
  // karşılaştırmak için. Önceki 3-li filter (All/ML only/Rules) hatalıydı:
  //   - "Rules applied" hep 60'a sabitlenmiş düz çizgi (rule = constant floor)
  //   - "ML only" override OLMAYAN event'leri filtreliyordu; son nokta banner
  //     ile uyuşmuyor, kavramsal tutarsızlık vardı.
  // Yeni mantık: filter yok, scores'un kendisini değiştir. ML raw mode'unda
  // her event için pre-override ML değerini parse edip göster → kesintisiz
  // ve banner ile tutarlı raw model perspektifi.
  const [historyMode, setHistoryMode] = useState('final');

  const gaugeData = {
    datasets: [{ data: [current.score, 100 - current.score], backgroundColor: [color, '#F3F4F6'], borderWidth: 0, circumference: 180, rotation: 270 }],
  };
  const gaugeOpts = {
    responsive: true, maintainAspectRatio: false, cutout: '78%',
    plugins: { tooltip: { enabled: false }, legend: { display: false } },
  };

  // History — chronological desc'ten asc'a çevir + Income-triggered ele.
  // Income tx'leri DB'de durur ama chart'tan gizli (Dashboard get_current
  // filter + audit için).
  const allExpenseRisk = useMemo(
    () => [...history]
      .reverse()
      .filter(h => h?.factors?.triggered_by !== 'Income'),
    [history]
  );

  // Chart sadece son N event — eskiden tüm expense progression'u
  // gösteriyorduk ama 30+ event'te line gürültülenip dot'lar üst üste
  // biniyor, gözle pattern okunmuyordu. FactorDrillDownCard zaten aynı
  // limit'i (.slice(-30)) kullanıyor; iki chart tutarlı oldu. Header
  // subtitle "last N of M tx" diye dürüst söyler.
  const HISTORY_CHART_LIMIT = 30;
  const recent = useMemo(
    () => allExpenseRisk.slice(-HISTORY_CHART_LIMIT),
    [allExpenseRisk]
  );

  // Mode'a göre score değerleri
  const chartScores = useMemo(
    () => historyMode === 'mlraw'
      ? recent.map(parseRawMlScore)
      : recent.map((h) => Number(h.score) || 0),
    [recent, historyMode]
  );

  // Mini-stats: avg, max, override count — header'da gösterilir.
  const stats = useMemo(() => {
    if (chartScores.length === 0) return null;
    const sum = chartScores.reduce((a, b) => a + b, 0);
    return {
      avg:           Math.round(sum / chartScores.length),
      max:           Math.round(Math.max(...chartScores)),
      overrideCount: recent.filter(hasRuleOverride).length,
    };
  }, [chartScores, recent]);

  // recent[i] ↔ expenseTxs[offset+i] mapping (incremental import ordering):
  // her risk score, kronolojik sıralı bir expense tx için üretilir.
  const txDateAt = (i) => {
    if (!expenseTxs || expenseTxs.length === 0) return null;
    const offset = Math.max(0, expenseTxs.length - recent.length);
    const tx = expenseTxs[offset + i];
    if (!tx) return null;
    return tx.transactionDate || tx.TransactionDate || null;
  };

  // En son risk score'a karşılık gelen tx tarihi.
  const latestTxDate = useMemo(() => {
    if (!expenseTxs || expenseTxs.length === 0) return null;
    const last = expenseTxs[expenseTxs.length - 1];
    return last ? (last.transactionDate || last.TransactionDate || null) : null;
  }, [expenseTxs]);

  // Ay sınırları — chart points'i expense tx'lerle eşleştir, ay değiştiği
  // noktaları işaretle. recent.length expense tx'ten az olabilir; eşleşmeyen
  // boundary çizilmez.
  const monthBoundaries = useMemo(() => {
    if (!expenseTxs || expenseTxs.length === 0 || recent.length === 0) return [];
    // chart[i] ↔ expenseTxs[expenseTxs.length - recent.length + i]
    const offset = Math.max(0, expenseTxs.length - recent.length);
    const slice  = expenseTxs.slice(offset, offset + recent.length);
    const boundaries = [];
    let prevKey = null;
    slice.forEach((tx, i) => {
      const dateStr = tx.transactionDate || tx.TransactionDate;
      if (!dateStr) return;
      const d = new Date(dateStr);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (key !== prevKey) {
        boundaries.push({
          index: i,
          label: parseAsUtc(d).format('MMM'),
          year:  d.getFullYear(),
          month: d.getMonth(),
        });
        prevKey = key;
      }
    });
    return boundaries;
  }, [expenseTxs, recent.length]);

  const chartData = {
    labels: recent.map((_, i) => `#${i + 1}`),
    datasets: [{
      label: 'Risk score',
      data: chartScores,
      borderColor: '#1B4F72',
      // Background bantlar var, area fill çok subtle olsun
      backgroundColor: 'rgba(27,79,114,.025)',
      borderWidth: 1.8,
      // Daha az curvy — discrete event'lerin sahte interpolasyonu azalır
      tension: 0.15,
      // Normal noktalar minimal: küçük dot, border yok. Override noktalar
      // elmas, biraz daha belirgin. En son nokta (latest) büyük + border
      // → "şu an buradayım" vurgusu.
      pointStyle: recent.map((h, i) =>
        i === recent.length - 1 ? 'circle' : (hasRuleOverride(h) ? 'rectRot' : 'circle')
      ),
      pointRadius: recent.map((h, i) => {
        if (i === recent.length - 1) return 7;            // latest
        return hasRuleOverride(h) ? 5 : 2;
      }),
      pointBackgroundColor: chartScores.map((s) => RISK_COLORS[pickRiskLevel(s)] || '#1B4F72'),
      pointBorderColor: recent.map((_, i) =>
        i === recent.length - 1 ? '#FFFFFF' : 'rgba(255,255,255,0)'
      ),
      pointBorderWidth: recent.map((_, i) => i === recent.length - 1 ? 2.5 : 0),
      pointHoverRadius: recent.map((h, i) => {
        if (i === recent.length - 1) return 9;
        return hasRuleOverride(h) ? 8 : 6;
      }),
      pointHoverBorderColor: '#FFFFFF',
      pointHoverBorderWidth: 2,
      fill: true,
    }],
  };

  // Risk zone bands plugin — arkada subtle Low/Medium/High bantları + 40
  // ve 70'te dashed threshold çizgileri. Score'un hangi zone'da gezindiği
  // tek bakışta okunur, sharp transition'lar göze daha az çarpar (background
  // visual "zemin" sağlıyor).
  const riskZoneBandsPlugin = {
    id: 'riskZoneBands',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.y) return;
      const yScale = scales.y;
      const xL = chartArea.left, xR = chartArea.right;

      ctx.save();

      // Low zone: 0-40 (yeşil tint)
      ctx.fillStyle = 'rgba(39,174,96,0.05)';
      ctx.fillRect(xL, yScale.getPixelForValue(40), xR - xL, yScale.getPixelForValue(0) - yScale.getPixelForValue(40));

      // Medium zone: 40-70 (turuncu tint)
      ctx.fillStyle = 'rgba(243,156,18,0.05)';
      ctx.fillRect(xL, yScale.getPixelForValue(70), xR - xL, yScale.getPixelForValue(40) - yScale.getPixelForValue(70));

      // High zone: 70-100 (kırmızı tint)
      ctx.fillStyle = 'rgba(231,76,60,0.05)';
      ctx.fillRect(xL, yScale.getPixelForValue(100), xR - xL, yScale.getPixelForValue(70) - yScale.getPixelForValue(100));

      // Threshold çizgileri: 40 ve 70'te dashed
      ctx.strokeStyle = 'rgba(100,116,139,0.25)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      [40, 70].forEach(v => {
        const y = yScale.getPixelForValue(v);
        ctx.beginPath();
        ctx.moveTo(xL, y);
        ctx.lineTo(xR, y);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      ctx.restore();
    },
  };

  // Ay sınırları plugin — chart üzerinde dikey ince dashed çizgi + ay adı
  const monthBoundaryPlugin = {
    id: 'monthBoundary',
    afterDatasetsDraw(chart) {
      if (monthBoundaries.length === 0) return;
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.x) return;

      ctx.save();
      ctx.strokeStyle = 'rgba(148,163,184,0.35)';
      ctx.lineWidth   = 1;
      ctx.setLineDash([3, 4]);
      ctx.font        = '600 10px system-ui, -apple-system, sans-serif';
      ctx.fillStyle   = '#64748B';
      ctx.textBaseline = 'top';

      monthBoundaries.forEach(b => {
        // İlk index'in başında çizgi koymayalım (chart başlangıcı)
        if (b.index === 0) {
          // Sol başta ay adını gösterelim
          const x = scales.x.getPixelForValue(b.index);
          ctx.fillText(b.label, x + 4, chartArea.top + 3);
          return;
        }
        const x = scales.x.getPixelForValue(b.index);
        ctx.beginPath();
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.stroke();
        ctx.fillText(b.label, x + 4, chartArea.top + 3);
      });

      ctx.setLineDash([]);
      ctx.restore();
    },
  };

  // Latest value label plugin — son noktanın yanında değer yazısı
  const latestValuePlugin = {
    id: 'latestValueLabel',
    afterDatasetsDraw(chart) {
      const meta = chart.getDatasetMeta(0);
      if (!meta || !meta.data || meta.data.length === 0) return;
      const lastIdx   = meta.data.length - 1;
      const lastPoint = meta.data[lastIdx];
      const value     = chartScores[lastIdx];
      const level     = pickRiskLevel(value);
      const color     = RISK_COLORS[level] || '#1B4F72';

      const { ctx, chartArea } = chart;
      ctx.save();
      ctx.font          = '700 12px system-ui, -apple-system, sans-serif';
      ctx.fillStyle     = color;
      ctx.textBaseline  = 'middle';

      const txt    = `${Math.round(value)}`;
      const txtW   = ctx.measureText(txt).width;
      const padX   = 5;
      // Label son noktanın sağında — chart area'dan taşmıyorsa sağa, taşıyorsa sola
      const wouldOverflow = lastPoint.x + 10 + txtW + padX*2 > chartArea.right;
      const labelX = wouldOverflow ? lastPoint.x - 12 - txtW - padX*2 : lastPoint.x + 10;
      const labelY = lastPoint.y;

      // Background pill
      ctx.fillStyle = 'rgba(255,255,255,0.95)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      const rectX = labelX - padX, rectY = labelY - 10, rectW = txtW + padX*2, rectH = 20;
      const r = 5;
      ctx.beginPath();
      ctx.moveTo(rectX + r, rectY);
      ctx.lineTo(rectX + rectW - r, rectY);
      ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + r);
      ctx.lineTo(rectX + rectW, rectY + rectH - r);
      ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - r, rectY + rectH);
      ctx.lineTo(rectX + r, rectY + rectH);
      ctx.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - r);
      ctx.lineTo(rectX, rectY + r);
      ctx.quadraticCurveTo(rectX, rectY, rectX + r, rectY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.fillText(txt, labelX, labelY);

      ctx.restore();
    },
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const txDate = txDateAt(items[0].dataIndex);
            if (txDate) return parseAsUtc(txDate).format('DD MMM YYYY');
            // Fallback — tx data yüklenmediyse calculatedAt
            const p = recent[items[0].dataIndex];
            if (p?.calculatedAt) return parseAsUtc(p.calculatedAt).format('DD MMM YYYY · HH:mm');
            return `Transaction ${items[0].label}`;
          },
          label: (ctx) => {
            const shown = chartScores[ctx.dataIndex];
            const shownLevel = pickRiskLevel(shown);
            const modeLabel = historyMode === 'mlraw' ? 'ML raw' : 'Final';
            return `${modeLabel}: ${shown.toFixed(1)} (${shownLevel})`;
          },
          afterLabel: (ctx) => {
            const p = recent[ctx.dataIndex];
            const lines = [];
            if (hasRuleOverride(p)) {
              const finalScore = Number(p.score);
              const rawScore   = parseRawMlScore(p);
              const other = historyMode === 'mlraw'
                ? `Final after rule: ${finalScore.toFixed(1)}`
                : `ML raw: ${rawScore.toFixed(1)}`;
              lines.push(`◆ ${other}`);
            }
            // Scored at (calculatedAt) küçük teknik bilgi
            if (p?.calculatedAt) {
              lines.push(`Scored: ${parseAsUtc(p.calculatedAt).format('HH:mm DD.MM')}`);
            }
            return lines;
          },
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true, max: 100,
        // Grid line'ları daha subtle, sadece 40 ve 70 threshold'larıyla
        // yarışmayacak şekilde çok hafif
        grid: { color: 'rgba(243,244,246,0.6)' },
        ticks: {
          font: { size: 10 }, color: '#94A3B8',
          // 40 ve 70 thresholds + 0,100 sınırlarını içeren tick set
          callback: function(value) {
            return [0, 40, 70, 100].includes(value) ? value : '';
          },
          stepSize: 10,
        },
      },
      x: { grid: { display: false }, ticks: { font: { size: 10 }, color: '#94A3B8', maxTicksLimit: 12 } },
    },
  };

  const hasOverride = Array.isArray(overrideReasons) && overrideReasons.length > 0;

  return (
    <div style={{ background: '#fff', border: '1px solid #E4E9EF', borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 4px rgba(15,23,42,.06)' }}>
      <div style={{ height: 3, background: color }} />

      {/* ── Top row: gauge | stats stacked | history chart (kalan alan) ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '200px 180px 1fr', gap: 0, alignItems: 'stretch' }}>

        {/* Gauge */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '16px 20px', borderRight: '1px solid #F1F5F9' }}>
          <div style={{ position: 'relative', width: 140, height: 80 }}>
            <Doughnut data={gaugeData} options={gaugeOpts} />
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 2 }}>
              <span style={{ fontSize: 32, fontWeight: 800, lineHeight: 1, color, letterSpacing: '-1px' }}>{Math.round(current.score)}</span>
            </div>
          </div>
          <Badge variant={riskLevelVariant(current.level)} style={{ marginTop: 6 }}>{current.level}</Badge>
        </div>

        {/* Stats stacked: Change üstte, Last Calculated altta */}
        <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #F1F5F9' }}>
          {/* Change — vs typical (son 30 ortalaması) */}
          <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid #F1F5F9', flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>vs Typical</div>
            {typicalScore == null ? (
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>First calculated period</div>
            ) : isAtTypical ? (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, color: '#64748B' }}>
                  <FiMinus style={{ fontSize: 16, alignSelf: 'center' }} />
                  <span style={{ fontSize: 20, fontWeight: 700, lineHeight: 1, letterSpacing: '-.5px' }}>At typical</span>
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 5 }}>
                  Avg <span style={{ color: '#475569', fontWeight: 600 }}>{Math.round(typicalScore)}</span> ({pickRiskLevel(typicalScore)}) · last 30
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, color: deltaColor }}>
                  <DeltaIcon style={{ fontSize: 14, alignSelf: 'center' }} />
                  <span style={{ fontSize: 26, fontWeight: 800, lineHeight: 1, letterSpacing: '-1px' }}>{Math.abs(delta).toFixed(1)}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>pts</span>
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4 }}>
                  Avg <span style={{ color: '#475569', fontWeight: 600 }}>{Math.round(typicalScore)}</span> ({pickRiskLevel(typicalScore)}) · last 30
                </div>
              </>
            )}
          </div>

          {/* Latest transaction — tx tarihini öne çıkar, scored at küçük alt satır */}
          <div style={{ padding: '12px 20px 14px', flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Latest Transaction</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0F172A' }}>
              {latestTxDate ? parseAsUtc(latestTxDate).format('DD.MM.YYYY')
                : current.calculatedAt ? parseAsUtc(current.calculatedAt).format('DD.MM.YYYY')
                : '—'}
            </div>
            <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2 }}>
              {current.calculatedAt ? `Scored ${parseAsUtc(current.calculatedAt).format('HH:mm')}` : ''}
            </div>
          </div>
        </div>

        {/* History chart — kalan alanı doldurur */}
        <div style={{ padding: '12px 20px 14px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>Risk Score History</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {recent.length > 0 && stats
                  ? `${allExpenseRisk.length > recent.length ? `last ${recent.length} of ${allExpenseRisk.length}` : `${recent.length}`} tx · avg ${stats.avg} · max ${stats.max} · ◆ ${stats.overrideCount} override${stats.overrideCount === 1 ? '' : 's'} · ${historyMode === 'mlraw' ? 'raw ML (pre-override)' : 'final (post-rule)'}`
                  : 'Updated after every transaction.'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              {/* Toggle: Final / ML raw */}
              <div style={{ display: 'inline-flex', background: '#F1F5F9', borderRadius: 7, padding: 2 }}>
                {[
                  { key: 'final', label: 'Final'  },
                  { key: 'mlraw', label: 'ML raw' },
                ].map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setHistoryMode(opt.key)}
                    style={{
                      fontSize: 10, fontWeight: 700, padding: '4px 10px',
                      background: historyMode === opt.key ? '#fff' : 'transparent',
                      color: historyMode === opt.key ? '#0F172A' : '#64748B',
                      border: 'none', borderRadius: 5, cursor: 'pointer',
                      boxShadow: historyMode === opt.key ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                      transition: 'background 150ms',
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Risk level legend */}
              {recent.length > 0 && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {[{ level: 'Low', color: '#27AE60' }, { level: 'Medium', color: '#F39C12' }, { level: 'High', color: '#E74C3C' }].map((l) => (
                    <div key={l.level} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: l.color, display: 'inline-block' }} />
                      <span style={{ fontSize: 11, color: '#0F172A', fontWeight: 600 }}>{l.level}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          {recent.length > 0 ? (
            <div style={{ flex: 1, minHeight: 150 }}>
              <Line data={chartData} options={chartOptions} plugins={[riskZoneBandsPlugin, monthBoundaryPlugin, latestValuePlugin]} />
            </div>
          ) : (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#94A3B8', minHeight: 130, textAlign: 'center', padding: '0 16px' }}>
              Not enough data yet. Risk scores accumulate as transactions are analyzed.
            </div>
          )}
        </div>
      </div>

      {/* ── Override banner — card'ın son satırı, dual-bar + plain English ── */}
      {hasOverride && (
        <OverrideBanner
          modelScore={(() => {
            const m = overrideReasons[0].match(/model:\s*([\d.]+)/);
            return m ? Math.round(Number(m[1])) : null;
          })()}
          finalScore={Math.round(current.score)}
          debtRatio={Number(current?.factors?.debt_ratio ?? 0)}
          reasons={overrideReasons}
        />
      )}
    </div>
  );
}

// ─── OVERRIDE BANNER ──────────────────────────────────────────────────────────
// Final puan zaten üstteki gauge'da. Burada sadece ham ML model puanını ve
// neden lifted olduğunu kısa, info-tarzı tek satırla gösteriyoruz.
function OverrideBanner({ modelScore, finalScore, debtRatio, reasons }) {
  if (modelScore == null || finalScore == null) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 20px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0' }}>
        <FiInfo style={{ fontSize: 14, color: '#64748B', flexShrink: 0 }} />
        <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.5 }}>
          {reasons.map((r, i) => <div key={i}>{r}</div>)}
        </div>
      </div>
    );
  }

  const debtPct = Math.round(debtRatio * 100);
  const trigger = debtRatio >= 1.0
    ? `expenses are ${debtPct}% of income`
    : 'the policy floor minimum was applied';

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 20px',
      background: '#F8FAFC',
      borderTop: '1px solid #E2E8F0',
    }}>
      <FiInfo style={{ fontSize: 15, color: '#2E86C1', flexShrink: 0 }} />
      <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.55 }}>
        AI's base score was{' '}
        <strong style={{ color: '#0F172A', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{modelScore}</strong>
        , raised to{' '}
        <strong style={{ color: '#0F172A', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>{finalScore}</strong>
        {' '}by the policy floor — {trigger}.
      </div>
    </div>
  );
}

// ─── FACTOR BREAKDOWN ─────────────────────────────────────────────────────────
// Tıklanabilir factor row — seçili olan vurgulanır, tıklayınca onClick.
function FactorRow({ factor, isSelected, onClick }) {
  const statusColor = factor.status === 'good' ? '#27AE60' : factor.status === 'warning' ? '#F39C12' : '#E74C3C';
  const StatusIcon  = factor.status === 'good' ? FiCheckCircle : FiAlertCircle;

  // Signed factors (Spending Trend) → +/− prefix; others raw %.
  const valueText = factor.signed
    ? `${factor.pct >= 0 ? '+' : ''}${factor.pct.toFixed(0)}%`
    : `${factor.pct.toFixed(0)}%`;

  return (
    <div
      onClick={onClick}
      style={{
        padding: '10px 12px 12px',
        marginBottom: 8,
        cursor: 'pointer',
        borderLeft: `3px solid ${isSelected ? statusColor : 'transparent'}`,
        background: isSelected ? `${statusColor}12` : 'transparent',
        borderRadius: 8,
        transition: 'background 150ms, border-color 150ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusIcon style={{ fontSize: 14, color: statusColor, flexShrink: 0 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', letterSpacing: '-.1px' }}>{factor.label}</span>
        </div>
        <span style={{ fontSize: 17, fontWeight: 800, color: statusColor, fontVariantNumeric: 'tabular-nums', letterSpacing: '-.5px' }}>{valueText}</span>
      </div>
      <div style={{ position: 'relative', marginBottom: 7 }}>
        <div style={{ height: 6, background: '#F1F5F9', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${factor.barPct}%`, background: statusColor, borderRadius: 99, transition: 'width 600ms cubic-bezier(.4,0,.2,1)' }} />
        </div>
        {factor.barMarker && (
          <div
            style={{
              position: 'absolute',
              left: `${factor.barMarker.atPct}%`,
              top: -3, bottom: -3,
              width: 2,
              background: '#475569',
              borderRadius: 1,
              transform: 'translateX(-1px)',
              pointerEvents: 'none',
            }}
            title={factor.barMarker.label}
          />
        )}
      </div>
      <div style={{ fontSize: 11.5, color: '#475569', lineHeight: 1.45 }}>
        {factor.description}
        {factor.target && (
          <span style={{ color: '#94A3B8' }}>{'  ·  '}{factor.target}</span>
        )}
      </div>
    </div>
  );
}

function FactorBreakdownCard({ factors, selectedKey, onSelect }) {
  return (
    <Card title="Score Breakdown" subtitle="Tap a factor to see its history">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '0 -12px' }}>
        {factors.map((f) => (
          <FactorRow
            key={f.key}
            factor={f}
            isSelected={selectedKey === f.key}
            onClick={() => onSelect(f.key)}
          />
        ))}
      </div>
    </Card>
  );
}

// ─── FACTOR DRILL-DOWN ────────────────────────────────────────────────────────
// Seçili factor için işlem-bazlı eğri. Time-axis değil, transaction-axis.
// Eşikler ve healthy band'i FACTOR_RULES'tan okuyor — burada sadece görsel bilgi.
const FACTOR_META = {
  debt_ratio: {
    title:    'Spending vs Income — over recent transactions',
    yLabel:   '% of income',
    extract:  (h) => Number(h.factors?.debt_ratio ?? 0) * 100,
    color:    '#1B4F72',
    ySuffix:  '%',
  },
  spending_trend: {
    title:    'Spending Trend — month-over-month',
    yLabel:   '% vs last month',
    extract:  (h) => (Number(h.factors?.spending_trend ?? 1) - 1) * 100,
    color:    '#8E44AD',
    ySuffix:  '%',
  },
  anomaly_rate: {
    title:    'Anomaly Rate — current snapshot',
    isStatic: true,
  },
};

// ─── SPENDING TREND DRILL-DOWN — son 6 ay total expense bar chart ────────────
// Latest month status-colored, önceki aylar nötr gri. Bar üstünde % delta
// vs bir önceki ay badge'i. Y-axis k/M units. Title'da hem global ratio
// (factor.spending_trend kaynaklı, ML hesaplaması) hem aylık tablo.
function SpendingTrendMonthlyCard({ ratio, months, hint, meta }) {
  const [monthlyTotals, setMonthlyTotals] = useState(null);
  // Hangi bar hover'da — null = hiçbiri (default karşılaştırmayı göster).
  // Bar'a girince headline + ay etiketi o bar'ın (recent) ile bir önceki
  // ay'ın (previous) karşılaştırmasına dinamik olarak geçer. Kullanıcı
  // istediği herhangi consecutive pair'ı "hover ederek" görebiliyor.
  const [hoveredIdx, setHoveredIdx] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const now = new Date();
    const buckets = [];
    // 12 ay fetch — leading zero ay'lar trim'lenir (adaptive). Zengin user
    // 12 bar görür, sparse user (3-4 ay) sadece veri olduğu kadar görür.
    // Container max-width bar sayısına göre uyarlanır (aşağıda).
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      buckets.push({ month: d.getMonth() + 1, year: d.getFullYear(), date: d });
    }

    Promise.all(buckets.map(b =>
      transactionApi.getSummary(b.month, b.year)
        .then(res => ({ ...b, total: Number(res.data?.totalExpense ?? 0) }))
        .catch(() => ({ ...b, total: 0 }))
    )).then(results => {
      if (cancelled) return;
      // İlk veri olan aydan başla — baştaki sıfır ayları gizle, sondaki
      // güncel ay'ı (boş olsa bile) bağlam olsun diye tut. Veri sparse olan
      // user'larda (örn. sadece son 3-4 ay) 6 X-pozisyonda 2-3 boş slot
      // kalırdı → chart daha dağınık görünürdü. Trim adaptive: data olduğu
      // kadar bar var, hiç dağınıklık yok.
      const firstIdx = results.findIndex(r => r.total > 0);
      const trimmed = firstIdx >= 0 ? results.slice(firstIdx) : results;
      setMonthlyTotals(trimmed);
    });

    return () => { cancelled = true; };
  }, []);

  // Hangi pair gösteriliyor — default vs hover-driven.
  // Default: backend'in seçtiği pair (midpoint-aware). Hover: o bar ile bir
  // önceki ay'ın anlık oranı. monthlyTotals değerleri bar grafiğinden geliyor,
  // dolayısıyla "what you see is what you get": hover karşılaştırması bar
  // yüksekliklerinden direkt türetiliyor → görsel sezgiyle %100 tutarlı.
  const todayKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const display = useMemo(() => {
    // Hover yok → default (backend ratio + months). Partial tag burada da
    // gerekli; backend spending_trend_months sadece "recent/previous"
    // string'i veriyor, partial flag'i UI tarafında todayKey kıyasıyla
    // türetiyoruz — hover state'iyle tutarlı.
    if (hoveredIdx === null || !monthlyTotals) {
      return {
        ratio,
        months,
        partial: months?.recent === todayKey,
        isFirstBar: false,
      };
    }
    const recent = monthlyTotals[hoveredIdx];
    if (!recent) return { ratio, months, isFirstBar: false };
    // İlk bar (no prior month in fetched window) → karşılaştırma yok
    if (hoveredIdx === 0) return { isFirstBar: true, recent };
    const previous = monthlyTotals[hoveredIdx - 1];
    if (!previous || previous.total === 0 || recent.total === 0) {
      return { isFirstBar: true, recent };
    }
    const hoveredRatio = recent.total / previous.total;
    const recentKey = `${recent.year}-${String(recent.month).padStart(2, '0')}`;
    const prevKey   = `${previous.year}-${String(previous.month).padStart(2, '0')}`;
    return {
      ratio:   hoveredRatio,
      months:  { recent: recentKey, previous: prevKey },
      partial: recentKey === todayKey,
      isFirstBar: false,
    };
  }, [hoveredIdx, monthlyTotals, ratio, months, todayKey]);

  // Headline numerik değer + renk — FactorRow/statusOf'la AYNI asymmetric mantık
  // (FACTOR_RULES.spending_trend eşikleri). Aşağı yön asla red olmaz; ±10%
  // üstü turuncu, sadece +30% üstü kırmızı. Eskiden symmetric `abs > 30 → red`
  // vardı, Jun-vs-May (-98%) sahnesi gibi partial-month tetiklerinde
  // tutarsız kırmızı veriyordu.
  const deltaPct = display.isFirstBar ? 0 : ((display.ratio ?? 1) - 1) * 100;
  const abs      = Math.abs(deltaPct);
  const isUp     = deltaPct > 0;
  const isStable = abs <= 5;
  const _r2      = FACTOR_RULES.spending_trend;
  const color    = display.isFirstBar               ? '#94A3B8'
                 : isStable                          ? '#27AE60'
                 : isUp && deltaPct > _r2.badAt      ? '#E74C3C'
                 : abs > _r2.warningAt               ? '#F39C12'
                 : '#27AE60';

  if (!monthlyTotals) {
    return (
      <Card title={meta.title} subtitle="Loading monthly totals…">
        <div style={{ height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#94A3B8' }}>
          Fetching last 6 months…
        </div>
      </Card>
    );
  }

  if (monthlyTotals.length === 0) {
    return (
      <Card title={meta.title} subtitle="No monthly data yet">
        <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '40px 0' }}>
          Add expenses across at least one month to see the trend.
        </div>
      </Card>
    );
  }

  // Per-month % delta vs previous month — chart'ın ana metric'i.
  // İlk ay'da null (no prior to compare). Aşırı değerler (± DELTA_CAP üstü)
  // chart skalasını bozar; CategoryBenchmark'taki sabit-skala mantığıyla
  // aynı: bar cap'te clip'lenir, ama gerçek değer overshoot label'da text
  // olarak gösterilir → bilgi kaybolmaz, görsel oran korunur.
  const DELTA_CAP = 100;
  const deltas = monthlyTotals.map((m, i) => {
    if (i === 0) return null;
    const prev = monthlyTotals[i - 1].total;
    if (prev === 0 || m.total === 0) return null;
    return ((m.total / prev) - 1) * 100;
  });
  const cappedDeltas = deltas.map(d => d === null ? null : Math.max(-DELTA_CAP, Math.min(DELTA_CAP, d)));

  // Bar rengi — FactorRow/statusOf ile aynı asymmetric mantık.
  // Stable→nötr gri, |pct|>warningAt→turuncu, sadece +pct>badAt→kırmızı.
  // Aşağı yön asla kırmızı olmaz (down ≠ danger).
  const r2 = FACTOR_RULES.spending_trend;
  const barColorFor = (d) => {
    if (d === null) return '#CBD5E1';
    const abs = Math.abs(d);
    const isUp = d > 0;
    if (abs <= 5)                     return '#94A3B8';   // stable (~0)
    if (isUp && d > r2.badAt)         return '#E74C3C';   // up bad
    if (abs > r2.warningAt)           return '#F39C12';   // warning (both directions)
    return '#27AE60';                                      // healthy small change
  };

  const chartData = {
    labels: monthlyTotals.map(m => parseAsUtc(m.date).format('MMM')),
    datasets: [{
      label: '% vs prior month',
      data: cappedDeltas,
      // Hover varsa diğerleri ~30% opacity'e düşer → hangi bar'ın aktif
      // olduğu vurgulanır. Default state'te tüm bar'lar tam renkli.
      backgroundColor: deltas.map((d, i) => {
        if (d === null) return 'transparent';
        const base = barColorFor(d);
        if (hoveredIdx !== null && i !== hoveredIdx) return base + '4D'; // ~30% alpha
        return base;
      }),
      borderRadius: 4,
      // Bar genişliği — 4 ay × geniş chart slot'unda bar'lar fazla şişman
      // görünüyordu. categoryPercentage düşürerek bar-arası boşluk daha
      // dengeli; maxBarThickness 40 ile cap.
      maxBarThickness: 40,
      categoryPercentage: 0.6,
      barPercentage: 0.9,
    }],
  };

  // Overshoot label plugin — DELTA_CAP'ı aşan bar'lar için bar'ın üstüne
  // gerçek değeri yazar ("+169%"). Cap görsel oranı korur ama bilgi
  // kaybolmaz.
  const overshootLabelPlugin = {
    id: 'overshootLabel',
    afterDatasetsDraw(chart) {
      const { ctx, scales } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta?.data || !scales.y) return;
      ctx.save();
      ctx.font = '700 10.5px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      meta.data.forEach((bar, i) => {
        const real = deltas[i];
        if (real === null || Math.abs(real) <= DELTA_CAP) return;
        const label = `${real >= 0 ? '+' : ''}${real.toFixed(0)}%`;
        const x = bar.x;
        const y = real > 0
          ? scales.y.getPixelForValue(DELTA_CAP) - 8
          : scales.y.getPixelForValue(-DELTA_CAP) + 8;
        ctx.fillStyle = barColorFor(real);
        ctx.fillText(label, x, y);
      });
      ctx.restore();
    },
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    onHover: (event, elements) => {
      if (event?.native?.target) {
        event.native.target.style.cursor = elements.length > 0 ? 'pointer' : 'default';
      }
      const next = elements.length > 0 ? elements[0].index : null;
      setHoveredIdx(prev => (prev === next ? prev : next));
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          title: (items) => {
            const i = items[0].dataIndex;
            const m = monthlyTotals[i];
            const p = i > 0 ? monthlyTotals[i - 1] : null;
            if (!p) return parseAsUtc(m.date).format('MMM YYYY');
            return `${parseAsUtc(m.date).format('MMM')} vs ${parseAsUtc(p.date).format('MMM')}`;
          },
          label: (ctx) => {
            const i = ctx.dataIndex;
            const real = deltas[i];
            if (real === null) return ' No prior month for comparison';
            const m = monthlyTotals[i];
            const p = monthlyTotals[i - 1];
            const dTxt = `${real >= 0 ? '+' : ''}${real.toFixed(0)}%`;
            return ` ${dTxt} · ${m.total.toLocaleString('tr-TR')} TRY vs ${p.total.toLocaleString('tr-TR')} TRY`;
          },
        },
      },
    },
    scales: {
      y: {
        min: -DELTA_CAP, max: DELTA_CAP,
        // 0 reference line bolder, diğer grid'ler subtle. Pozitif/negatif
        // ayrımı net görünsün — chart'ın temel mesajı zaten "yukarı/aşağı".
        grid: {
          color: (ctx) => ctx.tick.value === 0 ? '#475569' : '#F3F4F6',
          lineWidth: (ctx) => ctx.tick.value === 0 ? 1.5 : 1,
        },
        ticks: {
          font: { size: 10 },
          color: '#94A3B8',
          stepSize: 50,
          callback: v => `${v > 0 ? '+' : ''}${v}%`,
        },
      },
      x: {
        grid: { display: false },
        ticks: { font: { size: 12, weight: '600' }, color: '#0F172A' },
      },
    },
  };

  return (
    <Card title={meta.title} subtitle={`Last ${monthlyTotals.length} months · month-over-month % change`}>
      {/* Headline delta — hover bar'a göre dinamik. Default: backend pair. */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 8, paddingBottom: 12, minHeight: 44 }}>
        {display.isFirstBar ? (
          // İlk bar (no prior month) — sayısal karşılaştırma yok, sadece ay adı
          <span style={{ fontSize: 13, color: '#94A3B8', fontWeight: 500 }}>
            {parseAsUtc(display.recent.date).format('MMM YYYY')} — no prior month for comparison
          </span>
        ) : (
          <>
            <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, color }}>
              {!isStable && (isUp ? <FiArrowUp style={{ fontSize: 18, alignSelf: 'center' }} />
                                  : <FiArrowDown style={{ fontSize: 18, alignSelf: 'center' }} />)}
              <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1, letterSpacing: '-1px', fontVariantNumeric: 'tabular-nums' }}>
                {isStable ? '~0' : `${isUp ? '+' : ''}${deltaPct.toFixed(0)}`}
              </span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>%</span>
            </div>
            <span style={{ fontSize: 12, color: '#64748B', fontWeight: 500 }}>
              {(() => {
                const m = display.months;
                const monthsLabel = m ? formatTwoMonthLabel(m.recent, m.previous) : null;
                const suffix = monthsLabel || 'vs prior month';
                const partialTag = display.partial ? ' (partial)' : '';
                const prefix = isStable ? 'Stable' : isUp ? 'Up' : 'Down';
                return `${prefix} — ${suffix}${partialTag}`;
              })()}
            </span>
          </>
        )}
      </div>

      {/* Bar chart — diverging % delta. Container width adaptive:
          ~95px/bar, parent card genişliğiyle veya 700px ile cap'lenir.
          4 bar → 380px (kareye yakın), 12 bar → 700px (daha yatay ama
          fazla bar için zaten gerekli horizontal mass). Sparse data'da
          chart shrink eder, "yana yayılmış" hissini engeller. */}
      <div style={{
        position: 'relative',
        width: '100%',
        maxWidth: `${Math.min(95 * monthlyTotals.length, 700)}px`,
        margin: '0 auto',
        aspectRatio: '5 / 4',
        maxHeight: 320,
        minHeight: 240,
      }}>
        <Bar data={chartData} options={chartOptions} plugins={[overshootLabelPlugin]} />
      </div>

      {hint && (
        <div style={{ fontSize: 11, color: '#475569', padding: '8px 12px', marginTop: 12, background: '#F8FAFC', borderRadius: 7, borderLeft: `3px solid ${color}` }}>
          {hint}
        </div>
      )}
    </Card>
  );
}

function FactorDrillDownCard({
  selectedKey,
  history,
  flaggedCount,
  totalTxCount,
  factors,
  anomalyRate,
  onGoToAnomalies,
  expenseTxs,
}) {
  const meta = FACTOR_META[selectedKey];
  const hint = factorHint(selectedKey, factors, anomalyRate);

  if (!meta) return null;

  if (meta.isStatic) {
    const pct = Number(anomalyRate ?? 0);
    const color = pct >= 30 ? '#E74C3C' : pct >= 10 ? '#F39C12' : '#27AE60';
    return (
      <Card title={meta.title} subtitle="Flagged vs total recent transactions">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '20px 0 24px' }}>
          <div style={{
            width: 120, height: 120, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: `conic-gradient(${color} 0% ${pct}%, #F1F5F9 ${pct}% 100%)`,
            flexShrink: 0,
          }}>
            <div style={{ width: 94, height: 94, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
              <span style={{ fontSize: 24, fontWeight: 800, color, lineHeight: 1 }}>{pct.toFixed(0)}%</span>
              <span style={{ fontSize: 10, color: '#94A3B8', marginTop: 3 }}>flagged</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', maxWidth: 260 }}>
            <div style={{ fontSize: 14, color: '#0F172A', fontWeight: 700, marginBottom: 4 }}>
              {flaggedCount} of {totalTxCount} recent transactions
            </div>
            <div style={{ fontSize: 11.5, color: '#475569', marginBottom: 12, lineHeight: 1.5 }}>
              Computed from your last 30 days of activity.
            </div>
            <button
              onClick={onGoToAnomalies}
              style={{
                fontSize: 12, fontWeight: 600, color: '#fff',
                background: '#1B4F72', border: 'none', borderRadius: 7,
                padding: '7px 14px', cursor: 'pointer',
              }}
            >
              Review anomalies →
            </button>
          </div>
        </div>
        {hint && (
          <div style={{ fontSize: 11, color: '#475569', padding: '8px 12px', background: '#F8FAFC', borderRadius: 7, borderLeft: `3px solid ${color}` }}>
            {hint}
          </div>
        )}
      </Card>
    );
  }

  // Spending Trend → monthly bar chart (son 6 ayın toplam expense'i).
  // Time-series mantıklı değildi (her risk score anlık snapshot ratio),
  // aylık bar chart hem mevcut karşılaştırmayı hem geçmişi gösteriyor.
  if (selectedKey === 'spending_trend') {
    return <SpendingTrendMonthlyCard
      ratio={Number(factors?.spending_trend ?? 1)}
      months={factors?.spending_trend_months}
      hint={hint}
      meta={meta}
    />;
  }

  // Line chart için son N işlemi al (history kronolojik desc geliyor; reverse).
  // Income-triggered risk score'ları ele — History chart ile tutarlı temiz görünüm
  const recent = [...history].reverse().filter(h => h?.factors?.triggered_by !== 'Income').slice(-30);

  if (recent.length === 0) {
    return (
      <Card title={meta.title} subtitle="Not enough data yet">
        <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>
          Risk history accumulates as transactions are analyzed.
        </div>
      </Card>
    );
  }

  const rule  = FACTOR_RULES[selectedKey];
  const step  = rule.chartStep;
  const series = recent.map(meta.extract);
  const chartData = {
    labels: recent.map((_, i) => `#${i + 1}`),
    datasets: [{
      label: meta.yLabel,
      data: series,
      borderColor: meta.color,
      backgroundColor: `${meta.color}1A`,
      borderWidth: 2,
      tension: 0.32,
      pointRadius: 3,
      pointHoverRadius: 5,
      pointBackgroundColor: meta.color,
      pointBorderColor: '#fff',
      pointBorderWidth: 1.5,
      fill: true,
    }],
  };

  // Y range: step katlarına yuvarla → axis tick'leri her zaman düzgün.
  const minV = Math.min(...series);
  const maxV = Math.max(...series);
  const lowerFloor = rule.signed ? -rule.chartBandTop : 0;
  const upperFloor = rule.chartBandTop * 1.2;
  const yMin = Math.floor(Math.min(minV, lowerFloor) / step) * step;
  const yMax = Math.ceil(Math.max(maxV, upperFloor) / step + 0.2) * step;

  // recent[i] ↔ expenseTxs[offset+i] — tooltip'te tx tarihi göstermek için.
  const txDateAt = (i) => {
    if (!expenseTxs || expenseTxs.length === 0) return null;
    const offset = Math.max(0, expenseTxs.length - recent.length);
    const tx = expenseTxs[offset + i];
    return tx ? (tx.transactionDate || tx.TransactionDate || null) : null;
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          // Tooltip başlığı: gerçek transaction tarihi (tx data varsa).
          // Fallback: calculatedAt, sonra "Transaction #X".
          title: (items) => {
            const txDate = txDateAt(items[0].dataIndex);
            if (txDate) return parseAsUtc(txDate).format('DD MMM YYYY');
            const p = recent[items[0].dataIndex];
            if (p?.calculatedAt) return parseAsUtc(p.calculatedAt).format('DD MMM YYYY · HH:mm');
            return `Transaction ${items[0].label}`;
          },
          label: (ctx) => ` ${ctx.parsed.y.toFixed(1)}${meta.ySuffix}`,
          afterLabel: (ctx) => {
            const p = recent[ctx.dataIndex];
            const lines = [];
            if (p?.level) lines.push(`Risk level: ${p.level}`);
            if (p?.calculatedAt) lines.push(`Scored: ${parseAsUtc(p.calculatedAt).format('HH:mm DD.MM')}`);
            return lines;
          },
        },
      },
    },
    scales: {
      y: {
        min: yMin, max: yMax,
        grid: { color: '#F3F4F6' },
        ticks: {
          font: { size: 10 }, color: '#94A3B8',
          stepSize: step,
          callback: (v) => `${v}${meta.ySuffix}`,
        },
      },
      x: {
        title: {
          display: true,
          text: 'Each new transaction →',
          color: '#94A3B8',
          font: { size: 10, weight: '500' },
          padding: { top: 6 },
        },
        grid: { display: false },
        ticks: { font: { size: 10 }, color: '#94A3B8', maxTicksLimit: 8 },
      },
    },
  };

  // Healthy zone band — green tint between rule.chartBandTop and 0 (or -bandTop for signed).
  const healthyBandPlugin = {
    id: 'healthyBand',
    beforeDatasetsDraw(chart) {
      const { ctx, chartArea, scales } = chart;
      if (!chartArea || !scales.y) return;
      const yScale = scales.y;
      const yTop = yScale.getPixelForValue(rule.chartBandTop);
      const yBot = rule.signed
        ? yScale.getPixelForValue(-rule.chartBandTop)
        : yScale.getPixelForValue(0);
      ctx.save();
      ctx.fillStyle = 'rgba(39,174,96,0.06)';
      ctx.fillRect(chartArea.left, yTop, chartArea.right - chartArea.left, yBot - yTop);
      ctx.restore();
    },
  };

  return (
    <Card title={meta.title} subtitle={`Last ${recent.length} transactions · green band = healthy zone`}>
      {/* aspectRatio ile chart geniş ekranda taşmaz, fakat çok dar değildir */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '16 / 7', maxHeight: 260, minHeight: 180 }}>
        <Line data={chartData} options={options} plugins={[healthyBandPlugin]} />
      </div>
      {hint && (
        <div style={{ fontSize: 11, color: '#475569', padding: '8px 12px', marginTop: 12, background: '#F8FAFC', borderRadius: 7, borderLeft: `3px solid ${meta.color}` }}>
          {hint}
        </div>
      )}
    </Card>
  );
}

// ─── CATEGORY BENCHMARKS ──────────────────────────────────────────────────────
// List-based comparison: her satır bir kategori, kullanıcı %, baseline tick'li bar,
// status delta. Yarım kart genişliğinde rahat okunur.
function BenchmarkRow({ b, isLast }) {
  const isOver = !b.healthy;
  const delta  = b.rawPercent - b.baselinePercent;
  const deltaTxt = `${delta >= 0 ? '+' : ''}${delta.toFixed(0)}%`;

  // Sabit global skala (BENCHMARK_BAR_SCALE) — bkz. tanım yorumu.
  // Tüm satırlar aynı eksende, baseline tick'leri kategoriye göre konumlanır
  // ama satırlar arası görsel karşılaştırma mümkün.
  const userBarPct      = Math.min((b.userPercent / BENCHMARK_BAR_SCALE) * 100, 100);
  const baselineTickPos = Math.min((b.baselinePercent / BENCHMARK_BAR_SCALE) * 100, 100);
  const userFill = isOver ? '#E74C3C' : '#2E86C1';

  return (
    <div style={{ paddingBottom: isLast ? 0 : 12, marginBottom: isLast ? 0 : 12, borderBottom: isLast ? 'none' : '1px solid #F1F5F9' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>{b.category}</span>
        {isOver ? (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#E74C3C', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <FiArrowUp size={11} />{deltaTxt}
          </span>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 700, color: '#27AE60', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <FiCheckCircle size={11} />Healthy
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: userFill, fontVariantNumeric: 'tabular-nums', minWidth: 40 }}>
          {b.userPercent.toFixed(0)}%
        </span>

        <div style={{ flex: 1, position: 'relative', height: 8, background: '#F1F5F9', borderRadius: 4 }}>
          <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${userBarPct}%`, background: userFill, borderRadius: 4, transition: 'width 600ms cubic-bezier(.4,0,.2,1)' }} />
          {/* baseline tick */}
          <div
            style={{
              position: 'absolute',
              left: `${baselineTickPos}%`,
              top: -3, bottom: -3,
              width: 2,
              background: '#475569',
              borderRadius: 1,
              transform: 'translateX(-1px)',
            }}
            title={`Baseline ${b.baselinePercent}%`}
          />
        </div>

        <span style={{ fontSize: 11, color: '#94A3B8', minWidth: 50, textAlign: 'right', whiteSpace: 'nowrap' }}>
          vs {b.baselinePercent}%
        </span>
      </div>
    </div>
  );
}

function CategoryBenchmarkCard({ benchmarks }) {
  if (!benchmarks || benchmarks.length === 0) {
    return (
      <Card title="Category Benchmarks" subtitle="Your spending vs healthy baselines">
        <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>
          Not enough income/expense data this month to compute benchmarks.
        </div>
      </Card>
    );
  }

  // Pagination — sayfa başına 5 kategori. Toplam genelde 8-10 olduğundan
  // 2 sayfa yeterli. Chevron buttons + "X/Y" page indicator alt sağda.
  return <CategoryBenchmarkCardPaginated benchmarks={benchmarks} />;
}

function CategoryBenchmarkCardPaginated({ benchmarks }) {
  const PER_PAGE = 5;
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(benchmarks.length / PER_PAGE));
  const start   = page * PER_PAGE;
  const visible = benchmarks.slice(start, start + PER_PAGE);

  return (
    <Card
      title="Category Benchmarks"
      subtitle="Last 4 months avg — % of income vs Turkish household baselines"
    >
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {visible.map((b, i) => (
          <BenchmarkRow key={b.category} b={b} isLast={i === visible.length - 1} />
        ))}
      </div>

      {/* Bottom: legend (sol) + pagination (sağ) tek satırda */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginTop: 14, paddingTop: 10, borderTop: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 10, color: '#94A3B8' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 8, height: 2, background: '#475569', display: 'inline-block' }} />
            Baseline
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 6, background: '#2E86C1', borderRadius: 2, display: 'inline-block' }} />
            Your spend
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 10, height: 6, background: '#E74C3C', borderRadius: 2, display: 'inline-block' }} />
            Over baseline
          </span>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              aria-label="Previous page"
              style={{
                width: 24, height: 24, padding: 0, border: '1px solid #E2E8F0',
                background: page === 0 ? '#F8FAFC' : '#fff',
                borderRadius: 6, cursor: page === 0 ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: page === 0 ? '#CBD5E1' : '#475569',
              }}
            >
              <FiChevronLeft size={14} />
            </button>
            <span style={{ fontSize: 11, color: '#64748B', fontWeight: 600, fontVariantNumeric: 'tabular-nums', minWidth: 28, textAlign: 'center' }}>
              {page + 1}/{totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              disabled={page === totalPages - 1}
              aria-label="Next page"
              style={{
                width: 24, height: 24, padding: 0, border: '1px solid #E2E8F0',
                background: page === totalPages - 1 ? '#F8FAFC' : '#fff',
                borderRadius: 6, cursor: page === totalPages - 1 ? 'not-allowed' : 'pointer',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                color: page === totalPages - 1 ? '#CBD5E1' : '#475569',
              }}
            >
              <FiChevronRight size={14} />
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}

// ─── SMART RECOMMENDATIONS ────────────────────────────────────────────────────
// Faktör-bazlı, deterministic kural ile üretilen actionable tip kartı.
// Score breakdown veri gösterir; recommendations "ne yapmalıyım" sorusuna cevap verir.
function buildRecommendations({ factors, anomalyRate, benchmarks }) {
  const dr = Number(factors?.debt_ratio     ?? 0);
  const st = Number(factors?.spending_trend ?? 1);
  const ar = Number(anomalyRate ?? 0);
  const recs = [];

  // 1) Debt ratio
  if (dr >= 1.5) recs.push({
    severity: 'critical', key: 'debt',
    title: 'Expenses far exceed income',
    body: `You're spending ${((dr - 1) * 100).toFixed(0)}% over your income. Cut discretionary spending immediately to avoid debt accumulation.`,
    cta: 'Review transactions', route: '/transactions',
  });
  else if (dr >= 1.0) recs.push({
    severity: 'critical', key: 'debt',
    title: 'Expenses exceed income',
    body: `You spent ${(dr * 100).toFixed(0)}% of your income this period. The fastest score recovery is bringing expenses below income.`,
    cta: 'See spending breakdown', route: '/transactions',
  });
  else if (dr >= 0.8) recs.push({
    severity: 'warning', key: 'debt',
    title: 'Tight margin',
    body: `${(dr * 100).toFixed(0)}% of income spent — limited buffer for unexpected costs. Build a small reserve to absorb shocks.`,
  });

  // 2) Spending trend
  if (st >= 1.3) recs.push({
    severity: 'critical', key: 'trend',
    title: 'Sudden spending spike',
    body: `Spending up ${((st - 1) * 100).toFixed(0)}% vs the previous period. Investigate the cause before it becomes a pattern.`,
  });
  else if (st >= 1.1) recs.push({
    severity: 'warning', key: 'trend',
    title: 'Upward spending trend',
    body: `Spending up ${((st - 1) * 100).toFixed(0)}% vs the previous period. Small corrections now beat a bigger one later.`,
  });

  // 3) Anomaly rate
  if (ar >= 30) recs.push({
    severity: 'critical', key: 'anom',
    title: 'High anomaly rate',
    body: `${ar.toFixed(0)}% of recent transactions were flagged by the ML pipeline. Confirm they were intentional.`,
    cta: 'Review anomalies', route: '/anomalies',
  });
  else if (ar >= 10) recs.push({
    severity: 'warning', key: 'anom',
    title: 'Some flagged transactions',
    body: `${ar.toFixed(0)}% of recent transactions stood out. Quick review can clear false positives.`,
    cta: 'Review anomalies', route: '/anomalies',
  });

  // 4) Worst benchmark overshoot
  const overshoot = Array.isArray(benchmarks)
    ? benchmarks
        .filter((b) => !b.healthy)
        .map((b) => ({ ...b, gap: b.rawPercent - b.baselinePercent }))
        .sort((a, b) => b.gap - a.gap)[0]
    : null;
  if (overshoot) recs.push({
    severity: 'warning', key: `bench-${overshoot.category}`,
    title: `${overshoot.category} spend is high`,
    body: `${overshoot.rawPercent.toFixed(0)}% of income vs ${overshoot.baselinePercent}% baseline. Reducing here is the fastest way to improve your score.`,
  });

  const sevOrder = { critical: 0, warning: 1, info: 2, positive: 3 };
  recs.sort((a, b) => sevOrder[a.severity] - sevOrder[b.severity]);

  // 5) Positive notes (sadece kritik/warning yoksa eklenir)
  if (recs.length === 0) {
    if (dr > 0 && dr < 0.8) recs.push({
      severity: 'positive', key: 'pos-debt',
      title: 'Healthy spend-to-income',
      body: `Only ${(dr * 100).toFixed(0)}% of income spent — strong savings buffer.`,
    });
    if (ar < 5) recs.push({
      severity: 'positive', key: 'pos-anom',
      title: 'Spending pattern is consistent',
      body: 'No anomalies in recent activity.',
    });
    if (Math.abs((st - 1) * 100) <= 5) recs.push({
      severity: 'positive', key: 'pos-trend',
      title: 'Stable spending',
      body: 'Spending is within 5% of the previous period — predictable behavior.',
    });
  }

  return recs.slice(0, 4);
}

const SEV_STYLE = {
  critical: { dot: '#E74C3C', label: 'Critical' },
  warning:  { dot: '#F39C12', label: 'Warning'  },
  info:     { dot: '#2E86C1', label: 'Info'     },
  positive: { dot: '#27AE60', label: 'Healthy'  },
};

function RecommendationRow({ rec, isLast, onAction }) {
  const palette = SEV_STYLE[rec.severity] || SEV_STYLE.info;

  return (
    <div style={{ paddingBottom: isLast ? 0 : 14, marginBottom: isLast ? 0 : 14, borderBottom: isLast ? 'none' : '1px solid #F1F5F9' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: palette.dot, marginTop: 5, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#0F172A', marginBottom: 4 }}>{rec.title}</div>
          <div style={{ fontSize: 12, color: '#475569', lineHeight: 1.55 }}>{rec.body}</div>
          {rec.cta && rec.route && (
            <button
              onClick={() => onAction(rec.route)}
              style={{
                marginTop: 8,
                display: 'inline-flex', alignItems: 'center', gap: 5,
                fontSize: 12, fontWeight: 600, color: palette.dot,
                background: 'none', border: 'none', cursor: 'pointer', padding: 0,
              }}
            >
              {rec.cta} <FiArrowUp size={11} style={{ transform: 'rotate(45deg)' }} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function RecommendationsCard({ factors, anomalyRate, benchmarks }) {
  const navigate = useNavigate();
  const recs = useMemo(
    () => buildRecommendations({ factors, anomalyRate, benchmarks }),
    [factors, anomalyRate, benchmarks]
  );

  if (recs.length === 0) {
    return (
      <Card title="Smart Recommendations" subtitle="Based on your current risk factors">
        <div style={{ fontSize: 12, color: '#94A3B8', textAlign: 'center', padding: '20px 0' }}>
          Not enough data yet to generate recommendations.
        </div>
      </Card>
    );
  }

  return (
    <Card title="Smart Recommendations" subtitle="Based on your current risk factors">
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {recs.map((r, i) => (
          <RecommendationRow
            key={r.key}
            rec={r}
            isLast={i === recs.length - 1}
            onAction={navigate}
          />
        ))}
      </div>
    </Card>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function RiskDetail() {
  const navigate = useNavigate();

  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [current,       setCurrent]       = useState(null);
  const [history,       setHistory]       = useState([]);
  const [benchmarks,    setBenchmarks]    = useState([]);
  const [flaggedCount,  setFlaggedCount]  = useState(0);
  const [expenseTxs,    setExpenseTxs]    = useState([]);
  const [selectedFactor, setSelectedFactor] = useState('debt_ratio');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const now = new Date();

    // Category Benchmarks için son 4 ay'ın summary'lerini paralel çek →
    // aylık dalgalanmayı yumuşatmak için 4-ay ortalaması kullan. Tek ay
    // çok gürültülü (bir ay yüksek grocery sonra normalleşir, tutarsız sinyal).
    const monthsToFetch = [];
    for (let i = 0; i < 4; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      monthsToFetch.push({ month: d.getMonth() + 1, year: d.getFullYear() });
    }

    Promise.all([
      mlApi.getCurrentRisk(),
      mlApi.getRiskHistory(6),
      mlApi.getAnomalies({ page: 1, pageSize: 1 }),
      transactionApi.getAll({ type: 'Expense', page: 1, pageSize: 100 }),
      ...monthsToFetch.map(m => transactionApi.getSummary(m.month, m.year)),
    ])
      .then(([currentRes, historyRes, anomaliesRes, txRes, ...summaryResponses]) => {
        const summaryRes = summaryResponses[0]; // current month — geri uyumluluk için
        // 4-ay aggregate
        let aggregatedCategoryMap = {};
        let aggregatedIncome      = 0;
        let monthsWithData        = 0;
        summaryResponses.forEach(res => {
          const s        = res.data || {};
          const income   = Number(s.totalIncome || 0);
          const cats     = s.categoryBreakdown || [];
          if (income > 0 || cats.length > 0) {
            aggregatedIncome += income;
            monthsWithData++;
            cats.forEach(c => {
              const key = c.categoryName;
              const amt = Number(c.totalAmount ?? c.amount ?? 0);
              if (!aggregatedCategoryMap[key]) {
                aggregatedCategoryMap[key] = { categoryName: key, totalAmount: 0 };
              }
              aggregatedCategoryMap[key].totalAmount += amt;
            });
          }
        });
        // sum/sum oranı = aylık ortalama oran ile aynı sonuç (income roughly constant)
        const aggregatedBreakdown = Object.values(aggregatedCategoryMap);
        if (cancelled) return;
        const cur = currentRes.data || null;
        if (cur?.calculatedAt && typeof cur.calculatedAt === 'object')
          cur.calculatedAt = cur.calculatedAt.toString();
        setCurrent(cur);
        // history backend desc geliyor; transaction-axis için reverse'lemiyoruz burada,
        // her child componente kendi sıralamasını yapması için ham veri veriyoruz.
        setHistory(Array.isArray(historyRes.data) ? historyRes.data : []);
        // 4-ay ortalama benchmark (aggregated above). monthsWithData = 0
        // ise mevcut ay summary'sine düş (fallback).
        if (monthsWithData > 0) {
          setBenchmarks(buildBenchmarks(aggregatedBreakdown, aggregatedIncome));
        } else {
          const fallback = summaryRes.data || {};
          setBenchmarks(buildBenchmarks(
            fallback.categoryBreakdown || [],
            Number(fallback.totalIncome || 0)
          ));
        }
        // anomalies.totalCount = Ensemble flag almış tüm tx sayısı.
        setFlaggedCount(Number(anomaliesRes.data?.totalCount ?? 0));
        // Expense tx'leri tarih sıralı (asc), risk score'larla 1:1 eşleşir.
        const txItems = Array.isArray(txRes.data?.items) ? txRes.data.items
                       : Array.isArray(txRes.data) ? txRes.data
                       : [];
        const expensesAsc = txItems
          .filter(t => t.type === 'Expense' || t.Type === 'Expense')
          .sort((a, b) => new Date(a.transactionDate || a.TransactionDate)
                        - new Date(b.transactionDate || b.TransactionDate));
        setExpenseTxs(expensesAsc);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(extractErrorMessage(err) || 'Failed to load risk data.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  // history desc geliyor; "previous" = bir önceki kronolojik kayıt = history[1].
  const previous = useMemo(() => history.length < 2 ? null : history[1], [history]);

  // Anomaly rate: flagged / total recent tx (history.length tx başına 1 risk score).
  const anomalyRate = useMemo(() => {
    if (!history.length) return 0;
    return Math.min((flaggedCount / history.length) * 100, 100);
  }, [flaggedCount, history.length]);

  const factorRows = useMemo(
    () => current ? buildFactorRows(current.factors, anomalyRate) : [],
    [current, anomalyRate]
  );

  // Override chip için reasons
  const overrideReasons = current?.factors?.override_reasons || [];

  // ── Render ────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0 }}>Risk Score</h1>
        <p  style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>Detailed analysis of your financial risk profile</p>
      </div>
      <Loading />
    </div>
  );

  if (error) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0 }}>Risk Score</h1>
      <EmptyState icon={<FiInfo size={22} />} title={error} />
    </div>
  );

  if (!current) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0 }}>Risk Score</h1>
      <EmptyState icon={<FiInfo size={22} />} title="No risk score yet" description="Add transactions to trigger ML analysis." />
    </div>
  );

  const currentSnapshot = {
    score:       Number(current.score || 0),
    level:       current.level || pickRiskLevel(Number(current.score || 0)),
    calculatedAt: current.calculatedAt,
    factors:     current.factors,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-.4px' }}>Risk Score</h1>
          <p  style={{ fontSize: 12, color: '#94A3B8', margin: '3px 0 0' }}>Detailed analysis of your financial risk profile</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#94A3B8' }}>
          <FiTrendingUp style={{ fontSize: 12 }} />
          Calculated by AFRATS ML pipeline
        </div>
      </div>

      {/* Overview: gauge + stats stacked + history (kalan alan) + override (alt) */}
      <RiskOverviewCard
        current={currentSnapshot}
        previous={previous}
        overrideReasons={overrideReasons}
        history={history}
        expenseTxs={expenseTxs}
      />

      {/* Factor breakdown + Drill-down — side by side */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <FactorBreakdownCard
          factors={factorRows}
          selectedKey={selectedFactor}
          onSelect={setSelectedFactor}
        />
        <FactorDrillDownCard
          selectedKey={selectedFactor}
          history={history}
          flaggedCount={flaggedCount}
          totalTxCount={history.length}
          factors={current.factors}
          anomalyRate={anomalyRate}
          onGoToAnomalies={() => navigate('/anomalies')}
          expenseTxs={expenseTxs}
        />
      </div>

      {/* Bottom: Category benchmarks (full width — Smart Recommendations kaldırıldı) */}
      <CategoryBenchmarkCard benchmarks={benchmarks} />
    </div>
  );
}
