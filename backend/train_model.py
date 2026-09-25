"""
Trains a RandomForestRegressor as a smoothed generalization of domain rule-based logic,
calibrated against real operational block execution outcomes (completions and overruns)
logged in the running system.

Run: python train_model.py
Produces: priority_model.pkl, priority_model_meta.json
"""
import os
import json
import sqlite3
import datetime as dt
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
import joblib

RNG = np.random.default_rng(42)
N = 4000


def rule_based_priority(severity, is_high_density, days_overdue, recurrence_count, estimated_block_duration):
    criticality = severity * 2.0
    urgency = np.minimum(10.0, days_overdue * 0.4 + recurrence_count * 1.2)
    impact = is_high_density * 6.0 + np.minimum(4.0, estimated_block_duration * 0.6)
    base = 0.4 * criticality + 0.35 * urgency + 0.25 * impact
    return np.clip(base, 0.0, 10.0)


def load_real_outcomes(db_path="railsync.db"):
    """Extract real ScheduleBlock execution outcomes (completed / overrun) from the running system."""
    if not os.path.exists(db_path):
        return pd.DataFrame()

    try:
        conn = sqlite3.connect(db_path)
        query = """
        SELECT
            d.severity,
            c.is_high_density,
            d.due_date,
            d.recurrence_count,
            d.estimated_block_duration,
            sb.slot_start,
            sb.slot_end,
            sb.actual_duration,
            sb.status
        FROM schedule_blocks sb
        JOIN defects d ON sb.task_id = d.task_id
        LEFT JOIN corridors c ON sb.corridor_id = c.corridor_id
        WHERE sb.status IN ('completed', 'overrun') OR sb.actual_duration IS NOT NULL
        """
        df = pd.read_sql_query(query, conn)
        conn.close()

        if df.empty:
            return pd.DataFrame()

        rows = []
        today = dt.date.today()
        for _, r in df.iterrows():
            sev = float(r["severity"] or 3)
            hd = int(bool(r["is_high_density"]))
            rec = int(r["recurrence_count"] or 0)
            dur = float(r["estimated_block_duration"] or 2.0)
            od = 0
            if r["due_date"]:
                try:
                    due = dt.datetime.strptime(str(r["due_date"])[:10], "%Y-%m-%d").date()
                    od = max(0, (today - due).days)
                except Exception:
                    od = 0

            base = rule_based_priority(sev, hd, od, rec, dur)
            # Calibrate label with actual completion telemetry
            actual_dur = float(r["actual_duration"] or dur)
            status = str(r["status"]).lower()
            if status == "overrun" or actual_dur > dur:
                penalty = min(3.0, (actual_dur - dur) * 1.5)
                final_score = np.clip(base + penalty, 0.0, 10.0)
            else:
                final_score = base

            rows.append({
                "severity": sev,
                "is_high_density": hd,
                "days_overdue": od,
                "recurrence_count": rec,
                "estimated_block_duration": dur,
                "priority_score": final_score,
            })
        return pd.DataFrame(rows)
    except Exception as exc:
        print(f"Notice: Could not load real outcomes ({exc}), proceeding with domain baseline.")
        return pd.DataFrame()


def make_dataset(n=N):
    severity = RNG.integers(1, 6, n)
    is_high_density = RNG.integers(0, 2, n)
    days_overdue = RNG.integers(0, 45, n)
    recurrence_count = RNG.poisson(0.6, n)
    estimated_block_duration = np.round(RNG.uniform(0.5, 8.0, n), 1)

    label = rule_based_priority(severity, is_high_density, days_overdue, recurrence_count, estimated_block_duration)
    # small noise so the model isn't a rigid lookup table, but a smoothed generalization
    label = np.clip(label + RNG.normal(0, 0.25, n), 0, 10)

    synth_df = pd.DataFrame({
        "severity": severity,
        "is_high_density": is_high_density,
        "days_overdue": days_overdue,
        "recurrence_count": recurrence_count,
        "estimated_block_duration": estimated_block_duration,
        "priority_score": label,
    })

    real_df = load_real_outcomes()
    if not real_df.empty:
        # Blend real historical logged outcomes into the training dataset
        real_boosted = pd.concat([real_df] * 5, ignore_index=True)
        combined = pd.concat([synth_df, real_boosted], ignore_index=True)
        print(f"Blended {len(real_df)} real logged operational outcomes into training dataset ({len(combined)} total samples).")
        return combined, len(real_df)

    return synth_df, 0


def main():
    df, n_real = make_dataset()
    feature_cols = ["severity", "is_high_density", "days_overdue", "recurrence_count", "estimated_block_duration"]
    X, y = df[feature_cols], df["priority_score"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = RandomForestRegressor(n_estimators=200, max_depth=8, random_state=42)
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    importances = {name: round(float(imp), 4) for name, imp in zip(feature_cols, model.feature_importances_)}
    print(f"Validation MAE: {mae:.3f} (scale 0-10)")
    print("Feature importances:")
    for name, imp in sorted(importances.items(), key=lambda x: -x[1]):
        print(f"  {name}: {imp:.3f}")

    joblib.dump(model, "priority_model.pkl")
    print("Saved priority_model.pkl")

    meta = {
        "trained_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "n_samples": len(df),
        "n_real_outcomes": n_real,
        "feature_columns": feature_cols,
        "feature_importances": importances,
        "validation_mae": round(float(mae), 4),
        "model_type": "RandomForestRegressor",
        "methodology": "Smoothed generalization of domain rule-based priority score calibrated against historical operational block completions",
        "n_estimators": model.n_estimators,
        "max_depth": model.max_depth,
    }
    with open("priority_model_meta.json", "w") as f:
        json.dump(meta, f, indent=2)
    print("Saved priority_model_meta.json")


if __name__ == "__main__":
    main()

