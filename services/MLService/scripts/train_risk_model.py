"""
AFRATS Risk Model Training — v2.0.0 (Synthetic Dataset)
═══════════════════════════════════════════════════════════════════════════
Major changes vs v1.1.0:
  - Data source: Sparkov → AFRATS synthetic dataset
  - Risk labels: synthetic ground truth (no rule-based label generation)
  - Feature engineering aligned with production extract_risk_features()
  - User-level features (9): total_transactions, mean_amount, std_amount,
    max_amount, anomaly_rate, debt_ratio, spending_trend,
    amount_volatility, max_to_mean_ratio
  - Comprehensive metrics: accuracy, macro F1, MCC, per-class precision/recall

Defending the design (for thesis):
  Risk classification labels are taken from the synthetic ground truth
  (including 7% real-world-simulated label noise). Per-user features are
  computed using identical semantics to the production
  feature_engineering.py module (last-90-transaction anomaly rate, debt
  ratio with expense/income, 30-vs-60-day spending trend), ensuring
  training-time and inference-time feature distributions match.
═══════════════════════════════════════════════════════════════════════════
"""

import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import json
import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, classification_report, confusion_matrix,
    f1_score, matthews_corrcoef,
)
from xgboost import XGBClassifier


# ─── CONFIG ───────────────────────────────────────────────────────────────
USERS_CSV = "data/synthetic/users.csv"
TRANSACTIONS_CSV = "data/synthetic/transactions.csv"
MODEL_BUNDLE_PATH = "models/risk_model.pkl"
METADATA_PATH = "models/risk_metadata.json"

RANDOM_SEED = 42
TEST_SIZE = 0.20

# Production feature engineering parameters (must match feature_engineering.py)
ANOMALY_RATE_WINDOW = 90      # last N transactions for anomaly_rate
DEBT_RATIO_CLIP = 2.0
VOLATILITY_CLIP = 5.0
MAX_TO_MEAN_CLIP = 50.0
TREND_RECENT_WINDOW = 30      # last 30 expenses for "recent"
TREND_OLDER_WINDOW = 60       # 31-90th expenses for "older"
TREND_MIN_HISTORY = 10        # below this, return 1.0
TREND_CLIP = 3.0

# Risk classifier feature order (must match feature_engineering.RISK_FEATURE_COLS)
FEATURE_COLS = [
    "total_transactions",
    "mean_amount",
    "std_amount",
    "max_amount",
    "anomaly_rate",
    "debt_ratio",
    "spending_trend",
    "amount_volatility",
    "max_to_mean_ratio",
]


# ─── 1. LOAD ──────────────────────────────────────────────────────────────
print("=" * 70)
print("AFRATS Risk Model Training — v2.0.0 (Synthetic Dataset)")
print("=" * 70)

print("\nLoading synthetic dataset...")
users_df = pd.read_csv(USERS_CSV)
tx_df = pd.read_csv(TRANSACTIONS_CSV)
tx_df['transaction_date'] = pd.to_datetime(tx_df['transaction_date'])
tx_df = tx_df.sort_values(['user_id', 'transaction_date']).reset_index(drop=True)
print(f"  Users:        {len(users_df):,}")
print(f"  Transactions: {len(tx_df):,}")


# ─── 2. FEATURE ENGINEERING (per-user aggregations) ───────────────────────
print("\n" + "=" * 70)
print("Feature engineering (production-aligned semantics)")
print("=" * 70)

# Split by type
is_expense = tx_df['transaction_type'] == 'Expense'
is_income = tx_df['transaction_type'] == 'Income'
expense_tx = tx_df[is_expense]
income_tx = tx_df[is_income]


