// ☄️ Feuerregen – Meteoriten fallen, wer getroffen wird, ist raus. Joystick = ausweichen.
import { text, disc, arrowDown } from '../core/draw.js';
import { rankSurvival } from '../core/gamekit.js';
import { botParams } from '../core/bots.js';
import { clamp, r1, r2, rand } from '../core/util.js';

const W = 560, H = 340, PR = 12, SPEED = 130;

class Ausweichen {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.running = false; this.out = {}; this.st = {}; this.bots = {}; this.rocks = []; this.spawnAcc = 0; this.endAt = null;
    const n = ctx.players.length;
    ctx.players.forEach((p, i) => { this.st[p.uid] = { x: W * (i + 1) / (n + 1), y: H - 40, sx: 0, sy: 0, alive: true }; });
  }
  start() { this.running = true; }
  onInput(uid, input) { const s = this.st[uid]; if (s && s.alive) { s.sx = clamp(Number(input.x) || 0, -1, 1); s.sy = clamp(Number(input.y) || 0, -1, 1); } }
  alivePlayers() { return this.ctx.players.filter((p) => this.st[p.uid].alive); }
  update(dt) {
    if (!this.running) return;
    this.t += dt;
    // Meteoriten: mit der Zeit mehr und schneller
    const rate = 2.0 + this.t * 0.14 + this.ctx.players.length * 0.3;
    this.spawnAcc += rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const r = rand(7, 15);
      const al = this.alivePlayers();
      // jeder dritte Meteorit zielt auf einen Spieler – so kann man sich nicht in einer Ecke verstecken
      const aimed = al.length && Math.random() < 0.4 ? this.st[al[Math.floor(Math.random() * al.length)].uid] : null;
      this.rocks.push({ x: aimed ? clamp(aimed.x + rand(-26, 26), r, W - r) : rand(r, W - r), y: -r, vx: rand(-22, 22), vy: rand(85, 135) + this.t * 3, r });
    }
    for (const k of this.rocks) { k.x += k.vx * dt; k.y += k.vy * dt; }
    this.rocks = this.rocks.filter((k) => k.y < H + 30);
    for (const p of this.alivePlayers()) {
      const s = this.st[p.uid];
      const len = Math.hypot(s.sx, s.sy);
      if (len > 0.12) { const k = Math.min(1, len) / len; s.x = clamp(s.x + s.sx * k * SPEED * dt, PR, W - PR); s.y = clamp(s.y + s.sy * k * SPEED * dt, PR, H - PR); }
      for (const k of this.rocks) {
        if (Math.hypot(k.x - s.x, k.y - s.y) < k.r + PR - 3) {
          s.alive = false; this.out[p.uid] = this.t;
          if (p.uid === this.ctx.me) { this.ctx.sfx('fall'); this.ctx.vibrate(150); }
          break;
        }
      }
    }
    if (this.endAt == null && this.alivePlayers().length <= (this.ctx.players.length > 1 ? 1 : 0)) this.endAt = this.t;
  }
  isFinished() { return this.endAt != null && this.t >= this.endAt + 1.0; }
  isOut(uid) { return this.st[uid] ? !this.st[uid].alive : false; }
  snapshot() {
    return {
      t: r1(this.t), e: this.endAt != null ? 1 : 0,
      p: this.ctx.players.map((p) => { const s = this.st[p.uid]; return [r1(s.x), r1(s.y), s.alive ? 1 : 0, r1(this.out[p.uid] || 0)]; }),
      r: this.rocks.map((k) => [r1(k.x), r1(k.y), r1(k.r)]),
    };
  }

  botThink(bot, snap, dt) {
    const s = this.st[bot.uid];
    if (!s || !s.alive) return null;
    const prm = botParams(bot.botLevel);
    const b = this.bots[bot.uid] || (this.bots[bot.uid] = { t: 0, x: 0, y: 0 });
    b.t -= dt;
    if (b.t > 0) return { x: b.x, y: b.y };
    b.t = prm.react * (0.4 + Math.random() * 0.5);
    // 9 Richtungen (inkl. Stehenbleiben) ausprobieren und die mit der größten Mindestdistanz nehmen
    let best = null, bestScore = -1e9;
    const horizon = 0.55 + prm.aim * 0.35;
    for (let k = 0; k < 9; k++) {
      const ang = k === 8 ? null : (k / 8) * Math.PI * 2;
      const dx = ang == null ? 0 : Math.cos(ang), dy = ang == null ? 0 : Math.sin(ang);
      let minD = 1e9;
      for (let step = 1; step <= 4; step++) {
        const tt = horizon * step / 4;
        const px = clamp(s.x + dx * SPEED * tt, PR, W - PR), py = clamp(s.y + dy * SPEED * tt, PR, H - PR);
        for (const r of this.rocks) {
          const d = Math.hypot(r.x + r.vx * tt - px, r.y + r.vy * tt - py) - r.r - PR;
          if (d < minD) minD = d;
        }
      }
      const edge = Math.min(s.x, W - s.x, s.y, H - s.y);
      const score = Math.min(minD, 60) + (edge < 25 ? -15 : 0) - (ang == null ? 0 : 0.5) + Math.random() * (1 - prm.aim) * 25;
      if (score > bestScore) { bestScore = score; best = [dx, dy]; }
    }
    b.x = r2(best[0]); b.y = r2(best[1]);
    return { x: b.x, y: b.y };
  }

  result() { return { ranks: rankSurvival(this.ctx.players, this.out, { label: (it) => (it.alive ? 'Überlebt!' : `${Math.round(it.t)} s durchgehalten`) }) }; }

  render(g, snap, me, alpha, prev) {
    const grad = g.createLinearGradient(0, 0, 0, H); grad.addColorStop(0, '#2a0f3f'); grad.addColorStop(1, '#a63a2a');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.4)'; for (let i = 0; i < 30; i++) g.fillRect((i * 97) % W, (i * 53) % (H - 80), 2, 2);
    g.fillStyle = '#3a1c10'; g.fillRect(0, H - 8, W, 8);
    for (const k of snap.r) {
      g.fillStyle = 'rgba(255,170,60,.35)'; g.beginPath(); g.arc(k[0], k[1], k[2] + 5, 0, 7); g.fill();
      g.fillStyle = '#6b4a3a'; g.beginPath(); g.arc(k[0], k[1], k[2], 0, 7); g.fill();
      g.fillStyle = '#ff9a3c'; g.beginPath(); g.arc(k[0] - k[2] * 0.25, k[1] - k[2] * 0.25, k[2] * 0.4, 0, 7); g.fill();
    }
    const ps = this.ctx.players;
    ps.forEach((p, i) => {
      const c = snap.p[i], pv = prev && prev.p ? prev.p[i] : null;
      const x = pv ? pv[0] + (c[0] - pv[0]) * alpha : c[0], y = pv ? pv[1] + (c[1] - pv[1]) * alpha : c[1];
      if (!c[2]) { text(g, '💀', x, y, { size: 18 }); return; }
      disc(g, x, y, PR, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : p.ring });
      if (p.uid === me) arrowDown(g, x, y - PR - 8, '#ffe14d', 5);
    });
    text(g, `⏱ ${Math.round(snap.t)} s`, 12, 14, { size: 14, align: 'left', color: 'rgba(255,255,255,.85)' });
    const left = snap.p.filter((c) => c[2]).length;
    text(g, `${left} übrig`, W - 12, 14, { size: 14, align: 'right', color: 'rgba(255,255,255,.85)' });
    if (snap.e && left === 1) { const wi = snap.p.findIndex((c) => c[2]); text(g, `${ps[wi].avatar} ${ps[wi].name} gewinnt!`, W / 2, H / 2, { size: 26, color: '#ffe14d', stroke: 'rgba(0,0,0,.6)', strokeW: 7 }); }
  }
}

export default {
  id: 'ausweichen', name: 'Feuerregen', emoji: '☄️', category: 'Geschick', tags: ['chaos'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'host', controls: 'JOY', duration: 60,
  view: { w: W, h: H },
  howTo: ['Weiche den fallenden Meteoriten ☄️ mit dem Joystick aus.', 'Ein Treffer und du bist raus – es werden immer mehr!'],
  wertung: 'Wer am längsten durchhält, gewinnt.',
  create: (ctx) => new Ausweichen(ctx),
};
