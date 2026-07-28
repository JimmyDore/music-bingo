# Conception — thème « Génériques TV »

*Rédigé le 28 juillet 2026, au terme d'un cadrage avec le commanditaire.*

## Mission

Ajouter un sixième thème au catalogue : les génériques de séries TV et de
dessins animés, tels qu'ils ont été diffusés en France entre 1995 et 2012.

Le thème compte **55 cases**. Contrairement aux cinq thèmes existants, il ne
tient pas dans le format actuel : ses extraits durent 10 à 60 secondes là où le
catalogue en attend 90 au minimum. Trois changements de code l'accompagnent
donc, tous conçus pour ne rien modifier au comportement des thèmes déjà livrés.

## Le public visé, et ce qu'il exclut

La fenêtre est **1995-2012**, c'est-à-dire les programmes regardés par les
26-40 ans d'aujourd'hui : Cartoon Network, Gulli, France 3 le mercredi, M6 en
access. Elle a été choisie explicitement, et deux bords sont exclus par cette
décision :

- **Trop vieux** — Goldorak, Candy, Récré A2, le Club Dorothée. Ce sont les
  génériques des parents du public visé.
- **Trop récents** — Gumball, Miraculous, Adventure Time, Stranger Things,
  Peaky Blinders. Seuls les enfants d'aujourd'hui les reconnaissent, et une
  case que la moitié de la salle ne voit pas passer est un trou noir.

L'ancrage est **français** : quand une version française du générique existe,
c'est elle qui est retenue, jamais la version originale. C'est la même décision
que celle prise pour les Disney de `musiques-de-films` (commit `46c0b29`).

Le mélange séries / dessins animés est voulu : ce sont deux moitiés du même
souvenir de télévision, et les séparer donnerait deux thèmes de 27 cases,
c'est-à-dire deux thèmes sous le plancher de 40.

## La forme du thème

`catalog/generiques-tv.json`

| Champ | Valeur | Raison |
|---|---|---|
| `id` | `generiques-tv` | |
| `name` | `Génériques TV` | |
| `kind` | `generique` | **nouvelle valeur** — voir « Le bouton Rejouer » |
| `lexique` | `{ case: "générique", cases: "génériques", titre: "générique" }` | |
| `titresMin` | `1` | une émission a un générique |
| `vuesMin` | `null` | |
| `dureeMin` | `10` | **nouveau champ** |
| Cases | 55 | |

### Le lexique

`lexique.case` s'insère derrière l'article défini masculin, dans la console du
présentateur (`src/screens/Presentateur.tsx:486`) :

> « 2 cases cochées dont **le générique** n'est jamais passé. »
> « Toutes les cases cochées correspondent à **un générique** passé. »

`lexique.cases` alimente l'indice de l'écran de création
(`src/screens/Creation.tsx:59`) : « 55 génériques ». `lexique.titre` est
déclaré, validé et servi par l'API, mais **aucun écran ne le lit aujourd'hui** ;
il est renseigné par cohérence, pas par nécessité.

### `titresMin: 1`, et ce que ça coûte

La règle des trois titres existe pour qu'une même case ne rejoue pas le même
extrait de soirée en soirée. Ici, elle tombe : une émission a un générique, et
un seul. Le précédent est déjà posé et documenté par `annees-80`, où la variété
française des années 80 s'est révélée être un cimetière de tubes uniques.

**La conséquence est assumée** : sur ce thème, une case donnée rejouera toujours
le même extrait. Cinq ou six entrées y échapperont — Pokémon et ses génériques
de saison en VF, Digimon, Yu-Gi-Oh!, Scooby-Doo et ses séries successives — et
pas davantage.

La seule compensation disponible est le **nombre de cases**. Le pool d'une
partie fait le double de la grille, soit 40 cases pour une 4×5 : à 45 cases,
deux parties consécutives seraient presque identiques. À 55, quinze restent sur
le banc à chaque tirage. Ça ne rétablit pas la variété perdue à l'intérieur
d'une case, ça la limite entre deux parties.

### `vuesMin: null`

Les génériques sortent entre 200 k et 500 k vues, avec un pic à 3,7 M pour Code
Lyoko (relevés au sondage du 28 juillet 2026). La cible de 10 M est hors sujet,
pour la raison déjà écrite dans le README à propos des musiques de films : un
générique culte est éparpillé sur cinquante réuploads et aucun n'en capte plus
qu'une part.

