import test from 'node:test';
import assert from 'node:assert/strict';
import { connect } from 'node:net';

import { parseTheme } from '../catalog.mjs';
import { fakeThemes, seeded, startApp } from './helpers.mjs';

const join = (app, code, name) => app.call('POST', `/api/games/${code}/players`, { body: { name } });

const LEXIQUE_MUSIQUE = { case: 'groupe', cases: 'groupes', titre: 'titre' };

/**
 * Le catalogue de test repeint en thème de répliques. On passe par `parseTheme`
 * pour emprunter exactement le chemin d'un vrai fichier de catalogue — dont la
 * résolution des défauts, ici volontairement partielle.
 */
function themeReplique(bandCount = 50) {
  const base = fakeThemes(bandCount).get('test');
  const theme = parseTheme(
    JSON.stringify({ ...base, kind: 'replique', lexique: { case: 'film', cases: 'films' } }),
  );
  return new Map([['test', theme]]);
}

test('health répond ok', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const res = await app.call('GET', '/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('une partie se crée, se prépare, puis passe à ready', async (t) => {
  const app = await startApp();
  t.after(app.close);

  const created = await app.call('POST', '/api/games', {
    body: { theme: 'test', grid: '4x5', winRule: 'carton-plein' },
  });
  assert.equal(created.status, 201);
  assert.match(created.body.code, /^[A-Z2-9]{4}$/);
  assert.ok(created.body.masterToken);

  const { code } = created.body;
  let game;
  const limite = Date.now() + 30_000;
  do {
    game = (await app.call('GET', `/api/games/${code}`)).body;
    if (game.status === 'ready') break;
    await new Promise((r) => setTimeout(r, 10));
  } while (Date.now() < limite);
  assert.equal(game.status, 'ready');
  assert.equal(game.poolSize, 40, 'pool = 2 × 20 cases');
  assert.equal(game.verified, 40, 'toutes les vidéos vérifiées avant de débloquer Démarrer');
  assert.equal(game.rows, 5);
  assert.equal(game.cols, 4);
  assert.equal(game.winRule, 'carton-plein');
});

test('un thème sans lexique parle de groupes sur les quatre routes', async (t) => {
  // La garantie « rien ne bouge à l'écran » : le thème musical continue de
  // parler de groupes, et le front n'a aucun défaut à appliquer.
  const app = await startApp();
  t.after(app.close);
  const { code, masterToken } = await app.createGame();
  const { playerId, token } = (await join(app, code, 'Marie')).body;

  const refs = (await app.call('GET', '/api/themes')).body;
  assert.equal(refs.themes[0].kind, 'musique');
  assert.deepEqual(refs.themes[0].lexique, LEXIQUE_MUSIQUE);

  for (const [chemin, jeton] of [
    [`/api/games/${code}`, undefined],
    [`/api/games/${code}/state`, masterToken],
  ]) {
    const vue = (await app.call('GET', chemin, { token: jeton })).body;
    assert.equal(vue.kind, 'musique', chemin);
    assert.deepEqual(vue.lexique, LEXIQUE_MUSIQUE, chemin);
  }
  const joueur = (await app.call('GET', `/api/players/${playerId}`, { token })).body;
  assert.equal(joueur.game.kind, 'musique');
  assert.deepEqual(joueur.game.lexique, LEXIQUE_MUSIQUE);
});

test('le vocabulaire d\'un thème suit la partie jusqu\'à la console et aux joueurs', async (t) => {
  const app = await startApp({ themes: themeReplique() });
  t.after(app.close);
  const { code, masterToken } = await app.createGame();
  const { playerId, token } = (await join(app, code, 'Marie')).body;

  // `titre` n'est pas déclaré : le serveur le complète, pour que le front n'ait
  // jamais à connaître le mot « groupe ».
  const attendu = { case: 'film', cases: 'films', titre: 'titre' };

  const refs = (await app.call('GET', '/api/themes')).body;
  assert.equal(refs.themes[0].kind, 'replique');
  assert.deepEqual(refs.themes[0].lexique, attendu);

  const partie = (await app.call('GET', `/api/games/${code}`)).body;
  assert.equal(partie.kind, 'replique');
  assert.deepEqual(partie.lexique, attendu);

  const etat = (await app.call('GET', `/api/games/${code}/state`, { token: masterToken })).body;
  assert.equal(etat.kind, 'replique', 'la console arbitre avec les mots du thème');
  assert.deepEqual(etat.lexique, attendu);

  const joueur = (await app.call('GET', `/api/players/${playerId}`, { token })).body;
  assert.equal(joueur.game.kind, 'replique');
  assert.deepEqual(joueur.game.lexique, attendu);
});

