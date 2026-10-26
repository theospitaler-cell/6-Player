// Freunde: eigener Freundescode, Anfragen, Anwesenheit und Einladungen – alles über das Transport-Interface
// (kein DOM → in Node testbar). Datenbank-Pfade:
//   users/{uid}                 Name, Figur, Level, Freundescode (öffentlich lesbar)
//   friendCodes/{code}          → uid (einmal beschreibbar)
//   presence/{uid}              { online, room, lastSeen }
//   social/{uid}/requests/{von} Anfragen an mich      social/{uid}/friends/{f}  Freunde
//   social/{uid}/invites/{von}  Einladungen an mich   { code, name, avatar, t }
import { profile, saveProfile, levelInfo } from './profile.js';
import { TS } from './transport.js';
import { COLOR_HEX } from './state.js';
import { randInt } from './util.js';

const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne 0/O/1/I – verwechselt man nicht
const INVITE_TTL = 3 * 60 * 1000;

export const normCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
export const showCode = (c) => (c && c.length === 6 ? c.slice(0, 3) + '-' + c.slice(3) : c || '');
const randomCode = () => Array.from({ length: 6 }, () => ALPHA[randInt(0, ALPHA.length - 1)]).join('');

export class Friends {
  /** prof = Profil dieses Nutzers (Standard: das Geräteprofil; Tests übergeben eigene). */
  constructor(prof = profile) {
    this.prof = prof;
    this.subs = new Set();
    this.reset();
  }

  reset() {
    this.tp = null; this.uid = null; this.ready = false;
    this.unsubs = []; this.fUnsubs = {};
    this.friendIds = {}; this.requests = {}; this.invites = {}; this.users = {}; this.presence = {};
    this.room = null; this.seen = new Set(); this.lastPub = '';
    this.init = { friends: false, requests: false, invites: false };
  }

  get code() { return this.prof.friendCode; }
  _save() { if (this.prof === profile) saveProfile(); }
  on(fn) { this.subs.add(fn); return () => this.subs.delete(fn); }
  _emit(what, data) { for (const fn of Array.from(this.subs)) { try { fn(what, data); } catch (e) { console.error('Friends-Listener', e); } } }

  async start(tp) {
    this.stop();
    this.tp = tp; this.uid = tp.uid;
    await this._ensureCode();
    await this.publish();
    const u = this.uid;
    this.unsubs.push(tp.onConnection((c) => { if (c) this._online().catch(() => {}); }));
    this.unsubs.push(tp.on(`social/${u}/friends`, (v) => this._onFriends(v || {})));
    this.unsubs.push(tp.on(`social/${u}/requests`, (v) => this._onRequests(v || {})));
    this.unsubs.push(tp.on(`social/${u}/invites`, (v) => this._onInvites(v || {})));
    this.ready = true;
    this._emit('ready');
  }

  stop() {
    for (const f of this.unsubs) { try { f(); } catch { /* egal */ } }
    for (const l of Object.values(this.fUnsubs)) for (const f of l) { try { f(); } catch { /* egal */ } }
    const room = this.room;
    this.reset();
    this.room = room;
  }

  async _ensureCode() {
    const tp = this.tp;
    if (this.prof.friendCode) {
      try { if ((await tp.get('friendCodes/' + this.prof.friendCode)) === this.uid) return; } catch { /* neu vergeben */ }
    }
    for (let i = 0; i < 12; i++) {
      const code = randomCode();
      try {
        const r = await tp.transaction('friendCodes/' + code, (cur) => (cur ? undefined : this.uid));
        if (r.committed) { this.prof.friendCode = code; this._save(); return; }
      } catch { /* Code vergeben oder verboten → nächster Versuch */ }
    }
    throw new Error('Freundescode konnte nicht angelegt werden.');
  }

  /** Name, Figur, Level für die Freunde sichtbar machen (nur schreiben, wenn sich etwas geändert hat). */
  async publish() {
    if (!this.tp) return;
    const p = this.prof;
    const rec = { name: (p.name || 'Spieler').slice(0, 14), avatar: p.avatar, frame: (p.equipped && p.equipped.frame) || 'weiss', color: p.color, level: levelInfo(p.xp || 0).level, friendCode: p.friendCode };
    const sig = JSON.stringify(rec);
    if (sig === this.lastPub) return;
    this.lastPub = sig;
    try { await this.tp.set(`users/${this.uid}`, { ...rec, t: TS }); } catch (e) { this.lastPub = ''; console.warn('users', e && e.message); }
  }

  async _online() {
    const tp = this.tp, path = `presence/${this.uid}`;
    await tp.onDisconnect(path, { online: false, room: null, lastSeen: TS });
    await tp.set(path, { online: true, room: this.room, lastSeen: TS });
  }

  setRoom(code) {
    this.room = code || null;
    if (this.tp && this.ready) this.tp.update(`presence/${this.uid}`, { online: true, room: this.room, lastSeen: TS }).catch(() => {});
  }

