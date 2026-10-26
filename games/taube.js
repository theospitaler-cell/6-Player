// 🕊️ Taube – Flatter durch die Lücken. Tippen = Flügelschlag. Alle bekommen dieselben Röhren (Seed).
import { text, rrect, disc } from '../core/draw.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { mulberry32, clamp, r1 } from '../core/util.js';

const W = 560, H = 330, SPEED = 120, GAP = 104, SPACING = 175, BX = 120, G = 760, FLAP = -255, BRAD = 11, FIRST = 330;
const gapY = (seed, i) => 70 + mulberry32((seed ^ Math.imul(i + 3, 2246822519)) >>> 0)() * (H - 140 - 0);

class Taube extends LocalGame {
  constructor(ctx) { super(ctx); this.y = H / 2; this.vy = 0; this.x = 0; this.passed = 0; this.dead = false; this.lastTaps = 0; this.flapT = 0; }
  onStart() { this.vy = FLAP * 0.8; }
  onInput(uid, input) {
    const n = input.taps | 0;
    if (n > this.lastTaps) { this.lastTaps = n; if (this.running && !this.dead) { this.vy = FLAP; this.flapT = 0.15; this.ctx.sfx('tap'); } }
  }
  tick(dt) {
    if (this.dead) return;
    this.x += SPEED * dt;
    this.vy += G * dt; this.y += this.vy * dt; this.flapT = Math.max(0, this.flapT - dt);
    const wx = this.x + BX;
    const i = Math.floor((wx - FIRST + SPACING / 2) / SPACING);
    // Röhre i steht bei x = FIRST + i*SPACING (Breite 46)
    for (let k = Math.max(0, i - 1); k <= i + 1; k++) {
      const px = FIRST + k * SPACING;
      if (wx + BRAD > px && wx - BRAD < px + 46) {
        const gy = gapY(this.ctx.seed, k);
        if (this.y - BRAD < gy - GAP / 2 || this.y + BRAD > gy + GAP / 2) return this.die();
      }
    }
    this.passed = Math.max(0, Math.floor((wx - BRAD - FIRST - 46) / SPACING) + 1);
    if (this.y > H - 6 || this.y < -20) this.die();
  }
  die() { this.dead = true; this.ctx.sfx('fall'); this.ctx.vibrate(120); this.finish(); }
  score() { return this.passed; }
  payload() { return { s: this.passed, d: Math.round(this.x) }; }
  clean(d) {
    const max = Math.floor(((this.ctx.duration + 1) * SPEED - FIRST) / SPACING) + 1;
    return { s: clamp(Math.floor(Number(d.s) || 0), 0, max), d: clamp(Math.floor(Number(d.d) || 0), 0, (this.ctx.duration + 1) * SPEED) };
  }
  empty() { return { s: 0, d: 0 }; }
  compare(a, b) { return b.s - a.s || b.d - a.d; }
  value(s) { return s.s; }
  label(s) { return `${s.s} Röhren`; }
  botResult(sk) { const s = Math.round(clamp(sk * 15 * (0.75 + Math.random() * 0.5), 0, 22)); return { s, d: FIRST + s * SPACING + Math.floor(Math.random() * 100) }; }

  render(g, snap, me) {
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#6ec6ff'); sky.addColorStop(1, '#d9f3ff');
    g.fillStyle = sky; rrect(g, 0, 0, W, H, 16); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)';
    for (let k = 0; k < 5; k++) { const cx = ((k * 190 - this.x * 0.3) % (W + 120) + W + 120) % (W + 120) - 60; g.beginPath(); g.arc(cx, 50 + (k * 37) % 120, 26, 0, 7); g.arc(cx + 24, 56 + (k * 37) % 120, 20, 0, 7); g.fill(); }
    const first = Math.max(0, Math.floor((this.x - 60) / SPACING));
    for (let k = first; k < first + 5; k++) {
      const px = FIRST + k * SPACING - this.x - BX + BX, gy = gapY(this.ctx.seed, k);
      const sx = FIRST + k * SPACING - this.x;
      g.fillStyle = '#3aa655'; g.strokeStyle = '#1f6b35'; g.lineWidth = 3;
      rrect(g, sx, -10, 46, gy - GAP / 2 + 10, 6); g.fill(); g.stroke();
      rrect(g, sx, gy + GAP / 2, 46, H - gy - GAP / 2 + 10, 6); g.fill(); g.stroke();
    }
    g.save(); g.translate(BX, this.y); g.rotate(clamp(this.vy / 600, -0.5, 0.9));
    text(g, '🕊️', 0, 0, { size: this.flapT > 0 ? 34 : 30 }); g.restore();
    liveBoard(g, this.ctx, snap, me, this.passed, { x: W - 118, y: 8, w: 110, row: 20, title: 'Röhren' });
    if (!this.running && this.t === 0) text(g, 'Tippe zum Flattern!', W / 2, H - 24, { size: 16, color: '#14315c' });
    if (this.dead) text(g, `Aus! ${this.passed} Röhren`, W / 2, H / 2, { size: 30, color: '#fff', stroke: '#14315c', strokeW: 7 });
  }
}

export default {
  id: 'taube', name: 'Taube', emoji: '🕊️', category: 'Geschick', tags: ['party'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'TAP', duration: 40,
  view: { w: W, h: H },
  howTo: ['Tippe, damit die Taube flattert – fliege durch die Lücken der grünen Röhren.', 'Ein Aufprall und du bist raus. Alle haben dieselben Röhren!'],
  wertung: 'Die meisten durchflogenen Röhren gewinnen, danach die weiteste Strecke.',
  create: (ctx) => new Taube(ctx),
};
