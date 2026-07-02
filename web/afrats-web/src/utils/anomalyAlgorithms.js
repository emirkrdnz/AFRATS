// src/utils/anomalyAlgorithms.js
// 4-algorithm ensemble configuration.
// Weights MUST stay in sync with services/MLService/app/ml/anomaly_models.py:WEIGHT_*
//   Z 0.30 / IF 0.20 / LOF 0.05 / XGB 0.45 — Strategy 3, F1=0.8134
// Backend decision: ensemble_score >= ENSEMBLE_THRESHOLD → anomaly.

export const ENSEMBLE_THRESHOLD = 0.5;

// Display order = weight descending. Most influential algorithm first.
export const ALGORITHMS = [
  { key: 'xgboost',         shortName: 'XGB', name: 'XGBoost',              weight: 0.45, type: 'Supervised',   backendName: 'XGBoost'         },
  { key: 'zScore',          shortName: 'Z',   name: 'Z-Score',              weight: 0.30, type: 'Statistical',  backendName: 'ZScore'          },
  { key: 'isolationForest', shortName: 'IF',  name: 'Isolation Forest',     weight: 0.20, type: 'Unsupervised', backendName: 'IsolationForest' },
  { key: 'lof',             shortName: 'LOF', name: 'Local Outlier Factor', weight: 0.05, type: 'Unsupervised', backendName: 'LOF'             },
];

// Maps backend `algorithmName` strings to the camelCase key used in
// `algorithmResults` and on the grouped row's `algorithms` flags.
export const ALGO_KEY_BY_BACKEND = ALGORITHMS.reduce((acc, a) => {
  acc[a.backendName] = a.key;
  return acc;
}, {});
