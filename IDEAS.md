# Idées

Ce fichier n'est pas une roadmap : c'est un carnet. Chaque idée est décrite avec
ce qu'elle apporte, ce qu'elle coûte, et la décision qui reste à trancher.

> **Les quatre idées ont été implémentées.** Ce qui suit reste le raisonnement
> qui a mené aux choix — il vaut d'être gardé, parce qu'il explique pourquoi le
> code a la forme qu'il a. L'état de chacune est indiqué sous son titre, et le
> bilan est en bas de page.

**Trois règles qu'aucune idée ne doit casser** — elles sont ce qui fait que le
jeu marche en soirée réelle :

1. **L'app ne tranche pas.** Elle ne détecte pas les victoires, elle ne détecte
   pas la triche. Le verdict est humain, à voix haute. Toute idée qui redonne le
   pouvoir de décision au logiciel est à jeter, même si elle est facile.
2. **Zéro dépendance côté serveur**, `node:http` + `node:sqlite`. Une idée qui
   exige une lib npm au back doit vraiment le mériter.
3. **Ça se joue à bout de bras, dans le noir, un verre à la main.** Lisible,
   gros, peu d'états. Une idée qui ajoute un écran de configuration en ajoute un
   qu'on traversera en soirée sous la pression de dix personnes qui attendent.

---

## 1. Plus de thèmes

> **Fait.** Quatre thèmes ajoutés — Années 80, Tubes des années 2000, Variété
> française, Musiques de films. 175 cases et 525 titres de plus, tous vérifiés.

Un seul thème aujourd'hui : `catalog/rock-pop-punk.json`, 63 groupes, 189
titres. C'est correct pour une soirée, insuffisant pour deux.

### Pourquoi c'est l'idée la moins chère du carnet

**Zéro ligne de code.** `server/catalog.mjs` relit `catalog/` au démarrage :
ajouter un thème = ajouter un fichier JSON. Et l'écran de création est déjà
prêt — `src/screens/Creation.tsx:52` affiche le nom en dur tant qu'il n'y a
qu'un thème, et bascule tout seul sur un sélecteur dès le deuxième.

Le seul « déploiement » d'un thème est un `git push` : le dossier est lu au boot
de l'API, que le déploiement redémarre de toute façon.

### Thèmes qui tiennent la contrainte

Il faut **≥ 40 entrées** par thème (le pool d'une partie fait le double du
nombre de cases, la plus grande grille en compte 20) et **3 titres par entrée**,
dont un seul sera tiré — c'est ce qui fait que rejouer le même thème ne redonne
pas la même bande-son.

| Thème | Entrées disponibles | Piège |
|---|---|---|
| Musiques de films | large | l'entrée doit être **le film**, pas le compositeur (cf. plus bas) |
| Génériques de séries | large | beaucoup de courts extraits, `startAt` critique |
| Variété française | large | le meilleur thème pour un public non-anglophone |
| Années 80 / 90 / 2000 | large | recoupe le thème rock existant, gérer les doublons |
| Disney | ~50 | chansons FR ou VO ? à trancher avant d'écrire le fichier |
| Rap FR | large | vérifier l'embarquabilité, beaucoup de blocages label |
| Eurovision, génériques dessins animés | moyen | très clivant en soirée mixte, à réserver |

### Ce qu'il faut décider avant d'écrire un fichier

- **Une case = quoi ?** Pour un thème « musiques de films », la case doit dire
  `Star Wars`, pas `John Williams` : c'est le film qu'on reconnaît. Le schéma ne
  force rien — `slug` / `name` sont juste le libellé de la case.
- **Recoupement entre thèmes.** Queen a sa place dans « Rock » et dans « Années
  80 ». Ce n'est pas un bug tant qu'on ne joue pas deux thèmes le même soir.
- **`startAt`, jamais 0.** C'est la règle qui fait la différence entre un blind
  test et vingt secondes d'intro que personne ne reconnaît.

### Le vrai coût : la vérification

`node tools/verify-catalog.mjs` tourne dans la CI et contrôle l'embarquabilité
(oEmbed), les doublons d'id, les `startAt` nuls, et que le titre ou la chaîne
YouTube correspond bien à l'entrée annoncée. Un thème de 40 entrées = 120
vidéos à trouver, sonder et corriger. **C'est plusieurs heures par thème**, et
c'est là que passe tout le temps — pas dans le code.

---

## 2. Feu d'artifice chez le gagnant, pouces en bas chez les autres

> **Fait.** Colonne `winner_player_id` avec migration gardée, route
> `…/claims/:playerId/validate`, écrans de victoire et de défaite, et les
> confettis déplacés de la réclamation vers le verdict.

