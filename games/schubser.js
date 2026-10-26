// 🥊 Arena-Schubser – Joystick + Dash. Wer von der schrumpfenden Plattform fliegt, ist raus.
import { text, disc, arrowDown, ip, nameTag } from '../core/draw.js';
import { clamp, r1, r2 } from '../core/util.js';
import { botParams } from '../core/bots.js';

const CX = 280, CY = 180;
const R0 = 158, R1 = 72;       // Plattform-Radius am Anfang / Ende
const SHRINK_START = 6, SHRINK_LEN = 30;
const PR = 16;                 // Spieler-Radius
const ACC = 330, FR = 2.4, DASH = 270, DASH_CD = 2.4;

const radiusAt = (t) => R0 - (R0 - R1) * clamp((t - SHRINK_START) / SHRINK_LEN, 0, 1);

class Schubser {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = 0; this.running = false; this.endAt = null;
    this.st = {}; this.bots = {};
    const n = ctx.players.length;
    ctx.players.forEach((p, i) => {
      const a = (i / n) * Math.PI * 2 - Math.PI / 2;
      this.st[p.uid] = {
        x: CX + Math.cos(a) * R0 * 0.55, y: CY + Math.sin(a) * R0 * 0.55, vx: 0, vy: 0,
        alive: true, elim: 0, cd: 0, sx: 0, sy: 0, b: 0, dashReq: false, dashT: 0, lx: -Math.cos(a), ly: -Math.sin(a),
      };
    });
  }
  start() { this.running = true; }
  onInput(uid, input) {
    const s = this.st[uid];
    if (!s) return;
    s.sx = clamp(Number(input.x) || 0, -1, 1);
    s.sy = clamp(Number(input.y) || 0, -1, 1);
    const b = input.b | 0;
    if (b > s.b) s.dashReq = true;
    s.b = b;
  }
  alive() { return this.ctx.players.filter((p) => this.st[p.uid].alive); }
  update(dt) {
    if (!this.running) return;
    this.t += dt;
    const R = radiusAt(this.t);
    for (const p of this.ctx.players) {
      const s = this.st[p.uid];
      if (!s.alive) { // fällt noch kurz weiter
        s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= 0.96; s.vy *= 0.96;
        continue;
      }
      let ix = s.sx, iy = s.sy;
      const len = Math.hypot(ix, iy);
      if (len > 1) { ix /= len; iy /= len; }
      if (len > 0.15) { s.lx = ix / (len > 1 ? 1 : len); s.ly = iy / (len > 1 ? 1 : len); const l2 = Math.hypot(s.lx, s.ly) || 1; s.lx /= l2; s.ly /= l2; }
      s.vx += ix * ACC * dt; s.vy += iy * ACC * dt;
      if (s.dashReq && s.cd <= 0) {
        s.vx += s.lx * DASH; s.vy += s.ly * DASH; s.cd = DASH_CD; s.dashT = 0.25;
        if (p.uid === this.ctx.me) { this.ctx.sfx('whoosh'); this.ctx.vibrate(25); }
      }
      s.dashReq = false;
      const f = Math.exp(-FR * dt);
      s.vx *= f; s.vy *= f;
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.cd = Math.max(0, s.cd - dt); s.dashT = Math.max(0, s.dashT - dt);
    }
    // Zusammenstöße
    const al = this.alive();
    for (let i = 0; i < al.length; i++) {
      for (let j = i + 1; j < al.length; j++) {
        const a = this.st[al[i].uid], b = this.st[al[j].uid];
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= PR * 2) continue;
        if (d < 0.001) { dx = 1; dy = 0; d = 1; }
        const nx = dx / d, ny = dy / d;
        const overlap = PR * 2 - d;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2; b.y += ny * overlap / 2;
        const vrel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (vrel < 0) {
          const j2 = -(1 + 1.0) * vrel / 2; // elastischer Stoß
          a.vx -= j2 * nx; a.vy -= j2 * ny; b.vx += j2 * nx; b.vy += j2 * ny;
          this.ctx.sfx('hit');
        }
      }
    }
    // Rausfliegen
    for (const p of al) {
      const s = this.st[p.uid];
      if (Math.hypot(s.x - CX, s.y - CY) > R + PR * 0.5) {
        s.alive = false; s.elim = this.t;
        if (p.uid === this.ctx.me) { this.ctx.sfx('fall'); this.ctx.vibrate(150); }
      }
    }
    if (this.endAt == null && this.alive().length <= 1) this.endAt = this.t;
  }
  isFinished() { return this.endAt != null && this.t >= this.endAt + 1.0; }
  isOut(uid) { return this.st[uid] ? !this.st[uid].alive : false; }

  snapshot() {
    return {
      t: r1(this.t), R: r1(radiusAt(this.t)), e: this.endAt != null ? 1 : 0,
      p: this.ctx.players.map((p) => { const s = this.st[p.uid]; return [r1(s.x), r1(s.y), s.alive ? 1 : 0, r1(s.elim), r1(s.cd)]; }),
    };
  }

  botThink(bot, snap, dt) {
    const prm = botParams(bot.botLevel);
    const s = this.st[bot.uid];
    const b = this.bots[bot.uid] || (this.bots[bot.uid] = { t: 0, x: 0, y: 0, db: 0 });
    if (!s || !s.alive) return null;
    b.t -= dt;
    if (b.t <= 0) {
      b.t = prm.react * (0.5 + Math.random() * 0.7);
      const R = radiusAt(this.t);
      const dc = Math.hypot(s.x - CX, s.y - CY);
      const speed = Math.hypot(s.vx, s.vy);
      // Rand in Gefahr? (Abstand zum Rand abzüglich Bremsweg) → zur Mitte steuern
      const danger = R - dc < 34 + speed * 0.45;
      let tx, ty;
      if (danger && Math.random() < 0.45 + prm.aim * 0.55) { tx = CX; ty = CY; }
      else {
        let best = null, bd = 1e9;
        for (const p of this.alive()) {
          if (p.uid === bot.uid) continue;
          const o = this.st[p.uid]; const d = Math.hypot(o.x - s.x, o.y - s.y);
          if (d < bd) { bd = d; best = o; }
        }
        if (best && dc < R * 0.8) {
          // Ziel: Punkt hinter dem Gegner (vom Zentrum aus gesehen) → Stoß nach außen
          const ox = best.x - CX, oy = best.y - CY, ol = Math.hypot(ox, oy) || 1;
          const k = 0.35 * prm.aim;
          tx = best.x + (ox / ol) * 14 * k + best.vx * 0.1 * prm.aim; ty = best.y + (oy / ol) * 14 * k + best.vy * 0.1 * prm.aim;
          if (bd < 55 && s.cd <= 0 && Math.random() < 0.15 + prm.aim * 0.4) b.db++;
        } else { tx = CX; ty = CY; }
      }
      let dx = tx - s.x, dy = ty - s.y; const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const jit = (1 - prm.aim) * 1.0 * (Math.random() - 0.5);
      const c = Math.cos(jit), sn = Math.sin(jit);
      b.x = r2(dx * c - dy * sn); b.y = r2(dx * sn + dy * c);
      if (Math.random() < prm.err * 0.25) { b.x *= -0.5; b.y *= -0.5; } // Patzer
    }
    return { x: b.x, y: b.y, b: b.db };
  }

  result() {
    const items = this.ctx.players.map((p) => { const s = this.st[p.uid]; return { uid: p.uid, alive: s.alive, elim: s.elim, d: Math.hypot(s.x - CX, s.y - CY) }; });
    const cmp = (a, b) => {
      if (a.alive !== b.alive) return a.alive ? -1 : 1;
      if (a.alive) return Math.abs(a.d - b.d) < 3 ? 0 : a.d - b.d;
      return Math.abs(a.elim - b.elim) < 0.05 ? 0 : b.elim - a.elim;
    };
    const sorted = items.map((it, i) => ({ it, i })).sort((x, y) => cmp(x.it, y.it) || x.i - y.i);
    const ranks = [];
    sorted.forEach((s, idx) => {
      const rank = idx === 0 ? 1 : (cmp(sorted[idx - 1].it, s.it) === 0 ? ranks[idx - 1].rank : idx + 1);
      ranks.push({ uid: s.it.uid, rank, value: s.it.alive ? 99 : r1(s.it.elim), label: s.it.alive ? 'Überlebt' : `raus nach ${Math.round(s.it.elim)} s` });
    });
    return { ranks };
  }

  render(g, snap, me, alpha, prev) {
    const W = 560, H = 360;
    const ps = this.ctx.players;
    g.fillStyle = '#2b1f5c'; g.fillRect(0, 0, W, H);
    // Sterne im Hintergrund
    g.fillStyle = 'rgba(255,255,255,.35)';
    for (let i = 0; i < 24; i++) g.fillRect((i * 97) % W, (i * 61) % H, 2, 2);
    const R = ip(prev && prev.R, snap.R, alpha);
    // Plattform
    g.save();
    g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2); g.clip();
    const grad = g.createRadialGradient(CX, CY, 10, CX, CY, R);
    grad.addColorStop(0, '#8be0ff'); grad.addColorStop(1, '#4aa3df');
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 2;
    for (let r = 30; r < R; r += 30) { g.beginPath(); g.arc(CX, CY, r, 0, Math.PI * 2); g.stroke(); }
    g.restore();
    g.lineWidth = 6; g.strokeStyle = '#fff'; g.beginPath(); g.arc(CX, CY, R, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 3; g.strokeStyle = 'rgba(255,90,90,.9)'; g.setLineDash([8, 8]); g.beginPath(); g.arc(CX, CY, R + 6, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
    // Spieler (Lebende oben)
    const order = ps.map((p, i) => i).sort((a, b) => snap.p[a][2] - snap.p[b][2]);
    for (const i of order) {
      const cur = snap.p[i], pv = prev ? prev.p[i] : null;
      const x = ip(pv && pv[0], cur[0], alpha), y = ip(pv && pv[1], cur[1], alpha);
      const p = ps[i];
      const alive = cur[2] === 1;
      let scale = 1, a = 1;
      if (!alive) { const k = clamp((snap.t - cur[3]) / 0.8, 0, 1); scale = 1 - k * 0.8; a = 1 - k; if (a <= 0.02) continue; }
      disc(g, x, y, PR * scale, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : '#fff', alpha: a, shadow: alive });
      if (alive) {
        nameTag(g, p.name, x, y + PR + 11, { me: p.uid === me });
        if (p.uid === me) arrowDown(g, x, y - PR - 8, '#ffe14d', 6);
      }
    }
    const myI = ps.findIndex((p) => p.uid === me);
    if (myI >= 0 && snap.p[myI][2] === 1) {
      const cd = snap.p[myI][4];
      text(g, cd > 0 ? `💨 ${cd.toFixed(1)} s` : '💨 bereit', 60, H - 16, { size: 13, color: cd > 0 ? 'rgba(255,255,255,.6)' : '#ffe14d' });
    }
    const left = snap.p.filter((q) => q[2] === 1).length;
    text(g, `${left} übrig`, W - 14, H - 14, { size: 13, align: 'right', color: 'rgba(255,255,255,.8)' });
    if (snap.e && left === 1) {
      const wi = snap.p.findIndex((q) => q[2] === 1);
      text(g, `${ps[wi].avatar} ${ps[wi].name} gewinnt!`, W / 2, 28, { size: 22, color: '#ffe14d', stroke: 'rgba(0,0,0,.6)', strokeW: 6 });
    }
  }
}

export default {
  id: 'schubser', name: 'Arena-Schubser', emoji: '🥊', category: 'Arena',
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'host', controls: 'JOY+BTN', buttons: ['💨'], duration: 60,
  view: { w: 560, h: 360 },
  howTo: ['Steuere mit dem Daumen und rempel die anderen von der Plattform.', 'Der Dash-Knopf 💨 gibt einen kräftigen Stoß. Die Plattform wird kleiner!'],
  wertung: 'Wer zuletzt auf der Plattform steht, gewinnt. Danach zählt, wer länger durchgehalten hat.',
  create: (ctx) => new Schubser(ctx),
};
