"""
Registre des endpoints FMP à interroger pour "tout" sur une entreprise.

IMPORTANT — à lire avant de lancer un import massif (2000-3000 tickers) :
Registre testé en conditions réelles sur KO le 2026-08-25 (discover.py + ingest.py,
clé au niveau plan gratuit/Basic) — "verified: True" veut dire "chemin d'URL confirmé
correct", PAS "renvoie forcément des données sur ton plan actuel" : beaucoup
d'endpoints corrects renvoient quand même une erreur HTTP 402 (Payment Required) sur
Basic. Voir fetch_log dans la base SQLite pour le détail exact par endpoint. Seul
"earnings_transcript" reste "verified: False" — jamais atteint (la liste des dates
disponibles, earnings_transcript_dates, échoue déjà en 402 sur ce plan).

Résultat du test réel sur KO (plan Basic/gratuit) : 16/38 endpoints répondent avec des
données (identité, prix EOD ~20 ans, dividendes depuis 1970, splits, DCF, notations,
segmentation du CA, rémunération des dirigeants). Les 3 états financiers (compte de
résultat, bilan, flux de trésorerie), les ratios, le growth, les estimations
analystes, les transcripts et le 13F sont TOUS bloqués en HTTP 402 sur ce plan — ce
sont pourtant les données les plus importantes pour ce projet, un plan payant
(Starter minimum, Premium/Ultimate pour la profondeur/couverture complète) sera
nécessaire pour les débloquer.

Chaque entrée :
  key            -> identifiant interne (nom de table SQLite associé, voir schema.sql)
  path           -> chemin sous FMP_BASE_URL (voir config.py), {symbol} substitué
  extra_params   -> paramètres fixes en plus de symbol/apikey (ex. period=annual)
  periods        -> si non-vide, l'entrée est appelée une fois par valeur ('annual','quarter')
  paginate       -> si True, gère une pagination page=0,1,2... jusqu'à réponse vide
  list_endpoint  -> si True, la réponse est une LISTE d'objets à insérer tels quels
  verified       -> True si confirmé sur la doc officielle FMP au moment d'écrire ce module
  note           -> précision utile (ex. "nécessite Ultimate")
"""

