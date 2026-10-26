// 🎯 Treffer-Balken – stoppe den wandernden Punkt möglichst genau in der Mitte. 5 Runden.
import { text, rrect } from '../core/draw.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { mulberry32, clamp } from '../core/util.js';

const W = 560, H = 320, ROUNDS = 5, BX0 = 40, BX1 = 400, SHOW = 0.9;

class Timing extends LocalGame {
  constructor(ctx) {
    super(ctx);
    const r = mulberry32(ctx.seed ^ 0xa5a5);
    // je Runde: Geschwindigkeit (Balken pro Sekunde) und Startphase – für alle gleich
    this.rounds = Array.from({ length: ROUNDS }, (_, i) => ({ sp: 0.55 + i * 0.22 + r() * 0.15, ph: r() }));
    this.i = 0; this.rt = 0; this.pts = []; this.lastTaps = 0; this.hold = 0; this.lastHit = null;
  }
  pos() { // Dreieckswelle 0..1
    const r = this.rounds[Math.min(this.i, ROUNDS - 1)];
    const x = (r.ph + this.rt * r.sp) % 2;
    return x < 1 ? x : 2 - x;
  }
  tick(dt) {
    if (this.i >= ROUNDS) return;
    if (this.hold > 0) { this.hold -= dt; if (this.hold <= 0) { this.i++; this.rt = 0; if (this.i >= ROUNDS) this.finish(); } return; }
    this.rt += dt;
  }
  onInput(uid, input) {
    const n = input.taps | 0;
    if (n <= this.lastTaps) return;
    this.lastTaps = n;
    if (!this.running || this.hold > 0 || this.i >= ROUNDS) return;
    const p = this.pos();
    const pts = Math.round(clamp(100 - Math.abs(p - 0.5) * 2 * 140, 0, 100));
    this.pts.push(pts); this.lastHit = { p, pts }; this.hold = SHOW;
    this.ctx.sfx(pts > 85 ? 'win' : pts > 40 ? 'coin' : 'error'); this.ctx.vibrate(pts > 85 ? 50 : 15);
  }
  score() { return this.pts.reduce((a, b) => a + b, 0); }
  payload() { while (this.pts.length < ROUNDS) this.pts.push(0); return { r: this.pts.slice(0, ROUNDS) }; }
  clean(d) { const r = (Array.isArray(d.r) ? d.r : []).slice(0, ROUNDS).map((x) => clamp(Math.round(Number(x) || 0), 0, 100)); while (r.length < ROUNDS) r.push(0); return { r }; }
  empty() { return { r: Array(ROUNDS).fill(0) }; }
  sum(s) { return s.r.reduce((a, b) => a + b, 0); }
  compare(a, b) { return this.sum(b) - this.sum(a); }
  value(s) { return this.sum(s); }
  label(s) { return `${this.sum(s)} Punkte`; }
  botResult(sk) { return { r: Array.from({ length: ROUNDS }, () => Math.round(clamp(55 + sk * 45 - Math.random() * (60 - sk * 40), 0, 100))) }; }
  progressOf(sub) { return this.sum(sub); }

  render(g, snap, me) {
    g.fillStyle = '#2a2d6b'; rrect(g, 0, 0, 420, H, 16); g.fill();
    text(g, `Runde ${Math.min(this.i + 1, ROUNDS)} / ${ROUNDS}`, 210, 24, { size: 17, color: '#cfd4ff' });
    // Balken mit Zonen
    const by = 150, bh = 44;
    g.fillStyle = '#3a3f7a'; rrect(g, BX0, by, BX1 - BX0, bh, 12); g.fill();
    const mid = (BX0 + BX1) / 2;
    g.fillStyle = 'rgba(255,210,63,.35)'; g.fillRect(mid - 70, by, 140, bh);
    g.fillStyle = 'rgba(47,214,123,.55)'; g.fillRect(mid - 36, by, 72, bh);
    g.fillStyle = '#2fd67b'; g.fillRect(mid - 6, by - 6, 12, bh + 12);
    const p = this.hold > 0 && this.lastHit ? this.lastHit.p : this.pos();
    const x = BX0 + p * (BX1 - BX0);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, by + bh / 2, 17, 0, 7); g.fill();
    g.strokeStyle = '#ff4d6d'; g.lineWidth = 5; g.stroke();
    if (this.lastHit && this.hold > 0) text(g, `+${this.lastHit.pts}`, x, by - 28, { size: 30, color: this.lastHit.pts > 85 ? '#ffe14d' : '#fff', stroke: 'rgba(0,0,0,.6)', strokeW: 6 });
    // bisherige Treffer
    this.pts.forEach((v, k) => text(g, String(v), 60 + k * 74, 252, { size: 20, color: v > 85 ? '#ffe14d' : '#fff' }));
    text(g, `Summe ${this.score()}`, 210, 292, { size: 22, color: '#ffe14d' });
    text(g, 'Tippe, wenn der Punkt in der Mitte ist!', 210, 70, { size: 13, color: 'rgba(255,255,255,.7)' });
    liveBoard(g, this.ctx, snap, me, this.score(), { x: 432, y: 10, w: 120, row: 24, title: 'Punkte' });
  }
}

export default {
  id: 'timing', name: 'Treffer-Balken', emoji: '🎯', category: 'Geschick', tags: ['geschick'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'TAP', duration: 30,
  view: { w: 560, h: H },
  howTo: ['Ein Punkt wandert über den Balken. Tippe genau dann, wenn er in der grünen Mitte ist.', '5 Runden, jedes Mal wird es schneller. Maximal 100 Punkte pro Runde.'],
  wertung: 'Summe der Punkte aus 5 Runden.',
  create: (ctx) => new Timing(ctx),
};
