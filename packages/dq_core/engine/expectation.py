# ENGINE-FROZEN - Do not add framework imports (fastapi/flask/starlette)
"""
Expectation grammar evaluator.

Supported expressions:
  IS NULL
  IS NOT NULL
  = n  |  != n  |  >= n  |  <= n  |  > n  |  < n
  BETWEEN a AND b
  = n ±t          (tolerance, e.g. "= 100 ±5")
  IN(v1, v2, ...)
  NOT IN(v1, v2, ...)
  DELTA <op> p%   (uses previous_value, e.g. "DELTA < 10%")
  MATCHES /regex/
"""

import re
from typing import Optional, Any

# Pre-compiled patterns
_BETWEEN_RE = re.compile(
    r"^\s*BETWEEN\s+(-?[\d.]+(?:[eE][+-]?\d+)?)\s+AND\s+(-?[\d.]+(?:[eE][+-]?\d+)?)\s*$",
    re.IGNORECASE,
)
_COMPARE_RE = re.compile(
    r"^\s*(!=|>=|<=|=|>|<)\s*(-?[\d.]+(?:[eE][+-]?\d+)?)\s*$"
)
_TOLERANCE_RE = re.compile(
    r"^\s*=\s*(-?[\d.]+(?:[eE][+-]?\d+)?)\s*[±]\s*([\d.]+(?:[eE][+-]?\d+)?)\s*$"
)
_IN_RE = re.compile(r"^\s*(NOT\s+)?IN\s*\(([^)]*)\)\s*$", re.IGNORECASE)
_DELTA_RE = re.compile(
    r"^\s*DELTA\s*(!=|>=|<=|=|>|<)\s*([\d.]+(?:[eE][+-]?\d+)?)%\s*$",
    re.IGNORECASE,
)
_MATCHES_RE = re.compile(r"^\s*MATCHES\s+/(.+)/([imsx]*)\s*$", re.IGNORECASE)
_IS_NULL_RE = re.compile(r"^\s*IS\s+NULL\s*$", re.IGNORECASE)
_IS_NOT_NULL_RE = re.compile(r"^\s*IS\s+NOT\s+NULL\s*$", re.IGNORECASE)


def _to_number(value: Any) -> float:
    """Coerce value to float, raise ValueError if not possible."""
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        return float(value.strip())
    raise ValueError(f"Cannot convert {value!r} to number")


def _compare(op: str, actual: float, threshold: float) -> bool:
    if op == "=":
        return actual == threshold
    if op == "!=":
        return actual != threshold
    if op == ">=":
        return actual >= threshold
    if op == "<=":
        return actual <= threshold
    if op == ">":
        return actual > threshold
    if op == "<":
        return actual < threshold
    raise ValueError(f"Unknown operator: {op!r}")


def evaluate_expectation(
    expect_expr: str,
    actual_value: Any,
    previous_value: Any = None,
) -> bool:
    """
    Evaluate *expect_expr* against *actual_value*.

    Returns True if the check passes, False otherwise.
    Raises ValueError for malformed expressions.
    """
    expr = expect_expr.strip()

    # IS NULL
    if _IS_NULL_RE.match(expr):
        return actual_value is None

    # IS NOT NULL
    if _IS_NOT_NULL_RE.match(expr):
        return actual_value is not None

    # MATCHES /regex/flags
    m = _MATCHES_RE.match(expr)
    if m:
        pattern, flags_str = m.group(1), m.group(2)
        flag_map = {"i": re.IGNORECASE, "m": re.MULTILINE, "s": re.DOTALL, "x": re.VERBOSE}
        re_flags = 0
        for ch in flags_str:
            re_flags |= flag_map.get(ch, 0)
        return bool(re.search(pattern, str(actual_value), re_flags))

    # DELTA <op> p%
    m = _DELTA_RE.match(expr)
    if m:
        op, pct_str = m.group(1), m.group(2)
        if previous_value is None:
            # No baseline yet; treat as passing (warm-up)
            return True
        prev = _to_number(previous_value)
        actual = _to_number(actual_value)
        if prev == 0:
            # Avoid division by zero; only passes if actual is also 0
            delta_pct = 0.0 if actual == 0 else float("inf")
        else:
            delta_pct = abs(actual - prev) / abs(prev) * 100.0
        threshold = float(pct_str)
        return _compare(op, delta_pct, threshold)

    # BETWEEN a AND b
    m = _BETWEEN_RE.match(expr)
    if m:
        lo, hi = float(m.group(1)), float(m.group(2))
        actual = _to_number(actual_value)
        return lo <= actual <= hi

    # = n ±t  (tolerance)
    m = _TOLERANCE_RE.match(expr)
    if m:
        center, tol = float(m.group(1)), float(m.group(2))
        actual = _to_number(actual_value)
        return abs(actual - center) <= tol

    # [NOT] IN(...)
    m = _IN_RE.match(expr)
    if m:
        negated = bool(m.group(1))
        raw_items = m.group(2)
        items = [item.strip().strip("'\"") for item in raw_items.split(",") if item.strip()]
        # Try numeric comparison first, fall back to string
        actual_str = str(actual_value).strip()
        in_set = actual_str in items
        # Also check numeric equality
        try:
            actual_num = _to_number(actual_value)
            numeric_items = []
            for it in items:
                try:
                    numeric_items.append(float(it))
                except ValueError:
                    pass
            if numeric_items:
                in_set = in_set or any(actual_num == n for n in numeric_items)
        except (ValueError, TypeError):
            pass
        return not in_set if negated else in_set

    # Simple comparisons: =, !=, >=, <=, >, <
    m = _COMPARE_RE.match(expr)
    if m:
        op, threshold_str = m.group(1), m.group(2)
        actual = _to_number(actual_value)
        threshold = float(threshold_str)
        return _compare(op, actual, threshold)

    raise ValueError(f"Unrecognised expectation expression: {expect_expr!r}")


def validate_expectation(expect_expr: str) -> bool:
    """
    Return True if *expect_expr* is syntactically valid, False otherwise.
    Does not raise.
    """
    try:
        # Use a sentinel that exercises most code paths
        evaluate_expectation(expect_expr, 0, previous_value=1)
        return True
    except ValueError:
        # Distinguish parse errors from evaluation errors
        pass
    # Try with None to cover IS NULL / IS NOT NULL paths
    try:
        evaluate_expectation(expect_expr, None, previous_value=None)
        return True
    except ValueError:
        return False
