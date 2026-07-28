# music-bingo

Un blind test / bingo musical multijoueur, à jouer en soirée réelle depuis des
téléphones. En ligne sur **https://bingo.jimmydore.fr**.

C'est la reprise numérique d'une carte de bingo papier : une grille de logos de
groupes, un feutre, et quelqu'un qui met la musique. Le présentateur lance les
titres depuis son téléphone, les autres cochent depuis le leur.

## Comment ça se joue

1. Quelqu'un crée une partie sur `/` : thème, taille de grille, objectif.
2. Il partage le QR code (ou le code à 4 caractères). Chacun ouvre `/:code` sur
   son téléphone, entre un prénom et reçoit **une grille unique**.
3. Le présentateur ouvre `/m/:code` — sa console — et lance les titres.
4. Quand un groupe passe, ceux qui l'ont sur leur grille cochent la case.
5. Quelqu'un crie BINGO et appuie sur le bouton — qui ne s'ouvre qu'une fois
   l'objectif atteint sur sa grille. Le présentateur voit la réclamation,
   regarde la grille du joueur en face de l'historique, et **tranche à voix
   haute**.
6. S'il valide, la partie se termine et chaque téléphone l'apprend : confettis
   et « TU AS GAGNÉ » chez le gagnant, pluie de pouces en bas — deux secondes et
   demie, pas plus — puis le nom du gagnant chez les autres.

### Ce que l'app ne fait pas, volontairement

- **Elle ne tranche aucune victoire.** Le bouton BINGO est une *réclamation*,
  jamais une validation. Le verdict est humain — l'app se contente de
  l'**enregistrer** une fois qu'il est tombé, pour que les téléphones sachent
  qui fêter. Elle lit tout de même l'objectif pour garder le bouton fermé tant
  qu'il n'est pas atteint sur la grille (`src/lib/regles.ts`) : ça évite au
  présentateur de couper la musique pour arbitrer un bingo crié à trois cases.
  Ce garde-fou échoue toujours **ouvert** — règle inconnue du front, grille
  incomplète, il laisse passer. Un bouton bloqué à tort coûte bien plus cher
  qu'une réclamation prématurée.
- **Elle n'empêche pas la triche.** Cocher, décocher, tout cocher d'un coup :
  tout est permis. La triche est un problème social, pas logiciel. La console
  d'arbitrage se contente de signaler les cases cochées dont le groupe n'est
  jamais passé — le présentateur fait ce qu'il veut de l'information.
- **Aucun compte, aucun mot de passe, aucun email.** Un prénom suffit. Un token
  aléatoire en `localStorage` tient lieu d'identité.
- Ni manches, ni chat, ni classement persistant. Les parties se purgent au bout
  de 24 h.

## Architecture

| | |
|---|---|
| Front | Vite · React 19 · TypeScript · Tailwind 4 · tests **vitest** |
| Back | Node 22, **zéro dépendance npm** : `node:http` + `node:sqlite`, tests `node --test` |
| Temps réel | Polling toutes les 2 s, pas de SSE |
| Déploiement | 2 conteneurs Docker derrière le Caddy partagé du VPS |

Le routeur du front tient en ~40 lignes (`src/router.tsx`) : le jeu a trois
routes, React Router pèserait plus lourd que l'application.

**Le polling est un choix, pas un raccourci.** Le téléphone du présentateur
passe du wifi à la 4G, se met en veille, change de pièce. Un poll sans état se
rétablit tout seul ; un flux SSE mort s'arrête en silence et personne ne le voit
avant qu'il soit trop tard.

`server/package.json` n'a **aucune** section `dependencies`, et ce n'est pas un
oubli.

### Schéma

```
games(code PK, theme, rows, cols, win_rule, status, master_token, created_at,
      winner_player_id)
game_tracks(game_code, position, band_slug, band_name, track_title,
            youtube_id, start_at, played_at, verified)
players(id PK, game_code, name, token, card_json, checked_json,
        bingo_claimed_at, updated_at)
```

Grille et cases cochées sont stockées en JSON sur la ligne du joueur : une
partie dure une soirée, on ne fera jamais de requête analytique dessus.

`winner_player_id` est arrivé après coup, et la base vit dans un volume
persistant : `CREATE TABLE IF NOT EXISTS` n'ajoute pas une colonne à une table
qui existe déjà. La migration lit donc `PRAGMA table_info(games)` au démarrage
et ne fait l'`ALTER TABLE` que si la colonne manque.

### API

