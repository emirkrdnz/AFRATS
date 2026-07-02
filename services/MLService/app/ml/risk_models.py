import numpy as np
import pandas as pd
import logging

logger = logging.getLogger(__name__)

# Risk seviyeleri
RISK_LOW_THRESHOLD = 40
RISK_HIGH_THRESHOLD = 70


class RiskScoreCalculator:
    """
    Risk skoru hesaplayıcı.
    Model varsa LR + RF + XGB ensemble kullanır.
    Model yoksa kural tabanlı hesaplama yapar.
    """

    def __init__(self, risk_model=None):
        self.risk_model = risk_model

    def calculate(
        self,
        features: dict,
        is_anomaly: bool
    ) -> dict:
        # Insufficient-data short circuit:
        # When the user has <10 expense transactions, the anomaly path
        # returns features={} and the risk model would otherwise be invoked
        # with default placeholders (debt=0.5, anomaly=0, trend=1.0),
        # producing inconsistent scores in the 15-20 range. We instead
        # return a fixed low-risk default — explicit and honest about the
        # lack of data. Score = 10 anchors the bottom of the documented
        # 10-90 scale.
        total_tx = float(features.get("total_transactions", 0))
        if total_tx < 10:
            return {
                "score": 10.0,
                "level": "Low",
                "factors": {
                    "anomaly_weight": 0.0,
                    "debt_ratio": round(float(features.get("debt_ratio", 0.5)), 4),
                    "spending_trend": round(float(features.get("spending_trend", 1.0)), 4),
                    "insufficient_data": True,
                }
            }
        if self.risk_model is not None:
            return self._model_based(features, is_anomaly)
        return self._rule_based(features, is_anomaly)

    def _model_based(self, features: dict, is_anomaly: bool) -> dict:
        try:
            bundle = self.risk_model
            rf = bundle["random_forest"]
            xgb = bundle["xgboost"]
            lr = bundle["logistic_regression"]
            scaler = bundle["scaler"]
            le = bundle["label_encoder"]
            feature_cols = bundle["feature_cols"]

            features_df = self._build_risk_features(features, is_anomaly)

            # Sütun sırası önemli — feature_cols sıralamasına göre seç.
            # Modeller training-time'da numpy ile fit edildi (train_risk_model.py:207
            # `.values`); inference'ta DataFrame geçirmek sklearn "feature names"
            # uyarısını tetikliyor. DataFrame'i ndarray'e çeviriyoruz — model
            # davranışı değişmez, sadece uyarı susar.
            X = features_df[feature_cols].values
            X_scaled = scaler.transform(X)

            # Probability tahminleri
            rf_proba = rf.predict_proba(X)[0]
            xgb_proba = xgb.predict_proba(X)[0]
            lr_proba = lr.predict_proba(X_scaled)[0]

            # Ağırlıklı ensemble — bundle'dan oku (v2.0.0 trained: rf 0.20 / xgb 0.70 / lr 0.10).
            # Default eski hardcoded davranışla geri uyumlu — eski bundle'larda key yoksa.
            weights = bundle.get("ensemble_weights") or {"rf": 0.45, "xgb": 0.45, "lr": 0.10}
            ensemble_proba = (
                rf_proba  * weights.get("rf", 0.45) +
                xgb_proba * weights.get("xgb", 0.45) +
                lr_proba  * weights.get("lr", 0.10)
            )

            pred_class = le.classes_[np.argmax(ensemble_proba)]

            # 3-class weighted interpolation → continuous score in [15, 90].
            # Previous mapping was a discrete class table {Low:20, Medium:55,
            # High:85} + a ±10 adjustment from high_proba. That produced
            # structural gaps at 30-45 and 65-75 because no combination of
            # base + adjustment could land there: Low topped out at 30 and
            # Medium started at 45; Medium topped at 65 and High started at 75.
            # The new formula spreads scores smoothly across the full range
            # by treating each class probability as a soft weight. It is
            # monotonic in high_proba (and inversely in low_proba), so the
            # ordering Low < Medium < High is preserved.
            classes = list(le.classes_)
            low_idx  = classes.index("Low")
            med_idx  = classes.index("Medium")
            high_idx = classes.index("High")
            low_p  = float(ensemble_proba[low_idx])
            med_p  = float(ensemble_proba[med_idx])
            high_p = float(ensemble_proba[high_idx])

            # Anchors set to {10, 55, 90} so the ML-only score range stays
            # in 10-90 — matching the documented behavior. Pure-Low predictions
            # land at 10, pure-High at 90. Override floors below stay inside
            # this range too (max floor = 90 at debt_ratio = 2.0).
            CLASS_ANCHORS = {"Low": 10.0, "Medium": 55.0, "High": 90.0}
            risk_score = round(
                low_p  * CLASS_ANCHORS["Low"] +
                med_p  * CLASS_ANCHORS["Medium"] +
                high_p * CLASS_ANCHORS["High"],
                2
            )
            risk_score = max(0.0, min(100.0, risk_score))

            return self._build_result(risk_score, features, is_anomaly)

        except Exception as e:
            logger.error(
                f"Model-based risk calculation failed: {e}",
                exc_info=True
            )
            return self._rule_based(features, is_anomaly)

    def _rule_based(
        self,
        features: dict,
        is_anomaly: bool
    ) -> dict:
        score = 0.0

        # Anomali ağırlığı (0-40 puan)
        anomaly_rate = float(features.get("anomaly_rate", 0))
        anomaly_weight = min(anomaly_rate * 200, 40)
        if is_anomaly:
            anomaly_weight = min(anomaly_weight + 20, 40)

        # Borç/gelir oranı (0-55 puan)
        debt_ratio = float(features.get("debt_ratio", 0.5))
        if debt_ratio >= 2.0:
            debt_weight = 55
        elif debt_ratio >= 1.5:
            debt_weight = 50
        elif debt_ratio >= 1.0:
            debt_weight = 40
        elif debt_ratio >= 0.8:
            debt_weight = 25
        else:
            debt_weight = min(debt_ratio * 40, 40)

        # Harcama trendi (0-25 puan)
        spending_trend = float(features.get("spending_trend", 1.0))
        trend_weight = min(max(spending_trend - 1.0, 0) * 25, 25)

        score = round(anomaly_weight + debt_weight + trend_weight, 2)
        score = max(0.0, min(100.0, score))

        return self._build_result(score, features, is_anomaly)

    def _build_risk_features(
        self,
        features: dict,
        is_anomaly: bool
    ) -> pd.DataFrame:
        """
        Build a single-row DataFrame matching the 9 columns trained on:
            total_transactions, mean_amount, std_amount, max_amount,
            anomaly_rate, debt_ratio, spending_trend,
            amount_volatility, max_to_mean_ratio

        IMPORTANT (bug fix v2.0.0):
          The `features` dict is produced by feature_engineering.py
          (extract_features_from_event), which already merges anomaly + risk
          features. All 9 risk features are present as direct keys — no
          recomputation needed.

          The previous implementation re-derived max_amount and
          amount_volatility from anomaly-side keys (amount_to_mean_ratio,
          user_mean) that don't exist in the merged dict, raising KeyError
          and falling back to rule-based scoring (model never invoked in
          production).
        """
        return pd.DataFrame([{
            "total_transactions": float(features.get("total_transactions", 0)),
            "mean_amount":        float(features.get("mean_amount", 0.0)),
            "std_amount":         float(features.get("std_amount", 1.0)),
            "max_amount":         float(features.get("max_amount", 0.0)),
            "anomaly_rate":       float(features.get("anomaly_rate", 0.0)),
            "debt_ratio":         float(features.get("debt_ratio", 0.5)),
            "spending_trend":     float(features.get("spending_trend", 1.0)),
            "amount_volatility":  float(features.get("amount_volatility", 0.0)),
            "max_to_mean_ratio":  float(features.get("max_to_mean_ratio", 1.0)),
        }])

    def _build_result(
        self,
        score: float,
        features: dict,
        is_anomaly: bool
    ) -> dict:
        # Post-processing override — kritik iş kuralları.
        # Tezde savunulan "ML + business rules hybrid" tasarımının parçası.
        # Override gerçekten skoru değiştirdiğinde Factors.override_reasons listesine
        # human-readable bir kayıt eklenir (audit + tez için transparency).
        debt_ratio = float(features.get("debt_ratio", 0.5))
        anomaly_rate = float(features.get("anomaly_rate", 0))
        override_reasons: list[str] = []

        # debt-driven score floors — continuous in debt_ratio. Two segments,
        # each spanning a clean 10-point band:
        #   debt_ratio  1.0  → floor 55  ┐
        #   debt_ratio  1.25 → floor 60  │ Medium band (55-65)
        #   debt_ratio  1.49 → floor 64.8┘
        #   debt_ratio  1.5  → floor 80  ┐
        #   debt_ratio  1.75 → floor 85  │ High band  (80-90)
        #   debt_ratio  2.0  → floor 90  ┘ (debt_ratio is clipped to 2.0)
        # Both ML model output (10-90) and the override floors stay inside
        # the same 10-90 range — no score exceeds 90 by design.
        if debt_ratio >= 1.5:
            target_floor = round(80.0 + min(debt_ratio - 1.5, 0.5) * 20.0, 2)
            if score < target_floor:
                override_reasons.append(
                    f"debt_high: debt_ratio={debt_ratio:.2f}>=1.5 "
                    f"→ score floored to {target_floor} (model: {score:.2f})"
                )
                score = target_floor
        elif debt_ratio >= 1.0:
            target_floor = round(55.0 + (debt_ratio - 1.0) * 20.0, 2)
            if score < target_floor:
                override_reasons.append(
                    f"debt_medium: debt_ratio={debt_ratio:.2f}>=1.0 "
                    f"→ score floored to {target_floor} (model: {score:.2f})"
                )
                score = target_floor

        # Yüksek anomali oranı varsa → skoru artır
        if anomaly_rate >= 0.3:
            pre_boost = score
            score = min(score + 15, 100.0)
            if score > pre_boost:
                override_reasons.append(
                    f"anomaly_boost: anomaly_rate={anomaly_rate:.2f}>=0.3 "
                    f"→ +15 (score {pre_boost:.2f} → {score:.2f})"
                )

        level = self._get_level(score)
        factors = {
            "anomaly_weight": round(float(anomaly_rate) * 100, 2),
            "debt_ratio": round(debt_ratio, 4),
            "spending_trend": round(
                float(features.get("spending_trend", 1.0)), 4
            )
        }
        # Default pair (UI'da "Up 27% — May vs Apr" formatı için) +
        # tüm consecutive pair'lar (UI hover popover için).
        # Midpoint-aware: ayın ikinci yarısında current_partial vs last_complete
        # de eligible default olur, aksi halde son 2 complete ay (feature_engineering
        # tarafında _pick_default_pair'ın tek mantığı). 3 alan (ratio + months +
        # alternatives) hep tutarlı.
        months = features.get("spending_trend_months")
        if months:
            factors["spending_trend_months"] = months
        alternatives = features.get("spending_trend_alternatives")
        if alternatives:
            factors["spending_trend_alternatives"] = alternatives
        # Override transparency — sadece gerçekten override tetiklendiğinde dahil edilir.
        # Frontend `if (factors.override_reasons) { ... }` ile null-safe kontrol edebilir.
        if override_reasons:
            factors["override_reasons"] = override_reasons
        return {
            "score": round(score, 2),
            "level": level,
            "factors": factors
        }

    def _get_level(self, score: float) -> str:
        if score >= RISK_HIGH_THRESHOLD:
            return "High"
        elif score >= RISK_LOW_THRESHOLD:
            return "Medium"
        return "Low"
