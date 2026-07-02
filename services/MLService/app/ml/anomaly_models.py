import math
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
import logging

logger = logging.getLogger(__name__)

# Eşik değerleri
ZSCORE_THRESHOLD = 2.5
LOF_THRESHOLD = 1.5
IF_CONTAMINATION = 0.05
LOF_K_NEIGHBORS = 20

# Ensemble weights — v6.0.0 trained design (Strategy 3: Weighted Score Threshold).
# Tuned on the v2.1 synthetic dataset (~694K transactions, 4.66% anomaly rate),
# best F1 = 0.8134. XGBoost is the dominant signal because it learns non-linear
# interactions across the feature subset. LOF remains supplementary
# (consistent with John & Naaz, 2019).
#
# Production decision rule: is_anomaly = (ensemble_score >= ENSEMBLE_DECISION_THRESHOLD)
# This mirrors the training-time evaluation, preserving the reported F1.
WEIGHT_ZSCORE = 0.30
WEIGHT_IF     = 0.20
WEIGHT_XGB    = 0.45
WEIGHT_LOF    = 0.05
ENSEMBLE_DECISION_THRESHOLD = 0.5


def _avg_path_length(n: int) -> float:
    """
    Average path length of unsuccessful BST search — IF baseline metric.
    Reference: Liu et al. (2008) 'Isolation Forest'.
    """
    if n <= 1:
        return 0.0
    if n == 2:
        return 1.0
    return 2.0 * (math.log(n - 1) + 0.5772156649) - 2.0 * (n - 1) / n


class IsolationForestDetector:
    def __init__(self, model=None):
        self.model = model or IsolationForest(
            n_estimators=100,
            contamination=IF_CONTAMINATION,
            random_state=42
        )

    def predict(self, features_df: pd.DataFrame) -> dict:
        try:
            raw_score = self.model.decision_function(features_df)[0]
            normalized_score = float(
                1 / (1 + np.exp(5 * raw_score))
            )
            is_anomaly = self.model.predict(features_df)[0] == -1

            max_samples = getattr(self.model, "max_samples_", 256)
            avg_path = _avg_path_length(max_samples)

            try:
                inner = 0.5 - raw_score
                if inner <= 0:
                    isolation_depth = 0.0
                elif inner >= 1:
                    isolation_depth = avg_path * 2.0
                else:
                    isolation_depth = max(
                        0.0,
                        -math.log2(inner) * avg_path
                    )
            except (ValueError, OverflowError):
                isolation_depth = avg_path

            metrics = {
                "isolationDepth": round(float(isolation_depth), 2),
                "averagePathLength": round(float(avg_path), 2),
                "contamination": IF_CONTAMINATION
            }

            return {
                "score": round(normalized_score, 4),
                "isAnomaly": bool(is_anomaly),
                "raw_score": float(raw_score),
                "metrics": metrics
            }
        except Exception as e:
            logger.error(f"IsolationForest prediction failed: {e}")
            return self._fallback(features_df)

    def _fallback(self, features_df: pd.DataFrame) -> dict:
        amount = features_df["amt"].iloc[0]
        mean = features_df["user_mean"].iloc[0]
        score = min(amount / (mean * 3), 1.0) if mean > 0 else 0.5
        return {
            "score": round(float(score), 4),
            "isAnomaly": score > 0.7,
            "raw_score": 0.0,
            "metrics": {
                "isolationDepth": 0.0,
                "averagePathLength": 0.0,
                "contamination": IF_CONTAMINATION
            }
        }


