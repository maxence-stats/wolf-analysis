"""
Import complet — pour chaque symbole, appelle chaque endpoint du registre et stocke
tout dans la base SQLite (voir schema.sql). Conçu pour être relancé sans risque
(replace_category_rows() efface puis réécrit, jamais de doublons qui s'accumulent).

Usage :
    python ingest.py KO
    python ingest.py KO MC.PA

Pour un import massif de 2000-3000 tickers, ce fichier restera la même logique —
seule la liste de symboles en argument change (voir README.md, section "passer à
l'échelle"). Ne PAS lancer sur des milliers de tickers avant d'avoir validé le résultat
sur KO/MC.PA avec discover.py + une relecture manuelle de quelques lignes.
"""
import sys

import config
import db
import fmp_client
from endpoints import ENDPOINTS

# Aussi large que possible par défaut — FMP renvoie simplement moins si son historique
# réel est plus court, jamais d'erreur pour une plage trop large.
PRICE_HISTORY_FROM = "1970-01-01"


def ingest_symbol(conn, symbol):
    print(f"\n=== Import {symbol} ===")
    for category, spec in ENDPOINTS.items():
        if category == "earnings_transcript":
            continue  # traité séparément plus bas (dépend de earnings_transcript_dates)
        periods = spec["periods"] or [None]
        for period in periods:
            extra = dict(spec["extra_params"])
            if period:
                extra["period"] = period
            if category == "price_history_daily":
                extra["from"] = PRICE_HISTORY_FROM
            res = fmp_client.fetch(spec["path"], symbol, extra)
            label = f"{category}" + (f" ({period})" if period else "")
            if res.status == "ok":
                n = db.replace_category_rows(conn, category, symbol, period, res.data)
                db.log_fetch(conn, category, symbol, period, "ok", res.http_status, None, n)
                print(f"  [OK]    {label} — {n} ligne(s)")
            elif res.status == "empty":
                db.replace_category_rows(conn, category, symbol, period, res.data)
                db.log_fetch(conn, category, symbol, period, "empty", res.http_status, None, 0)
                print(f"  [vide]  {label}")
            else:
                db.log_fetch(conn, category, symbol, period, "error", res.http_status, res.error_message, None)
                print(f"  [ÉCHEC] {label} — {res.error_message}")

    # Transcripts : d'abord la liste des trimestres disponibles, puis un appel par
    # trimestre réellement listé — jamais un balayage à l'aveugle sur 30 ans de
    # trimestres qui n'existent peut-être pas.
    dates_res = fmp_client.fetch(ENDPOINTS["earnings_transcript_dates"]["path"], symbol, {})
    if dates_res.status == "ok" and isinstance(dates_res.data, list):
        n_dates = db.replace_category_rows(conn, "earnings_transcript_dates", symbol, None, dates_res.data)
        db.log_fetch(conn, "earnings_transcript_dates", symbol, None, "ok", dates_res.http_status, None, n_dates)
        print(f"  [OK]    earnings_transcript_dates — {n_dates} trimestre(s) à récupérer")
        transcripts = []
        for entry in dates_res.data:
            year = entry.get("year") if isinstance(entry, dict) else (entry[0] if isinstance(entry, (list, tuple)) else None)
            quarter = entry.get("quarter") if isinstance(entry, dict) else (entry[1] if isinstance(entry, (list, tuple)) else None)
            if year is None or quarter is None:
                continue
            t_res = fmp_client.fetch(ENDPOINTS["earnings_transcript"]["path"], symbol, {"year": year, "quarter": quarter})
            if t_res.status == "ok":
                items = t_res.data if isinstance(t_res.data, list) else [t_res.data]
                transcripts.extend(items)
            db.log_fetch(conn, "earnings_transcript", symbol, f"{year}Q{quarter}", t_res.status, t_res.http_status, t_res.error_message, None)
        n_t = db.replace_category_rows(conn, "earnings_transcript", symbol, None, transcripts)
        print(f"  [OK]    earnings_transcript — {n_t} transcript(s) récupéré(s)")
    else:
        db.log_fetch(conn, "earnings_transcript_dates", symbol, None, dates_res.status, dates_res.http_status, dates_res.error_message, 0)
        print(f"  [{'vide' if dates_res.status=='empty' else 'ÉCHEC'}] earnings_transcript_dates" + (f" — {dates_res.error_message}" if dates_res.error_message else ""))


def main():
    config.require_api_key()
    symbols = sys.argv[1:]
    if not symbols:
        print("Usage : python ingest.py SYMBOLE [SYMBOLE2 ...]")
        sys.exit(1)
    conn = db.get_connection()
    for symbol in symbols:
        ingest_symbol(conn, symbol)
    conn.close()
    print(f"\nTerminé. Base : {config.DB_PATH}")


if __name__ == "__main__":
    main()
