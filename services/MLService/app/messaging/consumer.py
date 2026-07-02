import pika
import json
import logging
import threading
import time

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)

QUEUE_NAME = "ml.transaction.created"
EXCHANGE = "afrats.transactions"
ROUTING_KEY = "transaction.created"


class EventConsumer:

    def __init__(self):
        self._connection = None
        self._channel = None
        self._thread = None
        self._running = False

    def start(self):
        """Consumer'ı ayrı thread'de başlat."""
        self._running = True
        self._thread = threading.Thread(
            target=self._run,
            daemon=True,
            name="rabbitmq-consumer"
        )
        self._thread.start()
        logger.info("RabbitMQ consumer thread started")

    def stop(self):
        self._running = False
        if self._connection and not self._connection.is_closed:
            self._connection.close()
        logger.info("RabbitMQ consumer stopped")

    def _run(self):
        """Bağlantı koparsa yeniden bağlan."""
        while self._running:
            try:
                self._connect_and_consume()
            except Exception as e:
                logger.error(
                    f"Consumer error: {e} — "
                    f"reconnecting in 5 seconds..."
                )
                time.sleep(5)

    def _connect_and_consume(self):
        parameters = pika.URLParameters(settings.RABBITMQ_URL)
        self._connection = pika.BlockingConnection(parameters)
        self._channel = self._connection.channel()

        # Exchange ve queue tanımla
        self._channel.exchange_declare(
            exchange=EXCHANGE,
            exchange_type="topic",
            durable=True
        )
        self._channel.queue_declare(
            queue=QUEUE_NAME,
            durable=True
        )
        self._channel.queue_bind(
            queue=QUEUE_NAME,
            exchange=EXCHANGE,
            routing_key=ROUTING_KEY
        )

        # Bir seferde 1 mesaj işle
        self._channel.basic_qos(prefetch_count=1)
        self._channel.basic_consume(
            queue=QUEUE_NAME,
            on_message_callback=self._on_message
        )

        logger.info(
            f"Consumer listening on queue: {QUEUE_NAME}"
        )
        self._channel.start_consuming()

    def _on_message(self, ch, method, properties, body):
        try:
            event = json.loads(body.decode("utf-8"))
            transaction_id = event.get("transactionId", "unknown")
            logger.info(
                f"Event received: transaction.created | "
                f"transactionId: {transaction_id}"
            )

            self._process_event(event)

            # Başarılı — mesajı onayla
            ch.basic_ack(delivery_tag=method.delivery_tag)

        except json.JSONDecodeError as e:
            logger.error(f"Invalid JSON payload: {e}")
            # Geçersiz mesajı reddet, kuyruğa geri koyma
            ch.basic_nack(
                delivery_tag=method.delivery_tag,
                requeue=False
            )
        except Exception as e:
            logger.error(f"Message processing failed: {e}")
            # Geçici hata — kuyruğa geri koy
            ch.basic_nack(
                delivery_tag=method.delivery_tag,
                requeue=True
            )

    def _process_event(self, event: dict):
        """
        transaction.created eventini işler.
        DB session burada açılır ve kapatılır.
        """
        from app.db.connection import SessionLocal
        from app.services.anomaly_service import AnomalyService
        from app.services.risk_service import RiskService
        from app.messaging.publisher import event_publisher

        db = SessionLocal()
        try:
            user_id = str(event.get("userId"))
            transaction_id = str(event.get("transactionId"))

            # 1. Anomali analizi
            anomaly_service = AnomalyService(db)
            anomaly_result = anomaly_service.analyze(event)

            # 2. Risk skoru hesapla.
            # Income tx'ler için anomaly detection SKIP (income asla anomaly
            # değil), ama risk_service yine de yeniden hesaplanır: yeni income
            # debt_ratio'yu düşürür ve kullanıcının "maaş geldi, ratio düştü"
            # anlık feedback'ini görmesi gerekir. Eski davranış previous'u
            # olduğu gibi pass ediyordu → kullanıcı UI'da güncellemeyi sonraki
            # expense'i girince görüyordu, kötü UX.
            risk_service = RiskService(db)
            previous = risk_service.get_current(user_id)
            previous_score = previous["score"] if previous else 0.0

            if event.get("type") == "Income":
                # Income için real features compute et (extract_features_from_event
                # extract_risk_features'ı da çağırır → debt_ratio yeni income'la
                # güncellenir). anomaly_features de hesaplanır ama is_anomaly=False
                # force'lanır (income tx'i anomaly olamaz).
                from app.ml.feature_engineering import extract_features_from_event
                user_history    = event.get("userHistory", [])
                expense_history = [h for h in user_history if h.get("type") == "Expense"]
                if len(expense_history) < 10:
                    # Insufficient — previous'u koru, fallback artefact yaratma
                    risk_result = previous if previous else {
                        "score": 0.0, "level": "Low",
                        "factors": {"anomaly_weight": 0.0, "debt_ratio": 0.0, "spending_trend": 1.0}
                    }
                    logger.info(
                        f"Income tx with insufficient history ({len(expense_history)}) — "
                        f"risk score carried forward: {transaction_id}"
                    )
                else:
                    features = extract_features_from_event(event, user_history)
                    risk_result = risk_service.calculate_and_save(
                        user_id=user_id,
                        features=features,
                        is_anomaly=False,
                        trigger_type="Income"  # get_current bu kaydı atlar → Dashboard stable
                    )
                    logger.info(
                        f"Income tx — risk recalculated (tagged Income, excluded from current): "
                        f"{transaction_id} | new score: {risk_result['score']}"
                    )
            else:
                risk_result = risk_service.calculate_and_save(
                    user_id=user_id,
                    features=anomaly_result.get("features", {}),
                    is_anomaly=anomaly_result["isAnomaly"]
                )

            # 3. analysis.completed yayınla — action context (categoryName,
            # amount, description, transactionDate) TransactionCreatedEvent'ten
            # geliyor, NotificationService template service'in human-readable
            # alert üretmesi için downstream'e taşınır.
            event_publisher.publish_analysis_completed({
                "transactionId": transaction_id,
                "userId": user_id,
                "isAnomaly": anomaly_result["isAnomaly"],
                "anomalyScore": anomaly_result["anomalyScore"],
                "riskScore": risk_result["score"],
                "riskLevel": risk_result["level"],
                "algorithmResults": anomaly_result["algorithmResults"],
                "explanation": anomaly_result["explanation"],
                "categoryName":     event.get("categoryName"),
                "amount":           event.get("amount"),
                "description":      event.get("description"),
                "transactionDate":  event.get("transactionDate"),
            })

            # 4. Yüksek risk varsa high.risk.detected yayınla — context
            # alanları (category/amount/date) email template'inde UUID yerine
            # human-readable detay basmak için forward edilir.
            if risk_result["score"] > 70:
                event_publisher.publish_high_risk_detected(
                    user_id=user_id,
                    transaction_id=transaction_id,
                    risk_score=risk_result["score"],
                    previous_score=previous_score,
                    factors=risk_result.get("factors", {}),
                    category_name=event.get("categoryName"),
                    amount=event.get("amount"),
                    description=event.get("description"),
                    transaction_date=event.get("transactionDate"),
                )
                logger.warning(
                    f"High risk detected — "
                    f"user: {user_id} | "
                    f"score: {risk_result['score']}"
                )

        finally:
            db.close()


# Singleton
event_consumer = EventConsumer()