// ⚽ Fußball – Teams gegeneinander. Joystick läuft, ⚽-Knopf schießt, wenn der Ball nah ist.
import { text, disc, arrowDown } from '../core/draw.js';
import { teamResult } from '../core/gamekit.js';
import { botParams } from '../core/bots.js';
import { TEAM_COLORS } from '../core/state.js';
import { clamp, r1, r2 } from '../core/util.js';

const W = 560, H = 340, PR = 14, BR = 8, SPEED = 125, GY0 = 118, GY1 = 222, KICK = 330;

class Fussball {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.running = false; this.st = {}; this.bots = {}; this.score = [0, 0]; this.pause = 0; this.flash = 0;
    this.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    this.kickoff();
  }
  kickoff() {
    this.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
    const cnt = [0, 0], tot = [0, 0];
    this.ctx.players.forEach((p) => { tot[p.team]++; });
    this.ctx.players.forEach((p) => {
      const k = cnt[p.team]++, n = tot[p.team];
      const x = p.team === 0 ? 120 + (k % 2) * 60 : W - 120 - (k % 2) * 60;
      const y = n === 1 ? H / 2 : 60 + (H - 120) * (k + 0.5) / n;
      const old = this.st[p.uid] || { b: 0 };
      this.st[p.uid] = { x, y, sx: 0, sy: 0, b: old.b, kick: false, kt: 0 };
    });
  }
  start() { this.running = true; }
  onInput(uid, input) {
    const s = this.st[uid];
    if (!s) return;
    s.sx = clamp(Number(input.x) || 0, -1, 1); s.sy = clamp(Number(input.y) || 0, -1, 1);
    const b = input.b | 0;
    if (b > s.b) s.kick = true;
    s.b = b;
  }
  update(dt) {
    if (!this.running) return;
    this.t += dt;
    this.flash = Math.max(0, this.flash - dt);
    if (this.pause > 0) { this.pause -= dt; if (this.pause <= 0) this.kickoff(); return; }
    const ball = this.ball;
    for (const p of this.ctx.players) {
      const s = this.st[p.uid];
      const len = Math.hypot(s.sx, s.sy);
      if (len > 0.12) { const k = Math.min(1, len) / len; s.x = clamp(s.x + s.sx * k * SPEED * dt, PR, W - PR); s.y = clamp(s.y + s.sy * k * SPEED * dt, PR, H - PR); }
      s.kt = Math.max(0, s.kt - dt);
      const dx = ball.x - s.x, dy = ball.y - s.y, d = Math.hypot(dx, dy) || 1;
      if (s.kick && d < PR + BR + 14 && s.kt <= 0) {
        ball.vx = dx / d * KICK + s.sx * 40; ball.vy = dy / d * KICK + s.sy * 40; s.kt = 0.35;
        if (p.uid === this.ctx.me) { this.ctx.sfx('hit'); this.ctx.vibrate(20); }
      }
      s.kick = false;
      if (d < PR + BR) { // anschubsen
        const o = PR + BR - d;
        ball.x += dx / d * o; ball.y += dy / d * o;
        const rel = (ball.vx - s.sx * SPEED) * dx / d + (ball.vy - s.sy * SPEED) * dy / d;
        if (rel < 0) { ball.vx -= 1.6 * rel * dx / d; ball.vy -= 1.6 * rel * dy / d; }
      }
    }
    // Spieler rempeln sich weg
    const ps = this.ctx.players;
    for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
      const a = this.st[ps[i].uid], b = this.st[ps[j].uid];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      if (d < PR * 2) { const o = (PR * 2 - d) / 2; a.x -= dx / d * o; a.y -= dy / d * o; b.x += dx / d * o; b.y += dy / d * o; }
    }
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    const f = Math.exp(-0.75 * dt); ball.vx *= f; ball.vy *= f;
    const sp = Math.hypot(ball.vx, ball.vy);
    if (sp > 520) { ball.vx *= 520 / sp; ball.vy *= 520 / sp; }
    const inGoalY = ball.y > GY0 && ball.y < GY1;
    if (ball.y < BR) { ball.y = BR; ball.vy = Math.abs(ball.vy) * 0.85; }
    if (ball.y > H - BR) { ball.y = H - BR; ball.vy = -Math.abs(ball.vy) * 0.85; }
    if (ball.x < BR) {
      if (inGoalY) this.goal(1); else { ball.x = BR; ball.vx = Math.abs(ball.vx) * 0.85; }
    } else if (ball.x > W - BR) {
      if (inGoalY) this.goal(0); else { ball.x = W - BR; ball.vx = -Math.abs(ball.vx) * 0.85; }
    }
  }
  goal(team) {
    this.score[team]++; this.pause = 1.4; this.flash = 1.4; this.ball.vx = this.ball.vy = 0;
    this.ctx.sfx('win'); this.ctx.vibrate(60);
    this.lastGoal = team;
  }
  snapshot() {
    return {
      t: r1(this.t), sc: this.score.slice(), ps: this.pause > 0 ? 1 : 0, lg: this.lastGoal ?? -1,
      b: [r1(this.ball.x), r1(this.ball.y)],
      p: this.ctx.players.map((p) => { const s = this.st[p.uid]; return [r1(s.x), r1(s.y)]; }),
    };
  }

  botThink(bot, snap, dt) {
    const me = this.ctx.byUid[bot.uid];
    const s = this.st[bot.uid];
    const prm = botParams(bot.botLevel);
    const b = this.bots[bot.uid] || (this.bots[bot.uid] = { t: 0, x: 0, y: 0, k: 0 });
    b.t -= dt;
    if (b.t <= 0) {
      b.t = prm.react * (0.35 + Math.random() * 0.4);
      const ball = this.ball;
      const goalX = me.team === 0 ? W : 0, ownX = me.team === 0 ? 0 : W;
      const mates = this.ctx.players.filter((p) => p.team === me.team);
      const dist = (p) => Math.hypot(this.st[p.uid].x - ball.x, this.st[p.uid].y - ball.y);
      const closest = mates.reduce((a, c) => (dist(c) < dist(a) ? c : a), mates[0]);
      let tx, ty;
      if (closest.uid === bot.uid || mates.length === 1) {
        const dx = goalX - ball.x, dy = H / 2 - ball.y, l = Math.hypot(dx, dy) || 1;
        tx = ball.x - dx / l * 16; ty = ball.y - dy / l * 16;
        const near = Math.hypot(ball.x - s.x, ball.y - s.y);
        if (near < PR + BR + 14 && Math.random() < 0.55 + prm.aim * 0.4) b.k++;
        if (near < 40) { tx = ball.x; ty = ball.y; }
      } else { // verteidigen
        tx = ownX + (me.team === 0 ? 1 : -1) * 70; ty = clamp(ball.y, GY0 - 10, GY1 + 10);
      }
      let dx = tx - s.x, dy = ty - s.y; const l = Math.hypot(dx, dy) || 1;
      const jit = (1 - prm.aim) * (Math.random() - 0.5) * 1.2;
      dx /= l; dy /= l;
      b.x = r2(dx * Math.cos(jit) - dy * Math.sin(jit)); b.y = r2(dx * Math.sin(jit) + dy * Math.cos(jit));
      if (l < 6) { b.x = 0; b.y = 0; }
    }
    return { x: b.x, y: b.y, b: b.k };
  }

  result() { return teamResult(this.ctx, this.score, (w) => (w === 'draw' ? 'Unentschieden' : w ? 'Sieg' : 'Niederlage')); }

  render(g, snap, me, alpha, prev) {
    g.fillStyle = '#2f8f45'; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 10; i++) { g.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.05)'; g.fillRect(i * (W / 10), 0, W / 10, H); }
    g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 3;
    g.strokeRect(3, 3, W - 6, H - 6);
    g.beginPath(); g.moveTo(W / 2, 3); g.lineTo(W / 2, H - 3); g.stroke();
    g.beginPath(); g.arc(W / 2, H / 2, 38, 0, 7); g.stroke();
    g.strokeRect(3, GY0 - 28, 54, GY1 - GY0 + 56); g.strokeRect(W - 57, GY0 - 28, 54, GY1 - GY0 + 56);
    g.fillStyle = TEAM_COLORS[0].hex; g.fillRect(0, GY0, 8, GY1 - GY0);
    g.fillStyle = TEAM_COLORS[1].hex; g.fillRect(W - 8, GY0, 8, GY1 - GY0);
    const ps = this.ctx.players;
    ps.forEach((p, i) => {
      const c = snap.p[i], pv = prev && prev.p ? prev.p[i] : null;
      const x = pv ? pv[0] + (c[0] - pv[0]) * alpha : c[0], y = pv ? pv[1] + (c[1] - pv[1]) * alpha : c[1];
      disc(g, x, y, PR, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : TEAM_COLORS[p.team].hex });
      if (p.uid === me) arrowDown(g, x, y - PR - 8, '#ffe14d', 5);
    });
    const bx = prev && prev.b ? prev.b[0] + (snap.b[0] - prev.b[0]) * alpha : snap.b[0], by = prev && prev.b ? prev.b[1] + (snap.b[1] - prev.b[1]) * alpha : snap.b[1];
    g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(bx, by + 5, BR, 3.5, 0, 0, 7); g.fill();
    text(g, '⚽', bx, by, { size: 20 });
    text(g, `${snap.sc[0]} : ${snap.sc[1]}`, W / 2, 20, { size: 22, color: '#fff', stroke: 'rgba(0,0,0,.6)', strokeW: 5 });
    if (snap.ps) text(g, 'TOOOR!', W / 2, H / 2 - 50, { size: 44, color: '#ffe14d', stroke: 'rgba(0,0,0,.7)', strokeW: 8 });
  }
}

export default {
  id: 'fussball', name: 'Fußball', emoji: '⚽', category: 'Sport', tags: ['sport', 'team'],
  min: 2, max: 6, teams: 'only', duel: false, humansOnly: false,
  sync: 'host', controls: 'JOY+BTN', buttons: ['⚽'], duration: 60,
  view: { w: W, h: H },
  howTo: ['Zwei Teams: Rot spielt nach rechts, Blau nach links.', 'Lauf zum Ball – mit dem ⚽-Knopf schießt du, wenn er nah ist.'],
  wertung: 'Das Team mit den meisten Toren gewinnt, sonst Unentschieden.',
  create: (ctx) => new Fussball(ctx),
};
