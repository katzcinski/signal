import json
from pathlib import Path
from typing import Optional, List


class LineageAnalyzer:
    def __init__(self, lineage_path: str = "lineage.json"):
        self.lineage_path = Path(lineage_path)
        self._data: Optional[dict] = None

    def load(self) -> dict:
        if self.lineage_path.exists():
            with open(self.lineage_path) as f:
                self._data = json.load(f)
        else:
            self._data = {"nodes": [], "edges": []}
        return self._data

    @property
    def data(self) -> dict:
        if self._data is None:
            self.load()
        return self._data

    def get_nodes(self) -> List[dict]:
        return self.data.get("nodes", [])

    def get_edges(self) -> List[dict]:
        return self.data.get("edges", [])

    def get_node(self, technical_name: str) -> Optional[dict]:
        for node in self.get_nodes():
            if node.get("id") == technical_name or node.get("technicalName") == technical_name:
                return node
        return None

    def get_extract_age_seconds(self) -> Optional[float]:
        import time
        if not self.lineage_path.exists():
            return None
        return time.time() - self.lineage_path.stat().st_mtime
