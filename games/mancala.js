// 🫘 Mancala (Kalaha) – Duell. Sammle mehr Steine in deinem Kalaha als der Gegner.
import { text, rrect, disc } from '../core/draw.js';
import { botParams } from '../core/bots.js';

const W = 560, H = 330, TURN = 20;
// Brett: 0..5 = Mulden Spieler 0, 6 = Kalaha 0, 7..12 = Mulden Spieler 1, 13 = Kalaha 1
const store = (p) => (p === 0 ? 6 : 13);
const range = (p) => (p === 0 ? [0, 1, 2, 3, 4, 5] : [7, 8, 9, 10, 11, 12]);
const opposite = (i) => 12 - i;

/** Führt einen Zug aus und gibt { b, extra, over } zurück (b = neues Brett). */
export function sow(board, p, pit) {
  const b = board.slice();
  let n = b[pit]; b[pit] = 0;
  let i = pit;
  while (n > 0) { i = (i + 1) % 14; if (i === store(1 - p)) continue; b[i]++; n--; }
  let extra = false;
  if (i === store(p)) extra = true;
  else if (range(p).includes(i) && b[i] === 1 && b[opposite(i)] > 0) { b[store(p)] += b[opposite(i)] + 1; b[i] = 0; b[opposite(i)] = 0; }
  const e0 = range(0).every((k) => b[k] === 0), e1 = range(1).every((k) => b[k] === 0);
  let over = false;
  if (e0 || e1) { for (const k of range(0)) { b[6] += b[k]; b[k] = 0; } for (const k of range(1)) { b[13] += b[k]; b[k] = 0; } over = true; extra = false; }
  return { b, extra, over };
}
function minimax(b, p, me, depth, alpha, beta) {
  const moves = range(p).filter((k) => b[k] > 0);
  if (depth === 0 || !moves.length) return b[store(me)] - b[store(1 - me)];
  let best = p === me ? -1e9 : 1e9;
  for (const m of moves) {
    const r = sow(b, p, m);
    const np = r.extra && !r.over ? p : 1 - p;
    const v = r.over ? r.b[store(me)] - r.b[store(1 - me)] : minimax(r.b, np, me, depth - 1, alpha, beta);
    if (p === me) { best = Math.max(best, v); alpha = Math.max(alpha, v); } else { best = Math.min(best, v); beta = Math.min(beta, v); }
    if (beta <= alpha) break;
  }
  return best;
}

