#!/usr/bin/env node
// Vérificateur du catalogue — câblé dans la CI.
//
// Le catalogue pourrira avec le temps : une chaîne ferme, un clip est retiré,
// un label re-livre son catalogue. Mieux vaut l'apprendre par un job rouge que
// pendant une soirée.
//
// Usage :
//   node tools/verify-catalog.mjs                  # structure + oEmbed
//   node tools/verify-catalog.mjs --durations      # + yt-dlp : durée, album,
//                                                  #   embarquabilité réelle
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

// Marqueurs qui disqualifient : ce n'est pas la version studio originale.
// Recherche par mot entier, après retrait du nom du groupe et du morceau —
// « Alive » de Pearl Jam n'est pas un live, « I Just Wanna Live » non plus.
const INTERDITS = [
  'live', 'en concert', 'concert', 'unplugged', 'acoustic', 'acoustique',
  'cover', 'reprise', 'remix', 'rmx', 'mashup', 'karaoke', 'karaoké',
  '8 bit', '8bit', 'instrumental', 'sped up', 'slowed', 'reverb',
  'demo', 'rehearsal', 'session', 'sessions', 'taylors version', 'rerecorded',
  'tribute', 'parody', 'parodie', 'reaction', 'fan made',
  // Lieux de captation : un Art Track live ne dit jamais « live » dans son
  // titre, mais son album le trahit (cf. le piège Mass Hysteria/Hellfest).
  'hellfest', 'olympia', 'zenith', 'zénith', 'bercy', 'wacken', 'donington',
  'en public', 'festival', 'tour',
];

// Marqueurs qui méritent un coup d'œil sans condamner : ce sont des versions
// alternatives du même enregistrement studio, souvent le seul upload officiel
// disponible. On les signale, on ne casse pas la CI pour autant.
const SUSPECTS = [
  'lyric video', 'lyric', 'lyrics', 'remaster', 'remastered', 'radio version',
  'radio edit', 'single version', 'international version', 'clean version',
  'album version', 'edit', 'audio',
];

const args = process.argv.slice(2);
const avecDurees = args.includes('--durations');
const fichiers = args.filter((a) => !a.startsWith('--'));

// ------------------------------------------------------------ normalisation

/** Minuscules, sans accents, sans ponctuation : « Ça (C'est vraiment toi) »
 *  et « Ca c est vraiment toi » doivent se reconnaître. */
function aplatir(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Même normalisation mais en gardant des espaces, pour chercher des mots entiers. */
function enMots(texte) {
  return ` ${String(texte ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;
}

const contientMot = (motsTexte, expression) => motsTexte.includes(` ${expression} `);

// -------------------------------------------------------------------- sondes

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

const CHAMPS = '%(duration)s|%(album)s|%(release_year)s|%(playable_in_embed)s|%(age_limit)s|%(availability)s|%(live_status)s';

/** Métadonnées yt-dlp. Rend `null` en cas d'échec — que l'appelant DOIT
 *  traiter comme une erreur, jamais comme un contrôle réussi. */
async function metadonnees(id, essais = 2) {
  for (let i = 0; i < essais; i++) {
    try {
      const { stdout } = await run(
        'yt-dlp',
        [`https://www.youtube.com/watch?v=${id}`, '--print', CHAMPS, '--skip-download', '--no-warnings'],
        { timeout: 90_000 },
      );
      const [duree, album, annee, embed, age, dispo, direct] = stdout.trim().split('|');
      const d = Number(duree);
      if (!Number.isFinite(d)) return null;
      const na = (v) => (v === 'NA' || v === undefined ? null : v);
      return {
        duree: d,
        album: na(album),
        annee: na(annee),
        embarquable: embed !== 'False',
        ageLimite: Number(age) || 0,
        disponibilite: na(dispo),
        direct: na(direct),
      };
    } catch {
      /* throttling, réseau : on retente une fois */
    }
  }
  return null;
}

