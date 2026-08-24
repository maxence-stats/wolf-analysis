"""
Passe de VÉRIFICATION — à lancer en premier, toujours, avant tout import massif.

Teste chaque entrée de endpoints.ENDPOINTS sur un symbole donné et rapporte ce qui
répond vraiment ('ok'/'empty'/'error'), plutôt que de faire confiance aveuglément au
registre (voir l'avertissement en tête de endpoints.py — certaines entrées ne sont pas
encore confirmées faute de clé API disponible au moment d'écrire ce module).

Usage :
    python discover.py KO
    python discover.py MC.PA LVMUY LVMHF   # teste plusieurs variantes de ticker pour LVMH
"""
import sys

import config
import db
import fmp_client
from endpoints import ENDPOINTS


def discover_symbol(conn, symbol):
    print(f"\n=== {symbol} ===")
    results = {}
    for category, spec in ENDPOINTS.items():
        periods = spec["periods"] or [None]
        for period in periods:
            extra = dict(spec["extra_params"])
            if period:
                extra["period"] = period
            # Le transcript a besoin de year=/quarter=, jamais devinés à l'aveugle —
            # traité séparément après avoir vu ce que earnings_transcript_dates renvoie.
            if category == "earnings_transcript":
                continue
            res = fmp_client.fetch(spec["path"], symbol, extra)
            label = f"{category}" + (f" ({period})" if period else "")
            count = len(res.data) if isinstance(res.data, list) else (1 if res.data else 0)
            db.log_fetch(conn, category, symbol, period, res.status, res.http_status, res.error_message, count)
            results[label] = res.status
            marker = {"ok": "OK", "empty": "vide", "error": "ÉCHEC"}[res.status]
            detail = f" — {res.error_message}" if res.status == "error" else (f" ({count} élément(s))" if res.status == "ok" else "")
            print(f"  [{marker:>5}] {label}{detail}")

    # Transcripts : on regarde d'abord les dates dispo avant de fetcher quoi que ce soit.
    dates_res = fmp_client.fetch(ENDPOINTS["earnings_transcript_dates"]["path"], symbol, {})
    if dates_res.status == "ok" and isinstance(dates_res.data, list) and dates_res.data:
        n = len(dates_res.data)
        oldest = dates_res.data[-1] if n else None
        newest = dates_res.data[0] if n else None
        print(f"  [   OK] earnings_transcript_dates ({n} trimestre(s) disponible(s), du plus ancien {oldest} au plus récent {newest})")
        results["earnings_transcript_dates"] = "ok"
    else:
        print(f"  [{('vide' if dates_res.status=='empty' else 'ÉCHEC'):>5}] earnings_transcript_dates" + (f" — {dates_res.error_message}" if dates_res.error_message else ""))
        results["earnings_transcript_dates"] = dates_res.status

    return results


def main():
    config.require_api_key()
    symbols = sys.argv[1:]
    if not symbols:
        print("Usage : python discover.py SYMBOLE [SYMBOLE2 ...]")
        sys.exit(1)
    conn = db.get_connection()
    summary = {}
    for symbol in symbols:
        summary[symbol] = discover_symbol(conn, symbol)
    conn.close()

    print("\n=== Résumé ===")
    for symbol, results in summary.items():
        ok_count = sum(1 for v in results.values() if v == "ok")
        print(f"{symbol} : {ok_count}/{len(results)} endpoints répondent avec des données.")


if __name__ == "__main__":
    main()
