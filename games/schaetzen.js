// 🔢 Schätz-Meister – Punkte erscheinen kurz. Wie viele waren es? Tippe die Zahl auf dem Zahlenblock.
import { text, rrect } from '../core/draw.js';
import { numpad } from '../core/widgets.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { mulberry32, clamp, gauss } from '../core/util.js';

const W = 540, H = 330, ROUNDS = 5, SHOW = 2.2, TMAX = 11, PX = 20, PY = 50, PW = 300, PH = 200;
const round = (seed, k) => {
  const r = mulberry32((seed ^ Math.imul(k + 31, 2654435761)) >>> 0);
  const n = Math.round(Math.exp(Math.log(14) + r() * (Math.log(130) - Math.log(14))));
  const dots = Array.from({ length: n }, () => [r() * (PW - 20) + 10, r() * (PH - 20) + 10, 3 + r() * 3]);
  return { n, dots };
};

class Schaetzen extends LocalGame {
  constructor(ctx) { super(ctx); this.k = 0; this.rd = round(ctx.seed, 0); this.phase = 'show'; this.pt = 0; this.res = []; this.msg = ''; this.pad = null; }
  tick(dt) {
    this.pt += dt;
    if (this.phase === 'show' && this.pt >= SHOW) { this.phase = 'ask'; this.pt = 0; }
    else if (this.phase === 'ask' && this.pt >= TMAX) this.answer(null);
    else if (this.phase === 'between' && this.pt >= 1.6) this.next();
  }
  next() { this.k++; if (this.k >= ROUNDS) { this.phase = 'over'; this.finish(); return; } this.rd = round(this.ctx.seed, this.k); this.phase = 'show'; this.pt = 0; }
  onInput(uid, input) { if (this.running && this.phase === 'ask' && Number.isFinite(Number(input.num))) this.answer(Number(input.num)); }
  answer(num) {
    const n = this.rd.n;
    const pts = num == null ? 0 : Math.round(clamp(100 - Math.abs(num - n) / n * 130, 0, 100));
    this.res.push(pts); this.msg = num == null ? `Zeit um! Es waren ${n}` : `Es waren ${n} – du: ${num}  (+${pts})`;
    this.phase = 'between'; this.pt = 0; this.ctx.sfx(pts > 70 ? 'win' : pts > 30 ? 'coin' : 'error'); this.ctx.vibrate(pts > 70 ? 40 : 15);
  }
  mountUI(box, api) { this.pad = numpad(box, { maxLen: 3, onSubmit: (v) => api.send({ num: v }) }); }
  updateUI() { if (this.pad) this.pad.setEnabled(this.running && this.phase === 'ask'); }
  score() { return this.res.reduce((a, b) => a + b, 0); }
  payload() { while (this.res.length < ROUNDS) this.res.push(0); return { r: this.res.slice(0, ROUNDS) }; }
  clean(d) { const r = (Array.isArray(d.r) ? d.r : []).slice(0, ROUNDS).map((x) => clamp(Math.round(Number(x) || 0), 0, 100)); while (r.length < ROUNDS) r.push(0); return { r }; }
  empty() { return { r: Array(ROUNDS).fill(0) }; }
  sum(s) { return s.r.reduce((a, b) => a + b, 0); }
  compare(a, b) { return this.sum(b) - this.sum(a); }
  value(s) { return this.sum(s); }
  label(s) { return `${this.sum(s)} Punkte`; }
  botResult(sk) { return { r: Array.from({ length: ROUNDS }, () => Math.round(clamp(100 - Math.abs(gauss()) * (1 - sk * 0.8) * 55 - 5, 0, 100))) }; }

  render(g, snap, me) {
    g.fillStyle = '#2b2a56'; rrect(g, 0, 0, 350, H, 16); g.fill();
    text(g, `Runde ${Math.min(this.k + 1, ROUNDS)} / ${ROUNDS}`, 175, 24, { size: 16, color: '#d9c8ff' });
    g.fillStyle = '#1a1a3a'; rrect(g, PX, PY, PW, PH, 12); g.fill();
    if (this.phase === 'show') {
      g.fillStyle = '#ffe14d';
      for (const [x, y, r] of this.rd.dots) { g.beginPath(); g.arc(PX + x, PY + y, r, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(PX, PY + PH + 8, PW, 6); g.fillStyle = '#ffe14d'; g.fillRect(PX, PY + PH + 8, PW * (1 - this.pt / SHOW), 6);
    } else if (this.phase === 'ask') {
      text(g, '❓', PX + PW / 2, PY + PH / 2 - 14, { size: 60 });
      text(g, 'Wie viele Punkte waren es?', PX + PW / 2, PY + PH / 2 + 40, { size: 17, color: '#fff' });
      text(g, `${Math.ceil(TMAX - this.pt)} s`, PX + PW - 20, PY + 18, { size: 15, color: 'rgba(255,255,255,.7)' });
    } else text(g, this.msg, PX + PW / 2, PY + PH / 2, { size: 17, color: '#ffe14d' });
    text(g, `Summe ${this.score()}`, 175, 304, { size: 22, color: '#ffe14d' });
    liveBoard(g, this.ctx, snap, me, this.score(), { x: 360, y: 10, w: 170, row: 24, title: 'Punkte' });
  }
}

export default {
  id: 'schaetzen', name: 'Schätz-Meister', emoji: '🔢', category: 'Denken', tags: ['denken'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'PICK', ctlWidth: 0.42, duration: 60,
  view: { w: W, h: H },
  howTo: ['Viele gelbe Punkte erscheinen für 2 Sekunden. Schätze, wie viele es waren!', 'Gib die Zahl auf dem Zahlenblock ein und tippe ✓. Je näher, desto mehr Punkte (max. 100).'],
  wertung: 'Summe der Punkte aus 5 Schätzungen.',
  create: (ctx) => new Schaetzen(ctx),
};
