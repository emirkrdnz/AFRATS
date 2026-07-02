"""
AFRATS Feature Engineering
═══════════════════════════════════════════════════════════════════════════
Two feature sets are produced from each transaction event:

  ANOMALY_FEATURE_COLS (12) → IF / Z-Score / LOF anomaly detection
  RISK_FEATURE_COLS (9)     → LR + RF + XGBoost risk scoring

Both sets are deterministic, user-calibrated, and free of:
  - Non-deterministic hashing (hash() with PYTHONHASHSEED randomization)
  - Hardcoded magic numbers (e.g. weekend_high > 500)
  - Time-of-day features (AFRATS uses manual transaction entry where
    timestamps are user-supplied and do not reflect actual spending moment)
  - Redundant signals (amount_to_mean_ratio is a deterministic transform
    of amount_zscore given user_mean, user_std)
═══════════════════════════════════════════════════════════════════════════
"""

import logging
from datetime import datetime, timezone
from math import log
import numpy as np
import pandas as pd

logger = logging.getLogger(__name__)


# ─── Feature Catalogs (column order matters for model inference) ──────────
ANOMALY_FEATURE_COLS = [
    "amt",
    "amount_zscore",
    "amount_log_ratio",
    "user_mean",
    "user_std",
    "user_median",
    "daily_avg_7d",
    "category_zscore",
    "category_freq",
    "category_mean",
    "cat_to_user_ratio",
    "days_since_last_in_category",
]

RISK_FEATURE_COLS = [
    "total_transactions",
    "mean_amount",
    "std_amount",
    "max_amount",
    "anomaly_rate",
    "debt_ratio",
    "spending_trend",
    "amount_volatility",
    "max_to_mean_ratio",
]


# ─── Public API ───────────────────────────────────────────────────────────

def extract_features_from_event(
    event: dict,
    user_history: list[dict]
) -> dict:
    """
    Backward-compatible entry point. Returns a merged dict with BOTH
    anomaly and risk features so existing callers (anomaly_service,
    risk_service) keep working with no change.

    Internally delegates to extract_anomaly_features and
    extract_risk_features.

    History ordering (important): backend's GetUserHistoryAsync returns
    transactions sorted DESC (newest first), but every windowing helper
    downstream — _rolling_avg's `[-days:]`, _spending_trend's `[-30:]` /
    `[-90:-30]` slices, _anomaly_rate's `[-90:]` — was authored with the
    intuition `last N items = most recent N`. That intuition only holds if
    the list is ASC. Without normalization, "recent" silently means "oldest"
    and spending_trend flips sign. We normalize once here so every helper
    below sees ASC and the slice semantics match the variable names.
    """
    user_history = sorted(
        user_history,
        key=lambda h: _parse_date(h.get("transactionDate"))
    )
    anomaly_features = extract_anomaly_features(event, user_history)
    risk_features = extract_risk_features(event, user_history, anomaly_features)
    return {**anomaly_features, **risk_features}


