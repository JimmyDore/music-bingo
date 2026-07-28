# Brief d'implémentation — recomposition du thème « Années 80 »

*Rédigé le 28 juillet 2026. Destiné à un agent qui exécute sans repasser par le
commanditaire.*

## Mission

Transformer `catalog/annees-80.json` d'un thème 100 % anglo-saxon de 44 cases en
un thème **franco-international de 50 cases** : retirer 20 entrées, en ajouter
26, et assouplir deux règles du projet pour que ça tienne.

Le raisonnement complet est dans
`docs/superpowers/specs/2026-07-28-theme-annees-80-franco-international-design.md`.
**Lis-le d'abord** : il explique pourquoi on retire des artistes objectivement
célèbres, et cette décision n'est pas rediscutable ici.

Lis aussi la section « Le catalogue » du `README.md` — elle décrit le format, les
règles et les outils.

## Ce que tu ne dois PAS faire

- **Ne renomme pas le thème.** `id: "annees-80"` et `name: "Années 80"` restent
  identiques. Il n'y a pas de thème « internationales » ni « françaises » : cette
  idée a été explicitement écartée.
- **Ne crée aucun fichier dans `catalog/`.**
- **Ne touche à aucun autre thème** — `variete-francaise` et `rock-pop-punk`
  gardent leurs entrées, y compris celles qui réapparaissent ici.
- **Ne touche pas à `server/`, `src/`, ni à la config.** Le moteur de jeu n'a
  besoin d'aucun changement (`drawPool` tire déjà par `shuffle(band.tracks)[0]`,
  `server/game.mjs:66`, ce qui marche avec un seul titre).
- **Ne commite pas `catalog/musiques-de-films.json` ni `revue-catalogue.csv`** :
  ils ont des modifications non commitées qui appartiennent à un autre chantier.
- **N'invente jamais un `youtubeId`.** Chaque id doit venir d'une recherche
  réelle et passer la sonde. Un id inventé qui tombe par hasard sur une vidéo
  valide est le pire résultat possible : indétectable en revue, cassé en soirée.
- **Ne remplace aucun artiste de ta propre initiative.** Si l'un s'avère
  insourçable, arrête-toi et signale-le (voir « Si ça coince »).

## Étape 1 — abaisser le plancher de titres

`tools/verify-catalog.mjs`, ligne 33 :

```js
const TITRES_PLANCHER = 2;   // avant
const TITRES_PLANCHER = 1;   // après
```

**Pourquoi.** La variété française des années 80 est un cimetière de tubes
uniques : Desireless n'a que *Voyage Voyage*, Cookie Dingler que *Femme
libérée*. Leur coller un second titre plus faible recrée exactement le défaut
qu'on élimine — une case tirée sur un morceau que personne ne reconnaît. Une case
qui rejoue toujours le même morceau est un moindre mal.

Le garde-fou reste en place : `verify-catalog` continue d'annoncer combien
d'entrées sont sous trois titres (`:380-386`), ce qui empêche le thème de
glisser vers le plancher entrée par entrée.

## Étape 2 — retirer 20 entrées

Supprime ces `bands` de `catalog/annees-80.json`, avec leurs 60 titres :

```
journey · depeche-mode · the-cure · duran-duran · george-michael · dire-straits
simple-minds · tears-for-fears · inxs · van-halen · zz-top · billy-idol
pet-shop-boys · the-bangles · culture-club · alphaville · men-at-work
bryan-adams · roxette · modern-talking
```

Il doit rester exactement **24 entrées** : `michael-jackson`, `madonna`,
`prince`, `a-ha`, `toto`, `bon-jovi`, `whitney-houston`, `tina-turner`,
`cyndi-lauper`, `eurythmics`, `wham`, `phil-collins`, `bruce-springsteen`,
`europe`, `survivor`, `rick-astley`, `blondie`, `the-police`, `u2`,
`bonnie-tyler`, `lionel-richie`, `kool-and-the-gang`, `earth-wind-and-fire`,
`david-bowie`. **N'y touche pas** : leurs 72 clips sont déjà validés.

## Étape 3 — ajouter 26 entrées

Slugs imposés (ne les invente pas — ils ont été vérifiés contre les collisions) :

