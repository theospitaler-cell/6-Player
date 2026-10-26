// 🏒 Air-Hockey – Duell am Tisch (bis 4 Spieler, 2 gegen 2). Joystick bewegt den Schläger.
import { text, disc, arrowDown } from '../core/draw.js';
import { teamResult } from '../core/gamekit.js';
import { botParams } from '../core/bots.js';
import { TEAM_COLORS } from '../core/state.js';
import { clamp, r1, r2 } from '../core/util.js';

const W = 560, H = 340, MR = 21, PUCK = 11, GY0 = 112, GY1 = 228, PSPEED = 250, WIN_GOALS = 5;

class AirHockey {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.running = false; this.st = {}; this.bots = {}; this.score = [0, 0]; this.pause = 0; this.over = false; this.lastGoal = -1;
    this.reset(0);
  }
  reset(servingTeam) {
    this.puck = { x: W / 2 + (servingTeam === 0 ? -50 : 50), y: H / 2, vx: 0, vy: 0 };
    const cnt = [0, 0], tot = [0, 0];
    this.ctx.players.forEach((p) => { tot[p.team]++; });
    this.ctx.players.forEach((p) => {
      const k = cnt[p.team]++, n = tot[p.team];
      this.st[p.uid] = { x: p.team === 0 ? 70 + (k % 2) * 30 : W - 70 - (k % 2) * 30, y: n === 1 ? H / 2 : H * (k + 1) / (n + 1), sx: 0, sy: 0, vx: 0, vy: 0 };
    });
  }
  start() { this.running = true; }
  onInput(uid, input) { const s = this.st[uid]; if (s) { s.sx = clamp(Number(input.x) || 0, -1, 1); s.sy = clamp(Number(input.y) || 0, -1, 1); } }
  update(dt) {
    if (!this.running || this.over) return;
    this.t += dt;
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0) this.reset(this.lastGoal === 0 ? 1 : 0); return; }
    const pk = this.puck;
    for (const p of this.ctx.players) {
      const s = this.st[p.uid];
      const len = Math.hypot(s.sx, s.sy);
      const ox = s.x, oy = s.y;
      if (len > 0.1) { const k = Math.min(1, len) / len; s.x += s.sx * k * PSPEED * dt; s.y += s.sy * k * PSPEED * dt; }
      const lo = p.team === 0 ? MR : W / 2 + MR, hi = p.team === 0 ? W / 2 - MR : W - MR;
      s.x = clamp(s.x, lo, hi); s.y = clamp(s.y, MR, H - MR);
      s.vx = (s.x - ox) / dt; s.vy = (s.y - oy) / dt;
      // Schläger trifft Puck
      const dx = pk.x - s.x, dy = pk.y - s.y, d = Math.hypot(dx, dy) || 1;
      if (d < MR + PUCK) {
        const nx = dx / d, ny = dy / d;
        pk.x = s.x + nx * (MR + PUCK); pk.y = s.y + ny * (MR + PUCK);
        const rel = (pk.vx - s.vx) * nx + (pk.vy - s.vy) * ny;
        if (rel < 0) { pk.vx -= 2 * rel * nx; pk.vy -= 2 * rel * ny; }
        pk.vx += nx * 40; pk.vy += ny * 40;
        if (p.uid === this.ctx.me) { this.ctx.sfx('hit'); this.ctx.vibrate(15); }
      }
    }
    // Mitspieler im selben Team nicht übereinander
    const ps = this.ctx.players;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = this.st[ps[i].uid], b = this.st[ps[j].uid];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      if (d < MR * 2) { const o = (MR * 2 - d) / 2; a.x -= dx / d * o; a.y -= dy / d * o; b.x += dx / d * o; b.y += dy / d * o; }
    }
    pk.x += pk.vx * dt; pk.y += pk.vy * dt;
    const f = Math.exp(-0.35 * dt); pk.vx *= f; pk.vy *= f;
    const sp = Math.hypot(pk.vx, pk.vy);
    if (sp > 560) { pk.vx *= 560 / sp; pk.vy *= 560 / sp; }
    if (pk.y < PUCK) { pk.y = PUCK; pk.vy = Math.abs(pk.vy) * 0.95; }
    if (pk.y > H - PUCK) { pk.y = H - PUCK; pk.vy = -Math.abs(pk.vy) * 0.95; }
    const inGoal = pk.y > GY0 && pk.y < GY1;
    if (pk.x < PUCK) { if (inGoal) this.goal(1); else { pk.x = PUCK; pk.vx = Math.abs(pk.vx) * 0.95; } }
    else if (pk.x > W - PUCK) { if (inGoal) this.goal(0); else { pk.x = W - PUCK; pk.vx = -Math.abs(pk.vx) * 0.95; } }
  }
  goal(team) {
    this.score[team]++; this.lastGoal = team; this.pause = 1.2; this.puck.vx = this.puck.vy = 0;
    this.ctx.sfx('win'); this.ctx.vibrate(60);
    if (this.score[team] >= WIN_GOALS) this.over = true;
  }
  isFinished() { return this.over && this.pause < 0.4; }
  snapshot() {
    return { t: r1(this.t), sc: this.score.slice(), ps: this.pause > 0 ? 1 : 0, pk: [r1(this.puck.x), r1(this.puck.y)], p: this.ctx.players.map((p) => { const s = this.st[p.uid]; return [r1(s.x), r1(s.y)]; }) };
  }

  botThink(bot, snap, dt) {
    const me = this.ctx.byUid[bot.uid];
    const s = this.st[bot.uid];
    const prm = botParams(bot.botLevel);
    const b = this.bots[bot.uid] || (this.bots[bot.uid] = { t: 0, x: 0, y: 0 });
    b.t -= dt;
    if (b.t <= 0) {
      b.t = prm.react * (0.25 + Math.random() * 0.3);
      const pk = this.puck;
      const own = me.team === 0 ? pk.x < W / 2 + 20 : pk.x > W / 2 - 20;
      let tx, ty;
      const dirX = me.team === 0 ? 1 : -1;
      if (own && Math.hypot(pk.vx, pk.vy) < 700) {
        // hinter den Puck laufen und durchziehen Richtung gegnerisches Tor
        const gx = me.team === 0 ? W : 0, gy = H / 2 + (Math.random() - 0.5) * 60;
        const ux = gx - pk.x, uy = gy - pk.y, l = Math.hypot(ux, uy) || 1;
        const behindX = pk.x - ux / l * 26, behindY = pk.y - uy / l * 26;
        const aligned = Math.hypot(behindX - s.x, behindY - s.y) < 22;
        tx = aligned ? pk.x + ux / l * 30 : behindX; ty = aligned ? pk.y + uy / l * 30 : behindY;
      } else { tx = me.team === 0 ? 55 : W - 55; ty = clamp(pk.y + pk.vy * 0.15, GY0 - 15, GY1 + 15); }
      let dx = tx - s.x, dy = ty - s.y; const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const jit = (1 - prm.aim) * (Math.random() - 0.5) * 1.1;
      const sp = Math.min(1, l / 30) * (0.55 + prm.speed * 0.45);
      b.x = r2((dx * Math.cos(jit) - dy * Math.sin(jit)) * sp); b.y = r2((dx * Math.sin(jit) + dy * Math.cos(jit)) * sp);
    }
    return { x: b.x, y: b.y };
  }

  result() { return teamResult(this.ctx, this.score); }

  render(g, snap, me, alpha, prev) {
    g.fillStyle = '#1d3f73'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.strokeRect(3, 3, W - 6, H - 6);
    g.beginPath(); g.moveTo(W / 2, 3); g.lineTo(W / 2, H - 3); g.stroke();
    g.beginPath(); g.arc(W / 2, H / 2, 46, 0, 7); g.stroke();
    g.fillStyle = TEAM_COLORS[0].hex; g.fillRect(0, GY0, 7, GY1 - GY0);
    g.fillStyle = TEAM_COLORS[1].hex; g.fillRect(W - 7, GY0, 7, GY1 - GY0);
    const ps = this.ctx.players;
    ps.forEach((p, i) => {
      const c = snap.p[i], pv = prev && prev.p ? prev.p[i] : null;
      const x = pv ? pv[0] + (c[0] - pv[0]) * alpha : c[0], y = pv ? pv[1] + (c[1] - pv[1]) * alpha : c[1];
      disc(g, x, y, MR, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : TEAM_COLORS[p.team].hex, ringW: 4 });
      if (p.uid === me) arrowDown(g, x, y - MR - 8, '#ffe14d', 5);
    });
    const px = prev && prev.pk ? prev.pk[0] + (snap.pk[0] - prev.pk[0]) * alpha : snap.pk[0], py = prev && prev.pk ? prev.pk[1] + (snap.pk[1] - prev.pk[1]) * alpha : snap.pk[1];
    g.fillStyle = '#111'; g.beginPath(); g.arc(px, py, PUCK, 0, 7); g.fill();
    g.strokeStyle = '#ffd23f'; g.lineWidth = 3; g.beginPath(); g.arc(px, py, PUCK - 3, 0, 7); g.stroke();
    text(g, `${snap.sc[0]} : ${snap.sc[1]}`, W / 2, 22, { size: 24, color: '#fff', stroke: 'rgba(0,0,0,.6)', strokeW: 5 });
    text(g, `bis ${WIN_GOALS}`, W / 2, H - 14, { size: 12, color: 'rgba(255,255,255,.55)' });
    if (snap.ps) text(g, 'TOOOR!', W / 2, H / 2 - 70, { size: 40, color: '#ffe14d', stroke: 'rgba(0,0,0,.7)', strokeW: 8 });
  }
}

export default {
  id: 'airhockey', name: 'Air-Hockey', emoji: '🏒', category: 'Sport', tags: ['sport', 'team'],
  min: 2, max: 4, teams: 'only', duel: true, humansOnly: false,
  sync: 'host', controls: 'JOY', duration: 70,
  view: { w: W, h: H },
  howTo: ['Schlage den Puck mit deinem Schläger ins gegnerische Tor.', 'Du bleibst in deiner Tischhälfte. Wer zuerst 5 Tore hat, gewinnt!'],
  wertung: 'Mehr Tore gewinnt. Duell-Punkte: Sieger n, Verlierer 1, Zuschauer ⌈n/2⌉.',
  create: (ctx) => new AirHockey(ctx),
};
