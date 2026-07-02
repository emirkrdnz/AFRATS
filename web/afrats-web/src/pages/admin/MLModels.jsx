// src/pages/admin/MLModels.jsx
//
// Sprint AA → AB6 redesign.
// İçerik aynı: anomaly + risk model performance + ensemble composition.
// Görsel iyileştirme: ensemble bar listesi yerine donut chart + algoritma
// tipine göre renk kodlaması; risk levels 3-kutu yerine 0-100 spektrum bar;
// business rules açıklamalı küçük font.

import { useEffect, useMemo, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { FiAlertTriangle, FiCpu } from 'react-icons/fi';

import adminApi from '../../api/adminApi';
import { extractErrorMessage } from '../../api/errorHelper';
import Card from '../../components/Card';
import Skeleton from '../../components/Skeleton';

ChartJS.register(ArcElement, Tooltip, Legend);

// ──────────────────────────────────────────────────────────────────────────
// Algoritma tipine göre renk haritası — donut diliminin rengi + legend badge.
// Backend `type` string'i çok değişken olabildiği için keyword bazlı eşle.
// ──────────────────────────────────────────────────────────────────────────

const TYPE_PALETTE = {
  statistical: { color: '#2E86C1', label: 'Statistical' },     // secondary blue
  tree:        { color: '#27AE60', label: 'Tree-based' },      // income green
  boosting:    { color: '#8E44AD', label: 'Gradient-boost' },  // accent purple
  linear:      { color: '#F39C12', label: 'Linear' },          // warning amber
  density:     { color: '#16A085', label: 'Density-based' },   // teal
};

function categorizeType(rawType = '') {
  const t = rawType.toLowerCase();
  if (t.includes('density')) return 'density';
  if (t.includes('boost'))   return 'boosting';
  if (t.includes('tree'))    return 'tree';
  if (t.includes('linear') || t.includes('logistic') || t.includes('regression')) return 'linear';
  if (t.includes('statist')) return 'statistical';
  return 'statistical'; // safe default
}

// F1'e göre niteleyici — kullanıcıya hızlı görsel feedback.
function f1Label(f1) {
  if (f1 == null) return null;
  if (f1 >= 0.80) return { text: 'Excellent', color: '#1E8449' };
  if (f1 >= 0.70) return { text: 'Good',      color: '#1E8449' };
  if (f1 >= 0.60) return { text: 'Fair',      color: '#D97706' };
  return                  { text: 'Needs work', color: '#C0392B' };
}

// ──────────────────────────────────────────────────────────────────────────
// UI bits
// ──────────────────────────────────────────────────────────────────────────

function MetricBlock({ label, value, color = 'text-gray-900', sub }) {
  return (
    <div>
      <div className="text-xs text-gray-500 uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${color}`}>
        {value ?? <span className="text-sm text-gray-400">—</span>}
      </div>
      {sub && <div className="text-[11px] text-gray-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="flex items-center gap-2 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
      <FiAlertTriangle className="w-4 h-4 shrink-0" /> {message}
    </div>
  );
}

const ANOMALY_MODEL_METRICS = {
  f1: '0.813',
  precision: '0.733',
  recall: '0.914',
  fpr: '1.64%',
  mcc: '0.809',
  anomalyRate: '4.69%',
  decisionThreshold: '0.5',
};

const RISK_MODEL_REGIMES = [
  { label: 'Clean-label', accuracy: '0.8125', macroF1: '0.761', mcc: '0.656' },
  { label: 'Noisy-label', accuracy: '0.768', macroF1: '0.714', mcc: '0.580' },
];

function RegimeMetricsRow({ label, accuracy, macroF1, mcc }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 mb-2">
        {label}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricBlock label="Accuracy" value={accuracy} />
        <MetricBlock label="Macro-F1" value={macroF1} color="text-accent" />
        <MetricBlock label="MCC" value={mcc} />
      </div>
    </div>
  );
}

// Ensemble — Top Categories pattern'i: donut chart + yanında legend.
// Donut dilimine hover ile tooltip ("Z-Score: 30%"). Legend her algoritma için
// renkli kare + isim + type pill + yüzde.
function EnsembleBar({ algorithms }) {
  const entries = useMemo(() => (algorithms ?? []).map((a) => {
    const cat = categorizeType(a.type);
    return {
      name:   a.name,
      type:   a.type,
      cat,
      color:  TYPE_PALETTE[cat].color,
      pct:    Math.round((a.weight ?? 0) * 100),
    };
  }), [algorithms]);

  const chartData = {
    labels: entries.map((e) => e.name),
    datasets: [{
      data: entries.map((e) => e.pct),
      backgroundColor: entries.map((e) => e.color),
      borderColor: '#fff',
      borderWidth: 2,
      hoverOffset: 6,
    }],
  };

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: '60%',
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(17, 24, 39, 0.95)',
        padding: 10,
        titleFont: { size: 12, weight: '600' },
        bodyFont: { size: 11 },
        cornerRadius: 6,
        displayColors: true,
        boxWidth: 8,
        boxHeight: 8,
        boxPadding: 4,
        callbacks: {
          label: (ctx) => ` ${ctx.parsed}%`,
        },
      },
    },
  };

  return (
    <div className="grid grid-cols-[130px_1fr] gap-4 items-center">
      {/* Donut */}
      <div className="h-32 w-32">
        <Doughnut data={chartData} options={chartOpts} />
      </div>

      {/* Legend */}
      <ul className="space-y-1.5">
        {entries.map((e) => (
          <li key={e.name} className="flex items-center justify-between gap-2 text-sm">
            <div className="flex items-center gap-2 min-w-0">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: e.color }}
              />
              <span className="font-medium text-gray-800 truncate">{e.name}</span>
              <span
                className="text-[10px] font-medium px-1.5 py-0.5 rounded-full shrink-0"
                style={{
                  backgroundColor: `${e.color}1A`,
                  color: e.color,
                }}
              >
                {TYPE_PALETTE[e.cat].label}
              </span>
            </div>
            <span className="text-xs font-semibold text-gray-700 tabular-nums shrink-0">
              {e.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Risk levels — yatay spektrum bar (0→100, yeşil/sarı/kırmızı). 40/70 tick.
// Bar altında inline legend: renkli nokta + label + range, açıklama yok.
function RiskLevelCards({ thresholds }) {
  const low  = thresholds.low?.max  ?? 40;
  const high = thresholds.high?.min ?? 70;
  const lowPct  = low;
  const medPct  = high - low;
  const highPct = 100 - high;

  const bands = [
    { label: 'Low',    range: `<${low}`,        color: '#27AE60' },
    { label: 'Medium', range: `${low}–${high}`, color: '#F39C12' },
    { label: 'High',   range: `≥${high}`,       color: '#E74C3C' },
  ];

  return (
    <div>
      {/* Spektrum bar */}
      <div className="flex h-2.5 rounded-full overflow-hidden">
        <div style={{ width: `${lowPct}%`,  backgroundColor: bands[0].color }} />
        <div style={{ width: `${medPct}%`,  backgroundColor: bands[1].color }} />
        <div style={{ width: `${highPct}%`, backgroundColor: bands[2].color }} />
      </div>

      {/* Threshold tick'leri */}
      <div className="relative h-3 mt-1">
        <span className="absolute text-[10px] text-gray-400 tabular-nums" style={{ left: 0 }}>0</span>
        <span
          className="absolute text-[10px] text-gray-600 font-medium tabular-nums"
          style={{ left: `${lowPct}%`, transform: 'translateX(-50%)' }}
        >
          {low}
        </span>
        <span
          className="absolute text-[10px] text-gray-600 font-medium tabular-nums"
          style={{ left: `${high}%`, transform: 'translateX(-50%)' }}
        >
          {high}
        </span>
        <span className="absolute text-[10px] text-gray-400 tabular-nums" style={{ right: 0 }}>100</span>
      </div>

      {/* Inline legend — sadece label + range */}
      <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3">
        {bands.map((b) => (
          <div key={b.label} className="flex items-center gap-1.5 text-xs">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: b.color }}
            />
            <span className="font-medium" style={{ color: b.color }}>
              {b.label}
            </span>
            <span className="text-gray-400 tabular-nums">{b.range}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Main page
// ──────────────────────────────────────────────────────────────────────────

export default function MLModels() {
  const [model, setModel] = useState({ data: null, loading: true, error: null });

  useEffect(() => {
    const ctrl = new AbortController();
    adminApi.getModelPerformance({ signal: ctrl.signal })
      .then((res) => setModel({ data: res.data, loading: false, error: null }))
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setModel({ data: null, loading: false, error: extractErrorMessage(err) });
      });
    return () => ctrl.abort();
  }, []);

  const mp           = model.data;
  const anomMdl      = mp?.anomalyModel;
  const riskMdl      = mp?.riskModel;
  const anomF1Lbl    = f1Label(0.813);
  const riskF1Lbl    = f1Label(0.761);
  const riskThresholds = riskMdl?.thresholds ?? {
    low: { max: 40 },
    medium: { min: 40, max: 70 },
    high: { min: 70 },
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">ML Models</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Model score &amp; ensemble composition
        </p>
      </div>

      {/* 2 model kart yan yana */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Anomaly Detection Model */}
        <Card
          title="Anomaly Detection Model"
          subtitle="Performance & ensemble composition"
          headerIcon={<FiAlertTriangle className="w-5 h-5" />}
        >
          {model.loading ? (
            <Skeleton height={320} />
          ) : model.error ? (
            <ErrorState message={model.error} />
          ) : mp ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Performance
                </div>
                {anomF1Lbl && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${anomF1Lbl.color}1A`,
                      color: anomF1Lbl.color,
                    }}
                  >
                    {anomF1Lbl.text}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <MetricBlock label="F1" value={ANOMALY_MODEL_METRICS.f1} color="text-accent" />
                <MetricBlock label="Precision" value={ANOMALY_MODEL_METRICS.precision} />
                <MetricBlock label="Recall" value={ANOMALY_MODEL_METRICS.recall} />
                <MetricBlock label="FPR" value={ANOMALY_MODEL_METRICS.fpr} />
                <MetricBlock label="MCC" value={ANOMALY_MODEL_METRICS.mcc} />
              </div>
              <div className="text-[11px] text-gray-400 mt-2">
                Held-out test split · synthetic ground truth · anomaly rate <span className="font-medium text-gray-600">{ANOMALY_MODEL_METRICS.anomalyRate}</span>
              </div>

              {anomMdl?.algorithms && (
                <div className="mt-5 pt-4 border-t border-gray-100">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                    Ensemble Composition
                  </div>
                  <EnsembleBar algorithms={anomMdl.algorithms} />
                  {anomMdl.decisionThreshold != null && (
                    <div className="mt-3 pt-3 border-t border-gray-50 text-[11px] text-gray-500">
                      <span className="text-gray-400">Decision:</span>{' '}
                      ensemble score &gt; <span className="font-mono font-medium text-gray-700">{ANOMALY_MODEL_METRICS.decisionThreshold}</span>
                      {' '}→ flagged as anomaly
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
        </Card>

        {/* Risk Scoring Model */}
        <Card
          title="Risk Scoring Model"
          subtitle="Performance & ensemble composition"
          headerIcon={<FiCpu className="w-5 h-5" />}
        >
          {model.loading ? (
            <Skeleton height={320} />
          ) : model.error ? (
            <ErrorState message={model.error} />
          ) : riskMdl ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Performance
                </div>
                {riskF1Lbl && (
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: `${riskF1Lbl.color}1A`,
                      color: riskF1Lbl.color,
                    }}
                  >
                    {riskF1Lbl.text}
                  </span>
                )}
              </div>
              <div className="space-y-3">
                <RegimeMetricsRow
                  label={RISK_MODEL_REGIMES[0].label}
                  accuracy={RISK_MODEL_REGIMES[0].accuracy}
                  macroF1={RISK_MODEL_REGIMES[0].macroF1}
                  mcc={RISK_MODEL_REGIMES[0].mcc}
                />
                <RegimeMetricsRow
                  label={RISK_MODEL_REGIMES[1].label}
                  accuracy={RISK_MODEL_REGIMES[1].accuracy}
                  macroF1={RISK_MODEL_REGIMES[1].macroF1}
                  mcc={RISK_MODEL_REGIMES[1].mcc}
                />
              </div>
              <div className="text-[11px] text-gray-400 mt-2">
                Held-out test split · macro-averaged across 3 risk classes
              </div>

              <div className="mt-5 pt-4 border-t border-gray-100">
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                  Ensemble Composition
                </div>
                <EnsembleBar algorithms={riskMdl.algorithms} />
              </div>

              {riskMdl.thresholds && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-3">
                    Risk Levels
                  </div>
                    <RiskLevelCards thresholds={riskThresholds} />
                </div>
              )}

            </>
          ) : (
            <div className="text-sm text-gray-500">
              Risk model composition unavailable.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
