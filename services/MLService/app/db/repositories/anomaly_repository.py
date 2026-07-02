from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone
import logging

from app.db.models import AnomalyLog

logger = logging.getLogger(__name__)


class AnomalyRepository:

    def __init__(self, db: Session):
        self.db = db

    def create(self, anomaly_log: AnomalyLog) -> AnomalyLog:
        try:
            self.db.add(anomaly_log)
            self.db.commit()
            self.db.refresh(anomaly_log)
            return anomaly_log
        except Exception as e:
            self.db.rollback()
            logger.error(f"AnomalyRepository.create failed: {e}", exc_info=True)
            raise

    def create_bulk(self, logs: list[AnomalyLog]) -> None:
        try:
            self.db.add_all(logs)
            self.db.commit()
        except Exception as e:
            self.db.rollback()
            logger.error(f"AnomalyRepository.create_bulk failed: {e}", exc_info=True)
            raise

    def get_by_transaction(
        self, transaction_id: str
    ) -> list[AnomalyLog]:
        return (
            self.db.query(AnomalyLog)
            .filter(AnomalyLog.TransactionId == transaction_id)
            .all()
        )

    def get_by_user(
        self,
        user_id: str,
        page: int = 1,
        page_size: int = 20,
        status: str | None = None
    ) -> tuple[list[AnomalyLog], int]:
        """
        Returns ALL algorithm rows for a user (grouping is frontend's job).
        Filters by status if provided.

        Pagination is by *transaction count*, not row count — we paginate the
        Ensemble rows and then fetch all sibling rows for those transactions.
        This guarantees each page contains exactly `page_size` distinct
        transactions with all 4 algorithm rows each.
        """
        # Step 1: paged list of Ensemble rows (one per transaction)
        ensemble_query = (
            self.db.query(AnomalyLog)
            .filter(
                AnomalyLog.UserId == user_id,
                AnomalyLog.AlgorithmName == "Ensemble",
                AnomalyLog.IsAnomaly == True
            )
        )
        if status:
            ensemble_query = ensemble_query.filter(AnomalyLog.Status == status)

        total_count = ensemble_query.count()

        ensemble_rows = (
            ensemble_query
            .order_by(desc(AnomalyLog.DetectedAt))
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        if not ensemble_rows:
            return [], total_count

        # Step 2: fetch all sibling rows (IF, ZScore, LOF) for those transactions
        transaction_ids = [r.TransactionId for r in ensemble_rows]
        sibling_rows = (
            self.db.query(AnomalyLog)
            .filter(
                AnomalyLog.UserId == user_id,
                AnomalyLog.TransactionId.in_(transaction_ids),
                AnomalyLog.AlgorithmName != "Ensemble"
            )
            .all()
        )

        all_rows = ensemble_rows + sibling_rows
        return all_rows, total_count

    def count_by_user(self, user_id: str) -> dict:
        """
        Tek kullanıcı için anomaly özet sayıları — Admin user drawer için.
        Sadece Ensemble row'ları (IsAnomaly=True) sayılır; her transaction tek
        kez (algorithm row'ları değil).
        """
        base = (
            self.db.query(AnomalyLog)
            .filter(
                AnomalyLog.UserId == user_id,
                AnomalyLog.AlgorithmName == "Ensemble",
                AnomalyLog.IsAnomaly == True
            )
        )
        total      = base.count()
        confirmed  = base.filter(AnomalyLog.Status == "Confirmed").count()
        pending    = base.filter(AnomalyLog.Status == "Pending").count()
        return {
            "totalAnomalies":     total,
            "confirmedAnomalies": confirmed,
            "pendingAnomalies":   pending,
        }

    def update_status_by_transaction(
        self,
        transaction_id: str,
        user_id: str,
        new_status: str
    ) -> bool:
        """
        Updates Status + ReviewedAt across ALL algorithm rows for one transaction.
        Authorization check via user_id filter — user can only update own logs.
        Returns True if rows were updated, False if not found.
        """
        try:
            updated = (
                self.db.query(AnomalyLog)
                .filter(
                    AnomalyLog.TransactionId == transaction_id,
                    AnomalyLog.UserId == user_id
                )
                .update(
                    {
                        AnomalyLog.Status: new_status,
                        AnomalyLog.ReviewedAt: datetime.now(timezone.utc)
                    },
                    synchronize_session=False
                )
            )
            self.db.commit()
            return updated > 0
        except Exception as e:
            self.db.rollback()
            logger.error(
                f"AnomalyRepository.update_status_by_transaction failed: {e}",
                exc_info=True
            )
            raise
