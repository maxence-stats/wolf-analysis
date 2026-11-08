"""
Exporte les indices de référence utilisés pour comparer les portefeuilles IA :
data/bench-sp500.json (S&P 500, ^GSPC, en points/USD, cours SEULS) et data/bench-sp500tr.json
(S&P 500 Total Return, ^SP500TR, dividendes réinvestis).

Format : [{"t":"2026-09-18","c":7650.5}, ...] croissant. Le site convertit en euros avec
data/fx-USD.json pour rester cohérent avec des portefeuilles valorisés en euros.

Comparaison équitable : le site utilise ^SP500TR quand les dividendes sont comptés pour les
portefeuilles IA, et ^GSPC quand ils sont exclus (réglage "Dividendes" du Portefeuille IA).

Exclu de git (données FMP, CGU) — voir .gitignore.

Usage :
    python export_benchmarks.py
"""
import sys

import config
from export_fx import fetch_eod, write_series

BENCHMARKS = {
    "bench-sp500.json": "^GSPC",        # indice de COURS (sans dividendes)
    "bench-sp500tr.json": "^SP500TR",   # dividendes REINVESTIS (Total Return)
}


def export_benchmarks():
    done = {}
    for filename, symbol in BENCHMARKS.items():
        rows = fetch_eod(symbol, "2010-01-01")
        if rows:
            write_series(filename, rows)
            done[filename] = len(rows)
    return done


def main():
    config.require_api_key()
    done = export_benchmarks()
    for filename, n in done.items():
        print(f"  {filename}: {n} points")
    if len(done) != len(BENCHMARKS):
        print("Certains indices sont indisponibles.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
