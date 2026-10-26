// 🐍 Schlangen-Arena – klassisches Snake für bis zu 6. Steuerung: ◀ ▶ drehen die Schlange.
import { text, rrect, arrowDown } from '../core/draw.js';
import { rankSurvival } from '../core/gamekit.js';
import { botParams } from '../core/bots.js';
import { shuffle } from '../core/util.js';

const GW = 28, GH = 17, K = 20;                // Raster 28×17, Zellen 20 px → 560×340
const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0];  // 0=hoch 1=rechts 2=runter 3=links

class Schlangen {
  constructor(ctx) {
    this.ctx = ctx;
    this.t = 0; this.acc = 0; this.running = false; this.step = 0.17; this.endAt = null;
    this.out = {}; this.st = {}; this.bots = {};
    const n = ctx.players.length;
    const starts = [[3, 3, 1], [GW - 4, GH - 4, 3], [GW - 4, 3, 3], [3, GH - 4, 1], [GW >> 1, 2, 2], [GW >> 1, GH - 3, 0]];
    ctx.players.forEach((p, i) => {
      const [x, y, d] = starts[i];
      this.st[p.uid] = { body: [[x, y], [x - DX[d], y - DY[d]], [x - 2 * DX[d], y - 2 * DY[d]]], dir: d, alive: true, grow: 0, lc: 0, rc: 0, q: [], eaten: 0 };
    });
    this.food = [];
    for (let i = 0; i < 2 + n; i++) this.spawnFood();
  }
  start() { this.running = true; }
  occupied(x, y, skipTails = false) {
    for (const p of this.ctx.players) {
      const s = this.st[p.uid];
      if (!s.alive) continue;
      const lim = skipTails && !s.grow ? s.body.length - 1 : s.body.length;
      for (let i = 0; i < lim; i++) if (s.body[i][0] === x && s.body[i][1] === y) return true;
    }
    return false;
  }
  spawnFood() {
    for (let g = 0; g < 80; g++) {
      const x = Math.floor(Math.random() * GW), y = Math.floor(Math.random() * GH);
      if (!this.occupied(x, y) && !this.food.some((f) => f[0] === x && f[1] === y)) { this.food.push([x, y]); return; }
    }
  }
  onInput(uid, input) {
    const s = this.st[uid];
    if (!s || !s.alive) return;
    const lc = input.lc | 0, rc = input.rc | 0;
    if (lc > s.lc) { s.q.push(-1); s.lc = lc; }
    if (rc > s.rc) { s.q.push(1); s.rc = rc; }
    if (s.q.length > 2) s.q = s.q.slice(-2);
  }
  alivePlayers() { return this.ctx.players.filter((p) => this.st[p.uid].alive); }
  update(dt) {
    if (!this.running) return;
    this.t += dt;
    this.acc += dt;
    const step = Math.max(0.09, this.step - Math.floor(this.t / 12) * 0.012);
    while (this.acc >= step) { this.acc -= step; this.stepOnce(); }
  }
  stepOnce() {
    const al = this.alivePlayers();
    const heads = {};
    for (const p of al) {
      const s = this.st[p.uid];
      const turn = s.q.shift() || 0;
      s.dir = (s.dir + turn + 4) % 4;
      heads[p.uid] = [s.body[0][0] + DX[s.dir], s.body[0][1] + DY[s.dir]];
    }
    const dead = new Set();
    for (const p of al) {
      const [x, y] = heads[p.uid];
      if (x < 0 || y < 0 || x >= GW || y >= GH) { dead.add(p.uid); continue; }
      if (this.occupied(x, y, true)) dead.add(p.uid);
      for (const q of al) if (q.uid !== p.uid && heads[q.uid][0] === x && heads[q.uid][1] === y) dead.add(p.uid); // Kopf an Kopf
    }
    for (const p of al) {
      const s = this.st[p.uid];
      if (dead.has(p.uid)) continue;
      const h = heads[p.uid];
      s.body.unshift(h);
      const fi = this.food.findIndex((f) => f[0] === h[0] && f[1] === h[1]);
      if (fi >= 0) { this.food.splice(fi, 1); s.grow += 2; s.eaten++; this.spawnFood(); if (p.uid === this.ctx.me) this.ctx.sfx('coin'); }
      if (s.grow > 0) s.grow--; else s.body.pop();
    }
    for (const uid of dead) {
      const s = this.st[uid];
      s.alive = false; this.out[uid] = this.t; s.body = [];
      if (uid === this.ctx.me) { this.ctx.sfx('fall'); this.ctx.vibrate(150); }
    }
    if (this.endAt == null && this.alivePlayers().length <= 1) this.endAt = this.t;
  }
  isFinished() { return this.endAt != null && this.t >= this.endAt + 1.0; }
  isOut(uid) { return this.st[uid] ? !this.st[uid].alive : false; }
  snapshot() {
    return {
      t: Math.round(this.t * 10) / 10, e: this.endAt != null ? 1 : 0, f: this.food.flat(),
      s: this.ctx.players.map((p) => { const s = this.st[p.uid]; return [s.alive ? 1 : 0, s.dir, s.eaten, ...s.body.flat()]; }),
    };
  }

