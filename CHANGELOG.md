# Changelog

Historique des changements notables du projet Wolf Analysis.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [Non publié]

### Ajouté
- Palette graphiques bleu/or : `THEME.blue` exposé, les 9 graphiques Chart.js (dont le
  cours de bourse) utilisent désormais or/bleu pour leurs séries. Vert/rouge restent
  réservés au sémantique positif/négatif (badges CAGR, jauge de valorisation).
- Cours de bourse : Yahoo Finance en source principale (bien plus de profondeur
  historique), repli automatique sur Stooq si indisponible pour un ticker donné.
- Graphique Chiffre d'affaires en courbe (au lieu de barres) ; graphique P/FCF en
  barres + courbe de la médiane P/FCF historique (au lieu d'une simple courbe).
- Branding "Données fournies par Wolf Analysis" + logo dans la modale de zoom des
  graphiques.
- Refonte visuelle inspirée de Finary : cartes en dégradé avec ombre portée, boutons en
  dégradé doré avec lueur au survol, titre de marque en dégradé, glow sémantique sur les
  badges/jauge/verdict, flou d'arrière-plan sur la modale de zoom, lueur de fond violette
  décorative en plus de la lueur dorée existante.

### Corrigé
- Onglet Secteur totalement inerte (aucun gestionnaire de clic sur les boutons
  Analyse/Secteur — `switchPage()` n'était jamais appelée).
- HTML cassé sur les logos de l'onglet Secteur (guillemets non échappés dans un
  attribut `onclick` inline) — remplacé par une délégation d'événements sur `data-nom`.

### À faire (voir `CLAUDE.md` pour le détail)
- Décision d'architecture pour Superinvestors (13F), Résumé Hebdo, Macroéconomie.

## [0.1.0] — 2026-08-09

### Ajouté
- Initialisation du dépôt Git.
- Extraction du code documenté dans `CODE_ACTUEL.md` vers la structure de fichiers
  réelle du projet (`index.html`, `css/style.css`, `js/app.js`).
- Mise en place des fondations projet : `.gitignore`, `.gitattributes`,
  `.editorconfig`, `README.md`, configuration VS Code (`.vscode/`).