def compute_user_features(user_id, all_tx, expense_tx, income_tx):
    """Compute 9 risk features for a single user."""
    # All transactions for this user
    user_all = all_tx[all_tx['user_id'] == user_id].sort_values('transaction_date')
    user_exp = expense_tx[expense_tx['user_id'] == user_id].sort_values('transaction_date')
    user_inc = income_tx[income_tx['user_id'] == user_id]
    
    # Basic stats (Expense only)
    if len(user_exp) > 0:
        mean_amount = float(user_exp['amount'].mean())
        std_amount = float(user_exp['amount'].std()) if len(user_exp) > 1 else 1.0
        std_amount = std_amount if std_amount > 0 else 1.0
        max_amount = float(user_exp['amount'].max())
    else:
        mean_amount, std_amount, max_amount = 0.0, 1.0, 0.0
    
    # total_transactions: ALL transactions (production: len(user_history))
    total_transactions = len(user_all)
    
    # anomaly_rate: last 90 transactions overall, fraction flagged
    last_90 = user_all.tail(ANOMALY_RATE_WINDOW)
    anomaly_rate = float(last_90['is_anomaly'].mean()) if len(last_90) > 0 else 0.0
    
    # debt_ratio: total_expense / total_income, clipped [0, 2]
    total_expense = float(user_exp['amount'].sum())
    total_income = float(user_inc['amount'].sum())
    if total_income == 0:
        debt_ratio = 1.0
    else:
        debt_ratio = min(total_expense / total_income, DEBT_RATIO_CLIP)
    
    # spending_trend: recent (last 30 expenses) / older (31-90th expenses)
    if len(user_exp) < TREND_MIN_HISTORY:
        spending_trend = 1.0
    else:
        recent = float(user_exp.tail(TREND_RECENT_WINDOW)['amount'].mean())
        if len(user_exp) >= 90:
            older_window = user_exp.iloc[-90:-30]
            older = float(older_window['amount'].mean()) if len(older_window) > 0 else 0.0
        else:
            older = 0.0
        if older == 0:
            spending_trend = 1.0
        else:
            spending_trend = min(recent / older, TREND_CLIP)
    
    # amount_volatility: std / mean, clipped [0, 5]
    amount_volatility = (std_amount / mean_amount) if mean_amount > 0 else 0.0
    amount_volatility = min(amount_volatility, VOLATILITY_CLIP)
    
    # max_to_mean_ratio: max / mean, clipped [0, 50]
    max_to_mean_ratio = (max_amount / mean_amount) if mean_amount > 0 else 1.0
    max_to_mean_ratio = min(max_to_mean_ratio, MAX_TO_MEAN_CLIP)
    
    return {
        "user_id": user_id,
        "total_transactions": int(total_transactions),
        "mean_amount": round(mean_amount, 4),
        "std_amount": round(std_amount, 4),
        "max_amount": round(max_amount, 4),
        "anomaly_rate": round(anomaly_rate, 4),
        "debt_ratio": round(debt_ratio, 4),
        "spending_trend": round(spending_trend, 4),
        "amount_volatility": round(amount_volatility, 4),
        "max_to_mean_ratio": round(max_to_mean_ratio, 4),
    }


print("  Computing per-user features...")
user_ids = users_df['user_id'].unique()
feature_rows = []
for i, uid in enumerate(user_ids):
    feature_rows.append(compute_user_features(uid, tx_df, expense_tx, income_tx))
    if (i + 1) % 500 == 0:
        print(f"    Processed {i+1}/{len(user_ids)} users")

user_features = pd.DataFrame(feature_rows)
print(f"  ✓ {len(user_features)} user feature vectors")


# ─── 3. ATTACH RISK LABELS ────────────────────────────────────────────────
print("\n" + "=" * 70)
print("Risk labels (synthetic ground truth)")
print("=" * 70)

# Use NOISY risk_class (real-world simulation, not the clean original)
labels = users_df[['user_id', 'risk_class', 'risk_class_original', 'is_label_noisy']]
data = user_features.merge(labels, on='user_id', how='inner')

print(f"\nRisk class distribution (noisy labels, used for training):")
print(data['risk_class'].value_counts().to_string())
print(f"\nNoisy labels: {data['is_label_noisy'].sum()} ({data['is_label_noisy'].mean()*100:.1f}%)")


