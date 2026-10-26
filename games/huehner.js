// 🐔 Hühner-Hüpfer – das Huhn rennt von selbst. Tippe zum Springen (in der Luft nochmal = Doppelsprung)!
import { text, rrect } from '../core/draw.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { mulberry32, clamp, r2 } from '../core/util.js';

const W = 560, H = 330, SPEED = 135, G = 1050, JUMP = -400, GROUND = 250, CAM = 130, HEN = 14;
const GOAL = 3300;
/** Level aus dem Seed: Abfolge (Plattform, Lücke) – bei allen identisch. */
function buildLevel(seed) {
  const r = mulberry32(seed ^ 0x5bd1e995);
  const segs = [{ x0: -200, x1: 360 }];
  let x = 360;
  while (x < GOAL + 400) {
    const gap = 46 + r() * 52;
    const len = 130 + r() * 150;
    segs.push({ x0: x + gap, x1: x + gap + len });
    x += gap + len;
  }
  return segs;
}

class Huehner extends LocalGame {
  constructor(ctx) {
    super(ctx);
    this.segs = buildLevel(ctx.seed);
    this.x = 0; this.y = GROUND; this.vy = 0; this.air = 0; this.lastTaps = 0; this.fin = null; this.respawn = 0; this.falls = 0; this.lastSafe = 0;
  }
  groundAt(x) { return this.segs.some((s) => x >= s.x0 && x <= s.x1); }
  onInput(uid, input) {
    const n = input.taps | 0;
    if (n > this.lastTaps) {
      this.lastTaps = n;
      if (!this.running || this.fin != null || this.respawn > 0) return;
      if (this.air === 0) { this.vy = JUMP; this.air = 1; this.ctx.sfx('tap'); }
      else if (this.air === 1) { this.vy = JUMP * 0.85; this.air = 2; this.ctx.sfx('pop'); }
    }
  }
  tick(dt) {
    if (this.fin != null) return;
    if (this.respawn > 0) { this.respawn -= dt; if (this.respawn <= 0) { this.x = this.lastSafe; this.y = GROUND; this.vy = 0; this.air = 0; } return; }
    this.x += SPEED * dt;
    const onG = this.groundAt(this.x);
    this.vy += G * dt; this.y += this.vy * dt;
    if (this.y >= GROUND && onG && this.vy >= 0) { this.y = GROUND; this.vy = 0; this.air = 0; if (this.x < GOAL) this.lastSafe = this.x - 30; }
    if (this.y > GROUND + 140) { this.falls++; this.respawn = 1.0; this.ctx.sfx('error'); this.ctx.vibrate(80); }
    if (this.x >= GOAL) { this.fin = this.t; this.ctx.sfx('win'); this.finish(); }
  }
  score() { return Math.floor(this.x / 10); }
  payload() { return { t: this.fin != null ? Math.round(this.fin * 100) / 100 : null, d: Math.round(this.x) }; }
  clean(d) {
    let t = d.t != null ? Number(d.t) : null;
    const d2 = clamp(Math.floor(Number(d.d) || 0), 0, GOAL);
    if (t != null && (!(t >= GOAL / SPEED - 0.3) || t > this.ctx.duration + 2)) t = null; // schneller als Autolauf geht nicht
    return { t, d: t != null ? GOAL : Math.min(d2, Math.floor((this.ctx.duration + 1) * SPEED)) };
  }
  empty() { return { t: null, d: 0 }; }
  compare(a, b) { if (a.t != null && b.t != null) return a.t - b.t; if (a.t != null) return -1; if (b.t != null) return 1; return b.d - a.d; }
  value(s) { return s.t != null ? s.t : s.d; }
  label(s) { return s.t != null ? `${s.t.toFixed(1)} s` : `${Math.round(s.d / GOAL * 100)} % der Strecke`; }
  botResult(sk) {
    const prog = clamp(sk * 1.12 * (0.85 + Math.random() * 0.3), 0.15, 1.2);
    return prog >= 1 ? { t: Math.round((GOAL / SPEED + 1 + (1 - sk) * 9 * Math.random()) * 100) / 100, d: GOAL } : { t: null, d: Math.round(GOAL * prog) };
  }
  progressOf(sub) { return Math.floor((sub.t != null ? GOAL : sub.d) / 10); }

  render(g, snap, me) {
    const sky = g.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#f08ac0'); sky.addColorStop(0.6, '#ffc1e0'); sky.addColorStop(1, '#fff');
    g.fillStyle = sky; rrect(g, 0, 0, W, H, 16); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)';
    for (let k = 0; k < 4; k++) { const cx = ((k * 200 - this.x * 0.25) % (W + 160) + W + 160) % (W + 160) - 80; g.beginPath(); g.arc(cx, 190 + (k % 2) * 30, 34, 0, 7); g.arc(cx + 34, 198 + (k % 2) * 30, 26, 0, 7); g.arc(cx - 30, 200 + (k % 2) * 30, 24, 0, 7); g.fill(); }
    const camX = this.x - CAM;
    for (const s of this.segs) {
      if (s.x1 < camX - 20 || s.x0 > camX + W + 20) continue;
      const sx = Math.max(s.x0, camX - 20) - camX, ex = Math.min(s.x1, camX + W + 20) - camX;
      for (let px = sx; px < ex; px += 28) { g.fillStyle = ((Math.floor((px + camX) / 28)) & 1) ? '#4272b8' : '#3b2058'; g.fillRect(px, GROUND + HEN, Math.min(28, ex - px), 22); }
      g.fillStyle = '#3b2058'; g.fillRect(sx, GROUND + HEN + 22, ex - sx, 20);
    }
    // Ziel
    const gx = GOAL - camX;
    if (gx > -30 && gx < W + 30) { for (let k = 0; k < 8; k++) { g.fillStyle = k % 2 ? '#fff' : '#111'; g.fillRect(gx, GROUND - 90 + k * 13, 14, 13); } g.fillStyle = '#111'; g.fillRect(gx - 3, GROUND - 100, 4, 114); }
    if (this.respawn <= 0) {
      g.save(); g.translate(CAM, this.y); const squash = this.air ? 0.92 : 1;
      g.scale(1, squash);
      text(g, '🐔', 0, -2, { size: 30 }); g.restore();
    } else text(g, '💨', CAM, GROUND, { size: 24 });
    liveBoard(g, this.ctx, snap, me, this.score(), { x: W - 118, y: 8, w: 110, row: 20, title: 'Strecke', fmt: (v) => Math.min(100, Math.round(v * 10 / GOAL * 100)) + '%' });
    if (this.fin != null) text(g, `Im Ziel! ${this.fin.toFixed(1)} s`, W / 2, 110, { size: 30, color: '#fff', stroke: '#8a2b6a', strokeW: 7 });
    else text(g, `${Math.min(100, Math.round(this.x / GOAL * 100))} %`, 14, 18, { size: 16, align: 'left', color: '#8a2b6a' });
  }
}

export default {
  id: 'huehner', name: 'Hühner-Hüpfer', emoji: '🐔', category: 'Rennen', tags: ['rennen', 'party'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'TAP', duration: 45,
  view: { w: W, h: H },
  howTo: ['Das Huhn läuft von allein. Tippe zum Springen – in der Luft nochmal tippen für einen Doppelsprung!', 'Wer in eine Lücke fällt, verliert eine Sekunde. Wer zuerst im Ziel ist, gewinnt.'],
  wertung: 'Zielzeit. Wer nicht ankommt, zählt nach zurückgelegter Strecke.',
  create: (ctx) => new Huehner(ctx),
};
