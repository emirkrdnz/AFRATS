import pika
import json
import logging
from datetime import datetime, timezone

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class EventPublisher:

    def __init__(self):
        self._connection = None
        self._channel = None

    def _connect(self):
        try:
            parameters = pika.URLParameters(settings.RABBITMQ_URL)
            self._connection = pika.BlockingConnection(parameters)
            self._channel = self._connection.channel()

            # Exchange'leri tanımla
            self._channel.exchange_declare(
                exchange="afrats.ml",
                exchange_type="topic",
                durable=True
            )
            logger.info("RabbitMQ publisher connected")
        except Exception as e:
            logger.error(f"RabbitMQ publisher connection failed: {e}")
            raise

    def _disconnect(self):
        try:
            if self._connection and not self._connection.is_closed:
                self._connection.close()
        except Exception as e:
            logger.warning(f"RabbitMQ disconnect error: {e}")

    def publish_analysis_completed(self, result: dict) -> bool:
        """analysis.completed eventini yayınlar.

        Yeni alanlar (categoryName, amount, description, transactionDate)
        TransactionCreatedEvent'ten gelir, NotificationService'in human-readable
        alert mesajı üretmesi için forward edilir. Eski "Transaction abc-def..."
        UUID-only mesajını "Grocery — TRY 25,000 on 12 May" gibi okunabilir
        format için (downstream template service'de format'lanır)."""
        payload = {
            "transactionId": result.get("transactionId"),
            "userId": result.get("userId"),
            "isAnomaly": result.get("isAnomaly"),
            "anomalyScore": result.get("anomalyScore"),
            "riskScore": result.get("riskScore"),
            "riskLevel": result.get("riskLevel"),
            "algorithmResults": result.get("algorithmResults", {}),
            "explanation": result.get("explanation", ""),
            # Action context — TransactionCreatedEvent'ten ileriye taşınır
            "categoryName":     result.get("categoryName"),
            "amount":           result.get("amount"),
            "description":      result.get("description"),
            "transactionDate":  result.get("transactionDate"),
            "modelVersion": settings.MODEL_VERSION,
            "publishedAt": datetime.now(timezone.utc).isoformat()
        }
        return self._publish(
            exchange="afrats.ml",
            routing_key="analysis.completed",
            payload=payload
        )

    def publish_high_risk_detected(
        self,
        user_id: str,
        transaction_id: str,
        risk_score: float,
        previous_score: float,
        factors: dict,
        category_name: str | None = None,
        amount: float | None = None,
        description: str | None = None,
        transaction_date: str | None = None,
    ) -> bool:
        """high.risk.detected eventini yayınlar. Action context alanları
        (categoryName/amount/description/transactionDate) downstream email
        template'in UUID yerine "Grocery — TRY 60,000 on 05 Jun 2026" gibi
        human-readable detay göstermesi için forward edilir. AnomalyAlert
        ile birebir aynı pattern."""
        payload = {
            "userId": user_id,
            "riskScore": risk_score,
            "riskLevel": "High",
            "transactionId": transaction_id,
            "previousScore": previous_score,
            "triggeredAt": datetime.now(timezone.utc).isoformat(),
            "factors": factors,
            "categoryName":     category_name,
            "amount":           amount,
            "description":      description,
            "transactionDate":  transaction_date,
        }
        return self._publish(
            exchange="afrats.ml",
            routing_key="high.risk.detected",
            payload=payload
        )

    def _publish(
        self,
        exchange: str,
        routing_key: str,
        payload: dict
    ) -> bool:
        try:
            self._connect()
            self._channel.basic_publish(
                exchange=exchange,
                routing_key=routing_key,
                body=json.dumps(payload, default=str),
                properties=pika.BasicProperties(
                    delivery_mode=2,  # Mesajı kalıcı yap
                    content_type="application/json"
                )
            )
            logger.info(
                f"Event published: {routing_key} | "
                f"payload keys: {list(payload.keys())}"
            )
            return True
        except Exception as e:
            logger.error(
                f"Event publish failed [{routing_key}]: {e}"
            )
            return False
        finally:
            self._disconnect()


# Singleton
event_publisher = EventPublisher()