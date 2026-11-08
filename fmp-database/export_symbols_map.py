"""
Met a jour data/fmp-symbols.json (nom -> symbole FMP), consomme par app.js
(fmpSymbols[nom], voir ensureDocumentsRealData()/ensureComparaisonMetricsData()) pour
resoudre CHAQUE entreprise ayant des donnees FMP importees, quel que soit son lot
d'origine.

Bug trouve (2026-09-02) : ce fichier n'avait plus ete regenere depuis le lot01 (503
entrees), donc lot02 (500 entreprises) et lot03 (487 entreprises) etaient invisibles
cote app malgre des donnees deja en base -- toute fonctionnalite s'appuyant sur
fmpSymbols[nom] (Comparaison, Documents financiers...) les ignorait silencieusement pour
ces ~987 entreprises, alors que leurs fichiers data/documents-{symbole}.json existent
deja. Doit etre relance apres CHAQUE nouvel import (ingest_batch.py + export_to_app.py
--batch), pas seulement une fois.

Additif, jamais destructif : part du fichier existant (garde toute entree qui n'aurait
pas de trace dans un resolved_tickers*.json, ex. ajout manuel passe), ajoute/actualise
seulement a partir des lots resolus ET reellement ingeres en base (all_symbols_with_data)
-- ne liste jamais un symbole resolu mais jamais importe.

Usage :
    python export_symbols_map.py
"""
import json
import pathlib

import db
from export_to_app import all_symbols_with_data

THIS_DIR = pathlib.Path(__file__).resolve().parent
OUTPUT_PATH = THIS_DIR.parent / "data" / "fmp-symbols.json"


def main():
    conn = db.get_connection()
    ingested = set(all_symbols_with_data(conn))
    conn.close()

    mapping = {}
    if OUTPUT_PATH.exists():
        try:
            mapping = json.loads(OUTPUT_PATH.read_text(encoding="utf-8"))
        except Exception:
            mapping = {}
    before = len(mapping)

    added = 0
    for path in sorted(THIS_DIR.glob("resolved_tickers*.json")):
        try:
            entries = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            continue
        for r in entries:
            if not r.get("status", "").startswith("ok"):
                continue
            symbol = r.get("fmp_symbol")
            nom = r.get("nom")
            if not symbol or not nom or symbol not in ingested:
                continue
            if mapping.get(nom) != symbol:
                mapping[nom] = symbol
                added += 1

    OUTPUT_PATH.write_text(json.dumps(mapping, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Avant : {before} entreprises. Ajoutees/actualisees : {added}. Total : {len(mapping)} -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
