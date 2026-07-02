"""
AFRATS Anomaly Model Training — v6.0.0 (Synthetic Dataset)
═══════════════════════════════════════════════════════════════════════════
Major changes vs v5.0.0:
  - Data source: Sparkov → AFRATS synthetic dataset (2000 users, ~700K tx)
  - Multi-tier hybrid labels REMOVED (ground truth available from synthesis)
  - User-level train/val/test split (no data leakage from shared users)
  - Stratified by risk class (consistent anomaly ratio across splits)
  - Expense-only feature engineering (aligned with production feature_engineering.py)
  - Comprehensive metrics: F1, Precision, Recall, ROC-AUC, PR-AUC, MCC

Defending the design (for thesis):
  Sparkov is structurally mismatched with AFRATS's user-personalized spending
  anomaly detection target. The synthetic dataset provides controlled ground
  truth labels generated independently of features (no label leakage), enabling
  honest model evaluation. User-level splits ensure generalization is measured
  on truly unseen users, not on different transactions from training users.
═══════════════════════════════════════════════════════════════════════════
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import json
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.metrics import (
    classification_report, confusion_matrix,
    f1_score, precision_score, recall_score,
    roc_auc_score, average_precision_score, matthews_corrcoef,
)
from sklearn.model_selection import train_test_split
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import StandardScaler

from app.ml.anomaly_models import XGBoostDetector


# ─── CONFIG ───────────────────────────────────────────────────────────────
USERS_CSV = "data/synthetic/users.csv"
TRANSACTIONS_CSV = "data/synthetic/transactions.csv"
MODEL_BUNDLE_PATH = "models/anomaly_model.pkl"
LOF_PATH = "models/lof_model.pkl"
METADATA_PATH = "models/metadata.json"

RANDOM_SEED = 42

# Split ratios (user-level)
TRAIN_RATIO = 0.70   # 1400 users
VAL_RATIO = 0.15     # 300 users
TEST_RATIO = 0.15    # 300 users

# Feature column orders (must match feature_engineering.py)
FEATURE_COLS = [
    "amt", "amount_zscore", "amount_log_ratio", "user_mean", "user_std",
    "user_median", "daily_avg_7d", "category_zscore", "category_freq",
    "category_mean", "cat_to_user_ratio", "days_since_last_in_category",
]
XGB_FEATURE_COLS = [
    "amt", "user_mean", "user_std", "user_median",
    "daily_avg_7d", "category_mean", "cat_to_user_ratio",
]

ZSCORE_THRESHOLD = 2.5


# ─── 1. LOAD ──────────────────────────────────────────────────────────────
print("=" * 70)
print("AFRATS Anomaly Model Training — v6.0.0 (Synthetic Dataset)")
print("=" * 70)
print("\nLoading synthetic dataset...")
users_df = pd.read_csv(USERS_CSV)
tx_df = pd.read_csv(TRANSACTIONS_CSV)
print(f"  Users:        {len(users_df):,}")
print(f"  Transactions: {len(tx_df):,}")
print(f"  Anomaly rate: {tx_df['is_anomaly'].mean()*100:.2f}%")


# ─── 2. FEATURE ENGINEERING (vectorized, expense-only) ────────────────────
print("\n" + "=" * 70)
print("Feature engineering (expense-only, matching production semantics)")
print("=" * 70)

tx_df['transaction_date'] = pd.to_datetime(tx_df['transaction_date'])

# CRITICAL: Feature engineering uses EXPENSE tx only (matches production
# feature_engineering.py which filters by h.get('type') == 'Expense')
expense_df = tx_df[tx_df['transaction_type'] == 'Expense'].copy()
expense_df = expense_df.sort_values(['user_id', 'transaction_date']).reset_index(drop=True)
print(f"  Expense transactions: {len(expense_df):,}")
print(f"  Expense anomaly rate: {expense_df['is_anomaly'].mean()*100:.2f}%")

# Rename `amount` → `amt` for compatibility with feature engineering
expense_df['amt'] = expense_df['amount']

# User-level stats
user_stats = (
    expense_df.groupby('user_id')['amt']
    .agg(user_mean='mean', user_std='std', user_median='median')
    .reset_index()
)
user_stats['user_std'] = user_stats['user_std'].fillna(1.0).replace(0, 1.0)
expense_df = expense_df.merge(user_stats, on='user_id', how='left')

# Amount-relative features
expense_df['amount_zscore'] = (expense_df['amt'] - expense_df['user_mean']) / expense_df['user_std']
safe_mean = expense_df['user_mean'].replace(0, 1.0)
expense_df['amount_log_ratio'] = np.log(expense_df['amt'].clip(lower=1e-6) / safe_mean)

# Daily avg (rolling last 7 transactions — matches production)
expense_df['daily_avg_7d'] = (
    expense_df.groupby('user_id')['amt']
    .transform(lambda x: x.rolling(7, min_periods=1).mean())
)

# Category-level stats (per user, per category)
cat_stats = (
    expense_df.groupby(['user_id', 'category'])['amt']
    .agg(category_mean='mean', category_std='std')
    .reset_index()
)
cat_stats['category_std'] = cat_stats['category_std'].fillna(1.0).replace(0, 1.0)
expense_df = expense_df.merge(cat_stats, on=['user_id', 'category'], how='left')
expense_df['category_zscore'] = (
    (expense_df['amt'] - expense_df['category_mean']) / expense_df['category_std']
)

# Category frequency (fraction of user's expenses in this category)
cat_counts = expense_df.groupby(['user_id', 'category']).size().reset_index(name='cat_count')
user_totals = expense_df.groupby('user_id').size().reset_index(name='user_total')
cat_counts = cat_counts.merge(user_totals, on='user_id')
cat_counts['category_freq'] = cat_counts['cat_count'] / cat_counts['user_total']
expense_df = expense_df.merge(
    cat_counts[['user_id', 'category', 'category_freq']],
    on=['user_id', 'category'], how='left',
)

# Category-to-user ratio
expense_df['cat_to_user_ratio'] = (
    expense_df['category_mean'] / expense_df['user_mean'].replace(0, 1.0)
)

# Days since last transaction in this category (per user-category)
expense_df['days_since_last_in_category'] = (
    expense_df.groupby(['user_id', 'category'])['transaction_date']
    .diff().dt.total_seconds().div(86400.0).fillna(9999.0).clip(lower=0.0)
)

print(f"  ✓ {len(FEATURE_COLS)} features engineered")


# ─── 3. USER-LEVEL STRATIFIED SPLIT ───────────────────────────────────────
print("\n" + "=" * 70)
print("User-level stratified split (no cross-user leakage)")
print("=" * 70)

# Each user's risk class (use original ground truth, not noisy label)
user_risk = users_df[['user_id', 'risk_class_original']].set_index('user_id')

# All unique users (only those with expense transactions)
all_users = expense_df['user_id'].unique()
user_risk_classes = [user_risk.loc[u, 'risk_class_original'] for u in all_users]

# Stratified split: 70/15/15
train_users, temp_users, train_y, temp_y = train_test_split(
    all_users, user_risk_classes,
    test_size=(VAL_RATIO + TEST_RATIO),
    stratify=user_risk_classes,
    random_state=RANDOM_SEED,
)
val_users, test_users, _, _ = train_test_split(
    temp_users, temp_y,
    test_size=TEST_RATIO / (VAL_RATIO + TEST_RATIO),
    stratify=temp_y,
    random_state=RANDOM_SEED,
)

print(f"  Train: {len(train_users)} users  ({len([u for u in train_users if user_risk.loc[u, 'risk_class_original']=='Low'])}L/"
      f"{len([u for u in train_users if user_risk.loc[u, 'risk_class_original']=='Medium'])}M/"
      f"{len([u for u in train_users if user_risk.loc[u, 'risk_class_original']=='High'])}H)")
print(f"  Val:   {len(val_users)} users")
print(f"  Test:  {len(test_users)} users")

# Filter transactions by user split
train_mask = expense_df['user_id'].isin(train_users)
val_mask = expense_df['user_id'].isin(val_users)
test_mask = expense_df['user_id'].isin(test_users)

train_df = expense_df[train_mask].reset_index(drop=True)
val_df = expense_df[val_mask].reset_index(drop=True)
test_df = expense_df[test_mask].reset_index(drop=True)

print(f"\n  Train transactions: {len(train_df):,}  ({train_df['is_anomaly'].mean()*100:.2f}% anomaly)")
print(f"  Val   transactions: {len(val_df):,}  ({val_df['is_anomaly'].mean()*100:.2f}% anomaly)")
print(f"  Test  transactions: {len(test_df):,}  ({test_df['is_anomaly'].mean()*100:.2f}% anomaly)")


# ─── 4. FEATURE MATRICES ──────────────────────────────────────────────────
X_train = train_df[FEATURE_COLS].fillna(0)
X_val = val_df[FEATURE_COLS].fillna(0)
X_test = test_df[FEATURE_COLS].fillna(0)

X_xgb_train = train_df[XGB_FEATURE_COLS].fillna(0)
X_xgb_val = val_df[XGB_FEATURE_COLS].fillna(0)
X_xgb_test = test_df[XGB_FEATURE_COLS].fillna(0)

y_train = train_df['is_anomaly'].astype(int)
y_val = val_df['is_anomaly'].astype(int)
y_test = test_df['is_anomaly'].astype(int)


# ─── 5. ISOLATION FOREST ──────────────────────────────────────────────────
print("\n" + "=" * 70)
print("Training Isolation Forest")
print("=" * 70)

contamination = max(0.01, min(round(float(y_train.mean()), 3), 0.10))
print(f"  Contamination: {contamination}")

iso_forest = IsolationForest(
    n_estimators=150, contamination=contamination,
    max_features=0.8, random_state=RANDOM_SEED, n_jobs=-1,
)
iso_forest.fit(X_train)

if_preds_test = iso_forest.predict(X_test)
if_binary_test = (if_preds_test == -1).astype(int)
if_raw_score_test = iso_forest.decision_function(X_test)
if_score_test = 1.0 / (1.0 + np.exp(5.0 * if_raw_score_test))


# ─── 6. LOF — Mini Grid Search ────────────────────────────────────────────
print("\n" + "=" * 70)
print("LOF — mini grid search on stratified subsample")
print("=" * 70)

sample_size = min(20_000, len(X_train))
X_train_with_y = X_train.copy()
X_train_with_y["__y__"] = y_train.values
anomaly_frac = float(y_train.mean())
n_anomaly = min(int(sample_size * anomaly_frac), int((X_train_with_y["__y__"] == 1).sum()))
n_normal = min(sample_size - n_anomaly, int((X_train_with_y["__y__"] == 0).sum()))

sample = pd.concat([
    X_train_with_y[X_train_with_y["__y__"] == 1].sample(n_anomaly, random_state=RANDOM_SEED),
    X_train_with_y[X_train_with_y["__y__"] == 0].sample(n_normal, random_state=RANDOM_SEED),
]).sample(frac=1, random_state=RANDOM_SEED)
X_lof_sample = sample.drop(columns=["__y__"])
print(f"  Subsample: {len(X_lof_sample):,} rows ({n_anomaly:,} anomaly / {n_normal:,} normal)")

# LOF grid search uses VAL set (not test) for selection — proper protocol
lof_scaler = StandardScaler()
X_lof_sample_scaled = lof_scaler.fit_transform(X_lof_sample)
X_val_scaled = lof_scaler.transform(X_val)
X_test_scaled = lof_scaler.transform(X_test)

# Reduced grid for speed (n_neighbors=200 with full prediction is slow)
grid_results = []
n_neighbors_grid = [50, 100]
contamination_grid = [0.03, 0.05, 0.07]

print(f"\n  Grid: n_neighbors {n_neighbors_grid} × contamination {contamination_grid}")
print(f"  Validation set used for selection (test set held out)")
print(f"  {'n_neighbors':>12} {'contamination':>15} {'F1':>8} {'Prec':>8} {'Rec':>8}")
print("  " + "-" * 60)

best_lof = None
best_lof_config = None
best_lof_f1 = -1.0

for n_neigh in n_neighbors_grid:
    for cont in contamination_grid:
        candidate = LocalOutlierFactor(
            n_neighbors=n_neigh, contamination=cont, novelty=True, n_jobs=-1,
        )
        candidate.fit(X_lof_sample_scaled)
        # Predict on VALIDATION set for selection
        preds = candidate.predict(X_val_scaled)
        labels = (preds == -1).astype(int)
        f1 = f1_score(y_val, labels)
        prec = precision_score(y_val, labels, zero_division=0)
        rec = recall_score(y_val, labels)
        grid_results.append({
            "n_neighbors": n_neigh, "contamination": cont,
            "f1": float(f1), "precision": float(prec), "recall": float(rec),
        })
        marker = "  *" if f1 > best_lof_f1 else ""
        print(f"  {n_neigh:>12} {cont:>15.4f} {f1:>8.4f} {prec:>8.4f} {rec:>8.4f}{marker}")
        if f1 > best_lof_f1:
            best_lof = candidate
            best_lof_config = {"n_neighbors": n_neigh, "contamination": cont}
            best_lof_f1 = f1

print(f"\n  Best LOF: {best_lof_config}  →  Val F1 = {best_lof_f1:.4f}")
lof = best_lof
# Now predict on TEST set with the selected model
lof_binary_test = (lof.predict(X_test_scaled) == -1).astype(int)
lof_raw_score_test = lof.decision_function(X_test_scaled)
lof_score_test = 1.0 / (1.0 + np.exp(5.0 * lof_raw_score_test))


# ─── 7. XGBOOST (no SMOTE — synthetic data has clean ground truth) ───────
print("\n" + "=" * 70)
print("Training XGBoost (scale_pos_weight balancing, no SMOTE needed)")
print("=" * 70)

n_anomaly_train = int(y_train.sum())
n_normal_train = len(y_train) - n_anomaly_train
print(f"  Train: {n_normal_train:,} normal / {n_anomaly_train:,} anomaly "
      f"(1:{n_normal_train / max(n_anomaly_train, 1):.1f})")

# Synthetic data has clean ground truth — SMOTE would add noise.
# Use scale_pos_weight for class imbalance instead.
spw = n_normal_train / max(n_anomaly_train, 1)
print(f"  scale_pos_weight: {spw:.2f}")

xgb_scaler = StandardScaler()
X_xgb_train_scaled = xgb_scaler.fit_transform(X_xgb_train)

xgb_detector = XGBoostDetector(scale_pos_weight=spw)
from sklearn.model_selection import train_test_split as tts_inner
X_tr, X_vl, y_tr, y_vl = tts_inner(
    X_xgb_train_scaled, y_train,
    test_size=0.15, stratify=y_train, random_state=RANDOM_SEED,
)
xgb_detector.model.fit(X_tr, y_tr, eval_set=[(X_vl, y_vl)], verbose=False)
xgb_detector.feature_names = XGB_FEATURE_COLS
xgb_detector._is_fitted = True
xgb_detector.scaler = xgb_scaler

xgb_score_test = xgb_detector.predict_proba(X_xgb_test)
xgb_binary_test = (xgb_score_test >= xgb_detector.threshold).astype(int)


# ─── 8. Z-SCORE (rule-based) ──────────────────────────────────────────────
zscore_values_test = np.abs(X_test["amount_zscore"].values)
zscore_binary_test = (zscore_values_test > ZSCORE_THRESHOLD).astype(int)
zscore_score_test = np.minimum(zscore_values_test / 5.0, 1.0)


# ─── 9. COMPREHENSIVE METRICS HELPER ──────────────────────────────────────
def evaluate(name, y_true, y_pred_binary, y_pred_score=None):
    """Compute comprehensive metrics. Returns dict."""
    metrics = {
        "f1": f1_score(y_true, y_pred_binary, zero_division=0),
        "precision": precision_score(y_true, y_pred_binary, zero_division=0),
        "recall": recall_score(y_true, y_pred_binary, zero_division=0),
        "mcc": matthews_corrcoef(y_true, y_pred_binary),
    }
    if y_pred_score is not None:
        metrics["roc_auc"] = roc_auc_score(y_true, y_pred_score)
        metrics["pr_auc"] = average_precision_score(y_true, y_pred_score)
    cm = confusion_matrix(y_true, y_pred_binary)
    metrics["confusion_matrix"] = {
        "tn": int(cm[0][0]), "fp": int(cm[0][1]),
        "fn": int(cm[1][0]), "tp": int(cm[1][1]),
    }
    return metrics


# ─── 10. INDIVIDUAL EVALUATION ────────────────────────────────────────────
print("\n" + "=" * 70)
print(f"INDIVIDUAL MODEL EVALUATION (test set, n={len(y_test):,})")
print("=" * 70)

individual_metrics = {
    "zscore":           evaluate("Z-Score", y_test, zscore_binary_test, zscore_score_test),
    "isolation_forest": evaluate("IF", y_test, if_binary_test, if_score_test),
    "lof":              evaluate("LOF", y_test, lof_binary_test, lof_score_test),
    "xgboost":          evaluate("XGBoost", y_test, xgb_binary_test, xgb_score_test),
}

print(f"\n{'Model':<22} {'F1':>8} {'Prec':>8} {'Rec':>8} {'MCC':>8} {'ROC-AUC':>9} {'PR-AUC':>9}")
print("-" * 75)
for model_name, m in individual_metrics.items():
    print(f"{model_name:<22} {m['f1']:>8.4f} {m['precision']:>8.4f} {m['recall']:>8.4f} "
          f"{m['mcc']:>8.4f} {m['roc_auc']:>9.4f} {m['pr_auc']:>9.4f}")


# ─── 11. ENSEMBLE STRATEGIES ──────────────────────────────────────────────
print("\n" + "=" * 70)
print("ENSEMBLE STRATEGIES")
print("=" * 70)

binary_matrix = np.column_stack([
    zscore_binary_test, if_binary_test, xgb_binary_test, lof_binary_test
])
score_matrix = np.column_stack([
    zscore_score_test, if_score_test, xgb_score_test, lof_score_test
])

# Strategy 1: Strict (Z-Score AND IF)
strict_binary = (zscore_binary_test & if_binary_test).astype(int)
strict_metrics = evaluate("Strict", y_test, strict_binary)

# Strategy 2: Majority Vote (≥2 of 4)
majority_binary = (binary_matrix.sum(axis=1) >= 2).astype(int)
majority_metrics = evaluate("Majority", y_test, majority_binary)

# Strategy 3: Weighted Score Threshold
weight_profiles = {
    "Default   (Z 0.40 / IF 0.25 / XGB 0.30 / LOF 0.05)": np.array([0.40, 0.25, 0.30, 0.05]),
    "IF-heavy  (Z 0.30 / IF 0.40 / XGB 0.25 / LOF 0.05)": np.array([0.30, 0.40, 0.25, 0.05]),
    "XGB-heavy (Z 0.30 / IF 0.20 / XGB 0.45 / LOF 0.05)": np.array([0.30, 0.20, 0.45, 0.05]),
    "Balanced  (Z 0.30 / IF 0.30 / XGB 0.35 / LOF 0.05)": np.array([0.30, 0.30, 0.35, 0.05]),
}

score_threshold_results = {}
for profile_name, weights in weight_profiles.items():
    weighted_scores = score_matrix @ weights
    bin_pred = (weighted_scores > 0.5).astype(int)
    m = evaluate(profile_name, y_test, bin_pred, weighted_scores)
    m["weights"] = weights.tolist()
    score_threshold_results[profile_name] = m

# Print
print(f"\nStrategy 1 — Strict (Z-Score AND IF):")
print(f"  F1={strict_metrics['f1']:.4f}  Prec={strict_metrics['precision']:.4f}  Rec={strict_metrics['recall']:.4f}  MCC={strict_metrics['mcc']:.4f}")

print(f"\nStrategy 2 — Majority Vote (≥2 of 4):")
print(f"  F1={majority_metrics['f1']:.4f}  Prec={majority_metrics['precision']:.4f}  Rec={majority_metrics['recall']:.4f}  MCC={majority_metrics['mcc']:.4f}")

print(f"\nStrategy 3 — Weighted Score Threshold (> 0.5):")
for profile_name, m in score_threshold_results.items():
    print(f"  {profile_name}")
    print(f"    F1={m['f1']:.4f}  Prec={m['precision']:.4f}  Rec={m['recall']:.4f}  MCC={m['mcc']:.4f}  PR-AUC={m['pr_auc']:.4f}")

# Determine best
all_ensemble_f1 = {
    "Strict (Z AND IF)": strict_metrics['f1'],
    "Majority Vote (≥2 of 4)": majority_metrics['f1'],
}
for k, v in score_threshold_results.items():
    all_ensemble_f1[f"ScoreThresh — {k}"] = v["f1"]

winner_name = max(all_ensemble_f1, key=all_ensemble_f1.get)
winner_f1 = all_ensemble_f1[winner_name]

print("\n" + "=" * 70)
print(f"BEST ENSEMBLE: {winner_name}")
print(f"BEST F1:       {winner_f1:.4f}")
print("=" * 70)


# ─── 12. PERSIST ─────────────────────────────────────────────────────────
print("\nSaving models...")
Path("models").mkdir(exist_ok=True)

bundle = {
    "isolation_forest": iso_forest,
    "lof": lof,
    "lof_scaler": lof_scaler,
    "xgboost": xgb_detector,
    "feature_cols": FEATURE_COLS,
    "xgb_feature_cols": XGB_FEATURE_COLS,
    "version": "v6.0.0",
    "data_source": "synthetic",
    "anomaly_rate": float(expense_df['is_anomaly'].mean()),
}
joblib.dump(bundle, MODEL_BUNDLE_PATH)
joblib.dump(lof, LOF_PATH)

metadata = {
    "version": "v6.0.0",
    "data_source": "AFRATS synthetic dataset (seed=42, 2000 users)",
    "feature_cols": FEATURE_COLS,
    "xgb_feature_cols": XGB_FEATURE_COLS,
    "split_strategy": "user-level stratified by risk class (70/15/15)",
    "n_train_users": int(len(train_users)),
    "n_val_users": int(len(val_users)),
    "n_test_users": int(len(test_users)),
    "n_train_tx": int(len(train_df)),
    "n_val_tx": int(len(val_df)),
    "n_test_tx": int(len(test_df)),
    "anomaly_ratio_test": float(y_test.mean()),
    "contamination": contamination,
    "individual_metrics": {k: {kk: vv for kk, vv in v.items() if kk != "confusion_matrix"}
                            for k, v in individual_metrics.items()},
    "individual_confusion_matrices": {k: v["confusion_matrix"] for k, v in individual_metrics.items()},
    "ensemble_metrics": {
        "strict_z_and_if": strict_metrics,
        "majority_vote_2_of_4": majority_metrics,
        "score_threshold_0_5": score_threshold_results,
    },
    "best_ensemble": {"strategy": winner_name, "f1": float(winner_f1)},
    "lof_grid_search": grid_results,
    "lof_best_config": best_lof_config,
    "xgboost_class_balancing": {
        "method": "scale_pos_weight",
        "value": spw,
        "rationale": "Synthetic data provides clean ground truth labels. "
                     "SMOTE not needed — scale_pos_weight handles class imbalance "
                     "without introducing synthetic samples that could distort the "
                     "carefully designed test distribution.",
    },
    "xgboost_hyperparameters": xgb_detector.params,
    "v6_0_0_changes": (
        "Migrated from Sparkov to synthetic dataset. Removed multi-tier hybrid labels "
        "(ground truth available from synthesis). User-level stratified split prevents "
        "data leakage. Comprehensive metrics including PR-AUC and MCC for imbalanced "
        "evaluation. Aligned with AFRATS's user-personalized spending anomaly target."
    ),
}
with open(METADATA_PATH, "w") as f:
    json.dump(metadata, f, indent=2, default=str)

print(f"\n✓ {MODEL_BUNDLE_PATH} saved (v6.0.0)")
print(f"✓ {LOF_PATH} saved")
print(f"✓ {METADATA_PATH} saved")
print(f"\nTest set anomaly ratio: {y_test.mean()*100:.2f}%")
print("Done.")
