# Contrat d'échange v2.1 — ChatGPT → Claude → Atelier d'analyses

> **Version figée : v2.1 (2026-11-14).** Valeur du champ `contrat` : `"wolf-atelier/2.1"`.
> Rôles : **ChatGPT** fournit les données, les analyses, les sources et les hypothèses. **Claude** contrôle le
> paquet, le convertit et code ce qui manque dans l'application. **L'application** affiche, calcule et présente.
> Règle d'or : **une valeur manquante reste `null` et visiblement incomplète ; elle n'est jamais inventée,
> jamais mise à zéro.**

## Changements v2 → v2.1 (les 8 ajustements demandés, tous acceptés)

| # | Ajustement | Où |
|---|---|---|
| 1 | Marge de sécurité = `(P_max − cours) ÷ P_max` ; P_max = prix d'entrée, pas une valeur intrinsèque | §4 |
| 2 | Pont financier complet des acquisitions ; résultat marqué « incomplet » s'il manque une entrée | §3.3 |
| 3 | Traçabilité par point de série ; rupture typée qui coupe les comparaisons ; `null` jamais 0 | §2.2 |
| 4 | Hypothèses : `justification`, `date_revision`, `confiance` ; jamais affichées comme des prévisions officielles | §2.3 |
| 5 | Multiples : `denominateur`, `fenetre`, `methode_calcul` ; avertissement entre définitions de FCF différentes | §2.2, §4 |
| 6 | Version de référence vidéo figée, que TradingView ne modifie jamais en silence | §5 |
| 7 | `decision` : hypothèses, prix d'entrée, risques et conditions d'invalidation obligatoires ; avertissement Wolf Score | §3.4 |
| 8 | Nouveau bloc `affirmations` : affirmations qualitatives sourcées | §2.5 |

Le paquet passe donc à **7 blocs** : `meta`, `sources`, `donnees`, `hypotheses`, `affirmations`, `presentation` et
`notes`.

---

## 1. Contraintes de l'application (à respecter par ChatGPT)

1. **Livraison par lots** : un dossier complet ne tient pas dans un seul message (§6). Chaque lot est un JSON
   valide, et Claude fusionne les lots par identifiant.
2. **Identifiants** stables, en minuscules, sans accents ni espaces : `ca_transmission`, `src_ar2025`. Un même
   identifiant désigne toujours la même chose d'une mise à jour à l'autre.
3. **Nombres** : un vrai nombre JSON avec un point décimal (`19.65`), jamais une chaîne. Valeur inconnue :
   `null` avec `"statut": "non_disponible"`. **Jamais `0` pour « inconnu ».**
4. **Images** : un lien direct vers le fichier et la page d'origine. Claude vérifie et télécharge chaque lien.
   Un lien mort est signalé, jamais remplacé par une autre image.
5. **Ne pas fournir** ce que TradingView donne déjà (cours, historiques annuels consolidés). Pour **comparer**
   les deux sources, il faut fournir la valeur de l'entreprise comme une donnée à part, avec sa définition.
6. **Zones de la carte du monde** : Europe, Europe de l'Ouest, Europe de l'Est, Zone euro, Amérique du Nord,
   Amériques, Amérique latine, Amérique du Sud, Asie, Asie-Pacifique, Moyen-Orient, Afrique, Afrique et
   Moyen-Orient, EMEA, Océanie, Reste du monde. On peut aussi utiliser un nom de pays en anglais.
7. **Incomplet plutôt qu'inventé** : une carte peut référencer des données `null`. Elle s'affiche alors avec la
   mention « donnée non disponible », et un calcul qui en dépend affiche « incomplet », sans résultat.

---

## 2. Le paquet JSON

```json
{
  "contrat": "wolf-atelier/2.1",
  "type": "dossier",
  "lot": 1,
  "meta": {
    "entreprise": "Prysmian",
    "symbole_tv": "MIL:PRY",
    "devise": "EUR",
    "date_analyse": "2026-11-14",
    "exercice_reference": "FY2025",
    "auteur": "ChatGPT",
    "secteur": "Industrie",
    "sous_secteur": "Câbles et systèmes"
  },
  "sources": [],
  "donnees": [],
  "hypotheses": [],
  "affirmations": [],
  "presentation": { "sections": [] },
  "notes": []
}
```

