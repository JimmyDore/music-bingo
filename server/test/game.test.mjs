import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GRID_SIZES,
  cardSignature,
  cleanName,
  drawCard,
  drawPool,
  drawUniqueCard,
  findGridSize,
  poolSize,
  randomCode,
  shuffle,
} from '../game.mjs';
import { fakeThemes, seeded } from './helpers.mjs';

const bands = fakeThemes(60).get('test').bands;

test('le pool fait le double du nombre de cases', () => {
  assert.equal(poolSize(9), 18);
  assert.equal(poolSize(16), 32);
  assert.equal(poolSize(20), 40);
});

test('les trois tailles de grille sont proposées', () => {
  assert.deepEqual(
    GRID_SIZES.map((g) => g.cols * g.rows),
    [9, 16, 20],
  );
  assert.equal(findGridSize('4x5').cols, 4);
  assert.equal(findGridSize('4x5').rows, 5);
  assert.equal(findGridSize('inconnu'), null);
});

test('un groupe ne peut pas passer deux fois dans une partie', () => {
  const pool = drawPool(bands, 40, seeded(1));
  assert.equal(pool.length, 40);
  assert.equal(new Set(pool.map((t) => t.slug)).size, 40);
});

test('un seul titre est tiré par groupe', () => {
  const pool = drawPool(bands, 40, seeded(2));
  for (const entry of pool) {
    const band = bands.find((b) => b.slug === entry.slug);
    assert.ok(band.tracks.some((t) => t.youtubeId === entry.youtubeId));
  }
  assert.equal(new Set(pool.map((t) => t.youtubeId)).size, 40);
});

test('rejouer le même thème ne redonne pas la même bande-son', () => {
  const a = drawPool(bands, 40, seeded(3)).map((t) => t.youtubeId).join();
  const b = drawPool(bands, 40, seeded(9)).map((t) => t.youtubeId).join();
  assert.notEqual(a, b);
});

test('drawPool refuse un catalogue trop petit', () => {
  assert.throws(() => drawPool(bands.slice(0, 10), 40, seeded(4)), /catalogue trop petit/);
});

for (const grid of GRID_SIZES) {
  const cells = grid.cols * grid.rows;
  test(`grille ${grid.id} : ${cells} cases tirées dans le pool`, () => {
    const rng = seeded(cells);
    const pool = drawPool(bands, poolSize(cells), rng);
    const card = drawCard(pool, cells, rng);

    assert.equal(card.length, cells);
    assert.equal(new Set(card.map((c) => c.slug)).size, cells, 'aucun doublon dans la grille');
    const poolSlugs = new Set(pool.map((t) => t.slug));
    for (const cell of card) {
      assert.ok(poolSlugs.has(cell.slug), `${cell.slug} doit venir du pool, sinon la grille est ingagnable`);
    }
  });

  test(`grille ${grid.id} : une case n'expose jamais le titre`, () => {
    const rng = seeded(cells + 100);
    const pool = drawPool(bands, poolSize(cells), rng);
    for (const cell of drawCard(pool, cells, rng)) {
      assert.deepEqual(Object.keys(cell).sort(), ['logo', 'name', 'slug']);
    }
  });
}

test('drawCard refuse un pool trop petit', () => {
  const pool = drawPool(bands, 18, seeded(5));
  assert.throws(() => drawCard(pool, 20, seeded(5)), /pool trop petit/);
});

test('huit joueurs reçoivent huit grilles distinctes', () => {
  const rng = seeded(7);
  const pool = drawPool(bands, 40, rng);
  const signatures = new Set();
  for (let i = 0; i < 8; i++) {
    const card = drawUniqueCard(pool, 20, signatures, rng);
    signatures.add(cardSignature(card));
  }
  assert.equal(signatures.size, 8);
});

test('drawUniqueCard rend une grille même si toutes les signatures sont prises', () => {
  const rng = seeded(8);
  const pool = drawPool(bands, 18, rng);
  // Pool de 9 pour 9 cases : une seule signature possible, déjà prise.
  const only = cardSignature(drawCard(pool.slice(0, 9), 9, rng));
  const card = drawUniqueCard(pool.slice(0, 9), 9, new Set([only]), rng, 5);
  assert.equal(card.length, 9, 'mieux vaut une grille en double qu\'un joueur bloqué');
});

test('shuffle ne perd ni ne duplique d\'élément', () => {
  const items = [1, 2, 3, 4, 5, 6, 7, 8];
  const out = shuffle(items, seeded(11));
  assert.deepEqual([...out].sort((a, b) => a - b), items);
  assert.deepEqual(items, [1, 2, 3, 4, 5, 6, 7, 8], 'la source reste intacte');
});

test('le code de partie évite les caractères ambigus', () => {
  const rng = seeded(12);
  for (let i = 0; i < 300; i++) {
    assert.match(randomCode(rng), /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
  }
});

test('cleanName normalise et borne le prénom', () => {
  assert.equal(cleanName('  Marie   Claire '), 'Marie Claire');
  assert.equal(cleanName(''), null);
  assert.equal(cleanName('   '), null);
  assert.equal(cleanName('x'.repeat(25)), null);
  assert.equal(cleanName(42), null);
});
