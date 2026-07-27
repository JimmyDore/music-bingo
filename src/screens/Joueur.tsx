import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, ErreurApi, type Cellule } from '../api'
import { Grille } from '../components/Grille'
import { useSondage } from '../lib/poll'
import { ecrireSessionJoueur, lireSessionJoueur, oublierSessionJoueur, type SessionJoueur } from '../storage'

const LIBELLE_REGLE: Record<string, string> = {
  ligne: 'Une ligne',
  'carton-plein': 'Carton plein',
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
  const [meta, setMeta] = useState<{ themeName: string; winRule: string; status: string } | null>(null)
  const [reclame, setReclame] = useState(false)
  const [fete, setFete] = useState(false)
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
      })
    }
  }, [donnees])

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

  const crierBingo = async () => {
    setReclame(true)
    setFete(true)
    window.setTimeout(() => setFete(false), 2600)
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
  const finie = meta?.status === 'ended'

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

      {finie && (
        <p className="carte mb-3 border-menthe text-center text-sm font-bold text-menthe">
          Partie terminée. Merci d'avoir joué !
        </p>
      )}

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
            <button type="button" className="bouton bouton--neon pulse-bingo" onClick={crierBingo}>
              Bingo !
            </button>
          )}
        </div>
      )}

      {fete && <Confettis />}
    </div>
  )
}

/** Crier BINGO est le sommet émotionnel du jeu : il doit s'y passer quelque
 *  chose. Pur CSS, aucune dépendance, et désactivé si l'utilisateur a demandé
 *  moins d'animations. */
function Confettis() {
  const morceaux = useMemo(
    () =>
      Array.from({ length: 44 }, (_, i) => ({
        gauche: (i * 37) % 100,
        delai: (i % 11) * 90,
        duree: 1500 + ((i * 137) % 900),
        couleur: ['#ffd83d', '#ff2e88', '#34e0a1', '#f6f2ff'][i % 4],
        largeur: 5 + (i % 3) * 3,
      })),
    [],
  )

  return (
    <div className="confetti" aria-hidden="true">
      {morceaux.map((m, i) => (
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
