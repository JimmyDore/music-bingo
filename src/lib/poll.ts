import { useEffect, useRef, useState } from 'react'

// Polling plutôt que SSE, volontairement.
//
// Le téléphone du présentateur va passer du wifi à la 4G, se mettre en veille,
// changer de pièce. Un poll sans état se rétablit tout seul ; un flux SSE mort
// s'arrête en silence et personne ne le voit avant qu'il soit trop tard.

/** `erreur` porte l'objet et non son message : l'appelant doit pouvoir
 *  distinguer une coupure réseau (status 0) d'un token refusé (403). */
export type Sondage<T> = { donnees: T | null; erreur: Error | null; rafraichir: () => void }

export function useSondage<T>(charger: () => Promise<T>, intervalle: number, actif = true): Sondage<T> {
  const [donnees, setDonnees] = useState<T | null>(null)
  const [erreur, setErreur] = useState<Error | null>(null)
  const [tic, setTic] = useState(0)
  const chargerRef = useRef(charger)
  chargerRef.current = charger

  useEffect(() => {
    if (!actif) return
    let vivant = true

    const tour = async () => {
      try {
        const resultat = await chargerRef.current()
        if (!vivant) return
        setDonnees(resultat)
        setErreur(null)
      } catch (err) {
        // On garde les dernières données à l'écran : mieux vaut un état d'il y
        // a deux secondes qu'un écran vide au milieu d'une partie.
        if (vivant) setErreur(err instanceof Error ? err : new Error('Erreur'))
      }
    }

    void tour()
    const id = window.setInterval(tour, intervalle)
    // Retour d'un mode avion ou d'une mise en veille : on resynchronise tout de
    // suite plutôt que d'attendre le prochain tour.
    const auRetour = () => document.visibilityState === 'visible' && void tour()
    document.addEventListener('visibilitychange', auRetour)
    window.addEventListener('online', auRetour)

    return () => {
      vivant = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', auRetour)
      window.removeEventListener('online', auRetour)
    }
  }, [intervalle, actif, tic])

  return { donnees, erreur, rafraichir: () => setTic((t) => t + 1) }
}
