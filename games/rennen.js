// 🏎️ Rennwagen – 3 Runden auf dem Oval. ◀ ▶ lenken, Gas gibt das Auto selbst.
import { text, rrect, arrowDown } from '../core/draw.js';
import { competitionRanks } from '../core/scoring.js';
import { botParams } from '../core/bots.js';
import { clamp, r1, r2, r3 } from '../core/util.js';

const W = 560, H = 340, CX = 280, CY = 170;
const RXO = 262, RYO = 160, RXI = 138, RYI = 62; // Außen-/Innenellipse
const RXM = (RXO + RXI) / 2, RYM = (RYO + RYI) / 2;
const LAPS = 3, VMAX = 150, ACC = 80, TURN = 2.5;
const wrap = (a) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const onTrack = (x, y) => {
  const o = ((x - CX) / RXO) ** 2 + ((y - CY) / RYO) ** 2, i = ((x - CX) / RXI) ** 2 + ((y - CY) / RYI) ** 2;
  return o <= 1 && i >= 1;
};
const thetaOf = (x, y) => Math.atan2((y - CY) / RYM, (x - CX) / RXM);
/** Tangente (Fahrtrichtung, im Uhrzeigersinn auf dem Bildschirm) am Winkel th */
const tangent = (th) => Math.atan2(RYM * Math.cos(th), -RXM * Math.sin(th));