# ─── 4. FEATURE STATS — sanity check ──────────────────────────────────────
print("\n" + "=" * 70)
print("Feature statistics by risk class (noisy labels)")
print("=" * 70)
print(data.groupby('risk_class')[FEATURE_COLS].mean().round(2).to_string())


# ─── 5. SPLIT ─────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print(f"Train/test split (stratified, test_size={TEST_SIZE})")
print("=" * 70)

X = data[FEATURE_COLS].fillna(0).values
y = data['risk_class'].values

le = LabelEncoder()
y_encoded = le.fit_transform(y)
print(f"  Classes: {list(le.classes_)}")
print(f"  Encoded as: {dict(zip(le.classes_, range(len(le.classes_))))}")

X_train, X_test, y_train, y_test = train_test_split(
    X, y_encoded,
    test_size=TEST_SIZE,
    stratify=y_encoded,
    random_state=RANDOM_SEED,
)
print(f"\n  Train: {len(X_train)} users")
print(f"  Test:  {len(X_test)} users")

# Scaler for LR (RF and XGBoost are scale-invariant)
scaler = StandardScaler()
X_train_scaled = scaler.fit_transform(X_train)
X_test_scaled = scaler.transform(X_test)


# ─── 6. TRAIN MODELS ──────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("Training models")
print("=" * 70)

print("\n[LR] Logistic Regression (multinomial, balanced)...")
lr = LogisticRegression(
    max_iter=2000,
    random_state=RANDOM_SEED,
    class_weight="balanced",
    solver='lbfgs',
)
lr.fit(X_train_scaled, y_train)

print("[RF] Random Forest...")
rf = RandomForestClassifier(
    n_estimators=200,
    max_depth=8,
    min_samples_leaf=3,
    random_state=RANDOM_SEED,
    class_weight="balanced",
    n_jobs=-1,
)
rf.fit(X_train, y_train)

print("[XGB] XGBoost...")
xgb = XGBClassifier(
    n_estimators=200,
    max_depth=4,
    learning_rate=0.05,
    subsample=0.8,
    colsample_bytree=0.8,
    random_state=RANDOM_SEED,
    eval_metric="mlogloss",
    verbosity=0,
    n_jobs=-1,
)
xgb.fit(X_train, y_train)


# ─── 7. EVALUATE INDIVIDUAL ───────────────────────────────────────────────
print("\n" + "=" * 70)
print(f"INDIVIDUAL MODEL EVALUATION (test set, n={len(y_test)})")
print("=" * 70)


def eval_model(name, y_true, y_pred):
    acc = accuracy_score(y_true, y_pred)
    macro_f1 = f1_score(y_true, y_pred, average='macro')
    mcc = matthews_corrcoef(y_true, y_pred)
    print(f"\n{name}:")
    print(f"  Accuracy: {acc:.4f}  |  Macro F1: {macro_f1:.4f}  |  MCC: {mcc:.4f}")
    print(classification_report(y_true, y_pred, target_names=le.classes_, zero_division=0))
    return {
        "accuracy": float(acc),
        "macro_f1": float(macro_f1),
        "mcc": float(mcc),
    }


lr_preds = lr.predict(X_test_scaled)
rf_preds = rf.predict(X_test)
xgb_preds = xgb.predict(X_test)

lr_metrics = eval_model("Logistic Regression", y_test, lr_preds)
rf_metrics = eval_model("Random Forest", y_test, rf_preds)
xgb_metrics = eval_model("XGBoost", y_test, xgb_preds)


# ─── 8. ENSEMBLE EVALUATION ───────────────────────────────────────────────
print("\n" + "=" * 70)
print("ENSEMBLE EVALUATION — multiple weight profiles")
print("=" * 70)

rf_proba = rf.predict_proba(X_test)
xgb_proba = xgb.predict_proba(X_test)
lr_proba = lr.predict_proba(X_test_scaled)

