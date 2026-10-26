// Punkte, Cup, Teams, Duelle, Endstand. Reine Funktionen (ohne DOM) → in Node testbar.

/** Wettbewerbs-Ränge (1,1,3,4): cmp(a,b) < 0 heißt a ist besser. */
export function competitionRanks(items, cmp) {
  const sorted = items.map((item, i) => ({ item, i })).sort((a, b) => cmp(a.item, b.item) || a.i - b.i);
  const out = [];
  sorted.forEach((s, idx) => {
    const rank = idx === 0 ? 1 : (cmp(sorted[idx - 1].item, s.item) === 0 ? out[idx - 1].rank : idx + 1);
    out.push({ item: s.item, rank });
  });
  return out;
}

/**
 * Bringt das Ergebnis eines Spiels in eine gültige Form:
 * jeder Teilnehmer genau einmal, Ränge als Wettbewerbs-Ränge, Fehlende ganz hinten.
 */
export function normalizeResult(res, uids) {
  const seen = new Map();
  for (const r of (res && res.ranks) || []) {
    if (r && uids.includes(r.uid) && !seen.has(r.uid)) seen.set(r.uid, r);
  }
  const maxGiven = Math.max(0, ...Array.from(seen.values()).map((r) => Number(r.rank) || 0));
  const entries = uids.map((uid) => {
    const r = seen.get(uid);
    return r
      ? { uid, rank: Number(r.rank) || maxGiven + 1, value: r.value ?? null, label: r.label ?? '' }
      : { uid, rank: maxGiven + 1, value: null, label: 'ausgefallen' };
  });
  const ranked = competitionRanks(entries, (a, b) => a.rank - b.rank);
  return ranked.map((x) => ({ ...x.item, rank: x.rank }));
}

/** Team-Ränge → Spieler-Ränge: alle Teammitglieder teilen den Rang ihres Teams. */
export function teamRanksToPlayerRanks(teamRanks, teamOf, uids) {
  const rankOfTeam = new Map(teamRanks.map((t) => [Number(t.team), t.rank]));
  const worst = Math.max(0, ...teamRanks.map((t) => t.rank)) + 1;
  const base = uids.map((uid) => ({ uid, rank: rankOfTeam.get(Number(teamOf[uid])) ?? worst }));
  return competitionRanks(base, (a, b) => a.rank - b.rank).map((x) => ({ uid: x.item.uid, rank: x.rank }));
}

/** Cup-Punkte: Platz p von n gibt n − p + 1 Punkte (bei Gleichstand: Punkte des besseren Platzes). */
export function cupPoints(ranks) {
  const n = ranks.length;
  const pts = {};
  for (const r of ranks) pts[r.uid] = Math.max(0, n - r.rank + 1);
  return pts;
}

/**
 * Duell-Wertung: Sieger n, Verlierer 1, Unentschieden n−1, Zuschauer ⌈n/2⌉.
 * n = alle aktiven Teilnehmer der Party, ranks = nur die Duell-Spieler.
 */
export function duelPoints(n, ranks, spectatorUids = []) {
  const pts = {};
  const best = Math.min(...ranks.map((r) => r.rank));
  const winners = ranks.filter((r) => r.rank === best);
  const draw = winners.length === ranks.length && ranks.length > 1;
  for (const r of ranks) {
    if (draw) pts[r.uid] = Math.max(1, n - 1);
    else pts[r.uid] = r.rank === best ? n : 1;
  }
  for (const uid of spectatorUids) pts[uid] = Math.ceil(n / 2);
  return pts;
}

export function scaleScores(pts, factor) {
  const out = {};
  for (const [k, v] of Object.entries(pts)) out[k] = v * factor;
  return out;
}

/**
 * Teams verteilen. fixed = {uid: team}: wird genutzt, wenn beide Teams besetzt sind.
 * Sonst zufällig und möglichst gleich groß (3 Spieler → 2:1, 5 → 3:2).
 */
