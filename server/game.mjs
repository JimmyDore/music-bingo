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
