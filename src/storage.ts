// Aucun compte, aucun mot de passe : l'identité tient dans un token en
// localStorage. Un refresh doit restituer la même grille — c'est ce fichier qui
// le garantit. Un joueur qui perd sa grille en soirée est un joueur perdu.

const CLE_PRESENTATEUR = 'bingo:master:'
const CLE_JOUEUR = 'bingo:player:'
const CLE_FETE = 'bingo:fete:'

export type SessionJoueur = { playerId: string; token: string }

/** localStorage peut lever (mode privé Safari, quota) : on ne casse jamais le
 *  jeu pour un problème de stockage. */
function lire(cle: string): string | null {
  try {
    return window.localStorage.getItem(cle)
  } catch {
    return null
  }
}

function ecrire(cle: string, valeur: string): void {
  try {
    window.localStorage.setItem(cle, valeur)
  } catch {
    /* tant pis : la session ne survivra pas au refresh */
  }
}

export function lireTokenPresentateur(code: string): string | null {
  return lire(CLE_PRESENTATEUR + code)
}

export function ecrireTokenPresentateur(code: string, token: string): void {
  ecrire(CLE_PRESENTATEUR + code, token)
}

export function lireSessionJoueur(code: string): SessionJoueur | null {
  const brut = lire(CLE_JOUEUR + code)
  if (!brut) return null
  try {
    const data = JSON.parse(brut) as Partial<SessionJoueur>
    if (typeof data.playerId === 'string' && typeof data.token === 'string') {
      return { playerId: data.playerId, token: data.token }
    }
  } catch {
    /* entrée corrompue : on repart d'une page blanche */
  }
  return null
}

export function ecrireSessionJoueur(code: string, session: SessionJoueur): void {
  ecrire(CLE_JOUEUR + code, JSON.stringify(session))
}

export function oublierSessionJoueur(code: string): void {
  try {
    window.localStorage.removeItem(CLE_JOUEUR + code)
  } catch {
    /* ignore */
  }
}

/** La fin de partie se voit à chaque ouverture ; la fête, une seule fois. Un
 *  feu d'artifice rejoué à chaque refresh cesse d'être un événement, et une
 *  pluie de pouces qui recommence à chaque refresh devient une punition.
 *
 *  Si localStorage refuse d'écrire (mode privé Safari), la fête se rejouera :
 *  c'est le bon défaut, on ne prive personne de son moment pour un quota. */
export function feteDejaVue(code: string): boolean {
  return lire(CLE_FETE + code) === '1'
}

export function marquerFeteVue(code: string): void {
  ecrire(CLE_FETE + code, '1')
}
