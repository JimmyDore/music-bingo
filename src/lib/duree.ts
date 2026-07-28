// Estimation de la durée d'une partie, affichée à la création (« ~35 min »).
//
// Cette valeur était codée en dur par règle de victoire, ce qui donnait la même
// durée pour une 3×3 et une 4×5 — alors qu'un carton plein en 3×3 demande 9
// titres et 20 en 4×5. Elle se calcule maintenant à partir de la grille.
//
// Le modèle est volontairement simple, parce que la vraie variance vient de la
// table (la longueur des extraits, les discussions entre deux titres), pas des
// maths : on estime combien de titres passent avant le premier gagnant, et on
// multiplie par la durée d'un titre.

/** Un titre lancé, écouté, débattu, coché : le rythme réel d'une table.
 *  Calibré sur les deux repères d'origine, mesurés en 4×5. */
const SECONDES_PAR_TITRE = 55

/** Une partie de salon. Le nombre de joueurs joue peu (entre 4 et 8, l'écart
 *  reste sous les 3 minutes) mais il joue : à plusieurs, quelqu'un gagne plus
 *  tôt. On fige une table type plutôt que de demander l'info au présentateur
 *  avant qu'il ait invité qui que ce soit. */
const JOUEURS_TYPE = 4

/**
 * Espérance du plus petit rang, sur `tentatives` essais, auquel les `k` cases
 * d'un essai sont toutes sorties d'un pool de `pool` titres.
 *
 * P(les k cases sont sorties au bout de t tirages) = C(t,k)/C(pool,k), donc
 * P(aucun des essais n'a abouti après t) = (1 − C(t,k)/C(pool,k))^tentatives,
 * et l'espérance est la somme de cette survie sur t.
 *
 * Les essais ne sont pas vraiment indépendants — deux rangées d'une même carte
 * puisent dans le même tirage — mais l'écart avec une simulation Monte-Carlo
 * reste sous 0,2 titre sur les trois grilles proposées : invisible une fois
 * arrondi à cinq minutes.
 */
function esperanceTirages(k: number, pool: number, tentatives: number): number {
  let esperance = 0
  for (let t = 0; t < pool; t++) {
    // C(t,k)/C(pool,k) en produit, pour ne pas faire déborder les factorielles.
    let complet = 0
    if (t >= k) {
      complet = 1
      for (let i = 0; i < k; i++) complet *= (t - i) / (pool - i)
    }
    esperance += Math.pow(1 - complet, tentatives)
  }
  return esperance
}

/**
 * Durée estimée en minutes, arrondie à cinq minutes près, ou `null` quand le
 * front ne sait pas modéliser la demande.
 *
 * Rendre `null` plutôt qu'un repli au jugé est délibéré : une durée absente se
 * remarque et ne trompe personne, une durée inventée oriente une soirée.
 */
export function dureeEstimee(cols: number, rows: number, regle: string): number | null {
  if (cols <= 0 || rows <= 0) return null

  const cases = cols * rows
  // Le pool fait le double du nombre de cases — cf. poolSize() dans
  // server/game.mjs. À garder en phase avec lui.
  const pool = cases * 2

  let titres: number
  if (regle === 'carton-plein') {
    // Une seule tentative par joueur : sa carte entière.
    titres = esperanceTirages(cases, pool, JOUEURS_TYPE)
  } else if (regle === 'ligne') {
    // Chaque joueur court avec toutes ses rangées à la fois.
    titres = esperanceTirages(cols, pool, rows * JOUEURS_TYPE)
  } else {
    return null
  }

  const minutes = (titres * SECONDES_PAR_TITRE) / 60
  return Math.max(5, Math.round(minutes / 5) * 5)
}
