# Écrit les données BRUTES TradingView des entreprises pilotes (copiées telles quelles des réponses du
# connecteur TradingView : get_financial_history fy, get_ohlcv 12M, get_symbol_data_batch).
# Les montants sont en unités de la devise (pas en millions) dans le fichier brut.
import json, os

HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
os.makedirs(RAW, exist_ok=True)

def M(arr):  # millions -> unités
    return [round(x * 1e6, 2) for x in arr]

def save(slug, obj):
    with open(os.path.join(RAW, slug + '.json'), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False)

# ---------------- Airbus ----------------
save('Airbus', {
  'tv': 'EURONEXT:AIR', 'fetchedAt': '2026-10-27',
  'fy': {'labels': list(range(2010, 2026)),
    'ebitda': M([2454,2986,3769,4139,5061,4984,2406,3925,5579,3949,3495,7158,7968,6508,7657,8369]),
    'eps': [0.6819,1.27,1.46,1.85,2.99,3.42,1.29,3.0386,3.9196,-1.7528,-1.4467,5.3607,5.3913,4.7977,5.3502,6.6014],
    'fcf': M([2787,2142,616,-943,155,710,1501,2104,224,1623,-7179,2790,3924,3354,3929,4418]),
    'netIncome': M([553,1033,1197,1473,2343,2696,995,2361,3054,-1362,-1133,4213,4247,3789,4232,5221]),
    'revenue': M([45752,49128,56480,57567,60713,64450,66581,59022,63707,70478,49912,52149,58763,65446,69230,73420]),
    'totalDebt': M([4278,10630,4779,6603,7351,9125,10478,9946,7641,10148,17095,15040,12773,13591,14279,14249])},
  'annual': {'firstYear': 1999,
    'c': [21.79,23.66,13.64,9.85,18.85,21.39,31.9,26.1,21.83,12.03,14.085,17.44,24.15,29.5,55.81,41.35,62,62.84,83,83.96,130.48,89.78,112.36,111.02,139.78,154.78,198.4,192.74]},
  'snapshot': {'description': 'Airbus SE', 'exchange': 'EURONEXT', 'currency': 'EUR', 'sector': 'Electronic Technology', 'industry': 'Aerospace & Defense',
    'close': 192.74, 'market_cap_basic': 153072329630, 'price_earnings_ttm': 25.634409746236102, 'earnings_per_share_diluted_ttm': 7.5188,
    'price_free_cash_flow_ttm': 30.532230093402585, 'free_cash_flow_per_share_ttm': 6.312673506336746, 'free_cash_flow_ttm': 4981000000,
    'neg_capital_expenditures_ttm': 4090000000, 'total_revenue_ttm': 76986000000, 'ebitda_ttm': 9426000000,
    'dps_common_stock_prim_issue_fy': 3.2, 'dividends_yield': 1.6546018614270943, 'return_on_invested_capital_fy': 16.0330426237563,
    'operating_margin': 8.07029849583041, 'net_margin_ttm': 7.71438962928325, 'total_shares_outstanding_fundamental': 791480806,
    'cash_n_short_term_invest_fq': 12294000000, 'total_debt_fq': 14276000000, 'net_debt_fq': 1982000000}
})

# ---------------- Microsoft ----------------
save('Microsoft', {
  'tv': 'NASDAQ:MSFT', 'fetchedAt': '2026-10-27',
  'fy': {'labels': list(range(2011, 2026)),
    'ebitda': M([29819,30858,30118,32227,33043,26614,36631,44827,54218,65259,80816,97843,103584,131720,162681]),
    'eps': [2.69,2,2.58,2.63,1.48,2.1,3.25,2.13,5.06,5.7635,8.0535,9.647,9.6843,11.8002,13.6413],
    'fcf': M([24639,29321,24576,26746,23724,24982,31378,32252,38260,45234,56118,65149,59475,74071,71611]),
    'netIncome': M([23150,16978,21863,22074,12193,16798,25489,16571,39240,44281,61271,72738,72361,88136,101832]),
    'revenue': M([69950,73750,77654,86729,92972,84695,96016,110175,125502,143015,168088,198270,211915,245122,281724]),
    'totalDebt': M([11921,11944,15600,22645,35292,54247,95527,87508,86455,82110,82278,78400,79441,97852,112184])},
  'annual': {'firstYear': 1997,
    'c': [16.15625,34.671875,58.375,21.6875,33.125,25.85,27.37,26.72,26.14999,29.86,35.60001,19.44,30.48,27.91,25.96001,26.7097,37.41,46.45,55.48,62.14,85.54,101.57,157.7,222.42,336.32,239.82,376.04,421.5,483.62,532.51]},
  'snapshot': {'description': 'Microsoft Corporation', 'exchange': 'NASDAQ', 'currency': 'USD', 'sector': 'Technology Services', 'industry': 'Packaged Software',
    'close': 532.405, 'market_cap_basic': 3953866296786.8237, 'price_earnings_ttm': 29.66804863641936, 'earnings_per_share_diluted_ttm': 17.9454,
    'price_free_cash_flow_ttm': 59.15611111111111, 'free_cash_flow_per_share_ttm': 9, 'free_cash_flow_ttm': 66987000000,
    'neg_capital_expenditures_ttm': 115948000000, 'total_revenue_ttm': 331839000000, 'ebitda_ttm': 198685000000,
    'dps_common_stock_prim_issue_fy': 3.64, 'dividends_yield': 0.7360120165227187, 'return_on_invested_capital_fy': 26.8475788822893,
    'operating_margin': 46.7808184089272, 'net_margin_ttm': 40.3053890591522, 'total_shares_outstanding_fundamental': 7426430000,
    'cash_n_short_term_invest_fq': 76843000000, 'total_debt_fq': 128813000000, 'net_debt_fq': 51970000000}
})