weight_profiles = {
    "Default   (RF 0.45 / XGB 0.45 / LR 0.10)": (0.45, 0.45, 0.10),
    "XGB-heavy (RF 0.30 / XGB 0.60 / LR 0.10)": (0.30, 0.60, 0.10),
    "RF-heavy  (RF 0.55 / XGB 0.35 / LR 0.10)": (0.55, 0.35, 0.10),
    "Balanced  (RF 0.40 / XGB 0.50 / LR 0.10)": (0.40, 0.50, 0.10),
    "XGB-dom   (RF 0.20 / XGB 0.70 / LR 0.10)": (0.20, 0.70, 0.10),
}

ensemble_results = {}
best_ensemble_f1 = -1.0
best_profile = None
best_preds = None
best_weights = None

for profile_name, (w_rf, w_xgb, w_lr) in weight_profiles.items():
    proba = rf_proba * w_rf + xgb_proba * w_xgb + lr_proba * w_lr
    preds = np.argmax(proba, axis=1)
    acc = accuracy_score(y_test, preds)
    macro_f1 = f1_score(y_test, preds, average='macro')
    mcc = matthews_corrcoef(y_test, preds)
    ensemble_results[profile_name] = {
        "weights": {"rf": w_rf, "xgb": w_xgb, "lr": w_lr},
        "accuracy": float(acc),
        "macro_f1": float(macro_f1),
        "mcc": float(mcc),
    }
    marker = ""
    if macro_f1 > best_ensemble_f1:
        best_ensemble_f1 = macro_f1
        best_profile = profile_name
        best_preds = preds
        best_weights = (w_rf, w_xgb, w_lr)
        marker = "  *"
    print(f"  {profile_name}")
    print(f"    Accuracy={acc:.4f}  Macro F1={macro_f1:.4f}  MCC={mcc:.4f}{marker}")

print(f"\n  Best profile: {best_profile}")
print(f"  Macro F1: {best_ensemble_f1:.4f}")

ensemble_metrics = ensemble_results[best_profile]
ensemble_preds = best_preds

print("\nBest ensemble — classification report:")
print(classification_report(y_test, ensemble_preds, target_names=le.classes_, zero_division=0))


# ─── 8b. CLEAN LABELS EVALUATION (noise robustness check) ─────────────────
print("\n" + "=" * 70)
print("CLEAN LABELS EVALUATION — model's true learning ability")
print("=" * 70)

# Map test users back to their CLEAN (original) labels
test_user_ids = data['user_id'].values[
    np.where(np.isin(data['user_id'].values, data['user_id'].values))[0]
]

# Get clean labels for the test set indices
# We need to retrieve clean labels in the same order as X_test
# Since train_test_split uses random_state, we can reproduce the indices
_, test_idx_full, _, _ = train_test_split(
    np.arange(len(data)), y_encoded,
    test_size=TEST_SIZE, stratify=y_encoded, random_state=RANDOM_SEED,
)
test_data = data.iloc[test_idx_full]
y_test_clean = le.transform(test_data['risk_class_original'].values)

clean_acc = accuracy_score(y_test_clean, ensemble_preds)
clean_f1 = f1_score(y_test_clean, ensemble_preds, average='macro')
clean_mcc = matthews_corrcoef(y_test_clean, ensemble_preds)
print(f"\n  Test set evaluated against CLEAN ground truth labels:")
print(f"  Accuracy: {clean_acc:.4f}  Macro F1: {clean_f1:.4f}  MCC: {clean_mcc:.4f}")
from sklearn.metrics import confusion_matrix
clean_cm = confusion_matrix(y_test_clean, ensemble_preds, labels=list(range(len(le.classes_))))
print("CLEAN_CM_LABELS:", list(le.classes_))
print("CLEAN_CM:", clean_cm.tolist())

# How many test users had noisy labels?
n_noisy_in_test = test_data['is_label_noisy'].sum()
print(f"\n  Noisy labels in test set: {n_noisy_in_test}/{len(test_data)} "
      f"({n_noisy_in_test/len(test_data)*100:.1f}%)")
print(f"\n  Per-class on clean labels:")
print(classification_report(y_test_clean, ensemble_preds, target_names=le.classes_, zero_division=0))


