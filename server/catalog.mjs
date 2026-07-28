import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Un thème = un fichier JSON dans catalog/. Ajouter un thème n'exige aucun
// changement de code : le dossier est relu au démarrage, c'est tout.
// Les fichiers commençant par « _ » sont ignorés (lots de travail intermédiaires).

/** Les seuls genres de thème que le jeu connaît. `kind` ne pilote que trois
 *  choses : le lexique, la sévérité de la vérification du catalogue, et la
 *  présence du bouton « Rejouer » sur la console. Le bingo, lui, ne change pas —
 *  c'est le même jeu avec un autre catalogue. */
export const KINDS = ['musique', 'pub', 'replique'];

/** Le vocabulaire par défaut est celui d'un thème musical : c'est le seul qui
 *  existait, et rien ne doit bouger à l'écran sur ces thèmes-là. */
const LEXIQUE_DEFAUT = { case: 'groupe', cases: 'groupes', titre: 'titre' };
const CLES_LEXIQUE = Object.keys(LEXIQUE_DEFAUT);

/** Le lexique résolu, défauts compris. Il est appliqué ici et jamais côté front :
 *  l'interface n'a pas à connaître le mot « groupe » pour l'afficher. */
export function lexiqueDe(theme) {
  return { ...LEXIQUE_DEFAUT, ...(theme?.lexique ?? null) };
}

/** Un thème sans `kind` est un thème musical : le catalogue existant n'a rien à
 *  déclarer pour continuer à marcher. */
export function kindDe(theme) {
  return theme?.kind ?? 'musique';
}

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
  if (data.kind !== undefined && !KINDS.includes(data.kind)) {
    throw new Error(`${label} : kind invalide (${data.kind})`);
  }
  if (data.lexique != null) {
    if (typeof data.lexique !== 'object' || Array.isArray(data.lexique)) {
      throw new Error(`${label} : lexique invalide`);
    }
    for (const [cle, mot] of Object.entries(data.lexique)) {
      // Une clé inconnue ne ferait rien du tout : la faute de frappe se
      // découvrirait en soirée, en lisant « groupe » sur un thème de films.
      if (!CLES_LEXIQUE.includes(cle)) throw new Error(`${label} : lexique, clé inconnue (${cle})`);
      if (typeof mot !== 'string' || !mot.trim()) throw new Error(`${label} : lexique.${cle} vide`);
    }
  }

  // Comme `alias` : deux réglages que seul `tools/verify-catalog.mjs` consomme,
  // mais qu'on valide ici pour la même raison — un champ que la CI lit et que le
  // boot ignore, c'est une faute de frappe qui ne se découvre jamais.
  if (data.titresMin != null && ![2, 3].includes(data.titresMin)) {
    throw new Error(`${label} : titresMin invalide (${data.titresMin}) — 2 ou 3`);
  }
  if (data.vuesMin !== undefined && data.vuesMin !== null && !(typeof data.vuesMin === 'number' && data.vuesMin >= 0)) {
    throw new Error(`${label} : vuesMin invalide (${data.vuesMin})`);
  }

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
    // Les alias servent à `tools/verify-catalog.mjs` : une case « Retour vers le
    // futur » pointe sur une vidéo intitulée « Back to the Future ». Le serveur
    // n'en fait rien, mais il doit les valider — un champ que la CI contrôle et
    // que le boot ignore, c'est une faute de frappe qui passe.
    // `null` vaut absence, par symétrie avec `logo` et avec le script.
    if (band.alias != null) {
      if (!Array.isArray(band.alias) || band.alias.some((a) => typeof a !== 'string' || !a.trim())) {
        throw new Error(`${label} : alias invalide (${band.slug})`);
      }
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
  // Les défauts sont posés une fois, ici : plus loin, personne n'a à se demander
  // si un thème déclare un lexique.
  return { ...data, kind: kindDe(data), lexique: lexiqueDe(data) };
}

/** Résumé exposé à l'UI de création : de quoi peupler le sélecteur de thème,
 *  et de quoi lui faire dire « 42 films » plutôt que « 42 groupes ». */
export function themeSummaries(themes) {
  return [...themes.values()].map((t) => ({
    id: t.id,
    name: t.name,
    bands: t.bands.length,
    kind: kindDe(t),
    lexique: lexiqueDe(t),
  }));
}
