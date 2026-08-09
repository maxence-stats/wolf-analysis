# Changelog

Historique des changements notables du projet Wolf Analysis.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [Non publié]

### Corrigé
- **Barre d'onglets non responsive sur petit écran** : `.page-nav` (6 onglets depuis
  l'ajout de Classement/Watchlist/Cerveau) n'avait ni retour à la ligne ni défilement —
  sur mobile, les onglets « Watchlist » et « Cerveau » sortaient de l'écran sans aucun
  moyen de les atteindre. Ajout d'un défilement horizontal (`overflow-x:auto`, boutons
  `flex-shrink:0`) sur la barre d'onglets.

### Ajouté
- **Médiane P/FCF sur 20 ans** affichée sur l'onglet Valorisation (colonne BH, à titre
  informatif, n'entre dans aucune formule).
- **Filtre secteur sur l'onglet Classement** : les deux classements (rendement du
  dividende, opportunité de valorisation) peuvent être restreints à un secteur GICS
  précis via un sélecteur, réutilisant `normalizeSector()`/`GICS_SECTORS`.
- **Onglet Classement** : meilleur rendement du dividende + meilleure opportunité de
  valorisation (écart de valeur), deux listes triées, clic → fiche entreprise.
- **Onglet Watchlist** : 4 listes (Liste d'achat / Idée du moment / À surveiller / À
  analyser), glisser-déposer des logos, persistance locale + socle `data/watchlist.json`.
- **Onglet Cerveau numérique** : 11 secteurs GICS navigables → chaînes de valeur définies
  par l'utilisateur (nom + phases libres) → entreprises assignées par phase → fiche par
  entité avec entrées datées (texte + images + croquis à main levée). Stockage IndexedDB
  (images en base64, trop volumineux pour `localStorage`) + socle `data/cerveau.json`.

### Corrigé
- **Cours de bourse : retour à Yahoo Finance + repli Stooq**, en remplacement d'un widget
  TradingView introduit puis abandonné dans cette même série de changements : le widget
  public/anonyme TradingView ne dessert pas les données Euronext Paris (ni probablement
  d'autres bourses non-américaines), ce qui affichait le graphique de repli AAPL pour la
  majorité du portefeuille (européen). Aucune connexion à un compte TradingView ne peut
  résoudre ce point : ce widget d'embed n'a pas de mécanisme d'authentification.
- **Cerveau numérique : création de chaîne de valeur impossible.** Le bouton
  « + Nouvelle chaîne de valeur » appelait `prompt()` deux fois ; dans certains contextes
  navigateur `window.prompt()` lève une exception au lieu de retourner une valeur, ce qui
  interrompait le clic avant toute création — d'où l'impression de blocage total signalée
  par l'utilisateur (rien ne se passe, impossible de revenir en arrière faute d'avoir
  jamais progressé dans le flux). Remplacé par un formulaire en ligne (nom + phases,
  boutons Créer/Annuler) qui ne dépend d'aucune boîte de dialogue native.

## [0.4.0] — 2026-08-09

### Ajouté
- Bouton **« ↻ Charger »** sur chaque entrée de l'historique des objectifs (onglet
  Valorisation) : réapplique instantanément les valeurs CAGR/multiple des 3 scénarios
  aux sliders, sans ressaisie manuelle.

### Corrigé
- **Verallia mal classée dans l'onglet Secteur** (finissait dans "Autre / non classé") :
  accentuation incohérente dans la colonne `secteur` du Sheet ("Materiaux" vs
  "Matériaux" selon la ligne). `normalizeSector()` compare désormais du texte
  sans accents des deux côtés (`stripAccents()`).

### Modifié — 2e passe de direction artistique
La 1re passe (dégradés discrets, cartes bordées, typo monospace conservée) a été jugée
insuffisante par l'utilisateur au regard des captures Finary fournies. Changements :
- Police des chiffres/labels : JetBrains Mono → **Plus Jakarta Sans** (police ronde),
  Inter retirée. Space Grotesk conservée pour les titres/marque uniquement.
- Fond dégradé violet/bleu **beaucoup plus marqué et saturé** (bien au-delà d'un simple
  accent discret).
- Cartes **aplaties** : bordures quasi supprimées (`--card-border`, remplace
  `1px solid var(--hair)` sur les grandes cartes), ombre statique très réduite, séparation
  par le ton du fond plutôt que par un trait visible.
- Densité de l'information inchangée (demande explicite : pas d'espacement à la Finary).

## [0.3.0] — 2026-08-09

### Ajouté
- **Onglet Valorisation** : simulations scénarisées (Optimiste/Réaliste/Pessimiste)
  avec sliders CAGR FCF prévu + médiane P/FCF, calculs en direct (Prix Juste Sim.,
  Prix Cible -20%, Prix Est. à 5 ans, Rendement à 5 ans), graphique par scénario
  (historique de prix + repères + ligne de projection à horizon+5 ans). Historique
  des objectifs daté par entreprise, persisté en local (`localStorage`) avec export
  JSON pour synchronisation multi-appareils via Claude.
- Bouton « Exporter » sur l'onglet Valorisation pour télécharger l'historique des
  objectifs (`wolf-analysis-objectifs.json`).

### Corrigé
- **Moyenne mobile 200 semaines jamais franchie par le cours** : les données Yahoo
  Finance étaient en réalité mensuelles (Yahoo sous-échantillonne silencieusement
  `range=max`), pas hebdomadaires. Passage à des bornes `period1`/`period2` explicites
  + rééchantillonnage hebdomadaire manuel côté client — le cours croise maintenant
  réellement sa moyenne mobile tout au long de l'historique.
- Bouton « Exporter » de l'onglet Valorisation trop étroit (conflit de spécificité CSS
  avec `.zoom-btn`).

### Modifié
- Titre "Wolf Analysis" repassé en blanc uni (dégradé or retiré, jugé pas assez lisible/
  esthétique) ; sous-titre "Onglet Analyse" retiré sous le titre (redondant avec les
  onglets juste en dessous).
- Logo dans la modale de zoom des graphiques agrandi (28px) et aligné à droite (au lieu
  de centré), pour une meilleure visibilité de l'image de marque.

## [0.2.0] — 2026-08-09

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
