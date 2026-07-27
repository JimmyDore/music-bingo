import { useCallback, useEffect, useRef, useState } from 'react'
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

  // Session invalide (partie purgée, token périmé) : on repart du prénom plutôt
  // que de laisser un écran mort.
  useEffect(() => {
    if (erreur && donnees === null && chargeInitiale.current === false) {
      // 403/404 remontent ici ; une coupure réseau aussi, d'où le délai.
      const id = window.setTimeout(() => {
        if (!chargeInitiale.current) onSessionPerdue()
      }, 4000)
      return () => window.clearTimeout(id)
    }
  }, [erreur, donnees, onSessionPerdue])

  const envoyer = useCallback(
    async (etat: boolean[]) => {
      try {
        await api.enregistrerCoches(session.playerId, session.token, etat)
        setDesynchronise(false)
      } catch {
        setDesynchronise(true)
      }
    },
    [session],
  )

  // Cochage optimiste : l'affichage change instantanément, la synchronisation
  // se fait derrière. Personne n'attend le réseau pour cocher une case.
  const basculer = (index: number) => {
    setCoches((precedent) => {
      const suivant = precedent.map((v, i) => (i === index ? !v : v))
      void envoyer(suivant)
      return suivant
    })
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
    try {
      await api.crierBingo(session.playerId, session.token)
    } catch {
      setReclame(false)
      setDesynchronise(true)
    }
  }

  if (!cases) {
    return (
      <div className="ecran flex min-h-dvh items-center justify-center">
        <p className="text-sm font-semibold text-doux">Récupération de ta grille…</p>
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

      <Grille cases={cases} coches={coches} cols={cols} onBasculer={finie ? undefined : basculer} />

      <p className="mt-3 text-center text-xs text-doux">
        Coche librement — c'est ton carton, personne ne vérifie à ta place.
      </p>

      {!finie && (
        <div className="barre-basse mt-auto">
          {reclame ? (
            <div className="carte border-stabilo bg-stabilo/10 text-center">
              <p className="titre-affiche text-lg text-stabilo">Bingo réclamé !</p>
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
    </div>
  )
}
