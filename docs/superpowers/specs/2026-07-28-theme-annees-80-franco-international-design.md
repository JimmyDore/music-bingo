# Thème « Années 80 » — recomposition franco-internationale

*28 juillet 2026*

## Le problème

Le commanditaire, qui anime les soirées, ne reconnaît pas une grande partie des
cases du thème `annees-80`. Sa demande initiale : renommer le thème en
« Années 80 internationales », créer un thème « Années 80 françaises », et
remplacer les artistes qu'il ne connaît pas.

Le public visé a **25-35 ans** — des gens qui n'ont pas vécu les années 80 et les
connaissent par les compilations, les films et les mariages. Le commanditaire se
déclare représentatif de ce public : ce qu'il ne reconnaît pas, ses invités ne le
reconnaîtront pas non plus. C'est le critère retenu pour tout ce document.

## La méthode

Plutôt que d'arbitrer à l'intuition, on a fait passer au commanditaire un test de
reconnaissance sur 145 artistes — les 44 cases actuelles, 33 candidats
internationaux de remplacement, 59 candidats français et 9 cas limites — en
distinguant trois états :

- **connu** : le nom de l'artiste *et* au moins une de ses chansons ;
- **chanson seule** : il reconnaît le morceau mais pas le nom de l'artiste ;
- **inconnu**.

Cette distinction est la clé. Le README pose « **une case = un groupe, jamais un
titre** » : la case porte le nom de l'artiste. Un joueur qui reconnaît la chanson
sans savoir de qui elle est ne peut pas relier le son à sa case. **Pour ce jeu,
« chanson seule » vaut donc « inconnu ».**

## Les résultats

### Les 44 cases actuelles

| État | Cases |
|---|---|
| Connu | **24** |
| Chanson seule (Alphaville) | 1 |
| Nom seul, titres inconnus (ZZ Top) | 1 |
| Inconnu | 18 |

24 cases jouables sur 44 — 55 %.

### 33 candidats internationaux de remplacement

**2 connus sur 33** (Opus, Sabrina), soit 6 %. En ajoutant Queen — déjà employé
par `rock-pop-punk` — et le trio disco de 1978 (YMCA, I Will Survive, Rasputin),
le plafond d'un thème international calibré sur ce public plafonne à **~30
cases**.

C'est le résultat décisif : **il n'existe pas de banc de remplaçants
internationaux**. Le thème actuel contient déjà à peu près tout ce que ce public
connaît des années 80 anglo-saxonnes. « Remplacer les 17 par mieux » n'est pas
exécutable, et scinder en deux thèmes de 40+ demanderait 80 cases reconnaissables
là où on peut en aligner 30.

### 59 candidats français

**33 connus sur 59**, soit 56 % — un vivier **cinq fois plus dense** que
l'international. Neuf d'entre eux servent déjà dans un autre thème, ce qui laisse
**24 artistes français libres**.

### L'audit des vues, en contrepoint

`verify-catalog --views` sur le thème actuel : **132/132 titres valides, aucun
sous les 10 M**. Le palmarès des 20 moins vus démarre à 12,3 M. Duran Duran, que
le commanditaire ne reconnaît ni par le nom ni par la chanson, pèse 55 M de vues
sur *Hungry Like the Wolf*.

Les deux axes se contredisent. On tranche en faveur du test de reconnaissance,
parce que les vues sont mondiales et tous âges : elles mesurent une notoriété
globale, pas celle d'un Français de trente ans. Cet arbitrage est assumé, et il
est le seul point du design qui repose sur un jugement plutôt que sur une mesure.

## La décision

**Un seul thème, mixte.** On ne renomme pas, on ne scinde pas. `annees-80.json`
garde son `id` et son `name`, et devient un thème franco-international de
**50 cases**.

C'est l'inverse de la demande initiale, et c'est le test qui l'impose : la
scission exigeait 80 cases reconnaissables, la fusion en demande 50 et les
fournit.

## Composition — 50 cases

### Conservées (24)

Michael Jackson · Madonna · Prince · a-ha · Toto · Bon Jovi · Whitney Houston ·
Tina Turner · Cyndi Lauper · Eurythmics · Wham! · Phil Collins ·
Bruce Springsteen · Europe · Survivor · Rick Astley · Blondie · The Police · U2 ·
Bonnie Tyler · Lionel Richie · Kool & The Gang · Earth, Wind & Fire · David Bowie

Leurs 72 clips sont déjà validés : aucun travail.

### Retirées (20)

Alphaville · Billy Idol · Bryan Adams · Culture Club · Depeche Mode ·
Dire Straits · Duran Duran · George Michael · Journey · Men At Work ·
Pet Shop Boys · Roxette · Simple Minds · Tears For Fears · The Bangles ·
The Cure · Van Halen · INXS · ZZ Top · Modern Talking