- `type` : `dossier` (création) ou `mise_a_jour` (§5).
- Les lots 2 et suivants reprennent `contrat`, `type`, `lot` et `meta.entreprise`, plus les blocs qu'ils
  apportent.

### 2.1 `sources`
```json
{ "id": "src_ar2025", "titre": "Annual Report 2025", "editeur": "Prysmian", "date": "2026-03-05",
  "url": "https://…pdf", "type": "rapport_annuel" }
```
`type` : `rapport_annuel`, `presentation_resultats`, `communique`, `presentation_investisseurs`, `presse`,
`etude_marche`, `regulateur` ou `autre`.

### 2.2 `donnees`

**Champs communs à toute donnée :**

| Champ | Obligatoire | Valeurs |
|---|---|---|
| `id`, `libelle` | oui | |
| `unite` | oui | `Md`, `M`, `%`, `x`, `pts`, `par_action`, `nb`, `ans`… |
| `devise` | si monétaire | `EUR`, `USD`… |
| `statut` | oui | `publie`, `ajuste`, `calcule`, `estimation`, `non_disponible` (`hypothese` va dans le bloc `hypotheses`) |
| `source`, `page` | oui sauf `calcule` | id de source, page ou diapositive |
| `definition` | oui | définition comptable (ce qui est inclus ou exclu) |
| `perimetre` | oui | groupe, segment, zone… |
| `formule` | si `calcule` | expression avec des identifiants : `"fcf_ajuste / actions_diluees"` |
| `origine` | non | `chatgpt` (par défaut) ou `societe` si la valeur est recopiée telle quelle d'un document de l'entreprise |
| `composante_de` | non (ajout du contrôle du lot 1) | id de la donnée qui contient celle-ci (ex. carnet HVDC ⊂ carnet sous-marin ⊂ carnet Transmission) : l'application n'additionne jamais une composante à son total |
| `hors_de` | non (ajout du contrôle du lot 1) | id d'un total qui n'inclut PAS cette donnée (ex. contrats attribués hors carnet) |

**Valeur unique :** ajouter `valeur` et `periode`.
```json
{ "id": "carnet_transmission", "libelle": "Carnet de commandes Transmission",
  "valeur": 18.0, "unite": "Md", "devise": "EUR", "periode": "2026-09-30",
  "statut": "publie", "source": "src_q3_2026", "page": "12",
  "definition": "Commandes fermes non encore facturées", "perimetre": "Segment Transmission" }
```

**Série :** ajouter `serie`. **Chaque point peut redéfinir** `source`, `page`, `definition`, `statut` et `perimetre`.
Un champ absent du point reprend celui de la série.
```json
{ "id": "ca_transmission", "libelle": "CA Transmission", "unite": "Md", "devise": "EUR",
  "statut": "publie", "source": "src_ar2025", "definition": "CA au prix standard du métal",
  "perimetre": "Segment Transmission",
  "serie": [
    { "periode": "FY2022", "valeur": null, "statut": "non_disponible" },
    { "periode": "FY2023", "valeur": 2.12, "source": "src_ar2023", "page": "48" },
    { "periode": "FY2024", "valeur": 2.60,
      "rupture": { "type": "perimetre", "texte": "Nouveau découpage en 4 segments" } },
    { "periode": "FY2025", "valeur": 3.26 }
  ] }
```
- `rupture.type` : `perimetre`, `methode_comptable` ou `definition`. Une rupture **coupe toute comparaison
  automatique** à travers ce point : pas de Δ %, pas de CAGR, une séparation sur le graphique et une mention dans
  le tableau. Le CAGR n'est calculé que sur la plus longue portion sans rupture, et cette portion est affichée.
- `null` = trou dans la série (le graphique ne relie pas les points à travers le trou).

**Multiples** (P/FCF, PER, EV/EBITDA…) : trois champs en plus, obligatoires.
```json
{ "id": "pfcf_hist_median", "libelle": "P/FCF médian historique", "valeur": 17.2, "unite": "x",
  "statut": "calcule", "formule": "mediane(pfcf_annuel)",
  "denominateur": "comptable", "fenetre": "FY2016-FY2025", "methode_calcul": "mediane_annuelle",
  "definition": "Capitalisation fin d'exercice / FCF comptable (OCF − capex)", "perimetre": "Groupe" }
```
- `denominateur` : `comptable`, `ajuste` ou `normalise`.
- `methode_calcul` : `mediane_annuelle`, `moyenne_annuelle`, `fin_exercice`, `ttm` ou `autre` (à expliquer dans
  `definition`).

