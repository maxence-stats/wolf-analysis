"""
Exporte l'historique quotidien des taux de change contre l'EURO vers data/fx-{DEVISE}.json,
pour valoriser en euros les positions du Portefeuille IA (site 100% statique : aucun appel
FMP depuis le navigateur, la clé reste côté Python).

Format : [{"t":"2026-09-18","c":1.14863}, ...] trié par date croissante, où c = nombre
d'unités de DEVISE pour 1 EURO (EURUSD = 1,1486 -> 1 EUR = 1,1486 USD). Valeur en euros
d'un montant M en devise = M / c. Devises de BASE uniquement (GBP, ZAR, KWD... jamais les
sous-unités GBp/ZAc/KWF : le diviseur est appliqué en amont, voir data/symbols-meta.json).

Source : endpoint FMP /historical-price-eod/full sur la paire EUR{DEVISE} (vérifié sur le
plan actuel : USD, GBP, CHF, JPY, DKK, SAR, AED, RUB...). Repli si la paire directe manque :
pivot USD, EUR{DEVISE} = EURUSD x USD{DEVISE}. Historique demandé depuis 2010 (FMP plafonne
une réponse à 5 000 lignes, largement suffisant pour ~16 ans de jours ouvrés).

Exclu de git (données FMP, CGU) — voir .gitignore.

Usage :
    python export_fx.py                # toutes les devises de data/symbols-meta.json + USD
    python export_fx.py USD GBP CHF    # seulement celles-ci
"""
import json
import pathlib
import sys

import config
import fmp_client

DATA_DIR = pathlib.Path(__file__).resolve().parent.parent / "data"
FX_FROM = "2010-01-01"


def fetch_eod(symbol, from_date=FX_FROM):
    """Clôtures quotidiennes [{t,c}] triées par date croissante, ou None si indisponible."""
    res = fmp_client.fetch("/historical-price-eod/full", symbol, {"from": from_date})
    if res.status != "ok" or not isinstance(res.data, list):
        return None
    rows = [{"t": r["date"], "c": float(r["close"])} for r in res.data
            if r.get("date") and r.get("close") is not None and float(r["close"]) > 0]
    rows.sort(key=lambda r: r["t"])
    return rows or None


def write_series(name, rows):
    dest = DATA_DIR / name
    dest.write_text(json.dumps(rows, separators=(",", ":")), encoding="utf-8")
    return dest


def fx_via_usd(ccy, eurusd_rows):
    usd_ccy = fetch_eod(f"USD{ccy}")
    if not usd_ccy or not eurusd_rows:
        return None
    # Alignement par date, report de la dernière valeur EURUSD connue (jours fériés différents).
    out, j, last = [], 0, None
    for r in usd_ccy:
        while j < len(eurusd_rows) and eurusd_rows[j]["t"] <= r["t"]:
            last = eurusd_rows[j]["c"]
            j += 1
        if last:
            out.append({"t": r["t"], "c": round(last * r["c"], 6)})
    return out or None


def export_fx_ccy(ccy, eurusd_cache=None):
    """Écrit data/fx-{ccy}.json. Renvoie (nombre de points, source) — (0, None) si impossible."""
    if ccy == "EUR":
        return 0, None
    rows = fetch_eod(f"EUR{ccy}")
    source = "direct"
    if not rows:
        eurusd = eurusd_cache if eurusd_cache is not None else fetch_eod("EURUSD")
        rows = fx_via_usd(ccy, eurusd)
        source = "pivot USD"
    if not rows:
        return 0, None
    write_series(f"fx-{ccy}.json", rows)
    return len(rows), source


def currencies_from_meta():
    meta_path = DATA_DIR / "symbols-meta.json"
    ccys = {"USD"}
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        ccys |= {m["c"] for m in meta.values() if m.get("c")}
    ccys.discard("EUR")
    return sorted(ccys)


def main():
    config.require_api_key()
    ccys = [a.upper() for a in sys.argv[1:]] or currencies_from_meta()
    eurusd = fetch_eod("EURUSD")
    ok = 0
    for ccy in ccys:
        n, source = export_fx_ccy(ccy, eurusd)
        print(f"  {ccy}: " + (f"{n} points ({source})" if n else "INDISPONIBLE (exclure du sélecteur)"))
        ok += 1 if n else 0
    print(f"\n{ok}/{len(ccys)} devises exportées dans {DATA_DIR}")


if __name__ == "__main__":
    main()
