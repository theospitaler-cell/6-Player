// Transport-Schicht: Der gesamte Spielcode spricht NUR mit diesem Interface.
// Zwei Implementierungen: FirebaseTransport (online) und LocalTransport (Demo/Solo/Tests).
//
// Interface (Pfade wie in der Realtime Database, z. B. 'rooms/1234/meta'):
//   uid, kind, serverNow(), TS (Server-Zeitstempel-Platzhalter)
//   onConnection(cb) → unsub
//   get(path) → Promise<Wert|null>
//   set(path, wert) / update(path, {relPfad: wert|null}) / remove(path)
//   on(path, cb) → unsub      (cb bekommt den ganzen Wert, auch null)
//   transaction(path, fn) → Promise<{committed, value}>   (fn(alt) → neu | undefined = abbrechen)
//   onDisconnect(path, wert | REMOVE) → Promise<cancel>
//   listOldRooms(vorTs, limit) → Promise<string[]>
import { loadFirebase, activeConfig, friendlyError } from './firebase.js';
import { randId, sleep } from './util.js';

export const TS = { '.sv': 'timestamp' };
export const REMOVE = Symbol('remove');

/** Wie Firebase: undefined raus, NaN/Infinity → 0. */
export function clean(v) {
  if (v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  if (v === null || typeof v !== 'object') return v;
  if (v['.sv']) return v;
  if (Array.isArray(v)) return v.map(clean);
  const o = {};
  for (const [k, x] of Object.entries(v)) {
    if (x === undefined) continue;
    o[k] = clean(x);
  }
  return o;
}

// ============================================================================
// Firebase
// ============================================================================
export class FirebaseTransport {
  constructor(fb) {
    this.fb = fb;
    this.kind = 'firebase';
    this.uid = fb.user.uid;
    this.TS = TS;
    this.offset = 0;
    this.connected = false;
    this.connCbs = new Set();
  }

  async init() {
    const { db, m } = this.fb;
    m.onValue(m.ref(db, '.info/serverTimeOffset'), (s) => { this.offset = Number(s.val()) || 0; });
    m.onValue(m.ref(db, '.info/connected'), (s) => {
      this.connected = !!s.val();
      for (const cb of this.connCbs) { try { cb(this.connected); } catch (e) { console.error(e); } }
    });
    // Verbindung testen: erste Antwort der Datenbank abwarten (mit Zeitlimit)
    await Promise.race([
      new Promise((res) => { const un = this.onConnection((c) => { if (c) { un(); res(); } }); }),
      sleep(12000).then(() => { throw new Error('timeout: Datenbank nicht erreichbar (databaseURL/Region prüfen)'); }),
    ]);
    // Rechte prüfen (Regeln eingefügt?)
    try { await this.get('rooms/__ping__/x'); } catch (e) {
      if (/permission_denied/i.test(e.message || e.code || '')) throw new Error('Zugriff verweigert – bitte die Datenbank-Regeln aus der Anleitung einfügen und veröffentlichen.');
      throw e;
    }
  }

  serverNow() { return Date.now() + this.offset; }
  onConnection(cb) { this.connCbs.add(cb); cb(this.connected); return () => this.connCbs.delete(cb); }

  _ref(path) { return this.fb.m.ref(this.fb.db, path); }
  async get(path) { const s = await this.fb.m.get(this._ref(path)); return s.val(); }
  set(path, val) { return this.fb.m.set(this._ref(path), clean(val)); }
  update(path, obj) { return this.fb.m.update(this._ref(path), clean(obj)); }
  remove(path) { return this.fb.m.remove(this._ref(path)); }
  on(path, cb) {
    return this.fb.m.onValue(this._ref(path), (s) => {
      try { cb(s.val()); } catch (e) { console.error('on-Callback', path, e); }
    }, (err) => console.error('Lesefehler', path, err.message));
  }
  async transaction(path, fn) {
    const r = await this.fb.m.runTransaction(this._ref(path), (cur) => {
      const out = fn(cur === undefined ? null : cur);
      return out === undefined ? undefined : clean(out);
    });
    return { committed: r.committed, value: r.snapshot.val() };
  }
  async onDisconnect(path, val) {
    const od = this.fb.m.onDisconnect(this._ref(path));
    if (val === REMOVE) await od.remove(); else await od.set(clean(val));
    return () => od.cancel().catch(() => {});
  }
  async listOldRooms(before, limit = 20) {
    const { m, db } = this.fb;
    const q = m.query(m.ref(db, 'rooms'), m.orderByChild('meta/createdAt'), m.endAt(before), m.limitToFirst(limit));
    const s = await m.get(q);
    const out = [];
    s.forEach((c) => { out.push(c.key); });
    return out;
  }
}

// ============================================================================
// Lokal (im Speicher, optional zwischen Tabs per BroadcastChannel synchron)
// ============================================================================
const pathParts = (p) => String(p).split('/').filter(Boolean);

/** Wie Firebase beim Speichern: Arrays → Objekte, leere Knoten verschwinden. */
function normalize(v) {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object') return v;
  const src = Array.isArray(v) ? Object.fromEntries(v.map((x, i) => [String(i), x])) : v;
  const out = {};
  let any = false;
  for (const [k, x] of Object.entries(src)) {
    const n = normalize(x);
    if (n !== null) { out[k] = n; any = true; }
  }
  return any ? out : null;
}
/** Wie Firebase beim Lesen: Objekte mit Schlüsseln 0..n-1 werden wieder zu Arrays. */
function arrayify(v) {
  if (v === null || typeof v !== 'object') return v;
  const keys = Object.keys(v);
  const out = {};
  for (const k of keys) out[k] = arrayify(v[k]);
  if (keys.length && keys.every((k) => /^\d+$/.test(k))) {
    const maxIdx = Math.max(...keys.map(Number));
    if (maxIdx < keys.length * 2) { // Firebase-Regel: mind. die Hälfte der Plätze belegt
      const arr = [];
      for (let i = 0; i <= maxIdx; i++) arr.push(out[String(i)] === undefined ? null : out[String(i)]);
      return arr;
    }
  }
  return out;
}
function resolveTs(v, now) {
  if (v && typeof v === 'object') {
    if (v['.sv']) return now;
    for (const k of Object.keys(v)) v[k] = resolveTs(v[k], now);
  }
  return v;
}
/** Firebase verbietet . $ # [ ] / in Schlüsseln – hier genauso prüfen, damit Tests solche Fehler finden. */
function checkKeys(v) {
  if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) {
      if (k !== '.sv' && /[.$#\[\]\/]/.test(k)) throw new Error(`Ungültiger Schlüssel „${k}“ (Firebase erlaubt . $ # [ ] / nicht)`);
      checkKeys(x);
    }
  }
}
const clone = (v) => (v === null || v === undefined ? null : JSON.parse(JSON.stringify(v)));

export class LocalTransport {
  constructor({ shared = false } = {}) {
    this.kind = 'local';
    this.TS = TS;
    this.db = {};
    this.listeners = new Set();
    this.disc = [];
    this.queue = [];
    this.flushing = false;
    this.tabId = randId(8);
    this.shared = shared;
    this.bc = null;
    this.uid = 'u_' + randId(10);
    try {
      const k = 'pp6.localuid';
      this.uid = sessionStorage.getItem(k) || this.uid;
      sessionStorage.setItem(k, this.uid);
    } catch { /* ok */ }
  }

  async init() {
    if (this.shared && typeof BroadcastChannel !== 'undefined') {
      this.bc = new BroadcastChannel('pp6-local-db');
      this.bc.onmessage = (ev) => this._onMsg(ev.data);
      this.bc.postMessage({ t: 'hello', from: this.tabId });
      await sleep(150);
    }
    if (typeof addEventListener === 'function') {
      addEventListener('pagehide', () => this._runDisconnect());
    }
  }

  serverNow() { return Date.now(); }
  onConnection(cb) { cb(true); return () => {}; }

  _onMsg(m) {
    if (!m || m.from === this.tabId) return;
    if (m.t === 'hello') {
      if (Object.keys(this.db).length) this.bc.postMessage({ t: 'snap', to: m.from, from: this.tabId, db: this.db });
    } else if (m.t === 'snap' && m.to === this.tabId) {
      if (!Object.keys(this.db).length) { this.db = m.db; this._notify(''); }
    } else if (m.t === 'ops') {
      for (const op of m.ops) this._apply(op.p, op.v, false);
    }
  }

  _getAt(path) {
    let cur = this.db;
    for (const k of pathParts(path)) {
      if (cur === null || typeof cur !== 'object' || !(k in cur)) return null;
      cur = cur[k];
    }
    return cur === undefined ? null : cur;
  }
  _apply(path, val, broadcast = true) {
    const parts = pathParts(path);
    const nv = normalize(val);
    if (!parts.length) { this.db = nv || {}; } else {
      const chain = [this.db];
      let cur = this.db;
      for (let i = 0; i < parts.length - 1; i++) {
        let nxt = cur[parts[i]];
        if (nxt === undefined || nxt === null || typeof nxt !== 'object') {
          if (nv === null) { this._notify(path); return; }
          nxt = cur[parts[i]] = {};
        }
        cur = nxt; chain.push(cur);
      }
      const last = parts[parts.length - 1];
      if (nv === null) delete cur[last]; else cur[last] = nv;
      // leere Eltern aufräumen
      for (let i = parts.length - 2; i >= 0; i--) {
        if (Object.keys(chain[i + 1]).length === 0) delete chain[i][parts[i]]; else break;
      }
    }
    if (broadcast && this.bc) { try { this.bc.postMessage({ t: 'ops', from: this.tabId, ops: [{ p: path, v: nv }] }); } catch { /* ok */ } }
    this._notify(path);
  }

  _notify(path) {
    this.queue.push(path);
    if (this.flushing) return;
    this.flushing = true;
    try {
      while (this.queue.length) {
        const changed = pathParts(this.queue.shift());
        for (const l of Array.from(this.listeners)) {
          const lp = l.parts;
          const n = Math.min(lp.length, changed.length);
          let overlap = true;
          for (let i = 0; i < n; i++) if (lp[i] !== changed[i]) { overlap = false; break; }
          if (!overlap && !l.first) continue;
          const val = arrayify(clone(this._getAt(l.path)));
          const json = JSON.stringify(val);
          if (l.first || json !== l.last) {
            l.first = false; l.last = json;
            try { l.cb(val); } catch (e) { console.error('on-Callback', l.path, e); }
          }
        }
      }
    } finally { this.flushing = false; }
  }

  async get(path) { return arrayify(clone(this._getAt(path))); }
  async set(path, val) {
    checkKeys(val);
    this._apply(path, resolveTs(clone(clean(val)), Date.now()));
  }
  async update(path, obj) {
    const base = pathParts(path).join('/');
    const now = Date.now();
    const keys = Object.keys(obj);
    // wie Firebase: Pfade dürfen sich nicht überlappen ('a' + 'a/b' ist verboten)
    for (const a of keys) {
      for (const b of keys) {
        if (a !== b && (b + '/').startsWith(a + '/')) throw new Error(`update failed: values argument contains a path /${a} that is ancestor of another path /${b}`);
      }
    }
    for (const [k, v] of Object.entries(clean(obj))) {
      checkKeys(v);
      this._apply(base ? base + '/' + k : k, resolveTs(clone(v), now));
    }
  }
  async remove(path) { this._apply(path, null); }
  on(path, cb) {
    const l = { path, parts: pathParts(path), cb, first: true, last: undefined };
    this.listeners.add(l);
    Promise.resolve().then(() => {
      if (!this.listeners.has(l) || !l.first) return;
      l.first = false;
      const val = arrayify(clone(this._getAt(path)));
      l.last = JSON.stringify(val);
      try { cb(val); } catch (e) { console.error('on-Callback', path, e); }
    });
    return () => this.listeners.delete(l);
  }
  async transaction(path, fn) {
    const cur = arrayify(clone(this._getAt(path)));
    const out = fn(cur);
    if (out === undefined) return { committed: false, value: cur };
    await this.set(path, out);
    return { committed: true, value: arrayify(clone(this._getAt(path))) };
  }
  async onDisconnect(path, val) {
    const e = { path, val };
    this.disc.push(e);
    return () => { this.disc = this.disc.filter((x) => x !== e); };
  }
  _runDisconnect() {
    for (const e of this.disc) {
      try { this._apply(e.path, e.val === REMOVE ? null : resolveTs(clone(e.val), Date.now())); } catch { /* ok */ }
    }
    this.disc = [];
  }
  async listOldRooms(before, limit = 20) {
    const rooms = this._getAt('rooms') || {};
    return Object.keys(rooms)
      .filter((c) => !(rooms[c].meta && rooms[c].meta.createdAt > before))
      .slice(0, limit);
  }
}

// ============================================================================
// Fabrik: Firebase wenn eingerichtet, sonst lokaler Demo-Modus
// ============================================================================
function withTimeout(p, ms, label) {
  return Promise.race([p, sleep(ms).then(() => { throw new Error('timeout ' + label); })]);
}

export async function connectTransport() {
  const { cfg, source } = activeConfig();
  if (!cfg) {
    const tp = new LocalTransport({ shared: true });
    await tp.init();
    return { tp, online: false, error: null, source };
  }
  try {
    const fb = await withTimeout(loadFirebase(cfg), 20000, 'Firebase');
    const tp = new FirebaseTransport(fb);
    await tp.init();
    return { tp, online: true, error: null, source };
  } catch (e) {
    console.error('Firebase-Start fehlgeschlagen', e);
    const tp = new LocalTransport({ shared: true });
    await tp.init();
    return { tp, online: false, error: friendlyError(e), source };
  }
}

export async function createSoloTransport() {
  const tp = new LocalTransport({ shared: false });
  await tp.init();
  return tp;
}
