"""
Rafraichit UNIQUEMENT price_history_daily pour tous les symboles deja importes -
retour utilisateur direct : "le cours de bourse, on dirait que tu ne le mets pas a
jour... le graphique ne correspond pas a TradingView". Cause reelle : le mode
"chandeliers FMP" (devenu la source par defaut, voir loadStockChart() cote app.js) lit
un INSTANTANE statique importe une fois pour toutes (dernier point ~28 aout, pas mis a
jour depuis) - le relais Yahoo pour "aujourd'hui" est en plus instable (voir CLAUDE.md).

Plus leger qu'un ingest.py complet (~20 endpoints/symbole) : un seul endpoint, celui qui
change reellement tous les jours - les fondamentaux (comptes de resultat...) n'ont pas
besoin d'etre re-importes a cette frequence.

Usage : python refresh_prices_only.py
"""
import sys
import time

import config
import db
import fmp_client
from endpoints import ENDPOINTS

PRICE_HISTORY_FROM = "1970-01-01"


def main():
    config.require_api_key()
    conn = db.get_connection()
    cur = conn.execute("SELECT DISTINCT symbol FROM raw_data WHERE category='income_statement'")
    symbols = sorted(r[0] for r in cur.fetchall())
    limit = None
    if "--limit" in sys.argv:
        limit = int(sys.argv[sys.argv.index("--limit") + 1])
        symbols = symbols[:limit]

    spec = ENDPOINTS["price_history_daily"]
    print(f"=== Rafraichissement prix : {len(symbols)} symbole(s) ===")
    t0 = time.time()
    ok, failed = 0, 0
    for i, symbol in enumerate(symbols, 1):
        res = fmp_client.fetch(spec["path"], symbol, {"from": PRICE_HISTORY_FROM})
        if res.status in ("ok", "empty"):
            n = db.replace_category_rows(conn, "price_history_daily", symbol, None, res.data)
            db.log_fetch(conn, "price_history_daily", symbol, None, res.status, res.http_status, None, n)
            ok += 1
            if i % 100 == 0:
                print(f"  [{i}/{len(symbols)}] {symbol} -> {n} ligne(s) — {(time.time()-t0):.0f}s ecoulees")
        else:
            db.log_fetch(conn, "price_history_daily", symbol, None, "error", res.http_status, res.error_message, None)
            failed += 1
            print(f"  [ECHEC] {symbol} — {res.error_message}")
    conn.close()
    print(f"\n=== Termine : {ok} ok, {failed} echec(s) en {(time.time()-t0)/60:.1f} min ===")


if __name__ == "__main__":
    main()
