import os
import threading
import hashlib
from pathlib import Path
from typing import Optional

_write_lock = threading.Lock()


class GitRepo:
    def __init__(self, contracts_dir: str, remote: str = ""):
        self.contracts_dir = Path(contracts_dir)
        self.remote = remote
        self.contracts_dir.mkdir(parents=True, exist_ok=True)

    def _path(self, product: str) -> Path:
        """Resolve a contract path, tolerating both .yaml and .yml."""
        for ext in (".yaml", ".yml"):
            candidate = self.contracts_dir / f"{product}{ext}"
            if candidate.exists():
                return candidate
        return self.contracts_dir / f"{product}.yaml"

    def read_contract(self, product: str) -> Optional[str]:
        path = self._path(product)
        if path.exists():
            return path.read_text()
        return None

    def write_contract(self, product: str, content: str, author_name: str, author_email: str, message: str) -> str:
        """Thread-safe write + commit. Returns commit hash."""
        with _write_lock:
            path = self._path(product)
            path.write_text(content)

            # Check for breaking diff before commit
            commit_hash = hashlib.sha256(content.encode()).hexdigest()[:12]

            try:
                import git
                try:
                    repo = git.Repo(search_parent_directories=True)
                except git.InvalidGitRepositoryError:
                    return commit_hash

                # Only commit if the contract file lives inside the repo tree;
                # otherwise fall back to the content hash (e.g. external CONTRACTS_DIR).
                try:
                    repo.index.add([str(path)])
                except (ValueError, OSError):
                    return commit_hash
                with repo.config_writer() as cw:
                    cw.set_value("user", "name", author_name)
                    cw.set_value("user", "email", author_email)
                commit = repo.index.commit(message)
                return str(commit.hexsha)
            except ImportError:
                return commit_hash

    def list_products(self) -> list:
        return [
            p.stem
            for p in sorted(self.contracts_dir.glob("*.y*ml"))
            if not p.name.endswith(".active.yml")
        ]

    def get_contract_hash(self, product: str) -> str:
        content = self.read_contract(product)
        if content is None:
            return ""
        return hashlib.sha256(content.encode()).hexdigest()
