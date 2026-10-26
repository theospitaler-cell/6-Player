// 👉 Wisch-Meister – wische in Pfeilrichtung. Roter Pfeil = in die ENTGEGENGESETZTE Richtung!
import { text, rrect } from '../core/draw.js';
import { SwipeDetector, DIRS, DIR_ARROW } from '../core/aim.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { mulberry32, clamp } from '../core/util.js';

const W = 560, H = 330, LOCK = 0.4;
const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
const task = (seed, i) => { const r = mulberry32((seed ^ Math.imul(i + 5, 2654435761)) >>> 0); return { dir: DIRS[Math.floor(r() * 4)], inv: i > 3 && r() < 0.28 }; };

class Wisch extends LocalGame {
  constructor(ctx) { super(ctx); this.sw = new SwipeDetector(); this.i = 0; this.pts = 0; this.wrong = 0; this.lock = 0; this.flash = 0; this.ok = true; this.task = task(ctx.seed, 0); this.trail = null; }
  onPointer(type, x, y) {
    if (!this.running) return;
    if (type === 'down') { this.sw.down(x, y); this.trail = [[x, y]]; }
    else if (type === 'move') { this.sw.move(x, y); if (this.trail) this.trail.push([x, y]); }
    else if (type === 'up') {
      const r = this.sw.up(x, y); this.trail = null;
      if (r && this.lock <= 0) this.answer(r.dir);
    } else { this.sw.active = false; this.trail = null; }
  }
  answer(dir) {
    const want = this.task.inv ? OPP[this.task.dir] : this.task.dir;
    if (dir === want) { this.pts++; this.ok = true; this.flash = 0.2; this.ctx.sfx('coin'); this.ctx.vibrate(10); }
    else { this.pts = Math.max(0, this.pts - 1); this.wrong++; this.ok = false; this.flash = LOCK; this.lock = LOCK; this.ctx.sfx('error'); this.ctx.vibrate(90); }
    this.i++; this.task = task(this.ctx.seed, this.i);
  }
  tick(dt) { this.lock = Math.max(0, this.lock - dt); this.flash = Math.max(0, this.flash - dt); }
  score() { return this.pts; }
  payload() { return { s: this.pts, w: this.wrong }; }
  clean(d) { const max = Math.ceil(this.ctx.duration / 0.25); return { s: clamp(Math.floor(Number(d.s) || 0), 0, max), w: clamp(Math.floor(Number(d.w) || 0), 0, max) }; }
  empty() { return { s: 0, w: 0 }; }
  compare(a, b) { return b.s - a.s || a.w - b.w; }
  value(s) { return s.s; }
  label(s) { return `${s.s} richtig`; }
  botResult(sk) { const s = Math.round(clamp(sk * 34 * (0.75 + Math.random() * 0.5), 0, 55)); return { s, w: Math.round((1 - sk) * 6 * Math.random()) }; }

  render(g, snap, me) {
    g.fillStyle = this.flash > 0 ? (this.ok ? '#1f5c3a' : '#6b2434') : '#2a2d6b'; rrect(g, 0, 0, W, H, 16); g.fill();
    const t = this.task;
    const col = t.inv ? '#ff4d6d' : '#fff';
    g.save(); g.globalAlpha = this.lock > 0 ? 0.35 : 1;
    text(g, DIR_ARROW[t.dir], 215, 150, { size: 120 });
    g.restore();
    if (t.inv) { g.strokeStyle = col; g.lineWidth = 8; g.beginPath(); g.arc(215, 150, 92, 0, 7); g.stroke(); text(g, 'GEGENRICHTUNG!', 215, 268, { size: 20, color: '#ff8aa0', stroke: 'rgba(0,0,0,.5)', strokeW: 5 }); }
    else text(g, 'Wische in Pfeilrichtung', 215, 268, { size: 16, color: 'rgba(255,255,255,.8)' });
    if (this.trail && this.trail.length > 1) { g.strokeStyle = 'rgba(255,225,77,.8)'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(this.trail[0][0], this.trail[0][1]); for (const p of this.trail) g.lineTo(p[0], p[1]); g.stroke(); }
    text(g, `${this.pts} richtig`, 215, 26, { size: 22, color: '#ffe14d' });
    liveBoard(g, this.ctx, snap, me, this.pts, { x: 410, y: 10, w: 140, row: 24, title: 'Punkte' });
  }
}

export default {
  id: 'wisch', name: 'Wisch-Meister', emoji: '👉', category: 'Reaktion', tags: ['party'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'SWIPE', pointer: true, duration: 30,
  view: { w: W, h: H },
  howTo: ['Wische auf dem Bildschirm in die Richtung des Pfeils.', 'Ist der Pfeil rot und eingekreist, musst du in die ENTGEGENGESETZTE Richtung wischen!'],
  wertung: 'Die meisten richtigen Wischer in 30 Sekunden gewinnen (Fehler kosten einen Punkt).',
  create: (ctx) => new Wisch(ctx),
};