def extract_anomaly_features(
    event: dict,
    user_history: list[dict]
) -> dict:
    """
    12 deterministic features for anomaly detection.

    Args:
        event: incoming transaction event dict
        user_history: list of past transactions for this user

    Returns:
        dict with exactly ANOMALY_FEATURE_COLS keys plus auxiliary debug keys
    """
    amount = float(event.get("amount", 0))
    transaction_date = _parse_date(event.get("transactionDate"))
    category_id = event.get("categoryId", "")

    # ── User-level stats (Expense only) ──────────────────────────────────
    expense_history = [
        h for h in user_history if h.get("type") == "Expense"
    ]
    expense_amounts = [float(h.get("amount", 0)) for h in expense_history] or [amount]

    user_mean   = float(np.mean(expense_amounts))
    user_std    = float(np.std(expense_amounts)) or 1.0   # avoid div-by-zero
    user_median = float(np.median(expense_amounts))

    # ── Amount-relative features ─────────────────────────────────────────
    amount_zscore = (amount - user_mean) / user_std

    # log-ratio: scale-invariant magnitude.
    # Robust to extreme outliers, complements z-score.
    if user_mean > 0 and amount > 0:
        amount_log_ratio = log(amount / user_mean)
    else:
        amount_log_ratio = 0.0

    # ── 7-day rolling average (recent behavior) ──────────────────────────
    daily_avg_7d = _rolling_avg(expense_history, days=7)

    # ── Category-level features ──────────────────────────────────────────
    category_history = [
        h for h in expense_history if h.get("categoryId") == category_id
    ]
    category_amounts = [float(h.get("amount", 0)) for h in category_history]

    if len(category_amounts) > 0:
        category_mean = float(np.mean(category_amounts))
        category_std = float(np.std(category_amounts)) or 1.0
        category_zscore = (amount - category_mean) / category_std
    else:
        # First transaction in this category: relative to user mean
        category_mean = user_mean
        category_zscore = amount_zscore

    # category frequency: fraction of this user's expenses in this category
    if len(expense_history) > 0:
        category_freq = len(category_history) / len(expense_history)
    else:
        category_freq = 0.0

    # cat_to_user_ratio: is this category's typical amount large for user?
    if user_mean > 0:
        cat_to_user_ratio = category_mean / user_mean
    else:
        cat_to_user_ratio = 1.0

    # ── Temporal pattern: category recency (NOT clock time) ──────────────
    # Days since the last transaction in this category. Anomaly signal:
    # user normally buys groceries weekly but this is the first in 3 months.
    days_since_last_in_category = _days_since_last_in_category(
        category_history, transaction_date
    )

    return {
        # ── Model-bound features (ANOMALY_FEATURE_COLS) ──────────────────
        "amt":                          round(amount, 4),
        "amount_zscore":                round(float(amount_zscore), 4),
        "amount_log_ratio":             round(float(amount_log_ratio), 4),
        "user_mean":                    round(user_mean, 4),
        "user_std":                     round(user_std, 4),
        "user_median":                  round(user_median, 4),
        "daily_avg_7d":                 round(daily_avg_7d, 4),
        "category_zscore":              round(float(category_zscore), 4),
        "category_freq":                round(category_freq, 4),
        "category_mean":                round(category_mean, 4),
        "cat_to_user_ratio":            round(cat_to_user_ratio, 4),
        "days_since_last_in_category":  round(days_since_last_in_category, 2),
    }


def extract_risk_features(
    event: dict,
    user_history: list[dict],
    anomaly_features: dict | None = None
) -> dict:
    """
    9 features for the risk model (LR + RF + XGBoost).

    Risk features are aggregate user-level signals that change slowly,
    distinct from anomaly features which are per-transaction signals.

    Args:
        event: incoming transaction event dict
        user_history: list of past transactions for this user
        anomaly_features: optional pre-computed anomaly features (for reuse)
    """
    amount = float(event.get("amount", 0))

    expense_history = [
        h for h in user_history if h.get("type") == "Expense"
    ]
    expense_amounts = [float(h.get("amount", 0)) for h in expense_history] or [amount]

    user_mean = float(np.mean(expense_amounts))
    user_std  = float(np.std(expense_amounts)) or 1.0
    user_max  = float(max(expense_amounts)) if expense_amounts else amount

    # amount_volatility: coefficient of variation
    amount_volatility = (user_std / user_mean) if user_mean > 0 else 0.0
    amount_volatility = min(amount_volatility, 5.0)

    # max-to-mean ratio
    max_to_mean_ratio = (user_max / user_mean) if user_mean > 0 else 1.0
    max_to_mean_ratio = min(max_to_mean_ratio, 50.0)

    return {
        "total_transactions": len(user_history),
        "mean_amount":        round(user_mean, 4),
        "std_amount":         round(user_std, 4),
        "max_amount":         round(user_max, 4),
        "anomaly_rate":       _anomaly_rate(user_history),
        "debt_ratio":         _debt_ratio(user_history),
        "spending_trend":     _spending_trend(expense_history),
        "amount_volatility":  round(amount_volatility, 4),
        "max_to_mean_ratio":  round(max_to_mean_ratio, 4),
        # ── UI metadata (model input'a girmez — RISK_FEATURE_COLS'ta yok) ──
        # risk_models.calculate bunu factors dict'ine geçirir; features_to_dataframe
        # / risk_features_to_dataframe sadece listed cols'u alır, predictor'a ulaşmaz.
        "spending_trend_months":       _spending_trend_months(expense_history),
        "spending_trend_alternatives": _spending_trend_alternatives(expense_history),
    }


