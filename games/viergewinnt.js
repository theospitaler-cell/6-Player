// 🔴 Vier gewinnt – Duell. Tippe auf eine Spalte, dein Stein fällt hinein. Vier in einer Reihe gewinnt.
import { text, rrect, disc } from '../core/draw.js';
import { botParams } from '../core/bots.js';
import { clamp } from '../core/util.js';

const W = 560, H = 340, C = 7, R = 6, CELL = 44, BX = 126, BY = 40, TURN = 12;
const DIRS4 = [[1, 0], [0, 1], [1, 1], [1, -1]];

function winLine(b, who) {
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    if (b[r * C + c] !== who) continue;
    for (const [dx, dy] of DIRS4) {
      const cells = [r * C + c];
      for (let k = 1; k < 4; k++) { const rr = r + dy * k, cc = c + dx * k; if (rr < 0 || rr >= R || cc < 0 || cc >= C || b[rr * C + cc] !== who) break; cells.push(rr * C + cc); }
      if (cells.length === 4) return cells;
    }
  }
  return null;
}
const dropRow = (b, c) => { for (let r = R - 1; r >= 0; r--) if (b[r * C + c] === -1) return r; return -1; };
function evalBoard(b, me) {
  let s = 0;
  const w = (cells) => {
    let m = 0, o = 0;
    for (const i of cells) { if (b[i] === me) m++; else if (b[i] === 1 - me) o++; }
    if (m && o) return 0;
    if (m) return [0, 1, 6, 40][m] ?? 0;
    if (o) return -([0, 1, 7, 60][o] ?? 0);
    return 0;
  };
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) for (const [dx, dy] of DIRS4) {
    const cells = [];
    for (let k = 0; k < 4; k++) { const rr = r + dy * k, cc = c + dx * k; if (rr < 0 || rr >= R || cc < 0 || cc >= C) { cells.length = 0; break; } cells.push(rr * C + cc); }
    if (cells.length) s += w(cells);
  }
  for (let r = 0; r < R; r++) if (b[r * C + 3] === me) s += 3;
  return s;
}
function search(b, depth, alpha, beta, turn, me) {
  if (winLine(b, me)) return 10000 + depth;
  if (winLine(b, 1 - me)) return -10000 - depth;
  if (depth === 0 || b.every((x) => x !== -1 || false) && !b.includes(-1)) return evalBoard(b, me);
  const order = [3, 2, 4, 1, 5, 0, 6];
  let best = turn === me ? -1e9 : 1e9, any = false;
  for (const c of order) {
    const r = dropRow(b, c);
    if (r < 0) continue;
    any = true;
    b[r * C + c] = turn;
    const v = search(b, depth - 1, alpha, beta, 1 - turn, me);
    b[r * C + c] = -1;
    if (turn === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return any ? best : 0;
}

class Vier {
  constructor(ctx) {
    this.ctx = ctx; this.running = false; this.b = Array(C * R).fill(-1); this.turn = ctx.rng() < 0.5 ? 0 : 1; this.tl = TURN; this.over = false; this.winner = -1; this.line = null; this.last = -1; this.bots = {}; this.cnt = 0; this.t = 0; this.lastSnap = null;
  }
  start() { this.running = true; this.tl = TURN; }
  idx(uid) { return this.ctx.players.findIndex((p) => p.uid === uid); }
  place(c) {
    const r = dropRow(this.b, c);
    if (r < 0) return false;
    this.b[r * C + c] = this.turn; this.last = r * C + c;
    const line = winLine(this.b, this.turn);
    if (line) { this.over = true; this.winner = this.turn; this.line = line; this.ctx.sfx('win'); }
    else if (!this.b.includes(-1)) this.over = true;
    else { this.turn = 1 - this.turn; this.tl = TURN; this.ctx.sfx('pop'); }
    return true;
  }
  onInput(uid, input) {
    if (!this.running || this.over || this.idx(uid) !== this.turn) return;
    const c = input.col | 0;
    if (c >= 0 && c < C) this.place(c);
  }
  update(dt) {
    if (!this.running || this.over) return;
    this.t += dt; this.tl -= dt;
    if (this.tl <= 0) { const free = [...Array(C).keys()].filter((c) => dropRow(this.b, c) >= 0); this.place(free[Math.floor(Math.random() * free.length)]); }
  }
  isFinished() { return this.over; }
  snapshot() { return { b: this.b.slice(), t: this.turn, w: this.winner, l: this.line || [], o: this.over ? 1 : 0, tl: Math.ceil(Math.max(0, this.tl)), lm: this.last }; }
  botThink(bot, snap, dt) {
    if (this.over) return null;
    const idx = this.idx(bot.uid);
    const st = this.bots[bot.uid] || (this.bots[bot.uid] = { bt: 0, wait: 0 });
    if (idx !== this.turn) { st.bt = 0; st.wait = 0; return null; }
    const prm = botParams(bot.botLevel);
    if (!st.wait) st.wait = 0.6 + Math.random() * 1.0;
    st.bt += dt; if (st.bt < st.wait) return null;
    st.bt = 0; st.wait = 0;
    const depth = bot.botLevel === 'schwer' ? 6 : bot.botLevel === 'mittel' ? 4 : 2;
    const free = [...Array(C).keys()].filter((c) => dropRow(this.b, c) >= 0);
    if (Math.random() < prm.err * 1.4) return { col: free[Math.floor(Math.random() * free.length)] };
    let bestC = free[0], bestV = -1e9;
    for (const c of [3, 2, 4, 1, 5, 0, 6]) {
      const r = dropRow(this.b, c); if (r < 0) continue;
      this.b[r * C + c] = idx;
      const v = search(this.b, depth - 1, -1e9, 1e9, 1 - idx, idx) + Math.random() * 0.5;
      this.b[r * C + c] = -1;
      if (v > bestV) { bestV = v; bestC = c; }
    }
    return { col: bestC };
  }
  result() {
    const [a, b] = this.ctx.players;
    if (this.winner < 0) return { ranks: [{ uid: a.uid, rank: 1, label: 'Unentschieden' }, { uid: b.uid, rank: 1, label: 'Unentschieden' }] };
    const w = this.ctx.players[this.winner], l = this.ctx.players[1 - this.winner];
    return { ranks: [{ uid: w.uid, rank: 1, label: 'Sieg' }, { uid: l.uid, rank: 2, label: 'Niederlage' }] };
  }
  onPointer(type, x, y) {
    if (type !== 'down') return;
    const c = Math.floor((x - BX) / CELL);
    if (c >= 0 && c < C) this.ctx.send({ col: c, n: ++this.cnt });
  }
  render(g, snap, me) {
    const ps = this.ctx.players, myIdx = ps.findIndex((p) => p.uid === me);
    g.fillStyle = '#23356b'; rrect(g, 0, 0, W, H, 18); g.fill();
    ps.forEach((p, i) => {
      const x = i === 0 ? 62 : W - 62, active = !snap.o && snap.t === i;
      if (active) { g.fillStyle = 'rgba(255,225,77,.25)'; rrect(g, x - 52, 70, 104, 150, 16); g.fill(); }
      disc(g, x, 112, 24, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : p.ring });
      g.fillStyle = p.colorHex; g.beginPath(); g.arc(x, 162, 12, 0, 7); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 2; g.stroke();
      text(g, p.name.slice(0, 9), x, 192, { size: 13, color: p.uid === me ? '#ffe14d' : '#fff' });
      if (active) text(g, `⏱ ${snap.tl}`, x, 212, { size: 15, color: snap.tl <= 3 ? '#ff7a95' : '#ffe14d' });
    });
    g.fillStyle = '#2f5fd0'; rrect(g, BX - 6, BY - 6, C * CELL + 12, R * CELL + 12, 14); g.fill();
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      const v = snap.b[r * C + c], cx = BX + c * CELL + CELL / 2, cy = BY + r * CELL + CELL / 2;
      g.fillStyle = v < 0 ? '#14234d' : ps[v].colorHex; g.beginPath(); g.arc(cx, cy, CELL / 2 - 4, 0, 7); g.fill();
      if (v >= 0) { g.strokeStyle = snap.l.includes(r * C + c) ? '#ffe14d' : 'rgba(255,255,255,.55)'; g.lineWidth = snap.l.includes(r * C + c) ? 5 : 2; g.stroke(); if (r * C + c === snap.lm) text(g, ps[v].avatar, cx, cy, { size: 18 }); }
    }
    let msg = '', col = '#ffe14d';
    if (snap.o) msg = snap.w < 0 ? 'Unentschieden!' : (myIdx < 0 ? `${ps[snap.w].name} gewinnt!` : snap.w === myIdx ? 'Du hast gewonnen! 🎉' : 'Verloren …');
    else if (myIdx < 0) { msg = 'Du schaust zu 👀'; col = '#fff'; } else msg = snap.t === myIdx ? 'Du bist dran – tippe auf eine Spalte!' : 'Der Gegner überlegt …';
    text(g, msg, W / 2, H - 14, { size: 18, color: col, stroke: 'rgba(0,0,0,.5)', strokeW: 5 });
  }
}

export default {
  id: 'viergewinnt', name: 'Vier gewinnt', emoji: '🔴', category: 'Brett', tags: ['brett'],
  min: 2, max: 2, teams: 'none', duel: true, humansOnly: false,
  sync: 'turns', controls: 'PICK', pointer: true, ctlWidth: 0, duration: 140,
  view: { w: W, h: H },
  howTo: ['Tippe auf eine Spalte – dein Stein fällt nach unten.', 'Wer zuerst vier Steine in einer Reihe hat (waagerecht, senkrecht oder diagonal), gewinnt. 12 Sekunden pro Zug.'],
  wertung: 'Sieger Platz 1, Verlierer Platz 2, sonst Unentschieden. Duell-Punkte: Sieger n, Verlierer 1, Zuschauer ⌈n/2⌉.',
  create: (ctx) => new Vier(ctx),
};
