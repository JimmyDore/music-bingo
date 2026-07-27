import { useCallback, useEffect, useRef, useState } from 'react'

// Lecteur YouTube pour la console présentateur.
//
// Construit pour la contrainte la plus dure — iOS :
//  - `playsinline=1`, sinon iOS bascule en plein écran et vole l'interface ;
//  - toute lecture part d'un vrai tap : `playVideo()` sans geste utilisateur
//    échoue silencieusement sur iPhone ;
//  - chaque titre démarre à son `startAt`, jamais sur l'intro.
//
// Ce qu'on ne peut pas contourner : une iframe YouTube ne joue pas en
// arrière-plan sur iOS. C'est dit franchement dans l'UI plutôt que découvert
// en pleine soirée.

/* eslint-disable @typescript-eslint/no-explicit-any */
type Lecteur = any

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement | string, options: unknown) => Lecteur; PlayerState: Record<string, number> }
    onYouTubeIframeAPIReady?: () => void
  }
}

const SRC_API = 'https://www.youtube.com/iframe_api'
let promesseApi: Promise<Window['YT']> | null = null

/** Charge l'IFrame Player API une seule fois pour toute la page. */
export function chargerApiYouTube(): Promise<Window['YT']> {
  if (promesseApi) return promesseApi
  promesseApi = new Promise((resolve, reject) => {
    if (window.YT?.Player) return resolve(window.YT)

    const precedent = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      precedent?.()
      resolve(window.YT)
    }
    if (!document.querySelector(`script[src="${SRC_API}"]`)) {
      const script = document.createElement('script')
      script.src = SRC_API
      script.async = true
      script.onerror = () => reject(new Error('API YouTube injoignable'))
      document.head.appendChild(script)
    }
    setTimeout(() => reject(new Error('API YouTube trop lente')), 15_000)
  })
  return promesseApi
}

export type EtatLecteur = {
  pret: boolean
  enLecture: boolean
  erreur: string | null
}

export function useLecteurYouTube() {
  const conteneur = useRef<HTMLDivElement | null>(null)
  const lecteur = useRef<Lecteur>(null)
  const [etat, setEtat] = useState<EtatLecteur>({ pret: false, enLecture: false, erreur: null })

  useEffect(() => {
    let vivant = true
    chargerApiYouTube()
      .then((YT) => {
        if (!vivant || !conteneur.current || !YT) return
        // L'API remplace l'élément qu'on lui donne par son iframe. On lui livre
        // donc un div créé à la main : React ne connaît que le conteneur, et ne
        // tentera pas de démonter un nœud que YouTube a fait disparaître.
        const cible = document.createElement('div')
        cible.className = 'h-full w-full'
        conteneur.current.replaceChildren(cible)
        lecteur.current = new YT.Player(cible, {
          host: 'https://www.youtube.com',
          playerVars: {
            playsinline: 1, // sans ça, iOS part en plein écran
            rel: 0,
            modestbranding: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: () => vivant && setEtat((e) => ({ ...e, pret: true })),
            onStateChange: (event: { data: number }) => {
              if (!vivant) return
              // 1 = lecture, 3 = mise en mémoire tampon
              setEtat((e) => ({ ...e, enLecture: event.data === 1 || event.data === 3 }))
            },
            onError: () =>
              vivant &&
              setEtat((e) => ({ ...e, erreur: 'Cette vidéo refuse de se lancer — passe au titre suivant.' })),
          },
        })
      })
      .catch((err: Error) => vivant && setEtat((e) => ({ ...e, erreur: err.message })))

    const racine = conteneur.current
    return () => {
      vivant = false
      try {
        lecteur.current?.destroy?.()
      } catch {
        /* le lecteur n'était pas encore prêt */
      }
      lecteur.current = null
      racine?.replaceChildren()
    }
  }, [])

  /** À n'appeler que depuis un gestionnaire de tap : iOS bloque le reste. */
  const charger = useCallback((youtubeId: string, startAt: number) => {
    setEtat((e) => ({ ...e, erreur: null }))
    try {
      lecteur.current?.loadVideoById?.({ videoId: youtubeId, startSeconds: startAt })
    } catch {
      setEtat((e) => ({ ...e, erreur: 'Lecture impossible' }))
    }
  }, [])

  const basculerLecture = useCallback(() => {
    const l = lecteur.current
    if (!l) return
    try {
      if (etat.enLecture) l.pauseVideo?.()
      else l.playVideo?.()
    } catch {
      /* ignore : le bouton Suivant reste disponible */
    }
  }, [etat.enLecture])

  return { conteneur, etat, charger, basculerLecture }
}
