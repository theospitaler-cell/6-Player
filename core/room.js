// Raum-Datenschicht: erstellen/beitreten/verlassen, Spielerliste, Anwesenheit, Host-Wechsel.
// Kennt nur das Transport-Interface (kein DOM) → auch in Node testbar.
import { MAX_PLAYERS, DEFAULT_SETTINGS, COLOR_HEX, COLORS } from './state.js';
import { REMOVE, TS } from './transport.js';
import { lsGet, lsSet, lsDel, randInt } from './util.js';
import { newBot } from './bots.js';

const SESSION_KEY = 'pp6.session.v1';
const MAX_AGE = 6 * 3600 * 1000;     // Räume älter als 6 h werden aufgeräumt
const HOST_TIMEOUT = 6000;           // Host so lange offline → Wechsel
const LOBBY_KICK = 90000;            // Offline-Spieler fliegen in der Lobby nach 90 s raus

export const cleanName = (s) => String(s || '').replace(/[\n\r\t]/g, ' ').trim().slice(0, 14);
export const toList = (x) => (Array.isArray(x) ? x : Object.values(x || {})).filter(Boolean);

function playerRecord(prof, color, tp) {
  return {
    name: cleanName(prof.name) || 'Spieler', avatar: prof.avatar, color, ready: false, isBot: false,
    connected: true, lastSeen: TS, level: prof.level || 1, score: 0, wins: 0, rs: 0, joinedAt: tp.serverNow(),
  };
}

export class Room {
  constructor(tp, code) {
    this.tp = tp; this.code = String(code); this.uid = tp.uid;
    this.d = { meta: null, players: {}, votes: {}, events: {}, history: [], historyRaw: null };
    this.subs = new Set();
    this.unsubs = []; this.cancelDisc = []; this.timers = [];
    this.loaded = { meta: false, players: false };
    this.leaving = false; this.stopped = false;
    this.evSeen = {}; this.evInit = false; this.reactAt = 0;
    this._kickedFired = false; this.online = true;
  }

  p(sub = '') { return `rooms/${this.code}${sub ? '/' + sub : ''}`; }

  // ---------- Fabrik-Methoden ----------
  static async create(tp, prof) {
    try { // alte Räume aufräumen (Fehler egal)
      const old = await tp.listOldRooms(tp.serverNow() - MAX_AGE, 20);
      await Promise.all(old.map((c) => tp.remove('rooms/' + c)));
    } catch (e) { console.warn('Aufräumen übersprungen', e && e.message); }
    const now = tp.serverNow();
    const color = COLOR_HEX[prof.color] ? prof.color : COLORS[0].id;
    for (let i = 0; i < 15; i++) {
      const code = String(randInt(1000, 9999));
      const res = await tp.transaction(`rooms/${code}/meta`, (cur) => (cur ? undefined : {
        hostUid: tp.uid, createdAt: now, status: 'lobby', roundIndex: 0, totalRounds: DEFAULT_SETTINGS.rounds,
        settings: { ...DEFAULT_SETTINGS },
      }));
      if (!res.committed) continue;
      await tp.set(`rooms/${code}/players/${tp.uid}`, playerRecord(prof, color, tp));
      const room = new Room(tp, code);
      room.remember();
      room.start();
      return room;
    }
    throw new Error('Kein freier Party-Code gefunden – bitte nochmal versuchen.');
  }

  static async join(tp, code, prof) {
    code = String(code).trim();
    const meta = await tp.get(`rooms/${code}/meta`);
    if (!meta) throw new Error('Diese Party gibt es nicht (mehr). Code prüfen!');
    const uid = tp.uid;
    let full = false;
    const res = await tp.transaction(`rooms/${code}/players`, (cur) => {
      full = false;
      cur = cur ? { ...cur } : {};
      if (cur[uid] && cur[uid].name) { cur[uid] = { ...cur[uid], connected: true }; return cur; } // zurückgekehrt
      const valid = Object.entries(cur).filter(([, p]) => p && p.name);
      if (valid.length >= MAX_PLAYERS) {
        const bot = meta.status === 'lobby' ? valid.find(([, p]) => p.isBot) : null;
        if (!bot) { full = true; return undefined; }
        delete cur[bot[0]]; // Mensch verdrängt einen Bot
      }
      const used = new Set(Object.values(cur).map((p) => p && p.color));
      const color = COLOR_HEX[prof.color] && !used.has(prof.color) ? prof.color : (COLORS.find((c) => !used.has(c.id)) || COLORS[0]).id;
      cur[uid] = playerRecord(prof, color, tp);
      return cur;
    });
    if (!res.committed) throw new Error(full ? 'Die Party ist voll (maximal 6 Spieler).' : 'Beitritt fehlgeschlagen – bitte nochmal versuchen.');
    const room = new Room(tp, code);
    room.remember();
    room.start();
    return room;
  }

