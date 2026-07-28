import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ErreurApi, type Cellule } from '../api'
import { Grille } from '../components/Grille'
import { useSondage } from '../lib/poll'
import { casesManquantes } from '../lib/regles'
import {
  ecrireSessionJoueur,
  feteDejaVue,
  lireSessionJoueur,
  marquerFeteVue,
  oublierSessionJoueur,
  type SessionJoueur,
} from '../storage'

const LIBELLE_REGLE: Record<string, string> = {
  ligne: 'Une ligne',
  'carton-plein': 'Carton plein',
}

/** Fin de la phrase « Encore 3 cases … ». Dire ce qui manque plutôt que « règle
 *  non satisfaite » : le joueur doit comprendre en une lecture, en soirée. */
const LIBELLE_MANQUE: Record<string, string> = {
  ligne: 'pour compléter une ligne',
  'carton-plein': 'pour le carton plein',
}

export function Joueur({ code }: { code: string }) {
  const [session, setSession] = useState<SessionJoueur | null>(() => lireSessionJoueur(code))

  if (!session) {
    return (
      <Arrivee
        code={code}
        onRejoint={(s) => {
          ecrireSessionJoueur(code, s)
          setSession(s)
        }}
      />
    )
  }
  return (
    <Partie
      code={code}
      session={session}
      onSessionPerdue={() => {
        oublierSessionJoueur(code)
        setSession(null)
      }}
    />
  )
}

/** Saisie du prénom. Aucun compte, aucun mot de passe : un prénom suffit. */
function Arrivee({ code, onRejoint }: { code: string; onRejoint: (session: SessionJoueur) => void }) {
  const [nom, setNom] = useState('')
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const { donnees: partie } = useSondage(() => api.partie(code), 2000)

  const enPreparation = partie?.status === 'preparing'
  const terminee = partie?.status === 'ended'

  const rejoindre = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!nom.trim() || enCours) return
    setEnCours(true)
    setErreur(null)
    try {
      const res = await api.rejoindre(code, nom)
      onRejoint({ playerId: res.playerId, token: res.token })
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : 'Impossible de rejoindre')
      setEnCours(false)
    }
  }

  return (
    <div className="ecran flex min-h-dvh flex-col justify-center">
      <header className="text-center">
        <div className="inline-block -rotate-2">
          <h1 className="titre-affiche text-5xl text-stabilo">Bingo</h1>
        </div>
        <p className="titre-affiche mt-1 text-base text-neon">Groupes de musiques</p>
        {partie && <p className="mt-3 text-sm font-semibold text-doux">{partie.themeName}</p>}
      </header>

      {terminee ? (
        <p className="carte mt-6 text-center text-sm font-bold text-doux">
          Cette partie est terminée. Demande le code de la prochaine !
        </p>
      ) : (
        <form className="mt-6 space-y-3" onSubmit={rejoindre}>
          <label className="titre-affiche block text-sm tracking-widest text-doux" htmlFor="prenom">
            Ton prénom
          </label>
          <input
            id="prenom"
            className="champ"
            value={nom}
            onChange={(e) => setNom(e.target.value)}
            placeholder="Marie"
            maxLength={24}
            autoComplete="given-name"
            autoFocus
            enterKeyHint="go"
          />
          {erreur && <p className="text-sm font-bold text-neon">{erreur}</p>}
          <button type="submit" className="bouton bouton--neon" disabled={!nom.trim() || enCours || enPreparation}>
            {enPreparation ? 'Préparation en cours…' : enCours ? 'Un instant…' : 'Prendre ma grille'}
          </button>
          {enPreparation && (
            <p className="text-center text-xs text-doux">
              Le présentateur prépare la partie. Ça démarre dans quelques secondes.
            </p>
          )}
        </form>
      )}
    </div>
  )
}

