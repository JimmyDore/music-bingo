#!/usr/bin/env node
// Récupère les logos de groupes depuis Wikimedia Commons.
//
// Trois choses que ce script garantit, et qui sont les seules qui comptent :
//
// 1. **La licence.** On n'interroge QUE commons.wikimedia.org — les fichiers en
//    « fair use » vivent sur en.wikipedia et n'y sont pas. En plus de ça, la
//    licence est relue dans `extmetadata.LicenseShortName` et confrontée à une
//    liste blanche : domaine public, CC0, CC-BY, CC-BY-SA. Tout le reste est
//    écarté sans discussion. Le dépôt est public et déployé : c'est ce contrôle
//    qui le rend défendable.
//
// 2. **La transparence.** La grille applique `brightness(0)` (case cochée) ou
//    `brightness(0) invert(1)` (case normale) : la couleur du logo n'a AUCUNE
//    importance, seul le canal alpha survit. Un logo sur fond opaque devient un
//    rectangle plein. Le script décode donc chaque PNG (zlib pur, la machine n'a
//    ni ImageMagick ni sharp) et refuse ce qui n'a pas d'alpha ou ce qui est
//    opaque à plus de 85 %.
//
//    Sauf pour les entrées de `DETOURAGE` : là, le fond opaque est un aplat
//    UNIFORME (un JPEG blanc, une plaque rouge), et on le retire par seuillage.
//    Voir la section « détourage » plus bas pour ce que ça autorise et, surtout,
//    ce que ça refuse.
//
// 3. **Le rendu serveur.** L'API de vignettes de Commons rasterise le SVG à la
//    largeur demandée. C'est plus fiable que n'importe quel rendu local, et ça
//    évite d'embarquer un moteur SVG.
//
// Dépendance : `sips` (livré avec macOS) est nécessaire aux seules sources JPEG,
// que Node ne sait pas décoder — il ne sert QUE de convertisseur de format.
// Sans lui les trois entrées concernées sont rejetées avec un message explicite,
// le reste du script fonctionne normalement.
//
// Usage :
//   node tools/fetch-logos.mjs                 # télécharge dans public/logos/
//   node tools/fetch-logos.mjs --dry-run       # sonde et rapporte, n'écrit rien
//   node tools/fetch-logos.mjs --out /tmp/x    # ailleurs que public/logos

import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { deflateSync, inflateSync } from 'node:zlib';

const run = promisify(execFile);

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'music-bingo-logo-fetch/1.0 (https://bingo.jimmydore.fr)';
const LARGEUR = 400;
// Paliers de repli : un logo trop lourd est redemandé plus étroit à Commons.
// Le dernier est volontairement bas — sous un certain rapport de réduction
// Commons renvoie l'original plutôt qu'une vignette, et un original entrelacé
// n'est décodable ici qu'une fois re-rendu.
const PALIERS = [LARGEUR, 320, 256, 200];
const POIDS_MAX = 40 * 1024;
const OPACITE_MAX = 0.85;

