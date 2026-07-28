import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { kindDe, lexiqueDe, loadCatalog, themeSummaries } from './catalog.mjs';
import {
  GRID_SIZES,
  WIN_RULES,
  cleanName,
  drawPool,
  drawUniqueCard,
  findGridSize,
  isWinRule,
  poolSize,
  randomCode,
} from './game.mjs';
import {
  claimBingo,
  countVerified,
  dismissBingo,
  gameCodeExists,
  getGame,
  getPlayer,
  insertGame,
  insertPlayer,
  insertTracks,
  listPlayers,
  listSignatures,
  listTracks,
  markPlayed,
  newToken,
  nextTrack,
  openDb,
  playedTracks,
  purgeOldGames,
  setGameStatus,
  setWinner,
  updateChecks,
} from './db.mjs';
import { prepareGame } from './verify.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 8787);
const DB_PATH = process.env.DB_PATH ?? './data/bingo.db';
const CATALOG_DIR = process.env.CATALOG_DIR ?? join(HERE, '..', 'catalog');

/**
 * API du bingo musical. Aucune dépendance npm : node:http + node:sqlite.
 * `deps.prepare` est injectable pour que les tests n'appellent pas YouTube.
 */
export function createApp(db, themes, deps = {}) {
  const prepare = deps.prepare ?? ((code, bands) => prepareGame(db, code, bands, { onError: (m) => console.warn(m) }));
  const rng = deps.rng ?? Math.random;

  return createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
      res.writeHead(204).end();
      return;
    }

    try {
      // Base fixe, et surtout PAS l'en-tête `Host` : un `Host` malformé
      // ferait lever `new URL` et, hors de ce try, tuerait le process entier —
      // donc toutes les parties en cours d'un coup. On ne lit que le chemin.
      const seg = new URL(req.url ?? '/', 'http://bingo.local').pathname
        .split('/')
        .filter(Boolean); // ['api', 'games', 'ABCD', ...]
      await route(req, res, seg, { db, themes, prepare, rng });
    } catch (err) {
      console.error(err);
      json(res, 500, { error: 'erreur serveur' });
    }
  });
}

async function route(req, res, seg, ctx) {
  const { db, themes } = ctx;
  if (seg[0] !== 'api') return json(res, 404, { error: 'introuvable' });

  // --- santé & référentiels -------------------------------------------------
  if (req.method === 'GET' && seg[1] === 'health' && seg.length === 2) {
    return json(res, 200, { ok: true });
  }
  if (req.method === 'GET' && seg[1] === 'themes' && seg.length === 2) {
    return json(res, 200, { themes: themeSummaries(themes), grids: GRID_SIZES, winRules: WIN_RULES });
  }

  // --- parties --------------------------------------------------------------
  if (req.method === 'POST' && seg[1] === 'games' && seg.length === 2) {
    return createGame(req, res, ctx);
  }
  if (seg[1] === 'games' && seg.length >= 3) {
    const code = seg[2].toUpperCase();
    const game = getGame(db, code);
    if (!game) return json(res, 404, { error: 'partie introuvable' });

    if (req.method === 'GET' && seg.length === 3) return publicGame(res, db, themes, game);
    if (req.method === 'POST' && seg[3] === 'players' && seg.length === 4) return joinGame(req, res, ctx, game);

    // À partir d'ici, réservé au présentateur.
    if (!isMaster(req, game)) return json(res, 403, { error: 'réservé au présentateur' });

    if (req.method === 'GET' && seg[3] === 'state' && seg.length === 4) return gameState(res, db, themes, game);
    if (req.method === 'POST' && seg[3] === 'next' && seg.length === 4) return playNext(res, db, game);
    if (req.method === 'POST' && seg[3] === 'end' && seg.length === 4) return endGame(res, db, game);
    if (req.method === 'DELETE' && seg[3] === 'claims' && seg.length === 5) {
      return rejectClaim(res, db, game, seg[4]);
    }
    if (req.method === 'POST' && seg[3] === 'claims' && seg[5] === 'validate' && seg.length === 6) {
      return validateClaim(res, db, game, seg[4]);
    }
    return json(res, 404, { error: 'introuvable' });
  }

  // --- joueurs --------------------------------------------------------------
  if (seg[1] === 'players' && seg.length >= 3) {
    const player = getPlayer(db, seg[2]);
    if (!player) return json(res, 404, { error: 'joueur introuvable' });
    // Le token empêche un joueur de lire ou piloter la grille d'un autre.
    if (bearer(req) !== player.token) return json(res, 403, { error: 'token invalide' });

    if (req.method === 'GET' && seg.length === 3) return showPlayer(res, db, themes, player);
    if (req.method === 'PUT' && seg[3] === 'checks' && seg.length === 4) return saveChecks(req, res, db, player);
    if (req.method === 'POST' && seg[3] === 'bingo' && seg.length === 4) {
      claimBingo(db, player.id);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'introuvable' });
  }

  return json(res, 404, { error: 'introuvable' });
}