| Slug | Nom affiché | Titres pressentis | Nb attendu |
|---|---|---|---|
| `opus` | Opus | Live Is Life | 1 |
| `sabrina` | Sabrina | Boys (Summertime Love) | 1-2 |
| `desireless` | Desireless | Voyage Voyage | 1 |
| `cookie-dingler` | Cookie Dingler | Femme libérée | 1 |
| `partenaire-particulier` | Partenaire Particulier | Partenaire particulier | 1 |
| `axel-bauer` | Axel Bauer | Cargo | 1 |
| `images` | Images | Les Démons de minuit · Now | 1-2 |
| `vanessa-paradis` | Vanessa Paradis | Joe le taxi · Marilyn & John | 1-2 |
| `debut-de-soiree` | Début de Soirée | Nuit de folie · Jardins d'enfants | 2 |
| `gilbert-montagne` | Gilbert Montagné | On va s'aimer · Les Sunlights des tropiques | 2 |
| `stephanie-de-monaco` | Stéphanie de Monaco | Ouragan · Flash | 2 |
| `herbert-leonard` | Herbert Léonard | Pour le plaisir · Amoureux fous | 2 |
| `patrick-bruel` | Patrick Bruel | Casser la voix · Alors regarde | 2 |
| `laurent-voulzy` | Laurent Voulzy | Belle-Île-en-Mer · Le Cœur grenadine · Bopper en larmes | 2-3 |
| `les-rita-mitsouko` | Les Rita Mitsouko | Marcia Baila · C'est comme ça · Andy | 3 |
| `elsa` | Elsa | T'en va pas · Jour de neige · Quelque chose dans mon cœur | 3 |
| `jeanne-mas` | Jeanne Mas | Toute première fois · En rouge et noir · Johnny Johnny | 3 |
| `marc-lavoine` | Marc Lavoine | Elle a les yeux revolver · Le Parking des anges · Qu'est-ce que t'es belle | 3 |
| `gold` | Gold | Un peu plus près des étoiles · Ville de lumière · Capitaine abandonné | 3 |
| `la-compagnie-creole` | La Compagnie Créole | Le bal masqué · C'est bon pour le moral · Ça fait rire les oiseaux | 3 |
| `pierre-bachelet` | Pierre Bachelet | Les Corons · Elle est d'ailleurs · Marionnettiste | 3 |
| `julien-clerc` | Julien Clerc | Femmes je vous aime · Mélissa · Hélène | 3 |
| `michel-berger` | Michel Berger | La groupie du pianiste · Quelques mots d'amour · Chanter pour ceux qui sont loin de chez eux | 3 |
| `serge-gainsbourg` | Serge Gainsbourg | Lemon Incest · Aux armes et cætera · Dieu fumeur de havanes | 3 |
| `daniel-balavoine` | Daniel Balavoine | L'Aziza · Mon fils ma bataille · Tous les cris les SOS | 3 |
| `france-gall` | France Gall | Ella elle l'a · Résiste · Babacar | 3 |

**Les titres de la colonne sont des pistes de départ, pas des ordres.** Si un
titre n'a pas de clip officiel embarquable, remplace-le par un autre titre du
même artiste, des années 80, aussi reconnaissable que possible — et note la
substitution dans ton rapport final. La colonne « nb attendu » est une estimation
issue de la notoriété réelle du répertoire, pas un quota : un artiste qui fournit
trois bons titres en aura trois.

Le format d'une entrée, à copier sur l'existant :

```json
{
  "slug": "desireless",
  "name": "Desireless",
  "logo": null,
  "tracks": [
    { "title": "Voyage Voyage", "youtubeId": "...", "startAt": 42 }
  ]
}
```

`logo` reste `null` partout : la règle du tout ou rien s'applique au thème et
aucune entrée n'a de logo.

## Étape 4 — sourcer les clips

Environ **58 clips** à trouver. Pour chacun :

**1. Chercher.**

```bash
yt-dlp --skip-download --no-warnings \
  --print "%(id)s | %(title)s | %(channel)s | %(duration)s s | %(view_count)s vues" \
  "ytsearch5:<artiste> <titre> official"
```