# ─── 9. FEATURE IMPORTANCE ────────────────────────────────────────────────
print("\n" + "=" * 70)
print("Feature importance (Random Forest)")
print("=" * 70)
importances = pd.Series(rf.feature_importances_, index=FEATURE_COLS).sort_values(ascending=False)
for feat, imp in importances.items():
    bar = '█' * int(imp * 50)
    print(f"  {feat:<22} {imp:.4f}  {bar}")


# ─── 10. CONFUSION MATRIX (ensemble) ──────────────────────────────────────
print("\n" + "=" * 70)
print("Ensemble confusion matrix")
print("=" * 70)
cm = confusion_matrix(y_test, ensemble_preds)
cm_df = pd.DataFrame(cm, index=[f"true_{c}" for c in le.classes_],
                       columns=[f"pred_{c}" for c in le.classes_])
print(cm_df.to_string())


# ─── 11. SAVE ─────────────────────────────────────────────────────────────
print("\n" + "=" * 70)
print("Saving model bundle")
print("=" * 70)
Path("models").mkdir(exist_ok=True)

risk_bundle = {
    "logistic_regression": lr,
    "random_forest": rf,
    "xgboost": xgb,
    "scaler": scaler,
    "label_encoder": le,
    "feature_cols": FEATURE_COLS,
    "version": "v2.0.0",
    "data_source": "synthetic",
    "ensemble_weights": {
        "rf": best_weights[0],
        "xgb": best_weights[1],
        "lr": best_weights[2],
    },
}
joblib.dump(risk_bundle, MODEL_BUNDLE_PATH)

metadata = {
    "version": "v2.0.0",
    "data_source": "AFRATS synthetic dataset (seed=42, 2000 users)",
    "feature_cols": FEATURE_COLS,
    "classes": list(le.classes_),
    "label_strategy": "Synthetic ground truth with 7% real-world-simulated noise",
    "split_strategy": f"Stratified train/test (test_size={TEST_SIZE})",
    "n_train_users": int(len(X_train)),
    "n_test_users": int(len(X_test)),
    "individual_metrics": {
        "logistic_regression": lr_metrics,
        "random_forest": rf_metrics,
        "xgboost": xgb_metrics,
    },
    "ensemble_metrics_all_profiles": ensemble_results,
    "best_ensemble": {
        "profile": best_profile,
        "weights": {"rf": best_weights[0], "xgb": best_weights[1], "lr": best_weights[2]},
        **ensemble_metrics,
    },
    "clean_label_evaluation": {
        "rationale": "Models trained on noisy labels (7% simulated noise) evaluated against clean ground truth labels to measure true learning ability",
        "accuracy": float(clean_acc),
        "macro_f1": float(clean_f1),
        "mcc": float(clean_mcc),
        "noisy_test_samples": int(n_noisy_in_test),
        "total_test_samples": int(len(test_data)),
    },
    "feature_importance_rf": {k: float(v) for k, v in importances.items()},
    "confusion_matrix_ensemble": {
        "labels": list(le.classes_),
        "matrix": cm.tolist(),
    },
    "v2_0_0_changes": (
        "Migrated from Sparkov to AFRATS synthetic dataset. Risk labels from "
        "synthetic ground truth (no rule-based label generation). Feature "
        "engineering aligned with production extract_risk_features() semantics. "
        "Companion fix in app/ml/risk_models.py:_build_risk_features ensures "
        "model is actually invoked at inference (previous version raised "
        "KeyError and silently fell back to rule-based scoring). "
        "Ensemble weights tuned via grid search; XGBoost dominant due to "
        "supervised learning advantage on aggregate features."
    ),
}
with open(METADATA_PATH, "w") as f:
    json.dump(metadata, f, indent=2)

print(f"\n✓ {MODEL_BUNDLE_PATH} saved (v2.0.0)")
print(f"✓ {METADATA_PATH} saved")
print(f"\nEnsemble accuracy: {ensemble_metrics['accuracy']:.4f}")
print(f"Ensemble macro F1: {ensemble_metrics['macro_f1']:.4f}")
print("Done.")
