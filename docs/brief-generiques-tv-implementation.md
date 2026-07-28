# Brief d'implémentation — thème « Génériques TV »

*Rédigé le 28 juillet 2026. Destiné à un agent qui exécute sans repasser par le
commanditaire.*

## Mission

Ajouter un **sixième thème** au catalogue : 55 génériques de séries TV et de
dessins animés, tels qu'ils ont été diffusés en France entre 1995 et 2012.

Ce thème ne tient pas dans le format actuel. Ses extraits durent 10 à 60
secondes là où le catalogue en exige 90 au minimum, et deux règles de
`tools/verify-catalog.mjs` deviennent contradictoires sous 31 secondes. Le
chantier comporte donc **trois changements de code** avant la moindre ligne de
JSON.

Le raisonnement complet est dans
`docs/superpowers/specs/2026-07-28-theme-generiques-tv-design.md`. **Lis-le
d'abord** : il explique pourquoi la fenêtre s'arrête à 2012, pourquoi
`vuesMin` est à `null`, et pourquoi Dexter est écarté. Ces décisions ne sont pas
rediscutables ici.

Lis aussi la section « Le catalogue » du `README.md` — elle décrit le format,
les règles et les outils.

## Ce que tu ne dois PAS faire

- **Ne touche à aucun thème existant.** `catalog/*.json` ne bouge pas, un seul
  fichier est créé.
- **Ne modifie pas le comportement des cinq thèmes livrés.** C'est la contrainte
  centrale de l'étape 2 : la refonte des bornes de durée doit être un no-op pour
  eux, et un test l'exige.
- **N'invente jamais un `youtubeId`.** Chaque id vient d'une recherche réelle et
  passe la sonde. Un id inventé qui tombe par hasard sur une vidéo valide est le
  pire résultat possible : indétectable en revue, cassé en soirée.
- **Ne renomme rien.** `id: "generiques-tv"`, `name: "Génériques TV"`, et les 55
  slugs du tableau de l'étape 5 sont imposés — ils ont été vérifiés contre les
  collisions.
- **N'ajoute aucune entrée de ta propre initiative.** Une liste de réserves
  existe, dans un ordre imposé (« Si ça coince »).
- **Ne baisse aucun seuil pour faire passer une entrée récalcitrante.** Si une
  entrée ne passe pas, elle sort et une réserve la remplace.
- **Ne réintroduis pas Dexter (la série).** `verify-catalog.mjs:409-416` refuse
  qu'un nom de case soit contenu dans un autre, et `dexter` ⊂
  `lelaboratoiredededexter`. C'est une erreur dure, mesurée, pas une intuition.

## Étape 1 — le champ `dureeMin`

**`server/catalog.mjs`, dans `parseTheme`**, juste après le contrôle de
`vuesMin` (`:76-78`) :

```js
// Comme `titresMin` et `vuesMin` : un réglage que seul verify-catalog consomme,
// validé ici parce qu'un champ que la CI lit et que le boot ignore, c'est une
// faute de frappe qui ne se découvre jamais.
if (data.dureeMin != null && !(Number.isInteger(data.dureeMin) && data.dureeMin >= 5)) {
  throw new Error(`${label} : dureeMin invalide (${data.dureeMin}) — un entier de 5 au moins`);
}
```

**Pourquoi 5 et pas 1.** La marge de lecture dérivée à l'étape 2 vaut
`dureeMin - 1`. Sous 5 secondes elle ne protège plus rien, et un extrait de 4
secondes n'est pas un générique, c'est un bruit.

**Aucune borne haute n'est contrôlée** : `DUREE_MAX` appartient à
`verify-catalog`, et un `dureeMin` absurdement grand échoue bruyamment dès la
première vidéo plutôt que silencieusement.

## Étape 2 — les bornes de durée, dérivées d'un seul réglage

C'est l'étape délicate. Lis-la en entier avant d'écrire.

### Le problème

`tools/verify-catalog.mjs` applique deux contrôles (`:473-479`) :

```js
if (meta.duree < DUREE_MIN || meta.duree > DUREE_MAX)   // 90 / 480
if (track.startAt > meta.duree - 30)
```

Sur une vidéo de 15 secondes, le second se lit `startAt > -15` : **n'importe
quel `startAt` échoue**, or `parseTheme` en exige un strictement positif. Les
deux règles sont contradictoires sous 31 secondes. Abaisser le plancher sans
toucher à la marge ne suffit donc pas — c'est le piège de ce chantier.

