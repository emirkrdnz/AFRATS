from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class AlgorithmResult(BaseModel):
    score: float
    isAnomaly: bool


class AnomalyRequest(BaseModel):
    transactionId: str
    userId: str
    amount: float
    type: str
    categoryId: str
    transactionDate: datetime
    userHistory: list[dict] = Field(default_factory=list)


class AnomalyLogResponse(BaseModel):
    id: str
    transactionId: str
    algorithmName: str
    score: float
    isAnomaly: bool
    explanation: Optional[str]
    detectedAt: datetime
    modelVersion: Optional[str]

    class Config:
        from_attributes = True


class AnomalyDetailResponse(BaseModel):
    transactionId: str
    isAnomaly: bool
    anomalyScore: float
    explanation: str
    algorithmResults: dict[str, AlgorithmResult]
    modelVersion: str
    detectedAt: datetime


class AnalysisResult(BaseModel):
    transactionId: str
    userId: str
    isAnomaly: bool
    anomalyScore: float
    riskScore: float
    riskLevel: str
    algorithmResults: dict[str, AlgorithmResult]
    explanation: str
    modelVersion: str