// ------------------------------------------------------------------ handlers

async function createGame(req, res, { db, themes, prepare, rng }) {
  const body = await corpsJson(req, res);
  if (body === REPONDU) return;
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return json(res, 400, { error: 'corps invalide' });
  }

  const theme = themes.get(body.theme);
  if (!theme) return json(res, 400, { error: 'thème inconnu' });
  const grid = findGridSize(body.grid);
  if (!grid) return json(res, 400, { error: 'taille de grille inconnue' });
  if (!isWinRule(body.winRule)) return json(res, 400, { error: 'règle de victoire inconnue' });

  const cells = grid.rows * grid.cols;
  const size = poolSize(cells);
  if (theme.bands.length < size) {
    const mot = lexiqueDe(theme).cases;
    return json(res, 400, { error: `thème trop petit : ${theme.bands.length} ${mot} pour un pool de ${size}` });
  }

  let code = randomCode(rng);
  for (let i = 0; i < 50 && gameCodeExists(db, code); i++) code = randomCode(rng);
  if (gameCodeExists(db, code)) return json(res, 503, { error: 'impossible de générer un code' });

  const masterToken = newToken();
  insertGame(db, {
    code,
    theme: theme.id,
    rows: grid.rows,
    cols: grid.cols,
    winRule: body.winRule,
    status: 'preparing',
    masterToken,
  });
  insertTracks(db, code, drawPool(theme.bands, size, rng));

  // La vérification des vidéos tourne en fond ; l'UI suit sa progression via
  // GET /api/games/:code et ne débloque « Démarrer » qu'à `ready`.
  Promise.resolve(prepare(code, theme.bands)).catch((err) => {
    console.error('préparation échouée', err);
    setGameStatus(db, code, 'ready');
  });

  return json(res, 201, { code, masterToken });
}

function publicGame(res, db, themes, game) {
  const { total, verified } = countVerified(db, game.code);
  return json(res, 200, {
    code: game.code,
    theme: game.theme,
    themeName: themes.get(game.theme)?.name ?? game.theme,
    ...vocabulaire(themes, game.theme),
    rows: game.rows,
    cols: game.cols,
    winRule: game.winRule,
    status: game.status,
    poolSize: total,
    verified,
  });
}

async function joinGame(req, res, { db, rng }, game) {
  const body = await corpsJson(req, res);
  if (body === REPONDU) return;
  const name = cleanName(body?.name);
  if (!name) return json(res, 400, { error: 'prénom requis (24 caractères max)' });
  if (game.status === 'preparing') return json(res, 409, { error: 'partie en cours de préparation' });
  if (game.status === 'ended') return json(res, 409, { error: 'partie terminée' });

  const pool = listTracks(db, game.code);
  const cells = game.rows * game.cols;
  const card = drawUniqueCard(pool, cells, listSignatures(db, game.code), rng);
  const player = {
    id: randomBytes(9).toString('hex'),
    gameCode: game.code,
    name,
    token: newToken(),
    card,
    checked: new Array(cells).fill(false),
  };
  insertPlayer(db, player);
  return json(res, 201, { playerId: player.id, token: player.token, card });
}

function showPlayer(res, db, themes, player) {
  const game = getGame(db, player.gameCode);
  return json(res, 200, {
    id: player.id,
    name: player.name,
    card: player.card,
    checked: player.checked,
    bingoClaimedAt: player.bingoClaimedAt,
    game: game
      ? {
          code: game.code,
          themeName: themes.get(game.theme)?.name ?? game.theme,
          ...vocabulaire(themes, game.theme),
          rows: game.rows,
          cols: game.cols,
          winRule: game.winRule,
          status: game.status,
          ...winnerOf(db, game),
        }
      : null,
  });
}

async function saveChecks(req, res, db, player) {
  const body = await corpsJson(req, res);
  if (body === REPONDU) return;
  const checked = body?.checked;
  if (!Array.isArray(checked) || checked.length !== player.card.length) {
    return json(res, 400, { error: 'checked invalide' });
  }
  // Cocher est totalement libre : on ne juge rien, on enregistre.
  updateChecks(db, player.id, checked.map(Boolean));
  return json(res, 200, { ok: true });
}

function gameState(res, db, themes, game) {
  const { total, verified } = countVerified(db, game.code);
  const history = playedTracks(db, game.code);
  return json(res, 200, {
    code: game.code,
    themeName: themes.get(game.theme)?.name ?? game.theme,
    ...vocabulaire(themes, game.theme),
    rows: game.rows,
    cols: game.cols,
    winRule: game.winRule,
    status: game.status,
    ...winnerOf(db, game),
    poolSize: total,
    verified,
    remaining: total - history.length,
    current: history.length > 0 ? history[history.length - 1] : null,
    history: history.map(publicTrack).reverse(), // le plus récent en tête
    players: listPlayers(db, game.code).map((p) => ({
      id: p.id,
      name: p.name,
      card: p.card,
      checked: p.checked,
      checkedCount: p.checked.filter(Boolean).length,
      cells: p.card.length,
      bingoClaimedAt: p.bingoClaimedAt,
    })),
  });
}

