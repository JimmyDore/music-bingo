#!/usr/bin/env node
// Génère `public/apple-touch-icon.png` (iOS n'accepte pas le SVG pour l'icône
// « Ajouter à l'écran d'accueil » : sans PNG, il fabrique une capture blanche).
//
// Encodeur PNG maison : zéro dépendance, comme le reste du projet.
//   node tools/make-icons.mjs

import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

const TAILLE = 180;
const NUIT = [0x0d, 0x07, 0x16];
const CARTE = [0x1d, 0x15, 0x39];
const BORD = [0x3b, 0x2d, 0x67];
const STABILO = [0xff, 0xd8, 0x3d];
const NEON = [0xff, 0x2e, 0x88];

// Un carton de bingo : 3 × 3, quatre cases tamponnées au stabilo.
const COCHEES = new Set([0, 2, 4, 6]);

const pixels = Buffer.alloc(TAILLE * TAILLE * 3);
const poser = (x, y, [r, v, b]) => {
  const i = (y * TAILLE + x) * 3;
  pixels[i] = r;
  pixels[i + 1] = v;
  pixels[i + 2] = b;
};

/** Distance au bord d'un rectangle à coins arrondis (négatif = dedans). */
function dansArrondi(x, y, x0, y0, larg, haut, rayon) {
  const dx = Math.max(x0 + rayon - x, 0, x - (x0 + larg - 1 - rayon));
  const dy = Math.max(y0 + rayon - y, 0, y - (y0 + haut - 1 - rayon));
  return Math.hypot(dx, dy) - rayon;
}

for (let y = 0; y < TAILLE; y++) {
  for (let x = 0; x < TAILLE; x++) {
    // Fond nuit avec un halo néon en haut, comme la page.
    const halo = Math.max(0, 1 - Math.hypot(x - TAILLE / 2, y + 30) / 150);
    poser(x, y, NUIT.map((c, i) => Math.round(c + (NEON[i] - c) * halo * 0.28)));
  }
}

const MARGE = 18;
const ECART = 6;
const COTE = Math.floor((TAILLE - MARGE * 2 - ECART * 2) / 3);

for (let ligne = 0; ligne < 3; ligne++) {
  for (let col = 0; col < 3; col++) {
    const index = ligne * 3 + col;
    const x0 = MARGE + col * (COTE + ECART);
    const y0 = MARGE + ligne * (COTE + ECART);
    const cochee = COCHEES.has(index);
    for (let y = y0 - 2; y < y0 + COTE + 2; y++) {
      for (let x = x0 - 2; x < x0 + COTE + 2; x++) {
        if (x < 0 || y < 0 || x >= TAILLE || y >= TAILLE) continue;
        const d = dansArrondi(x, y, x0, y0, COTE, COTE, 9);
        if (d > 0.5) continue;
        if (d > -2.5) poser(x, y, cochee ? STABILO : BORD);
        else poser(x, y, cochee ? STABILO : CARTE);
      }
    }
  }
}

// --- encodage PNG ---------------------------------------------------------

const TABLE_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const octet of buf) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(data.length);
  const corps = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corps));
  return Buffer.concat([longueur, corps, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(TAILLE, 0);
ihdr.writeUInt32BE(TAILLE, 4);
ihdr[8] = 8; // 8 bits par canal
ihdr[9] = 2; // couleur vraie (RGB)

// Chaque ligne est préfixée de son octet de filtre (0 = aucun).
const brut = Buffer.alloc(TAILLE * (TAILLE * 3 + 1));
for (let y = 0; y < TAILLE; y++) {
  brut[y * (TAILLE * 3 + 1)] = 0;
  pixels.copy(brut, y * (TAILLE * 3 + 1) + 1, y * TAILLE * 3, (y + 1) * TAILLE * 3);
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(brut, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

writeFileSync('public/apple-touch-icon.png', png);
console.log(`public/apple-touch-icon.png — ${TAILLE}×${TAILLE}, ${png.length} octets`);
