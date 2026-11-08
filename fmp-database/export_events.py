"""
Exporte le calendrier des DIVIDENDES et des SPLITS de chaque entreprise (déjà importés en
base par ingest.py, mais jamais exportés jusqu'ici) vers data/events-{SYMBOLE}.json, pour
le crédit automatique des dividendes du Portefeuille IA.

Format :
    {"div":[{"d":"2026-05-21","p":"2026-07-01","a":23.0}, ...],
     "spl":[{"d":"2024-06-10","n":10,"m":1}, ...]}
    div.d = date d'ex-dividende, div.p = date de paiement ("" si inconnue),
    div.a = montant par action, dans la devise de COTATION (mêmes unités que le cours :
            pence pour un titre coté en GBp — le site divise par le diviseur de
            data/symbols-meta.json puis convertit en euros) ;
    spl.n/m = numérateur/dénominateur (10:1 -> n=10, m=1 : 1 action ancienne = 10 nouvelles).
Les dividendes futurs DÉJÀ ANNONCÉS sont inclus ; le site ne crédite que ceux dont la date
de paiement est passée.

RÈGLE DE COHÉRENCE (vérifiée sur les données — NVDA 10:1 en 2024, AAPL 4:1 en 2020) : les
cours de data/prices-*.json sont AJUSTÉS DES SPLITS (pas des dividendes) ; on exporte donc
`adjDividend` (montant par action COURANTE) et non `dividend` (montant versé à l'époque).
Une position stockée en nombre d'actions à la date d'achat doit ensuite être multipliée par
les splits POSTÉRIEURS à l'achat (voir le moteur de js/portefeuille-ia.js).

Seuls les splits de type "stock-split" sont retenus (pas les spin-offs, rights-issue...).
Un fichier est écrit pour TOUT symbole ayant des cours, même sans événement (liste vide),
pour que le site distingue "aucun dividende" de "pas encore exporté" (404).

Exclu de git (données FMP, CGU) — voir .gitignore.

Usage :
    python export_events.py KO
    python export_events.py --batch
"""
import json
import pathlib
import sys

import db

OUTPUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"


def build_events(conn, symbol):
    cur = conn.cursor()
    cur.execute(
        "SELECT payload FROM raw_data WHERE symbol=? AND category='dividends' ORDER BY item_date ASC",
        (symbol,),
    )
    div = []
    for (payload,) in cur.fetchall():
        r = json.loads(payload)
        if not isinstance(r, dict) or not r.get("date"):
            continue
        amount = r.get("adjDividend")
        if amount is None:
            amount = r.get("dividend")
        if amount is None or amount <= 0:
            continue
        div.append({"d": r["date"], "p": r.get("paymentDate") or "", "a": round(float(amount), 6)})
    div.sort(key=lambda e: e["d"])

    cur.execute(
        "SELECT payload FROM raw_data WHERE symbol=? AND category='splits' ORDER BY item_date ASC",
        (symbol,),
    )
    spl = []
    for (payload,) in cur.fetchall():
        r = json.loads(payload)
        if not isinstance(r, dict) or not r.get("date"):
            continue
        if r.get("splitType") not in (None, "stock-split"):
            continue
        n, m = r.get("numerator"), r.get("denominator")
        if not n or not m or n <= 0 or m <= 0 or n == m:
            continue
        spl.append({"d": r["date"], "n": n, "m": m})
    spl.sort(key=lambda e: e["d"])
    return {"div": div, "spl": spl}


def export_symbol(conn, symbol):
    events = build_events(conn, symbol)
    dest = OUTPUT_DIR / f"events-{symbol}.json"
    dest.write_text(json.dumps(events, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(events["div"]), len(events["spl"])


def all_symbols_with_prices(conn):
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT symbol FROM raw_data WHERE category='price_history_daily'")
    return sorted(r[0] for r in cur.fetchall())


def main():
    conn = db.get_connection()
    if "--batch" in sys.argv:
        symbols = all_symbols_with_prices(conn)
        n_div = n_spl = with_div = 0
        for sym in symbols:
            d, s = export_symbol(conn, sym)
            n_div += d
            n_spl += s
            with_div += 1 if d else 0
        print(f"{len(symbols)} fichiers events-*.json écrits dans {OUTPUT_DIR}")
        print(f"{with_div} symboles avec dividendes ({n_div} versements), {n_spl} splits au total")
    else:
        symbol = sys.argv[1] if len(sys.argv) > 1 else "KO"
        d, s = export_symbol(conn, symbol)
        print(f"{symbol} -> {d} dividende(s), {s} split(s) écrits dans {OUTPUT_DIR / ('events-' + symbol + '.json')}")
    conn.close()


if __name__ == "__main__":
    main()
