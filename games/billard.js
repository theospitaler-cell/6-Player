// 🎱 Billard – Duell, abwechselnd. Ziehen & loslassen (wie eine Schleuder) zum Stoßen. Jede versenkte Kugel = 1 Punkt.
import { text, rrect, disc } from '../core/draw.js';
import { AimDrag, drawAim } from '../core/aim.js';
import { botParams } from '../core/bots.js';
import { gauss, r1, r2, clamp } from '../core/util.js';

const W = 560, H = 340;
const L = 30, T = 30, R = 530, B = 310, BR = 9, FRIC = 0.55;
const POCKETS = [[L, T, 17], [R, T, 17], [L, B, 17], [R, B, 17], [280, T - 3, 15], [280, B + 3, 15]];
const COLORS = ['#fff', '#ffd23f', '#3d8bff', '#ff4d6d', '#8a4fff', '#ff8a3d', '#2fd67b', '#a52a2a', '#222', '#ffd23f'];
const TURN_TIME = 22;

class Billard {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.running = false; this.over = false;
    this.turn = ctx.rng() < 0.5 ? 0 : 1; this.sc = [0, 0]; this.tl = TURN_TIME; this.moving = false; this.shot = null; this.msg = '';
    this.bots = {}; this.cnt = 0; this.aim = new AimDrag({ maxPull: 110, minPull: 14 }); this.lastSnap = null; this.endT = 0;
    this.balls = [{ x: 150, y: H / 2, vx: 0, vy: 0, alive: true }];
    // Raute aus 9 Kugeln
    const rows = [1, 2, 3, 2, 1];
    let n = 1;
    rows.forEach((cnt, ri) => {
      for (let k = 0; k < cnt; k++) this.balls.push({ x: 360 + ri * (BR * 1.75), y: H / 2 + (k - (cnt - 1) / 2) * (BR * 2.05), vx: 0, vy: 0, alive: true, n: n++ });
    });
  }
  start() { this.running = true; this.tl = TURN_TIME; }
  playerAt(i) { return this.ctx.players[i]; }
  myTurnUid() { return this.playerAt(this.turn).uid; }
  onInput(uid, input) {
    if (!this.running || this.over || this.moving || uid !== this.myTurnUid()) return;
    this.takeShot(Number(input.ax), Number(input.ay), Number(input.pw));
  }
  takeShot(ax, ay, pw) {
    const l = Math.hypot(ax, ay);
    if (!Number.isFinite(l) || l < 1e-6) return;
    const cue = this.balls[0];
    const sp = 90 + clamp(Number.isFinite(pw) ? pw : 0.5, 0.05, 1) * 700;
    cue.vx = ax / l * sp; cue.vy = ay / l * sp;
    this.moving = true; this.shot = { potted: [], scratch: false }; this.ctx.sfx('hit');
  }
  update(dt) {
    if (!this.running) return;
    this.t += dt;
    if (this.over) { return; }
    if (!this.moving) {
      this.tl -= dt;
      if (this.tl <= 0) { // Zeit um → Zufallsstoß Richtung nächste Kugel
        const cue = this.balls[0];
        const o = this.balls.filter((b, i) => i > 0 && b.alive);
        const tgt = o[Math.floor(Math.random() * o.length)] || { x: W / 2, y: H / 2 };
        this.takeShot(tgt.x - cue.x, tgt.y - cue.y, 0.45);
      }
      return;
    }
    const sub = 3, h = dt / sub;
    for (let s = 0; s < sub; s++) this.step(h);
    const still = this.balls.every((b) => !b.alive || (Math.abs(b.vx) < 3 && Math.abs(b.vy) < 3));
    if (still) {
      for (const b of this.balls) { b.vx = b.vy = 0; }
      this.moving = false;
      this.resolveShot();
    }
  }
  step(dt) {
    const bs = this.balls;
    for (const b of bs) {
      if (!b.alive) continue;
      b.x += b.vx * dt; b.y += b.vy * dt;
      const f = Math.exp(-FRIC * dt); b.vx *= f; b.vy *= f;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp < 8) { b.vx *= 0.9; b.vy *= 0.9; }
      // Taschen
      for (const [px, py, pr] of POCKETS) {
        if (Math.hypot(b.x - px, b.y - py) < pr) { b.alive = false; b.vx = b.vy = 0; this.shot && this.shot.potted.push(b === bs[0] ? 0 : b.n); this.ctx.sfx('coin'); break; }
      }
      if (!b.alive) continue;
      if (b.x < L + BR) { b.x = L + BR; b.vx = Math.abs(b.vx) * 0.88; }
      if (b.x > R - BR) { b.x = R - BR; b.vx = -Math.abs(b.vx) * 0.88; }
      if (b.y < T + BR) { b.y = T + BR; b.vy = Math.abs(b.vy) * 0.88; }
      if (b.y > B - BR) { b.y = B - BR; b.vy = -Math.abs(b.vy) * 0.88; }
    }
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], c = bs[j];
      if (!a.alive || !c.alive) continue;
      let dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy);
      if (d >= BR * 2) continue;
      if (d < 1e-4) { dx = 1; dy = 0; d = 1; }
      const nx = dx / d, ny = dy / d, o = (BR * 2 - d) / 2;
      a.x -= nx * o; a.y -= ny * o; c.x += nx * o; c.y += ny * o;
      const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
      if (rel < 0) { a.vx += rel * nx; a.vy += rel * ny; c.vx -= rel * nx; c.vy -= rel * ny; }
    }
  }
  resolveShot() {
    const shot = this.shot || { potted: [] };
    this.shot = null;
    const objs = shot.potted.filter((n) => n !== 0);
    const scratch = shot.potted.includes(0);
    this.sc[this.turn] += objs.length;
    if (scratch) { // Weiße zurück auf den Anstoßpunkt
      const w = this.balls[0]; w.alive = true; w.x = 150; w.y = H / 2; w.vx = w.vy = 0;
      for (let k = 0; k < 8 && this.balls.some((b, i) => i > 0 && b.alive && Math.hypot(b.x - w.x, b.y - w.y) < BR * 2); k++) w.x -= BR * 2.2;
      this.msg = 'Foul! Weiße versenkt';
    } else this.msg = objs.length ? `+${objs.length} 🎱` : '';
    if (!this.balls.some((b, i) => i > 0 && b.alive)) { this.over = true; this.endT = this.t; return; }
    if (scratch || !objs.length) this.turn = 1 - this.turn;
    this.tl = TURN_TIME;
  }
  isFinished() { return this.over && this.t > this.endT + 1.2; }
  snapshot() {
    return {
      t: r1(this.t), turn: this.turn, sc: this.sc.slice(), mv: this.moving ? 1 : 0, tl: Math.ceil(Math.max(0, this.tl)), o: this.over ? 1 : 0, m: this.msg,
      b: this.balls.flatMap((b) => [r1(b.x), r1(b.y), b.alive ? 1 : 0]),
    };
  }

  // ---- Bot ----
  botThink(bot, snap, dt) {
    if (this.over || this.moving || this.myTurnUid() !== bot.uid) { delete this.bots[bot.uid]; return null; }
    const prm = botParams(bot.botLevel);
    const st = this.bots[bot.uid] || (this.bots[bot.uid] = { wait: 0.9 + Math.random() * 1.4 * (1.2 - prm.speed) });
    st.wait -= dt;
    if (st.wait > 0) return null;
    delete this.bots[bot.uid];
    const cue = this.balls[0];
    const targets = this.balls.filter((b, i) => i > 0 && b.alive);
    let best = null, bestS = 1e9;
    const blocked = (ax, ay, bx, by, skip) => {
      const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
      return this.balls.some((o, i) => {
        if (!o.alive || i === 0 || o === skip) return false;
        const t = clamp(((o.x - ax) * dx + (o.y - ay) * dy) / l2, 0, 1);
        return Math.hypot(ax + dx * t - o.x, ay + dy * t - o.y) < BR * 2 - 1;
      });
    };
    for (const b of targets) for (const [px, py] of POCKETS) {
      const bx = px - b.x, by = py - b.y, bl = Math.hypot(bx, by) || 1;
      const gx = b.x - bx / bl * BR * 2, gy = b.y - by / bl * BR * 2;
      const cx = gx - cue.x, cy = gy - cue.y, cl = Math.hypot(cx, cy) || 1;
      const dot = (cx / cl) * (bx / bl) + (cy / cl) * (by / bl);
      if (dot < 0.25) continue;
      if (blocked(cue.x, cue.y, gx, gy, b) || blocked(b.x, b.y, px, py, b)) continue;
      const s = cl + bl * 0.6 + (1 - dot) * 260;
      if (s < bestS) { bestS = s; best = { gx, gy, dist: cl + bl }; }
    }
    let ax, ay, pw;
    if (best) { ax = best.gx - cue.x; ay = best.gy - cue.y; pw = clamp(0.3 + best.dist / 650, 0.35, 0.95); }
    else { const t = targets[Math.floor(Math.random() * targets.length)] || { x: W / 2, y: H / 2 }; ax = t.x - cue.x; ay = t.y - cue.y; pw = 0.5 + Math.random() * 0.3; }
    const ang = Math.atan2(ay, ax) + gauss() * (1 - prm.aim) * 0.1;
    return { ax: Math.cos(ang), ay: Math.sin(ang), pw: r2(pw), n: ++this.cnt };
  }

  result() {
    const [a, b] = this.ctx.players;
    const lab = (u) => `${this.sc[u]} Kugeln`;
    if (this.sc[0] === this.sc[1]) return { ranks: [{ uid: a.uid, rank: 1, value: this.sc[0], label: lab(0) }, { uid: b.uid, rank: 1, value: this.sc[1], label: lab(1) }] };
    const w = this.sc[0] > this.sc[1] ? 0 : 1;
    const ws = this.ctx.players[w], ls = this.ctx.players[1 - w];
    return { ranks: [{ uid: ws.uid, rank: 1, value: this.sc[w], label: lab(w) }, { uid: ls.uid, rank: 2, value: this.sc[1 - w], label: lab(1 - w) }] };
  }

  // ---- Eingabe: ziehen & loslassen ----
  canShoot() {
    const s = this.lastSnap;
    if (!s || s.o || s.mv) return false;
    const myI = this.ctx.players.findIndex((p) => p.uid === this.ctx.me);
    return myI >= 0 && s.turn === myI;
  }
  onPointer(type, x, y) {
    if (type === 'down') { if (this.canShoot()) this.aim.down(x, y); }
    else if (type === 'move') this.aim.move(x, y);
    else if (type === 'up') {
      const v = this.aim.up(x, y);
      if (v && this.canShoot()) this.ctx.send({ ax: v.dx, ay: v.dy, pw: Math.round(v.power * 100) / 100, n: ++this.cnt });
    } else this.aim.cancel();
  }

  render(g, snap, me, alpha, prev) {
    this.lastSnap = snap;
    const ps = this.ctx.players;
    g.fillStyle = '#5b3a1e'; rrect(g, 0, 0, W, H, 18); g.fill();
    g.fillStyle = '#1c7a45'; rrect(g, L - 6, T - 6, R - L + 12, B - T + 12, 10); g.fill();
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.arc(150, H / 2, 3, 0, 7); g.fill(); g.fillRect(150 - 0.5, T, 1, B - T);
    g.fillStyle = '#0b0b0b';
    for (const [px, py, pr] of POCKETS) { g.beginPath(); g.arc(px, py, pr, 0, 7); g.fill(); }
    const pb = prev && prev.b;
    for (let i = 9; i >= 0; i--) {
      const alive = snap.b[i * 3 + 2];
      if (!alive) continue;
      const x = pb ? pb[i * 3] + (snap.b[i * 3] - pb[i * 3]) * alpha : snap.b[i * 3], y = pb ? pb[i * 3 + 1] + (snap.b[i * 3 + 1] - pb[i * 3 + 1]) * alpha : snap.b[i * 3 + 1];
      g.fillStyle = 'rgba(0,0,0,.3)'; g.beginPath(); g.arc(x + 2, y + 3, BR, 0, 7); g.fill();
      g.fillStyle = COLORS[i]; g.beginPath(); g.arc(x, y, BR, 0, 7); g.fill();
      if (i === 9) { g.fillStyle = '#fff'; g.fillRect(x - BR, y - 3, BR * 2, 6); }
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.stroke();
      if (i > 0) { g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 4.2, 0, 7); g.fill(); text(g, String(i), x, y + 0.5, { size: 7, color: '#111' }); }
      else { g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(x - 2.5, y - 2.5, 2, 0, 7); g.fill(); }
    }
    if (this.aim.active && this.canShoot()) drawAim(g, this.aim, '#ffe14d', snap.b[0], snap.b[1]);
    // Kopfzeile
    ps.forEach((p, i) => {
      const act = !snap.o && snap.turn === i;
      const x = i === 0 ? 12 : W - 12;
      if (act) { g.fillStyle = 'rgba(255,225,77,.3)'; rrect(g, i === 0 ? 4 : W - 150, 2, 146, 24, 10); g.fill(); }
      text(g, `${p.avatar} ${p.name.slice(0, 8)}  ${snap.sc[i]}`, x, 14, { size: 14, align: i === 0 ? 'left' : 'right', color: p.uid === me ? '#ffe14d' : '#fff' });
    });
    const myI = ps.findIndex((p) => p.uid === me);
    let msg = '';
    if (snap.o) msg = snap.sc[0] === snap.sc[1] ? 'Unentschieden!' : `${ps[snap.sc[0] > snap.sc[1] ? 0 : 1].name} gewinnt!`;
    else if (snap.mv) msg = snap.m || '';
    else if (myI < 0) msg = `${ps[snap.turn].name} ist dran`;
    else msg = snap.turn === myI ? `Du bist dran (${snap.tl} s) – ziehen & loslassen` : `${ps[snap.turn].name} zielt …`;
    text(g, msg, W / 2, H - 12, { size: 15, color: '#ffe14d', stroke: 'rgba(0,0,0,.55)', strokeW: 4 });
    if (!snap.mv && snap.m && !snap.o) text(g, snap.m, W / 2, 14, { size: 14, color: '#fff' });
  }
}

export default {
  id: 'billard', name: 'Billard', emoji: '🎱', category: 'Sport', tags: ['brett', 'sport'],
  min: 2, max: 2, teams: 'none', duel: true, humansOnly: false,
  sync: 'turns', controls: 'AIM', pointer: true, ctlWidth: 0, duration: 150,
  view: { w: W, h: H },
  howTo: ['Ziehe auf dem Tisch nach hinten und lass los – wie bei einer Schleuder. Je weiter, desto stärker!', 'Jede versenkte Kugel gibt 1 Punkt und noch einen Stoß. Die Weiße zu versenken ist ein Foul.'],
  wertung: 'Die meisten versenkten Kugeln gewinnen. Duell-Punkte: Sieger n, Verlierer 1, Zuschauer ⌈n/2⌉.',
  create: (ctx) => new Billard(ctx),
};
