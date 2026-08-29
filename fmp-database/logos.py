"""
Télécharge et sauvegarde LOCALEMENT le logo de chaque entreprise déjà importée (champ
"image" du profil FMP, voir ingest.py) — le fichier image lui-même, pas juste son URL,
pour que la donnée reste disponible même après résiliation de l'abonnement FMP (demande
explicite : "je coupe l'abonnement, j'ai toutes les données").

Ne nécessite PAS la clé API pour cette étape précise : l'URL d'image FMP
(https://images.financialmodelingprep.com/symbol/{TICKER}.png) est un CDN public,
vérifié accessible sans authentification. Mais elle est lue depuis les données DÉJÀ
importées par ingest.py (catégorie "profile"), jamais reconstruite à la main à partir
du ticker — au cas où FMP changerait son schéma d'URL un jour.

Usage :
    python logos.py KO
    python logos.py KO MC.PA AI.PA

Les fichiers atterrissent dans data/logos/ (sous fmp-database/, donc hors du dépôt git
comme le reste de fmp-database/data/ — voir .gitignore). Publier ces images sur le site
(dépôt public) est une décision séparée, pas prise ici — voir la discussion avec
l'utilisateur avant de les committer où que ce soit.
"""
import json
import pathlib
import shutil
import sys
import urllib.request
import urllib.error

import config
import db

LOGOS_DIR = config.DATA_DIR / "logos"
# Copie servable par le site (data/logos/ à la racine du dépôt, PAS fmp-database/data/)
# — demande explicite : "être sûr que tous les logos soient... aux datas extraites avec
# les images". Reste gitignoré comme le reste des données FMP (voir .gitignore) : jamais
# poussé sur GitHub, juste rendu accessible en local/sur le réseau local pour que le
# site (app.js::companyLogoUrl()) puisse le charger par une URL relative normale, chose
# qu'un chemin sous fmp-database/ (hors de la racine servie) ne permet pas.
SITE_LOGOS_DIR = config.MODULE_DIR.parent / "data" / "logos"


def download_logo(symbol, url):
    LOGOS_DIR.mkdir(parents=True, exist_ok=True)
    ext = pathlib.Path(url.split("?")[0]).suffix or ".png"
    dest = LOGOS_DIR / f"{symbol}{ext}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "wolf-analysis-fmp-database/1"})
        with urllib.request.urlopen(req, timeout=config.REQUEST_TIMEOUT_SECONDS) as res:
            data = res.read()
        dest.write_bytes(data)
        SITE_LOGOS_DIR.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(dest, SITE_LOGOS_DIR / dest.name)
        return dest, len(data)
    except (urllib.error.URLError, urllib.error.HTTPError) as e:
        return None, str(e)


def logo_url_for(conn, symbol):
    """Lit le champ "image" du profil déjà importé — renvoie None si le profil n'a
    jamais été récupéré (lance ingest.py d'abord) ou si FMP n'a pas de logo pour ce
    symbole (defaultImage=True côté FMP, rare mais possible sur de petites valeurs)."""
    cur = conn.cursor()
    cur.execute(
        "SELECT payload FROM raw_data WHERE category='profile' AND symbol=? ORDER BY id DESC LIMIT 1",
        (symbol,),
    )
    row = cur.fetchone()
    if not row:
        return None
    profile = json.loads(row[0])
    if isinstance(profile, list):
        profile = profile[0] if profile else {}
    if profile.get("defaultImage"):
        return None
    return profile.get("image")


def download_logos(conn, symbols):
    results = {}
    for symbol in symbols:
        url = logo_url_for(conn, symbol)
        if not url:
            print(f"  [ ABSENT ] {symbol} — pas de profil importé ou pas de logo FMP pour ce symbole")
            results[symbol] = None
            continue
        dest, result = download_logo(symbol, url)
        if dest:
            print(f"  [   OK   ] {symbol} -> {dest} ({result} octets)")
            results[symbol] = str(dest)
        else:
            print(f"  [ ÉCHEC  ] {symbol} — {result}")
            results[symbol] = None
    return results


def sync_all_to_site():
    """Recopie tout ce qui a déjà été téléchargé avant l'ajout de la synchronisation
    automatique (download_logo() la fait maintenant à chaque téléchargement) — à lancer
    une fois pour rattraper les logos déjà en place."""
    if not LOGOS_DIR.exists():
        print("Rien à synchroniser : fmp-database/data/logos/ n'existe pas encore.")
        return
    SITE_LOGOS_DIR.mkdir(parents=True, exist_ok=True)
    n = 0
    for f in LOGOS_DIR.iterdir():
        if f.is_file():
            shutil.copyfile(f, SITE_LOGOS_DIR / f.name)
            n += 1
    print(f"{n} logo(s) synchronisé(s) vers {SITE_LOGOS_DIR}")


def main():
    if "--sync" in sys.argv:
        sync_all_to_site()
        return
    symbols = sys.argv[1:]
    if not symbols:
        print("Usage : python logos.py SYMBOLE [SYMBOLE2 ...]\n        python logos.py --sync   (recopie ceux déjà téléchargés vers data/logos/ à la racine)")
        sys.exit(1)
    conn = db.get_connection()
    download_logos(conn, symbols)
    conn.close()


if __name__ == "__main__":
    main()
