// ⭐ Sterne-Sammeln – lauf zu den Sternen, goldene zählen dreifach.
import { text, disc, arrowDown } from '../core/draw.js';
import { rankByScore } from '../core/gamekit.js';
import { botParams } from '../core/bots.js';
import { clamp, r1, r2, rand } from '../core/util.js';

const W = 560, H = 340, PR = 14, SPEED = 125;

class Sterne {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.running = false; this.st = {}; this.bots = {}; this.stars = []; this.acc = 0; this.n = 0; this.pop = [];
    const n = ctx.players.length;
    ctx.players.forEach((p, i) => { const a = (i / n) * Math.PI * 2; this.st[p.uid] = { x: W / 2 + Math.cos(a) * 140, y: H / 2 + Math.sin(a) * 90, sx: 0, sy: 0, score: 0 }; });
    for (let i = 0; i < 4; i++) this.spawn();
  }
  start() { this.running = true; }
  spawn() { this.n++; this.stars.push({ x: rand(30, W - 30), y: rand(30, H - 30), v: this.n % 6 === 0 ? 3 : 1, life: 9 }); }
  onInput(uid, input) { const s = this.st[uid]; if (s) { s.sx = clamp(Number(input.x) || 0, -1, 1); s.sy = clamp(Number(input.y) || 0, -1, 1); } }
  update(dt) {
    if (!this.running) return;
    this.t += dt; this.acc += dt;
    if (this.acc > 0.7 && this.stars.length < 5 + this.ctx.players.length) { this.acc = 0; this.spawn(); }
    for (const k of this.stars) k.life -= dt;
    this.stars = this.stars.filter((k) => k.life > 0);
    this.pop = this.pop.filter((q) => (q.t -= dt) > 0);
    for (const p of this.ctx.players) {
      const s = this.st[p.uid];
      const len = Math.hypot(s.sx, s.sy);
      if (len > 0.12) { const k = Math.min(1, len) / len; s.x = clamp(s.x + s.sx * k * SPEED * dt, PR, W - PR); s.y = clamp(s.y + s.sy * k * SPEED * dt, PR, H - PR); }
      for (let i = this.stars.length - 1; i >= 0; i--) {
        const k = this.stars[i];
        if (Math.hypot(k.x - s.x, k.y - s.y) < PR + 11) {
          s.score += k.v; this.pop.push({ x: k.x, y: k.y, v: k.v, t: 0.6 }); this.stars.splice(i, 1);
          if (p.uid === this.ctx.me) { this.ctx.sfx('coin'); this.ctx.vibrate(15); }
        }
      }
    }
  }
  snapshot() {
    return {
      t: r1(this.t), k: this.stars.map((k) => [r1(k.x), r1(k.y), k.v, r1(k.life)]), q: this.pop.map((q) => [r1(q.x), r1(q.y), q.v]),
      p: this.ctx.players.map((p) => { const s = this.st[p.uid]; return [r1(s.x), r1(s.y), s.score]; }),
    };
  }
  botThink(bot, snap, dt) {
    const s = this.st[bot.uid];
    const prm = botParams(bot.botLevel);
    const b = this.bots[bot.uid] || (this.bots[bot.uid] = { t: 0, x: 0, y: 0 });
    b.t -= dt;
    if (b.t <= 0) {
      b.t = prm.react * (0.4 + Math.random() * 0.6);
      let best = null, bs = -1e9;
      for (const k of this.stars) {
        const d = Math.hypot(k.x - s.x, k.y - s.y);
        const reach = d / SPEED < k.life; // schafft man es noch?
        const score = k.v * 40 - d + (reach ? 0 : -200) + Math.random() * (1 - prm.aim) * 80;
        if (score > bs) { bs = score; best = k; }
      }
      if (best) { const dx = best.x - s.x, dy = best.y - s.y, l = Math.hypot(dx, dy) || 1; b.x = r2(dx / l); b.y = r2(dy / l); } else { b.x = 0; b.y = 0; }
    }
    return { x: b.x, y: b.y };
  }
  result() { return { ranks: rankByScore(this.ctx.players, (p) => this.st[p.uid].score, { label: (u, s) => `${s} ⭐` }) }; }
  render(g, snap, me, alpha, prev) {
    const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#0f1b4d'); grad.addColorStop(1, '#2a4a9a');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    for (const k of snap.k) {
      const pulse = 1 + Math.sin(performance.now() / 150 + k[0]) * 0.08;
      const fade = k[3] < 2 ? (Math.floor(performance.now() / 120) % 2 ? 0.4 : 1) : 1;
      g.globalAlpha = fade;
      text(g, k[2] === 3 ? '🌟' : '⭐', k[0], k[1], { size: (k[2] === 3 ? 30 : 22) * pulse });
      g.globalAlpha = 1;
    }
    for (const q of snap.q) text(g, '+' + q[2], q[0], q[1] - 16, { size: 18, color: '#ffe14d', stroke: 'rgba(0,0,0,.5)', strokeW: 4 });
    const ps = this.ctx.players;
    ps.forEach((p, i) => {
      const c = snap.p[i], pv = prev && prev.p ? prev.p[i] : null;
      const x = pv ? pv[0] + (c[0] - pv[0]) * alpha : c[0], y = pv ? pv[1] + (c[1] - pv[1]) * alpha : c[1];
      disc(g, x, y, PR, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : p.ring });
      if (p.uid === me) arrowDown(g, x, y - PR - 8, '#ffe14d', 5);
    });
    // Punktestand
    ps.forEach((p, i) => { text(g, `${p.avatar} ${snap.p[i][2]}`, 12 + i * 70, 14, { size: 14, align: 'left', color: p.uid === me ? '#ffe14d' : '#fff', stroke: 'rgba(0,0,0,.5)', strokeW: 3 }); });
  }
}

export default {
  id: 'sterne', name: 'Sterne-Sammeln', emoji: '⭐', category: 'Geschick', tags: ['party'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'host', controls: 'JOY', duration: 40,
  view: { w: W, h: H },
  howTo: ['Lauf mit dem Joystick zu den Sternen ⭐ – sie verschwinden nach kurzer Zeit!', '🌟 goldene Sterne zählen dreifach.'],
  wertung: 'Die meisten Sterne gewinnen.',
  create: (ctx) => new Sterne(ctx),
};