### La correction

Ajoute dans **`server/catalog.mjs`**, à côté de `kindDe` et `lexiqueDe`
(`:21-30`), où vivent déjà les défauts de thème :

```js
/** Les bornes de durée d'un thème. La marge de lecture dérive du plancher :
 *  un thème de génériques accepte des vidéos de 15 s, où « laisser 30 s de
 *  lecture après startAt » est arithmétiquement impossible. */
export function bornesDuree(theme) {
  const dureeMin = theme?.dureeMin ?? 90;
  return { dureeMin, resteMin: Math.min(30, dureeMin - 1) };
}
```

Dans **`tools/verify-catalog.mjs`** :

1. **Supprime la constante `DUREE_MIN` (`:24`).** Le défaut de 90 vit désormais
   dans `bornesDuree` ; le laisser en double garantit qu'un jour les deux
   divergent. `DUREE_MAX` (`:25`) reste où elle est — aucun thème ne la
   paramètre.
2. Importe `bornesDuree` depuis `../server/catalog.mjs` (même dépôt, ESM nu,
   aucune dépendance ajoutée — le fichier n'importe aujourd'hui que des modules
   Node, `:16-19`).
3. Résous les bornes là où `titresMin` et `vuesMin` le sont déjà (`:283`,
   `:303`), puis remplace les deux contrôles :

```js
if (meta.duree < dureeMin || meta.duree > DUREE_MAX) {
  defauts.push(`durée ${meta.duree}s hors plage ${dureeMin}-${DUREE_MAX}s`);
}
if (meta.duree - track.startAt < resteMin) {
  defauts.push(`startAt ${track.startAt}s laisse moins de ${resteMin}s de lecture (durée ${meta.duree}s)`);
}
```

### L'équivalence à ne pas casser

Sans `dureeMin`, `bornesDuree` rend `{ dureeMin: 90, resteMin: 30 }`. Le premier
contrôle est alors identique à l'ancien, et :

```
duree - startAt < 30   ⟺   startAt > duree - 30
```

**Les cinq thèmes existants ne bougent donc pas d'un pouce.** Ce n'est pas un
effet de bord espéré, c'est une contrainte : elle est couverte par un test à
l'étape 4, et tu dois faire tourner `verify-catalog` sur les six thèmes avant de
commiter.

Sur `generiques-tv` à `dureeMin: 10`, `resteMin` vaut 9 : un générique de 15 s
accepte un `startAt` jusqu'à 6, un de 10 s impose `startAt: 1`.

## Étape 3 — le `kind` « generique » et le bouton ↺ Rejouer

Un générique de 15 secondes passe, la salle lève la tête, c'est fini. Sans
bouton Rejouer il n'existe aucun moyen de le repasser : Play/Pause ne rembobine
pas (`src/screens/Presentateur.tsx:93-95`). Le projet a déjà rencontré ça — c'est
la raison d'être du bouton, et le commentaire `:109-113` le dit.

Trois modifications :

1. **`server/catalog.mjs:12`** :
   ```js
   export const KINDS = ['musique', 'pub', 'replique', 'generique'];
   ```
2. **`src/screens/Presentateur.tsx:113`** :
   ```js
   const rejouable = etat?.kind === 'pub' || etat?.kind === 'replique' || etat?.kind === 'generique'
   ```
   Le commentaire au-dessus (`:109-113`) dit « un besoin qui n'existe pas sur ces
   thèmes-là » et celui de `:114-116` dit « un cas qui ne concerne que deux
   thèmes ». **Les deux deviennent faux — réécris-les**, en gardant le
   raisonnement d'origine : un extrait court a besoin d'être repassé, un extrait
   musical de 3 minutes n'en a pas besoin.
3. **`catalog/generiques-tv.json`** déclare `"kind": "generique"`.

L'alternative écartée était de déclarer `kind: "replique"` pour obtenir le bouton
sans toucher au code. C'est mettre une donnée fausse dans le catalogue pour
obtenir un comportement d'interface. **Ne la reprends pas.**

## Étape 4 — les tests

### `server/test/catalog.test.mjs`

Le fichier couvre déjà `kind`, `lexique`, `titresMin`, les alias et le catalogue
livré. Ajoute :

