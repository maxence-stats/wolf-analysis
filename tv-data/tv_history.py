"""Historique de cours TradingView (clôtures quotidiennes NON ajustées) pour l'onglet « Mes portefeuilles ».

Appelé par le serveur local (.claude/static-server.ps1, GET /api/tv/history) : lit les barres via le websocket public
de TradingView (même source que le site, aucune donnée FMP), avec un cache disque par symbole.
Non ajusté = la quantité réellement détenue à une date × le cours de cette date = la vraie valeur (une attribution
d'actions gratuites ou un split est saisi comme opération). Sortie : JSON sur stdout.

UNE SEULE connexion websocket pour tous les symboles (l'un après l'autre) : ouvrir plusieurs connexions en parallèle
déclenche un refus « 429 Too Many Requests » de TradingView (constaté le 2026-11-08). En cas d'échec, le dernier cache
connu est renvoyé (signalé dans "errors") plutôt que rien.

  python tv_history.py --symbols EURONEXT:AI,SP:SPX --from 2026-01-01 --cache <dossier> [--ttl 1800]
"""
import argparse, json, os, random, re, string, sys, time, datetime as dt

try:
    import websocket  # paquet websocket-client
except ImportError:
    print(json.dumps({"ok": False, "error": "module Python websocket-client manquant (pip install websocket-client)"}))
    sys.exit(0)

SYM_RE = re.compile(r'^[A-Za-z0-9_.!&-]{1,24}:[A-Za-z0-9_.!&-]{1,24}$')


def _msg(func, params):
    s = json.dumps({"m": func, "p": params}, separators=(',', ':'))
    return "~m~%d~m~%s" % (len(s), s)


class TvChart:
    def __init__(self, timeout=20, adjustment="none"):
        self.timeout = timeout
        self.adjustment = adjustment
        self.ws = websocket.create_connection("wss://data.tradingview.com/socket.io/websocket?type=chart",
                                              header=["Origin: https://www.tradingview.com"], timeout=timeout)
        self.cs = "cs_" + ''.join(random.choices(string.ascii_lowercase, k=12))
        self.ws.send(_msg("set_auth_token", ["unauthorized_user_token"]))
        self.ws.send(_msg("chart_create_session", [self.cs, ""]))
        self.i = 0

    def close(self):
        try:
            self.ws.close()
        except Exception:
            pass

    def bars(self, symbol, n):
        self.i += 1
        sid, ser = "sym_%d" % self.i, "s%d" % self.i
        self.ws.send(_msg("resolve_symbol", [self.cs, sid, "=" + json.dumps({"adjustment": self.adjustment, "symbol": symbol})]))
        self.ws.send(_msg("create_series", [self.cs, ser, ser, sid, "1D", n, ""]))
        meta, bars, t0 = {}, [], time.time()
        try:
            while time.time() - t0 < self.timeout:
                raw = self.ws.recv()
                for part in re.split(r"~m~\d+~m~", raw):
                    if not part:
                        continue
                    if part.startswith('~h~'):
                        self.ws.send("~m~%d~m~%s" % (len(part), part))
                        continue
                    try:
                        j = json.loads(part)
                    except ValueError:
                        continue
                    m, p = j.get('m'), j.get('p') or []
                    if m == 'symbol_resolved' and len(p) > 2 and p[1] == sid:
                        meta = p[2]
                    elif m == 'timescale_update' and len(p) > 1 and ser in p[1]:
                        bars = [[int(b['v'][0]), b['v'][4]] for b in p[1][ser].get('s', [])]
                    elif m == 'series_completed' and len(p) > 1 and p[1] == ser:
                        return {"ccy": meta.get('currency_code') or meta.get('currency_id'), "name": meta.get('description'), "bars": bars}
                    elif m in ('symbol_error', 'series_error') and len(p) > 1 and p[1] in (sid, ser):
                        raise RuntimeError(m)
                    elif m in ('critical_error', 'protocol_error'):
                        raise RuntimeError(m)
            if bars:
                return {"ccy": meta.get('currency_code'), "name": meta.get('description'), "bars": bars}
            raise RuntimeError('délai dépassé')
        finally:
            try:
                self.ws.send(_msg("remove_series", [self.cs, ser]))
            except Exception:
                pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--symbols', required=True)
    ap.add_argument('--from', dest='frm', default='2026-01-01')
    ap.add_argument('--cache', default='')
    ap.add_argument('--adjust', choices=['none', 'splits'], default='none',
                    help="splits = cours ajustés des divisions et attributions d'actions (graphiques), none = cours réels (portefeuilles)")
    ap.add_argument('--ttl', type=int, default=1800, help='durée de validité du cache en secondes (0 = toujours relire)')
    a = ap.parse_args()
    syms = list(dict.fromkeys(s for s in a.symbols.split(',') if SYM_RE.match(s)))[:80]
    start = dt.date.fromisoformat(a.frm)
    n = max(30, int((dt.date.today() - start).days * 0.75) + 30)
    if a.cache:
        os.makedirs(a.cache, exist_ok=True)
    path_of = lambda s: os.path.join(a.cache, re.sub(r'[^A-Za-z0-9_.-]', '_', s) + ('-adj' if a.adjust == 'splits' else '') + '.json') if a.cache else None

    def read_cache(sym):
        p = path_of(sym)
        if p and os.path.exists(p):
            try:
                return json.load(open(p, encoding='utf-8'))
            except Exception:
                return None
        return None

    out, errs, todo = {}, {}, []
    for sym in syms:
        c = read_cache(sym)
        if c and time.time() - c.get('ts', 0) < a.ttl and c.get('n', 0) >= n:
            out[sym] = c['data']
        else:
            todo.append(sym)

    chart = None
    for sym in todo:
        err = None
        for attempt in range(2):
            try:
                if chart is None:
                    chart = TvChart(adjustment=a.adjust)
                d = chart.bars(sym, n)
                out[sym] = d
                if a.cache:
                    json.dump({"day": dt.date.today().isoformat(), "ts": time.time(), "n": n, "data": d}, open(path_of(sym), 'w', encoding='utf-8'))
                err = None
                break
            except Exception as e:
                err = str(e)[:160]
                if chart is not None:
                    chart.close()
                chart = None
                if 'symbol_error' in err:
                    break
                time.sleep(1.5 + attempt * 2)
        if err:
            c = read_cache(sym)
            if c:
                out[sym] = c['data']
                errs[sym] = 'cours du ' + c.get('day', '?') + ' (TradingView : ' + err + ')'
            else:
                errs[sym] = err
    if chart is not None:
        chart.close()
    print(json.dumps({"ok": True, "data": out, "errors": errs}, separators=(',', ':')))


if __name__ == '__main__':
    main()
