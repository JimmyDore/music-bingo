import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type EtatPartie, type JoueurVu, type Titre } from '../api'
import { Grille } from '../components/Grille'
import { QrCode } from '../components/QrCode'
import { useSondage } from '../lib/poll'
import { useVerrouEcran } from '../lib/wakelock'
import { useLecteurYouTube } from '../lib/youtube'
import { lienJoueur, navigate } from '../router'
import { lireTokenPresentateur } from '../storage'

const LIBELLE_REGLE: Record<string, string> = {
  ligne: 'Une ligne',
  'carton-plein': 'Carton plein',
}

export function Presentateur({ code }: { code: string }) {
  const token = lireTokenPresentateur(code)
  if (!token) return <PasLeBonTelephone code={code} />
  return <Console code={code} token={token} />
}

function PasLeBonTelephone({ code }: { code: string }) {
  return (
    <div className="ecran flex min-h-dvh flex-col justify-center text-center">
      <h1 className="titre-affiche text-2xl text-stabilo">Console du présentateur</h1>
      <p className="mt-3 text-sm leading-relaxed text-doux">
        Cet écran n'appartient qu'au téléphone qui a créé la partie&nbsp;
        <strong className="text-texte">{code}</strong>. Si tu es venu jouer, c'est par ici.
      </p>
      <button type="button" className="bouton bouton--neon mt-6" onClick={() => navigate(`/${code}`)}>
        Rejoindre la partie
      </button>
      <button type="button" className="bouton bouton--fantome mt-2" onClick={() => navigate('/')}>
        Créer une nouvelle partie
      </button>
    </div>
  )
}

