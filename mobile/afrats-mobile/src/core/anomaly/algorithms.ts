// Mirror of web/afrats-web/src/utils/anomalyAlgorithms.js + statusStyles.js.
// Weights MUST stay in sync with services/MLService/app/ml/anomaly_models.py:WEIGHT_*
//   Z 0.30 / IF 0.20 / LOF 0.05 / XGB 0.45 — Strategy 3, F1=0.8134
// Backend decision: ensemble_score >= ENSEMBLE_THRESHOLD -> anomaly.
import { formatCurrency } from '@/core/utils';

export const ENSEMBLE_THRESHOLD = 0.5;

export type AlgoKey = 'xgboost' | 'zScore' | 'isolationForest' | 'lof';

export interface AlgoConfig {
  key: AlgoKey;
  shortName: string;
  name: string;
  weight: number;
  type: string;
  backendName: string;
}

// Display order = weight descending. Most influential algorithm first.
export const ALGORITHMS: AlgoConfig[] = [
  { key: 'xgboost',         shortName: 'XGB', name: 'XGBoost',              weight: 0.45, type: 'Supervised',   backendName: 'XGBoost' },
  { key: 'zScore',          shortName: 'Z',   name: 'Z-Score',              weight: 0.30, type: 'Statistical',  backendName: 'ZScore' },
  { key: 'isolationForest', shortName: 'IF',  name: 'Isolation Forest',     weight: 0.20, type: 'Unsupervised', backendName: 'IsolationForest' },
  { key: 'lof',             shortName: 'LOF', name: 'Local Outlier Factor', weight: 0.05, type: 'Unsupervised', backendName: 'LOF' },
];

export const ALGO_KEY_BY_BACKEND: Record<string, AlgoKey> = ALGORITHMS.reduce((acc, a) => {
  acc[a.backendName] = a.key;
  return acc;
}, {} as Record<string, AlgoKey>);

export const ANOMALY_STATUS_LABELS: Record<string, string> = {
  Pending: 'Pending',
  Reviewed: 'Reviewed',
  Confirmed: 'Confirmed',
  FalsePositive: 'False positive',
};

// Per-algorithm explainer: one-line "what it does" + the metrics the backend
// returns in algorithmResults[key].metrics.
export interface MetricRow { label: string; key: string; fmt: (v: number) => string; }
export const ALGO_INFO: Record<AlgoKey, { desc: string; metrics: MetricRow[] }> = {
  xgboost: {
    desc: 'Trained on labelled history — outputs the probability this resembles past anomalies.',
    metrics: [
      { label: 'Probability', key: 'probability', fmt: (v) => v.toFixed(4) },
      { label: 'Threshold',   key: 'threshold',   fmt: (v) => v.toFixed(2) },
    ],
  },
  zScore: {
    desc: "How many standard deviations the amount sits from this user's average spend.",
    metrics: [
      { label: 'User Mean',   key: 'userMean',   fmt: (v) => formatCurrency(v) },
      { label: 'User StdDev', key: 'userStdDev', fmt: (v) => formatCurrency(v) },
      { label: 'Threshold',   key: 'threshold',  fmt: (v) => v.toFixed(2) },
    ],
  },
  isolationForest: {
    desc: 'Scores how easily this transaction isolates from the rest — outliers split off in fewer steps.',
    metrics: [
      { label: 'Isolation Depth', key: 'isolationDepth',    fmt: (v) => v.toFixed(2) },
      { label: 'Avg Path Length', key: 'averagePathLength', fmt: (v) => v.toFixed(2) },
      { label: 'Contamination',   key: 'contamination',     fmt: (v) => v.toFixed(3) },
    ],
  },
  lof: {
    desc: "Compares this point's local density to its neighbours — sparse surroundings score higher.",
    metrics: [
      { label: 'Density Ratio', key: 'localDensityRatio', fmt: (v) => v.toFixed(3) },
      { label: 'k Neighbors',   key: 'kNeighbors',        fmt: (v) => String(v) },
      { label: 'Threshold',     key: 'threshold',         fmt: (v) => v.toFixed(2) },
    ],
  },
};

export interface Contribution extends AlgoConfig {
  score: number;
  contribution: number;
  isAnomaly: boolean;
  skipped: boolean;
  metrics: Record<string, number>;
  hasResult: boolean;
  share: number;
}

type AlgoResults = Partial<Record<AlgoKey, { score?: number; isAnomaly?: boolean; metrics?: Record<string, number> }>>;

// contribution = score × weight (0 if the model was skipped server-side).
export function computeContributions(algorithmResults?: AlgoResults): Contribution[] {
  return ALGORITHMS.map((a) => {
    const r = algorithmResults?.[a.key];
    const score = Number(r?.score ?? 0);
    const skipped = !!r?.metrics?.skipped;
    return {
      ...a,
      score,
      contribution: skipped ? 0 : score * a.weight,
      isAnomaly: !!r?.isAnomaly,
      skipped,
      metrics: r?.metrics ?? {},
      hasResult: !!r && !skipped,
      share: 0,
    };
  });
}

export interface Influence { primary: boolean; items: { name: string; pct: number }[] }

// Ranked contributions + the one-line "driven by" answer (as data, not JSX).
export function analyzeContribs(algorithmResults: AlgoResults | undefined, finalScore: number) {
  const contribs = computeContributions(algorithmResults);
  const total = contribs.reduce((s, c) => s + c.contribution, 0);
  const isAnomaly = finalScore >= ENSEMBLE_THRESHOLD;

  const ranked = contribs
    .map((c) => ({ ...c, share: total > 0 ? c.contribution / total : 0 }))
    .sort((a, b) => b.share - a.share);

  let influence: Influence | null = null;
  if (total > 0) {
    if (ranked[0].share >= 0.60) {
      influence = { primary: true, items: [{ name: ranked[0].name, pct: Math.round(ranked[0].share * 100) }] };
    } else {
      influence = {
        primary: false,
        items: [
          { name: ranked[0].name, pct: Math.round(ranked[0].share * 100) },
          { name: ranked[1].name, pct: Math.round(ranked[1].share * 100) },
        ],
      };
    }
  }

  return { contribs, total, isAnomaly, influence };
}