```
POST   /api/games                       → { code, masterToken }
GET    /api/games/:code                 → { theme, rows, cols, winRule, status, poolSize, verified }
POST   /api/games/:code/players         → { playerId, token, card }
GET    /api/players/:id                 → { card, checked, … }            (token joueur)
PUT    /api/players/:id/checks          → { ok }                          (token joueur)
POST   /api/players/:id/bingo           → { ok }                          (token joueur)
GET    /api/games/:code/state           → { players[], history[], current } (token présentateur)
POST   /api/games/:code/next            → { track }                       (token présentateur)
POST   /api/games/:code/end             → { ok }                          (token présentateur)
DELETE /api/games/:code/claims/:playerId → { ok }                         (token présentateur)
POST   /api/games/:code/claims/:playerId/validate → { ok }                (token présentateur)
GET    /api/themes                      → { themes[], grids[], winRules[] }
GET    /api/health                      → { ok: true }
```

Le token présentateur est le seul garde-fou sur la lecture et l'arbitrage : un
joueur ne doit pas pouvoir piloter la partie.

Deux façons de terminer, et c'est volontaire : `/end` clôt la partie **sans
gagnant** (l'écran de fin reste neutre), `/claims/:playerId/validate` enregistre
le verdict du présentateur et termine dans le même `UPDATE`. Les charges utiles
joueur et présentateur portent alors `winnerId` / `winnerName` — c'est ce qui
permet à chaque téléphone de savoir s'il doit fêter ou encaisser.

## Développement

Deux terminaux :

```bash
npm install
npm run api     # API sur :8787 (node brut, pas de build)
npm run dev     # front sur :5173, /api est proxifié vers :8787
```

Tests :

```bash
npm test              # front (vitest)
npm run test:server   # back (node --test)
npm run build         # tsc --noEmit && vite build
```

Sonder une instance de bout en bout (crée une vraie partie et la joue) :

```bash
node tools/smoke.mjs http://localhost:5173
node tools/smoke.mjs https://bingo.jimmydore.fr
```

## Le catalogue

Un fichier JSON par thème dans `catalog/`. **Ajouter un thème = ajouter un
fichier. Zéro changement de code** : le dossier est relu au démarrage de l'API.

La promesse tient pour un thème musical ordinaire, et c'est le cas courant. Un
thème qui sort des hypothèses du format paie son écart en code, une fois : des
extraits de 15 secondes là où le catalogue en attend 90 ont coûté le champ
`dureeMin` et la marge de lecture qui en dérive. Le champ ajouté sert ensuite au
suivant — c'est le prix d'entrée d'une famille de thèmes, pas d'un thème.

| Thème | Cases | Titres |
|---|---|---|
| `rock-pop-punk` — Rock / Pop-punk | 63 | 189 |
| `annees-80` — Années 80 | 50 | 124 |
| `tubes-2000` — Tubes des années 2000 | 44 | 132 |
| `variete-francaise` — Variété française | 44 | 132 |
| `musiques-de-films` — Musiques de films | 41 | 110 |
| `dessins-animes` — Dessins animés | 40 | 101 |
| `generiques-tv` — Génériques TV | 55 | 60 |

```json
{
  "id": "rock-pop-punk",
  "name": "Rock / Pop-punk",
  "kind": "musique",
  "bands": [
    {
      "slug": "linkin-park",
      "name": "Linkin Park",
      "logo": null,
      "tracks": [
        { "title": "In the End", "youtubeId": "eVTXPUF4Oz4", "startAt": 42 }
      ]
    }
  ]
}
```

Règles :

- **3 titres par groupe**, mais **un seul tiré par partie** — c'est ce qui fait
  que rejouer le même thème ne redonne pas la même bande-son. Les trois doivent
  donc être reconnaissables : pas un tube et deux faces B. Un thème qui déclare
  `titresMin` peut descendre plus bas sur certaines entrées, quand les titres
  qui manquent n'existent pas : une musique de film a souvent un thème culte et
  deux fonds sonores, et une case muette deux parties sur trois coûte plus cher
  que la variété gagnée. Le même raisonnement va jusqu'à **un seul titre**, et
  c'est lui qui l'impose : la variété française des années 80 est un cimetière
  de tubes uniques — Desireless n'a que « Voyage Voyage », Cookie Dingler que
  « Femme libérée ». Leur coller un second morceau plus faible recrée
  exactement la case muette qu'on cherche à éviter ; une case qui rejoue
  toujours le même titre est un moindre mal. Un arbitrage assumé entrée par
  entrée, jamais une facilité.
- **Une case = un groupe**, jamais un titre.
- `startAt` = seconde à laquelle démarrer, pour tomber sur la partie
  reconnaissable et pas sur 20 secondes d'intro. **Jamais 0.**
- Il faut au moins **40 groupes** par thème : le pool d'une partie fait le
  double du nombre de cases, et la plus grande grille en compte 20.
- **10 millions de vues** par titre, en cible. En dessous, la moitié de la salle
  ne reconnaît rien et la case est un trou noir. `--views` audite le catalogue
  sur ce critère. Le compteur ne vaut que pour une chanson : une musique de film
  culte est éparpillée sur cent réuploads et la version officielle n'en récolte
  que des miettes — « My Heart Will Go On » sort à 0.8 M sur la chaîne de Céline
  Dion. Un thème qui n'est pas fait de singles pose son propre seuil avec
  `vuesMin`, ou se retire de l'audit avec `vuesMin: null`.

### Les champs optionnels

- **`kind`** : `musique` (défaut), `pub`, `replique` ou `generique`. Il ne pilote
  que **deux** choses — le lexique, et l'apparition du bouton « ↺ Rejouer » sur
  la console. Il ne touche pas à la vérification du catalogue :
  `tools/verify-catalog.mjs` ne lit jamais `kind`. Le bouton apparaît sur `pub`,
  `replique` et `generique`, et pour la même raison sur les trois — l'extrait est
  trop court pour que le Play/Pause suffise, et il ne rembobine pas. Une réplique
  de film dure trois secondes, un générique de série quinze : elles passent, la
  salle lève la tête, c'est fini. Un extrait musical de trois minutes n'en a pas
  besoin. Le bingo, lui, ne change pas : c'est le même jeu avec un autre
  catalogue.
- **`lexique`** : `{ "case": "film", "cases": "films", "titre": "réplique" }`.
  Sans lui, l'interface parle de « groupes » — ce qui est absurde quand la case
  porte une marque ou un film. Défauts appliqués côté serveur, jamais côté
  front. Ce n'est plus un exemple théorique : « musiques de films » et « dessins
  animés » le déclarent, et l'écran de création annonce « 41 films » et « 40
  dessins animés » au lieu de deux fois « groupes ». ⚠️ Le lexique ne porte pas
  le genre grammatical : `case: "marque"` donnerait « le marque ».
- **`alias`** sur une entrée : `["Céline Dion", "My Heart Will Go On"]`. La
  vérification exige que le nom de la case apparaisse dans le titre de la vidéo
  ou le nom de la chaîne ; une case `Titanic` pointant sur un clip de Céline
  Dion échouerait sans cela. C'est la norme sur un thème de films, pas
  l'exception : 30 des 41 entrées de « musiques de films » en ont besoin, et 27
  des 40 de « dessins animés ». `verify-catalog` signale les alias qui n'ont
  jamais servi, pour qu'ils ne s'accumulent pas en décoration.
- **`titresMin`** : `1`, `2` ou `3` (défaut `3`). Le plancher de titres par entrée
  pour ce thème. Voir plus haut : c'est un arbitrage entre variété et cases
  reconnaissables, pas une soupape pour un lot bâclé. `verify-catalog` annonce
  combien d'entrées sont descendues sous 3, pour qu'un thème ne glisse pas vers
  le plancher entrée par entrée sans que personne l'ait décidé.
- **`vuesMin`** : un nombre, ou `null` pour sortir le thème de l'audit `--views`
  (classement compris). Défaut : 10 M.
- **`dureeMin`** : le plancher de durée des vidéos du thème, en secondes (défaut
  `90`, minimum `5`). Le plafond, lui, ne se paramètre pas : 480 s pour tout le
  monde. Ce champ existe pour les thèmes dont les extraits sont courts par
  nature — un générique de série dure 15 à 60 secondes, et le régime à 90 les
  refuserait tous. ⚠️ **La marge de lecture en dérive et ne se règle pas à
  part** : le vérificateur exige `min(30, dureeMin - 1)` secondes de lecture
  après `startAt`. C'est ce couplage qui fait tout l'intérêt du champ — sur une
  vidéo de 15 s, réclamer 30 s de lecture après un `startAt` obligatoirement
  positif est arithmétiquement impossible, et un thème de génériques serait
  refusé entrée par entrée avec un message qui ne désigne pas la cause. Les deux
  bornes sortent donc de `bornesDuree()` dans `server/catalog.mjs`, et le défaut
  de 90 n'est écrit qu'une fois.

### Vérifier le catalogue

```bash
node tools/verify-catalog.mjs               # oEmbed + structure (~3 min)
node tools/verify-catalog.mjs --durations   # + durées via yt-dlp (lent)
node tools/verify-catalog.mjs --views       # + audit des vues (lent)
node tools/verify-catalog.mjs catalog/x.json # un seul fichier
node tools/probe.mjs <youtubeId> [...]      # sonder un id à la main
```

Le script contrôle que chaque vidéo est embarquable (oEmbed 200), qu'aucun id
n'est en double, qu'aucun `startAt` n'est nul, que le titre et la chaîne
correspondent bien au groupe annoncé, et qu'aucun titre ne sent le live, la
reprise ou le remix. **Il tourne dans la CI** : le catalogue pourrira avec le
temps, et il vaut mieux l'apprendre par un job rouge que pendant une soirée.

Il refuse aussi les **collisions internes** — un titre qui se confond avec le
nom d'une autre case rend la grille inarbitrable. Ce n'est pas théorique :
« Timber » de Pitbull est contenu dans « Justin Timberlake », et « Sia » dans
« Enrique Iglesias ».

Sous 10 M de vues, `--views` **alerte sans faire rougir la CI** : un clip
confidentiel est un problème de goût, pas de correction.

### Les logos

1. Dépose `public/logos/<slug>.png` (**fond transparent**, ~400 px de côté).
2. Dans le JSON du thème, passe `"logo": null` à `"logo": "<slug>.png"`.

La case affiche alors le logo à la place du nom typographié — plus le nom en
micro-légende en dessous sur les grilles 3×3 et 4×4, où la place existe. Le
logo seul est plus beau ; il rend aussi le jeu plus dur, et la moitié d'une
salle ne reconnaît pas le logo des Scorpions. En 4×5, la légende saute faute de
place. Si le fichier manque, l'affichage retombe silencieusement sur le nom.

**La couleur du fichier source n'a aucune importance.** Le recoloriage est fait
en CSS : `brightness(0) invert(1)` sur une case normale (silhouette blanche sur
le fond nuit), `brightness(0)` sur une case cochée (silhouette noire sur
l'aplat stabilo). Ces filtres écrasent toute couleur et ne touchent pas au
canal alpha. **La seule exigence réelle est donc la transparence** : un logo sur
fond opaque devient un rectangle plein.

C'est aussi pourquoi il n'y a aucun traitement d'image dans le dépôt — deux
filtres CSS remplacent une chaîne de build, et un seul fichier par groupe suffit
pour les deux états.

**Règle du tout ou rien** : dès qu'une entrée d'un thème a un logo, toutes
doivent en avoir un, et le fichier doit exister. `verify-catalog` le contrôle.
Une grille où six cases ont un logo et quatorze un nom ressemble à un bug, pas à
un choix.

`tools/fetch-logos.mjs` récupère les logos depuis Wikimedia Commons, contrôle la
licence par l'API (jamais devinée), vérifie le canal alpha, et détoure au besoin
les aplats opaques. `public/logos/LICENSES.md` porte, pour chaque fichier, la
licence, l'auteur et l'URL source : **rien qui ne soit pas libre n'entre ici**,
le dépôt est public.

> État actuel : **50 des 63 groupes** de `rock-pop-punk` ont un logo libre. Les
> logos ne sont donc **pas activés** — la règle du tout ou rien l'interdit. Neuf
> groupes n'ont aucun fichier libre existant (le logo à la langue des Rolling
> Stones est une œuvre protégée), quatre en ont un qui reste illisible une fois
> réduit en silhouette. Les fichiers gagnés attendent sur le disque.

## Déploiement

Push sur `main` → GitHub Actions lance les tests, construit, se connecte au VPS
en SSH, `git pull` + `docker compose up -d --build`, puis vérifie en boucle que
`https://bingo.jimmydore.fr/` et `/api/health` répondent 200.

Deux conteneurs, **aucun port publié** : le Caddy partagé (stack RaveTycoon)
fait le TLS et le reverse-proxy sur le réseau Docker `ravetycoon_default`.

> ⚠️ Ne jamais nommer un service `web` ni `api` dans ce `docker-compose.yml` :
> ces alias DNS appartiennent déjà à RaveTycoon sur le réseau partagé. D'où les
> noms `musicbingo-web` et `musicbingo-api`.

> ⚠️ La route `bingo.jimmydore.fr` vit dans **`RaveTycoon/deploy/Caddyfile`**,
> pas seulement sur le serveur : ce fichier est monté depuis le dépôt, donc
> toute route ajoutée à la main sur le VPS disparaît au prochain déploiement de
> RaveTycoon.

## Lecture audio, et une limite qu'on ne peut pas contourner

Le lecteur est construit pour iOS, la contrainte la plus dure : `playsinline=1`,
chaque lecture déclenchée par un vrai tap (l'autoplay programmatique est bloqué),
Wake Lock pour que l'écran ne s'éteigne pas en plein titre.

**Une iframe YouTube ne joue pas en arrière-plan sur iOS.** Si le présentateur
verrouille son téléphone ou change d'application, la musique s'arrête net. Il
n'y a pas de solution technique — c'est dit franchement dans un bandeau
permanent sur la console plutôt que découvert en soirée.
