// 🔤 Wort-Blitz – die Buchstaben sind durcheinander! Tippe das richtige Wort auf der Bildschirm-Tastatur.
import { text, rrect } from '../core/draw.js';
import { keyboard } from '../core/widgets.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { WORDS } from '../core/quizdata.js';
import { mulberry32, shuffle, clamp } from '../core/util.js';

const W = 540, H = 330;

class Wortblitz extends LocalGame {
  constructor(ctx) {
    super(ctx);
    this.order = shuffle(WORDS.map((_, i) => i), mulberry32(ctx.seed ^ 0x6c8e9cf5));
    this.i = 0; this.pts = 0; this.solved = 0; this.skips = 0; this.flash = 0; this.ok = true; this.kb = null; this.msg = ''; this.build();
  }
  build() {
    this.word = WORDS[this.order[this.i % this.order.length]];
    const r = mulberry32(this.ctx.seed + this.i * 7919);
    let s = this.word;
    for (let t = 0; t < 8 && s === this.word; t++) s = shuffle(this.word.split(''), r).join('');
    this.scr = s;
  }
  tick(dt) { this.flash = Math.max(0, this.flash - dt); }
  onInput(uid, input) {
    if (!this.running) return;
    if (input.skip) { this.pts = Math.max(0, this.pts - 1); this.skips++; this.i++; this.build(); this.ctx.sfx('whoosh'); return; }
    const guess = String(input.text || '').toUpperCase();
    if (guess === this.word) { this.pts += this.word.length; this.solved++; this.ok = true; this.flash = 0.35; this.msg = `+${this.word.length}`; this.ctx.sfx('coin'); this.ctx.vibrate(20); this.i++; this.build(); }
    else { this.ok = false; this.flash = 0.4; this.msg = 'Nicht ganz …'; this.ctx.sfx('error'); this.ctx.vibrate(80); }
  }
  mountUI(box, api) { this.kb = keyboard(box, { maxLen: 12, placeholder: 'Wort eintippen …', onSubmit: (t) => api.send({ text: t }), onSkip: () => api.send({ skip: 1 }) }); }
  updateUI() { if (this.kb) this.kb.setEnabled(this.running); }
  score() { return this.pts; }
  payload() { return { s: this.pts, w: this.solved }; }
  clean(d) { const max = Math.ceil(this.ctx.duration / 0.8); return { s: clamp(Math.floor(Number(d.s) || 0), 0, max * 10), w: clamp(Math.floor(Number(d.w) || 0), 0, max) }; }
  empty() { return { s: 0, w: 0 }; }
  compare(a, b) { return b.s - a.s || b.w - a.w; }
  value(s) { return s.s; }
  label(s) { return `${s.w} Wörter · ${s.s} Punkte`; }
  botResult(sk) { const w = Math.round(clamp(sk * 9 * (0.7 + Math.random() * 0.6), 0, 18)); return { s: w * 6, w }; }

  render(g, snap, me) {
    g.fillStyle = this.flash > 0 ? (this.ok ? '#1f5c3a' : '#6b2434') : '#3a2a5c'; rrect(g, 0, 0, 290, H, 16); g.fill();
    text(g, 'Welches Wort ist das?', 145, 30, { size: 16, color: '#d9c8ff' });
    const n = this.scr.length, tw = Math.min(30, 270 / n), x0 = 145 - (n * tw) / 2;
    for (let k = 0; k < n; k++) { g.fillStyle = '#ffd23f'; rrect(g, x0 + k * tw + 2, 90, tw - 4, tw + 6, 6); g.fill(); text(g, this.scr[k], x0 + k * tw + tw / 2, 90 + (tw + 6) / 2, { size: tw * 0.7, color: '#4a2b00' }); }
    text(g, `${n} Buchstaben`, 145, 160, { size: 14, color: 'rgba(255,255,255,.7)' });
    if (this.flash > 0) text(g, this.msg, 145, 205, { size: 24, color: this.ok ? '#ffe14d' : '#ff9bb0' });
    text(g, `${this.pts} Punkte  ·  ${this.solved} Wörter`, 145, 290, { size: 18, color: '#ffe14d' });
    text(g, '↻ = überspringen (−1)', 145, 312, { size: 12, color: 'rgba(255,255,255,.55)' });
    liveBoard(g, this.ctx, snap, me, this.pts, { x: 300, y: 10, w: 150, row: 24, title: 'Punkte' });
  }
}

export default {
  id: 'wortblitz', name: 'Wort-Blitz', emoji: '🔤', category: 'Denken', tags: ['denken'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'PICK', ctlWidth: 0.5, duration: 45,
  view: { w: W, h: H },
  howTo: ['Die Buchstaben eines Wortes sind durcheinander. Finde das Wort und tippe es ein!', 'Jeder Buchstabe zählt 1 Punkt. Mit ↻ überspringst du ein Wort (−1).'],
  wertung: 'Die meisten Punkte nach 45 Sekunden gewinnen.',
  create: (ctx) => new Wortblitz(ctx),
};
