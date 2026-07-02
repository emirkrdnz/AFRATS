import json
import logging
from pathlib import Path
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.db.connection import get_db
from app.services.risk_service import RiskService
from app.schemas.common import ApiResponse
from app.core.security import require_admin

router = APIRouter(prefix="/api/ml/admin", tags=["Admin"])

logger = logging.getLogger(__name__)

# ──────────────────────────────────────────────────────────────────────────
# Training metadata loaders
#
# Training scripts (train_anomaly_model.py / train_risk_model.py) write rich
# evaluation metrics + confusion matrices to JSON files next to the .pkl
# bundles. We surface those as the canonical "model performance" because:
#
#   - User-review-derived metrics (legacy code below) are 0/null until the
#     admin actually reviews flagged anomalies — useless for thesis demo.
#   - Training-time metrics are computed on a held-out test split with
#     synthetic ground truth → defensible reference numbers.
#
# Both files live in MODEL_PATH next to the pickles.
# ──────────────────────────────────────────────────────────────────────────

_MODEL_DIR = Path("/app/models")
_ANOMALY_META_PATH = _MODEL_DIR / "metadata.json"
_RISK_META_PATH    = _MODEL_DIR / "risk_metadata.json"


def _load_json(path: Path) -> dict | None:
    if not path.exists():
        logger.warning(f"Metadata file missing: {path}")
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        logger.error(f"Failed to load metadata {path}: {e}")
        return None


def _anomaly_training_performance(meta: dict | None) -> dict | None:
    """
    Pull binary-classification metrics for the production ensemble profile
    (XGB-heavy: Z 0.30 / IF 0.20 / XGB 0.45 / LOF 0.05) from the anomaly
    training metadata. FPR is computed from the saved confusion matrix.
    """
    if not meta:
        return None
    profiles = (meta.get("ensemble_metrics") or {}).get("score_threshold_0_5") or {}
    target = None
    for key, val in profiles.items():
        if "XGB-heavy" in key:
            target = val
            break
    if target is None and profiles:
        # Fallback — best F1 across profiles.
        target = max(profiles.values(), key=lambda p: p.get("f1", 0))
    if not target:
        return None
    cm = target.get("confusion_matrix") or {}
    fp, tn = cm.get("fp", 0), cm.get("tn", 0)
    fpr = round(fp / (fp + tn), 4) if (fp + tn) > 0 else None
    return {
        "precision":         round(float(target.get("precision", 0.0)), 4),
        "recall":            round(float(target.get("recall", 0.0)), 4),
        "f1":                round(float(target.get("f1", 0.0)), 4),
        "falsePositiveRate": fpr,
    }


def _risk_training_performance(meta: dict | None) -> dict | None:
    """
    Pull multi-class metrics for the production risk ensemble (XGB-dom:
    RF 0.20 / XGB 0.70 / LR 0.10). F1 = macro F1 reported by the training
    script. Precision/Recall/FPR are macro-averaged from the saved
    confusion matrix (rows = actual, cols = predicted).
    """
    if not meta:
        return None
    best = meta.get("best_ensemble") or {}
    macro_f1 = best.get("macro_f1")
    cm_block = meta.get("confusion_matrix_ensemble") or {}
    matrix = cm_block.get("matrix")
    if not matrix:
        return {
            "precision":         None,
            "recall":            None,
            "f1":                round(float(macro_f1), 4) if macro_f1 is not None else None,
            "falsePositiveRate": None,
        }
    n = len(matrix)
    total = sum(sum(row) for row in matrix)
    p_sum = r_sum = fpr_sum = 0.0
    for i in range(n):
        tp = matrix[i][i]
        fn = sum(matrix[i]) - tp
        fp = sum(matrix[r][i] for r in range(n) if r != i)
        tn = total - tp - fn - fp
        p_sum   += tp / (tp + fp) if (tp + fp) > 0 else 0.0
        r_sum   += tp / (tp + fn) if (tp + fn) > 0 else 0.0
        fpr_sum += fp / (fp + tn) if (fp + tn) > 0 else 0.0
    return {
        "precision":         round(p_sum / n, 4),
        "recall":            round(r_sum / n, 4),
        "f1":                round(float(macro_f1), 4) if macro_f1 is not None else round(2 * (p_sum / n) * (r_sum / n) / ((p_sum / n) + (r_sum / n)), 4),
        "falsePositiveRate": round(fpr_sum / n, 4),
    }


@router.get("/high-risk-users")
def get_high_risk_users(
    page: int = Query(1, ge=1),
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin)
) -> ApiResponse:
    """Yüksek riskli kullanıcı listesi — Admin only."""
    service = RiskService(db)
    users = service.get_high_risk_users(page=page)
    return ApiResponse.ok(data=users)