def features_to_dataframe(features: dict) -> pd.DataFrame:
    """
    Convert anomaly features dict → DataFrame in ANOMALY_FEATURE_COLS order.
    Order matters: model.predict() consumes columns positionally.
    """
    row = {col: features.get(col, 0.0) for col in ANOMALY_FEATURE_COLS}
    return pd.DataFrame([row])


# ─── Private helpers ──────────────────────────────────────────────────────

def _parse_date(raw) -> datetime:
    """Tolerant date parser. Always returns a tz-aware UTC datetime so
    naive (date-only) and offset-aware history values stay comparable."""
    parsed = None
    if isinstance(raw, datetime):
        parsed = raw
    elif isinstance(raw, str) and raw:
        try:
            parsed = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        except ValueError:
            parsed = None
    if parsed is None:
        return datetime.now(timezone.utc)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _rolling_avg(expense_history: list[dict], days: int) -> float:
    """Mean of the last `days` expense amounts."""
    if not expense_history:
        return 0.0
    recent = expense_history[-days:]
    amounts = [float(h.get("amount", 0)) for h in recent]
    return float(np.mean(amounts)) if amounts else 0.0


def _days_since_last_in_category(
    category_history: list[dict],
    current_date: datetime
) -> float:
    """
    Days since the most recent transaction in this category.
    Returns 9999 if no prior transaction in this category (effectively infinite).
    """
    if not category_history:
        return 9999.0

    # Find the maximum date in this category — sorting not guaranteed
    last_date = None
    for h in category_history:
        d = _parse_date(h.get("transactionDate"))
        if last_date is None or d > last_date:
            last_date = d

    if last_date is None:
        return 9999.0

    # Normalize timezone awareness
    if last_date.tzinfo and not current_date.tzinfo:
        current_date = current_date.replace(tzinfo=last_date.tzinfo)
    elif current_date.tzinfo and not last_date.tzinfo:
        last_date = last_date.replace(tzinfo=current_date.tzinfo)

    diff = (current_date - last_date).total_seconds()
    return max(0.0, diff / 86400.0)  # seconds → days


def _anomaly_rate(history: list[dict]) -> float:
    """Fraction of recent (last 90) transactions flagged anomalous."""
    if not history:
        return 0.0
    recent = history[-90:]
    anomaly_count = sum(1 for h in recent if h.get("isAnomaly", False))
    return round(anomaly_count / len(recent), 4)


def _debt_ratio(history: list[dict]) -> float:
    """Expense / Income, clipped to [0, 2]."""
    total_income = sum(
        float(h.get("amount", 0))
        for h in history if h.get("type") == "Income"
    )
    total_expense = sum(
        float(h.get("amount", 0))
        for h in history if h.get("type") == "Expense"
    )
    if total_income == 0:
        return 1.0
    return round(min(total_expense / total_income, 2.0), 4)


# ── Spending-trend internals ─────────────────────────────────────────────
# 3 public fonksiyonun (_spending_trend, _spending_trend_months,
# _spending_trend_alternatives) altta paylaştığı yardımcılar. Üçü de aynı
# monthly-bucket'ı ve aynı "default pair" seçim kuralını kullanmalı; aksi
# halde ratio bir ay'ı, label başka ay'ı, alternatives listesi farklı bir
# pair'ı işaret eder → kullanıcıya çelişkili bilgi gider.
#
# Default pair seçim kuralı (midpoint-aware):
#   - Current calendar month'da elapsed/days >= 0.5 ise → current ay dahil:
#     recent = current_partial, previous = last_complete
#     → "ayın yarısını geçtik, gidişat geçen aya kıyasla şu" sinyali makul.
#   - Aksi halde (ayın ilk yarısı) → current ay dışlanır, son 2 complete ay.
#     Yarım-ay-tam-ayla-kıyas false-positive'ini engeller (-%98 bug'ı).

def _monthly_expense_totals(expense_history: list[dict]) -> dict[tuple[int, int], float]:
    """{(year, month): total_amount} — expense_history üzerinden tek pass."""
    totals: dict[tuple[int, int], float] = {}
    for h in expense_history:
        date   = _parse_date(h.get("transactionDate"))
        amount = float(h.get("amount", 0))
        key    = (date.year, date.month)
        totals[key] = totals.get(key, 0.0) + amount
    return totals


