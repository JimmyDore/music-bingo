# music-bingo — brief de build complet

> Ce document est un **prompt**. Il contient tout ce qu'il faut pour construire le
> projet de bout en bout, sans revenir poser de questions. Toutes les décisions
> produit ont déjà été tranchées avec le commanditaire — elles sont fermes.
> Ce qui reste, c'est de l'exécution : construire, vérifier, déployer.

---

## 0. Mission

Construire et **mettre en ligne** un blind test / bingo musical multijoueur,
jouable en soirée réelle, à l'adresse **https://bingo.jimmydore.fr**.

L'objectif n'est pas « du code qui compile ». L'objectif est : **une bande de
potes lance une partie depuis leurs téléphones et passe une vraie bonne soirée
sans qu'un seul truc casse.** Un bug ce soir-là ne se debug pas — il tue la
soirée. Construis en conséquence.

**Fan out des sous-agents** sur chaque chantier ci-dessous, et fais **relire
chaque chantier par un sous-agent critique distinct et impitoyable**. Boucle
(`/loop`) tant que le critique n'est pas convaincu. Un critique qui valide du
premier coup un travail non testé n'a pas fait son travail : exige des preuves
(sortie de commande, screenshot, code HTTP), jamais des affirmations.

**Ne t'arrête pas** tant que la Definition of Done (§9) n'est pas intégralement
vérifiée, preuve à l'appui, en production.

---

## 1. Le jeu

Une reprise numérique d'un bingo musical joué à la main sur papier. La carte
papier d'origine : une grille 4×5, un **logo de groupe** par case, titre
« BINGO — Groupes de musiques ».

### Boucle de jeu

1. Le **présentateur** crée une partie : thème, taille de grille, règle de victoire.
2. Il partage l'URL courte + un QR code. Les joueurs ouvrent sur leur téléphone.
3. Chaque joueur saisit un prénom et reçoit **une grille unique**.
4. Le présentateur lance la musique depuis **son propre téléphone** (audio vers
   une enceinte). Il passe au titre suivant quand il le sent.
5. Si le groupe qui passe est sur la grille d'un joueur, il **coche la case**.
6. Quelqu'un crie BINGO et appuie sur le bouton. Le téléphone du présentateur
   affiche la réclamation. Il tranche à voix haute.

### Règles fermes — ne pas réinterpréter

- **Aucune notion de manche / round.** Le jeu est un générateur de grilles plus
  un lecteur. Rien d'autre.
- **Le cochage est totalement libre.** Cocher, décocher, tout cocher d'un coup,
  tricher éhontément : tout est permis. L'app **n'empêche rien** et **ne juge
  rien**. La triche est un problème social, pas logiciel.
- **L'app ne détecte jamais une victoire.** La règle de victoire est une simple
  métadonnée affichée aux joueurs (« Objectif : carton plein »). Le bouton BINGO
  est une *réclamation*, pas une validation. Le verdict est humain.
- **Aucun compte, aucun mot de passe, aucun email.** Un prénom suffit.
- **Une case = un groupe**, jamais un titre. Le titre qui passe est un moyen de
  reconnaître le groupe.
- **Un groupe ne peut pas passer deux fois** dans une même partie.

### Options de création de partie

