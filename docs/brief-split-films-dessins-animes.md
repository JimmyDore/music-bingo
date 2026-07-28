# Brief d'implémentation — scinder « Musiques de films » en deux thèmes

*Rédigé le 28 juillet 2026. Destiné à un agent qui exécute sans repasser par le
commanditaire. Ce document est autonome : tout ce qu'il faut savoir est dedans.*

## Mission

Le thème `musiques-de-films` mélange aujourd'hui 32 films en prises de vues
réelles et 10 films d'animation. On le scinde en **deux thèmes distincts**, et on
étoffe chacun pour qu'il tienne debout tout seul :

| Thème | Aujourd'hui | Après |
|---|---|---|
| `musiques-de-films` — Musiques de films | 42 entrées / 114 titres | **41 entrées** (32 gardées + 9 versées) |
| `dessins-animes` — Dessins animés | n'existe pas | **40 entrées** (10 déplacées + 30 versées) |

Concrètement : **39 entrées neuves à composer et une centaine de `youtubeId` à
sourcer**. C'est le gros du chantier ; le reste est de la plomberie JSON.

Lis aussi la section « Le catalogue » du `README.md` (lignes ~136-240) — elle
décrit le format, les règles et les outils. Et regarde
`docs/brief-annees-80-implementation.md` : c'est le même exercice fait une fois
déjà, avec les mêmes outils.

## Pourquoi ce découpage, et pourquoi ces contraintes

**Le plancher de 40 est dur.** `server/test/catalog.test.mjs:113` exige au moins
`poolSize(4×5) = 40` entrées par thème : le pool d'une partie fait le double du
nombre de cases, et la plus grande grille en compte 20. Un thème à 39 entrées
fait **échouer le chargement du catalogue** — pas une alerte, un test rouge.

C'est ce qui interdit de livrer la découpe en plusieurs fois : sortir les 10
animés laisserait `musiques-de-films` à 32 et `dessins-animes` à 10, les deux
sous le plancher. **Tout atterrit dans un seul commit.** L'arbre de travail sera
rouge tant que le lot n'est pas complet ; c'est attendu, ça reste local.

**Les parties en cours ne risquent rien.** `server/db.mjs:119` fige le pool d'une
partie dans `game_tracks` (slug, nom, titre, `youtubeId`, `startAt`) au moment de
la création. Le thème n'est relu à chaud que pour son nom et son lexique
(`server/index.mjs:191`). Une partie `musiques-de-films` déjà lancée dont le pool
contient Le Roi Lion continuera de tourner.

## Ce que tu ne dois PAS faire

- **Ne renomme pas `musiques-de-films`.** `id` et `name` restent identiques : des
  parties en base le référencent.
- **Ne touche à aucun autre thème.** `rock-pop-punk`, `annees-80`, `tubes-2000`
  et `variete-francaise` gardent leurs entrées, y compris celles qui pourraient
  se recouper.
- **Ne touche pas à `server/`, `src/`, ni à la config.** Un thème = un fichier ;
  le dossier `catalog/` est relu au démarrage de l'API. Aucun code n'est à
  écrire, à la seule exception du mot ajouté à l'étape préalable.
- **N'invente jamais un `youtubeId`.** Chaque id vient d'une recherche réelle et
  passe la sonde. Un id inventé qui tombe par hasard sur une vidéo valide est le
  pire résultat possible : indétectable en revue, cassé en soirée.
- **N'ajoute aucun logo.** `"logo": null` partout — la règle du tout ou rien
  s'applique par thème et aucune de ces entrées n'en a.
- **Ne déplace aucune entrée en dehors de la liste des 10.** Le critère de tri
  est « le film est-il d'animation ? », et il n'y a aucun cas limite dans les 42
  entrées actuelles.

## Étape préalable — boucher un trou du vérificateur

`tools/verify-catalog.mjs:51`, constante `INTERDITS` : ajoute `'instrumentale'`
juste après `'instrumental'`.

**Pourquoi.** La recherche des marqueurs se fait par **mot entier**. Le féminin
français passe donc à travers :

```
« Let It Go (Instrumental) »                 → refusé, correct
« Libérée Délivrée - Version Instrumentale » → accepté, alors que c'est un playback
```

