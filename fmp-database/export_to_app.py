"""
Exporte les données FMP déjà importées (voir ingest.py/ingest_batch.py) vers un JSON par
entreprise que le site charge directement (Documents financiers, Revenus, Valorisation,
les 9 graphiques historiques). Écrit dans data/documents-{SYMBOLE}.json à la racine du
dépôt (PAS dans fmp-database/data/, même pattern que data/labo-*.json/data/prices-*.json)
— exclu de git (voir .gitignore) car les CGU FMP interdisent de redistribuer leurs
données brutes sur un dépôt public.

Les clés de l'objet JSON produit correspondent EXACTEMENT aux libellés utilisés dans
DOCUMENTS_IS_ROWS / DOCUMENTS_BS_ROWS / DOCUMENTS_CF_ROWS / DOCUMENTS_GROWTH_ROWS côté
app.js — un champ FMP introuvable ou absent devient simplement `null` (le site affiche
un tiret, pas de plantage). Côté app.js, ensureDocumentsRealData() résout l'URL depuis
fmpSymbols[nom] (data/fmp-symbols.json) — AUCUNE entreprise à ajouter à la main dans le
code : toute entreprise avec un fichier exporté ici fonctionne automatiquement.

Usage :
    python export_to_app.py KO          # une seule entreprise
    python export_to_app.py --batch     # toutes les entreprises déjà importées (voir
                                          # all_symbols_with_data() — pas de liste séparée
                                          # à tenir à jour, lu directement depuis la base)
"""
import json
import sys
import pathlib

import config
import db

