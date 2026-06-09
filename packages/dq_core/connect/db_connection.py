import time
from typing import Any, List, Optional

try:
    from hdbcli import dbapi as hdbapi
    HDBCLI_AVAILABLE = True
except ImportError:
    HDBCLI_AVAILABLE = False


class DBConnection:
    def __init__(self, host: str, port: int, user: str, password: str,
                 schema: str, max_retries: int = 3, retry_delay: float = 1.0):
        self.host = host
        self.port = port
        self.user = user
        self.password = password
        self.schema = schema
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self._conn = None
        self._connect()

    def _connect(self):
        if not HDBCLI_AVAILABLE:
            raise RuntimeError("hdbcli not installed. Install with: pip install dq_core[hana]")
        for attempt in range(self.max_retries):
            try:
                self._conn = hdbapi.connect(
                    address=self.host, port=self.port,
                    user=self.user, password=self.password,
                )
                return
            except Exception as e:
                if attempt == self.max_retries - 1:
                    raise
                time.sleep(self.retry_delay * (2 ** attempt))

    def execute(self, sql: str, params=None) -> List[tuple]:
        for attempt in range(self.max_retries):
            try:
                cursor = self._conn.cursor()
                if params:
                    cursor.execute(sql, params)
                else:
                    cursor.execute(sql)
                return cursor.fetchall()
            except Exception as e:
                if attempt == self.max_retries - 1:
                    raise
                time.sleep(self.retry_delay * (2 ** attempt))
                try:
                    self._connect()
                except Exception:
                    pass
        return []

    def close(self):
        if self._conn:
            try:
                self._conn.close()
            except Exception:
                pass
            self._conn = None