Ce n'est pas théorique sur ce chantier : les playbacks de chansons Disney en
français sont étiquetés « Version Instrumentale », jamais « Instrumental ». Sans
ce mot, le lot le plus exposé au piège est aussi le seul que le garde-fou ne
protège pas.

C'est la **seule modification hors `catalog/` et `README.md`** de tout le
chantier. Ne profite pas de l'occasion pour retoucher le reste de la liste.

## Étape 1 — créer `catalog/dessins-animes.json`

Nouveau fichier, avec cet en-tête exact :

```json
{
  "id": "dessins-animes",
  "name": "Dessins animés",
  "lexique": { "case": "dessin animé", "cases": "dessins animés" },
  "titresMin": 2,
  "vuesMin": null,
  "bands": []
}
```

Les trois champs optionnels, et pourquoi ils valent ça :

- **`lexique`** — sans lui l'écran de création annoncerait « 40 groupes » pour un
  thème de films. Le serveur complète `titre` tout seul (`server/catalog.mjs:22`),
  inutile de le déclarer. Pas de `kind` : le bouton « ↺ Rejouer » sert aux
  répliques de trois secondes, ici on joue des chansons, donc `musique` par
  défaut convient.
- **`titresMin: 2`** — pas 1. Le README est explicite : le plancher est « un
  arbitrage assumé entrée par entrée, jamais une facilité ». À 30 entrées
  sourcées d'un coup, `1` transformerait le plancher en soupape et le thème
  glisserait vers des cases qui rejouent éternellement le même extrait. À 2, une
  entrée qui ne trouve pas deux morceaux reconnaissables est simplement remplacée
  par une autre — le vivier Disney le permet largement (voir la réserve).
- **`vuesMin: null`** — comme le thème parent, et pour la même raison aggravée :
  une VF Disney est éparpillée sur cent réuploads et la chaîne officielle n'en
  récolte que des miettes. L'audit `--views` n'aurait rien à dire d'utile.

## Étape 2 — déplacer les 10 entrées animées

Coupe ces 10 `bands` de `catalog/musiques-de-films.json` et colle-les **verbatim**
dans `catalog/dessins-animes.json` — mêmes slugs, mêmes titres, mêmes
`youtubeId`, mêmes `startAt`, mêmes alias. Leurs 28 clips sont déjà validés, il
n'y a rien à re-sonder.

```
shrek · le-roi-lion · la-reine-des-neiges · aladdin · la-belle-et-la-bete
la-petite-sirene · coco · raiponce · tarzan · toy-story
```

Deux d'entre elles n'ont que 2 titres (`coco`, `toy-story`) : c'est conforme au
`titresMin: 2` du nouveau thème. **N'essaie pas de leur trouver un troisième
titre** — ce n'est pas la mission.

`musiques-de-films` doit alors compter exactement **32 entrées**.

## Étape 3 — ajouter le `lexique` au thème existant

À la racine de `catalog/musiques-de-films.json`, à côté de `id` et `name` :

```json
"lexique": { "case": "film", "cases": "films" },
```

`titresMin: 2` et `vuesMin: null` y sont déjà et ne bougent pas.

## Étape 4 — verser 9 films dans `musiques-de-films`

Le thème penche déjà fort côté « chanson de BO » (Top Gun, Dirty Dancing,
Footloose, Grease, Bodyguard). Ce lot prolonge cette veine avec quatre tubes et
la rééquilibre avec cinq entrées orchestrales, cultes ou françaises.