# label (identique à app.js/DOCUMENTS_*_ROWS) -> champ FMP réel dans
# income_statement/balance_sheet/cash_flow — listes complètes (tous les postes utiles),
# chaque champ vérifié contre la vraie charge utile FMP (KO) avant d'écrire ce mapping,
# voir CLAUDE.md sur ne jamais deviner un nom de champ.
FIELD_MAP_IS = {
    "Revenue": "revenue",
    "Cost of Revenue": "costOfRevenue",
    "Gross Profit": "grossProfit",
    "R&D Expenses": "researchAndDevelopmentExpenses",
    "G&A Expenses": "generalAndAdministrativeExpenses",
    "Selling & Marketing Expenses": "sellingAndMarketingExpenses",
    "SG&A Expenses": "sellingGeneralAndAdministrativeExpenses",
    "Other Expenses": "otherExpenses",
    "Operating Expenses": "operatingExpenses",
    "Operating Income": "operatingIncome",
    "Interest Income": "interestIncome",
    "Interest Expense": "interestExpense",
    "Net Interest Income": "netInterestIncome",
    "Depreciation & Amortization": "depreciationAndAmortization",
    "EBITDA": "ebitda",
    "EBIT": "ebit",
    "Non-Operating Income (excl. Interest)": "nonOperatingIncomeExcludingInterest",
    "Total Other Income/Expenses, Net": "totalOtherIncomeExpensesNet",
    "Income Before Tax": "incomeBeforeTax",
    "Income Tax Expense": "incomeTaxExpense",
    "Net Income from Continuing Operations": "netIncomeFromContinuingOperations",
    "Net Income from Discontinued Operations": "netIncomeFromDiscontinuedOperations",
    "Net Income": "netIncome",
    "EPS": "eps",
    "EPS Diluted": "epsDiluted",
    "Weighted Avg Shares Outstanding": "weightedAverageShsOut",
    "Weighted Avg Diluted Shares Outstanding": "weightedAverageShsOutDil",
}
FIELD_MAP_BS = {
    "Cash & Cash Equivalents": "cashAndCashEquivalents",
    "Short-Term Investments": "shortTermInvestments",
    "Cash & Short-Term Investments": "cashAndShortTermInvestments",
    "Accounts Receivable": "accountsReceivables",
    "Inventory": "inventory",
    "Other Current Assets": "otherCurrentAssets",
    "Total Current Assets": "totalCurrentAssets",
    "Property, Plant & Equipment": "propertyPlantEquipmentNet",
    "Goodwill": "goodwill",
    "Intangible Assets": "intangibleAssets",
    "Goodwill & Intangible Assets": "goodwillAndIntangibleAssets",
    "Long-Term Investments": "longTermInvestments",
    "Other Non-Current Assets": "otherNonCurrentAssets",
    "Total Non-Current Assets": "totalNonCurrentAssets",
    "Total Assets": "totalAssets",
    "Accounts Payable": "accountPayables",
    "Accrued Expenses": "accruedExpenses",
    "Short-Term Debt": "shortTermDebt",
    "Deferred Revenue": "deferredRevenue",
    "Other Current Liabilities": "otherCurrentLiabilities",
    "Total Current Liabilities": "totalCurrentLiabilities",
    "Long-Term Debt": "longTermDebt",
    "Deferred Tax Liabilities": "deferredTaxLiabilitiesNonCurrent",
    "Other Non-Current Liabilities": "otherNonCurrentLiabilities",
    "Total Non-Current Liabilities": "totalNonCurrentLiabilities",
    "Total Liabilities": "totalLiabilities",
    "Common Stock": "commonStock",
    "Additional Paid-in Capital": "additionalPaidInCapital",
    "Retained Earnings": "retainedEarnings",
    "Treasury Stock": "treasuryStock",
    "Accumulated Other Comprehensive Income/Loss": "accumulatedOtherComprehensiveIncomeLoss",
    "Total Stockholders Equity": "totalStockholdersEquity",
    "Minority Interest": "minorityInterest",
    "Total Equity": "totalEquity",
    "Total Debt": "totalDebt",
    "Net Debt": "netDebt",
}
FIELD_MAP_CF = {
    "Net Income": "netIncome",
    "Depreciation & Amortization": "depreciationAndAmortization",
    "Deferred Income Tax": "deferredIncomeTax",
    "Stock-Based Compensation": "stockBasedCompensation",
    "Change in Working Capital": "changeInWorkingCapital",
    "Other Non-Cash Items": "otherNonCashItems",
    "Net Cash from Operating Activities": "netCashProvidedByOperatingActivities",
    "Capital Expenditure": "capitalExpenditure",
    "Acquisitions": "acquisitionsNet",
    "Purchases of Investments": "purchasesOfInvestments",
    "Sales/Maturities of Investments": "salesMaturitiesOfInvestments",
    "Other Investing Activities": "otherInvestingActivities",
    "Net Cash from Investing Activities": "netCashProvidedByInvestingActivities",
    "Net Debt Issuance": "netDebtIssuance",
    "Common Stock Issuance": "commonStockIssuance",
    "Stock Repurchase": "commonStockRepurchased",
    "Dividends Paid": "netDividendsPaid",
    "Other Financing Activities": "otherFinancingActivities",
    "Net Cash from Financing Activities": "netCashProvidedByFinancingActivities",
    "Effect of Forex Changes on Cash": "effectOfForexChangesOnCash",
    "Net Change in Cash": "netChangeInCash",
    "Free Cash Flow": "freeCashFlow",
}
# label (Croissance) -> champ growth FMP correspondant, cherché dans
# income_statement_growth SAUF freeCashFlow/dividende (cashflow_growth)
GROWTH_FIELD_MAP = {
    "Chiffre d'affaires": ("income_statement_growth", "growthRevenue"),
    "EBITDA": ("income_statement_growth", "growthEBITDA"),
    "Résultat net": ("income_statement_growth", "growthNetIncome"),
    "BPA (EPS)": ("income_statement_growth", "growthEPS"),
    "Free Cash Flow": ("cashflow_growth", "growthFreeCashFlow"),
    # Pas de champ "growthDividendsPaid par action" côté FMP — ce champ existe seulement
    # au niveau du flux total (netDividendsPaid, en dollars, signe négatif = sortie de
    # cash), qui donnait un résultat incohérent une fois recombiné avec pct()/cagr()
    # calculés sur des valeurs négatives (total et TCAC de signes contradictoires, bug
    # trouvé en testant sur KO). Le dividende PAR ACTION est reconstruit à la main
    # depuis la catégorie "dividends" (voir dividend_per_share_by_year()) — géré à part,
    # absent de ce dict.
}
RAW_FIELD_FOR_TOTAL = {
    "Chiffre d'affaires": ("income_statement", "revenue"),
    "EBITDA": ("income_statement", "ebitda"),
    "Résultat net": ("income_statement", "netIncome"),
    "BPA (EPS)": ("income_statement", "eps"),
    "Free Cash Flow": ("cash_flow", "freeCashFlow"),
}

