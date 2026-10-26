// 💣 Heiße Bombe – wer die Bombe hat, muss sie durch Berührung weitergeben, bevor sie explodiert.
import { text, disc, arrowDown, nameTag } from '../core/draw.js';
import { rankSurvival } from '../core/gamekit.js';
import { botParams } from '../core/bots.js';
import { clamp, r1, r2, rand } from '../core/util.js';

const W = 560, H = 340, PR = 15, SPEED = 100, FAST = 118, IMMUNE = 1.0;

class Bombe {
  constructor(ctx) {
    this.ctx = ctx; this.t = 0; this.running = false; this.out = {}; this.st = {}; this.bots = {}; this.fuse = 0; this.endAt = null; this.boom = null;
    const n = ctx.players.length;
    ctx.players.forEach((p, i) => {
      const a = (i / n) * Math.PI * 2;
      this.st[p.uid] = { x: W / 2 + Math.cos(a) * 160, y: H / 2 + Math.sin(a) * 100, sx: 0, sy: 0, alive: true, imm: 0 };
    });
    this.holder = ctx.players[Math.floor(ctx.rng() * n)].uid;
    this.newFuse();
  }
  newFuse() { this.fuse = rand(6, 11); }
  start() { this.running = true; }
  onInput(uid, input) { const s = this.st[uid]; if (s && s.alive) { s.sx = clamp(Number(input.x) || 0, -1, 1); s.sy = clamp(Number(input.y) || 0, -1, 1); } }
  alivePlayers() { return this.ctx.players.filter((p) => this.st[p.uid].alive); }
  update(dt) {
    if (!this.running) return;
    this.t += dt;
    if (this.boom) { this.boom.t -= dt; if (this.boom.t <= 0) this.boom = null; }
    const al = this.alivePlayers();
    for (const p of al) {
      const s = this.st[p.uid];
      const len = Math.hypot(s.sx, s.sy);
      const sp = p.uid === this.holder ? FAST : SPEED;
      if (len > 0.12) { const k = Math.min(1, len) / len; s.x = clamp(s.x + s.sx * k * sp * dt, PR, W - PR); s.y = clamp(s.y + s.sy * k * sp * dt, PR, H - PR); }
      s.imm = Math.max(0, s.imm - dt);
    }
    // Berührung: Bombe weitergeben
    if (this.holder && this.endAt == null) {
      const hs = this.st[this.holder];
      for (const p of al) {
        if (p.uid === this.holder) continue;
        const s = this.st[p.uid];
        if (s.imm <= 0 && Math.hypot(s.x - hs.x, s.y - hs.y) < PR * 2) {
          this.holder = p.uid; hs.imm = IMMUNE; s.imm = 0.3;
          if (p.uid === this.ctx.me) { this.ctx.sfx('hit'); this.ctx.vibrate(100); }
          break;
        }
      }
      this.fuse -= dt;
      if (this.fuse <= 0) {
        const hs2 = this.st[this.holder];
        hs2.alive = false; this.out[this.holder] = this.t; this.boom = { x: hs2.x, y: hs2.y, t: 0.7 };
        this.ctx.sfx('fall'); if (this.holder === this.ctx.me) this.ctx.vibrate(200);
        const rest = this.alivePlayers();
        if (rest.length <= 1) { this.endAt = this.t; this.holder = null; }
        else { this.holder = rest[Math.floor(Math.random() * rest.length)].uid; this.st[this.holder].imm = 1.2; this.newFuse(); }
      }
    }
  }
  isFinished() { return this.endAt != null && this.t >= this.endAt + 1.2; }
  isOut(uid) { return this.st[uid] ? !this.st[uid].alive : false; }
  snapshot() {
    return {
      t: r1(this.t), e: this.endAt != null ? 1 : 0, h: this.holder ? this.ctx.players.findIndex((p) => p.uid === this.holder) : -1, fz: r1(this.fuse),
      bm: this.boom ? [r1(this.boom.x), r1(this.boom.y)] : null,
      p: this.ctx.players.map((p) => { const s = this.st[p.uid]; return [r1(s.x), r1(s.y), s.alive ? 1 : 0, s.imm > 0 ? 1 : 0]; }),
    };
  }

