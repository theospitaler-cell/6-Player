// ♟️ Dame – Duell. Schlagzwang, Mehrfachsprünge, Steine werden Damen. (Damen ziehen ein Feld in alle Richtungen.)
import { text, rrect, disc } from '../core/draw.js';
import { botParams } from '../core/bots.js';

const W = 560, H = 340, S = 38, BX = 130, BY = 18, TURN = 28;
const own = (v) => (v === 0 ? -1 : v <= 2 ? 0 : 1);
const king = (v) => v === 2 || v === 4;
const startBoard = () => { const b = Array(64).fill(0); for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if ((r + c) % 2 === 1) { if (r < 3) b[r * 8 + c] = 3; else if (r > 4) b[r * 8 + c] = 1; } return b; };

/** Alle erlaubten Einzelzüge für Spieler p (Schlagzwang; mustFrom = Weiterspringen mit diesem Stein). */
export function movesFor(b, p, mustFrom = -1) {
  const caps = [], steps = [];
  for (let i = 0; i < 64; i++) {
    const v = b[i];
    if (own(v) !== p || (mustFrom >= 0 && i !== mustFrom)) continue;
    const r = Math.floor(i / 8), c = i % 8, k = king(v), fw = p === 0 ? -1 : 1;
    for (const dr of [-1, 1]) for (const dc of [-1, 1]) {
      const r1 = r + dr, c1 = c + dc, r2 = r + 2 * dr, c2 = c + 2 * dc;
      if (r2 >= 0 && r2 < 8 && c2 >= 0 && c2 < 8 && own(b[r1 * 8 + c1]) === 1 - p && b[r2 * 8 + c2] === 0) caps.push({ from: i, to: r2 * 8 + c2, cap: r1 * 8 + c1 });
      if (!caps.length && mustFrom < 0 && (k || dr === fw) && r1 >= 0 && r1 < 8 && c1 >= 0 && c1 < 8 && b[r1 * 8 + c1] === 0) steps.push({ from: i, to: r1 * 8 + c1, cap: -1 });
    }
  }
  return caps.length ? caps : (mustFrom >= 0 ? [] : steps);
}
/** Führt einen Zug aus. → { b, cont (Stein muss weiterspringen: Index oder -1), promoted } */
export function applyMove(b0, m) {
  const b = b0.slice();
  const v = b[m.from], p = own(v);
  b[m.from] = 0; if (m.cap >= 0) b[m.cap] = 0;
  const lastRow = p === 0 ? 0 : 7;
  let nv = v, promoted = false;
  if (!king(v) && Math.floor(m.to / 8) === lastRow) { nv = p === 0 ? 2 : 4; promoted = true; }
  b[m.to] = nv;
  let cont = -1;
  if (m.cap >= 0 && !promoted && movesFor(b, p, m.to).length) cont = m.to;
  return { b, cont, promoted };
}
const material = (b, p) => b.reduce((a, v) => a + (own(v) === p ? (king(v) ? 180 : 100) : 0), 0);
function evalB(b, me) {
  let s = material(b, me) - material(b, 1 - me);
  for (let i = 0; i < 64; i++) { const v = b[i]; if (!v || king(v)) continue; const r = Math.floor(i / 8); const adv = own(v) === 0 ? 7 - r : r; s += (own(v) === me ? 1 : -1) * adv * 3; }
  return s;
}
function search(b, turn, must, depth, me, alpha, beta) {
  const ms = movesFor(b, turn, must);
  if (!ms.length) return turn === me ? -9000 - depth : 9000 + depth;
  if (depth === 0) return evalB(b, me);
  let best = turn === me ? -1e9 : 1e9;
  for (const m of ms) {
    const r = applyMove(b, m);
    const nt = r.cont >= 0 ? turn : 1 - turn;
    const v = search(r.b, nt, r.cont, depth - 1, me, alpha, beta);
    if (turn === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}

class Dame {
  constructor(ctx) {
    this.ctx = ctx; this.running = false; this.b = startBoard(); this.turn = ctx.rng() < 0.5 ? 0 : 1; this.must = -1; this.tl = TURN; this.over = false; this.winner = -1; this.draw = false;
    this.quiet = 0; this.bots = {}; this.last = [-1, -1]; this.cnt = 0; this.sel = -1; this.lastSnap = null; this.t = 0;
  }
  start() { this.running = true; this.tl = TURN; }
  idx(uid) { return this.ctx.players.findIndex((p) => p.uid === uid); }
  doMove(m) {
    const wasMan = !king(this.b[m.from]);
    const r = applyMove(this.b, m);
    this.b = r.b; this.last = [m.from, m.to];
    if (m.cap >= 0 || wasMan) this.quiet = 0; else this.quiet++;
    this.ctx.sfx(m.cap >= 0 ? 'hit' : 'pop');
    if (r.cont >= 0) { this.must = r.cont; this.tl = TURN; return; }
    this.must = -1; this.turn = 1 - this.turn; this.tl = TURN;
    if (!movesFor(this.b, this.turn).length) { this.over = true; this.winner = 1 - this.turn; this.ctx.sfx('win'); }
    else if (this.quiet >= 40) { this.over = true; this.draw = true; }
  }
  onInput(uid, input) {
    if (!this.running || this.over || this.idx(uid) !== this.turn) return;
    const m = movesFor(this.b, this.turn, this.must).find((x) => x.from === (input.from | 0) && x.to === (input.to | 0));
    if (m) this.doMove(m);
  }
  update(dt) {
    if (!this.running || this.over) return;
    this.t += dt; this.tl -= dt;
    if (this.tl <= 0) { const ms = movesFor(this.b, this.turn, this.must); this.doMove(ms[Math.floor(Math.random() * ms.length)]); }
  }
  isFinished() { return this.over; }
  snapshot() { return { b: this.b.slice(), t: this.turn, mf: this.must, o: this.over ? 1 : 0, w: this.winner, d: this.draw ? 1 : 0, tl: Math.ceil(Math.max(0, this.tl)), lm: this.last }; }
  botThink(bot, snap, dt) {
    if (this.over) return null;
    const idx = this.idx(bot.uid);
    const st = this.bots[bot.uid] || (this.bots[bot.uid] = { bt: 0, wait: 0 });
    if (idx !== this.turn) { st.bt = 0; st.wait = 0; return null; }
    if (!st.wait) st.wait = 0.7 + Math.random() * 1.2;
    st.bt += dt; if (st.bt < st.wait) return null;
    st.bt = 0; st.wait = 0;
    const prm = botParams(bot.botLevel);
    const ms = movesFor(this.b, idx, this.must);
    if (!ms.length) return null;
    if (Math.random() < prm.err * 1.2) { const m = ms[Math.floor(Math.random() * ms.length)]; return { from: m.from, to: m.to }; }
    const depth = bot.botLevel === 'schwer' ? 5 : bot.botLevel === 'mittel' ? 3 : 1;
    let best = ms[0], bv = -1e9;
    for (const m of ms) {
      const r = applyMove(this.b, m);
      const v = search(r.b, r.cont >= 0 ? idx : 1 - idx, r.cont, depth - 1, idx, -1e9, 1e9) + Math.random() * 2;
      if (v > bv) { bv = v; best = m; }
    }
    return { from: best.from, to: best.to };
  }
  result() {
    const [a, b] = this.ctx.players;
    let w = this.winner;
    if (!this.over) { const m0 = material(this.b, 0), m1 = material(this.b, 1); w = m0 === m1 ? -1 : (m0 > m1 ? 0 : 1); }
    if (w < 0) return { ranks: [{ uid: a.uid, rank: 1, label: 'Unentschieden' }, { uid: b.uid, rank: 1, label: 'Unentschieden' }] };
    return { ranks: [{ uid: this.ctx.players[w].uid, rank: 1, label: 'Sieg' }, { uid: this.ctx.players[1 - w].uid, rank: 2, label: 'Niederlage' }] };
  }
  // Eingabe: erst eigenen Stein, dann Ziel antippen
  onPointer(type, x, y) {
    if (type !== 'down') return;
    const s = this.lastSnap; if (!s || s.o) return;
    const my = this.idx(this.ctx.me);
    if (my < 0 || s.t !== my) return;
    const c = Math.floor((x - BX) / S), r = Math.floor((y - BY) / S);
    if (c < 0 || c > 7 || r < 0 || r > 7) return;
    const i = r * 8 + c;
    const ms = movesFor(s.b, my, s.mf);
    const mv = ms.find((m) => m.from === this.sel && m.to === i);
    if (mv) { this.ctx.send({ from: mv.from, to: mv.to, n: ++this.cnt }); this.sel = s.mf >= 0 ? mv.to : -1; return; }
    this.sel = ms.some((m) => m.from === i) ? i : -1;
  }
  render(g, snap, me) {
    this.lastSnap = snap;
    const ps = this.ctx.players, my = ps.findIndex((p) => p.uid === me);
    g.fillStyle = '#3a2a1c'; rrect(g, 0, 0, W, H, 18); g.fill();
    const flip = my === 1; // Spieler 2 sieht das Brett von seiner Seite
    const pos = (i) => { const r = Math.floor(i / 8), c = i % 8; return [BX + (flip ? 7 - c : c) * S, BY + (flip ? 7 - r : r) * S]; };
    for (let i = 0; i < 64; i++) { const r = Math.floor(i / 8), c = i % 8; const [x, y] = pos(i); g.fillStyle = (r + c) % 2 ? '#8b5a2b' : '#f0d9b5'; g.fillRect(x, y, S, S); }
    const ms = !snap.o && my >= 0 && snap.t === my ? movesFor(snap.b, my, snap.mf) : [];
    if (snap.lm[0] >= 0) { for (const i of snap.lm) { const [x, y] = pos(i); g.fillStyle = 'rgba(255,225,77,.28)'; g.fillRect(x, y, S, S); } }
    for (const m of ms) { if (this.sel < 0 || m.from === this.sel) { const [x, y] = pos(m.from); g.strokeStyle = this.sel === m.from ? '#ffe14d' : 'rgba(255,225,77,.55)'; g.lineWidth = 3; g.strokeRect(x + 2, y + 2, S - 4, S - 4); } }
    for (const m of ms) if (m.from === this.sel) { const [x, y] = pos(m.to); g.fillStyle = 'rgba(47,214,123,.55)'; g.beginPath(); g.arc(x + S / 2, y + S / 2, 9, 0, 7); g.fill(); }
    for (let i = 0; i < 64; i++) {
      const v = snap.b[i]; if (!v) continue;
      const [x, y] = pos(i), p = ps[own(v)];
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(x + S / 2 + 1, y + S / 2 + 3, S * 0.4, 0, 7); g.fill();
      g.fillStyle = p.colorHex; g.beginPath(); g.arc(x + S / 2, y + S / 2, S * 0.4, 0, 7); g.fill();
      g.strokeStyle = king(v) ? '#ffe14d' : 'rgba(255,255,255,.85)'; g.lineWidth = king(v) ? 4 : 2.5; g.stroke();
      text(g, king(v) ? '👑' : p.avatar, x + S / 2, y + S / 2, { size: king(v) ? 18 : 16 });
    }
    ps.forEach((p, i) => {
      const x = i === 0 ? 62 : W - 62, act = !snap.o && snap.t === i;
      if (act) { g.fillStyle = 'rgba(255,225,77,.25)'; rrect(g, x - 52, 70, 104, 130, 16); g.fill(); }
      disc(g, x, 112, 24, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : p.ring });
      text(g, p.name.slice(0, 9), x, 152, { size: 13, color: p.uid === me ? '#ffe14d' : '#fff' });
      text(g, `${snap.b.filter((v) => own(v) === i).length} Steine`, x, 172, { size: 12, color: 'rgba(255,255,255,.75)' });
      if (act) text(g, `⏱ ${snap.tl}`, x, 192, { size: 15, color: snap.tl <= 5 ? '#ff7a95' : '#ffe14d' });
    });
    let msg = '', col = '#ffe14d';
    if (snap.o) msg = snap.d ? 'Unentschieden!' : (my < 0 ? `${ps[snap.w].name} gewinnt!` : snap.w === my ? 'Du hast gewonnen! 🎉' : 'Verloren …');
    else if (my < 0) { msg = 'Du schaust zu 👀'; col = '#fff'; }
    else if (snap.t === my) msg = snap.mf >= 0 ? 'Weiterspringen! (Schlagzwang)' : (ms.some((m) => m.cap >= 0) ? 'Schlagzwang – du musst schlagen!' : 'Du bist dran');
    else msg = 'Der Gegner überlegt …';
    text(g, msg, W / 2, H - 12, { size: 16, color: col, stroke: 'rgba(0,0,0,.5)', strokeW: 5 });
  }
}

export default {
  id: 'dame', name: 'Dame', emoji: '♟️', category: 'Brett', tags: ['brett'],
  min: 2, max: 2, teams: 'none', duel: true, humansOnly: false,
  sync: 'turns', controls: 'PICK', pointer: true, ctlWidth: 0, duration: 220,
  view: { w: W, h: H },
  howTo: ['Tippe einen deiner Steine und dann ein markiertes Feld. Steine ziehen diagonal vorwärts.', 'Schlagen ist Pflicht (auch mehrfach hintereinander). Wer die Gegner-Seite erreicht, wird zur Dame 👑.'],
  wertung: 'Wer alle gegnerischen Steine schlägt oder blockiert, gewinnt. Bei Zeitablauf zählt das Material.',
  create: (ctx) => new Dame(ctx),
};
