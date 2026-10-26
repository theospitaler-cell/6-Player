// 🛡️ Panzer-Arena – jeder gegen jeden. Joystick fährt, 💥 schießt. 3 Leben-Punkte, Letzter gewinnt.
import { text, rrect, arrowDown, nameTag } from '../core/draw.js';
import { rankSurvival } from '../core/gamekit.js';
import { botParams } from '../core/bots.js';
import { clamp, r1, r2 } from '../core/util.js';

const W = 560, H = 340, TR = 14, BR = 4;
const SPEED = 95, BSPEED = 260, RELOAD = 0.8, HP = 3;
// Hindernisse (Rechtecke x,y,w,h)
const WALLS = [[240, 100, 80, 14], [240, 226, 80, 14], [100, 150, 14, 40], [446, 150, 14, 40], [276, 150, 8, 40]];

const hitWall = (x, y, r) => WALLS.some(([wx, wy, ww, wh]) => x + r > wx && x - r < wx + ww && y + r > wy && y - r < wy + wh);

class Panzer {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.running = false; this.endAt = null; this.out = {}; this.st = {}; this.bots = {}; this.bullets = [];
    const n = ctx.players.length;
    const spots = [[50, 50], [W - 50, H - 50], [W - 50, 50], [50, H - 50], [W / 2, 30], [W / 2, H - 30]];
    ctx.players.forEach((p, i) => {
      const [x, y] = spots[i];
      this.st[p.uid] = { x, y, a: Math.atan2(H / 2 - y, W / 2 - x), hp: HP, alive: true, sx: 0, sy: 0, b: 0, cd: 0.5, hit: 0 };
    });
  }
  start() { this.running = true; }
  onInput(uid, input) {
    const s = this.st[uid];
    if (!s || !s.alive) return;
    s.sx = clamp(Number(input.x) || 0, -1, 1); s.sy = clamp(Number(input.y) || 0, -1, 1);
    const b = input.b | 0;
    if (b > s.b) s.fire = true;
    s.b = b;
  }
  alivePlayers() { return this.ctx.players.filter((p) => this.st[p.uid].alive); }
  update(dt) {
    if (!this.running) return;
    this.t += dt;
    for (const p of this.alivePlayers()) {
      const s = this.st[p.uid];
      const len = Math.hypot(s.sx, s.sy);
      if (len > 0.15) {
        const k = Math.min(1, len) / len;
        s.a = Math.atan2(s.sy, s.sx);
        const nx = s.x + s.sx * k * SPEED * dt, ny = s.y + s.sy * k * SPEED * dt;
        if (!hitWall(nx, s.y, TR - 2) && nx > TR && nx < W - TR) s.x = nx;
        if (!hitWall(s.x, ny, TR - 2) && ny > TR && ny < H - TR) s.y = ny;
      }
      s.cd = Math.max(0, s.cd - dt); s.hit = Math.max(0, s.hit - dt);
      if (s.fire && s.cd <= 0) {
        s.cd = RELOAD; this.bullets.push({ x: s.x + Math.cos(s.a) * (TR + 4), y: s.y + Math.sin(s.a) * (TR + 4), vx: Math.cos(s.a) * BSPEED, vy: Math.sin(s.a) * BSPEED, by: p.uid, life: 2.2 });
        if (p.uid === this.ctx.me) { this.ctx.sfx('whoosh'); this.ctx.vibrate(15); }
      }
      s.fire = false;
    }
    // Panzer schieben sich auseinander
    const al = this.alivePlayers();
    for (let i = 0; i < al.length; i++) for (let j = i + 1; j < al.length; j++) {
      const a = this.st[al[i].uid], b = this.st[al[j].uid];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      if (d < TR * 2) { const o = (TR * 2 - d) / 2; a.x -= dx / d * o; a.y -= dy / d * o; b.x += dx / d * o; b.y += dy / d * o; }
    }
    // Geschosse
    for (const b of this.bullets) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      if (b.x < 0 || b.x > W || b.y < 0 || b.y > H || hitWall(b.x, b.y, BR)) { b.life = 0; continue; }
      for (const p of al) {
        if (p.uid === b.by) continue;
        const s = this.st[p.uid];
        if (!s.alive) continue;
        if (Math.hypot(s.x - b.x, s.y - b.y) < TR + BR) {
          b.life = 0; s.hp--; s.hit = 0.3;
          if (p.uid === this.ctx.me) { this.ctx.sfx('hit'); this.ctx.vibrate(80); }
          if (s.hp <= 0) { s.alive = false; this.out[p.uid] = this.t; if (p.uid === this.ctx.me) this.ctx.sfx('fall'); }
          break;
        }
      }
    }
    this.bullets = this.bullets.filter((b) => b.life > 0);
    if (this.endAt == null && this.alivePlayers().length <= 1) this.endAt = this.t;
  }
  isFinished() { return this.endAt != null && this.t >= this.endAt + 1.0; }
  isOut(uid) { return this.st[uid] ? !this.st[uid].alive : false; }
  snapshot() {
    return {
      t: r1(this.t), e: this.endAt != null ? 1 : 0,
      p: this.ctx.players.map((p) => { const s = this.st[p.uid]; return [r1(s.x), r1(s.y), r2(s.a), s.hp, s.alive ? 1 : 0, s.hit > 0 ? 1 : 0, r1(s.cd)]; }),
      b: this.bullets.map((b) => [r1(b.x), r1(b.y)]),
    };
  }

  botThink(bot, snap, dt) {
    const s = this.st[bot.uid];
    if (!s || !s.alive) return null;
    const prm = botParams(bot.botLevel);
    const b = this.bots[bot.uid] || (this.bots[bot.uid] = { t: 0, x: 0, y: 0, fire: 0, wob: 0 });
    b.t -= dt;
    if (b.t <= 0) {
      b.t = prm.react * (0.5 + Math.random() * 0.8);
      let tgt = null, bd = 1e9;
      for (const p of this.alivePlayers()) { if (p.uid === bot.uid) continue; const o = this.st[p.uid]; const d = Math.hypot(o.x - s.x, o.y - s.y); if (d < bd) { bd = d; tgt = o; } }
      if (tgt) {
        const ang = Math.atan2(tgt.y - s.y, tgt.x - s.x);
        // ausweichen: seitlich versetzt fahren, wenn Geschosse nah
        let danger = null;
        for (const bl of this.bullets) if (bl.by !== bot.uid && Math.hypot(bl.x - s.x, bl.y - s.y) < 90) danger = bl;
        let mv = ang + (bd < 80 ? Math.PI : 0) * (Math.random() < 0.5 ? 1 : 0) + (Math.random() - 0.5) * (1 - prm.aim) * 2;
        if (danger && Math.random() < prm.aim) mv = Math.atan2(danger.vy, danger.vx) + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);
        b.x = r2(Math.cos(mv)); b.y = r2(Math.sin(mv));
        // schießen, wenn das Ziel ungefähr in Blickrichtung liegt (Panzer dreht sich in Fahrtrichtung → kurz auf Ziel drehen)
        const aimErr = Math.abs(Math.atan2(Math.sin(ang - s.a), Math.cos(ang - s.a)));
        if (aimErr < 0.5 + (1 - prm.aim) * 0.6 && Math.random() < 0.4 + prm.aim * 0.5) b.fire++;
        else if (bd < 220 && Math.random() < 0.5) { b.x = r2(Math.cos(ang)); b.y = r2(Math.sin(ang)); }
      }
    }
    return { x: b.x, y: b.y, b: b.fire };
  }

  result() {
    const ranks = rankSurvival(this.ctx.players, this.out, { alive: (p) => this.st[p.uid].hp, label: (it) => (it.alive ? `${this.st[it.uid].hp} ❤️ übrig` : `raus nach ${Math.round(it.t)} s`) });
    return { ranks };
  }

  render(g, snap, me, alpha, prev) {
    g.fillStyle = '#3c4a3a'; rrect(g, 0, 0, W, H, 14); g.fill();
    g.fillStyle = 'rgba(255,255,255,.05)';
    for (let x = 0; x < W; x += 40) g.fillRect(x, 0, 1, H);
    for (let y = 0; y < H; y += 40) g.fillRect(0, y, W, 1);
    g.fillStyle = '#7b8794';
    for (const [x, y, w, h] of WALLS) { rrect(g, x, y, w, h, 4); g.fill(); }
    const ps = this.ctx.players;
    ps.forEach((p, i) => {
      const c = snap.p[i], pv = prev && prev.p ? prev.p[i] : null;
      if (!c[4]) return;
      const x = pv ? pv[0] + (c[0] - pv[0]) * alpha : c[0], y = pv ? pv[1] + (c[1] - pv[1]) * alpha : c[1];
      g.save(); g.translate(x, y); g.rotate(c[2]);
      g.fillStyle = c[5] ? '#fff' : p.colorHex;
      rrect(g, -TR, -TR + 2, TR * 2, TR * 2 - 4, 5); g.fill();
      g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(-TR, -TR + 2, TR * 2, 4); g.fillRect(-TR, TR - 6, TR * 2, 4);
      g.fillStyle = '#2b2b2b'; g.fillRect(0, -3, TR + 6, 6);
      g.restore();
      text(g, p.avatar, x, y, { size: 13 });
      for (let h = 0; h < HP; h++) { g.fillStyle = h < c[3] ? '#ff4d6d' : 'rgba(0,0,0,.4)'; g.beginPath(); g.arc(x - 8 + h * 8, y - TR - 7, 3, 0, 7); g.fill(); }
      if (p.uid === me) arrowDown(g, x, y - TR - 18, '#ffe14d', 5);
    });
    g.fillStyle = '#ffe14d';
    for (const b of snap.b) { g.beginPath(); g.arc(b[0], b[1], BR, 0, 7); g.fill(); }
    const myI = ps.findIndex((p) => p.uid === me);
    if (myI >= 0 && snap.p[myI][4]) text(g, snap.p[myI][6] > 0 ? '💥 lädt …' : '💥 bereit', 52, H - 14, { size: 13, color: snap.p[myI][6] > 0 ? 'rgba(255,255,255,.6)' : '#ffe14d' });
    const left = snap.p.filter((c) => c[4]).length;
    text(g, `${left} übrig`, W - 14, H - 14, { size: 13, align: 'right', color: 'rgba(255,255,255,.8)' });
    if (snap.e && left === 1) { const wi = snap.p.findIndex((c) => c[4]); text(g, `${ps[wi].avatar} ${ps[wi].name} gewinnt!`, W / 2, 30, { size: 24, color: '#ffe14d', stroke: 'rgba(0,0,0,.6)', strokeW: 6 }); }
  }
}

export default {
  id: 'panzer', name: 'Panzer-Arena', emoji: '🛡️', category: 'Arena', tags: ['chaos'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'host', controls: 'JOY+BTN', buttons: ['💥'], duration: 60,
  view: { w: W, h: H },
  howTo: ['Fahre mit dem Joystick und schieße mit 💥 in Fahrtrichtung.', 'Jeder hat 3 ❤️. Wer keins mehr hat, ist raus. Hinter Mauern bist du sicher!'],
  wertung: 'Letzter Überlebender gewinnt, danach zählt, wer länger durchgehalten hat. Bei Zeitablauf: meiste Herzen.',
  create: (ctx) => new Panzer(ctx),
};