| Option | Valeurs |
|---|---|
| Thème | `rock-pop-punk` (le seul au lancement, mais l'architecture en accepte N) |
| Grille | `3×3` (9 cases) · `4×4` (16) · `4×5` (20, comme le papier) |
| Règle | `ligne` · `carton plein` |

**Taille du pool = 2 × le nombre de cases** → 18 / 32 / 40 titres.
Ce n'est pas un réglage exposé dans l'UI, c'est une constante dérivée.

*Rythme attendu, à vérifier :* 4×5 + carton plein sur un pool de 40 exige de
jouer ~38 des 40 titres (≈ 30-40 min). `ligne` tombe bien plus tôt. 3×3 + ligne
est une partie d'appoint de 10 minutes.

### Génération des grilles

- La grille de chaque joueur est un échantillon **tiré du pool de la partie** —
  jamais du catalogue global. Une case hors pool rendrait la grille ingagnable.
- Deux joueurs ne doivent jamais recevoir une grille identique : compare la
  signature (cases triées) et retire si collision.
- Une case affiche le **nom du groupe en texte typographié**. Si le groupe a un
  `logo` renseigné, on affiche `public/logos/<slug>.png` à la place. **Le
  catalogue part sans aucun logo** — le mécanisme existe pour qu'on puisse en
  ajouter plus tard sans toucher une ligne de code.

---

## 2. Les trois écrans

Tout est **mobile-first**, y compris la console présentateur. Personne n'est sur
un ordinateur. Cible : 375 px de large, utilisation à une main, dans une pièce
mal éclairée, par quelqu'un qui a bu un verre.

### `/` — Création

Choix du thème, de la grille, de la règle. Bouton « Créer la partie ».
Pendant la préparation, le serveur vérifie chaque vidéo : affiche une progression
honnête (`40 titres vérifiés`). Le bouton « Démarrer » reste **verrouillé** tant
que la vérification n'est pas finie.

### `/m/:code` — Console présentateur (son téléphone)

- Le lecteur YouTube, **visible tel quel** : titre, vidéo, tout. Cet écran n'est
  vu que par le présentateur — il n'y a aucun risque de spoiler, donc **aucun
  cache, aucun visualiseur, aucune étape de révélation à construire**. Le titre
  affiché l'aide même à arbitrer une réclamation.
- Gros boutons Play / Pause / Suivant, atteignables au pouce.
- L'historique des groupes déjà passés — c'est **ce qui permet de vérifier une
  réclamation de BINGO**. Sans lui, on arbitre de mémoire.
- La liste des joueurs connectés avec leur nombre de cases cochées (`Marie 12/20`).
- Les réclamations de BINGO en bandeau. Tap sur le bandeau → la grille du
  joueur + l'historique côte à côte → `Valider` (fin de partie, écran de
  récap) ou `Rejeter` (on dismiss, la partie continue). Rejeter doit être
  parfaitement banal : la triche est prévue.
- Le présentateur **ne joue pas**. Pas de grille sur cet écran.
- Bouton « Terminer la partie ».

### `/:code` — Joueur

Saisie du prénom, puis la grille. Chaque case se coche / décoche au tap, avec un
retour visuel franc et instantané (pas d'attente réseau : optimiste, on
synchronise derrière). Un bouton **BINGO !** bien visible. En-tête : le thème et
l'objectif annoncé. Rien d'autre — surtout pas la liste des titres passés, ce
serait donner la réponse.

Un refresh **doit** restituer la même grille et les mêmes cases cochées. Un
joueur qui perd sa grille en soirée, c'est un joueur perdu.

---

## 3. Catalogue

Un fichier par thème : `catalog/rock-pop-punk.json`.

```json
{
  "id": "rock-pop-punk",
  "name": "Rock / Pop-punk",
  "bands": [
    {
      "slug": "linkin-park",
      "name": "Linkin Park",
      "logo": null,
      "tracks": [
        { "title": "In the End", "youtubeId": "eVTXPUF4Oz4", "startAt": 42 },
        { "title": "Numb",       "youtubeId": "kXYiU_JCYtU", "startAt": 55 }
      ]
    }
  ]
}
```

- **Plusieurs titres par groupe** (vise 3), mais **un seul tiré par partie**.
  C'est ce qui fait que rejouer le même thème ne redonne pas la même bande-son.
- `startAt` = seconde à laquelle démarrer, pour tomber sur la partie
  reconnaissable et pas sur 20 secondes d'intro. **Jamais 0.**
- Ajouter un thème = ajouter un fichier JSON. **Zéro changement de code.**

### Les groupes du thème de lancement

Rock / pop-punk, calibré pour un groupe de trentenaires français. 63 groupes :

**Classiques (10)** — AC/DC · Scorpions · Queen · Guns N' Roses · Metallica ·
Nirvana · The Rolling Stones · Led Zeppelin · Aerosmith · Red Hot Chili Peppers

**Alternatif 90s (8)** — Rage Against the Machine · Foo Fighters · Pearl Jam ·
The Smashing Pumpkins · Weezer · The Cranberries · Radiohead · Oasis

**Nu-metal / rock 2000s (9)** — Linkin Park · System of a Down · Limp Bizkit ·
Korn · Slipknot · Papa Roach · Evanescence · Disturbed · Three Days Grace

**Pop-punk / emo (14)** — Green Day · Blink-182 · Sum 41 · The Offspring ·
Simple Plan · Good Charlotte · My Chemical Romance · Fall Out Boy · Paramore ·
Avril Lavigne · Panic! At The Disco · Jimmy Eat World · Bowling for Soup ·
Yellowcard