| Slug | Nom affiché | Titres pressentis | Nb attendu | Alias nécessaires |
|---|---|---|---|---|
| `pretty-woman` | Pretty Woman | Oh, Pretty Woman · It Must Have Been Love · King of Wishful Thinking | 3 | Roy Orbison, Roxette, Go West |
| `sister-act` | Sister Act | I Will Follow Him · Oh Happy Day · Hail Holy Queen | 3 | Whoopi Goldberg, Deloris |
| `la-fievre-du-samedi-soir` | La Fièvre du samedi soir | Stayin' Alive · Night Fever · How Deep Is Your Love | 3 | Saturday Night Fever, Bee Gees |
| `le-parrain` | Le Parrain | Speak Softly Love · The Godfather Waltz · Parla Più Piano | 2-3 | The Godfather, Nino Rota, Andy Williams |
| `le-grand-bleu` | Le Grand Bleu | The Big Blue Overture · My Lady Blue · Deep Blue Dream | 2-3 | Éric Serra, The Big Blue |
| `la-boum` | La Boum | Reality · Your Eyes | 2 | Vladimir Cosma, Richard Sanderson, Cook Da Books, La Boum 2 |
| `ghostbusters` | Ghostbusters | Ghostbusters · On Our Own · Main Theme | 2-3 | SOS Fantômes, Ray Parker Jr., Bobby Brown, Elmer Bernstein |
| `matrix` | Matrix | Clubbed to Death · Wake Up · Rock Is Dead | 3 | The Matrix, Rob Dougan, Rage Against the Machine, Marilyn Manson |
| `le-cinquieme-element` | Le Cinquième Élément | Diva Dance · Little Light of Love · Mondoshawan | 2-3 | The Fifth Element, Éric Serra, Inva Mula, RXRA |

**Point de fragilité connu — `ghostbusters`.** Un seul titre que tout le monde
connaît. « On Our Own » (Bobby Brown, *SOS Fantômes 2*) a été un vrai tube et
fait un second acceptable ; le thème orchestral d'Elmer Bernstein sert de
troisième filet. Si aucun des deux n'est sourçable en version studio embarquable,
prends la réserve plutôt que de descendre l'entrée à un titre — `titresMin` vaut
2 sur ce thème et le vérificateur le refusera.

**Réserve films**, dans cet ordre : `moulin-rouge`, `il-etait-une-fois-dans-l-ouest`,
`trainspotting`, `flashdance`, `the-blues-brothers`.

## Étape 5 — verser 30 dessins animés

**Règle de langue : VF systématique dès qu'elle existe.** « Libérée, Délivrée »,
pas « Let It Go ». C'est la règle des 10 entrées déjà en place et elle ne se
rediscute pas. Quand le film n'a pas de VF chantée (Pixar instrumental, DreamWorks
sur un tube anglo-saxon), la VO est évidemment la bonne réponse.

**L'instrumental est admis sans quota** : on prend ce qui est le plus
reconnaissable film par film. *Le Festin* de Ratatouille et *Married Life* de
Là-haut valent mieux qu'une chanson secondaire chantée.

### Grands Classiques Disney (10)

| Slug | Nom affiché | Titres pressentis (VF) | Nb attendu |
|---|---|---|---|
| `le-livre-de-la-jungle` | Le Livre de la Jungle | Il en faut peu pour être heureux · Être un homme comme vous · Le Régiment des éléphants | 3 |
| `blanche-neige` | Blanche-Neige | Heigh-Ho · Un jour mon prince viendra · Sifflez en travaillant | 3 |
| `cendrillon` | Cendrillon | Tendre rêve · Bibbidi-Bobbidi-Boo | 2 |
| `les-aristochats` | Les Aristochats | Tout le monde veut devenir un cat · Gammes et arpèges | 2 |
| `dumbo` | Dumbo | Mon tout petit · Le Défilé des éléphants roses | 2 |
| `peter-pan` | Peter Pan | Tu t'envoles · La Chanson des pirates | 2 |
| `robin-des-bois` | Robin des Bois | Robin des Bois et Petit Jean · Le Roi félon | 2 |
| `alice-au-pays-des-merveilles` | Alice au pays des merveilles | Un joyeux non-anniversaire · Peindre les roses en rouge | 2 |
| `le-bossu-de-notre-dame` | Le Bossu de Notre-Dame | Les Cloches de Notre-Dame · Le Feu de l'enfer · Rêve d'amour | 3 |
| `hercule` | Hercule | De zéro en héros · Jamais je n'avouerai · Le Monde qui est le mien | 3 |

### Disney renaissance et modernes (7)

