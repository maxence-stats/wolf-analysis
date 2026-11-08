"""Construit data/tv-analyse.json (lu par l'onglet Analyse) à partir des données BRUTES TradingView.

Entrées  : tv-data/universe.json        (nom -> symbole TradingView, secteur, ...)
           tv-data/raw/<nom>.json        (snapshot + historique annuel + clôtures annuelles, depuis TradingView)
           tv-data/raw-div/<nom>.json    (dividendes par action, Yahoo — seule donnée hors TradingView)
Sortie   : data/tv-analyse.json          (git-ignoré : données sous licence personnelle TradingView)

AUCUNE donnée du Google Sheet n'est utilisée. Toutes les valeurs dérivées sont recalculées ici :
  actions        = résultat net / BPA          (TradingView ne donne pas l'historique du nombre d'actions)
  FCF / action   = FCF / actions
  P/FCF          = clôture de fin d'année / FCF par action
  médiane P/FCF  = médiane des P/FCF positifs sur les 10 derniers exercices
  prix juste     = FCF par action (12 mois glissants) × médiane P/FCF 10 ans
  prix cible     = prix juste × 0,8 (marge de sécurité de 20 %)
  FCFPEG         = P/FCF ÷ CAGR du FCF par action sur 5 ans (en %)
Les indicateurs sans historique TradingView (ROIC, marge opérationnelle, trésorerie, dette/OCF avant
l'exercice courant) restent null : on ne les invente pas.
"""
import json, os, statistics, datetime, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, 'data', 'tv-analyse.json')
THIS_YEAR = datetime.date.today().year
_lm = os.path.join(ROOT, 'data', 'logos-manifest.json')
LOGO_MANIFEST = json.load(open(_lm, encoding='utf-8')) if os.path.exists(_lm) else {}
MAX_MULTIPLE = 25.0
_sp = os.path.join(HERE, 'raw', '_snapshots.json')
SNAPSHOTS = json.load(open(_sp, encoding='utf-8'))['snapshots'] if os.path.exists(_sp) else {}


def safe_div(a, b):
    if a is None or b in (None, 0):
        return None
    return a / b


def cagr(new, old, years):
    """Taux de croissance annuel composé, en %, uniquement si les deux bornes sont positives."""
    if new is None or old is None or new <= 0 or old <= 0 or years <= 0:
        return None
    return ((new / old) ** (1.0 / years) - 1.0) * 100.0


def rnd(x, n=4):
    return None if x is None else round(x, n)


def LOGO_PATH(fmp_symbol):
    """Chemin du logo LOCAL (data/logos/, voir fetch_logos.py) ou chaîne vide."""
    try:
        man = LOGO_MANIFEST
    except NameError:
        return ''
    f = man.get(fmp_symbol)
    return ('data/logos/' + f) if f and os.path.exists(os.path.join(ROOT, 'data', 'logos', f)) else ''


def local_year_closes(fmp_symbol):
    """Clôtures de fin d'année déjà présentes sur le PC (archive de cours data/prices-<symbole>.json, ajustée des
    splits). Utilisée seulement pour les années PASSÉES, quand la clôture annuelle TradingView n'a pas été
    rapatriée : une clôture de fin d'année passée est un fait définitif, identique d'une source à l'autre."""
    path = os.path.join(ROOT, 'data', 'prices-%s.json' % fmp_symbol)
    if not fmp_symbol or not os.path.exists(path):
        raise FileNotFoundError("pas d archive de cours pour %s" % fmp_symbol)
    rows = json.load(open(path, encoding='utf-8'))
    last = {}
    for r in rows:
        last[int(r['t'][:4])] = r['c']          # tri croissant : la dernière valeur de l'année l'emporte
    y0, y1 = min(last), max(last)
    return {'firstYear': y0, 'c': [last.get(y) for y in range(y0, y1 + 1)]}