test('les paramètres de création sont validés', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const bad = [
    { theme: 'inexistant', grid: '4x5', winRule: 'ligne' },
    { theme: 'test', grid: '9x9', winRule: 'ligne' },
    { theme: 'test', grid: '4x5', winRule: 'triche' },
  ];
  for (const body of bad) {
    assert.equal((await app.call('POST', '/api/games', { body })).status, 400);
  }
});

test('un thème trop petit pour la grille est refusé proprement', async (t) => {
  const app = await startApp({ themes: fakeThemes(12) });
  t.after(app.close);
  const res = await app.call('POST', '/api/games', {
    body: { theme: 'test', grid: '4x5', winRule: 'ligne' },
  });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /trop petit/);
  assert.match(res.body.error, /12 groupes/);

  // Même refus, mais dans les mots du thème : le message part à l'écran.
  const films = await startApp({ themes: themeReplique(12) });
  t.after(films.close);
  const surFilms = await films.call('POST', '/api/games', {
    body: { theme: 'test', grid: '4x5', winRule: 'ligne' },
  });
  assert.equal(surFilms.status, 400);
  assert.match(surFilms.body.error, /12 films/);
});

test('8 joueurs rejoignent : 8 grilles distinctes, toutes tirées du pool', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const { code, masterToken } = await app.createGame();

  const state0 = await app.call('GET', `/api/games/${code}/state`, { token: masterToken });
  const poolSlugs = new Set(state0.body.players.flatMap(() => []));
  assert.equal(poolSlugs.size, 0);

  const players = [];
  for (const name of ['Marie', 'Paul', 'Léa', 'Tom', 'Zoé', 'Hugo', 'Ana', 'Yann']) {
    const res = await join(app, code, name);
    assert.equal(res.status, 201);
    assert.equal(res.body.card.length, 20);
    players.push(res.body);
  }

  const signatures = new Set(players.map((p) => p.card.map((c) => c.slug).sort().join(',')));
  assert.equal(signatures.size, 8, 'aucune grille identique entre deux joueurs');

  // Chaque case vient bien du pool de la partie.
  const state = await app.call('GET', `/api/games/${code}/state`, { token: masterToken });
  const pool = new Set();
  for (let i = 0; i < 40; i++) {
    const played = await app.call('POST', `/api/games/${code}/next`, { token: masterToken });
    if (played.body.track) pool.add(played.body.track.slug);
  }
  assert.equal(pool.size, 40);
  for (const p of players) {
    for (const cell of p.card) assert.ok(pool.has(cell.slug), `${cell.slug} hors pool`);
  }
  assert.equal(state.body.players.length, 8);
});

test('deux joueurs avec le même prénom restent distinguables', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const { code, masterToken } = await app.createGame();

  const a = await join(app, code, 'Marie');
  const b = await join(app, code, 'Marie');
  assert.equal(a.status, 201);
  assert.equal(b.status, 201);
  assert.notEqual(a.body.playerId, b.body.playerId);
  assert.notEqual(a.body.token, b.body.token);

  const state = await app.call('GET', `/api/games/${code}/state`, { token: masterToken });
  assert.equal(state.body.players.length, 2);
  assert.equal(new Set(state.body.players.map((p) => p.id)).size, 2);
});

test('un prénom vide ou trop long est refusé', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const { code } = await app.createGame();
  assert.equal((await join(app, code, '   ')).status, 400);
  assert.equal((await join(app, code, 'x'.repeat(25))).status, 400);
});

test('un joueur qui rejoint après le 10e titre reçoit une grille normale', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const { code, masterToken } = await app.createGame();

  const early = await join(app, code, 'Marie');
  for (let i = 0; i < 10; i++) {
    await app.call('POST', `/api/games/${code}/next`, { token: masterToken });
  }
  const late = await join(app, code, 'Retardataire');
  assert.equal(late.status, 201);
  assert.equal(late.body.card.length, 20);
  assert.notEqual(
    late.body.card.map((c) => c.slug).sort().join(','),
    early.body.card.map((c) => c.slug).sort().join(','),
  );
});