  // ---------- Abos ----------
  _onFriends(v) {
    const tp = this.tp;
    for (const f of Object.keys(v)) {
      if (this.fUnsubs[f]) continue;
      this.fUnsubs[f] = [
        tp.on(`users/${f}`, (u) => { this.users[f] = u; this._emit('change'); }),
        tp.on(`presence/${f}`, (p) => { this.presence[f] = p; this._emit('change'); }),
      ];
    }
    for (const f of Object.keys(this.fUnsubs)) {
      if (v[f]) continue;
      this.fUnsubs[f].forEach((u) => u());
      delete this.fUnsubs[f]; delete this.users[f]; delete this.presence[f];
    }
    const prev = Object.keys(this.friendIds).length;
    this.friendIds = v;
    const n = Object.keys(v).length;
    if (!this.init.friends || n !== prev) this._emit('count', n);
    this.init.friends = true;
    this._emit('change');
  }

  _onRequests(v) {
    const prev = this.requests;
    this.requests = v;
    if (this.init.requests) for (const [from, r] of Object.entries(v)) if (!prev[from]) this._emit('request', { uid: from, ...r });
    this.init.requests = true;
    this._emit('change');
  }

  _onInvites(v) {
    const now = this.tp.serverNow();
    const fresh = {};
    for (const [from, inv] of Object.entries(v)) {
      if (!inv || !inv.code) continue;
      if (now - (inv.t || now) > INVITE_TTL) { this.tp.remove(`social/${this.uid}/invites/${from}`).catch(() => {}); continue; }
      fresh[from] = inv;
      const key = from + ':' + inv.t;
      if (!this.seen.has(key)) { this.seen.add(key); this._emit('invite', { uid: from, ...inv }); }
    }
    this.invites = fresh;
    this.init.invites = true;
    this._emit('change');
  }

  // ---------- Lesen ----------
  list() {
    return Object.keys(this.friendIds).map((uid) => {
      const u = this.users[uid] || {}, p = this.presence[uid] || {};
      const online = p.online === true;
      return {
        uid, name: u.name || '…', avatar: u.avatar || '🙂', frame: u.frame || 'weiss', colorHex: COLOR_HEX[u.color] || '#8899aa', level: u.level || 1,
        online, room: online ? p.room || null : null, lastSeen: p.lastSeen || 0,
      };
    }).sort((a, b) => (b.online - a.online) || (b.lastSeen - a.lastSeen) || a.name.localeCompare(b.name));
  }
  requestList() { return Object.entries(this.requests).map(([uid, r]) => ({ uid, name: (r && r.name) || 'Spieler', avatar: (r && r.avatar) || '🙂' })); }
  inviteList() { return Object.entries(this.invites).map(([uid, i]) => ({ uid, ...i })); }
  badge() { return Object.keys(this.requests).length + Object.keys(this.invites).length; }
  isFriend(uid) { return !!this.friendIds[uid]; }

  // ---------- Aktionen ----------
  /** → { ok, reason?, accepted? } */
  async addByCode(raw) {
    if (!this.ready) return { ok: false, reason: 'Die Freunde-Funktion ist noch nicht bereit – kurz warten.' };
    const code = normCode(raw);
    if (code.length !== 6) return { ok: false, reason: 'Ein Freundescode hat 6 Zeichen, z. B. K7M-4PX.' };
    if (code === this.prof.friendCode) return { ok: false, reason: 'Das ist dein eigener Code 😄' };
    let target;
    try { target = await this.tp.get('friendCodes/' + code); } catch { return { ok: false, reason: 'Keine Verbindung zur Datenbank.' }; }
    if (!target) return { ok: false, reason: 'Diesen Code gibt es nicht. Tippfehler?' };
    if (this.friendIds[target]) return { ok: false, reason: 'Ihr seid schon befreundet.' };
    if (this.requests[target]) { await this.accept(target); return { ok: true, accepted: true }; }
    try { await this.tp.set(`social/${target}/requests/${this.uid}`, { name: (this.prof.name || 'Spieler').slice(0, 14), avatar: this.prof.avatar, t: TS }); }
    catch { return { ok: false, reason: 'Anfrage konnte nicht gesendet werden.' }; }
    return { ok: true };
  }

  async accept(from) {
    const u = this.uid, tp = this.tp;
    await tp.set(`social/${from}/friends/${u}`, true);
    await tp.set(`social/${u}/friends/${from}`, true);
    await tp.remove(`social/${u}/requests/${from}`).catch(() => {});
    tp.remove(`social/${from}/requests/${u}`).catch(() => {}); // falls wir ihm auch eine geschickt hatten
  }
  decline(from) { return this.tp.remove(`social/${this.uid}/requests/${from}`); }
  async removeFriend(f) {
    await this.tp.remove(`social/${this.uid}/friends/${f}`);
    this.tp.remove(`social/${f}/friends/${this.uid}`).catch(() => {});
  }
  invite(f, code) {
    return this.tp.set(`social/${f}/invites/${this.uid}`, { code: String(code), name: (this.prof.name || 'Spieler').slice(0, 14), avatar: this.prof.avatar, t: TS });
  }
  dismissInvite(from) { return this.tp.remove(`social/${this.uid}/invites/${from}`); }
}

export const friends = new Friends();

/** „vor 5 Min“ / „vor 3 Std“ / „vor 2 Tagen“ */
export function agoText(ts, now = Date.now()) {
  if (!ts) return 'lange nicht online';
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 90) return 'gerade eben';
  if (s < 3600) return `vor ${Math.round(s / 60)} Min`;
  if (s < 86400) return `vor ${Math.round(s / 3600)} Std`;
  const d = Math.round(s / 86400);
  return d === 1 ? 'gestern' : `vor ${d} Tagen`;
}
