// K.-o.-Turnier: Bracket-Logik (rein, ohne DOM). Freilose sind '-'.
const BYE = '-';
export const WINS_NEEDED = 2;   // Best-of-3
export const MAX_GAMES = 5;     // Notbremse bei vielen Unentschieden

/** Klassische Setzpositionen (1 trifft auf den Letzten, usw.). size = Potenz von 2. */
export function seedOrder(size) {
  let order = [1];
  while (order.length < size) { const n = order.length * 2; order = order.flatMap((s) => [s, n + 1 - s]); }
  return order;
}

const emptyMatch = () => ({ a: '', b: '', wa: 0, wb: 0, w: '', gs: '', bye: 0 });

/** uids: nach Spielstärke sortiert (stärkster zuerst). */
export function makeBracket(uids) {
  const n = uids.length;
  let size = 2; while (size < n) size *= 2;
  const pos = seedOrder(size).map((s) => (s <= n ? uids[s - 1] : BYE));
  const r0 = [];
  for (let i = 0; i < size; i += 2) r0.push({ ...emptyMatch(), a: pos[i], b: pos[i + 1] });
  const rounds = [r0];
  for (let sz = size / 2; sz >= 2; sz /= 2) rounds.push(Array.from({ length: sz / 2 }, emptyMatch));
  const br = { size, rounds };
  resolveByes(br);
  return br;
}

export function setWinner(br, r, m, uid, bye = false) {
  const mt = br.rounds[r][m];
  mt.w = uid; mt.bye = bye ? 1 : 0;
  if (r + 1 < br.rounds.length) { const nx = br.rounds[r + 1][Math.floor(m / 2)]; if (m % 2 === 0) nx.a = uid; else nx.b = uid; }
}

/** Ein Spieler gegen ein Freilos rückt sofort vor – so lange, bis sich nichts mehr ändert. */
export function resolveByes(br) {
  let changed = true;
  while (changed) {
    changed = false;
    br.rounds.forEach((round, r) => round.forEach((mt, m) => {
      if (mt.w || !mt.a || !mt.b) return;
      if (mt.a === BYE && mt.b === BYE) { setWinner(br, r, m, BYE, true); changed = true; }
      else if (mt.b === BYE) { setWinner(br, r, m, mt.a, true); changed = true; }
      else if (mt.a === BYE) { setWinner(br, r, m, mt.b, true); changed = true; }
    }));
  }
}

/** Das nächste Match, in dem beide Gegner feststehen und noch niemand gewonnen hat. */
export function nextMatch(br) {
  for (let r = 0; r < br.rounds.length; r++) for (let m = 0; m < br.rounds[r].length; m++) {
    const mt = br.rounds[r][m];
    if (!mt.w && mt.a && mt.b && mt.a !== BYE && mt.b !== BYE) return { r, m };
  }
  return null;
}

/**
 * Spielergebnis eintragen. side: 0 = a gewann, 1 = b gewann, -1 = Unentschieden/ungültig.
 * Gibt true zurück, wenn das Match entschieden ist.
 */
export function recordGame(br, r, m, side, gameId, rng = Math.random) {
  const mt = br.rounds[r][m];
  if (side === 0) mt.wa++; else if (side === 1) mt.wb++;
  mt.gs = mt.gs ? mt.gs + ',' + gameId : gameId;
  const played = mt.gs.split(',').length;
  if (mt.wa >= WINS_NEEDED) { setWinner(br, r, m, mt.a); return true; }
  if (mt.wb >= WINS_NEEDED) { setWinner(br, r, m, mt.b); return true; }
  if (played >= MAX_GAMES) { // Notbremse: wer mehr Siege hat, sonst Los
    const w = mt.wa === mt.wb ? (rng() < 0.5 ? mt.a : mt.b) : (mt.wa > mt.wb ? mt.a : mt.b);
    setWinner(br, r, m, w); return true;
  }
  return false;
}

export function roundName(size, r) {
  const left = size / Math.pow(2, r); // Spieler am Anfang dieser Runde
  return left <= 2 ? 'Finale' : left === 4 ? 'Halbfinale' : left === 8 ? 'Viertelfinale' : 'Achtelfinale';
}

/** { uid: platz } – Sieger 1, Finalverlierer 2, Halbfinal-Verlierer teilen 3, Viertelfinal-Verlierer 5 … */
export function placements(br) {
  const R = br.rounds.length, out = {};
  br.rounds.forEach((round, r) => round.forEach((mt) => {
    if (!mt.w || mt.w === BYE) return;
    const loser = mt.w === mt.a ? mt.b : mt.a;
    if (loser && loser !== BYE) out[loser] = Math.pow(2, R - r - 1) + 1;
    if (r === R - 1) out[mt.w] = 1;
  }));
  // Wer noch im Rennen ist (Turnier vorzeitig beendet): gemeinsamer Platz 1
  br.rounds.forEach((round) => round.forEach((mt) => { for (const u of [mt.a, mt.b]) if (u && u !== BYE && out[u] == null) out[u] = 1; }));
  return out;
}

/** meta.ko aus der Datenbank (Arrays können als Objekte ankommen) → saubere Struktur. */
export function readBracket(raw) {
  if (!raw) return null;
  const list = (x) => (Array.isArray(x) ? x : Object.values(x || {})).filter(Boolean);
  return { size: raw.size, rounds: list(raw.rounds).map((r) => list(r).map((mt) => ({ ...emptyMatch(), ...mt }))) };
}
