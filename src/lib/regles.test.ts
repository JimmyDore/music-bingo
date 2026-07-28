import { describe, expect, it } from 'vitest'
import { casesManquantes, regleSatisfaite } from './regles'

/** Petit helper de lisibilité : `grille('..X.', 'XXXX')` décrit deux rangées. */
const grille = (...rangees: string[]) =>
  rangees.join('').split('').map((c) => c === 'X')

describe('casesManquantes · carton plein', () => {
  it('compte toutes les cases restantes', () => {
    expect(casesManquantes(grille('X..X', '....'), 4, 'carton-plein')).toBe(6)
  })

  it('tombe à zéro quand tout est coché', () => {
    expect(casesManquantes(grille('XXXX', 'XXXX'), 4, 'carton-plein')).toBe(0)
  })

  it('ne se contente pas d\'une ligne complète', () => {
    expect(casesManquantes(grille('XXXX', '....'), 4, 'carton-plein')).toBe(4)
  })
})

describe('casesManquantes · une ligne', () => {
  it('compte ce qui manque sur la ligne la plus avancée', () => {
    // Deuxième rangée à 3/4 : il ne manque qu'une case, pas cinq.
    expect(casesManquantes(grille('X...', 'XXX.', '....'), 4, 'ligne')).toBe(1)
  })

  it('tombe à zéro dès qu\'une rangée est entière', () => {
    expect(casesManquantes(grille('X...', 'XXXX', '..X.'), 4, 'ligne')).toBe(0)
  })

  it('ne se laisse pas avoir par une colonne complète', () => {
    // Une colonne cochée de haut en bas, ce n'est pas une ligne : le
    // présentateur annonce « une ligne », c'est une rangée horizontale.
    expect(casesManquantes(grille('X...', 'X...', 'X...'), 4, 'ligne')).toBe(3)
  })

  it('ne se laisse pas avoir par une diagonale', () => {
    expect(casesManquantes(grille('X...', '.X..', '..X.'), 4, 'ligne')).toBe(3)
  })

  it('ne compte pas une rangée finale incomplète comme une ligne', () => {
    // 4 colonnes, 10 cases : la dernière rangée n'a que deux cases. Deux cases
    // cochées d'affilée ne font pas une ligne.
    expect(casesManquantes(grille('....', '....', 'XX'), 4, 'ligne')).toBe(4)
  })

  it('compte toutes les cases quand rien n\'est coché', () => {
    expect(casesManquantes(grille('....', '....'), 4, 'ligne')).toBe(4)
  })
})

describe('casesManquantes · cas dégradés', () => {
  // Ces cas ne bloquent jamais le bouton : en soirée, un joueur privé de son
  // bingo par une règle qu'on n'a pas su lire, c'est bien pire qu'une
  // réclamation prématurée que le présentateur rejettera en deux secondes.
  it('laisse passer une règle inconnue du front', () => {
    expect(casesManquantes(grille('....', '....'), 4, 'deux-lignes')).toBe(0)
    expect(casesManquantes(grille('....', '....'), 4, '')).toBe(0)
  })

  it('laisse passer une grille sans colonne ni case', () => {
    expect(casesManquantes([], 4, 'carton-plein')).toBe(0)
    expect(casesManquantes(grille('....'), 0, 'ligne')).toBe(0)
    expect(casesManquantes(grille('....'), -1, 'ligne')).toBe(0)
  })
})

describe('regleSatisfaite', () => {
  it('dit oui exactement quand il ne manque plus rien', () => {
    expect(regleSatisfaite(grille('XXXX', '....'), 4, 'ligne')).toBe(true)
    expect(regleSatisfaite(grille('XXX.', '....'), 4, 'ligne')).toBe(false)
    expect(regleSatisfaite(grille('XXXX', 'XXXX'), 4, 'carton-plein')).toBe(true)
    expect(regleSatisfaite(grille('XXXX', 'XXX.'), 4, 'carton-plein')).toBe(false)
  })

  it('reste vrai sur les cas dégradés', () => {
    expect(regleSatisfaite(grille('....'), 4, 'regle-inventee')).toBe(true)
  })

  it('couvre les trois grilles proposées à la création', () => {
    // 3×3, 4×4, 4×5 — cf. GRID_SIZES dans server/game.mjs.
    for (const [cols, cases] of [[3, 9], [4, 16], [4, 20]]) {
      const rien = new Array(cases).fill(false)
      const tout = new Array(cases).fill(true)
      const uneLigne = rien.map((_, i) => i < cols)

      expect(regleSatisfaite(rien, cols, 'ligne')).toBe(false)
      expect(regleSatisfaite(uneLigne, cols, 'ligne')).toBe(true)
      expect(regleSatisfaite(uneLigne, cols, 'carton-plein')).toBe(cases === cols)
      expect(regleSatisfaite(tout, cols, 'carton-plein')).toBe(true)
    }
  })
})