Privilégie, dans cet ordre : la chaîne officielle de l'artiste, celle du label,
la chaîne « — Topic ». Pour le répertoire français des années 80, l'upload
officiel est souvent sur une chaîne de label (Believe, Warner Music France,
Universal Music France, Sony Music France) — c'est acceptable.

**2. Rejeter** tout ce qui sent le live, la reprise, le remix, le karaoké,
l'instrumental, la version accélérée. La liste complète des marqueurs interdits
est dans `tools/verify-catalog.mjs` (constante `INTERDITS`) — le vérificateur les
refusera de toute façon, autant ne pas perdre de temps. Les marqueurs
« remaster », « lyric video », « audio » sont des **alertes non bloquantes** :
acceptables si c'est le seul upload officiel.

**3. Contrôler la durée** : entre **90 et 480 secondes**. Un fichier plus court
est un extrait, un plus long est un pot-pourri ou une compilation.

**4. Sonder l'embarquabilité** :

```bash
node tools/probe.mjs <id1> <id2> ...
```

Le code HTTP doit être **200**. Tout le reste se rejette — une vidéo non
embarquable est un écran noir en pleine soirée. C'est le contrôle le plus
important de tous.

**5. Vérifier la correspondance nom/vidéo.** Le vérificateur exige que le nom de
la case apparaisse dans le titre de la vidéo ou le nom de la chaîne. Si ce n'est
pas le cas et que le clip est le bon, ajoute un champ `alias` à l'entrée :

```json
"alias": ["La Compagnie Créole", "Compagnie Creole"]
```

## Étape 5 — `startAt`, et la limite qu'il faut assumer

`startAt` est la seconde à laquelle le morceau démarre en soirée. Il doit tomber
sur le moment où la chanson devient reconnaissable — riff signature, premier
couplet chanté, refrain — **jamais sur l'intro, jamais 0**.

**Tu ne peux pas déterminer ça de façon fiable sans écouter.** C'est mesuré, pas
supposé : le heatmap YouTube (`yt-dlp -J`, champ `heatmap`, segments les plus
rejoués) a été comparé à quatre `startAt` déjà validés du thème.

| Titre | `startAt` du catalogue | Pic du heatmap | |
|---|---|---|---|
| a-ha — Take On Me | 51 | 51-59 s | concorde |
| Toto — Africa | 88 | 68-73 s | proche |
| Michael Jackson — Billie Jean | 29 | 83-89 s | très loin |
| Survivor — Eye Of The Tiger | 25 | 81-86 s | très loin |

Le heatmap trouve le **refrain**. Le catalogue démarre souvent plus tôt, sur le
riff d'intro. Une concordance sur quatre : ce n'est pas un substitut.

**Ce que tu fais donc :**

1. Propose une valeur, en croisant le heatmap et la convention du catalogue
   (700 valeurs existantes : médiane **42 s**, quartiles **25 s** et **55 s**).
2. **Marque chaque `startAt` neuf comme à valider à l'oreille** dans ton rapport
   final, sous forme de liste `artiste — titre — startAt proposé — pic heatmap`.
   C'est la seule partie du travail qu'un humain doit reprendre.
3. Ne mets jamais `0` — le vérificateur le refuse, et c'est justifié.

## Étape 6 — les deux champs du thème

À la racine de `catalog/annees-80.json`, à côté de `id` et `name` :

```json
"titresMin": 1,
"vuesMin": <à mesurer>
```

`vuesMin` **n'est pas décidé à l'avance, il se mesure.** Une fois les 50 entrées
en place :

```bash
node tools/verify-catalog.mjs --views catalog/annees-80.json
```

Lis le palmarès des titres les moins vus et pose `vuesMin` **au plus haut seuil
que le lot entier franchit**, arrondi à la centaine de milliers inférieure.
L'ordre de grandeur attendu est 2 M, mais c'est la mesure qui tranche. Ne baisse
jamais le seuil pour faire passer un titre isolé : si un seul titre est très en
dessous des autres, c'est ce titre qu'il faut remplacer.

## Étape 7 — le README

Trois passages de `README.md` deviennent faux :

1. **Ligne ~169-175, la règle des 3 titres.** Elle se termine par « Jamais moins
   de deux. » — c'est ce que ce chantier change. Réécris le passage pour
   autoriser un seul titre sur les one-hit wonders, en gardant le raisonnement
   d'origine, qui est précisément celui qui justifie l'assouplissement : *une
   case muette deux parties sur trois coûte plus cher que la variété gagnée*.
