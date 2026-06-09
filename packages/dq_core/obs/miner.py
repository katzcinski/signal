import uuid
from datetime import datetime, timezone
from typing import List


class ProposalMiner:
    def __init__(self, store):
        self.store = store

    def mine(self, dataset: str) -> List[dict]:
        """
        Analyze actual_value time series to generate contract improvement proposals.
        NO auto-apply. NO PII raw reads (E6/S1).
        """
        proposals = []
        if not hasattr(self.store, '_conn'):
            return proposals

        # Get checks that have run history for this dataset
        rows = self.store._conn.execute("""
            SELECT cr.check_name, cr.actual_value, r.started_at
            FROM dq_check_results cr
            JOIN dq_runs r ON r.run_id = cr.run_id
            WHERE r.dataset = ? AND cr.actual_value IS NOT NULL
            ORDER BY cr.check_name, r.started_at DESC
        """, (dataset,)).fetchall()

        by_check = {}
        for row in rows:
            cn = row["check_name"]
            by_check.setdefault(cn, []).append(row["actual_value"])

        for check_name, actuals in by_check.items():
            if len(actuals) < 5:
                continue
            try:
                nums = [float(v) for v in actuals]
            except (TypeError, ValueError):
                continue

            import statistics
            mean = statistics.mean(nums)
            std = statistics.stdev(nums) if len(nums) > 1 else 0

            if std / (abs(mean) + 1e-9) < 0.05:  # stable range
                proposals.append({
                    "id": str(uuid.uuid4()),
                    "product": dataset,
                    "guarantee_patch": {
                        "type": "bounds",
                        "check": check_name,
                        "suggested_min": mean - 3 * std,
                        "suggested_max": mean + 3 * std,
                    },
                    "evidence": {"mean": mean, "std": std, "n": len(nums)},
                    "status": "open",
                    "created_at": datetime.now(timezone.utc).isoformat(),
                })

        return proposals
