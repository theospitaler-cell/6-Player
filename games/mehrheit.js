// 🗳️ Mehrheit – „Was würden die meisten wählen?“ Wer mit der Mehrheit liegt, bekommt Punkte. Nur mit Menschen!
import { text, rrect, disc } from '../core/draw.js';
import { choiceCards } from '../core/widgets.js';
import { rankByScore } from '../core/gamekit.js';
import { mulberry32, shuffle } from '../core/util.js';

const W = 560, H = 330, ROUNDS = 6, PICK_T = 11, REVEAL_T = 4.5;
const QS = [
  ['Lieblingstier?', ['Hund', 'Katze', 'Pferd', 'Hase']], ['Beste Pizza?', ['Salami', 'Margherita', 'Hawaii', 'Thunfisch']],
  ['Lieblings-Jahreszeit?', ['Frühling', 'Sommer', 'Herbst', 'Winter']], ['Frühstück am liebsten?', ['Müsli', 'Brötchen', 'Pfannkuchen', 'Joghurt']],
  ['Lieblingsfarbe?', ['Rot', 'Blau', 'Grün', 'Gelb']], ['Wohin in den Urlaub?', ['Strand', 'Berge', 'Stadt', 'Zuhause bleiben']],
  ['Bestes Eis?', ['Schoko', 'Erdbeere', 'Vanille', 'Zitrone']], ['Welches Spiel macht am meisten Spaß?', ['Fußball', 'Verstecken', 'Brettspiel', 'Videospiel']],
  ['Lieblings-Süßigkeit?', ['Gummibärchen', 'Schokolade', 'Lakritz', 'Kaugummi']], ['Welche Superkraft wäre am besten?', ['Fliegen', 'Unsichtbar sein', 'Gedanken lesen', 'Superstark sein']],
  ['Was trinkt man am liebsten?', ['Wasser', 'Apfelschorle', 'Cola', 'Saft']], ['Lieblingsfach?', ['Mathe', 'Sport', 'Kunst', 'Musik']],
  ['Welches Haustier wäre das beste?', ['Hund', 'Katze', 'Papagei', 'Goldfisch']], ['Was isst man am liebsten?', ['Nudeln', 'Pommes', 'Burger', 'Salat']],
  ['Was macht man am Wochenende am liebsten?', ['Ausschlafen', 'Ausflug', 'Freunde treffen', 'Zocken']], ['Welche Filmart ist die beste?', ['Komödie', 'Action', 'Zeichentrick', 'Gruselfilm']],
  ['Schönster Ort?', ['Wald', 'Meer', 'Berge', 'Stadt']], ['Am liebsten unterwegs mit …', ['Fahrrad', 'Auto', 'Zug', 'zu Fuß']],
  ['Was darf auf keiner Party fehlen?', ['Musik', 'Essen', 'Spiele', 'Tanzen']], ['Welche Tageszeit ist die beste?', ['Morgen', 'Mittag', 'Abend', 'Nacht']],
];

