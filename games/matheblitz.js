// 🧠 Mathe-Blitz – alle bekommen dieselben Aufgaben (Seed), jeder rechnet auf seinem Handy.
import { text, rrect, disc } from '../core/draw.js';
import { mulberry32, randInt, shuffle, clamp } from '../core/util.js';
import { botParams } from '../core/bots.js';
import { competitionRanks } from '../core/scoring.js';
import { h } from '../core/ui.js';

const LOCK = 0.7;         // Sperre nach falscher Antwort (Sekunden)
const MIN_GAP = 0.35;     // Anti-Cheat: schneller als alle 0,35 s kann niemand antworten

/** Aufgabe Nr. i – hängt nur von Seed und i ab, damit alle exakt dasselbe sehen. */
export function taskAt(seed, i) {
  const r = mulberry32((seed ^ Math.imul(i + 1, 2654435761)) >>> 0);
  const lvl = Math.min(3, Math.floor(i / 5));
  const kindRoll = r();
  let a, b, ans, q;
  if (kindRoll < 0.38) { a = randInt(4, 18 + lvl * 24, r); b = randInt(4, 18 + lvl * 24, r); ans = a + b; q = `${a} + ${b}`; }
  else if (kindRoll < 0.68) { a = randInt(12, 40 + lvl * 28, r); b = randInt(3, a - 2, r); ans = a - b; q = `${a} − ${b}`; }
  else { a = randInt(2, 6 + lvl * 2, r); b = randInt(2, 9, r); ans = a * b; q = `${a} × ${b}`; }
  const set = new Set([ans]);
  const near = [1, 2, 10, 3, 5, 4, 6];
  let guard = 0;
  while (set.size < 4 && guard++ < 60) {
    const off = near[randInt(0, near.length - 1, r)] * (r() < 0.5 ? -1 : 1);
    const v = ans + off;
    if (v >= 0 && v !== ans) set.add(v);
  }
  let k = 1; while (set.size < 4) set.add(ans + 11 * k++);
  const opts = shuffle(Array.from(set), r);
  return { q, opts, correct: opts.indexOf(ans), ans };
}

class MatheBlitz {
  constructor(ctx) {
    this.ctx = ctx;
    this.i = 0; this.c = 0; this.w = 0; this.running = false; this.lock = 0; this.flash = 0; this.flashOk = true;
    this.task = taskAt(ctx.seed, 0);
    this.sent = false; this.subs = {}; this.uiIdx = -1; this.lastPick = -1; this.lastAt = -9;
    this.t = 0; this.btns = [];
  }
  start() { this.running = true; }
  update(dt) {
    if (!this.running) return;
    this.t += dt;
    this.lock = Math.max(0, this.lock - dt);
    this.flash = Math.max(0, this.flash - dt);
  }
  onInput(uid, input) {
    if (!this.running || this.lock > 0 || this.sent) return;
    const k = input.pick | 0;
    if (k < 0 || k > 3) return;
    if (input.n != null && input.n === this.lastPick) return;
    this.lastPick = input.n;
    if (k === this.task.correct) {
      this.c++; this.i++; this.task = taskAt(this.ctx.seed, this.i);
      this.flash = 0.25; this.flashOk = true; this.ctx.sfx('coin'); this.ctx.vibrate(15);
    } else {
      this.w++; this.lock = LOCK; this.flash = LOCK; this.flashOk = false;
      this.ctx.sfx('error'); this.ctx.vibrate(120);
    }
  }
  score() { return Math.max(0, this.c * 2 - this.w); }
  progress() { return this.score(); }
  timeUp() { this.running = false; this._send(); }
  _send() { if (this.sent) return; this.sent = true; this.ctx.submit({ c: this.c, w: this.w }); }

  onSubmit(uid, d) {
    const max = Math.floor(this.ctx.duration / MIN_GAP) + 2;
    let c = clamp(Math.floor(Number(d && d.c) || 0), 0, max), w = clamp(Math.floor(Number(d && d.w) || 0), 0, max);
    if (c + w > max) { c = Math.max(0, max - w); }
    this.subs[uid] = { c, w };
  }
  result() {
    const items = this.ctx.players.map((p) => { const s = this.subs[p.uid] || { c: 0, w: 0 }; return { uid: p.uid, ...s, score: Math.max(0, s.c * 2 - s.w) }; });
    const ranked = competitionRanks(items, (a, b) => b.score - a.score || a.w - b.w);
    return { ranks: ranked.map(({ item, rank }) => ({ uid: item.uid, rank, value: item.score, label: `${item.c} richtig${item.w ? ` · ${item.w} falsch` : ''}` })) };
  }

