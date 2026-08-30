"""
Calcule un classement (rendement du dividende + opportunité de valorisation) pour
TOUTES les entreprises déjà exportées en FMP local (data/documents-*.json +
data/prices-*.json) — pas seulement les 72 du Google Sheet. Demande explicite :
"il faut trouver un moyen d'afficher toutes les entreprises... les trier par les
meilleurs dividendes et les meilleures opportunités... top cent, top cinquante".

Bug corrigé au passage (cause du signalement initial "AXA, Equasens... des chiffres
bizarres") : le Classement du site lisait rendementDiv/ecartValeur directement depuis
le Google Sheet, dont le prixActuel peut être obsolète pour certaines lignes (constaté :
AXA à 16,19€ dans le Sheet contre 43,61€ chez FMP, Equasens à 1,01€ contre 33,40€ —
un facteur 30x, donnant un rendement du dividende de 138%). Ce script recalcule tout
depuis le prix ET le dividende FMP les plus récents, jamais depuis une valeur Sheet
potentiellement périmée.

Sortie : data/ranking-summary.json, un tableau compact (un objet par entreprise) que
le site charge en UNE seule requête plutôt que 500-3000 fetch individuels — même
raisonnement que export_to_app.py/export_prices.py (un export Python en amont,
jamais d'agrégation lourde côté navigateur).

Champs par entreprise :
  nom          -> nom Sheet si connu (data/fmp-symbols.json), sinon nom FMP (companyName)
  symbol       -> symbole FMP
  secteur      -> secteur FMP (profil), pour un filtre éventuel côté site
  prixActuel   -> dernière clôture connue (data/prices-{symbole}.json)
  dividende    -> dividende annuel le plus récent (chartsHistory, déjà en devise native)
  rendementDiv -> dividende / prixActuel * 100
  cagrDiv10    -> CAGR du dividende sur les 10 dernières années dispo (ou moins si historique
                  plus court), null si dividende nul/négatif à un bout
  fcfParAction -> FCF/action le plus récent
  medianePFCF  -> médiane du P/FCF sur les 10 dernières années dispo
  prixJuste    -> fcfParAction * medianePFCF (même formule que l'onglet Valorisation,
                  scénario "Réaliste" — vérifié identique au Prix Juste du Sheet sur
                  plusieurs entreprises avant d'adopter cette formule ici)
  ecartPrix    -> (prixJuste - prixActuel) / prixActuel * 100 — upside vers la juste
                  valeur, positif = sous-valorisée. Volontairement DIFFÉRENT de
                  l'ecartValeur du Sheet (qui compare Prix Juste à Prix Cible, jamais au
                  prix actuel — une "marge de sécurité méthodologique", pas une
                  opportunité au prix d'aujourd'hui) : pour un classement d'opportunités
                  AU PRIX ACTUEL, comparer au prix actuel est le calcul pertinent.

Usage :
    python export_ranking.py
"""
import datetime
import json
import pathlib
import sqlite3
import statistics

import config
import db

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"
OUTPUT_PATH = DATA_DIR / "ranking-summary.json"

# Bug trouvé en testant (Hyundai Motor : rendement affiché à 34081% ; Taiwan Semiconductor
# ADR et d'autres ADR OTC japonaises/coréennes à 20-24%, toujours bien au-dessus de leur
# vrai rendement connu ~1-2%) : pour ce genre de ticker OTC/ADR exotique, FMP renvoie
# parfois un dividende dans la devise de la cote PRIMAIRE (won, yen, dollar taïwanais)
# alors que le prix vient de l'ADR coté en dollars — deux devises incompatibles mélangées
# côté FMP, impossible à corriger à la source sans reconstruire tout le mapping devise
# par devise. On se protège en excluant tout résultat au-delà de ce qu'un rendement du
# dividende réel atteint quasiment jamais durablement (15%, déjà généreux — les valeurs
# à très haut rendement réputées, REIT/tabac/BDC, dépassent rarement 10-12%) ET tout prix
# trop ancien (ticker peu/plus liquide) — mieux vaut une entreprise absente du classement
# qu'une en tête avec un chiffre qui décrédibilise tout le reste (même principe que le
# bug AXA/Equasens signalé par l'utilisateur : jamais afficher un ratio calculé sur une
# donnée dont on sait qu'elle peut être incohérente).
MAX_PLAUSIBLE_YIELD_PCT = 15.0
MAX_PLAUSIBLE_ECART_PCT = 300.0
MAX_PRICE_STALENESS_DAYS = 60


def load_name_map():
    """symbol -> nom Sheet, à partir de data/fmp-symbols.json (nom -> symbol)."""
    path = DATA_DIR / "fmp-symbols.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {sym: nom for nom, sym in raw.items()}