### 2.3 `hypotheses`
```json
{ "id": "fcf_pa_normalise", "libelle": "FCF normalisé par action (départ)", "valeur": 5.50,
  "unite": "par_action", "devise": "EUR", "statut": "hypothese",
  "justification": "Moyenne FY2023-FY2025 retraitée des éléments non récurrents, pro forma Atkore",
  "date_revision": "2026-11-14", "confiance": "moyenne",
  "denominateur": "normalise", "min": 3, "max": 8, "fondee_sur": ["fcf_ajuste_hist"] }
```
- Obligatoires : `justification` et `date_revision`. `confiance` (`faible`, `moyenne` ou `forte`) est fortement
  recommandée.
- `min` et `max` = bornes des curseurs. `fondee_sur` = identifiants des données utilisées (facultatif).
- **Affichage** : chaque hypothèse porte la pastille « Hypothèse d'analyste », avec sa date de révision et sa
  confiance. Elle n'est **jamais** présentée comme une prévision de la société ou un consensus.

**Hypothèses Prysmian connues à ce jour** (à livrer dans ce bloc, pas dans `donnees`) :
`fcf_pa_normalise` = 5,50 €, `cagr_fcf_pess` = −2 %, `cagr_fcf_realiste` = +5 %, `cagr_fcf_opt` = +10 % et
`pfcf_central` = 16× (provisoire).

### 2.4 `affirmations` (qualitatif sourcé, ajustement 8)
```json
{ "id": "aff_leader_mondial", "texte": "Premier câblier mondial par le chiffre d'affaires",
  "nature": "fait", "sources": ["src_ar2025", "src_etude_crU"], "donnees": ["ca_groupe", "ca_nexans"],
  "confiance": "forte" }
```
- `nature` : `fait` (vérifiable), `interpretation` (jugement d'analyste, à justifier) ou `consensus` (opinion
  répandue, avec sa source).
- **Utilisation dans les textes** : `{{aff:aff_leader_mondial}}` insère l'affirmation avec un renvoi cliquable vers
  ses sources. Un texte peut aussi citer directement une source (`[[src_ar2025]]`) ou une donnée
  (`{{d:ca_groupe}}`, qui affiche la valeur, son unité et sa pastille).
- Une affirmation sans source est autorisée seulement si `nature` vaut `interpretation`. Elle est alors marquée
  « interprétation ».

### 2.5 `presentation`
```json
{ "sections": [
  { "id": "s_segments", "titre": "Segments", "ordre": 2,
    "sous_sections": [ { "id": "s_seg_transmission", "titre": "Transmission", "cartes": [] } ],
    "cartes": [] }
] }
```
- Une carte = `{ "id", "type", "taille": "petite"|"haute"|"large", "titre"?, … champs du type }`.
- L'ordre des sections est libre et reste réorganisable dans l'application.
- Un seul niveau de sous-section.
- Aucun chiffre en dur dans une carte.

### 2.6 `notes` (« À dire », jamais affichées dans la page filmée)
```json
{ "cible": "s_segments", "texte": "Insister : Transmission = 17 % du CA mais 30 % de la croissance." }
```

---

## 3. Les types de cartes

| Type | Champs | État |
|---|---|---|
| `texte` | `contenu` (Markdown court, avec `{{aff:…}}`, `{{d:…}}`, `[[src_…]]`) | existe |
| `citation` | `contenu`, `etiquette` | existe |
| `chiffre` | `donnee`, `comparer_a`? | existe (kpi) |
| `barres` / `courbes` | `series`: [identifiants], `evolution`: true/false | existe ; ruptures à ajouter |
| `donut` | `parts`: [{`libelle`, `donnee`}] | existe |
| `monde` | `zones`: [{`zone`, `donnee`}] | existe |
| `comparatif` | `entreprises`, `colonnes`: [{`libelle`, `unite`, `sens`}], `valeurs`: {entreprise: [identifiants]} | existe |
| `profil` | `nom`, `poste`, `depuis`, `detention`?, `remuneration`?, `parcours`, `photo`, `photo_page` | existe |
| `image` | `lien`, `page`, `legende`, `credit` | existe |
| `these` | `phase`, `reponses`: [7 textes] | existe |
| `auto` | `quoi`: `cours`, `historique_tv:<champ>`, `cours_compares` ou `chaine_valeur` | existe |
| `marche` | §3.1 | **nouveau** |
| `risque` | §3.2 | **nouveau** |
| `acquisition` | §3.3 | **nouveau** |
| `valorisation` | §4 | **nouveau** |
| `chronologie` | `evenements`: [{`date`, `titre`, `texte`?, `nature`: `fait`/`prevu`, `source`?}] | **nouveau** |
| `decision` | §3.4 | **nouveau** |
| `score` | §3.4 | **nouveau** |

