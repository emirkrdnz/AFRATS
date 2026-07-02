from pydantic import BaseModel, ConfigDict
from typing import Optional, List
from datetime import datetime


class SpendingTrendMonths(BaseModel):
    """Hangi 2 ay'ın spending_trend kıyasında kullanıldığını gösterir.
    UI'da "Up 27% — May vs April" formatında label üretmek için.
    Format: YYYY-MM (örn. "2026-05"). None / missing → UI fallback."""
    recent: str
    previous: str


class SpendingTrendAlternative(BaseModel):
    """Bir consecutive month pair'ı + ratio'su. UI hover popover'unda
    "diğer dönem karşılaştırmaları" listesini doldurmak için.
    partial=True → recent ay current calendar month (yarım ay, UI '(partial)' işaretler)."""
    recent: str
    previous: str
    ratio: float
    partial: Optional[bool] = None


class RiskFactors(BaseModel):
    # extra='allow': triggered_by, override_reasons gibi runtime'da factors
    # dict'ine eklenen ama buraya henüz tip olarak çıkarılmamış field'lar
    # pass-through olsun (eskiden ignored düşüyordu, response payload eksilirdi
    # ya da explicit response_model olmadığı için zaten geçiyordu — bu config
    # ileride response_model eklenirse de davranışı korur).
    model_config = ConfigDict(extra='allow')

    anomaly_weight: float
    debt_ratio: float
    spending_trend: float
    spending_trend_months: Optional[SpendingTrendMonths] = None
    spending_trend_alternatives: Optional[List[SpendingTrendAlternative]] = None


class RiskScoreResponse(BaseModel):
    id: str
    userId: str
    score: float
    level: str
    factors: Optional[RiskFactors]
    modelVersion: Optional[str]
    calculatedAt: datetime

    class Config:
        from_attributes = True


class RiskScoreCurrentResponse(BaseModel):
    score: float
    level: str
    factors: Optional[RiskFactors]
    calculatedAt: datetime


class RiskHistoryItem(BaseModel):
    score: float
    level: str
    calculatedAt: datetime

    class Config:
        from_attributes = True


class HighRiskUserResponse(BaseModel):
    userId: str
    score: float
    level: str
    calculatedAt: datetime

    class Config:
        from_attributes = True


class AdminStatsResponse(BaseModel):
    totalUsers: int
    highRiskCount: int
    mediumRiskCount: int
    lowRiskCount: int
    averageScore: float