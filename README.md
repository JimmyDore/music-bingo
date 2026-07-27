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
5. Quelqu'un crie BINGO et appuie sur le bouton. Le présentateur voit la
   réclamation, regarde la grille du joueur en face de l'historique, et
   **tranche à voix haute**.

### Ce que l'app ne fait pas, volontairement

- **Elle ne détecte aucune victoire.** L'objectif (« carton plein », « une
  ligne ») est une simple métadonnée affichée aux joueurs. Le bouton BINGO est
  une *réclamation*, jamais une validation. Le verdict est humain.
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
games(code PK, theme, rows, cols, win_rule, status, master_token, created_at)
game_tracks(game_code, position, band_slug, band_name, track_title,
            youtube_id, start_at, played_at, verified)
players(id PK, game_code, name, token, card_json, checked_json,
        bingo_claimed_at, updated_at)
```

Grille et cases cochées sont stockées en JSON sur la ligne du joueur : une
partie dure une soirée, on ne fera jamais de requête analytique dessus.

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
GET    /api/themes                      → { themes[], grids[], winRules[] }
GET    /api/health                      → { ok: true }
```

Le token présentateur est le seul garde-fou sur la lecture et l'arbitrage : un
joueur ne doit pas pouvoir piloter la partie.

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
        { "title": "In the End", "youtubeId": "eVTXPUF4Oz4", "startAt": 42 }
      ]
    }
  ]
}
```

Règles :

- **3 titres par groupe**, mais **un seul tiré par partie** — c'est ce qui fait
  que rejouer le même thème ne redonne pas la même bande-son.
- **Une case = un groupe**, jamais un titre.
- `startAt` = seconde à laquelle démarrer, pour tomber sur la partie
  reconnaissable et pas sur 20 secondes d'intro. **Jamais 0.**
- Il faut au moins **40 groupes** par thème : le pool d'une partie fait le
  double du nombre de cases, et la plus grande grille en compte 20.

### Vérifier le catalogue

```bash
node tools/verify-catalog.mjs              # oEmbed + structure (~1 min)
node tools/verify-catalog.mjs --durations   # + durées via yt-dlp (lent)
node tools/probe.mjs <youtubeId> [...]      # sonder un id à la main
```

Le script contrôle que chaque vidéo est embarquable (oEmbed 200), qu'aucun id
n'est en double, qu'aucun `startAt` n'est nul, que le titre et la chaîne
correspondent bien au groupe annoncé, et qu'aucun titre ne sent le live, la
reprise ou le remix. **Il tourne dans la CI** : le catalogue pourrira avec le
temps, et il vaut mieux l'apprendre par un job rouge que pendant une soirée.

### Ajouter un logo

Le catalogue part sans aucun logo — le mécanisme existe pour qu'on puisse en
ajouter plus tard sans toucher une ligne de code.

1. Dépose `public/logos/<slug>.png` (fond transparent, ~400 px de côté).
2. Dans le JSON du thème, passe `"logo": null` à `"logo": "<slug>.png"`.

La case affiche alors le logo à la place du nom typographié. Si le fichier
manque, l'affichage retombe silencieusement sur le nom.

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
