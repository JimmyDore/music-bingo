#!/usr/bin/env node
// Vérificateur du catalogue — câblé dans la CI.
//
// Le catalogue pourrira avec le temps : une chaîne ferme, un clip est retiré,
// un label reprend un titre. Mieux vaut l'apprendre par un job rouge que
// pendant une soirée.
//
// Usage :
//   node tools/verify-catalog.mjs                  # structure + oEmbed
//   node tools/verify-catalog.mjs --durations      # + durée via yt-dlp (lent)
//   node tools/verify-catalog.mjs catalog/x.json   # un seul fichier

import { execFile } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

const CONCURRENCE = 6;
const DUREE_MIN = 90;
const DUREE_MAX = 480;
const TITRES_PAR_GROUPE = 3;

// Un mot de cette liste dans le titre de la vidéo = ce n'est pas la version
// studio originale. Recherche par mot entier : « Alive » de Pearl Jam ne doit
// pas être pris pour un live.
const INTERDITS = [
  'live', 'en concert', 'concert', 'unplugged', 'acoustic', 'acoustique',
  'cover', 'reprise', 'remix', 'rmx', 'mashup', 'karaoke', 'karaoké',
  '8 bit', '8bit', 'instrumental', 'sped up', 'slowed', 'reverb',
  'demo', 'rehearsal', 'session', 'sessions', 'taylors version', 'rerecorded',
  'tribute', 'parody', 'parodie', 'reaction', 'lyrics video', 'fan made',
];

const args = process.argv.slice(2);
const avecDurees = args.includes('--durations');
const fichiers = args.filter((a) => !a.startsWith('--'));

// ------------------------------------------------------------ normalisation

/** Minuscules, sans accents, sans ponctuation : « Ça (C'est vraiment toi) »
 *  et « Ca c est vraiment toi » doivent se reconnaître. */