`null` retire le thème de l'audit `--views` **et du palmarès**. C'est
intentionnel : 55 génériques monopoliseraient le bas du classement des 20 titres
les moins vus, qui n'existe que pour faire remonter les chansons réellement
confidentielles des autres thèmes.

## Les trois changements de code

### 1. Le champ `dureeMin`

Même patron que `titresMin` et `vuesMin` : un réglage que seul
`tools/verify-catalog.mjs` consomme, mais que `server/catalog.mjs` valide au
boot — un champ que la CI lit et que le boot ignore, c'est une faute de frappe
qui ne se découvre jamais.

**`server/catalog.mjs`, dans `parseTheme`**, à côté des contrôles de `titresMin`
et `vuesMin` :

```js
if (data.dureeMin != null && !(Number.isInteger(data.dureeMin) && data.dureeMin >= 5)) {
  throw new Error(`${label} : dureeMin invalide (${data.dureeMin}) — un entier de 5 au moins`);
}
```

Le plancher de 5 n'est pas décoratif : la marge de lecture dérivée ci-dessous
vaut `dureeMin - 1`, et sous 5 secondes elle ne protège plus rien. Aucune borne
haute n'est contrôlée — `DUREE_MAX` appartient à `verify-catalog`, et un
`dureeMin` absurdement grand échoue bruyamment dès la première vidéo plutôt que
silencieusement.

### 2. Les bornes de durée, dérivées d'un seul réglage

`tools/verify-catalog.mjs` applique aujourd'hui deux contrôles (`:474-479`) :

```js
if (meta.duree < DUREE_MIN || meta.duree > DUREE_MAX)     // 90 / 480
if (track.startAt > meta.duree - 30)
```

**Le second est un verrou.** Sur une vidéo de 15 secondes il se lit
`startAt > -15`, donc n'importe quel `startAt` échoue — or `parseTheme` en exige
un strictement positif. Les deux règles deviennent contradictoires sous 31
secondes. Abaisser `DUREE_MIN` sans toucher à cette marge ne suffit donc pas.

La marge doit dériver du même réglage. Elle vit avec les autres défauts de
thème, dans `server/catalog.mjs`, à côté de `kindDe` et `lexiqueDe` :

```js
/** Les bornes de durée d'un thème. La marge de lecture dérive du plancher :
 *  un thème de génériques accepte des vidéos de 15 s, où « laisser 30 s de
 *  lecture après startAt » est arithmétiquement impossible. */
export function bornesDuree(theme) {
  const dureeMin = theme?.dureeMin ?? 90;
  return { dureeMin, resteMin: Math.min(30, dureeMin - 1) };
}
```

`tools/verify-catalog.mjs` l'importe (`../server/catalog.mjs` — même dépôt, ESM
nu, aucune dépendance ajoutée) et remplace les deux contrôles par :

```js
if (meta.duree < dureeMin || meta.duree > DUREE_MAX) { … }
if (meta.duree - track.startAt < resteMin) { … }
```

La constante `DUREE_MIN` de `verify-catalog.mjs:24` **disparaît** : le défaut de
90 vit désormais dans `bornesDuree`, et le laisser en double garantirait qu'un
jour les deux divergent. `DUREE_MAX` reste où elle est — aucun thème ne la
paramètre.

**Aucun thème existant ne bouge.** Sans `dureeMin`, `bornesDuree` rend
`{ 90, 30 }` : le premier contrôle est identique, et `duree - startAt < 30`
équivaut exactement à `startAt > duree - 30`. C'est une contrainte de la
conception, pas un effet de bord espéré — elle doit être couverte par un test.

Sur `generiques-tv` à `dureeMin: 10`, `resteMin` vaut 9 : un générique de 15 s
accepte un `startAt` jusqu'à 6, un de 10 s impose `startAt: 1`. Le garde-fou
reste réel.

### 3. Le bouton ↺ Rejouer, et le `kind` qui le déclenche

Un générique de 15 secondes passe, la salle lève la tête, c'est fini. Le projet
a déjà rencontré exactement ça — c'est la raison d'être du bouton Rejouer, dont
le commentaire dit : *« Une réplique de film dure trois secondes : on la
repasse »* (`src/screens/Presentateur.tsx:109-113`). Sans lui il n'existe aucun
moyen de repasser un extrait : Play/Pause ne rembobine pas (`:93-95`).

Le bouton n'apparaît aujourd'hui que sur `kind === 'pub' || kind === 'replique'`.
On ajoute donc une quatrième valeur :