  botThink(bot, snap, dt) {
    const s = this.st[bot.uid];
    if (!s || !s.alive) return null;
    const prm = botParams(bot.botLevel);
    const b = this.bots[bot.uid] || (this.bots[bot.uid] = { t: 0, x: 0, y: 0 });
    b.t -= dt;
    if (b.t <= 0) {
      b.t = prm.react * (0.5 + Math.random() * 0.6);
      const hold = this.holder === bot.uid;
      let tx, ty, best = hold ? 1e9 : 0;
      if (hold) { // jagen: nächsten Gegner ohne Schutz
        for (const p of this.alivePlayers()) { if (p.uid === bot.uid) continue; const o = this.st[p.uid]; const d = Math.hypot(o.x - s.x, o.y - s.y) + (o.imm > 0 ? 80 : 0); if (d < best) { best = d; tx = o.x; ty = o.y; } }
      } else if (this.holder) { // fliehen: weg vom Bombenträger, zur Mitte hin gedreht, damit man nicht in Ecken sitzt
        const h = this.st[this.holder];
        tx = s.x + (s.x - h.x) * 2 + (W / 2 - s.x) * 0.6; ty = s.y + (s.y - h.y) * 2 + (H / 2 - s.y) * 0.6;
      } else { tx = W / 2; ty = H / 2; }
      let dx = (tx ?? W / 2) - s.x, dy = (ty ?? H / 2) - s.y; const l = Math.hypot(dx, dy) || 1;
      dx /= l; dy /= l;
      const jit = (1 - prm.aim) * (Math.random() - 0.5) * 1.5;
      b.x = r2(dx * Math.cos(jit) - dy * Math.sin(jit)); b.y = r2(dx * Math.sin(jit) + dy * Math.cos(jit));
    }
    return { x: b.x, y: b.y };
  }

  result() { return { ranks: rankSurvival(this.ctx.players, this.out) }; }

  render(g, snap, me, alpha, prev) {
    g.fillStyle = '#4a2a52'; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.06)';
    for (let y = 0; y < H; y += 34) g.fillRect(0, y, W, 17);
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 4; g.strokeRect(2, 2, W - 4, H - 4);
    const ps = this.ctx.players;
    ps.forEach((p, i) => {
      const c = snap.p[i], pv = prev && prev.p ? prev.p[i] : null;
      if (!c[2]) return;
      const x = pv ? pv[0] + (c[0] - pv[0]) * alpha : c[0], y = pv ? pv[1] + (c[1] - pv[1]) * alpha : c[1];
      disc(g, x, y, PR, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : p.ring, alpha: c[3] ? 0.55 : 1 });
      nameTag(g, p.name, x, y + PR + 11, { me: p.uid === me });
      if (snap.h === i) {
        const wob = Math.sin(performance.now() / 60) * 2;
        text(g, '💣', x + wob, y - PR - 14, { size: 26 });
        const lvl = Math.max(0, Math.min(1, snap.fz / 11));
        g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(x - 18, y - PR - 34, 36, 5); g.fillStyle = lvl < 0.3 ? '#ff4d6d' : '#ffd23f'; g.fillRect(x - 18, y - PR - 34, 36 * lvl, 5);
      }
      if (p.uid === me && snap.h !== i) arrowDown(g, x, y - PR - 8, '#ffe14d', 5);
    });
    if (snap.bm) { text(g, '💥', snap.bm[0], snap.bm[1], { size: 54 }); }
    if (snap.h === ps.findIndex((p) => p.uid === me) && snap.h >= 0) text(g, 'Du hast die Bombe! Fang jemanden!', W / 2, 24, { size: 18, color: '#ffe14d', stroke: 'rgba(0,0,0,.6)', strokeW: 5 });
    const left = snap.p.filter((c) => c[2]).length;
    if (snap.e && left === 1) { const wi = snap.p.findIndex((c) => c[2]); text(g, `${ps[wi].avatar} ${ps[wi].name} gewinnt!`, W / 2, H / 2, { size: 26, color: '#ffe14d', stroke: 'rgba(0,0,0,.6)', strokeW: 7 }); }
  }
}

export default {
  id: 'bombe', name: 'Heiße Bombe', emoji: '💣', category: 'Arena', tags: ['chaos', 'party'],
  min: 2, max: 6, teams: 'none', duel: false, humansOnly: false,
  sync: 'host', controls: 'JOY', duration: 60,
  view: { w: W, h: H },
  howTo: ['Wer die 💣 hat, jagt die anderen – eine Berührung gibt sie weiter.', 'Nach ein paar Sekunden explodiert sie beim Träger. Der ist raus!'],
  wertung: 'Wer zuletzt übrig bleibt, gewinnt; sonst zählt, wer länger durchgehalten hat.',
  create: (ctx) => new Bombe(ctx),
};
