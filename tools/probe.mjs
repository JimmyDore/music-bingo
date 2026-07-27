#!/usr/bin/env node
// Sonde un ou plusieurs youtubeId : embeddabilité (oEmbed) + titre + chaîne + durée (yt-dlp).
// Usage : node tools/probe.mjs eVTXPUF4Oz4 kXYiU_JCYtU ...
// Sortie : une ligne par id → ID|CODE_HTTP|TITRE|CHAINE|DUREE_SECONDES
//
// CODE_HTTP 200 = la vidéo existe et est embarquable. Tout le reste = à rejeter.
// DUREE vaut "?" si yt-dlp n'a pas répondu (réseau, throttling) : relancer.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

async function oembed(id) {
  const url = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { code: res.status, title: '', author: '' };
    const body = await res.json();
    return { code: 200, title: body.title ?? '', author: body.author_name ?? '' };
  } catch {
    return { code: 0, title: '', author: '' };
  }
}

async function duration(id) {
  try {
    const { stdout } = await run(
      'yt-dlp',
      [`https://www.youtube.com/watch?v=${id}`, '--print', '%(duration)s', '--skip-download', '--no-warnings'],
      { timeout: 60_000 },
    );
    const d = Number(stdout.trim());
    return Number.isFinite(d) ? d : '?';
  } catch {
    return '?';
  }
}

const ids = process.argv.slice(2);
if (ids.length === 0) {
  console.error('usage: node tools/probe.mjs <youtubeId> [...]');
  process.exit(2);
}

// On sonde en parallèle mais par petits paquets, pour ne pas se faire throttler.
const CHUNK = 5;
for (let i = 0; i < ids.length; i += CHUNK) {
  const batch = ids.slice(i, i + CHUNK);
  const rows = await Promise.all(
    batch.map(async (id) => {
      const [emb, dur] = await Promise.all([oembed(id), duration(id)]);
      return `${id}|${emb.code}|${emb.title}|${emb.author}|${dur}`;
    }),
  );
  for (const row of rows) console.log(row);
}
