import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { KINDS, bornesDuree, loadCatalog, parseTheme, themeSummaries } from '../catalog.mjs';
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
    // Sous 5 secondes, la marge de lecture dérivée (`dureeMin - 1`) ne protège
    // plus rien, et un extrait de 4 secondes n'est pas un générique.
    ['dureeMin à 0', clone((c) => (c.dureeMin = 0)), /dureeMin invalide/],
    ['dureeMin sous le plancher', clone((c) => (c.dureeMin = 4)), /dureeMin invalide/],
    ['dureeMin négatif', clone((c) => (c.dureeMin = -1)), /dureeMin invalide/],
    ['dureeMin décimal', clone((c) => (c.dureeMin = 1.5)), /dureeMin invalide/],
    ['dureeMin en chaîne', clone((c) => (c.dureeMin = '30')), /dureeMin invalide/],
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

test('tous les genres de thème déclarés sont acceptés', () => {
  for (const kind of KINDS) {
    assert.equal(parseTheme(clone((c) => (c.kind = kind))).kind, kind);
  }
});

test('le genre « generique » existe, et c\'est lui qui donne le bouton Rejouer', () => {
  // Un générique de quinze secondes passe, la salle lève la tête, c'est fini :
  // sans le bouton « ↺ Rejouer » il n'existe aucun moyen de le repasser, le
  // Play/Pause ne rembobinant pas. C'est `kind` qui le déclenche côté console
  // (`src/screens/Presentateur.tsx`), d'où une quatrième valeur plutôt que de
  // déclarer `kind: "replique"` — ce serait mettre une donnée fausse dans le
  // catalogue pour obtenir un comportement d'interface.
  assert.ok(KINDS.includes('generique'), 'KINDS doit connaître le genre generique');
  const theme = parseTheme(
    clone((c) => {
      c.kind = 'generique';
      c.lexique = { case: 'générique', cases: 'génériques', titre: 'générique' };
    }),
  );
  assert.equal(theme.kind, 'generique');
  assert.deepEqual(theme.lexique, { case: 'générique', cases: 'génériques', titre: 'générique' });
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

test('un dureeMin valide est conservé jusqu\'au vérificateur', () => {
  // Le serveur n'en fait rien : c'est `tools/verify-catalog.mjs` qui le lit. Il
  // doit donc survivre au parse, sinon le réglage n'existe que sur le papier.
  assert.equal(parseTheme(clone((c) => (c.dureeMin = 10))).dureeMin, 10);
  assert.equal(parseTheme(clone((c) => (c.dureeMin = 5))).dureeMin, 5);
  // `null` vaut absence, par symétrie avec `logo`, `alias` et `vuesMin`.
  assert.equal(parseTheme(clone((c) => (c.dureeMin = null))).dureeMin, null);
  assert.equal(parseTheme(JSON.stringify(valid)).dureeMin, undefined);
});

test('bornesDuree : sans dureeMin, les cinq thèmes livrés ne bougent pas d\'un pouce', () => {
  // C'est LE test de non-régression du plancher de durée par thème. L'ancien
  // vérificateur appliquait `duree < 90` et `startAt > duree - 30` ; le nouveau
  // applique `duree < dureeMin` et `duree - startAt < resteMin`. Sur un thème
  // qui ne déclare rien, les deux couples sont arithmétiquement identiques —
  // `duree - startAt < 30` ⟺ `startAt > duree - 30`. Ce test énonce la
  // contrainte au lieu de la laisser reposer sur une relecture.
  assert.deepEqual(bornesDuree({}), { dureeMin: 90, resteMin: 30 });
  assert.deepEqual(bornesDuree(), { dureeMin: 90, resteMin: 30 });
  assert.deepEqual(bornesDuree(null), { dureeMin: 90, resteMin: 30 });
  assert.deepEqual(bornesDuree(parseTheme(JSON.stringify(valid))), { dureeMin: 90, resteMin: 30 });
});

test('bornesDuree : un plancher bas fait dériver la marge de lecture', () => {
  // Les deux bornes ne peuvent pas être réglées séparément : sur une vidéo de
  // 15 s, exiger 30 s de lecture après `startAt` est impossible, alors qu'un
  // `startAt` strictement positif est obligatoire. À 10 s de plancher, un
  // générique de 15 s accepte un startAt jusqu'à 6, un de 10 s impose 1.
  assert.deepEqual(bornesDuree({ dureeMin: 10 }), { dureeMin: 10, resteMin: 9 });
  assert.deepEqual(bornesDuree({ dureeMin: 5 }), { dureeMin: 5, resteMin: 4 });
  // Le plafond de marge ne bouge pas : un thème exigeant ne réclame pas plus de
  // 30 s de lecture qu'un thème ordinaire.
  assert.deepEqual(bornesDuree({ dureeMin: 200 }), { dureeMin: 200, resteMin: 30 });
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