**Indie / rock 2000s-2010s (12)** — Muse · The Killers · Arctic Monkeys ·
Franz Ferdinand · Kings of Leon · The White Stripes · The Strokes · Placebo ·
Imagine Dragons · Twenty One Pilots · MGMT · Phoenix

**Rock français (10)** — Shaka Ponk · Noir Désir · Téléphone · Indochine ·
Superbus · Kyo · Pleymo · Mass Hysteria · Skip the Use · Gojira

---

## 4. Architecture technique

Le commanditaire a deux jeux déjà en prod sur ce VPS. **Épouse leurs
conventions**, ne réinvente rien. Lis `RaveTycoon` et `social-circle` avant de
commencer si tu y as accès.

### Front — calqué sur `social-circle`

Vite · **React 19** · TypeScript · **Tailwind 4**. Tests **vitest**.
Routeur : écris un mini-routeur (~40 lignes) plutôt que de tirer React Router.
Le projet a trois routes.

### Back — calqué sur `RaveTycoon/server`

**Node 22, zéro dépendance npm.** `node:http` pour le serveur, `node:sqlite`
(`DatabaseSync`) pour la base. Tests via `node --test`. C'est une contrainte
esthétique assumée du commanditaire, pas une suggestion : `server/package.json`
ne doit avoir aucun champ `dependencies`.

### Schéma SQLite

```
games(code PK, theme, rows, cols, win_rule, status, master_token, created_at)
game_tracks(game_code, position, band_slug, band_name, track_title,
            youtube_id, start_at, played_at NULL)
players(id PK, game_code, name, token, card_json, checked_json,
        bingo_claimed_at NULL, updated_at)
```

Grille et cases cochées stockées en JSON sur la ligne du joueur — une table, pas
trois. Les parties se purgent automatiquement au bout de **24 h**.

### Identité

Un token aléatoire par joueur et un pour le présentateur, rendus à la création
et gardés en `localStorage`. Aucun compte. Le token présentateur est le seul
garde-fou sur `POST /next` et sur la validation d'un BINGO — un joueur ne doit
pas pouvoir piloter la lecture.

### Temps réel : polling, pas SSE

La console présentateur fait un `GET /api/games/:code/state` **toutes les 2 s**.
Raison : le téléphone du présentateur va passer du wifi à la 4G, se mettre en
veille, changer de pièce. Un poll sans état se rétablit tout seul ; un flux SSE
mort s'arrête en silence et personne ne le voit avant qu'il soit trop tard.

### API

```
POST /api/games                      → { code, masterToken }
GET  /api/games/:code                → { theme, rows, cols, winRule, status }
POST /api/games/:code/players        → { playerId, token, card }
GET  /api/players/:id                → { card, checked }          (token)
PUT  /api/players/:id/checks         → { ok }                     (token)
POST /api/players/:id/bingo          → { ok }                     (token)
GET  /api/games/:code/state          → { players[], history[], current }  (masterToken)
POST /api/games/:code/next           → { track }                  (masterToken)
POST /api/games/:code/end            → { ok }                     (masterToken)
GET  /api/health                     → { ok: true }
```

---

## 5. Lecture audio — construis pour l'iPhone

Le présentateur sera sur **iPhone ou Android, on ne sait pas encore**. Construis
donc pour la contrainte la plus dure : ce qui survit à iOS marche partout.

- `playsinline=1` sur l'iframe, sinon iOS part en plein écran et vole l'UI.
- **Chaque lecture part d'un vrai tap.** L'autoplay programmatique est bloqué sur
  iOS : `playVideo()` sans geste utilisateur échoue silencieusement. Play et
  Suivant sont donc toujours déclenchés par un appui.
- **Wake Lock API** pour que l'écran ne s'éteigne pas en plein titre.
- Chaque titre démarre à son `startAt`.

**La contrainte qu'on ne peut pas contourner :** une iframe YouTube **ne joue pas
en arrière-plan sur iOS**. Si le présentateur verrouille son téléphone ou change
d'app, la musique s'arrête net. Il n'y a pas de solution technique. **Dis-le
franchement dans l'UI** — un bandeau discret et permanent sur la console —
plutôt que de laisser le présentateur le découvrir en soirée.

---

## 6. Infra & déploiement

Cible : VPS Hetzner, `root@77.42.23.215`, déjà en service.

- Deux conteneurs : **`musicbingo-web`** (nginx : SPA + `location /api/` →
  `proxy_pass http://musicbingo-api:8787`) et **`musicbingo-api`** (volume
  `/data` pour le SQLite).