def load_sector_map(conn):
    """symbol -> secteur, lu depuis le profil FMP déjà en base (catégorie 'profile')."""
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT symbol FROM raw_data WHERE category='profile'")
    symbols = [r[0] for r in cur.fetchall()]
    out = {}
    for sym in symbols:
        cur.execute(
            "SELECT payload FROM raw_data WHERE category='profile' AND symbol=? ORDER BY id DESC LIMIT 1",
            (sym,),
        )
        row = cur.fetchone()
        if not row:
            continue
        profile = json.loads(row[0])
        if isinstance(profile, list):
            profile = profile[0] if profile else {}
        out[sym] = profile.get("sector") or None
    return out


def cagr(values):
    """CAGR entre le premier et le dernier point d'une série annuelle — None si la série
    est trop courte ou si un bout est nul/négatif (CAGR non défini financièrement)."""
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return None
    first, last = vals[0], vals[-1]
    if first is None or last is None or first <= 0 or last <= 0:
        return None
    n = len(vals) - 1
    if n <= 0:
        return None
    return ((last / first) ** (1 / n) - 1) * 100


def compute_entry(symbol, name_map, sector_map):
    doc_path = DATA_DIR / f"documents-{symbol}.json"
    price_path = DATA_DIR / f"prices-{symbol}.json"
    if not doc_path.exists() or not price_path.exists():
        return None

    doc = json.loads(doc_path.read_text(encoding="utf-8"))
    prices = json.loads(price_path.read_text(encoding="utf-8"))
    if not prices:
        return None
    prix_actuel = prices[-1].get("c")
    if not prix_actuel or prix_actuel <= 0:
        return None
    last_date_str = prices[-1].get("t")
    if last_date_str:
        last_date = datetime.date.fromisoformat(last_date_str)
        if (datetime.date.today() - last_date).days > MAX_PRICE_STALENESS_DAYS:
            return None  # ticker peu/plus liquide — tout ratio dérivé du prix serait trompeur

    ch = doc.get("chartsHistory") or {}
    dividendes = [v for v in (ch.get("dividende") or []) if v is not None]
    pfcf_series = [v for v in (ch.get("pFcf") or []) if v is not None and v > 0]
    fcf_series = [v for v in (ch.get("fcfParAction") or []) if v is not None]

    dividende = dividendes[-1] if dividendes else None
    rendement_div = (dividende / prix_actuel * 100) if dividende and dividende > 0 else None
    if rendement_div is not None and rendement_div > MAX_PLAUSIBLE_YIELD_PCT:
        rendement_div = None  # incohérence probable (ex. devise du dividende ≠ devise du prix)
    cagr_div10 = cagr(dividendes[-11:]) if len(dividendes) >= 2 else None

    fcf_actuel = fcf_series[-1] if fcf_series else None
    mediane_pfcf = statistics.median(pfcf_series[-10:]) if len(pfcf_series) >= 3 else None
    prix_juste = (fcf_actuel * mediane_pfcf) if (fcf_actuel and mediane_pfcf and fcf_actuel > 0) else None
    ecart_prix = ((prix_juste - prix_actuel) / prix_actuel * 100) if prix_juste else None
    if ecart_prix is not None and abs(ecart_prix) > MAX_PLAUSIBLE_ECART_PCT:
        ecart_prix = None

    return {
        "nom": name_map.get(symbol, doc.get("companyName") or symbol),
        "symbol": symbol,
        "secteur": sector_map.get(symbol),
        "prixActuel": round(prix_actuel, 4),
        "dividende": round(dividende, 4) if dividende is not None else None,
        "rendementDiv": round(rendement_div, 4) if rendement_div is not None else None,
        "cagrDiv10": round(cagr_div10, 4) if cagr_div10 is not None else None,
        "fcfParAction": round(fcf_actuel, 4) if fcf_actuel is not None else None,
        "medianePFCF": round(mediane_pfcf, 4) if mediane_pfcf is not None else None,
        "prixJuste": round(prix_juste, 4) if prix_juste is not None else None,
        "ecartPrix": round(ecart_prix, 4) if ecart_prix is not None else None,
    }


def main():
    conn = db.get_connection()
    name_map = load_name_map()
    sector_map = load_sector_map(conn)

    cur = conn.cursor()
    cur.execute("SELECT DISTINCT symbol FROM raw_data WHERE category='income_statement'")
    symbols = sorted(r[0] for r in cur.fetchall())

    out = []
    skipped = 0
    for symbol in symbols:
        entry = compute_entry(symbol, name_map, sector_map)
        if entry:
            out.append(entry)
        else:
            skipped += 1

    OUTPUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(out)}/{len(symbols)} entreprises exportées dans le classement ({skipped} ignorées — fichiers manquants ou prix invalide).")
    print(f"Écrit : {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