# Statistiques (dernier exercice annuel connu) : label -> (catégorie, champ FMP, format).
# "frac" = fraction 0-1 à multiplier par 100 (ex. 0.61 -> "61,0%"), "pctdirect" = déjà en
# points de pourcentage côté FMP (ex. dividendYieldPercentage = 2.92 -> "2,92%", PAS
# 292% — vérifié en lisant la valeur brute sur KO avant d'écrire ce mapping, voir piège
# CLAUDE.md #14 sur ne jamais supposer un format sans vérifier), "x" = multiple simple
# (ex. P/E = 22,9x), "num" = nombre brut sans unité.
STATS_FIELD_MAP = {
    "Valorisation": [
        ("P/E", "ratios", "priceToEarningsRatio", "x"),
        ("P/FCF", "ratios", "priceToFreeCashFlowRatio", "x"),
        ("EV/EBITDA", "key_metrics", "evToEBITDA", "x"),
        ("P/B", "ratios", "priceToBookRatio", "x"),
        ("P/S", "ratios", "priceToSalesRatio", "x"),
    ],
    "Rentabilité": [
        ("Marge brute", "ratios", "grossProfitMargin", "frac"),
        ("Marge opérationnelle", "ratios", "operatingProfitMargin", "frac"),
        ("Marge nette", "ratios", "netProfitMargin", "frac"),
        ("ROE", "key_metrics", "returnOnEquity", "frac"),
        ("ROIC", "key_metrics", "returnOnInvestedCapital", "frac"),
    ],
    "Santé financière": [
        ("Dette nette / EBITDA", "key_metrics", "netDebtToEBITDA", "x"),
        ("Current Ratio", "ratios", "currentRatio", "x"),
        ("Quick Ratio", "ratios", "quickRatio", "x"),
        ("Couverture des intérêts", "ratios", "interestCoverageRatio", "x"),
    ],
    "Dividende": [
        ("Rendement", "ratios", "dividendYieldPercentage", "pctdirect"),
        ("Payout Ratio", "ratios", "dividendPayoutRatio", "frac"),
        # "CAGR Dividende 5a" n'est pas dans ratios/key_metrics — repris tel quel du
        # calcul déjà fait dans build_growth() (dividende par action reconstruit depuis
        # les versements réels, voir dividend_per_share_by_year), ajouté après coup dans
        # build_stats() plutôt que dupliqué ici.
    ],
}

OUTPUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"


def rows_for(conn, category, symbol, period="annual", limit=50):
    cur = conn.cursor()
    cur.execute(
        "SELECT payload FROM raw_data WHERE category=? AND symbol=? AND (period=? OR period IS NULL) ORDER BY item_date ASC",
        (category, symbol, period),
    )
    all_rows = [json.loads(r[0]) for r in cur.fetchall()]
    return all_rows[-limit:]


def build_statement(rows, field_map, quarterly=False):
    years = [
        (r.get("fiscalYear") or r.get("date", "")[:4]) + (f" {r.get('period')}" if quarterly and r.get("period") else "")
        for r in rows
    ]
    table = []
    for label, field in field_map.items():
        values = [r.get(field) if field else None for r in rows]
        table.append({"label": label, "values": values})
    return {"years": years, "rows": table}


def pct(a, b):
    if a is None or b is None or b == 0:
        return None
    return (a - b) / abs(b)


def growth_series_from_annual(values):
    """values = liste ordonnée (plus ancien -> plus récent) de niveaux annuels bruts,
    positifs (prix/dividende, jamais un flux de trésorerie signé) -> (yoy[4], total, cagr)."""
    values = values[-5:]
    yoy = []
    for i in range(1, len(values)):
        yoy.append(pct(values[i], values[i - 1]))
    while len(yoy) < 4:
        yoy.insert(0, None)
    total = pct(values[-1], values[0]) if len(values) >= 2 else None
    cagr = None
    n_years = len(values) - 1
    if len(values) >= 2 and values[0] not in (None, 0) and values[0] > 0 and values[-1] is not None and n_years > 0:
        cagr = (values[-1] / values[0]) ** (1 / n_years) - 1
    return yoy, total, cagr


