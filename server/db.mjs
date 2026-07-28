import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';

// Une partie tient dans trois tables. La grille et les cases cochées vivent en
// JSON sur la ligne du joueur : une partie dure une soirée, on ne fera jamais
// de requête analytique dessus, une table de plus serait du zèle.

export function openDb(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      code          TEXT PRIMARY KEY,
      theme         TEXT NOT NULL,
      rows          INTEGER NOT NULL,
      cols          INTEGER NOT NULL,
      win_rule      TEXT NOT NULL,
      status        TEXT NOT NULL,
      master_token  TEXT NOT NULL,
      -- NULL tant que personne n'a gagné : une partie peut très bien se
      -- terminer sans vainqueur (bouton « Terminer la partie »).
      winner_player_id TEXT,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS game_tracks (
      game_code   TEXT NOT NULL,
      position    INTEGER NOT NULL,
      band_slug   TEXT NOT NULL,
      band_name   TEXT NOT NULL,
      track_title TEXT NOT NULL,
      youtube_id  TEXT NOT NULL,
      start_at    INTEGER NOT NULL,
      played_at   TEXT,
      -- vérification oEmbed faite à la préparation de la partie : une vidéo
      -- retirée de YouTube depuis la dernière CI ne doit pas tomber en soirée.
      verified    INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (game_code, position)
    );
    CREATE TABLE IF NOT EXISTS players (
      id               TEXT PRIMARY KEY,
      game_code        TEXT NOT NULL,
      name             TEXT NOT NULL,
      token            TEXT NOT NULL,
      card_json        TEXT NOT NULL,
      checked_json     TEXT NOT NULL,
      bingo_claimed_at TEXT,
      updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_players_game ON players(game_code);
    CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at);
  `);
  migrer(db);
  return db;
}

/**
 * Les colonnes ajoutées après coup ne peuvent pas venir du `CREATE TABLE` seul :
 * `IF NOT EXISTS` ne touche pas une table qui existe déjà. Et la base vit dans
 * un volume Docker qui survit aux déploiements — sans cette migration, la
 * colonne n'existerait que sur les bases neuves, donc jamais en production.
 *
 * Gardée par `PRAGMA table_info` plutôt que par un try/catch : on veut qu'un
 * vrai échec d'`ALTER TABLE` reste bruyant au démarrage, pas avalé en silence.
 */
function migrer(db) {
  const colonnes = new Set(db.prepare('PRAGMA table_info(games)').all().map((c) => c.name));
  if (!colonnes.has('winner_player_id')) {
    db.exec('ALTER TABLE games ADD COLUMN winner_player_id TEXT');
  }
}

export function newToken() {
  return randomBytes(16).toString('hex');
}

// ---------------------------------------------------------------- parties

export function insertGame(db, game) {
  db.prepare(
    `INSERT INTO games (code, theme, rows, cols, win_rule, status, master_token)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(game.code, game.theme, game.rows, game.cols, game.winRule, game.status, game.masterToken);
}

export function getGame(db, code) {
  const row = db.prepare('SELECT * FROM games WHERE code = ?').get(code);
  if (!row) return null;
  return {
    code: row.code,
    theme: row.theme,
    rows: row.rows,
    cols: row.cols,
    winRule: row.win_rule,
    status: row.status,
    masterToken: row.master_token,
    winnerId: row.winner_player_id ?? null,
    createdAt: row.created_at,
  };
}

export function gameCodeExists(db, code) {
  return db.prepare('SELECT 1 FROM games WHERE code = ?').get(code) !== undefined;
}

export function setGameStatus(db, code, status) {
  db.prepare('UPDATE games SET status = ? WHERE code = ?').run(status, code);
}

/** Désigner le gagnant et terminer la partie sont un seul geste, dans un seul
 *  UPDATE : entre les deux, le gagnant verrait l'écran de fin neutre — celui
 *  qu'on affiche justement quand personne n'a gagné. */
export function setWinner(db, code, playerId) {
  db.prepare("UPDATE games SET status = 'ended', winner_player_id = ? WHERE code = ?").run(playerId, code);
}

// ------------------------------------------------------------- titres

