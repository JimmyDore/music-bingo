import { describe, expect, it } from 'vitest'
import { dureeEstimee } from './duree'

// Les trois grilles proposées à la création — cf. GRID_SIZES dans server/game.mjs.
const GRILLES = [
  { id: '3x3', cols: 3, rows: 3 },
  { id: '4x4', cols: 4, rows: 4 },
  { id: '4x5', cols: 4, rows: 5 },
]
const grille = (id: string) => GRILLES.find((g) => g.id === id)!
const duree = (id: string, regle: string) => dureeEstimee(grille(id).cols, grille(id).rows, regle)

describe('dureeEstimee · la grille compte', () => {
  it('raccourcit le carton plein quand la grille rétrécit', () => {
    // Le reproche d'origine : trois tailles de grille, une seule durée affichée.
    // 9 cases ne peuvent pas coûter le même temps que 20.
    expect(duree('3x3', 'carton-plein')!).toBeLessThan(duree('4x4', 'carton-plein')!)
    expect(duree('4x4', 'carton-plein')!).toBeLessThan(duree('4x5', 'carton-plein')!)
  })

  it('raccourcit la ligne quand la grille rétrécit', () => {
    // Une ligne de 3 tombe forcément plus vite qu'une ligne de 4.
    expect(duree('3x3', 'ligne')!).toBeLessThan(duree('4x4', 'ligne')!)
  })

  it('garde le carton plein plus long que la ligne, à grille égale', () => {
    for (const g of GRILLES) {
      expect(dureeEstimee(g.cols, g.rows, 'ligne')!).toBeLessThan(
        dureeEstimee(g.cols, g.rows, 'carton-plein')!,
      )
    }
  })
})

describe('dureeEstimee · valeurs affichées', () => {
  it('conserve les repères déjà rodés sur la 4×5', () => {
    // Les deux valeurs qui étaient codées en dur venaient d'une partie en 4×5 :
    // le calcul doit les retrouver, sinon il corrige une chose et en casse une.
    expect(duree('4x5', 'ligne')).toBe(15)
    expect(duree('4x5', 'carton-plein')).toBe(35)
  })

  it('rend des multiples de 5 minutes, jamais moins de 5', () => {
    for (const g of GRILLES) {
      for (const regle of ['ligne', 'carton-plein']) {
        const min = dureeEstimee(g.cols, g.rows, regle)!
        expect(min % 5).toBe(0)
        expect(min).toBeGreaterThanOrEqual(5)
      }
    }
  })

  it('reste dans la fourchette d\'une soirée pour chaque combinaison', () => {
    for (const g of GRILLES) {
      for (const regle of ['ligne', 'carton-plein']) {
        expect(dureeEstimee(g.cols, g.rows, regle)!).toBeLessThanOrEqual(45)
      }
    }
  })
})

describe('dureeEstimee · cas dégradés', () => {
  // Pas de repli silencieux sur une valeur inventée : l'écran de création
  // préfère n'afficher aucune durée qu'une durée fausse.
  it('rend null sur une règle que le front ne sait pas modéliser', () => {
    expect(dureeEstimee(4, 5, 'deux-lignes')).toBeNull()
    expect(dureeEstimee(4, 5, '')).toBeNull()
  })

  it('rend null sur une grille absurde', () => {
    expect(dureeEstimee(0, 5, 'ligne')).toBeNull()
    expect(dureeEstimee(4, 0, 'carton-plein')).toBeNull()
    expect(dureeEstimee(-1, 5, 'ligne')).toBeNull()
  })
})