| Slug | Nom affiché | Titres pressentis (VF) | Nb attendu |
|---|---|---|---|
| `mulan` | Mulan | Comme un homme · Réflexion · Une belle fille à aimer | 3 |
| `pocahontas` | Pocahontas | L'air du vent · Sauvages · Écoute ton cœur | 3 |
| `la-princesse-et-la-grenouille` | La Princesse et la Grenouille | Presque arrivée · Les Amis d'en bas · Au bout du rêve | 3 |
| `vaiana` | Vaiana | Le Bleu lumière · Pour les hommes · Le Chant du fond des âges | 3 |
| `encanto` | Encanto | Ne parlons pas de Bruno · Sous une pression totale · La Famille Madrigal | 3 |
| `lilo-et-stitch` | Lilo & Stitch | Hawaiian Roller Coaster Ride · Burning Love *(alias : Elvis Presley)* | 2 |
| `frere-des-ours` | Frère des ours | Ne fais pas de moi ton ennemi · Sur ton chemin *(alias : Phil Collins)* | 2 |

### Pixar (6)

| Slug | Nom affiché | Titres pressentis | Nb attendu |
|---|---|---|---|
| `ratatouille` | Ratatouille | Le Festin · Ratatouille Main Theme *(alias : Camille, Michael Giacchino)* | 2 |
| `la-haut` | Là-haut | Married Life · Kevin Beak'n *(alias : Up, Michael Giacchino)* | 2 |
| `le-monde-de-nemo` | Le Monde de Nemo | Beyond the Sea · Nemo Egg *(alias : Finding Nemo, Thomas Newman, Robbie Williams)* | 2 |
| `monstres-et-cie` | Monstres & Cie | Si tu n'étais pas là · Monsters, Inc. *(alias : Monsters Inc, Randy Newman)* | 2 |
| `cars` | Cars | Life is a Highway · Route 66 *(alias : Rascal Flatts, Chuck Berry, John Mayer)* | 2 |
| `wall-e` | WALL·E | Put On Your Sunday Clothes · Define Dancing · Down to Earth *(alias : Wall-E, Peter Gabriel, Thomas Newman)* | 3 |

### DreamWorks / Illumination (4)

| Slug | Nom affiché | Titres pressentis | Nb attendu |
|---|---|---|---|
| `madagascar` | Madagascar | I Like to Move It · Zoosters Breakout *(alias : Sacha Baron Cohen, Reel 2 Real, Hans Zimmer)* | 2 |
| `kung-fu-panda` | Kung Fu Panda | Kung Fu Fighting · Oogway Ascends *(alias : Cee Lo Green, Jack Black, Hans Zimmer, John Powell)* | 2 |
| `dragons` | Dragons | Test Drive · Forbidden Friendship · Romantic Flight *(alias : How to Train Your Dragon, John Powell)* | 3 |
| `moi-moche-et-mechant` | Moi, moche et méchant | Happy · Despicable Me *(alias : Despicable Me, Pharrell Williams, Les Minions)* | 2 |

### Hors studios américains (3)

