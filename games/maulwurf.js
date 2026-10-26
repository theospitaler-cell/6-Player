// 🐹 Maulwurf-Klopfen – tippe die Maulwürfe, bevor sie wieder verschwinden. 🌟 = 3 Punkte, 💣 = Abzug!
import { text, rrect } from '../core/draw.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { mulberry32, clamp } from '../core/util.js';

const W = 560, H = 330, COLS = 4, ROWS = 2, HR = 36;
const holeXY = (i) => ({ x: 50 + (i % COLS) * 82 + 20, y: 110 + Math.floor(i / COLS) * 120 });

function buildEvents(seed, duration) {
  const r = mulberry32(seed ^ 0x13579bdf);
  const ev = [];
  let ts = 0.6, last = -1;
  while (ts < duration + 1) {
    let h = Math.floor(r() * COLS * ROWS); if (h === last) h = (h + 1) % (COLS * ROWS); last = h;
    const q = r();
    ev.push({ ts, h, type: q < 0.14 ? 'bomb' : q < 0.26 ? 'gold' : 'mole', dur: 0.8 + r() * 0.6, hit: false });
    ts += Math.max(0.32, 0.72 - ts * 0.01) + r() * 0.2;
  }
  return ev;
}

class Maulwurf extends LocalGame {
  constructor(ctx) { super(ctx); this.ev = buildEvents(ctx.seed, ctx.duration); this.pts = 0; this.hits = 0; this.pops = []; }
  active() { return this.ev.filter((e) => !e.hit && this.t >= e.ts && this.t < e.ts + e.dur); }
  onPointer(type, x, y) {
    if (type !== 'down' || !this.running) return;
    for (const e of this.active()) {
      const p = holeXY(e.h);
      if (Math.hypot(x - p.x, y - (p.y - 12)) < HR + 6) {
        e.hit = true;
        const v = e.type === 'bomb' ? -2 : e.type === 'gold' ? 3 : 1;
        this.pts += v; if (v > 0) this.hits++;
        this.pops.push({ x: p.x, y: p.y - 40, t: 0.6, txt: (v > 0 ? '+' : '') + v });
        this.ctx.sfx(v > 0 ? 'coin' : 'error'); this.ctx.vibrate(v > 0 ? 15 : 90);
        return;
      }
    }
  }
  tick(dt) { this.pops = this.pops.filter((p) => (p.t -= dt) > 0); }
  score() { return Math.max(0, this.pts); }
  payload() { return { s: this.pts, h: this.hits }; }
  clean(d) { const max = Math.ceil(this.ctx.duration / 0.32) * 3; return { s: clamp(Math.floor(Number(d.s) || 0), -200, max), h: clamp(Math.floor(Number(d.h) || 0), 0, max) }; }
  empty() { return { s: 0, h: 0 }; }
  compare(a, b) { return b.s - a.s || b.h - a.h; }
  value(s) { return s.s; }
  label(s) { return `${s.s} Punkte`; }
  botResult(sk) { const h = Math.round(clamp(sk * 24 * (0.75 + Math.random() * 0.5), 0, 40)); const bombs = Math.round((1 - sk) * 4 * Math.random()); return { s: h + Math.floor(h * 0.3) - bombs * 2, h }; }

  render(g, snap, me) {
    g.fillStyle = '#5b9a3a'; rrect(g, 0, 0, W, H, 16); g.fill();
    g.fillStyle = 'rgba(0,0,0,.08)'; for (let k = 0; k < 14; k++) g.fillRect((k * 83) % W, (k * 47) % H, 30, 4);
    const act = this.active();
    for (let i = 0; i < COLS * ROWS; i++) {
      const p = holeXY(i);
      g.fillStyle = '#3b2412'; g.beginPath(); g.ellipse(p.x, p.y, HR, HR * 0.5, 0, 0, 7); g.fill();
      const e = act.find((q) => q.h === i);
      if (e) {
        const k = clamp((this.t - e.ts) / 0.12, 0, 1) * clamp((e.ts + e.dur - this.t) / 0.12, 0, 1);
        g.save(); g.beginPath(); g.rect(p.x - HR - 4, p.y - 70, HR * 2 + 8, 70 + 2); g.clip();
        text(g, e.type === 'bomb' ? '💣' : e.type === 'gold' ? '🌟' : '🐹', p.x, p.y + 18 - 46 * k, { size: 46 });
        g.restore();
      }
      g.fillStyle = '#3b2412'; g.beginPath(); g.ellipse(p.x, p.y + 4, HR, HR * 0.28, 0, 0, Math.PI); g.fill();
    }
    for (const q of this.pops) text(g, q.txt, q.x, q.y - (0.6 - q.t) * 40, { size: 26, color: q.txt.startsWith('-') ? '#ff6b6b' : '#fff7a8', stroke: 'rgba(0,0,0,.6)', strokeW: 6 });
    text(g, `${this.pts} Punkte`, 14, 18, { size: 18, align: 'left', color: '#fff', stroke: 'rgba(0,0,0,.4)', strokeW: 4 });
    liveBoard(g, this.ctx, snap, me, this.score(), { x: W - 118, y: 8, w: 110, row: 20, title: 'Punkte' });
    if (this.t < 1.2 && this.running) text(g, 'Tippe die Maulwürfe an!', W / 2, H - 16, { size: 15, color: '#fff', stroke: 'rgba(0,0,0,.5)', strokeW: 4 });
  }
}

export default {
  id: 'maulwurf', name: 'Maulwurf-Klopfen', emoji: '🐹', category: 'Geschick', tags: ['party'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'PICK', pointer: true, ctlWidth: 0, duration: 30,
  view: { w: W, h: H },
  howTo: ['Tippe die Maulwürfe 🐹 an, wenn sie aus den Löchern schauen.', '🌟 zählt 3 Punkte – aber Finger weg von der Bombe 💣 (−2)!'],
  wertung: 'Die meisten Punkte in 30 Sekunden gewinnen.',
  create: (ctx) => new Maulwurf(ctx),
};
