// Welche Spiele dürfen gerade gespielt werden? (Spielerzahl, Pool-Einstellungen, „nur einmal“)

/** → { ok, reason } – reason erklärt, warum ein Spiel gerade nicht geht. */
export function gameFits(g, settings, nActive, nHumans) {
  if (settings.off && settings.off[g.id]) return { ok: false, reason: 'ausgeschaltet' };
  if (settings.offCats && settings.offCats[g.category]) return { ok: false, reason: 'Kategorie aus' };
  const count = g.humansOnly ? nHumans : nActive;
  if (count < g.min) return { ok: false, reason: `braucht mind. ${g.min} Spieler` };
  if (!g.duel && nActive > g.max) return { ok: false, reason: `max. ${g.max} Spieler` };
  return { ok: true, reason: '' };
}

/**
 * Spiele, die jetzt zur Wahl stehen. onlyOnce: gespielte kommen erst wieder, wenn alle durch waren
 * (reset = true heißt: die Liste der gespielten Spiele wird zurückgesetzt).
 */
export function selectionPool(games, settings, { nActive, nHumans, played = [] }) {
  const fits = games.filter((g) => gameFits(g, settings, nActive, nHumans).ok);
  if (!settings.onlyOnce) return { pool: fits, reset: false, fits };
  const fresh = fits.filter((g) => !played.includes(g.id));
  if (fresh.length) return { pool: fresh, reset: false, fits };
  return { pool: fits, reset: played.length > 0, fits };
}