- Tous deux sur le réseau Docker externe **`ravetycoon_default`**.
  Le `docker-compose.yml` **ne publie aucun port** — le Caddy partagé (dans la
  stack RaveTycoon) fait le TLS et le reverse-proxy.
- ⚠️ **Ne jamais nommer un service `web`** : collision d'alias DNS avec l'upstream
  Caddy de RaveTycoon. C'est écrit en commentaire dans le compose de
  social-circle, c'est un piège déjà rencontré.
- Route Caddy à ajouter :
  ```
  bingo.jimmydore.fr {
      reverse_proxy musicbingo-web:80
  }
  ```
- CI GitHub Actions calquée sur `social-circle/.github/workflows/deploy.yml` :
  push sur `main` → tests + build → ssh → `git pull` → `docker compose up -d
  --build` → `docker image prune -f` → health check en boucle sur
  `https://bingo.jimmydore.fr/`. Secrets déjà en place : `DEPLOY_SSH_KEY`,
  `DEPLOY_KNOWN_HOSTS`.

### Deux pièges d'infra — lis-les avant de déployer

**1. Le Caddyfile du serveur a divergé du dépôt.** Le fichier sur le VPS
(`/root/ravetycoon/deploy/Caddyfile`) contient les routes `mppstats` et
`socialcircle` qui **n'existent pas dans le dépôt RaveTycoon**. Comme RaveTycoon
monte `./deploy/Caddyfile` depuis son dépôt, **le prochain déploiement de
RaveTycoon effacera ces routes** et fera tomber les deux sites — plus celui-ci.
Ajoute donc la route `bingo` **sur le serveur ET dans le dépôt RaveTycoon**, en
y reportant au passage les routes manquantes. Sinon tu poses une bombe à retardement.

**2. DNS : déjà fait et vérifié — n'y touche pas.** La zone est gérée chez IONOS
(`ns*.ui-dns.*`). L'enregistrement `bingo` pointait à l'origine sur le parking
IONOS ; il a été corrigé et l'état est désormais le bon :

```
bingo.jimmydore.fr.  3600  IN  A     77.42.23.215   ✅ le VPS
bingo.jimmydore.fr.              (pas d'AAAA)       ✅ voulu
```

Vérifié sur les serveurs autoritatifs, sur `1.1.1.1` et en local : c'est propagé.
`http://bingo.jimmydore.fr/` renvoie déjà `308` **depuis `77.42.23.215`** — le
trafic atteint bien Caddy.

**Ne recrée jamais d'enregistrement `AAAA` sur ce nom.** L'ancien pointait sur le
parking IONOS : les clients double-pile préférant l'IPv6, les invités en 4G
atterrissaient sur la page de parking pendant que le site paraissait parfaitement
fonctionnel en wifi, et le challenge Let's Encrypt échouait par intermittence.

**Conséquence pour toi :** tant que la route Caddy n'existe pas, `https://` échoue
sur un `tlsv1 alert internal error`. **Ce n'est pas un problème de DNS ni de
réseau** — c'est simplement Caddy qui n'a aucun certificat à présenter pour un
hostname qu'il ne connaît pas. Ajoute le bloc `bingo.jimmydore.fr`, recharge
Caddy, et le certificat est émis dans la foulée. Témoin utile pour distinguer les
causes : `https://socialcircle.jimmydore.fr/` renvoie `200`, donc Caddy est sain.

---

## 7. Le gros morceau : le catalogue — fan out massif

**C'est le chantier le plus long et le plus parallélisable du projet.** 63 groupes
× 3 titres = ~190 vidéos à trouver **et à vérifier**. Ne fais surtout pas ça
séquentiellement dans le contexte principal.

### Protocole

Découpe les 63 groupes en **lots de 5-6** et lance **un sous-agent par lot** en
parallèle. Chaque sous-agent rend du JSON structuré et rien d'autre.

Recette de résolution, testée et fonctionnelle sur cette machine
(`yt-dlp` 2025.12.08 est installé) :

```bash
yt-dlp "ytsearch1:Linkin Park In The End official music video" \
  --print "%(id)s|%(title)s|%(duration)s|%(channel)s" --skip-download --no-warnings
# → eVTXPUF4Oz4|In The End [Official HD Music Video] - Linkin Park|218|Linkin Park
```

Vérification qu'une vidéo est **réellement lisible en embed** (gratuit, sans clé
API, sans quota) :

```bash
curl -s -o /dev/null -w "%{http_code}" \
  "https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=<ID>&format=json"
# 200 = existe et embarquable · 400/401/404 = inutilisable, à rejeter
```

