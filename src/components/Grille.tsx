import { useState } from 'react'
import type { Cellule } from '../api'

// Une case = un groupe, jamais un titre. Le titre qui passe est le moyen de
// reconnaître le groupe : l'afficher ici donnerait la réponse.

function Case({ cellule, cochee }: { cellule: Cellule; cochee: boolean }) {
  // Le catalogue part sans aucun logo : le mécanisme existe pour qu'on puisse
  // en ajouter plus tard sans toucher une ligne de code. Si le fichier manque,
  // on retombe silencieusement sur le nom typographié.
  const [logoCasse, setLogoCasse] = useState(false)
  const logo = cellule.logo && !logoCasse ? `/logos/${cellule.slug}.png` : null

  return (
    <>
      {logo ? (
        <img src={logo} alt={cellule.name} className="cellule-logo" onError={() => setLogoCasse(true)} />
      ) : (
        <span className="cellule-nom">{cellule.name}</span>
      )}
      {cochee && (
        <svg viewBox="0 0 24 24" className="cellule-coche h-4 w-4" aria-hidden="true">
          <path
            d="M4 12.5l5 5L20 6.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </>
  )
}

export function Grille({
  cases,
  coches,
  cols,
  onBasculer,
  joues,
}: {
  cases: Cellule[]
  coches: boolean[]
  cols: number
  onBasculer?: (index: number) => void
  /** Slugs déjà passés. Fourni uniquement à l'arbitrage : une case cochée dont
   *  le groupe n'est jamais passé saute alors aux yeux du présentateur. */
  joues?: Set<string>
}) {
  const interactive = typeof onBasculer === 'function'

  return (
    <div className="grille" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {cases.map((cellule, index) => {
        const cochee = coches[index] === true
        const suspecte = joues !== undefined && cochee && !joues.has(cellule.slug)
        const classes = `cellule${cochee ? ' cellule--cochee' : ''}${suspecte ? ' cellule--suspecte' : ''}`
        const contenu = (
          <>
            <Case cellule={cellule} cochee={cochee} />
            {suspecte && (
              <span className="cellule-alerte" aria-label="jamais passé">
                !
              </span>
            )}
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
