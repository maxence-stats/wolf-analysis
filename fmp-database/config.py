"""
Configuration du module fmp-database.

La clé API n'est JAMAIS écrite en dur dans un fichier suivi par git — elle est lue
depuis la variable d'environnement FMP_API_KEY. C'est volontaire : ce dossier vit dans
le même dépôt que le site Wolf Analysis, qui est poussé sur un GitHub public. Une clé
API en dur finirait tôt ou tard publiée.

Pour lancer un script :
    Windows (PowerShell) :  $env:FMP_API_KEY = "ta_cle_ici"
    Bash / Git Bash :       export FMP_API_KEY="ta_cle_ici"
Puis, dans le même terminal :
    python run_test_ko_lvmh.py
"""
import os

FMP_API_KEY = os.environ.get("FMP_API_KEY", "").strip()
FMP_BASE_URL = "https://financialmodelingprep.com/stable"

# Dossier data/ : contient la base SQLite + les réponses brutes en cache. Exclu de git
# (voir .gitignore) — peut contenir des données sous licence FMP, jamais à publier.
import pathlib
MODULE_DIR = pathlib.Path(__file__).resolve().parent
DATA_DIR = MODULE_DIR / "data"
DB_PATH = DATA_DIR / "fmp_data.sqlite"
RAW_CACHE_DIR = DATA_DIR / "raw_json"  # une copie brute de chaque réponse JSON, pour audit/debug

# Throttling : FMP Ultimate autorise 3000 appels/minute, mais on reste volontairement
# bien en dessous par prudence (erreurs réseau, endpoints plus lents, marge de sécurité
# sur le plafond de bande passante mensuel) — ajustable si besoin une fois en régime réel.
REQUEST_DELAY_SECONDS = 0.25  # ~4 requêtes/seconde max
REQUEST_TIMEOUT_SECONDS = 20
MAX_RETRIES = 3

def require_api_key():
    if not FMP_API_KEY:
        raise RuntimeError(
            "FMP_API_KEY n'est pas définie. Lance d'abord :\n"
            '  PowerShell : $env:FMP_API_KEY = "ta_cle"\n'
            '  Bash       : export FMP_API_KEY="ta_cle"\n'
            "puis relance ce script dans le même terminal."
        )
