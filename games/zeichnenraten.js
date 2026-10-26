// 🖍️ Zeichnen & Raten – einer malt, die anderen raten per Tastatur. Nur mit Menschen!
import { text, rrect, disc } from '../core/draw.js';
import { keyboard } from '../core/widgets.js';
import { drawPad, PALETTE, SIZES } from '../core/drawpad.js';
import { rankByScore } from '../core/gamekit.js';
import { mulberry32, shuffle, clamp } from '../core/util.js';
import { h } from '../core/ui.js';

const W = 460, H = 330, AX = 8, AY = 58, AW = 444, AH = 262, DRAW_T = 34, REVEAL_T = 3.5, MAX_ROUNDS = 3;
const WORDS = ['Haus', 'Baum', 'Sonne', 'Katze', 'Fisch', 'Auto', 'Blume', 'Hund', 'Mond', 'Stern', 'Schiff', 'Flugzeug', 'Fahrrad', 'Apfel', 'Banane', 'Herz', 'Regenbogen', 'Schnecke', 'Schmetterling', 'Elefant',
  'Giraffe', 'Pinguin', 'Krone', 'Schloss', 'Pizza', 'Eis', 'Brille', 'Uhr', 'Regenschirm', 'Gitarre', 'Rakete', 'Drache', 'Roboter', 'Fußball', 'Zahnbürste', 'Kuchen', 'Tisch', 'Berg', 'Wolke', 'Leuchtturm', 'Hase', 'Vogel', 'Schlüssel', 'Ballon'];
export const norm = (s) => String(s).toUpperCase().replace(/Ä/g, 'AE').replace(/Ö/g, 'OE').replace(/Ü/g, 'UE').replace(/ß/g, 'SS').replace(/[^A-Z]/g, '');

class ZeichnenRaten {
  constructor(ctx) {
    this.ctx = ctx; this.running = false; this.t = 0; this.rd = 0; this.ph = 'draw'; this.pt = 0; this.sc = {}; this.ok = {}; this.feed = []; this.n = 0;
    const r = mulberry32(ctx.seed ^ 0x4242);
    this.order = shuffle(ctx.players.map((p) => p.uid), r);
    this.rounds = Math.min(MAX_ROUNDS, ctx.players.length);
    this.words = shuffle(WORDS, r).slice(0, this.rounds);
    ctx.players.forEach((p) => { this.sc[p.uid] = 0; });
    // lokaler Zustand (jedes Gerät)
    this.chan = []; this.strokes = []; this.cur = null; this.pend = []; this.pad = null; this.kb = null; this.lastSnap = null; this.k = 0; this.curRd = 0; this.lastPt = 0;
  }
  drawer() { return this.order[this.rd % this.order.length]; }
  word() { return this.words[this.rd % this.words.length]; }
  start() { this.running = true; }
  // ---------- Host ----------
  onInput(uid, input) {
    if (!this.running || this.ph !== 'draw' || uid === this.drawer() || this.ok[uid] || !this.sc.hasOwnProperty(uid)) return;
    const g = norm(input.g);
    if (!g) return;
    const right = g === norm(this.word());
    this.feed.push([this.ctx.players.findIndex((p) => p.uid === uid), right ? null : String(input.g).slice(0, 14).toUpperCase(), right ? 1 : 0]);
    this.feed = this.feed.slice(-5);
    if (right) {
      this.ok[uid] = true;
      this.sc[uid] += Math.round(clamp(100 - 60 * this.pt / DRAW_T, 40, 100));
      this.sc[this.drawer()] += 25;
      this.ctx.sfx('coin');
      if (this.ctx.players.every((p) => p.uid === this.drawer() || this.ok[p.uid])) { this.ph = 'reveal'; this.pt = 0; }
    }
  }
  update(dt) {
    if (!this.running) return;
    this.pt += dt;
    if (this.ph === 'draw' && this.pt >= DRAW_T) { this.ph = 'reveal'; this.pt = 0; }
    else if (this.ph === 'reveal' && this.pt >= REVEAL_T) {
      this.rd++; this.ok = {}; this.feed = []; this.pt = 0;
      this.ph = this.rd >= this.rounds ? 'over' : 'draw';
    }
  }
  isFinished() { return this.ph === 'over'; }
  hint() {
    const w = this.word().toUpperCase(); const f = this.pt / DRAW_T;
    return w.split('').map((ch, i) => (ch === ' ' ? ' ' : ((f > 0.45 && i === 0) || (f > 0.75 && i === 2 && w.length > 4) ? ch : '_'))).join(' ');
  }
  snapshot() {
    return {
      rd: this.rd, ph: this.ph, d: this.ctx.players.findIndex((p) => p.uid === this.drawer()), tl: Math.ceil(Math.max(0, DRAW_T - this.pt)), hn: this.hint(),
      w: this.ph === 'reveal' ? this.word() : '', sc: this.ctx.players.map((p) => this.sc[p.uid]), ok: this.ctx.players.map((p) => (this.ok[p.uid] ? 1 : 0)), fd: this.feed, n: this.rounds,
    };
  }
  botThink() { return null; }
  result() { return { ranks: rankByScore(this.ctx.players, (p) => this.sc[p.uid], { label: (u, s) => `${s} Punkte` }) }; }