class ZScoreDetector:
    def predict(self, features_df: pd.DataFrame) -> dict:
        try:
            zscore = abs(float(features_df["amount_zscore"].iloc[0]))
            normalized_score = min(zscore / 5.0, 1.0)
            is_anomaly = zscore > ZSCORE_THRESHOLD

            amount = float(features_df["amt"].iloc[0])
            user_mean = float(features_df["user_mean"].iloc[0])

            if "user_std" in features_df.columns:
                user_std = float(features_df["user_std"].iloc[0])
            elif zscore > 0:
                user_std = abs(amount - user_mean) / zscore
            else:
                user_std = 0.0

            metrics = {
                "threshold": ZSCORE_THRESHOLD,
                "userMean": round(user_mean, 2),
                "userStdDev": round(user_std, 2)
            }

            return {
                "score": round(normalized_score, 4),
                "isAnomaly": bool(is_anomaly),
                "zscore": round(zscore, 4),
                "metrics": metrics
            }
        except Exception as e:
            logger.error(f"ZScore prediction failed: {e}")
            return {
                "score": 0.5,
                "isAnomaly": False,
                "zscore": 0.0,
                "metrics": {
                    "threshold": ZSCORE_THRESHOLD,
                    "userMean": 0.0,
                    "userStdDev": 0.0
                }
            }


class LOFDetector:
    """
    Density-based supplementary detector.

    LOF is distance-based and scale-sensitive. The same StandardScaler used
    at training time must be applied before inference, otherwise large-range
    features (e.g. days_since_last_in_category) dominate the density
    computation and produce uniformly high anomaly rates.
    """

    def __init__(self, model=None, scaler=None):
        self.model = model
        self.scaler = scaler
        self._fallback_lof = LocalOutlierFactor(
            n_neighbors=LOF_K_NEIGHBORS,
            contamination=IF_CONTAMINATION,
            novelty=False
        )
        self._fitted = False

    def predict(self, features_df: pd.DataFrame) -> dict:
        try:
            if self.model is not None:
                # Apply the StandardScaler from training. Without this,
                # LOF density estimates are dominated by features with
                # large numeric ranges and produce ~100% false positives.
                if self.scaler is not None:
                    X = self.scaler.transform(features_df)
                else:
                    # Legacy bundles without scaler — pass DataFrame so
                    # sklearn preserves feature names (silences warning).
                    X = features_df

                raw_score = self.model.decision_function(X)[0]
                local_density_ratio = -float(raw_score) + 1.0
                normalized_score = float(
                    1 / (1 + np.exp(5 * raw_score))
                )
                is_anomaly = self.model.predict(X)[0] == -1

                metrics = {
                    "threshold": LOF_THRESHOLD,
                    "kNeighbors": LOF_K_NEIGHBORS,
                    "localDensityRatio": round(local_density_ratio, 2)
                }

                return {
                    "score": round(normalized_score, 4),
                    "isAnomaly": bool(is_anomaly),
                    "raw_score": float(raw_score),
                    "metrics": metrics
                }
            else:
                return self._rule_based_fallback(features_df)
        except Exception as e:
            logger.error(f"LOF prediction failed: {e}", exc_info=True)
            return self._rule_based_fallback(features_df)

    def _rule_based_fallback(self, features_df: pd.DataFrame) -> dict:
        zscore = abs(float(features_df["amount_zscore"].iloc[0]))
        category_freq = float(features_df["category_freq"].iloc[0])
        score = min((zscore / 4.0) * (1 - category_freq), 1.0)
        approx_density = round(1.0 + score, 2)
        return {
            "score": round(float(score), 4),
            "isAnomaly": score > 0.6,
            "raw_score": 0.0,
            "metrics": {
                "threshold": LOF_THRESHOLD,
                "kNeighbors": LOF_K_NEIGHBORS,
                "localDensityRatio": approx_density
            }
        }


