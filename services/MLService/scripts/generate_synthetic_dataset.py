"""
AFRATS Synthetic Dataset Generator
====================================
Generates a controlled synthetic dataset for AFRATS ML training.

Output:
  data/synthetic/users.csv         — 2000 users with risk profiles
  data/synthetic/transactions.csv  — ~700K transactions with anomaly ground truth

Usage:
  cd services/MLService
  python scripts/generate_synthetic_dataset.py

Design:
  - 2000 users (60% Low / 30% Medium / 10% High risk)
  - Probabilistic behavioral parameters (no deterministic feature→label mapping)
  - 7% noisy labels (real-world ground truth noise simulation)
  - Realistic Turkish income distribution
  - ~4.5% transaction anomaly rate (4 types: amount/category/frequency/mixed)
  - Income-capped anomaly amounts (max 1.5x monthly income)

Reproducibility:
  All randomness controlled by SEED=42 constants.

Author: AFRATS Project — Synthetic data design
"""

import os
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from typing import Dict, List

import numpy as np
import pandas as pd


# ---- Deterministic UUID helper ----
def _make_uuid(rng):
    """Generate reproducible UUID from rng (so seed controls all output)."""
    return str(uuid.UUID(bytes=bytes(rng.integers(0, 256, size=16, dtype=np.uint8))))


# ============================================================================
# CONSTANTS — Single source of truth
# ============================================================================

RANDOM_SEED = 42
N_USERS = 2000

# Output paths (relative to MLService root)
OUTPUT_DIR = "data/synthetic"
USERS_CSV = "users.csv"
TRANSACTIONS_CSV = "transactions.csv"

# Reference end date — synthetic data spans (today - active_period) ... today
REFERENCE_END_DATE = datetime(2026, 5, 1)


# ---- Category taxonomy (aligned with backend) ----
INCOME_CATEGORIES = ["Salary", "Investment", "Freelance", "Other Income"]
EXPENSE_CATEGORIES = [
    "Rent", "Bills", "Grocery", "Transportation",
    "Health", "Clothing", "Entertainment",
    "Education", "Electronics", "Other Expense"
]

# Turkish household consumption distribution (TÜİK 2024 reference)
BASE_EXPENSE_DISTRIBUTION = {
    "Rent":           0.18,
    "Bills":          0.10,
    "Grocery":        0.20,
    "Transportation": 0.13,
    "Health":         0.06,
    "Clothing":       0.07,
    "Entertainment":  0.10,
    "Education":      0.04,
    "Electronics":    0.05,
    "Other Expense":  0.07,
}
assert abs(sum(BASE_EXPENSE_DISTRIBUTION.values()) - 1.0) < 1e-9


# ---- User generation parameters ----
RISK_CLASS_DISTRIBUTION = {"Low": 0.60, "Medium": 0.30, "High": 0.10}
NOISY_LABEL_RATIO = 0.07

# Income bins (TRY/month) — based on Turkey 2026 minimum wage (28.075 net)
# Light oversample on upper bins for statistical reliability in High income classes
INCOME_BINS = [
    (28_000, 45_000),
    (45_000, 80_000),
    (80_000, 150_000),
    (150_000, 300_000),
    (300_000, 600_000),
]

# Weak income↔risk correlation (overlap preserved, no deterministic mapping)
INCOME_BIN_WEIGHTS_BY_RISK = {
    "Low":    [0.20, 0.25, 0.25, 0.20, 0.10],
    "Medium": [0.30, 0.30, 0.20, 0.15, 0.05],
    "High":   [0.45, 0.30, 0.15, 0.08, 0.02],
}

