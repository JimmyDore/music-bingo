import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ecrireSessionJoueur,
  ecrireTokenPresentateur,
  lireSessionJoueur,
  lireTokenPresentateur,
  oublierSessionJoueur,
} from './storage'

/** localStorage minimal : l'environnement de test vitest est `node`. */
function faussLocalStorage() {
  const donnees = new Map<string, string>()
  return {
    getItem: (k: string) => donnees.get(k) ?? null,
    setItem: (k: string, v: string) => void donnees.set(k, v),
    removeItem: (k: string) => void donnees.delete(k),
    donnees,
  }
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: faussLocalStorage() })
})

describe('session du présentateur', () => {
  it('conserve le token par code de partie', () => {
    ecrireTokenPresentateur('ABCD', 'jeton-a')
    ecrireTokenPresentateur('WXYZ', 'jeton-b')
    expect(lireTokenPresentateur('ABCD')).toBe('jeton-a')
    expect(lireTokenPresentateur('WXYZ')).toBe('jeton-b')
  })

  it('rend null pour une partie inconnue', () => {
    expect(lireTokenPresentateur('ABCD')).toBeNull()
  })
})

describe('session du joueur', () => {
  it('restitue la session après un refresh', () => {
    ecrireSessionJoueur('ABCD', { playerId: 'p1', token: 't1' })
    expect(lireSessionJoueur('ABCD')).toEqual({ playerId: 'p1', token: 't1' })
  })

  it('ne mélange pas deux parties simultanées', () => {
    ecrireSessionJoueur('ABCD', { playerId: 'p1', token: 't1' })
    ecrireSessionJoueur('WXYZ', { playerId: 'p2', token: 't2' })
    expect(lireSessionJoueur('ABCD')?.playerId).toBe('p1')
    expect(lireSessionJoueur('WXYZ')?.playerId).toBe('p2')
  })

  it('ignore une entrée corrompue plutôt que de planter', () => {
    window.localStorage.setItem('bingo:player:ABCD', 'pas du json')
    expect(lireSessionJoueur('ABCD')).toBeNull()
    window.localStorage.setItem('bingo:player:ABCD', '{"playerId":"p1"}')
    expect(lireSessionJoueur('ABCD')).toBeNull()
  })

  it('oublie une session périmée', () => {
    ecrireSessionJoueur('ABCD', { playerId: 'p1', token: 't1' })
    oublierSessionJoueur('ABCD')
    expect(lireSessionJoueur('ABCD')).toBeNull()
  })

  it('ne casse pas le jeu si localStorage refuse d\'écrire', () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: () => {
          throw new Error('mode privé')
        },
        setItem: () => {
          throw new Error('quota dépassé')
        },
        removeItem: () => {
          throw new Error('non')
        },
      },
    })
    expect(() => ecrireSessionJoueur('ABCD', { playerId: 'p1', token: 't1' })).not.toThrow()
    expect(lireSessionJoueur('ABCD')).toBeNull()
    expect(() => oublierSessionJoueur('ABCD')).not.toThrow()
  })
})