  /** Beim App-Start: gibt es eine Party, in die wir zurück können? */
  static async findSession(tp) {
    const s = lsGet(SESSION_KEY, null);
    if (!s || s.uid !== tp.uid || !s.code) return null;
    if (Date.now() - (s.t || 0) > MAX_AGE) { lsDel(SESSION_KEY); return null; }
    try {
      const [meta, me] = await Promise.all([tp.get(`rooms/${s.code}/meta`), tp.get(`rooms/${s.code}/players/${tp.uid}`)]);
      if (!meta || !me || !me.name) { lsDel(SESSION_KEY); return null; }
      return { code: s.code, status: meta.status };
    } catch { return null; }
  }
  static forget() { lsDel(SESSION_KEY); }
  remember() { lsSet(SESSION_KEY, { code: this.code, uid: this.uid, t: Date.now() }); }

  // ---------- Abos ----------
  start() {
    const tp = this.tp;
    const sub = (path, fn) => this.unsubs.push(tp.on(this.p(path), fn));
    sub('meta', (v) => { this.d.meta = v || null; this.loaded.meta = true; this._emit('meta'); });
    sub('players', (v) => {
      this.d.players = v || {}; this.loaded.players = true;
      this._presenceCheck(); this._checkKicked(); this._emit('players');
    });
    sub('votes', (v) => { this.d.votes = v || {}; this._emit('votes'); });
    sub('history', (v) => { this.d.historyRaw = v || null; this.d.history = toList(v); this._emit('history'); });
    sub('events', (v) => {
      v = v || {};
      if (this.evInit) {
        for (const [uid, e] of Object.entries(v)) {
          if (e && e.n !== this.evSeen[uid] && uid !== this.uid) this._emit('reaction', { uid, e: e.e });
        }
      }
      for (const [uid, e] of Object.entries(v)) this.evSeen[uid] = e && e.n;
      this.evInit = true;
    });
    this.unsubs.push(tp.onConnection((c) => this._conn(c)));
    this.timers.push(setInterval(() => this._watch(), 2000));
  }

  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  _emit(what, data) { for (const fn of Array.from(this.subs)) { try { fn(what, data); } catch (e) { console.error('Room-Listener', e); } } }

  // ---------- Anwesenheit ----------
  async _conn(connected) {
    this.online = connected;
    this._emit('connection', connected);
    if (!connected || this.leaving) return;
    try {
      const base = this.p('players/' + this.uid);
      for (const c of this.cancelDisc) c();
      this.cancelDisc = [];
      this.cancelDisc.push(await this.tp.onDisconnect(base + '/connected', false));
      this.cancelDisc.push(await this.tp.onDisconnect(base + '/lastSeen', TS));
      this._presenceCheck();
    } catch (e) { console.warn('onDisconnect', e && e.message); }
  }
  _presenceCheck() {
    const me = this.d.players[this.uid];
    if (this.online && !this.leaving && me && me.name && me.connected !== true && !this._fixing) {
      this._fixing = true;
      this.tp.update(this.p('players/' + this.uid), { connected: true, lastSeen: TS }).catch(() => {}).finally(() => { this._fixing = false; });
    }
  }
  _checkKicked() {
    if (!this.loaded.players || this.leaving || this._kickedFired) return;
    const me = this.d.players[this.uid];
    if (!me || !me.name) { this._kickedFired = true; this._emit('kicked'); }
  }

  /** Läuft alle 2 s: Host-Wechsel + Lobby-Aufräumen. */
  _watch() {
    const m = this.d.meta;
    if (!m || this.leaving || !this.loaded.players) return;
    const now = this.tp.serverNow();
    const host = this.d.players[m.hostUid];
    const hostGone = !host || !host.name || (host.connected === false && now - (host.lastSeen || 0) > HOST_TIMEOUT);
    if (hostGone) {
      const cands = this.humans().filter((p) => p.connected !== false);
      if (cands.length && cands[0].uid === this.uid) {
        this.tp.transaction(this.p('meta/hostUid'), (cur) => (cur === m.hostUid ? this.uid : undefined)).catch(() => {});
      }
      return;
    }
    if (this.isHost && m.status === 'lobby') {
      for (const p of this.humans()) {
        if (p.connected === false && now - (p.lastSeen || now) > LOBBY_KICK) this.tp.remove(this.p('players/' + p.uid)).catch(() => {});
      }
    }
    // Geister (halb angelegte Spieler ohne Namen) wegräumen
    if (this.isHost) {
      for (const [uid, p] of Object.entries(this.d.players)) if (!p || !p.name) this.tp.remove(this.p('players/' + uid)).catch(() => {});
    }
  }