# Behavioral parameter distributions (Beta a, b for [0,1] ratios)
# v2.0 refinement: moderately tightened class separation while preserving overlap.
# Mean values calibrated to Turkish household consumption survey (TÜİK 2024).
SPENDING_RATIO_BETA = {
    "Low":    (2, 6),     # mean 0.250 (upper-middle income, ~25% spending)
    "Medium": (3, 3),     # mean 0.500 (middle income, ~50% spending)
    "High":   (6, 2),     # mean 0.750 (lower income / overspenders, ~75%)
}
DEBT_RATIO_BETA = {
    "Low":    (2, 8),     # mean 0.200
    "Medium": (3, 4),     # mean 0.429
    "High":   (5, 3),     # mean 0.625
}
ANOMALY_PROPENSITY_BETA = {
    "Low":    (1, 45),    # mean 0.022 (slightly tighter)
    "Medium": (2, 28),    # mean 0.067 (slight increase)
    "High":   (3, 17),    # mean 0.150 (more pronounced)
}
# Spending volatility — Normal (clipped to [0.05, 0.80])
VOLATILITY_NORMAL = {
    "Low":    (0.13, 0.05),  # stable income → stable spending
    "Medium": (0.30, 0.09),  # moderate volatility
    "High":   (0.50, 0.13),  # financial stress → erratic spending
}
SPENDING_PROFILE_PROBS = {
    "Low":    [0.80, 0.20, 0.00],
    "Medium": [0.40, 0.50, 0.10],
    "High":   [0.20, 0.40, 0.40],
}
SPENDING_PROFILES = ["stable", "volatile", "accelerating"]

N_TRANSACTIONS_RANGE = (200, 500)
ACTIVE_PERIOD_RANGE = (180, 540)


# ---- Transaction generation parameters ----
CATEGORY_MONTHLY_FREQUENCY = {
    "Rent":           1.0,
    "Bills":          2.5,
    "Grocery":        7.0,
    "Transportation": 6.0,
    "Health":         0.4,
    "Clothing":       1.0,
    "Entertainment":  4.5,
    "Education":      0.7,
    "Electronics":    0.25,
    "Other Expense":  1.5,
}

INCOME_CATEGORY_PROBS = {
    "Investment":   0.20,
    "Freelance":    0.15,
    "Other Income": 0.10,
}
INCOME_MONTHLY_FREQUENCY = {
    "Salary":       1.0,
    "Investment":   0.8,
    "Freelance":    1.5,
    "Other Income": 0.5,
}
SALARY_TO_INCOME_RANGE = (0.85, 1.00)
EXTRA_INCOME_SCALE = {
    "Investment":   (0.05, 0.25),
    "Freelance":    (0.15, 0.60),
    "Other Income": (0.05, 0.30),
}

WEEKEND_BIAS_CATEGORIES = ["Grocery", "Entertainment", "Clothing"]
MONTH_START_CATEGORIES = ["Rent"]


# ---- Anomaly injection parameters ----
ANOMALY_TYPE_PROBS = {
    'amount':    0.50,
    'category':  0.20,
    'frequency': 0.15,
    'mixed':     0.15,
}
AMOUNT_MULTIPLIER_RANGE = (5.0, 10.0)
CATEGORY_MULTIPLIER_RANGE = (2.5, 4.5)
FREQUENCY_MULTIPLIER_RANGE = (2.0, 4.0)
MIXED_MULTIPLIER_RANGE = (8.0, 15.0)
RARE_CAT_MAX_COUNT = 5
FREQ_MIN_GAP_DAYS = 60
INCOME_CAP_MULTIPLIER = 1.499


# ============================================================================
# USER GENERATION
# ============================================================================

@dataclass
class SyntheticUser:
    user_id: str
    risk_class: str
    risk_class_original: str
    is_label_noisy: bool
    monthly_income: float
    spending_ratio: float
    base_monthly_spend: float
    spend_volatility: float
    debt_ratio: float
    anomaly_propensity: float
    spending_profile: str
    n_transactions: int
    active_period_days: int
    category_preferences: Dict[str, float]