- `server/catalog.mjs` : `KINDS = ['musique', 'pub', 'replique', 'generique']`
- `src/screens/Presentateur.tsx:113` : ajouter `|| etat?.kind === 'generique'`
- `README.md` : mettre `kind` à jour

L'alternative écartée était de déclarer `kind: 'replique'` — zéro ligne de code,
le bouton apparaît, et `kind` n'est affiché nulle part. C'est mettre une donnée
fausse dans le catalogue pour obtenir un comportement d'interface, et ça se
paierait le jour où `kind` pilotera autre chose.

**Note à corriger au passage** : le README affirme que `kind` pilote « la
sévérité de la vérification du catalogue ». C'est faux — `tools/verify-catalog.mjs`
ne lit jamais `kind`. La phrase doit être rectifiée dans le même commit, sinon
elle survivra à ce chantier comme elle a survécu au précédent.

## Le roster — 55 cases

### 27 dessins animés

| Bloc | Cases |
|---|---|
| Production FR / France 3 (8) | Titeuf · Code Lyoko · Oggy et les cafards · Kid Paddle · Les Zinzins de l'espace · Totally Spies · Foot 2 Rue · Wakfu |
| Cartoon Network VF (6) | Ben 10 · Les Supers Nanas · Le Laboratoire de Dexter · Johnny Bravo · Courage, le chien froussard · Ed, Edd n Eddy |
| Nickelodeon VF (3) | Bob l'éponge · Hé Arnold ! · Les Razmoket |
| Disney (2) | Kim Possible · Phinéas et Ferb |
| Autres US (2) | Quoi d'neuf Scooby-Doo ? · Avatar, le dernier maître de l'air |
| Animés japonais VF (4) | Pokémon · Digimon · Yu-Gi-Oh! · Naruto |
| Prime adulte (2) | Les Simpson · South Park |

### 28 séries

| Bloc | Cases |
|---|---|
| France (5) | Un gars, une fille · Caméra Café · Plus belle la vie · Bref · Kaamelott |
| Comédie US (4) | Friends · Malcolm · Scrubs · The Big Bang Theory |
| Procédural (4) | Dr House · Grey's Anatomy · Les Experts · 24 heures chrono |
| Teen 2000s (4) | Buffy contre les vampires · Charmed · Smallville · Les Frères Scott |
| Prime (7) | Prison Break · Desperate Housewives · X-Files · Game of Thrones · The Walking Dead · Lost · Breaking Bad |
| Câble US (4) | Les Soprano · Weeds · True Blood · Sons of Anarchy |

### Réserves, dans l'ordre de repêchage

Le sourcing va en tuer : vidéo non embarquable, upload supprimé, générique sous
10 secondes. On pioche ici **sans repasser par le commanditaire**, en gardant
l'équilibre dessins animés / séries.

Dessins animés : `Futurama` · `Les Griffin` · `Martin Mystère` · `Corneil et
Bernie` · `W.I.T.C.H.` · `Danny Fantôme` · `Beyblade` · `Sonic X`

Séries : `How I Met Your Mother` · `Alerte à Malibu` · `Newport Beach` · `Monk`
· `Veronica Mars` · `NCIS` · `Doctor Who`

### Une exclusion qui n'est pas négociable

**Dexter (la série) est écarté.** `tools/verify-catalog.mjs:409-416` refuse
qu'un nom de case soit contenu dans un autre, et « Dexter » est contenu dans
« Le Laboratoire de Dexter ». C'est une erreur dure, pas une alerte. Le dessin
animé est conservé ; la série ne peut revenir que si le Laboratoire saute.

Cette vérification doit être **rejouée sur le roster final**, y compris sur les
titres de pistes : le même contrôle refuse un titre qui se confond avec le nom
d'une autre case.

## Le sourcing

C'est le vrai travail, et le seul risque réel du chantier. Il est faisable :
`yt-dlp` trouve ces génériques, testé le 28 juillet 2026 sur Titeuf, Code Lyoko,
Kaamelott, Lost, Breaking Bad, How I Met Your Mother et Ed Edd n Eddy.

**Méthode, par entrée :**

```bash
yt-dlp "ytsearch5:<émission> générique français" \
  --print "%(id)s | %(duration)s s | %(view_count)s | %(channel)s | %(title)s" \
  --skip-download
node tools/probe.mjs <id>
```

**Critères de choix du candidat**, dans l'ordre :

