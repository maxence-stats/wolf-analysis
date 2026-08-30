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
  fcfParAction -> FCF/action de la DERNIÈRE année dispo, valeur réelle (affichage/référence)
  fcfBase      -> médiane des 3 dernières années POSITIVES de FCF/action — base utilisée
                  pour le calcul de Prix Juste (pas fcfParAction seule) : lisse un creux
                  ponctuel d'une seule année qui ferait exploser l'écart au prix actuel
                  (constaté sur Lennar/Amazon) sans changer le résultat pour une entreprise
                  au FCF stable/en croissance régulière
  medianePFCF  -> médiane du P/FCF sur les 10 dernières années dispo, années où le P/FCF
                  dépasse 150x déjà exclues du calcul (voir compute_entry() — un P/FCF
                  explosif une année donnée vient quasi toujours d'un FCF proche de zéro
                  cette année-là, pas d'une vraie valorisation de marché soutenue ; laissé
                  brut sinon, PAS de plafond appliqué ici)

  prixJuste et ecartPrix ne sont PLUS calculés dans ce script : le site les recalcule
  côté client (renderClassement()/classementValuationFor() dans app.js) à partir de
  fcfParAction/medianePFCF ci-dessus, pour pouvoir appliquer sans re-générer ce fichier :
  1) le réglage "Plafonner à 25x" (demande explicite, activable/désactivable) ;
  2) la priorité à l'objectif Réaliste enregistré par l'utilisateur en Valorisation pour
     cette entreprise quand il existe ("tu es censé prendre mes résultats qui ont été
     enregistrés") — cet objectif est propre au navigateur (localStorage), inaccessible
     depuis ce script Python.
  Formule (côté site) : prixJuste = fcfParAction * multiple (medianePFCF, éventuellement
  plafonnée à 25x, ou le multiple de l'objectif enregistré s'il existe) ; ecartPrix =
  (prixActuel - prixJuste) / prixJuste * 100 — négatif = prix EN DESSOUS de la juste
  valeur = sous-valorisée (convention explicitement demandée par l'utilisateur : "quand
  c'est négatif, c'est sous-valorisé... la valeur de l'entreprise est inférieure à sa
  valeur intrinsèque"). Dénominateur volontairement prixJuste (pas prixActuel) : borne
  la sous-valorisation à -100% au maximum (une entreprise ne peut pas valoir moins que
  zéro), alors que la survalorisation reste non bornée — c'est le sens physique correct,
  contrairement au 1er calcul (dénominateur prixActuel) qui bornait le mauvais côté et
  produisait des "-214%" jugés à raison impossibles par l'utilisateur.

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
MAX_PRICE_STALENESS_DAYS = 60


def load_name_map():
    """symbol -> nom Sheet, à partir de data/fmp-symbols.json (nom -> symbol)."""
    path = DATA_DIR / "fmp-symbols.json"
    if not path.exists():
        return {}
    raw = json.loads(path.read_text(encoding="utf-8"))
    return {sym: nom for nom, sym in raw.items()}


def load_company_name_map(conn):
    """symbol -> companyName FMP (profil), pour détecter les doublons ci-dessous."""
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
        out[sym] = profile.get("companyName") or None
    return out


# Une même entreprise peut être ingérée sous DEUX symboles FMP distincts (cotation
# primaire + ADR/second listing — ex. TotalEnergies en TTE.PA ET TTE, Ferrari en
# RACE.MI ET RACE, SAP en SAP.DE ET SAP), chacun avec son propre prix/FCF dans une
# devise différente : sans dédoublonnage, l'entreprise apparaît deux fois dans le
# classement avec deux rendements différents et (souvent) deux logos différents.
# Signalé par l'utilisateur : "j'ai une fois TotalEnergies et une fois TTE, la même
# entreprise... et ce n'est pas le même logo". companyName (profil FMP) est le signal
# fiable ici — contrairement au ticker de base (EL/EL.PA sont DEUX entreprises
# différentes par coïncidence de ticker : Estée Lauder vs EssilorLuxottica, vérifié) ou
# à l'ISIN (différent entre cotation primaire et ADR, ce n'est pas le même titre au
# sens strict). Parmi les symboles partageant le même companyName, on garde celui lié
# au Sheet (name_map) s'il y en a un — sinon le premier par ordre alphabétique de
# symbole, choix arbitraire mais déterministe.
def find_duplicate_symbols_to_skip(symbols, name_map, company_name_map):
    groups = {}
    for sym in symbols:
        cname = company_name_map.get(sym)
        if not cname:
            continue
        groups.setdefault(cname, []).append(sym)
    skip = set()
    for cname, syms in groups.items():
        if len(syms) < 2:
            continue
        sheet_linked = [s for s in syms if s in name_map]
        keep = sheet_linked[0] if sheet_linked else sorted(syms)[0]
        for s in syms:
            if s != keep:
                skip.add(s)
    return skip


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
    # Bug trouvé en testant (HSBC : "59803%" de survalorisation, rendement du dividende
    # à 0,05% au lieu de ~5% réel) : la Bourse de Londres cote en PENCE (GBp), pas en
    # livres, alors que FMP renvoie les données fondamentales (FCF/action, dividende/
    # action...) en livres — un facteur 100 partout où le prix LSE entre dans un calcul.
    # Confirmé sur les 15 tickers ".L" du classement, tous avec un rendement du dividende
    # anormalement proche de 0. Converti en livres (÷100) ici, à la source, plutôt que de
    # rafistiner chaque ratio séparément.
    if symbol.endswith(".L") and prix_actuel:
        prix_actuel = prix_actuel / 100
    if not prix_actuel or prix_actuel <= 0:
        return None
    last_date_str = prices[-1].get("t")
    if last_date_str:
        last_date = datetime.date.fromisoformat(last_date_str)
        if (datetime.date.today() - last_date).days > MAX_PRICE_STALENESS_DAYS:
            return None  # ticker peu/plus liquide — tout ratio dérivé du prix serait trompeur

    ch = doc.get("chartsHistory") or {}
    dividendes = [v for v in (ch.get("dividende") or []) if v is not None]
    # Bug trouvé après retour utilisateur ("Shopify, Zoom Video... je pense qu'il y a un
    # problème") : une année où le FCF/action est quasi nul (ex. Shopify 2019, FCF/action
    # ≈ 0,01) donne un P/FCF explosif (5468x) qui n'a jamais représenté une vraie
    # valorisation de marché — juste un artefact de division par presque zéro. Inclure
    # ces années dans la médiane la fait exploser (médiane Shopify à 232x sur seulement
    # 6 valeurs positives dispo, dont 5468 et 354). Fix : exclure les années où le P/FCF
    # dépasse un seuil qu'aucune valorisation de marché réelle et durable n'atteint
    # (150x) AVANT de calculer la médiane — pas un plafond sur le résultat final (ça,
    # c'est le réglage "Plafonner à 25x" côté site, une couche de prudence utilisateur
    # EN PLUS de ce nettoyage, pas un remplacement).
    PFCF_OUTLIER_CEILING = 150
    pfcf_series = [v for v in (ch.get("pFcf") or []) if v is not None and 0 < v <= PFCF_OUTLIER_CEILING]
    fcf_series = [v for v in (ch.get("fcfParAction") or []) if v is not None]

    dividende = dividendes[-1] if dividendes else None
    cagr_div10 = cagr(dividendes[-11:]) if len(dividendes) >= 2 else None

    fcf_actuel = fcf_series[-1] if fcf_series else None
    # Bug trouvé après retour utilisateur ("Lennar, Amazon... 6597%, 1375%") : même avec
    # une médiane P/FCF saine, une SEULE année de FCF/action anormalement basse (Lennar :
    # 0,11 alors que ses années précédentes sont nettement plus hautes — un creux
    # ponctuel, pas le nouveau niveau normal de l'entreprise) écrase le Prix Juste, qui
    # explose l'écart au prix actuel. Fix : fcfBase = médiane des 3 dernières années
    # positives de FCF/action (pas juste la toute dernière) — lisse un creux ponctuel
    # sans changer le calcul pour une entreprise dont le FCF est stable/en croissance
    # régulière (fcfBase ≈ fcf_actuel dans ce cas). fcfParAction reste exportée séparément
    # (valeur RÉELLE de la dernière année, pour affichage/référence) — fcfBase est
    # uniquement la base utilisée dans le calcul de Prix Juste.
    # Bug trouvé en re-testant : Duke Energy n'avait qu'UNE SEULE année positive sur les
    # 3 dernières (utility très capitalistique, dépenses d'investissement massives
    # certaines années -> FCF négatif) — la "médiane" d'un seul point reste ce point
    # isolé (0,06), pas mieux qu'avant. Exige au moins 2 années positives pour faire
    # confiance à fcfBase, sinon None (entreprise exclue du classement valorisation
    # plutôt qu'un chiffre construit sur une seule donnée non représentative).
    fcf_recent_positive = [v for v in fcf_series[-3:] if v is not None and v > 0]
    fcf_base = statistics.median(fcf_recent_positive) if len(fcf_recent_positive) >= 2 else None
    # medianePFCF/fcfBase sont exportées BRUTES (pas de plafond sur le multiple ici) —
    # le site recalcule prixJuste/ecartPrix côté client à partir de ces valeurs, pour
    # pouvoir appliquer :
    # 1) le réglage "Plafonner à 25x" (activable/désactivable sans re-générer ce fichier),
    # 2) la priorité à l'objectif Réaliste enregistré par l'utilisateur en Valorisation
    #    quand il existe pour cette entreprise (jamais recalculé ici, propre au navigateur).
    mediane_pfcf = statistics.median(pfcf_series[-10:]) if len(pfcf_series) >= 3 else None

    # Bug MAJEUR trouvé après retour utilisateur très clair ("Tencent sous-valorisée de
    # 80%... Taiwan Semiconductor... tu as tout inversé... c'est de la merde") — investigué
    # à fond plutôt que corrigé au doigt mouillé : pour un ticker OTC/ADR étranger (ex.
    # TCEHY pour Tencent, TSM pour TSMC), le pFcf HISTORIQUE de FMP (et donc probablement
    # aussi le dividende/action) est calculé contre le prix ET/OU la base d'actions de la
    # cote PRIMAIRE (Tencent : ~535 HKD à Hong Kong), alors que prix_actuel ici vient du
    # prix de l'ADR (Tencent : ~58 USD) — deux bases totalement différentes mélangées
    # dans une seule formule. Résultat : medianePFCF (~32x pour Tencent) n'a AUCUN rapport
    # avec le multiple réel au prix ADR actuel (~3x) — pas une vraie sous-valorisation de
    # 90%, un artefact de calcul ; le rendement du dividende (7,1% affiché, ~0,5-1% réel)
    # souffre du MÊME mélange de base, sous le seuil de 15% donc jamais intercepté par
    # MAX_PLAUSIBLE_YIELD_PCT jusqu'ici. Détecté ainsi : le multiple implicite au prix
    # actuel (prix_actuel / fcfBase) ne devrait normalement jamais s'écarter à ce point de
    # sa propre médiane historique (vérifié sur 472 entreprises : rupture nette sous 0,15
    # — entièrement des ADR japonaises/coréennes bien connues, Nintendo/Sony/Keyence/
    # Nidec..., PAS des entreprises réellement bradées à 99% ; rien d'anormal au-dessus, y
    # compris les cas extrêmes déjà confirmés réels par l'utilisateur comme Eli Lilly à
    # 5,4x). Une fois détectée, l'incohérence disqualifie TOUS les ratios par action de
    # cette entreprise (valorisation ET dividende, même origine) — pas seulement celui où
    # elle a été repérée en premier.
    mismatch_devise_ou_base = False
    if fcf_base and fcf_base > 0 and mediane_pfcf and mediane_pfcf > 0:
        current_multiple = prix_actuel / fcf_base
        if (current_multiple / mediane_pfcf) < 0.15:
            mismatch_devise_ou_base = True
            mediane_pfcf = None

    rendement_div = (dividende / prix_actuel * 100) if dividende and dividende > 0 and not mismatch_devise_ou_base else None
    if rendement_div is not None and rendement_div > MAX_PLAUSIBLE_YIELD_PCT:
        rendement_div = None  # incohérence probable (ex. devise du dividende ≠ devise du prix)

    return {
        "nom": name_map.get(symbol, doc.get("companyName") or symbol),
        "symbol": symbol,
        "secteur": sector_map.get(symbol),
        "prixActuel": round(prix_actuel, 4),
        "dividende": round(dividende, 4) if dividende is not None else None,
        "rendementDiv": round(rendement_div, 4) if rendement_div is not None else None,
        "cagrDiv10": round(cagr_div10, 4) if cagr_div10 is not None else None,
        "fcfParAction": round(fcf_actuel, 4) if fcf_actuel is not None else None,
        "fcfBase": round(fcf_base, 4) if fcf_base is not None else None,
        "medianePFCF": round(mediane_pfcf, 4) if mediane_pfcf is not None else None,
    }


def main():
    conn = db.get_connection()
    name_map = load_name_map()
    sector_map = load_sector_map(conn)
    company_name_map = load_company_name_map(conn)

    cur = conn.cursor()
    cur.execute("SELECT DISTINCT symbol FROM raw_data WHERE category='income_statement'")
    symbols = sorted(r[0] for r in cur.fetchall())

    dup_skip = find_duplicate_symbols_to_skip(symbols, name_map, company_name_map)

    out = []
    skipped = 0
    for symbol in symbols:
        if symbol in dup_skip:
            skipped += 1
            continue
        entry = compute_entry(symbol, name_map, sector_map)
        if entry:
            out.append(entry)
        else:
            skipped += 1

    OUTPUT_PATH.write_text(json.dumps(out, ensure_ascii=False, indent=0), encoding="utf-8")
    print(f"{len(out)}/{len(symbols)} entreprises exportées dans le classement ({skipped} ignorées — fichiers manquants, prix invalide, ou doublon d'une autre cotation).")
    if dup_skip:
        print(f"Doublons de cotation écartés ({len(dup_skip)}) : {', '.join(sorted(dup_skip))}")
    print(f"Écrit : {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