def _sample_income(rng, risk_class):
    weights = INCOME_BIN_WEIGHTS_BY_RISK[risk_class]
    bin_idx = rng.choice(len(INCOME_BINS), p=weights)
    low, high = INCOME_BINS[bin_idx]
    return float(np.exp(rng.uniform(np.log(low), np.log(high))))


def _sample_beta(rng, params):
    return float(rng.beta(params[0], params[1]))


def _sample_normal_clipped(rng, params, lo=0.05, hi=0.80):
    return float(np.clip(rng.normal(*params), lo, hi))


def _sample_category_preferences(rng, noise_pct=0.20):
    perturbed = {cat: base * rng.uniform(1 - noise_pct, 1 + noise_pct)
                  for cat, base in BASE_EXPENSE_DISTRIBUTION.items()}
    total = sum(perturbed.values())
    return {k: v / total for k, v in perturbed.items()}


def _assign_risk_classes(n_users, rng):
    n_low = int(n_users * RISK_CLASS_DISTRIBUTION["Low"])
    n_med = int(n_users * RISK_CLASS_DISTRIBUTION["Medium"])
    n_high = n_users - n_low - n_med
    classes = ["Low"] * n_low + ["Medium"] * n_med + ["High"] * n_high
    rng.shuffle(classes)
    return classes


def _apply_label_noise(risk_classes, rng):
    n = len(risk_classes)
    n_flip = int(n * NOISY_LABEL_RATIO)
    flip_indices = rng.choice(n, size=n_flip, replace=False)
    new_classes = list(risk_classes)
    is_noisy = [False] * n
    for idx in flip_indices:
        orig = risk_classes[idx]
        if orig == "Low":
            new_classes[idx] = "Medium"
        elif orig == "High":
            new_classes[idx] = "Medium"
        else:
            new_classes[idx] = rng.choice(["Low", "High"])
        is_noisy[idx] = True
    return new_classes, is_noisy


def generate_users(n_users=N_USERS, seed=RANDOM_SEED):
    """Generate synthetic user population with risk profiles and behavioral params."""
    rng = np.random.default_rng(seed)
    original_classes = _assign_risk_classes(n_users, rng)
    
    users = []
    for risk in original_classes:
        income = _sample_income(rng, risk)
        spending_ratio = _sample_beta(rng, SPENDING_RATIO_BETA[risk])
        base_spend = income * spending_ratio
        users.append(SyntheticUser(
            user_id=_make_uuid(rng),
            risk_class=risk,
            risk_class_original=risk,
            is_label_noisy=False,
            monthly_income=round(income, 2),
            spending_ratio=round(spending_ratio, 4),
            base_monthly_spend=round(base_spend, 2),
            spend_volatility=round(_sample_normal_clipped(rng, VOLATILITY_NORMAL[risk]), 4),
            debt_ratio=round(_sample_beta(rng, DEBT_RATIO_BETA[risk]), 4),
            anomaly_propensity=round(_sample_beta(rng, ANOMALY_PROPENSITY_BETA[risk]), 4),
            spending_profile=str(rng.choice(SPENDING_PROFILES, p=SPENDING_PROFILE_PROBS[risk])),
            n_transactions=int(rng.integers(*N_TRANSACTIONS_RANGE)),
            active_period_days=int(rng.integers(*ACTIVE_PERIOD_RANGE)),
            category_preferences=_sample_category_preferences(rng),
        ))
    
    new_classes, is_noisy = _apply_label_noise(original_classes, rng)
    for u, new_class, noisy in zip(users, new_classes, is_noisy):
        u.risk_class = new_class
        u.is_label_noisy = noisy
    
    rows = []
    for u in users:
        d = asdict(u)
        cat_prefs = d.pop("category_preferences")
        for cat, val in cat_prefs.items():
            d[f"pref_{cat.replace(' ', '_')}"] = round(val, 4)
        rows.append(d)
    return pd.DataFrame(rows)


