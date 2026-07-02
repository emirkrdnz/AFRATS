import json
import logging
from typing import Literal
from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.connection import get_db
from app.services.anomaly_service import AnomalyService
from app.services.risk_service import RiskService
from app.schemas.common import ApiResponse
from app.schemas.anomaly_schema import AnomalyRequest
from app.core.security import get_current_user_id

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ml", tags=["Anomaly"])


# ── Inline schema for PATCH body ─────────────────────────────────────────
class AnomalyStatusUpdateRequest(BaseModel):
    status: Literal["Pending", "Reviewed", "Confirmed", "FalsePositive"]


# ── Helpers ──────────────────────────────────────────────────────────────
def _safe_load_metrics(raw: str | None) -> dict:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return {}


def _serialize_log(log) -> dict:
    return {
        "id": str(log.Id),
        "transactionId": str(log.TransactionId),
        "algorithmName": log.AlgorithmName,
        "score": log.Score,
        "isAnomaly": log.IsAnomaly,
        "explanation": log.Explanation,
        "detectedAt": log.DetectedAt.isoformat() if log.DetectedAt else None,
        "modelVersion": log.ModelVersion,
        "status": log.Status,
        "reviewedAt": log.ReviewedAt.isoformat() if log.ReviewedAt else None,
        "metrics": _safe_load_metrics(log.Metrics)
    }


# ── Endpoints ────────────────────────────────────────────────────────────

@router.post("/analyze/anomaly")
def analyze_anomaly(
    request: AnomalyRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> ApiResponse:
    """
    Sync anomali analiz endpoint — fallback için.
    Auth: JWT user_id ile request.userId eşleşmek zorunda — cross-user
    analiz isteği 403 ile reddedilir.
    """
    if str(request.userId) != str(user_id):
        raise HTTPException(
            status_code=403,
            detail="userId in body must match authenticated user"
        )

    anomaly_service = AnomalyService(db)
    risk_service = RiskService(db)

    event = request.model_dump()
    event["transactionDate"] = request.transactionDate.isoformat()

    anomaly_result = anomaly_service.analyze(event)

    risk_result = risk_service.calculate_and_save(
        user_id=str(request.userId),
        features=anomaly_result.get("features", {}),
        is_anomaly=anomaly_result["isAnomaly"]
    )

    return ApiResponse.ok(
        data={
            "transactionId": str(request.transactionId),
            "userId": str(request.userId),
            "isAnomaly": anomaly_result["isAnomaly"],
            "anomalyScore": anomaly_result["anomalyScore"],
            "riskScore": risk_result["score"],
            "riskLevel": risk_result["level"],
            "algorithmResults": anomaly_result["algorithmResults"],
            "explanation": anomaly_result["explanation"]
        }
    )


@router.get("/anomalies")
def get_anomalies(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize"),
    status: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> ApiResponse:
    """
    Paged anomaly list — returns ALL algorithm rows.
    Frontend groups rows by transactionId.
    """
    service = AnomalyService(db)
    logs, total_count = service.get_anomalies_by_user(
        user_id,
        page=page,
        page_size=page_size,
        status=status
    )

    items = [_serialize_log(log) for log in logs]

    return ApiResponse.ok(data={
        "items": items,
        "totalCount": total_count,
        "page": page,
        "pageSize": page_size
    })


@router.get("/anomalies/{transaction_id}")
def get_anomaly_detail(
    transaction_id: str,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> ApiResponse:
    service = AnomalyService(db)
    logs = service.get_anomaly_detail(transaction_id, user_id)

    if not logs:
        return ApiResponse.fail(
            errors=["Anomaly log not found"],
            message="Not found"
        )

    algo_key_map = {
        "IsolationForest": "isolationForest",
        "ZScore": "zScore",
        "LOF": "lof",
        "XGBoost": "xgboost"
    }

    algorithm_results = {}
    ensemble_log = None

    for log in logs:
        if log.AlgorithmName == "Ensemble":
            ensemble_log = log
            continue
        key = algo_key_map.get(log.AlgorithmName)
        if not key:
            continue
        algorithm_results[key] = {
            "score": log.Score,
            "isAnomaly": log.IsAnomaly,
            "metrics": _safe_load_metrics(log.Metrics)
        }

    ensemble_metrics = (
        _safe_load_metrics(ensemble_log.Metrics)
        if ensemble_log else {}
    )

    return ApiResponse.ok(data={
        "transactionId": transaction_id,
        "isAnomaly": ensemble_log.IsAnomaly if ensemble_log else False,
        "anomalyScore": ensemble_log.Score if ensemble_log else 0.0,
        "explanation": ensemble_log.Explanation if ensemble_log else "",
        "status": ensemble_log.Status if ensemble_log else "Pending",
        "reviewedAt": (
            ensemble_log.ReviewedAt.isoformat()
            if ensemble_log and ensemble_log.ReviewedAt else None
        ),
        "algorithmResults": algorithm_results,
        "ensemble": {
            "consensus": ensemble_metrics.get("consensus", 0),
            "votes": ensemble_metrics.get("votes", 0),
            "finalScore": ensemble_log.Score if ensemble_log else 0.0
        },
        "detectedAt": (
            ensemble_log.DetectedAt.isoformat()
            if ensemble_log and ensemble_log.DetectedAt else None
        )
    })


@router.patch("/anomalies/{transaction_id}/status")
def update_anomaly_status(
    transaction_id: str,
    body: AnomalyStatusUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db)
) -> ApiResponse:
    """
    Update status across all algorithm rows for one transaction.
    """
    service = AnomalyService(db)
    success = service.update_status(
        transaction_id=transaction_id,
        user_id=user_id,
        new_status=body.status
    )

    if not success:
        return ApiResponse.fail(
            errors=["Anomaly not found or unauthorized"],
            message="Update failed"
        )

    return ApiResponse.ok(data={
        "transactionId": transaction_id,
        "status": body.status
    })
