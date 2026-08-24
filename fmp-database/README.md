# fmp-database

Module autonome, **séparé du site Wolf Analysis** (pas branché dessus pour l'instant,
demande explicite) : aspire les données Financial Modeling Prep (FMP) pour une liste
d'entreprises et les stocke dans une base SQLite locale, pour une utilisation future
(nourrir l'app, ou interroger directement avec une IA).

## Pourquoi ce dossier n'est pas suivi par git

Ce dossier vit dans le même dépôt que le site (poussé sur un GitHub public), mais son
contenu généré (`data/`) est exclu via `.gitignore` — la base contient des données sous
licence FMP (leur usage/redistribution est encadré par leurs CGU) et potentiellement ta
clé API si tu choisis de la mettre dans un fichier local plutôt que dans une variable
d'environnement. Le CODE (ces scripts Python) reste suivi normalement.

## Avant de lancer quoi que ce soit

1. Avoir un abonnement FMP actif (Ultimate recommandé, voir discussion).
2. Définir la clé API dans l'environnement du terminal (jamais dans un fichier) :
   - PowerShell : `$env:FMP_API_KEY = "ta_cle_ici"`
   - Bash / Git Bash : `export FMP_API_KEY="ta_cle_ici"`
3. Python 3.8+ suffit — **aucune dépendance à installer**, tout est en bibliothèque
   standard (urllib, sqlite3, json).

## Test recommandé (Coca-Cola + LVMH)

```bash
cd fmp-database
python run_test_ko_lvmh.py
```

Ça va :
- Vérifier chaque endpoint du registre (`endpoints.py`) sur KO, et sur 3 variantes de
  ticker pour LVMH (`MC.PA`, `LVMUY`, `LVMHF` — laquelle FMP reconnaît réellement n'a
  jamais été testée en direct, faute de clé disponible en écrivant ce module).
- Importer tout ce qui répond dans `data/fmp_data.sqlite`.
- Afficher un résumé : combien de lignes par catégorie de donnée, pour chaque entreprise.

## Fichiers

| Fichier | Rôle |
|---|---|
| `config.py` | Clé API (depuis l'environnement), URL de base, réglages de débit |
| `endpoints.py` | Registre des endpoints FMP à interroger — **à vérifier/corriger via `discover.py`, pas à prendre pour argent comptant** (voir l'avertissement en tête du fichier) |
| `fmp_client.py` | Appels HTTP (bibliothèque standard uniquement), retries, distingue ok/vide/échec |
| `db.py` | Connexion SQLite + écriture |
| `schema.sql` | Schéma des tables (générique : JSON brut + colonnes indexées, voir le commentaire en tête) |
| `discover.py` | Passe de vérification — teste chaque endpoint sur un symbole, ne stocke que dans `fetch_log` |
| `ingest.py` | Import complet — stocke tout dans `raw_data` |
| `run_test_ko_lvmh.py` | Enchaîne discover + ingest sur KO et LVMH, avec résumé |

## Consulter les données après import

```bash
python3 -c "
import sqlite3
conn = sqlite3.connect('data/fmp_data.sqlite')
cur = conn.execute(\"SELECT category, symbol, item_date FROM raw_data WHERE symbol='KO' AND category='dividends' ORDER BY item_date DESC LIMIT 5\")
for row in cur.fetchall(): print(row)
"
```

Chaque ligne de `raw_data` a une colonne `payload` en JSON brut — SQLite sait
l'interroger directement avec `json_extract(payload, '$.champ')` sans tout re-parser
côté Python.

## Passer à l'échelle (2000-3000 tickers)

Ne pas lancer directement sur une grande liste avant d'avoir :
1. Vérifié le résultat du test KO/LVMH (relire quelques lignes à la main, comparer aux
   vraies données connues de ces deux entreprises).
2. Corrigé dans `endpoints.py` tout endpoint qui serait sorti en erreur alors qu'il
   existe vraiment (mauvais chemin d'URL à ajuster).

Une fois validé, `ingest.py`/`run_test_ko_lvmh.py` acceptent une liste de symboles en
argument — il suffira d'écrire un petit script qui lit ta liste de tickers (fichier
texte, un par ligne) et appelle `ingest.ingest_symbol()` pour chacun, avec une pause
entre chaque entreprise pour rester loin du plafond de bande passante mensuel (150 Go
sur le plan Ultimate). Pas encore écrit — à faire une fois le test KO/LVMH validé.

## Ce qui n'est PAS encore fait

- Pas de connexion à l'application Wolf Analysis (demande explicite : ce module reste
  autonome pour l'instant).
- Pas de script de mise à jour quotidienne des prix (Yahoo Finance, comme le reste du
  site) — à ajouter une fois que le socle FMP est validé.
- Pas de nettoyage/normalisation des données au-delà du stockage brut — les colonnes
  typées, si besoin, viendront après avoir vu de vraies données.
