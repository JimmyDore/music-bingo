import { useEffect } from 'react'

// Empêche l'écran du présentateur de s'éteindre en plein titre.
// Non supporté partout (Safari iOS < 16.4, Firefox) : c'est un bonus, jamais
// une dépendance. Le verrou saute quand l'onglet passe en arrière-plan, on le
// reprend au retour.

type VerrouEcran = { release: () => Promise<void>; released: boolean }

export function useVerrouEcran(actif: boolean): void {
  useEffect(() => {
    if (!actif) return
    const wakeLock = (navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<VerrouEcran> } })
      .wakeLock
    if (!wakeLock) return

    let verrou: VerrouEcran | null = null
    let vivant = true

    const prendre = async () => {
      if (!vivant || document.visibilityState !== 'visible') return
      try {
        verrou = await wakeLock.request('screen')
      } catch {
        /* refusé (batterie faible, permission) : tant pis */
      }
    }

    void prendre()
    document.addEventListener('visibilitychange', prendre)

    return () => {
      vivant = false
      document.removeEventListener('visibilitychange', prendre)
      void verrou?.release().catch(() => {})
    }
  }, [actif])
}