### 3.1 `marche`
```json
{ "type": "marche", "taille": "large", "nom": "Câbles HVDC sous-marins",
  "taille_marche": "marche_hvdc_taille", "croissance": "marche_hvdc_cagr", "horizon": "2025-2030",
  "segments_concernes": ["s_seg_transmission"], "moteurs": ["Éolien en mer", "Interconnexions"],
  "cyclicite": "faible", "capacite": "Usines saturées jusqu'en 2028 ; qualification 3-5 ans",
  "risque_ralentissement": "Retards de projets éoliens, hausse des taux",
  "part_entreprise": "pdm_prysmian_hvdc", "affirmations": ["aff_hvdc_oligopole"] }
```
**Correction après le contrôle des 5 lots** : le champ de la taille du marché s'appelle `taille_marche`. `taille`
reste réservé au format de la carte (`petite`, `haute` ou `large`) pour toutes les cartes.
`cyclicite` : `faible`, `moyenne` ou `forte`. Vue d'ensemble : une matrice croissance × cyclicité de tous les
marchés du dossier.

### 3.2 `risque`
```json
{ "type": "risque", "nature": "economique",
  "titre": "Ralentissement de la construction résidentielle US",
  "mecanisme": "Baisse des volumes Electrification, pression sur les prix",
  "segment": "s_seg_electrification", "probabilite": "moyenne", "gravite": "moyenne",
  "horizon": "12-24 mois", "indicateurs": ["Mises en chantier US", "Volumes organiques Electrification"],
  "impact": "≈ -5 % d'EBITDA groupe si volumes -10 %", "impact_statut": "estimation",
  "sources": ["src_q3_2026"] }
```
`nature` : `economique` ou `valorisation`. Les deux natures sont affichées dans deux blocs séparés, avec une
matrice probabilité × gravité.

### 3.3 `acquisition` — pont financier (ajustement 2)
```json
{ "type": "acquisition", "cible": "Atkore", "date": "2026", "statut_operation": "annoncee",
  "logique": "Renforcer Prysmian aux États-Unis…",
  "prix": "atkore_prix", "financement": [{ "mode": "actions", "donnee": "atkore_fin_actions" },
                                          { "mode": "dette", "donnee": "atkore_fin_dette" },
                                          { "mode": "hybride", "donnee": "atkore_fin_hybride" }],
  "dette_reprise": "atkore_dette_reprise",
  "pont": {
    "fcf_acquereur":            "pry_fcf_ref",
    "fcf_cible":                "atkore_fcf_ref",
    "anciens_interets_cible":   "atkore_interets_apres_impot",
    "nouveaux_interets":        "atkore_nouv_interets_apres_impot",
    "capex_supplementaire":     "atkore_capex_supp",
    "bfr_normalise":            "atkore_bfr_norm",
    "couts_integration_recurrents": "atkore_couts_rec",
    "couts_integration_ponctuels":  "atkore_couts_ponct",
    "synergies_realisees":      "atkore_syn_realisees",
    "synergies_hypothetiques":  "atkore_syn_hypo",
    "coupons_hybrides":         "atkore_coupons_hybrides",
    "actions_avant":            "pry_actions_diluees_avant",
    "actions_emises":           "atkore_actions_emises"
  },
  "inclus_dans_fcf_retenu": { "anciens_interets_cible": true, "coupons_hybrides": false } }
```
- Chaque élément du pont est l'identifiant d'une donnée ou d'une hypothèse. Le **statut** de chacune sépare les
  faits des hypothèses, et le pont l'affiche ligne par ligne.
- `fcf_acquereur` et `fcf_cible` : leur `definition` et leur `periode` sont **obligatoires**. Si les définitions
  ou les périodes diffèrent, l'application l'affiche en avertissement.
