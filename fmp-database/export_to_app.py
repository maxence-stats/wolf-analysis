"""
Exporte les données FMP déjà importées (voir ingest.py) vers un JSON que le site peut
charger directement pour l'onglet "Documents financiers" — UNIQUEMENT pour tester le
pipeline de bout en bout sur une entreprise (Coca-Cola) avant de l'étendre. Écrit dans
data/documents-sample-ko.json à la racine du dépôt (PAS dans fmp-database/data/, pour
suivre le même pattern que data/labo-sample-ko.json déjà en place) — ce fichier est
exclu de git (voir .gitignore, "data/labo-*.json" à étendre si le nom change) car les
CGU FMP interdisent de redistribuer les données brutes sur un dépôt public.

Les clés de l'objet JSON produit correspondent EXACTEMENT aux libellés utilisés dans
DOCUMENTS_IS_ROWS / DOCUMENTS_BS_ROWS / DOCUMENTS_CF_ROWS / DOCUMENTS_GROWTH_ROWS côté
app.js — un champ FMP introuvable ou absent devient simplement `null` (le site affiche
un tiret, pas de plantage).

Usage :
    python export_to_app.py KO
"""
import json
import sys
import pathlib

import config
import db

# label (identique à app.js) -> champ FMP dans income_statement/balance_sheet/cash_flow
FIELD_MAP_IS = {
    "Revenue": "revenue",
    "Cost of Revenue": "costOfRevenue",
    "Gross Profit": "grossProfit",
    "R&D Expenses": "researchAndDevelopmentExpenses",
    "SG&A Expenses": "sellingGeneralAndAdministrativeExpenses",
    "Operating Expenses": "operatingExpenses",
    "Operating Income": "operatingIncome",
    "Interest Expense": "interestExpense",
    "EBITDA": "ebitda",
    "Net Income": "netIncome",
    "EPS": "eps",
    "EPS Diluted": "epsDiluted",
    "Weighted Avg Shares Outstanding": "weightedAverageShsOut",
}
FIELD_MAP_BS = {
    "Cash & Cash Equivalents": "cashAndCashEquivalents",
    "Short-Term Investments": "shortTermInvestments",
    "Total Current Assets": "totalCurrentAssets",
    "Property, Plant & Equipment": "propertyPlantEquipmentNet",
    "Goodwill": "goodwill",
    "Intangible Assets": "intangibleAssets",
    "Total Non-Current Assets": "totalNonCurrentAssets",
    "Total Assets": "totalAssets",
    "Accounts Payable": "accountPayables",
    "Short-Term Debt": "shortTermDebt",
    "Total Current Liabilities": "totalCurrentLiabilities",
    "Long-Term Debt": "longTermDebt",
    "Total Non-Current Liabilities": "totalNonCurrentLiabilities",
    "Total Liabilities": "totalLiabilities",
    "Retained Earnings": "retainedEarnings",
    "Total Stockholders Equity": "totalStockholdersEquity",
}
FIELD_MAP_CF = {
    "Net Income": "netIncome",
    "Depreciation & Amortization": "depreciationAndAmortization",
    "Stock-Based Compensation": "stockBasedCompensation",
    "Change in Working Capital": "changeInWorkingCapital",
    "Net Cash from Operating Activities": "netCashProvidedByOperatingActivities",
    "Capital Expenditure": "capitalExpenditure",
    "Acquisitions": "acquisitionsNet",
    "Net Cash from Investing Activities": "netCashProvidedByInvestingActivities",
    "Debt Repayment": "netDebtIssuance",  # FMP ne distingue pas émission/remboursement en un seul champ — valeur nette faute de mieux
    "Dividends Paid": "netDividendsPaid",
    "Stock Repurchase": "commonStockRepurchased",
    "Net Cash from Financing Activities": "netCashProvidedByFinancingActivities",
    "Free Cash Flow": "freeCashFlow",
    "Net Change in Cash": "netChangeInCash",
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

OUTPUT_PATH = pathlib.Path(__file__).resolve().parent.parent / "data" / "documents-sample-ko.json"


def rows_for(conn, category, symbol, period="annual", limit=5):
    cur = conn.cursor()
    cur.execute(
        "SELECT payload FROM raw_data WHERE category=? AND symbol=? AND (period=? OR period IS NULL) ORDER BY item_date ASC",
        (category, symbol, period),
    )
    all_rows = [json.loads(r[0]) for r in cur.fetchall()]
    return all_rows[-limit:]


def build_statement(rows, field_map):
    years = [r.get("fiscalYear") or r.get("date", "")[:4] for r in rows]
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


def main():
    symbol = sys.argv[1] if len(sys.argv) > 1 else "KO"
    conn = db.get_connection()

    income_rows = rows_for(conn, "income_statement", symbol)
    balance_rows = rows_for(conn, "balance_sheet", symbol)
    cashflow_rows = rows_for(conn, "cash_flow", symbol)

    out = {
        "symbol": symbol,
        "incomeStatement": build_statement(income_rows, FIELD_MAP_IS),
        "balanceSheet": build_statement(balance_rows, FIELD_MAP_BS),
        "cashFlow": build_statement(cashflow_rows, FIELD_MAP_CF),
        "growth": build_growth(conn, symbol),
    }
    conn.close()

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"Écrit : {OUTPUT_PATH}")
    print(f"  Income Statement : {len(income_rows)} exercice(s) — {income_rows[0].get('fiscalYear') if income_rows else '?'} à {income_rows[-1].get('fiscalYear') if income_rows else '?'}")
    print(f"  Balance Sheet    : {len(balance_rows)} exercice(s)")
    print(f"  Cash Flow        : {len(cashflow_rows)} exercice(s)")
    print(f"  Croissance       : {len(out['growth'])} métrique(s)")


if __name__ == "__main__":
    main()
