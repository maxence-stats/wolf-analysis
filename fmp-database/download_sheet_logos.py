"""
Télécharge en LOCAL les logos actuellement pointés par la colonne lienImage du Google
Sheet (sheet_logos.json, extrait une fois depuis companies/fmpSymbols côté site) —
demande explicite : "je veux que toutes les données... logos... n'aient plus besoin de
se connecter au Google Sheet". Ces logos sont ceux que l'utilisateur a lui-même choisis
(Wikipedia, sites officiels...) donc les "bons", contrairement au repli FMP générique
(parfois un ancien design, voir data/logos/AI.PA.png avant ce script).

Écrit dans data/logos/{SYMBOLE}.{ext} (même dossier que les logos FMP, extension
d'origine préservée — SVG/PNG/JPG/WEBP, jamais reconverti) + un manifeste
data/logos-manifest.json ({SYMBOLE: "nom_fichier.ext"}) que companyLogoUrl() consulte
en PREMIER côté app.js, avant même la colonne lienImage du Sheet — une fois ce script
lancé, le Sheet n'est plus nécessaire pour les logos de ces entreprises.

Usage :
    python download_sheet_logos.py
"""
import json
import mimetypes
import pathlib
import time
import urllib.request
import urllib.error

THIS_DIR = pathlib.Path(__file__).resolve().parent
SITE_LOGOS_DIR = THIS_DIR.parent / "data" / "logos"
MANIFEST_PATH = THIS_DIR.parent / "data" / "logos-manifest.json"
SOURCE_PATH = THIS_DIR / "sheet_logos.json"


def guess_ext(url, content_type):
    path_ext = pathlib.Path(url.split("?")[0]).suffix.lower()
    if path_ext in (".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"):
        return path_ext
    if content_type:
        guessed = mimetypes.guess_extension(content_type.split(";")[0].strip())
        if guessed == ".jpe":
            guessed = ".jpg"
        if guessed:
            return guessed
    return ".png"


def download(symbol, url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36"
    })
    with urllib.request.urlopen(req, timeout=20) as res:
        data = res.read()
        content_type = res.headers.get("Content-Type", "")
    ext = guess_ext(url, content_type)
    dest = SITE_LOGOS_DIR / f"{symbol}{ext}"
    dest.write_bytes(data)
    return dest, len(data)


def main():
    with open(SOURCE_PATH, encoding="utf-8") as f:
        sheet_logos = json.load(f)

    SITE_LOGOS_DIR.mkdir(parents=True, exist_ok=True)
    manifest = {}
    if MANIFEST_PATH.exists():
        manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))

    import sys
    only = set(sys.argv[1:]) if len(sys.argv) > 1 else None

    ok, failed = 0, []
    for symbol, url in sheet_logos.items():
        if only and symbol not in only:
            continue
        # Pause entre requêtes — Wikimedia (et d'autres) renvoient 429 "robot policy" si on
        # enchaîne les téléchargements trop vite sans délai (vu en pratique : 23/72 échecs au
        # 1er passage, sur des hôtes différents, uniquement des 429).
        time.sleep(8)
        try:
            dest, n = download(symbol, url)
            manifest[symbol] = dest.name
            print(f"  [   OK   ] {symbol:12} -> {dest.name} ({n} octets)")
            ok += 1
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError) as e:
            print(f"  [ ÉCHEC  ] {symbol:12} — {e}")
            failed.append((symbol, str(e)))

    MANIFEST_PATH.write_text(json.dumps(manifest, ensure_ascii=False, indent=0, sort_keys=True), encoding="utf-8")
    attempted = len(only) if only else len(sheet_logos)
    print(f"\n{ok}/{attempted} logos téléchargés. Manifeste : {MANIFEST_PATH}")
    if failed:
        print("Échecs :", failed)


if __name__ == "__main__":
    main()
