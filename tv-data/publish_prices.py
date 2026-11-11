"""Prépare pour le site public (lecture seule, sans serveur local) les données TradingView de l'onglet Analyse :
  - data/public/prices/<SYMBOLE>.json : clôtures HEBDOMADAIRES depuis 2006 (dernier cours de chaque semaine) ;
  - data/public/logos.json : { "EXCHANGE:TICKER": "https://s3-symbol-logo.tradingview.com/<logoid>--big.svg" }.
Appelé par le serveur local (static-server.ps1, /api/publish/go) au clic sur « 🌐 Publier en ligne ».
Usage : python publish_prices.py --symbols EURONEXT:TTE,NASDAQ:MSFT --out <dossier data/public> [--cache <dossier>]
Sortie : une ligne JSON {"ok":true,"prices":N,"logos":M,"errors":{...}}.
"""
import argparse, json, os, re, subprocess, sys, urllib.request, datetime as dt

HERE = os.path.dirname(os.path.abspath(__file__))


def safe(sym):
    return re.sub(r'[^A-Za-z0-9_.-]', '_', sym)


def logoid(sym):
    url = 'https://scanner.tradingview.com/symbol?symbol=' + urllib.parse.quote(sym) + '&fields=logoid&no_404=true'
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=10) as r:
        d = json.loads(r.read().decode('utf-8') or '{}')
    return d.get('logoid')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--symbols', required=True)
    ap.add_argument('--out', required=True)
    ap.add_argument('--cache', default='')
    a = ap.parse_args()
    syms = [s for s in a.symbols.split(',') if re.match(r'^[A-Za-z0-9_.!&-]{1,24}:[A-Za-z0-9_.!&-]{1,24}$', s)]
    pdir = os.path.join(a.out, 'prices')
    os.makedirs(pdir, exist_ok=True)
    cmd = [sys.executable, os.path.join(HERE, 'tv_history.py'), '--symbols', ','.join(syms), '--from', '2006-01-01', '--ttl', '43200']
    if a.cache:
        cmd += ['--cache', a.cache]
    out = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', timeout=900).stdout.strip()
    j = json.loads(out) if out.startswith('{') else {'ok': False, 'data': {}, 'errors': {'_': 'historique indisponible'}}
    errors = dict(j.get('errors') or {})
    n = 0
    for sym, d in (j.get('data') or {}).items():
        weeks = {}
        for ts, close in d.get('bars') or []:
            if close is None:
                continue
            day = dt.datetime.fromtimestamp(int(ts), dt.timezone.utc).date()
            y, w, _ = day.isocalendar()
            weeks[(y, w)] = [int(ts), round(float(close), 4)]
        pts = [weeks[k] for k in sorted(weeks)]
        if len(pts) < 10:
            continue
        with open(os.path.join(pdir, safe(sym) + '.json'), 'w', encoding='utf-8') as f:
            json.dump({'symbol': sym, 'ccy': d.get('ccy'), 'name': d.get('name'), 'w': pts}, f, separators=(',', ':'))
        n += 1
    logos_path = os.path.join(a.out, 'logos.json')
    try:
        with open(logos_path, encoding='utf-8') as f:
            logos = json.load(f)
    except Exception:
        logos = {}
    for sym in syms:
        if sym in logos:
            continue
        try:
            lid = logoid(sym)
            if lid:
                logos[sym] = 'https://s3-symbol-logo.tradingview.com/' + lid + '--big.svg'
        except Exception as e:
            errors[sym + ' (logo)'] = str(e)[:80]
    with open(logos_path, 'w', encoding='utf-8') as f:
        json.dump(logos, f, separators=(',', ':'))
    print(json.dumps({'ok': True, 'prices': n, 'logos': len(logos), 'errors': errors}, separators=(',', ':')))


if __name__ == '__main__':
    import urllib.parse
    main()
