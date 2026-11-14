# Contrat d'échange v3 — ChatGPT fournit le fond, Claude fait la mise en page

> **Version : v3 (2026-11-14).** Valeur du champ `contrat` : `"wolf-atelier/3"`. Remplace la v2.1.
> Pourquoi une v3 : le premier import Prysmian a montré que la mise en page décidée par ChatGPT (bloc `presentation`, cartes)
> ne donne pas un support de vidéo. Désormais :
> - **ChatGPT** fournit le **fond** : chiffres sourcés, hypothèses, affirmations, et le **récit** (ce qu'il faut retenir,
>   chapitre par chapitre, dans l'ordre de la vidéo).
> - **Claude** fait la **forme** : un écran par message, le visuel, la mise en page, les images (trouvées par Claude sur
>   les sources officielles, ou des pictogrammes).
> Règle d'or inchangée : une valeur manquante reste `null` (« non disponible »), jamais 0, jamais inventée.

## Ce qui change par rapport à la v2.1

| v2.1 | v3 |
|---|---|
| Bloc `presentation` (sections, cartes, tailles) | **Supprimé.** Remplacé par le bloc `recit` : des messages, pas des cartes |
| Cartes `risque`, `marche`, `acquisition`, `valorisation`, `decision`, `score`, `chronologie` | Deviennent des **blocs de données** du même nom (même contenu) |
| Liens d'images fournis par ChatGPT | **Interdits.** ChatGPT décrit l'image voulue (`image_voulue`), Claude la trouve |
| Notes « À dire » dans un bloc à part | Rattachées directement à chaque message (`a_dire`) |
| Données sans rattachement | Chaque donnée porte son **`pole`** (pour la ranger au bon chapitre) |

Inchangés : `meta`, `sources`, `donnees` (tous leurs champs de traçabilité), `hypotheses`, `affirmations`, les
statuts, les ruptures de série, `composante_de` / `hors_de`, les identifiants stables, la livraison par lots.

---

## 1. Le paquet

```json
{
  "contrat": "wolf-atelier/3",
  "type": "dossier",
  "lot": 1,
  "meta": { "entreprise": "Prysmian", "symbole_tv": "MIL:PRY", "devise": "EUR", "date_analyse": "2026-11-14",
            "exercice_reference": "FY2025", "auteur": "ChatGPT", "secteur": "Industrie", "sous_secteur": "Câbles et systèmes",
            "poles": [ { "id": "transmission", "nom": "Transmission" }, { "id": "power_grid", "nom": "Power Grid" },
                       { "id": "electrification", "nom": "Electrification" }, { "id": "digital_solutions", "nom": "Digital Solutions" } ] },
  "sources": [], "donnees": [], "hypotheses": [], "affirmations": [],
  "marches": [], "risques": [], "acquisitions": [], "chronologie": [],
  "valorisation": {}, "decision": {}, "score": {},
  "recit": { "chapitres": [] }
}
```

**`meta.poles`** : les segments publiés de l'entreprise (leur nombre varie d'une entreprise à l'autre). Leurs `id` servent
partout ailleurs.

## 2. Les données (champ nouveau : `pole`)

Tous les champs de la v2.1 restent (voir `docs/contrat-atelier-v2.md` §2.2 à §2.4). Un champ s'ajoute :

| Champ | Obligatoire | Valeurs |
|---|---|---|
| `pole` | oui | un `id` de `meta.poles`, ou `groupe`, `marche`, `concurrent:<nom>` (ex. `concurrent:nexans`) |

Exemple : `{ "id": "ca_transmission", "pole": "transmission", … }`, `{ "id": "carnet_nkt_hv", "pole": "concurrent:nkt", … }`.

Une donnée de la même chose pour plusieurs pôles = une donnée par pôle (`ca_transmission`, `ca_power_grid`…), jamais un
tableau mélangé.

## 3. Les blocs d'analyse (ex-cartes)

Mêmes champs que les cartes de la v2.1, sans `type` ni `taille`, avec un `id` :

- `marches` : `[{ id, nom, pole, taille_marche, croissance, horizon, moteurs, cyclicite, capacite, risque_ralentissement, part_entreprise, affirmations }]`
- `risques` : `[{ id, nature, titre, mecanisme, pole, probabilite, gravite, horizon, indicateurs, impact, impact_statut, sources }]`
- `acquisitions` : `[{ id, cible, date, statut_operation, logique, prix, financement, dette_reprise, pont, inclus_dans_fcf_retenu }]`
  (une entrée par acquisition, les anciennes aussi : Draka, General Cable, Encore Wire, Atkore)
- `chronologie` : `[{ date, titre, texte, nature: "fait"|"prevu", source }]`
- `valorisation` : `{ methode, horizon, rendement_cible, base, cours: "auto", module_a, module_b, references_multiple }`
- `decision` : `{ verdict, date, hypotheses, prix_entree, risques, conditions_achat, invalidation, a_surveiller, resume }`
- `score` : `{ criteres: [{ nom, note, justification, sources }] }`

## 4. Le récit (`recit`) : ce qu'il faut retenir, écran par écran

C'est le cœur de la v3. **Un message = un écran de la vidéo.** ChatGPT écrit le fond du message ; Claude choisit et
dessine le visuel.

```json
{ "chapitres": [
  { "id": "c03_transmission", "titre": "Pôle Transmission", "pole": "transmission",
    "messages": [
      { "id": "m03_1", "phrase": "Les autoroutes de l'électricité",
        "explication": ["Des câbles haute tension, sur terre et sous la mer", "Pour relier les pays et raccorder l'éolien en mer"],
        "donnees": [], "affirmations": ["aff_hvdc_barrieres"],
        "visuel": "image", "image_voulue": "Navire câblier de Prysmian en train de poser un câble en mer",
        "a_dire": "Expliquer simplement : sans ces câbles, l'éolien en mer ne sert à rien." },
      { "id": "m03_2", "phrase": "Les ventes grimpent, la marge aussi",
        "explication": ["+54 % de ventes en deux ans"],
        "donnees": ["ca_transmission", "marge_ebitda_transmission"],
        "visuel": "evolution", "a_dire": "Préciser que la croissance publiée inclut les acquisitions." }
    ] }
] }
```

**Champs d'un message :**

| Champ | Obligatoire | Règle |
|---|---|---|
| `id` | oui | stable |
| `phrase` | oui | **ce qu'il faut retenir**, 10 mots au plus, langage simple, pas de jargon (ou expliqué) |
| `explication` | non | 0 à 3 phrases courtes (15 mots au plus chacune) ; les chiffres cités doivent exister dans `donnees` |
| `donnees` | non | identifiants des données à montrer (3 au plus ; 6 au plus pour `repartition` et `comparaison`, pour couvrir tous les pôles ou concurrents) |
| `affirmations` | non | identifiants des affirmations qui fondent le message |
| `visuel` | oui | le type de preuve : `image`, `chiffre` (un chiffre géant), `evolution` (une série dans le temps), `repartition` (parts d'un tout), `comparaison` (plusieurs entreprises ou pôles), `echelle_prix`, `liste` (conditions, risques), `schema` (chaîne, flux) |
| `image_voulue` | si `visuel` = `image` | **description** de la photo idéale (sujet, lieu, action). **Jamais de lien.** |
| `a_dire` | non | ce que l'auteur dit à l'oral (prompteur, jamais à l'écran) |

**Règles d'écriture (public débutant à intermédiaire) :**
1. **Une seule idée par message.** S'il y a deux idées, faire deux messages.
2. **Le métier avant les chiffres** : dans chaque chapitre, le premier message explique ce que c'est (souvent avec une
   image), les chiffres viennent ensuite pour le prouver.
3. **3 données au plus par message** (6 pour une répartition ou une comparaison). Les autres restent dans le bloc `donnees`, consultables en détail.
4. Un chiffre affiché dans `phrase` ou `explication` doit correspondre exactement à une donnée (ou à un calcul simple
   expliqué dans `a_dire`).
5. Les hypothèses et interprétations se signalent dans la phrase (« selon nos hypothèses », « à notre avis »).

**Les chapitres (ordre par défaut, réorganisable) :**

| id | Chapitre | Messages |
|---|---|---|
| `c01_qui` | Qui est l'entreprise ? | 2-3 |
| `c02_argent` | Comment elle gagne de l'argent | 2-4 |
| `c03_…` à `c0n_…` | **Un chapitre par pôle** de `meta.poles` (avec `"pole"`) | 2-4 chacun : ce que c'est → croissance / marge → face aux concurrents |
| `c_marches` | Pourquoi la demande grimpe (et ce qui peut la freiner) | 2-4 |
| `c_concurrence` | Concurrents et fossé | 2-4 |
| `c_acquisitions` | Les acquisitions | 1 par grande acquisition + 1 bilan |
| `c_risques` | Ce qui peut mal tourner | 2-4 |
| `c_direction` | Direction et solidité financière | 2-3 |
| `c_valorisation` | Valorisation et décision | 3-4 : à quel prix acheter → ce qu'il faudrait croire → décision |

## 5. Livraison par lots

| Lot | Contenu |
|---|---|
| 1 | `meta`, `sources`, `donnees` |
| 2 | `hypotheses`, `affirmations`, `marches`, `risques`, `acquisitions`, `chronologie`, `valorisation`, `decision`, `score` |
| 3 | `recit` des chapitres jusqu'aux pôles inclus |
| 4 | `recit` des chapitres suivants |

Après chaque lot, Claude renvoie un rapport de contrôle (mêmes contrôles qu'en v2.1, plus : message sans `phrase` ou de
plus de 10 mots, plus de 3 données par message, chiffre cité absent des données, `image_voulue` manquante, lien d'image
présent, donnée sans `pole`).
