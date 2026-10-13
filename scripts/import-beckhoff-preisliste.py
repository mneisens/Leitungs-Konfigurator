#!/usr/bin/env python3
"""
Importiert data/beckhoff_preisliste_05_2026.json in den Katalog.

Sicherheit für Projekte:
- Schreibt NUR data/leitungen.json und data/bauteile.json.
- Projektdaten (localStorage / Firebase) werden nicht berührt.
- Nicht-Beckhoff-Artikel bleiben erhalten.
- Alte Beckhoff-Artikel, die in der Preisliste fehlen, bleiben erhalten
  (damit bestehende Projektpositionen weiter im Katalog gefunden werden).
- Vorhandene Beckhoff-Artikel werden durch Preisliste ersetzt; Stecker/
  Kategorie/Meterware aus dem alten Katalog werden übernommen, wenn sinnvoll.
"""

from __future__ import annotations

import json
import re
import shutil
from collections import Counter
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
PREIS_PATH = DATA / "beckhoff_preisliste_05_2026.json"
LEITUNGEN_PATH = DATA / "leitungen.json"
BAUTEILE_PATH = DATA / "bauteile.json"

PREFIX_KATEGORIE = {
    "ZK1090": "ethercat",
    "ZK2000": "sensor",
    "ZK2002": "sensor",
    "ZK2020": "power",
    "ZK2030": "power",
    "ZK4042": "sensor",
    "ZK4500": "motor",
    "ZK4800": "motor",
    "ZB7100": "ethercat",
    "ZB7200": "ethercat",
    "ZB7300": "ethercat",
}

LEITUNG_KATEGORIEN = [
    {"id": "ethercat", "name": "EtherCAT Leitung", "icon": "🔗"},
    {"id": "power", "name": "Power Leitung", "icon": "⚡"},
    {"id": "sensor", "name": "Sensorleitung", "icon": "📡"},
    {"id": "oelflex", "name": "Ölflexleitung", "icon": "🔌"},
    {"id": "motor", "name": "Motorleitungen", "icon": "⚙️"},
    {"id": "geber", "name": "Geberleitung", "icon": "🎛️"},
    {"id": "cplink", "name": "CP-Link Leitung", "icon": "🖥️"},
    {"id": "sonstiges", "name": "Sonstiges", "icon": "📦"},
]

EXTRA_BAUTEILTYPEN = [
    {"id": "io-klemme", "name": "I/O-Klemme / Busklemme"},
    {"id": "buskoppler", "name": "Buskoppler"},
    {"id": "software", "name": "Software / TwinCAT"},
    {"id": "zubehoer", "name": "Zubehör / Steckverbinder"},
    {"id": "sonstiges", "name": "Sonstige Komponenten"},
]


def norm_nr(nr: str | None) -> str:
    return re.sub(r"\s+", "", str(nr or "")).lower()


def is_beckhoff(hersteller: str | None) -> bool:
    return "beckhoff" in str(hersteller or "").lower()


def clean_beschreibung(text: str | None, fallback: str | None = None) -> str:
    value = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", str(text or "")).strip()
    if value:
        return value
    alt = re.sub(r"[\u200b\u200c\u200d\ufeff]", "", str(fallback or "")).strip()
    return alt


def parse_laenge_from_nr(nr: str) -> float | None:
    m = re.search(r"-(\d{4})$", nr.upper())
    if not m:
        return None
    code = int(m.group(1))
    # Sondercodes / Platzhalter überspringen
    if code >= 900 or code == 0:
        return None
    return round(code / 10.0, 2)


def parse_stecker(beschreibung: str) -> tuple[str, str]:
    text = (beschreibung or "").replace("‑", "-").replace("–", "–")
    if "–" in text:
        left, right = text.split("–", 1)
    elif " - " in text and ("polig" in text.lower() or "M8" in text or "M12" in text):
        left, right = text.split(" - ", 1)
    else:
        return "", ""

    def clean(part: str) -> str:
        part = re.sub(r"\s+", " ", part).strip(" ,;")
        # zu lange Beschreibungen kürzen
        if len(part) > 80:
            part = part[:77].rstrip() + "…"
        return part

    a, b = clean(left), clean(right)
    if not a or not b:
        return "", ""
    return a, b


def infer_leitung_kategorie(nr: str, beschreibung: str, old: dict | None) -> str:
    if old and old.get("kategorie"):
        return old["kategorie"]
    upper = nr.upper()
    for prefix, kat in PREFIX_KATEGORIE.items():
        if upper.startswith(prefix):
            return kat
    d = (beschreibung or "").lower()
    if "ethercat" in d:
        return "ethercat"
    if "power" in d or "versorgung" in d:
        return "power"
    if "sensor" in d or "encoder" in d:
        return "sensor"
    if "motor" in d or "servo" in d:
        return "motor"
    if "geber" in d or "feedback" in d:
        return "geber"
    if "ip-link" in d or "cp-link" in d or "cplink" in d:
        return "cplink"
    return "sonstiges"


