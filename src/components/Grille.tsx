import { useState } from 'react'
import type { Cellule } from '../api'

// Une case = un groupe, jamais un titre. Le titre qui passe est le moyen de
// reconnaître le groupe : l'afficher ici donnerait la réponse.

/**
 * Multiplicateur de taille de police pour une case, en `cqw`.
 *
 * On dimensionne sur le mot le plus long, pas sur la longueur totale : c'est
 * lui qui fixe la largeur minimale, puisqu'on ne coupe jamais à l'intérieur
 * d'un mot. « KORN » a donc droit à de grosses lettres, « Rage Against the
 * Machine » se contente de ce qu'il faut et prend quatre lignes.
 *
 * 175 vient de la chasse d'Anton en capitales (~0,5 em par lettre) : un mot de
 * n lettres tient dans la case tant que la police fait au plus 200/n cqw, dont
 * on garde une marge.
 */
export function tailleTexte(nom: string): number {
  const motLePlusLong = Math.max(...nom.split(/\s+/).map((mot) => mot.length), 1)
  return Math.min(34, Math.max(11, 175 / motLePlusLong))
}

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
        <span
          className="cellule-nom"
          style={{ '--taille': tailleTexte(cellule.name) } as React.CSSProperties}
        >
          {cellule.name}
        </span>
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
  plein = false,
}: {
  cases: Cellule[]
  coches: boolean[]
  cols: number
  onBasculer?: (index: number) => void
  /** Slugs déjà passés. Fourni uniquement à l'arbitrage : une case cochée dont
   *  le groupe n'est jamais passé saute alors aux yeux du présentateur. */
  joues?: Set<string>
  /** Étire la grille sur toute la hauteur restante (écran joueur). */
  plein?: boolean
}) {
  const interactive = typeof onBasculer === 'function'

  return (
    <div
      className={`grille${plein ? ' grille--plein' : ''}`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
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
