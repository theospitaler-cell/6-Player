// 🥁 Takt-Meister – tippe genau im Rhythmus des Metronoms. Je genauer, desto mehr Punkte.
import { text, rrect } from '../core/draw.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { mulberry32, clamp } from '../core/util.js';

const W = 560, H = 320, BEATS = 16, LEAD = 1.6;

class Takt extends LocalGame {
  constructor(ctx) {
    super(ctx);
    const r = mulberry32(ctx.seed ^ 0x77);
    this.bpm = 96 + Math.floor(r() * 5) * 6;        // für alle gleich
    this.iv = 60 / this.bpm;
    this.pts = Array(BEATS).fill(0); this.hit = Array(BEATS).fill(false); this.lastTaps = 0; this.fb = null; this.lastBeat = -1;
  }
  beatTime(k) { return LEAD + k * this.iv; }
  tick(dt) {
    const k = Math.round((this.t - LEAD) / this.iv);
    if (k !== this.lastBeat && k >= 0 && k < BEATS && Math.abs(this.t - this.beatTime(k)) < dt + 0.001) { this.lastBeat = k; this.ctx.sfx('tick'); }
    if (this.t > this.beatTime(BEATS - 1) + 0.5) this.finish();
  }
  onInput(uid, input) {
    const n = input.taps | 0;
    if (n <= this.lastTaps) return;
    this.lastTaps = n;
    if (!this.running) return;
    const k = clamp(Math.round((this.t - LEAD) / this.iv), 0, BEATS - 1);
    const err = this.t - this.beatTime(k);
    if (this.hit[k] || Math.abs(err) > 0.2) { this.fb = { txt: 'Daneben!', t: 0.5 }; this.ctx.sfx('error'); return; }
    this.hit[k] = true;
    const pts = Math.round(clamp(100 - Math.abs(err) * 1000 * 0.6, 20, 100));
    this.pts[k] = pts;
    this.fb = { txt: Math.abs(err) < 0.05 ? 'Perfekt! ' + pts : (err < 0 ? 'Zu früh ' : 'Zu spät ') + pts, t: 0.5 };
    this.ctx.sfx('coin'); this.ctx.vibrate(10);
  }
  score() { return this.pts.reduce((a, b) => a + b, 0); }
  payload() { return { r: this.pts.slice() }; }
  clean(d) { const r = (Array.isArray(d.r) ? d.r : []).slice(0, BEATS).map((x) => clamp(Math.round(Number(x) || 0), 0, 100)); while (r.length < BEATS) r.push(0); return { r }; }
  empty() { return { r: Array(BEATS).fill(0) }; }
  sum(s) { return s.r.reduce((a, b) => a + b, 0); }
  compare(a, b) { return this.sum(b) - this.sum(a); }
  value(s) { return this.sum(s); }
  label(s) { return `${this.sum(s)} Punkte`; }
  botResult(sk) { return { r: Array.from({ length: BEATS }, () => (Math.random() < 0.3 + sk * 0.65 ? Math.round(clamp(55 + sk * 45 - Math.random() * 40, 20, 100)) : 0)) }; }
  progressOf(sub) { return this.sum(sub); }

  render(g, snap, me) {
    g.fillStyle = '#35204f'; rrect(g, 0, 0, 420, H, 16); g.fill();
    const phase = ((this.t - LEAD) / this.iv);
    const frac = phase - Math.floor(phase);
    const pulse = this.running && this.t >= 0 ? Math.max(0, 1 - frac * 3) : 0;
    g.fillStyle = `rgba(255,210,63,${0.15 + pulse * 0.6})`; g.beginPath(); g.arc(210, 130, 60 + pulse * 22, 0, 7); g.fill();
    text(g, '🥁', 210, 130, { size: 60 + pulse * 14 });
    text(g, `${this.bpm} BPM`, 210, 24, { size: 16, color: '#d9c8ff' });
    // Schlag-Leiste
    for (let k = 0; k < BEATS; k++) {
      const x = 22 + k * 24.5;
      g.fillStyle = this.hit[k] ? '#2fd67b' : (this.t > this.beatTime(k) + 0.2 ? '#ff4d6d' : 'rgba(255,255,255,.25)');
      g.beginPath(); g.arc(x, 232, 8, 0, 7); g.fill();
    }
    if (this.t < LEAD) text(g, `Gleich … ${Math.ceil(LEAD - this.t)}`, 210, 190, { size: 22, color: '#fff' });
    else if (this.fb && this.fb.t > 0) { this.fb.t -= 1 / 60; text(g, this.fb.txt, 210, 190, { size: 24, color: '#ffe14d', stroke: 'rgba(0,0,0,.6)', strokeW: 5 }); }
    else text(g, 'Tippe im Takt!', 210, 190, { size: 18, color: 'rgba(255,255,255,.75)' });
    text(g, `Summe ${this.score()}`, 210, 285, { size: 22, color: '#ffe14d' });
    liveBoard(g, this.ctx, snap, me, this.score(), { x: 432, y: 10, w: 120, row: 24, title: 'Punkte' });
  }
}

export default {
  id: 'takt', name: 'Takt-Meister', emoji: '🥁', category: 'Reaktion', tags: ['party'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'TAP', duration: 26,
  view: { w: 560, h: H },
  howTo: ['Die Trommel gibt den Takt vor. Tippe genau auf jeden Schlag!', '16 Schläge. Je genauer du triffst, desto mehr Punkte (max. 100 pro Schlag).'],
  wertung: 'Summe der Punkte über alle Schläge.',
  create: (ctx) => new Takt(ctx),
};