class Mehrheit {
  constructor(ctx) {
    this.ctx = ctx; this.running = false; this.ph = 'pick'; this.pt = 0; this.rd = 0; this.sc = {}; this.picks = {}; this.res = null; this.cards = null; this.n = 0;
    this.order = shuffle(QS.map((_, i) => i), mulberry32(ctx.seed ^ 0x51ed));
    ctx.players.forEach((p) => { this.sc[p.uid] = 0; });
  }
  start() { this.running = true; }
  q() { return QS[this.order[this.rd % this.order.length]]; }
  onInput(uid, input) {
    if (!this.running || this.ph !== 'pick' || this.picks[uid] != null || !this.sc.hasOwnProperty(uid)) return;
    const c = input.pick | 0;
    if (c < 0 || c > 3) return;
    this.picks[uid] = c;
    if (this.ctx.players.every((p) => this.picks[p.uid] != null)) this.reveal();
  }
  reveal() {
    const cnt = [0, 0, 0, 0];
    for (const p of this.ctx.players) if (this.picks[p.uid] != null) cnt[this.picks[p.uid]]++;
    const max = Math.max(...cnt), winners = cnt.map((c, i) => (c === max && c > 0 ? i : -1)).filter((i) => i >= 0);
    const bonus = winners.length === 1 ? 2 : 1;
    for (const p of this.ctx.players) if (winners.includes(this.picks[p.uid])) this.sc[p.uid] += bonus;
    this.res = { cnt, win: winners, pk: this.ctx.players.map((p) => (this.picks[p.uid] != null ? this.picks[p.uid] : -1)) };
    this.ph = 'reveal'; this.pt = 0; this.ctx.sfx('win');
  }
  update(dt) {
    if (!this.running) return;
    this.pt += dt;
    if (this.ph === 'pick' && this.pt >= PICK_T) this.reveal();
    else if (this.ph === 'reveal' && this.pt >= REVEAL_T) { this.rd++; this.ph = this.rd >= ROUNDS ? 'over' : 'pick'; this.pt = 0; this.picks = {}; this.res = null; }
  }
  isFinished() { return this.ph === 'over'; }
  snapshot() {
    const [q, o] = this.q();
    return { ph: this.ph, rd: this.rd, q, o, tl: Math.ceil(Math.max(0, PICK_T - this.pt)), ch: this.ctx.players.map((p) => (this.picks[p.uid] != null ? 1 : 0)), res: this.res, sc: this.ctx.players.map((p) => this.sc[p.uid]) };
  }
  botThink() { return null; }
  result() { return { ranks: rankByScore(this.ctx.players, (p) => this.sc[p.uid], { label: (u, s) => `${s} Punkte` }) }; }
  mountUI(box, api) { this.cards = choiceCards(box, ['', '', '', ''], (i) => api.send({ pick: i, n: ++this.n }), { cols: 1 }); this.lastRd = -1; }
  updateUI(snap, me) {
    if (!this.cards || !snap) return;
    if (this.lastRd !== snap.rd) { this.lastRd = snap.rd; this.cards.setLabels(snap.o); }
    const mi = this.ctx.players.findIndex((p) => p.uid === me);
    this.cards.setEnabled(snap.ph === 'pick' && mi >= 0 && snap.ch[mi] === 0);
  }
  render(g, snap, me) {
    const ps = this.ctx.players, mi = ps.findIndex((p) => p.uid === me);
    g.fillStyle = '#3b2a5f'; rrect(g, 0, 0, W, H, 18); g.fill();
    text(g, `Frage ${Math.min(snap.rd + 1, ROUNDS)} / ${ROUNDS}`, W / 2, 20, { size: 14, color: '#d9c8ff' });
    text(g, snap.q, W / 2, 56, { size: 24, color: '#fff' });
    text(g, 'Was würden die MEISTEN wählen?', W / 2, 82, { size: 14, color: '#ffe14d' });
    // Spielerreihe: wer hat schon gewählt
    ps.forEach((p, i) => {
      const x = 50 + i * (W - 100) / Math.max(1, ps.length - 1 || 1) * (ps.length > 1 ? 1 : 0) + (ps.length === 1 ? W / 2 - 50 : 0);
      disc(g, x, 140, 20, p.colorHex, p.avatar, { ring: p.uid === me ? '#ffe14d' : p.ring, alpha: snap.ph === 'pick' && !snap.ch[i] ? 0.6 : 1 });
      text(g, snap.ph === 'pick' ? (snap.ch[i] ? '✅' : '…') : (snap.res && snap.res.pk[i] >= 0 ? snap.o[snap.res.pk[i]].slice(0, 9) : '–'), x, 176, { size: 12, color: '#fff' });
      text(g, `${snap.sc[i]} P`, x, 194, { size: 13, color: '#ffe14d' });
    });
    if (snap.ph === 'reveal' && snap.res) {
      snap.o.forEach((t, k) => {
        const y = 220 + k * 24, w = 260 * (snap.res.cnt[k] / Math.max(1, ps.length));
        g.fillStyle = 'rgba(0,0,0,.35)'; rrect(g, 150, y - 8, 260, 16, 8); g.fill();
        g.fillStyle = snap.res.win.includes(k) ? '#2fd67b' : '#7b3ff2'; if (w > 0) { rrect(g, 150, y - 8, Math.max(12, w), 16, 8); g.fill(); }
        text(g, t.slice(0, 14), 142, y, { size: 12, align: 'right' }); text(g, String(snap.res.cnt[k]), 418, y, { size: 13, align: 'left', color: '#ffe14d' });
      });
    } else text(g, mi < 0 ? 'Du schaust zu 👀' : (snap.ch[mi] ? 'Gewählt – warte auf die anderen …' : `Wähle jetzt! ⏱ ${snap.tl}`), W / 2, 260, { size: 18, color: '#fff' });
  }
}

export default {
  id: 'mehrheit', name: 'Mehrheit', emoji: '🗳️', category: 'Party', tags: ['party'],
  min: 3, max: 6, teams: 'none', duel: false, humansOnly: true,
  sync: 'turns', controls: 'PICK', ctlWidth: 0.42, duration: 110,
  view: { w: W, h: H },
  howTo: ['Eine Frage erscheint – wähle, was die MEISTEN der Runde wählen werden!', 'Liegst du bei der Mehrheit, gibt es Punkte (2 bei klarer Mehrheit, 1 bei Gleichstand).'],
  wertung: 'Die meisten Punkte nach 6 Fragen gewinnen. Bots können hier nicht mitspielen.',
  create: (ctx) => new Mehrheit(ctx),
};
