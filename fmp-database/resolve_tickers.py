"""
Convertit les tickers "EXCHANGE:SYMBOLE" du Google Sheet principal (voir mapTickerToYahoo
côté app.js, même logique de suffixes) vers le format attendu par FMP, puis VÉRIFIE chaque
résolution via /profile (le nom retourné par FMP doit ressembler au nom du Sheet) avant de
rien importer en masse — même discipline que le reste du projet : ne jamais faire confiance
à un mapping de ticker non vérifié (voir CLAUDE.md, pièges #11/#14 : un ticker mal résolu
donnerait des données financières silencieusement fausses, pas une erreur visible).

Usage :
    python resolve_tickers.py                 # lit companies.csv (généré par extract_companies.py
                                                # ou fourni), écrit resolved_tickers.json
    python resolve_tickers.py --input fichier.csv

Le CSV d'entrée a 2 colonnes : nom,ticker_sheet (ex. "Coca-Cola Company,KO" ou
"TotalEnergies,EPA:TTE"). Le JSON de sortie liste, par entreprise : le symbole FMP déduit,
le nom renvoyé par FMP, un statut ok/à vérifier manuellement, pour relecture avant ingest.py.
"""
import csv
import difflib
import json
import pathlib
import sys

import config
import fmp_client

# Suffixe de bourse — mêmes correspondances que mapTickerToYahoo() dans js/app.js (déjà
# vérifiées en usage réel pour le cours de bourse), complété pour les bourses présentes
# dans "DATA BASE 20 ans" mais absentes de ce mapping historique (BIT/STO/ASX/HKG,
# jamais eu besoin d'un cours de bourse Yahoo pour ces entreprises jusqu'ici).
EXCHANGE_SUFFIX = {
    "EPA": ".PA", "PAR": ".PA", "NASDAQ": "", "NYSE": "", "NYSEARCA": "",
    "LON": ".L", "LSE": ".L", "ETR": ".DE", "FRA": ".DE", "XETR": ".DE",
    "AMS": ".AS", "BME": ".MC", "MIL": ".MI", "BIT": ".MI", "SWX": ".SW", "TSE": ".T",
    "STO": ".ST", "ASX": ".AX", "HKG": ".HK",
}

THIS_DIR = pathlib.Path(__file__).resolve().parent
DEFAULT_INPUT = THIS_DIR / "companies.csv"
OUTPUT_PATH = THIS_DIR / "resolved_tickers.json"


def to_fmp_symbol(ticker_sheet):
    if ":" not in ticker_sheet:
        return ticker_sheet.strip()
    exch, sym = ticker_sheet.split(":", 1)
    suffix = EXCHANGE_SUFFIX.get(exch.strip().upper())
    if suffix is None:
        return None  # bourse inconnue, pas de correspondance sûre
    return sym.strip() + suffix


def name_matches(sheet_name, fmp_name):
    """Comparaison tolérante (accents, casse, suffixes société "Inc."/"SA"/"AG"...) —
    pas une égalité stricte, les deux sources nomment rarement une entreprise à
    l'identique ("Coca-Cola Company" vs "The Coca-Cola Company")."""
    def norm(s):
        s = s.lower()
        for junk in (" inc.", " inc", " corp.", " corp", " sa", " ag", " ab", " se",
                     " plc", " nv", " company", " the ", " co.", " ltd", " holdings",
                     " holding", " group", " corporation", " incorporated", "."):
            s = s.replace(junk, " ")
        return " ".join(s.split())
    a, b = norm(sheet_name), norm(fmp_name or "")
    if not b:
        return False
    if a in b or b in a:
        return True
    return difflib.SequenceMatcher(None, a, b).ratio() > 0.6


def resolve(input_path):
    config.require_api_key()
    rows = []
    with open(input_path, encoding="utf-8") as f:
        for line in csv.reader(f):
            if len(line) < 2 or not line[0].strip():
                continue
            rows.append((line[0].strip(), line[1].strip()))

    results = []
    for nom, ticker_sheet in rows:
        fmp_symbol = to_fmp_symbol(ticker_sheet)
        if not fmp_symbol:
            results.append({"nom": nom, "ticker_sheet": ticker_sheet, "fmp_symbol": None,
                             "status": "bourse_inconnue", "fmp_name": None})
            print(f"  [ ? ]  {nom} ({ticker_sheet}) — bourse non mappée, à résoudre à la main")
            continue
        res = fmp_client.fetch("/profile", fmp_symbol, {})
        if res.status != "ok":
            results.append({"nom": nom, "ticker_sheet": ticker_sheet, "fmp_symbol": fmp_symbol,
                             "status": "introuvable", "fmp_name": None})
            print(f"  [ÉCHEC] {nom} ({ticker_sheet} -> {fmp_symbol}) — {res.error_message or 'pas de profil FMP'}")
            continue
        profile = res.data[0] if isinstance(res.data, list) else res.data
        fmp_name = profile.get("companyName")
        ok = name_matches(nom, fmp_name)
        results.append({"nom": nom, "ticker_sheet": ticker_sheet, "fmp_symbol": fmp_symbol,
                         "status": "ok" if ok else "a_verifier", "fmp_name": fmp_name,
                         "isin": profile.get("isin"), "currency": profile.get("currency"),
                         "exchange": profile.get("exchange")})
        tag = "  OK  " if ok else "VÉRIF."
        print(f"  [{tag}] {nom} ({ticker_sheet} -> {fmp_symbol}) — FMP: \"{fmp_name}\"")

    out_path = OUTPUT_PATH
    if "--output" in sys.argv:   # evite d'ecraser resolved_tickers.json d'un lot a l'autre
        out_path = pathlib.Path(sys.argv[sys.argv.index("--output") + 1])
    out_path.write_text(json.dumps(results, indent=2, ensure_ascii=False), encoding="utf-8")
    n_ok = sum(1 for r in results if r["status"] == "ok")
    n_review = len(results) - n_ok
    print(f"\n{n_ok}/{len(results)} résolus avec confiance, {n_review} à vérifier manuellement.")
    print(f"Écrit : {out_path}")


def main():
    input_path = DEFAULT_INPUT
    if "--input" in sys.argv:
        input_path = pathlib.Path(sys.argv[sys.argv.index("--input") + 1])
    if not input_path.exists():
        print(f"Fichier introuvable : {input_path}")
        sys.exit(1)
    resolve(input_path)


if __name__ == "__main__":
    main()
