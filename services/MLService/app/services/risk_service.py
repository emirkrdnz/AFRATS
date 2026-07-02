import json
import logging
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.ml.risk_models import RiskScoreCalculator
from app.ml.model_manager import model_manager
from app.db.models import RiskScore
from app.db.repositories.risk_repository import RiskRepository
from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class RiskService:

    def __init__(self, db: Session):
        self.db = db
        self.repo = RiskRepository(db)
        self.calculator = RiskScoreCalculator(
            risk_model=model_manager.get_risk_bundle()  # ← güncellendi
        )

    def calculate_and_save(
        self,
        user_id: str,
        features: dict,
        is_anomaly: bool,
        trigger_type: str | None = None
    ) -> dict:
        """
        Risk skoru hesaplar ve DB'ye kaydeder.

        trigger_type: opsiyonel — "Income" verilirse factors'a triggered_by
        flag'i eklenir, get_current bu kayıtları atlayıp son expense-bazlı
        skoru döner (Dashboard'da maaş günü score sıfırlanmaz, chart yine
        income drop'unu gösterir).
        """
        try:
            result  = self.calculator.calculate(features, is_anomaly)
            factors = dict(result["factors"])  # mutable copy
            if trigger_type:
                factors["triggered_by"] = trigger_type
            result["factors"] = factors

            risk_score = RiskScore(
                UserId=user_id,
                Score=result["score"],
                Level=result["level"],
                Factors=json.dumps(factors),
                ModelVersion=settings.MODEL_VERSION,
                CalculatedAt=datetime.now(timezone.utc)
            )

            self.repo.create(risk_score)

            logger.info(
                f"Risk score saved — "
                f"user: {user_id} | "
                f"score: {result['score']} | "
                f"level: {result['level']} | "
                f"trigger: {trigger_type or 'Expense'}"
            )

            return result

        except Exception as e:
            logger.error(
                f"Risk calculation failed for user {user_id}: {e}"
            )
            return {
                "score": 0.0,
                "level": "Low",
                "factors": {
                    "anomaly_weight": 0.0,
                    "debt_ratio": 0.0,
                    "spending_trend": 1.0
                }
            }

    def get_current(self, user_id: str) -> dict | None:
        """
        Dashboard'da gösterilen "current risk score" — Income-triggered
        kayıtlar atlanır (maaş günü score sıfırlanmasın). Sadece expense-
        bazlı son risk skoru döner, factors da o kayıttan.

        Edge case: hiç expense risk skoru yoksa (sadece income tx olan user),
        yine de latest'i döner.
        """
        history = self.repo.get_history(user_id, months=6)
        # İlk Income-triggered olmayan kayıt
        for s in history:
            factors = json.loads(s.Factors) if s.Factors else {}
            if factors.get("triggered_by") != "Income":
                return {
                    "score": float(s.Score),
                    "level": s.Level,
                    "factors": factors,
                    "calculatedAt": s.CalculatedAt
                }
        # Hepsi income ise (edge case) latest'i dön
        if history:
            s = history[0]
            return {
                "score": float(s.Score),
                "level": s.Level,
                "factors": json.loads(s.Factors) if s.Factors else {},
                "calculatedAt": s.CalculatedAt
            }
        return None

    def get_history(self, user_id: str, months: int = 6, limit=None) -> list:
        # limit verilirse repo count-based mod; yoksa eski months-based pencere.
        scores = self.repo.get_history(user_id, months=months, limit=limit)
        return [
            {
                "score": float(s.Score),
                "level": s.Level,
                "factors": json.loads(s.Factors) if s.Factors else {},
                "calculatedAt": s.CalculatedAt
            }
            for s in scores
        ]

    def get_high_risk_users(
        self,
        page: int = 1
    ) -> list:
        scores = self.repo.get_high_risk_users(page=page)
        return [
            {
                "userId": str(s.UserId),
                "score": float(s.Score),
                "level": s.Level,
                "calculatedAt": s.CalculatedAt
            }
            for s in scores
        ]

    def get_admin_stats(self) -> dict:
        from sqlalchemy import func
        from app.db.models import RiskScore as RS

        db = self.db

        # Kullanıcı başına son skor — DB tarafında hesapla
        subq = (
            db.query(
                RS.UserId,
                func.max(RS.CalculatedAt).label("max_at")
            )
            .group_by(RS.UserId)
            .subquery()
        )

        latest_scores = (
            db.query(RS)
            .join(
                subq,
                (RS.UserId == subq.c.UserId) &
                (RS.CalculatedAt == subq.c.max_at)
            )
            .all()
        )

        if not latest_scores:
            return {
                "totalUsers": 0,
                "highRiskCount": 0,
                "mediumRiskCount": 0,
                "lowRiskCount": 0,
                "averageScore": 0.0
            }

        scores = [float(getattr(s, "Score")) for s in latest_scores]

        return {
            "totalUsers": len(latest_scores),
            "highRiskCount": sum(1 for s in latest_scores if getattr(s, "Level") == "High"),
            "mediumRiskCount": sum(1 for s in latest_scores if getattr(s, "Level") == "Medium"),
            "lowRiskCount": sum(1 for s in latest_scores if getattr(s, "Level") == "Low"),
            "averageScore": round(sum(scores) / len(scores), 2)
        }