| Slug | Nom affiché | Titres pressentis | Nb attendu |
|---|---|---|---|
| `anastasia` | Anastasia | Loin du froid de décembre · Une rumeur à Saint-Pétersbourg · À la cour du tsar Nicolas | 2-3 |
| `l-etrange-noel-de-monsieur-jack` | L'Étrange Noël de Monsieur Jack | C'est Halloween · Le Lamento de Jack *(alias : The Nightmare Before Christmas, Danny Elfman)* | 2 |
| `kirikou` | Kirikou et la Sorcière | Kirikou · Kirikou et Karaba *(alias : Youssou N'Dour)* | 2 |

**Les titres de la colonne sont des pistes de départ, pas des ordres.** Si un
titre n'a pas d'upload officiel embarquable, remplace-le par un autre du même
film, aussi reconnaissable que possible, et note la substitution dans ton rapport
final. La colonne « nb attendu » est une estimation issue du répertoire réel, pas
un quota : un film qui fournit trois bons titres en aura trois, dans la limite de
trois.

**Réserve dessins animés**, dans cet ordre — si un film ne trouve pas ses deux
titres, prends le suivant plutôt que de descendre l'entrée à un seul :
`le-prince-d-egypte`, `mon-voisin-totoro`, `le-voyage-de-chihiro`,
`les-mondes-de-ralph`, `pinocchio`, `les-indestructibles`, `trolls`,
`le-pole-express`.

⚠️ **`les-triplettes-de-belleville` est exclu de la réserve** : `belle` (le titre
de *La Belle et la Bête*, déjà dans le thème) est contenu dans `belleville`, et
le vérificateur refuse la collision. Ne le rattrape pas.

Le format d'une entrée, à copier sur l'existant :

```json
{
  "slug": "hercule",
  "name": "Hercule",
  "alias": ["Disney"],
  "logo": null,
  "tracks": [
    { "title": "De zéro en héros", "youtubeId": "...", "startAt": 42 }
  ]
}
```

## Étape 6 — sourcer les clips

**98 clips** à trouver si tu suis les titres pressentis à la lettre : 26 côté
films, 72 côté dessins animés. Pour chacun :

**1. Chercher, avec `yt-dlp` et `ytsearch`.** C'est l'outil du chantier
précédent, il est installé (`yt-dlp 2025.12.08`) :

```bash
yt-dlp --skip-download --no-warnings \
  --print "%(id)s | %(title)s | %(channel)s | %(duration)s s | %(view_count)s vues" \
  "ytsearch5:<film> <titre> version française officielle"
```

Quelques recettes qui marchent mieux que la requête générique :

```bash
# VF Disney : la chaîne officielle porte souvent « Disney FR » ou « DisneyMusicVEVO »
yt-dlp --skip-download --no-warnings \
  --print "%(id)s | %(title)s | %(channel)s | %(duration)s s | %(view_count)s vues" \
  "ytsearch8:Hercule De zéro en héros Disney France"

# Bande originale instrumentale : viser la chaîne « — Topic » du compositeur
yt-dlp --skip-download --no-warnings \
  --print "%(id)s | %(title)s | %(channel)s | %(duration)s s | %(view_count)s vues" \
  "ytsearch8:Michael Giacchino Married Life topic"
```

Privilégie, dans cet ordre : la chaîne officielle du studio (Disney France,
DisneyMusicVEVO, Pixar, DreamWorksTV), celle du label (Walt Disney Records,
Universal Music France, Sony Music France), puis la chaîne « — Topic » de
l'artiste ou du compositeur. Un upload de particulier n'est pas acceptable.

**2. Rejeter** tout ce qui sent le live, la reprise, le remix, le karaoké, la
version accélérée. La liste complète des marqueurs interdits est la constante
`INTERDITS` de `tools/verify-catalog.mjs:51` — le vérificateur les refusera de
toute façon, autant ne pas perdre de temps. Les marqueurs « remaster », « lyric
video », « audio » sont des **alertes non bloquantes** : acceptables si c'est le
seul upload officiel.

**Sur `instrumental`, qui figure dans les marqueurs interdits** : il ne bloque pas
les musiques orchestrales, et il ne faut pas s'en méfier à tort. `marqueur()`
(`tools/verify-catalog.mjs:210`) lit le **titre de la vidéo YouTube**, en retire
le titre du morceau que tu as déclaré et le nom de la case, puis cherche les mots
interdits dans ce qui reste. Un morceau de bande originale ne s'annonce jamais
« instrumental » : il s'appelle *Married Life*, *Test Drive*, *Oogway Ascends*,
*Nemo Egg*. Tous passent — c'est vérifié.

Ce que le mot vise, c'est le **playback** : « Let It Go (Instrumental) », la
version d'une chanson chantée dont on a retiré la voix. Même logique que pour les
reprises et les remix : ce n'est pas l'enregistrement que la salle connaît. Prends
donc les scores sans hésiter, et fuis les playbacks.

**3. Contrôler la durée** : entre **90 et 480 secondes**
(`tools/verify-catalog.mjs:24-25`). Plus court, c'est un extrait ; plus long,
c'est un pot-pourri ou une compilation. Les chansons Disney frôlent parfois les
90 s par le bas — vérifie plutôt deux fois qu'une.

**4. Sonder l'embarquabilité** :

```bash
node tools/probe.mjs <id1> <id2> ...
```

Le code HTTP doit être **200**. Tout le reste se rejette — une vidéo non
embarquable est un écran noir en pleine soirée. C'est le contrôle le plus
important de tous, et les chaînes Disney bloquent l'intégration plus souvent que
la moyenne : attends-toi à en jeter beaucoup.

**5. Vérifier la correspondance nom/vidéo.** Le vérificateur exige que le nom de
la case apparaisse dans le titre de la vidéo ou dans le nom de la chaîne. Une
case « Le Livre de la Jungle » pointant sur une vidéo intitulée « Il en faut peu
pour être heureux » échoue sans alias. **La quasi-totalité des entrées de ce lot
aura besoin d'alias** — c'est la norme sur un thème de films, pas l'exception :

```json
"alias": ["Le Livre de la Jungle", "The Jungle Book", "Disney"]
```

## Étape 7 — `startAt`, et la limite qu'il faut assumer

`startAt` est la seconde à laquelle le morceau démarre en soirée. Il doit tomber
sur le moment où le morceau devient reconnaissable — premier vers chanté, thème
principal, refrain — **jamais sur l'intro, jamais 0** (le vérificateur refuse 0).

**Tu ne peux pas déterminer ça de façon fiable sans écouter.** Le chantier
précédent l'a mesuré : le heatmap YouTube (`yt-dlp -J`, champ `heatmap`) trouve
le refrain, alors que le catalogue démarre souvent plus tôt, sur le riff d'intro.
Une concordance sur quatre valeurs déjà validées — ce n'est pas un substitut.

Ce que tu fais donc :

1. Propose une valeur en croisant le heatmap et la convention du catalogue
   (691 valeurs existantes : médiane **44 s**, quartiles **25 s** et **55 s**).
   Les 28 titres animés déjà validés sont nettement plus bas — médiane **18 s**,
   l'essentiel entre 8 et 30 s : une chanson Disney attaque vite, l'intro est
   courte. Vise cette convention-là sur le nouveau thème, pas la médiane
   générale.
2. **Marque chaque `startAt` neuf comme à valider à l'oreille** dans ton rapport
   final, sous forme de liste `film — titre — startAt proposé — pic heatmap`.
   C'est la seule partie du travail qu'un humain doit reprendre.

## Étape 8 — le README

Trois passages de `README.md` deviennent faux. Note que **le tableau est déjà
faux avant ton passage** : il annonce 43 cases / 129 titres pour un fichier qui en
compte 42 / 114, les deux derniers commits ne l'ont pas mis à jour. Recale-le sur
la réalité mesurée, ne recopie pas les valeurs affichées.

1. **Ligne 147, le tableau des thèmes.** Remplace la ligne `musiques-de-films`
   par ses valeurs réelles finales et ajoute une ligne `dessins-animes`. Compte
   les entrées et les titres avec un script, ne les estime pas.
2. **Ligne 210, le décompte des alias.** « 30 des 42 entrées du thème “musiques
   de films” en ont besoin » — recompte pour les deux thèmes.
3. **Section « Les champs optionnels », l'exemple de `lexique`.** Il cite déjà
   `{ "case": "film", "cases": "films" }` comme exemple théorique ; maintenant
   que deux thèmes le déclarent pour de vrai, une phrase peut le dire.

## Vérification — critères d'acceptation

Le travail est fini quand **tout** ceci passe :

```bash
node tools/verify-catalog.mjs --durations catalog/musiques-de-films.json
node tools/verify-catalog.mjs --durations catalog/dessins-animes.json
npm test                       # front (vitest)
npm run test:server            # back (node --test)
npm run build                  # tsc --noEmit && vite build
```

Le vérificateur doit afficher, pour chaque fichier :

```
Catalogue conforme : zéro doublon, zéro collision, zéro startAt nul, tout est embarquable.
```

Et concrètement :

- [ ] `musiques-de-films` : **41 entrées** (≈ 112 titres), dont les 32 d'origine
      intactes
- [ ] `dessins-animes` : **40 entrées** (≈ 100 titres), dont les 10 déplacées
      intactes
- [ ] chaque entrée des deux thèmes a **2 ou 3** titres, jamais 1, jamais 4
- [ ] zéro slug en double, zéro `youtubeId` en double *dans un même thème*
- [ ] aucun `startAt` nul ou négatif
- [ ] 100 % des vidéos en oEmbed 200
- [ ] toutes les durées entre 90 et 480 s
- [ ] aucun live, reprise, remix, karaoké
- [ ] zéro collision de nom et de titre (voir « Pièges connus »)
- [ ] les deux thèmes déclarent leur `lexique` et l'écran de création annonce
      « 41 films » et « 40 dessins animés »
- [ ] `INTERDITS` contient `'instrumentale'` et rien d'autre n'a bougé dans
      `tools/verify-catalog.mjs`

`--views` est inutile ici : les deux thèmes portent `vuesMin: null` et sortent de
l'audit.

## Pièges connus

**Les collisions sont invisibles à l'œil nu.** `verify-catalog` refuse deux
choses, à l'intérieur d'un même thème (`tools/verify-catalog.mjs:393-416`) :

- qu'un titre de morceau aplati (minuscules, sans accents, sans ponctuation, ≥ 4
  caractères) soit contenu dans le **nom d'une autre case** ;