- `inclus_dans_fcf_retenu` évite le double comptage : il dit si un élément est déjà compris dans le FCF retenu.
  - Les anciens intérêts de la cible sont **rajoutés** s'ils ont été déduits de son FCF et que sa dette est
    remboursée.
  - Les coupons hybrides sont **retirés** seulement s'ils n'y sont pas déjà.
- **Calcul :**
  - FCF pro forma = FCF acquéreur + FCF cible + anciens intérêts de la cible (si retraités) − nouveaux intérêts
    après impôt − capex supplémentaire − variation de BFR normalisée − coûts récurrents + synergies réalisées
    − coupons hybrides (si absents du FCF retenu).
  - FCF/action pro forma = FCF pro forma ÷ (actions avant + actions émises).
  - Deux lignes de résultat : **« prouvé »** (synergies réalisées seulement) et **« avec synergies
    hypothétiques »**.
  - Les coûts ponctuels sont montrés à part et ne sont jamais intégrés au FCF normalisé.
  - Dilution = actions émises ÷ actions avant.
- **Entrées manquantes** : si un élément est `null` ou absent, le pont affiche la ligne « non disponible » et le
  résultat est marqué **« incomplet »**, sans valeur. Option « calculer quand même » : les éléments manquants
  sont pris pour 0, le résultat est barré d'un bandeau « hors éléments manquants » et listé ainsi partout où il
  apparaît.
- `statut_operation` : `annoncee`, `realisee` ou `integree`.

### 3.4 `decision` et `score` (ajustement 7)
```json
{ "type": "decision", "verdict": "attendre", "date": "2026-11-14",
  "hypotheses": ["fcf_pa_normalise", "cagr_fcf_realiste", "pfcf_central"],
  "prix_entree": "valo:prix_max_realiste",
  "risques": ["r_construction_us", "r_valorisation"],
  "conditions_achat": ["Cours ≤ prix d'entrée", "Marge EBITDA Transmission ≥ 17 % sur 2 semestres"],
  "invalidation": ["Carnet de commandes Transmission en baisse 2 trimestres de suite",
                   "Synergies Atkore < 50 % de l'objectif à fin 2027"],
  "a_surveiller": ["Carnet de commandes", "Intégration Atkore"], "resume": "…" }
```
- **Obligatoires** : `verdict` (`acheter`, `renforcer`, `attendre`, `alleger` ou `eviter`), `hypotheses`,
  `prix_entree`, `risques` (identifiants de cartes `risque`) et `invalidation`. Une carte `decision`
  incomplète s'affiche avec « décision incomplète », sans verdict mis en avant.
- `prix_entree` peut pointer vers un résultat de la carte de valorisation (`valo:prix_max_realiste`), et suit
  alors les curseurs.

```json
{ "type": "score", "criteres": [{ "nom": "Leadership", "note": 8, "justification": "…",
  "sources": ["aff_leader_mondial"] }] }
```
Mention fixe sous le score : « Synthèse éditoriale de l'analyste — ni une mesure statistique, ni un signal
d'achat. »

---

## 4. Carte `valorisation`

```json
{ "type": "valorisation", "id": "valo", "methode": "pfcf_normalise", "horizon": 5, "rendement_cible": 12,
  "base": "fcf_pa_normalise", "cours": "auto",
  "module_a": { "cagr": { "pessimiste": "cagr_fcf_pess", "realiste": "cagr_fcf_realiste",
                          "optimiste": "cagr_fcf_opt" },
                "multiple": "pfcf_central" },
  "module_b": { "cagr": "cagr_fcf_realiste",
                "multiples": { "bas": "pfcf_bas", "central": "pfcf_central", "haut": "pfcf_haut" } },
  "references_multiple": ["pfcf_hist_median"] }
```

**Formules** (affichées sur la carte, avec les valeurs du moment) :
- `F₅ = F₀ × (1 + g)^5`
- `P₅ = F₅ × M`
- `P_max = P₅ ÷ (1 + r)^5`, avec `r = 12 %`
- Rendement annualisé au cours actuel : `R = (P₅ ÷ cours)^(1/5) − 1`
- **Marge de sécurité** = `(P_max − cours) ÷ P_max` : positive = cours sous le prix d'entrée, négative = cours
  au-dessus.

**Mentions fixes sur la carte :**
- « P_max est un prix d'entrée pour viser 12 % par an hors dividendes, pas une valeur intrinsèque certaine. »
- « Dividendes exclus. »

