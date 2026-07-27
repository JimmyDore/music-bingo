import { describe, expect, it } from 'vitest'
import catalogue from '../../catalog/rock-pop-punk.json'
import { tailleTexte } from './Grille'

// Chasse moyenne d'une capitale d'Anton, en em. C'est l'hypothèse qui relie la
// taille de police à la largeur occupée par un mot.
const CHASSE = 0.5

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
    for (const band of catalogue.bands) {
      const largeur = tailleTexte(band.name) * motLePlusLong(band.name) * CHASSE
      expect(largeur, `${band.name} déborde (${largeur.toFixed(1)} cqw)`).toBeLessThanOrEqual(100)
    }
  })

  it('aucun nom du catalogue ne tombe sur la taille plancher', () => {
    // Si un nom atteint le plancher, c'est qu'il est trop long pour la formule
    // et qu'il sera rogné : il faut alors le raccourcir dans le catalogue.
    for (const band of catalogue.bands) {
      expect(tailleTexte(band.name), `${band.name} est au plancher`).toBeGreaterThan(11)
    }
  })
})