@router.get("/stats")
def get_admin_stats(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin)
) -> ApiResponse:
    """Sistem geneli risk dağılımı istatistiği — Admin only."""
    service = RiskService(db)
    stats = service.get_admin_stats()
    return ApiResponse.ok(data=stats)


@router.get("/model-performance")
def get_model_performance(
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin)
) -> ApiResponse:
    """
    Per-model composition + anomaly performance.

    Anomaly model metrics (AnomalyLog reviewed rows'dan):
        Precision  = Confirmed / (Confirmed + FalsePositive)
        Recall     = Confirmed / (Confirmed + Pending)
        F1         = 2 * P * R / (P + R)
        FPR        = FalsePositive / (FalsePositive + Confirmed)

    Risk model section: algorithm composition + decision thresholds
    + business-rule overrides. (Risk scoring has no supervised label
    at inference time, so no precision/recall — composition only.)

    Response keeps the legacy flat fields (precision/recall/...) at the
    top level for backward compatibility; new UI consumes anomalyModel/
    riskModel sections.
    """
    from app.db.models import AnomalyLog
    from app.ml.model_manager import model_manager
    from app.ml.anomaly_models import (
        WEIGHT_ZSCORE, WEIGHT_IF, WEIGHT_XGB, WEIGHT_LOF,
        ENSEMBLE_DECISION_THRESHOLD,
    )
    from app.ml.risk_models import RISK_LOW_THRESHOLD, RISK_HIGH_THRESHOLD

    rows = (
        db.query(
            AnomalyLog.Status,
            func.count(AnomalyLog.Id).label("cnt")
        )
        .filter(AnomalyLog.AlgorithmName == "Ensemble")
        .group_by(AnomalyLog.Status)
        .all()
    )

    counts = {r.Status: r.cnt for r in rows}
    confirmed      = counts.get("Confirmed", 0)
    false_positive = counts.get("FalsePositive", 0)
    pending        = counts.get("Pending", 0)
    reviewed       = counts.get("Reviewed", 0)
    total          = confirmed + false_positive + pending + reviewed

    precision_denom = confirmed + false_positive
    precision = round(confirmed / precision_denom, 4) if precision_denom > 0 else None

    recall_denom = confirmed + pending
    # If no Confirmed reviews exist, recall is undefined — return None
    # (instead of 0.0) so the UI can show "Insufficient review data"
    # instead of a misleading 0.000 metric.
    if confirmed == 0 and pending == 0:
        recall = None
    elif confirmed == 0:
        # Only pending exists → no signal yet; surface as undefined.
        recall = None
    else:
        recall = round(confirmed / recall_denom, 4) if recall_denom > 0 else None

    if precision and recall and (precision + recall) > 0:
        f1 = round(2 * precision * recall / (precision + recall), 4)
    else:
        f1 = None

    fpr_denom = false_positive + confirmed
    fpr = round(false_positive / fpr_denom, 4) if fpr_denom > 0 else None

    anomaly_bundle = model_manager.models.get("anomaly", {})
    training_anomaly_rate = anomaly_bundle.get("anomaly_rate")
    anomaly_version = anomaly_bundle.get("version", "unknown")
    risk_bundle = model_manager.models.get("risk", {})
    risk_version = risk_bundle.get("version", "unknown")

    # Risk ensemble weights — read from trained bundle if available,
    # otherwise fall back to the documented training-time defaults.
    risk_weights = risk_bundle.get("ensemble_weights") or {
        "rf": 0.20, "xgb": 0.70, "lr": 0.10
    }

    # Load training metadata — production reference numbers.
    # Review-derived metrics (above) stay at the top-level for backward
    # compat but the per-model `performance` sections use these so the
    # admin UI doesn't show "—" until reviewers do their job.
    anomaly_meta = _load_json(_ANOMALY_META_PATH)
    risk_meta    = _load_json(_RISK_META_PATH)
    anomaly_perf = _anomaly_training_performance(anomaly_meta) or {
        "precision": precision, "recall": recall, "f1": f1, "falsePositiveRate": fpr,
    }
    risk_perf    = _risk_training_performance(risk_meta)

    anomaly_model_section = {
        "name": "Anomaly Detection Ensemble",
        "performance":         anomaly_perf,
        "performanceSource":   "training" if anomaly_meta else "reviews",
        "trainingAnomalyRate": (
            round(training_anomaly_rate, 4) if training_anomaly_rate else None
        ),
        "decisionThreshold": ENSEMBLE_DECISION_THRESHOLD,
        "algorithms": [
            {"name": "Z-Score",          "weight": WEIGHT_ZSCORE, "type": "statistical"},
            {"name": "Isolation Forest", "weight": WEIGHT_IF,     "type": "unsupervised tree"},
            {"name": "LOF",              "weight": WEIGHT_LOF,    "type": "density-based"},
            {"name": "XGBoost",          "weight": WEIGHT_XGB,    "type": "supervised gradient-boosting"},
        ],
    }

    risk_model_section = {
        "name": "Risk Scoring Ensemble",
        "performance":       risk_perf,
        "performanceSource": "training" if risk_meta else "unavailable",
        "performanceNote":   "Macro-averaged across 3 risk classes" if risk_perf else None,
        "algorithms": [
            {"name": "Random Forest",       "weight": round(risk_weights.get("rf",  0.20), 2), "type": "ensemble tree"},
            {"name": "XGBoost",             "weight": round(risk_weights.get("xgb", 0.70), 2), "type": "gradient-boosting"},
            {"name": "Logistic Regression", "weight": round(risk_weights.get("lr",  0.10), 2), "type": "linear"},
        ],
        "thresholds": {
            "low":    {"max": RISK_LOW_THRESHOLD,  "label": "Low"},
            "medium": {"min": RISK_LOW_THRESHOLD,  "max": RISK_HIGH_THRESHOLD, "label": "Medium"},
            "high":   {"min": RISK_HIGH_THRESHOLD, "label": "High"},
        },
        # Bu string'ler risk_models.py:_build_result içindeki gerçek davranışı
        # birebir yansıtır. Frontend bu format'tan parse ediyor — değiştirirsen
        # MLModels.jsx parseRule mantığını da güncelle.
        "businessRules": [
            "debt_ratio ≥ 1.5 → score raised to 80–90 (continuous in [1.5, 2.0])",
            "debt_ratio ≥ 1.0 → score raised to 55–65 (continuous in [1.0, 1.5])",
            "anomaly_rate ≥ 0.3 → score +15 (capped at 100)",
        ],
    }

    return ApiResponse.ok(data={
        # ── Legacy flat fields (review-derived, backward compatibility) ──
        # These remain so old consumers keep working but the new admin UI
        # ignores them in favor of training-based performance.
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "falsePositiveRate": fpr,
        "statusCounts": {
            "confirmed": confirmed,
            "falsePositive": false_positive,
            "pending": pending,
            "reviewed": reviewed,
            "total": total,
        },
        "trainingAnomalyRate": anomaly_model_section["trainingAnomalyRate"],
        "modelVersions": {
            "anomaly": anomaly_version,
            "risk": risk_version,
        },
        # ── New per-model sections (UI consumes these) ──────────────────
        "anomalyModel": anomaly_model_section,
        "riskModel":    risk_model_section,
        "note": "Performance metrics reflect training-time evaluation on held-out test split. "
                "Switch to review-based metrics once admin reviews accumulate.",
    })


