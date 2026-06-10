"""Observability baselines — rolling statistics for volume/freshness checks. (WS5-1)"""
from __future__ import annotations

import statistics
from datetime import datetime, timezone
from typing import Any, Optional


class BaselineManager:
    WARMUP_N = 5

    def __init__(self, store: Any) -> None:
        self._store = store

    def update_baseline(self, dataset: str, metric: str, values: list[float]) -> dict:
        if len(values) < self.WARMUP_N:
            return {"warmup_remaining": self.WARMUP_N - len(values)}

        n = len(values)
        mean_v = statistics.mean(values)
        stddev_v = statistics.stdev(values) if n > 1 else 0.0
        sorted_v = sorted(values)
        p01 = sorted_v[max(0, int(n * 0.01))]
        p99 = sorted_v[min(n - 1, int(n * 0.99))]
        median = statistics.median(values)
        mad = statistics.median([abs(v - median) for v in values])

        baseline = {
            "dataset": dataset,
            "metric": metric,
            "n": n,
            "mean_v": mean_v,
            "stddev_v": stddev_v,
            "p01": p01,
            "p99": p99,
            "mad": mad,
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "warmup_remaining": 0,
        }

        # Persist via store's context-manager connection (works for SQLiteStore).
        if hasattr(self._store, "_conn"):
            with self._store._conn() as conn:
                conn.execute(
                    """INSERT OR REPLACE INTO dq_baselines
                       (dataset, metric, n, mean_v, stddev_v, p01, p99, mad, updated_at, warmup_remaining)
                       VALUES (?,?,?,?,?,?,?,?,?,?)""",
                    (dataset, metric, n, mean_v, stddev_v, p01, p99, mad,
                     baseline["updated_at"], 0),
                )
        return baseline

    def get_baseline(self, dataset: str, metric: str) -> Optional[dict]:
        if not hasattr(self._store, "_conn"):
            return None
        with self._store._conn() as conn:
            row = conn.execute(
                "SELECT * FROM dq_baselines WHERE dataset=? AND metric=?",
                (dataset, metric),
            ).fetchone()
        return dict(row) if row else None

    def compute_bounds(self, baseline: dict, sigma: float = 3.0) -> tuple[float, float]:
        mean = baseline.get("mean_v", 0.0)
        std = baseline.get("stddev_v", 0.0)
        return (mean - sigma * std, mean + sigma * std)