test('un refresh restitue la même grille et les mêmes coches', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const { code } = await app.createGame();
  const { playerId, token, card } = (await join(app, code, 'Marie')).body;

  const checked = card.map((_, i) => i % 3 === 0);
  const saved = await app.call('PUT', `/api/players/${playerId}/checks`, { body: { checked }, token });
  assert.equal(saved.status, 200);

  const reload = await app.call('GET', `/api/players/${playerId}`, { token });
  assert.equal(reload.status, 200);
  assert.deepEqual(reload.body.card, card);
  assert.deepEqual(reload.body.checked, checked);
  assert.equal(reload.body.game.winRule, 'carton-plein');
});

test('cocher est totalement libre : 20 cases en une requête, sans jugement', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const { code, masterToken } = await app.createGame();
  const { playerId, token } = (await join(app, code, 'Tricheur')).body;

  const all = new Array(20).fill(true);
  assert.equal((await app.call('PUT', `/api/players/${playerId}/checks`, { body: { checked: all }, token })).status, 200);
  assert.equal((await app.call('POST', `/api/players/${playerId}/bingo`, { token })).status, 200);

  const state = await app.call('GET', `/api/games/${code}/state`, { token: masterToken });
  const claimant = state.body.players.find((p) => p.id === playerId);
  assert.equal(claimant.checkedCount, 20);
  assert.ok(claimant.bingoClaimedAt, 'la réclamation est visible côté présentateur');

  // Le présentateur rejette : la partie continue, le joueur garde sa grille.
  const rejected = await app.call('DELETE', `/api/games/${code}/claims/${playerId}`, { token: masterToken });
  assert.equal(rejected.status, 200);
  const after = await app.call('GET', `/api/games/${code}/state`, { token: masterToken });
  assert.equal(after.body.players.find((p) => p.id === playerId).bingoClaimedAt, null);
  assert.equal(after.body.status, 'ready', 'la partie continue après un rejet');

  // Et il peut re-crier BINGO.
  assert.equal((await app.call('POST', `/api/players/${playerId}/bingo`, { token })).status, 200);
});

test('un tableau de coches de mauvaise taille est refusé', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const { code } = await app.createGame();
  const { playerId, token } = (await join(app, code, 'Marie')).body;
  const res = await app.call('PUT', `/api/players/${playerId}/checks`, { body: { checked: [true] }, token });
  assert.equal(res.status, 400);
});

test('un joueur ne peut pas lire ni piloter la grille d\'un autre', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const { code } = await app.createGame();
  const marie = (await join(app, code, 'Marie')).body;
  const paul = (await join(app, code, 'Paul')).body;

  // Paul bricole l'URL avec l'id de Marie.
  assert.equal((await app.call('GET', `/api/players/${marie.playerId}`, { token: paul.token })).status, 403);
  assert.equal((await app.call('GET', `/api/players/${marie.playerId}`)).status, 403);
  assert.equal(
    (await app.call('PUT', `/api/players/${marie.playerId}/checks`, {
      body: { checked: new Array(20).fill(true) },
      token: paul.token,
    })).status,
    403,
  );
  assert.equal((await app.call('POST', `/api/players/${marie.playerId}/bingo`, { token: paul.token })).status, 403);
});

test('un joueur ne peut pas piloter la lecture ni terminer la partie', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const { code, masterToken } = await app.createGame();
  const marie = (await join(app, code, 'Marie')).body;

  for (const [method, path] of [
    ['POST', `/api/games/${code}/next`],
    ['POST', `/api/games/${code}/end`],
    ['GET', `/api/games/${code}/state`],
    ['DELETE', `/api/games/${code}/claims/${marie.playerId}`],
  ]) {
    assert.equal((await app.call(method, path, { token: marie.token })).status, 403, `${method} ${path} sans droit`);
    assert.equal((await app.call(method, path)).status, 403, `${method} ${path} sans token`);
  }
  // Le présentateur, lui, passe.
  assert.equal((await app.call('POST', `/api/games/${code}/next`, { token: masterToken })).status, 200);
});

