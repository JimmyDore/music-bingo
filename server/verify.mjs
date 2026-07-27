import { listTracks, markVerified, replaceTrack, setGameStatus } from './db.mjs';
import { shuffle } from './game.mjs';

// Le catalogue est vérifié en CI, mais une vidéo peut disparaître entre deux
// commits. On revérifie donc le pool à la préparation de chaque partie : c'est
// 40 requêtes, ça prend quelques secondes, et ça évite le silence gênant.

const OEMBED = 'https://www.youtube.com/oembed';

/** true si la vidéo existe ET est embarquable. Gratuit, sans clé ni quota. */
export async function checkEmbeddable(youtubeId, fetchImpl = fetch) {
  const url = `${OEMBED}?url=https://www.youtube.com/watch?v=${youtubeId}&format=json`;
  try {
    const res = await fetchImpl(url);
    return res.status === 200;
  } catch {
    // Coupure réseau : on ne condamne pas la vidéo sur un faux négatif,
    // l'appelant réessaiera.
    return null;
  }
}

/** Cherche un remplaçant jouable : d'abord un autre titre du même groupe,
 *  puis un groupe encore inutilisé dans cette partie. */
async function findReplacement(track, bands, usedSlugs, usedIds, fetchImpl, rng) {
  const sameBand = bands.find((b) => b.slug === track.slug);
  const candidates = [];
  if (sameBand) {
    for (const t of sameBand.tracks) {
      if (t.youtubeId !== track.youtubeId && !usedIds.has(t.youtubeId)) {
        candidates.push({ slug: sameBand.slug, name: sameBand.name, logo: sameBand.logo ?? null, ...t });
      }
    }
  }
  for (const band of shuffle(bands, rng)) {
    if (usedSlugs.has(band.slug)) continue;
    for (const t of shuffle(band.tracks, rng)) {
      candidates.push({ slug: band.slug, name: band.name, logo: band.logo ?? null, ...t });
    }
  }
  for (const candidate of candidates) {
    if (await checkEmbeddable(candidate.youtubeId, fetchImpl)) return candidate;
  }
  return null;
}

/**
 * Vérifie tout le pool d'une partie et passe son statut à `ready`.
 * Les titres injouables sont remplacés en place : le pool garde sa taille,
 * sinon des grilles tirées dessus deviendraient ingagnables.
 */
export async function prepareGame(db, code, bands, { fetchImpl = fetch, rng = Math.random, onError } = {}) {
  const tracks = listTracks(db, code);
  const usedSlugs = new Set(tracks.map((t) => t.slug));
  const usedIds = new Set(tracks.map((t) => t.youtubeId));

  for (const track of tracks) {
    let ok = await checkEmbeddable(track.youtubeId, fetchImpl);
    if (ok === null) ok = await checkEmbeddable(track.youtubeId, fetchImpl); // un retry pour les faux négatifs réseau

    if (ok) {
      markVerified(db, code, track.position);
      continue;
    }

    const replacement = await findReplacement(track, bands, usedSlugs, usedIds, fetchImpl, rng);
    if (replacement) {
      usedSlugs.delete(track.slug);
      usedSlugs.add(replacement.slug);
      usedIds.delete(track.youtubeId);
      usedIds.add(replacement.youtubeId);
      replaceTrack(db, code, track.position, replacement);
      markVerified(db, code, track.position);
      onError?.(`titre remplacé : ${track.name} — ${track.title} → ${replacement.name} — ${replacement.title}`);
    } else {
      // Aucun remplaçant : on marque quand même vérifié pour ne pas bloquer la
      // partie. Le présentateur passera au suivant, c'est un titre perdu sur 40.
      markVerified(db, code, track.position);
      onError?.(`aucun remplaçant pour ${track.name} — ${track.title}`);
    }
  }
  setGameStatus(db, code, 'ready');
}
