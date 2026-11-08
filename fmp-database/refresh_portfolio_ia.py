"""
Rafraîchit les données de marché des actions DÉTENUES par les portefeuilles IA (bouton
"Actualiser" du site, via l'endpoint POST /api/ia/refresh du serveur local) :
  - historique de cours, dividendes et splits de chaque symbole jamais tradé ;
  - taux de change contre l'euro des devises concernées (+ USD, pour l'indice) ;
  - le S&P 500 de référence.
Compte ~2 appels FMP par symbole, environ une minute pour quelques dizaines de symboles
(l'ingestion complète d'une entreprise en fait ~40, voir ingest.py).

RÈGLE ABSOLUE (même patron que refresh_prices_only.py) : on met à jour LA BASE SQLITE
(replace_category_rows) puis on RÉ-EXPORTE les JSON depuis la base. Ne jamais écrire
directement dans data/prices-*.json : un futur `export_prices.py --batch` les écraserait avec
une base restée périmée. Une réponse FMP vide ou en erreur ne remplace JAMAIS les données
existantes (on garde l'ancien et on signale l'erreur).

Progression écrite dans <ia-dir>/refresh-status.json (lue par le site toutes les 3 s) :
    {"state":"running|ok|error","startedAt","updatedAt","finishedAt","done","total",
     "current","errors":[...],"message"}

Usage :
    python refresh_portfolio_ia.py [--ia-dir DOSSIER] [--symbols KO,DG.PA]
  --ia-dir  dossier contenant portefeuilles.json (défaut : ../data/portefeuille-ia)
  --symbols liste de symboles à forcer (tests) au lieu de lire portefeuilles.json
"""
import datetime
import json
import os
import pathlib
import sys

import config
import db
import fmp_client
import export_events
import export_fx
import export_benchmarks
import export_prices
from endpoints import ENDPOINTS

REPO_DATA = pathlib.Path(__file__).resolve().parent.parent / "data"
PRICE_HISTORY_FROM = "1970-01-01"


def now_iso():
    return datetime.datetime.now().astimezone().isoformat(timespec="seconds")


class Status:
    def __init__(self, path):
        self.path = pathlib.Path(path)
        self.data = {"state": "running", "startedAt": now_iso(), "done": 0, "total": 0,
                     "current": "", "errors": [], "message": ""}

    def write(self, **changes):
        self.data.update(changes)
        self.data["updatedAt"] = now_iso()
        self.path.parent.mkdir(parents=True, exist_ok=True)
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.data, ensure_ascii=False), encoding="utf-8")
        os.replace(tmp, self.path)


def arg_value(flag):
    return sys.argv[sys.argv.index(flag) + 1] if flag in sys.argv else None


def symbols_from_portfolios(ia_dir):
    path = ia_dir / "portefeuilles.json"
    if not path.exists():
        return []
    state = json.loads(path.read_text(encoding="utf-8"))
    symbols = set()
    for pf in (state.get("portfolios") or {}).values():
        for t in pf.get("trades") or []:
            if t.get("symbol"):
                symbols.add(t["symbol"])
    return sorted(symbols)


def refresh_category(conn, category, symbol, extra=None):
    """Remplace la catégorie en base UNIQUEMENT si FMP répond avec des données."""
    spec = ENDPOINTS[category]
    res = fmp_client.fetch(spec["path"], symbol, extra or {})
    if res.status == "ok":
        n = db.replace_category_rows(conn, category, symbol, None, res.data)
        db.log_fetch(conn, category, symbol, None, "ok", res.http_status, None, n)
        return True, None
    db.log_fetch(conn, category, symbol, None, res.status, res.http_status, res.error_message, None)
    if res.status == "empty":
        return True, None  # pas d'erreur : l'entreprise n'a juste pas cette donnée (ex. aucun dividende)
    return False, res.error_message or "erreur FMP"


def main():
    ia_dir = pathlib.Path(arg_value("--ia-dir") or (REPO_DATA / "portefeuille-ia"))
    status = Status(ia_dir / "refresh-status.json")
    try:
        config.require_api_key()
    except RuntimeError:
        status.write(state="error", finishedAt=now_iso(),
                     message="Clé FMP introuvable (variable d'environnement FMP_API_KEY non visible par le serveur local).")
        sys.exit(1)

    forced = arg_value("--symbols")
    symbols = [s.strip() for s in forced.split(",") if s.strip()] if forced else symbols_from_portfolios(ia_dir)

    meta_path = REPO_DATA / "symbols-meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}
    ccys = sorted(({meta[s]["c"] for s in symbols if s in meta and meta[s].get("c")} | {"USD"}) - {"EUR"})

    total = len(symbols) + len(ccys) + 1
    status.write(total=total, done=0, current="")
    done = 0
    errors = []
    conn = db.get_connection()
    try:
        for sym in symbols:
            status.write(current=sym, done=done)
            print(f"[{done + 1}/{total}] {sym}")
            for category, extra in (("price_history_daily", {"from": PRICE_HISTORY_FROM}), ("dividends", None), ("splits", None)):
                ok, err = refresh_category(conn, category, sym, extra)
                if not ok:
                    errors.append(f"{sym} ({category}) : {err}")
            export_prices.export_symbol(conn, sym)
            export_events.export_symbol(conn, sym)
            done += 1

        eurusd = export_fx.fetch_eod("EURUSD")
        for ccy in ccys:
            status.write(current=f"change EUR/{ccy}", done=done)
            print(f"[{done + 1}/{total}] change EUR/{ccy}")
            n, _ = export_fx.export_fx_ccy(ccy, eurusd)
            if not n:
                errors.append(f"change EUR/{ccy} indisponible")
            done += 1

        status.write(current="S&P 500", done=done)
        if len(export_benchmarks.export_benchmarks()) != len(export_benchmarks.BENCHMARKS):
            errors.append("indice S&P 500 indisponible")
        done += 1
    except Exception as e:  # ne jamais laisser le site sur "en cours" à vie
        status.write(state="error", finishedAt=now_iso(), errors=errors,
                     message=f"Erreur inattendue : {type(e).__name__}")
        conn.close()
        raise
    conn.close()
    status.write(state="ok", finishedAt=now_iso(), done=total, current="", errors=errors,
                 message=("Terminé avec %d avertissement(s)." % len(errors)) if errors else "Terminé.")
    print("Terminé." if not errors else f"Terminé avec {len(errors)} avertissement(s) : {errors}")


if __name__ == "__main__":
    main()