1. **`dureeMin` invalide** — `0`, `4`, `-1`, `1.5`, `"30"` — lève
   `/dureeMin invalide/`. Le tableau de cas du test « un catalogue cassé explose
   au boot » (`:36-63`) est l'endroit naturel.
2. **`dureeMin` valide** est conservé après `parseTheme`.
3. **`bornesDuree` sur un thème sans `dureeMin`** rend
   `{ dureeMin: 90, resteMin: 30 }`. **C'est le test de non-régression des cinq
   thèmes existants** — il énonce la contrainte au lieu de la laisser reposer sur
   une relecture. Ne l'omets pas.
4. **`bornesDuree({ dureeMin: 10 })`** rend `{ dureeMin: 10, resteMin: 9 }`.
5. **`KINDS` contient `generique`**, et un thème le déclarant se charge.

⚠️ Le test `:71`, **« les trois genres de thème sont acceptés »**, boucle sur
`KINDS` : il passera tout seul, mais **son nom devient faux**. Renomme-le.

Le test « le catalogue livré se charge et tient les trois tailles de grille »
(`:104`) boucle déjà sur tous les thèmes : il couvrira le nouveau sans
modification.

### `src/components/Grille.test.ts`

Ce test **n'importe que `rock-pop-punk.json`** (`:2`). Le brief du thème
précédent affirmait qu'il vérifiait « qu'aucun nom de case ne déborde » — c'est
faux pour tout thème sauf un. Fais-lui importer aussi `generiques-tv.json` et
boucler sur les deux.

Le risque de débordement est faible mais réel : la taille de police se règle sur
le **mot le plus long**, pas sur la longueur totale. Les mots les plus longs du
roster sont `Laboratoire` (11) et `Smallville` (10), soit la même classe que
`Cranberries` (11) qui passe déjà. **Si un nom déborde malgré tout, c'est le nom
affiché qu'on raccourcit — jamais le test qu'on assouplit.**

## Étape 5 — créer `catalog/generiques-tv.json`

En-tête du fichier :

```json
{
  "id": "generiques-tv",
  "name": "Génériques TV",
  "kind": "generique",
  "lexique": { "case": "générique", "cases": "génériques", "titre": "générique" },
  "titresMin": 1,
  "vuesMin": null,
  "dureeMin": 10,
  "bands": [ … ]
}
```

`logo` reste `null` sur les 55 entrées : la règle du tout ou rien s'applique au
thème, et aucune entrée n'a de logo libre.

### Les 55 slugs imposés

Vérifiés le 28 juillet 2026 contre le contrôle de collisions de
`verify-catalog.mjs:409-416` : **zéro collision entre les 55**, zéro slug en
double.

| Slug | Nom affiché | |
|---|---|---|
| `titeuf` | Titeuf | DA |
| `code-lyoko` | Code Lyoko | DA |
| `oggy-et-les-cafards` | Oggy et les cafards | DA |
| `kid-paddle` | Kid Paddle | DA |
| `les-zinzins-de-lespace` | Les Zinzins de l'espace | DA |
| `totally-spies` | Totally Spies | DA |
| `foot-2-rue` | Foot 2 Rue | DA |
| `wakfu` | Wakfu | DA |
| `ben-10` | Ben 10 | DA |
| `les-supers-nanas` | Les Supers Nanas | DA |
| `le-laboratoire-de-dexter` | Le Laboratoire de Dexter | DA |
| `johnny-bravo` | Johnny Bravo | DA |
| `courage-le-chien-froussard` | Courage, le chien froussard | DA |
| `ed-edd-n-eddy` | Ed, Edd n Eddy | DA |
| `bob-leponge` | Bob l'éponge | DA |
| `he-arnold` | Hé Arnold ! | DA |
| `les-razmoket` | Les Razmoket | DA |
| `kim-possible` | Kim Possible | DA |
| `phineas-et-ferb` | Phinéas et Ferb | DA |
| `quoi-dneuf-scooby-doo` | Quoi d'neuf Scooby-Doo ? | DA |
| `avatar-le-dernier-maitre-de-lair` | Avatar, le dernier maître de l'air | DA |
| `pokemon` | Pokémon | DA |
| `digimon` | Digimon | DA |
| `yu-gi-oh` | Yu-Gi-Oh! | DA |
| `naruto` | Naruto | DA |
| `les-simpson` | Les Simpson | DA |
| `south-park` | South Park | DA |
| `un-gars-une-fille` | Un gars, une fille | Série |
| `camera-cafe` | Caméra Café | Série |
| `plus-belle-la-vie` | Plus belle la vie | Série |
| `bref` | Bref | Série |
| `kaamelott` | Kaamelott | Série |
| `friends` | Friends | Série |
| `malcolm` | Malcolm | Série |
| `scrubs` | Scrubs | Série |
| `the-big-bang-theory` | The Big Bang Theory | Série |
| `dr-house` | Dr House | Série |
| `greys-anatomy` | Grey's Anatomy | Série |
| `les-experts` | Les Experts | Série |
| `24-heures-chrono` | 24 heures chrono | Série |
| `buffy-contre-les-vampires` | Buffy contre les vampires | Série |
| `charmed` | Charmed | Série |
| `smallville` | Smallville | Série |
| `les-freres-scott` | Les Frères Scott | Série |
| `prison-break` | Prison Break | Série |
| `desperate-housewives` | Desperate Housewives | Série |
| `x-files` | X-Files | Série |
| `game-of-thrones` | Game of Thrones | Série |
| `the-walking-dead` | The Walking Dead | Série |
| `lost` | Lost | Série |
| `breaking-bad` | Breaking Bad | Série |
| `les-soprano` | Les Soprano | Série |
| `weeds` | Weeds | Série |
| `true-blood` | True Blood | Série |
| `sons-of-anarchy` | Sons of Anarchy | Série |

