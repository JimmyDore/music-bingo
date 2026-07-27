import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import './index.css'
import { navigate, useRoute } from './router'
import { Creation } from './screens/Creation'
import { Joueur } from './screens/Joueur'
import { Presentateur } from './screens/Presentateur'

function App() {
  const route = useRoute()

  switch (route.name) {
    case 'creation':
      return <Creation />
    case 'presentateur':
      return <Presentateur code={route.code} />
    case 'joueur':
      return <Joueur code={route.code} />
    default:
      return <Introuvable />
  }
}

function Introuvable() {
  return (
    <div className="ecran flex min-h-dvh flex-col justify-center text-center">
      <h1 className="titre-affiche text-4xl text-stabilo">Perdu&nbsp;?</h1>
      <p className="mt-3 text-sm leading-relaxed text-doux">
        Ce lien ne correspond à aucune partie. Redemande le code&nbsp;: quatre lettres et chiffres.
      </p>
      <button type="button" className="bouton bouton--neon mt-6" onClick={() => navigate('/')}>
        Créer une partie
      </button>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