// ---------------------------------------------------------------- sélection
//
// slug → fichier Commons. Le choix est éditorial (quel logo représente le
// groupe), la vérification est automatique (licence, alpha, fond).
//
// Les groupes absents de cette table n'ont pas de logo utilisable. Chaque cas a
// été repris fichier par fichier — recherche par titre, par catégorie, en plein
// texte, et par la propriété « logo » (P154) de Wikidata, qui est la seule piste
// vraiment fiable. Ne pas les rouvrir sans nouvelle preuve :
//
//   • aucun fichier libre n'existe sur Commons — le logo est en « fair use » sur
//     en.wikipedia, où l'on ne va pas : the-rolling-stones (le tirage langue est
//     une œuvre protégée de John Pasche ; les 49 fichiers de la catégorie
//     « The Rolling Stones' logo » sont des photos), jimmy-eat-world,
//     the-strokes, phoenix, telephone, noir-desir, shaka-ponk, pleymo,
//     skip-the-use ;
//   • un fichier libre existe, mais il ne porte pas le nom du groupe :
//     kings-of-leon — Commons n'a que les logotypes des albums « Because of the
//     Times » et « Only by the Night », qui n'affichent que le titre de l'album.
//     Une case « Because Of The Times » est pire qu'une case « Kings of Leon » ;
//   • un fichier libre existe, mais sa silhouette est illisible — et c'est la
//     silhouette, et elle seule, que la grille affiche :
//       – blink-182 (`File:Blink-182 Logo 2022.png`, PD) : « bLinK » est en
//         lettres jaunes sur transparent, « 182 » en lettres noires sur une
//         plaque jaune opaque. Aucun canal alpha ne peut rendre les deux : on
//         obtient soit « bLinK » suivi d'un pavé plein, soit « 182 » seul ;
//       – bowling-for-soup (`File:BFSlogo.jpg`, PD) : lettrage jaune cerné de
//         noir, très serré — une fois aplati, un pâté ;
//       – superbus (`File:Logo Superbus 2016.jpg`, CC BY-SA 4.0 — c'est bien le
//         groupe français) : lettres en contour d'un ou deux pixels, façon néon.
//         À la taille d'une case de 4×5 sur téléphone, il ne reste rien.
//
// (Le « Superbus » vu par un passage précédent était la compagnie de bus
// israélienne ; le vrai logo du groupe est dans `Category:Superbus`. Il est
// libre — c'est sa graisse, pas sa licence, qui le disqualifie.)
const CHOIX = {
  acdc: 'File:Logo ACDC.svg',
  scorpions: 'File:Scorpions Logo.svg',
  queen: 'File:Queen logo.svg',
  'guns-n-roses': "File:GUNS N' ROSES logo.png",
  metallica: 'File:Metallica wordmark.svg',
  nirvana: 'File:NirvanaLogo.png',
  'led-zeppelin': 'File:Led Zeppelin logo.svg',
  aerosmith: 'File:Aerosmith-logo.png',
  'red-hot-chili-peppers': 'File:Red Hot Chili Peppers logo.svg',
  'rage-against-the-machine': 'File:Rage Against the Machine (Logo).png',
  'foo-fighters': 'File:Foofighters-logo.svg',
  'pearl-jam': 'File:PJTITRE.svg',
  'the-smashing-pumpkins': 'File:The Smashing Pumpkins (Logo).png',
  weezer: 'File:Weezer logo.svg',
  'the-cranberries': 'File:Cranberries logo.png',
  radiohead: 'File:Radiohead wordmark.svg',
  oasis: 'File:Oasisworklogo.png',
  'linkin-park': 'File:Linkin Park wordmark 2024.svg',
  'system-of-a-down': 'File:Soad logo.png',
  korn: 'File:Korn Logo Black.svg',
  slipknot: 'File:Slipknot logo.svg',
  'papa-roach': 'File:Papa Roach - Logo 2012.svg',
  evanescence: 'File:Evanescence wordmark.svg',
  disturbed: 'File:Disturbed logo 2022.svg',
  'three-days-grace': 'File:Three Days Grace logo.svg',
  'green-day': 'File:Green Day logo 2016.png',
  'sum-41': 'File:Sum41tipo.png',
  'the-offspring': 'File:TheOffspringLogo2.png',
  'simple-plan': 'File:Simple Plan.svg',
  'my-chemical-romance': 'File:My Chemical Romance logo (2006).svg',
  'fall-out-boy': 'File:FOBtourLogo.png',
  paramore: 'File:Paramore logo 2013.svg',
  'avril-lavigne': 'File:Avril Lavigne logo.png',
  yellowcard: 'File:Yellowcard Better Days logo.svg',
  muse: 'File:Muse logo.svg',
  'the-killers': 'File:Killerslogo.svg',
  'arctic-monkeys': 'File:Arctic Monkeys Logo (Humbug).png',
  'franz-ferdinand': 'File:Franz Ferdinand logo.svg',
  placebo: 'File:Placebo (Logo).png',
  'imagine-dragons': 'File:Imagine Dragons-Origins Logo.png',
  'twenty-one-pilots': 'File:Twenty One Pilots wordmark.svg',
  mgmt: 'File:MGMT Horizontal logo.png',
  kyo: 'File:Kyo logo.svg',
  gojira: 'File:Gojira logo.svg',
  // Sources à fond opaque : voir DETOURAGE juste en dessous.
  'good-charlotte': 'File:GoodcharlotteLogo.jpg',
  indochine: 'File:Logo indochine.png',
  'limp-bizkit': 'File:Limp Bizkit logo.png',
  'mass-hysteria': 'File:Logo du groupe Mass Hysteria.jpg',
  'panic-at-the-disco': 'File:P! ATD Logo.jpg',
  'the-white-stripes': 'File:Thewhitestripes.png',
};

