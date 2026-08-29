"""
Exporte l'historique de cours quotidien FMP (price_history_daily, déjà importé par
ingest.py) vers un JSON léger que le site charge pour construire le graphique en
chandeliers de l'onglet Analyse (voir renderStockChartCandle() côté app.js). Format
compact — seulement date/open/high/low/close, pas volume/vwap/change (jamais affichés
côté site) — pour rester raisonnable en taille malgré ~5000 points par entreprise.

Le fichier de sortie (data/prices-{SYMBOLE}.json, à la racine du dépôt) suit le même
régime que data/documents-*.json : exclu de git (CGU FMP, voir .gitignore), l'absence du
fichier fait retomber le site sur l'ancien relais Yahoo/Stooq, pas d'erreur bloquante.

Usage :
    python export_prices.py KO
    python export_prices.py --batch          # tous les symboles de resolved_tickers.json
                                               # déjà présents en base (pas de nouvel appel FMP)
"""
import json
import pathlib
import sys

import db

OUTPUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"
RESOLVED_PATH = pathlib.Path(__file__).resolve().parent / "resolved_tickers.json"


def export_symbol(conn, symbol):
    cur = conn.cursor()
    cur.execute(
        "SELECT payload FROM raw_data WHERE symbol=? AND category='price_history_daily' ORDER BY item_date ASC",
        (symbol,),
    )
    rows = [json.loads(r[0]) for r in cur.fetchall()]
    out = [
        {"t": r["date"], "o": r.get("open"), "h": r.get("high"), "l": r.get("low"), "c": r.get("close")}
        for r in rows if r.get("date") and r.get("close") is not None
    ]
    if not out:
        return 0
    dest = OUTPUT_DIR / f"prices-{symbol}.json"
    dest.write_text(json.dumps(out, ensure_ascii=False), encoding="utf-8")
    return len(out)


def main():
    conn = db.get_connection()
    if "--batch" in sys.argv:
        resolved = json.loads(RESOLVED_PATH.read_text(encoding="utf-8"))
        symbols = [r["fmp_symbol"] for r in resolved if r["status"].startswith("ok") and r["fmp_symbol"]]
        total = 0
        for sym in symbols:
            n = export_symbol(conn, sym)
            print(f"  {sym:12s} -> {n} point(s)" + ("" if n else " (rien en base, symbole pas encore importé)"))
            total += 1 if n else 0
        print(f"\n{total}/{len(symbols)} fichiers de prix écrits dans {OUTPUT_DIR}")
    else:
        symbol = sys.argv[1] if len(sys.argv) > 1 else "KO"
        n = export_symbol(conn, symbol)
        print(f"{symbol} -> {n} point(s) écrits dans {OUTPUT_DIR / ('prices-' + symbol + '.json')}")
    conn.close()


if __name__ == "__main__":
    main()