export function assignTeams(uids, rng = Math.random, fixed = null) {
  if (fixed) {
    const t = {};
    const counts = [0, 0];
    for (const uid of uids) {
      const v = Number(fixed[uid]);
      if (v === 0 || v === 1) { t[uid] = v; counts[v]++; }
    }
    if (Object.keys(t).length === uids.length && counts[0] > 0 && counts[1] > 0) return t;
  }
  const order = uids.map((u) => ({ u, r: rng() })).sort((a, b) => a.r - b.r).map((x) => x.u);
  const t = {};
  const first = rng() < 0.5 ? 0 : 1;
  order.forEach((uid, i) => { t[uid] = (i + first) % 2; });
  return t;
}

/** Duell: die Spieler mit den wenigsten Punkten spielen (Gleichstand: Zufall). */
export function selectDuelPlayers(cands, k, rng = Math.random) {
  return cands
    .map((c) => ({ ...c, r: rng() }))
    .sort((a, b) => (a.score || 0) - (b.score || 0) || a.r - b.r)
    .slice(0, k)
    .map((c) => c.uid);
}

const keyOf = (p) => [p.score || 0, p.wins || 0, -(p.rs || 0)];
const cmpPlayers = (a, b) => {
  const ka = keyOf(a), kb = keyOf(b);
  for (let i = 0; i < ka.length; i++) if (ka[i] !== kb[i]) return kb[i] - ka[i];
  return 0;
};

/** Gleichstand an der Spitze (Punkte, Rundensiege, Rang-Summe) → Liste der Gleichplatzierten. */
export function tiedTop(players) {
  if (players.length < 2) return [];
  const sorted = players.slice().sort(cmpPlayers);
  const tied = sorted.filter((p) => cmpPlayers(sorted[0], p) === 0);
  return tied.length >= 2 ? tied.map((p) => p.uid) : [];
}

/** Endstand mit Platz (Gleichstand = gleicher Platz). stechenOrder ordnet die Spitzengruppe. */
export function standings(players, stechenOrder = []) {
  let sorted = players.slice().sort((a, b) => cmpPlayers(a, b) || String(a.uid).localeCompare(String(b.uid)));
  const tied = tiedTop(players);
  if (tied.length && stechenOrder.length) {
    const top = sorted.filter((p) => tied.includes(p.uid))
      .sort((a, b) => {
        const ia = stechenOrder.indexOf(a.uid), ib = stechenOrder.indexOf(b.uid);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
      });
    sorted = top.concat(sorted.filter((p) => !tied.includes(p.uid)));
  }
  const out = [];
  sorted.forEach((p, i) => {
    let place = i + 1;
    if (i > 0 && cmpPlayers(sorted[i - 1], p) === 0 && !(tied.includes(p.uid) && stechenOrder.length)) place = out[i - 1].place;
    out.push({ ...p, place });
  });
  return out;
}

/** Auszeichnungen für die Siegerehrung. history = Liste von { ranks:[{uid,rank}] } (ohne Stechen). */
export function awards(history, players) {
  const res = {};
  const byWins = players.slice().sort((a, b) => (b.wins || 0) - (a.wins || 0) || (b.score || 0) - (a.score || 0));
  if (byWins.length && (byWins[0].wins || 0) > 0) res.mvp = { uid: byWins[0].uid, n: byWins[0].wins };

  const last = {};
  for (const h of history) {
    const ranks = (h && h.ranks) || [];
    if (ranks.length < 2) continue;
    const worst = Math.max(...ranks.map((r) => r.rank));
    if (worst <= 1) continue;
    for (const r of ranks) if (r.rank === worst) last[r.uid] = (last[r.uid] || 0) + 1;
  }
  const lastList = Object.entries(last).sort((a, b) => b[1] - a[1]);
  if (lastList.length && (lastList.length === 1 || lastList[0][1] > lastList[1][1])) res.pech = { uid: lastList[0][0], n: lastList[0][1] };

  const sorted = players.slice().sort(cmpPlayers);
  if (sorted.length >= 2) {
    const margin = (sorted[0].score || 0) - (sorted[1].score || 0);
    if (margin > 0 && margin <= 2) res.knapp = { uid: sorted[0].uid, n: margin };
  }
  return res;
}