def dividend_per_share_by_year(conn, symbol, n_years=5):
    """Somme des dividendes versés (adjDividend) par année calendaire — les dividendes
    n'ont pas de "fiscalYear" propre comme les états financiers, seulement des dates de
    versement, donc regroupés par année civile plutôt que par exercice fiscal."""
    cur = conn.cursor()
    cur.execute(
        "SELECT payload FROM raw_data WHERE category='dividends' AND symbol=? ORDER BY item_date ASC",
        (symbol,),
    )
    by_year = {}
    for (payload,) in cur.fetchall():
        item = json.loads(payload)
        date = item.get("date") or ""
        if len(date) < 4:
            continue
        year = date[:4]
        amount = item.get("adjDividend", item.get("dividend"))
        if amount is None:
            continue
        by_year[year] = by_year.get(year, 0) + amount
    years = sorted(by_year.keys())[:-1]  # écarte l'année en cours (probablement incomplète)
    return [by_year[y] for y in years[-n_years:]]


def build_growth(conn, symbol):
    rows = []
    for label, (growth_cat, growth_field) in GROWTH_FIELD_MAP.items():
        growth_rows = rows_for(conn, growth_cat, symbol, limit=4)  # 4 YoY = 5 exercices
        yoy = [r.get(growth_field) for r in growth_rows]
        raw_cat, raw_field = RAW_FIELD_FOR_TOTAL[label]
        raw_rows = rows_for(conn, raw_cat, symbol, limit=5)
        total = None
        cagr = None
        if len(raw_rows) >= 2:
            first, last = raw_rows[0].get(raw_field), raw_rows[-1].get(raw_field)
            total = pct(last, first)
            n_years = len(raw_rows) - 1
            if first not in (None, 0) and last is not None and (last / first) > 0 and n_years > 0:
                cagr = (last / first) ** (1 / n_years) - 1
        rows.append({"label": label, "yoy": yoy, "total": total, "cagr": cagr})

    # Dividende par action : reconstruit depuis les versements bruts (voir docstring de
    # dividend_per_share_by_year), pas depuis un champ "growth" FMP au niveau du flux
    # total signé — voir commentaire sur GROWTH_FIELD_MAP.
    div_values = dividend_per_share_by_year(conn, symbol)
    div_yoy, div_total, div_cagr = growth_series_from_annual(div_values)
    rows.append({"label": "Dividende par action", "yoy": div_yoy, "total": div_total, "cagr": div_cagr})
    return rows


def fmt_stat(value, kind):
    if value is None:
        return None
    if kind == "frac":
        return value * 100  # app.js applique déjà "%"+2 décimales sur une valeur en points
    if kind == "pctdirect":
        return value  # déjà en points de pourcentage côté FMP, ne pas re-multiplier
    return value  # "x" / "num" : valeur brute, app.js ajoute juste "x" ou rien


def build_stats(conn, symbol, div_cagr):
    """Dernier exercice ANNUEL connu de ratios/key_metrics — pas de TTM, pour rester
    cohérent avec le reste de la page (états financiers eux aussi en annuel)."""
    groups = {}
    for title, items in STATS_FIELD_MAP.items():
        cat_cache = {}
        out_items = {}
        for label, category, field, kind in items:
            if category not in cat_cache:
                rows = rows_for(conn, category, symbol, limit=1)
                cat_cache[category] = rows[-1] if rows else {}
            out_items[label] = fmt_stat(cat_cache[category].get(field), kind)
        groups[title] = out_items
    groups.setdefault("Dividende", {})["CAGR Dividende 5a"] = (div_cagr * 100) if div_cagr is not None else None
    return groups


def build_revenue_segmentation(conn, symbol, category):
    """revenue_segmentation_geo/product — chaque ligne FMP a une forme différente des
    états financiers : {fiscalYear, date, data:{libellé_libre: montant}}, le jeu de
    libellés n'est PAS fixe d'une entreprise à l'autre (contrairement à
    FIELD_MAP_IS/BS/CF) donc pas de mapping de champs ici, juste l'union des libellés
    rencontrés sur les exercices disponibles. Vide (pas de banner ici) pour une
    entreprise qui ne segmente pas son CA dans ses dépôts — géré côté app.js comme un
    autre bloc "en attente", jamais une erreur bloquante."""
    rows = rows_for(conn, category, symbol, limit=50)
    if not rows:
        return None
    years = [r.get("fiscalYear") or (r.get("date") or "")[:4] for r in rows]
    labels = []
    for r in rows:
        for label in (r.get("data") or {}).keys():
            if label not in labels:
                labels.append(label)
    series = {label: [(r.get("data") or {}).get(label) for r in rows] for label in labels}
    return {"years": years, "series": series}


