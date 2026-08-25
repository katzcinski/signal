"""Dialekt-bewusster Migrations-Runner — gemeinsam für SQLite und HANA.

Genau **eine** Migrations-Quelle (`store/migrations/*.sql`, in SQLite-Syntax),
zur Laufzeit in den Zieldialekt übersetzt (`Dialect.translate_ddl`). Kein
zweites, driftendes HANA-Migrations-Set — der Punkt aus `OPEN_TASKS.md` C1
(„SQLite-Spezifika übersetzen") wird durch Übersetzung statt Duplikation gelöst.

Der Runner ist backend-agnostisch: er bekommt ein `execute(sql)`-Callable,
die Menge bereits angewandter Versionen und ein `record(version)`-Callable.
"""
from __future__ import annotations

from pathlib import Path
from typing import Callable, Iterable

from .dialect import Dialect


def strip_sql_comments(sql: str) -> str:
    """Entfernt reine Kommentarzeilen VOR dem Split auf ';' — ein Semikolon in
    einem Kommentar würde sonst eine Anweisung zerschneiden (identisch zur
    bisherigen SqliteStore-Logik)."""
    return "\n".join(ln for ln in sql.splitlines() if not ln.strip().startswith("--"))


def iter_statements(sql: str) -> Iterable[str]:
    for stmt in sql.split(";"):
        s = stmt.strip()
        if s:
            yield s


def run_migrations(
    *,
    execute: Callable[[str], None],
    already_applied: set[str],
    record: Callable[[str], None],
    dialect: Dialect,
    migrations_dir: Path | None = None,
) -> list[str]:
    """Wendet ausstehende Migrationen in Versions-Reihenfolge an.

    Rückgabe: Liste der in diesem Lauf angewandten Versionen (für Tests/Logs).
    Idempotenz: bereits angewandte Versionen werden übersprungen; „existiert
    bereits"-Fehler einzelner Anweisungen werden über
    `dialect.is_already_exists_error` toleriert (deckt ADD-COLUMN-Reruns).
    """
    directory = migrations_dir or (Path(__file__).parent / "migrations")
    applied_now: list[str] = []
    for path in sorted(directory.glob("*.sql")):
        version = path.stem
        if version in already_applied:
            continue
        body = strip_sql_comments(path.read_text(encoding="utf-8"))
        translated = dialect.translate_ddl(body)
        for statement in iter_statements(translated):
            try:
                execute(statement)
            except Exception as exc:  # noqa: BLE001 — dialekt entscheidet Idempotenz
                if dialect.is_already_exists_error(exc):
                    continue
                raise
        record(version)
        applied_now.append(version)
    return applied_now
