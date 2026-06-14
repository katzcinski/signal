"""Env-backed secret resolver with a vault-ready interface.

Secrets (HANA-Passwörter, Tokens) gehören NICHT als Klartext in
``environments.yml`` oder sonstige Configs. Stattdessen verweist die Config
auf eine *Referenz*, die zur Laufzeit aufgelöst wird::

    # environments.yml
    environments:
      prod:
        host: ...
        user: ...
        password_ref: env:HANA_PW_PROD   # <- Referenz statt Klartext

Eine Referenz hat eine der folgenden Formen:

* ``env:VAR_NAME``  — löst ``os.environ["VAR_NAME"]`` auf (empfohlen).
* ``VAR_NAME``      — bare name, identisch zu ``env:VAR_NAME``.
* ``plain:VALUE``   — Klartext-Passthrough NUR für lokale Entwicklung. Der
  Wert wird niemals geloggt. In Kunden-Deployments nicht verwenden; bevorzugt
  ``env:``/Vault.

Disziplin (wie im Toolbox-Vorbild): Secret-Werte verlassen das Modul nur über
``get`` an den unmittelbaren Consumer (z. B. die DB-Verbindung). Nach außen /
an Clients wird ausschließlich ein boolescher Status (``status``) gegeben —
nie der Wert selbst. Es wird zu keinem Zeitpunkt ein Secret-Wert geloggt.

Vault-ready: ``SecretResolver`` ist ein Protocol. Ein künftiger
``VaultSecretResolver`` (HashiCorp Vault, BTP Credential Store, …) implementiert
dasselbe Interface — ``get_secret``/``secret_status`` und die Consumer bleiben
unverändert; nur der Default-Resolver wird ausgetauscht.

Bewusste Scope-Entscheidung: jetzt Env-Vars, Vault später. Der OS-Keyring-
Backend des Toolbox-Vorbilds wird NICHT portiert — er setzt einen Desktop mit
Credential-Manager voraus und ist für einen Server falsch.
"""

from __future__ import annotations

import logging
import os
from typing import Protocol, runtime_checkable

LOGGER = logging.getLogger(__name__)

_ENV_PREFIX = "env:"
_PLAIN_PREFIX = "plain:"


@runtime_checkable
class SecretResolver(Protocol):
    """Schnittstelle für Secret-Resolver (env jetzt, Vault später).

    Implementierungen dürfen Secret-Werte ausschließlich über ``get`` an den
    direkten Consumer geben. ``status`` und ``available`` geben nur Booleans
    zurück — niemals den Wert.
    """

    def get(self, ref: str | None) -> str | None:
        """Löse ``ref`` zum Secret-Wert auf, oder ``None`` wenn nicht gesetzt."""
        ...

    def status(self, ref: str | None) -> bool:
        """``True`` gdw. ``ref`` zu einem nicht-leeren Wert auflösbar ist."""
        ...

    def available(self) -> bool:
        """``True`` gdw. der Backend grundsätzlich nutzbar ist."""
        ...


class EnvSecretResolver:
    """Löst Secret-Referenzen aus ``os.environ`` (bzw. ``plain:``) auf.

    Unterstützte Referenzformen:

    * ``env:VAR_NAME`` und bare ``VAR_NAME`` → ``os.environ.get(VAR_NAME)``
    * ``plain:VALUE``                        → ``VALUE`` (nur lokale Entwicklung)

    Der Env-Backend ist immer verfügbar (``available()`` → ``True``); ein
    fehlender Wert ist kein "Backend nicht verfügbar", sondern ein nicht
    gesetztes Secret (``get`` → ``None``, ``status`` → ``False``).
    """

    def get(self, ref: str | None) -> str | None:
        """Löse ``ref`` auf. Leere Referenz/Wert → ``None``.

        Niemals den Wert loggen. Bei ``plain:`` wird einmalig gewarnt, dass
        Klartext nur für lokale Entwicklung gedacht ist (ohne den Wert).
        """
        if ref is None:
            return None
        ref = ref.strip()
        if not ref:
            return None

        if ref.startswith(_PLAIN_PREFIX):
            value = ref[len(_PLAIN_PREFIX):]
            LOGGER.warning(
                "Secret-Referenz nutzt 'plain:' Klartext-Passthrough — nur für "
                "lokale Entwicklung. In Deployments 'env:' oder Vault verwenden."
            )
            return value or None

        if ref.startswith(_ENV_PREFIX):
            var_name = ref[len(_ENV_PREFIX):].strip()
        else:
            var_name = ref

        if not var_name:
            return None
        value = os.environ.get(var_name)
        if value is None or value == "":
            return None
        return value

    def status(self, ref: str | None) -> bool:
        """``True`` gdw. ``ref`` zu einem nicht-leeren Wert auflöst.

        Gibt nur einen Boolean zurück — nie den Wert selbst.
        """
        return self.get(ref) is not None

    def available(self) -> bool:
        """Env-Backend ist immer nutzbar."""
        return True


# Default-Resolver für die Modul-Helfer. Austauschbar gegen einen künftigen
# VaultSecretResolver, ohne dass Consumer angepasst werden müssen.
_default_resolver: SecretResolver = EnvSecretResolver()


def get_secret(ref: str | None) -> str | None:
    """Löse eine Secret-Referenz über den Default-Resolver auf.

    Gibt den Wert an den unmittelbaren Consumer (z. B. DB-Verbindung). Der
    zurückgegebene Wert darf nicht geloggt oder an Clients gereicht werden.
    """
    return _default_resolver.get(ref)


def secret_status(ref: str | None) -> bool:
    """``True`` gdw. die Referenz zu einem nicht-leeren Secret auflösbar ist.

    Für Status-/Health-Endpunkte: gibt nur einen Boolean zurück, nie den Wert.
    """
    return _default_resolver.status(ref)


def default_resolver() -> SecretResolver:
    """Den aktuellen Default-Resolver liefern (z. B. zum Status-Abfragen)."""
    return _default_resolver
