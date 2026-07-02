from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
import logging
import uuid

from app.core.config import get_settings
from app.core.exceptions import AFRATSException
from app.db.connection import init_db, check_db_connection
from app.ml.model_manager import model_manager
from app.messaging.consumer import event_consumer


settings = get_settings()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"{settings.APP_NAME} starting up...")
    logger.info(f"Version: {settings.APP_VERSION}")

    if check_db_connection():
        init_db()
    else:
        logger.warning("DB connection failed — starting without DB")

    loaded = model_manager.load_models()
    if loaded:
        logger.info("ML models ready")
    else:
        logger.warning("ML models not found — rule-based fallback active")

    try:
        event_consumer.start()
        logger.info("RabbitMQ consumer started")
    except Exception as e:
        logger.warning(f"RabbitMQ consumer failed to start: {e}")

    yield

    try:
        event_consumer.stop()
    except Exception:
        pass
    logger.info(f"{settings.APP_NAME} shutting down...")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AFRATS ML / Anomaly Detection Service",
    docs_url="/api/ml/docs",
    redoc_url="/api/ml/redoc",
    openapi_url="/api/ml/openapi.json",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AFRATSException)
async def afrats_exception_handler(request: Request, exc: AFRATSException):
    trace_id = str(uuid.uuid4())
    logger.warning(f"TraceId: {trace_id} | {exc.message}")
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "success": False,
            "message": exc.message,
            "errors": [exc.message],
            "traceId": trace_id
        }
    )


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    trace_id = str(uuid.uuid4())
    logger.error(f"TraceId: {trace_id} | Unhandled error: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error",
            "errors": ["An unexpected error occurred"],
            "traceId": trace_id
        }
    )


@app.get("/api/ml/health", tags=["Health"])
async def health_check():
    from app.db.connection import check_db_connection
    from app.ml.model_manager import model_manager

    db_status = check_db_connection()
    model_status = model_manager.is_loaded

    overall = "healthy" if db_status and model_status else "degraded"

    return {
        "success": True,
        "data": {
            "status": overall,
            "service": settings.APP_NAME,
            "version": settings.APP_VERSION,
            "components": {
                "database": "connected" if db_status else "disconnected",
                "mlModels": "loaded" if model_status else "fallback_mode",
                "modelVersion": settings.MODEL_VERSION,
                "rabbitmq": "not_checked"
            }
        },
        "errors": [],
        "traceId": str(uuid.uuid4())
    }


@app.get("/health", include_in_schema=False)
async def health():
    return {"status": "healthy", "service": "ml"}


@app.get("/", include_in_schema=False)
async def root():
    return {
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/api/ml/docs"
    }


from app.routers.anomaly_router import router as anomaly_router
from app.routers.risk_router import router as risk_router
from app.routers.admin_router import router as admin_router

app.include_router(anomaly_router)
app.include_router(risk_router)
app.include_router(admin_router)