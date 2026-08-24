"""Client HTTP minimal pour l'API FMP — bibliothèque standard uniquement (urllib), pas
de dépendance externe à installer. Gère : construction d'URL, throttling, retries,
et distingue explicitement 3 issues (jamais un échec silencieux) :
  - 'ok'    : réponse HTTP 200 avec au moins un élément
  - 'empty' : réponse HTTP 200 mais liste vide / null (l'entreprise n'a juste pas cette donnée)
  - 'error' : HTTP != 200, timeout, ou JSON invalide après épuisement des tentatives
"""
import json
import time
import urllib.request
import urllib.parse
import urllib.error

import config


class FmpResult:
    def __init__(self, status, data=None, http_status=None, error_message=None):
        self.status = status  # 'ok' | 'empty' | 'error'
        self.data = data
        self.http_status = http_status
        self.error_message = error_message


def build_url(path, symbol, extra_params=None):
    params = {"symbol": symbol, "apikey": config.FMP_API_KEY}
    if extra_params:
        params.update(extra_params)
    return f"{config.FMP_BASE_URL}{path}?{urllib.parse.urlencode(params)}"


def fetch(path, symbol, extra_params=None):
    """Un seul appel HTTP avec retries — ne lève jamais d'exception, renvoie toujours
    un FmpResult pour que l'appelant (discover.py/ingest.py) puisse continuer sur les
    autres symboles/endpoints même si celui-ci échoue définitivement."""
    url = build_url(path, symbol, extra_params)
    last_error = None
    last_http_status = None
    for attempt in range(1, config.MAX_RETRIES + 1):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "wolf-analysis-fmp-database/1"})
            with urllib.request.urlopen(req, timeout=config.REQUEST_TIMEOUT_SECONDS) as res:
                last_http_status = res.getcode()
                raw = res.read().decode("utf-8")
            time.sleep(config.REQUEST_DELAY_SECONDS)
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                return FmpResult("error", http_status=last_http_status, error_message="réponse non-JSON")
            if isinstance(data, dict) and ("Error Message" in data or "error" in data):
                msg = data.get("Error Message") or data.get("error")
                return FmpResult("error", http_status=last_http_status, error_message=str(msg))
            if data in (None, [], {}):
                return FmpResult("empty", data=data, http_status=last_http_status)
            return FmpResult("ok", data=data, http_status=last_http_status)
        except urllib.error.HTTPError as e:
            last_http_status = e.code
            last_error = f"HTTP {e.code}"
            if e.code == 429:  # limite de débit — on attend plus longtemps avant de réessayer
                time.sleep(config.REQUEST_DELAY_SECONDS * 8)
            elif e.code in (401, 403):
                return FmpResult("error", http_status=e.code, error_message="clé API invalide ou endpoint non inclus dans le plan")
        except urllib.error.URLError as e:
            last_error = str(e.reason)
        except TimeoutError:
            last_error = "timeout"
        time.sleep(config.REQUEST_DELAY_SECONDS * attempt)  # backoff progressif
    return FmpResult("error", http_status=last_http_status, error_message=last_error or "échec après réessais")
