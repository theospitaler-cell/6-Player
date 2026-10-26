// 🎨 Farbwort – tippe die FARBE, in der das Wort geschrieben ist (nicht, was da steht!).
import { text, rrect } from '../core/draw.js';
import { colorGrid } from '../core/widgets.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { mulberry32, clamp } from '../core/util.js';

const W = 540, H = 330, LOCK = 0.5;
export const COLS4 = [{ id: 'rot', hex: '#ff4d6d', name: 'ROT' }, { id: 'blau', hex: '#3d8bff', name: 'BLAU' }, { id: 'gruen', hex: '#2fd67b', name: 'GRÜN' }, { id: 'gelb', hex: '#ffcf33', name: 'GELB' }];
const task = (seed, i) => {
  const r = mulberry32((seed ^ Math.imul(i + 9, 2246822519)) >>> 0);
  const ink = Math.floor(r() * 4);
  const word = r() < 0.75 ? (ink + 1 + Math.floor(r() * 3)) % 4 : ink;
  return { ink, word };
};

class Farbwort extends LocalGame {
  constructor(ctx) { super(ctx); this.i = 0; this.pts = 0; this.wrong = 0; this.lock = 0; this.flash = 0; this.ok = true; this.task = task(ctx.seed, 0); this.lastN = -1; }
  onInput(uid, input) {
    if (!this.running || this.lock > 0) return;
    if (input.n != null && input.n === this.lastN) return;
    this.lastN = input.n;
    const k = input.pick | 0;
    if (k === this.task.ink) { this.pts++; this.ok = true; this.flash = 0.18; this.ctx.sfx('coin'); this.ctx.vibrate(8); }
    else { this.pts = Math.max(0, this.pts - 1); this.wrong++; this.ok = false; this.lock = LOCK; this.flash = LOCK; this.ctx.sfx('error'); this.ctx.vibrate(90); }
    this.i++; this.task = task(this.ctx.seed, this.i);
  }
  tick(dt) { this.lock = Math.max(0, this.lock - dt); this.flash = Math.max(0, this.flash - dt); }
  mountUI(box, api) { this.n = 0; this.grid = colorGrid(box, COLS4, (i) => api.send({ pick: i, n: ++this.n }), { cols: 2 }); }
  updateUI() { if (this.grid) this.grid.setEnabled(this.running && this.lock <= 0); }
  score() { return this.pts; }
  payload() { return { s: this.pts, w: this.wrong }; }
  clean(d) { const max = Math.ceil(this.ctx.duration / 0.3); return { s: clamp(Math.floor(Number(d.s) || 0), 0, max), w: clamp(Math.floor(Number(d.w) || 0), 0, max) }; }
  empty() { return { s: 0, w: 0 }; }
  compare(a, b) { return b.s - a.s || a.w - b.w; }
  value(s) { return s.s; }
  label(s) { return `${s.s} richtig`; }
  botResult(sk) { const s = Math.round(clamp(sk * 30 * (0.75 + Math.random() * 0.5), 0, 50)); return { s, w: Math.round((1 - sk) * 7 * Math.random()) }; }

  render(g, snap, me) {
    g.fillStyle = this.flash > 0 ? (this.ok ? '#1f5c3a' : '#6b2434') : '#2a2d3b'; rrect(g, 0, 0, W, H, 16); g.fill();
    const t = this.task;
    text(g, COLS4[t.word].name, 205, 140, { size: 84, color: COLS4[t.ink].hex, stroke: 'rgba(255,255,255,.25)', strokeW: 3 });
    text(g, 'Welche FARBE hat das Wort?', 205, 240, { size: 17, color: 'rgba(255,255,255,.8)' });
    if (this.lock > 0) text(g, 'Falsch!', 205, 276, { size: 18, color: '#ff9bb0' });
    text(g, `${this.pts} richtig`, 205, 26, { size: 22, color: '#ffe14d' });
    liveBoard(g, this.ctx, snap, me, this.pts, { x: 380, y: 10, w: 150, row: 24, title: 'Punkte' });
  }
}

export default {
  id: 'farbwort', name: 'Farbwort', emoji: '🎨', category: 'Denken', tags: ['denken'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'PICK', ctlWidth: 0.4, duration: 30,
  view: { w: W, h: H },
  howTo: ['Ein Farbwort erscheint – aber in einer anderen Farbe geschrieben!', 'Tippe den Knopf mit der FARBE der Schrift, nicht mit dem gelesenen Wort.'],
  wertung: 'Die meisten richtigen Antworten in 30 Sekunden gewinnen (Fehler kosten einen Punkt).',
  create: (ctx) => new Farbwort(ctx),
};