60 clips supprimés. Sept des douze alertes « remaster » de l'audit disparaissent
avec elles ; celles de Rick Astley et Eurythmics restent et sont acceptées — ce
sont des clips officiels.

### Ajoutées — international (2)

Opus (*Live Is Life*) · Sabrina (*Boys (Summertime Love)*)

### Ajoutées — français (24)

| Artiste | Titres pressentis | Titres |
|---|---|---|
| Desireless | Voyage Voyage | 1 |
| Cookie Dingler | Femme libérée | 1 |
| Partenaire Particulier | Partenaire particulier | 1 |
| Axel Bauer | Cargo | 1 |
| Images | Les Démons de minuit · Now | 1-2 |
| Vanessa Paradis | Joe le taxi · Marilyn & John | 1-2 |
| Début de Soirée | Nuit de folie · Jardins d'enfants | 2 |
| Gilbert Montagné | On va s'aimer · Les Sunlights des tropiques | 2 |
| Stéphanie de Monaco | Ouragan · Flash | 2 |
| Herbert Léonard | Pour le plaisir · Amoureux fous | 2 |
| Patrick Bruel | Casser la voix · Alors regarde | 2 |
| Laurent Voulzy | Belle-Île-en-Mer · Le Cœur grenadine · Bopper en larmes | 2-3 |
| Les Rita Mitsouko | Marcia Baila · C'est comme ça · Andy | 3 |
| Elsa | T'en va pas · Jour de neige · Quelque chose dans mon cœur | 3 |
| Jeanne Mas | Toute première fois · En rouge et noir · Johnny Johnny | 3 |
| Marc Lavoine | Elle a les yeux revolver · Le Parking des anges · Qu'est-ce que t'es belle | 3 |
| Gold | Un peu plus près des étoiles · Ville de lumière · Capitaine abandonné | 3 |
| La Compagnie Créole | Le bal masqué · C'est bon pour le moral · Ça fait rire les oiseaux | 3 |
| Daniel Balavoine | L'Aziza · Mon fils ma bataille · Tous les cris les SOS | 3 |
| France Gall | Ella elle l'a · Résiste · Babacar | 3 |
| Pierre Bachelet | Les Corons · Elle est d'ailleurs · Marionnettiste | 3 |
| Julien Clerc | Femmes je vous aime · Mélissa · Hélène | 3 |
| Michel Berger | La groupie du pianiste · Quelques mots d'amour · Chanter pour ceux qui sont loin de chez eux | 3 |
| Serge Gainsbourg | Lemon Incest · Aux armes et cætera · Dieu fumeur de havanes | 3 |

Les titres de cette colonne sont des **pistes de départ, pas la liste finale** :
elles seront confirmées ou remplacées au sourcing, selon ce que la vérification
accepte. Le nombre de titres par entrée est une estimation à confirmer de la même
manière — un artiste qui s'avère fournir trois titres reconnaissables en aura
trois.

Environ **58 clips à sourcer**, contre 120 pour la scission abandonnée.

### Trois recalés, trois repêchés

Trois candidats français sont tombés à la vérification des collisions (voir
ci-dessous) :

| Recalé | Motif |
|---|---|
| Lio | `lio` ⊂ `lionelrichie` — erreur bloquante de `verify-catalog` |
| Jean-Luc Lahaye | `aha` ⊂ `jeanluclahaye` — erreur bloquante, collision avec a-ha |
| Rose Laurens | Son unique titre, *Africa*, est aussi le titre phare de Toto. Le vérificateur ne le voit pas, mais deux cases jouant deux chansons différentes intitulées *Africa* dans la même partie est une ambiguïté réelle |

Dans les trois cas on sacrifie l'entrée française — une case à sourcer — plutôt
que l'entrée internationale, déjà validée et plus notoire.

Ils sont remplacés par trois artistes de la réserve : **Daniel Balavoine**,
**France Gall**, **Vanessa Paradis**.

### Réserve restante

Mylène Farmer · Renaud (`variete-francaise`) · Indochine · Téléphone
(`rock-pop-punk`).

Connus du commanditaire, mais inutiles pour tenir 50 cases, et les laisser hors
du thème préserve la distinction entre les thèmes.

**Jean-Jacques Goldman et Michel Sardou sont interdits de ce thème** :
`gold` ⊂ `jeanjacquesgoldman` et `elsa` ⊂ `michelsardou`. Les mobiliser
imposerait de sacrifier Gold ou Elsa.

### Collisions de noms — contrôle obligatoire