def build_company(nom, uni, raw, divs):
    fy = raw['fy']
    labels = fy['labels']
    snap = raw.get('snapshot') or SNAPSHOTS.get(uni['tv'])
    if snap is None:
        raise KeyError('pas de snapshot TradingView pour %s' % uni['tv'])
    annual = raw.get('annual') or local_year_closes(uni.get('fmp'))
    first_close_year = annual['firstYear']
    closes = annual['c']

    def close_of(year):
        i = year - first_close_year
        return closes[i] if 0 <= i < len(closes) else None

    # dividendes par année civile (somme des détachements de l'année)
    div_by_year = {}
    for d in (divs or []):
        y = int(d['d'][:4])
        div_by_year[y] = div_by_year.get(y, 0.0) + d['a']

    years = {}
    for k, y in enumerate(labels):
        eps = fy['eps'][k]
        ni = fy['netIncome'][k]
        shares = (ni / eps) if (eps and ni and (eps > 0) == (ni > 0)) else None   # unités (année de perte : perte / BPA négatif)
        fcf = fy['fcf'][k]
        rev = fy['revenue'][k]
        price = close_of(y)
        fcf_ps = safe_div(fcf, shares)
        years[y] = {
            'annee': y, 'prixActuel': price, 'ca': safe_div(rev, 1e6), 'eps': eps,
            'actions': safe_div(shares, 1e6), 'fcfParAction': fcf_ps,
            'pFcf': (price / fcf_ps) if (price and fcf_ps and fcf_ps > 0) else None,
            'per': (price / eps) if (price and eps and eps > 0) else None,
            'dividende': div_by_year.get(y),
        }

    ys = sorted(years)
    # P/FCF médian sur 10 exercices glissants, CAGR sur 5/10/20 ans
    def series(key):
        return {y: years[y][key] for y in ys}

    for y in ys:
        row = years[y]
        for n in (5, 10, 20):
            for key, name in (('fcfParAction', 'cagrFcf'), ('dividende', 'cagrDiv'), ('ca', 'cagrCA'), ('eps', 'cagrEps')):
                row['%s%d' % (name, n)] = cagr(row[key], years[y - n][key] if (y - n) in years else None, n)
        row['cagrActions'] = cagr(years[y - 20]['actions'] if (y - 20) in years else None, row['actions'], 20) if False else None
        window = [years[t]['pFcf'] for t in range(y - 9, y + 1) if t in years and years[t]['pFcf'] and years[t]['pFcf'] > 0]
        row['medianePFCF'] = statistics.median(window) if len(window) >= 5 else None
        row['payoutRatio'] = (row['dividende'] / row['eps'] * 100.0) if (row['dividende'] and row['eps'] and row['eps'] > 0) else None
        row['rendementDiv'] = (row['dividende'] / row['prixActuel'] * 100.0) if (row['dividende'] and row['prixActuel']) else None
        row['fcfpeg'] = (row['pFcf'] / row['cagrFcf5']) if (row['pFcf'] and row['cagrFcf5'] and row['cagrFcf5'] > 0) else None
        # CAGR du nombre d'actions : variation sur 10 ans quand disponible (négatif = rachats)
        prev = years[y - 10]['actions'] if (y - 10) in years else None
        row['cagrActions'] = cagr(row['actions'], prev, 10) if (row['actions'] and prev) else None

    # ----- ligne de l'année courante : snapshot TradingView (12 mois glissants) -----
    last_fy = ys[-1]
    cur = {'annee': THIS_YEAR}
    price = snap.get('close')
    shares_now = snap.get('total_shares_outstanding_fundamental')
    fcf_ps = snap.get('free_cash_flow_per_share_ttm')
    eps_ttm = snap.get('earnings_per_share_diluted_ttm')
    dps = snap.get('dps_common_stock_prim_issue_fy')
    window = [years[t]['pFcf'] for t in range(last_fy - 9, last_fy + 1) if t in years and years[t]['pFcf'] and years[t]['pFcf'] > 0]
    med = statistics.median(window) if len(window) >= 5 else None
    multiple = min(med, MAX_MULTIPLE) if med else None   # plafond 25x demandé par l'utilisateur (Classement/Analyse)
    juste = (fcf_ps * multiple) if (fcf_ps and fcf_ps > 0 and multiple) else None
    cible = juste * 0.8 if juste else None
    ocf_ttm = None
    if snap.get('free_cash_flow_ttm') is not None and snap.get('neg_capital_expenditures_ttm') is not None:
        ocf_ttm = snap['free_cash_flow_ttm'] + abs(snap['neg_capital_expenditures_ttm'])
    cur.update({
        'prixActuel': price, 'prixJuste': juste, 'prixCible': cible,
        'ecartValeur': ((price - juste) / juste) if (price and juste) else None,   # fraction : négatif = sous-valorisé
        'pFcf': snap.get('price_free_cash_flow_ttm'), 'fcfParAction': fcf_ps,
        'per': snap.get('price_earnings_ttm'), 'eps': eps_ttm, 'medianePFCF': med,
        'dividende': dps, 'rendementDiv': snap.get('dividends_yield'),
        'payoutRatio': (dps / eps_ttm * 100.0) if (dps and eps_ttm and eps_ttm > 0) else None,
        'ca': safe_div(snap.get('total_revenue_ttm'), 1e6),
        'margeOp': snap.get('operating_margin'), 'roic': snap.get('return_on_invested_capital_fy'),
        'cash': safe_div(snap.get('cash_n_short_term_invest_fq'), 1e6),
        'actions': safe_div(shares_now, 1e6),
        'detteNetteAction': safe_div(snap.get('net_debt_fq'), shares_now),
        'detteOCF': safe_div(snap.get('net_debt_fq'), ocf_ttm),
        'ocfParAction': safe_div(ocf_ttm, shares_now),
        'pOcf': safe_div(price, safe_div(ocf_ttm, shares_now)),
    })
    ref = years[last_fy]
    for key in ('cagrFcf5', 'cagrFcf10', 'cagrFcf20', 'cagrDiv5', 'cagrDiv10', 'cagrDiv20', 'cagrCA5', 'cagrCA10',
                'cagrCA20', 'cagrEps5', 'cagrEps10', 'cagrEps20', 'cagrActions'):
        cur[key] = ref.get(key)
    cur['fcfpeg'] = (cur['pFcf'] / cur['cagrFcf5']) if (cur['pFcf'] and cur['cagrFcf5'] and cur['cagrFcf5'] > 0) else None
    years[THIS_YEAR] = cur

    rows = []
    for y in sorted(years):
        r = years[y]
        out = {k: (rnd(v) if isinstance(v, float) else v) for k, v in r.items() }
        out['ticker'] = uni['tv']
        out['devise'] = snap.get('currency')
        out['lienImage'] = LOGO_PATH(uni.get('fmp'))
        out['secteur'] = uni.get('secteur', '')
        out['sousSecteur'] = uni.get('sousSecteur', '')
        rows.append(out)
    return {'tv': uni['tv'], 'fmp': uni.get('fmp'), 'currency': snap.get('currency'),
            'description': snap.get('description'), 'fetchedAt': raw.get('fetchedAt'), 'rows': rows}


