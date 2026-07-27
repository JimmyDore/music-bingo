import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadCatalog, parseTheme, themeSummaries } from '../catalog.mjs';
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
  ];
  for (const [label, raw, pattern] of cases) {
    assert.throws(() => parseTheme(raw), pattern, label);
  }
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
    assert.ok(
      theme.bands.length >= biggest,
      `${theme.id} : ${theme.bands.length} groupes, il en faut ${biggest} pour une grille 4×5`,
    );
    for (const band of theme.bands) {
      assert.equal(band.tracks.length, 3, `${band.slug} doit avoir 3 titres`);
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
  assert.deepEqual(summaries, [{ id: 'demo', name: 'Démo', bands: 1 }]);
});