  // ---------- Lesen ----------
  get meta() { return this.d.meta; }
  get isHost() { return !!this.d.meta && this.d.meta.hostUid === this.uid; }
  get status() { return this.d.meta ? this.d.meta.status : null; }
  get me() { return this.player(this.uid); }
  settings() {
    const s = (this.d.meta && this.d.meta.settings) || {};
    return { ...DEFAULT_SETTINGS, ...s, off: s.off || {}, offCats: s.offCats || {} };
  }
  player(uid) {
    const p = this.d.players[uid];
    return p && p.name ? { ...p, uid, colorHex: COLOR_HEX[p.color] || '#888' } : null;
  }
  list() {
    return Object.entries(this.d.players)
      .filter(([, p]) => p && p.name)
      .map(([uid, p]) => ({ ...p, uid, colorHex: COLOR_HEX[p.color] || '#888' }))
      .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0) || a.uid.localeCompare(b.uid));
  }
  humans() { return this.list().filter((p) => !p.isBot); }
  bots() { return this.list().filter((p) => p.isBot); }
  /** Alle, die mitspielen: Bots + verbundene Menschen. */
  active() { return this.list().filter((p) => p.isBot || p.connected !== false); }
  takenColors() { return new Set(this.list().map((p) => p.color)); }
  /** Ergebnis-Eintrag einer Runde (Index = roundIndex). */
  roundRecord(i) {
    const raw = this.d.historyRaw;
    if (!raw) return null;
    return raw[i] || raw[String(i)] || null;
  }
  voteCounts() {
    const c = {};
    for (const [uid, g] of Object.entries(this.d.votes || {})) if (this.d.players[uid]) c[g] = (c[g] || 0) + 1;
    return c;
  }

  // ---------- Schreiben (alle) ----------
  updateMe(patch) { return this.tp.update(this.p('players/' + this.uid), patch); }
  setReady(r) { return this.updateMe({ ready: !!r }); }
  async setColor(id) {
    if (!COLOR_HEX[id]) return false;
    const res = await this.tp.transaction(this.p('players'), (cur) => {
      if (!cur || !cur[this.uid]) return undefined;
      if (Object.entries(cur).some(([u, p]) => u !== this.uid && p && p.color === id)) return undefined;
      return { ...cur, [this.uid]: { ...cur[this.uid], color: id } };
    });
    return res.committed;
  }
  vote(gameId) { return this.tp.set(this.p('votes/' + this.uid), gameId); }
  react(emoji) {
    const now = Date.now();
    if (now - this.reactAt < 1000) return false;
    this.reactAt = now;
    this.tp.set(this.p('events/' + this.uid), { e: emoji, n: now, t: TS }).catch(() => {});
    this._emit('reaction', { uid: this.uid, e: emoji });
    return true;
  }

  // ---------- Schreiben (Host) ----------
  setMeta(patch) { return this.tp.update(this.p('meta'), patch); }
  setSettings(patch) {
    const o = {};
    for (const [k, v] of Object.entries(patch)) o['settings/' + k] = v;
    if (patch.rounds) o.totalRounds = patch.rounds;
    return this.setMeta(o);
  }
  async addBot(level) {
    if (this.list().length >= MAX_PLAYERS) return false;
    const { uid, record } = newBot(this.d.players, level || this.settings().botLevel);
    await this.tp.set(this.p('players/' + uid), record);
    return true;
  }
  removePlayer(uid) { return this.tp.remove(this.p('players/' + uid)); }
  setPlayer(uid, patch) { return this.tp.update(this.p('players/' + uid), patch); }
  transferHost(uid) { return this.tp.set(this.p('meta/hostUid'), uid); }

  // ---------- Verlassen ----------
  async leave() {
    if (this.leaving) return;
    this.leaving = true;
    Room.forget();
    for (const c of this.cancelDisc) { try { c(); } catch { /* egal */ } }
    this.cancelDisc = [];
    try {
      const others = this.humans().filter((p) => p.uid !== this.uid && p.connected !== false);
      if (!others.length) await this.tp.remove(this.p());
      else {
        if (this.isHost) await this.tp.set(this.p('meta/hostUid'), others[0].uid);
        await this.tp.remove(this.p('players/' + this.uid));
      }
    } catch (e) { console.warn('Verlassen', e && e.message); }
    this.stop();
  }
  stop() {
    this.stopped = true;
    for (const u of this.unsubs) { try { u(); } catch { /* egal */ } }
    for (const t of this.timers) clearInterval(t);
    this.unsubs = []; this.timers = [];
    this.subs.clear();
  }
}
