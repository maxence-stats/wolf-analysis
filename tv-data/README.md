# tv-data — données de valorisation TradingView

**Règle absolue de l'utilisateur** : toutes les données d'actions (cours, ratios, valorisation, prix juste/cible,
onglet Analyse) viennent de **TradingView**. Le Google Sheet ne sert plus QUE pour les transactions des portefeuilles.

Le connecteur TradingView (`mcp-tv-*`) n'existe que dans une session Claude : l'appli ne peut pas l'appeler. Le circuit est donc :

```
connecteur TradingView (Claude)  ->  tv-data/raw/*.json  ->  build_tv_analyse.py  ->  data/tv-analyse.json  ->  appli
```

Tous les fichiers de données sont **git-ignorés** (licence personnelle TradingView, dépôt public). Seul le code est suivi.

## Fichiers

| Fichier | Rôle |
|---|---|
| `universe.json` | les 72 entreprises suivies : nom, symbole TradingView (`tv`), symbole Yahoo (dividendes), secteur |
| `raw/<nom>.json` | historique annuel brut TradingView (BPA, FCF, résultat net, CA — ~15 ans) |
| `raw/_snapshots.json` | instantané TradingView du jour (cours, PER, P/FCF, FCF/action, dividende, ROIC, marge, actions, cash, dette) |
| `raw-div/<nom>.json` | dividendes par action (Yahoo Finance : TradingView n'a pas l'historique du dividende) |
| `build_tv_analyse.py` | calcule tout et écrit `data/tv-analyse.json` |
| `fetch_dividends.py` | rafraîchit les dividendes depuis Yahoo (gratuit, sans clé) |
| `rawlib.py`, `write_snapshots.py`, `batches/` | écriture des fichiers bruts (copie des réponses du connecteur) |

## Ce que le script calcule (sans jamais toucher au Sheet)

actions = résultat net / BPA · FCF par action = FCF / actions · P/FCF = clôture de fin d'année / FCF par action ·
médiane P/FCF = médiane des 10 derniers exercices · prix juste = FCF/action (12 mois) × min(médiane, 25) ·
prix cible = prix juste × 0,8 · écart de valeur = (prix − prix juste) / prix juste · FCFPEG = P/FCF ÷ CAGR FCF 5 ans.
Les banques/assureurs (Crédit Agricole, BNP, Société Générale, AXA) n'ont pas de FCF significatif : pas de P/FCF ni de prix juste.

Sources des morceaux qui ne viennent pas du connecteur TradingView :
- dividende par action historique : Yahoo Finance (`fetch_dividends.py`) ;
- clôtures de fin d'année PASSÉES : archive de cours déjà sur le PC (`data/prices-*.json`, fait définitif) — sauf Prysmian (TradingView) ;
- ROIC / marge opérationnelle / trésorerie / dette-OCF HISTORIQUES : TradingView n'en fournit pas la série ; l'appli les complète année par
  année depuis l'archive FMP déjà sur le PC (`mergeTvWithFmpHistory`, `js/app.js`). Valeurs ACTUELLES : TradingView.

## Mise à jour hebdomadaire (à demander à Claude : « mets à jour TradingView »)

1. `get_symbol_data_batch` (colonnes de `write_snapshots.py`, 2 appels de ≤ 50 symboles) → mettre à jour `raw/_snapshots.json`.
2. `python fetch_dividends.py` (dividendes, ~1 min).
3. Tous les trimestres (après publication de résultats) : `get_financial_history` (`period=fy`, `date_from=2000-01-01`) pour les
   entreprises concernées → `rawlib.add(...)`.
4. `python build_tv_analyse.py` → recharger l'appli (raccourci Bureau).

## Entreprise hors liste (recherche à la volée)

Le serveur local expose `/api/tv/search?q=` et `/api/tv/snapshot?symbol=EXCH:TICK` (données publiques de tradingview.com,
lecture seule). La barre de recherche propose les actions TradingView ; la fiche créée a les ratios ACTUELS seulement (pas
d'historique ni de prix juste : il faut la médiane P/FCF sur 10 ans) et est gardée en cache (`localStorage`
`wolfTvOnDemand`). Pour lui donner l'historique complet : l'ajouter à `universe.json` et lancer la mise à jour ci-dessus.