class AnomalyEnsemble:
    """
    Four-algorithm ensemble: Z-Score + IF + LOF + XGBoost (v6.0.0).

    Decision logic:
      A transaction is anomalous when the weighted ensemble score crosses
      ENSEMBLE_DECISION_THRESHOLD. This single rule mirrors the training-time
      evaluation (Strategy 3) that produced F1 = 0.8134 on the v2.1 dataset.
      No per-algorithm gating — every algorithm contributes proportional to
      its trained weight.

    XGBoost is optional (xgb_model=None) for backward compatibility with
    older bundles; in that case it is skipped and contributes 0 to the score.
    """

    def __init__(self, if_model=None, lof_model=None, lof_scaler=None,
                 xgb_model=None, xgb_features=None):
        self.if_detector = IsolationForestDetector(if_model)
        self.zscore_detector = ZScoreDetector()
        self.lof_detector = LOFDetector(lof_model, scaler=lof_scaler)
        self.xgb_model = xgb_model            # XGBoostDetector instance or None
        self.xgb_features = xgb_features      # column subset list or None

    def _predict_xgboost(self, features_df: pd.DataFrame) -> dict:
        """Run XGBoost or skip gracefully if model is missing.

        Skipped predictions return score=0 so the weighted ensemble simply
        loses the XGB contribution; remaining algorithms still produce
        a meaningful score.
        """
        if self.xgb_model is None:
            return {
                "score": 0.0,
                "isAnomaly": False,
                "metrics": {"skipped": True}
            }
        try:
            # Slice to XGBoost's training feature subset in the trained order.
            if self.xgb_features:
                X = features_df[self.xgb_features]
            else:
                X = features_df

            proba = float(self.xgb_model.predict_proba(X)[0])
            threshold = float(getattr(self.xgb_model, "threshold", 0.5))

            return {
                "score": round(proba, 4),
                "isAnomaly": bool(proba >= threshold),
                "metrics": {
                    "threshold": threshold,
                    "probability": round(proba, 4)
                }
            }
        except Exception as e:
            logger.error(f"XGBoost prediction failed: {e}", exc_info=True)
            return {
                "score": 0.0,
                "isAnomaly": False,
                "metrics": {"error": str(e)[:100]}
            }

    def predict(self, features_df: pd.DataFrame) -> dict:
        if_result     = self.if_detector.predict(features_df)
        zscore_result = self.zscore_detector.predict(features_df)
        lof_result    = self.lof_detector.predict(features_df)
        xgb_result    = self._predict_xgboost(features_df)

        algorithm_results = {
            "isolationForest": {
                "score": if_result["score"],
                "isAnomaly": if_result["isAnomaly"],
                "metrics": if_result.get("metrics", {})
            },
            "zScore": {
                "score": zscore_result["score"],
                "isAnomaly": zscore_result["isAnomaly"],
                "metrics": zscore_result.get("metrics", {})
            },
            "lof": {
                "score": lof_result["score"],
                "isAnomaly": lof_result["isAnomaly"],
                "metrics": lof_result.get("metrics", {})
            },
            "xgboost": {
                "score": xgb_result["score"],
                "isAnomaly": xgb_result["isAnomaly"],
                "metrics": xgb_result.get("metrics", {})
            }
        }

        anomaly_votes = sum([
            if_result["isAnomaly"],
            zscore_result["isAnomaly"],
            lof_result["isAnomaly"],
            xgb_result["isAnomaly"]
        ])

        # Trained weighted-score: Z 0.30 / IF 0.20 / XGB 0.45 / LOF 0.05.
        ensemble_score = round(
            (zscore_result["score"] * WEIGHT_ZSCORE +
             if_result["score"]     * WEIGHT_IF +
             xgb_result["score"]    * WEIGHT_XGB +
             lof_result["score"]    * WEIGHT_LOF),
            4
        )

        # Binary decision: weighted-score threshold (Strategy 3, F1=0.8134).
        is_anomaly = ensemble_score >= ENSEMBLE_DECISION_THRESHOLD

        explanation = _build_explanation(
            is_anomaly,
            anomaly_votes,
            features_df
        )

        return {
            "isAnomaly": is_anomaly,
            "anomalyScore": ensemble_score,
            "algorithmResults": algorithm_results,
            "explanation": explanation,
            "votes": anomaly_votes
        }


