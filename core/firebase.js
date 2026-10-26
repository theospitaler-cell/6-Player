// Firebase-Konfiguration + Laden des SDK (per CDN, feste Version).
import { lsGet, lsSet, lsDel } from './util.js';

// >>> HIER DEINE FIREBASE-WERTE EINFÜGEN <<<
export const firebaseConfig = {
  apiKey: "DEIN_API_KEY",
  authDomain: "DEIN_PROJEKT.firebaseapp.com",
  databaseURL: "https://DEIN_PROJEKT-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "DEIN_PROJEKT",
  storageBucket: "DEIN_PROJEKT.appspot.com",
  messagingSenderId: "000000000000",
  appId: "1:000000000000:web:0000000000000000"
};

export const SDK_VERSION = '10.12.2';
const SDK_BASE = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/`;
const LS_KEY = 'pp6.fbconfig.v1';

/** Die Regeln für die Realtime Database (werden im Einrichtung-Screen angezeigt). */
export const RTDB_RULES = `{
  "rules": {
    "rooms": {
      ".read": "auth != null",
      ".indexOn": ["meta/createdAt"],
      "$code": { ".write": "auth != null" }
    },
    "users": {
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "presence": {
      "$uid": {
        ".read": "auth != null",
        ".write": "auth != null && auth.uid === $uid"
      }
    },
    "friendCodes": {
      "$code": {
        ".read": "auth != null",
        ".write": "auth != null && !data.exists()"
      }
    },
    "social": {
      "$uid": {
        "requests": {
          ".read": "auth != null && auth.uid === $uid",
          "$from": { ".write": "auth != null && (auth.uid === $from || auth.uid === $uid)" }
        },
        "friends": {
          ".read": "auth != null && auth.uid === $uid",
          "$f": { ".write": "auth != null && (auth.uid === $uid || auth.uid === $f)" }
        },
        "invites": {
          ".read": "auth != null && auth.uid === $uid",
          "$from": { ".write": "auth != null && (auth.uid === $from || auth.uid === $uid)" }
        }
      }
    }
  }
}`;

const FIELDS = ['apiKey', 'authDomain', 'databaseURL', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];

export function isPlaceholder(cfg) {
  return !cfg || !cfg.apiKey || String(cfg.apiKey).startsWith('DEIN_') || String(cfg.databaseURL || '').includes('DEIN_PROJEKT');
}

/** Aktive Konfiguration: lokal gespeichert (im Setup eingefügt) hat Vorrang vor der Datei. */
export function activeConfig() {
  const local = lsGet(LS_KEY, null);
  if (local && !isPlaceholder(local)) return { cfg: local, source: 'local' };
  if (!isPlaceholder(firebaseConfig)) return { cfg: firebaseConfig, source: 'file' };
  return { cfg: null, source: 'none' };
}

export function saveLocalConfig(cfg) { lsSet(LS_KEY, cfg); }
export function clearLocalConfig() { lsDel(LS_KEY); }

/**
 * Liest eine Konfiguration aus eingefügtem Text. Versteht den Kasten aus der
 * Firebase-Konsole (const firebaseConfig = { ... };), JSON und lose Schreibweisen.
 */
export function parseConfigText(text) {
  if (!text) return null;
  const cfg = {};
  for (const key of FIELDS) {
    const m = new RegExp(`["']?${key}["']?\\s*:\\s*["'\`]([^"'\`]+)["'\`]`).exec(text);
    if (m) cfg[key] = m[1].trim();
  }
  if (!cfg.apiKey || !cfg.projectId) return null;
  // databaseURL fehlt oft, wenn die Datenbank erst nach der App angelegt wurde → Standard-Region raten
  if (!cfg.databaseURL) cfg.databaseURL = `https://${cfg.projectId}-default-rtdb.europe-west1.firebasedatabase.app`;
  return cfg;
}

const b64 = {
  enc: (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
};

/** Link, mit dem Geschwister die Konfiguration mit einem Tipp übernehmen. */
export function shareConfigLink(cfg) {
  const base = location.href.split('#')[0].split('?')[0];
  return `${base}#cfg=${b64.enc(JSON.stringify(cfg))}`;
}

/** Beim Start: #cfg=… in der URL übernehmen und aus der Adresszeile entfernen. */
export function consumeConfigFromUrl() {
  try {
    const m = /[#&]cfg=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return false;
    const cfg = JSON.parse(b64.dec(m[1]));
    history.replaceState(null, '', location.href.split('#')[0]);
    if (cfg && cfg.apiKey && !isPlaceholder(cfg)) { saveLocalConfig(cfg); return true; }
  } catch (e) { console.warn('cfg-Link ungültig', e); }
  return false;
}

export function friendlyError(e) {
  const code = (e && (e.code || e.name)) || '';
  const msg = (e && e.message) || String(e);
  if (/operation-not-allowed|admin-restricted-operation/.test(code + msg)) {
    return 'Anonyme Anmeldung ist in Firebase nicht aktiviert (Authentication → Anmeldemethode → Anonym).';
  }
  if (/api-key-not-valid|invalid-api-key/.test(code + msg)) return 'Der API-Key ist ungültig – bitte die Konfiguration neu kopieren.';
  if (/network-request-failed/.test(code + msg)) return 'Keine Verbindung zu Firebase (Internet? Werbeblocker?).';
  if (/timeout/i.test(msg)) return 'Firebase antwortet nicht (Zeitüberschreitung).';
  if (/Failed to fetch dynamically imported|Importing a module script failed|error loading dynamically/i.test(msg)) {
    return 'Das Firebase-SDK konnte nicht geladen werden (Internet / Werbeblocker?).';
  }
  return msg;
}

/** Lädt das SDK, meldet anonym an und gibt alles zurück, was der Transport braucht. */
export async function loadFirebase(cfg) {
  if (!cfg.databaseURL) throw new Error('databaseURL fehlt in der Konfiguration.');
  const [appM, authM, dbM] = await Promise.all([
    import(SDK_BASE + 'firebase-app.js'),
    import(SDK_BASE + 'firebase-auth.js'),
    import(SDK_BASE + 'firebase-database.js'),
  ]);
  const app = appM.initializeApp(cfg);
  const auth = authM.getAuth(app);
  if (auth.authStateReady) await auth.authStateReady();
  let cred;
  try { cred = await authM.signInAnonymously(auth); } catch (e) { throw new Error(friendlyError(e)); }
  const db = dbM.getDatabase(app);
  return { app, auth, db, user: cred.user, m: dbM };
}
