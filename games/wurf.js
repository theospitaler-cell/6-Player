// 🏀 Korbwurf – ziehen und loslassen wie eine Schleuder. Der Korb springt nach jedem Treffer woandershin.
import { text, rrect } from '../core/draw.js';
import { AimDrag, drawAim } from '../core/aim.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { mulberry32, clamp } from '../core/util.js';

const W = 560, H = 330, OX = 70, OY = H - 62, GR = 640, BRAD = 10, FLOOR = H - 22;
const hoopAt = (seed, i) => { const r = mulberry32((seed ^ Math.imul(i + 11, 2654435761)) >>> 0); return { x: 340 + r() * 150, y: 95 + r() * 90 }; };

class Wurf extends LocalGame {
  constructor(ctx) { super(ctx); this.aim = new AimDrag({ maxPull: 110, minPull: 14 }); this.i = 0; this.pts = 0; this.n = 0; this.ball = null; this.fx = null; this.hoop = hoopAt(ctx.seed, 0); }
  onPointer(type, x, y) {
    if (!this.running) return;
    if (type === 'down') { if (!this.ball) this.aim.down(x, y); }
    else if (type === 'move') this.aim.move(x, y);
    else if (type === 'up') {
      const v = this.aim.up(x, y);
      if (v && !this.ball) { const sp = 260 + v.power * 560; this.ball = { x: OX, y: OY, vx: v.dx * sp, vy: v.dy * sp, rest: 0, scored: false }; this.ctx.sfx('whoosh'); }
    } else this.aim.cancel();
  }
  tick(dt) {
    if (this.fx) { this.fx.t -= dt; if (this.fx.t <= 0) this.fx = null; }
    const b = this.ball;
    if (!b) return;
    const px = b.x, py = b.y;
    b.vy += GR * dt; b.x += b.vx * dt; b.y += b.vy * dt;
    const h = this.hoop;
    // Brett
    if (b.x + BRAD > h.x + 30 && b.x - BRAD < h.x + 36 && b.y > h.y - 60 && b.y < h.y + 12) { b.x = h.x + 30 - BRAD; b.vx = -Math.abs(b.vx) * 0.55; }
    // Ringenden
    for (const rx of [h.x - 24, h.x + 24]) {
      const dx = b.x - rx, dy = b.y - h.y, d = Math.hypot(dx, dy);
      if (d < BRAD + 3) { const nx = dx / (d || 1), ny = dy / (d || 1); b.x = rx + nx * (BRAD + 3); b.y = h.y + ny * (BRAD + 3); const dot = b.vx * nx + b.vy * ny; if (dot < 0) { b.vx -= 1.5 * dot * nx; b.vy -= 1.5 * dot * ny; } }
    }
    // Treffer: von oben durch den Ring
    if (!b.scored && py < h.y && b.y >= h.y && b.vy > 0 && Math.abs(b.x - h.x) < 21) {
      b.scored = true;
      const swish = Math.abs(b.x - h.x) < 9;
      this.pts += swish ? 3 : 2; this.n++; this.fx = { t: 0.9, txt: swish ? 'SWISH +3' : '+2' };
      this.ctx.sfx('win'); this.ctx.vibrate(40);
      this.i++; this.hoop = hoopAt(this.ctx.seed, this.i);
    }
    if (b.x < -20 || b.x > W + 20 || b.y > FLOOR) {
      if (b.y > FLOOR) { b.y = FLOOR; b.vy = -Math.abs(b.vy) * 0.4; b.vx *= 0.7; b.rest += 1; }
      if (b.x < -20 || b.x > W + 20 || b.rest > 2) this.ball = null;
    }
  }
  score() { return this.pts; }
  payload() { return { s: this.pts, n: this.n }; }
  clean(d) { const max = Math.ceil(this.ctx.duration / 0.8) * 3; return { s: clamp(Math.floor(Number(d.s) || 0), 0, max), n: clamp(Math.floor(Number(d.n) || 0), 0, max) }; }
  empty() { return { s: 0, n: 0 }; }
  compare(a, b) { return b.s - a.s || b.n - a.n; }
  value(s) { return s.s; }
  label(s) { return `${s.s} Punkte (${s.n} Körbe)`; }
  botResult(sk) { const n = Math.round(clamp(sk * 9 * (0.7 + Math.random() * 0.6), 0, 14)); return { s: n * 2 + Math.floor(n * 0.3 * Math.random()), n }; }

  render(g, snap, me) {
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#ffb36b'); sky.addColorStop(1, '#ffe7c2');
    g.fillStyle = sky; rrect(g, 0, 0, W, H, 16); g.fill();
    g.fillStyle = '#b5703a'; g.fillRect(0, FLOOR + 6, W, H - FLOOR - 6);
    const h = this.hoop;
    g.fillStyle = '#fff'; g.strokeStyle = '#888'; g.lineWidth = 3; rrect(g, h.x + 30, h.y - 60, 8, 72, 3); g.fill(); g.stroke();
    g.strokeStyle = '#ff5a2a'; g.lineWidth = 5; g.beginPath(); g.moveTo(h.x - 24, h.y); g.lineTo(h.x + 24, h.y); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2;
    for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(h.x + k * 7, h.y); g.lineTo(h.x + k * 4, h.y + 26); g.stroke(); }
    text(g, '🧍', OX - 18, OY + 22, { size: 36 });
    if (this.aim.active && !this.ball) drawAim(g, this.aim, '#ffe14d', OX, OY);
    const b = this.ball || { x: OX, y: OY };
    text(g, '🏀', b.x, b.y, { size: 24 });
    if (this.fx) text(g, this.fx.txt, h.x, h.y - 80, { size: 24, color: '#fff', stroke: '#c0392b', strokeW: 6 });
    text(g, `${this.pts} Punkte`, 14, 18, { size: 18, align: 'left', color: '#7a3d00' });
    if (!this.ball && !this.aim.active) text(g, 'Ziehen & loslassen!', W / 2 - 60, H - 8, { size: 13, color: '#7a3d00' });
    liveBoard(g, this.ctx, snap, me, this.pts, { x: W - 118, y: 8, w: 110, row: 20, title: 'Punkte' });
  }
}

export default {
  id: 'wurf', name: 'Korbwurf', emoji: '🏀', category: 'Sport', tags: ['sport', 'zielen'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'AIM', pointer: true, duration: 30,
  view: { w: W, h: H },
  howTo: ['Ziehe auf dem Bildschirm nach hinten und lass los – je weiter, desto kräftiger der Wurf.', 'Treffer geben 2 Punkte, ein sauberes „Swish“ 3. Nach jedem Treffer springt der Korb.'],
  wertung: 'Die meisten Punkte in 30 Sekunden gewinnen.',
  create: (ctx) => new Wurf(ctx),
};
