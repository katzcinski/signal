"""[ENCODING] Der Git-Writer schreibt und liest Contracts immer als UTF-8.

Contracts tragen deutsche Beschreibungen. Ohne explizites ``encoding`` schreibt
``Path.write_text`` unter Windows in der Plattform-Codepage (cp1252) — der
Contract wäre danach für die eigene API unlesbar, weil jeder Leser (Router,
Compiler, Validator, Tests) mit ``encoding="utf-8"`` öffnet und auf einem
``UnicodeDecodeError`` landet.
"""
from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[2] / "packages"))
sys.path.insert(0, str(Path(__file__).parents[2]))

CONTENT = "product: p_umlaut\ndescription: Vollständigkeit des Uploads je Periode\n"

UTF8_AE = "ä".encode("utf-8")      # b'\xc3\xa4'
CP1252_AE = "ä".encode("cp1252")   # b'\xe4'


def test_write_contract_uses_utf8_on_disk(tmp_path):
    from services.api.git_repo import GitRepo

    repo = GitRepo(tmp_path, "")
    repo.write_contract("p_umlaut", CONTENT, "Mia Steward", "mia@example.invalid", "test")

    raw = (tmp_path / "p_umlaut.yaml").read_bytes()
    assert UTF8_AE in raw, "Umlaut nicht als UTF-8 geschrieben"
    assert CP1252_AE not in raw, "Umlaut in der Plattform-Codepage geschrieben"
    # Zeilenenden darf die Plattform normalisieren, der Inhalt nicht abweichen.
    assert raw.decode("utf-8").replace("\r\n", "\n") == CONTENT


def test_read_contract_round_trips(tmp_path):
    from services.api.git_repo import GitRepo

    repo = GitRepo(tmp_path, "")
    repo.write_contract("p_umlaut", CONTENT, "Mia Steward", "mia@example.invalid", "test")

    assert repo.read_contract("p_umlaut") == CONTENT


def test_shipped_contracts_are_utf8():
    """Regression auf den ausgelieferten Stand — ein cp1252-Rest bricht die API."""
    contracts = Path(__file__).parents[2] / "contracts"
    broken = []
    for path in sorted(contracts.glob("*.y*ml")):
        try:
            path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            broken.append(path.name)
    assert broken == [], f"nicht UTF-8: {broken}"
