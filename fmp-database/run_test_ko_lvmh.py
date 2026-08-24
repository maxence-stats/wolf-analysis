"""
Point d'entrée demandé : teste tout le pipeline sur Coca-Cola et LVMH.

1. discover sur KO et sur 3 variantes de ticker pour LVMH (MC.PA / LVMUY / LVMHF —
   jamais vérifié laquelle FMP reconnaît réellement, voir endpoints.py).
2. Garde la/les variante(s) LVMH qui répondent vraiment (au moins "profile" en ok).
3. Lance l'import complet (ingest) sur KO + la bonne variante LVMH.
4. Affiche un résumé : combien de catégories de données récupérées par entreprise,
   combien de trimestres de transcripts, taille finale de la base.

Usage :
    python run_test_ko_lvmh.py
"""
import config
import db
import discover
import ingest
from endpoints import TEST_SYMBOLS


def resolve_lvmh_ticker(conn):
    candidates = TEST_SYMBOLS["LVMH"]
    print("Recherche du bon ticker FMP pour LVMH parmi :", ", ".join(candidates))
    for symbol in candidates:
        results = discover.discover_symbol(conn, symbol)
        if results.get("profile") == "ok":
            print(f"-> Ticker retenu pour LVMH : {symbol}")
            return symbol
    print("-> Aucune des variantes testées ne répond sur 'profile'. Vérifie le ticker manuellement sur FMP (recherche par nom).")
    return None


def main():
    config.require_api_key()
    conn = db.get_connection()

    print("### Étape 1/2 — Vérification (discover) ###")
    discover.discover_symbol(conn, "KO")
    lvmh_symbol = resolve_lvmh_ticker(conn)
    conn.close()

    symbols_to_ingest = ["KO"] + ([lvmh_symbol] if lvmh_symbol else [])

    print("\n### Étape 2/2 — Import complet (ingest) ###")
    conn = db.get_connection()
    for symbol in symbols_to_ingest:
        ingest.ingest_symbol(conn, symbol)

    print("\n### Résumé final ###")
    cur = conn.cursor()
    for symbol in symbols_to_ingest:
        cur.execute("SELECT category, COUNT(*) FROM raw_data WHERE symbol=? GROUP BY category ORDER BY category", (symbol,))
        rows = cur.fetchall()
        total = sum(r[1] for r in rows)
        print(f"\n{symbol} — {total} lignes au total, {len(rows)} catégorie(s) avec données :")
        for cat, n in rows:
            print(f"   {cat:<30} {n}")
    conn.close()
    print(f"\nBase SQLite : {config.DB_PATH}")
    print("Journal détaillé de chaque appel (succès/vide/échec) : table fetch_log dans la même base.")


if __name__ == "__main__":
    main()
