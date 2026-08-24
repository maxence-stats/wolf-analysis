"""
Registre des endpoints FMP à interroger pour "tout" sur une entreprise.

IMPORTANT — à lire avant de lancer un import massif (2000-3000 tickers) :
Ce registre est un point de départ, pas une vérité gravée dans le marbre. Certaines
entrées sont "verified: True" (confirmées directement sur la documentation officielle
FMP, https://site.financialmodelingprep.com/developer/docs, lue le 2026-08-24) ;
d'autres sont "verified: False" (construites sur la convention de nommage habituelle de
l'API FMP "stable", mais pas confirmées une par une faute de clé API disponible au
moment d'écrire ce module). Le script discover.py teste CHAQUE entrée sur un vrai
symbole et rapporte ce qui répond correctement — à lancer en premier, systématiquement,
avant de faire confiance à ce fichier. Corriger ici tout endpoint qui s'avère faux/
renommé, plutôt que de deviner une seconde fois.

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
        "list_endpoint": True, "verified": False,
        "note": "Historique de capitalisation boursière."
    },
    "shares_float": {
        "path": "/shares-float", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
    },
    "stock_peers": {
        "path": "/stock-peers", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
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
        "paginate": False, "list_endpoint": True, "verified": False,
    },
    "ratios": {
        "path": "/ratios", "extra_params": {"limit": 40}, "periods": ["annual", "quarter"],
        "paginate": False, "list_endpoint": True, "verified": False,
    },
    "financial_growth": {
        "path": "/financial-growth", "extra_params": {"limit": 40}, "periods": ["annual", "quarter"],
        "paginate": False, "list_endpoint": True, "verified": False,
    },
    "enterprise_values": {
        "path": "/enterprise-values", "extra_params": {"limit": 40}, "periods": ["annual", "quarter"],
        "paginate": False, "list_endpoint": True, "verified": False,
    },
    "revenue_segmentation_product": {
        "path": "/revenue-product-segmentation", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
        "note": "CA par ligne de produit — profondeur variable selon l'entreprise."
    },
    "revenue_segmentation_geo": {
        "path": "/revenue-geographic-segmentation", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
        "note": "CA par zone géographique — alimenterait directement les graphiques 'Revenus par pays' du Cerveau numérique."
    },

    # ---- Valorisation ----------------------------------------------------------
    "dcf": {
        "path": "/discounted-cash-flow", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": True,
    },
    "dcf_levered": {
        "path": "/levered-discounted-cash-flow", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
    },

    # ---- Cours & dividendes -----------------------------------------------------
    "price_history_daily": {
        "path": "/historical-price-eod/full", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
        "note": "Ajouter from=/to= dans ingest.py pour couvrir toute la profondeur autorisée par le plan."
    },
    "dividends": {
        "path": "/dividends", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
    },
    "splits": {
        "path": "/splits", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
    },

    # ---- Analystes ---------------------------------------------------------------
    "analyst_estimates": {
        "path": "/analyst-estimates", "extra_params": {"limit": 40}, "periods": ["annual", "quarter"],
        "paginate": False, "list_endpoint": True, "verified": False,
    },
    "price_target": {
        "path": "/price-target", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
    },
    "price_target_consensus": {
        "path": "/price-target-consensus", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
    },
    "ratings_snapshot": {
        "path": "/ratings-snapshot", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
    },
    "ratings_historical": {
        "path": "/ratings-historical", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
    },

    # ---- Transcripts (Ultimate requis) -------------------------------------------
    "earnings_transcript_dates": {
        "path": "/earning-call-transcript-dates", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
        "note": "Liste les (year, quarter) disponibles — à appeler AVANT earnings_transcript pour savoir quoi demander, pas de texte inutile."
    },
    "earnings_transcript": {
        "path": "/earning-call-transcript", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
        "note": "Nécessite year= et quarter= — bouclé par ingest.py sur la liste de earnings_transcript_dates. Nécessite le plan Ultimate."
    },

    # ---- Investisseurs institutionnels / initiés (13F) -------------------------
    "institutional_ownership": {
        "path": "/institutional-ownership/symbol-ownership", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
        "note": "13F agrégé par entreprise — nécessite le plan Ultimate."
    },
    "insider_trading": {
        "path": "/insider-trading/search", "extra_params": {"limit": 100}, "periods": [], "paginate": True,
        "list_endpoint": True, "verified": False,
    },

    # ---- Gouvernance / ESG / juridique -------------------------------------------
    "executive_compensation": {
        "path": "/governance-executive-compensation", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
    },
    "esg_disclosures": {
        "path": "/esg-disclosures", "extra_params": {}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
    },
    "sec_filings": {
        "path": "/sec-filings-search/symbol", "extra_params": {"limit": 100}, "periods": [], "paginate": False,
        "list_endpoint": True, "verified": False,
    },
}

# Tickers de test — LVMH : plusieurs variantes possibles selon la façon dont FMP
# référence Euronext Paris (jamais vérifié en direct, faute de clé) ; discover.py teste
# les 3 et rapporte laquelle répond vraiment, plutôt que d'en choisir une au hasard.
TEST_SYMBOLS = {
    "Coca-Cola": ["KO"],
    "LVMH": ["MC.PA", "LVMUY", "LVMHF"],
}
