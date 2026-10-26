// ❓ Quiz-Blitz – dieselben Fragen für alle. Richtig und schnell gibt die meisten Punkte.
import { text, rrect } from '../core/draw.js';
import { choiceCards } from '../core/widgets.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { QUIZ } from '../core/quizdata.js';
import { mulberry32, shuffle, clamp } from '../core/util.js';

const W = 540, H = 330, LOCK = 0.8;

class Quiz extends LocalGame {
  constructor(ctx) {
    super(ctx);
    this.order = shuffle(QUIZ.map((_, i) => i), mulberry32(ctx.seed ^ 0x2545f491));
    this.i = 0; this.pts = 0; this.right = 0; this.wrong = 0; this.qt = 0; this.lock = 0; this.flash = 0; this.ok = true; this.lastN = -1; this.cards = null; this.build();
  }
  build() {
    const [q, opts, ok] = QUIZ[this.order[this.i % this.order.length]];
    const idx = shuffle([0, 1, 2, 3], mulberry32(this.ctx.seed + this.i * 977));
    this.q = q; this.opts = idx.map((k) => opts[k]); this.correct = idx.indexOf(ok); this.qt = 0; this.uiI = -1;
  }
  tick(dt) { this.qt += dt; this.lock = Math.max(0, this.lock - dt); this.flash = Math.max(0, this.flash - dt); }
  onInput(uid, input) {
    if (!this.running || this.lock > 0) return;
    if (input.n != null && input.n === this.lastN) return;
    this.lastN = input.n;
    if ((input.pick | 0) === this.correct) {
      const bonus = Math.round(clamp((8 - this.qt) / 6, 0, 1) * 5);
      this.pts += 10 + bonus; this.right++; this.ok = true; this.flash = 0.3; this.ctx.sfx('coin'); this.ctx.vibrate(15);
      this.i++; this.build();
    } else {
      this.pts = Math.max(0, this.pts - 5); this.wrong++; this.ok = false; this.lock = LOCK; this.flash = LOCK; this.ctx.sfx('error'); this.ctx.vibrate(100);
      if (this.cards) this.cards.mark(input.pick | 0, 'bad');
    }
  }
  mountUI(box, api) { this.n = 0; this.cards = choiceCards(box, ['', '', '', ''], (i) => api.send({ pick: i, n: ++this.n }), { cols: 1 }); this.updateUI(); }
  updateUI() {
    if (!this.cards) return;
    if (this.uiI !== this.i) { this.uiI = this.i; this.cards.setLabels(this.opts); }
    this.cards.setEnabled(this.running && this.lock <= 0);
  }
  score() { return this.pts; }
  payload() { return { s: this.pts, r: this.right, w: this.wrong }; }
  clean(d) { const max = Math.ceil(this.ctx.duration / 0.5); return { s: clamp(Math.floor(Number(d.s) || 0), 0, max * 15), r: clamp(Math.floor(Number(d.r) || 0), 0, max), w: clamp(Math.floor(Number(d.w) || 0), 0, max) }; }
  empty() { return { s: 0, r: 0, w: 0 }; }
  compare(a, b) { return b.s - a.s || b.r - a.r; }
  value(s) { return s.s; }
  label(s) { return `${s.r} richtig · ${s.s} Punkte`; }
  botResult(sk) { const total = Math.round(this.ctx.duration * (0.08 + 0.12 * sk)); const r = Math.round(total * (0.45 + sk * 0.5)); const w = total - r; return { s: Math.max(0, r * 12 - w * 5), r, w }; }

  render(g, snap, me) {
    g.fillStyle = this.flash > 0 ? (this.ok ? '#1f5c3a' : '#6b2434') : '#1f3a6b'; rrect(g, 0, 0, 340, H, 16); g.fill();
    // Frage umbrechen
    const words = this.q.split(' '); const lines = []; let cur = '';
    for (const w of words) { if ((cur + ' ' + w).trim().length > 24) { lines.push(cur.trim()); cur = w; } else cur += ' ' + w; }
    if (cur.trim()) lines.push(cur.trim());
    lines.forEach((l, k) => text(g, l, 170, 100 + k * 30 - (lines.length - 1) * 15, { size: 22, color: '#fff' }));
    // Zeit-Bonus-Balken
    const bonus = clamp((8 - this.qt) / 6, 0, 1);
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(30, 218, 280, 8); g.fillStyle = bonus > 0 ? '#ffe14d' : '#666'; g.fillRect(30, 218, 280 * bonus, 8);
    text(g, bonus > 0 ? 'Tempo-Bonus' : 'kein Bonus mehr', 170, 242, { size: 12, color: 'rgba(255,255,255,.7)' });
    text(g, `${this.pts} Punkte  ·  ✔ ${this.right}  ✘ ${this.wrong}`, 170, 290, { size: 18, color: '#ffe14d' });
    if (this.lock > 0) text(g, 'Falsch! −5', 170, 262, { size: 16, color: '#ff9bb0' });
    liveBoard(g, this.ctx, snap, me, this.pts, { x: 350, y: 10, w: 180, row: 24, title: 'Punkte' });
  }
}

export default {
  id: 'quiz', name: 'Quiz-Blitz', emoji: '❓', category: 'Denken', tags: ['denken'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'PICK', ctlWidth: 0.46, duration: 45,
  view: { w: W, h: H },
  howTo: ['Alle bekommen dieselben Fragen. Tippe die richtige Antwort.', 'Richtig = 10 Punkte plus Tempo-Bonus (bis +5). Falsch = −5 und kurze Sperre.'],
  wertung: 'Die meisten Punkte nach 45 Sekunden gewinnen.',
  create: (ctx) => new Quiz(ctx),
};
