// Client HTTP de l'API. Toutes les requêtes passent par `request`, qui remonte
// une erreur exploitable plutôt qu'un `undefined` silencieux : en soirée, une
// panne muette est pire qu'un message d'erreur.

export type Cellule = { slug: string; name: string; logo: string | null }

export type Titre = {
  slug: string
  name: string
  title: string
  youtubeId: string
  startAt: number
}

export type Referentiels = {
  themes: { id: string; name: string; bands: number }[]
  grids: { id: string; label: string; cols: number; rows: number }[]
  winRules: { id: string; label: string }[]
}

export type Partie = {
  code: string
  theme: string
  themeName: string
  rows: number
  cols: number
  winRule: string
  status: 'preparing' | 'ready' | 'ended'
  poolSize: number
  verified: number
}

export type JoueurVu = {
  id: string
  name: string
  card: Cellule[]
  checked: boolean[]
  checkedCount: number
  cells: number
  bingoClaimedAt: string | null
}

export type EtatPartie = {
  code: string
  themeName: string
  rows: number
  cols: number
  winRule: string
  status: Partie['status']
  poolSize: number
  verified: number
  remaining: number
  current: Titre | null
  history: Titre[]
  players: JoueurVu[]
}

export type Joueur = {
  id: string
  name: string
  card: Cellule[]
  checked: boolean[]
  bingoClaimedAt: string | null
  game: {
    code: string
    themeName: string
    rows: number
    cols: number
    winRule: string
    status: Partie['status']
  } | null
}

export class ErreurApi extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
  }
}

async function request<T>(
  method: string,
  path: string,
  options: { body?: unknown; token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.token) headers.Authorization = `Bearer ${options.token}`

  let res: Response
  try {
    res = await fetch(path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  } catch {
    // Mode avion, tunnel, changement de réseau : le poll suivant réessaiera.
    throw new ErreurApi('Connexion perdue', 0)
  }

  const text = await res.text()
  const payload = text ? (JSON.parse(text) as Record<string, unknown>) : {}
  if (!res.ok) {
    throw new ErreurApi(typeof payload.error === 'string' ? payload.error : 'Erreur serveur', res.status)
  }
  return payload as T
}

export const api = {
  referentiels: () => request<Referentiels>('GET', '/api/themes'),

  creerPartie: (body: { theme: string; grid: string; winRule: string }) =>
    request<{ code: string; masterToken: string }>('POST', '/api/games', { body }),

  partie: (code: string) => request<Partie>('GET', `/api/games/${code}`),

  rejoindre: (code: string, name: string) =>
    request<{ playerId: string; token: string; card: Cellule[] }>('POST', `/api/games/${code}/players`, {
      body: { name },
    }),

  joueur: (id: string, token: string) => request<Joueur>('GET', `/api/players/${id}`, { token }),

  enregistrerCoches: (id: string, token: string, checked: boolean[]) =>
    request<{ ok: true }>('PUT', `/api/players/${id}/checks`, { body: { checked }, token }),

  crierBingo: (id: string, token: string) => request<{ ok: true }>('POST', `/api/players/${id}/bingo`, { token }),

  etat: (code: string, token: string) => request<EtatPartie>('GET', `/api/games/${code}/state`, { token }),

  titreSuivant: (code: string, token: string) =>
    request<{ track: Titre | null; remaining: number }>('POST', `/api/games/${code}/next`, { token }),

  terminer: (code: string, token: string) => request<{ ok: true }>('POST', `/api/games/${code}/end`, { token }),

  rejeterBingo: (code: string, token: string, playerId: string) =>
    request<{ ok: true }>('DELETE', `/api/games/${code}/claims/${playerId}`, { token }),
}