def build_charts_history(conn, symbol):
    """Alimente les 9 graphiques historiques "classiques" de l'onglet Analyse (Dividende,
    CA, Marge op./ROIC, FCF/action, P/FCF, OCF/action, Actions, Dette/OCF, Trésorerie) —
    normalement sourcés depuis le Google Sheet (colonnes COL, voir app.js/CLAUDE.md).
    Demande explicite : les basculer sur FMP QUAND l'entreprise a été exportée, jamais
    via un appel API direct depuis le navigateur ("pas avec l'API, juste avec les
    données qui seront extraites") — ce fichier JSON pré-généré EST ce mécanisme.

    Champs nommés à l'IDENTIQUE des colonnes Sheet consommées par
    buildHistoricalChartConfig() côté app.js (hist[i].dividende, .payoutRatio, .ca...)
    pour pouvoir remplacer `hist` par ce tableau SANS toucher au code de rendu des
    graphiques — seule la source change, pas la fonction qui les dessine.
    Unités alignées sur celles déjà utilisées par le Sheet (vérifiées via le code JS,
    pas devinées) : ca/actions en MILLIONS (le graphique CA divise par 1000 pour
    afficher des Md€, celui des actions affiche direct en "M"), margeOp/roic en POINTS
    de % (pas une fraction 0-1, le graphique ajoute juste "%" sans multiplier).
    "cashInvesti" n'a pas d'équivalent FMP direct (métrique propre au Sheet de
    l'utilisateur, pas un champ standard) — approximé par la somme des placements
    court/long terme (short+longTermInvestments), à distinguer explicitement de la
    trésorerie pure (cashAndCashEquivalents) plutôt que deviné au hasard.
    """
    is_rows = rows_for(conn, "income_statement", symbol, limit=50)
    bs_rows = rows_for(conn, "balance_sheet", symbol, limit=50)
    cf_rows = rows_for(conn, "cash_flow", symbol, limit=50)
    ratios_rows = rows_for(conn, "ratios", symbol, limit=50)
    km_rows = rows_for(conn, "key_metrics", symbol, limit=50)
    if not is_rows:
        return None

    def year_of(r):
        return r.get("fiscalYear") or (r.get("date") or "")[:4]

    years = [year_of(r) for r in is_rows]
    by_year = lambda rows: {year_of(r): r for r in rows}
    bs_by_year, cf_by_year, ratios_by_year, km_by_year = by_year(bs_rows), by_year(cf_rows), by_year(ratios_rows), by_year(km_rows)

    def pick(by_year_map, field, mult=1):
        out = []
        for y in years:
            r = by_year_map.get(y)
            v = r.get(field) if r else None
            out.append(v * mult if v is not None else None)
        return out

    dette_ocf = []
    for y in years:
        nd = (bs_by_year.get(y) or {}).get("netDebt")
        ocf = (cf_by_year.get(y) or {}).get("netCashProvidedByOperatingActivities")
        dette_ocf.append(nd / ocf if (nd is not None and ocf not in (None, 0)) else None)

    cash_investi = []
    for y in years:
        r = bs_by_year.get(y) or {}
        st, lt = r.get("shortTermInvestments"), r.get("longTermInvestments")
        cash_investi.append((st or 0) + (lt or 0) if (st is not None or lt is not None) else None)

    return {
        "years": years,
        "dividende": pick(ratios_by_year, "dividendPerShare"),
        "payoutRatio": pick(ratios_by_year, "dividendPayoutRatio", 100),
        "ca": [(r.get("revenue") / 1e6) if r.get("revenue") is not None else None for r in is_rows],
        "margeOp": pick(ratios_by_year, "operatingProfitMargin", 100),
        "roic": pick(km_by_year, "returnOnInvestedCapital", 100),
        "fcfParAction": pick(ratios_by_year, "freeCashFlowPerShare"),
        "pFcf": pick(ratios_by_year, "priceToFreeCashFlowRatio"),
        "ocfParAction": pick(ratios_by_year, "operatingCashFlowPerShare"),
        "pOcf": pick(ratios_by_year, "priceToOperatingCashFlowRatio"),
        "eps": [r.get("eps") for r in is_rows],
        "per": pick(ratios_by_year, "priceToEarningsRatio"),
        "actions": [(r.get("weightedAverageShsOut") / 1e6) if r.get("weightedAverageShsOut") is not None else None for r in is_rows],
        "detteOCF": dette_ocf,
        # Par ANNÉE (via bs_by_year), pas positionnel sur bs_rows — balance_sheet peut ne
        # pas avoir exactement les mêmes exercices qu'income_statement (piège d'alignement
        # déjà rencontré ailleurs dans ce projet, voir CLAUDE.md).
        "cash": [((bs_by_year.get(y) or {}).get("cashAndCashEquivalents") / 1e6) if (bs_by_year.get(y) or {}).get("cashAndCashEquivalents") is not None else None for y in years],
        "cashInvesti": [v / 1e6 if v is not None else None for v in cash_investi],
    }