1. Durée entre 10 et 480 secondes.
2. Chaîne officielle si elle existe (Cartoon Network, Nickelodeon, la chaîne de
   l'artiste), sinon la chaîne de fan la plus stable. Les uploads de fans sont
   la norme sur ce thème et ne disqualifient pas — Code Lyoko sort sur
   `codelyoko62`, avec 1,9 M de vues.
3. Titre nommant l'émission — c'est ce que contrôle l'identité. Les uploads de
   génériques le font presque toujours.
4. Version française quand elle existe.

**Pièges connus de la liste `INTERDITS` :**

- **`instrumental`** est interdit, et beaucoup de génériques *sont*
  instrumentaux (X-Files, Prison Break, Game of Thrones, Lost). Il faut
  retenir un upload dont le titre ne porte pas le mot, pas renoncer à l'entrée.
- **`cover`, `reprise`, `karaoke`, `remix`** — les reprises de génériques
  pullulent sur YouTube. Le contrôle les attrape, mais autant ne pas les
  choisir.

**`startAt`** : 1 à 5 secondes sur les génériques courts. Contrairement à une
chanson, un générique n'a pas vingt secondes d'introduction à sauter — il est
reconnaissable dès la première note, et c'est précisément ce qu'on veut jouer.

**`alias`** : nécessaire dès que le générique est une chanson signée dont le
titre ne nomme pas l'émission. Environ quinze entrées sont concernées —
`Friends` → `["I'll Be There for You", "The Rembrandts"]`, `Malcolm` →
`["Boss of Me"]`, `Dr House` → `["Teardrop", "Massive Attack"]`. C'est le même
ordre de grandeur que `musiques-de-films`, où 30 entrées sur 42 en ont besoin.

**Aucun `youtubeId` ne doit être inventé.** Chaque id vient d'une recherche
réelle et passe la sonde. Un id inventé qui tombe par hasard sur une vidéo
valide est le pire résultat possible : indétectable en revue, cassé en soirée.

## Vérification et tests

**Tests à ajouter dans `server/test/catalog.test.mjs`** (le fichier couvre déjà
`kind`, `lexique`, `titresMin` et le catalogue livré) :

1. `dureeMin` invalide — `0`, `4`, `-1`, `1.5`, `"30"` — lève `/dureeMin invalide/`.
2. `dureeMin` valide est conservé après `parseTheme`.
3. `bornesDuree` sur un thème sans `dureeMin` rend `{ dureeMin: 90, resteMin: 30 }`.
   **C'est le test de non-régression des cinq thèmes existants** : il énonce la
   contrainte au lieu de la laisser reposer sur une relecture.
4. `bornesDuree({ dureeMin: 10 })` rend `{ dureeMin: 10, resteMin: 9 }`.
5. `KINDS` contient `generique`, et un thème le déclarant se charge.
6. Le catalogue livré : `generiques-tv` se charge, tient les trois tailles de
   grille (le test existant boucle déjà sur tous les thèmes, il couvrira le
   nouveau sans modification).

**Vérification manuelle du catalogue, avant commit :**

```bash
node tools/verify-catalog.mjs catalog/generiques-tv.json
node tools/verify-catalog.mjs catalog/generiques-tv.json --durations
node tools/verify-catalog.mjs            # les six thèmes, non-régression
npm run test:server && npm test
```

Les deux dernières commandes ne sont pas facultatives : le changement de
`bornesDuree` touche un chemin partagé par tout le catalogue.

## Documentation à mettre à jour

`README.md`, section « Le catalogue » :

- le tableau des thèmes (une sixième ligne, et les compteurs des autres) ;
- « Les champs optionnels » : ajouter `dureeMin`, ajouter `generique` à `kind` ;
- corriger l'affirmation périmée sur `kind` et la sévérité de la vérification.

## Risques

| Risque | Traitement |
|---|---|
| Un générique retenu est un upload de fan, supprimé dans six mois | C'est déjà la situation du catalogue entier, et `verify-catalog` tourne dans la CI pour l'apprendre par un job rouge plutôt qu'en soirée. |
| Le sourcing élimine plus d'entrées que prévu | 15 réserves, repêchables sans arbitrage. Plancher dur : 40 cases. |
| `resteMin` change le comportement d'un thème existant | Test 3 ci-dessus, plus `verify-catalog` sur les six thèmes avant commit. |
| Une case reste muette parce que le générique est trop confidentiel | `vuesMin: null` retire le filet automatique. C'est un arbitrage éditorial assumé : le jugement remplace le compteur sur ce thème. |