**Un titre par entrée suffit** (`titresMin: 1`) : une émission a un générique.
Cinq ou six entrées peuvent en porter deux ou trois si des génériques
réellement différents existent — Pokémon et ses génériques de saison en VF,
Digimon, Yu-Gi-Oh!, Scooby-Doo et ses séries successives. **N'ajoute jamais une
« version longue » comme second titre** : c'est le même morceau, ça ne crée
aucune variété, ça crée une case qui rejoue deux fois la même chose.

## Étape 6 — sourcer les génériques

Environ **60 vidéos** à trouver. C'est le gros du travail, et le seul vrai
risque. C'est faisable : `yt-dlp` a été testé le 28 juillet 2026 sur Titeuf,
Code Lyoko, Kaamelott, Lost, Breaking Bad, How I Met Your Mother et Ed Edd n
Eddy — tous trouvés.

**1. Chercher.**

```bash
yt-dlp --skip-download --no-warnings \
  --print "%(id)s | %(duration)s s | %(view_count)s | %(channel)s | %(title)s" \
  "ytsearch5:<émission> générique français"
```

Pour les séries américaines dont le générique est une chanson signée, cherche
plutôt `"ytsearch5:<série> theme song"` ou directement l'artiste.

**2. Choisir**, dans cet ordre :