ENDPOINTS = {
    # ---- Identité / référence ------------------------------------------------
    "profile": {
        "path": "/profile", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
        "note": "Fiche d'identité complète (secteur, IPO, description, CEO, DCF rapide, etc.)"
    },
    "quote": {
        "path": "/quote", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
        "note": "Cotation instantanée au moment de l'appel — utile pour horodater l'import, pas un historique."
    },
    "market_cap_history": {
        "path": "/historical-market-capitalization", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
        "note": "Historique de capitalisation boursière."
    },
    "shares_float": {
        "path": "/shares-float", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
    },
    "stock_peers": {
        "path": "/stock-peers", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
        "note": "Entreprises comparables — utile pour enrichir la Comparaison du site plus tard."
    },

    # ---- États financiers (voir "Financial Statements" dans la doc) ----------
    "income_statement": {
        "path": "/income-statement", "extra_params": {"limit": 40}, "periods": ["annual", "quarter"],
        "paginate": False, "list_endpoint": True, "verified": True,
    },
    "balance_sheet": {
        "path": "/balance-sheet-statement", "extra_params": {"limit": 40}, "periods": ["annual", "quarter"],
        "paginate": False, "list_endpoint": True, "verified": True,
    },
    "cash_flow": {
        "path": "/cash-flow-statement", "extra_params": {"limit": 40}, "periods": ["annual", "quarter"],
        "paginate": False, "list_endpoint": True, "verified": True,
    },
    "key_metrics": {
        "path": "/key-metrics", "extra_params": {"limit": 40}, "periods": ["annual", "quarter"],
        "paginate": False, "list_endpoint": True, "verified": True,
    },
    "ratios": {
        "path": "/ratios", "extra_params": {"limit": 40}, "periods": ["annual", "quarter"],
        "paginate": False, "list_endpoint": True, "verified": True,
    },
    "financial_growth": {
        "path": "/financial-growth", "extra_params": {"limit": 40}, "periods": ["annual", "quarter"],
        "paginate": False, "list_endpoint": True, "verified": True,
    },
    "enterprise_values": {
        "path": "/enterprise-values", "extra_params": {"limit": 40}, "periods": ["annual", "quarter"],
        "paginate": False, "list_endpoint": True, "verified": True,
    },
    "revenue_segmentation_product": {
        "path": "/revenue-product-segmentation", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
        "note": "CA par ligne de produit — profondeur variable selon l'entreprise."
    },
    "revenue_segmentation_geo": {
        "path": "/revenue-geographic-segmentation", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
        "note": "CA par zone géographique — alimenterait directement les graphiques 'Revenus par pays' du Cerveau numérique."
    },

    # ---- Valorisation ----------------------------------------------------------
    "dcf": {
        "path": "/discounted-cash-flow", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
    },
    "dcf_levered": {
        "path": "/levered-discounted-cash-flow", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
    },

    # ---- Cours & dividendes -----------------------------------------------------
    "price_history_daily": {
        "path": "/historical-price-eod/full", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
        "note": "Ajouter from=/to= dans ingest.py pour couvrir toute la profondeur autorisée par le plan."
    },
    "dividends": {
        "path": "/dividends", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
    },
    "splits": {
        "path": "/splits", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
    },

    # ---- Analystes ---------------------------------------------------------------
    "analyst_estimates": {
        "path": "/analyst-estimates", "extra_params": {"limit": 40}, "periods": ["annual", "quarter"],
        "paginate": False, "list_endpoint": True, "verified": True,
    },
    "price_target": {
        "path": "/price-target-summary", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
        "note": "Corrigé après test réel sur KO (2026-08-25) : /price-target était une 404, le bon chemin est /price-target-summary."
    },
    "price_target_consensus": {
        "path": "/price-target-consensus", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
    },
    "ratings_snapshot": {
        "path": "/ratings-snapshot", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
    },
    "ratings_historical": {
        "path": "/ratings-historical", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
    },

    # ---- Transcripts (Ultimate requis) -------------------------------------------
    "earnings_transcript_dates": {
        "path": "/earning-call-transcript-dates", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
        "note": "Liste les (year, quarter) disponibles — à appeler AVANT earnings_transcript pour savoir quoi demander, pas de texte inutile."
    },
    "earnings_transcript": {
        "path": "/earning-call-transcript", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
        "note": "Nécessite year= et quarter= — bouclé par ingest.py sur la liste de earnings_transcript_dates. Nécessite le plan Ultimate."
    },

    # ---- Investisseurs institutionnels / initiés (13F) -------------------------
    "institutional_ownership": {
        "path": "/institutional-ownership/latest", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
        "note": "Corrigé après test réel sur KO : /institutional-ownership/symbol-ownership était une 404, le bon chemin est /institutional-ownership/latest. Confirmé bloqué (HTTP 402) sur le plan actuel, nécessite un plan supérieur."
    },
    "insider_trading": {
        "path": "/insider-trading/search", "extra_params": {"limit": 100}, "periods": [], "paginate": True,
        "list_endpoint": True, "verified": True,
    },

    # ---- Gouvernance / ESG / juridique -------------------------------------------
    "executive_compensation": {
        "path": "/governance-executive-compensation", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
    },
    "esg_disclosures": {
        "path": "/esg-disclosures", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
    },
    "sec_filings": {
        "path": "/sec-filings-search/symbol", "extra_params": {"limit": 100, "from": "1994-01-01", "to": "2026-12-31"}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
        "note": "Corrigé après test réel : from=/to= obligatoires (400 sans eux). Confirmé bloqué (HTTP 402) sur le plan actuel au-delà d'une certaine ancienneté."
    },
}

# Tickers de test — LVMH : plusieurs variantes possibles selon la façon dont FMP
# référence Euronext Paris (jamais vérifié en direct, faute de clé) ; discover.py teste
# les 3 et rapporte laquelle répond vraiment, plutôt que d'en choisir une au hasard.
TEST_SYMBOLS = {
    "Coca-Cola": ["KO"],
    "LVMH": ["MC.PA", "LVMUY", "LVMHF"],
}
