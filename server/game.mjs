// Logique pure du jeu : tirage du pool, tirage des grilles, codes de partie.
// Aucune I/O ici — c'est ce qui rend tout ça testable sans base ni réseau.

// Tailles de grille proposées. `cols` × `rows` = nombre de cases.
// « 4×5 » se lit 4 de large sur 5 de haut : c'est la carte papier d'origine,
// et c'est aussi le seul sens qui tienne sur un écran de téléphone en portrait.
export const GRID_SIZES = [
  { id: '3x3', label: '3 × 3', cols: 3, rows: 3 },
  { id: '4x4', label: '4 × 4', cols: 4, rows: 4 },
  { id: '4x5', label: '4 × 5', cols: 4, rows: 5 },
];

export const WIN_RULES = [
  { id: 'ligne', label: 'Une ligne' },
  { id: 'carton-plein', label: 'Carton plein' },
];

// Alphabet sans I, O, 0 ni 1 : le code se lit à voix haute dans une pièce
// bruyante et se tape sur un clavier de téléphone.
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function findGridSize(id) {
  return GRID_SIZES.find((g) => g.id === id) ?? null;
}

export function isWinRule(id) {
  return WIN_RULES.some((r) => r.id === id);
}

/** Le pool fait toujours le double du nombre de cases : c'est une constante
 *  dérivée, jamais un réglage exposé. */
export function poolSize(cells) {
  return cells * 2;
}

/** Mélange de Fisher-Yates sur une copie. `rng` doit rendre [0,1[. */
export function shuffle(items, rng = Math.random) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function randomCode(rng = Math.random, length = 4) {
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)];
  }
  return code;
}

/**
 * Tire le pool d'une partie : `size` groupes distincts, un seul titre par groupe.
 * Un groupe ne peut donc pas passer deux fois, et rejouer le même thème ne
 * redonne pas la même bande-son.
 */
export function drawPool(bands, size, rng = Math.random) {
  if (bands.length < size) {
    throw new Error(`catalogue trop petit : ${bands.length} groupes pour un pool de ${size}`);
  }
  return shuffle(bands, rng)
    .slice(0, size)
    .map((band) => {
      const track = shuffle(band.tracks, rng)[0];
      return {
        slug: band.slug,
        name: band.name,
        logo: band.logo ?? null,
        title: track.title,
        youtubeId: track.youtubeId,
        startAt: track.startAt,
      };
    });
}

/** Signature d'une grille : les slugs triés. Deux grilles de même signature
 *  contiennent les mêmes groupes — c'est ce qu'on refuse entre deux joueurs. */
export function cardSignature(card) {
  return card.map((cell) => cell.slug).sort().join(',');
}

/** Une case n'affiche qu'un groupe, jamais un titre : le titre est le moyen de
 *  reconnaître le groupe, il ne doit pas fuiter sur la grille du joueur. */
function toCell(entry) {
  return { slug: entry.slug, name: entry.name, logo: entry.logo ?? null };
}

/** Tire une grille de `cells` cases dans le pool de la partie — jamais dans le
 *  catalogue global, sinon la grille serait ingagnable. */
export function drawCard(pool, cells, rng = Math.random) {
  if (pool.length < cells) {
    throw new Error(`pool trop petit : ${pool.length} titres pour ${cells} cases`);
  }
  return shuffle(pool, rng).slice(0, cells).map(toCell);
}

/**
 * Tire une grille dont la signature n'existe pas déjà. Après `maxTries` échecs
 * on rend quand même une grille : mieux vaut deux grilles identiques qu'un
 * joueur bloqué à la porte en pleine soirée.
 */
export function drawUniqueCard(pool, cells, takenSignatures, rng = Math.random, maxTries = 40) {
  const taken = takenSignatures instanceof Set ? takenSignatures : new Set(takenSignatures);
  let card = drawCard(pool, cells, rng);
  for (let i = 0; i < maxTries && taken.has(cardSignature(card)); i++) {
    card = drawCard(pool, cells, rng);
  }
  return card;
}

/** Normalise un prénom saisi : deux joueurs peuvent porter le même, l'app ne
 *  les départage pas par le nom mais par leur id. */
export function cleanName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim().replace(/\s+/g, ' ');
  if (name.length === 0 || name.length > 24) return null;
  return name;
}

/**
 * Les zones à compléter pour gagner, en indices de cases : chaque rangée pour
 * « Une ligne », la grille entière pour « Carton plein ». Même lecture que
 * `src/lib/regles.ts` — une rangée horizontale, ni colonne ni diagonale.
 */
function zonesGagnantes(cells, cols, winRule) {
  const tout = Array.from({ length: cells }, (_, i) => i);
  if (winRule !== 'ligne' || cols <= 0) return [tout];
  const zones = [];
  for (let debut = 0; debut + cols <= cells; debut += cols) zones.push(tout.slice(debut, debut + cols));
  return zones;
}

/**
 * Rattrapage de fin de pool : quel groupe repasser maintenant.
 *
 * Tout le pool est passé, donc chaque case non cochée est un groupe que son
 * joueur a raté. On repêche d'abord ceux qui n'ont pas encore eu de seconde
 * chance (`plays`, nombre de passages du groupe dans la partie) — sinon un
 * joueur parti fumer laisserait sa case en tête de file pour toujours. À
 * passages égaux, le plus près du bingo d'abord : la case qui manque à la zone
 * la plus avancée d'une grille, puis celle qui en débloque le plus.
 *
 * Rend `null` quand plus aucune grille n'a de case vide. Ce n'est qu'un ordre
 * de passage : rien ici ne déclare un gagnant.
 */
export function choisirRattrapage(players, cols, winRule, plays, rng = Math.random) {
  const candidats = new Map();
  for (const p of players) {
    for (const zone of zonesGagnantes(p.card.length, cols, winRule)) {
      const vides = zone.filter((i) => !p.checked[i]);
      // Zone pleine : ce joueur a de quoi crier bingo, la suite le regarde.
      if (vides.length === 0) continue;
      for (const i of vides) {
        const slug = p.card[i].slug;
        const c = candidats.get(slug) ?? { slug, manque: Infinity, zones: 0 };
        if (vides.length < c.manque) {
          c.manque = vides.length;
          c.zones = 0;
        }
        if (vides.length === c.manque) c.zones++;
        candidats.set(slug, c);
      }
    }
  }
  if (candidats.size === 0) return null;
  const rang = (c) => [plays.get(c.slug) ?? 0, c.manque, -c.zones];
  // Mélange d'abord : à égalité parfaite, l'ordre du tri ne doit pas rejouer
  // toujours le même groupe.
  const tries = shuffle([...candidats.values()], rng).sort((a, b) => {
    const [ra, rb] = [rang(a), rang(b)];
    for (let k = 0; k < ra.length; k++) if (ra[k] !== rb[k]) return ra[k] - rb[k];
    return 0;
  });
  return tries[0].slug;
}

/** Un titre du groupe qui n'est pas encore passé : la seconde chance vaut mieux
 *  avec un autre morceau. Faute de mieux (groupe à titre unique), on repasse le
 *  même — une case qui rejoue son titre reste une case jouable. */
export function choisirTitreRattrapage(tracks, dejaJoues, rng = Math.random) {
  const neufs = tracks.filter((t) => !dejaJoues.has(t.youtubeId));
  return shuffle(neufs.length > 0 ? neufs : tracks, rng)[0];
}
