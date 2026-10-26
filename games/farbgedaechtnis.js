// 🧩 Farb-Gedächtnis – merke dir die Farbreihe (Anzeigedauer einstellbar) und tippe sie nach. Jede Runde eine Farbe mehr.
import { text, rrect } from '../core/draw.js';
import { colorGrid } from '../core/widgets.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { mulberry32, clamp } from '../core/util.js';

const W = 540, H = 330, LIVES = 2;
const COLS = [{ id: 'rot', hex: '#ff4d6d' }, { id: 'blau', hex: '#3d8bff' }, { id: 'gruen', hex: '#2fd67b' }, { id: 'gelb', hex: '#ffcf33' }];
const seq = (seed, k) => { const r = mulberry32((seed ^ Math.imul(k + 21, 2654435761)) >>> 0); return Array.from({ length: k + 3 }, () => Math.floor(r() * 4)); };

class Farbgedaechtnis extends LocalGame {
  constructor(ctx) {
    super(ctx);
    this.showSec = clamp(Number(ctx.settings.colorMemorySec) || 3, 1, 5);
    this.k = 0; this.seq = seq(ctx.seed, 0); this.phase = 'show'; this.pt = 0; this.pos = 0; this.pts = 0; this.rounds = 0; this.lives = LIVES; this.flash = 0; this.ok = true; this.lastN = -1; this.grid = null;
  }
  tick(dt) {
    this.flash = Math.max(0, this.flash - dt);
    this.pt += dt;
    if (this.phase === 'show' && this.pt >= this.showSec) { this.phase = 'input'; this.pt = 0; this.pos = 0; }
    else if (this.phase === 'between' && this.pt >= 0.9) this.next();
  }
  next() { this.k++; this.seq = seq(this.ctx.seed, this.k); this.phase = 'show'; this.pt = 0; this.pos = 0; }
  onInput(uid, input) {
    if (!this.running || this.phase !== 'input') return;
    if (input.n != null && input.n === this.lastN) return;
    this.lastN = input.n;
    const c = input.pick | 0;
    if (c === this.seq[this.pos]) {
      this.pos++; this.ctx.sfx('pop');
      if (this.grid) this.grid.flash(c);
      if (this.pos >= this.seq.length) { this.pts += this.seq.length; this.rounds++; this.ok = true; this.flash = 0.8; this.phase = 'between'; this.pt = 0; this.ctx.sfx('win'); this.ctx.vibrate(40); }
    } else {
      this.lives--; this.ok = false; this.flash = 0.9; this.ctx.sfx('error'); this.ctx.vibrate(120);
      if (this.lives <= 0) { this.phase = 'over'; this.finish(); } else { this.phase = 'between'; this.pt = 0; }
    }
  }
  mountUI(box, api) { this.n = 0; this.grid = colorGrid(box, COLS, (i) => api.send({ pick: i, n: ++this.n }), { cols: 2 }); }
  updateUI() { if (this.grid) this.grid.setEnabled(this.running && this.phase === 'input'); }
  score() { return this.pts; }
  payload() { return { s: this.pts, r: this.rounds }; }
  clean(d) { return { s: clamp(Math.floor(Number(d.s) || 0), 0, 400), r: clamp(Math.floor(Number(d.r) || 0), 0, 60) }; }
  empty() { return { s: 0, r: 0 }; }
  compare(a, b) { return b.s - a.s || b.r - a.r; }
  value(s) { return s.s; }
  label(s) { return `${s.r} Runden (${s.s} Punkte)`; }
  botResult(sk) { const r = Math.round(clamp(sk * 4.2 * (0.7 + Math.random() * 0.6), 0, 8)); let s = 0; for (let i = 0; i < r; i++) s += i + 3; return { s, r }; }

  render(g, snap, me) {
    g.fillStyle = this.flash > 0 ? (this.ok ? '#1f5c3a' : '#6b2434') : '#2a2350'; rrect(g, 0, 0, 340, H, 16); g.fill();
    const n = this.seq.length, tw = Math.min(54, 300 / n), gap = 6;
    const total = n * tw + (n - 1) * gap, x0 = 170 - total / 2;
    for (let i = 0; i < n; i++) {
      const showing = this.phase === 'show' || (this.phase === 'between' && this.ok);
      let col = 'rgba(255,255,255,.18)';
      if (showing) col = COLS[this.seq[i]].hex;
      else if (this.phase === 'input' && i < this.pos) col = COLS[this.seq[i]].hex;
      g.fillStyle = col; rrect(g, x0 + i * (tw + gap), 120, tw, tw, 10); g.fill();
      if (this.phase === 'input' && i === this.pos) { g.strokeStyle = '#ffe14d'; g.lineWidth = 3; rrect(g, x0 + i * (tw + gap) - 3, 117, tw + 6, tw + 6, 12); g.stroke(); }
    }
    const msg = this.phase === 'show' ? 'Merke dir die Farben!' : this.phase === 'input' ? 'Jetzt nachtippen!' : this.phase === 'over' ? 'Keine Leben mehr' : (this.ok ? 'Richtig! 🎉' : 'Falsch – nochmal!');
    text(g, msg, 170, 80, { size: 22, color: '#fff' });
    if (this.phase === 'show') { g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(40, 205, 260, 8); g.fillStyle = '#ffe14d'; g.fillRect(40, 205, 260 * (1 - this.pt / this.showSec), 8); }
    text(g, `Runde ${this.k + 1}  ·  ${'❤️'.repeat(this.lives)}${'🖤'.repeat(LIVES - this.lives)}`, 170, 26, { size: 16, color: '#d9c8ff' });
    text(g, `${this.pts} Punkte`, 170, 280, { size: 24, color: '#ffe14d' });
    liveBoard(g, this.ctx, snap, me, this.pts, { x: 350, y: 10, w: 180, row: 24, title: 'Punkte' });
  }
}

export default {
  id: 'farbgedaechtnis', name: 'Farb-Gedächtnis', emoji: '🧩', category: 'Denken', tags: ['denken'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'PICK', ctlWidth: 0.4, duration: 45,
  view: { w: W, h: H },
  howTo: ['Eine Farbreihe leuchtet kurz auf – merke sie dir!', 'Tippe die Farben danach in derselben Reihenfolge. Jede Runde kommt eine Farbe dazu. 2 Leben.'],
  wertung: 'Punkte = Summe der geschafften Reihenlängen. (Anzeigedauer: Einstellung der Party)',
  create: (ctx) => new Farbgedaechtnis(ctx),
};
