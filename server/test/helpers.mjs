import { openDb } from '../db.mjs';
import { createApp } from '../index.mjs';
import { prepareGame } from '../verify.mjs';

/** Catalogue synthétique : 50 groupes × 3 titres, de quoi remplir un pool de 40. */
export function fakeThemes(bandCount = 50) {
  const bands = [];
  for (let i = 0; i < bandCount; i++) {
    const slug = `groupe-${String(i).padStart(2, '0')}`;
    bands.push({
      slug,
      name: `Groupe ${i}`,
      logo: null,
      tracks: [0, 1, 2].map((t) => ({
        title: `Titre ${i}-${t}`,
        // 11 caractères, comme un vrai id YouTube
        youtubeId: `id${String(i).padStart(4, '0')}${String(t).padStart(5, '0')}`,
        startAt: 30 + t,
      })),
    });
  }
  return new Map([['test', { id: 'test', name: 'Thème de test', bands }]]);
}

/** fetch bouchonné : tout est embarquable, sauf les ids listés dans `broken`. */
export function fakeFetch(broken = new Set()) {
  return async (url) => {
    const id = new URL(url).searchParams.get('url').split('v=')[1];
    return { status: broken.has(id) ? 401 : 200 };
  };
}

/** Générateur pseudo-aléatoire déterministe (mulberry32). */
export function seeded(seed = 42) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Démarre l'API sur un port libre et rend un client HTTP minimal. */
export async function startApp({ themes = fakeThemes(), broken = new Set(), rng } = {}) {
  const db = openDb(':memory:');
  const fetchImpl = fakeFetch(broken);
  const server = createApp(db, themes, {
    rng,
    prepare: (code, bands) => prepareGame(db, code, bands, { fetchImpl, rng: rng ?? Math.random }),
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, path, { body, token } = {}) => {
    const headers = {};
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  };

  return {
    db,
    base,
    call,
    close: () => new Promise((resolve) => server.close(resolve)),
    /** Crée une partie et attend la fin de la vérification des vidéos. */
    async createGame({ grid = '4x5', winRule = 'carton-plein', theme = 'test' } = {}) {
      const created = await call('POST', '/api/games', { body: { theme, grid, winRule } });
      const { code, masterToken } = created.body;
      for (let i = 0; i < 200; i++) {
        const state = await call('GET', `/api/games/${code}`);
        if (state.body.status === 'ready') break;
        await new Promise((r) => setTimeout(r, 10));
      }
      return { code, masterToken };
    },
  };
}