  botPlan(bot) {
    const p = botParams(bot.botLevel);
    const rate = (0.18 + 0.65 * p.speed) * (0.9 + Math.random() * 0.2);
    const acc = clamp(1 - p.err * 1.6, 0.4, 0.99);
    const total = Math.floor(rate * this.ctx.duration);
    const c = Math.round(total * acc);
    return { rate, acc, doneAt: this.ctx.duration, final: { c, w: total - c } };
  }
  botProgress(plan, t) {
    const n = Math.floor(plan.rate * t);
    const c = Math.round(n * plan.acc);
    return Math.max(0, c * 2 - (n - c));
  }
  botFinal(plan) { return plan.final; }

  // ---- Eingabe-Oberfläche (4 Antwort-Buttons) ----
  mountUI(box, api) {
    this.api = api;
    this.cnt = 0;
    const grid = h('div', { class: 'pick-grid' });
    for (let k = 0; k < 4; k++) {
      const b = h('button', { class: 'pick-btn', type: 'button' }, '');
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); this.api.send({ pick: k, n: ++this.cnt }); });
      this.btns.push(b); grid.appendChild(b);
    }
    box.appendChild(grid);
    this.updateUI();
  }
  updateUI() {
    if (!this.btns.length) return;
    if (this.uiIdx !== this.i) { this.uiIdx = this.i; this.task.opts.forEach((o, k) => { this.btns[k].textContent = o; }); }
    const dis = this.lock > 0 || !this.running;
    this.btns.forEach((b) => b.classList.toggle('lock', dis));
  }

  render(g, snap, me) {
    const W = 540, H = 330, LW = 330;
    g.fillStyle = '#2a2d6b'; rrect(g, 0, 0, LW, H, 18); g.fill();
    if (this.flash > 0) { g.fillStyle = this.flashOk ? 'rgba(47,214,123,.25)' : 'rgba(255,77,109,.35)'; rrect(g, 0, 0, LW, H, 18); g.fill(); }
    text(g, this.running || this.t > 0 ? `${this.task.q} = ?` : 'Gleich geht’s los…', LW / 2, 120, { size: this.running || this.t > 0 ? 46 : 26, color: '#fff', stroke: 'rgba(0,0,0,.3)', strokeW: 6 });
    text(g, `✔ ${this.c}    ✘ ${this.w}`, LW / 2, 200, { size: 20, color: '#ffe14d' });
    if (this.lock > 0) text(g, 'Falsch! Kurz warten…', LW / 2, 240, { size: 15, color: '#ff9bb0' });
    // Live-Stand
    const ps = this.ctx.players;
    g.fillStyle = 'rgba(0,0,0,.28)'; rrect(g, LW + 14, 0, W - LW - 14, H, 18); g.fill();
    text(g, 'Punkte', LW + 14 + (W - LW - 14) / 2, 22, { size: 15, color: 'rgba(255,255,255,.8)' });
    const sc = (p) => (p.uid === me ? this.score() : (snap.p && snap.p[p.uid]) || 0);
    const maxS = Math.max(8, ...ps.map(sc));
    const rowH = Math.min(40, (H - 50) / ps.length);
    const bx = LW + 54, bw = W - bx - 44;
    ps.forEach((p, i) => {
      const y = 52 + i * rowH + rowH / 2;
      const isMe = p.uid === me;
      g.fillStyle = 'rgba(255,255,255,.12)'; rrect(g, bx, y - 6, bw, 12, 6); g.fill();
      g.fillStyle = p.colorHex; rrect(g, bx, y - 6, Math.max(12, bw * sc(p) / maxS), 12, 6); g.fill();
      text(g, p.avatar, LW + 34, y, { size: 20 });
      text(g, String(sc(p)), W - 22, y, { size: 14, color: isMe ? '#ffe14d' : '#fff' });
    });
  }
}

export default {
  id: 'matheblitz', name: 'Mathe-Blitz', emoji: '🧠', category: 'Denken',
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'PICK', ctlWidth: 0.44, duration: 30,
  view: { w: 540, h: 330 },
  howTo: ['Wähle so schnell wie möglich das richtige Ergebnis.', 'Richtig = +2 Punkte, falsch = −1 und kurze Sperre. Alle bekommen dieselben Aufgaben.'],
  wertung: 'Punkte nach 30 Sekunden (2 pro richtiger, −1 pro falscher Antwort).',
  create: (ctx) => new MatheBlitz(ctx),
};
