# Stub - uses sqlglot when available
from typing import List


def parse_column_references(sql: str) -> List[str]:
    try:
        import sqlglot
        tree = sqlglot.parse_one(sql)
        return [str(col) for col in tree.find_all(sqlglot.expressions.Column)]
    except Exception:
        return []
