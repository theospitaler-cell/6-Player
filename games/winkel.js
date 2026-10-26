// 📐 Winkel-Schätzen – wie groß ist der Winkel? Stelle den Schieberegler ein.
import { text, rrect } from '../core/draw.js';
import { slider } from '../core/widgets.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { mulberry32, clamp, gauss } from '../core/util.js';

const W = 540, H = 330, ROUNDS = 6, TMAX = 9;
const round = (seed, k) => { const r = mulberry32((seed ^ Math.imul(k + 41, 2246822519)) >>> 0); return { a: Math.round(12 + r() * 160), rot: r() * Math.PI * 2 }; };

class Winkel extends LocalGame {
  constructor(ctx) { super(ctx); this.k = 0; this.rd = round(ctx.seed, 0); this.phase = 'ask'; this.pt = 0; this.res = []; this.msg = ''; this.sl = null; this.guess = 90; }
  tick(dt) {
    this.pt += dt;
    if (this.phase === 'ask' && this.pt >= TMAX) this.answer(null);
    else if (this.phase === 'between' && this.pt >= 1.4) this.next();
  }
  next() { this.k++; if (this.k >= ROUNDS) { this.phase = 'over'; this.finish(); return; } this.rd = round(this.ctx.seed, this.k); this.phase = 'ask'; this.pt = 0; if (this.sl) this.sl.setRange(0, 180, 90); }
  onInput(uid, input) { if (this.running && this.phase === 'ask' && Number.isFinite(Number(input.val))) this.answer(Number(input.val)); }
  answer(v) {
    const a = this.rd.a;
    const pts = v == null ? 0 : Math.round(clamp(100 - Math.abs(v - a) * 4, 0, 100));
    this.res.push(pts); this.msg = v == null ? `Zeit um! Es waren ${a}°` : `${a}° – du: ${v}°  (+${pts})`;
    this.phase = 'between'; this.pt = 0; this.ctx.sfx(pts > 75 ? 'win' : pts > 30 ? 'coin' : 'error'); this.ctx.vibrate(pts > 75 ? 40 : 15);
  }
  mountUI(box, api) { this.sl = slider(box, { min: 0, max: 180, value: 90, unit: '°', onSubmit: (v) => api.send({ val: v }) }); }
  updateUI() { if (this.sl) this.sl.setEnabled(this.running && this.phase === 'ask'); }
  score() { return this.res.reduce((a, b) => a + b, 0); }
  payload() { while (this.res.length < ROUNDS) this.res.push(0); return { r: this.res.slice(0, ROUNDS) }; }
  clean(d) { const r = (Array.isArray(d.r) ? d.r : []).slice(0, ROUNDS).map((x) => clamp(Math.round(Number(x) || 0), 0, 100)); while (r.length < ROUNDS) r.push(0); return { r }; }
  empty() { return { r: Array(ROUNDS).fill(0) }; }
  sum(s) { return s.r.reduce((a, b) => a + b, 0); }
  compare(a, b) { return this.sum(b) - this.sum(a); }
  value(s) { return this.sum(s); }
  label(s) { return `${this.sum(s)} Punkte`; }
  botResult(sk) { return { r: Array.from({ length: ROUNDS }, () => Math.round(clamp(100 - Math.abs(gauss()) * (1 - sk * 0.75) * 9 * 4, 0, 100))) }; }

  render(g, snap, me) {
    g.fillStyle = '#2b3a56'; rrect(g, 0, 0, 350, H, 16); g.fill();
    text(g, `Runde ${Math.min(this.k + 1, ROUNDS)} / ${ROUNDS}`, 175, 24, { size: 16, color: '#cfe2ff' });
    const cx = 130, cy = 200, L = 120, a = this.rd.a * Math.PI / 180, rot = this.rd.rot;
    g.strokeStyle = '#fff'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(cx + Math.cos(rot) * L, cy + Math.sin(rot) * L * 0.9); g.lineTo(cx, cy); g.lineTo(cx + Math.cos(rot + a) * L, cy + Math.sin(rot + a) * L * 0.9); g.stroke();
    g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(cx, cy, 6, 0, 7); g.fill();
    if (this.phase === 'between') { g.strokeStyle = '#ffe14d'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 40, rot, rot + a); g.stroke(); text(g, this.msg, 175, 62, { size: 16, color: '#ffe14d' }); }
    else if (this.phase === 'ask') text(g, `Wie groß ist der Winkel? (${Math.ceil(TMAX - this.pt)} s)`, 175, 62, { size: 16, color: '#fff' });
    text(g, `Summe ${this.score()}`, 175, 304, { size: 22, color: '#ffe14d' });
    liveBoard(g, this.ctx, snap, me, this.score(), { x: 360, y: 10, w: 170, row: 24, title: 'Punkte' });
  }
}

export default {
  id: 'winkel', name: 'Winkel-Schätzen', emoji: '📐', category: 'Denken', tags: ['denken'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'PICK', ctlWidth: 0.4, duration: 60,
  view: { w: W, h: H },
  howTo: ['Ein Winkel wird gezeigt. Schätze seine Größe in Grad und stelle den Regler ein.', 'Tippe auf „Abschicken“. Je näher dran, desto mehr Punkte (max. 100, 25° daneben = 0).'],
  wertung: 'Summe der Punkte aus 6 Schätzungen.',
  create: (ctx) => new Winkel(ctx),
};
