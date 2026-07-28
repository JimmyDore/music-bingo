import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

import {
  claimBingo,
  dismissBingo,
  getGame,
  getPlayer,
  insertGame,
  insertPlayer,
  insertTracks,
  listTracks,
  markPlayed,
  newToken,
  nextTrack,
  openDb,
  playedTracks,
  purgeOldGames,
  setWinner,
  updateChecks,
} from '../db.mjs';

function seedGame(db, code, { createdAt } = {}) {
  insertGame(db, {
    code,
    theme: 'test',
    rows: 5,
    cols: 4,
    winRule: 'carton-plein',
    status: 'ready',
    masterToken: newToken(),
  });
  if (createdAt) db.prepare('UPDATE games SET created_at = ? WHERE code = ?').run(createdAt, code);
  insertTracks(db, code, [
    { slug: 'a', name: 'A', title: 'Ta', youtubeId: 'aaaaaaaaaaa', startAt: 30 },
    { slug: 'b', name: 'B', title: 'Tb', youtubeId: 'bbbbbbbbbbb', startAt: 40 },
  ]);
  insertPlayer(db, {
    id: `p-${code}`,
    gameCode: code,
    name: 'Marie',
    token: newToken(),
    card: [{ slug: 'a', name: 'A', logo: null }],
    checked: [false],
  });
}

test('une partie fait l\'aller-retour en base', () => {
  const db = openDb(':memory:');
  seedGame(db, 'ABCD');
  const game = getGame(db, 'ABCD');
  assert.equal(game.rows, 5);
  assert.equal(game.cols, 4);
  assert.equal(game.winRule, 'carton-plein');
  assert.equal(getGame(db, 'ZZZZ'), null);
});

test('les titres se jouent dans l\'ordre du pool, une seule fois', () => {
  const db = openDb(':memory:');
  seedGame(db, 'ABCD');
  const first = nextTrack(db, 'ABCD');
  assert.equal(first.slug, 'a');
  markPlayed(db, 'ABCD', first.position);
  const second = nextTrack(db, 'ABCD');
  assert.equal(second.slug, 'b');
  markPlayed(db, 'ABCD', second.position);
  assert.equal(nextTrack(db, 'ABCD'), null);
  assert.deepEqual(playedTracks(db, 'ABCD').map((t) => t.slug), ['a', 'b']);
});

test('grille et coches survivent au rechargement', () => {
  const db = openDb(':memory:');
  seedGame(db, 'ABCD');
  updateChecks(db, 'p-ABCD', [true]);
  const player = getPlayer(db, 'p-ABCD');
  assert.deepEqual(player.checked, [true]);
  assert.deepEqual(player.card, [{ slug: 'a', name: 'A', logo: null }]);
});

test('une réclamation de BINGO se pose et se retire', () => {
  const db = openDb(':memory:');
  seedGame(db, 'ABCD');
  claimBingo(db, 'p-ABCD');
  assert.ok(getPlayer(db, 'p-ABCD').bingoClaimedAt);
  dismissBingo(db, 'p-ABCD');
  assert.equal(getPlayer(db, 'p-ABCD').bingoClaimedAt, null);
});

test('désigner un gagnant termine la partie du même coup', () => {
  const db = openDb(':memory:');
  seedGame(db, 'ABCD');
  assert.equal(getGame(db, 'ABCD').winnerId, null, 'personne n\'a gagné tant qu\'on n\'a pas tranché');

  setWinner(db, 'ABCD', 'p-ABCD');
  const game = getGame(db, 'ABCD');
  assert.equal(game.winnerId, 'p-ABCD');
  assert.equal(game.status, 'ended', 'un seul UPDATE : jamais de partie terminée sans son gagnant');
});

test('une base d\'avant le gagnant reçoit la colonne au démarrage', () => {
  // La base de production vit dans un volume Docker : elle traverse les
  // déploiements avec son ancien schéma, et `CREATE TABLE IF NOT EXISTS` ne la
  // touche pas. Seule la migration gardée peut la rattraper — c'est le seul
  // chemin qui compte en vrai, et il ne passe jamais par une base neuve.
  const dossier = mkdtempSync(join(tmpdir(), 'bingo-migration-'));
  const chemin = join(dossier, 'ancienne.db');
  try {
    const ancienne = new DatabaseSync(chemin);
    ancienne.exec(`
      CREATE TABLE games (
        code          TEXT PRIMARY KEY,
        theme         TEXT NOT NULL,
        rows          INTEGER NOT NULL,
        cols          INTEGER NOT NULL,
        win_rule      TEXT NOT NULL,
        status        TEXT NOT NULL,
        master_token  TEXT NOT NULL,
        created_at    TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    ancienne
      .prepare('INSERT INTO games (code, theme, rows, cols, win_rule, status, master_token) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run('VIEU', 'test', 5, 4, 'ligne', 'ready', 'jeton');
    ancienne.close();

    const db = openDb(chemin);
    assert.equal(getGame(db, 'VIEU').winnerId, null, 'la partie d\'avant survit à la migration');
    setWinner(db, 'VIEU', 'p-1');
    assert.equal(getGame(db, 'VIEU').winnerId, 'p-1');
    db.close();

    // Rouvrir ne rejoue pas l'ALTER TABLE : le boot doit rester idempotent.
    const encore = openDb(chemin);
    assert.equal(getGame(encore, 'VIEU').winnerId, 'p-1');
    encore.close();
  } finally {
    rmSync(dossier, { recursive: true, force: true });
  }
});

test('les parties de plus de 24 h sont purgées avec leurs joueurs et titres', () => {
  const db = openDb(':memory:');
  seedGame(db, 'VIEU', { createdAt: '2020-01-01 00:00:00' });
  seedGame(db, 'NEUF');

  assert.equal(purgeOldGames(db, 24), 1);
  assert.equal(getGame(db, 'VIEU'), null);
  assert.equal(listTracks(db, 'VIEU').length, 0);
  assert.equal(getPlayer(db, 'p-VIEU'), null);

  assert.ok(getGame(db, 'NEUF'), 'la partie du soir reste');
  assert.equal(listTracks(db, 'NEUF').length, 2);
  assert.ok(getPlayer(db, 'p-NEUF'));
});