async function ytDlpPresent() {
  try {
    await run('yt-dlp', ['--version'], { timeout: 15_000 });
    return true;
  } catch {
    return false;
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

const titreReconnu = (titreMorceau, titreVideo) => aplatir(titreVideo).includes(aplatir(titreMorceau));

/** Cherche un marqueur dans le titre, après retrait du nom du groupe et du
 *  morceau : « I Just Wanna Live » de Good Charlotte n'est pas un live. */
function marqueur(liste, titreVideo, titreMorceau, nomGroupe) {
  let mots = enMots(titreVideo);
  for (const propre of [enMots(titreMorceau), enMots(nomGroupe)]) {
    if (propre.trim().length > 0) mots = mots.split(propre).join(' ');
  }
  return liste.find((m) => contientMot(mots, m)) ?? null;
}

/** Un Art Track live ne dit rien dans son titre : seul l'album le trahit. */
function albumSuspect(album) {
  if (!album) return null;
  const mots = enMots(album);
  return INTERDITS.find((m) => contientMot(mots, m)) ?? null;
}

// -------------------------------------------------------------------- rapport

const erreurs = [];
const alertes = [];

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

if (avecDurees && !(await ytDlpPresent())) {
  // Sans ça, l'absence de yt-dlp faisait sauter tous les contrôles de durée
  // en silence, et la CI passait au vert en affirmant le contraire.
  console.error('--durations demandé mais yt-dlp est introuvable. Installe-le ou retire le drapeau.');
  process.exit(1);
}

let totalTitres = 0;
let totalOk = 0;
let pannesReseau = 0;

for (const chemin of chemins) {
  console.log(`\n=== ${chemin} ===`);
  const theme = JSON.parse(readFileSync(chemin, 'utf8'));
  const bands = theme.bands ?? [];

  // --- contrôles de structure, sans réseau -------------------------------
  const slugs = new Set();
  const idsVus = new Map();
  const entrees = [];

  for (const band of bands) {
    if (slugs.has(band.slug)) erreurs.push(`slug en double : ${band.slug}`);
    slugs.add(band.slug);
    if (!/^[a-z0-9-]+$/.test(band.slug)) erreurs.push(`slug non conforme : ${band.slug}`);
    if (band.logo !== null && typeof band.logo !== 'string') erreurs.push(`logo invalide : ${band.slug}`);

    if (band.tracks?.length !== TITRES_PAR_GROUPE) {
      erreurs.push(`${band.slug} : ${band.tracks?.length ?? 0} titres au lieu de ${TITRES_PAR_GROUPE}`);
    }
    for (const track of band.tracks ?? []) {
      if (!Number.isInteger(track.startAt) || track.startAt <= 0) {
        erreurs.push(`${band.slug} / ${track.title} : startAt = ${track.startAt} (jamais 0)`);
      }
      if (!/^[\w-]{11}$/.test(track.youtubeId ?? '')) {
        erreurs.push(`${band.slug} / ${track.title} : youtubeId malformé (${track.youtubeId})`);
        continue;
      }
      const vu = idsVus.get(track.youtubeId);
      if (vu) erreurs.push(`id en double ${track.youtubeId} : ${vu} et ${band.slug}/${track.title}`);
      else idsVus.set(track.youtubeId, `${band.slug}/${track.title}`);
      entrees.push({ band, track });
    }
  }

  // --- collisions internes au catalogue -----------------------------------
  // Un titre qui se confond avec le nom d'un AUTRE groupe du thème rend la
  // grille inarbitrable : « Hysteria » de Muse contre le groupe « Mass
  // Hysteria ». Aucun contrôle réseau ne peut voir ça.
  for (const { band, track } of entrees) {
    const titrePlat = aplatir(track.title);
    if (titrePlat.length < 4) continue;
    for (const autre of bands) {
      if (autre.slug === band.slug) continue;
      if (aplatir(autre.name).includes(titrePlat)) {
        erreurs.push(
          `collision : « ${track.title} » (${band.name}) se confond avec le groupe « ${autre.name} »`,
        );
      }
    }
  }
  for (const band of bands) {
    for (const autre of bands) {
      if (autre.slug === band.slug) continue;
      if (aplatir(autre.name).includes(aplatir(band.name))) {
        erreurs.push(`collision : le groupe « ${band.name} » est contenu dans « ${autre.name} »`);
      }
    }
  }

  console.log(`${bands.length} groupes · ${entrees.length} titres · sonde en cours…`);
  totalTitres += entrees.length;

  // --- contrôles réseau ---------------------------------------------------
  const resultats = await enParallele(entrees, CONCURRENCE, async ({ band, track }) => {
    const emb = await oembed(track.youtubeId);
    const meta = avecDurees ? await metadonnees(track.youtubeId) : undefined;
    return { band, track, emb, meta };
  });

  for (const { band, track, emb, meta } of resultats) {
    const ref = `${band.name} — ${track.title} (${track.youtubeId})`;
    const defauts = [];

    if (emb.reseau) {
      pannesReseau++;
      erreurs.push(`${ref} : sonde injoignable après plusieurs essais (réseau ?)`);
      continue;
    }
    if (emb.code !== 200) {
      erreurs.push(`${ref} : oEmbed ${emb.code} — non embarquable`);
      continue;
    }

    // On collecte tous les défauts de l'entrée, pas seulement le premier :
    // sinon le compte d'erreurs sous-estime le travail restant.
    if (!groupeReconnu(band.name, emb.title, emb.author)) {
      defauts.push(`la vidéo ne mentionne pas le groupe — « ${emb.title} » / chaîne « ${emb.author} »`);
    }
    if (!titreReconnu(track.title, emb.title)) {
      defauts.push(`le titre ne correspond pas — vidéo « ${emb.title} »`);
    }
    const interdit = marqueur(INTERDITS, emb.title, track.title, band.name);
    if (interdit) defauts.push(`« ${interdit} » dans le titre — « ${emb.title} »`);

    const suspect = marqueur(SUSPECTS, emb.title, track.title, band.name);
    if (suspect) alertes.push(`${ref} : version alternative (« ${suspect} ») — « ${emb.title} »`);

    if (avecDurees) {
      if (meta === null) {
        // Une métadonnée manquante n'est PAS un contrôle réussi.
        defauts.push('métadonnées yt-dlp indisponibles — contrôle de durée impossible');
      } else {
        if (meta.duree < DUREE_MIN || meta.duree > DUREE_MAX) {
          defauts.push(`durée ${meta.duree}s hors plage ${DUREE_MIN}-${DUREE_MAX}s`);
        }
        if (track.startAt > meta.duree - 30) {
          defauts.push(`startAt ${track.startAt}s trop proche de la fin (durée ${meta.duree}s)`);
        }
        // L'embarquabilité réelle, plutôt que déduite du seul code oEmbed.
        if (!meta.embarquable) defauts.push('playable_in_embed = False');
        if (meta.ageLimite > 0) defauts.push(`age_limit = ${meta.ageLimite} — refusera de jouer en iframe`);
        if (meta.disponibilite && meta.disponibilite !== 'public') {
          defauts.push(`availability = ${meta.disponibilite}`);
        }
        if (meta.direct && meta.direct !== 'not_live') defauts.push(`live_status = ${meta.direct}`);
        const album = albumSuspect(meta.album);
        if (album) defauts.push(`album « ${meta.album} » sent la captation (« ${album} »)`);
      }
    }

    if (defauts.length === 0) totalOk++;
    else for (const d of defauts) erreurs.push(`${ref} : ${d}`);
  }
}

console.log('\n--------------------------------------------------');
console.log(`${totalOk}/${totalTitres} titres valides`);
if (!avecDurees) {
  console.log('(durées et albums non contrôlés — relancer avec --durations pour le contrôle complet)');
}
if (alertes.length > 0) {
  console.log(`\n${alertes.length} alerte(s) — à relire, sans blocage :`);
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
console.log('Catalogue conforme : zéro doublon, zéro collision, zéro startAt nul, tout est embarquable.');