Aujourd'hui, quand le présentateur valide un bingo, `onValider`
(`src/screens/Presentateur.tsx:297`) appelle `api.terminer` — la partie se
termine et **tout le monde voit exactement le même écran** : « Partie terminée.
Merci d'avoir joué ! ». Le sommet émotionnel du jeu se solde par un message de
politesse identique pour celui qui a gagné et pour les onze autres.

### Le problème de fond : les confettis tombent au mauvais moment

Ils se déclenchent aujourd'hui **au moment de la réclamation**
(`Joueur.tsx:199-210`) — c'est-à-dire y compris quand on crie bingo à tort, et
y compris pour la réclamation qui va être rejetée dans les dix secondes. La fête
est donc décorrélée de la victoire.

**Recommandation : déplacer la fête de la réclamation vers la validation.**
Crier bingo garde la vibration et la carte « Bingo réclamé ! » (`fete-bingo`
existe déjà). Les confettis, eux, ne tombent que quand le présentateur a
tranché. Sans ça, ajouter un feu d'artifice à la victoire ne fait que dupliquer
un effet déjà vu 30 secondes plus tôt.

### Ce qu'il faut côté serveur

C'est la seule vraie brique manquante : **la partie ne sait pas qui a gagné.**

```
ALTER TABLE games ADD COLUMN winner_player_id TEXT;   -- migration réelle
POST /api/games/:code/claims/:playerId/validate       -- remplace le `terminer` du modal
GET  /api/players/:id  →  { …, game: { …, winnerId, winnerName } }
```

⚠️ `openDb` (`server/db.mjs`) crée les tables en `CREATE TABLE IF NOT EXISTS` :
sur une base existante, **ça n'ajoute pas la colonne**. Et la base vit dans un
volume Docker persistant (`musicbingo-data`). Il faut donc un vrai
`ALTER TABLE` gardé (vérifier `PRAGMA table_info(games)` au boot), pas juste
une ligne de plus dans le `CREATE TABLE`.

Côté joueur, le sondage tourne toutes les 3 s : l'écran de victoire arrive avec
**jusqu'à 3 secondes de retard**. Ce n'est pas un défaut — le présentateur
annonce le verdict à voix haute de toute façon, et l'écran vient confirmer ce
que la pièce a déjà entendu.

### Côté écran

Le socle est déjà là dans `src/index.css` : `.confetti`, `@keyframes chute`,
`.fete-bingo`, et surtout un bloc `prefers-reduced-motion` qui coupe tout. Le
composant `Confettis` (`Joueur.tsx:286`) est du CSS pur, 44 morceaux, zéro
dépendance — **le feu d'artifice doit rester dans cette économie.** Pas de
canvas, pas de `canvas-confetti`, pas de moteur de particules pour 8 secondes de
jeu par soirée.

- **Gagnant** : les confettis actuels, plus denses et plus longs, plus une carte
  plein écran « TU AS GAGNÉ » à la typo affiche, en stabilo.
- **Perdants** : c'est la partie à doser. Une pluie de 👎 sur tout l'écran est
  drôle **trois secondes**, humiliante au-delà. Recommandation : l'animation dure
  ~2,5 s puis laisse la place à un écran calme qui dit qui a gagné, avec le
  nombre de cases de chacun. On charrie, on n'enfonce pas.
- **Grille figée dans les deux cas** : `finie` retire déjà `onBasculer`.

### À trancher

- Est-ce qu'on rejoue la fête à chaque refresh de page après la fin ? (Non : un
  drapeau en `localStorage`, la fête se voit une fois.)
- Le présentateur voit-il quelque chose ? Sa console est un poste de travail, pas
  un écran de fête — probablement juste le nom du gagnant en gros.
- Et si personne ne gagne (partie terminée par le bouton « Terminer ») ? Il faut
  un écran de fin neutre qui reste, distinct de l'écran de défaite.

---

## 3. Pubs et répliques de films

> **Mécanisme fait, catalogue non écrit.** `kind`, `lexique` et `alias` sont en
> place, ainsi que le bouton « ↺ Rejouer ». Aucun thème « pub » ou « réplique »
> n'a été construit : la barre des 10 M de vues, tenue par les quatre thèmes
> musicaux, est hors d'atteinte pour des extraits de spots publicitaires, dont
> les uploads sont des copies de particuliers à la durée de vie courte. Le jour
> où on l'écrira, l'app est prête à l'accueillir.

L'intuition est bonne et le doute aussi : **ça marche, et ça abîme le parti pris
graphique.** Voilà où exactement.

### Ce qui passe sans rien toucher

Le schéma du catalogue n'est pas musical. `slug` / `name` / `tracks[].title` +
un id YouTube et un `startAt` : une réplique de film ou un jingle de pub y entre
tel quel. Une case `Le Parrain`, trois répliques, une tirée par partie — le
moteur ne fait aucune différence.

