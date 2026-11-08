"""
Exporte un petit fichier de métadonnées par symbole (nom, devise de COTATION, place, pays,
ADR, activement coté) pour le sélecteur d'entreprise et la conversion en euros du
Portefeuille IA : data/symbols-meta.json.

POURQUOI la devise vient du profil FMP (raw_data category='profile', champ currency) et
JAMAIS de documents-*.json ni du suffixe du ticker (vérifié sur les données) :
  - documents-{SYMBOLE}.json .currency est la devise de REPORTING des états financiers :
    TCEHY (Tencent ADR) y vaut CNY alors que le cours et le dividende sont en USD ;
  - le suffixe est trompeur : CPG.L cote en USD, J36.SI en USD, KAP.IL en USD.
Le profil donne la devise dans laquelle le cours ET le dividende par action sont exprimés.

Sous-unités : FMP cote certaines places dans une fraction de la devise (pence, cents,
fils). On les normalise vers la devise de BASE avec un diviseur :
    GBp -> GBP (÷100)   ZAc -> ZAR (÷100)   KWF -> KWD (÷1000)   ILA -> ILS (÷100)
Le site divise prix ET dividendes par `d` puis convertit `c` -> EUR avec data/fx-{c}.json.

Format (compact, un objet par symbole) :
    { "AAPL": {"n":"Apple Inc.","c":"USD","d":1,"x":"NASDAQ","p":"US","a":0,"on":1}, ... }
    n = nom FMP, c = devise de base, d = diviseur de sous-unité, x = place, p = pays ISO2,
    a = 1 si ADR, on = 1 si activement coté (0 = à griser/exclure du sélecteur).

Le fichier est dérivé de données FMP : exclu de git (CGU, voir .gitignore).

Usage :
    python export_symbols_meta.py
"""
import json
import pathlib

import db

OUTPUT_PATH = pathlib.Path(__file__).resolve().parent.parent / "data" / "symbols-meta.json"

SUBUNITS = {
    "GBp": ("GBP", 100), "GBX": ("GBP", 100),
    "ZAc": ("ZAR", 100), "ZAC": ("ZAR", 100),
    "KWF": ("KWD", 1000),
    "ILA": ("ILS", 100),
}


def normalize_currency(code):
    if not code:
        return None, 1
    if code in SUBUNITS:
        return SUBUNITS[code]
    return code.upper(), 1


def build_meta(conn):
    cur = conn.cursor()
    # Une ligne 'profile' par symbole ; si plusieurs (réimports), la dernière (id le plus grand) gagne.
    cur.execute("SELECT symbol, payload FROM raw_data WHERE category='profile' ORDER BY id ASC")
    meta = {}
    for symbol, payload in cur.fetchall():
        try:
            p = json.loads(payload)
        except json.JSONDecodeError:
            continue
        if isinstance(p, list):
            p = p[0] if p else {}
        if not isinstance(p, dict):
            continue
        ccy, div = normalize_currency(p.get("currency"))
        meta[symbol] = {
            "n": p.get("companyName") or symbol,
            "c": ccy,
            "d": div,
            "x": p.get("exchange") or "",
            "p": p.get("country") or "",
            "a": 1 if p.get("isAdr") else 0,
            "on": 0 if p.get("isActivelyTrading") is False else 1,
        }
    return meta


def main():
    conn = db.get_connection()
    meta = build_meta(conn)
    conn.close()
    OUTPUT_PATH.write_text(json.dumps(meta, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    ccys = {}
    for m in meta.values():
        ccys[m["c"]] = ccys.get(m["c"], 0) + 1
    print(f"{len(meta)} symboles écrits dans {OUTPUT_PATH}")
    print("Devises de base :", ", ".join(f"{c}={n}" for c, n in sorted(ccys.items(), key=lambda kv: -kv[1])))
    print(f"Inactifs : {sum(1 for m in meta.values() if not m['on'])} | ADR : {sum(m['a'] for m in meta.values())}")


if __name__ == "__main__":
    main()