# ---------------- Air Liquide ----------------
save('Air Liquide', {
  'tv': 'EURONEXT:AI', 'fetchedAt': '2026-10-27',
  'fy': {'labels': list(range(2010, 2026)),
    'ebitda': M([3244.9,3424.3,3650.3,3627.6,3872.9,4215.5,4611.2,5141.7,5214.8,5931.5,5927.5,6332.8,7327.7,7550,7896.5,8145.1]),
    'eps': [2.4841,2.704,2.7996,2.892,2.9211,3.0039,3.1626,3.5628,3.3667,3.5554,3.8588,4.0743,4.3518,4.8543,5.198,5.5317],
    'fcf': M([970.1,670.8,700.6,646.6,927.9,804.7,1437.9,2071.5,2305.2,1854.5,2325,2454.5,2314.8,2661.6,2596.5,2511.4]),
    'netIncome': M([1403.6,1534.9,1591.1,1640.3,1665,1756.4,1842.5,2233.3,2113.4,2241.5,2435.1,2572.2,2758.8,3078,3306.1,3517.9]),
    'revenue': M([13488,14456.9,15326.3,15225.2,15358.3,15818.5,18134.8,20349.3,21011.1,21920.1,20485.2,23334.8,29934,27607.6,27057.8,26940.2]),
    'totalDebt': M([6602,7036,7149.4,6962.6,7199,8203.4,16891.1,15027,14260.5,14730.4,13588.3,13955.7,13452.5,12111.8,12448.1,13636.9])},
  'annual': {'firstYear': 1997,
    'c': [19.67281189,24.32516623,25.87209784,30.6111396,30.32217407,24.21535901,26.9701692,26.19959306,31.30466053,38.12232789,43.14032198,30.51272658,38.70850688,47.06248356,47.53489667,51.99305882,56.23236439,62.04086931,62.52344272,65.43014435,71.56440728,73.88062827,94.57002326,100.60242173,114.89284399,109.4212605,145.5534279,142.6544028,145.6907634,174.44]},
  'snapshot': {'description': 'Air Liquide SA', 'exchange': 'EURONEXT', 'currency': 'EUR', 'sector': 'Process Industries', 'industry': 'Chemicals: Specialty',
    'close': 174.44, 'market_cap_basic': 111691829842, 'price_earnings_ttm': 31.39216815433343, 'earnings_per_share_diluted_ttm': 5.5568,
    'price_free_cash_flow_ttm': 73.06885497447955, 'free_cash_flow_per_share_ttm': 2.3873372596426474, 'free_cash_flow_ttm': 1522700000,
    'neg_capital_expenditures_ttm': 3835800000, 'total_revenue_ttm': 27045900000, 'ebitda_ttm': 8339700000.000001,
    'dps_common_stock_prim_issue_fy': 3.36364, 'dividends_yield': 1.9181284215328467, 'return_on_invested_capital_fy': 9.54976647469769,
    'operating_margin': 21.2154152755131, 'net_margin_ttm': 13.086641598172, 'total_shares_outstanding_fundamental': 636474601,
    'cash_n_short_term_invest_fq': 2061199999.9999998, 'total_debt_fq': 17258900000, 'net_debt_fq': 15197700000}
})
print('raw ok')
