import { describe, expect, it } from 'vitest'
import { lienJoueur, matchRoute } from './router'

describe('matchRoute', () => {
  it('la racine ouvre la création de partie', () => {
    expect(matchRoute('/')).toEqual({ name: 'creation' })
    expect(matchRoute('')).toEqual({ name: 'creation' })
  })

  it('/m/:code ouvre la console présentateur', () => {
    expect(matchRoute('/m/ABCD')).toEqual({ name: 'presentateur', code: 'ABCD' })
    expect(matchRoute('/m/abcd')).toEqual({ name: 'presentateur', code: 'ABCD' })
  })

  it('/:code ouvre l\'écran joueur', () => {
    expect(matchRoute('/ABCD')).toEqual({ name: 'joueur', code: 'ABCD' })
    expect(matchRoute('/xy23')).toEqual({ name: 'joueur', code: 'XY23' })
  })

  it('rejette ce qui ne ressemble pas à un code de partie', () => {
    for (const path of ['/ABC', '/ABCDE', '/hello', '/m/ABC', '/m/ABCD/x', '/a/b/c', '/favicon.ico']) {
      expect(matchRoute(path).name, path).toBe('inconnu')
    }
  })

  it('rejette les caractères ambigus exclus du tirage des codes', () => {
    // I, O, 0 et 1 ne sont jamais générés : une URL qui en contient est fautive.
    for (const path of ['/AB0D', '/AB1D', '/ABID', '/ABOD']) {
      expect(matchRoute(path).name, path).toBe('inconnu')
    }
  })

  it('« m » seul n\'est pas confondu avec un code', () => {
    expect(matchRoute('/m').name).toBe('inconnu')
  })
})

describe('lienJoueur', () => {
  // Le lien du QR code doit toujours retomber sur la route joueur : un QR que
  // notre propre routeur rejette, c'est la soirée qui ne démarre pas.
  it('produit une URL que le routeur reconnaît', () => {
    for (const origine of ['https://bingo.jimmydore.fr', 'https://bingo.jimmydore.fr/', 'http://localhost:5173']) {
      const lien = lienJoueur(origine, 'K7M3')
      expect(matchRoute(new URL(lien).pathname)).toEqual({ name: 'joueur', code: 'K7M3' })
    }
  })

  it('normalise le code en majuscules', () => {
    expect(lienJoueur('https://bingo.jimmydore.fr', 'k7m3')).toBe('https://bingo.jimmydore.fr/K7M3')
  })
})