// Sources dont le « fond » est un aplat opaque, à retirer par seuillage. La
// liste est explicite, et c'est délibéré : un logo correct ne doit jamais être
// retouché au passage par une heuristique. On ne détoure que ce qu'on a regardé.
//
//   good-charlotte      JPEG, encre noire sur blanc
//   indochine           PNG à fond blanc opaque, encre noire
//   limp-bizkit         PNG à fond blanc opaque, encre rouge
//   mass-hysteria       JPEG, encre noire sur blanc
//   panic-at-the-disco  JPEG, encre noire sur blanc
//   the-white-stripes   PNG, lettres blanches réservées dans une plaque rouge
//                       opaque — ici le fond retiré est le rouge, et la
//                       silhouette obtenue est le lettrage blanc
const DETOURAGE = new Set([
  'good-charlotte', 'indochine', 'limp-bizkit',
  'mass-hysteria', 'panic-at-the-disco', 'the-white-stripes',
]);

// Une licence libre, et rien d'autre. La liste est volontairement courte :
// en cas de doute sur un intitulé, on écarte plutôt que d'élargir.
const LICENCES_LIBRES = [
  /^public domain/i,
  /^pd[- ]/i,
  /^cc0/i,
  /^cc[- ]by(?![a-z])/i,
  /^cc[- ]by[- ]sa/i,
  /^copyrighted free use/i,
];

const estLibre = (l) => typeof l === 'string' && LICENCES_LIBRES.some((re) => re.test(l.trim()));

// ------------------------------------------------------------------ réseau

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

/** Commons throttle les rafales : sans reprises espacées, un tiers des
 *  téléchargements échoue et on conclut à tort qu'un fichier n'existe pas. */
async function recuperer(url, json) {
  for (let i = 0; i < 5; i++) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(30_000) });
      if (r.ok) return json ? await r.json() : Buffer.from(await r.arrayBuffer());
    } catch {
      /* réseau ou throttling : on retente */
    }
    await pause(1200 * (i + 1));
  }
  return null;
}

async function imageinfo(titres, largeur = LARGEUR) {
  const out = new Map();
  for (let i = 0; i < titres.length; i += 20) {
    const p = new URLSearchParams({
      action: 'query', format: 'json', formatversion: '2',
      titles: titres.slice(i, i + 20).join('|'),
      prop: 'imageinfo', iiprop: 'url|extmetadata|size|mime',
      iiurlwidth: String(largeur),
      iiextmetadatafilter: 'LicenseShortName|UsageTerms|License|Artist|Credit',
    });
    const r = await recuperer(`${API}?${p}`, true);
    for (const page of r?.query?.pages ?? []) {
      const ii = page.imageinfo?.[0];
      if (page.missing || !ii) { out.set(page.title, { titre: page.title, manquant: true }); continue; }
      const em = ii.extmetadata ?? {};
      const texte = (v) => (v ?? '').replace(/<[^>]*>/g, '').trim();
      out.set(page.title, {
        titre: page.title,
        vignette: ii.thumburl ?? ii.url,
        page: ii.descriptionurl,
        licence: texte(em.LicenseShortName?.value),
        conditions: texte(em.UsageTerms?.value),
        auteur: texte(em.Artist?.value),
      });
    }
    await pause(300);
  }
  return out;
}

// ------------------------------------------------------- analyse du PNG
//
// Décodeur minimal, en zlib pur. Il rend l'image à plat en RGBA8 : le canal
// alpha est tout ce qui compte pour valider un logo, mais le détourage a besoin
// des couleurs pour savoir ce qui est fond et ce qui est encre.