def main():
    uni = json.load(open(os.path.join(HERE, 'universe.json'), encoding='utf-8'))
    companies, skipped = {}, []
    for nom, u in uni.items():
        rp = os.path.join(HERE, 'raw', nom + '.json')
        if not os.path.exists(rp):
            skipped.append(nom)
            continue
        raw = json.load(open(rp, encoding='utf-8'))
        dp = os.path.join(HERE, 'raw-div', nom + '.json')
        divs = json.load(open(dp, encoding='utf-8')).get('dividendes') if False else (json.load(open(dp, encoding='utf-8')).get('dividends') if os.path.exists(dp) else [])
        companies[nom] = build_company(nom, u, raw, divs)
    out = {'generatedAt': datetime.datetime.now().isoformat(timespec='seconds'), 'source': 'TradingView', 'companies': companies}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print('OK', len(companies), 'entreprises ->', OUT)
    if skipped:
        print('  sans données brutes (à récupérer via TradingView) :', len(skipped), skipped[:10])
    for nom, c in companies.items():
        cur = c['rows'][-1]
        print('  %-12s prix %s  prixJuste %s  cible %s  P/FCF %s  méd %s  div %s  ROIC %s  FCFPEG %s' % (
            nom, cur.get('prixActuel'), cur.get('prixJuste'), cur.get('prixCible'), cur.get('pFcf'), cur.get('medianePFCF'),
            cur.get('dividende'), cur.get('roic'), cur.get('fcfpeg')))


if __name__ == '__main__':
    main()
