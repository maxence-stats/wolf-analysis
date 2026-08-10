# Changelog

Historique des changements notables du projet Wolf Analysis.
Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

## [Non publié]

### Ajouté
- **Analyse développée par entreprise (Cerveau numérique)** : trame structurée
  réutilisable (présentation, marché, moat, secteurs d'activité, perspectives,
  risques, actionnariat, ratios, conclusion — texte + images sur chaque bloc), deux
  vrais graphiques camembert pour la répartition des revenus (par pays, par secteur),
  section concurrents extensible. Accessible depuis la fiche journal du Cerveau
  (bouton 📊) et directement depuis l'onglet Analyse (tag « 📊 Analyse développée »).
  **Versionnable par duplication** plutôt qu'écrasée : une fiche de base qu'on modifie
  sur place, avec la possibilité de la dupliquer pour garder plusieurs versions datées
  quand l'entreprise évolue — jamais de perte de version précédente. Stockage
  IndexedDB (`cerveauData.analyses`), jamais supprimé automatiquement.
- **Alertes de prix multiples** : jusqu'ici une seule alerte par entreprise (la
  reprogrammer écrasait la précédente) — passage à un tableau d'alertes par
  entreprise, ancien format migré automatiquement sans perte au premier chargement.
- **Wolf Portfolio, retouches** : zoom modal agrandi (97vh), tooltip du donut qui suit
  le curseur au lieu de rester fixe sur le logo survolé, icône 💶 pour le Cash (au lieu
  d'un simple "C"), graphique de performance mensuelle passé en courbes.
- Onglet "Cerveau" renommé "Cerveau numérique" (barre d'onglets), blocs de phase de
  chaîne de valeur agrandis (grille 2 colonnes au lieu de 4, plus de hauteur).

### Ajouté
- **Onglet Wolf Portfolio, suite** : mise en page recomposée (liste des positions à
  gauche, donut agrandi à droite, plus grand possible), logos de segment agrandis
  (jusqu'à 56px, anneau élargi à `cutout:46%`), bouton zoom sur le donut (réutilise la
  modale existante, même pied de page « Données fournies par Wolf Analysis »),
  nouveau graphique de performance **mensuelle** (barres, colonnes AT/AV) à côté du
  graphique de performance cumulée déjà existant.
- **Régression linéaire (cours de bourse) : couleurs demandées** — moyenne en rouge,
  ±1 écart-type en bleu, ±2 écarts-types en rouge pointillé (remplace le gris neutre
  utilisé au départ).
- **Nouvel onglet « Wolf Portfolio »** : lit l'onglet « Wolf portefeuille » du même
  Google Sheet (gid dédié, `PORTFOLIO_GID`). 5 tuiles de résumé (capital investi,
  valorisation, cash, gains €/%), composition en donut Chart.js **agrandi** avec le
  logo Wolf Analysis au centre et le logo de chaque position dessiné directement sur
  son segment (deux plugins Chart.js custom, repli sur une initiale si pas de logo),
  + liste des positions triée par poids avec pourcentage/performance, graphique de
  performance cumulée du portefeuille vs S&P 500 par mois. Chargé après les données
  principales (séquentiel, pas en parallèle — voir "Pièges techniques" nouveau point
  sur la collision gviz).
- **Cours de bourse : relais CORS en chaîne** (allorigins.win puis corsproxy.io) au
  lieu d'un seul — chacun pris isolément échoue parfois (confirmé par tests répétés),
  mais rarement les deux en même temps. Nette amélioration de la fiabilité sans
  dépendance à une clé API.
- **Recherche dans la Watchlist** : champ de recherche au-dessus du pool pour trouver
  directement une entreprise sans faire défiler tous les logos.
- **Export Watchlist et Export Alertes** (JSON), sur le même modèle que
  Objectifs/Cerveau — socles `data/watchlist.json` (déjà existant), `data/alertes.json`
  et `data/idees.json` créés.
- **Canal de régression linéaire sur le cours de bourse** : moyenne ± 1 et 2
  écarts-types, calculé sur les 20 dernières années de clôtures hebdo (ou tout
  l'historique dispo si plus court), superposé au graphique existant.
- **Code couleur FCF PEG** (onglet Analyse) : vert si < 1, orange si 1–1,10, rouge
  si > 1,10.
- **Modale de zoom des graphiques** : agrandie, sélecteur de plage 5/10/20 ans/Max
  sur les 8 graphiques historiques (indépendant du graphique boursier, qui garde son
  propre sélecteur), et CAGR 5/10/20 ans affiché en permanence pour Dividende, CA,
  FCF/action et Actions (colonnes W/X/Y, AN/AO/AP, AT/AU/AV du Sheet — case vide si la
  donnée n'existe pas encore, jamais inventée).
- **Onglet Alertes de prix** : seuil programmable depuis l'onglet Analyse (sous le prix
  actuel), liste dédiée mise en évidence visuellement quand le seuil est atteint. Pas de
  notification ni d'email (choix explicite : une vraie alerte en arrière-plan
  demanderait un backend planifié, hors périmètre actuel).
- **Onglet Idées de développement** : bloc-notes à 3 priorités (Urgent / Bientôt / Plus
  tard), cases à cocher, persistant comme les autres onglets.

### Corrigé
- **Zoom du donut Wolf Portfolio en erreur** (`TypeError` Chart.js) : réutiliser le
  même objet `options`/`data` entre le graphique normal et sa version zoomée casse la
  seconde instance (Chart.js mute cet objet en interne pour résoudre les valeurs
  scriptables comme `cutout`). Corrigé avec `buildPortfolioDonutConfig()`, qui
  reconstruit une config indépendante à chaque appel.
- **Canal de régression invisible sur le graphique boursier** : pas un bug du canal
  lui-même (testé isolément, calculs corrects) — `renderStockChart()` s'arrête avant
  d'y arriver si `stockFull` est vide, ce qui est le cas tant que le cours de bourse
  ne charge pas (voir "Connu — pas encore résolu"). Les deux se règleront ensemble une
  fois la source de données de cours fiabilisée.
- **Chargement du Portfolio parfois pollué par les données de l'onglet principal** :
  les deux chargements gviz partageaient le même point d'entrée global
  `google.visualization.Query.setResponse` — si le script gviz principal était encore
  en vol au moment où celui du Portfolio se déclenchait, celui-ci écrasait le
  gestionnaire du premier, qui recevait alors les données du portefeuille (ou
  inversement). Corrigé avec un `responseHandler` dédié (`tqx=...;responseHandler:
  __handlePortfolioGviz`), qui n'entre plus en collision avec le chargement principal.
- **Parsing du Portfolio par position de ligne fixe, alors que le Sheet a une mise en
  page "tableau de bord"** (plusieurs lignes de titre avant chaque bloc, espacements
  différents entre le bloc actifs/résumé/mensuel, et CSV vs gviz qui ne renvoient pas
  les mêmes lignes vides pour ce même fichier) : un numéro de ligne codé en dur
  fonctionnait par coïncidence sur un jeu de données de test et pas sur les vraies
  données. Corrigé : chaque bloc est maintenant reconnu par son contenu (libellés
  d'en-tête ignorés) plutôt que par sa position.
- **Canvas du donut Portfolio à largeur nulle** : `.portfolio-donut-card` (flex
  center) effondrait son enfant `.chart-holder` à 0px de large faute de largeur
  explicite. Corrigé avec `width:100%` sur ce conteneur.
- **Barre d'onglets non responsive sur petit écran** : `.page-nav` (6 onglets depuis
  l'ajout de Classement/Watchlist/Cerveau) n'avait ni retour à la ligne ni défilement —
  sur les fenêtres/écrans trop étroits pour les 6 onglets sur une ligne, les derniers
  onglets sortaient du cadre sans aucun moyen de les atteindre. Un premier correctif
  (défilement horizontal) fonctionnait techniquement mais sans aucune indication visuelle
  (pas de barre de défilement) — donc pas découvrable. Remplacé par un retour à la ligne
  automatique (`flex-wrap:wrap`) : tous les onglets restent visibles en permanence, quelle
  que soit la largeur.
- **Bouton « Exporter » potentiellement étroit sur tout nouveau conteneur réutilisant
  `.objectifs-export`** (Cerveau, Idées, Watchlist) : la règle CSS était scopée à
  `.objectifs-actions .objectifs-export`, donc pas de recours en dehors de ce parent —
  écrasée par `.zoom-btn` (26px) ailleurs. Corrigé avec `button.objectifs-export` (plus
  spécifique que `.zoom-btn` par nature d'élément, fonctionne quel que soit le parent).
- **Répartition sectorielle : une case avec beaucoup d'entreprises étirait ses voisines**
  sur la même ligne de la grille (comportement par défaut de CSS Grid). Corrigé avec
  `align-items:start` sur `.sector-grid` — chaque case grandit désormais seule selon son
  propre contenu.
- **Onglet Idées : pas de bouton visible pour ajouter une idée** (seule la touche Entrée
  fonctionnait). Ajout d'un bouton « + Ajouter » à côté de chaque champ de saisie.

### Connu — amélioré, pas garanti à 100%
- **Cours de bourse (Yahoo Finance/Stooq) plus fiable mais pas infaillible.** Ni Yahoo
  Finance ni Stooq n'autorisent les requêtes directes depuis un navigateur (CORS
  bloqué, confirmé) — un relais est obligatoire. Passage d'un seul relais (allorigins.win)
  à une **chaîne de deux** (allorigins.win puis corsproxy.io, voir version courante de
  "Cours de bourse") : chacun échoue parfois isolément, mais rarement les deux au même
  moment, ce qui a nettement amélioré le taux de succès en test. Reste un relais public
  gratuit, donc pas de garantie absolue — si le besoin de fiabilité totale se confirme,
  la piste Twelve Data (vrai CORS natif, clé API gratuite requise) reste disponible.

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