export function insertTracks(db, code, pool) {
  const stmt = db.prepare(
    `INSERT INTO game_tracks (game_code, position, band_slug, band_name, track_title, youtube_id, start_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  pool.forEach((t, i) => {
    stmt.run(code, i, t.slug, t.name, t.title, t.youtubeId, t.startAt);
  });
}

function toTrack(row) {
  return {
    position: row.position,
    slug: row.band_slug,
    name: row.band_name,
    title: row.track_title,
    youtubeId: row.youtube_id,
    startAt: row.start_at,
    playedAt: row.played_at,
    verified: row.verified === 1,
  };
}

export function listTracks(db, code) {
  return db
    .prepare('SELECT * FROM game_tracks WHERE game_code = ? ORDER BY position')
    .all(code)
    .map(toTrack);
}

/** Remplace un titre injouable par un autre, en gardant sa position : le pool
 *  doit conserver sa taille, sinon des grilles deviennent ingagnables. */
export function replaceTrack(db, code, position, track) {
  db.prepare(
    `UPDATE game_tracks
        SET band_slug = ?, band_name = ?, track_title = ?, youtube_id = ?, start_at = ?, verified = 0
      WHERE game_code = ? AND position = ?`,
  ).run(track.slug, track.name, track.title, track.youtubeId, track.startAt, code, position);
}

export function markVerified(db, code, position) {
  db.prepare('UPDATE game_tracks SET verified = 1 WHERE game_code = ? AND position = ?').run(code, position);
}

export function countVerified(db, code) {
  const row = db
    .prepare('SELECT COUNT(*) AS total, SUM(verified) AS ok FROM game_tracks WHERE game_code = ?')
    .get(code);
  return { total: row.total ?? 0, verified: row.ok ?? 0 };
}

/** Le prochain titre non joué, dans l'ordre du pool (déjà mélangé au tirage). */
export function nextTrack(db, code) {
  const row = db
    .prepare('SELECT * FROM game_tracks WHERE game_code = ? AND played_at IS NULL ORDER BY position LIMIT 1')
    .get(code);
  return row ? toTrack(row) : null;
}

export function markPlayed(db, code, position) {
  db.prepare("UPDATE game_tracks SET played_at = datetime('now') WHERE game_code = ? AND position = ?").run(
    code,
    position,
  );
}

/** Historique des groupes déjà passés — c'est ce qui permet d'arbitrer un BINGO. */
export function playedTracks(db, code) {
  return db
    .prepare('SELECT * FROM game_tracks WHERE game_code = ? AND played_at IS NOT NULL ORDER BY played_at, position')
    .all(code)
    .map(toTrack);
}

// ------------------------------------------------------------- joueurs

export function insertPlayer(db, player) {
  db.prepare(
    `INSERT INTO players (id, game_code, name, token, card_json, checked_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    player.id,
    player.gameCode,
    player.name,
    player.token,
    JSON.stringify(player.card),
    JSON.stringify(player.checked),
  );
}

function toPlayer(row) {
  return {
    id: row.id,
    gameCode: row.game_code,
    name: row.name,
    token: row.token,
    card: JSON.parse(row.card_json),
    checked: JSON.parse(row.checked_json),
    bingoClaimedAt: row.bingo_claimed_at,
    updatedAt: row.updated_at,
  };
}

export function getPlayer(db, id) {
  const row = db.prepare('SELECT * FROM players WHERE id = ?').get(id);
  return row ? toPlayer(row) : null;
}

export function listPlayers(db, code) {
  return db
    .prepare('SELECT * FROM players WHERE game_code = ? ORDER BY updated_at')
    .all(code)
    .map(toPlayer);
}

export function listSignatures(db, code) {
  return db
    .prepare('SELECT card_json FROM players WHERE game_code = ?')
    .all(code)
    .map((r) => JSON.parse(r.card_json).map((c) => c.slug).sort().join(','));
}

export function updateChecks(db, id, checked) {
  db.prepare("UPDATE players SET checked_json = ?, updated_at = datetime('now') WHERE id = ?").run(
    JSON.stringify(checked),
    id,
  );
}

export function claimBingo(db, id) {
  db.prepare("UPDATE players SET bingo_claimed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?").run(id);
}

/** Rejeter une réclamation doit être parfaitement banal : on efface, la partie
 *  continue, le joueur peut re-crier BINGO plus tard. */
export function dismissBingo(db, id) {
  db.prepare('UPDATE players SET bingo_claimed_at = NULL WHERE id = ?').run(id);
}

// ------------------------------------------------------------- purge

/** Les parties durent une soirée. Au-delà de 24 h, plus personne ne les
 *  regarde : on nettoie pour ne pas laisser grossir le volume indéfiniment. */
export function purgeOldGames(db, hours = 24) {
  const cutoff = `-${Number(hours)} hours`;
  const stale = db
    .prepare("SELECT code FROM games WHERE created_at < datetime('now', ?)")
    .all(cutoff)
    .map((r) => r.code);
  for (const code of stale) {
    db.prepare('DELETE FROM players WHERE game_code = ?').run(code);
    db.prepare('DELETE FROM game_tracks WHERE game_code = ?').run(code);
    db.prepare('DELETE FROM games WHERE code = ?').run(code);
  }
  return stale.length;
}