function aplatir(texte) {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Même normalisation mais en gardant des espaces, pour chercher des mots entiers. */
function enMots(texte) {
  return ` ${texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

function contientMot(motsTexte, expression) {
  return motsTexte.includes(` ${expression} `);
}

// -------------------------------------------------------------------- oEmbed

async function oembed(id, essais = 3) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
  for (let i = 0; i < essais; i++) {
    try {
      const res = await fetch(url);
      if (res.status === 200) {
        const body = await res.json();
        return { code: 200, title: body.title ?? '', author: body.author_name ?? '' };
      }
      // 400/401/404 = verdict ferme de YouTube, inutile de réessayer.
      if (res.status < 500 && res.status !== 429) return { code: res.status, title: '', author: '' };
    } catch {
      /* réseau : on retente */
    }
    await new Promise((r) => setTimeout(r, 400 * (i + 1)));
  }
  return { code: 0, title: '', author: '', reseau: true };
}

async function duree(id) {
  try {
    const { stdout } = await run(
      'yt-dlp',
      [`https://www.youtube.com/watch?v=${id}`, '--print', '%(duration)s', '--skip-download', '--no-warnings'],
      { timeout: 90_000 },
    );
    const d = Number(stdout.trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

// ----------------------------------------------------------------- contrôles

/** Le groupe annoncé doit apparaître dans le titre de la vidéo ou dans le nom
 *  de la chaîne. Sinon l'id pointe ailleurs. */
function groupeReconnu(nomGroupe, titreVideo, chaine) {
  const cible = `${aplatir(titreVideo)}|${aplatir(chaine)}`;
  const candidats = new Set([aplatir(nomGroupe)]);
  const sansThe = aplatir(nomGroupe).replace(/^the/, '');
  if (sansThe.length >= 3) candidats.add(sansThe);
  return [...candidats].some((c) => c.length > 0 && cible.includes(c));
}

function titreReconnu(titreMorceau, titreVideo) {
  return aplatir(titreVideo).includes(aplatir(titreMorceau));
}

/** Cherche un marqueur de « ce n'est pas la version studio » dans le titre de
 *  la vidéo, après en avoir retiré le nom du groupe et celui du morceau : « I
 *  Just Wanna Live » de Good Charlotte n'est pas une captation live. */
function motInterdit(titreVideo, titreMorceau, nomGroupe) {
  let mots = enMots(titreVideo);
  for (const propre of [enMots(titreMorceau), enMots(nomGroupe)]) {
    if (propre.trim().length > 0) mots = mots.split(propre).join(' ');
  }
  return INTERDITS.find((interdit) => contientMot(mots, interdit)) ?? null;
}

// -------------------------------------------------------------------- rapport

const erreurs = [];
const alertes = [];
const echec = (msg) => erreurs.push(msg);

function chargerThemes() {
  if (fichiers.length > 0) return fichiers;
  return readdirSync('catalog')
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .sort()
    .map((f) => join('catalog', f));
}

async function enParallele(items, taille, tache) {
  const resultats = new Array(items.length);
  let curseur = 0;
  await Promise.all(
    Array.from({ length: Math.min(taille, items.length) }, async () => {
      while (curseur < items.length) {
        const i = curseur++;
        resultats[i] = await tache(items[i], i);
      }
    }),
  );
  return resultats;
}

// ------------------------------------------------------------------ programme

const chemins = chargerThemes();
if (chemins.length === 0) {
  console.error('Aucun fichier de thème trouvé dans catalog/');
  process.exit(1);
}

let totalTitres = 0;
let totalOk = 0;
let pannesReseau = 0;

for (const chemin of chemins) {
  console.log(`\n=== ${chemin} ===`);
  const theme = JSON.parse(readFileSync(chemin, 'utf8'));

  // --- contrôles de structure, sans réseau -------------------------------
  const slugs = new Set();
  const idsVus = new Map();
  const entrees = [];

  for (const band of theme.bands ?? []) {
    if (slugs.has(band.slug)) echec(`slug en double : ${band.slug}`);
    slugs.add(band.slug);
    if (!/^[a-z0-9-]+$/.test(band.slug)) echec(`slug non conforme : ${band.slug}`);
    if (band.logo !== null && typeof band.logo !== 'string') echec(`logo invalide : ${band.slug}`);

    if (band.tracks?.length !== TITRES_PAR_GROUPE) {
      echec(`${band.slug} : ${band.tracks?.length ?? 0} titres au lieu de ${TITRES_PAR_GROUPE}`);
    }
    for (const track of band.tracks ?? []) {
      if (!Number.isInteger(track.startAt) || track.startAt <= 0) {
        echec(`${band.slug} / ${track.title} : startAt = ${track.startAt} (jamais 0)`);
      }
      if (!/^[\w-]{11}$/.test(track.youtubeId ?? '')) {
        echec(`${band.slug} / ${track.title} : youtubeId malformé (${track.youtubeId})`);
        continue;
      }
      const vu = idsVus.get(track.youtubeId);
      if (vu) echec(`id en double ${track.youtubeId} : ${vu} et ${band.slug}/${track.title}`);
      else idsVus.set(track.youtubeId, `${band.slug}/${track.title}`);
      entrees.push({ band, track });
    }
  }

  console.log(`${theme.bands?.length ?? 0} groupes · ${entrees.length} titres · sonde en cours…`);
  totalTitres += entrees.length;

  // --- contrôles réseau ---------------------------------------------------
  const resultats = await enParallele(entrees, CONCURRENCE, async ({ band, track }) => {
    const emb = await oembed(track.youtubeId);
    const d = avecDurees ? await duree(track.youtubeId) : null;
    return { band, track, emb, duree: d };
  });

  for (const { band, track, emb, duree: d } of resultats) {
    const ref = `${band.name} — ${track.title} (${track.youtubeId})`;

    if (emb.reseau) {
      pannesReseau++;
      echec(`${ref} : sonde injoignable après plusieurs essais (réseau ?)`);
      continue;
    }
    if (emb.code !== 200) {
      echec(`${ref} : oEmbed ${emb.code} — non embarquable`);
      continue;
    }
    if (!groupeReconnu(band.name, emb.title, emb.author)) {
      echec(`${ref} : la vidéo ne mentionne pas le groupe — « ${emb.title} » / chaîne « ${emb.author} »`);
      continue;
    }
    if (!titreReconnu(track.title, emb.title)) {
      echec(`${ref} : le titre ne correspond pas — vidéo « ${emb.title} »`);
      continue;
    }
    const interdit = motInterdit(emb.title, track.title, band.name);
    if (interdit) {
      echec(`${ref} : « ${interdit} » dans le titre de la vidéo — « ${emb.title} »`);
      continue;
    }
    if (d !== null) {
      if (d < DUREE_MIN || d > DUREE_MAX) {
        echec(`${ref} : durée ${d}s hors plage ${DUREE_MIN}-${DUREE_MAX}s`);
        continue;
      }
      if (track.startAt > d - 30) {
        echec(`${ref} : startAt ${track.startAt}s trop proche de la fin (durée ${d}s)`);
        continue;
      }
    }
    totalOk++;
  }
}

console.log('\n--------------------------------------------------');
console.log(`${totalOk}/${totalTitres} titres valides`);
if (alertes.length > 0) {
  console.log(`\n${alertes.length} alerte(s) :`);
  for (const a of alertes) console.log(`  ~ ${a}`);
}
if (erreurs.length > 0) {
  console.log(`\n${erreurs.length} erreur(s) :`);
  for (const e of erreurs) console.log(`  ✗ ${e}`);
  if (pannesReseau > 0) {
    console.log('\nDes sondes sont restées injoignables : vérifie la connectivité avant de conclure.');
  }
  process.exit(1);
}
console.log('Catalogue conforme : zéro doublon, zéro startAt nul, tout est embarquable.');
