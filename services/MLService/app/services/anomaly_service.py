import json
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.ml.anomaly_models import AnomalyEnsemble
from app.ml.feature_engineering import (
    extract_features_from_event,
    features_to_dataframe
)
from app.ml.model_manager import model_manager
from app.db.models import AnomalyLog
from app.db.repositories.anomaly_repository import AnomalyRepository
from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class AnomalyService:

    def __init__(self, db: Session):
        self.db = db
        self.repo = AnomalyRepository(db)
        self.ensemble = AnomalyEnsemble(
            if_model=model_manager.get_anomaly_model(),
            lof_model=model_manager.get_lof_model(),
            lof_scaler=model_manager.get_lof_scaler(),
            xgb_model=model_manager.get_xgboost_model(),
            xgb_features=model_manager.get_xgboost_features()
        )

    def analyze(self, event: dict) -> dict:
        transaction_id = event.get("transactionId")
        user_id = event.get("userId")

        logger.info(
            f"Analyzing transaction: {transaction_id} "
            f"for user: {user_id}"
        )

        if event.get("type") == "Income":
            logger.info(
                f"Income transaction — anomaly detection skipped: "
                f"{transaction_id}"
            )
            return self._income_result()

        user_history = event.get("userHistory", [])
        expense_history = [
            h for h in user_history
            if h.get("type") == "Expense"
        ]

        if len(expense_history) < 10:
            logger.info(
                f"Insufficient history ({len(expense_history)} expense transactions) "
                f"for transaction: {transaction_id} — rule-based fallback applied"
            )
            return self._insufficient_history_result(len(expense_history))

        try:
            features = extract_features_from_event(event, user_history)
            features_df = features_to_dataframe(features)

            result = self.ensemble.predict(features_df)

            # ── Rent affordability rule ──────────────────────────────────
            # The ensemble's Z-score detector flags rent every month because
            # the amount is several σ above the user's overall mean (which
            # is dominated by small grocery transactions). That isn't a
            # useful anomaly signal — the right question for rent is
            # "can the user afford it?" We compare rent against the user's
            # own monthly income:
            #
            #   amount ≤ monthly_income × 0.40  → affordable, not anomaly
            #   amount > monthly_income × 0.40  → keep ML decision (flag)
            #
            # The 40% threshold was chosen by inspecting flagged users:
            # 10-30% rent users were unanimously "normal" expectations,
            # 45-67% were "real affordability problem" cases. 40% is the
            # cleanest cut between the two clusters.
            #
            # Edge case: user has no income in window → skip the rule,
            # let ML's decision stand. (Anomaly suppression based on
            # income makes no sense without income data.)
            #
            # Bills are intentionally NOT covered — the ML pipeline does
            # not flag normal bills (typical 600-2000 TRY) in the first
            # place, so no rule is needed.
            if result["isAnomaly"] and event.get("categoryName") == "Rent":
                amount = float(features.get("amt", 0.0))
                income_amounts = [
                    float(tx.get("amount", 0))
                    for tx in user_history
                    if tx.get("type") == "Income"
                ]
                monthly_income = (
                    sum(income_amounts) / len(income_amounts)
                    if income_amounts else 0.0
                )
                threshold = monthly_income * 0.40
                if monthly_income > 0 and amount <= threshold:
                    logger.info(
                        f"Rent affordability suppression — "
                        f"amt={amount:.0f} ≤ 40% × {monthly_income:.0f} "
                        f"= {threshold:.0f}"
                    )
                    result["isAnomaly"] = False
                    result["anomalyScore"] = min(float(result["anomalyScore"]), 0.3)
                    result["explanation"] = (
                        f"Rent payment within affordability "
                        f"({amount:.0f} ≤ 40% × {monthly_income:.0f} = "
                        f"{threshold:.0f} TRY). Income-based rule applied."
                    )

            self._save_logs(
                transaction_id=transaction_id,
                user_id=user_id,
                result=result
            )

            logger.info(
                f"Analysis complete — "
                f"isAnomaly: {result['isAnomaly']} | "
                f"score: {result['anomalyScore']}"
            )

            logger.info(
                f"Features — "
                f"amt: {features.get('amt')} | "
                f"user_mean: {features.get('user_mean')} | "
                f"user_std: {features.get('user_std')} | "
                f"amount_zscore: {features.get('amount_zscore')}"
            )

            return {
                "features": features,
                "isAnomaly": result["isAnomaly"],
                "anomalyScore": result["anomalyScore"],
                "algorithmResults": result["algorithmResults"],
                "explanation": result["explanation"]
            }

        except Exception as e:
            logger.error(
                f"Analysis failed for transaction "
                f"{transaction_id}: {e}",
                exc_info=True
            )
            return self._fallback_result(transaction_id)

    def _income_result(self) -> dict:
        return {
            "features": {},
            "isAnomaly": False,
            "anomalyScore": 0.0,
            "algorithmResults": {
                "isolationForest": {"score": 0.0, "isAnomaly": False, "metrics": {}},
                "zScore": {"score": 0.0, "isAnomaly": False, "metrics": {}},
                "lof": {"score": 0.0, "isAnomaly": False, "metrics": {}},
                "xgboost": {"score": 0.0, "isAnomaly": False, "metrics": {}}
            },
            "explanation": "Income transaction — anomaly detection not applicable."
        }

    def _insufficient_history_result(self, history_count: int) -> dict:
        return {
            "features": {},
            "isAnomaly": False,
            "anomalyScore": 0.1,
            "algorithmResults": {
                "isolationForest": {"score": 0.0, "isAnomaly": False, "metrics": {}},
                "zScore": {"score": 0.0, "isAnomaly": False, "metrics": {}},
                "lof": {"score": 0.0, "isAnomaly": False, "metrics": {}},
                "xgboost": {"score": 0.0, "isAnomaly": False, "metrics": {}}
            },
            "explanation": (
                f"Insufficient transaction history ({history_count} expense records). "
                f"Minimum 10 required for reliable anomaly detection."
            )
        }

    def _save_logs(
            self,
            transaction_id: str,
            user_id: str,
            result: dict
    ) -> None:
        """
        Algoritma row'ları (IF, ZScore, LOF, XGBoost) + Ensemble row = 5 row toplam.
        Tek bulk insert, duplicate yok.

        Idempotency: RabbitMQ redelivery / broker restart durumunda aynı
        transaction.created event'i iki kez işlenebilir. Yazımdan önce mevcut
        satır var mı kontrol edip varsa skip ediyoruz. Single-consumer
        (prefetch_count=1) sayesinde race condition pratikte yok; multi-consumer
        scenario'da DB-level UNIQUE(TransactionId, AlgorithmName) constraint
        eklenmesi gerekir (Sprint B — Alembic migration ile birlikte).
        """
        existing = self.repo.get_by_transaction(transaction_id)
        if existing:
            logger.info(
                f"Anomaly logs already exist for transaction {transaction_id} "
                f"({len(existing)} rows) — skipping duplicate insert"
            )
            return

        logs = []
        algorithm_map = {
            "IsolationForest": "isolationForest",
            "ZScore": "zScore",
            "LOF": "lof",
            "XGBoost": "xgboost"
        }

        # Algoritma row'ları
        for algo_name, algo_key in algorithm_map.items():
            algo_result = result["algorithmResults"].get(algo_key, {})
            algo_metrics = algo_result.get("metrics", {})
            logs.append(AnomalyLog(
                TransactionId=transaction_id,
                UserId=user_id,
                AlgorithmName=algo_name,
                Score=float(algo_result.get("score", 0)),
                IsAnomaly=bool(algo_result.get("isAnomaly", False)),
                Explanation="",
                DetectedAt=datetime.now(timezone.utc),
                ModelVersion=settings.MODEL_VERSION,
                Status="Pending",
                Metrics=json.dumps(algo_metrics) if algo_metrics else None
            ))

        # Ensemble row — final karar
        ensemble_metrics = {
            "votes": result.get("votes", 0),
            "consensus": result.get("votes", 0)
        }
        logs.append(AnomalyLog(
            TransactionId=transaction_id,
            UserId=user_id,
            AlgorithmName="Ensemble",
            Score=float(result["anomalyScore"]),
            IsAnomaly=bool(result["isAnomaly"]),
            Explanation=result["explanation"],
            DetectedAt=datetime.now(timezone.utc),
            ModelVersion=settings.MODEL_VERSION,
            Status="Pending",
            Metrics=json.dumps(ensemble_metrics)
        ))

        self.repo.create_bulk(logs)

    def _fallback_result(self, transaction_id: str) -> dict:
        return {
            "features": {},
            "isAnomaly": False,
            "anomalyScore": 0.0,
            "algorithmResults": {
                "isolationForest": {"score": 0.0, "isAnomaly": False, "metrics": {}},
                "zScore": {"score": 0.0, "isAnomaly": False, "metrics": {}},
                "lof": {"score": 0.0, "isAnomaly": False, "metrics": {}},
                "xgboost": {"score": 0.0, "isAnomaly": False, "metrics": {}}
            },
            "explanation": "Analysis unavailable — fallback applied."
        }

    def get_anomalies_by_user(
        self,
        user_id: str,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None
    ) -> tuple[list, int]:
        return self.repo.get_by_user(
            user_id,
            page=page,
            page_size=page_size,
            status=status
        )

    def get_anomaly_detail(
        self,
        transaction_id: str,
        user_id: str
    ) -> list:
        logs = self.repo.get_by_transaction(transaction_id)
        return [
            log for log in logs
            if str(log.UserId) == str(user_id)
        ]

    def update_status(
        self,
        transaction_id: str,
        user_id: str,
        new_status: str
    ) -> bool:
        return self.repo.update_status_by_transaction(
            transaction_id=transaction_id,
            user_id=user_id,
            new_status=new_status
        )