function Partie({
  code,
  session,
  onSessionPerdue,
}: {
  code: string
  session: SessionJoueur
  onSessionPerdue: () => void
}) {
  const [cases, setCases] = useState<Cellule[] | null>(null)
  const [coches, setCoches] = useState<boolean[]>([])
  const [cols, setCols] = useState(4)
  const [meta, setMeta] = useState<{
    themeName: string
    winRule: string
    status: string
    winnerId: string | null
    winnerName: string | null
  } | null>(null)
  const [reclame, setReclame] = useState(false)
  const [fete, setFete] = useState<'gagnant' | 'perdant' | null>(null)
  const [desynchronise, setDesynchronise] = useState(false)
  const chargeInitiale = useRef(false)

  const { donnees, erreur } = useSondage(() => api.joueur(session.playerId, session.token), 3000)

  // Le serveur fait autorité au premier chargement : c'est ce qui restitue la
  // même grille et les mêmes coches après un refresh.
  useEffect(() => {
    if (!donnees) return
    if (!chargeInitiale.current) {
      chargeInitiale.current = true
      setCases(donnees.card)
      setCoches(donnees.checked)
      setCols(donnees.game?.cols ?? 4)
    }
    setReclame(donnees.bingoClaimedAt !== null)
    if (donnees.game) {
      setMeta({
        themeName: donnees.game.themeName,
        winRule: donnees.game.winRule,
        status: donnees.game.status,
        winnerId: donnees.game.winnerId,
        winnerName: donnees.game.winnerName,
      })
    }
  }, [donnees])

  // Le sondage tourne toutes les 3 s : le verdict arrive donc avec jusqu'à 3
  // secondes de retard. Ce n'est pas un défaut — le présentateur l'annonce à
  // voix haute, l'écran ne fait que confirmer ce que la pièce a déjà entendu.
  const finie = meta?.status === 'ended'
  const gagnant = finie && meta?.winnerId === session.playerId
  const perdant = finie && meta?.winnerId != null && !gagnant

  // La fête se voit une fois. L'écran de fin, lui, reste à chaque ouverture :
  // un feu d'artifice rejoué à chaque refresh n'est plus un événement, et des
  // pouces en bas qui recommencent à chaque refresh deviennent une punition.
  useEffect(() => {
    if (!gagnant && !perdant) return
    if (feteDejaVue(code)) return
    marquerFeteVue(code)
    setFete(gagnant ? 'gagnant' : 'perdant')
    if (navigator.vibrate) navigator.vibrate(gagnant ? [30, 40, 30, 40, 140] : 30)
  }, [gagnant, perdant, code])

  // La minuterie vit à part du déclenchement : sans ça, le double-montage de
  // StrictMode annulerait le compte à rebours sans jamais le relancer.
  useEffect(() => {
    if (!fete) return
    const id = window.setTimeout(() => setFete(null), fete === 'gagnant' ? 7000 : 2500)
    return () => window.clearTimeout(id)
  }, [fete])

  // Session réellement invalide (partie purgée après 24 h, token périmé) : on
  // repart du prénom plutôt que de laisser un écran mort.
  //
  // Uniquement sur un verdict ferme du serveur — jamais sur une coupure réseau.
  // Effacer la session d'un joueur parce que le wifi a hoqueté, ce serait lui
  // faire perdre sa grille en pleine soirée pour rien.
  useEffect(() => {
    const ferme = erreur instanceof ErreurApi && (erreur.status === 403 || erreur.status === 404)
    if (ferme && !chargeInitiale.current) onSessionPerdue()
  }, [erreur, onSessionPerdue])

  // Les PUT sont sérialisés : chacun porte le tableau complet, donc deux
  // requêtes en vol peuvent se doubler et laisser le serveur sur une version
  // périmée — c'est cette copie-là que le présentateur lit pour arbitrer.
  // Une seule requête à la fois, et seul le dernier état posté part ensuite.
  const enVol = useRef(false)
  const enAttente = useRef<boolean[] | null>(null)

  const envoyer = useCallback(
    async (etat: boolean[]) => {
      enAttente.current = etat
      if (enVol.current) return
      enVol.current = true
      try {
        while (enAttente.current) {
          const charge = enAttente.current
          enAttente.current = null
          try {
            await api.enregistrerCoches(session.playerId, session.token, charge)
            setDesynchronise(false)
          } catch {
            // On remet la charge en file : la reprise périodique la repostera.
            if (!enAttente.current) enAttente.current = charge
            setDesynchronise(true)
            return
          }
        }
      } finally {
        enVol.current = false
      }
    },
    [session],
  )

  // Cochage optimiste : l'affichage change instantanément, la synchronisation
  // se fait derrière. Personne n'attend le réseau pour cocher une case.
  //
  // La ref porte l'état courant pour que deux taps dans la même frame ne se
  // recouvrent pas — quelqu'un qui coche vingt cases à toute vitesse ne doit
  // pas en perdre une en route.
  const cochesRef = useRef<boolean[]>(coches)
  cochesRef.current = coches

  const basculer = (index: number) => {
    const suivant = cochesRef.current.map((v, i) => (i === index ? !v : v))
    cochesRef.current = suivant
    setCoches(suivant)
    void envoyer(suivant)
    if (navigator.vibrate) navigator.vibrate(12)
  }

  // Retour de réseau après un mode avion : on repousse l'état courant.
  useEffect(() => {
    if (!desynchronise) return
    const reessayer = () => void envoyer(coches)
    const id = window.setInterval(reessayer, 4000)
    window.addEventListener('online', reessayer)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('online', reessayer)
    }
  }, [desynchronise, coches, envoyer])

  // Crier bingo est une réclamation, jamais une victoire : la vibration et la
  // carte « Bingo réclamé ! » suffisent. Les confettis ne tombent qu'à la
  // validation — sinon ils tombaient aussi sur les bingos rejetés dix secondes
  // plus tard, et le feu d'artifice de la victoire n'aurait fait que rejouer un
  // effet déjà vu.
  const crierBingo = async () => {
    setReclame(true)
    if (navigator.vibrate) navigator.vibrate([25, 40, 25, 40, 60])
    try {
      await api.crierBingo(session.playerId, session.token)
    } catch {
      setReclame(false)
      setDesynchronise(true)
    }
  }

  if (!cases) {
    return (
      <div className="ecran flex min-h-dvh flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm font-semibold text-doux">Récupération de ta grille…</p>
        {erreur && (
          <p className="text-xs font-semibold text-neon">
            Connexion difficile — on réessaie tout seul, ne recharge pas.
          </p>
        )}
      </div>
    )
  }

  const total = coches.filter(Boolean).length

  // Garde-fou, pas arbitre : le verdict reste humain (cf. README). Le bouton ne
  // s'ouvre qu'une fois l'objectif atteint sur la grille, ce qui évite au
  // présentateur d'arbitrer des bingos criés à trois cases cochées — l'écran
  // d'arbitrage coupe la musique et suspend toute la pièce pour rien.
  //
  // Ça ne remplace pas l'arbitrage : cocher une case dont le groupe n'est jamais
  // passé reste possible, et c'est toujours le présentateur qui le voit.
  const manquantes = casesManquantes(coches, cols, meta?.winRule ?? '')
  const objectif = manquantes === 0 ? null : LIBELLE_MANQUE[meta?.winRule ?? ''] ?? 'pour gagner'

  return (
    <div className="ecran flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="titre-affiche truncate text-base text-stabilo">{meta?.themeName ?? 'Bingo musical'}</p>
          <p className="text-xs font-bold uppercase tracking-wider text-doux">
            Objectif : {LIBELLE_REGLE[meta?.winRule ?? ''] ?? meta?.winRule}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-titre text-lg font-black text-texte">
            {total}
            <span className="text-doux">/{cases.length}</span>
          </p>
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-doux">{code}</p>
        </div>
      </header>

      {desynchronise && (
        <p className="bandeau-alerte mb-2" role="status">
          <span aria-hidden="true">⚠</span>
          Hors ligne — tes coches sont gardées et repartiront toutes seules.
        </p>
      )}

      {/* Trois fins possibles, et une seule est neutre : une partie peut se
          terminer sans que personne ait gagné, et on ne fête rien dans ce
          cas-là. */}
      {finie &&
        (gagnant ? (
          <div className="carte mb-3 border-stabilo bg-stabilo/10 text-center">
            <p className="titre-affiche text-2xl text-stabilo">Tu as gagné</p>
            <p className="mt-1 text-xs font-semibold text-doux">
              Bingo validé par le présentateur · {total}/{cases.length} cases
            </p>
          </div>
        ) : perdant ? (
          <div className="carte mb-3 text-center">
            <p className="titre-affiche text-xl text-texte">
              {meta?.winnerName ?? 'Quelqu’un'} a gagné
            </p>
            <p className="mt-1 text-xs font-semibold text-doux">
              Toi : {total}/{cases.length} cases cochées. La revanche à la prochaine partie.
            </p>
          </div>
        ) : (
          <p className="carte mb-3 border-menthe text-center text-sm font-bold text-menthe">
            Partie terminée. Merci d'avoir joué !
          </p>
        ))}

      <Grille cases={cases} coches={coches} cols={cols} onBasculer={finie ? undefined : basculer} plein />

      {!finie && (
        <div className="barre-basse">
          {reclame ? (
            <div className="carte fete-bingo border-stabilo bg-stabilo/10 text-center">
              <p className="titre-affiche text-xl text-stabilo">Bingo réclamé !</p>
              <p className="mt-1 text-xs font-semibold text-doux">
                Le présentateur vérifie. Continue de cocher en attendant.
              </p>
            </div>
          ) : (
            <>
              {/* La pulsation ne bat que quand le bouton est vivant : un bouton
                  éteint qui clignote appelle des taps qui ne feront rien. */}
              <button
                type="button"
                className={`bouton bouton--neon${manquantes === 0 ? ' pulse-bingo' : ''}`}
                onClick={crierBingo}
                disabled={manquantes > 0}
              >
                Bingo !
              </button>
              {/* Le compte reste affiché en permanence : c'est ce qui transforme
                  un bouton grisé en objectif, et il descend à chaque case. */}
              {objectif && (
                <p className="mt-2 text-center text-xs font-bold text-doux">
                  {manquantes === 1 ? 'Encore une case' : `Encore ${manquantes} cases`} {objectif}
                </p>
              )}
            </>
          )}
        </div>
      )}

      {fete === 'perdant' && <PluiePouces />}
      {fete === 'gagnant' && (
        <>
          {/* Plein cadre et non une carte de plus : c'est le seul moment du jeu
              où l'écran a le droit de prendre toute la place. Il se ferme au
              tap, et tout seul, pour ne jamais bloquer la grille. */}
          <button type="button" className="ecran-victoire" onClick={() => setFete(null)}>
            {/* Interligne desserré : à 1, l'accent du « É » d'Anton remonte dans
                la ligne du dessus et se colle au « AS ». */}
            <span className="titre-affiche text-6xl leading-[1.12] text-stabilo">
              Tu as
              <br />
              gagné
            </span>
            <span className="text-sm font-bold text-doux">Touche l'écran pour revoir ta grille</span>
          </button>
          {/* Après le panneau, jamais avant : à z-index égal, c'est l'ordre du
              DOM qui tranche, et des confettis derrière un fond opaque ne se
              voient pas. Ils laissent passer le tap (`pointer-events-none`). */}
          <Confettis morceaux={110} dureeBase={2400} fort />
        </>
      )}
    </div>
  )
}