@router.get("/broker/overview")
def get_broker_overview(_: dict = Depends(require_admin)) -> ApiResponse:
    """RabbitMQ cluster overview — message rates, totals, object counts.
    Topology sayfasının üst bant istatistikleri için."""
    from app.services.broker_service import broker_service
    return ApiResponse.ok(data=broker_service.get_overview())


@router.get("/broker/queues")
def get_broker_queues(_: dict = Depends(require_admin)) -> ApiResponse:
    """RabbitMQ queue list — her queue için rate, backlog, consumer count.
    Topology sayfasının alt tablo verisi."""
    from app.services.broker_service import broker_service
    return ApiResponse.ok(data=broker_service.get_queues())


@router.get("/users/{user_id}/risk")
def get_user_risk(
    user_id: str,
    limit: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin)
) -> ApiResponse:
    """
    Per-user risk current + history — Admin only.

    Count-based pencere (son N risk skoru) — sparkline'da sabit X-ekseni için
    tutarlı görünüm. Zaman bazlı /risk/history user-facing endpoint'inde kalır.
    """
    service = RiskService(db)

    current = service.get_current(user_id)
    if not current:
        current = {
            "score": 0.0,
            "level": "Low",
            "factors": {},
            "calculatedAt": None
        }

    history = service.get_history(user_id, limit=limit)

    return ApiResponse.ok(data={
        "userId": user_id,
        "current": current,
        "history": history
    })


@router.get("/users/{user_id}/anomaly-count")
def get_user_anomaly_count(
    user_id: str,
    db: Session = Depends(get_db),
    _: dict = Depends(require_admin)
) -> ApiResponse:
    """
    Per-user anomaly summary counts — Admin drawer için.
    Total / confirmed / pending — Ensemble row'larında IsAnomaly=True sayılır,
    her transaction tek kez.
    """
    from app.db.repositories.anomaly_repository import AnomalyRepository
    repo = AnomalyRepository(db)
    return ApiResponse.ok(data={
        "userId": user_id,
        **repo.count_by_user(user_id),
    })
