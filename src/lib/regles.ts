// Lecture des règles de victoire côté joueur. Purement local et purement
// consultatif : le serveur ne tranche rien (`WIN_RULES`, server/game.mjs, n'est
// qu'une métadonnée) et le verdict reste humain. Ce module sert uniquement à
// empêcher un bingo manifestement prématuré de partir en réclamation.

/**
 * Combien de cases manquent au joueur pour satisfaire `regle`.
 *
 * Rend 0 dès que la règle est remplie — et aussi dans tous les cas où le front
 * ne sait pas juger : règle inconnue, grille vide, nombre de colonnes absurde.
 * Ce choix n'est pas une négligence, c'est la seule erreur acceptable ici : une
 * réclamation prématurée coûte deux secondes au présentateur, un bouton bloqué
 * à tort coûte sa victoire à un joueur au milieu d'une soirée.
 */
export function casesManquantes(coches: boolean[], cols: number, regle: string): number {
  if (coches.length === 0 || cols <= 0) return 0

  if (regle === 'carton-plein') {
    return coches.filter((c) => !c).length
  }

  if (regle === 'ligne') {
    // « Une ligne » se lit comme le présentateur l'annonce : une rangée
    // horizontale entière. Ni colonne, ni diagonale — sur la 4×5 la diagonale
    // n'existe même pas.
    let meilleur = cols
    for (let debut = 0; debut + cols <= coches.length; debut += cols) {
      let manque = 0
      for (let i = debut; i < debut + cols; i++) if (!coches[i]) manque++
      if (manque < meilleur) meilleur = manque
    }
    return meilleur
  }

  return 0
}

export function regleSatisfaite(coches: boolean[], cols: number, regle: string): boolean {
  return casesManquantes(coches, cols, regle) === 0
}
