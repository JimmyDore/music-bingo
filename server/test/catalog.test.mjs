import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { KINDS, loadCatalog, parseTheme, themeSummaries } from '../catalog.mjs';
import { GRID_SIZES, poolSize } from '../game.mjs';

const CATALOG_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'catalog');

const valid = {
  id: 'demo',
  name: 'Démo',
  bands: [
    {
      slug: 'linkin-park',
      name: 'Linkin Park',
      logo: null,
      tracks: [{ title: 'In the End', youtubeId: 'eVTXPUF4Oz4', startAt: 42 }],
    },
  ],
};

const clone = (mutate) => {
  const copy = structuredClone(valid);
  mutate(copy);
  return JSON.stringify(copy);
};

test('un thème valide se parse', () => {
  const theme = parseTheme(JSON.stringify(valid));
  assert.equal(theme.id, 'demo');
  assert.equal(theme.bands.length, 1);
});

test('un catalogue cassé explose au boot, pas en soirée', () => {
  const cases = [
    ['JSON illisible', '{ nope', /JSON illisible/],
    ['id manquant', clone((c) => delete c.id), /id manquant/],
    ['name manquant', clone((c) => delete c.name), /name manquant/],
    ['bands vide', clone((c) => (c.bands = [])), /bands vide/],
    ['slug avec majuscule', clone((c) => (c.bands[0].slug = 'Linkin-Park')), /slug invalide/],
    ['slug accentué', clone((c) => (c.bands[0].slug = 'noir-désir')), /slug invalide/],
    ['aucun titre', clone((c) => (c.bands[0].tracks = [])), /aucun titre/],
    ['youtubeId trop court', clone((c) => (c.bands[0].tracks[0].youtubeId = 'abc')), /youtubeId invalide/],
    ['startAt à 0', clone((c) => (c.bands[0].tracks[0].startAt = 0)), /startAt invalide/],
    ['startAt négatif', clone((c) => (c.bands[0].tracks[0].startAt = -5)), /startAt invalide/],
    ['logo numérique', clone((c) => (c.bands[0].logo = 3)), /logo invalide/],
    ['kind inventé', clone((c) => (c.kind = 'film')), /kind invalide/],
    ['kind capitalisé', clone((c) => (c.kind = 'Musique')), /kind invalide/],
    ['lexique en tableau', clone((c) => (c.lexique = ['film'])), /lexique invalide/],
    ['clé de lexique inconnue', clone((c) => (c.lexique = { titres: 'répliques' })), /clé inconnue/],
    ['mot de lexique vide', clone((c) => (c.lexique = { case: '  ' })), /lexique.case vide/],
    ['mot de lexique numérique', clone((c) => (c.lexique = { cases: 3 })), /lexique.cases vide/],
    ['alias en chaîne', clone((c) => (c.bands[0].alias = 'Back to the Future')), /alias invalide/],
    ['alias numérique', clone((c) => (c.bands[0].alias = [3])), /alias invalide/],
    ['alias vide', clone((c) => (c.bands[0].alias = ['  '])), /alias invalide/],
  ];
  for (const [label, raw, pattern] of cases) {
    assert.throws(() => parseTheme(raw), pattern, label);
  }
});

test('un thème sans kind ni lexique reste un thème de groupes', () => {
  // C'est la garantie que le thème rock ne bouge pas d'un mot à l'écran.
  const theme = parseTheme(JSON.stringify(valid));
  assert.equal(theme.kind, 'musique');
  assert.deepEqual(theme.lexique, { case: 'groupe', cases: 'groupes', titre: 'titre' });
});

test('les trois genres de thème sont acceptés', () => {
  for (const kind of KINDS) {
    assert.equal(parseTheme(clone((c) => (c.kind = kind))).kind, kind);
  }
});

test('un lexique partiel est complété côté serveur, jamais côté front', () => {
  const theme = parseTheme(
    clone((c) => {
      c.kind = 'replique';
      c.lexique = { case: 'film', cases: 'films' };
    }),
  );
  assert.equal(theme.kind, 'replique');
  assert.deepEqual(theme.lexique, { case: 'film', cases: 'films', titre: 'titre' });
});

test('les alias sont validés au boot, pas seulement en CI', () => {
  // `tools/verify-catalog.mjs` s'en sert pour les thèmes « musiques de films ».
  // Un champ que la CI contrôle et que le serveur ignore, c'est une faute de
  // frappe qui passe.
  const avec = parseTheme(clone((c) => (c.bands[0].alias = ['Back to the Future'])));
  assert.deepEqual(avec.bands[0].alias, ['Back to the Future']);
  // `null` vaut absence, par symétrie avec `logo` et avec le script.
  assert.equal(parseTheme(clone((c) => (c.bands[0].alias = null))).bands[0].alias, null);
  assert.deepEqual(parseTheme(clone((c) => (c.bands[0].alias = []))).bands[0].alias, []);
});

test('un slug en double est refusé', () => {
  const raw = clone((c) => c.bands.push(structuredClone(c.bands[0])));
  assert.throws(() => parseTheme(raw), /slug en double/);
});

test('le catalogue livré se charge et tient les trois tailles de grille', () => {
  const themes = loadCatalog(CATALOG_DIR);
  assert.ok(themes.size >= 1, 'au moins un thème');

  const biggest = Math.max(...GRID_SIZES.map((g) => poolSize(g.cols * g.rows)));
  for (const theme of themes.values()) {
    assert.ok(KINDS.includes(theme.kind), `${theme.id} : kind « ${theme.kind} » inconnu`);
    assert.equal(typeof theme.lexique.cases, 'string', `${theme.id} : lexique non résolu`);
    assert.ok(
      theme.bands.length >= biggest,
      `${theme.id} : ${theme.bands.length} groupes, il en faut ${biggest} pour une grille 4×5`,
    );
    // Trois titres par entrée, sauf si le thème a déclaré un plancher plus bas —
    // cf. `titresMin` dans tools/verify-catalog.mjs. Le plafond, lui, ne bouge
    // pas : une quatrième piste ne serait jamais tirée par personne.
    const min = theme.titresMin ?? 3;
    for (const band of theme.bands) {
      assert.ok(
        band.tracks.length >= min && band.tracks.length <= 3,
        `${band.slug} : ${band.tracks.length} titres, attendu ${min} à 3`,
      );
    }
  }
});

test('le catalogue livré n\'a aucun youtubeId en double', () => {
  for (const theme of loadCatalog(CATALOG_DIR).values()) {
    const seen = new Map();
    for (const band of theme.bands) {
      for (const track of band.tracks) {
        assert.equal(
          seen.get(track.youtubeId),
          undefined,
          `${track.youtubeId} : ${band.slug}/${track.title} et ${seen.get(track.youtubeId)}`,
        );
        seen.set(track.youtubeId, `${band.slug}/${track.title}`);
      }
    }
  }
});

test('themeSummaries expose de quoi peupler le sélecteur', () => {
  const summaries = themeSummaries(new Map([['demo', valid]]));
  assert.deepEqual(summaries, [
    {
      id: 'demo',
      name: 'Démo',
      bands: 1,
      kind: 'musique',
      lexique: { case: 'groupe', cases: 'groupes', titre: 'titre' },
    },
  ]);
});

test('themeSummaries porte le mot qui compte le sélecteur : « 42 films »', () => {
  const films = parseTheme(
    JSON.stringify({ ...valid, kind: 'replique', lexique: { case: 'film', cases: 'films' } }),
  );
  const [resume] = themeSummaries(new Map([['films', films]]));
  assert.equal(`${resume.bands} ${resume.lexique.cases}`, '1 films');
});
