#!/usr/bin/env python3
"""
Versieht style.css, script.js und alle Module in js/ mit einem Inhalts-Hash (?v=…).

Browser cachen ES-Module unter ihrer URL. Ohne Versionsangabe bekommen Nutzer nach einem
Update teils alte Module zusammen mit neuen – die Import-Map sorgt dafür, dass jede
geänderte Datei eine neue URL erhält, unveränderte aber im Cache bleiben.

Aufruf: python3 scripts/version-assets.py   (läuft automatisch im pre-commit-Hook)
"""
import hashlib
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parent.parent
INDEX = ROOT / "index.html"


def kurz_hash(pfad: pathlib.Path) -> str:
    return hashlib.sha1(pfad.read_bytes()).hexdigest()[:8]


def main() -> None:
    html = INDEX.read_text(encoding="utf-8")

    module = sorted((ROOT / "js").glob("*.js"))
    imports = {f"./js/{m.name}": f"./js/{m.name}?v={kurz_hash(m)}" for m in module}
    importmap = json.dumps({"imports": imports}, indent=8, ensure_ascii=False)

    block = (
        "<!-- asset-versions:start – wird von scripts/version-assets.py erzeugt -->\n"
        f'    <script type="importmap">\n        {importmap}\n    </script>\n'
        f'    <script type="module" src="script.js?v={kurz_hash(ROOT / "script.js")}"></script>\n'
        "    <!-- asset-versions:end -->"
    )
    html, anzahl = re.subn(
        r"<!-- asset-versions:start.*?<!-- asset-versions:end -->", block, html, flags=re.S
    )
    if anzahl != 1:
        raise SystemExit("Marker asset-versions:start/end in index.html nicht gefunden.")

    html = re.sub(
        r'<link rel="stylesheet" href="style\.css[^"]*" data-asset-version>',
        f'<link rel="stylesheet" href="style.css?v={kurz_hash(ROOT / "style.css")}" data-asset-version>',
        html,
    )

    INDEX.write_text(html, encoding="utf-8")
    print(f"index.html: {len(imports)} Module + script.js + style.css versioniert")


if __name__ == "__main__":
    main()