1. Durée entre **10 et 480 secondes**.
2. Chaîne officielle si elle existe (Cartoon Network, Nickelodeon, la chaîne de
   l'artiste ou du label). **Sinon une chaîne de fan est acceptable** — c'est la
   norme sur ce thème, et ça n'a rien à voir avec le répertoire musical : Code
   Lyoko sort sur `codelyoko62` avec 1,9 M de vues.
3. Titre nommant l'émission — c'est ce que contrôle l'identité, et les uploads
   de génériques le font presque toujours.
4. **Version française quand elle existe.** C'est l'ancrage du thème.

**3. Rejeter** tout ce qui sent la reprise, le remix, le karaoké, la version
accélérée. La liste des marqueurs est la constante `INTERDITS` de
`tools/verify-catalog.mjs`.

⚠️ **Piège propre à ce thème : `instrumental` est un marqueur interdit, et
beaucoup de génériques *sont* instrumentaux** — X-Files, Prison Break, Game of
Thrones, Lost, Dr House. Retiens un upload dont le **titre** ne porte pas le mot.
Ne renonce pas à l'entrée, et ne touche pas à `INTERDITS`.

**4. Sonder l'embarquabilité :**

```bash
node tools/probe.mjs <id1> <id2> ...
```

Le code HTTP doit être **200**. Tout le reste se rejette — une vidéo non
embarquable est un écran noir en pleine soirée. C'est le contrôle le plus
important de tous, et les uploads de fans y échouent plus souvent que les
chaînes officielles.

**5. Ajouter un `alias` quand le titre de la vidéo ne nomme pas l'émission.**
Environ quinze entrées sont concernées — les séries dont le générique est une
chanson signée :

```json
"alias": ["I'll Be There for You", "The Rembrandts"]
```

Cas connus : `friends` → *I'll Be There for You* / The Rembrandts · `malcolm` →
*Boss of Me* / They Might Be Giants · `dr-house` → *Teardrop* / Massive Attack ·
`charmed` → *How Soon Is Now* · `smallville` → *Save Me* / Remy Zero ·
`les-freres-scott` → *I Don't Want to Be* / Gavin DeGraw · `les-experts` →
*Who Are You* / The Who · `scrubs` → *Superman* / Lazlo Bane · `les-soprano` →
*Woke Up This Morning* · `weeds` → *Little Boxes* · `true-blood` → *Bad Things* ·
`sons-of-anarchy` → *This Life*. Vérifie chacun plutôt que de recopier.

## Étape 7 — `startAt`

`startAt` est la seconde à laquelle le générique démarre en soirée. **Jamais 0**
— le vérificateur le refuse.

**Ce thème est plus simple que les autres sur ce point.** Un générique n'a pas
vingt secondes d'introduction à sauter : il est reconnaissable dès la première
note, et c'est précisément ce qu'on veut jouer. La convention du catalogue
(médiane 42 s, issue de 700 chansons) **ne s'applique pas ici**.

- **Génériques courts (10-30 s)** : `startAt: 1`. La contrainte `resteMin` de 9
  secondes l'impose de toute façon sur les plus courts.
- **Génériques moyens (30-60 s)** : 1 à 5 secondes, pour sauter un éventuel
  logo de chaîne ou un silence de tête.
- **Chansons complètes (90 s et plus)** : là seulement, cherche le moment
  reconnaissable comme sur les autres thèmes, en croisant le heatmap YouTube
  (`yt-dlp -J`, champ `heatmap`).

Marque dans ton rapport final tout `startAt` supérieur à 5 comme **à valider à
l'oreille** — c'est la seule partie du travail qu'un humain doit reprendre.

## Étape 8 — le README

Section « Le catalogue » :

1. **Le tableau des thèmes (`:141-147`)** : ajoute la ligne `generiques-tv`.
   Profites-en pour corriger `musiques-de-films`, qui annonce « 43 | 129 » alors
   que le fichier contient **42 cases et 114 titres**.
2. **`kind` (`:197-203`)** : ajoute `generique` à l'énumération, et explique
   qu'il donne le bouton Rejouer pour la même raison que `replique`.
3. **`kind`, la phrase fausse (`:197-198`)** : « Il ne pilote que trois choses —
   le lexique, **la sévérité de la vérification**, et l'apparition du bouton ».
   `tools/verify-catalog.mjs` **ne lit jamais `kind`**. Corrige : il ne pilote
   que deux choses. Elle a survécu au chantier précédent, elle ne doit pas
   survivre à celui-ci.
4. **Les champs optionnels (`:195+`)** : documente `dureeMin` à côté de
   `titresMin` et `vuesMin` — le plancher de durée par thème, avec la marge de
   lecture qui en dérive, et pourquoi les deux ne peuvent pas être réglées
   séparément.
5. **La promesse d'en-tête (`:138-139`)** : « Ajouter un thème = ajouter un
   fichier. **Zéro changement de code** ». Ce chantier en est le premier
   contre-exemple. La phrase reste vraie pour un thème musical ordinaire —
   n'efface pas la promesse, nuance-la : un thème qui sort des hypothèses du
   format (extraits courts, extraits à repasser) paie son écart en code, une
   fois, et le champ qu'il ajoute sert au suivant.

## Vérification — critères d'acceptation

Le travail est fini quand **tout** ceci passe :

```bash
node tools/verify-catalog.mjs catalog/generiques-tv.json --durations
node tools/verify-catalog.mjs            # LES SIX THÈMES — non-régression
npm test                                 # front
npm run test:server                      # API
```

La deuxième commande n'est **pas facultative** : l'étape 2 touche un chemin
partagé par tout le catalogue.

Le vérificateur doit afficher :

```
Catalogue conforme : zéro doublon, zéro collision, zéro startAt nul, tout est embarquable.
```

Et concrètement :

- [ ] **55 entrées**, pas 54, pas 56
- [ ] chaque entrée a **au moins un** titre, et **au plus trois**
- [ ] zéro slug en double, zéro `youtubeId` en double
- [ ] aucun `startAt` nul ou négatif
- [ ] 100 % des vidéos en oEmbed 200
- [ ] toutes les durées entre **10 et 480 s**
- [ ] aucune reprise, remix, karaoké ; aucun titre portant le mot `instrumental`
- [ ] zéro collision de nom et de titre
- [ ] les cinq thèmes existants passent exactement comme avant
- [ ] `bornesDuree()` sans argument utile rend `{ 90, 30 }` — test présent
- [ ] `src/components/Grille.test.ts` couvre le nouveau thème et passe

## Commits attendus

Trois commits atomiques, convention angular en français, comme le reste du dépôt :

1. `feat(catalogue): plancher de durée par thème` — étapes 1, 2, tests associés,
   doc `dureeMin`. **Ce commit ne doit rien changer au comportement observable.**
2. `feat(console): bouton Rejouer sur les thèmes de génériques` — étape 3, tests,
   doc `kind`.
3. `feat(catalogue): verser le thème Génériques TV` — étapes 5, 6, 7, tableau du
   README.

## Pièges connus

**Les deux règles de durée sont couplées.** C'est dit trois fois dans ce brief
parce que c'est l'erreur qu'on fait naturellement : abaisser `DUREE_MIN` et
s'arrêter là produit un thème que le vérificateur refuse intégralement, avec un
message qui ne désigne pas la cause.

**Les collisions de noms sont invisibles à l'œil nu.** Les 55 du tableau ont été
contrôlées. **Si tu substitues quoi que ce soit, refais tourner le contrôle** —
il vaut mieux le découvrir avant de sourcer trois vidéos pour rien. Le contrôle
compare les noms aplatis (minuscules, sans accents, sans ponctuation) et refuse
qu'un nom soit contenu dans un autre. Il compare aussi chaque **titre de piste**
aux noms des autres cases.

**Les vues sont basses, et c'est normal.** Relevés du 28 juillet 2026 : Titeuf
480 k, Code Lyoko 1,9 M, Kaamelott 290 k. La cible habituelle de 10 M est hors
sujet, c'est pourquoi `vuesMin` est à `null`. Ne panique pas devant un générique
à 200 k vues. Panique devant un générique à 2 k : c'est un upload confidentiel
qui sera supprimé.

**Certains génériques sont trop courts pour être jouables.** Le plancher de 10 s
est un arbitrage du commanditaire, pas une facilité. Si une entrée n'a d'upload
qu'en dessous, elle sort et une réserve la remplace.

## Si ça coince

Si une entrée s'avère insourçable — aucun upload embarquable, aucun sous 480 s,
générique sous 10 s — **ne la remplace pas de ta propre initiative.** Une réserve
a été constituée, dans cet ordre, et elle a été contrôlée contre les collisions :

**Dessins animés** : Futurama · Les Griffin · Martin Mystère · Corneil et Bernie
· W.I.T.C.H. · Danny Fantôme · Beyblade · Sonic X

**Séries** : How I Met Your Mother · Alerte à Malibu · Newport Beach · Monk ·
Veronica Mars · NCIS · Doctor Who

Pioche dans le bloc correspondant pour garder l'équilibre 27 / 28, signale la
substitution, refais le contrôle de collisions, et continue. **Dexter n'est pas
dans cette réserve** et ne doit pas y entrer tant que `Le Laboratoire de Dexter`
est présent.

Si les réserves ne suffisent pas et que le thème descend sous **40 cases**,
arrête-toi et signale-le : 40 est le plancher dur du projet, le pool d'une partie
faisant le double de la plus grande grille.

## Rapport final

Livre-le avec, dans l'ordre :

1. Les substitutions d'entrées, et pourquoi chacune.
2. Les entrées portant plus d'un titre, et lesquels.
3. La liste des `startAt` supérieurs à 5, à valider à l'oreille.
4. Les entrées dont l'upload retenu est une chaîne de fan plutôt qu'officielle —
   ce sont celles qui casseront en premier.
5. La sortie complète de `node tools/verify-catalog.mjs` sur les six thèmes.
