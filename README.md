# Wolf Analysis

Tableau de bord d'analyse financière (value investing) pour Wolf Academy Invest.
Site statique — HTML/CSS/JS vanilla, sans framework ni bundler — connecté en direct
à un Google Sheet publié comme source de données.

Le contexte complet (architecture des données, pièges techniques déjà rencontrés,
design system, état des fonctionnalités) vit dans [`CLAUDE.md`](CLAUDE.md). Ce README
ne fait que documenter comment lancer et faire évoluer le projet au quotidien.

## Démarrage rapide

Le site n'a besoin d'aucune installation (`npm install`, build, etc.). Deux façons de
le lancer :

**1. Ouverture directe**
Double-clique sur `index.html`. Ça fonctionne (le chargement des données a un repli
JSONP prévu pour ce cas — voir `CLAUDE.md`), mais certaines requêtes réseau restent
plus fiables via un vrai serveur local.

**2. Serveur local (recommandé pour développer)**
N'importe quel serveur statique fait l'affaire, par exemple :

```bash
npx serve .
```

ou l'extension VS Code **Live Server** (recommandée automatiquement à l'ouverture du
dossier dans VS Code, voir `.vscode/extensions.json`).

## Structure du projet

```
wolf-analysis/
├── index.html          # Structure de la page, contenu des onglets Analyse / Secteur
├── css/
│   └── style.css       # Design system complet (tokens, layout, composants)
├── js/
│   └── app.js           # Chargement des données, rendu, graphiques, interactions
├── CLAUDE.md            # Contexte projet complet (source de vérité pour Claude Code)
├── CODE_ACTUEL.md       # Export du code, tenu à jour en parallèle des fichiers réels
└── CHANGELOG.md         # Historique des changements notables
```

## Source de données

Google Sheet publié sur le web (CSV + JSON via gviz en repli). Détails complets —
IDs, mapping des colonnes, méthode de chargement à deux voies — dans `CLAUDE.md`.

## Conventions

- Textes UI, commentaires de code et messages d'erreur : **en français**.
- Formatage des nombres : `toLocaleString('fr-FR', ...)`.
- Pas d'échec silencieux : toute source externe (Sheet, Stooq) a un état
  chargement/erreur visible et actionnable.
- Fins de ligne normalisées en LF (`.gitattributes`), indentation 2 espaces
  (`.editorconfig`).
- Avant de committer un changement notable, ajouter une entrée dans
  `CHANGELOG.md`.

## Déploiement

Site 100% statique : n'importe quel hébergement statique convient (GitHub Pages,
Netlify, Vercel, Cloudflare Pages...). Il suffit de servir le contenu du dossier tel
quel, aucune étape de build.

## Travail en cours

Voir la section « Travail en cours / demandé mais pas terminé » de `CLAUDE.md` pour
la liste à jour des chantiers ouverts (palette graphiques, migration Yahoo Finance,
onglets Superinvestors / Résumé Hebdo / Macroéconomie).
