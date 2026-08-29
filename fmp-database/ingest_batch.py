"""
Import en série de tout l'univers suivi (voir resolve_tickers.py — lit
resolved_tickers.json, symboles déjà vérifiés contre le nom retourné par FMP, jamais un
ticker deviné à l'aveugle). Réutilise ingest_symbol() telle quelle, un symbole à la
fois — ingest_symbol() ne lève jamais d'exception (chaque endpoint logue son propre
échec dans fetch_log), donc un symbole à la source de données incomplète ne bloque
jamais les suivants.

Usage :
    python ingest_batch.py                          # tous les symboles "ok"/"ok_corrige_manuellement" de resolved_tickers.json
    python ingest_batch.py --limit 5                 # les 5 premiers seulement (test)
    python ingest_batch.py --input fichier.json      # un autre fichier résolu (ex. un lot séparé) —
                                                       # évite d'écraser resolved_tickers.json d'un lot à l'autre
"""
import json
import pathlib
import sys
import time

import config
import db
from ingest import ingest_symbol

THIS_DIR = pathlib.Path(__file__).resolve().parent
RESOLVED_PATH = THIS_DIR / "resolved_tickers.json"


def main():
    config.require_api_key()
    resolved_path = RESOLVED_PATH
    if "--input" in sys.argv:
        resolved_path = pathlib.Path(sys.argv[sys.argv.index("--input") + 1])
    if not resolved_path.exists():
        print(f"Fichier introuvable : {resolved_path} — lance d'abord resolve_tickers.py")
        sys.exit(1)
    resolved = json.loads(resolved_path.read_text(encoding="utf-8"))
    entries = [r for r in resolved if r["status"].startswith("ok") and r["fmp_symbol"]]

    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
        entries = entries[:limit]

    print(f"=== Import en lot : {len(entries)} entreprise(s) ===")
    conn = db.get_connection()
    t0 = time.time()
    for i, r in enumerate(entries, 1):
        elapsed = time.time() - t0
        print(f"\n[{i}/{len(entries)}] {r['nom']} ({r['fmp_symbol']}) — {elapsed:.0f}s écoulées")
        try:
            ingest_symbol(conn, r["fmp_symbol"])
        except Exception as e:
            # Filet de sécurité — ingest_symbol() ne devrait jamais lever, mais un
            # symbole à la source de données FMP vraiment atypique ne doit jamais
            # arrêter tout le lot pour les entreprises suivantes.
            print(f"  [ERREUR INATTENDUE] {r['nom']} — {e} — passage au suivant")
    conn.close()
    print(f"\n=== Terminé : {len(entries)} entreprise(s) en {(time.time()-t0)/60:.1f} min. Base : {config.DB_PATH} ===")


if __name__ == "__main__":
    main()