test('le présentateur peut vider tout le pool sans crash', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const { code, masterToken } = await app.createGame();

  const seen = new Set();
  for (let i = 0; i < 40; i++) {
    const res = await app.call('POST', `/api/games/${code}/next`, { token: masterToken });
    assert.equal(res.status, 200);
    assert.ok(res.body.track, `titre ${i + 1} manquant`);
    assert.equal(res.body.remaining, 39 - i);
    seen.add(res.body.track.youtubeId);
  }
  assert.equal(seen.size, 40, 'aucun titre rejoué');

  // Pool épuisé : on rend null, on ne casse pas.
  const extra = await app.call('POST', `/api/games/${code}/next`, { token: masterToken });
  assert.equal(extra.status, 200);
  assert.equal(extra.body.track, null);
  assert.equal(extra.body.remaining, 0);

  const state = await app.call('GET', `/api/games/${code}/state`, { token: masterToken });
  assert.equal(state.body.history.length, 40);
  assert.equal(state.body.remaining, 0);

  const ended = await app.call('POST', `/api/games/${code}/end`, { token: masterToken });
  assert.equal(ended.status, 200);
  assert.equal((await app.call('GET', `/api/games/${code}`)).body.status, 'ended');
});

test('l\'historique est daté, ordonné, et porte le titre pour arbitrer', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const { code, masterToken } = await app.createGame();

  const played = [];
  for (let i = 0; i < 3; i++) {
    played.push((await app.call('POST', `/api/games/${code}/next`, { token: masterToken })).body.track);
  }
  const state = await app.call('GET', `/api/games/${code}/state`, { token: masterToken });
  assert.deepEqual(
    state.body.history.map((t) => t.slug),
    played.map((t) => t.slug).reverse(),
    'le plus récent en tête',
  );
  assert.equal(state.body.current.slug, played[2].slug);
  for (const track of state.body.history) {
    assert.ok(track.title, 'le titre aide le présentateur à arbitrer');
    assert.ok(track.startAt > 0, 'jamais 0, sinon on démarre sur l\'intro');
  }
});

test('deux parties simultanées ne fuient pas l\'une dans l\'autre', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const a = await app.createGame({ grid: '4x5' });
  const b = await app.createGame({ grid: '3x3', winRule: 'ligne' });
  assert.notEqual(a.code, b.code);

  const pa = (await join(app, a.code, 'Marie')).body;
  const pb = (await join(app, b.code, 'Paul')).body;
  assert.equal(pa.card.length, 20);
  assert.equal(pb.card.length, 9);

  await app.call('POST', `/api/games/${a.code}/next`, { token: a.masterToken });

  const stateA = await app.call('GET', `/api/games/${a.code}/state`, { token: a.masterToken });
  const stateB = await app.call('GET', `/api/games/${b.code}/state`, { token: b.masterToken });
  assert.deepEqual(stateA.body.players.map((p) => p.name), ['Marie']);
  assert.deepEqual(stateB.body.players.map((p) => p.name), ['Paul']);
  assert.equal(stateA.body.history.length, 1);
  assert.equal(stateB.body.history.length, 0);
  assert.equal(stateB.body.poolSize, 18);

  // Le masterToken de A ne donne aucun droit sur B.
  assert.equal((await app.call('GET', `/api/games/${b.code}/state`, { token: a.masterToken })).status, 403);
  assert.equal((await app.call('POST', `/api/games/${b.code}/next`, { token: a.masterToken })).status, 403);
});

test('rejeter la réclamation d\'un joueur d\'une autre partie est refusé', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const a = await app.createGame();
  const b = await app.createGame();
  const pb = (await join(app, b.code, 'Paul')).body;
  const res = await app.call('DELETE', `/api/games/${a.code}/claims/${pb.playerId}`, { token: a.masterToken });
  assert.equal(res.status, 404);
});

