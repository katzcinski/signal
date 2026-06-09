import json
from pathlib import Path
from typing import List, Optional


class CheckLibrary:
    def __init__(self, library_path: Optional[str] = None):
        if library_path is None:
            library_path = str(Path(__file__).parent / "check_library.json")
        with open(library_path) as f:
            self._data = json.load(f)
        self._by_id = {c["id"]: c for c in self._data["checks"]}

    def get_template(self, check_id: str) -> Optional[dict]:
        return self._by_id.get(check_id)

    def list_checks(self, type_filter: Optional[str] = None) -> List[dict]:
        if type_filter:
            return [c for c in self._data["checks"] if c["type"] == type_filter]
        return list(self._data["checks"])

    def get_version(self) -> str:
        return self._data.get("version", "0.0.0")