class Rennen {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.running = false; this.st = {}; this.bots = {}; this.firstFin = null;
    const n = ctx.players.length;
    ctx.players.forEach((p, i) => {
      const th = -0.1 - Math.floor(i / 2) * 0.1;
      const lane = i % 2 ? 0.28 : -0.28;
      const x = CX + (RXM + lane * (RXO - RXI) / 2) * Math.cos(th), y = CY + (RYM + lane * (RYO - RYI) / 2) * Math.sin(th);
      this.st[p.uid] = { x, y, a: tangent(th), v: 0, th, prog: th, fin: null, l: 0, r: 0 };
    });
  }
  start() { this.running = true; }
  onInput(uid, input) { const s = this.st[uid]; if (s) { s.l = input.l ? 1 : 0; s.r = input.r ? 1 : 0; } }
  update(dt) {
    if (!this.running) return;
    this.t += dt;
    for (const p of this.ctx.players) {
      const s = this.st[p.uid];
      if (s.fin != null) { s.v = Math.max(0, s.v - 120 * dt); } else {
        const vmax = onTrack(s.x, s.y) ? VMAX : 55;
        s.v = s.v < vmax ? Math.min(vmax, s.v + ACC * dt) : Math.max(vmax, s.v - 160 * dt);
        s.a += (s.r - s.l) * TURN * dt * (0.55 + 0.45 * Math.min(1, s.v / 80));
      }
      s.x += Math.cos(s.a) * s.v * dt; s.y += Math.sin(s.a) * s.v * dt;
      s.x = clamp(s.x, 4, W - 4); s.y = clamp(s.y, 4, H - 4);
      const th = thetaOf(s.x, s.y);
      s.prog += wrap(th - s.th); s.th = th;
      if (s.fin == null && s.prog >= LAPS * Math.PI * 2 - 0.0001) { s.fin = this.t; if (this.firstFin == null) this.firstFin = this.t; if (p.uid === this.ctx.me) { this.ctx.sfx('win'); this.ctx.vibrate(120); } }
    }
    // Autos schieben sich weg
    const ps = this.ctx.players;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = this.st[ps[i].uid], b = this.st[ps[j].uid];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      if (d < 16) { const o = (16 - d) / 2; a.x -= dx / d * o; a.y -= dy / d * o; b.x += dx / d * o; b.y += dy / d * o; }
    }
  }
  isFinished() { return this.ctx.players.every((p) => this.st[p.uid].fin != null) || (this.firstFin != null && this.t > this.firstFin + 9); }
  snapshot() {
    return { t: r1(this.t), ff: this.firstFin != null ? 1 : 0, p: this.ctx.players.map((p) => { const s = this.st[p.uid]; return [r1(s.x), r1(s.y), r2(s.a), r3(s.prog), s.fin != null ? r2(s.fin) : -1]; }) };
  }

  botThink(bot, snap, dt) {
    const s = this.st[bot.uid];
    const prm = botParams(bot.botLevel);
    const b = this.bots[bot.uid] || (this.bots[bot.uid] = { t: 0, l: 0, r: 0, off: (Math.random() - 0.5) * 0.4, wob: Math.random() * 6 });
    b.t -= dt;
    if (b.t <= 0) {
      b.t = 0.04 + prm.react * 0.25;
      const look = 0.30 + (1 - prm.aim) * 0.25;
      const th = s.th + look;
      const lane = b.off + Math.sin(this.t * 0.8 + b.wob) * (1 - prm.aim) * 0.3;
      const tx = CX + (RXM + lane * (RXO - RXI) / 2) * Math.cos(th), ty = CY + (RYM + lane * (RYO - RYI) / 2) * Math.sin(th);
      const diff = wrap(Math.atan2(ty - s.y, tx - s.x) - s.a);
      const dz = 0.05 + (1 - prm.aim) * 0.15;
      b.l = diff < -dz ? 1 : 0; b.r = diff > dz ? 1 : 0;
      if (Math.random() < prm.err * 0.05) { b.l = 0; b.r = 0; }
    }
    return { l: b.l, r: b.r };
  }

  result() {
    const items = this.ctx.players.map((p) => ({ uid: p.uid, fin: this.st[p.uid].fin, prog: this.st[p.uid].prog }));
    const cmp = (a, b) => {
      if (a.fin != null && b.fin != null) return Math.abs(a.fin - b.fin) < 0.02 ? 0 : a.fin - b.fin;
      if (a.fin != null) return -1; if (b.fin != null) return 1;
      return Math.abs(a.prog - b.prog) < 0.01 ? 0 : b.prog - a.prog;
    };
    return { ranks: competitionRanks(items, cmp).map(({ item, rank }) => ({ uid: item.uid, rank, value: item.fin != null ? r2(item.fin) : r2(item.prog), label: item.fin != null ? `${item.fin.toFixed(1)} s` : `Runde ${Math.max(0, Math.min(LAPS, item.prog / (Math.PI * 2))).toFixed(1)}` })) };
  }

  render(g, snap, me, alpha, prev) {
    g.fillStyle = '#2e7d3a'; rrect(g, 0, 0, W, H, 14); g.fill();
    g.fillStyle = '#4a4f57'; g.beginPath(); g.ellipse(CX, CY, RXO, RYO, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2e7d3a'; g.beginPath(); g.ellipse(CX, CY, RXI, RYI, 0, 0, Math.PI * 2); g.fill();
    g.lineWidth = 5; g.strokeStyle = '#e8e8e8'; g.setLineDash([14, 14]);
    g.beginPath(); g.ellipse(CX, CY, RXO - 2, RYO - 2, 0, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.ellipse(CX, CY, RXI + 2, RYI + 2, 0, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    // Start/Ziel bei θ=0 (rechts)
    const x0 = CX + RXI, x1 = CX + RXO;
    for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#fff' : '#111'; g.fillRect(x0 + (x1 - x0) * k / 8, CY - 4, (x1 - x0) / 8, 8); }
    text(g, 'START / ZIEL', CX, CY, { size: 14, color: 'rgba(255,255,255,.6)' });
    const ps = this.ctx.players;
    ps.forEach((p, i) => {
      const c = snap.p[i], pv = prev && prev.p ? prev.p[i] : null;
      const x = pv ? pv[0] + (c[0] - pv[0]) * alpha : c[0], y = pv ? pv[1] + (c[1] - pv[1]) * alpha : c[1];
      g.save(); g.translate(x, y); g.rotate(c[2]);
      g.fillStyle = p.colorHex; rrect(g, -11, -6, 22, 12, 4); g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.fillRect(2, -4, 6, 8);
      g.restore();
      text(g, p.avatar, x, y - 12, { size: 11 });
      if (p.uid === me) arrowDown(g, x, y - 24, '#ffe14d', 5);
    });
    const mi = ps.findIndex((p) => p.uid === me);
    if (mi >= 0) {
      const c = snap.p[mi];
      const lap = Math.min(LAPS, Math.max(1, Math.floor(c[3] / (Math.PI * 2)) + 1));
      text(g, c[4] >= 0 ? `Im Ziel! ${c[4].toFixed(1)} s` : `Runde ${lap}/${LAPS}`, CX, CY + 30, { size: 22, color: '#fff', stroke: 'rgba(0,0,0,.6)', strokeW: 5 });
      const order = snap.p.map((q, i) => [q[4] >= 0 ? 1e6 - q[4] : q[3], i]).sort((a, b) => b[0] - a[0]);
      text(g, `Platz ${order.findIndex((o) => o[1] === mi) + 1}/${ps.length}`, CX, CY - 28, { size: 16, color: '#ffe14d', stroke: 'rgba(0,0,0,.6)', strokeW: 4 });
    }
  }
}

export default {
  id: 'rennen', name: 'Rennwagen', emoji: '🏎️', category: 'Rennen', tags: ['rennen'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'host', controls: 'LR', duration: 70,
  view: { w: W, h: H },
  howTo: ['Dein Auto gibt selbst Gas – du lenkst mit ◀ und ▶.', 'Fahr 3 Runden. Im Gras bist du viel langsamer!'],
  wertung: 'Wer zuerst 3 Runden geschafft hat, gewinnt. Wer nicht ankommt, zählt nach gefahrener Strecke.',
  create: (ctx) => new Rennen(ctx),
};