test('valider un bingo désigne le gagnant et termine la partie', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const { code, masterToken } = await app.createGame();
  const marie = (await join(app, code, 'Marie')).body;
  const paul = (await join(app, code, 'Paul')).body;

  await app.call('POST', `/api/players/${marie.playerId}/bingo`, { token: marie.token });
  const valide = await app.call('POST', `/api/games/${code}/claims/${marie.playerId}/validate`, {
    token: masterToken,
  });
  assert.equal(valide.status, 200);
  assert.equal(valide.body.winnerId, marie.playerId);
  assert.equal(valide.body.winnerName, 'Marie');
  assert.equal((await app.call('GET', `/api/games/${code}`)).body.status, 'ended');

  // Chaque joueur compare `winnerId` à son propre id : c'est tout ce qui sépare
  // l'écran de victoire de l'écran de défaite.
  const vueMarie = (await app.call('GET', `/api/players/${marie.playerId}`, { token: marie.token })).body;
  assert.equal(vueMarie.game.status, 'ended');
  assert.equal(vueMarie.game.winnerId, marie.playerId);
  assert.equal(vueMarie.game.winnerName, 'Marie');

  const vuePaul = (await app.call('GET', `/api/players/${paul.playerId}`, { token: paul.token })).body;
  assert.equal(vuePaul.game.winnerId, marie.playerId);
  assert.notEqual(vuePaul.game.winnerId, paul.playerId, 'Paul a perdu');
  assert.equal(vuePaul.game.winnerName, 'Marie');

  const state = (await app.call('GET', `/api/games/${code}/state`, { token: masterToken })).body;
  assert.equal(state.status, 'ended');
  assert.equal(state.winnerId, marie.playerId);
  assert.equal(state.winnerName, 'Marie', 'la console affiche le nom du gagnant');
});

test('une partie terminée par le bouton n\'a pas de gagnant', async (t) => {
  // Fin neutre : ni fête, ni défaite. C'est une troisième fin, pas un cas
  // dégradé de la victoire.
  const app = await startApp();
  t.after(app.close);
  const { code, masterToken } = await app.createGame();
  const marie = (await join(app, code, 'Marie')).body;

  assert.equal((await app.call('POST', `/api/games/${code}/end`, { token: masterToken })).status, 200);

  const vue = (await app.call('GET', `/api/players/${marie.playerId}`, { token: marie.token })).body;
  assert.equal(vue.game.status, 'ended');
  assert.equal(vue.game.winnerId, null);
  assert.equal(vue.game.winnerName, null);

  const state = (await app.call('GET', `/api/games/${code}/state`, { token: masterToken })).body;
  assert.equal(state.winnerId, null);
  assert.equal(state.winnerName, null);
});

test('valider un bingo est réservé au présentateur de cette partie', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const a = await app.createGame();
  const b = await app.createGame();
  const marie = (await join(app, a.code, 'Marie')).body;
  const paul = (await join(app, b.code, 'Paul')).body;

  const chemin = `/api/games/${a.code}/claims/${marie.playerId}/validate`;
  assert.equal((await app.call('POST', chemin)).status, 403, 'sans token');
  assert.equal((await app.call('POST', chemin, { token: marie.token })).status, 403, 'avec le token du joueur');
  assert.equal((await app.call('POST', chemin, { token: b.masterToken })).status, 403, 'avec le token d\'une autre partie');

  // Un joueur d'une autre partie ne peut pas être sacré gagnant ici.
  const etranger = await app.call('POST', `/api/games/${a.code}/claims/${paul.playerId}/validate`, {
    token: a.masterToken,
  });
  assert.equal(etranger.status, 404);
  const fantome = await app.call('POST', `/api/games/${a.code}/claims/inconnu/validate`, { token: a.masterToken });
  assert.equal(fantome.status, 404);

  // Et après tous ces refus, la partie tourne toujours, sans gagnant.
  const state = (await app.call('GET', `/api/games/${a.code}/state`, { token: a.masterToken })).body;
  assert.equal(state.status, 'ready');
  assert.equal(state.winnerId, null);
});

test('une partie ou un joueur inexistant rend 404', async (t) => {
  const app = await startApp();
  t.after(app.close);
  assert.equal((await app.call('GET', '/api/games/ZZZZ')).status, 404);
  assert.equal((await app.call('GET', '/api/players/inconnu')).status, 404);
  assert.equal((await app.call('GET', '/api/nimporte-quoi')).status, 404);
});

test('le code de partie est insensible à la casse', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const { code } = await app.createGame();
  assert.equal((await app.call('GET', `/api/games/${code.toLowerCase()}`)).status, 200);
});