### Ce qui casse, précisément

1. **Le vocabulaire fuit dans l'UI.** « Bingo de X », « cases cochées dont le
   **groupe** n'est jamais passé » (`Presentateur.tsx:390`), « Une case = un
   groupe ». Sur un thème « pubs », le présentateur lit « groupe » en parlant
   d'Intermarché. Correctif propre : un `lexique` optionnel dans le JSON du
   thème.

   ```json
   { "id": "repliques-films", "name": "Répliques cultes",
     "lexique": { "case": "film", "cases": "films", "titre": "réplique" } }
   ```

   Par défaut : groupe / groupes / titre. **Ne pas renommer les colonnes SQL**
   (`band_slug`, `band_name`) : c'est du vocabulaire interne, et la migration
   coûterait plus que la clarté gagnée.

2. **La typo ne tient pas les noms longs.** `tailleTexte`
   (`Grille.tsx:19`) dimensionne sur le mot le plus long et plafonne à 11 cqw,
   soit le plancher `0.72rem`. « KORN » est superbe ; « Le Seigneur des Anneaux »
   est déjà limite ; « La Communauté de l'Anneau » est illisible à bout de bras.
   **C'est ça, l'abîmage du design que tu sens.** Deux sorties possibles :
   - un champ `court` par entrée, utilisé sur la carte uniquement
     (`"name": "Retour vers le futur", "court": "Retour vers le futur"` →
     `"Le Seigneur des Anneaux : la Communauté de l'Anneau"` devient `"LOTR"`) ;
   - passer ces thèmes en logos/affiches (→ idée 4), ce qui est de loin le
     meilleur rendu pour les **pubs** : une marque, c'est un logo, pas un mot.

3. **`verify-catalog.mjs` va crier sans raison.** `groupeReconnu`
   (`tools/verify-catalog.mjs:149`) exige que le nom de l'entrée apparaisse dans
   le titre de la vidéo ou le nom de la chaîne. Une case `Retour vers le futur`
   pointant sur une vidéo intitulée *Back to the Future Theme* échoue. Idem pour
   toute pub uploadée par un compte tiers. Il faut soit un `kind` de thème qui
   assouplit ce contrôle, soit un champ `alias: ["Back to the Future"]` par
   entrée — la deuxième option garde le filet, la première le retire.

4. **Le rythme du jeu change.** Un extrait musical se reconnaît en 5-10 s et on
   laisse tourner pendant que les gens cochent. Une réplique dure 3 s et c'est
   fini : le présentateur devra la repasser, et le bouton Play/Pause n'est pas
   un bouton « rejouer ». À prévoir : un bouton **« ↺ Rejouer »** sur la console
   pour les thèmes courts (recharger la vidéo au `startAt`).

5. **Les pubs vieillissent mal sur YouTube.** Les uploads de spots publicitaires
   sont des copies de particuliers : suppressions fréquentes, blocages selon le
   pays. La CI le verra, mais un thème « pubs » demandera plus d'entretien que
   les autres.

### Recommandation

Ne pas forker l'app. Introduire un `kind` par thème
(`"musique" | "pub" | "replique"`) qui ne pilote que trois choses : le lexique,
la sévérité de `verify-catalog`, et la présence du bouton « Rejouer ». Le reste
du jeu reste identique — c'est le même bingo, avec un autre catalogue.

**Ordre conseillé : faire l'idée 4 d'abord.** Un thème « pubs » en logos de
marques est superbe ; le même en noms typographiés est fade.

---

## 4. Les logos dans la grille

> **Rendu fait, logos non activés.** Le rendu (silhouette recolorée en CSS,
> micro-légende, boîte réservée) et les contrôles de la CI sont en place, et
> **50 des 63 logos** de `rock-pop-punk` sont sur le disque sous licence libre
> vérifiée. La règle du tout ou rien interdit d'activer à 50/63 — voir le bilan
> en bas de page pour ce qu'il reste à trancher.

Le mécanisme existe déjà **entièrement** : champ `logo` dans le JSON,
`/logos/<slug>.png`, `.cellule-logo` en CSS, et un repli silencieux sur le nom
typographié si le fichier manque (`Grille.tsx:28-34`). Le catalogue part avec
`"logo": null` partout.

**Il n'y a donc presque pas de code à écrire.** Le travail est ailleurs, et il y
en a plus qu'il n'y paraît.

### Le piège numéro un : l'état coché

Une case cochée devient un aplat jaune stabilo, et le logo reçoit
`filter: brightness(0) saturate(100%)` (`index.css:207`) — il devient une
**silhouette noire**. Ça marche parfaitement pour un wordmark plein (AC/DC,
Metallica). Ça détruit :