def is_leitung_artikel(eintrag: dict) -> bool:
    nr = str(eintrag.get("artikelnummer") or "").upper()
    if nr.startswith("ZK"):
        return True
    if eintrag.get("laenge_m") is not None:
        return True
    d = (eintrag.get("beschreibung") or "").lower()
    if "leitung" in d or "kabel" in d:
        # Zubehör-Sets ohne Länge bleiben Bauteile
        if "ersatzteil" in d or "stecker" in d and "leitung" not in d:
            return False
        return True
    return False


def infer_bauteil_typ(eintrag: dict, old: dict | None) -> str:
    if old and old.get("typ"):
        return old["typ"]
    nr = str(eintrag.get("artikelnummer") or "").upper()
    d = (eintrag.get("beschreibung") or "").lower()
    kat = eintrag.get("kategorie") or ""

    if kat == "TwinCAT und Software" or nr.startswith("TC") or "twincat" in d:
        return "software"
    if kat == "IPC und Panels":
        if "panel" in d or "control panel" in d or nr.startswith("CP"):
            return "panel"
        if nr.startswith("C6") or re.match(r"^C\d{4}", nr) or "industrie-pc" in d or "ipc" in d:
            return "ipc"
        return "ipc"
    if kat == "I/O und Feldbus":
        if "buskoppler" in d or nr.startswith("BK") or nr.startswith("EK"):
            return "buskoppler"
        return "io-klemme"
    if kat == "Antriebstechnik":
        if nr.startswith("AX") or "servo" in d and "antrieb" in d or "regler" in d or "umrichter" in d:
            return "regler"
        if nr.startswith("AM") or "motor" in d:
            return "motor"
        return "regler"
    if nr.startswith("ZB") or nr.startswith("ZS"):
        return "zubehoer"
    if nr.startswith("EL") or nr.startswith("ES") or nr.startswith("EP"):
        return "io-klemme" if nr.startswith("EP") else "io-klemme"
    return "sonstiges"


def backup(path: Path) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    dest = path.with_suffix(path.suffix + f".bak-{stamp}")
    shutil.copy2(path, dest)
    return dest


