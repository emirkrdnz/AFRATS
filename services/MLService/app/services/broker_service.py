"""
RabbitMQ Management API proxy.

Topology sayfası tarafından kullanılır:
    - get_overview()  → cluster genel istatistikleri (rate, totals, object counts)
    - get_queues()    → queue listesi (her queue için rate, backlog, consumer)

Broker'a doğrudan erişim browser'dan sakıncalı (basic auth, CORS, port
exposure) — bu yüzden MLService backend katmanından proxy ediyoruz.
Admin role gating admin_router üzerinden yapılır.
"""

import logging
import requests

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


def _safe_rate(stats: dict | None, key: str) -> float:
    """Stats blockunda key_details.rate yoksa 0 dön — broker uyandığı ilk
    saniyelerde message_stats hiç olmayabilir, KeyError'ı engelle."""
    if not stats:
        return 0.0
    detail_key = f"{key}_details"
    detail = stats.get(detail_key) or {}
    return float(detail.get("rate", 0.0))


class BrokerService:
    def __init__(self):
        self._base    = settings.RABBITMQ_MGMT_URL.rstrip("/")
        self._auth    = (settings.RABBITMQ_MGMT_USER, settings.RABBITMQ_MGMT_PASS)
        self._timeout = 3.0

    def get_overview(self) -> dict:
        try:
            r = requests.get(
                f"{self._base}/api/overview",
                auth=self._auth,
                timeout=self._timeout,
            )
            r.raise_for_status()
            data = r.json()

            msg_stats     = data.get("message_stats") or {}
            queue_totals  = data.get("queue_totals") or {}
            object_totals = data.get("object_totals") or {}

            return {
                "status":           "connected",
                "node":             data.get("node"),
                "rabbitmqVersion":  data.get("rabbitmq_version"),
                "erlangVersion":    data.get("erlang_version"),
                "messageStats": {
                    "publishRate":  _safe_rate(msg_stats, "publish"),
                    "deliverRate":  _safe_rate(msg_stats, "deliver"),
                    "ackRate":      _safe_rate(msg_stats, "ack"),
                },
                "queueTotals": {
                    "messages":         queue_totals.get("messages", 0),
                    "messagesReady":    queue_totals.get("messages_ready", 0),
                    "messagesUnacked":  queue_totals.get("messages_unacknowledged", 0),
                },
                "objectTotals": {
                    "connections": object_totals.get("connections", 0),
                    "channels":    object_totals.get("channels", 0),
                    "queues":      object_totals.get("queues", 0),
                    "exchanges":   object_totals.get("exchanges", 0),
                    "consumers":   object_totals.get("consumers", 0),
                },
            }
        except requests.exceptions.RequestException as e:
            logger.warning(f"RabbitMQ overview fetch failed: {e}")
            return {"status": "disconnected", "error": str(e)[:200]}

    def get_queues(self) -> list[dict]:
        try:
            r = requests.get(
                f"{self._base}/api/queues",
                auth=self._auth,
                timeout=self._timeout,
            )
            r.raise_for_status()
            queues = r.json()

            result = []
            for q in queues:
                name = q.get("name") or ""
                # AMQP gen / default queue'larını UI'da gösterme.
                if name.startswith("amq."):
                    continue

                msg_stats = q.get("message_stats") or {}
                result.append({
                    "name":             name,
                    "vhost":            q.get("vhost", "/"),
                    "messages":         q.get("messages", 0),
                    "messagesReady":    q.get("messages_ready", 0),
                    "messagesUnacked":  q.get("messages_unacknowledged", 0),
                    "consumers":        q.get("consumers", 0),
                    "publishRate":      _safe_rate(msg_stats, "publish"),
                    "deliverRate":      _safe_rate(msg_stats, "deliver"),
                    "state":            q.get("state", "unknown"),
                })
            # name'e göre stabil sırala — UI'da satır pozisyonu sabit kalsın.
            result.sort(key=lambda x: x["name"])
            return result
        except requests.exceptions.RequestException as e:
            logger.warning(f"RabbitMQ queues fetch failed: {e}")
            return []


broker_service = BrokerService()
