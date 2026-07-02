from sqlalchemy import (
    Column, String, Float, Boolean,
    DateTime, Numeric, Text
)
from sqlalchemy.dialects.mssql import UNIQUEIDENTIFIER
from datetime import datetime, timezone
import uuid

from app.db.connection import Base


def new_guid() -> str:
    return str(uuid.uuid4())


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class AnomalyLog(Base):
    __tablename__ = "AnomalyLogs"
    __table_args__ = {"schema": "dbo"}

    Id = Column(
        UNIQUEIDENTIFIER,
        primary_key=True,
        default=new_guid
    )
    TransactionId = Column(
        UNIQUEIDENTIFIER,
        nullable=False,
        index=True
    )
    UserId = Column(
        UNIQUEIDENTIFIER,
        nullable=False,
        index=True
    )
    AlgorithmName = Column(
        String(100),
        nullable=False
        # 'IsolationForest', 'ZScore', 'LOF', 'XGBoost', 'Ensemble'
    )
    Score = Column(Float, nullable=False)
    IsAnomaly = Column(Boolean, nullable=False, default=False)
    Explanation = Column(String(1000), nullable=True)
    DetectedAt = Column(DateTime, nullable=False, default=utcnow)
    ModelVersion = Column(String(50), nullable=True)

    # ── Status workflow + algorithm metrics ───────────────────────────────
    Status = Column(
        String(20),
        nullable=False,
        default="Pending",
        index=True
        # 'Pending', 'Reviewed', 'Confirmed', 'FalsePositive'
    )
    ReviewedAt = Column(DateTime, nullable=True)
    Metrics = Column(Text, nullable=True)  # JSON serialized algorithm metrics


class RiskScore(Base):
    __tablename__ = "RiskScores"
    __table_args__ = {"schema": "dbo"}

    Id = Column(
        UNIQUEIDENTIFIER,
        primary_key=True,
        default=new_guid
    )
    UserId = Column(
        UNIQUEIDENTIFIER,
        nullable=False,
        index=True
    )
    Score = Column(Numeric(5, 2), nullable=False)
    Level = Column(
        String(20),
        nullable=False
        # 'Low', 'Medium', 'High'  ← RiskScore'da Level kalıyor, bu farklı bir model
    )
    Factors = Column(Text, nullable=True)
    ModelVersion = Column(String(50), nullable=True)
    CalculatedAt = Column(DateTime, nullable=False, default=utcnow)