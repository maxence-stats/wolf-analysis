# Aide à l'écriture des fichiers bruts tv-data/raw/<nom>.json (copie des réponses du connecteur TradingView).
# Les montants de fcf / netIncome / revenue sont fournis en MILLIONS de la devise (un seul chiffre après la virgule).
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, 'raw')
os.makedirs(RAW, exist_ok=True)


def add(nom, tv, y0, eps, fcf, ni, rev, first=None, closes=None, fetched='2026-10-27'):
    n = len(eps)
    assert len(fcf) == n and len(ni) == n and len(rev) == n, (nom, n, len(fcf), len(ni), len(rev))
    obj = {
        'tv': tv, 'fetchedAt': fetched,
        'fy': {'labels': list(range(y0, y0 + n)), 'eps': eps,
               'fcf': [None if x is None else x * 1e6 for x in fcf],
               'netIncome': [None if x is None else x * 1e6 for x in ni],
               'revenue': [None if x is None else x * 1e6 for x in rev]},
    }
    if closes:
        obj['annual'] = {'firstYear': first, 'c': closes}
    with open(os.path.join(RAW, nom + '.json'), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False)
    print('  raw OK', y0, '->', y0 + n - 1, '| cloture TV' if closes else '| clotures archive locale')