# ============================================================================
# TRANSACTION GENERATION
# ============================================================================

def _parse_category_preferences(user_row):
    return {cat: float(user_row[f"pref_{cat.replace(' ', '_')}"])
            for cat in EXPENSE_CATEGORIES}


def _sample_amount_lognormal(rng, mean, volatility):
    if mean <= 0:
        return 0.0
    sigma = max(volatility, 0.05)
    mu = np.log(mean) - 0.5 * sigma ** 2
    return float(rng.lognormal(mu, sigma))


def _sample_timestamp(rng, start_date, end_date, category, preferred_day_of_month=None):
    total_days = (end_date - start_date).days
    if total_days <= 0:
        return start_date
    
    if category in MONTH_START_CATEGORIES:
        day_offset = int(rng.integers(0, total_days))
        candidate = start_date + timedelta(days=day_offset)
        target_day = int(rng.integers(1, 6))
        try:
            return candidate.replace(day=target_day)
        except ValueError:
            return candidate
    
    if category == "Salary" and preferred_day_of_month is not None:
        month_offset = int(rng.integers(0, max(1, total_days // 30)))
        target_date = start_date + timedelta(days=month_offset * 30)
        try:
            return target_date.replace(day=preferred_day_of_month)
        except ValueError:
            return target_date.replace(day=min(preferred_day_of_month, 28))
    
    if category in WEEKEND_BIAS_CATEGORIES:
        day_offset = int(rng.integers(0, total_days))
        candidate = start_date + timedelta(days=day_offset)
        if rng.random() < 0.60 and candidate.weekday() < 5:
            shift = 5 - candidate.weekday() + int(rng.integers(0, 2))
            candidate = candidate + timedelta(days=shift)
            if candidate > end_date:
                candidate = end_date - timedelta(days=int(rng.integers(0, 7)))
        return candidate
    
    day_offset = int(rng.integers(0, total_days))
    seconds_offset = int(rng.integers(0, 86400))
    return start_date + timedelta(days=day_offset, seconds=seconds_offset)


def _generate_user_transactions(user_row, rng, reference_end_date):
    user_id = user_row['user_id']
    monthly_income = user_row['monthly_income']
    base_monthly_spend = user_row['base_monthly_spend']
    volatility = user_row['spend_volatility']
    n_total = int(user_row['n_transactions'])
    active_days = int(user_row['active_period_days'])
    spending_profile = user_row['spending_profile']
    cat_prefs = _parse_category_preferences(user_row)
    
    start_date = reference_end_date - timedelta(days=active_days)
    n_months = max(active_days / 30.0, 1.0)
    salary_day = int(rng.integers(1, 8))
    
    active_extra_income = [cat for cat, prob in INCOME_CATEGORY_PROBS.items()
                            if rng.random() < prob]
    
    def time_factor(date):
        if spending_profile == "stable":
            return 1.0
        elif spending_profile == "volatile":
            return float(rng.uniform(0.7, 1.3))
        else:  # accelerating
            progress = (date - start_date).days / active_days
            return 0.6 + progress * 0.8
    
    transactions = []
    
    # Income: Salary
    n_salary = int(n_months)
    for m in range(n_salary):
        target_date = start_date + timedelta(days=m * 30)
        try:
            tx_date = target_date.replace(day=salary_day)
        except ValueError:
            tx_date = target_date.replace(day=min(salary_day, 28))
        if tx_date > reference_end_date:
            continue
        amount = monthly_income * rng.uniform(*SALARY_TO_INCOME_RANGE) * rng.uniform(0.97, 1.03)
        transactions.append({
            'transaction_id': _make_uuid(rng),
            'user_id': user_id,
            'transaction_date': tx_date,
            'category': 'Salary',
            'transaction_type': 'Income',
            'amount': round(amount, 2),
            'is_anomaly': False,
            'anomaly_type': None,
        })
    
    # Income: Extra (Investment, Freelance, Other Income)
    for cat in active_extra_income:
        freq = INCOME_MONTHLY_FREQUENCY[cat]
        n_tx = int(rng.poisson(freq * n_months))
        scale_lo, scale_hi = EXTRA_INCOME_SCALE[cat]
        for _ in range(n_tx):
            tx_date = _sample_timestamp(rng, start_date, reference_end_date, cat)
            amount = monthly_income * rng.uniform(scale_lo, scale_hi)
            transactions.append({
                'transaction_id': _make_uuid(rng),
                'user_id': user_id,
                'transaction_date': tx_date,
                'category': cat,
                'transaction_type': 'Income',
                'amount': round(amount, 2),
                'is_anomaly': False,
                'anomaly_type': None,
            })
    
    # Expense: n_transactions hedefli proportional scaling
    n_income_so_far = len([t for t in transactions if t['transaction_type'] == 'Income'])
    expense_budget = max(n_total - n_income_so_far, 50)
    
    expected_counts = {}
    for cat in EXPENSE_CATEGORIES:
        cat_pref = cat_prefs[cat]
        base_freq = CATEGORY_MONTHLY_FREQUENCY[cat]
        base_ratio = BASE_EXPENSE_DISTRIBUTION[cat]
        freq_multiplier = cat_pref / base_ratio if base_ratio > 0 else 1.0
        freq_multiplier = float(np.clip(freq_multiplier, 0.5, 1.8))
        adjusted_freq = base_freq * freq_multiplier
        if cat == "Rent":
            adjusted_freq = 1.0
        expected_counts[cat] = adjusted_freq * n_months
    
    total_expected = sum(expected_counts.values())
    if total_expected > 0:
        scale = expense_budget / total_expected
        scaled_counts = {cat: max(1 if cat in ("Rent",) else 0, int(round(cnt * scale)))
                          for cat, cnt in expected_counts.items()}
    else:
        scaled_counts = {cat: 0 for cat in EXPENSE_CATEGORIES}
    
    for cat in EXPENSE_CATEGORIES:
        cat_pref = cat_prefs[cat]
        n_tx = scaled_counts[cat]
        if n_tx == 0:
            continue
        monthly_cat_total = base_monthly_spend * cat_pref
        cat_monthly_freq = n_tx / n_months
        avg_amount = monthly_cat_total / max(cat_monthly_freq, 0.1)
        
        for _ in range(n_tx):
            tx_date = _sample_timestamp(rng, start_date, reference_end_date, cat)
            tf = time_factor(tx_date)
            if cat == "Rent":
                amount = avg_amount * tf * rng.uniform(0.95, 1.05)
            else:
                amount = _sample_amount_lognormal(rng, avg_amount * tf, volatility)
            amount = max(amount, 10.0)
            transactions.append({
                'transaction_id': _make_uuid(rng),
                'user_id': user_id,
                'transaction_date': tx_date,
                'category': cat,
                'transaction_type': 'Expense',
                'amount': round(amount, 2),
                'is_anomaly': False,
                'anomaly_type': None,
            })
    
    return transactions


def generate_all_transactions(users_df, seed=RANDOM_SEED, reference_end_date=None):
    rng = np.random.default_rng(seed)
    if reference_end_date is None:
        reference_end_date = REFERENCE_END_DATE
    
    all_tx = []
    n_users = len(users_df)
    for i, row in users_df.iterrows():
        all_tx.extend(_generate_user_transactions(row, rng, reference_end_date))
        if (i + 1) % 200 == 0:
            print(f"  Generated transactions for {i+1}/{n_users} users "
                  f"(total: {len(all_tx):,} tx)")
    
    df = pd.DataFrame(all_tx)
    return df.sort_values(['user_id', 'transaction_date']).reset_index(drop=True)


# ============================================================================
# ANOMALY INJECTION
# ============================================================================

def inject_anomalies(tx_df, users_df, seed=RANDOM_SEED):
    rng = np.random.default_rng(seed + 1)
    tx = tx_df.copy()
    tx['transaction_date'] = pd.to_datetime(tx['transaction_date'])
    tx['anomaly_type'] = tx['anomaly_type'].astype('object')
    tx['is_anomaly'] = tx['is_anomaly'].astype('bool')
    
    users_indexed = users_df.set_index('user_id')
    type_keys = list(ANOMALY_TYPE_PROBS.keys())
    type_probs = list(ANOMALY_TYPE_PROBS.values())
    type_counters = {k: 0 for k in type_keys}
    
    for user_id, user_tx in tx.groupby('user_id'):
        user_row = users_indexed.loc[user_id]
        propensity = float(user_row['anomaly_propensity'])
        income_cap = float(user_row['monthly_income']) * INCOME_CAP_MULTIPLIER
        
        expense_mask = user_tx['transaction_type'] == 'Expense'
        expense_indices = user_tx[expense_mask].index.tolist()
        n_anomalies = int(round(len(user_tx) * propensity))
        if n_anomalies == 0 or len(expense_indices) == 0:
            continue
        n_anomalies = min(n_anomalies, len(expense_indices))
        
        expense_tx = user_tx[expense_mask]
        cat_means = expense_tx.groupby('category')['amount'].mean().to_dict()
        cat_counts = expense_tx['category'].value_counts().to_dict()
        user_overall_mean = float(expense_tx['amount'].mean())
        
        # User-level rare categories
        used_cats = set(cat_counts.keys())
        unused_cats = [c for c in EXPENSE_CATEGORIES if c not in used_cats and c != 'Rent']
        seldom_used = [c for c, n in cat_counts.items()
                        if n <= RARE_CAT_MAX_COUNT and c != 'Rent']
        rare_cats = unused_cats + seldom_used
        if not rare_cats:
            sorted_cats = sorted([(c, n) for c, n in cat_counts.items() if c != 'Rent'],
                                  key=lambda x: x[1])
            rare_cats = [c for c, _ in sorted_cats[:2]]
        
        # Frequency anomaly: doğal high-gap tx'ler
        es = expense_tx.sort_values('transaction_date').copy()
        es['prev_in_cat'] = es.groupby('category')['transaction_date'].shift(1)
        es['gap'] = (pd.to_datetime(es['transaction_date']) -
                      pd.to_datetime(es['prev_in_cat'])).dt.days
        high_gap_indices = es[es['gap'] >= FREQ_MIN_GAP_DAYS].index.tolist()
        rng.shuffle(high_gap_indices)
        
        types = rng.choice(type_keys, size=n_anomalies, p=type_probs)
        available = list(expense_indices)
        rng.shuffle(available)
        
        for atype in types:
            if atype == 'amount':
                if not available:
                    break
                idx = available.pop()
                cat = tx.at[idx, 'category']
                base = cat_means.get(cat, user_overall_mean)
                new_amount = min(base * rng.uniform(*AMOUNT_MULTIPLIER_RANGE), income_cap)
                tx.at[idx, 'amount'] = round(float(new_amount), 2)
                tx.at[idx, 'is_anomaly'] = True
                tx.at[idx, 'anomaly_type'] = 'amount'
                type_counters['amount'] += 1
            
            elif atype == 'category':
                if not available:
                    break
                idx = available.pop()
                new_cat = str(rng.choice(rare_cats))
                new_amount = min(user_overall_mean * rng.uniform(*CATEGORY_MULTIPLIER_RANGE),
                                 income_cap)
                tx.at[idx, 'category'] = new_cat
                tx.at[idx, 'amount'] = round(float(new_amount), 2)
                tx.at[idx, 'is_anomaly'] = True
                tx.at[idx, 'anomaly_type'] = 'category'
                type_counters['category'] += 1
            
            elif atype == 'mixed':
                if not available:
                    break
                idx = available.pop()
                new_cat = str(rng.choice(rare_cats))
                new_amount = min(user_overall_mean * rng.uniform(*MIXED_MULTIPLIER_RANGE),
                                 income_cap)
                tx.at[idx, 'category'] = new_cat
                tx.at[idx, 'amount'] = round(float(new_amount), 2)
                tx.at[idx, 'is_anomaly'] = True
                tx.at[idx, 'anomaly_type'] = 'mixed'
                type_counters['mixed'] += 1
            
            elif atype == 'frequency':
                idx = None
                while high_gap_indices:
                    candidate = high_gap_indices.pop()
                    if not bool(tx.at[candidate, 'is_anomaly']):
                        idx = candidate
                        break
                if idx is None:
                    if not available:
                        continue
                    idx = available.pop()
                cat = tx.at[idx, 'category']
                base = cat_means.get(cat, user_overall_mean)
                new_amount = min(base * rng.uniform(*FREQUENCY_MULTIPLIER_RANGE), income_cap)
                tx.at[idx, 'amount'] = round(float(new_amount), 2)
                tx.at[idx, 'is_anomaly'] = True
                tx.at[idx, 'anomaly_type'] = 'frequency'
                type_counters['frequency'] += 1
                if idx in available:
                    available.remove(idx)
    
    tx = tx.sort_values(['user_id', 'transaction_date']).reset_index(drop=True)
    
    print("\n--- Anomaly Injection Summary ---")
    for atype, count in type_counters.items():
        print(f"  {atype:<12} {count:>6,}")
    total = sum(type_counters.values())
    print(f"  {'TOTAL':<12} {total:>6,}")
    print(f"  Overall anomaly ratio: {total / len(tx) * 100:.2f}%")
    
    return tx


# ============================================================================
# MAIN PIPELINE
# ============================================================================

def main():
    print("="*70)
    print("AFRATS Synthetic Dataset Generator")
    print("="*70)
    print(f"Seed: {RANDOM_SEED}  |  Users: {N_USERS}  |  Reference date: {REFERENCE_END_DATE.date()}")
    
    # Ensure output directory exists
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # 1. Generate users
    print("\n[1/3] Generating users...")
    users_df = generate_users()
    print(f"  ✓ {len(users_df)} users generated")
    print(f"  Risk distribution: "
          f"Low={(users_df['risk_class_original']=='Low').sum()}, "
          f"Medium={(users_df['risk_class_original']=='Medium').sum()}, "
          f"High={(users_df['risk_class_original']=='High').sum()}")
    print(f"  Noisy labels: {users_df['is_label_noisy'].sum()} ({users_df['is_label_noisy'].mean()*100:.1f}%)")
    
    # 2. Generate transactions
    print("\n[2/3] Generating transactions...")
    tx_df = generate_all_transactions(users_df)
    print(f"  ✓ {len(tx_df):,} transactions generated")
    
    # 3. Inject anomalies
    print("\n[3/3] Injecting anomalies...")
    tx_df = inject_anomalies(tx_df, users_df)
    
    # Save outputs
    users_path = os.path.join(OUTPUT_DIR, USERS_CSV)
    tx_path = os.path.join(OUTPUT_DIR, TRANSACTIONS_CSV)
    users_df.to_csv(users_path, index=False)
    tx_df.to_csv(tx_path, index=False)
    
    print("\n" + "="*70)
    print("✓ Dataset generation complete")
    print("="*70)
    print(f"  Users:        {users_path}  ({len(users_df):,} rows)")
    print(f"  Transactions: {tx_path}  ({len(tx_df):,} rows)")
    print(f"\nNext step: train ML models")
    print(f"  python scripts/train_anomaly_model.py")
    print(f"  python scripts/train_risk_model.py")


if __name__ == "__main__":
    main()