class Mancala {
  constructor(ctx) { this.ctx = ctx; this.running = false; this.b = [4, 4, 4, 4, 4, 4, 0, 4, 4, 4, 4, 4, 4, 0]; this.turn = ctx.rng() < 0.5 ? 0 : 1; this.tl = TURN; this.over = false; this.bots = {}; this.last = -1; this.cnt = 0; this.msg = ''; this.pitsXY = null; }
  start() { this.running = true; this.tl = TURN; }
  idx(uid) { return this.ctx.players.findIndex((p) => p.uid === uid); }
  move(pit) {
    const r = sow(this.b, this.turn, pit);
    this.b = r.b; this.last = pit;
    if (r.over) { this.over = true; this.ctx.sfx('win'); return; }
    this.msg = r.extra ? 'Nochmal dran!' : '';
    if (!r.extra) this.turn = 1 - this.turn;
    this.tl = TURN; this.ctx.sfx('pop');
  }
  onInput(uid, input) {
    if (!this.running || this.over || this.idx(uid) !== this.turn) return;
    const pit = input.pit | 0;
    if (range(this.turn).includes(pit) && this.b[pit] > 0) this.move(pit);
  }
  update(dt) {
    if (!this.running || this.over) return;
    this.tl -= dt;
    if (this.tl <= 0) { const ms = range(this.turn).filter((k) => this.b[k] > 0); this.move(ms[Math.floor(Math.random() * ms.length)]); }
  }
  isFinished() { return this.over; }
  snapshot() { return { b: this.b.slice(), t: this.turn, o: this.over ? 1 : 0, tl: Math.ceil(Math.max(0, this.tl)), lm: this.last, m: this.msg }; }
  botThink(bot, snap, dt) {
    if (this.over) return null;
    const idx = this.idx(bot.uid);
    const st = this.bots[bot.uid] || (this.bots[bot.uid] = { bt: 0, wait: 0 });
    if (idx !== this.turn) { st.bt = 0; st.wait = 0; return null; }
    if (!st.wait) st.wait = 0.7 + Math.random() * 1.2;
    st.bt += dt; if (st.bt < st.wait) return null;
    st.bt = 0; st.wait = 0;
    const prm = botParams(bot.botLevel);
    const moves = range(idx).filter((k) => this.b[k] > 0);
    if (Math.random() < prm.err * 1.3) return { pit: moves[Math.floor(Math.random() * moves.length)] };
    const depth = bot.botLevel === 'schwer' ? 8 : bot.botLevel === 'mittel' ? 5 : 2;
    let best = moves[0], bv = -1e9;
    for (const m of moves) {
      const r = sow(this.b, idx, m);
      const v = (r.over ? r.b[store(idx)] - r.b[store(1 - idx)] : minimax(r.b, r.extra ? idx : 1 - idx, idx, depth - 1, -1e9, 1e9)) + (r.extra ? 0.5 : 0) + Math.random() * 0.3;
      if (v > bv) { bv = v; best = m; }
    }
    return { pit: best };
  }
  result() {
    const [a, b] = this.ctx.players, s0 = this.b[6], s1 = this.b[13];
    if (s0 === s1) return { ranks: [{ uid: a.uid, rank: 1, value: s0, label: `${s0} Steine` }, { uid: b.uid, rank: 1, value: s1, label: `${s1} Steine` }] };
    const w = s0 > s1 ? 0 : 1, ws = this.ctx.players[w], ls = this.ctx.players[1 - w];
    return { ranks: [{ uid: ws.uid, rank: 1, value: this.b[store(w)], label: `${this.b[store(w)]} Steine` }, { uid: ls.uid, rank: 2, value: this.b[store(1 - w)], label: `${this.b[store(1 - w)]} Steine` }] };
  }
  geom(i) { // Mittelpunkt einer Mulde/eines Kalaha
    if (i === 6) return [W - 60, 170]; if (i === 13) return [60, 170];
    if (i < 6) return [120 + i * 64, 215];
    return [120 + (12 - i) * 64, 125];
  }
  onPointer(type, x, y) {
    if (type !== 'down') return;
    const me = this.ctx.me, my = this.idx(me);
    if (my < 0) return;
    for (const k of range(my)) { const [cx, cy] = this.geom(k); if (Math.hypot(x - cx, y - cy) < 30) { this.ctx.send({ pit: k, n: ++this.cnt }); return; } }
  }
  render(g, snap, me, alpha, prev) {
    const ps = this.ctx.players, my = ps.findIndex((p) => p.uid === me);
    g.fillStyle = '#5b3a1e'; rrect(g, 0, 0, W, H, 18); g.fill();
    g.fillStyle = '#8a5a2b'; rrect(g, 20, 70, W - 40, 190, 40); g.fill();
    for (let i = 0; i < 14; i++) {
      const [cx, cy] = this.geom(i), isStore = i === 6 || i === 13;
      g.fillStyle = '#3b2412';
      if (isStore) rrect(g, cx - 30, cy - 70, 60, 140, 28); else { g.beginPath(); g.arc(cx, cy, 29, 0, 7); }
      g.fill();
      const own = i < 6 ? 0 : i < 13 ? 1 : -1;
      if (!isStore && !snap.o && snap.t === own && own === my && snap.b[i] > 0) { g.strokeStyle = '#ffe14d'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 31, 0, 7); g.stroke(); }
      if (i === snap.lm) { g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, 33, 0, 7); g.stroke(); }
      // Steine als Punkte
      const n = snap.b[i], cols = ['#ff4d6d', '#3d8bff', '#ffd23f', '#2fd67b', '#b66bff'];
      for (let k = 0; k < Math.min(n, isStore ? 24 : 14); k++) {
        const a = k * 2.4, rr = isStore ? 8 + (k % 6) * 6 : 4 + (k % 4) * 5.5;
        const sx = cx + (isStore ? (k % 4 - 1.5) * 11 : Math.cos(a) * rr * 0.9), sy = cy + (isStore ? (Math.floor(k / 4) - 3) * 14 : Math.sin(a) * rr * 0.9);
        g.fillStyle = cols[k % 5]; g.beginPath(); g.arc(sx, sy, 4.6, 0, 7); g.fill();
      }
      text(g, String(n), cx, isStore ? cy + 88 : (i < 6 ? cy + 42 : cy - 42), { size: 16, color: '#ffe14d' });
    }
    ps.forEach((p, i) => {
      const act = !snap.o && snap.t === i;
      text(g, `${p.avatar} ${p.name.slice(0, 9)}${act ? `  ⏱ ${snap.tl}` : ''}`, 30, i === 0 ? H - 40 : 36, { size: 15, align: 'left', color: p.uid === me ? '#ffe14d' : '#fff' });
    });
    let msg = '';
    if (snap.o) msg = snap.b[6] === snap.b[13] ? 'Unentschieden!' : `${ps[snap.b[6] > snap.b[13] ? 0 : 1].name} gewinnt!`;
    else if (my < 0) msg = `${ps[snap.t].name} ist dran`;
    else msg = (snap.t === my ? 'Du bist dran – tippe eine deiner Mulden!' : 'Der Gegner überlegt …') + (snap.m ? '  ' + snap.m : '');
    text(g, msg, W / 2, H - 16, { size: 16, color: '#ffe14d', stroke: 'rgba(0,0,0,.5)', strokeW: 5 });
    text(g, ps[1].name.slice(0, 7), 60, 255, { size: 12, color: 'rgba(255,255,255,.6)' });
    text(g, ps[0].name.slice(0, 7), W - 60, 255, { size: 12, color: 'rgba(255,255,255,.6)' });
  }
}

export default {
  id: 'mancala', name: 'Mancala', emoji: '🫘', category: 'Brett', tags: ['brett'],
  min: 2, max: 2, teams: 'none', duel: true, humansOnly: false,
  sync: 'turns', controls: 'PICK', pointer: true, ctlWidth: 0, duration: 160,
  view: { w: W, h: H },
  howTo: ['Tippe eine deiner Mulden: Die Steine werden gegen den Uhrzeigersinn verteilt – auch in deinen Kalaha (rechts bzw. links).', 'Landet der letzte Stein im Kalaha, bist du nochmal dran. In einer leeren eigenen Mulde fängst du die gegenüberliegenden Steine!'],
  wertung: 'Mehr Steine im Kalaha gewinnt. Duell-Punkte: Sieger n, Verlierer 1, Zuschauer ⌈n/2⌉.',
  create: (ctx) => new Mancala(ctx),
};
