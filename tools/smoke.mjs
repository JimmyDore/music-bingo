#!/usr/bin/env node
// Joue une partie complète contre une instance réelle, et vérifie chaque étape.
// Sert à prouver qu'un déploiement est vivant — pas seulement que le port répond.
//
//   node tools/smoke.mjs                            # local (http://localhost:8080)
//   node tools/smoke.mjs https://bingo.jimmydore.fr # production

const BASE = (process.argv[2] ?? 'http://localhost:8080').replace(/\/+$/, '');

let echecs = 0;
let etapes = 0;

function verifier(condition, libelle, detail = '') {
  etapes++;
  if (condition) {
    console.log(`  ✓ ${libelle}`);
  } else {
    echecs++;
    console.log(`  ✗ ${libelle}${detail ? ` — ${detail}` : ''}`);
  }
}

async function appel(methode, chemin, { body, token } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(BASE + chemin, {
    method: methode,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const texte = await res.text();
  let payload = null;
  try {
    payload = texte ? JSON.parse(texte) : null;
  } catch {
    payload = { brut: texte.slice(0, 200) };
  }
  return { status: res.status, body: payload };
}

console.log(`\nPartie de bout en bout sur ${BASE}\n`);

// --- 1. le service répond -----------------------------------------------
console.log('1. Service');
const racine = await fetch(BASE + '/');
verifier(racine.status === 200, `GET / → ${racine.status}`);
const html = await racine.text();
verifier(html.includes('<div id="root">'), 'la SPA est servie');

const sante = await appel('GET', '/api/health');
verifier(sante.status === 200 && sante.body?.ok === true, `GET /api/health → ${sante.status} ${JSON.stringify(sante.body)}`);

const refs = await appel('GET', '/api/themes');
verifier(refs.status === 200 && refs.body.themes.length >= 1, `${refs.body?.themes?.length ?? 0} thème(s) chargé(s)`);
verifier(
  (refs.body?.themes?.[0]?.bands ?? 0) >= 40,
  `${refs.body?.themes?.[0]?.bands ?? 0} groupes au catalogue (40 minimum pour une grille 4×5)`,
);

// --- 2. création --------------------------------------------------------
console.log('\n2. Création de la partie');
const creation = await appel('POST', '/api/games', {
  body: { theme: refs.body.themes[0].id, grid: '4x5', winRule: 'carton-plein' },
});
verifier(creation.status === 201, `POST /api/games → ${creation.status}`, JSON.stringify(creation.body));
if (creation.status !== 201) process.exit(1);
const { code, masterToken } = creation.body;
console.log(`     code de partie : ${code}`);

const debut = Date.now();
let partie;
for (;;) {
  partie = (await appel('GET', `/api/games/${code}`)).body;
  if (partie.status === 'ready' || Date.now() - debut > 180_000) break;
  await new Promise((r) => setTimeout(r, 1000));
}
verifier(partie.status === 'ready', `vérification des vidéos terminée (${Math.round((Date.now() - debut) / 1000)}s)`);
verifier(partie.poolSize === 40, `pool de ${partie.poolSize} titres (2 × 20 cases)`);
verifier(partie.verified === 40, `${partie.verified}/40 vidéos vérifiées`);

// --- 3. trois joueurs ----------------------------------------------------
console.log('\n3. Trois joueurs rejoignent');
const joueurs = [];
for (const nom of ['Marie', 'Paul', 'Marie']) {
  const res = await appel('POST', `/api/games/${code}/players`, { body: { name: nom } });
  verifier(res.status === 201, `${nom} rejoint → ${res.status}`, JSON.stringify(res.body));
  if (res.status === 201) joueurs.push({ nom, ...res.body });
}
verifier(joueurs.length === 3, '3 joueurs inscrits');
verifier(
  joueurs.every((j) => j.card.length === 20),
  'chaque grille fait 20 cases',
);
const signatures = new Set(joueurs.map((j) => j.card.map((c) => c.slug).sort().join(',')));
verifier(signatures.size === 3, `${signatures.size}/3 grilles distinctes`);
verifier(
  new Set(joueurs.map((j) => j.playerId)).size === 3,
  'les deux « Marie » restent distinguables',
);
verifier(
  joueurs.every((j) => new Set(j.card.map((c) => c.slug)).size === 20),
  'aucun groupe en double dans une grille',
);

// --- 4. dix titres -------------------------------------------------------
console.log('\n4. Dix titres joués');
const passes = [];
for (let i = 0; i < 10; i++) {
  const res = await appel('POST', `/api/games/${code}/next`, { token: masterToken });
  if (res.status !== 200 || !res.body.track) {
    verifier(false, `titre ${i + 1}`, JSON.stringify(res.body));
    break;
  }
  passes.push(res.body.track);
}
verifier(passes.length === 10, `${passes.length}/10 titres joués`);
verifier(new Set(passes.map((t) => t.youtubeId)).size === 10, 'aucun titre rejoué');
verifier(new Set(passes.map((t) => t.slug)).size === 10, 'aucun groupe ne passe deux fois');
verifier(
  passes.every((t) => t.startAt > 0),
  'aucun startAt à 0',
);
console.log(`     ex. : ${passes[0].name} — ${passes[0].title} (départ ${passes[0].startAt}s)`);

// --- 5. cochage ----------------------------------------------------------
console.log('\n5. Cochage');
const marie = joueurs[0];
const passesSlugs = new Set(passes.map((t) => t.slug));
const cochesMarie = marie.card.map((c) => passesSlugs.has(c.slug));
const posees = cochesMarie.filter(Boolean).length;
const majSuccess = await appel('PUT', `/api/players/${marie.playerId}/checks`, {
  body: { checked: cochesMarie },
  token: marie.token,
});
verifier(majSuccess.status === 200, `${posees} case(s) cochée(s) → ${majSuccess.status}`);

const relecture = await appel('GET', `/api/players/${marie.playerId}`, { token: marie.token });
verifier(
  JSON.stringify(relecture.body.card) === JSON.stringify(marie.card),
  'un refresh restitue la même grille',
);
verifier(
  JSON.stringify(relecture.body.checked) === JSON.stringify(cochesMarie),
  'un refresh restitue les mêmes coches',
);

// Sécurité : Paul bricole l'URL avec l'id de Marie.
const vol = await appel('GET', `/api/players/${marie.playerId}`, { token: joueurs[1].token });
verifier(vol.status === 403, `un joueur ne lit pas la grille d'un autre → ${vol.status}`);
const pilotage = await appel('POST', `/api/games/${code}/next`, { token: joueurs[1].token });
verifier(pilotage.status === 403, `un joueur ne pilote pas la lecture → ${pilotage.status}`);

// --- 6. bingo, arbitrage -------------------------------------------------
console.log('\n6. Bingo et arbitrage');
const tricheur = joueurs[2];
await appel('PUT', `/api/players/${tricheur.playerId}/checks`, {
  body: { checked: new Array(20).fill(true) },
  token: tricheur.token,
});
const cri = await appel('POST', `/api/players/${tricheur.playerId}/bingo`, { token: tricheur.token });
verifier(cri.status === 200, `${tricheur.nom} crie BINGO → ${cri.status}`);

let etat = await appel('GET', `/api/games/${code}/state`, { token: masterToken });
verifier(etat.status === 200, `le présentateur voit l'état → ${etat.status}`);
verifier(etat.body.players.length === 3, `${etat.body.players.length} joueurs listés avec leur compte`);
verifier(etat.body.history.length === 10, `historique de ${etat.body.history.length} titres pour arbitrer`);
const reclamant = etat.body.players.find((p) => p.id === tricheur.playerId);
verifier(reclamant?.bingoClaimedAt != null, 'la réclamation remonte à la console');
verifier(reclamant?.checkedCount === 20, `${reclamant?.checkedCount}/20 cases cochées, visibles à l'arbitrage`);
const jamaisPasses = reclamant.card.filter((c, i) => reclamant.checked[i] && !passesSlugs.has(c.slug)).length;
verifier(jamaisPasses > 0, `${jamaisPasses} case(s) cochée(s) sans que le groupe soit passé — la triche se voit`);

const rejet = await appel('DELETE', `/api/games/${code}/claims/${tricheur.playerId}`, { token: masterToken });
verifier(rejet.status === 200, `le présentateur rejette → ${rejet.status}`);
etat = await appel('GET', `/api/games/${code}/state`, { token: masterToken });
verifier(
  etat.body.players.find((p) => p.id === tricheur.playerId)?.bingoClaimedAt === null,
  'la réclamation est levée',
);
verifier(etat.body.status === 'ready', 'la partie continue après un rejet');

const vraiBingo = await appel('POST', `/api/players/${marie.playerId}/bingo`, { token: marie.token });
verifier(vraiBingo.status === 200, `${marie.nom} crie BINGO à son tour → ${vraiBingo.status}`);

// --- 7. fin de partie ----------------------------------------------------
console.log('\n7. Fin de partie');
const fin = await appel('POST', `/api/games/${code}/end`, { token: masterToken });
verifier(fin.status === 200, `POST /end → ${fin.status}`);
const apres = await appel('GET', `/api/games/${code}`);
verifier(apres.body.status === 'ended', `statut final : ${apres.body.status}`);
const tropTard = await appel('POST', `/api/games/${code}/players`, { body: { name: 'Retardataire' } });
verifier(tropTard.status === 409, `on ne rejoint plus une partie terminée → ${tropTard.status}`);

// --- verdict -------------------------------------------------------------
console.log('\n--------------------------------------------------');
console.log(`${etapes - echecs}/${etapes} vérifications passées sur ${BASE}`);
if (echecs > 0) {
  console.log(`${echecs} ÉCHEC(S)`);
  process.exit(1);
}
console.log(`Partie ${code} jouée de bout en bout. Tout est vert.`);
