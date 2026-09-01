#!/usr/bin/env python3
"""Einzige Quelle der Wahrheit für die Signal-Demo-Landschaft.

Hier steht die komplette fiktive Datasphere-Landschaft *einmal*: Objekte (mit
CSN-Query-AST), Contracts, Data-Product-Manifeste und das Laufverhalten je
Dataset. Alle Generatoren lesen ausschließlich von hier:

* ``scripts/build_demo_snapshot.py`` → ``data/inventory.json``,
  ``data/lineage.json``, ``contracts/``, ``products/``, ``checks/``
* ``scripts/seed.py``               → Result-Store (Läufe, Compliance,
  Incidents, Quarantäne, Profile, Baselines, Schema-Drift, Notifications,
  Schedules, Capabilities)

Damit gilt der Identitäts-Join des Cockpits per Konstruktion:
``inventory.id == contract.product == contract.dataset == run.dataset``.

**Namenskonvention** — QUNIS-Standard, exakt wie ``dq_core.lineage._semantics``
sie ableitet (``QUNIS_DEFAULT``). Layer-Präfix + Kontext + Typ-/Semantik-Suffix:

    r_<quelle>_<quellobjekt>_rt|_lt   Raw            (Ingestion 1:1)
    ic_<kontext>_v                    Integrated Core (technisch integriert)
    bc_<kontext>_fact_v|_dim_v|…      Business Core   (Geschäftslogik)
    s_<kontext>_am                    Serving         (Frontend/AM)

Quellsystem-Kürzel: ``s4h`` (S/4HANA), ``fil`` (Flatfile). Layer, Rolle und
Confidence werden aus dem Namen *abgeleitet*, nicht gepflegt — die Landschaft
ist damit auch ein Testfall für die Namensableitung selbst.

Alle Daten sind frei erfunden (Order-to-Cash-Beispiel). Es dürfen keine echten
Kundenobjekte, -namen oder -kennzahlen in diese Datei wandern.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# ---------------------------------------------------------------------------
# Spaces / Owner
# ---------------------------------------------------------------------------

TENANT_SPACE = "SIGNAL_DEMO"

SPACE_INBOUND = "INBOUND"   # Raw-Zone, 1:1-Replikate der Quellsysteme
SPACE_CORE = "CORE"         # Integrated Core, harmonisierte Semantik
SPACE_SALES = "SALES"       # Business Core + Serving, Domäne Vertrieb
SPACE_FINANCE = "FINANCE"   # Business Core + Serving, Domäne Finance

TEAM_PLATFORM = "team-platform"
TEAM_SALES = "team-sales"
TEAM_MDM = "team-mdm"
TEAM_FINANCE = "team-finance"
TEAM_CONTROLLING = "team-controlling"
TEAM_LOGISTICS = "team-logistics"

# Layer → DQ-Familie des Objekts (Linse im Cockpit, nicht der Check-Typ).
LAYER_FAMILY = {
    "raw": "observability",
    "integrated_core": "quality",
    "business_core": "contract",
    "serving": "contract",
}

# cds-Typ → Contract-Typ (guarantees.schema.types)
CDS_TO_CONTRACT_TYPE = {
    "cds.String": "string",
    "cds.LargeString": "string",
    "cds.Integer": "integer",
    "cds.Integer64": "integer",
    "cds.Decimal": "decimal",
    "cds.Double": "decimal",
    "cds.Boolean": "boolean",
    "cds.Date": "date",
    "cds.Time": "time",
    "cds.Timestamp": "timestamp",
    "cds.Binary": "binary",
}


# ---------------------------------------------------------------------------
# CSN-Bausteine (identisch zur Form, die ein echter Extract liefert)
# ---------------------------------------------------------------------------

def col(alias: str, column: str, out: str) -> dict[str, Any]:
    """Direkter Passthrough: ``alias.column AS out``."""
    return {"ref": [alias, column], "as": out}


def func(name: str, refs: list[tuple[str, str]], out: str) -> dict[str, Any]:
    """Berechnete Spalte über eine Funktion, z. B. ``SUM(f.NET_AMOUNT)``."""
    return {"func": name, "args": [{"ref": [a, c]} for a, c in refs], "as": out}


def arith(a: tuple[str, str], op: str, b: tuple[str, str], out: str) -> dict[str, Any]:
    """Berechnete Spalte über Arithmetik, z. B. ``a.REVENUE - b.BUDGET``."""
    return {"xpr": [{"ref": list(a)}, op, {"ref": list(b)}], "as": out}


def source(obj: str, alias: str) -> dict[str, Any]:
    return {"ref": [obj], "as": alias}


def join(sources: list[tuple[str, str]], on: list[Any], kind: str = "inner") -> dict[str, Any]:
    return {"join": kind, "args": [source(o, a) for o, a in sources], "on": on}


def on_eq(left: tuple[str, str], right: tuple[str, str]) -> list[Any]:
    return [{"ref": list(left)}, "=", {"ref": list(right)}]


def select(from_node: dict[str, Any], columns: list[dict[str, Any]]) -> dict[str, Any]:
    return {"SELECT": {"from": from_node, "columns": columns}}


# ---------------------------------------------------------------------------
# Objekt-Spezifikation
# ---------------------------------------------------------------------------

# Spalte: (name, cds-Typ, key?, Business-Label)
Column = tuple[str, str, bool, str]


@dataclass(frozen=True)
class ObjectSpec:
    id: str
    object_type: str                 # views | local-tables | remote-tables | analytic-models
    kind: str                        # Datasphere-Objektklasse (Anzeige)
    space: str
    business_name: str
    description: str
    columns: tuple[Column, ...]
    semantic_usage: str = ""
    owners: tuple[str, ...] = (TEAM_PLATFORM,)
    owned_by: str = "platform"       # platform | product
    lifecycle: str = "active"
    status: str = "Deployed"
    query: dict[str, Any] | None = None
    # Externe Quelle für Raw-Objekte ohne Query (z. B. "S4:VBAK"); erzeugt im
    # Lineage-Graphen einen external_system-Knoten.
    external_source: str = ""
    external_connection: str = "replication"

    @property
    def column_names(self) -> list[str]:
        return [c[0] for c in self.columns]

    @property
    def key_columns(self) -> list[str]:
        return [c[0] for c in self.columns if c[2]]


def _c(name: str, cds_type: str, label: str, *, key: bool = False) -> Column:
    return (name, cds_type, key, label)


# --- Raw ───────────────────────────────────────────────────────────────────
# 1:1-Replikate; bewusst mit Quellfeldnamen (S/4-Tabellenfelder).

RAW_OBJECTS: tuple[ObjectSpec, ...] = (
    ObjectSpec(
        id="r_s4h_vbak_rt",
        object_type="remote-tables",
        kind="RemoteTable",
        space=SPACE_INBOUND,
        business_name="Auftragskopf (VBAK)",
        description="Replikat des S/4HANA-Auftragskopfs, unverändert aus der Quelle.",
        semantic_usage="RelationalDataset",
        external_source="S4:VBAK",
        columns=(
            _c("VBELN", "cds.String", "Verkaufsbeleg", key=True),
            _c("ERDAT", "cds.Date", "Angelegt am"),
            _c("AEDAT", "cds.Timestamp", "Geändert am"),
            _c("KUNNR", "cds.String", "Auftraggeber"),
            _c("VKORG", "cds.String", "Verkaufsorganisation"),
            _c("AUART", "cds.String", "Auftragsart"),
            _c("NETWR", "cds.Decimal", "Nettowert"),
            _c("WAERK", "cds.String", "Belegwährung"),
            _c("GBSTK", "cds.String", "Gesamtstatus"),
        ),
    ),
    ObjectSpec(
        id="r_s4h_vbap_rt",
        object_type="remote-tables",
        kind="RemoteTable",
        space=SPACE_INBOUND,
        business_name="Auftragsposition (VBAP)",
        description="Replikat der S/4HANA-Auftragspositionen, unverändert aus der Quelle.",
        semantic_usage="RelationalDataset",
        external_source="S4:VBAP",
        columns=(
            _c("VBELN", "cds.String", "Verkaufsbeleg", key=True),
            _c("POSNR", "cds.String", "Position", key=True),
            _c("MATNR", "cds.String", "Material"),
            _c("KWMENG", "cds.Decimal", "Auftragsmenge"),
            _c("MEINS", "cds.String", "Basismengeneinheit"),
            _c("NETWR", "cds.Decimal", "Nettowert"),
            _c("WAERK", "cds.String", "Belegwährung"),
            _c("WERKS", "cds.String", "Werk"),
            _c("AEDAT", "cds.Timestamp", "Geändert am"),
        ),
    ),
    ObjectSpec(
        id="r_s4h_kna1_rt",
        object_type="remote-tables",
        kind="RemoteTable",
        space=SPACE_INBOUND,
        business_name="Kundenstamm (KNA1)",
        description="Replikat des S/4HANA-Kundenstamms, unverändert aus der Quelle.",
        semantic_usage="RelationalDataset",
        external_source="S4:KNA1",
        columns=(
            _c("KUNNR", "cds.String", "Kundennummer", key=True),
            _c("NAME1", "cds.String", "Name"),
            _c("LAND1", "cds.String", "Land"),
            _c("REGIO", "cds.String", "Region"),
            _c("ORT01", "cds.String", "Ort"),
            _c("PSTLZ", "cds.String", "Postleitzahl"),
            _c("KTOKD", "cds.String", "Kontengruppe"),
            _c("ERDAT", "cds.Date", "Angelegt am"),
        ),
    ),
    ObjectSpec(
        id="r_s4h_mara_rt",
        object_type="remote-tables",
        kind="RemoteTable",
        space=SPACE_INBOUND,
        business_name="Materialstamm (MARA)",
        description="Replikat des S/4HANA-Materialstamms, unverändert aus der Quelle.",
        semantic_usage="RelationalDataset",
        external_source="S4:MARA",
        columns=(
            _c("MATNR", "cds.String", "Materialnummer", key=True),
            _c("MTART", "cds.String", "Materialart"),
            _c("MATKL", "cds.String", "Warengruppe"),
            _c("MEINS", "cds.String", "Basismengeneinheit"),
            _c("BRGEW", "cds.Decimal", "Bruttogewicht"),
            _c("ERSDA", "cds.Date", "Angelegt am"),
        ),
    ),
    ObjectSpec(
        id="r_s4h_tcurr_rt",
        object_type="remote-tables",
        kind="RemoteTable",
        space=SPACE_INBOUND,
        business_name="Umrechnungskurse (TCURR)",
        description="Replikat der S/4HANA-Währungsumrechnungskurse.",
        semantic_usage="RelationalDataset",
        external_source="S4:TCURR",
        columns=(
            _c("KURST", "cds.String", "Kurstyp", key=True),
            _c("FCURR", "cds.String", "Von-Währung", key=True),
            _c("TCURR", "cds.String", "Nach-Währung", key=True),
            _c("GDATU", "cds.Date", "Gültig ab", key=True),
            _c("UKURS", "cds.Decimal", "Kurs"),
        ),
    ),
    ObjectSpec(
        id="r_s4h_likp_rt",
        object_type="remote-tables",
        kind="RemoteTable",
        space=SPACE_INBOUND,
        business_name="Lieferkopf (LIKP)",
        description="Replikat der S/4HANA-Lieferköpfe, unverändert aus der Quelle.",
        semantic_usage="RelationalDataset",
        external_source="S4:LIKP",
        columns=(
            _c("VBELN", "cds.String", "Lieferung", key=True),
            _c("ERDAT", "cds.Date", "Angelegt am"),
            _c("WADAT_IST", "cds.Date", "Warenausgang Ist"),
            _c("KUNNR", "cds.String", "Warenempfänger"),
            _c("VSTEL", "cds.String", "Versandstelle"),
            _c("LFART", "cds.String", "Lieferart"),
            _c("AEDAT", "cds.Timestamp", "Geändert am"),
        ),
    ),
    ObjectSpec(
        id="r_fil_budget_plan_lt",
        object_type="local-tables",
        kind="LocalTable",
        space=SPACE_INBOUND,
        business_name="Budgetplanung (Flatfile-Upload)",
        description="Manueller Flatfile-Upload der Budgetplanung je Periode und Warengruppe.",
        semantic_usage="RelationalDataset",
        owners=(TEAM_CONTROLLING,),
        owned_by="product",
        columns=(
            _c("FISCAL_YEAR", "cds.String", "Geschäftsjahr", key=True),
            _c("FISCAL_PERIOD", "cds.String", "Periode", key=True),
            _c("SALES_ORG", "cds.String", "Verkaufsorganisation", key=True),
            _c("PRODUCT_GROUP", "cds.String", "Warengruppe", key=True),
            _c("BUDGET_AMOUNT", "cds.Decimal", "Budgetbetrag"),
            _c("CURRENCY", "cds.String", "Währung"),
            _c("UPLOADED_AT", "cds.Timestamp", "Hochgeladen am"),
        ),
    ),
)


# --- Integrated Core ───────────────────────────────────────────────────────
# Harmonisierte Semantik, sprechende Spaltennamen, keine Geschäftslogik.

IC_OBJECTS: tuple[ObjectSpec, ...] = (
    ObjectSpec(
        id="ic_sales_order_header_v",
        object_type="views",
        kind="View",
        space=SPACE_CORE,
        business_name="Auftragskopf (harmonisiert)",
        description="Auftragsköpfe mit sprechenden Spaltennamen und harmonisierten Typen.",
        semantic_usage="RelationalDataset",
        owners=(TEAM_SALES,),
        columns=(
            _c("SALES_ORDER_ID", "cds.String", "Auftragsnummer", key=True),
            _c("ORDER_DATE", "cds.Date", "Auftragsdatum"),
            _c("CHANGED_AT", "cds.Timestamp", "Geändert am"),
            _c("CUSTOMER_ID", "cds.String", "Kundennummer"),
            _c("SALES_ORG", "cds.String", "Verkaufsorganisation"),
            _c("ORDER_TYPE", "cds.String", "Auftragsart"),
            _c("ORDER_NET_AMOUNT", "cds.Decimal", "Nettowert Auftrag"),
            _c("CURRENCY", "cds.String", "Währung"),
            _c("ORDER_STATUS", "cds.String", "Auftragsstatus"),
        ),
        query=select(
            source("r_s4h_vbak_rt", "h"),
            [
                col("h", "VBELN", "SALES_ORDER_ID"),
                col("h", "ERDAT", "ORDER_DATE"),
                col("h", "AEDAT", "CHANGED_AT"),
                col("h", "KUNNR", "CUSTOMER_ID"),
                col("h", "VKORG", "SALES_ORG"),
                col("h", "AUART", "ORDER_TYPE"),
                col("h", "NETWR", "ORDER_NET_AMOUNT"),
                col("h", "WAERK", "CURRENCY"),
                col("h", "GBSTK", "ORDER_STATUS"),
            ],
        ),
    ),
    ObjectSpec(
        id="ic_sales_order_item_v",
        object_type="views",
        kind="View",
        space=SPACE_CORE,
        business_name="Auftragsposition (harmonisiert)",
        description="Auftragspositionen, angereichert um Kopfattribute (Kunde, Datum, Vertriebsorg).",
        semantic_usage="RelationalDataset",
        owners=(TEAM_SALES,),
        columns=(
            _c("SALES_ORDER_ID", "cds.String", "Auftragsnummer", key=True),
            _c("ORDER_ITEM_ID", "cds.String", "Auftragsposition", key=True),
            _c("MATERIAL_ID", "cds.String", "Materialnummer"),
            _c("ORDER_QUANTITY", "cds.Decimal", "Auftragsmenge"),
            _c("UNIT_OF_MEASURE", "cds.String", "Mengeneinheit"),
            _c("NET_AMOUNT", "cds.Decimal", "Nettowert"),
            _c("CURRENCY", "cds.String", "Währung"),
            _c("PLANT_ID", "cds.String", "Werk"),
            _c("CUSTOMER_ID", "cds.String", "Kundennummer"),
            _c("SALES_ORG", "cds.String", "Verkaufsorganisation"),
            _c("ORDER_DATE", "cds.Date", "Auftragsdatum"),
            _c("CHANGED_AT", "cds.Timestamp", "Geändert am"),
        ),
        query=select(
            join(
                [("r_s4h_vbap_rt", "i"), ("r_s4h_vbak_rt", "h")],
                on_eq(("i", "VBELN"), ("h", "VBELN")),
            ),
            [
                col("i", "VBELN", "SALES_ORDER_ID"),
                col("i", "POSNR", "ORDER_ITEM_ID"),
                col("i", "MATNR", "MATERIAL_ID"),
                col("i", "KWMENG", "ORDER_QUANTITY"),
                col("i", "MEINS", "UNIT_OF_MEASURE"),
                col("i", "NETWR", "NET_AMOUNT"),
                col("i", "WAERK", "CURRENCY"),
                col("i", "WERKS", "PLANT_ID"),
                col("h", "KUNNR", "CUSTOMER_ID"),
                col("h", "VKORG", "SALES_ORG"),
                col("h", "ERDAT", "ORDER_DATE"),
                col("i", "AEDAT", "CHANGED_AT"),
            ],
        ),
    ),
    ObjectSpec(
        id="ic_customer_v",
        object_type="views",
        kind="View",
        space=SPACE_CORE,
        business_name="Kunde (harmonisiert)",
        description="Kundenstamm mit sprechenden Spaltennamen; Basis aller Kundendimensionen.",
        semantic_usage="RelationalDataset",
        owners=(TEAM_MDM,),
        columns=(
            _c("CUSTOMER_ID", "cds.String", "Kundennummer", key=True),
            _c("CUSTOMER_NAME", "cds.String", "Kundenname"),
            _c("COUNTRY_CODE", "cds.String", "Land"),
            _c("REGION_CODE", "cds.String", "Region"),
            _c("CITY", "cds.String", "Ort"),
            _c("POSTAL_CODE", "cds.String", "Postleitzahl"),
            _c("CUSTOMER_GROUP", "cds.String", "Kundengruppe"),
            _c("CREATED_AT", "cds.Date", "Angelegt am"),
        ),
        query=select(
            source("r_s4h_kna1_rt", "c"),
            [
                col("c", "KUNNR", "CUSTOMER_ID"),
                col("c", "NAME1", "CUSTOMER_NAME"),
                col("c", "LAND1", "COUNTRY_CODE"),
                col("c", "REGIO", "REGION_CODE"),
                col("c", "ORT01", "CITY"),
                col("c", "PSTLZ", "POSTAL_CODE"),
                col("c", "KTOKD", "CUSTOMER_GROUP"),
                col("c", "ERDAT", "CREATED_AT"),
            ],
        ),
    ),
    ObjectSpec(
        id="ic_material_v",
        object_type="views",
        kind="View",
        space=SPACE_CORE,
        business_name="Material (harmonisiert)",
        description="Materialstamm mit sprechenden Spaltennamen; Basis der Produktdimension.",
        semantic_usage="RelationalDataset",
        owners=(TEAM_MDM,),
        columns=(
            _c("MATERIAL_ID", "cds.String", "Materialnummer", key=True),
            _c("MATERIAL_TYPE", "cds.String", "Materialart"),
            _c("MATERIAL_GROUP", "cds.String", "Warengruppe"),
            _c("BASE_UNIT", "cds.String", "Basismengeneinheit"),
            _c("GROSS_WEIGHT", "cds.Decimal", "Bruttogewicht"),
            _c("CREATED_AT", "cds.Date", "Angelegt am"),
        ),
        query=select(
            source("r_s4h_mara_rt", "m"),
            [
                col("m", "MATNR", "MATERIAL_ID"),
                col("m", "MTART", "MATERIAL_TYPE"),
                col("m", "MATKL", "MATERIAL_GROUP"),
                col("m", "MEINS", "BASE_UNIT"),
                col("m", "BRGEW", "GROSS_WEIGHT"),
                col("m", "ERSDA", "CREATED_AT"),
            ],
        ),
    ),
    ObjectSpec(
        id="ic_exchange_rate_v",
        object_type="views",
        kind="View",
        space=SPACE_CORE,
        business_name="Umrechnungskurs (harmonisiert)",
        description="Währungsumrechnungskurse für die Konzernwährungsumrechnung.",
        semantic_usage="RelationalDataset",
        owners=(TEAM_FINANCE,),
        columns=(
            _c("RATE_TYPE", "cds.String", "Kurstyp", key=True),
            _c("FROM_CURRENCY", "cds.String", "Von-Währung", key=True),
            _c("TO_CURRENCY", "cds.String", "Nach-Währung", key=True),
            _c("VALID_FROM", "cds.Date", "Gültig ab", key=True),
            _c("EXCHANGE_RATE", "cds.Decimal", "Kurs"),
        ),
        query=select(
            source("r_s4h_tcurr_rt", "r"),
            [
                col("r", "KURST", "RATE_TYPE"),
                col("r", "FCURR", "FROM_CURRENCY"),
                col("r", "TCURR", "TO_CURRENCY"),
                col("r", "GDATU", "VALID_FROM"),
                col("r", "UKURS", "EXCHANGE_RATE"),
            ],
        ),
    ),
    ObjectSpec(
        id="ic_delivery_v",
        object_type="views",
        kind="View",
        space=SPACE_CORE,
        business_name="Lieferung (harmonisiert)",
        description="Lieferköpfe mit harmonisierten Datumsfeldern; Basis der Liefertreue.",
        semantic_usage="RelationalDataset",
        owners=(TEAM_LOGISTICS,),
        lifecycle="draft",
        columns=(
            _c("DELIVERY_ID", "cds.String", "Liefernummer", key=True),
            _c("DELIVERY_DATE", "cds.Date", "Lieferdatum"),
            _c("ACTUAL_GI_DATE", "cds.Date", "Warenausgang Ist"),
            _c("CUSTOMER_ID", "cds.String", "Kundennummer"),
            _c("SHIPPING_POINT", "cds.String", "Versandstelle"),
            _c("DELIVERY_TYPE", "cds.String", "Lieferart"),
            _c("CHANGED_AT", "cds.Timestamp", "Geändert am"),
        ),
        query=select(
            source("r_s4h_likp_rt", "d"),
            [
                col("d", "VBELN", "DELIVERY_ID"),
                col("d", "ERDAT", "DELIVERY_DATE"),
                col("d", "WADAT_IST", "ACTUAL_GI_DATE"),
                col("d", "KUNNR", "CUSTOMER_ID"),
                col("d", "VSTEL", "SHIPPING_POINT"),
                col("d", "LFART", "DELIVERY_TYPE"),
                col("d", "AEDAT", "CHANGED_AT"),
            ],
        ),
    ),
    ObjectSpec(
        id="ic_budget_plan_v",
        object_type="views",
        kind="View",
        space=SPACE_CORE,
        business_name="Budgetplanung (harmonisiert)",
        description="Budgetplanung aus dem Flatfile-Upload, typisiert und geprüft.",
        semantic_usage="RelationalDataset",
        owners=(TEAM_CONTROLLING,),
        columns=(
            _c("FISCAL_YEAR", "cds.String", "Geschäftsjahr", key=True),
            _c("FISCAL_PERIOD", "cds.String", "Periode", key=True),
            _c("SALES_ORG", "cds.String", "Verkaufsorganisation", key=True),
            _c("PRODUCT_GROUP", "cds.String", "Warengruppe", key=True),
            _c("BUDGET_AMOUNT", "cds.Decimal", "Budgetbetrag"),
            _c("CURRENCY", "cds.String", "Währung"),
            _c("UPLOADED_AT", "cds.Timestamp", "Hochgeladen am"),
        ),
        query=select(
            source("r_fil_budget_plan_lt", "b"),
            [
                col("b", "FISCAL_YEAR", "FISCAL_YEAR"),
                col("b", "FISCAL_PERIOD", "FISCAL_PERIOD"),
                col("b", "SALES_ORG", "SALES_ORG"),
                col("b", "PRODUCT_GROUP", "PRODUCT_GROUP"),
                col("b", "BUDGET_AMOUNT", "BUDGET_AMOUNT"),
                col("b", "CURRENCY", "CURRENCY"),
                col("b", "UPLOADED_AT", "UPLOADED_AT"),
            ],
        ),
    ),
)


# --- Business Core ────────────────────────────────────────────────────────
# Geschäftslogik auf dem Datenprodukt; Facts/Dims/Texte/Hierarchien.

BC_OBJECTS: tuple[ObjectSpec, ...] = (
    ObjectSpec(
        id="bc_customer_dim_v",
        object_type="views",
        kind="View",
        space=SPACE_SALES,
        business_name="Kundendimension",
        description="Veröffentlichte Kundendimension — Output-Port des Produkts customer_master.",
        semantic_usage="Dimension",
        owners=(TEAM_MDM,),
        owned_by="product",
        columns=(
            _c("CUSTOMER_ID", "cds.String", "Kundennummer", key=True),
            _c("CUSTOMER_NAME", "cds.String", "Kundenname"),
            _c("COUNTRY_CODE", "cds.String", "Land"),
            _c("REGION_CODE", "cds.String", "Region"),
            _c("CITY", "cds.String", "Ort"),
            _c("CUSTOMER_GROUP", "cds.String", "Kundengruppe"),
        ),
        query=select(
            source("ic_customer_v", "c"),
            [
                col("c", "CUSTOMER_ID", "CUSTOMER_ID"),
                col("c", "CUSTOMER_NAME", "CUSTOMER_NAME"),
                col("c", "COUNTRY_CODE", "COUNTRY_CODE"),
                col("c", "REGION_CODE", "REGION_CODE"),
                col("c", "CITY", "CITY"),
                col("c", "CUSTOMER_GROUP", "CUSTOMER_GROUP"),
            ],
        ),
    ),
    ObjectSpec(
        id="bc_customer_txt",
        object_type="views",
        kind="View",
        space=SPACE_SALES,
        business_name="Kundentexte",
        description="Textview zur Kundendimension inkl. normalisiertem Suchnamen.",
        semantic_usage="Text",
        owners=(TEAM_MDM,),
        owned_by="product",
        columns=(
            _c("CUSTOMER_ID", "cds.String", "Kundennummer", key=True),
            _c("CUSTOMER_NAME", "cds.String", "Kundenname"),
            _c("CUSTOMER_SEARCH_NAME", "cds.String", "Suchname"),
        ),
        query=select(
            source("ic_customer_v", "c"),
            [
                col("c", "CUSTOMER_ID", "CUSTOMER_ID"),
                col("c", "CUSTOMER_NAME", "CUSTOMER_NAME"),
                func("UPPER", [("c", "CUSTOMER_NAME")], "CUSTOMER_SEARCH_NAME"),
            ],
        ),
    ),
    ObjectSpec(
        id="bc_sales_region_hier_v",
        object_type="views",
        kind="View",
        space=SPACE_SALES,
        business_name="Vertriebsregionshierarchie",
        description="Zweistufige Region-Hierarchie (Land → Region) für die Vertriebsauswertung.",
        semantic_usage="Hierarchy",
        owners=(TEAM_MDM,),
        owned_by="product",
        columns=(
            _c("REGION_CODE", "cds.String", "Region", key=True),
            _c("PARENT_REGION_CODE", "cds.String", "Übergeordnete Region"),
            _c("COUNTRY_CODE", "cds.String", "Land"),
            _c("REGION_NAME", "cds.String", "Regionsbezeichnung"),
        ),
        query=select(
            source("ic_customer_v", "c"),
            [
                col("c", "REGION_CODE", "REGION_CODE"),
                col("c", "COUNTRY_CODE", "PARENT_REGION_CODE"),
                col("c", "COUNTRY_CODE", "COUNTRY_CODE"),
                func("CONCAT", [("c", "COUNTRY_CODE"), ("c", "REGION_CODE")], "REGION_NAME"),
            ],
        ),
    ),
    ObjectSpec(
        id="bc_material_dim_v",
        object_type="views",
        kind="View",
        space=SPACE_SALES,
        business_name="Materialdimension",
        description="Veröffentlichte Materialdimension — Output-Port des Produkts product_master.",
        semantic_usage="Dimension",
        owners=(TEAM_MDM,),
        owned_by="product",
        columns=(
            _c("MATERIAL_ID", "cds.String", "Materialnummer", key=True),
            _c("MATERIAL_TYPE", "cds.String", "Materialart"),
            _c("MATERIAL_GROUP", "cds.String", "Warengruppe"),
            _c("BASE_UNIT", "cds.String", "Basismengeneinheit"),
        ),
        query=select(
            source("ic_material_v", "m"),
            [
                col("m", "MATERIAL_ID", "MATERIAL_ID"),
                col("m", "MATERIAL_TYPE", "MATERIAL_TYPE"),
                col("m", "MATERIAL_GROUP", "MATERIAL_GROUP"),
                col("m", "BASE_UNIT", "BASE_UNIT"),
            ],
        ),
    ),
    ObjectSpec(
        id="bc_sales_order_item_fact_v",
        object_type="views",
        kind="View",
        space=SPACE_SALES,
        business_name="Auftragspositionen (Fact)",
        description="Zentraler Auftrags-Fact, angereichert um Kunden- und Materialattribute.",
        semantic_usage="Fact",
        owners=(TEAM_SALES,),
        owned_by="product",
        columns=(
            _c("SALES_ORDER_ID", "cds.String", "Auftragsnummer", key=True),
            _c("ORDER_ITEM_ID", "cds.String", "Auftragsposition", key=True),
            _c("ORDER_DATE", "cds.Date", "Auftragsdatum"),
            _c("CHANGED_AT", "cds.Timestamp", "Geändert am"),
            _c("CUSTOMER_ID", "cds.String", "Kundennummer"),
            _c("MATERIAL_ID", "cds.String", "Materialnummer"),
            _c("SALES_ORG", "cds.String", "Verkaufsorganisation"),
            _c("REGION_CODE", "cds.String", "Region"),
            _c("CUSTOMER_GROUP", "cds.String", "Kundengruppe"),
            _c("MATERIAL_GROUP", "cds.String", "Warengruppe"),
            _c("ORDER_QUANTITY", "cds.Decimal", "Auftragsmenge"),
            _c("NET_AMOUNT", "cds.Decimal", "Nettowert"),
            _c("CURRENCY", "cds.String", "Währung"),
        ),
        query=select(
            join(
                [
                    ("ic_sales_order_item_v", "i"),
                    ("bc_customer_dim_v", "c"),
                    ("bc_material_dim_v", "m"),
                ],
                on_eq(("i", "CUSTOMER_ID"), ("c", "CUSTOMER_ID")),
            ),
            [
                col("i", "SALES_ORDER_ID", "SALES_ORDER_ID"),
                col("i", "ORDER_ITEM_ID", "ORDER_ITEM_ID"),
                col("i", "ORDER_DATE", "ORDER_DATE"),
                col("i", "CHANGED_AT", "CHANGED_AT"),
                col("i", "CUSTOMER_ID", "CUSTOMER_ID"),
                col("i", "MATERIAL_ID", "MATERIAL_ID"),
                col("i", "SALES_ORG", "SALES_ORG"),
                col("c", "REGION_CODE", "REGION_CODE"),
                col("c", "CUSTOMER_GROUP", "CUSTOMER_GROUP"),
                col("m", "MATERIAL_GROUP", "MATERIAL_GROUP"),
                col("i", "ORDER_QUANTITY", "ORDER_QUANTITY"),
                col("i", "NET_AMOUNT", "NET_AMOUNT"),
                col("i", "CURRENCY", "CURRENCY"),
            ],
        ),
    ),
    ObjectSpec(
        id="bc_open_sales_orders_fact_v",
        object_type="views",
        kind="View",
        space=SPACE_SALES,
        business_name="Offene Aufträge (Fact)",
        description="Offene Auftragspositionen für Vertriebssteuerung und Lieferplanung.",
        semantic_usage="Fact",
        owners=(TEAM_SALES,),
        owned_by="product",
        columns=(
            _c("SALES_ORDER_ID", "cds.String", "Auftragsnummer", key=True),
            _c("ORDER_ITEM_ID", "cds.String", "Auftragsposition", key=True),
            _c("CUSTOMER_ID", "cds.String", "Kundennummer"),
            _c("REGION_CODE", "cds.String", "Region"),
            _c("ORDER_DATE", "cds.Date", "Auftragsdatum"),
            _c("CHANGED_AT", "cds.Timestamp", "Geändert am"),
            _c("ORDER_STATUS", "cds.String", "Auftragsstatus"),
            _c("OPEN_QUANTITY", "cds.Decimal", "Offene Menge"),
            _c("OPEN_AMOUNT", "cds.Decimal", "Offener Betrag"),
            _c("CURRENCY", "cds.String", "Währung"),
        ),
        query=select(
            join(
                [
                    ("bc_sales_order_item_fact_v", "f"),
                    ("ic_sales_order_header_v", "h"),
                ],
                on_eq(("f", "SALES_ORDER_ID"), ("h", "SALES_ORDER_ID")),
            ),
            [
                col("f", "SALES_ORDER_ID", "SALES_ORDER_ID"),
                col("f", "ORDER_ITEM_ID", "ORDER_ITEM_ID"),
                col("f", "CUSTOMER_ID", "CUSTOMER_ID"),
                col("f", "REGION_CODE", "REGION_CODE"),
                col("f", "ORDER_DATE", "ORDER_DATE"),
                col("f", "CHANGED_AT", "CHANGED_AT"),
                col("h", "ORDER_STATUS", "ORDER_STATUS"),
                col("f", "ORDER_QUANTITY", "OPEN_QUANTITY"),
                col("f", "NET_AMOUNT", "OPEN_AMOUNT"),
                col("f", "CURRENCY", "CURRENCY"),
            ],
        ),
    ),
    ObjectSpec(
        id="bc_delivery_performance_fact_v",
        object_type="views",
        kind="View",
        space=SPACE_SALES,
        business_name="Liefertreue (Fact)",
        description="Liefertreue je Lieferung; im Aufbau, noch nicht als Boundary-Contract zertifiziert.",
        semantic_usage="Fact",
        owners=(TEAM_LOGISTICS,),
        owned_by="product",
        lifecycle="draft",
        columns=(
            _c("DELIVERY_ID", "cds.String", "Liefernummer", key=True),
            _c("DELIVERY_DATE", "cds.Date", "Lieferdatum"),
            _c("ACTUAL_GI_DATE", "cds.Date", "Warenausgang Ist"),
            _c("CUSTOMER_ID", "cds.String", "Kundennummer"),
            _c("REGION_CODE", "cds.String", "Region"),
            _c("SHIPPING_POINT", "cds.String", "Versandstelle"),
            _c("DELAY_DAYS", "cds.Decimal", "Verzugstage"),
            _c("CHANGED_AT", "cds.Timestamp", "Geändert am"),
        ),
        query=select(
            join(
                [("ic_delivery_v", "d"), ("bc_customer_dim_v", "c")],
                on_eq(("d", "CUSTOMER_ID"), ("c", "CUSTOMER_ID")),
            ),
            [
                col("d", "DELIVERY_ID", "DELIVERY_ID"),
                col("d", "DELIVERY_DATE", "DELIVERY_DATE"),
                col("d", "ACTUAL_GI_DATE", "ACTUAL_GI_DATE"),
                col("d", "CUSTOMER_ID", "CUSTOMER_ID"),
                col("c", "REGION_CODE", "REGION_CODE"),
                col("d", "SHIPPING_POINT", "SHIPPING_POINT"),
                arith(("d", "ACTUAL_GI_DATE"), "-", ("d", "DELIVERY_DATE"), "DELAY_DAYS"),
                col("d", "CHANGED_AT", "CHANGED_AT"),
            ],
        ),
    ),
    ObjectSpec(
        id="bc_revenue_monthly_fact_v",
        object_type="views",
        kind="View",
        space=SPACE_FINANCE,
        business_name="Monatsumsatz (Fact)",
        description="Umsatz je Periode, Vertriebsorg und Warengruppe inkl. Konzernwährung.",
        semantic_usage="Fact",
        owners=(TEAM_FINANCE,),
        owned_by="product",
        columns=(
            _c("FISCAL_YEAR_MONTH", "cds.String", "Periode", key=True),
            _c("SALES_ORG", "cds.String", "Verkaufsorganisation", key=True),
            _c("REGION_CODE", "cds.String", "Region", key=True),
            _c("PRODUCT_GROUP", "cds.String", "Warengruppe", key=True),
            _c("GROSS_REVENUE", "cds.Decimal", "Bruttoumsatz"),
            _c("REVENUE_EUR", "cds.Decimal", "Umsatz in EUR"),
            _c("ORDER_COUNT", "cds.Integer", "Anzahl Aufträge"),
            _c("CURRENCY", "cds.String", "Währung"),
            _c("CHANGED_AT", "cds.Timestamp", "Geändert am"),
        ),
        query=select(
            join(
                [
                    ("bc_sales_order_item_fact_v", "f"),
                    ("ic_exchange_rate_v", "r"),
                ],
                on_eq(("f", "CURRENCY"), ("r", "FROM_CURRENCY")),
            ),
            [
                func("TO_VARCHAR", [("f", "ORDER_DATE")], "FISCAL_YEAR_MONTH"),
                col("f", "SALES_ORG", "SALES_ORG"),
                col("f", "REGION_CODE", "REGION_CODE"),
                col("f", "MATERIAL_GROUP", "PRODUCT_GROUP"),
                func("SUM", [("f", "NET_AMOUNT")], "GROSS_REVENUE"),
                arith(("f", "NET_AMOUNT"), "*", ("r", "EXCHANGE_RATE"), "REVENUE_EUR"),
                func("COUNT", [("f", "SALES_ORDER_ID")], "ORDER_COUNT"),
                col("r", "TO_CURRENCY", "CURRENCY"),
                func("MAX", [("f", "CHANGED_AT")], "CHANGED_AT"),
            ],
        ),
    ),
    ObjectSpec(
        id="bc_budget_actual_fact_v",
        object_type="views",
        kind="View",
        space=SPACE_FINANCE,
        business_name="Budget vs. Ist (Fact)",
        description="Gegenüberstellung von Ist-Umsatz und Budget je Periode und Warengruppe.",
        semantic_usage="Fact",
        owners=(TEAM_CONTROLLING,),
        owned_by="product",
        columns=(
            _c("FISCAL_YEAR", "cds.String", "Geschäftsjahr", key=True),
            _c("FISCAL_PERIOD", "cds.String", "Periode", key=True),
            _c("SALES_ORG", "cds.String", "Verkaufsorganisation", key=True),
            _c("PRODUCT_GROUP", "cds.String", "Warengruppe", key=True),
            _c("ACTUAL_AMOUNT", "cds.Decimal", "Ist-Betrag"),
            _c("BUDGET_AMOUNT", "cds.Decimal", "Budgetbetrag"),
            _c("VARIANCE_AMOUNT", "cds.Decimal", "Abweichung"),
            _c("CURRENCY", "cds.String", "Währung"),
            _c("CHANGED_AT", "cds.Timestamp", "Geändert am"),
        ),
        query=select(
            join(
                [
                    ("bc_revenue_monthly_fact_v", "a"),
                    ("ic_budget_plan_v", "b"),
                ],
                on_eq(("a", "SALES_ORG"), ("b", "SALES_ORG")),
            ),
            [
                col("b", "FISCAL_YEAR", "FISCAL_YEAR"),
                col("b", "FISCAL_PERIOD", "FISCAL_PERIOD"),
                col("b", "SALES_ORG", "SALES_ORG"),
                col("b", "PRODUCT_GROUP", "PRODUCT_GROUP"),
                col("a", "REVENUE_EUR", "ACTUAL_AMOUNT"),
                col("b", "BUDGET_AMOUNT", "BUDGET_AMOUNT"),
                arith(("a", "REVENUE_EUR"), "-", ("b", "BUDGET_AMOUNT"), "VARIANCE_AMOUNT"),
                col("b", "CURRENCY", "CURRENCY"),
                col("a", "CHANGED_AT", "CHANGED_AT"),
            ],
        ),
    ),
)


# --- Serving ──────────────────────────────────────────────────────────────
# Analytic Models für SAC; entstehen erst im Serving-Layer.

SERVING_OBJECTS: tuple[ObjectSpec, ...] = (
    ObjectSpec(
        id="s_sales_performance_am",
        object_type="analytic-models",
        kind="AnalyticModel",
        space=SPACE_SALES,
        business_name="Vertriebsperformance",
        description="Analytic Model für die Vertriebsauswertung in SAC.",
        semantic_usage="Analytical Dataset",
        owners=(TEAM_SALES,),
        owned_by="product",
        columns=(
            _c("ORDER_DATE", "cds.Date", "Auftragsdatum"),
            _c("REGION_CODE", "cds.String", "Region"),
            _c("CUSTOMER_NAME", "cds.String", "Kundenname"),
            _c("MATERIAL_GROUP", "cds.String", "Warengruppe"),
            _c("NET_AMOUNT", "cds.Decimal", "Nettoumsatz"),
            _c("ORDER_QUANTITY", "cds.Decimal", "Auftragsmenge"),
        ),
        query=select(
            join(
                [
                    ("bc_sales_order_item_fact_v", "f"),
                    ("bc_customer_dim_v", "c"),
                    ("bc_material_dim_v", "m"),
                ],
                on_eq(("f", "CUSTOMER_ID"), ("c", "CUSTOMER_ID")),
            ),
            [
                col("f", "ORDER_DATE", "ORDER_DATE"),
                col("f", "REGION_CODE", "REGION_CODE"),
                col("c", "CUSTOMER_NAME", "CUSTOMER_NAME"),
                col("m", "MATERIAL_GROUP", "MATERIAL_GROUP"),
                func("SUM", [("f", "NET_AMOUNT")], "NET_AMOUNT"),
                func("SUM", [("f", "ORDER_QUANTITY")], "ORDER_QUANTITY"),
            ],
        ),
    ),
    ObjectSpec(
        id="s_open_orders_am",
        object_type="analytic-models",
        kind="AnalyticModel",
        space=SPACE_SALES,
        business_name="Offene Aufträge",
        description="Analytic Model für das Auftragsbestands-Dashboard.",
        semantic_usage="Analytical Dataset",
        owners=(TEAM_SALES,),
        owned_by="product",
        columns=(
            _c("ORDER_DATE", "cds.Date", "Auftragsdatum"),
            _c("REGION_CODE", "cds.String", "Region"),
            _c("CUSTOMER_NAME", "cds.String", "Kundenname"),
            _c("ORDER_STATUS", "cds.String", "Auftragsstatus"),
            _c("OPEN_AMOUNT", "cds.Decimal", "Offener Betrag"),
            _c("OPEN_QUANTITY", "cds.Decimal", "Offene Menge"),
        ),
        query=select(
            join(
                [
                    ("bc_open_sales_orders_fact_v", "o"),
                    ("bc_customer_dim_v", "c"),
                ],
                on_eq(("o", "CUSTOMER_ID"), ("c", "CUSTOMER_ID")),
            ),
            [
                col("o", "ORDER_DATE", "ORDER_DATE"),
                col("o", "REGION_CODE", "REGION_CODE"),
                col("c", "CUSTOMER_NAME", "CUSTOMER_NAME"),
                col("o", "ORDER_STATUS", "ORDER_STATUS"),
                func("SUM", [("o", "OPEN_AMOUNT")], "OPEN_AMOUNT"),
                func("SUM", [("o", "OPEN_QUANTITY")], "OPEN_QUANTITY"),
            ],
        ),
    ),
    ObjectSpec(
        id="s_revenue_vs_budget_am",
        object_type="analytic-models",
        kind="AnalyticModel",
        space=SPACE_FINANCE,
        business_name="Umsatz vs. Budget",
        description="Analytic Model für das Controlling-Dashboard Budget/Ist.",
        semantic_usage="Analytical Dataset",
        owners=(TEAM_CONTROLLING,),
        owned_by="product",
        columns=(
            _c("FISCAL_YEAR", "cds.String", "Geschäftsjahr"),
            _c("FISCAL_PERIOD", "cds.String", "Periode"),
            _c("SALES_ORG", "cds.String", "Verkaufsorganisation"),
            _c("PRODUCT_GROUP", "cds.String", "Warengruppe"),
            _c("ACTUAL_AMOUNT", "cds.Decimal", "Ist-Betrag"),
            _c("BUDGET_AMOUNT", "cds.Decimal", "Budgetbetrag"),
            _c("VARIANCE_AMOUNT", "cds.Decimal", "Abweichung"),
        ),
        query=select(
            source("bc_budget_actual_fact_v", "b"),
            [
                col("b", "FISCAL_YEAR", "FISCAL_YEAR"),
                col("b", "FISCAL_PERIOD", "FISCAL_PERIOD"),
                col("b", "SALES_ORG", "SALES_ORG"),
                col("b", "PRODUCT_GROUP", "PRODUCT_GROUP"),
                func("SUM", [("b", "ACTUAL_AMOUNT")], "ACTUAL_AMOUNT"),
                func("SUM", [("b", "BUDGET_AMOUNT")], "BUDGET_AMOUNT"),
                func("SUM", [("b", "VARIANCE_AMOUNT")], "VARIANCE_AMOUNT"),
            ],
        ),
    ),
)


OBJECTS: tuple[ObjectSpec, ...] = RAW_OBJECTS + IC_OBJECTS + BC_OBJECTS + SERVING_OBJECTS
OBJECTS_BY_ID: dict[str, ObjectSpec] = {o.id: o for o in OBJECTS}


# ---------------------------------------------------------------------------
# Contracts
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ContractSpec:
    """Kompakte Contract-Absicht; das YAML entsteht daraus generiert.

    ``schema_columns`` ist immer die vollständige Spaltenliste des Objekts —
    so bleibt der ``schema_columns``-Check am Inventar konsistent.
    """

    product: str
    kind: str                      # internal_gate | consumer_contract | provider_contract
    version: str
    lifecycle: str = "active"
    description: str = ""
    schema_mode: str = "closed"
    schema_severity: str = "critical"
    unique_keys: tuple[tuple[str, ...], ...] = ()
    not_null: tuple[tuple[tuple[str, ...], str], ...] = ()   # (Spalten, severity)
    completeness: tuple[tuple[str, float, str, str], ...] = ()  # (Spalte, min_pct, severity, segment_by)
    freshness: tuple[str, str, str] | None = None             # (Spalte, ISO-Dauer, severity)
    volume_min_rows: int | None = None
    volume_severity: str = "warn"
    volume_baseline: bool = False
    referential: tuple[tuple[str, str, str, str], ...] = ()   # (fk, parent, parent_key, severity)
    library_checks: tuple[dict[str, Any], ...] = ()
    enforcement_default: str = "monitor"
    quarantine_style: str = ""
    observability: dict[str, Any] = field(default_factory=dict)
    quality_proposals: tuple[dict[str, Any], ...] = ()


CONTRACTS: tuple[ContractSpec, ...] = (
    # --- Interne Gates auf Raw ---------------------------------------------
    ContractSpec(
        product="r_s4h_vbak_rt",
        kind="internal_gate",
        version="1.0.0",
        description="Technisches Gate auf dem Auftragskopf-Replikat: Schlüssel, Pflichtfelder, Aktualität.",
        unique_keys=(("VBELN",),),
        not_null=((("VBELN", "KUNNR", "ERDAT"), "critical"),),
        freshness=("AEDAT", "PT6H", "fail"),
        volume_min_rows=40000,
        volume_baseline=True,
        library_checks=(
            {"id": "allowed_values", "params": {"<SPALTE>": "WAERK", "<WERTE>": ["EUR", "USD", "CHF", "GBP"]},
             "expect": "= 0", "severity": "fail"},
            {"id": "string_length", "params": {"<SPALTE>": "VBELN", "<MIN>": "10", "<MAX>": "10"},
             "expect": "= 0", "severity": "warn"},
        ),
    ),
    ContractSpec(
        product="r_s4h_vbap_rt",
        kind="internal_gate",
        version="1.0.0",
        description="Technisches Gate auf dem Positions-Replikat: zusammengesetzter Schlüssel und Mengenplausibilität.",
        unique_keys=(("VBELN", "POSNR"),),
        not_null=((("VBELN", "POSNR", "MATNR"), "critical"),),
        freshness=("AEDAT", "PT6H", "fail"),
        volume_min_rows=120000,
        volume_baseline=True,
        library_checks=(
            {"id": "value_range", "params": {"<SPALTE>": "KWMENG", "<MIN>": "0", "<MAX>": "1000000"},
             "expect": "= 0", "severity": "fail"},
        ),
    ),
    ContractSpec(
        product="r_s4h_kna1_rt",
        kind="internal_gate",
        version="1.0.0",
        description="Technisches Gate auf dem Kundenstamm-Replikat: Schlüssel, Name, Land.",
        unique_keys=(("KUNNR",),),
        not_null=((("KUNNR", "NAME1"), "critical"), (("LAND1",), "fail")),
        completeness=(("REGIO", 95.0, "warn", ""),),
        volume_min_rows=8000,
        volume_baseline=True,
        library_checks=(
            {"id": "pattern_match", "params": {"<SPALTE>": "LAND1", "<REGEX>": "^[A-Z]{2}$"},
             "expect": "= 0", "severity": "warn"},
        ),
    ),
    ContractSpec(
        product="r_fil_budget_plan_lt",
        kind="internal_gate",
        version="1.0.0",
        description="Gate auf dem Budget-Flatfile: Vollständigkeit des Uploads je Periode.",
        unique_keys=(("FISCAL_YEAR", "FISCAL_PERIOD", "SALES_ORG", "PRODUCT_GROUP"),),
        not_null=((("FISCAL_YEAR", "FISCAL_PERIOD", "SALES_ORG", "PRODUCT_GROUP", "BUDGET_AMOUNT"), "fail"),),
        freshness=("UPLOADED_AT", "P35D", "warn"),
        volume_min_rows=480,
        library_checks=(
            {"id": "allowed_values", "params": {"<SPALTE>": "CURRENCY", "<WERTE>": ["EUR"]},
             "expect": "= 0", "severity": "fail"},
            {"id": "value_range", "params": {"<SPALTE>": "BUDGET_AMOUNT", "<MIN>": "0", "<MAX>": "50000000"},
             "expect": "= 0", "severity": "warn"},
        ),
    ),
    # --- Interne Gates auf Integrated Core ---------------------------------
    ContractSpec(
        product="ic_sales_order_item_v",
        kind="internal_gate",
        version="1.1.0",
        description="Gate auf der harmonisierten Auftragsposition: Schlüssel, Referenz auf den Kunden, Aktualität.",
        unique_keys=(("SALES_ORDER_ID", "ORDER_ITEM_ID"),),
        not_null=((("SALES_ORDER_ID", "ORDER_ITEM_ID", "CUSTOMER_ID"), "critical"),
                  (("NET_AMOUNT", "CURRENCY"), "fail")),
        completeness=(("MATERIAL_ID", 99.5, "warn", ""),),
        freshness=("CHANGED_AT", "PT8H", "fail"),
        volume_min_rows=120000,
        volume_baseline=True,
        referential=(("CUSTOMER_ID", "ic_customer_v", "CUSTOMER_ID", "fail"),),
        enforcement_default="quarantine",
        quarantine_style="episodic",
        library_checks=(
            {"id": "value_range", "params": {"<SPALTE>": "NET_AMOUNT", "<MIN>": "0", "<MAX>": "5000000"},
             "expect": "= 0", "severity": "fail"},
        ),
    ),
    ContractSpec(
        product="ic_customer_v",
        kind="internal_gate",
        version="1.0.0",
        description="Gate auf dem harmonisierten Kunden: Eindeutigkeit, Kundengruppe, Regionsabdeckung.",
        unique_keys=(("CUSTOMER_ID",),),
        not_null=((("CUSTOMER_ID", "CUSTOMER_NAME"), "critical"),),
        completeness=(("CUSTOMER_GROUP", 98.0, "fail", ""), ("REGION_CODE", 95.0, "warn", "")),
        volume_min_rows=8000,
        volume_baseline=True,
        enforcement_default="quarantine",
        quarantine_style="episodic",
        library_checks=(
            {"id": "pattern_match", "params": {"<SPALTE>": "COUNTRY_CODE", "<REGEX>": "^[A-Z]{2}$"},
             "expect": "= 0", "severity": "warn"},
        ),
    ),
    ContractSpec(
        product="ic_exchange_rate_v",
        kind="internal_gate",
        version="1.0.0",
        description="Gate auf den Umrechnungskursen: Eindeutigkeit je Kurstyp/Währungspaar/Datum.",
        unique_keys=(("RATE_TYPE", "FROM_CURRENCY", "TO_CURRENCY", "VALID_FROM"),),
        not_null=((("RATE_TYPE", "FROM_CURRENCY", "TO_CURRENCY", "VALID_FROM", "EXCHANGE_RATE"), "critical"),),
        volume_min_rows=2400,
        library_checks=(
            {"id": "value_range", "params": {"<SPALTE>": "EXCHANGE_RATE", "<MIN>": "0", "<MAX>": "1000"},
             "expect": "= 0", "severity": "fail"},
        ),
    ),
    ContractSpec(
        product="ic_delivery_v",
        kind="internal_gate",
        version="0.1.0",
        lifecycle="draft",
        description="Entwurf: Gate auf der harmonisierten Lieferung, noch nicht freigegeben.",
        unique_keys=(("DELIVERY_ID",),),
        not_null=((("DELIVERY_ID", "DELIVERY_DATE"), "fail"),),
        freshness=("CHANGED_AT", "PT12H", "warn"),
        volume_min_rows=30000,
    ),
    # --- Boundary-Contracts (Business Core) --------------------------------
    ContractSpec(
        product="bc_sales_order_item_fact_v",
        kind="provider_contract",
        version="2.1.0",
        description="Zugesagte Garantien des Auftrags-Facts für alle nachgelagerten Produkte.",
        unique_keys=(("SALES_ORDER_ID", "ORDER_ITEM_ID"),),
        not_null=((("SALES_ORDER_ID", "ORDER_ITEM_ID", "CUSTOMER_ID", "MATERIAL_ID"), "critical"),
                  (("NET_AMOUNT", "CURRENCY"), "fail")),
        completeness=(("REGION_CODE", 98.0, "warn", "SALES_ORG"), ("MATERIAL_GROUP", 97.0, "warn", "")),
        freshness=("CHANGED_AT", "PT12H", "warn"),
        volume_min_rows=120000,
        volume_baseline=True,
        enforcement_default="gate",
        quarantine_style="both",
        observability={"volume": {"baseline": "seasonal", "season": ["dow"], "sensitivity": "medium"},
                       "freshness": {"baseline": "rolling", "sensitivity": "medium"}},
        library_checks=(
            {"id": "value_range", "params": {"<SPALTE>": "NET_AMOUNT", "<MIN>": "0", "<MAX>": "5000000"},
             "expect": "= 0", "severity": "fail"},
            {"id": "allowed_values", "params": {"<SPALTE>": "CURRENCY", "<WERTE>": ["EUR", "USD", "CHF", "GBP"]},
             "expect": "= 0", "severity": "fail"},
        ),
    ),
    ContractSpec(
        product="bc_open_sales_orders_fact_v",
        kind="consumer_contract",
        version="1.2.0",
        description="Vom Vertriebsdashboard konsumierte Garantien auf den offenen Aufträgen.",
        unique_keys=(("SALES_ORDER_ID", "ORDER_ITEM_ID"),),
        not_null=((("SALES_ORDER_ID", "ORDER_ITEM_ID", "ORDER_STATUS"), "fail"),),
        completeness=(("REGION_CODE", 98.0, "warn", ""),),
        freshness=("CHANGED_AT", "PT10H", "warn"),
        volume_min_rows=18000,
        volume_baseline=True,
        enforcement_default="monitor",
        observability={"freshness": {"baseline": "seasonal", "season": ["dow"], "sensitivity": "low"}},
        library_checks=(
            {"id": "allowed_values", "params": {"<SPALTE>": "ORDER_STATUS", "<WERTE>": ["A", "B", "C"]},
             "expect": "= 0", "severity": "warn"},
        ),
        quality_proposals=(
            {"check_name": "freshness_CHANGED_AT",
             "proposed_expect": "< 36000",
             "rationale": "Wochenendladungen laufen regelmäßig später als der ursprüngliche Entwurfswert.",
             "accepted_by": "Mia Steward"},
        ),
    ),
    ContractSpec(
        product="bc_customer_dim_v",
        kind="provider_contract",
        version="1.3.0",
        description="Zugesagte Garantien der Kundendimension für alle konsumierenden Produkte.",
        unique_keys=(("CUSTOMER_ID",),),
        not_null=((("CUSTOMER_ID", "CUSTOMER_NAME"), "critical"),),
        completeness=(("REGION_CODE", 98.0, "fail", ""), ("CUSTOMER_GROUP", 98.0, "warn", "")),
        volume_min_rows=8000,
        volume_baseline=True,
        enforcement_default="gate",
        quarantine_style="continuous",
        library_checks=(
            {"id": "pattern_match", "params": {"<SPALTE>": "COUNTRY_CODE", "<REGEX>": "^[A-Z]{2}$"},
             "expect": "= 0", "severity": "fail"},
        ),
    ),
    ContractSpec(
        product="bc_material_dim_v",
        kind="provider_contract",
        version="1.1.0",
        description="Zugesagte Garantien der Materialdimension; Schema absichtlich offen für neue Attribute.",
        schema_mode="open",
        schema_severity="warn",
        unique_keys=(("MATERIAL_ID",),),
        not_null=((("MATERIAL_ID", "MATERIAL_TYPE"), "fail"),),
        completeness=(("MATERIAL_GROUP", 99.0, "warn", ""),),
        volume_min_rows=1200,
        enforcement_default="monitor",
        library_checks=(
            {"id": "allowed_values", "params": {"<SPALTE>": "BASE_UNIT", "<WERTE>": ["ST", "KG", "L", "M"]},
             "expect": "= 0", "severity": "warn"},
        ),
    ),
    ContractSpec(
        product="bc_revenue_monthly_fact_v",
        kind="provider_contract",
        version="1.4.0",
        description="Zugesagte Garantien des Monatsumsatzes für Controlling und Planung.",
        unique_keys=(("FISCAL_YEAR_MONTH", "SALES_ORG", "REGION_CODE", "PRODUCT_GROUP"),),
        not_null=((("FISCAL_YEAR_MONTH", "SALES_ORG", "REVENUE_EUR"), "critical"),),
        completeness=(("PRODUCT_GROUP", 99.0, "fail", ""),),
        freshness=("CHANGED_AT", "PT24H", "warn"),
        volume_min_rows=2400,
        volume_baseline=True,
        enforcement_default="gate",
        quarantine_style="episodic",
        observability={"volume": {"baseline": "seasonal", "season": ["eom"], "sensitivity": "high"}},
        library_checks=(
            {"id": "value_range", "params": {"<SPALTE>": "REVENUE_EUR", "<MIN>": "0", "<MAX>": "80000000"},
             "expect": "= 0", "severity": "fail"},
        ),
    ),
    ContractSpec(
        product="bc_budget_actual_fact_v",
        kind="consumer_contract",
        version="1.0.0",
        description="Vom Controlling-Dashboard konsumierte Garantien auf Budget/Ist.",
        unique_keys=(("FISCAL_YEAR", "FISCAL_PERIOD", "SALES_ORG", "PRODUCT_GROUP"),),
        not_null=((("FISCAL_YEAR", "FISCAL_PERIOD", "ACTUAL_AMOUNT", "BUDGET_AMOUNT"), "fail"),),
        freshness=("CHANGED_AT", "P2D", "warn"),
        volume_min_rows=480,
        volume_baseline=True,
        library_checks=(
            {"id": "allowed_values", "params": {"<SPALTE>": "CURRENCY", "<WERTE>": ["EUR"]},
             "expect": "= 0", "severity": "fail"},
        ),
    ),
    # --- Entwurf auf dem noch nicht zertifizierten Liefer-Fact -------------
    ContractSpec(
        product="bc_delivery_performance_fact_v",
        kind="internal_gate",
        version="0.2.0",
        lifecycle="draft",
        description="Entwurf: Gate auf der Liefertreue. Noch kein Boundary-Contract, daher offener Output-Port.",
        unique_keys=(("DELIVERY_ID",),),
        not_null=((("DELIVERY_ID", "DELIVERY_DATE", "CUSTOMER_ID"), "fail"),),
        freshness=("CHANGED_AT", "PT12H", "warn"),
        volume_min_rows=30000,
        library_checks=(
            {"id": "value_range", "params": {"<SPALTE>": "DELAY_DAYS", "<MIN>": "-30", "<MAX>": "90"},
             "expect": "= 0", "severity": "warn"},
        ),
    ),
)

CONTRACTS_BY_PRODUCT: dict[str, ContractSpec] = {c.product: c for c in CONTRACTS}


# ---------------------------------------------------------------------------
# Data Products (ADR-0004)
# ---------------------------------------------------------------------------

PRODUCT_MANIFESTS: tuple[dict[str, Any], ...] = (
    {
        "product": "customer_master",
        "owners": [TEAM_MDM],
        "output_ports": [{"dataset": "bc_customer_dim_v"}],
        "inbound": [],
    },
    {
        "product": "product_master",
        "owners": [TEAM_MDM],
        "output_ports": [{"dataset": "bc_material_dim_v"}],
        "inbound": [],
    },
    {
        "product": "sales_orders",
        "owners": [TEAM_SALES],
        "output_ports": [
            {"dataset": "bc_sales_order_item_fact_v"},
            {"dataset": "bc_open_sales_orders_fact_v"},
        ],
        "inbound": [
            {"product": "customer_master", "version": "1.3.0"},
            {"product": "product_master", "version": "1.1.0"},
        ],
    },
    {
        "product": "revenue_reporting",
        "owners": [TEAM_FINANCE],
        "output_ports": [{"dataset": "bc_revenue_monthly_fact_v"}],
        "inbound": [{"product": "sales_orders", "version": "2.1.0"}],
    },
    {
        "product": "budget_controlling",
        "owners": [TEAM_CONTROLLING],
        "output_ports": [{"dataset": "bc_budget_actual_fact_v"}],
        "inbound": [{"product": "revenue_reporting", "version": "1.4.0"}],
    },
    {
        # Produkt im Aufbau: Port existiert, ist aber nur durch ein internes
        # Gate abgedeckt → erzeugt bewusst ein `dangling_port`-Finding.
        "product": "delivery_performance",
        "owners": [TEAM_LOGISTICS],
        "output_ports": [{"dataset": "bc_delivery_performance_fact_v"}],
        "inbound": [{"product": "customer_master", "version": "1.3.0"}],
    },
)


# ---------------------------------------------------------------------------
# Laufverhalten je Dataset
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class RunProfile:
    """Wie sich ein Dataset über die Lauf-Historie verhält.

    ``rows`` ist das typische Volumen, ``noise`` die relative Streuung.
    ``incidents`` beschreibt gezielte Verschlechterungen: je Check-Name(-Präfix)
    eine Regel ``(ab_lauf, bis_lauf, faktor_oder_wert)``, damit die Story im
    Cockpit reproduzierbar ist (Lauf 34 = letzter/aktueller Lauf).
    """

    rows: int
    noise: float = 0.06
    freshness_seconds: int = 3600
    # Check-Name → (erster Lauf, letzter Lauf, Wert) — Wert überschreibt den
    # generierten Messwert für Läufe in diesem Fenster.
    degradations: tuple[tuple[str, int, int, float], ...] = ()
    # Sporadische Einzelverletzungen: (Check-Name, Wahrscheinlichkeit je Lauf).
    # Hält die Quality-Familie auf internen Gates realistisch unruhig, ohne die
    # Boundary-Contracts flattern zu lassen.
    flaky_checks: tuple[tuple[str, float], ...] = ()
    # Läufe, in denen die Ausführung technisch scheiterte (state=error).
    error_runs: tuple[int, ...] = ()
    # Läufe, in denen adaptive Observability-Checks abgestuft wurden.
    downgraded_runs: tuple[int, ...] = ()
    # Zusätzliche Spalte, die ab Lauf N im Objekt auftaucht (Schema-Drift).
    schema_drift_from: int | None = None
    schema_drift_column: str = ""


LAST_RUN_INDEX = 34
RUN_COUNT = 35

# Nur zertifizierte (lifecycle=active) Contracts haben eine kompilierte
# Check-Suite und damit Lauf-Historie. Die beiden Entwürfe (ic_delivery_v,
# bc_delivery_performance_fact_v) stehen bewusst ohne Messwerte da — genau der
# Zustand "Produkt im Aufbau, noch nichts zertifiziert".
RUN_PROFILES: dict[str, RunProfile] = {
    # Raw
    "r_s4h_vbak_rt": RunProfile(
        rows=52000,
        freshness_seconds=9000,
        flaky_checks=(("allowed_values_WAERK", 0.10), ("string_length_VBELN", 0.18)),
    ),
    "r_s4h_vbap_rt": RunProfile(
        rows=148000,
        freshness_seconds=9600,
        flaky_checks=(("value_range_KWMENG", 0.08),),
    ),
    "r_s4h_kna1_rt": RunProfile(
        rows=8800,
        noise=0.02,
        # Regionsabdeckung bricht ein — Ursprung der Kundengruppen-Story.
        degradations=(("completeness_REGIO", 30, LAST_RUN_INDEX, 7.5),),
        flaky_checks=(("pattern_match_LAND1", 0.14),),
    ),
    "r_fil_budget_plan_lt": RunProfile(
        rows=520,
        noise=0.01,
        freshness_seconds=1_400_000,
        # Upload für zwei Perioden verspätet → Frische reisst.
        degradations=(("freshness_UPLOADED_AT", 22, 24, 3_500_000),),
        flaky_checks=(("value_range_BUDGET_AMOUNT", 0.09),),
    ),
    # Integrated Core
    "ic_sales_order_item_v": RunProfile(
        rows=147500,
        freshness_seconds=12600,
        degradations=(("ref_CUSTOMER_ID_ic_customer_v", 31, 33, 42),),
    ),
    "ic_customer_v": RunProfile(
        rows=8790,
        noise=0.02,
        # Kundengruppe läuft aus dem Contract-Ziel (98 % → ~93 %).
        degradations=(("completeness_CUSTOMER_GROUP", 31, LAST_RUN_INDEX, 6.8),
                      ("completeness_REGION_CODE", 31, LAST_RUN_INDEX, 6.2)),
    ),
    "ic_exchange_rate_v": RunProfile(
        rows=2600,
        noise=0.01,
        error_runs=(19,),
        flaky_checks=(("value_range_EXCHANGE_RATE", 0.06),),
    ),
    # Business Core
    "bc_sales_order_item_fact_v": RunProfile(
        rows=147300,
        freshness_seconds=28800,
        degradations=(
            # Duplikat-Episode vor drei Wochen, inzwischen behoben.
            ("key_SALES_ORDER_ID_ORDER_ITEM_ID_unique", 12, 14, 86),
            # Regionslücken schlagen bis in den Fact durch: zwei Vertriebsorgs
            # reissen die segmentierte Vollständigkeitszusage.
            ("completeness_REGION_CODE_by_SALES_ORG", 31, LAST_RUN_INDEX, 2),
        ),
    ),
    "bc_open_sales_orders_fact_v": RunProfile(
        rows=19800,
        freshness_seconds=30000,
        degradations=(
            # Frische reisst am Wochenende und auch im aktuellen Lauf.
            ("freshness_CHANGED_AT", 33, LAST_RUN_INDEX, 41400),
            # Dieselben Regionslücken, hier nur als Warnung zugesagt.
            ("completeness_REGION_CODE", 31, LAST_RUN_INDEX, 5.4),
        ),
        # Erste Läufe ohne Baseline → Observability-Checks werden abgestuft.
        downgraded_runs=(0, 1),
    ),
    "bc_customer_dim_v": RunProfile(
        rows=8780,
        noise=0.02,
        degradations=(
            # Länderkennzeichen kamen zwei Tage lang klein geschrieben an.
            ("pattern_match_COUNTRY_CODE", 8, 9, 118),
            # Erbt den Regionslücken-Einbruch aus ic_customer_v — dort ist die
            # Zusage strenger (fail ab 2 %), daher bricht hier der Contract.
            ("completeness_REGION_CODE", 31, LAST_RUN_INDEX, 5.8),
        ),
    ),
    "bc_material_dim_v": RunProfile(
        rows=1310,
        noise=0.02,
        # Neues Attribut aus dem Materialstamm → Schema-Drift (Schema offen,
        # daher Warnung statt Bruch).
        schema_drift_from=32,
        schema_drift_column="PRODUCT_HIERARCHY",
        flaky_checks=(("allowed_values_BASE_UNIT", 0.12),),
    ),
    "bc_revenue_monthly_fact_v": RunProfile(
        rows=2580,
        noise=0.03,
        freshness_seconds=54000,
        # Doppelte Perioden nach dem Kursstammlauf → Contract gebrochen.
        degradations=(("key_FISCAL_YEAR_MONTH_SALES_ORG_REGION_CODE_PRODUCT_GROUP_unique",
                       33, LAST_RUN_INDEX, 24),
                      ("completeness_PRODUCT_GROUP", 33, LAST_RUN_INDEX, 2.4)),
    ),
    "bc_budget_actual_fact_v": RunProfile(rows=505, noise=0.01, freshness_seconds=86400),
}


# ---------------------------------------------------------------------------
# Story-Elemente (Incidents / Quarantäne / Proposals / Betrieb)
# ---------------------------------------------------------------------------

# Notification-Kanäle + Regeln der Demo-Plattform.
NOTIFICATION_CHANNELS: tuple[dict[str, Any], ...] = (
    {"name": "Data Platform Ops (Teams)", "type": "webhook",
     "url": "https://example.invalid/hooks/data-platform-ops", "enabled": True},
    {"name": "Sales Data Stewards (Teams)", "type": "webhook",
     "url": "https://example.invalid/hooks/sales-stewards", "enabled": True},
    {"name": "Controlling (E-Mail-Gateway)", "type": "webhook",
     "url": "https://example.invalid/hooks/controlling-mail", "enabled": False},
)

NOTIFICATION_RULES: tuple[dict[str, Any], ...] = (
    {"name": "Kritische Verletzungen an die Plattform", "channel": 0,
     "match_severity": "critical", "enabled": True},
    {"name": "Vertriebsprodukte an die Stewards", "channel": 1,
     "match_space": SPACE_SALES, "match_owned_by": "product", "enabled": True},
    {"name": "Boundary-Contracts im Finance-Space", "channel": 2,
     "match_space": SPACE_FINANCE, "match_kind": "provider_contract", "enabled": False},
)

NOTIFICATION_MUTES: tuple[dict[str, Any], ...] = (
    {"reason": "Wartungsfenster Quellsystem-Replikation", "match_space": SPACE_INBOUND,
     "starts_in_days": -1, "duration_days": 2},
)

# Zeitpläne: interne Läufe je Objekt.
SCHEDULES: tuple[dict[str, Any], ...] = (
    {"object_id": "r_s4h_vbak_rt", "interval_seconds": 3600, "enabled": True},
    {"object_id": "r_s4h_vbap_rt", "interval_seconds": 3600, "enabled": True},
    {"object_id": "ic_sales_order_item_v", "interval_seconds": 7200, "enabled": True},
    {"object_id": "ic_customer_v", "interval_seconds": 21600, "enabled": True},
    {"object_id": "bc_sales_order_item_fact_v", "interval_seconds": 21600, "enabled": True},
    {"object_id": "bc_revenue_monthly_fact_v", "interval_seconds": 86400, "enabled": True},
    {"object_id": "bc_budget_actual_fact_v", "interval_seconds": 86400, "enabled": False},
    {"object_id": "r_fil_budget_plan_lt", "interval_seconds": 604800, "enabled": True},
)

# Capabilities des Ziel-Environments (Connector-Selbstauskunft).
CAPABILITIES: tuple[dict[str, Any], ...] = (
    {"key": "read_only_user", "status": "ok", "detail": "Technischer Nutzer besitzt nur SELECT-Rechte."},
    {"key": "result_cache", "status": "ok", "detail": "Result-Cache aktiv, 15 Minuten TTL."},
    {"key": "quarantine_ddl", "status": "degraded",
     "detail": "CLEAN-Views können angelegt werden, DELETE auf Quelltabellen ist gesperrt."},
    {"key": "diagnostics_rows", "status": "blocked",
     "detail": "PII-Gate: Rohzeilen-Export im Demo-Environment deaktiviert (G8)."},
    {"key": "seasonal_baselines", "status": "ok", "detail": "35 Läufe Historie vorhanden."},
)

DEMO_ENVIRONMENT = "demo"
DEMO_PROFILE_ENV = "seed-demo"


def contracted_datasets() -> list[str]:
    """Datasets mit Contract — genau diese haben Lauf-Historie."""
    return [c.product for c in CONTRACTS]


def boundary_contracts() -> list[ContractSpec]:
    return [c for c in CONTRACTS if c.kind in ("consumer_contract", "provider_contract")]


def object_space(dataset: str) -> str:
    obj = OBJECTS_BY_ID.get(dataset)
    return obj.space if obj else ""


__all__ = [
    "TENANT_SPACE",
    "SPACE_INBOUND", "SPACE_CORE", "SPACE_SALES", "SPACE_FINANCE",
    "LAYER_FAMILY", "CDS_TO_CONTRACT_TYPE",
    "ObjectSpec", "OBJECTS", "OBJECTS_BY_ID",
    "ContractSpec", "CONTRACTS", "CONTRACTS_BY_PRODUCT",
    "PRODUCT_MANIFESTS",
    "RunProfile", "RUN_PROFILES", "RUN_COUNT", "LAST_RUN_INDEX",
    "NOTIFICATION_CHANNELS", "NOTIFICATION_RULES", "NOTIFICATION_MUTES",
    "SCHEDULES", "CAPABILITIES", "DEMO_ENVIRONMENT", "DEMO_PROFILE_ENV",
    "contracted_datasets", "boundary_contracts", "object_space",
]
