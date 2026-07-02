import pandas as pd
import numpy as np

print("Loading data...")
df = pd.read_csv("data/raw/fraudTrain.csv")

print("\n" + "="*50)
print("1. BASIC INFO")
print("="*50)
print(f"Row count:    {len(df):,}")
print(f"Column count: {len(df.columns)}")
print(f"\nColumns:\n{list(df.columns)}")

print("\n" + "="*50)
print("2. FIRST 5 ROWS")
print("="*50)
print(df.head())

print("\n" + "="*50)
print("3. DATA TYPES")
print("="*50)
print(df.dtypes)

print("\n" + "="*50)
print("4. MISSING VALUES")
print("="*50)
print(df.isnull().sum())

print("\n" + "="*50)
print("5. FRAUD RATIO")
print("="*50)
fraud_count = df["is_fraud"].sum()
total = len(df)
print(f"Normal transactions: {total - fraud_count:,}")
print(f"Fraud transactions:  {fraud_count:,}")
print(f"Fraud ratio:         %{fraud_count/total*100:.2f}")

print("\n" + "="*50)
print("6. AMOUNT STATISTICS")
print("="*50)
print(df["amt"].describe())

print("\n" + "="*50)
print("7. CATEGORIES")
print("="*50)
print(df["category"].value_counts())

print("\n" + "="*50)
print("8. USER COUNT (cc_num)")
print("="*50)
print(f"Unique users:                {df['cc_num'].nunique():,}")
print(f"Average transactions/user:   {len(df)/df['cc_num'].nunique():.1f}")

print("\n" + "="*50)
print("9. FRAUD vs NORMAL — AMOUNT COMPARISON")
print("="*50)
print(df.groupby("is_fraud")["amt"].describe())

print("\nEDA complete.")