function Console({ code, token }: { code: string; token: string }) {
  const { donnees: etat, erreur, rafraichir } = useSondage<EtatPartie>(() => api.etat(code, token), 2000)
  const [titre, setTitre] = useState<Titre | null>(null)
  const [enAttente, setEnAttente] = useState(false)
  const [arbitre, setArbitre] = useState<JoueurVu | null>(null)
  const [partageOuvert, setPartageOuvert] = useState(true)
  const [panne, setPanne] = useState<string | null>(null)
  const idCharge = useRef<string | null>(null)

  const lecteur = useLecteurYouTube()
  useVerrouEcran(true)

  // Après un refresh, on retrouve le titre en cours sans le relancer : sur iOS
  // la lecture doit repartir d'un vrai tap, jamais d'un effet.
  useEffect(() => {
    if (titre === null && etat?.current) setTitre(etat.current)
  }, [etat?.current, titre])

  const suivant = useCallback(async () => {
    if (enAttente) return
    setEnAttente(true)
    setPanne(null)
    try {
      const res = await api.titreSuivant(code, token)
      if (res.track) {
        setTitre(res.track)
        setPartageOuvert(false)
        idCharge.current = res.track.youtubeId
        lecteur.charger(res.track.youtubeId, res.track.startAt)
      } else {
        setTitre(null)
      }
      rafraichir()
    } catch {
      // Réseau coupé au moment du tap : on le dit, le titre n'est pas consommé.
      setPanne('Titre suivant impossible à charger. Réessaie.')
    } finally {
      setEnAttente(false)
    }
  }, [code, token, enAttente, lecteur, rafraichir])

  const lecture = useCallback(() => {
    if (!titre) return
    // Premier tap sur un titre restauré après refresh : on le charge ici, dans
    // le geste utilisateur.
    if (idCharge.current !== titre.youtubeId) {
      idCharge.current = titre.youtubeId
      lecteur.charger(titre.youtubeId, titre.startAt)
      return
    }
    lecteur.basculerLecture()
  }, [titre, lecteur])

  const reclamations = etat?.players.filter((p) => p.bingoClaimedAt !== null) ?? []
  const finie = etat?.status === 'ended'
  // `null` tant que le premier sondage n'a pas répondu : sans ça, « Suivant »
  // resterait grisé au chargement, et définitivement si le réseau bronche.
  const restants = etat?.remaining ?? null
  const poolEpuise = restants === 0

  // L'arbitrage se superpose à la console au lieu de la remplacer : le lecteur
  // YouTube reste monté, donc la musique continue pendant qu'on tranche.
  const arbitreVif = arbitre ? (etat?.players.find((p) => p.id === arbitre.id) ?? arbitre) : null

  return (
    <div className="ecran pb-40">
      <header className="flex items-start justify-between gap-3 pb-3">
        <div className="min-w-0">
          <p className="titre-affiche truncate text-lg text-stabilo">{etat?.themeName ?? 'Bingo musical'}</p>
          <p className="text-xs font-bold uppercase tracking-wider text-doux">
            Objectif : {LIBELLE_REGLE[etat?.winRule ?? ''] ?? '…'}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-titre text-2xl font-black tracking-widest text-texte">{code}</p>
          <p className="text-[0.65rem] font-bold uppercase tracking-wider text-doux">{restants} titres restants</p>
        </div>
      </header>

      {/* Contrainte iOS qu'on ne peut pas contourner : autant la dire, et la
          garder sous les yeux pendant toute la partie. */}
      <p className="bandeau-alerte bandeau-alerte--colle mb-3">
        <span aria-hidden="true">⚠</span>
        Ne quitte pas l'app et ne verrouille pas l'écran&nbsp;: la musique s'arrête.
      </p>

      {reclamations.length > 0 && !finie && (
        <div className="mb-3 space-y-2">
          {reclamations.map((joueur) => (
            <button
              key={joueur.id}
              type="button"
              className="bouton bouton--stabilo pulse-bingo"
              onClick={() => setArbitre(joueur)}
            >
              Bingo de {joueur.name} — vérifier
            </button>
          ))}
        </div>
      )}

      {poolEpuise && !finie && (
        <p className="bandeau-alerte mb-3 !border-menthe/50 !bg-menthe/10 !text-menthe">
          <span aria-hidden="true">✓</span>
          Tous les titres sont passés. Arbitre le dernier bingo, puis termine la partie.
        </p>
      )}

      {finie && (
        <div className="carte mb-3 border-menthe text-center">
          <p className="titre-affiche text-xl text-menthe">Partie terminée</p>
          <p className="mt-1 text-xs font-semibold text-doux">
            {etat?.history.length ?? 0} titres joués · {etat?.players.length ?? 0} joueurs
          </p>
          <button type="button" className="bouton bouton--neon mt-4" onClick={() => navigate('/')}>
            Nouvelle partie
          </button>
        </div>
      )}

      <Partage code={code} ouvert={partageOuvert} onBasculer={() => setPartageOuvert((v) => !v)} />

      {/* Le lecteur est visible tel quel : cet écran n'est vu que du présentateur,
          le titre affiché l'aide même à arbitrer. */}
      <section className="mt-3">
        <div className="overflow-hidden rounded-2xl border-2 border-bord bg-black">
          <div className="aspect-video w-full">
            <div ref={lecteur.conteneur} className="h-full w-full" />
          </div>
        </div>
        <div className="mt-2 min-h-10">
          {titre ? (
            <>
              <p className="titre-affiche text-base text-texte">{titre.name}</p>
              <p className="text-sm font-semibold text-doux">{titre.title}</p>
            </>
          ) : (
            <p className="text-sm font-semibold text-doux">
              {poolEpuise && (etat?.history.length ?? 0) > 0
                ? 'Pool épuisé — tous les titres sont passés.'
                : 'Appuie sur Suivant pour lancer le premier titre.'}
            </p>
          )}
          {lecteur.etat.erreur && <p className="mt-1 text-sm font-bold text-neon">{lecteur.etat.erreur}</p>}
          {panne && <p className="mt-1 text-sm font-bold text-neon">{panne}</p>}
        </div>
      </section>

      <section className="mt-5">
        <h2 className="titre-affiche mb-2 text-sm tracking-widest text-doux">
          Joueurs · {etat?.players.length ?? 0}
        </h2>
        {etat && etat.players.length > 0 ? (
          <ul className="space-y-1.5">
            {etat.players.map((joueur) => (
              <li
                key={joueur.id}
                className="flex items-center justify-between gap-3 rounded-xl border-2 border-bord bg-nuit-2 px-3 py-2"
              >
                <span className="min-w-0 truncate font-bold text-texte">{joueur.name}</span>
                <span className="shrink-0 font-titre font-black text-stabilo">
                  {joueur.checkedCount}
                  <span className="text-doux">/{joueur.cells}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-doux">Personne n'a encore rejoint. Montre-leur le QR code.</p>
        )}
      </section>

      <section className="mt-5">
        <h2 className="titre-affiche mb-2 text-sm tracking-widest text-doux">
          Déjà passés · {etat?.history.length ?? 0}
        </h2>
        {etat && etat.history.length > 0 ? (
          <ol className="space-y-1">
            {etat.history.map((t, i) => (
              <li
                key={t.youtubeId}
                className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 odd:bg-nuit-2/60"
              >
                <span className="w-6 shrink-0 text-right font-titre text-xs font-black text-doux">
                  {etat.history.length - i}
                </span>
                <span className="min-w-0">
                  <span className="font-bold text-texte">{t.name}</span>
                  <span className="text-sm text-doux"> — {t.title}</span>
                </span>
              </li>
            ))}
          </ol>
        ) : (
          <p className="text-sm text-doux">L'historique servira à vérifier les réclamations de bingo.</p>
        )}
      </section>

      {!finie && (
        <>
          <div className="mt-8 border-t-2 border-bord pt-4">
            <button
              type="button"
              className="bouton bouton--fantome"
              onClick={async () => {
                if (window.confirm('Terminer la partie pour tout le monde ?')) {
                  await api.terminer(code, token)
                  rafraichir()
                }
              }}
            >
              Terminer la partie
            </button>
          </div>

          {/* Barre de transport : deux boutons, larges, loin de tout le reste. */}
          <div className="fixed inset-x-0 bottom-0 z-30 border-t-2 border-bord bg-nuit/95 backdrop-blur">
            <div
              className="mx-auto flex max-w-lg gap-2 px-4 pt-3"
              style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
            >
              <button
                type="button"
                className="bouton bouton--sombre flex-1"
                onClick={lecture}
                disabled={!titre || !lecteur.etat.pret}
              >
                {lecteur.etat.enLecture ? '❚❚ Pause' : '▶ Play'}
              </button>
              <button
                type="button"
                className="bouton bouton--neon flex-1"
                onClick={suivant}
                disabled={enAttente || poolEpuise}
              >
                {poolEpuise ? 'Fini' : '⏭ Suivant'}
              </button>
            </div>
          </div>
        </>
      )}

      {erreur && (
        <p className="mt-4 text-center text-xs font-semibold text-neon">
          Connexion instable — la console se resynchronise toute seule.
        </p>
      )}

      {etat?.status === 'preparing' && <Preparation code={code} etat={etat} />}

      {arbitreVif && etat && (
        <Arbitrage
          joueur={arbitreVif}
          etat={etat}
          onFermer={() => setArbitre(null)}
          onRejeter={async () => {
            await api.rejeterBingo(code, token, arbitreVif.id)
            setArbitre(null)
            rafraichir()
          }}
          onValider={async () => {
            await api.terminer(code, token)
            setArbitre(null)
            rafraichir()
          }}
        />
      )}
    </div>
  )
}

/**
 * Le serveur vérifie chaque vidéo du pool avant qu'on puisse commencer : une
 * vidéo morte se découvre ici, pas en pleine soirée. « Démarrer » reste
 * verrouillé tant que ce n'est pas fini.
 *
 * C'est une surcouche et non un écran à part : la console reste montée
 * derrière, donc le lecteur YouTube s'initialise pendant l'attente.
 */
function Preparation({ code, etat }: { code: string; etat: EtatPartie }) {
  const total = etat.poolSize
  const faits = etat.verified
  const pourcent = total > 0 ? Math.round((faits / total) * 100) : 0

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-nuit px-4">
      <div className="carte w-full max-w-sm text-center">
        <p className="titre-affiche text-sm tracking-widest text-doux">Partie</p>
        <p className="code-partie mt-1">{code}</p>

        <div className="mt-6">
          <div className="h-3 w-full overflow-hidden rounded-full border-2 border-bord bg-nuit">
            <div
              className="h-full rounded-full bg-menthe transition-[width] duration-300"
              style={{ width: `${pourcent}%` }}
            />
          </div>
          <p className="mt-3 text-sm font-bold text-texte" aria-live="polite">
            {faits} / {total || '…'} titres vérifiés
          </p>
          <p className="mt-1 text-xs text-doux">
            On s'assure que chaque vidéo se lance vraiment avant de commencer.
          </p>
        </div>

        <button type="button" className="bouton bouton--neon mt-6" disabled>
          Vérification…
        </button>
        <p className="mt-3 text-xs text-doux">
          Tu peux rafraîchir cette page sans rien perdre&nbsp;: le code est dans l'adresse.
        </p>
      </div>
    </div>
  )
}

function Partage({ code, ouvert, onBasculer }: { code: string; ouvert: boolean; onBasculer: () => void }) {
  const lien = lienJoueur(window.location.origin, code)
  const [copie, setCopie] = useState(false)

  const copier = async () => {
    try {
      await navigator.clipboard.writeText(lien)
      setCopie(true)
      window.setTimeout(() => setCopie(false), 1800)
    } catch {
      /* pas de presse-papier : le lien reste lisible à l'écran */
    }
  }

  if (!ouvert) {
    return (
      <button type="button" className="bouton bouton--fantome" onClick={onBasculer}>
        Afficher le QR code et le lien
      </button>
    )
  }

  return (
    <section className="carte text-center">
      <p className="titre-affiche text-sm tracking-widest text-doux">Ils rejoignent ici</p>
      <div className="mt-3 flex justify-center">
        <QrCode valeur={lien} />
      </div>
      <p className="code-partie mt-3">{code}</p>
      <p className="mt-1 break-all text-xs font-semibold text-doux">{lien}</p>
      <div className="mt-3 flex gap-2">
        <button type="button" className="bouton bouton--sombre flex-1 text-sm" onClick={copier}>
          {copie ? 'Copié !' : 'Copier le lien'}
        </button>
        <button type="button" className="bouton bouton--sombre flex-1 text-sm" onClick={onBasculer}>
          Masquer
        </button>
      </div>
    </section>
  )
}

/**
 * Arbitrage d'une réclamation. L'app ne tranche pas : elle met sous les yeux du
 * présentateur la grille du joueur et les groupes réellement passés. Le verdict
 * est humain, et rejeter doit rester parfaitement banal.
 */
function Arbitrage({
  joueur,
  etat,
  onFermer,
  onRejeter,
  onValider,
}: {
  joueur: JoueurVu
  etat: EtatPartie
  onFermer: () => void
  onRejeter: () => Promise<void>
  onValider: () => Promise<void>
}) {
  const joues = new Set(etat.history.map((t) => t.slug))
  const cochees = joueur.card.filter((_, i) => joueur.checked[i])
  const suspectes = cochees.filter((c) => !joues.has(c.slug))

  return (
    <div className="fixed inset-0 z-40 overflow-y-auto overscroll-contain bg-nuit" role="dialog" aria-modal="true">
      <div className="ecran pb-40">
      <header className="pb-3 pt-2">
        <button type="button" className="bouton bouton--fantome !justify-start" onClick={onFermer}>
          ← Retour à la console
        </button>
        <h1 className="titre-affiche mt-1 text-2xl text-stabilo">Bingo de {joueur.name}</h1>
        <p className="text-sm font-semibold text-doux">
          {joueur.checkedCount}/{joueur.cells} cases cochées · Objectif&nbsp;:{' '}
          {LIBELLE_REGLE[etat.winRule] ?? etat.winRule}
        </p>
      </header>

      {suspectes.length > 0 ? (
        <p className="bandeau-alerte mb-3 !border-neon/50 !bg-neon/10 !text-neon">
          <span aria-hidden="true">!</span>
          {suspectes.length === 1
            ? '1 case cochée dont le groupe n\'est jamais passé.'
            : `${suspectes.length} cases cochées dont le groupe n'est jamais passé.`}
        </p>
      ) : (
        <p className="bandeau-alerte mb-3 !border-menthe/50 !bg-menthe/10 !text-menthe">
          <span aria-hidden="true">✓</span>
          Toutes les cases cochées correspondent à un groupe passé.
        </p>
      )}

      <Grille cases={joueur.card} coches={joueur.checked} cols={etat.cols} joues={joues} />

      <section className="mt-5">
        <h2 className="titre-affiche mb-2 text-sm tracking-widest text-doux">
          Déjà passés · {etat.history.length}
        </h2>
        <ol className="max-h-64 space-y-1 overflow-y-auto rounded-xl border-2 border-bord bg-nuit-2 p-2">
          {etat.history.map((t) => (
            <li key={t.youtubeId} className="flex items-baseline gap-2 px-1 py-1">
              <span className="font-bold text-texte">{t.name}</span>
              <span className="min-w-0 truncate text-xs text-doux">{t.title}</span>
            </li>
          ))}
        </ol>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-50 border-t-2 border-bord bg-nuit/95 backdrop-blur">
        <div
          className="mx-auto flex max-w-lg items-center gap-6 px-4 pt-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          {/* Rejeter doit être parfaitement banal : la triche est prévue. */}
          <button type="button" className="bouton bouton--sombre flex-1" onClick={() => void onRejeter()}>
            Rejeter
          </button>
          {/* Valider termine la partie pour tout le monde, sans retour arrière.
              D'où l'écart franc avec « Rejeter » et la confirmation : c'est le
              bouton le plus destructeur du jeu, à portée de pouce, à la seconde
              où tout le monde crie. */}
          <button
            type="button"
            className="bouton bouton--stabilo flex-1"
            onClick={() => {
              if (window.confirm(`Bingo validé pour ${joueur.name} ? La partie se termine pour tout le monde.`)) {
                void onValider()
              }
            }}
          >
            Valider
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}
