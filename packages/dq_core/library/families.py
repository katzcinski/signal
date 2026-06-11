"""Map a compiled check (by name/guarantee-type) to a DQ family.

[R3-2] Family is an attribute of *checks*, not objects. The compiler names
checks by guarantee type (``freshness_*``, ``volume_*``, ``schema_*``, ``key_*``,
``ref_*``, ``completeness_*``, ``*_not_null``) and stamps ``CheckDef.type`` with
the library template id. We derive the family deterministically from those so
the dashboard can roll status up per object × family without a schema change.
"""
from __future__ import annotations

OBSERVABILITY = "observability"
QUALITY = "quality"

# Tokens that mark a check as belonging to the observability family. Everything
# else (schema, keys, referential, completeness, not-null, validity, …) is a
# quality check.
_OBSERVABILITY_TOKENS = (
    "freshness",
    "volume",
    "row_count",
    "replication",
    "lag",
)

FAMILIES = (OBSERVABILITY, QUALITY)


def family_of(check_name: str, check_type: str = "") -> str:
    """Return the DQ family for a check, derived from its type and name."""
    haystack = f"{check_type} {check_name}".lower()
    if any(tok in haystack for tok in _OBSERVABILITY_TOKENS):
        return OBSERVABILITY
    return QUALITY