def _pick_default_pair(
    totals: dict[tuple[int, int], float],
    today: datetime,
) -> tuple[tuple[int, int], tuple[int, int]] | None:
    """(recent_key, previous_key) tuple veya None.

    Dürüst-en-son-2-ay mantığı: veri olan en yeni 2 ay'ı al, sırala, dön.
    Current calendar month partial olsa bile dahil edilir.

    Önceki versiyon (midpoint-aware) partial-month'u kıyastan saklıyordu;
    UI bar chart'ı şimdi partial ay'ı görsel olarak gösterdiği için
    (Jun bar'ı aşağıda → "ben ayın 4'üyüm" anlaşılır) "saklama" gereksiz.
    Veriyi dürüstçe gösterip kullanıcının görsel bağlamla yorumlamasına
    bırakıyoruz. `today` parametresi imza uyumluluğu için tutuldu —
    midpoint logic kullanmıyor, ama gelecek extension'lar için açık."""
    del today  # midpoint logic kaldırıldı; parametre signature uyumluluğu için
    if len(totals) < 2:
        return None
    sorted_keys = sorted(totals.keys(), reverse=True)
    return sorted_keys[0], sorted_keys[1]


def _ym_str(key: tuple[int, int]) -> str:
    """(2026, 5) → '2026-05'."""
    return f"{key[0]:04d}-{key[1]:02d}"


def _safe_ratio(recent: float, previous: float) -> float | None:
    """Ratio + 10x cap, None if either is 0."""
    if previous == 0 or recent == 0:
        return None
    return round(min(recent / previous, 10.0), 4)


# ── Public spending-trend API ────────────────────────────────────────────

def _spending_trend(expense_history: list[dict]) -> float:
    """Month-over-month spending ratio — veri olan en son 2 ay.

    Returns:
      - 1.0  = stable / insufficient data fallback
      - >1.0 = recent > previous
      - <1.0 = recent < previous

    Pair seçimi _pick_default_pair: most-recent-with-data + second-most-recent.
    Current calendar month dahil olabilir (partial olsa bile). UI delta
    chart'ı partial ay'ı görsel olarak gösterdiği için "saklama" gereksiz.
    """
    if not expense_history:
        return 1.0
    totals = _monthly_expense_totals(expense_history)
    pair   = _pick_default_pair(totals, datetime.now(timezone.utc))
    if pair is None:
        return 1.0
    ratio = _safe_ratio(totals[pair[0]], totals[pair[1]])
    return ratio if ratio is not None else 1.0


def _spending_trend_months(expense_history: list[dict]) -> dict | None:
    """_spending_trend ile birebir aynı seçim — hangi 2 ay kıyaslandı.
    UI'da "Up 27% — May vs Apr" formatında dürüst etiket için."""
    if not expense_history:
        return None
    totals = _monthly_expense_totals(expense_history)
    pair   = _pick_default_pair(totals, datetime.now(timezone.utc))
    if pair is None:
        return None
    return {
        "recent":   _ym_str(pair[0]),
        "previous": _ym_str(pair[1]),
    }


def _spending_trend_alternatives(expense_history: list[dict]) -> list[dict]:
    """Consecutive month pair'larının hepsi — UI hover popover için.

    [{recent:"2026-06", previous:"2026-05", ratio:0.02, partial:True}, ...]
    En güncel pair önde. partial=True → recent ay current calendar month
    (yarım ay). Son 6 pair'la sınırlı (UI clutter ve user-history-dependent
    şişme'yi engellemek için)."""
    if not expense_history:
        return []
    totals = _monthly_expense_totals(expense_history)
    if len(totals) < 2:
        return []
    today   = datetime.now(timezone.utc)
    current = (today.year, today.month)
    sorted_keys = sorted(totals.keys(), reverse=True)

    pairs: list[dict] = []
    for i in range(len(sorted_keys) - 1):
        recent_k, prev_k = sorted_keys[i], sorted_keys[i + 1]
        ratio = _safe_ratio(totals[recent_k], totals[prev_k])
        if ratio is None:
            continue
        entry = {
            "recent":   _ym_str(recent_k),
            "previous": _ym_str(prev_k),
            "ratio":    ratio,
        }
        if recent_k == current:
            entry["partial"] = True
        pairs.append(entry)
        if len(pairs) >= 6:
            break
    return pairs