import { describe, expect, it } from 'vitest'
import rockPopPunk from '../../catalog/rock-pop-punk.json'
import generiquesTv from '../../catalog/generiques-tv.json'
import { avecLegende, tailleTexte } from './Grille'

// Chasse moyenne d'une capitale d'Anton, en em. C'est l'hypothèse qui relie la
// taille de police à la largeur occupée par un mot.
const CHASSE = 0.5

// Deux thèmes, pas un. Ces boucles n'ont jamais couvert « le catalogue » : elles
// ne voyaient qu'un fichier, et « Linkin Park » ne dit rien de « Le Laboratoire
// de Dexter ». La taille de police se règle sur le mot le plus long, jamais sur
// la longueur totale — un thème dont les cases portent des noms d'émissions est
// donc un jeu de contraintes différent, qu'il faut regarder.
const CATALOGUES = [rockPopPunk, generiquesTv]

const motLePlusLong = (nom: string) => Math.max(...nom.split(/\s+/).map((m) => m.length))

describe('tailleTexte', () => {
  it('donne de grosses lettres aux noms courts', () => {
    // Le défaut d'origine : « KORN » s'affichait à la même taille que
    // « THE WHITE STRIPES », soit 10 px, illisible à bout de bras.
    expect(tailleTexte('Korn')).toBe(34)
    expect(tailleTexte('Muse')).toBe(34)
    expect(tailleTexte('AC/DC')).toBe(34)
    expect(tailleTexte('Korn')).toBeGreaterThan(tailleTexte('The White Stripes'))
  })

  it('se règle sur le mot le plus long, pas sur la longueur totale', () => {
    // « Rage Against the Machine » est long mais ses mots sont courts : il a
    // droit à plus gros que « The Cranberries », qui a un mot de 11 lettres.
    expect(tailleTexte('Rage Against the Machine')).toBeGreaterThan(tailleTexte('The Cranberries'))
    expect(tailleTexte('Panic! At The Disco')).toBeGreaterThan(tailleTexte('Evanescence'))
  })

  it('reste dans des bornes lisibles', () => {
    for (const nom of ['A', 'Supercalifragilisticexpialidocious', '', 'Queen']) {
      const taille = tailleTexte(nom)
      expect(taille).toBeGreaterThanOrEqual(11)
      expect(taille).toBeLessThanOrEqual(34)
    }
  })

  it('aucun nom du catalogue ne déborde de sa case', () => {
    // La taille est en `cqw` : le mot le plus long doit tenir dans les 100 %
    // de la largeur de case, sinon il est rogné — ou coupé n'importe où.
    for (const catalogue of CATALOGUES) {
      for (const band of catalogue.bands) {
        const largeur = tailleTexte(band.name) * motLePlusLong(band.name) * CHASSE
        expect(largeur, `${band.name} déborde (${largeur.toFixed(1)} cqw)`).toBeLessThanOrEqual(100)
      }
    }
  })

  it('aucun nom du catalogue ne tombe sur la taille plancher', () => {
    // Si un nom atteint le plancher, c'est qu'il est trop long pour la formule
    // et qu'il sera rogné : il faut alors le raccourcir dans le catalogue — le
    // nom affiché, jamais le seuil du test.
    for (const catalogue of CATALOGUES) {
      for (const band of catalogue.bands) {
        expect(tailleTexte(band.name), `${band.name} est au plancher`).toBeGreaterThan(11)
      }
    }
  })
})

describe('avecLegende', () => {
  // Les trois tailles proposées à la création (`GRID_SIZES`, server/game.mjs),
  // recopiées ici : le front ne peut pas importer le serveur, et une taille de
  // grille change bien trop rarement pour justifier un module partagé.
  const GRILLES = [
    { id: '3x3', cols: 3, cases: 9 },
    { id: '4x4', cols: 4, cases: 16 },
    { id: '4x5', cols: 4, cases: 20 },
  ]
  const grille = (id: string) => GRILLES.find((g) => g.id === id)!

  it('garde le nom sous le logo tant qu\'il reste de la hauteur', () => {
    for (const id of ['3x3', '4x4']) {
      const g = grille(id)
      expect(avecLegende(g.cols, g.cases), `${id} devrait légender`).toBe(true)
    }
  })

  it('abandonne la légende sur la 4×5, où la place manque', () => {
    // 4×5 et 4×4 ont le même nombre de colonnes : c'est la cinquième rangée à
    // caser dans la hauteur d'un téléphone qui tranche, pas la largeur.
    const g = grille('4x5')
    expect(avecLegende(g.cols, g.cases)).toBe(false)
    expect(avecLegende(4, 16)).toBe(true)
  })

  it('refuse la légende aux grilles plus denses qu\'on pourrait ajouter', () => {
    // La règle doit tenir toute seule pour une taille qui n'existe pas encore :
    // au-delà de quatre colonnes la case est trop étroite pour un nom lisible.
    expect(avecLegende(5, 25)).toBe(false)
    expect(avecLegende(5, 15)).toBe(false)
    expect(avecLegende(6, 36)).toBe(false)
  })

  it('ne divise jamais par zéro', () => {
    // Une grille sans colonne n'existe pas, mais un composant qui rend NaN si.
    expect(avecLegende(0, 12)).toBe(false)
    expect(avecLegende(3, 0)).toBe(true)
  })
})
