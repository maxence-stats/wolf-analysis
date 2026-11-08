"""Télécharge EN LOCAL (data/logos/) le logo TradingView des entreprises de universe.json qui n'en ont pas encore.

Même principe que le reste du site : aucun logo ne doit dépendre d'un site distant au chargement. L'identifiant du logo
(logoid) vient de TradingView ; l'image est enregistrée sous data/logos/<symbole FMP>.<ext> et ajoutée à
data/logos-manifest.json (les deux sont git-ignorés).
"""
import json, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LOGOS = os.path.join(ROOT, 'data', 'logos')
MAN = os.path.join(ROOT, 'data', 'logos-manifest.json')
UA = {'User-Agent': 'Mozilla/5.0'}


def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=20).read()


def main():
    uni = json.load(open(os.path.join(HERE, 'universe.json'), encoding='utf-8'))
    man = json.load(open(MAN, encoding='utf-8'))
    n = 0
    for nom, u in uni.items():
        sym = u['fmp']
        f = man.get(sym)
        if f and os.path.exists(os.path.join(LOGOS, f)):
            continue
        try:
            j = json.loads(get('https://scanner.tradingview.com/symbol?symbol=%s&fields=logoid&no_404=true' % urllib.request.quote(u['tv'], safe='')))
            lid = j.get('logoid')
            if not lid:
                print('  [--]', nom, ': pas de logoid'); continue
            data = get('https://s3-symbol-logo.tradingview.com/%s--big.svg' % lid)
            name = sym + '.svg'
            open(os.path.join(LOGOS, name), 'wb').write(data)
            man[sym] = name
            n += 1
            print('  [OK]', nom, '->', name, len(data), 'octets')
        except Exception as e:
            print('  [KO]', nom, e)
    json.dump(man, open(MAN, 'w', encoding='utf-8'), ensure_ascii=False, indent=0)
    print(n, 'logo(s) ajouté(s)')


if __name__ == '__main__':
    main()