def main() -> None:
    preis = json.loads(PREIS_PATH.read_text(encoding="utf-8"))
    old_leit = json.loads(LEITUNGEN_PATH.read_text(encoding="utf-8"))
    old_bau = json.loads(BAUTEILE_PATH.read_text(encoding="utf-8"))

    old_leit_by = {norm_nr(a.get("artikelnummer")): a for a in old_leit.get("artikel", []) if a.get("artikelnummer")}
    old_bau_by = {norm_nr(a.get("artikelnummer")): a for a in old_bau.get("artikel", []) if a.get("artikelnummer")}

    preis_artikel = preis.get("artikel") or []
    preis_by = {norm_nr(a.get("artikelnummer")): a for a in preis_artikel if a.get("artikelnummer")}

    # --- Leitungen ---
    leitungen: dict[str, dict] = {}

    # 1) Nicht-Beckhoff behalten
    for a in old_leit.get("artikel", []):
        if is_beckhoff(a.get("hersteller")):
            continue
        key = norm_nr(a.get("artikelnummer"))
        if key:
            leitungen[key] = {**a}

    # 2) Preisliste → Leitungen
    for eintrag in preis_artikel:
        if not is_leitung_artikel(eintrag):
            continue
        nr = eintrag.get("artikelnummer") or ""
        key = norm_nr(nr)
        if not key:
            continue
        old = old_leit_by.get(key)
        laenge = eintrag.get("laenge_m")
        if laenge is None:
            laenge = old.get("laenge") if old else None
        if laenge is None:
            laenge = parse_laenge_from_nr(nr)
        if laenge is None:
            laenge = 0

        stecker_a = (old or {}).get("steckerA") or ""
        stecker_b = (old or {}).get("steckerB") or ""
        if not stecker_a or not stecker_b:
            pa, pb = parse_stecker(eintrag.get("beschreibung") or "")
            stecker_a = stecker_a or pa
            stecker_b = stecker_b or pb

        artikel = {
            "hersteller": "Beckhoff",
            "artikelnummer": nr,
            "beschreibung": clean_beschreibung(eintrag.get("beschreibung"), (old or {}).get("beschreibung")) or nr,
            "steckerA": stecker_a,
            "steckerB": stecker_b,
            "laenge": float(laenge) if laenge is not None else 0,
            "kategorie": infer_leitung_kategorie(nr, eintrag.get("beschreibung") or "", old),
            "quelle": "Beckhoff Preisliste 05/2026",
        }
        if old and old.get("meterware"):
            artikel["meterware"] = True
        leitungen[key] = artikel

    # 3) Alte Beckhoff-Leitungen behalten, die nicht in der Preisliste sind
    kept_orphan_leitungen = 0
    for key, a in old_leit_by.items():
        if not is_beckhoff(a.get("hersteller")):
            continue
        if key in preis_by:
            continue
        if key not in leitungen:
            leitungen[key] = {**a, "quelle": a.get("quelle") or "Bisheriger Katalog (nicht in Preisliste 05/2026)"}
            kept_orphan_leitungen += 1

    # --- Bauteile ---
    bauteile: dict[str, dict] = {}

    for a in old_bau.get("artikel", []):
        if is_beckhoff(a.get("hersteller")):
            continue
        key = norm_nr(a.get("artikelnummer"))
        if key:
            bauteile[key] = {**a}

    for eintrag in preis_artikel:
        if is_leitung_artikel(eintrag):
            continue
        nr = eintrag.get("artikelnummer") or ""
        key = norm_nr(nr)
        if not key:
            continue
        old = old_bau_by.get(key)
        typ = infer_bauteil_typ(eintrag, old)
        artikel = {
            "hersteller": "Beckhoff",
            "artikelnummer": nr,
            "beschreibung": clean_beschreibung(eintrag.get("beschreibung"), (old or {}).get("beschreibung")) or nr,
            "typ": typ,
            "gruppe": (old or {}).get("gruppe") or "",
            "lieferant": (old or {}).get("lieferant") or "Beckhoff",
            "quelle": "Beckhoff Preisliste 05/2026",
        }
        bauteile[key] = artikel

    kept_orphan_bauteile = 0
    for key, a in old_bau_by.items():
        if not is_beckhoff(a.get("hersteller")):
            continue
        if key in preis_by:
            continue
        if key not in bauteile:
            bauteile[key] = {**a, "quelle": a.get("quelle") or "Bisheriger Katalog (nicht in Preisliste 05/2026)"}
            kept_orphan_bauteile += 1

    # Listen / Typen aufbauen
    hersteller = sorted({a.get("hersteller") for a in leitungen.values() if a.get("hersteller")}, key=lambda s: s.lower())
    steckertypen = sorted(
        {
            s
            for a in leitungen.values()
            for s in (a.get("steckerA"), a.get("steckerB"))
            if s
        },
        key=lambda s: s.lower(),
    )
    laengen = sorted({float(a["laenge"]) for a in leitungen.values() if a.get("laenge") not in (None, 0)})
    # Standardlängen: bisherige plus häufige
    standard = sorted(set(old_leit.get("standardlaengen") or [1, 2, 3, 5, 10, 15, 20, 25, 30]) | {1, 2, 3, 5, 10, 15, 20, 25, 30})

    typen = list(old_bau.get("bauteiltypen") or [])
    existing_typ_ids = {t.get("id") for t in typen}
    for t in EXTRA_BAUTEILTYPEN:
        if t["id"] not in existing_typ_ids:
            typen.append(t)
            existing_typ_ids.add(t["id"])
    # Typen absichern, die im Import vorkommen
    used_typen = {a.get("typ") for a in bauteile.values() if a.get("typ")}
    for typ_id in sorted(used_typen):
        if typ_id not in existing_typ_ids:
            typen.append({"id": typ_id, "name": typ_id})
            existing_typ_ids.add(typ_id)

    new_leitungen = {
        "hersteller": hersteller,
        "kategorien": LEITUNG_KATEGORIEN,
        "artikel": sorted(leitungen.values(), key=lambda a: (a.get("kategorie") or "", a.get("artikelnummer") or "")),
        "steckertypen": steckertypen,
        "standardlaengen": standard,
        "meta": {
            "quelle": "Beckhoff Preisliste 05/2026 + bisheriger Katalog",
            "importiert_am": datetime.now().isoformat(timespec="seconds"),
            "anzahl_artikel": len(leitungen),
        },
    }
    new_bauteile = {
        "bauteiltypen": typen,
        "artikel": sorted(bauteile.values(), key=lambda a: (a.get("typ") or "", a.get("artikelnummer") or "")),
        "meta": {
            "quelle": "Beckhoff Preisliste 05/2026 + bisheriger Katalog",
            "importiert_am": datetime.now().isoformat(timespec="seconds"),
            "anzahl_artikel": len(bauteile),
        },
    }

    bak_l = backup(LEITUNGEN_PATH)
    bak_b = backup(BAUTEILE_PATH)
    LEITUNGEN_PATH.write_text(json.dumps(new_leitungen, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    BAUTEILE_PATH.write_text(json.dumps(new_bauteile, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    kat_count = Counter(a.get("kategorie") for a in new_leitungen["artikel"])
    typ_count = Counter(a.get("typ") for a in new_bauteile["artikel"])
    print("Import fertig.")
    print(f"  Backup Leitungen: {bak_l.name}")
    print(f"  Backup Bauteile:  {bak_b.name}")
    print(f"  Leitungen: {len(new_leitungen['artikel'])} (Kategorien: {dict(kat_count)})")
    print(f"  Bauteile:  {len(new_bauteile['artikel'])} (Typen: {dict(typ_count.most_common(12))}…)")
    print(f"  Orphan-Beckhoff behalten – Leitungen: {kept_orphan_leitungen}, Bauteile: {kept_orphan_bauteile}")
    print("  Projekte / Firebase / localStorage wurden nicht geändert.")


if __name__ == "__main__":
    main()