- qu'un nom de case soit contenu dans le **nom d'une autre case**.

Les 41 + 40 noms de ce brief, et les 212 titres pressentis, ont été passés à ces
deux contrôles pendant la conception : **zéro collision des deux côtés**. Les cas
qui sont passés de justesse, à ne pas casser par une substitution étourdie :

| Presque | Pourquoi ça passe |
|---|---|
| `cars` vs `Madagascar` | `madagascar` finit par `car`, pas `cars` |
| `coco` vs `Pocahontas` | aucune occurrence de `coco` |
| `belle` (titre de *La Belle et la Bête*) | aucune autre case ne contient `belle` — d'où l'exclusion des *Triplettes de Belleville* |
| `Le Roi félon` vs `Le Roi Lion` | le titre est plus long que le nom, la containment ne peut pas jouer |

**Si tu substitues quoi que ce soit, refais ce contrôle** avant de sourcer trois
clips pour rien.

**La longueur des noms n'est pas testée sur ces thèmes.**
`src/components/Grille.test.ts` n'importe que `rock-pop-punk.json`. La règle
réelle, dérivée de `tailleTexte` (`src/components/Grille.tsx:23`) : **le mot le
plus long d'un nom doit faire au plus 15 caractères**, sinon la police tombe sur
la taille plancher et le nom est rogné en 4×5. Tous les noms de ce brief
respectent la règle (le pire est `Blanche-Neige`, 13). Si tu en inventes un,
vérifie-le à la main — aucun test ne te préviendra.

