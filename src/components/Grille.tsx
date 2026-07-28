import { useEffect, useRef, useState } from 'react'
import type { Cellule } from '../api'
import { useTaillesAjustees } from '../lib/ajuster'

// Au-delà de ce rapport hauteur/largeur, la grille ne ressemble plus à un
// carton de bingo mais à une colonne de dominos. On préfère un peu d'air
// autour de la grille à des cases étirées.
const RATIO_MAX = 1.3
const ECART = 6 // gap-1.5, en px

// Une case = un groupe, jamais un titre. Le titre qui passe est le moyen de
// reconnaître le groupe : l'afficher ici donnerait la réponse.

/**
 * Estimation de repli, en `cqw`, tant que la mesure réelle n'a pas eu lieu
 * (premier rendu, ou navigateur sans ResizeObserver). Calée sur la chasse
 * d'Anton en capitales : un mot de n lettres tient tant que la police fait au
 * plus 200/n cqw, dont on garde une marge.
 *
 * Ce n'est qu'un point de départ : `useTaillesAjustees` mesure ensuite le
 * texte dans les deux dimensions et remplace cette valeur.
 */
export function tailleTexte(nom: string): number {
  const motLePlusLong = Math.max(...nom.split(/\s+/).map((mot) => mot.length), 1)
  return Math.min(34, Math.max(11, 175 / motLePlusLong))
}

/**
 * Faut-il doubler le logo d'une micro-légende portant le nom du groupe ?
 *
 * Un logo rend la grille plus belle, et le jeu plus dur : la moitié de la pièce
 * ne reconnaît pas l'emblème des Scorpions, et une case illisible est une case
 * morte. On garde donc le nom partout où il reste de la place.
 *
 * `cols` seul ne suffit pas à trancher : la 4×4 et la 4×5 ont toutes deux
 * quatre colonnes. Ce qui manque sur la 4×5, c'est la hauteur — cinq rangées à
 * caser dans un écran de téléphone. La règle se lit donc sur les deux
 * dimensions, d'où le nombre de cases en second argument.
 */
export function avecLegende(cols: number, nbCases: number): boolean {
  const lignes = Math.ceil(nbCases / cols)
  return cols <= 4 && lignes <= 4
}

function Case({
  cellule,
  taille,
  legende,
}: {
  cellule: Cellule
  taille?: number
  legende: boolean
}) {
  // Le catalogue part sans aucun logo : le mécanisme existe pour qu'on puisse
  // en ajouter plus tard sans toucher une ligne de code. Si le fichier manque,
  // on retombe silencieusement sur le nom typographié — une grille vide en
  // pleine soirée coûte bien plus cher qu'une grille sans logos.
  const [logoCasse, setLogoCasse] = useState(false)
  const logo = cellule.logo && !logoCasse ? `/logos/${cellule.slug}.png` : null

  if (logo) {
    return (
      <span className="cellule-visuel">
        {/* Pas de `loading="lazy"` : les vingt images d'une grille sont toutes
            au-dessus de la ligne de flottaison. Les différer ne ferait que
            retarder l'affichage de ce qu'on regarde déjà. */}
        <img src={logo} alt={cellule.name} className="cellule-logo" onError={() => setLogoCasse(true)} />
        {/* La légende répète l'`alt` de l'image : purement visuelle, elle est
            masquée aux lecteurs d'écran pour ne pas dire le nom deux fois. */}
        {legende && (
          <span className="cellule-legende" aria-hidden="true">
            {cellule.name}
          </span>
        )}
      </span>
    )
  }
  return (
    <span
      className="cellule-nom"
      style={
        taille !== undefined
          ? { fontSize: `${taille}px` }
          : ({ '--taille': tailleTexte(cellule.name) } as React.CSSProperties)
      }
    >
      {cellule.name}
    </span>
  )
}

function Coche() {
  return (
    <svg viewBox="0 0 24 24" className="cellule-coche" aria-hidden="true">
      <path
        d="M4 12.5l5 5L20 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Grille({
  cases,
  coches,
  cols,
  onBasculer,
  joues,
  plein = false,
}: {
  cases: Cellule[]
  coches: boolean[]
  cols: number
  onBasculer?: (index: number) => void
  /** Slugs déjà passés. Fourni uniquement à l'arbitrage : une case cochée dont
   *  le groupe n'est jamais passé saute alors aux yeux du présentateur. */
  joues?: Set<string>
  /** Étire la grille sur la hauteur restante (écran joueur). */
  plein?: boolean
}) {
  const interactive = typeof onBasculer === 'function'
  const grille = useRef<HTMLDivElement>(null)
  const tailles = useTaillesAjustees(
    cases.map((c) => c.name),
    grille,
  )

  // Borne la hauteur de la grille étirée : sans ça, les cases passent à 1:1,9
  // et les trois quarts de chacune sont vides — le vide n'a pas disparu, il a
  // seulement déménagé sous le texte.
  const lignes = Math.ceil(cases.length / cols)
  const legende = avecLegende(cols, cases.length)
  useEffect(() => {
    const el = grille.current
    if (!el || !plein || typeof ResizeObserver === 'undefined') return
    const ajuster = () => {
      const largeurCase = (el.clientWidth - ECART * (cols - 1)) / cols
      el.style.maxHeight = `${Math.round(lignes * largeurCase * RATIO_MAX + ECART * (lignes - 1))}px`
    }
    const observateur = new ResizeObserver(ajuster)
    observateur.observe(el)
    return () => observateur.disconnect()
  }, [plein, cols, lignes])

  return (
    <div
      ref={grille}
      className={`grille${plein ? ' grille--plein' : ''}`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {cases.map((cellule, index) => {
        const cochee = coches[index] === true
        const suspecte = joues !== undefined && cochee && !joues.has(cellule.slug)
        const classes = `cellule${cochee ? ' cellule--cochee' : ''}${suspecte ? ' cellule--suspecte' : ''}`
        const contenu = (
          <>
            {suspecte && (
              <span className="cellule-alerte" aria-label="jamais passé">
                !
              </span>
            )}
            <Case cellule={cellule} taille={tailles?.get(cellule.name)} legende={legende} />
            {cochee && <Coche />}
          </>
        )

        if (!interactive) {
          return (
            <div key={`${cellule.slug}-${index}`} className={classes}>
              {contenu}
            </div>
          )
        }
        return (
          <button
            key={`${cellule.slug}-${index}`}
            type="button"
            className={classes}
            aria-pressed={cochee}
            aria-label={`${cellule.name}${cochee ? ' — cochée' : ''}`}
            onClick={() => onBasculer(index)}
          >
            {contenu}
          </button>
        )
      })}
    </div>
  )
}