const CANAUX = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const paeth = (a, b, c) => {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
};

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function morceaux(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error('ce n’est pas un PNG');
  const out = [];
  let p = 8;
  while (p + 8 <= buf.length) {
    const len = buf.readUInt32BE(p);
    out.push({ type: buf.toString('ascii', p + 4, p + 8), data: buf.subarray(p + 8, p + 8 + len) });
    p += 12 + len;
  }
  return out;
}

/** { largeur, hauteur, rgba, sourceAlpha } — `sourceAlpha` dit si le fichier
 *  portait vraiment un canal alpha, information que le RGBA à plat perd. */
function decoder(buf) {
  const cs = morceaux(buf);
  const ihdr = cs.find((c) => c.type === 'IHDR')?.data;
  if (!ihdr) throw new Error('IHDR absent');
  const largeur = ihdr.readUInt32BE(0), hauteur = ihdr.readUInt32BE(4);
  const prof = ihdr[8], couleur = ihdr[9], entrelace = ihdr[12];
  if (entrelace !== 0) throw new Error('PNG entrelacé — non décodé, donc non validé');
  if (prof !== 8 && prof !== 16 && !(couleur === 3 && [1, 2, 4].includes(prof))) {
    throw new Error(`profondeur ${prof} bits non gérée (type de couleur ${couleur})`);
  }
  const plte = cs.find((c) => c.type === 'PLTE')?.data;
  const trns = cs.find((c) => c.type === 'tRNS')?.data;
  const sourceAlpha = couleur === 4 || couleur === 6 || (couleur === 3 && Boolean(trns));

  const canaux = CANAUX[couleur];
  const bpp = Math.max(1, Math.ceil((canaux * prof) / 8));
  const parLigne = Math.ceil((canaux * prof * largeur) / 8);
  const brut = inflateSync(Buffer.concat(cs.filter((c) => c.type === 'IDAT').map((c) => c.data)));
  const px = Buffer.alloc(parLigne * hauteur);
  let prec = Buffer.alloc(parLigne);
  for (let y = 0; y < hauteur; y++) {
    const dep = y * (parLigne + 1);
    const f = brut[dep];
    const l = Buffer.from(brut.subarray(dep + 1, dep + 1 + parLigne));
    for (let i = 0; i < parLigne; i++) {
      const a = i >= bpp ? l[i - bpp] : 0, b = prec[i], c = i >= bpp ? prec[i - bpp] : 0;
      if (f === 1) l[i] = (l[i] + a) & 255;
      else if (f === 2) l[i] = (l[i] + b) & 255;
      else if (f === 3) l[i] = (l[i] + ((a + b) >> 1)) & 255;
      else if (f === 4) l[i] = (l[i] + paeth(a, b, c)) & 255;
    }
    l.copy(px, y * parLigne);
    prec = l;
  }

  // 16 bits : on ne garde que l'octet de poids fort, l'écran n'en verra pas plus.
  const oct = prof === 16 ? 2 : 1;
  const ech = (y, x, ch) => px[y * parLigne + (x * canaux + ch) * oct];
  const indexPalette = (y, x) => {
    if (prof === 8) return px[y * parLigne + x];
    const parOctet = 8 / prof;
    const o = px[y * parLigne + Math.floor(x / parOctet)];
    return (o >> (8 - prof * ((x % parOctet) + 1))) & ((1 << prof) - 1);
  };

  const rgba = Buffer.alloc(largeur * hauteur * 4);
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      const o = (y * largeur + x) * 4;
      if (couleur === 3) {
        const i = indexPalette(y, x);
        rgba[o] = plte[i * 3]; rgba[o + 1] = plte[i * 3 + 1]; rgba[o + 2] = plte[i * 3 + 2];
        rgba[o + 3] = trns && i < trns.length ? trns[i] : 255;
      } else if (couleur === 0 || couleur === 4) {
        const g = ech(y, x, 0);
        rgba[o] = rgba[o + 1] = rgba[o + 2] = g;
        rgba[o + 3] = couleur === 4 ? ech(y, x, 1) : 255;
      } else {
        rgba[o] = ech(y, x, 0); rgba[o + 1] = ech(y, x, 1); rgba[o + 2] = ech(y, x, 2);
        rgba[o + 3] = couleur === 6 ? ech(y, x, 3) : 255;
      }
    }
  }
  return { largeur, hauteur, rgba, sourceAlpha };
}