2. **Ligne ~206, la doc de `titresMin`.** Elle annonce « `2` ou `3` (défaut
   `3`) » → devient `1`, `2` ou `3`.
3. **Le tableau des thèmes, ligne 144.** `annees-80` passe de « 44 | 132 » à ses
   valeurs réelles finales.

## Vérification — critères d'acceptation

Le travail est fini quand **tout** ceci passe :

```bash
node tools/verify-catalog.mjs --views --durations catalog/annees-80.json
npm test                       # front
npm test --prefix server       # API
```

Le vérificateur doit afficher :

```
Catalogue conforme : zéro doublon, zéro collision, zéro startAt nul, tout est embarquable.
```

Et concrètement :

- [ ] **50 entrées**, pas 49, pas 51
- [ ] chaque entrée a **au moins un** titre, et **au plus trois**
- [ ] zéro slug en double, zéro `youtubeId` en double
- [ ] aucun `startAt` nul ou négatif
- [ ] 100 % des vidéos en oEmbed 200
- [ ] toutes les durées entre 90 et 480 s
- [ ] aucun live, reprise, remix, karaoké
- [ ] aucun titre sous le `vuesMin` posé à l'étape 6
- [ ] zéro collision de nom et de titre
- [ ] `src/components/Grille.test.ts` passe — il vérifie qu'aucun nom de case ne
      déborde de sa case. Plusieurs noms ajoutés sont longs : « Partenaire
      Particulier », « La Compagnie Créole », « Stéphanie de Monaco ». **S'ils
      débordent, c'est le nom affiché qu'on raccourcit** (le `name`, pas le
      `slug`) — jamais le test qu'on assouplit.

## Pièges connus

**Les collisions de noms sont invisibles à l'œil nu.** `verify-catalog` refuse
qu'un nom de case aplati (minuscules, sans accents, sans ponctuation) soit
contenu dans le nom d'une autre case. Trois candidats français ont déjà été
recalés pour ça pendant la conception :

| Recalé | Collision |
|---|---|
| Lio | `lio` ⊂ `lionelrichie` |
| Jean-Luc Lahaye | `aha` ⊂ `jeanluclahaye` |
| Rose Laurens | *Africa* est aussi le titre phare de Toto — le vérificateur ne le voit pas, mais deux cases jouant deux chansons différentes intitulées *Africa* est une ambiguïté réelle en jeu |

Le jeu de 50 cases de ce brief a été contrôlé et **passe** : zéro collision de
nom, zéro collision de titre, zéro titre en double sur les 130 pistes
pressenties. **Si tu substitues quoi que ce soit, refais tourner ce contrôle** —
il vaut mieux le découvrir avant de sourcer trois clips pour rien.

**Deux artistes sont interdits de ce thème**, si l'idée te venait de les
mobiliser : Jean-Jacques Goldman (`gold` ⊂ `jeanjacquesgoldman`) et Michel Sardou
(`elsa` ⊂ `michelsardou`).

**Le répertoire français plafonne bas en vues.** C'est attendu, c'est la raison
d'être de `vuesMin`. Ne panique pas devant un titre à 3 M de vues ; panique
devant un titre à 200 k.

**Le clip officiel français des années 80 est parfois introuvable.** Beaucoup
n'ont jamais été mis en ligne par un ayant droit. Un upload de chaîne de label
récent est acceptable ; un upload de particulier ne l'est pas.

## Si ça coince

Si un artiste s'avère insourçable — aucun clip officiel embarquable, ou tous les
titres sous le seuil de vues — **ne le remplace pas de ta propre initiative**.
Une réserve a été constituée pour ça pendant la conception : **Mylène Farmer,
Renaud, Indochine, Téléphone** — tous connus du commanditaire, tous écartés
seulement parce qu'ils servent déjà dans un autre thème. Propose-en un, signale
la substitution, refais le contrôle de collisions, et continue.

Livre ton rapport final avec, dans l'ordre : les substitutions de titres, les
substitutions d'artistes, la valeur de `vuesMin` retenue et sur quelle mesure, et
la liste des `startAt` à valider à l'oreille.
