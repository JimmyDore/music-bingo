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
//   node tools/verify-catalog.mjs --views          # + yt-dlp : audit des vues
//                                                  #   (sous la cible = alerte)
//   node tools/verify-catalog.mjs catalog/x.json   # un seul fichier

import { execFile } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { bornesDuree } from '../server/catalog.mjs';

const run = promisify(execFile);

const CONCURRENCE = 6;
// Le plancher de durée, lui, est par thème : il vit dans `bornesDuree`, avec la
// marge de lecture qui en dérive. Le garder en double ici garantirait qu'un jour
// les deux divergent. `DUREE_MAX` reste — aucun thème ne la paramètre.
const DUREE_MAX = 480;
const TITRES_PAR_GROUPE = 3;
// Trois titres restent la cible : c'est ce qui fait qu'une même entrée ne rejoue
// pas le même extrait de soirée en soirée. Mais certains thèmes n'ont pas trois
// morceaux également reconnaissables à offrir — une musique de film a un thème
// culte et deux fonds sonores. Mieux vaut deux titres que tout le monde
// identifie qu'un troisième devant lequel la salle reste muette.
//
// Et la variété française des années 80 est un cimetière de tubes uniques :
// Desireless n'a que « Voyage Voyage », Cookie Dingler que « Femme libérée ».
// Leur coller un second titre plus faible recrée exactement le défaut qu'on
// cherche à éviter. Une case qui rejoue toujours le même morceau est un moindre
// mal. Un thème qui le déclare descend à ce plancher, et pas plus bas.
const TITRES_PLANCHER = 1;

// Le commanditaire veut un catalogue que tout le monde reconnaît : sous cette
// barre, la case est un trou noir pour la moitié de la salle.
const VUES_MIN = 10_000_000;
const VUES_PALMARES = 20;

// Les logos vivent là, servis au front sous /logos/<slug>.png.
const DOSSIER_LOGOS = join('public', 'logos');