- les logos clairs sur fond sombre (ils disparaissaient déjà à moitié, là ils
  deviennent un pâté) ;
- les logos en contour fin (le trait noircit et se referme) ;
- tout logo qui repose sur la couleur pour être lisible.

**Règle à poser avant de collecter quoi que ce soit : un logo = une silhouette
monochrome pleine, en blanc sur transparent.** Sur fond nuit il s'affiche en
blanc, sur fond stabilo la même forme en noir. Aucune surprise. Les logos
« riches » sont à refuser, pas à retoucher case par case.

### Les autres coûts

- **40+ fichiers par thème** à trouver en PNG transparent, normalisés (~400 px,
  même poids optique — un wordmark très large et un emblème compact ne font pas
  le même effet dans une case carrée).
- **Tout ou rien par thème.** Une grille où six cases ont un logo et quatorze un
  nom ressemble à un bug, pas à un choix. À faire respecter par
  `verify-catalog` : si une entrée d'un thème a un logo, toutes doivent en avoir
  un, et le fichier doit exister sur le disque (aujourd'hui le script ne vérifie
  que le type du champ, `tools/verify-catalog.mjs:236`).
- **Accessibilité du jeu, pas du DOM.** L'`alt` est déjà correct, mais le vrai
  sujet est social : la moitié de la pièce ne reconnaît pas le logo des
  Scorpions. Remplacer le nom par le logo rend la grille plus belle et le jeu
  plus dur. Recommandation : **logo + nom en micro-légende** (~0,55 rem) sur les
  grilles 3×3 et 4×4, logo seul sur la 4×5 où la place manque. À arbitrer sur un
  vrai téléphone, pas dans le navigateur du Mac.
- **Chargement.** 20 images d'un coup au montage de la grille, sans dimensions
  intrinsèques : léger reflow au premier rendu. Réserver la boîte en CSS suffit.
- **Marques déposées.** Ce sont des logos de groupes sur une app privée sans
  monétisation. Le risque est faible, il n'est pas nul, et il vaut mieux l'avoir
  écrit une fois ici que le découvrir.

### Où ça rapporte le plus

Sur les **pubs** (idée 3) : la marque *est* le logo, la reconnaissance est
immédiate, et le problème des noms longs disparaît. Sur les **films**, l'affiche
ou le logo-titre joue le même rôle. Le thème rock actuel est celui qui a le
moins besoin de logos — sa typo affiche fonctionne déjà bien.

---

## Bilan

| # | Idée | État | Reste à faire |
|---|---|---|---|
| 1 | Plus de thèmes | **livré** — 4 thèmes, 525 titres | rien |
| 2 | Victoire / défaite | **livré** | rien |
| 3 | Pubs / répliques | mécanisme livré | écrire un catalogue, si on y tient |
| 4 | Logos | rendu livré, 50/63 collectés | **une décision** (ci-dessous) |

### Ce qu'il reste à trancher : les 13 logos manquants

Les logos sont prêts et invisibles. Neuf groupes n'ont **aucun fichier libre
existant** (le logo à la langue des Rolling Stones est une œuvre protégée de
John Pasche, et les groupes français — Téléphone, Noir Désir, Shaka Ponk,
Pleymo, Skip the Use — n'ont rien sur Commons). Quatre ont un fichier libre
mais illisible en silhouette : le logo de blink-182 mélange des lettres
transparentes et un « 182 » posé sur une plaque opaque, qu'aucun canal alpha ne
peut rendre.

Aucune de ces impasses ne se résout en cherchant mieux. Les sorties possibles,
par ordre de dégât croissant :

1. **Ne rien activer** (état actuel). Le thème rock garde ses 63 groupes et sa
   typo d'affiche, qui fonctionne déjà très bien. Les 50 fichiers attendent.
2. **Assouplir la règle du tout ou rien.** Sur les grilles 3×3 et 4×4 le nom
   reste affiché sous le logo : une case sans logo y est moins criante qu'on ne
   le craignait en écrivant cette section. En 4×5, en revanche, c'est un
   patchwork.
3. **Redessiner les 13 manquants à la main.** C'est créer une œuvre dérivée,
   avec ce que ça implique — et plusieurs heures de tracé.
4. **Retirer les 13 groupes du thème** pour tomber à 50 cases (au-dessus du
   minimum de 40). À écarter : on perdrait les Rolling Stones, blink-182 et
   toute la scène française, c'est-à-dire l'identité du thème.

La recommandation est **1 ou 2**, et c'est un choix de goût, pas d'ingénierie :
il faut regarder une grille 4×5 à moitié logotypée sur un vrai téléphone avant
de trancher.