function publicTrack(t) {
  return { slug: t.slug, name: t.name, title: t.title, youtubeId: t.youtubeId, startAt: t.startAt };
}

function playNext(res, db, game) {
  if (game.status === 'preparing') return json(res, 409, { error: 'partie en cours de préparation' });
  const track = nextTrack(db, game.code);
  if (!track) return json(res, 200, { track: null, remaining: 0 });
  markPlayed(db, game.code, track.position);
  const remaining = listTracks(db, game.code).filter((t) => t.playedAt === null).length;
  return json(res, 200, { track: publicTrack(track), remaining });
}

/** Fin neutre : on arrête la soirée sans désigner personne. `winner_player_id`
 *  reste NULL, et l'écran de fin des joueurs ne fête ni ne console. */
function endGame(res, db, game) {
  setGameStatus(db, game.code, 'ended');
  return json(res, 200, { ok: true });
}

function rejectClaim(res, db, game, playerId) {
  const player = getPlayer(db, playerId);
  if (!player || player.gameCode !== game.code) return json(res, 404, { error: 'joueur introuvable' });
  dismissBingo(db, playerId);
  return json(res, 200, { ok: true });
}

/** Valider, c'est désigner un gagnant ET terminer la partie. Les deux sont
 *  indissociables : c'est ce qui permet à l'écran de fin de savoir s'il doit
 *  faire la fête, consoler, ou rester neutre. */
function validateClaim(res, db, game, playerId) {
  const player = getPlayer(db, playerId);
  if (!player || player.gameCode !== game.code) return json(res, 404, { error: 'joueur introuvable' });
  setWinner(db, game.code, player.id);
  return json(res, 200, { ok: true, winnerId: player.id, winnerName: player.name });
}

/** Le gagnant part par id ET par nom : le joueur compare l'id au sien pour
 *  savoir de quel côté il est, et affiche le nom sans avoir à lire l'état de la
 *  partie — qui, lui, reste réservé au présentateur. */
function winnerOf(db, game) {
  if (!game.winnerId) return { winnerId: null, winnerName: null };
  return { winnerId: game.winnerId, winnerName: getPlayer(db, game.winnerId)?.name ?? null };
}

// ------------------------------------------------------------------ helpers

/**
 * Le genre du thème et son vocabulaire, résolus ici et jamais côté front : sur
 * un thème de films, le présentateur doit lire « le film n'est jamais passé »,
 * pas « le groupe ». Un thème disparu du catalogue depuis la création de la
 * partie retombe sur le vocabulaire musical plutôt que sur du vide.
 */
function vocabulaire(themes, id) {
  const theme = themes.get(id);
  return { kind: kindDe(theme), lexique: lexiqueDe(theme) };
}

function isMaster(req, game) {
  return bearer(req) === game.masterToken;
}

function bearer(req) {
  const header = req.headers.authorization ?? '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function json(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

const MAX_CORPS = 262_144;
const TROP_GROS = Symbol('corps trop volumineux');
/** Rendu par `corpsJson` quand une réponse d'erreur a déjà été envoyée. */
const REPONDU = Symbol('réponse déjà envoyée');

/**
 * Lit le corps JSON et répond lui-même en cas de problème.
 * Le sentinel évite de confondre « corps invalide » avec un `null` légitime.
 */
async function corpsJson(req, res) {
  const body = await readJson(req);
  if (body === TROP_GROS) {
    // Un 413 explicite plutôt qu'une socket coupée : couper sans répondre fait
    // remonter un 502 par le proxy, ce qui n'apprend rien à l'appelant.
    json(res, 413, { error: 'corps trop volumineux' });
    return REPONDU;
  }
  if (body === undefined) {
    json(res, 400, { error: 'JSON invalide' });
    return REPONDU;
  }
  return body;
}

function readJson(req) {
  return new Promise((resolve) => {
    let data = '';
    let coupe = false;
    req.on('data', (chunk) => {
      if (coupe) return;
      data += chunk;
      if (data.length > MAX_CORPS) {
        coupe = true;
        resolve(TROP_GROS);
      }
    });
    req.on('end', () => {
      if (coupe) return;
      if (data.length === 0) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        resolve(undefined);
      }
    });
    req.on('error', () => resolve(coupe ? TROP_GROS : undefined));
  });
}

// ------------------------------------------------------------------ démarrage

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const { mkdirSync } = await import('node:fs');
  if (DB_PATH !== ':memory:') mkdirSync(dirname(DB_PATH), { recursive: true });
  const db = openDb(DB_PATH);
  const themes = loadCatalog(CATALOG_DIR);

  purgeOldGames(db);
  setInterval(() => purgeOldGames(db), 3600_000).unref();

  createApp(db, themes).listen(PORT, () => {
    const names = [...themes.keys()].join(', ');
    console.log(`music-bingo api sur :${PORT} (db: ${DB_PATH}, thèmes: ${names})`);
  });
}