/** { largeur, hauteur, alpha, opacite } — `opacite` est la part de pixels
 *  totalement opaques. C'est elle qui trahit un fond plein. */
function analyser(img) {
  const { largeur, hauteur, rgba } = img;
  let opaques = 0;
  for (let i = 0; i < largeur * hauteur; i++) if (rgba[i * 4 + 3] > 250) opaques++;
  return { largeur, hauteur, alpha: img.sourceAlpha, opacite: opaques / (largeur * hauteur) };
}

// -------------------------------------------------------------- encodage PNG

const TABLE_CRC = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(b) {
  let c = 0xffffffff;
  for (const o of b) c = TABLE_CRC[(c ^ o) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloc(type, data) {
  const t = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}

/** RGBA8 → PNG, filtre Paeth sur toutes les lignes. Pas de recherche du meilleur
 *  filtre : le budget est de 40 Ko et Paeth y tient largement sur du lettrage. */
function encoder({ largeur, hauteur, rgba }) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0); ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const parLigne = largeur * 4;
  const brut = Buffer.alloc((parLigne + 1) * hauteur);
  let prec = Buffer.alloc(parLigne);
  for (let y = 0; y < hauteur; y++) {
    const ligne = rgba.subarray(y * parLigne, (y + 1) * parLigne);
    const dep = y * (parLigne + 1);
    brut[dep] = 4;
    for (let i = 0; i < parLigne; i++) {
      const a = i >= 4 ? ligne[i - 4] : 0, b = prec[i], c = i >= 4 ? prec[i - 4] : 0;
      brut[dep + 1 + i] = (ligne[i] - paeth(a, b, c)) & 255;
    }
    prec = ligne;
  }
  return Buffer.concat([
    SIGNATURE,
    bloc('IHDR', ihdr),
    bloc('IDAT', deflateSync(brut, { level: 9 })),
    bloc('IEND', Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ détourage
//
// Sur Commons, beaucoup de logotypes sont livrés en JPEG, ou en PNG dont le
// « fond » est en réalité un aplat opaque. Sous `brightness(0)`, ils deviennent
// un rectangle plein. Comme l'aplat est uniforme, on peut le retirer : c'est du
// seuillage, pas de la retouche.
//
// Deux garde-fous, parce qu'un détourage raté ne se voit pas dans un log :
//   • la couleur de fond n'est pas devinée, elle est lue sur le POURTOUR de la
//     zone opaque. La couleur dominante de l'image entière ne marche pas : un
//     wordmark gras couvre plus de surface que son fond, et le détourage
//     s'inverserait — on garderait le fond et on effacerait les lettres ;
//   • si cette couleur ne couvre pas 90 % du pourtour, le fond n'est pas un
//     aplat (dégradé, photo, motif) et on refuse.

const ECART_FOND = 26;   // en deçà, on est encore le fond
const ECART_ENCRE = 70;  // au-delà, on est franchement de l'encre

const maxEcart = (r, g, b, f) => Math.max(Math.abs(r - f[0]), Math.abs(g - f[1]), Math.abs(b - f[2]));

/** Couleur du pourtour de la zone opaque, et la part qu'elle y couvre. */
function fondDeBordure({ largeur, hauteur, rgba }, epaisseur = 2) {
  const opaque = (x, y) => rgba[(y * largeur + x) * 4 + 3] >= 250;
  let x0 = largeur, y0 = hauteur, x1 = -1, y1 = -1;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      if (!opaque(x, y)) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) return null;

  const pourtour = [];
  for (let y = y0; y <= y1; y++) {
    for (let e = 0; e < epaisseur; e++) { pourtour.push([Math.min(x0 + e, x1), y], [Math.max(x1 - e, x0), y]); }
  }
  for (let x = x0; x <= x1; x++) {
    for (let e = 0; e < epaisseur; e++) { pourtour.push([x, Math.min(y0 + e, y1)], [x, Math.max(y1 - e, y0)]); }
  }
  const opaques = pourtour.filter(([x, y]) => opaque(x, y));
  if (opaques.length === 0) return null;

  // Seaux de 16 pour tolérer le bruit JPEG, puis moyenne du seau majoritaire.
  const seaux = new Map();
  for (const [x, y] of opaques) {
    const i = (y * largeur + x) * 4;
    const k = ((rgba[i] >> 4) << 8) | ((rgba[i + 1] >> 4) << 4) | (rgba[i + 2] >> 4);
    const s = seaux.get(k);
    if (s) { s.n++; s.r += rgba[i]; s.g += rgba[i + 1]; s.b += rgba[i + 2]; }
    else seaux.set(k, { n: 1, r: rgba[i], g: rgba[i + 1], b: rgba[i + 2] });
  }
  let majoritaire = null;
  for (const s of seaux.values()) if (!majoritaire || s.n > majoritaire.n) majoritaire = s;
  const couleur = [
    Math.round(majoritaire.r / majoritaire.n),
    Math.round(majoritaire.g / majoritaire.n),
    Math.round(majoritaire.b / majoritaire.n),
  ];
  // La part se recompte à la tolérance réelle du seuillage : deux seaux voisins
  // décrivent le même aplat, les compter séparément le ferait paraître bariolé.
  const proches = opaques.filter(([x, y]) => {
    const i = (y * largeur + x) * 4;
    return maxEcart(rgba[i], rgba[i + 1], rgba[i + 2], couleur) <= ECART_FOND;
  }).length;
  return { couleur, part: proches / opaques.length };
}

/** Retire l'aplat de fond. Lève si le fond n'en est pas un. */
function detourer(img, partMin = 0.9) {
  const f = fondDeBordure(img);
  if (!f) throw new Error('aucun pixel opaque à détourer');
  if (f.part < partMin) {
    throw new Error(`fond non uniforme (l’aplat ne couvre que ${Math.round(f.part * 100)} % du pourtour)`);
  }
  const { largeur, hauteur, rgba } = img;
  const out = Buffer.from(rgba);
  for (let i = 0; i < largeur * hauteur; i++) {
    const d = maxEcart(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2], f.couleur);
    const t = d <= ECART_FOND ? 0 : d >= ECART_ENCRE ? 1 : (d - ECART_FOND) / (ECART_ENCRE - ECART_FOND);
    out[i * 4 + 3] = Math.round(rgba[i * 4 + 3] * t);
  }
  return { largeur, hauteur, rgba: out, sourceAlpha: true, fond: f.couleur };
}

/** Recadre sur le contenu. Le fond retiré laisse des marges vides qui, dans une
 *  case carrée, rétrécissent le logo pour rien. 2 % de marge pour ne pas coller
 *  au bord. */
function recadrer(img, seuil = 8) {
  const { largeur, hauteur, rgba } = img;
  let x0 = largeur, y0 = hauteur, x1 = -1, y1 = -1;
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      if (rgba[(y * largeur + x) * 4 + 3] <= seuil) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  if (x1 < 0) throw new Error('image vide après détourage');
  const m = Math.max(1, Math.round(Math.max(x1 - x0, y1 - y0) * 0.02));
  x0 = Math.max(0, x0 - m); y0 = Math.max(0, y0 - m);
  x1 = Math.min(largeur - 1, x1 + m); y1 = Math.min(hauteur - 1, y1 + m);
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    rgba.copy(out, y * w * 4, ((y + y0) * largeur + x0) * 4, ((y + y0) * largeur + x1 + 1) * 4);
  }
  return { largeur: w, hauteur: h, rgba: out, sourceAlpha: true };
}

// ------------------------------------------------------------ normalisation

const COTE = 400;
let sipsDispo = null;

async function sipsPresent() {
  if (sipsDispo === null) {
    try { await run('sips', ['--version'], { timeout: 10_000 }); sipsDispo = true; }
    catch { sipsDispo = false; }
  }
  return sipsDispo;
}

const estJpeg = (buf) => buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;

/** JPEG → PNG. Node ne décode pas le JPEG et on ne veut pas de dépendance :
 *  `sips` (livré avec macOS) sert ici de simple convertisseur de format, aucun
 *  traitement d'image n'est délégué. Les trois logos concernés n'existent qu'en
 *  JPEG sur Commons ; sans `sips` ils sont rejetés, pas approximés. */
async function jpegVersPng(buf) {
  if (!(await sipsPresent())) throw new Error('source JPEG et sips introuvable — impossible de décoder');
  const dir = mkdtempSync(join(tmpdir(), 'logos-'));
  const src = join(dir, 'src.jpg'), dst = join(dir, 'dst.png');
  writeFileSync(src, buf);
  await run('sips', ['-s', 'format', 'png', src, '--out', dst], { timeout: 30_000 });
  return readFileSync(dst);
}

/** Ramène le plus grand côté à 400 px — en réduction seulement. `sips -Z`
 *  agrandit aussi, et agrandir un logo de 300 px le rend flou ET plus lourd :
 *  on ne l'appelle donc que si le fichier dépasse le gabarit. Rend `false` si
 *  `sips` manque ou n'avait rien à faire : le fichier de Commons est gardé. */
async function normaliser(chemin, largeur, hauteur) {
  if (Math.max(largeur, hauteur) <= COTE) return false;
  if (!(await sipsPresent())) {
    console.warn('sips introuvable : les vignettes restent à leur taille d’origine.');
    return false;
  }
  try { await run('sips', ['-Z', String(COTE), chemin], { timeout: 30_000 }); return true; }
  catch { return false; }
}

// ---------------------------------------------------------------- programme

const args = process.argv.slice(2);
const sec = args.includes('--dry-run');
const iOut = args.indexOf('--out');
const dossier = iOut >= 0 ? args[iOut + 1] : join('public', 'logos');

const slugs = Object.keys(CHOIX).sort();
const meta = await imageinfo(slugs.map((s) => CHOIX[s]));

if (!sec) mkdirSync(dossier, { recursive: true });

const retenus = [];
const rejets = [];

for (const slug of slugs) {
  const titre = CHOIX[slug];
  const m = meta.get(titre);
  if (!m || m.manquant) { rejets.push({ slug, titre, raison: 'absent de Commons' }); continue; }
  if (!estLibre(m.licence)) {
    rejets.push({ slug, titre, raison: `licence non libre (${m.licence || 'inconnue'})` });
    continue;
  }
  // Commons sert la vignette au palier supérieur (500 px pour 400 demandés).
  // Tant que le fichier dépasse le budget, on redemande plus étroit : c'est le
  // rendu du serveur qui décide, pas un ré-échantillonnage local — donc pas de
  // perte de qualité au passage.
  const aDetourer = DETOURAGE.has(slug);
  let buf = null, a = null, souci = 'téléchargement impossible', vues = new Set();
  for (const largeur of PALIERS) {
    const rendu = largeur === LARGEUR ? m : (await imageinfo([titre], largeur)).get(titre);
    const url = rendu?.vignette;
    // Sous une certaine taille Commons renvoie l'original : inutile de le
    // retélécharger, le palier suivant ne donnera rien de plus.
    if (!url || vues.has(url)) continue;
    vues.add(url);
    let essai = await recuperer(url, false);
    if (!essai) continue;
    // Un PNG entrelacé n'est pas décodable ici : c'est l'original que Commons a
    // renvoyé faute de pouvoir faire plus petit. Le palier suivant le règle.
    let img;
    try {
      if (estJpeg(essai)) essai = await jpegVersPng(essai);
      img = decoder(essai);
    } catch (e) { souci = e.message; continue; }

    if (aDetourer) {
      // Le fond opaque est ici attendu, pas subi : on le retire et c'est le
      // résultat, pas la source, qui doit passer les contrôles.
      try {
        img = recadrer(detourer(img));
        essai = encoder(img);
      } catch (e) { souci = `détourage impossible : ${e.message}`; break; }
    }

    const vu = analyser(img);
    if (!vu.alpha) { souci = 'aucun canal alpha'; break; }
    if (vu.opacite > OPACITE_MAX) {
      souci = `fond opaque (${Math.round(vu.opacite * 100)} % de pixels pleins)`;
      break;
    }
    buf = essai; a = vu;
    if (essai.length <= POIDS_MAX) break;
  }
  if (!buf) { rejets.push({ slug, titre, raison: souci }); continue; }

  if (!sec) {
    const chemin = join(dossier, `${slug}.png`);
    writeFileSync(chemin, buf);
    // Dernier recours quand aucun palier ne tient le budget : `sips`. On relit
    // le résultat — un fichier « transparent » devenu opaque est le pire
    // résultat possible, et il ne se voit pas à l'œil nu.
    if (buf.length > POIDS_MAX && (await normaliser(chemin, a.largeur, a.hauteur))) {
      const b = analyser(decoder(readFileSync(chemin)));
      const taille = statSync(chemin).size;
      if (!b.alpha || b.opacite > OPACITE_MAX || taille >= buf.length) writeFileSync(chemin, buf);
      else { buf = { length: taille }; a = b; }
    }
  }
  retenus.push({ slug, ...m, ...a, octets: buf.length, detoure: aDetourer });
  console.log(
    `${slug.padEnd(26)} ${`${a.largeur}×${a.hauteur}`.padEnd(9)} ` +
    `${String(Math.round(buf.length / 1024)).padStart(3)} Ko  ${(m.licence || '').padEnd(16)} ${titre}`,
  );
  await pause(200);
}

// --------------------------------------------------------------- licences

if (!sec) {
  const lignes = [
    '# Provenance et licences des logos',
    '',
    'Ce dossier ne contient que des fichiers **sous licence libre**, tous issus de',
    'Wikimedia Commons. Aucun fichier en « fair use » (`Non-free logo`) n’y a sa',
    'place : le dépôt est public et déployé sur un site public.',
    '',
    'Chaque PNG est la vignette rendue par Commons à ~400 px de large. La grille',
    'n’affiche que la silhouette (`brightness(0)` / `brightness(0) invert(1)`) : la',
    'couleur de la source est sans effet, seul le canal alpha compte.',
    '',
    'Les fichiers marqués **fond retiré** arrivaient de Commons sur un aplat opaque',
    '(un JPEG blanc, une plaque de couleur). L’aplat a été retiré par seuillage —',
    'sans ça, la case afficherait un rectangle plein. Le tracé, lui, est intact :',
    'aucun pixel n’a été redessiné, et l’œuvre citée reste celle de Commons.',
    '',
    'Régénérer : `node tools/fetch-logos.mjs`',
    '',
    '| Fichier | Œuvre sur Commons | Licence | Auteur | Traitement | Page source |',
    '|---|---|---|---|---|---|',
    ...retenus.map((r) => {
      const nom = r.titre.replace(/^File:/, '');
      // Les CC-BY et CC-BY-SA exigent le crédit : c'est cette colonne qui le porte.
      const auteur = (r.auteur || '—').replace(/\s+/g, ' ').replace(/\|/g, '/');
      const trait = r.detoure ? 'fond retiré' : '—';
      return `| \`${r.slug}.png\` | ${nom} | ${r.licence} | ${auteur} | ${trait} | ${r.page} |`;
    }),
    '',
    `${retenus.length} fichiers, dont ${retenus.filter((r) => r.detoure).length} détourés.`,
    '',
    'Les marques restent la propriété de leurs titulaires : la licence libre porte',
    'sur le fichier, pas sur le droit des marques. La plupart de ces logos sont sous',
    '`PD-textlogo` — de la typographie qui ne franchit pas le seuil d’originalité et',
    'n’est donc protégée par aucun droit d’auteur.',
    '',
  ];
  writeFileSync(join(dossier, 'LICENSES.md'), lignes.join('\n'));
}

console.log(`\n${retenus.length}/${slugs.length} logos retenus.`);
if (rejets.length > 0) {
  console.log(`\n${rejets.length} rejet(s) :`);
  for (const r of rejets) console.log(`  ✗ ${r.slug} — ${r.titre} : ${r.raison}`);
  process.exitCode = 1;
}