// Marqueurs qui disqualifient : ce n'est pas la version studio originale.
// Recherche par mot entier, après retrait du nom du groupe et du morceau —
// « Alive » de Pearl Jam n'est pas un live, « I Just Wanna Live » non plus.
const INTERDITS = [
  'live', 'en concert', 'concert', 'unplugged', 'acoustic', 'acoustique',
  'cover', 'reprise', 'remix', 'rmx', 'mashup', 'karaoke', 'karaoké',
  '8 bit', '8bit', 'instrumental', 'instrumentale', 'sped up', 'slowed', 'reverb',
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
const avecVues = args.includes('--views');
// Les deux drapeaux passent par yt-dlp : une seule sonde, deux lectures.
const avecMeta = avecDurees || avecVues;
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

// Une colonne de plus coûte zéro : c'est la négociation avec YouTube qui coûte,
// et le throttling est déjà la première cause de rapport rouge. `--views` lit
// donc cette sortie plutôt que de lancer un second yt-dlp par vidéo.
const CHAMPS = '%(duration)s|%(album)s|%(release_year)s|%(playable_in_embed)s|%(age_limit)s|%(availability)s|%(live_status)s|%(view_count)s';

/** Métadonnées yt-dlp. Rend `null` en cas d'échec — que l'appelant DOIT
 *  traiter comme une erreur, jamais comme un contrôle réussi.
 *
 *  YouTube throttle volontiers une rafale de requêtes (« Please sign in »),
 *  d'où les reprises espacées : sans elles, un catalogue sain rendrait un
 *  rapport rouge une fois sur deux. */
async function metadonnees(id, essais = 4) {
  for (let i = 0; i < essais; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500 * i));
    try {
      const { stdout } = await run(
        'yt-dlp',
        [`https://www.youtube.com/watch?v=${id}`, '--print', CHAMPS, '--skip-download', '--no-warnings'],
        { timeout: 90_000 },
      );
      const [duree, album, annee, embed, age, dispo, direct, vues] = stdout.trim().split('|');
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
        // Un compteur absent n'est pas un compteur à zéro : on le dira.
        vues: na(vues) === null || !Number.isFinite(Number(vues)) ? null : Number(vues),
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

/** Les alias déclarés, nettoyés des valeurs que la structure a déjà refusées. */
const aliasDe = (band) =>
  (Array.isArray(band?.alias) ? band.alias : []).filter((a) => typeof a === 'string' && a.trim() !== '');

/** Un nom (ou un alias) est reconnu s'il apparaît dans le titre de la vidéo ou
 *  dans le nom de la chaîne. Sinon l'id pointe ailleurs. */
function nomReconnu(nom, cible) {
  const candidats = new Set([aplatir(nom)]);
  const sansThe = aplatir(nom).replace(/^the/, '');
  if (sansThe.length >= 3) candidats.add(sansThe);
  return [...candidats].some((c) => c.length > 0 && cible.includes(c));
}

/** Le nom d'abord, les alias en secours. C'est le prix à payer pour qu'une case
 *  puisse porter le nom d'un film pendant que la vidéo porte celui du
 *  compositeur : sur un thème « musiques de films », la case « Titanic » pointe
 *  sur « Céline Dion - My Heart Will Go On » et l'entrée est pourtant juste.
 *
 *  Rend l'alias qui a sauvé la mise, pour pouvoir dire plus tard lesquels ne
 *  servent à rien. */
function groupeReconnu(band, titreVideo, chaine) {
  const cible = `${aplatir(titreVideo)}|${aplatir(chaine)}`;
  if (nomReconnu(band.name, cible)) return { reconnu: true, parAlias: null };
  const alias = aliasDe(band).find((a) => nomReconnu(a, cible)) ?? null;
  return { reconnu: alias !== null, parAlias: alias };
}

const titreReconnu = (titreMorceau, titreVideo) => aplatir(titreVideo).includes(aplatir(titreMorceau));

/** Cherche un marqueur dans le titre, après retrait du nom du groupe et du
 *  morceau : « I Just Wanna Live » de Good Charlotte n'est pas un live.
 *  L'alias qui a servi est un nom propre comme les autres : sans lui, un
 *  compositeur qui s'appelle « Live » condamnerait l'entrée. */
function marqueur(liste, titreVideo, titreMorceau, ...noms) {
  let mots = enMots(titreVideo);
  for (const propre of [enMots(titreMorceau), ...noms.map(enMots)]) {
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
const palmares = [];

const enMillions = (vues) => `${(vues / 1_000_000).toFixed(1)} M`;

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

if (avecMeta && !(await ytDlpPresent())) {
  // Sans ça, l'absence de yt-dlp faisait sauter tous les contrôles de durée
  // en silence, et la CI passait au vert en affirmant le contraire.
  const demandes = [avecDurees && '--durations', avecVues && '--views'].filter(Boolean).join(' et ');
  console.error(`${demandes} demandé mais yt-dlp est introuvable. Installe-le ou retire le drapeau.`);
  process.exit(1);
}

let totalTitres = 0;
let totalOk = 0;
let pannesReseau = 0;

for (const chemin of chemins) {
  console.log(`\n=== ${chemin} ===`);
  const theme = JSON.parse(readFileSync(chemin, 'utf8'));
  const bands = theme.bands ?? [];

  // Deux réglages qu'un thème peut assouplir pour lui seul. Ils ne sont pas là
  // pour faire passer un lot bâclé : chacun répond à une raison précise, et le
  // défaut reste le régime strict.
  const titresMinDeclare = theme.titresMin ?? TITRES_PAR_GROUPE;
  const titresMinValide =
    Number.isInteger(titresMinDeclare) &&
    titresMinDeclare >= TITRES_PLANCHER &&
    titresMinDeclare <= TITRES_PAR_GROUPE;
  if (!titresMinValide) {
    erreurs.push(
      `${chemin} : titresMin = ${theme.titresMin} — attendu un entier entre ` +
        `${TITRES_PLANCHER} et ${TITRES_PAR_GROUPE}, ou le champ absent`,
    );
  }
  // Un `titresMin` refusé ne doit pas continuer à assouplir le compte : sinon
  // « titresMin: 1 » signale son erreur tout en laissant passer les entrées à un
  // seul titre qu'il autorisait. On retombe sur le régime strict.
  const titresMin = titresMinValide ? titresMinDeclare : TITRES_PAR_GROUPE;
  // Les vues ne mesurent la notoriété que pour une chanson : une musique de film
  // culte est éparpillée sur cent réuploads et l'officielle en récolte des
  // miettes. « My Heart Will Go On » sort à 0.8 M sur la chaîne de Céline Dion —
  // le seuil dirait « personne ne connaît », et il aurait tort. Un thème qui
  // n'est pas fait de singles pose son propre seuil, ou le coupe avec `null`.
  const vuesMin = theme.vuesMin === undefined ? VUES_MIN : theme.vuesMin;
  if (vuesMin !== null && (typeof vuesMin !== 'number' || !(vuesMin >= 0))) {
    erreurs.push(`${chemin} : vuesMin = ${theme.vuesMin} — attendu un nombre positif, null, ou absent`);
  }
  // Les deux bornes de durée sortent du même réglage, et c'est le point : sur une
  // vidéo de 15 s, exiger 30 s de lecture après `startAt` est impossible, alors
  // qu'un `startAt` strictement positif est obligatoire. Les régler séparément
  // rendrait un thème de génériques intégralement refusé.
  const { dureeMin, resteMin } = bornesDuree(theme);

  // --- contrôles de structure, sans réseau -------------------------------
  const slugs = new Set();
  const idsVus = new Map();
  const entrees = [];
  const sansLogo = [];
  let avecLogo = 0;
  // Un alias oublié après un changement d'id est du bruit qu'on veut voir. On
  // ne peut le constater qu'après la sonde : ici on ouvre juste le compteur.
  const aliasBilan = new Map();

  for (const band of bands) {
    if (slugs.has(band.slug)) erreurs.push(`slug en double : ${band.slug}`);
    slugs.add(band.slug);
    if (!/^[a-z0-9-]+$/.test(band.slug)) erreurs.push(`slug non conforme : ${band.slug}`);
    // Une chaîne vide passerait le test de type et pointerait sur le dossier.
    if (band.logo !== null && (typeof band.logo !== 'string' || band.logo.trim() === '')) {
      erreurs.push(`logo invalide : ${band.slug}`);
    }
    if (typeof band.logo === 'string' && band.logo.trim() !== '') {
      avecLogo++;
      // Un logo déclaré mais absent tombe en repli silencieux côté front :
      // personne ne s'en aperçoit avant la soirée.
      if (!existsSync(join(DOSSIER_LOGOS, band.logo))) {
        erreurs.push(`${band.slug} : logo « ${band.logo} » introuvable dans ${DOSSIER_LOGOS}/`);
      }
      // Le front sert /logos/<slug>.png sans lire la valeur déclarée : un nom
      // qui s'en écarte marchera ici et nulle part ailleurs.
      if (band.logo !== `${band.slug}.png`) {
        alertes.push(`${band.slug} : logo « ${band.logo} » — le front ira chercher ${band.slug}.png`);
      }
    } else {
      sansLogo.push(band.slug);
    }

    // `null` vaut absence, par symétrie avec `logo` : inutile de rougir sur un
    // champ laissé vide par mimétisme.
    if (band.alias != null) {
      const valide =
        Array.isArray(band.alias) && band.alias.every((a) => typeof a === 'string' && a.trim() !== '');
      if (!valide) erreurs.push(`alias invalide : ${band.slug} — attendu un tableau de chaînes non vides`);
    }
    if (aliasDe(band).length > 0) aliasBilan.set(band.slug, { band, sondes: 0, secours: 0 });

    const nbTitres = band.tracks?.length ?? 0;
    if (nbTitres < titresMin || nbTitres > TITRES_PAR_GROUPE) {
      const attendu =
        titresMin === TITRES_PAR_GROUPE ? `${TITRES_PAR_GROUPE}` : `${titresMin} à ${TITRES_PAR_GROUPE}`;
      erreurs.push(`${band.slug} : ${nbTitres} titres au lieu de ${attendu}`);
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

  // Tout ou rien : une grille où six cases portent un logo et quatorze un nom
  // ressemble à un bug, pas à un choix.
  if (avecLogo > 0 && sansLogo.length > 0) {
    erreurs.push(
      `${chemin} : ${avecLogo} entrée(s) avec logo mais ${sansLogo.length} sans — ` +
        `compléter ou tout retirer : ${sansLogo.join(', ')}`,
    );
  }

  // Descendre à deux titres est un arbitrage, pas un détail : ces entrées
  // rejoueront le même extrait plus souvent. Le dire à voix haute, sinon un
  // thème glisse entrée par entrée vers le plancher sans que personne ne l'ait
  // décidé.
  const courtes = bands.filter((b) => (b.tracks?.length ?? 0) < TITRES_PAR_GROUPE);
  if (courtes.length > 0) {
    console.log(
      `\n${courtes.length}/${bands.length} entrée(s) à moins de ${TITRES_PAR_GROUPE} titres ` +
        `— moins de variété d'une soirée à l'autre : ${courtes.map((b) => b.slug).join(', ')}`,
    );
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
    const meta = avecMeta ? await metadonnees(track.youtubeId) : undefined;
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
    const identite = groupeReconnu(band, emb.title, emb.author);
    const bilan = aliasBilan.get(band.slug);
    if (bilan) {
      bilan.sondes++;
      if (identite.parAlias) bilan.secours++;
    }
    if (!identite.reconnu) {
      const attendu = aliasDe(band).length > 0 ? 'ni le groupe ni ses alias' : 'pas le groupe';
      defauts.push(`la vidéo ne mentionne ${attendu} — « ${emb.title} » / chaîne « ${emb.author} »`);
    }
    if (!titreReconnu(track.title, emb.title)) {
      defauts.push(`le titre ne correspond pas — vidéo « ${emb.title} »`);
    }
    const interdit = marqueur(INTERDITS, emb.title, track.title, band.name, identite.parAlias);
    if (interdit) defauts.push(`« ${interdit} » dans le titre — « ${emb.title} »`);

    const suspect = marqueur(SUSPECTS, emb.title, track.title, band.name, identite.parAlias);
    if (suspect) alertes.push(`${ref} : version alternative (« ${suspect} ») — « ${emb.title} »`);

    if (avecMeta && meta === null) {
      const panne =
        'métadonnées yt-dlp indisponibles après plusieurs reprises ' +
        '(souvent un throttling YouTube : relancer avant de conclure que la vidéo est morte)';
      // Une métadonnée manquante n'est PAS un contrôle réussi. Mais un audit de
      // vues seul ne doit pas rougir la CI : c'est déjà la règle des vues.
      if (avecDurees) defauts.push(`${panne} — contrôle de durée impossible`);
      else alertes.push(`${ref} : ${panne} — vues non auditées`);
    }

    if (avecDurees && meta) {
      if (meta.duree < dureeMin || meta.duree > DUREE_MAX) {
        defauts.push(`durée ${meta.duree}s hors plage ${dureeMin}-${DUREE_MAX}s`);
      }
      if (meta.duree - track.startAt < resteMin) {
        defauts.push(`startAt ${track.startAt}s laisse moins de ${resteMin}s de lecture (durée ${meta.duree}s)`);
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

    // Un clip confidentiel n'est pas une erreur de catalogue : on veut pouvoir
    // auditer la notoriété à la demande sans que la CI en dépende.
    // `vuesMin: null` retire le thème de l'audit — classement compris. L'y
    // laisser reviendrait à noyer sous des musiques de film le bas de tableau,
    // qui n'existe que pour faire remonter les chansons vraiment confidentielles.
    if (avecVues && meta && vuesMin !== null) {
      if (meta.vues === null) alertes.push(`${ref} : view_count indisponible — notoriété non vérifiable`);
      else {
        palmares.push({ ref, vues: meta.vues });
        if (meta.vues < vuesMin) {
          alertes.push(`${ref} : ${enMillions(meta.vues)} de vues — sous la cible de ${enMillions(vuesMin)}`);
        }
      }
    }

    if (defauts.length === 0) totalOk++;
    else for (const d of defauts) erreurs.push(`${ref} : ${d}`);
  }

  // Alias jamais sollicité : l'entrée passe déjà par son nom. Sans blocage —
  // c'est du bruit, pas une faute — mais du bruit qu'on veut voir partir.
  for (const { band, sondes, secours } of aliasBilan.values()) {
    if (sondes > 0 && secours === 0) {
      alertes.push(
        `${band.name} : alias inutile(s) (${aliasDe(band).join(', ')}) — ` +
          `le nom suffit sur les ${sondes} titres sondés`,
      );
    }
  }
}

console.log('\n--------------------------------------------------');
console.log(`${totalOk}/${totalTitres} titres valides`);
if (!avecDurees) {
  console.log('(durées et albums non contrôlés — relancer avec --durations pour le contrôle complet)');
}
if (palmares.length > 0) {
  // Le bas du classement d'abord : c'est là que se cachent les cases devant
  // lesquelles la salle restera muette.
  palmares.sort((a, b) => a.vues - b.vues);
  const queue = palmares.slice(0, VUES_PALMARES);
  console.log(`\nLes ${queue.length} titres les moins vus (cible ${enMillions(VUES_MIN)}) :`);
  for (const { ref, vues } of queue) console.log(`  ${enMillions(vues).padStart(9)} — ${ref}`);
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
