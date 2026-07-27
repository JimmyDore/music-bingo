import { useEffect, useState } from 'react'

// Mini-routeur : le jeu a trois routes, React Router serait plus gros que
// l'application. On écoute `popstate` et un événement maison pour les
// navigations programmatiques.

export type Route =
  | { name: 'creation' }
  | { name: 'presentateur'; code: string }
  | { name: 'joueur'; code: string }
  | { name: 'inconnu' }

const NAVIGATION = 'bingo:navigation'

export function matchRoute(pathname: string): Route {
  const seg = pathname.split('/').filter(Boolean)
  if (seg.length === 0) return { name: 'creation' }
  if (seg.length === 2 && seg[0] === 'm' && isCode(seg[1])) {
    return { name: 'presentateur', code: seg[1].toUpperCase() }
  }
  if (seg.length === 1 && isCode(seg[0])) return { name: 'joueur', code: seg[0].toUpperCase() }
  return { name: 'inconnu' }
}

/** Un code de partie : 4 caractères de l'alphabet sans I, O, 0 ni 1. */
function isCode(value: string): boolean {
  return /^[abcdefghjklmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/.test(value)
}

/** Le lien qu'on partage aux joueurs (QR code et copier-coller). Il doit
 *  toujours retomber sur la route joueur : un QR illisible par notre propre
 *  routeur, c'est la soirée qui ne démarre pas. */
export function lienJoueur(origine: string, code: string): string {
  return `${origine.replace(/\/+$/, '')}/${code.toUpperCase()}`
}

export function navigate(path: string): void {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new Event(NAVIGATION))
}

export function useRoute(): Route {
  const [route, setRoute] = useState<Route>(() => matchRoute(window.location.pathname))

  useEffect(() => {
    const sync = () => setRoute(matchRoute(window.location.pathname))
    window.addEventListener('popstate', sync)
    window.addEventListener(NAVIGATION, sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener(NAVIGATION, sync)
    }
  }, [])

  return route
}
