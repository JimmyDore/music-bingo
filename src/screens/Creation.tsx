import { useEffect, useState } from 'react'
import { api, ErreurApi, type Referentiels } from '../api'
import { navigate } from '../router'
import { ecrireTokenPresentateur } from '../storage'
import { useSondage } from '../lib/poll'

type Brouillon = { theme: string; grid: string; winRule: string }

export function Creation() {
  const [refs, setRefs] = useState<Referentiels | null>(null)
  const [choix, setChoix] = useState<Brouillon>({ theme: '', grid: '4x5', winRule: 'carton-plein' })
  const [code, setCode] = useState<string | null>(null)
  const [enCours, setEnCours] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    api
      .referentiels()
      .then((data) => {
        setRefs(data)
        setChoix((c) => ({ ...c, theme: c.theme || (data.themes[0]?.id ?? '') }))
      })
      .catch(() => setErreur('Impossible de charger les thèmes. Recharge la page.'))
  }, [])

  const creer = async () => {
    setEnCours(true)
    setErreur(null)
    try {
      const partie = await api.creerPartie(choix)
      ecrireTokenPresentateur(partie.code, partie.masterToken)
      setCode(partie.code)
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : 'Création impossible')
      setEnCours(false)
    }
  }

  if (code) return <Preparation code={code} />

  return (
    <div className="ecran">
      <Enseigne />

      {erreur && <p className="carte mt-4 border-neon text-sm font-bold text-neon">{erreur}</p>}

      {!refs ? (
        <p className="mt-8 text-center text-sm font-semibold text-doux">Chargement…</p>
      ) : (
        <div className="mt-5 space-y-5">
          <Bloc titre="Thème" indice={`${refs.themes.find((t) => t.id === choix.theme)?.bands ?? 0} groupes`}>
            {refs.themes.length === 1 ? (
              // Un seul thème : c'est une information, pas un choix. Un bouton
              // « sélectionné » tout seul fait croire à une option qui n'existe pas.
              <p className="titre-affiche text-2xl text-texte">{refs.themes[0].name}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {refs.themes.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    className="choix"
                    aria-pressed={choix.theme === theme.id}
                    onClick={() => setChoix((c) => ({ ...c, theme: theme.id }))}
                  >
                    <span className="choix-titre">{theme.name}</span>
                  </button>
                ))}
              </div>
            )}
          </Bloc>

          <Bloc titre="Grille">
            <div className="flex gap-2">
              {refs.grids.map((grid) => (
                <button
                  key={grid.id}
                  type="button"
                  className="choix"
                  aria-pressed={choix.grid === grid.id}
                  onClick={() => setChoix((c) => ({ ...c, grid: grid.id }))}
                >
                  <span className="choix-titre">{grid.label}</span>
                  <span className="choix-detail">{grid.cols * grid.rows} cases</span>
                </button>
              ))}
            </div>
          </Bloc>

          <Bloc titre="Objectif">
            <div className="flex gap-2">
              {refs.winRules.map((regle) => (
                <button
                  key={regle.id}
                  type="button"
                  className="choix"
                  aria-pressed={choix.winRule === regle.id}
                  onClick={() => setChoix((c) => ({ ...c, winRule: regle.id }))}
                >
                  <span className="choix-titre">{regle.label}</span>
                  <span className="choix-detail">{regle.id === 'ligne' ? '~15 min' : '~35 min'}</span>
                </button>
              ))}
            </div>
          </Bloc>

          <button type="button" className="bouton bouton--neon" onClick={creer} disabled={enCours || !choix.theme}>
            {enCours ? 'Création…' : 'Créer la partie'}
          </button>

          <p className="text-center text-xs leading-relaxed text-doux">
            Tu seras le présentateur : tu lances la musique depuis ce téléphone,
            les autres cochent depuis le leur.
          </p>
        </div>
      )}
    </div>
  )
}

function Enseigne() {
  return (
    <header className="pt-6 text-center">
      <div className="inline-block -rotate-2">
        <h1 className="titre-affiche text-6xl text-stabilo drop-shadow-[0_0_30px_rgba(255,216,61,0.35)]">Bingo</h1>
      </div>
      <p className="titre-affiche mt-1 text-lg text-neon">Groupes de musiques</p>
      <p className="mt-3 text-sm font-semibold text-doux">
        Le blind test qui se joue sur la table du salon.
      </p>
    </header>
  )
}

function Bloc({ titre, indice, children }: { titre: string; indice?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="titre-affiche text-sm tracking-widest text-doux">{titre}</h2>
        {indice && <span className="text-xs font-bold text-doux/70">{indice}</span>}
      </div>
      {children}
    </section>
  )
}

/**
 * Écran d'attente : le serveur vérifie chaque vidéo du pool. « Démarrer » reste
 * verrouillé tant que ce n'est pas fini — une vidéo morte se découvre ici, pas
 * en pleine soirée.
 */
function Preparation({ code }: { code: string }) {
  const [prete, setPrete] = useState(false)
  // On arrête de sonder dès que c'est prêt : inutile de marteler l'API pendant
  // que le présentateur montre le QR code.
  const { donnees, erreur } = useSondage(() => api.partie(code), 700, !prete)
  useEffect(() => {
    if (donnees?.status === 'ready') setPrete(true)
  }, [donnees?.status])

  const total = donnees?.poolSize ?? 0
  const faits = donnees?.verified ?? 0
  const pourcent = total > 0 ? Math.round((faits / total) * 100) : 0

  return (
    <div className="ecran flex min-h-dvh flex-col justify-center">
      <div className="carte text-center">
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
            {prete ? `${total} titres vérifiés` : `${faits} / ${total || '…'} titres vérifiés`}
          </p>
          <p className="mt-1 text-xs text-doux">
            On s'assure que chaque vidéo se lance vraiment avant de commencer.
          </p>
          {erreur && !prete && (
            <p className="mt-2 text-xs font-bold text-neon">
              Connexion difficile — on continue d'essayer. Note le code&nbsp;: {code}
            </p>
          )}
        </div>

        <button
          type="button"
          className="bouton bouton--neon mt-6"
          disabled={!prete}
          onClick={() => navigate(`/m/${code}`)}
        >
          {prete ? 'Démarrer' : 'Vérification…'}
        </button>
      </div>
    </div>
  )
}
