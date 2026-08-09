# Wolf Analysis — Contexte projet

Tableau de bord d'analyse financière (value investing) pour Wolf Academy Invest.
Site statique (HTML/CSS/JS vanilla, pas de framework, pas de backend) qui se
connecte en direct à un Google Sheet publié comme source de données.

## Structure du projet

```
wolf-analysis/
├── index.html      # Structure de la page, contenu des 3 onglets (Analyse / Secteur / Valorisation)
├── css/
│   └── style.css    # Design system complet (tokens, layout, composants)
├── js/
│   └── app.js        # Chargement des données, rendu, graphiques, interactions
└── data/
    └── objectifs.json  # Socle des objectifs de valorisation de l'utilisateur (voir "Onglet
                         # Valorisation" plus bas) ; {} par défaut, mis à jour par Claude
                         # quand l'utilisateur exporte et transmet le fichier généré par le site
```

Le HTML référence les fichiers externes via :
```html
<link rel="stylesheet" href="css/style.css">
<script src="js/app.js"></script>
```

Dépendances CDN (chargées directement dans `index.html` / dynamiquement par `app.js`, pas de npm) :
- **Chart.js 4.4.4** — chargé dynamiquement avec repli sur 3 CDN (cdnjs → jsdelivr → unpkg), voir section "Pièges techniques"
- **PapaParse 5.4.1** (cdnjs) — parsing CSV
- **Google Fonts** : Space Grotesk (titres), Inter (corps), JetBrains Mono (chiffres/labels)

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
| cagrDiv10 | X | 23 |
| payoutRatio | AA | 26 |
| fcfpeg | AJ | 35 |
| fcfParAction | AM | 38 |
| cagrFcf10 | AO | 40 |
| medianePFCF | AQ | 42 |
| ca | AS | 44 |
| cagrCA10 | AU | 46 *(non confirmé par l'utilisateur, à valider)* |
| margeOp | AW | 48 |
| roic | AX | 49 |
| cash | BA | 52 |
| cashInvesti | BB | 53 |
| actions (nb en circulation) | BC | 54 |
| cagrActions | BD | 55 |
| detteOCF (dette nette / OCF) | BG | 58 |

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
3. **Cours de bourse (Yahoo Finance en priorité, Stooq en repli)** : mapping automatique
   du ticker vers les deux formats (`EPA:MC` → `MC.PA` pour Yahoo, → `mc.fr` pour Stooq)
   pour les bourses courantes (Paris, Nasdaq/NYSE, Londres, Francfort, Amsterdam, Madrid,
   Milan, Suisse, Tokyo). Couverture partielle, pas garantie pour tous les tickers sur
   l'une ou l'autre source.
4. **Yahoo Finance sous-échantillonne silencieusement `range=max`.** En demandant
   `range=max&interval=1wk` (ou même `interval=1d`) sur un très long historique, l'API
   renvoie sans prévenir des points **mensuels** au lieu de l'intervalle demandé — aucune
   erreur, juste des `timestamp[]` espacés d'~30 jours au lieu de 7. Symptôme observé :
   la « moyenne mobile 200 semaines » était en réalité une moyenne sur ~200 mois (~17 ans),
   beaucoup trop lissée pour jamais croiser le cours (bug remonté par l'utilisateur : « le
   prix ne passe jamais sous la moyenne mobile »). **Fix (`fetchYahooWeekly` dans
   `app.js`)** : ne jamais utiliser `range=`, toujours des timestamps explicites
   `period1`/`period2` (bornes Unix, ex. `1990-01-01` → maintenant) avec `interval=1d`,
   qui renvoie bien du quotidien réel (vérifié : 6834 points sur 26 ans pour TTE.PA,
   `meta.dataGranularity:"1d"`). Le JS rééchantillonne ensuite lui-même ces clôtures
   quotidiennes en hebdomadaire (`resampleWeekly()`, dernier jour coté de chaque semaine
   ISO) plutôt que de faire confiance à l'intervalle demandé à Yahoo. **Ne pas revenir à
   `range=max&interval=1wk`** — ni à un `interval=1wk` explicite d'ailleurs, non vérifié
   fiable non plus sur un historique long.
5. **Cache navigateur agressif sur `<script src="js/app.js">` en `file://`.** Pendant le
   développement local, Chrome peut continuer à exécuter une version en cache de `app.js`
   après une modification, même après un rechargement complet de la page (F5, re-navigation,
   nouvel onglet) — seul un `fetch()` direct de l'URL renvoie le contenu à jour. Symptôme :
   une fonction ajoutée récemment est `undefined` sur `window` alors que le fichier sur
   disque est correct. Contournement en session de test : ajouter temporairement un
   paramètre de cache-bust à l'URL du script (`js/app.js?_test=1`), vérifier, puis le
   retirer avant de committer. Ne pas laisser ce paramètre en prod.
6. **Cascade CSS et ordre des règles.** Une classe utilitaire réutilisant un sélecteur
   générique déjà stylé plus loin dans le fichier (ex. `.objectifs-export` combinée à
   `.zoom-btn`, qui fixe `width:26px` bien après dans `style.css`) peut se faire écraser
   silencieusement : à spécificité égale, c'est la règle déclarée en dernier dans le
   fichier qui gagne, pas l'ordre des classes dans l'attribut `class`. Vu en pratique sur
   le bouton « Exporter » de l'onglet Valorisation (resté coincé à 26px de large). Fix :
   composer un sélecteur plus spécifique (`.objectifs-actions .objectifs-export`) plutôt
   que de compter sur l'ordre d'apparition dans le fichier.

## Design system

Thème sombre, esthétique "terminal financier professionnel" avec une couche de finition
inspirée de Finary (dégradés discrets, cartes flottantes avec ombre, lueurs douces sur
les éléments actifs/sémantiques) — ajoutée pour donner plus de profondeur et de "premium"
sans renoncer à l'identité terminal existante.

**Couleurs** (`:root` dans `style.css`) :
- `--bg: #0D1013` (fond, pas noir pur)
- `--panel: #151A1F`, `--panel-2: #1B2128` (cartes)
- `--hair: #262E36` (bordures/séparateurs)
- `--text: #E9EBEE`, `--text-dim: #8B93A0`, `--text-faint: #5C6470`
- `--gold: #D9A441` (accent principal — dividendes, énergie, signal), `--gold-2: #F0C877`
  (variante claire, utilisée dans les dégradés des boutons/titre de marque)
- `--blue: #4A9FE0` (accent secondaire — utilisé dans les séries de données des graphiques,
  voir "Palette graphiques" ci-dessous)
- `--violet: #8B7FE8` (accent décoratif uniquement — lueur de fond en haut à droite,
  clin d'œil aux dégradés Finary ; jamais utilisé pour du sens/de la donnée)
- `--green: #4FD1A5` (positif/sous-valorisé)
- `--red: #E5636B` (négatif/survalorisé)
- `--card-bg` : dégradé `panel-2 → panel` réutilisé sur toutes les cartes (header, gauge,
  ratio-card, chart-card, sector-box, zoom-panel, écrans loading/error) pour un rendu
  uniforme au lieu d'un simple fond plat
- `--shadow-card` / `--shadow-card-hover` : ombre portée douce sous les cartes ; les
  `ratio-card` et `chart-card` ont un léger effet de survol (lift + ombre plus marquée)

**Typographie** :
- `Space Grotesk` (700/600) — titres, marque
- `Inter` — corps de texte
- `JetBrains Mono` — tous les chiffres, labels, badges (esprit "terminal")

**Composants clés** :
- Barre de marque : logo Wolf Analysis (ombre douce dorée) + titre **en blanc uni**
  (`var(--text)`, pas de dégradé — testé en dégradé or puis explicitement retiré à la
  demande de l'utilisateur, « c'est moche »). Pas de sous-titre sous le titre (l'ancien
  « Onglet Analyse » a été retiré, redondant avec les onglets juste en dessous) —
  **ne pas réintroduire `.brand-sub`**.
- Barre de recherche avec autocomplétion (remplace une ancienne liste d'onglets par
  entreprise, retirée car pas scalable avec beaucoup d'entreprises)
- Jauge de valorisation (SVG généré en JS) : positionne Prix Cible / Prix Juste / Prix
  Actuel sur une échelle colorée (zones vert/or/rouge) ; le badge de verdict a une légère
  lueur colorée assortie
- Cartes de ratios clés (grille 4 colonnes desktop, 2 mobile)
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
- Cartes de scénario (onglet Valorisation) : bordure supérieure colorée par sémantique
  (vert Optimiste / bleu Réaliste / rouge Pessimiste, réutilisant `--green`/`--blue`/`--red`
  existants — pas de nouvelle couleur), sliders natifs `<input type=range>` stylés au thème.

## Fonctionnalités — état actuel

### Onglet Analyse (fait, fonctionnel)
- Header entreprise (logo, nom, ticker, secteur/sous-secteur, prix actuel)
- Jauge de valorisation + verdict (Survalorisée / Équitable / Zone d'achat)
- 8 ratios clés (prix juste, prix cible, écart, rendement dividende, rendement estimé
  5 ans, FCFPEG, médiane P/FCF, payout ratio)
- Graphique cours de bourse hebdomadaire + moyenne mobile 200 semaines + sélecteur de
  plage (1a/2a/3a/5a/10a/20a/Max) — **Yahoo Finance en source principale, repli
  automatique sur Stooq si indisponible** (voir "Cours de bourse" ci-dessous)
- 8 graphiques historiques : Dividende (barres) + Payout ratio (courbe), CA (courbe),
  Marge op.+ROIC (courbes), FCF/action (barres), P/FCF (barres) + Médiane P/FCF (courbe),
  Actions en circulation (courbe), Dette/OCF (barres), Trésorerie+investissements (barres)
- Badges CAGR sur 4 graphiques (Div 10a, CA 10a, FCF 10a, Actions 20a)
- Zoom modal réutilisable sur les 9 graphiques (dont le cours de bourse), avec mention
  "Données fournies par Wolf Analysis" + logo en pied de modale (branding)
- Recherche d'entreprise avec autocomplétion

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
  `cagrFcf10` (colonne AO), `medianePFCF` (colonne AQ), `prixActuel` par année (colonne H,
  déjà présent pour chaque ligne de `hist` — c'est la même donnée que le prix actuel
  affiché sur l'onglet Analyse, réutilisée telle quelle comme historique annuel de prix,
  **pas de fetch Yahoo Finance/Stooq sur cet onglet**).
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
- **Historique des objectifs** : fiche par entreprise où l'utilisateur peut enregistrer
  (bouton « Enregistrer cet objectif ») un instantané daté des 3 scénarios (CAGR + multiple
  de chacun). Persistance en `localStorage` (`wolfAnalysisObjectifs`), **pas d'écriture
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

### Palette graphiques (fait)
`THEME` expose `blue` (`css.getPropertyValue('--blue').trim()`) en plus de `gold`. Les
9 graphiques Chart.js (dont le cours de bourse) utilisent uniquement or/bleu pour leurs
séries de données. Vert/rouge restent réservés au sémantique positif/négatif : badges
CAGR (classes CSS `.pos`/`.neg`) et jauge de valorisation (marqueurs CIBLE/JUSTE/ACTUEL).

### Cours de bourse — Yahoo Finance + repli Stooq (fait)
`loadStockChart(ticker)` tente `fetchYahooWeekly()` en premier — qui malgré son nom
récupère du **quotidien** via `period1`/`period2` explicites (pas `range=max`, voir
"Pièges techniques" point 4) puis rééchantillonne en hebdomadaire côté client
(`resampleWeekly()`). Mapping `mapTickerToYahoo` : `.PA` Paris, pas de suffixe
Nasdaq/NYSE, `.L` Londres, `.DE` Francfort, `.AS` Amsterdam, `.MC` Madrid, `.MI` Milan,
`.SW` Suisse, `.T` Tokyo. En cas d'échec (Yahoo n'a pas d'API officielle, CORS non
garanti), repli automatique sur `fetchStooqWeekly()` (mapping `mapTickerToStooq`
existant, inchangé). La source active et le symbole utilisé sont affichés sous le
graphique (`#stockSourceNote`). Donne un historique nettement plus profond que Stooq
seul (ex. 1388 points hebdo réels de 2000 à 2026 pour TotalEnergies, avec de vrais
croisements prix/moyenne mobile 200 semaines tout au long de l'historique).

### Bugs corrigés
- **Onglet Secteur inerte** : les boutons `.page-nav-btn` (Analyse/Secteur) n'avaient
  aucun `addEventListener('click', ...)` — `switchPage()` existait mais n'était jamais
  appelée. Corrigé en bas de `app.js` juste avant `initSearch()`.
- **HTML cassé sur les logos du regroupement sectoriel** : `onclick="goToAnalyse(${JSON.stringify(c.nom)})"`
  imbriquait des guillemets doubles dans un attribut HTML lui-même délimité par des
  guillemets doubles, cassant le parsing dès qu'un nom d'entreprise contenait un
  caractère spécial. Remplacé par un attribut `data-nom` + délégation d'événements
  (`initSectorGrid()`), plus robuste (fonctionne aussi avec des noms du type « L'Oréal »).
- **Moyenne mobile 200 semaines jamais franchie par le cours** : en réalité les données
  Yahoo Finance récupérées étaient mensuelles et non hebdomadaires (voir "Pièges
  techniques" point 4) — la "SMA 200" était donc lissée sur ~17 ans au lieu de ~4 ans.
  Corrigé en passant par `period1`/`period2` + rééchantillonnage hebdomadaire manuel.
- **Bouton « Exporter » de l'onglet Valorisation trop étroit** : `.zoom-btn` (règle
  déclarée plus loin dans `style.css`) écrasait le `width:auto` de `.objectifs-export` à
  spécificité CSS égale (voir "Pièges techniques" point 6). Corrigé en spécifiant
  `.objectifs-actions .objectifs-export`.

### Demandé, non commencé — nécessite une décision d'architecture
Ces 3 fonctionnalités ne sont **pas réalisables en site statique pur** sans backend :

1. **Onglet Superinvestors (13F)** — pas d'API gratuite fiable et accessible en CORS
   pour les données 13F de la SEC. Options : API payante (WhaleWisdom...), ou compilation
   manuelle périodique par Claude dans le Sheet (même schéma que les données actuelles :
   Sheet = source de vérité, le site ne fait qu'afficher).
2. **Onglet Résumé Hebdo** ("bouton qui va chercher sur internet") — impossible côté
   client pur : nécessite recherche web + génération de texte, donc un backend avec clé
   API. Alternative proposée : demander le résumé directement en conversation (ponctuel
   ou tâche récurrente programmée), et le coller dans le Sheet/site si besoin d'affichage.
3. **Onglet Macroéconomie (FRED US + zone euro)** — FRED nécessite une clé API et n'est
   pas pensé pour un appel direct depuis un navigateur public (pas de garantie CORS,
   risque de clé exposée côté client). Alternative proposée : recherche/compilation
   manuelle par Claude → table collée dans un nouvel onglet Sheet → le site l'affiche
   avec le même système de fetch fiable déjà en place.

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
  disponible sur tous ses appareils" sans backend : `localStorage` pour l'usage immédiat sur
  l'appareil courant + un bouton d'export JSON + un fichier socle dans `data/` que Claude
  met à jour (commit + push) quand l'utilisateur transmet l'export en conversation. Ne pas
  proposer d'écriture directe vers Google Sheets ou GitHub depuis le navigateur (identifiants
  exposés côté client) sans en discuter explicitement avec l'utilisateur au préalable.