### Critères de sélection — un sous-agent qui les ignore refait son lot

1. **Chaîne officielle** du groupe ou de son label. Pas de reupload aléatoire :
   ce sont eux qui disparaissent en pleine soirée.
2. **Le titre studio original.** Jamais un live, une reprise, un remix, un
   « lyric video » de fan, un mashup, une version 8-bit.
3. **Durée plausible** : entre 90 s et 8 min. Hors de cette plage, c'est presque
   toujours un album complet ou un extrait.
4. **oEmbed à 200.** Non négociable, et à revérifier au moment de rendre le lot.
5. **3 titres par groupe**, les plus reconnaissables — ceux qu'on identifie en
   dix secondes, pas les préférés du sous-agent. Si le thème déclare
   `titresMin: 2`, en rendre **deux plutôt que trois** quand le troisième ne
   passe pas cette barre : un seul titre est tiré par partie, donc un cue que
   personne ne place rend la case muette deux fois sur trois. Deux titres sûrs
   valent mieux que trois dont un est un fond sonore. Jamais moins de deux.
6. **`startAt` jamais à 0.** Vise l'endroit où le morceau devient identifiable :
   souvent le premier refrain, parfois un riff d'intro emblématique (le riff de
   *Smells Like Teen Spirit* s'identifie à 0:05, le refrain de *In the End* à
   0:42). En cas de doute, 45 s est un défaut raisonnable. Cette valeur est une
   estimation assumée : elle sera affinée à l'oreille plus tard.

### Le critique du catalogue — impitoyable, et indépendant

Quand tous les lots sont rendus, lance un **sous-agent vérificateur distinct**
qui n'a pas participé à la collecte. Il doit, **sur les ~190 entrées** :

- rejouer l'appel oEmbed sur **chaque** `youtubeId` et exiger 200 ;
- détecter les **doublons d'ID** entre groupes (symptôme classique d'un agent
  qui a bâclé) ;
- vérifier que la chaîne et le titre correspondent bien au groupe annoncé — un
  ID valide qui pointe sur le mauvais morceau passe tous les tests automatiques
  et ruine la partie ;
- traquer les lives / reprises / remix passés entre les mailles ;
- vérifier que chaque groupe a bien 3 titres et qu'aucun `startAt` n'est à 0.

Tout groupe qui échoue **repart en collecte**. `/loop` jusqu'à zéro rejet.
Le critère de sortie est numérique : **190/190 à 200, zéro doublon, zéro `startAt`
nul.** Pas « ça a l'air bon ».

Écris ce vérificateur en script réutilisable (`tools/verify-catalog.mjs`) et
**câble-le dans la CI** : le catalogue pourrira avec le temps, et il vaut mieux
l'apprendre par un job rouge que pendant une soirée.

---

## 8. Boucles qualité — des critiques qui cherchent la faute

Pour chaque chantier, un **sous-agent critique distinct de celui qui a produit
le travail**. Son rôle n'est pas de valider, c'est de **trouver ce qui casse**.
Un critique qui rend « c'est bon » sans preuve doit être relancé.

### Critique visuel

Prend des screenshots réels (viewport **375×812**, pas un desktop rétréci) des
trois écrans et juge sans complaisance. Le repère de qualité : est-ce que ça
tient la comparaison avec un jeu de soirée soigné du commerce, ou est-ce que ça
ressemble à un formulaire ? Points de contrôle :

- Grille lisible d'un coup d'œil, à bout de bras, dans une pièce sombre.
- État coché / non coché distinguable **instantanément et sans ambiguïté** —
  c'est l'interaction centrale du jeu, elle doit être évidente.
- Noms de groupes longs (« Rage Against the Machine », « Panic! At The Disco »)
  qui ne débordent, ne rognent ni ne réduisent la police à l'illisible.
- Boutons atteignables au pouce, ≥ 44 px, sans mine antipersonnel à côté du
  bouton BINGO.
- Contraste conforme WCAG AA.
- Le jeu doit avoir **un parti pris graphique**. Du Tailwind par défaut,
  gris et centré, est un échec — c'est un jeu de fête, pas un back-office.

`/loop` jusqu'à ce que le critique soit franchement convaincu.

### Critique de gameplay — adversarial

Il ne teste pas le chemin heureux, il essaie de **casser la soirée** :

- 8 joueurs rejoignent en même temps → 8 grilles **distinctes**, toutes tirées
  du pool.