**Résultats nommés**, réutilisables ailleurs via `valo:<nom>` :
- module A : `prix_futur_<scénario>`, `prix_max_<scénario>`, `rendement_<scénario>` et `marge_<scénario>` ;
- module B : `prix_futur_mult_<bas|central|haut>` et `prix_max_mult_<bas|central|haut>`.

**Cohérence des multiples (ajustement 5)** :
- La carte affiche le `denominateur` de la base (`normalise`) et celui de chaque multiple de référence.
- Si les deux diffèrent (exemple : base normalisée contre médiane historique TradingView calculée sur le FCF
  comptable), un avertissement apparaît : « multiple calculé sur un FCF comptable, appliqué à un FCF normalisé :
  comparaison indicative ».
- Les multiples historiques venant de TradingView sont toujours étiquetés `comptable`, avec leur fenêtre.

**Méthodes** (`methode`) :
- Recalculées par l'application dans un premier temps : `pfcf_normalise` (modules A + B), `pfcf`, `per`,
  `ev_ebitda` et `p_b`.
- Acceptées par le schéma mais affichées en tableau « calculé par ChatGPT, pas recalculé » : `p_tbv`, `ev_ebit`,
  `dcf`, `ffo_affo` et `somme_des_parties`. Il faut alors fournir `resultats`: [identifiants de données
  `calcule`].

Les curseurs modifient une copie de travail. Les hypothèses de ChatGPT restent affichées à côté, avec un bouton
pour y revenir.

---

## 5. Versions, références vidéo et mises à jour (ajustement 6)

- **Import = nouvelle version.** Rien n'est jamais remplacé, et les versions précédentes restent consultables.
- **Version de référence** : un bouton « 🎬 Figer pour une vidéo » fige une version. Le cours, les chiffres
  TradingView, les données, les hypothèses, les curseurs, les résultats calculés, les sources et la date
  d'analyse sont alors enregistrés tels quels.
  - Une version figée est **en lecture seule** : « ↻ Actualiser » y est désactivé, et le cours `auto` y est
    remplacé par le cours figé, avec sa date.
  - Pour actualiser, l'application **crée une nouvelle version** (« Actualisation du JJ/MM ») et affiche les
    écarts. La version figée ne change jamais.
- **Version non figée** : « ↻ Actualiser » montre d'abord les écarts (TradingView, cours, résultats de la
  valorisation) et demande confirmation.
- **Paquet `mise_a_jour`** : il ne contient que les blocs modifiés. L'application montre chaque valeur changée
  (ancienne → nouvelle), puis crée une nouvelle version. Les cartes liées suivent.
- Chaque version garde son propre registre de sources, de données, d'hypothèses et d'affirmations.

---

## 6. Livraison par lots (Prysmian)

| Lot | Contenu |
|---|---|
| 1 | `meta`, `sources`, `donnees` |
| 2 | `hypotheses`, `affirmations` |
| 3 | `presentation` des sections 1 à 3 (présentation et modèle économique, segments, marchés) |
| 4 | `presentation` des sections 4 à 7 (concurrents, avantages, perspectives et acquisitions, risques) |
| 5 | `presentation` des sections 8 à 11 (management et qualité financière, valorisation, décision, actualités) + `notes` |

Après chaque lot, Claude renvoie un rapport de contrôle : JSON invalide, identifiant inconnu ou en double, donnée
sans source ni page, unité ou devise manquante, multiple sans `denominateur`, hypothèse sans `date_revision`,
`0` suspect à la place d'un `null`, lien mort, décision sans conditions d'invalidation.

---

## 7. Travail de Claude dans l'application (pour information)

1. Registres par version : sources, données, hypothèses, affirmations, notes.
2. Import : contrôle, rapport, aperçu des écarts, nouvelle version.
3. Carte `valorisation` (modules A et B, formules, marge de sécurité, avertissements de cohérence).
4. Cartes `acquisition` (pont), `risque`, `marche`, `chronologie`, `decision` et `score`.
5. Ruptures de série, pastilles d'origine et de statut, infobulle de traçabilité, renvois
   `{{aff:…}}` / `{{d:…}}` / `[[src_…]]`.
6. Figer pour une vidéo, et une actualisation qui crée une nouvelle version.
7. Notes « À dire » et fenêtre prompteur.

Les points 1 à 3 permettent un premier essai sur la copie du dossier Prysmian. Les autres suivent dans cet ordre.