**Les VF Disney sont mal servies par YouTube.** Beaucoup de chansons françaises
n'existent que sur des chaînes de fans, souvent non embarquables, souvent avec
un titre qui ne dit ni le film ni la langue. Cherche en priorité « Disney France »
et « Walt Disney Records », et accepte un upload de label. Si une chanson n'a
aucune VF embarquable mais que le film reste indispensable, **prends une autre
chanson du même film** avant d'envisager la VO.

**Ne panique pas devant les compteurs de vues.** Une VF Disney à 2 M de vues est
normale ; c'est pour ça que `vuesMin` vaut `null`. Le critère de sélection ici est
la notoriété du film et de la chanson, pas le compteur.

## Si ça coince

Si un film s'avère insourçable — aucun upload officiel embarquable pour deux
titres — **ne le remplace pas hors des réserves données aux étapes 4 et 5**.
Elles ont été constituées pendant la conception et contrôlées contre les
collisions. Prends le suivant dans l'ordre, signale la substitution, refais le
contrôle de collisions, et continue.

Si les deux réserves s'épuisent — ce qui signifierait une dizaine d'échecs —
arrête-toi et rends compte plutôt que d'improviser : c'est que l'hypothèse de
départ sur la disponibilité des VF est fausse, et ça se retranche, ça ne se
bricole pas.

## Le commit

Un seul commit, message en français, convention Angular, comme le reste du dépôt :

```
feat(catalogue): scinder les musiques de films et les dessins animés
```

## Rapport final

Livre-le avec, dans l'ordre :

1. les décomptes finaux (entrées et titres par thème) ;
2. les substitutions de titres, film par film ;
3. les substitutions de films, avec la raison de l'échec du premier choix ;
4. la liste des `startAt` à valider à l'oreille, au format
   `film — titre — startAt proposé — pic heatmap` ;
5. tout ce que tu as dû trancher et qui n'était pas prévu par ce brief.
