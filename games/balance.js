// ⚖️ Wippe – halte die Kugel auf der schrumpfenden Platte. Handy neigen (oder Joystick)!
import { text, rrect } from '../core/draw.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { clamp } from '../core/util.js';

const W = 560, H = 330, R0 = 135, R1 = 62, ACC = 470, FR = 0.9, BR = 12, CX = 190, CY = 170;

class Balance extends LocalGame {
  constructor(ctx) { super(ctx); this.x = 0; this.y = 0; this.vx = 0; this.vy = 0; this.ix = 0; this.iy = 0; this.fell = false; this.surv = 0; }
  radius() { return R0 - (R0 - R1) * clamp(this.t / (this.ctx.duration * 0.9), 0, 1); }
  onInput(uid, input) { this.ix = clamp(Number(input.x) || 0, -1, 1); this.iy = clamp(Number(input.y) || 0, -1, 1); }
  tick(dt) {
    if (this.fell) return;
    // leichter „Wind“, damit man nicht einfach stillhalten kann
    const wob = Math.sin(this.t * 1.7) * 40, wob2 = Math.cos(this.t * 1.3) * 40;
    this.vx += (this.ix * ACC + wob) * dt; this.vy += (this.iy * ACC + wob2) * dt;
    const f = Math.exp(-FR * dt); this.vx *= f; this.vy *= f;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.surv = this.t;
    if (Math.hypot(this.x, this.y) > this.radius() + BR * 0.4) { this.fell = true; this.ctx.sfx('fall'); this.ctx.vibrate(150); this.finish(); }
  }
  timeUp() { this.surv = this.ctx.duration; super.timeUp(); }
  score() { return Math.floor(this.surv * 10); }
  payload() { return { t: Math.round(this.surv * 100) / 100 }; }
  clean(d) { return { t: clamp(Number(d.t) || 0, 0, this.ctx.duration + 0.5) }; }
  empty() { return { t: 0 }; }
  compare(a, b) { return Math.abs(b.t - a.t) < 0.05 ? 0 : b.t - a.t; }
  value(s) { return s.t; }
  label(s) { return `${s.t.toFixed(1)} s balanciert`; }
  botResult(sk) { return { t: clamp(this.ctx.duration * sk * (0.55 + Math.random() * 0.6), 3, this.ctx.duration) }; }

  render(g, snap, me) {
    g.fillStyle = '#233a5e'; rrect(g, 0, 0, W, H, 16); g.fill();
    const R = this.radius();
    g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(CX + 6, CY + 10, R, 0, 7); g.fill();
    const gr = g.createRadialGradient(CX, CY, 10, CX, CY, R); gr.addColorStop(0, '#9be3ff'); gr.addColorStop(1, '#4aa0d8');
    g.fillStyle = gr; g.beginPath(); g.arc(CX, CY, R, 0, 7); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 5; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = 2; for (let r = 25; r < R; r += 25) { g.beginPath(); g.arc(CX, CY, r, 0, 7); g.stroke(); }
    if (!this.fell) { g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(CX + this.x + 3, CY + this.y + 9, BR, BR * 0.5, 0, 0, 7); g.fill(); }
    g.fillStyle = this.fell ? '#888' : '#ff4d6d'; g.beginPath(); g.arc(CX + this.x, CY + this.y, this.fell ? BR * 0.6 : BR, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.6)'; g.beginPath(); g.arc(CX + this.x - 4, CY + this.y - 4, 3.5, 0, 7); g.fill();
    text(g, `${this.surv.toFixed(1)} s`, CX, 24, { size: 24, color: '#fff', stroke: 'rgba(0,0,0,.5)', strokeW: 5 });
    text(g, this.fell ? 'Runtergefallen!' : 'Neige das Handy – bleib in der Mitte!', CX, H - 14, { size: 14, color: this.fell ? '#ff9bb0' : 'rgba(255,255,255,.8)' });
    liveBoard(g, this.ctx, snap, me, this.score(), { x: 392, y: 10, w: 160, row: 24, title: 'Sekunden ×10', fmt: (v) => (v / 10).toFixed(1) + ' s' });
  }
}

export default {
  id: 'balance', name: 'Wippe', emoji: '⚖️', category: 'Geschick', tags: ['geschick'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'TILT', duration: 40,
  view: { w: W, h: H },
  howTo: ['Neige dein Handy, damit die Kugel auf der Platte bleibt. (Ohne Sensor: Joystick.)', 'Die Platte wird immer kleiner und ein Wind schubst die Kugel.'],
  wertung: 'Wer am längsten oben bleibt, gewinnt.',
  create: (ctx) => new Balance(ctx),
};