`verify-catalog` refuse qu'un nom de case, une fois aplati (minuscules, sans
accents, sans ponctuation), soit contenu dans le nom d'une autre case
(`tools/verify-catalog.mjs:404-411`), et qu'un titre de piste soit contenu dans
le nom d'une autre case (`:392-403`). Ce sont des erreurs bloquantes, invisibles
à l'œil nu sur une liste de cinquante noms — `a-ha` dans `Jean-Luc Lahaye` ne
saute pas aux yeux.

Le jeu de 50 cases retenu passe ce contrôle : **zéro collision de nom, zéro
collision de titre, zéro titre en double sur les 130 pistes pressenties.** Toute
substitution ultérieure doit le refaire tourner.

## Deux règles du projet à assouplir

### `titresMin: 1` — et le plancher du vérificateur passe de 2 à 1

La variété française des années 80 est un cimetière de tubes uniques. Desireless
n'a que *Voyage Voyage*, Cookie Dingler que *Femme libérée*, Axel Bauer que
*Cargo*. Cinq à six entrées du lot ne peuvent honnêtement fournir qu'un titre.

Le README dit aujourd'hui « **jamais moins de deux** ». On le change, et le
raisonnement qui l'accompagne est précisément celui qui justifie le changement :

> une case muette deux parties sur trois coûte plus cher que la variété gagnée

Coller un deuxième titre faible à un one-hit wonder recrée exactement le défaut
que ce design élimine — une case tirée sur un morceau que personne ne reconnaît.
Une case qui rejoue toujours le même morceau est un moindre mal, et c'est un
choix assumé, pas une soupape pour un lot bâclé.

`TITRES_PLANCHER` passe donc de `2` à `1` dans `tools/verify-catalog.mjs`, et le
thème déclare `titresMin: 1`. Le vérificateur continue d'annoncer combien
d'entrées sont descendues sous trois titres, ce qui reste le garde-fou contre une
dérive entrée par entrée.

Le moteur de jeu n'a pas besoin d'être touché : `drawPool` tire déjà le titre par
`shuffle(band.tracks)[0]` (`server/game.mjs:66`), ce qui fonctionne avec un seul
titre.

### `vuesMin` abaissé

Le répertoire français atteint rarement 10 M de vues. Le thème posera son propre
seuil via `vuesMin`, champ prévu pour ce cas. **Valeur à fixer après le premier
audit**, en visant le plus haut seuil que le lot français franchit — l'ordre de
grandeur attendu est 2 M, mais c'est la mesure qui tranche, pas cette estimation.

## Ce qui change dans le dépôt

| Fichier | Changement |
|---|---|
| `catalog/annees-80.json` | 20 entrées retirées, 26 ajoutées, `titresMin: 1`, `vuesMin` |
| `tools/verify-catalog.mjs` | `TITRES_PLANCHER` : `2` → `1` |
| `README.md` | règle des 3 titres (« jamais moins de deux »), doc de `titresMin`, tableau des thèmes |

Aucun changement côté serveur, côté front, ni dans les autres thèmes. Le thème
restant au-dessus de 40 cases, la grille 4×5 reste disponible et le sélecteur de
grilles de `Creation.tsx` n'a pas besoin d'être filtré.

## Vérification

Le travail est fini quand ceci passe au vert :

```bash
node tools/verify-catalog.mjs --views --durations catalog/annees-80.json
```

Soit : 50 entrées, zéro doublon de slug, zéro collision de `youtubeId`, aucun
`startAt` nul, tout embarquable, aucun live ni reprise ni remix, et aucun titre
sous le `vuesMin` du thème.

Les tests existants (`server/test/catalog.test.mjs`,
`src/components/Grille.test.ts`) doivent passer sans modification — ce dernier
vérifie qu'aucun nom de case ne déborde de sa case, ce qui concerne directement
les noms longs ajoutés ici : « Partenaire Particulier », « La Compagnie Créole »,
« Stéphanie de Monaco ». S'ils débordent, c'est le nom affiché qu'on raccourcit,
pas le test qu'on assouplit.

## Ce qu'on a écarté, et pourquoi

| Piste | Pourquoi non |
|---|---|
| Renommer en « internationales » + créer un thème français | Exigerait 80 cases reconnaissables ; on en aligne 50 |
| Remplacer les 17 inconnus par de meilleurs internationaux | Le banc n'existe pas : 2 candidats connus sur 33 |
| Mettre le titre sur la case au lieu de l'artiste | Testé : 16 X sur 17 en section A. Le commanditaire ne connaît ni les noms ni les chansons de ces artistes — le libellé n'était pas le problème |
| Resserrer à 24-30 cases, grilles 3×3 seulement | Perd les grandes grilles et impose de filtrer le sélecteur de `Creation.tsx`, pour un résultat plus pauvre |
| Ne rien toucher | Défendable au vu des vues, mais laisse 20 cases mortes sur 44 pour le public visé |
| `titresMin: 2` avec un second titre plus faible | Recrée la case morte qu'on élimine |