  // ---- Bot: sucht per Breitensuche den Weg zum nächsten Futter und meidet Hindernisse ----
  botThink(bot, snap, dt) {
    const s = this.st[bot.uid];
    if (!s || !s.alive) return null;
    const b = this.bots[bot.uid] || (this.bots[bot.uid] = { lc: 0, rc: 0, step: -1 });
    const key = s.body[0][0] + ',' + s.body[0][1] + ':' + s.body.length;
    if (b.key === key) return null; // pro Schritt nur einmal entscheiden
    b.key = key;
    const prm = botParams(bot.botLevel);
    const [hx, hy] = s.body[0];
    const blocked = (x, y) => x < 0 || y < 0 || x >= GW || y >= GH || this.occupied(x, y, true);
    const options = [];
    for (let t = -1; t <= 1; t++) {
      const d = (s.dir + t + 4) % 4;
      const nx = hx + DX[d], ny = hy + DY[d];
      if (!blocked(nx, ny)) options.push({ t, d, nx, ny });
    }
    let pick = null;
    if (options.length) {
      if (Math.random() < prm.err * 0.5) pick = options[Math.floor(Math.random() * options.length)];
      else {
        // BFS vom Kopf zu Futter
        const seen = new Map(); const q = [];
        for (const o of options) { seen.set(o.nx + ',' + o.ny, o); q.push([o.nx, o.ny, o]); }
        const foods = new Set(this.food.map((f) => f[0] + ',' + f[1]));
        let found = null;
        for (let qi = 0; qi < q.length && !found; qi++) {
          const [x, y, first] = q[qi];
          if (foods.has(x + ',' + y)) { found = first; break; }
          for (let d = 0; d < 4; d++) {
            const nx = x + DX[d], ny = y + DY[d], k = nx + ',' + ny;
            if (!seen.has(k) && !blocked(nx, ny)) { seen.set(k, first); q.push([nx, ny, first]); }
          }
        }
        // Sackgasse vermeiden: ohne Futter die Option mit dem größten freien Raum nehmen
        pick = found || options.map((o) => ({ o, free: this.floodSize(o.nx, o.ny, blocked) })).sort((a, c) => c.free - a.free)[0].o;
      }
    }
    if (!pick || pick.t === 0) return null;
    if (pick.t < 0) b.lc++; else b.rc++;
    return { lc: b.lc, rc: b.rc };
  }
  floodSize(x, y, blocked) {
    const seen = new Set([x + ',' + y]); const q = [[x, y]];
    for (let i = 0; i < q.length && q.length < 80; i++) {
      for (let d = 0; d < 4; d++) { const nx = q[i][0] + DX[d], ny = q[i][1] + DY[d], k = nx + ',' + ny; if (!seen.has(k) && !blocked(nx, ny)) { seen.add(k); q.push([nx, ny]); } }
    }
    return q.length;
  }

  result() {
    const ranks = rankSurvival(this.ctx.players, this.out, { alive: (p) => this.st[p.uid].body.length, label: (it) => (it.alive ? `Länge ${this.st[it.uid].body.length}` : `raus nach ${Math.round(it.t)} s`) });
    return { ranks };
  }

  render(g, snap, me) {
    const W = GW * K, H = GH * K;
    g.fillStyle = '#16341f'; rrect(g, 0, 0, W, H, 14); g.fill();
    for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { if ((x + y) & 1) { g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(x * K, y * K, K, K); } }
    for (let i = 0; i < snap.f.length; i += 2) text(g, '🍎', snap.f[i] * K + K / 2, snap.f[i + 1] * K + K / 2, { size: 16 });
    const ps = this.ctx.players;
    ps.forEach((p, i) => {
      const a = snap.s[i];
      if (!a || !a[0]) return;
      const cells = [];
      for (let k = 3; k + 1 < a.length; k += 2) cells.push([a[k], a[k + 1]]);
      g.fillStyle = p.colorHex;
      cells.forEach(([x, y], k) => { rrect(g, x * K + 1.5, y * K + 1.5, K - 3, K - 3, k === 0 ? 8 : 5); g.fill(); });
      if (cells[0]) {
        const [hx, hy] = cells[0];
        text(g, p.avatar, hx * K + K / 2, hy * K + K / 2, { size: 15 });
        if (p.uid === me) arrowDown(g, hx * K + K / 2, hy * K - 4, '#ffe14d', 5);
      }
    });
    const left = snap.s.filter((a) => a[0]).length;
    text(g, `${left} übrig`, W - 8, 12, { size: 12, align: 'right', color: 'rgba(255,255,255,.7)' });
    if (snap.e && left === 1) { const wi = snap.s.findIndex((a) => a[0]); text(g, `${ps[wi].avatar} ${ps[wi].name} gewinnt!`, W / 2, H / 2, { size: 26, color: '#ffe14d', stroke: 'rgba(0,0,0,.6)', strokeW: 7 }); }
  }
}

export default {
  id: 'schlangen', name: 'Schlangen-Arena', emoji: '🐍', category: 'Arena', tags: ['chaos'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'host', controls: 'LR', duration: 60,
  view: { w: 560, h: 340 },
  howTo: ['Tippe ◀ oder ▶, um nach links oder rechts abzubiegen.', 'Friss 🍎 und wachse. Wer gegen Wand oder Schlange kracht, ist raus!'],
  wertung: 'Wer zuletzt lebt, gewinnt. Danach zählt, wer länger durchgehalten hat; bei Zeitablauf die längste Schlange.',
  create: (ctx) => new Schlangen(ctx),
};