def latest_dcf(conn, symbol, category):
    rows = rows_for(conn, category, symbol, limit=1)
    if not rows:
        return None
    row = rows[-1]
    return {"value": row.get("dcf"), "stockPrice": row.get("Stock Price"), "date": row.get("date")}


def export_symbol(conn, symbol):
    income_rows = rows_for(conn, "income_statement", symbol)
    balance_rows = rows_for(conn, "balance_sheet", symbol)
    cashflow_rows = rows_for(conn, "cash_flow", symbol)
    # Trimestriel : fenêtre plus courte (20 trimestres = 5 ans) que l'annuel — un tableau
    # à 40 colonnes trimestrielles (10 ans) serait illisible, et le trimestriel sert
    # surtout à repérer une tendance RÉCENTE, pas un historique profond (déjà couvert
    # par l'annuel). Bouton "Trimestriel" jusqu'ici décoratif (aucune donnée derrière,
    # aucun gestionnaire de clic côté app.js) — activé maintenant que les données
    # existent déjà (import déjà fait avec periods=["annual","quarter"]).
    income_q = rows_for(conn, "income_statement", symbol, period="quarter", limit=20)
    balance_q = rows_for(conn, "balance_sheet", symbol, period="quarter", limit=20)
    cashflow_q = rows_for(conn, "cash_flow", symbol, period="quarter", limit=20)
    growth_rows = build_growth(conn, symbol)
    div_row = next((r for r in growth_rows if r["label"] == "Dividende par action"), None)

    out = {
        "symbol": symbol,
        "incomeStatement": build_statement(income_rows, FIELD_MAP_IS),
        "balanceSheet": build_statement(balance_rows, FIELD_MAP_BS),
        "cashFlow": build_statement(cashflow_rows, FIELD_MAP_CF),
        "incomeStatementQ": build_statement(income_q, FIELD_MAP_IS, quarterly=True),
        "balanceSheetQ": build_statement(balance_q, FIELD_MAP_BS, quarterly=True),
        "cashFlowQ": build_statement(cashflow_q, FIELD_MAP_CF, quarterly=True),
        "growth": growth_rows,
        "stats": build_stats(conn, symbol, div_row["cagr"] if div_row else None),
        "dcf": latest_dcf(conn, symbol, "dcf"),
        "dcfLevered": latest_dcf(conn, symbol, "dcf_levered"),
        "revenueGeo": build_revenue_segmentation(conn, symbol, "revenue_segmentation_geo"),
        "revenueProduct": build_revenue_segmentation(conn, symbol, "revenue_segmentation_product"),
        "chartsHistory": build_charts_history(conn, symbol),
    }

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    dest = OUTPUT_DIR / f"documents-{symbol}.json"
    dest.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    return dest, len(income_rows)


def all_symbols_with_data(conn):
    """Tout symbole ayant au moins un compte de résultat importé — source de vérité
    unique pour savoir "qui a des données exportables", pas une liste à tenir à jour
    séparément (resolved_tickers*.json ne couvre qu'un lot à la fois)."""
    cur = conn.cursor()
    cur.execute("SELECT DISTINCT symbol FROM raw_data WHERE category='income_statement'")
    return sorted(r[0] for r in cur.fetchall())


def main():
    conn = db.get_connection()
    if "--batch" in sys.argv:
        symbols = all_symbols_with_data(conn)
        print(f"=== Export en lot : {len(symbols)} entreprise(s) ===")
        for i, symbol in enumerate(symbols, 1):
            dest, n_years = export_symbol(conn, symbol)
            print(f"  [{i}/{len(symbols)}] {symbol} -> {dest.name} ({n_years} exercice(s))")
        print(f"\nTerminé : {len(symbols)} fichier(s) écrits dans {OUTPUT_DIR}")
    else:
        symbol = sys.argv[1] if len(sys.argv) > 1 else "KO"
        dest, n_years = export_symbol(conn, symbol)
        print(f"Écrit : {dest} ({n_years} exercice(s))")
    conn.close()


if __name__ == "__main__":
    main()
