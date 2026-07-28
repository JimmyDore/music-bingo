import { useEffect, useState } from 'react'
import { api, ErreurApi, type Referentiels } from '../api'
import { navigate } from '../router'
import { ecrireTokenPresentateur } from '../storage'

type Brouillon = { theme: string; grid: string; winRule: string }

export function Creation() {
  const [refs, setRefs] = useState<Referentiels | null>(null)
  const [choix, setChoix] = useState<Brouillon>({ theme: '', grid: '4x5', winRule: 'carton-plein' })
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
      // On part tout de suite sur /m/:code, y compris pendant la vérification
      // des vidéos : le code doit être dans l'URL, sinon un rafraîchissement
      // sur l'écran d'attente renvoie le présentateur au formulaire et la
      // partie est perdue.
      navigate(`/m/${partie.code}`)
    } catch (err) {
      setErreur(err instanceof ErreurApi ? err.message : 'Création impossible')
      setEnCours(false)
    }
  }

  // Le lexique vient du serveur, déjà résolu : un thème de films annonce
  // « 42 films », le thème rock continue d'annoncer « 63 groupes ».
  const themeChoisi = refs?.themes.find((t) => t.id === choix.theme)

  return (
    <div className="ecran">
      <Enseigne />

      {erreur && <p className="carte mt-4 border-neon text-sm font-bold text-neon">{erreur}</p>}

      {!refs ? (
        <p className="mt-8 text-center text-sm font-semibold text-doux">Chargement…</p>
      ) : (
        <div className="mt-5 space-y-5">
          <Bloc titre="Thème" indice={themeChoisi && `${themeChoisi.bands} ${themeChoisi.lexique.cases}`}>
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