/** Gagner est le sommet émotionnel du jeu : il doit s'y passer quelque chose.
 *  Pur CSS, aucune dépendance, et désactivé si l'utilisateur a demandé moins
 *  d'animations. Huit secondes de jeu par soirée ne justifient ni un canvas ni
 *  un moteur de particules. */
function Confettis({
  morceaux = 44,
  dureeBase = 1500,
  fort = false,
}: {
  morceaux?: number
  dureeBase?: number
  fort?: boolean
}) {
  const pieces = useMemo(
    () =>
      Array.from({ length: morceaux }, (_, i) => ({
        gauche: (i * 37) % 100,
        delai: (i % 11) * 90,
        duree: dureeBase + ((i * 137) % 900),
        couleur: ['#ffd83d', '#ff2e88', '#34e0a1', '#f6f2ff'][i % 4],
        largeur: 5 + (i % 3) * 3,
      })),
    [morceaux, dureeBase],
  )

  return (
    <div className={fort ? 'confetti confetti--fort' : 'confetti'} aria-hidden="true">
      {pieces.map((m, i) => (
        <span
          key={i}
          style={{
            left: `${m.gauche}%`,
            width: `${m.largeur}px`,
            background: m.couleur,
            animationDelay: `${m.delai}ms`,
            animationDuration: `${m.duree}ms`,
          }}
        />
      ))}
    </div>
  )
}

/** Deux secondes et demie de charriage, pas une de plus : au-delà la blague
 *  devient une humiliation, et c'est une soirée entre amis. Les délais et les
 *  durées sont bornés pour que la pluie soit finie avant qu'on la démonte. */
function PluiePouces() {
  const pouces = useMemo(
    () =>
      Array.from({ length: 28 }, (_, i) => ({
        gauche: (i * 53) % 100,
        delai: (i % 7) * 90,
        duree: 1300 + ((i * 211) % 600),
        taille: 1.4 + (i % 3) * 0.5,
      })),
    [],
  )

  return (
    <div className="pluie-pouces" aria-hidden="true">
      {pouces.map((p, i) => (
        <span
          key={i}
          style={{
            left: `${p.gauche}%`,
            fontSize: `${p.taille}rem`,
            animationDelay: `${p.delai}ms`,
            animationDuration: `${p.duree}ms`,
          }}
        >
          👎
        </span>
      ))}
    </div>
  )
}
