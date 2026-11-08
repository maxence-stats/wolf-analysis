"""Historique des dividendes par action (ex-dates) depuis Yahoo Finance (app gratuite, sans clé).

TradingView n'expose pas l'historique du dividende par action : c'est la SEULE donnée qui ne vient pas de
TradingView (demande de l'utilisateur : « sur une app gratuite de confiance »). Écrit tv-data/raw-div/<slug>.json
sous la forme [{"d": "AAAA-MM-JJ", "a": montant}], montants split-ajustés, dans la devise de cotation.

Usage : python fetch_dividends.py            # toutes les entreprises de universe.json
        python fetch_dividends.py Airbus     # une seule
"""
import json, os, sys, time, urllib.request, urllib.parse, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'raw-div')
os.makedirs(OUT, exist_ok=True)


def slug(nom):
    return nom


def fetch(yahoo_symbol):
    url = ('https://query1.finance.yahoo.com/v8/finance/chart/' + urllib.parse.quote(yahoo_symbol)
           + '?range=max&interval=1mo&events=div')
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.load(r)
    res = (j.get('chart') or {}).get('result')
    if not res:
        raise RuntimeError('réponse vide : ' + str((j.get('chart') or {}).get('error')))
    meta = res[0].get('meta', {})
    divs = (res[0].get('events') or {}).get('dividends') or {}
    rows = []
    for v in divs.values():
        d = (datetime.datetime(1970, 1, 1) + datetime.timedelta(seconds=v['date'])).strftime('%Y-%m-%d')   # sûr pour les dates < 1970 (Windows)
        rows.append({'d': d, 'a': float(v['amount'])})
    rows.sort(key=lambda x: x['d'])
    return rows, meta.get('currency')


def main():
    uni = json.load(open(os.path.join(HERE, 'universe.json'), encoding='utf-8'))
    only = sys.argv[1:]
    for nom, u in uni.items():
        if only and nom not in only:
            continue
        ysym = u.get('yahoo')
        if not ysym:
            print('  [--]', nom, ': pas de symbole Yahoo')
            continue
        try:
            rows, cur = fetch(ysym)
            json.dump({'yahoo': ysym, 'currency': cur, 'dividends': rows},
                      open(os.path.join(OUT, slug(nom) + '.json'), 'w', encoding='utf-8'), ensure_ascii=False)
            print('  [OK]', nom, ysym, len(rows), 'dividendes,', cur, '| dernier', rows[-1] if rows else None)
        except Exception as e:
            print('  [KO]', nom, ysym, ':', e)
        time.sleep(0.6)


if __name__ == '__main__':
    main()
