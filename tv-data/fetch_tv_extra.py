"""Complète tv-data/raw/<nom>.json avec des données 100 % TRADINGVIEW (règle de l'utilisateur, 2026-11-13 : plus rien par FMP).

1) Clôtures de fin d'année (clé "annual", ajustées des splits) via le websocket public de TradingView (tv_history.TvChart),
   à la place de l'ancienne archive FMP data/prices-*.json. GBX (pence) ramené en livres, comme les BPA.
2) Séries annuelles du scanner public (clé "extra") : CA, EBITDA, marge brute, résultat net, dette totale, dividende par
   action. Indice 0 = exercice fiscal_period_fy (le plus récent). Déjà en devise de cotation.
   TradingView ne publie PAS en accès public l'historique de la marge opérationnelle, du ROIC, de la trésorerie ni du
   cash-flow opérationnel (vérifié le 2026-11-13 : champs *_fy_h vides) : seules leurs valeurs ACTUELLES existent.

  python fetch_tv_extra.py            # toutes les entreprises de universe.json
  python fetch_tv_extra.py --only VINCI,Sanofi
  python fetch_tv_extra.py --closes   # refait aussi les clôtures déjà présentes
"""
import argparse, json, os, sys, time, datetime as dt, urllib.request, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from tv_history import TvChart  # noqa: E402

FIELDS = ['fiscal_period_fy', 'currency', 'total_revenue_fy_h', 'ebitda_fy_h', 'gross_profit_fy_h', 'net_income_fy_h',
          'total_debt_fy_h', 'dps_common_stock_prim_issue_fy_h']
KEYS = {'total_revenue_fy_h': 'revenue', 'ebitda_fy_h': 'ebitda', 'gross_profit_fy_h': 'grossProfit',
        'net_income_fy_h': 'netIncome', 'total_debt_fy_h': 'totalDebt', 'dps_common_stock_prim_issue_fy_h': 'dps'}


def scanner(sym):
    url = 'https://scanner.tradingview.com/symbol?symbol=%s&fields=%s&no_404=true' % (urllib.parse.quote(sym, safe=''), ','.join(FIELDS))
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    return json.loads(urllib.request.urlopen(req, timeout=20).read())


def year_closes(chart, sym):
    d = chart.bars(sym, 7000)
    div = 100.0 if (d.get('ccy') or '').upper() in ('GBX', 'GBP_PENCE') or d.get('ccy') == 'GBp' else 1.0
    last = {}
    for t, c in d['bars']:
        if c is not None:
            last[dt.datetime.utcfromtimestamp(t).year] = c / div
    if not last:
        raise RuntimeError('aucune barre')
    y0, y1 = min(last), max(last)
    return {'firstYear': y0, 'c': [last.get(y) for y in range(y0, y1 + 1)], 'src': 'tradingview', 'at': dt.date.today().isoformat()}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', default='')
    ap.add_argument('--closes', action='store_true')
    a = ap.parse_args()
    uni = json.load(open(os.path.join(HERE, 'universe.json'), encoding='utf-8'))
    only = set(s.strip() for s in a.only.split(',') if s.strip())
    chart, done, errs = None, 0, {}
    for nom, u in uni.items():
        if only and nom not in only:
            continue
        rp = os.path.join(HERE, 'raw', nom + '.json')
        if not os.path.exists(rp):
            errs[nom] = 'pas de fichier brut'
            continue
        raw = json.load(open(rp, encoding='utf-8'))
        sym = u['tv']
        try:
            j = scanner(sym)
            fy = j.get('fiscal_period_fy')
            ex = {'fyLast': int(str(fy)[:4]) if fy else None, 'currency': j.get('currency'), 'at': dt.date.today().isoformat()}
            for f, k in KEYS.items():
                ex[k] = j.get(f)
            raw['extra'] = ex
        except Exception as e:
            errs[nom] = 'scanner : ' + str(e)[:120]
        a_old = raw.get('annual')
        if a.closes or not a_old or a_old.get('src') not in ('tradingview', None) or not a_old:
            for attempt in range(2):
                try:
                    if chart is None:
                        chart = TvChart(timeout=30, adjustment='splits')
                    raw['annual'] = year_closes(chart, sym)
                    break
                except Exception as e:
                    if chart is not None:
                        chart.close()
                    chart = None
                    errs[nom] = 'cours : ' + str(e)[:120]
                    time.sleep(2)
        tmp = rp + '.tmp'
        json.dump(raw, open(tmp, 'w', encoding='utf-8'), ensure_ascii=False)
        os.replace(tmp, rp)
        done += 1
        print('ok', nom, flush=True)
        time.sleep(0.3)
    if chart is not None:
        chart.close()
    print('Terminé :', done, 'entreprises ;', len(errs), 'erreurs', json.dumps(errs, ensure_ascii=False))


if __name__ == '__main__':
    main()
