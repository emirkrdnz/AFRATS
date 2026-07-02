from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.db.connection import get_db
from app.services.risk_service import RiskService
from app.schemas.common import ApiResponse
from app.core.security import get_current_user_id

router = APIRouter(prefix="/api/ml", tags=["Risk"])


@router.get("/risk-scores/current")
def get_current_risk(
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> ApiResponse:
    """Kullanıcının güncel risk skoru."""
    service = RiskService(db)
    result = service.get_current(user_id)

    if not result:
        return ApiResponse.ok(
            data={
                "score": 0.0,
                "level": "Low",
                "factors": {},
                "calculatedAt": None
            },
            message="No risk score yet"
        )
    return ApiResponse.ok(data=result)


@router.get("/risk-scores/history")
def get_risk_history(
    months: int = Query(6, ge=1, le=24),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> ApiResponse:
    """Risk skor trendi — grafik için."""
    service = RiskService(db)
    history = service.get_history(user_id, months=months)
    return ApiResponse.ok(data=history)