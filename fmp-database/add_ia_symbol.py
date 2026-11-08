"""
Ajoute un titre AU SEUL usage du Portefeuille IA (ex. l'ETF S&P 500 distribuant SPY pour le portefeuille
« S&P 500 ») : profil + historique de cours + dividendes + splits depuis FMP, ecrits dans la base
SQLite (jamais directement dans les JSON), puis exportes : data/prices-{SYM}.json,
data/events-{SYM}.json et data/symbols-meta.json (devise, place, actif...).

Ne fait PAS l'ingestion complete d'une entreprise (pas de bilans/transcripts : un ETF n'en a pas).

Usage : python add_ia_symbol.py SPY [AUTRE ...]
"""
import sys

import config
import db
import export_events
import export_prices
import export_symbols_meta
from refresh_portfolio_ia import PRICE_HISTORY_FROM, refresh_category


def main():
    config.require_api_key()
    symbols = sys.argv[1:]
    if not symbols:
        print("Usage : python add_ia_symbol.py SYMBOLE [SYMBOLE ...]")
        sys.exit(1)
    conn = db.get_connection()
    for sym in symbols:
        print(f"=== {sym} ===")
        for category, extra in (("profile", None), ("price_history_daily", {"from": PRICE_HISTORY_FROM}), ("dividends", None), ("splits", None)):
            ok, err = refresh_category(conn, category, sym, extra)
            print(f"  {category}: {'OK' if ok else 'ERREUR ' + str(err)}")
        print(f"  prix : {export_prices.export_symbol(conn, sym)} points")
        n_div, n_spl = export_events.export_symbol(conn, sym)
        print(f"  evenements : {n_div} dividendes, {n_spl} splits")
    conn.close()
    export_symbols_meta.main()


if __name__ == "__main__":
    main()