def _build_explanation(
    is_anomaly: bool,
    votes: int,
    features_df: pd.DataFrame
) -> str:
    if not is_anomaly:
        return "Transaction is within normal spending patterns."

    amount = features_df["amt"].iloc[0]
    mean = features_df["user_mean"].iloc[0]
    zscore = abs(features_df["amount_zscore"].iloc[0])
    reasons = []

    if zscore > ZSCORE_THRESHOLD:
        reasons.append(
            f"Amount ({amount:.2f}) is {zscore:.1f} standard "
            f"deviations above user average ({mean:.2f})."
        )
    if "category_freq" in features_df.columns and features_df["category_freq"].iloc[0] < 0.05:
        reasons.append("Transaction in an unusual category for this user.")
    if "category_zscore" in features_df.columns:
        cat_z = abs(features_df["category_zscore"].iloc[0])
        if cat_z > 2.5:
            reasons.append(
                f"Amount is {cat_z:.1f} standard deviations above "
                f"this category's typical spend."
            )
    if not reasons:
        reasons.append(
            f"Transaction amount significantly exceeds user's "
            f"typical spending pattern. ({votes}/4 algorithms flagged)"
        )

    return " ".join(reasons)

# ──────────────────────────────────────────────────────────────────────
# XGBoostDetector — 4th algorithm (supervised)
# Trained on business-rule-derived labels from Sparkov.
# Returns calibrated anomaly probability in [0, 1].
# ──────────────────────────────────────────────────────────────────────

import xgboost as xgb
import numpy as np
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split


class XGBoostDetector:
    """
    Supervised XGBoost classifier — 4th algorithm in AFRATS ensemble.

    Role: Learns non-linear interactions between deterministic features
          to predict the rule-based anomaly label. Provides calibrated
          probabilities for the ensemble score.
    """

    VERSION = "1.0.0"

    def __init__(
        self,
        n_estimators: int = 400,
        max_depth: int = 6,
        learning_rate: float = 0.08,
        scale_pos_weight: float = 23.0,   # ≈ (1 − 0.0414) / 0.0414
        subsample: float = 0.9,
        colsample_bytree: float = 0.9,
        min_child_weight: float = 3,
        reg_lambda: float = 1.5,
        threshold: float = 0.5,
        random_state: int = 42,
    ):
        self.params = dict(
            n_estimators=n_estimators,
            max_depth=max_depth,
            learning_rate=learning_rate,
            scale_pos_weight=scale_pos_weight,
            subsample=subsample,
            colsample_bytree=colsample_bytree,
            min_child_weight=min_child_weight,
            reg_lambda=reg_lambda,
            objective="binary:logistic",
            eval_metric="aucpr",
            tree_method="hist",
            random_state=random_state,
            n_jobs=-1,
        )
        self.model = xgb.XGBClassifier(**self.params)
        self.scaler = StandardScaler()
        self.feature_names: list[str] | None = None
        self.threshold: float = threshold
        self._is_fitted: bool = False

    def fit(self, X, y, feature_names: list[str] | None = None):
        self.feature_names = feature_names
        X_scaled = self.scaler.fit_transform(X)

        X_tr, X_val, y_tr, y_val = train_test_split(
            X_scaled, y, test_size=0.15, stratify=y, random_state=42
        )

        self.model.fit(
            X_tr, y_tr,
            eval_set=[(X_val, y_val)],
            verbose=False,
        )
        self._is_fitted = True
        return self

    def predict(self, X) -> np.ndarray:
        if not self._is_fitted:
            raise RuntimeError("XGBoostDetector not fitted")
        return (self.predict_proba(X) >= self.threshold).astype(int)

    def predict_proba(self, X) -> np.ndarray:
        if not self._is_fitted:
            raise RuntimeError("XGBoostDetector not fitted")
        X_scaled = self.scaler.transform(X)
        return self.model.predict_proba(X_scaled)[:, 1]

    def score(self, X) -> np.ndarray:
        """Alias for predict_proba — ensemble uyumu için."""
        return self.predict_proba(X)

    def get_feature_importance(self) -> dict:
        if self.feature_names is None:
            return {f"f{i}": v for i, v in enumerate(self.model.feature_importances_)}
        return dict(sorted(
            zip(self.feature_names, self.model.feature_importances_),
            key=lambda kv: kv[1],
            reverse=True,
        ))