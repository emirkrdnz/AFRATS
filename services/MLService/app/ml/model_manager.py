import joblib
import logging
from pathlib import Path

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class ModelManager:
    def __init__(self):
        self.model_path = Path(settings.MODEL_PATH)
        self.models = {}
        self._loaded = False

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    def load_models(self) -> bool:
        try:
            anomaly_path = self.model_path / "anomaly_model.pkl"
            risk_path = self.model_path / "risk_model.pkl"

            if anomaly_path.exists() and risk_path.exists():
                anomaly_bundle = joblib.load(anomaly_path)
                risk_bundle = joblib.load(risk_path)

                self.models["anomaly"] = anomaly_bundle
                self.models["risk"] = risk_bundle
                self._loaded = True
                logger.info(
                    f"ML models loaded — "
                    f"version: {anomaly_bundle.get('version', 'unknown')}"
                )
                return True
            else:
                logger.warning(
                    "Model files not found — fallback mode active"
                )
                self._loaded = False
                return False
        except Exception as e:
            logger.error(f"Model loading failed: {e}")
            self._loaded = False
            return False

    def get_anomaly_model(self):
        bundle = self.models.get("anomaly")
        if bundle:
            return bundle.get("isolation_forest")
        return None

    def get_lof_model(self):
        bundle = self.models.get("anomaly")
        if bundle:
            return bundle.get("lof")
        return None

    def get_lof_scaler(self):
        """StandardScaler used to normalize features before LOF inference.
        Returns None if the bundle doesn't include a scaler (older models)."""
        bundle = self.models.get("anomaly")
        if bundle:
            return bundle.get("lof_scaler")
        return None

    def get_xgboost_model(self):
        """XGBoostDetector instance — 4th algorithm in v6.0.0 ensemble.
        Returns None for older bundles without XGBoost."""
        bundle = self.models.get("anomaly")
        if bundle:
            return bundle.get("xgboost")
        return None

    def get_xgboost_features(self):
        """Feature column order used to train the XGBoost detector.
        May differ from the IF/LOF feature_cols."""
        bundle = self.models.get("anomaly")
        if bundle:
            return bundle.get("xgb_feature_cols")
        return None

    def get_risk_bundle(self):
        return self.models.get("risk")


# Singleton
model_manager = ModelManager()