- Un joueur rejoint **après** le 10ᵉ titre → ça marche, sans plantage.
- Deux joueurs saisissent le même prénom → ça marche, ils restent distinguables.
- Un joueur coche les 20 cases en 2 secondes puis crie BINGO → réclamation
  affichée, rejet possible, la partie continue proprement.
- Refresh en pleine partie → même grille, mêmes coches. **Puis mode avion 30 s,
  retour réseau** → l'app se rétablit sans perdre l'état.
- Le présentateur passe tous les titres jusqu'au bout du pool → pas de crash,
  fin de partie propre.
- Deux parties simultanées → aucune fuite d'état de l'une vers l'autre.
- Un joueur bricole l'URL avec l'`id` d'un autre joueur → **refusé** (token).
- Un joueur appelle `POST /next` → **refusé**.

### Critique de déploiement

Ne croit aucune affirmation de succès. Exige :
`curl -s -o /dev/null -w "%{http_code}" https://bingo.jimmydore.fr/` → `200`,
et le même sur `/api/health`. Puis une partie complète créée et jouée **en
production**, pas en local.

---

## 9. Definition of Done

Chaque ligne se vérifie par une commande ou un screenshot. **Ne coche rien sur
la foi d'une intention.**

- [ ] `https://bingo.jimmydore.fr/` renvoie **200** en HTTPS, certificat valide.
- [ ] `https://bingo.jimmydore.fr/api/health` renvoie **200** et `{"ok":true}`.
- [ ] Une partie complète a été jouée **en production**, depuis **au moins 3
      appareils/navigateurs distincts** : création → join ×3 → grilles distinctes
      → 10 titres joués → cochage → BINGO → arbitrage → fin de partie.
- [ ] Les **190 `youtubeId` du catalogue** renvoient 200 à l'oEmbed. Zéro doublon.
      Zéro `startAt` à 0. Sortie du script de vérification fournie en preuve.
- [ ] `npm test` (vitest, front) **vert**, `node --test` (back) **vert**.
- [ ] La couverture de tests inclut la génération de grilles : tirage dans le
      pool, unicité entre joueurs, les trois tailles de grille.
- [ ] `server/package.json` n'a **aucune** `dependencies`.
- [ ] Le pipeline GitHub Actions passe **au vert de bout en bout** sur `main`.
- [ ] Vérifié sur un vrai téléphone en 375 px : les trois écrans, sans scroll
      horizontal, sans débordement.
- [ ] La route `bingo` est présente **dans le Caddyfile du serveur ET dans le
      dépôt RaveTycoon**, routes `mppstats` et `socialcircle` comprises.
- [ ] `README.md` écrit : ce que c'est, comment lancer en dev, comment ajouter un
      thème, comment ajouter un logo.
- [ ] Le bandeau « ne quitte pas l'app, la musique s'arrête » est visible sur la
      console présentateur.

---

## 10. Ce qui compte, et ce qui n'existe pas

**Rappels finaux, parce que ce sont les endroits où un agent dérive :**

- L'UI est **en français**. Intégralement.
- **Aucune détection de victoire.** Aucun anti-triche. Aucun compte. Aucun round.
  Aucun chat. Aucun classement persistant. Aucun cache-vidéo ni visualiseur —
  l'écran présentateur est privé, ce composant **ne doit pas exister**.
  Si tu te surprends à construire l'une de ces choses, tu as dérivé.
- Le commanditaire est développeur backend et lira le code. Les conventions
  maison (français dans les commentaires, zéro dépendance côté serveur, Docker +
  Caddy partagé) ne sont pas décoratives.
- **Si quelque chose est bloqué, finis tout le reste** et dis explicitement ce
  qui manque et pourquoi. Le DNS, en particulier, dépend d'une action manuelle :
  ne fais pas passer une bascule DNS en attente pour un échec de déploiement.

---

## 11. Invocation

```
Lis PROMPT.md et construis le projet en entier jusqu'à ce que la Definition of
Done soit intégralement vérifiée en production.

Fan out des sous-agents sur chaque chantier — infra, backend, console
présentateur, écran joueur, et surtout le catalogue en lots de 5-6 groupes en
parallèle. Fais relire chaque chantier par un sous-agent critique distinct et
impitoyable, qui exige des preuves et non des affirmations. /loop sur chaque
item tant que le critique n'est pas convaincu.

Ne t'arrête pas avant qu'une vraie partie ait été jouée de bout en bout depuis
trois téléphones sur https://bingo.jimmydore.fr. Ultracode.
```
