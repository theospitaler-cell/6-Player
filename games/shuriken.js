// 🥷 Ninja-Sterne – wirf Wurfsterne auf die wandernden Zielscheiben. Ziehen & loslassen.
import { text, rrect } from '../core/draw.js';
import { AimDrag, drawAim } from '../core/aim.js';
import { LocalGame, liveBoard } from '../core/gamekit.js';
import { mulberry32, clamp } from '../core/util.js';

const W = 560, H = 330, OX = 56, OY = H / 2, COOL = 0.4, SPEED = 560, TR = 20;

function buildTargets(seed, duration) {
  const r = mulberry32(seed ^ 0x9e3779b9);
  const out = [];
  for (let ts = 0.3; ts < duration + 2; ts += 0.5 + r() * 0.35) {
    out.push({ ts, x: 250 + r() * 270, y0: 70 + r() * (H - 140), amp: 15 + r() * 55, w: 0.9 + r() * 1.6, ph: r() * 6.28, life: 3.2 + r() * 1.4, hit: false });
  }
  return out;
}

class Shuriken extends LocalGame {
  constructor(ctx) { super(ctx); this.aim = new AimDrag({ maxPull: 90, minPull: 10 }); this.targets = buildTargets(ctx.seed, ctx.duration); this.stars = []; this.cd = 0; this.pts = 0; this.hits = 0; this.pops = []; }
  ty(tg) { return tg.y0 + tg.amp * Math.sin(tg.w * (this.t - tg.ts) + tg.ph); }
  active() { return this.targets.filter((tg) => !tg.hit && this.t >= tg.ts && this.t < tg.ts + tg.life); }
  onPointer(type, x, y) {
    if (!this.running) return;
    if (type === 'down') this.aim.down(x, y);
    else if (type === 'move') this.aim.move(x, y);
    else if (type === 'up') {
      const v = this.aim.up(x, y);
      if (v && this.cd <= 0) { this.stars.push({ x: OX, y: OY, vx: v.dx * SPEED, vy: v.dy * SPEED, rot: 0 }); this.cd = COOL; this.ctx.sfx('whoosh'); this.ctx.vibrate(10); }
    } else this.aim.cancel();
  }
  tick(dt) {
    this.cd = Math.max(0, this.cd - dt);
    this.pops = this.pops.filter((p) => (p.t -= dt) > 0);
    const act = this.active();
    for (const s of this.stars) {
      s.x += s.vx * dt; s.y += s.vy * dt; s.rot += dt * 18;
      for (const tg of act) {
        if (tg.hit) continue;
        const d = Math.hypot(s.x - tg.x, s.y - this.ty(tg));
        if (d < TR + 6) {
          tg.hit = true; s.dead = true;
          const bull = d < 9; this.pts += bull ? 3 : 1; this.hits++;
          this.pops.push({ x: tg.x, y: this.ty(tg), t: 0.7, txt: bull ? '+3 🎯' : '+1' });
          this.ctx.sfx(bull ? 'win' : 'coin'); this.ctx.vibrate(20);
        }
      }
      if (s.x < -20 || s.x > W + 20 || s.y < -20 || s.y > H + 20) s.dead = true;
    }
    this.stars = this.stars.filter((s) => !s.dead);
  }
  score() { return this.pts; }
  payload() { return { s: this.pts, h: this.hits }; }
  clean(d) { const max = Math.ceil(this.ctx.duration / COOL) * 3; return { s: clamp(Math.floor(Number(d.s) || 0), 0, max), h: clamp(Math.floor(Number(d.h) || 0), 0, max) }; }
  empty() { return { s: 0, h: 0 }; }
  compare(a, b) { return b.s - a.s || b.h - a.h; }
  value(s) { return s.s; }
  label(s) { return `${s.s} Punkte (${s.h} Treffer)`; }
  botResult(sk) { const h = Math.round(clamp(sk * 18 * (0.7 + Math.random() * 0.6), 0, 40)); return { s: h + Math.floor(h * 0.25 * Math.random()), h }; }

  render(g, snap, me) {
    g.fillStyle = '#243046'; rrect(g, 0, 0, W, H, 16); g.fill();
    g.fillStyle = 'rgba(255,255,255,.07)'; for (let x = 0; x < W; x += 40) g.fillRect(x, 0, 1, H);
    text(g, '🥷', OX - 14, OY, { size: 40 });
    for (const tg of this.active()) {
      const y = this.ty(tg);
      const fade = this.t > tg.ts + tg.life - 0.6 ? 0.45 : 1;
      g.globalAlpha = fade;
      for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? '#fff' : '#ff4d6d'; g.beginPath(); g.arc(tg.x, y, TR - k * 5, 0, 7); g.fill(); }
      g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(tg.x, y, 4, 0, 7); g.fill(); g.globalAlpha = 1;
    }
    for (const s of this.stars) { g.save(); g.translate(s.x, s.y); g.rotate(s.rot); text(g, '✴️', 0, 0, { size: 20 }); g.restore(); }
    if (this.aim.active) drawAim(g, this.aim, '#ffe14d', OX, OY);
    for (const p of this.pops) text(g, p.txt, p.x, p.y - 26 - (0.7 - p.t) * 30, { size: 20, color: '#ffe14d', stroke: 'rgba(0,0,0,.6)', strokeW: 5 });
    text(g, `${this.pts} Punkte`, 14, 18, { size: 18, align: 'left', color: '#ffe14d' });
    liveBoard(g, this.ctx, snap, me, this.pts, { x: W - 118, y: 8, w: 110, row: 20, title: 'Punkte' });
    if (this.t < 1.5 && this.running) text(g, 'Ziehen & loslassen = werfen', W / 2, H - 14, { size: 14, color: 'rgba(255,255,255,.75)' });
  }
}

export default {
  id: 'shuriken', name: 'Ninja-Sterne', emoji: '🥷', category: 'Geschick', tags: ['zielen'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'local', controls: 'AIM', pointer: true, duration: 30,
  view: { w: W, h: H },
  howTo: ['Ziehe nach hinten und lass los: Der Wurfstern fliegt in die Gegenrichtung.', 'Triff die wandernden Scheiben – die Mitte zählt dreifach!'],
  wertung: 'Die meisten Punkte in 30 Sekunden gewinnen.',
  create: (ctx) => new Shuriken(ctx),
};
