from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import Optional
from datetime import datetime, timezone, timedelta
import logging

from app.db.models import RiskScore

logger = logging.getLogger(__name__)


class RiskRepository:

    def __init__(self, db: Session):
        self.db = db

    def create(self, risk_score: RiskScore) -> RiskScore:
        try:
            self.db.add(risk_score)
            self.db.commit()
            self.db.refresh(risk_score)
            return risk_score
        except Exception as e:
            self.db.rollback()
            logger.error(f"RiskRepository.create failed: {e}", exc_info=True)
            raise

    def get_current(self, user_id: str) -> Optional[RiskScore]:
        return (
            self.db.query(RiskScore)
            .filter(RiskScore.UserId == user_id)
            .order_by(desc(RiskScore.CalculatedAt))
            .first()
        )

    def get_history(
        self,
        user_id: str,
        months: int = 6,
        limit: Optional[int] = None,
    ) -> list[RiskScore]:
        """
        İki mod:
          - `limit` verilirse: en son N risk score kaydı (count-based pencere).
            Admin drawer sparkline'ı bu modu kullanır — sabit X-ekseni için.
          - `limit` None ise: son `months` aylık tarih penceresi (time-based).
            User-facing /risk/history endpoint'i bu modu kullanır — "son 6 ayım"
            kullanıcı için anlamlı.
        Her iki modda da sonuç DESC (yeniden eskiye) döner — caller gerekirse
        reverse eder.
        """
        query = (
            self.db.query(RiskScore)
            .filter(RiskScore.UserId == user_id)
            .order_by(desc(RiskScore.CalculatedAt))
        )
        if limit is not None:
            return query.limit(limit).all()
        cutoff = datetime.now(timezone.utc) - timedelta(days=months * 30)
        return query.filter(RiskScore.CalculatedAt >= cutoff).all()

    def get_high_risk_users(
        self,
        page: int = 1,
        page_size: int = 20
    ) -> list[RiskScore]:
        return (
            self.db.query(RiskScore)
            .filter(RiskScore.Level == "High")
            .order_by(desc(RiskScore.CalculatedAt))
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )