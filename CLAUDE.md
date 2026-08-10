# Wolf Analysis — Contexte projet

Tableau de bord d'analyse financière (value investing) pour Wolf Academy Invest.
Site statique (HTML/CSS/JS vanilla, pas de framework, pas de backend) qui se
connecte en direct à un Google Sheet publié comme source de données.

## Structure du projet

```
wolf-analysis/
├── index.html      # Structure de la page, contenu des 6 onglets (Analyse / Secteur /
│                   # Valorisation / Classement / Watchlist / Cerveau)
├── css/
│   └── style.css    # Design system complet (tokens, layout, composants)
├── js/
│   └── app.js        # Chargement des données, rendu, graphiques, interactions
└── data/
    ├── objectifs.json  # Socle des objectifs de valorisation (onglet Valorisation)
    ├── watchlist.json  # Socle des 4 listes de suivi (onglet Watchlist)
    └── cerveau.json    # Socle des chaînes de valeur + fiches entités (onglet Cerveau)
```
Les 3 fichiers `data/*.json` valent `{}` par défaut et sont mis à jour par Claude (commit
+ push) quand l'utilisateur exporte depuis le site et transmet le fichier en conversation —
voir "Conventions de code" pour le pattern général de persistance sans backend.

Le HTML référence les fichiers externes via :
```html
<link rel="stylesheet" href="css/style.css">
<script src="js/app.js"></script>
```

Dépendances CDN (chargées directement dans `index.html` / dynamiquement par `app.js`, pas de npm) :
- **Chart.js 4.4.4** — chargé dynamiquement avec repli sur 3 CDN (cdnjs → jsdelivr → unpkg), voir section "Pièges techniques"
- **PapaParse 5.4.1** (cdnjs) — parsing CSV
- **Widget TradingView** (`embed-widget-advanced-chart.js`, injecté dynamiquement) —
  cours de bourse sur l'onglet Analyse, voir "Cours de bourse"
- **Google Fonts** : Space Grotesk (titres/marque), Plus Jakarta Sans (corps, chiffres,
  labels — voir "Design system", remplace Inter + JetBrains Mono depuis la 2e passe DA)

Aucun framework, aucun bundler, aucun `npm install` requis. Le site s'ouvre tel quel
dans un navigateur, ou se déploie sur n'importe quel hébergement statique.

## Source de données — Google Sheet

- **Fichier** : Google Sheet de l'utilisateur, ID réel `1V4NaDx7PvnJkPMtddGgW23Hjn0jon1g0UjoC4o6FchM`
- **Onglet** : "DATA BASE 20 ans", `gid = 1880505297`
- **Publication** : le fichier doit être publié sur le web (`Fichier → Partager → Publier sur le web`,
  onglet précis, format CSV) — sans ça, les deux méthodes de chargement échouent.
- **Structure** : toutes les entreprises sont empilées dans le même onglet (une ligne par
  année et par entreprise), identifiées par la colonne `NOM` (A). Le JS regroupe les lignes
  par entreprise et les trie par année croissante.
- **Mapping des colonnes** (0-indexé, A=0) — objet `COL` dans `app.js` :

| Champ | Colonne | Index |
|---|---|---|
| nom | A | 0 |
| annee | B | 1 |
| lienImage (logo) | C | 2 |
| ticker | D | 3 |
| secteur | E | 4 |
| sousSecteur | F | 5 |
| prixActuel | H | 7 |
| prixJuste | I | 8 |
| prixCible | J | 9 |
| ecartValeur (juste vs cible) | K | 10 |
| pFcf | N | 13 |
| dividende | U | 20 |
| rendementDiv | V | 21 |
| cagrDiv5 | W | 22 |
| cagrDiv10 | X | 23 |
| cagrDiv20 | Y | 24 |
| payoutRatio | AA | 26 |
| fcfpeg | AJ | 35 |
| fcfParAction | AM | 38 |
| cagrFcf5 | AN | 39 |
| cagrFcf10 | AO | 40 |
| cagrFcf20 | AP | 41 |
| medianePFCF | AQ | 42 |
| ca | AS | 44 |
| cagrCA5 | AT | 45 |
| cagrCA10 | AU | 46 |
| cagrCA20 | AV | 47 |
| margeOp | AW | 48 |
| roic | AX | 49 |
| cash | BA | 52 |
| cashInvesti | BB | 53 |
| actions (nb en circulation) | BC | 54 |
| cagrActions | BD | 55 |
| detteOCF (dette nette / OCF) | BG | 58 |
| medianePFCF20 (médiane P/FCF, 20 ans) | BH | 59 |

**IMPORTANT** : `ecartValeur` (colonne K) = `(Prix Juste / Prix Cible) - 1`, PAS l'écart
entre prix actuel et prix juste. C'est un écart méthodologique (marge de sécurité entre
juste valeur et prix cible d'achat), confirmé par l'utilisateur.

## Chargement des données — architecture (leçons apprises, ne pas régresser)

Deux méthodes tentées **en parallèle** (pas séquentiellement — bug corrigé en prod) :

1. **`fetch()` sur le CSV publié** : `https://docs.google.com/spreadsheets/d/e/{PUBLISHED_ID}/pub?gid={GID}&single=true&output=csv`
   — méthode standard, fonctionne une fois le site hébergé sur un vrai domaine.
2. **Balise `<script>` JSONP sur l'endpoint gviz** : `https://docs.google.com/spreadsheets/d/{SHEET_ID}/gviz/tq?tqx=out:json&gid={GID}&headers=1`
   — contourne les restrictions CORS que Chrome applique aux requêtes `fetch()` depuis un
   fichier ouvert en `file://` local (cas de test en local avant hébergement).

Un flag partagé `loadSettled` empêche les deux méthodes de se marcher dessus ; un
`setTimeout` de secours (9s) affiche un message d'erreur explicite si aucune des deux
n'a abouti. **Ne pas revenir à un chargement séquentiel** (bug déjà rencontré : la 2e
méthode n'était jamais tentée si la 1re restait bloquée indéfiniment).

`PUBLISHED_ID` (pour la méthode CSV) et `SHEET_ID` (pour gviz) sont deux identifiants
différents du même fichier — les deux sont codés en dur en haut de `app.js`.

## Pièges techniques déjà rencontrés (ne pas reproduire)

1. **Chart.js chargé statiquement dans `<head>` = point de défaillance unique.**
   Un bloqueur de pub/extension navigateur peut bloquer `cdnjs.cloudflare.com`, et si
   `Chart.defaults...` s'exécute en top-level avant que la lib soit chargée, ça plante
   silencieusement TOUT le script (y compris le chargement des données), sans aucune
   erreur visible → écran de chargement infini. Fix en place : `ensureChartJs()` charge
   dynamiquement Chart.js avec repli sur 3 CDN, et `loadData()` n'est appelé qu'après
   confirmation du chargement.
2. **`file://` vs requêtes réseau.** Ouvrir le fichier en local (double-clic) restreint
   fortement `fetch()` cross-origin dans Chrome (peut hang indéfiniment sans jamais
   résoudre/rejeter, y compris avec `AbortController`). D'où la double méthode ci-dessus.
   Une fois le site vraiment hébergé (http/https), `fetch()` seul suffira, mais garder le
   repli gviz ne coûte rien et sécurise les tests locaux.
3. **Cours de bourse via fetch Yahoo Finance/Stooq.** Solution active (voir "Cours de
   bourse" plus bas) — a brièvement été remplacée par un widget TradingView, revenue en
   arrière suite à une limitation de données bloquante (voir point 8). **Yahoo Finance
   sous-échantillonne silencieusement `range=max`** — même avec `interval=1d`, l'API
   renvoie sans prévenir des points mensuels sur un très long historique. Fix en place :
   timestamps explicites `period1`/`period2` (jamais `range=`) + rééchantillonnage manuel
   côté client (`resampleWeekly()`).
4. **Cache navigateur agressif sur `<script src="js/app.js">` en `file://`.** Pendant le
   développement local, Chrome peut continuer à exécuter une version en cache de `app.js`
   après une modification, même après un rechargement complet de la page (F5, re-navigation,
   nouvel onglet) — seul un `fetch()` direct de l'URL renvoie le contenu à jour. Symptôme :
   une fonction ajoutée récemment est `undefined` sur `window` alors que le fichier sur
   disque est correct. Contournement en session de test : ajouter temporairement un
   paramètre de cache-bust à l'URL du script (`js/app.js?_test=1`), vérifier, puis le
   retirer avant de committer. Ne pas laisser ce paramètre en prod.
5. **Cascade CSS et ordre des règles.** Une classe utilitaire réutilisant un sélecteur
   générique déjà stylé plus loin dans le fichier (ex. `.objectifs-export` combinée à
   `.zoom-btn`, qui fixe `width:26px` bien après dans `style.css`) peut se faire écraser
   silencieusement : à spécificité égale, c'est la règle déclarée en dernier dans le
   fichier qui gagne, pas l'ordre des classes dans l'attribut `class`. Vu en pratique sur
   le bouton « Exporter » de l'onglet Valorisation (resté coincé à 26px de large). Fix :
   composer un sélecteur plus spécifique (`.objectifs-actions .objectifs-export`) plutôt
   que de compter sur l'ordre d'apparition dans le fichier.
6. **Accentuation incohérente dans les colonnes texte du Sheet.** La colonne `secteur`
   est saisie à la main, donc pas garantie cohérente : "Materiaux" (Air Liquide) vs
   "Matériaux" (Verallia) selon la ligne, alors que c'est censé être le même secteur.
   `normalizeSector()` comparait des mots-clés sans accent contre du texte parfois
   accentué → certaines entreprises finissaient dans "Autre / non classé" au lieu de leur
   vrai secteur. Fix : `stripAccents()` (normalisation Unicode NFD + suppression des
   diacritiques) appliquée des deux côtés de la comparaison avant `includes()`. **Tout
   nouveau matching de texte libre venant du Sheet devrait passer par `stripAccents()`**
   plutôt que supposer une saisie homogène.
7. **`window.prompt()`/`confirm()` ne sont pas fiables pour un flux critique.** Dans
   certains contextes navigateur (fenêtres sans chrome, PWA, extensions de sécurité,
   environnements automatisés/CDP), `prompt()` **lève une exception** au lieu de
   retourner `null` — un clic qui l'appelle plante silencieusement (rien ne se passe côté
   utilisateur, aucune erreur visible sans ouvrir la console). Vu sur le bouton
   « + Nouvelle chaîne de valeur » du Cerveau numérique (deux `prompt()` en cascade) :
   l'utilisateur ne pouvait ni créer de chaîne ni, par conséquent, progresser dans la
   navigation. **Ne plus utiliser `prompt()`/`confirm()` pour des flux applicatifs** —
   préférer un petit formulaire en ligne ou une modale custom (voir `cerveauNewChain`
   dans `app.js` pour le pattern retenu : formulaire inline avec boutons Créer/Annuler).
8. *(historique, essai abandonné)* **Le widget TradingView "Advanced Chart" (embed
   public/anonyme) ne dessert pas les données Euronext Paris**, même pour des symboles
   pourtant valides et retrouvés par sa propre recherche de symbole (`EURONEXT:TTE`,
   `EURONEXT:AI` confirmés inexistants pour le widget alors qu'ils existent bien sur
   tradingview.com et dans sa recherche interne). Message renvoyé par le widget :
   *« Ce symbole n'existe pas »* + notification *« Symbole disponible uniquement sur
   TradingView »* — un message de restriction de licence de données, pas une erreur de
   mapping. Confirmé **indépendamment de l'hébergement** (reproduit à la fois en `file://`
   et servi en HTTP réel sur `localhost`, donc pas lié au problème `page-uri`/référent).
   `NASDAQ:MSFT` fonctionne sans erreur dans le même widget — la restriction semble
   spécifique aux bourses non-américaines. **Un compte TradingView (même Pro) ne change
   rien** : ce widget d'embed n'a aucun mécanisme d'authentification dans sa configuration
   (pas de champ identifiants) et ne partage pas la session du site principal
   tradingview.com — impossible à résoudre côté utilisateur. Comme la majorité du
   portefeuille est européenne, **décision prise avec l'utilisateur : retour au fetch
   Yahoo Finance/Stooq** (point 3 ci-dessus), qui couvre toutes les bourses du
   portefeuille. Ne pas réintroduire le widget TradingView pour le cours de bourse
   principal sans un moyen de contourner cette limitation de données.
9. **Deux chargements gviz simultanés se marchent dessus.** L'API Google Visualization
   utilise par défaut un point d'entrée global unique (`google.visualization.Query.
   setResponse`) — si un deuxième `<script>` gviz (ex. Portfolio) réassigne ce handler
   pendant qu'un premier chargement (ex. données principales) est encore en vol, la
   réponse du premier finit traitée par le mauvais code (constaté : données du
   portefeuille polluées par celles de "DATA BASE 20 ans"). Fix : passer un
   `responseHandler` dédié dans l'URL (`tqx=out:json;responseHandler:NOM_FONCTION`)
   pour chaque source gviz supplémentaire, jamais réutiliser le handler par défaut
   dès qu'il y a plus d'une source de données gviz sur la page.
10. **Ne jamais coder en dur un numéro de ligne pour parser un onglet Google Sheet en
    mise en page "tableau de bord"** (plusieurs blocs de données avec leurs propres
    lignes de titre/espacement, contrairement à une simple table plate comme
    "DATA BASE 20 ans"). Vu sur l'onglet "Wolf portefeuille" (voir "Onglet
    Portfolio") : le bloc actifs, le bloc résumé et le bloc mensuel partagent la même
    ligne d'en-tête mais démarrent leurs données à des lignes différentes — et **CSV
    et gviz ne renvoient même pas les mêmes lignes vides pour le même fichier** (gviz
    compresse certains blancs, CSV les garde). Un index codé en dur (`i === 1`, etc.)
    peut sembler fonctionner sur un premier test puis renvoyer n'importe quoi en
    pratique. Toujours parser par **reconnaissance de contenu** (ignorer les libellés
    d'en-tête connus, chercher la première valeur qui parse comme un nombre) plutôt
    que par position.
11. **Ne jamais faire confiance à une description verbale de la mise en page d'un
    Sheet — toujours lire le CSV publié directement avant d'écrire le parsing.**
    L'utilisateur avait décrit l'onglet historique de prix comme « colonne A = toutes
    les dates, colonnes B/D/F/H = clôtures ». En lisant le CSV réel (`curl` sur l'URL
    publiée), la structure était différente : chaque entreprise a sa **propre** paire
    [colonne date, colonne clôture], sans axe de dates partagé — les historiques
    démarrent à des dates différentes selon l'entreprise (Ferrari en 2016, TotalEnergies
    en 2006), donc utiliser la colonne A comme axe commun aurait décalé les prix des
    entreprises à historique plus court de plusieurs années. Coder le parsing sur la
    description verbale sans vérifier aurait produit des graphiques silencieusement
    faux (pas d'erreur, juste des données mal alignées) — un bug bien plus difficile à
    repérer qu'un crash. Vérifier la structure réelle avant d'écrire le code de
    parsing est plus rapide que de découvrir le problème après coup.
12. **`destroyCharts()` vide `chartInstances` en bloc (`chartInstances = {}`), donc
    l'ordre d'appel compte pour tout graphique créé de façon synchrone.** Avant
    l'ajout de la source de prix Sheet (synchrone), `loadStockChart()` était toujours
    asynchrone (attente d'un fetch Yahoo/Stooq) et se terminait donc forcément
    **après** `destroyCharts()` dans `renderCompany()` — l'ordre d'appel dans le code
    source n'avait jamais d'importance en pratique. Rendre le chemin Sheet synchrone
    (pas d'attente réseau) a révélé le bug : le graphique boursier se créait, puis
    `destroyCharts()` (appelé juste après dans `renderCompany()`) l'effaçait
    silencieusement sans rien recréer à la place — `stockFull` restait correctement
    peuplé, mais `chartInstances.stock` disparaissait. Fix : `loadStockChart()` est
    maintenant appelé **après** `destroyCharts()` dans `renderCompany()`. Piège à
    surveiller pour tout futur chemin de chargement qui deviendrait synchrone.
13. **Un `<canvas>` Chart.js qui a dessiné une image cross-origin sans `crossOrigin`
    devient "tainté" : `canvas.toDataURL()` lève `SecurityError`, capture impossible.**
    Rencontré en implémentant l'export PDF du donut Portfolio : ses logos de position
    sont dessinés volontairement **sans** `crossOrigin='anonymous'` (voir point sur
    `portfolioImageCache` plus bas — l'exiger casserait le chargement de tout logo dont
    l'hébergeur ne renvoie pas d'en-tête CORS, ex. Air Liquide), ce qui rend ce canvas
    précis illisible en pixels. Pas de contournement possible sur ce canvas-là sans
    réintroduire le bug Air Liquide. Fix : pour l'export PDF uniquement,
    `buildPortfolioExportChartImg()` reconstruit un graphique **jetable hors-écran**,
    sans les logos de POSITION custom (juste les segments + légende Chart.js standard)
    — mais **avec le logo Wolf au centre** : contrairement aux logos de position
    (CORS non garanti selon l'hébergeur de chaque entreprise), le logo Wolf est
    hébergé sur postimg.cc qui envoie bien `Access-Control-Allow-Origin` (vérifié),
    donc le charger avec `crossOrigin='anonymous'` sur CE canvas jetable ne le tainte
    pas. Le donut affiché à l'écran n'est pas touché. Les 3 graphiques camembert de
    l'Analyse développée n'ont pas ce problème (aucune image externe dessinée dessus),
    `chartCanvasToImgHtml()` marche directement sur leur canvas réel.
14. **Toujours lire le CSV réel d'un nouvel onglet Sheet colonne par colonne avant de
    coder le mapping — même quand l'utilisateur donne des lettres de colonne précises.**
    Pour le graphique "Cycle de Marché", l'utilisateur avait indiqué la colonne K pour
    le ratio Technologie ; en inspectant le CSV réel, K contenait en fait `XLK/100`
    (le prix brut de l'ETF, pas un ratio) — la vraie colonne "vs S&P 500" nommée
    `Technologie` était O, exactement le même schéma que les colonnes Santé/Finance/
    Industrie que l'utilisateur avait lui-même correctement identifiées par leur nom de
    secteur (pas par calcul). Confirmé en comparant les valeurs (`O ≈ K/N` sur
    plusieurs lignes). Un mapping non vérifié aurait donné un graphique silencieusement
    faux (pas d'erreur, juste une mauvaise colonne) — même famille de piège que le
    point 11, mais ici l'erreur venait de la dictée de l'utilisateur, pas d'une
    supposition de Claude : vérifier reste la bonne pratique par défaut, quelle que
    soit la source de l'information sur la structure d'un Sheet.

## Design system

Thème sombre inspiré de Finary (captures fournies par l'utilisateur : page marketing +
mockup de tableau de bord/téléphone), mais adapté à un site dense en données (9 graphiques
+ 8 cartes de ratios sur un seul écran, contre les écrans aérés de Finary).

**Historique de la DA — ne pas régresser vers la v1.** Une première passe (dégradés
discrets ~10% d'opacité, cartes bordées + ombre marquée, typo restée en JetBrains Mono)
a été jugée **insuffisante** par l'utilisateur (« on n'y est pas du tout »), pas de
demi-mesure. Décisions explicites prises pour la v2 (à ne pas re-discuter sans raison) :
- Typo des chiffres/labels **changée** vers une police ronde (pas gardée en monospace,
  malgré l'identité "terminal" documentée à l'origine — l'utilisateur a tranché en faveur
  de Finary).
- Fond dégradé **beaucoup plus marqué/saturé** (pas discret).
- Cartes **aplaties** (quasi sans bordure), pas bordées+ombrées comme avant.
- Densité de l'information **inchangée** (juste un nouvel habillage visuel, pas un
  espacement à la Finary qui ajouterait du défilement).

**Couleurs** (`:root` dans `style.css`) :
- `--bg: #0D1013` (fond, pas noir pur)
- `--panel: #151A1F`, `--panel-2: #1B2128` (cartes)
- `--hair: #262E36` (bordures structurelles restantes : nav, inputs, petites puces —
  **plus utilisée pour les grandes cartes**, voir `--card-border`)
- `--text: #E9EBEE`, `--text-dim: #8B93A0`, `--text-faint: #5C6470`
- `--gold: #D9A441` (accent principal — dividendes, énergie, signal), `--gold-2: #F0C877`
  (variante claire, utilisée dans les dégradés des boutons)
- `--blue: #4A9FE0` (accent secondaire — séries de données des graphiques, voir "Palette
  graphiques" ci-dessous)
- `--violet: #8B7FE8` (accent décoratif — désormais la couleur **dominante** du dégradé
  de fond, en haut à droite, gros blob saturé façon Finary ; jamais utilisé pour du
  sens/de la donnée)
- `--green: #4FD1A5` (positif/sous-valorisé) — `--red: #E5636B` (négatif/survalorisé)
- `--card-bg` : dégradé `panel-2 → panel`, appliqué sur toutes les grandes cartes (header,
  gauge, ratio-card, chart-card, sector-box, scenario-card, objectifs-card, zoom-panel,
  écrans loading/error)
- `--card-border` : `1px solid rgba(255,255,255,0.05)` — quasi invisible, remplace
  `1px solid var(--hair)` sur les grandes cartes (style Finary "plat", séparation par le
  ton du fond plutôt que par un trait visible). Les petits éléments (puces `.tag`,
  `.chart-badge`, boutons `.zoom-btn`/`.range-buttons button`, `.search-input`) gardent
  `var(--hair)`, ils ont besoin de se détacher visuellement à cette taille.
- `--shadow-card` : très légère (`0 1px 2px rgba(0,0,0,0.25)`) à l'état statique —
  `--shadow-card-hover` : plus prononcée, seulement au survol (`ratio-card`, `chart-card`)

**Fond de page** — dégradé volontairement voyant (pas un accent discret) :
```css
background:
  radial-gradient(1500px 950px at 80% -12%, rgba(139,127,232,0.38), transparent 62%),
  radial-gradient(1100px 750px at 8% -4%, rgba(74,159,224,0.22), transparent 58%),
  radial-gradient(1000px 600px at 55% 105%, rgba(217,164,65,0.10), transparent 60%),
  var(--bg);
```
Violet dominant en haut à droite, bleu en haut à gauche, touche d'or en bas — à ajuster
en intensité si retour utilisateur, mais **ne pas revenir à des opacités ~0.07-0.10**
(c'était la v1, explicitement rejetée).

**Typographie** :
- `Space Grotesk` (700/600) — titres/marque uniquement (`--font-display`)
- `Plus Jakarta Sans` — **tout le reste** : corps de texte, chiffres, labels, badges
  (`--font-body` et `--font-mono` pointent tous les deux vers cette police ; les deux
  variables sont conservées pour ne pas casser les usages existants dans `style.css`,
  mais elles sont désormais identiques). Remplace Inter + JetBrains Mono. Chart.js
  (`Chart.defaults.font.family`) et le texte SVG de la jauge (`drawGauge()`) suivent le
  même changement — **si on ajoute un nouveau texte dessiné en Canvas/SVG, utiliser
  `'Plus Jakarta Sans', sans-serif'`, pas `JetBrains Mono`**.

**Composants clés** :
- Barre de marque : logo Wolf Analysis (ombre douce dorée) + titre **en blanc uni**
  (`var(--text)`, pas de dégradé — testé en dégradé or puis explicitement retiré,
  « c'est moche »). Pas de sous-titre sous le titre (l'ancien « Onglet Analyse » a été
  retiré, redondant avec les onglets juste en dessous) — **ne pas réintroduire `.brand-sub`**.
- Barre de recherche avec autocomplétion (remplace une ancienne liste d'onglets par
  entreprise, retirée car pas scalable avec beaucoup d'entreprises)
- Jauge de valorisation (SVG généré en JS) : positionne Prix Cible / Prix Juste / Prix
  Actuel sur une échelle colorée (zones vert/or/rouge) ; le badge de verdict a une légère
  lueur colorée assortie
- Cartes de ratios clés (grille 4 colonnes desktop, 2 mobile), plates (voir `--card-border`)
- Cartes de graphiques (Chart.js) : grille 3 colonnes desktop, bouton zoom (modale) sur
  chacune, badges CAGR sur 4 d'entre elles (lueur assortie pos/neg)
- Quadrillage des graphiques : **vertical retiré, seul l'horizontal conservé** (demande
  explicite, `grid:{display:false}` sur l'axe X, `baseGrid` conservé sur l'axe Y)
- Boutons principaux (Mettre à jour, plage temporelle active) : dégradé or + ombre-lueur
  au survol, au lieu d'un aplat uni
- Modale de zoom : fond flouté (`backdrop-filter:blur`) derrière le panneau, pour un effet
  "verre" plus premium qu'un simple overlay sombre. Pied de modale (`.zoom-footer`) aligné
  **à droite**, logo agrandi à 28px (au lieu de 16px centré comme au départ) — demande
  explicite pour renforcer l'image de marque sur les graphiques agrandis/partagés.
  Panneau agrandi (`min(1400px,96vw)`, `94vh`) suite à un retour utilisateur ("trop
  petit"). Sélecteur de plage 5/10/20/Max (`#zoomRangeRow`) + CAGR (`#zoomCagrRow`) sur
  les 8 graphiques historiques, voir `openZoom()`/`sliceChartConfigByYears()` dans app.js.
- Cartes de scénario (onglet Valorisation) : plates comme les autres cartes, mais
  **gardent** une bordure supérieure colorée de 3px par sémantique (vert Optimiste / bleu
  Réaliste / rouge Pessimiste, réutilisant `--green`/`--blue`/`--red` existants) — c'est
  un marqueur sémantique volontaire, pas une "bordure" au sens Finary à retirer. Sliders
  natifs `<input type=range>` stylés au thème.

## Fonctionnalités — état actuel

### Onglet Analyse (fait, fonctionnel)
- Header entreprise (logo, nom, ticker, secteur/sous-secteur, prix actuel)
- Jauge de valorisation + verdict (Survalorisée / Équitable / Zone d'achat)
- 8 ratios clés (prix juste, prix cible, écart, rendement dividende, rendement estimé
  5 ans, FCFPEG, médiane P/FCF, payout ratio). FCFPEG en couleur : vert si < 1, orange
  si 1–1,10, rouge si > 1,10 (classe `.warn` = `--gold`, ajoutée pour ce cas).
- Alerte de prix par seuil, programmable sous le prix actuel (voir "Onglet Alertes")
- Graphique cours de bourse hebdomadaire + moyenne mobile 200 semaines + sélecteur de
  plage (1a/2a/3a/5a/10a/20a/Max) — Yahoo Finance en source principale, repli automatique
  sur Stooq (voir "Cours de bourse" ci-dessous)
- 8 graphiques historiques : Dividende (barres) + Payout ratio (courbe), CA (courbe),
  Marge op.+ROIC (courbes), FCF/action (barres), P/FCF (barres) + Médiane P/FCF (courbe),
  Actions en circulation (courbe), Dette/OCF (barres), Trésorerie+investissements (barres)
- Badges CAGR sur 4 graphiques (Div 10a, CA 10a, FCF 10a, Actions 20a)
- Zoom modal réutilisable sur les 9 graphiques (dont le cours de bourse), avec mention
  "Données fournies par Wolf Analysis" + logo en pied de modale (branding)
- Recherche d'entreprise avec autocomplétion

### Onglet Wolf Portfolio (fait, fonctionnel)
Lit un **deuxième onglet du même Google Sheet publié** : "Wolf portefeuille"
(`PORTFOLIO_GID = "58524400"`, même `PUBLISHED_ID`/`SHEET_ID` que les données
principales, seul le gid change). Chargement séquentiel **après** les données
principales (`loadPortfolioData()` appelé en fin de `handleCsvRows()`), avec son
propre `responseHandler` gviz dédié (voir "Pièges techniques" point 9 — collision
avec le chargement principal sinon).

- **Mapping des colonnes** (`PCOL` dans `app.js`) : `V/W/X/Y` = actif / valorisation /
  investi / performance (une ligne par actif, dont "Cash") ; `AA/AD/AG/AJ/AM` = capital
  investi / valorisation totale / gains € / gains % / cash disponible (valeurs uniques
  du portefeuille, pas une par actif) ; `AP/AR/AT/AU` = mois / valorisation mensuelle /
  rendement mensuel / rendement total cumulé du portefeuille ; `AV/AW/AX` = performance
  mensuelle / performance totale cumulée / valorisation mensuelle du S&P 500 (`AQ`/`AS`
  vides, non utilisées). Le portefeuille a démarré en mars 2026.
- **Parsing par reconnaissance de contenu, jamais par position** (voir "Pièges
  techniques" point 10) : `handlePortfolioRows()` ignore les libellés d'en-tête connus
  ("ACTIF", "MOIS") et prend la première ligne où `capitalInvesti` parse comme un
  nombre pour les valeurs uniques du résumé.
- **Composition** : donut Chart.js agrandi (`height:560px` desktop, palette dédiée
  `PORTFOLIO_COLORS`, tons or/bleu uniquement — jamais de violet, réservé au décoratif,
  voir "Design system") + liste des positions triée par poids décroissant, avec logo
  (`portfolioEntityLogo()`, correspondance par nom avec `companies`, repli sur une
  initiale sinon, même pattern que `cerveauEntityCard()`), pourcentage du portefeuille
  et performance individuelle. **Logo Wolf Analysis au centre + logo de chaque position
  directement sur son segment** : deux plugins Chart.js custom
  (`portfolioCenterImagePlugin()`, `portfolioSegmentLogosPlugin()`, hooks
  `afterDatasetsDraw` — **pas `afterDraw`** : le plugin `tooltip` de Chart.js dessine
  aussi sur `afterDraw`, et s'exécute après les plugins custom passés dans
  `plugins:[]` — un logo dessiné sur `afterDraw` recouvrait donc l'infobulle au survol,
  la rendant illisible. `afterDatasetsDraw` est une phase distincte du cycle de rendu,
  garantie par Chart.js pour s'exécuter avant `afterDraw` quel que soit l'ordre
  d'enregistrement des plugins — fixe l'ordre de superposition demandé : segments +
  logo central en arrière-plan, logos de segment par-dessus, infobulle toujours au
  sommet. Un essai précédent avec `tooltip.position:'nearest'`/`caretPadding` était
  insuffisant, ce n'est pas un problème de position mais de phase de dessin),
  images préchargées et mises en cache (`loadImageCached()`/`portfolioImageCache`) —
  **surtout pas de `img.crossOrigin='anonymous'`** ici : ces logos ne sont jamais relus
  depuis le canvas (pas de `toDataURL`/`getImageData`), et l'exiger ferait échouer le
  chargement de tout logo dont l'hébergeur ne renvoie pas d'en-tête CORS (constaté avec
  le logo Air Liquide). Segment trop fin (< 2% du portefeuille) : pas de logo dessiné,
  pour éviter un rendu illisible.
- **Graphique Wolf Portfolio vs S&P 500** : courbes de rendement cumulé (`AU` vs `AW`)
  par mois, en filtrant les mois futurs pré-remplis dans le Sheet sans données
  (`rendementTotal`/`spxPerfTotale` tous les deux `null`). À côté, un second graphique
  en courbes pour la performance **mensuelle** (`AT` vs `AV`, même filtrage des mois
  vides), `renderPortfolioVsSpxMonthly()`.
- **Zoom sur le donut** (`openPortfolioZoom()`) : ne passe pas par le système générique
  `chartConfigs`/`openZoom()` (conçu pour les graphiques historiques avec plage/CAGR,
  pas pour un donut avec plugins custom) — réutilise juste `#zoomModal` directement.
  `buildPortfolioDonutConfig()` reconstruit une config Chart.js indépendante à chaque
  appel (normal + zoom) : réutiliser le même objet `options` entre deux instances
  Chart.js vivantes fait planter la seconde (Chart.js le mute en interne pour résoudre
  les valeurs scriptables comme `cutout`) — piège constaté en test, cf. CHANGELOG.

### Onglet Secteur (fait, fonctionnel)
- 11 secteurs GICS + bucket "Autre / non classé"
- Regroupement automatique des entreprises par secteur (normalisation par mots-clés
  depuis le champ `secteur` déjà présent dans les données, pas besoin d'un onglet
  Google Sheet séparé)
- Logos cliquables → ramènent sur l'onglet Analyse avec l'entreprise sélectionnée
  (délégation d'événements sur `data-nom`, pas d'attribut `onclick` inline — voir
  "Bugs corrigés" ci-dessous)

### Onglet Valorisation (fait, fonctionnel)
Simulations scénarisées pour estimer un prix cible à 5 ans, sur le modèle
« Prix Juste = FCF × Médiane P/FCF ». Aucun nouvel appel réseau : tout se base sur des
champs déjà présents dans `companies` (aucune nouvelle colonne `COL` nécessaire).

- **Données sources** (toutes déjà mappées) : `fcfParAction` (FCF actuel, colonne AM),
  `cagrFcf10` (colonne AO), `medianePFCF` (10 ans, colonne AQ), `medianePFCF20` (20 ans,
  colonne BH — affichée en 4e tuile du résumé à titre informatif, n'entre dans aucune
  formule), `prixActuel` par année (colonne H, déjà présent pour chaque ligne de `hist`
  — c'est la même donnée que le prix actuel affiché sur l'onglet Analyse, réutilisée
  telle quelle comme historique annuel de prix, **pas de nouvel appel réseau sur cet
  onglet**).
- **Formules** (`computeScenario()` dans `app.js`) :
  - `Prix Juste Sim.` = FCF actuel × Médiane P/FCF
  - `Prix Cible (-20%)` = Prix Juste Sim. × 0,8
  - `Prix Est. (5a)` = FCF actuel × (1 + CAGR FCF)^5 × Médiane P/FCF
  - `Rendement (5a)` = (Prix Est. 5a / Prix actuel)^(1/5) − 1
- **3 scénarios** (Optimiste vert / Réaliste bleu / Pessimiste rouge, mêmes tokens
  sémantiques que le reste du site) : `CAGR FCF Prévu` et `Médiane FCF` sont des sliders
  **librement ajustables par l'utilisateur** en temps réel (recalcul instantané des 4
  résultats + du graphique). Valeurs par défaut à la sélection d'une entreprise : Réaliste
  = valeurs historiques exactes, Optimiste = historique +5 points de CAGR / +3x de
  multiple, Pessimiste = historique −5 points / −3x — **ce ne sont que des points de
  départ**, l'utilisateur reconfigure ces curseurs pour chaque entreprise (confirmé
  explicitement, ne pas essayer de deviner de "meilleurs" écarts par défaut).
- **Graphique par scénario** : historique de prix annuel (courbe bleue) + ligne pointillée
  horizontale « Prix juste » (or) + ligne pointillée horizontale « Prix est. (5a) »
  (couleur du scénario) + « Ligne projection » en tirets (couleur du scénario, du dernier
  point historique jusqu'au point de projection à horizon+5 ans, labellisé `AAAA (Est.)`).
  **Bouton agrandir (⤢)** sur chaque carte de scénario, ouvre une modale dédiée
  `#scenarioZoomModal` — **pas** le système générique `#zoomModal`/`chartConfigs`
  (celui-ci ne pousse qu'un canvas isolé, insuffisant ici puisque l'utilisateur doit
  garder accès aux sliders CAGR/multiple, au FCF, au prix juste, à la médiane P/FCF
  10/20 ans en zoomant). `openScenarioZoom(key)` **déplace la carte `.scenario-card`
  existante dans le DOM** (`body.appendChild`) plutôt que de reconstruire un rendu
  séparé : sliders, résultats et canvas restent le même élément vivant, donc toujours
  synchronisés sans dupliquer la logique de rendu. `closeScenarioZoom()` la replace à
  sa position d'origine (`_zoomHome` retient le parent + le sibling suivant). Le
  `scenarioChart.resize()` est appelé après chaque déplacement (Chart.js ne détecte pas
  seul un changement de conteneur). La médiane P/FCF 10/20 ans (normalement seulement
  dans les tuiles de résumé au-dessus de la grille, invisibles une fois zoomé en plein
  écran) est dupliquée dans un bloc `.scenario-fcf-history`, présent dans le HTML de la
  carte mais `display:none` par CSS sauf sous `.scenario-card-zoomed`. **Tuile « Prix
  actuel »** ajoutée en premier dans le résumé (`#voPrixActuel`, donnée déjà en
  mémoire, aucun nouvel appel réseau).
- **Historique des objectifs** : fiche par entreprise où l'utilisateur peut enregistrer
  (bouton « Enregistrer cet objectif ») un instantané daté des 3 scénarios (CAGR + multiple
  de chacun). Chaque entrée a un bouton **« ↻ Charger »** (`applyObjectif(nom, idx)`) qui
  réapplique ses valeurs aux sliders des 3 scénarios et recalcule tout instantanément —
  demandé explicitement pour éviter de resaisir les curseurs à la main à chaque
  reconnexion. Persistance en `localStorage` (`wolfAnalysisObjectifs`), **pas d'écriture
  vers le Google Sheet** (source en lecture seule, décision explicite de l'utilisateur).
  Au chargement, `loadObjectifsBaseline()` essaie de `fetch('data/objectifs.json')` (socle
  committé dans le dépôt, `{}` par défaut — échec silencieux si absent/bloqué, non
  bloquant) puis fusionne avec le `localStorage` local. Bouton « Exporter » télécharge tout
  le store en JSON : **le flux de synchronisation multi-appareils passe par l'utilisateur
  et Claude**, pas par une écriture automatique — l'utilisateur exporte depuis le site,
  transmet le fichier en conversation, et Claude l'intègre dans `data/objectifs.json`
  (commit + push), qui redevient alors le socle chargé par tous les appareils au prochain
  fetch. **Ne pas implémenter d'écriture directe vers Google Sheets ou GitHub depuis le
  navigateur** (nécessiterait d'exposer des identifiants côté client — refusé
  explicitement après discussion des options avec l'utilisateur, voir aussi la contrainte
  "pas de backend" du projet).

### Onglet Classement (fait, fonctionnel)
Deux cartes, chacune divisée en **2 colonnes** pour ne pas s'étirer inutilement en
hauteur (`renderClassement()`, 4 conteneurs DOM au total) — aucune donnée nouvelle
(tout déjà mappé) :
- Meilleur rendement du dividende : `rendementDiv` (colonne V), tri décroissant, coupé
  en 2 colonnes de longueur égale (`classementDivLeft`/`classementDivRight`, numérotation
  continue 1..N — un pur découpage visuel de la même liste, pas deux classements
  distincts).
- Meilleure opportunité de valorisation : `ecartValeur` (colonne K), **séparée en deux
  groupes distincts** selon le signe plutôt qu'une seule liste triée mêlant les deux —
  `classementValoSous` (ecartValeur < 0, sous-valorisées, tri croissant = la plus
  intéressante en premier) et `classementValoSurvalo` (ecartValeur ≥ 0, survalorisées,
  tri croissant = la moins chère en premier). Sémantique inchangée : négatif =
  sous-valorisé = plus intéressant, positif = survalorisé — donnée par l'utilisateur
  pour ce classement précis ; distincte de la lecture "marge de sécurité" documentée
  plus haut pour la carte "Écart de valeur" de l'onglet Analyse, qui elle reste
  inchangée. Les deux widgets affichent la même donnée brute mais avec une intention de
  lecture différente — ne pas essayer d'unifier sans en reparler avec l'utilisateur.
`renderClassement()` reconstruit les deux listes à chaque chargement de données. Clic sur
une ligne → `goToAnalyse(nom)`.
- **Filtre secteur** : sélecteur `#classementSecteurFilter` (peuplé une fois via
  `populateClassementSecteurFilter()`, réutilise `GICS_SECTORS` + "Autre / non classé"),
  restreint les deux listes au secteur choisi via `normalizeSector()` sur `latest.secteur`
  de chaque entreprise. "Tous les secteurs" (valeur vide) = comportement d'origine.

### Onglet Watchlist (fait, fonctionnel)
4 colonnes (Liste d'achat / Idée du moment / À surveiller / À analyser) + un "pool" en
haut avec toutes les entreprises non classées. Glisser-déposer HTML5 natif
(`draggable="true"`, `dragstart`/`dragover`/`drop`) : une entreprise appartient à 0 ou 1
liste à la fois — la déplacer d'une liste à l'autre la retire automatiquement de
l'ancienne (`moveToWatchlist(nom, listKey)`, `listKey=null` = retour au pool). Clic sur
un logo (hors drag) → `goToAnalyse(nom)`. Persistance identique au pattern de l'onglet
Valorisation : `localStorage` (`wolfAnalysisWatchlist`) + `data/watchlist.json` en socle
+ bouton Exporter (JSON) + bouton **Exporter PDF** (`exportWatchlistAsPdf()`, les 4
listes en tableaux, voir "Export PDF" plus bas). Recherche (`#watchlistSearch`) filtre
le pool en direct (`applyWatchlistSearchFilter()`, `stripAccents()`) pour trouver une
entreprise sans scroller.

### Onglet Alertes de prix (fait, fonctionnel)
Widget sous le prix actuel de l'onglet Analyse (`#priceAlertWidget`,
`renderPriceAlertWidget()`) pour programmer un ou **plusieurs** seuils par entreprise —
`alertesStore[nom]` est un tableau (`[{id, seuil, direction}, ...]`), pas un objet
unique (ancien format à un seul seuil migré automatiquement au chargement par
`migrateAlertesFormat()`, sans perte). Formulaire inline (pas de `prompt()`, voir
"Pièges techniques" point 7). Direction (`up`/`down`) déduite une fois à la création
selon que le seuil est au-dessus ou en dessous du prix du moment (`addAlerte()`), pour
rester cohérente même si le prix oscille ensuite. Onglet dédié
(`#alertesList`, `renderAlertesTab()`) liste toutes les alertes programmées, mise en
évidence visuelle (bordure/lueur or) si le seuil est atteint. **Pas de notification ni
d'email** (décision explicite avec l'utilisateur : une vraie alerte en arrière-plan
nécessiterait un backend planifié, hors périmètre actuel — voir "Demandé, non
commencé"). Persistance : `localStorage` (`wolfAnalysisAlertes`) + `data/alertes.json` +
bouton Exporter.

### Onglet Idées de développement (fait, fonctionnel)
Bloc-notes à 3 priorités fixes (`IDEES_CATS` : urgent / bientôt / plus_tard), case à
cocher par idée (`item.done`), bouton « + Ajouter » à côté de chaque champ (pas
seulement Entrée — leçon retenue après un retour utilisateur : un champ texte sans
bouton visible n'est pas assez découvrable). Persistance identique aux autres onglets :
`localStorage` (`wolfAnalysisIdees`) + `data/idees.json` + bouton Exporter (JSON, inclut
aussi l'archive sous la clé `archive`) + bouton **Exporter PDF**
(`exportIdeesAsPdf()`).
- **Archivage mensuel automatique** (`checkAndArchiveIdeesIfNewMonth()`, appelé à
  chaque chargement de `loadIdeesBaseline()`) : pas de vrai cron possible sans backend
  (site 100% statique — même limite que les alertes de prix, voir "Onglet Alertes de
  prix"), donc le déclenchement se fait **à l'ouverture du site** : le mois courant
  (`YYYY-MM`) est comparé au dernier mois connu (`localStorage`,
  `wolfAnalysisIdeesLastMonth`) ; si un nouveau mois a commencé et que la liste active
  contient au moins une idée, un instantané daté est ajouté à `ideesArchive`
  (`localStorage` séparé `wolfAnalysisIdeesArchive`, fusionné avec `data/idees.json` au
  chargement via la clé `archive`) — **la liste active n'est jamais vidée**, elle
  continue d'évoluer normalement. Rien n'est archivé au tout premier lancement (pas de
  mois précédent à figer) ni si la liste était vide ce mois-là. Consultation en lecture
  seule via une rangée de pastilles mensuelles sous les 3 colonnes actives
  (`ideesArchiveViewHtml()`), un clic affiche/masque le contenu du mois choisi.

### Onglet Cerveau numérique (fait, fonctionnel)
Base de connaissances visuelle : 11 secteurs GICS (+ "Autre") navigables → chaînes de
valeur créées librement par l'utilisateur (nom + phases personnalisées, ex. Amont/
Transformation/Distribution/Services) → entreprises assignées par phase (texte libre,
pas forcément des entreprises suivies dans le Sheet) → fiche par entité avec entrées
datées (texte + images uploadées/collées + croquis à main levée).

- **11 secteurs pré-structurés** au sens navigation seulement : les containers existent
  dès le départ (réutilise `GICS_SECTORS`), mais les chaînes de valeur et leurs phases à
  l'intérieur sont **vides et créées par l'utilisateur** — pas de taxonomie GICS
  fabriquée automatiquement (décision explicite, l'utilisateur a le domaine d'expertise,
  pas Claude).
- **Stockage IndexedDB** (`wolfAnalysisCerveau`, un seul object store `state`, tout l'état
  imbriqué dans un seul enregistrement `'state'`) — **pas `localStorage`**, volontairement,
  car les images en base64 dépasseraient vite son quota (~5-10 Mo). `persistCerveauData()`
  réécrit l'objet entier à chaque changement (`structuredClone` interne d'IndexedDB, pas
  de coût de sérialisation JSON comme localStorage). `data/cerveau.json` sert de socle
  optionnel (même pattern que les autres onglets), fusionné au chargement puis complété
  par IndexedDB. Bouton « Exporter » sur la vue "Secteurs" (niveau racine).
- **Modèle de données** : `cerveauData = { chains: { [secteurKey]: [{id, nom, phases:
  [{nom, entreprises:[{nom,image,legende},...], blocsLibres:[{image,texte},...]}]}] },
  notes: { [nomEntite]: [{date, texte, images: [dataURL,...], sketches:[dataURL,...]}] },
  analyses: { [nomEntite]: [{id, label, dateCreated, dateModified, sections:{...},
  revenusPays:[], revenusSecteurs:[], actionnariat:[], concurrents:[]}, ...] } }`. Les
  clés de `notes`/`analyses` sont des noms libres (pas forcément dans `companies`) —
  `cerveauEntityCard()` affiche le vrai logo si l'entité correspond à une entreprise
  suivie, sinon une initiale. **`ph.entreprises` a changé de forme** : anciennement un
  tableau de noms (string), désormais un tableau d'objets `{nom, image, legende}` pour
  porter une image de couverture par entreprise (voir plus bas) — `migrateCerveauChains()`
  convertit automatiquement toute ancienne entrée string au premier chargement, sans
  perte (même logique que `migrateAlertesFormat()`).
- **Cartes entreprise illustrées dans les 4 phases** (`cerveauEntityCard()`,
  `renderCerveauPhases()`) : chaque entreprise ajoutée à une phase est une carte avec
  sa propre image de couverture (upload fichier **ou** URL collée, éditée directement
  sur place — clic sur la zone image, sans ouvrir de fenêtre), une légende courte
  (`<input>` toujours visible, sauvegarde au blur), et un bouton **« 📇 Ouvrir la fiche »**
  net et libellé (remplace l'ancienne puce texte+logo minuscule qui servait à la fois de
  zone cliquable ET de seul accès à la fiche — peu découvrable et peu lisible). Cliquer
  sur le nom ouvre aussi la fiche (raccourci, en plus du bouton). Bouton ✕ dédié pour
  retirer l'entreprise de la phase. **Zone libre par phase** (`ph.blocsLibres`, bouton
  « + Bloc libre (image / texte) ») : mêmes mécaniques d'image que les cartes entreprise,
  plus un `<textarea>`, pour du contenu qui n'est pas rattaché à une entreprise précise —
  permet de composer visuellement la phase (image + note) sans forcément passer par une
  entité suivie. Champ « Ajouter une entreprise » : `<input list="cerveauCompanyList">`
  avec une `<datalist>` peuplée des entreprises déjà suivies (logo garanti si on
  sélectionne une suggestion), tout en gardant la saisie 100% libre pour une entreprise
  hors Sheet. Toutes les zones image (cartes ET blocs libres) partagent un seul
  `<input type=file>` caché (`#cerveauImageFileInput`) réutilisé via
  `cerveauImagePickerTarget` (référence directe à l'objet `{image}` en cours d'édition,
  posée juste avant `.click()` sur l'input cachée) — même famille de pattern que
  `draggedImageRef` pour le glisser-déposer des images de l'Analyse développée.
- **Tailles de bloc et réorganisation** : chaque carte entreprise et bloc libre a un
  champ `taille` (`S`/`M`/`L`, migration automatique à `M` pour les entrées existantes
  sans ce champ) et un bouton cycle (⤢, `data-action="ent-size"`/`"free-size"`) qui
  fait défiler les 3 tailles — CSS `[data-taille="S"|"L"]` ajuste largeur de la carte et
  hauteur de la zone image. **Glisser-déposer pour réordonner** les cartes entre elles
  ET les blocs libres entre eux (`wireCerveauBlockDrag()`, `draggedCerveauBlockRef`,
  même famille de pattern que `draggedImageRef`) — **pas de glisser inter-listes** (une
  carte entreprise ne peut pas devenir un bloc libre, les deux types ne partagent pas
  le même tableau de données), le `drop` est ignoré si la liste cible n'est pas celle
  d'origine.
- **Fiche entité** (`openFiche(nom)` / modale `#ficheModal`) : journal append-only (une
  nouvelle entrée par sauvegarde, jamais d'édition rétroactive — même logique que
  l'historique des objectifs). Éditeur : `<textarea>` + upload d'images (`<input
  type=file multiple>`, converties en data URL via `FileReader`) + croquis à main levée
  (`<canvas>` avec dessin souris/tactile, couleur au choix, bouton Effacer) sauvegardé en
  PNG data URL à l'enregistrement de l'entrée.
- **Navigation interne** : état `cerveauView` (`{level:'secteurs'}` /
  `{level:'chaines', secteur, creatingChain?}` / `{level:'phases', secteur, chainId}`), un
  seul `renderCerveau()` qui redessine `#cerveauContent` selon le niveau, fil d'Ariane
  cliquable.
- **Création de chaîne** : formulaire en ligne (nom + phases, boutons Créer/Annuler),
  affiché quand `cerveauView.creatingChain === true`. **Ne pas revenir à `prompt()`** pour
  cette interaction — voir "Pièges techniques" point 7 (crash silencieux constaté).
- **Analyse développée** (`openAnalyse(nom)` / modale `#analyseModal`, distincte de
  `#ficheModal`) : trame fixe de blocs texte+images répartie en 3 groupes affichés dans
  cet ordre — `CERVEAU_ANALYSE_SECTIONS_TOP` (présentation), puis 2 graphiques revenus
  côte à côte + concurrents, puis `CERVEAU_ANALYSE_SECTIONS_MID` (marché, moat, secteurs
  d'activité, perspectives, risques), puis le graphique actionnariat, puis
  `CERVEAU_ANALYSE_SECTIONS_BOTTOM` (ratios, conclusion — **toujours en dernier**).
  Revenus et concurrents remontés en haut de la fiche à la demande explicite de
  l'utilisateur (« je ne veux pas à la fin, juste avant la conclusion » — l'ordre
  précédent, hérité de la conception initiale, ne convenait pas pour un usage vidéo où
  ces infos doivent apparaître tôt).
  - **3 graphiques camembert Chart.js** (`revenusPays`, `revenusSecteurs`,
    `actionnariat`), tous rendus par le même composant `analyseChartSectionHtml(key,
    rows)` (remplace l'ancien `analyseRevenusHtml()` dédié). **Saisie en valeurs
    brutes, jamais en pourcentage** : chaque ligne est `{label, valeur}` (ex. montant
    en Md€ par secteur), l'app calcule `total` et le `pct` de chaque ligne à
    l'affichage uniquement — le graphique Chart.js reçoit directement les `valeur`
    brutes (Chart.js proportionne lui-même les parts du camembert, pas besoin de
    pré-calculer un pourcentage). Demande explicite : l'utilisateur dispose des
    montants bruts, pas des pourcentages, « c'est à nous de le calculer ».
  - **Mise en page 2 colonnes** pour revenus pays/secteur (`.analyse-charts-row`,
    `grid-template-columns:1fr 1fr`, empile en 1 colonne sous 1100px) — graphique
    dominant, tableau de saisie compact en dessous (`.analyse-chart-table`, hauteur
    plafonnée avec scroll interne). Actionnariat reste seul (pas de mise en 2 colonnes,
    pas de graphique jumeau).
  - **Bouton agrandir (⤢)** sur chaque graphique (`data-chart-zoom="${key}"` →
    `openAnalyseChartZoom(key)`) : réutilise `#zoomModal` (pas le système générique
    `chartConfigs`/`openZoom` conçu pour les 8 graphiques historiques — celui-ci vide
    juste `#zoomRangeRow`/`#zoomCagrRow` et pousse une config Chart.js construite à la
    volée à partir des `rows` du bloc). `#zoomModal` a un `z-index:1000` (contre `999`
    pour `#analyseModal`/`#ficheModal`) précisément pour pouvoir s'ouvrir imbriqué
    par-dessus la modale Analyse développée.
  - **Suppression d'une fiche** (`#analyseDeleteBtn` → `deleteAnalyseVersion()`) :
    confirmation en **2 clics** inline (1er clic → le bouton devient « ⚠️ Confirmer la
    suppression ? », 2e clic → suppression réelle), **jamais `confirm()` natif** (voir
    "Pièges techniques" point 7). Supprime uniquement la version courante de
    `cerveauData.analyses[nom]` ; s'il en reste, bascule sur la dernière restante,
    sinon ferme la modale. `analyseDeleteConfirming` est remis à `false` (et le texte
    du bouton restauré) à chaque `renderAnalyse()`, pour ne jamais rester coincé en
    état "confirmation en attente" après un changement de version/section.
  - **Images par bloc** (`analyseImagesHtml()`/`wireAnalyseImageEvents()`, partagé
    entre les sections fixes et chaque concurrent via `ownerAttr` = `data-key` ou
    `data-competitor`, résolu par `analyseImagesArrayFromEl()`) : upload fichier **ou**
    ajout par **URL collée** (logo d'entreprise typiquement, sans avoir besoin de le
    télécharger d'abord). Vignettes à `260×180px` (`object-fit:cover`) — volontairement
    grandes pour rester lisibles à l'écran dans un contexte de vidéo YouTube (demande
    explicite). **Glisser-déposer pour réordonner** les images au sein d'un même bloc
    (`draggedImageRef = {arr, idx}` retient la référence directe du tableau source posé
    au `dragstart`, le `drop` sur une autre vignette fait un `splice` sortie/insertion
    dans ce même tableau — pas de réordonnancement inter-blocs, le `drop` est ignoré si
    la vignette cible n'appartient pas au même tableau que la source). **Zoom sur une
    image** : clic sur une vignette → `openImageZoom(src)`, lightbox légère et
    indépendante (`#imageZoomModal`, pas liée à `#zoomModal`/Chart.js).
  - **Contrairement au journal (`notes`, append-only), c'est une fiche qu'on modifie
    sur place** — mais dupliquable (`duplicateAnalyseVersion()`, clone profond via
    `JSON.parse(JSON.stringify())`) pour garder plusieurs versions datées sans jamais
    écraser une version existante (demande explicite : l'entreprise évolue, l'ancienne
    analyse doit rester consultable, et si erreur de saisie l'utilisateur veut pouvoir
    supprimer une version plutôt que la corriger à la main). Sauvegarde explicite
    (bouton, pas d'auto-save à chaque frappe) : les champs texte/listes modifient
    l'objet `v` en mémoire directement au fil de la saisie, `saveAnalyseVersion()`
    persiste sur IndexedDB. Deux points d'entrée : bouton 📊 dans `#ficheModal`
    (`openAnalyseFromFiche()`) et tag « 📊 Analyse développée » dans l'en-tête de
    l'onglet Analyse (`#openAnalyseTag`, pour l'entreprise actuellement affichée).

### Export PDF (fait, fonctionnel)
Bouton « 🖨 Exporter PDF » sur 5 cibles : Idées de développement, Watchlist,
composition Wolf Portfolio, fiche Analyse développée, chaîne de valeur du Cerveau
numérique. **Choix technique explicite : `window.print()` + une feuille `@media print`
dédiée, pas de librairie externe** (jsPDF/html2canvas auraient ajouté une dépendance
CDN de plus — le site a déjà dû contourner ce genre de fragilité pour Chart.js, voir
"Pièges techniques" point 1 — pour un gain marginal, `window.print()` fait déjà tout le
travail nativement). **Ne pas réintroduire de librairie PDF sans en rediscuter.**

- **Mécanisme partagé** (`exportSectionAsPdf(title, subtitle, bodyHtml)`) : construit
  le HTML imprimable dans une zone dédiée `#printArea` (toujours `display:none` à
  l'écran) avec un en-tête brandé (logo Wolf Analysis + titre + date), puis appelle
  `window.print()`. La feuille `@media print` (fin de `style.css`) masque tout LE RESTE
  de la page (`body > *:not(#printArea)`) et n'affiche que `#printArea` — le navigateur
  propose « Enregistrer en PDF » nativement dans sa boîte de dialogue d'impression, pas
  besoin d'un vrai clic "télécharger" séparé. Classes utilitaires partagées :
  `.print-section` (bloc avec titre `<h3>`), `.print-img-row`/`.print-chart-img`
  (images), `.print-table` (tableaux). **Habillage sombre + or reprenant le design
  system de l'app** (fond `var(--bg)`, cartes `var(--panel-2)`, titres en or,
  `Space Grotesk`) plutôt qu'un style blanc générique — demande explicite ("ça doit
  ressembler fortement à l'application"). `*{print-color-adjust:exact}` force
  l'impression des fonds de couleur (sans quoi certains navigateurs les ignorent par
  défaut pour économiser l'encre) — la case « graphismes d'arrière-plan » de la boîte
  de dialogue d'impression doit rester cochée côté utilisateur, hors de portée du CSS.
- **Graphiques Chart.js capturés en image** (`chartCanvasToImgHtml(canvasId)`, via
  `canvas.toDataURL('image/png')`) — un `<canvas>` ne peut pas être déplacé/cloné dans
  `#printArea` sans perdre son rendu (Chart.js dessine sur un contexte précis).
  Fonctionne directement sur les 3 graphiques camembert de l'Analyse développée (aucune
  image externe dessinée dessus, jamais tainté). **Ne fonctionne PAS sur le donut
  Portfolio** (tainté par les logos de position dessinés sans `crossOrigin`, voir
  "Pièges techniques" point 13) — `buildPortfolioExportChartImg()` reconstruit à la
  place un donut jetable hors-écran, sans les plugins de logos custom, uniquement pour
  cet export.
- **JSON reste le format de synchronisation multi-appareils** (voir "Conventions de
  code") — le PDF est un format de lecture/partage en plus, jamais un remplacement :
  ne pas faire dépendre `data/*.json` d'un export PDF.

### Palette graphiques (fait)
`THEME` expose `blue` (`css.getPropertyValue('--blue').trim()`) en plus de `gold`. Les
9 graphiques Chart.js (dont le cours de bourse) utilisent uniquement or/bleu pour leurs
séries de données. Vert/rouge restent réservés au sémantique positif/négatif : badges
CAGR (classes CSS `.pos`/`.neg`) et jauge de valorisation (marqueurs CIBLE/JUSTE/ACTUEL).

### Cours de bourse — historique Sheet dédié (source principale) + repli Yahoo/Stooq (fait)
**Source principale : onglet Google Sheet dédié** (`PRICE_HISTORY_GID = "1420785203"`,
même fichier/`PUBLISHED_ID` que le reste, chargé en parallèle du Portfolio via son
propre `responseHandler` gviz `__handlePriceHistoryGviz` — voir "Pièges techniques"
point 9, 3e source gviz simultanée sur la page). L'utilisateur y a saisi lui-même 20 ans
de clôtures hebdomadaires par entreprise pour contourner le manque de fiabilité du
relais CORS Yahoo/Stooq (voir plus bas). **Mise en page réelle du Sheet (différente de
sa description verbale initiale, vérifiée directement par lecture du CSV publié avant
d'écrire le parsing — voir "Pièges techniques" point 10)** : row1 = nom d'entreprise
dans les colonnes **paires** 0-indexées (A, C, E…), row2 = libellés "Date,Close" sans
intérêt, row3+ = données. **Chaque entreprise a sa propre paire [colonne date, colonne
clôture]** juste avant sa colonne de clôture — **pas d'axe de dates partagé en colonne
A** comme décrit verbalement au départ : les historiques démarrent à des dates
différentes selon l'entreprise (ex. Ferrari démarre en 2016, TotalEnergies en 2006),
donc `handlePriceHistoryRows()` apparie toujours une clôture à la date de **sa propre**
colonne, jamais à une colonne de référence commune. Correspondance avec `companies` par
nom (`findPriceHistoryForCompany()`, `stripAccents()` + `trim()` + casse insensible,
même pattern que `portfolioEntityLogo()`) — les 20 entreprises du Sheet correspondent
toutes exactement aux entreprises suivies (vérifié en test), mais si un nom ne matche
pas, l'entreprise bascule simplement sur le repli Yahoo/Stooq ci-dessous, sans erreur.
`fetchPriceHistorySeries(nom)` repasse les points par `resampleWeekly()` (même fonction
que le chemin Yahoo) par sécurité/cohérence, même si la cadence est déjà hebdomadaire.

**Repli automatique : Yahoo Finance + Stooq**, inchangés, utilisés uniquement pour une
entreprise absente du Sheet dédié. `loadStockChart(ticker, nom)` tente d'abord la
source Sheet (via `nom`) ; si absente, `fetchYahooWeekly()` — qui malgré son nom
récupère du **quotidien** via `period1`/`period2` explicites (pas `range=max`, voir
"Pièges techniques" point 3) puis rééchantillonne en hebdomadaire côté client
(`resampleWeekly()`). Mapping `mapTickerToYahoo` : `.PA` Paris, pas de suffixe
Nasdaq/NYSE, `.L` Londres, `.DE` Francfort, `.AS` Amsterdam, `.MC` Madrid, `.MI` Milan,
`.SW` Suisse, `.T` Tokyo. En cas d'échec, repli sur `fetchStooqWeekly()` (mapping
`mapTickerToStooq`). La source active et le symbole utilisé sont affichés sous le
graphique (`#stockSourceNote`). En cas d'échec des trois sources, message d'erreur
explicite et actionnable dans `#stockStatus` (jamais d'échec silencieux). Sélecteur de
plage (1a/2a/3a/5a/10a/20a/Max, `#rangeButtons`) recalcule l'affichage sans refaire de
fetch. **Canal de régression linéaire** (`computeRegressionChannel()`) superposé au
graphique : moyenne ± 1/2 écarts-types calculés sur les 20 dernières années de clôtures
hebdo (ou tout l'historique dispo si plus court), indépendant du sélecteur de plage —
sur une plage plus courte on ne voit qu'un extrait du même canal. **Palette du
graphique boursier** (`renderStockChart()`, revue complète — pas les couleurs
sémantiques habituelles pos/neg du reste du site, ce sont des repères visuels/
statistiques) : clôture hebdo en **blanc** (`THEME.white`), moyenne mobile **200
semaines** en **jaune gras** (`THEME.yellow`, `borderWidth:2.5`), moyenne mobile
**30 semaines** (nouvelle, `computeSMA(closes,30)`) en **violet fin** (`THEME.violet`
— seule exception au design system, où le violet est autrement "jamais utilisé pour de
la donnée", décidée explicitement par l'utilisateur pour cette ligne précise), ligne de
régression centrale toujours en rouge, et les **4 bandes d'écart-type (±1σ, ±2σ) en
bleu pointillé uniformément** (avant : ±1σ bleu, ±2σ rouge pointillé — simplifié à la
demande explicite).

**Piège confirmé — ni Yahoo ni Stooq n'ont de CORS.** Aucun des deux endpoints
n'envoie `Access-Control-Allow-Origin` (vérifié directement), donc un `fetch()` direct
depuis un navigateur est **toujours** bloqué, quel que soit l'hébergement — pas un
problème de `file://`. Fix en place : relais via `corsProxyUrls()`, qui renvoie
**plusieurs** proxies (allorigins.win puis corsproxy.io) essayés en séquence par
`fetchWithRetry()` (12s chacun). **Chaque relais pris isolément reste instable** —
confirmé par tests répétés en conditions réelles (parfois <1s, parfois 15-40s ou échec
pur), mais rarement les deux en même temps : essayer plusieurs proxies en chaîne est
la vraie amélioration de fiabilité, pas juste augmenter le délai sur un seul. Si un
échec total malgré la chaîne se reproduit souvent, ajouter un 3e proxy à
`corsProxyUrls()` est plus simple que de tout réécrire. Piste alternative si le besoin
de fiabilité totale se confirme un jour : **Twelve Data** (`api.twelvedata.com`), qui
envoie `Access-Control-Allow-Origin: *` en direct (vérifié, y compris pour du Euronext
Paris), donc plus besoin de proxy du tout — nécessite une clé API gratuite (inscription
~10s, sans CB) à obtenir par l'utilisateur. **Maintenant secondaire depuis l'ajout du
Sheet dédié** : ne concerne plus que les entreprises hors de cet onglet.

*(Historique : un widget TradingView a brièvement remplacé cette solution, abandonné
suite à une limitation de données bloquante pour les bourses non-américaines — voir
"Pièges techniques" point 8. Ne pas le réintroduire pour le cours de bourse principal
sans un moyen de contourner cette limitation.)*

### Bugs corrigés
- **Onglet Secteur inerte** : les boutons `.page-nav-btn` (Analyse/Secteur) n'avaient
  aucun `addEventListener('click', ...)` — `switchPage()` existait mais n'était jamais
  appelée. Corrigé en bas de `app.js` juste avant `initSearch()`.
- **HTML cassé sur les logos du regroupement sectoriel** : `onclick="goToAnalyse(${JSON.stringify(c.nom)})"`
  imbriquait des guillemets doubles dans un attribut HTML lui-même délimité par des
  guillemets doubles, cassant le parsing dès qu'un nom d'entreprise contenait un
  caractère spécial. Remplacé par un attribut `data-nom` + délégation d'événements
  (`initSectorGrid()`), plus robuste (fonctionne aussi avec des noms du type « L'Oréal »).
- **(historique) Moyenne mobile 200 semaines jamais franchie par le cours** : les données
  Yahoo Finance récupérées étaient mensuelles et non hebdomadaires — la "SMA 200" était
  donc lissée sur ~17 ans au lieu de ~4 ans. Point sans objet depuis le passage au widget
  TradingView (code retiré), conservé pour mémoire (voir "Pièges techniques" point 3).
- **Bouton « Exporter » de l'onglet Valorisation trop étroit** : `.zoom-btn` (règle
  déclarée plus loin dans `style.css`) écrasait le `width:auto` de `.objectifs-export` à
  spécificité CSS égale (voir "Pièges techniques" point 5). Corrigé en spécifiant
  `.objectifs-actions .objectifs-export`.
- **Verallia mal classée dans l'onglet Secteur** (finissait dans "Autre / non classé" au
  lieu de "Matériaux") : accentuation incohérente dans la colonne `secteur` du Sheet
  ("Materiaux" vs "Matériaux" selon la ligne, voir "Pièges techniques" point 6). Corrigé
  avec `stripAccents()` dans `normalizeSector()`.
- **Cerveau numérique : impossible de créer une chaîne de valeur / impression d'être
  bloqué sans retour arrière possible** : `prompt()` levait une exception dans certains
  contextes navigateur au lieu de retourner une valeur (voir "Pièges techniques" point 7),
  plantant le clic avant toute création — la navigation retour fonctionnait en réalité
  très bien (testé indépendamment), mais l'utilisateur n'avait jamais rien à voir puisque
  la création elle-même échouait silencieusement. Corrigé en remplaçant les deux
  `prompt()` par un formulaire en ligne (nom + phases, boutons Créer/Annuler).
- **Bouton « 📊 » de la fiche journal (Cerveau numérique) ouvrait toujours l'Analyse
  développée de « null »** au lieu de la bonne entreprise (`openAnalyseFromFiche()`
  appelait `closeFiche()` — qui remet `ficheEntite` à `null` — **avant** de lire
  `ficheEntite` comme argument de `openAnalyse()`). Symptôme décrit par l'utilisateur
  comme intermittent (« des fois ça ne marche pas ») alors qu'en réalité ce point
  d'entrée précis échouait **systématiquement** ; l'autre point d'entrée (tag
  « 📊 Analyse développée » sur l'onglet Analyse, qui passe le nom directement sans
  passer par `closeFiche()`) fonctionnait normalement, d'où l'impression d'aléatoire.
  Corrigé en capturant le nom dans une variable locale avant l'appel à `closeFiche()`.
- **Sélecteur d'entreprise (Cerveau, champ « Ajouter une entreprise ») n'ajoutait rien
  au clic sur une suggestion** : seul `keydown Enter` déclenchait l'ajout — cliquer une
  option de la `<datalist>` avec la souris ne déclenche pas d'événement clavier, donc
  le champ se remplissait sans que rien ne se passe. Corrigé en ajoutant un listener
  `input` qui soumet automatiquement dès que la valeur correspond exactement à une
  entreprise suivie (donc bien une suggestion choisie, pas juste une frappe en cours).

### Onglet Macroéconomie (fait, 3 sur 4 sections — la 4e attend des clés API)
3 sources sur le même Sheet publié, gids dédiés, chargées en parallèle du reste
(`loadMacroCycleData()`/`loadMacroRotationData()`/`loadMacroPowerData()`, tous les
trois via `loadSheetDual()` — factory générique CSV+gviz+responseHandler dédié,
introduite ici pour ne pas réécrire 3 fois de plus le boilerplate déjà dupliqué pour
Portfolio/historique de prix). `colToIdx('AB')` convertit une lettre de colonne Sheet
en index 0-based, utilisé partout dans ce module plutôt que des indices en dur.

- **Cycle de Marché — Offensif vs Défensif** (`MACRO_CYCLE_GID = "1014329874"`) :
  ratio (Technologie + Finance + Industrie) / (Santé + Conso. de base + Services
  publics), **déjà calculé dans le Sheet** (colonnes AV=ratio, AW=EMA20, AX=écart-type,
  AY/AZ=±2σ, BA/BB=±1σ, BD/BE=flags Euphorie/Panique) — lu tel quel, aucun recalcul
  côté app. Colonne date G, commune à tout l'onglet (vérifiée alignée pour toutes les
  entreprises avant d'écrire le parsing). **Piège trouvé et corrigé** : la colonne
  Technologie donnée par l'utilisateur (K) contenait en réalité le prix brut XLK/100,
  pas un ratio — la vraie colonne (nommée `Technologie`, même schéma que les autres
  secteurs) est O (voir "Pièges techniques" point 14). Sélecteur de plage 5/10/20 ans/
  Max (`#macroCycleRangeButtons`, même pattern que le cours de bourse), badge Euphorie/
  Panique/Neutre basé sur les 2 dernières colonnes flag, bouton zoom dédié
  (`openMacroCycleZoom()`, réutilise `#zoomModal` avec une config reconstruite —
  pas de sliders ici contrairement au zoom scénario, donc pas besoin de déplacer un
  élément DOM vivant).
- **Rotation Sectorielle GICS vs S&P 500** (`MACRO_ROTATION_GID = "1706659327"`) :
  11 secteurs déjà exprimés en ratio rebasé (~1.00 au début de la fenêtre disponible
  sur cet onglet, ~3 ans d'historique) — **pas de série S&P 500 séparée à tracer**,
  chaque secteur est déjà "vs S&P 500" ; une ligne de repère horizontale à 1.00 sert de
  référence visuelle (confirmé par la capture de référence de l'utilisateur : sa
  légende ne liste que les 11 secteurs, pas de S&P 500). Pas de sélecteur de plage
  (l'onglet source n'a que ~3 ans de données, un sélecteur 10/20 ans n'aurait pas de
  sens). Bouton zoom (`openMacroRotationZoom()`), même pattern que ci-dessus.
- **Tableau de force relative sectorielle** (`MACRO_POWER_GID = "30985186"`, onglet
  "Dashboard cycle") : **seul tableau de tout le projet dont le parsing utilise des
  positions de ligne fixes** (lignes 12 à 24, colonnes P à AA) plutôt qu'une
  reconnaissance de contenu — exception volontaire au principe habituel (voir "Pièges
  techniques" point 10) car ce n'est pas un onglet "tableau de bord" à plusieurs blocs
  avec espacements variables comme Wolf Portfolio, juste un unique petit bloc à mise en
  page stable, vérifiée directement sur le CSV réel avant d'écrire le code. Ligne 12 =
  catégorie (Sensible/Défensif/Cyclique, affichée en sous-texte sous chaque en-tête de
  colonne), ligne 14 = noms de secteur (lus depuis le Sheet, pas codés en dur), lignes
  15-24 = les 10 mesures (Classement, Power 1 an, Power 3 mois, puis performance
  1/2/3/6 mois et 1/2/3 ans) × 11 secteurs. **Coloration automatique** par seuil sur
  chaque cellule (`macroPowerColorClass()`) : < -3% rouge vif (`.mp-red-strong`), entre
  -3% et 0% rouge clair (`.mp-red-light`), entre 0% et 5.5% vert clair
  (`.mp-green-light`), ≥ 5.5% vert vif (`.mp-green-strong`) — seuils donnés
  explicitement par l'utilisateur. Tableau scrollable horizontalement (`overflow-x`),
  première colonne (libellés de ligne) fixée en `position:sticky`.
- **Indicateurs macroéconomiques US** (PIB, consommation, investissement, dépenses
  publiques, balance commerciale, taux à 10/2 ans, spread, inflation, taux réel) — **en
  attente de 2 clés API gratuites fournies par l'utilisateur**, voir section suivante.
  `renderMacroFundamentalsPlaceholder()` affiche un message explicite avec les liens
  d'inscription en attendant, plutôt qu'un bloc vide sans explication.

#### Automatisation prévue : BEA (direct) + FRED (via relais CORS)
Décision prise avec l'utilisateur après vérification technique (`curl` sur les deux
API avec une clé factice, en observant la présence ou non de l'en-tête
`Access-Control-Allow-Origin`) :
- **API BEA** (`apps.bea.gov/api/data`, données PIB/NIPA : consommation, investissement,
  dépenses publiques, balance commerciale) — **envoie `Access-Control-Allow-Origin: *`**
  (vérifié), donc appelable en direct depuis le navigateur, sans proxy. Clé gratuite,
  inscription instantanée, sans CB (`apps.bea.gov/API/signup/`).
- **API FRED** (`api.stlouisfed.org/fred`, séries `DGS10`/`DGS2`/CPI pour les taux et
  l'inflation) — **n'envoie aucun en-tête CORS** (vérifié, même comportement que
  Yahoo Finance/Stooq, voir "Cours de bourse"), donc `fetch()` direct toujours bloqué.
  Doit passer par le même relais déjà en place (`corsProxyUrls()`/`fetchWithRetry()`).
  Clé gratuite, même processus (`fredaccount.stlouisfed.org/apikeys`).
- **Ne pas implémenter avant d'avoir reçu les 2 clés de l'utilisateur** — il n'y a
  pas de clé partagée/publique utilisable, chaque clé est personnelle et gratuite mais
  doit être créée par lui.
- Une fois les clés fournies : fetch complet de l'historique (pas seulement la donnée
  la plus récente, les deux API renvoient des séries complètes) au chargement de
  l'app, avec un cache `localStorage` daté pour éviter de re-fetcher à chaque visite
  dans la même journée — pas besoin du système d'export/sync via `data/*.json` utilisé
  pour les autres onglets (Idées, Watchlist...), puisque la source de vérité est
  directement l'API, pas une saisie de l'utilisateur.

### Demandé, non commencé — nécessite une décision d'architecture
Ces 2 fonctionnalités ne sont **pas réalisables en site statique pur** sans backend :

1. **Onglet Superinvestors (13F)** — pas d'API gratuite fiable et accessible en CORS
   pour les données 13F de la SEC. Options : API payante (WhaleWisdom...), ou compilation
   manuelle périodique par Claude dans le Sheet (même schéma que les données actuelles :
   Sheet = source de vérité, le site ne fait qu'afficher).
2. **Onglet Résumé Hebdo** ("bouton qui va chercher sur internet") — impossible côté
   client pur : nécessite recherche web + génération de texte, donc un backend avec clé
   API. Alternative proposée : demander le résumé directement en conversation (ponctuel
   ou tâche récurrente programmée), et le coller dans le Sheet/site si besoin d'affichage.

## Conventions de code

- Tous les textes UI, commentaires de code et messages d'erreur sont **en français**.
- Formatage des nombres : `toLocaleString('fr-FR', ...)` partout (virgule décimale,
  espace milliers).
- Gestion d'erreur : jamais d'échec silencieux — toute source de données externe
  (Sheet, Stooq) doit avoir un état "chargement" / "erreur" visible à l'utilisateur avec
  un message actionnable, pas juste une page qui reste bloquée.
- `chartInstances` (objet global) garde une référence à chaque instance Chart.js active,
  détruite avant recréation (`destroyCharts()`) pour éviter les fuites mémoire au
  changement d'entreprise.
- `chartConfigs` (objet global) garde la config brute de chaque graphique pour alimenter
  la modale de zoom (`openZoom(key, title)` / `cloneChartConfig()` clone les datasets
  pour ne pas partager la même référence entre le graphique normal et sa version zoomée).
- `scenarioCharts` (objet global séparé, onglet Valorisation) suit le même principe de
  destruction avant recréation que `chartInstances`, mais **volontairement pas relié à
  `chartConfigs`/`openZoom`** : les graphiques de scénario n'ont pas de bouton zoom
  (non demandé, cohérent avec la capture de référence fournie par l'utilisateur).
- Pattern général pour toute donnée que l'utilisateur voudrait "garder en mémoire durablement,
  disponible sur tous ses appareils" sans backend : `localStorage` (données texte/JSON légères
  — objectifs, watchlist) ou **IndexedDB** (données lourdes avec images en base64 — cerveau
  numérique, `localStorage` saturerait vite son quota ~5-10 Mo) pour l'usage immédiat sur
  l'appareil courant + un bouton d'export JSON + un fichier socle dans `data/` que Claude
  met à jour (commit + push) quand l'utilisateur transmet l'export en conversation. Ne pas
  proposer d'écriture directe vers Google Sheets ou GitHub depuis le navigateur (identifiants
  exposés côté client) sans en discuter explicitement avec l'utilisateur au préalable.