test('on ne rejoint pas une partie en préparation ni une partie terminée', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const created = await app.call('POST', '/api/games', {
    body: { theme: 'test', grid: '4x5', winRule: 'ligne' },
  });
  const { code, masterToken } = created.body;
  // Course volontaire : juste après la création, le statut est `preparing`.
  const tooEarly = await join(app, code, 'Pressé');
  assert.ok([201, 409].includes(tooEarly.status));

  const limite = Date.now() + 30_000;
  while (Date.now() < limite) {
    if ((await app.call('GET', `/api/games/${code}`)).body.status === 'ready') break;
    await new Promise((r) => setTimeout(r, 10));
  }
  await app.call('POST', `/api/games/${code}/end`, { token: masterToken });
  assert.equal((await join(app, code, 'Trop tard')).status, 409);
});

test('un JSON illisible rend 400 et non 500', async (t) => {
  const app = await startApp();
  t.after(app.close);
  const res = await fetch(`${app.base}/api/games`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{ nope',
  });
  assert.equal(res.status, 400);
});

test('un corps qui n\'est pas un objet rend « corps invalide »', async (t) => {
  const app = await startApp();
  t.after(app.close);
  for (const body of [[], 42, 'hello', true, null]) {
    const res = await app.call('POST', '/api/games', { body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(res.body.error, 'corps invalide', JSON.stringify(body));
  }
});

test('un corps trop volumineux rend 413, pas une socket coupée', async (t) => {
  // Détruire la socket sans répondre fait remonter un 502 par le proxy :
  // illisible pour l'appelant, et impossible à distinguer d'un serveur mort.
  const app = await startApp();
  t.after(app.close);
  const { code } = await app.createGame();
  const { playerId, token } = (await join(app, code, 'Marie')).body;

  const res = await app.call('PUT', `/api/players/${playerId}/checks`, {
    body: { checked: new Array(200_000).fill(true) },
    token,
  });
  assert.equal(res.status, 413);
  assert.equal(res.body.error, 'corps trop volumineux');

  // Le serveur est toujours debout et le joueur intact.
  assert.equal((await app.call('GET', '/api/health')).status, 200);
  assert.deepEqual((await app.call('GET', `/api/players/${playerId}`, { token })).body.checked.length, 20);
});

test('un en-tête Host malformé ne tue pas le serveur', async (t) => {
  // Régression : `new URL(req.url, ...Host...)` levait hors du try, ce qui
  // faisait tomber le process — donc toutes les parties en cours d'un coup.
  const app = await startApp();
  t.after(app.close);
  const port = new URL(app.base).port;

  for (const host of ['a b', '', '[', ':::', '%', 'a<b', 'a|b', 'a:99999999']) {
    const reponse = await new Promise((resolve) => {
      const socket = connect(Number(port), '127.0.0.1', () => {
        socket.write(`GET /api/health HTTP/1.1\r\nHost: ${host}\r\nConnection: close\r\n\r\n`);
      });
      let brut = '';
      socket.on('data', (chunk) => (brut += chunk));
      socket.on('close', () => resolve(brut));
      socket.on('error', () => resolve(''));
    });
    assert.match(reponse, /^HTTP\/1\.1 [24]\d\d/, `Host: « ${host} » doit obtenir une réponse`);
    // Et surtout : le serveur répond encore.
    assert.equal((await app.call('GET', '/api/health')).status, 200, `serveur mort après Host « ${host} »`);
  }
});

test('les vidéos injouables sont remplacées, le pool garde sa taille', async (t) => {
  // On casse 6 ids du catalogue de test : la préparation doit les remplacer.
  const themes = fakeThemes(50);
  const broken = new Set(
    themes
      .get('test')
      .bands.slice(0, 6)
      .map((b) => b.tracks[0].youtubeId),
  );
  const app = await startApp({ themes, broken, rng: seeded(3) });
  t.after(app.close);

  const { code, masterToken } = await app.createGame();
  const game = await app.call('GET', `/api/games/${code}`);
  assert.equal(game.body.status, 'ready');
  assert.equal(game.body.poolSize, 40);
  assert.equal(game.body.verified, 40);

  const ids = new Set();
  for (let i = 0; i < 40; i++) {
    const { track } = (await app.call('POST', `/api/games/${code}/next`, { token: masterToken })).body;
    assert.ok(!broken.has(track.youtubeId), `${track.youtubeId} est injouable et ne devait pas rester`);
    ids.add(track.youtubeId);
  }
  assert.equal(ids.size, 40, 'le remplacement n\'introduit pas de doublon');
});
