// ✊ Schere-Stein-Papier – Duell, wer zuerst 3 Runden gewinnt. Beide wählen gleichzeitig.
import { text, rrect, disc } from '../core/draw.js';
import { choiceCards } from '../core/widgets.js';
import { botParams } from '../core/bots.js';

const W = 560, H = 330, WIN = 3, PICK_T = 7, REVEAL_T = 2.2;
const ICON = ['✊', '✋', '✌️'], NAME = ['Stein', 'Papier', 'Schere'];
const beats = (a, b) => (a - b + 3) % 3 === 1; // 1 schlägt 0, 2 schlägt 1, 0 schlägt 2

class SSP {
  constructor(ctx) { this.ctx = ctx; this.running = false; this.ph = 'pick'; this.pt = 0; this.sc = [0, 0]; this.pick = [-1, -1]; this.rd = 1; this.last = null; this.over = false; this.bots = {}; this.cards = null; this.n = 0; this.hist = [[], []]; }
  start() { this.running = true; }
  idx(uid) { return this.ctx.players.findIndex((p) => p.uid === uid); }
  onInput(uid, input) {
    if (!this.running || this.ph !== 'pick') return;
    const i = this.idx(uid), c = input.pick | 0;
    if (i < 0 || c < 0 || c > 2 || this.pick[i] !== -1) return;
    this.pick[i] = c;
    if (this.pick[0] !== -1 && this.pick[1] !== -1) this.reveal();
  }
  reveal() {
    for (let i = 0; i < 2; i++) if (this.pick[i] === -1) this.pick[i] = Math.floor(Math.random() * 3);
    const [a, b] = this.pick;
    this.hist[0].push(a); this.hist[1].push(b);
    this.last = { a, b, w: a === b ? -1 : (beats(a, b) ? 0 : 1) };
    if (this.last.w >= 0) this.sc[this.last.w]++;
    this.ph = 'reveal'; this.pt = 0; this.ctx.sfx(this.last.w < 0 ? 'tap' : 'coin');
    if (this.sc[0] >= WIN || this.sc[1] >= WIN) this.over = true;
  }
  update(dt) {
    if (!this.running) return;
    this.pt += dt;
    if (this.ph === 'pick' && this.pt >= PICK_T) this.reveal();
    else if (this.ph === 'reveal' && this.pt >= REVEAL_T && !this.over) { this.ph = 'pick'; this.pt = 0; this.pick = [-1, -1]; this.rd++; this.bots = {}; }
  }
  isFinished() { return this.over && this.ph === 'reveal' && this.pt >= REVEAL_T; }
  snapshot() { return { ph: this.ph, sc: this.sc.slice(), rd: this.rd, tl: Math.ceil(Math.max(0, PICK_T - this.pt)), ch: this.pick.map((p) => (p >= 0 ? 1 : 0)), lr: this.ph === 'reveal' ? this.last : null, o: this.over ? 1 : 0 }; }
  botThink(bot, snap, dt) {
    const i = this.idx(bot.uid);
    if (this.ph !== 'pick' || this.pick[i] !== -1) return null;
    const st = this.bots[bot.uid] || (this.bots[bot.uid] = { wait: 0.8 + Math.random() * 2.2, t: 0 });
    st.t += dt; if (st.t < st.wait) return null;
    const prm = botParams(bot.botLevel);
    let c = Math.floor(Math.random() * 3);
    // schwere Bots kontern die letzte Wahl des Gegners (Menschen wiederholen oft)
    const oh = this.hist[1 - i];
    if (oh.length && Math.random() < prm.aim * 0.45) { const prev = oh[oh.length - 1]; c = (prev + 1) % 3; }
    return { pick: c };
  }
  result() {
    const [a, b] = this.ctx.players;
    if (this.sc[0] === this.sc[1]) return { ranks: [{ uid: a.uid, rank: 1, label: `${this.sc[0]}:${this.sc[1]}` }, { uid: b.uid, rank: 1, label: `${this.sc[1]}:${this.sc[0]}` }] };
    const w = this.sc[0] > this.sc[1] ? 0 : 1, ws = this.ctx.players[w], ls = this.ctx.players[1 - w];
    return { ranks: [{ uid: ws.uid, rank: 1, label: `Sieg ${this.sc[w]}:${this.sc[1 - w]}` }, { uid: ls.uid, rank: 2, label: `Niederlage ${this.sc[1 - w]}:${this.sc[w]}` }] };
  }
  mountUI(box, api) { this.cards = choiceCards(box, ICON.map((e, i) => `${e}  ${NAME[i]}`), (i) => api.send({ pick: i, n: ++this.n }), { cols: 1 }); }
  updateUI(snap, me) { if (this.cards) this.cards.setEnabled(this.running && snap && snap.ph === 'pick' && snap.ch[this.idx(me)] === 0); }
  render(g, snap, me) {
    const ps = this.ctx.players, myIdx = ps.findIndex((p) => p.uid === me);
    g.fillStyle = '#35305f'; rrect(g, 0, 0, W, H, 18); g.fill();
    ps.forEach((p, i) => {
      const x = i === 0 ? 100 : W - 100;
      disc(g, x, 70, 28, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : p.ring });
      text(g, p.name.slice(0, 10), x, 112, { size: 15, color: p.uid === me ? '#ffe14d' : '#fff' });
      text(g, String(snap.sc[i]), x, 150, { size: 38, color: '#ffe14d' });
      const shown = snap.lr ? ICON[i === 0 ? snap.lr.a : snap.lr.b] : (snap.ch[i] ? '✅' : '🤔');
      const win = snap.lr && snap.lr.w === i;
      if (win) { g.fillStyle = 'rgba(47,214,123,.3)'; rrect(g, x - 56, 175, 112, 100, 18); g.fill(); }
      text(g, shown, x, 225, { size: 66 });
    });
    text(g, `Runde ${snap.rd}`, W / 2, 34, { size: 17, color: '#d9c8ff' });
    text(g, `wer zuerst ${WIN} hat`, W / 2, 56, { size: 12, color: 'rgba(255,255,255,.55)' });
    let msg = '';
    if (snap.ph === 'reveal') msg = snap.lr.w < 0 ? 'Unentschieden!' : `${ps[snap.lr.w].name} gewinnt die Runde!`;
    else msg = myIdx < 0 ? 'Beide wählen …' : (snap.ch[myIdx] ? 'Gewählt – warte auf den Gegner …' : `Wähle! ⏱ ${snap.tl}`);
    text(g, msg, W / 2, 140, { size: 19, color: '#ffe14d', stroke: 'rgba(0,0,0,.5)', strokeW: 5 });
    if (snap.o && snap.ph === 'reveal') text(g, snap.sc[0] > snap.sc[1] ? `${ps[0].name} gewinnt!` : `${ps[1].name} gewinnt!`, W / 2, 300, { size: 26, color: '#fff', stroke: '#2f2a58', strokeW: 6 });
  }
}

export default {
  id: 'ssp', name: 'Schere-Stein-Papier', emoji: '✌️', category: 'Brett', tags: ['brett', 'party'],
  min: 2, max: 2, teams: 'none', duel: true, humansOnly: false,
  sync: 'turns', controls: 'PICK', ctlWidth: 0.34, duration: 70,
  view: { w: W, h: H },
  howTo: ['Wähle Stein ✊, Papier ✋ oder Schere ✌️ – beide gleichzeitig.', 'Stein schlägt Schere, Schere schlägt Papier, Papier schlägt Stein. Wer zuerst 3 Runden gewinnt, siegt.'],
  wertung: 'Sieger Platz 1, Verlierer Platz 2. Duell-Punkte: Sieger n, Verlierer 1, Zuschauer ⌈n/2⌉.',
  create: (ctx) => new SSP(ctx),
};