  // ---------- Gerät: Zeichnen ----------
  amDrawer(snap = this.lastSnap) { return !!snap && snap.ph === 'draw' && this.ctx.players[snap.d] && this.ctx.players[snap.d].uid === this.ctx.me; }
  inArea(x, y) { return x >= AX && x <= AX + AW && y >= AY && y <= AY + AH; }
  onPointer(type, x, y) {
    if (!this.amDrawer()) return;
    if (type === 'down' && this.inArea(x, y)) {
      this.cur = { c: this.pad ? this.pad.colorIdx() : 0, w: this.pad ? this.pad.size() : 7, p: [Math.round(x), Math.round(y)] };
    } else if (type === 'move' && this.cur) {
      const p = this.cur.p, lx = p[p.length - 2], ly = p[p.length - 1];
      const cx = clamp(x, AX, AX + AW), cy = clamp(y, AY, AY + AH);
      if (Math.hypot(cx - lx, cy - ly) >= 3 && p.length < 600) p.push(Math.round(cx), Math.round(cy));
    } else if ((type === 'up' || type === 'cancel') && this.cur) {
      const s = this.cur; this.cur = null;
      if (s.p.length < 4) s.p.push(s.p[0] + 1, s.p[1] + 1); // Punkt
      s.k = ++this.k;
      this.pend.push(s);
      this.ctx.push({ t: 's', r: this.curRd, c: s.c, w: s.w, p: s.p, k: s.k });
    }
  }
  undo() { if (this.amDrawer()) this.ctx.push({ t: 'u', r: this.curRd }); }
  clear() { if (this.amDrawer()) this.ctx.push({ t: 'c', r: this.curRd }); }
  onChan(list) {
    this.chan = list;
    this.rebuild();
  }
  rebuild() {
    const out = [];
    const d = this.lastSnap && this.ctx.players[this.lastSnap.d] ? this.ctx.players[this.lastSnap.d].uid : null;
    for (const e of this.chan) {
      if (e.r !== this.curRd || (d && e.u !== d)) continue;
      if (e.t === 's') out.push(e); else if (e.t === 'u') out.pop(); else if (e.t === 'c') out.length = 0;
    }
    this.strokes = out;
    const ks = new Set(out.map((s) => s.k));
    this.pend = this.pend.filter((s) => !ks.has(s.k));
  }
  mountUI(box, api) {
    this.pad = drawPad(box, { onUndo: () => this.undo(), onClear: () => this.clear() });
    this.kbBox = h('div', { class: 'zr-kb' });
    box.appendChild(this.kbBox);
    this.kb = keyboard(this.kbBox, { maxLen: 16, placeholder: 'Was ist das? …', onSubmit: (t) => api.send({ g: t, n: ++this.n }) });
  }
  updateUI(snap, me) {
    if (!snap || !this.pad) return;
    const drawer = this.amDrawer(snap);
    const my = this.ctx.players.findIndex((p) => p.uid === me);
    this.pad.el.style.display = drawer ? '' : 'none';
    this.kbBox.style.display = drawer ? 'none' : '';
    this.kb.setEnabled(snap.ph === 'draw' && my >= 0 && !snap.ok[my]);
  }
  strokePath(g, s, col) {
    g.strokeStyle = col || PALETTE[s.c] || '#111'; g.lineWidth = s.w; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(s.p[0], s.p[1]);
    for (let i = 2; i < s.p.length; i += 2) g.lineTo(s.p[i], s.p[i + 1]);
    g.stroke();
  }
  render(g, snap, me) {
    this.lastSnap = snap;
    if (snap.rd !== this.curRd) { this.curRd = snap.rd; this.pend = []; this.cur = null; this.rebuild(); }
    const ps = this.ctx.players, my = ps.findIndex((p) => p.uid === me), drawer = snap.d;
    g.fillStyle = '#3a3a6b'; rrect(g, 0, 0, W, H, 16); g.fill();
    // Kopf
    const dp = ps[drawer];
    if (dp) { disc(g, 28, 28, 16, dp.colorHex, dp.avatar, { ring: dp.uid === me ? '#ffe14d' : dp.ring }); }
    const amD = my === drawer;
    text(g, snap.ph === 'reveal' ? `Das Wort war: ${snap.w}` : (amD ? `Male: ${this.word().toUpperCase()}` : snap.hn), 60, 22, { size: snap.ph === 'reveal' || amD ? 18 : 20, align: 'left', color: amD ? '#ffe14d' : '#fff' });
    text(g, `Runde ${Math.min(snap.rd + 1, snap.n)}/${snap.n}  ·  ${dp ? dp.name.slice(0, 9) : ''} malt`, 60, 42, { size: 12, align: 'left', color: 'rgba(255,255,255,.7)' });
    text(g, `⏱ ${snap.tl}`, W - 16, 24, { size: 20, align: 'right', color: snap.tl <= 8 ? '#ff7a95' : '#ffe14d' });
    // Zeichenfläche
    g.fillStyle = '#fff'; rrect(g, AX, AY, AW, AH, 10); g.fill();
    g.save(); g.beginPath(); g.rect(AX, AY, AW, AH); g.clip();
    for (const s of this.strokes) this.strokePath(g, s);
    for (const s of this.pend) this.strokePath(g, s);
    if (this.cur) this.strokePath(g, this.cur, PALETTE[this.cur.c]);
    g.restore();
    // Rater-Feed
    snap.fd.forEach((f, i) => {
      const p = ps[f[0]]; if (!p) return;
      const y = AY + 12 + i * 20;
      g.fillStyle = 'rgba(0,0,0,.55)'; rrect(g, AX + 4, y - 9, 168, 18, 8); g.fill();
      text(g, f[2] ? `${p.avatar} ${p.name.slice(0, 8)}: ✓ richtig!` : `${p.avatar} ${p.name.slice(0, 6)}: ${f[1]}`, AX + 10, y, { size: 11, align: 'left', color: f[2] ? '#7dffb0' : '#fff' });
    });
    // Punkte
    ps.forEach((p, i) => { text(g, `${p.avatar}${snap.sc[i]}${snap.ok[i] ? '✓' : ''}`, 12 + i * 72, H - 8, { size: 11, align: 'left', color: p.uid === me ? '#ffe14d' : '#fff' }); });
    if (amD && snap.ph === 'draw' && snap.tl > DRAW_T - 4 && this.strokes.length === 0 && !this.cur) text(g, 'Male auf die weiße Fläche!', AX + AW / 2, AY + AH / 2, { size: 18, color: '#999' });
  }
}

export default {
  id: 'zeichnenraten', name: 'Zeichnen & Raten', emoji: '🖍️', category: 'Party', tags: ['party'],
  min: 3, max: 6, teams: 'none', duel: false, humansOnly: true,
  sync: 'turns', controls: 'DRAW', pointer: true, channel: true, ctlWidth: 0.48, duration: 125,
  view: { w: W, h: H },
  howTo: ['Reihum malt einer ein geheimes Wort – die anderen raten es mit der Tastatur.', 'Wer schneller richtig rät, bekommt mehr Punkte. Der Maler bekommt Punkte für jeden, der es errät.'],
  wertung: 'Die meisten Punkte nach 3 Runden gewinnen. Bots können hier nicht mitspielen.',
  create: (ctx) => new ZeichnenRaten(ctx),
};
