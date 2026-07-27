import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Un thème = un fichier JSON dans catalog/. Ajouter un thème n'exige aucun
// changement de code : le dossier est relu au démarrage, c'est tout.
// Les fichiers commençant par « _ » sont ignorés (lots de travail intermédiaires).

/** Charge tous les thèmes du dossier. Lève si un fichier est invalide. */
export function loadCatalog(dir) {
  const themes = new Map();
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith('.json') || file.startsWith('_')) continue;
    const theme = parseTheme(readFileSync(join(dir, file), 'utf8'), file);
    themes.set(theme.id, theme);
  }
  if (themes.size === 0) throw new Error(`aucun thème trouvé dans ${dir}`);
  return themes;
}

/** Valide la structure d'un thème. Un catalogue cassé doit exploser au boot,
 *  pas en pleine soirée. */
export function parseTheme(raw, label = 'thème') {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(`${label} : JSON illisible`);
  }
  if (typeof data?.id !== 'string' || !data.id) throw new Error(`${label} : id manquant`);
  if (typeof data?.name !== 'string' || !data.name) throw new Error(`${label} : name manquant`);
  if (!Array.isArray(data.bands) || data.bands.length === 0) throw new Error(`${label} : bands vide`);

  const slugs = new Set();
  for (const band of data.bands) {
    if (typeof band?.slug !== 'string' || !/^[a-z0-9-]+$/.test(band.slug)) {
      throw new Error(`${label} : slug invalide (${band?.slug})`);
    }
    if (slugs.has(band.slug)) throw new Error(`${label} : slug en double (${band.slug})`);
    slugs.add(band.slug);
    if (typeof band.name !== 'string' || !band.name) throw new Error(`${label} : name manquant (${band.slug})`);
    if (band.logo !== null && typeof band.logo !== 'string') {
      throw new Error(`${label} : logo invalide (${band.slug})`);
    }
    if (!Array.isArray(band.tracks) || band.tracks.length === 0) {
      throw new Error(`${label} : aucun titre pour ${band.slug}`);
    }
    for (const track of band.tracks) {
      if (typeof track?.title !== 'string' || !track.title) {
        throw new Error(`${label} : titre manquant (${band.slug})`);
      }
      if (typeof track.youtubeId !== 'string' || !/^[\w-]{11}$/.test(track.youtubeId)) {
        throw new Error(`${label} : youtubeId invalide (${band.slug} / ${track.title})`);
      }
      // startAt à 0 = on tombe sur l'intro, personne ne reconnaît le morceau.
      if (!Number.isInteger(track.startAt) || track.startAt <= 0) {
        throw new Error(`${label} : startAt invalide (${band.slug} / ${track.title})`);
      }
    }
  }
  return data;
}

/** Résumé exposé à l'UI de création : de quoi peupler le sélecteur de thème. */
export function themeSummaries(themes) {
  return [...themes.values()].map((t) => ({ id: t.id, name: t.name, bands: t.bands.length }));
}
