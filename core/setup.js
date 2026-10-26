// Einrichtung-Screen: Schritt-für-Schritt-Anleitung für Firebase (alles per Handy machbar).
import { h, backBar, toast, dialog } from './ui.js';
import { RTDB_RULES, activeConfig, parseConfigText, saveLocalConfig, clearLocalConfig, shareConfigLink, isPlaceholder } from './firebase.js';
import { app } from './state.js';
import { copyText } from './util.js';

export function setupScreen({ onBack }) {
  const { cfg, source } = activeConfig();
  const status = h('div', { class: 'setup-status ' + (app.online ? 'ok' : 'warn') },
    app.online ? '✅ Online verbunden – ihr könnt Partys über das Internet spielen.'
      : (app.netError ? `⚠️ Verbindung fehlgeschlagen: ${app.netError}` : '🧪 Demo-Modus – noch keine Online-Verbindung eingerichtet.'));

  const step = (n, title, ...body) => h('div', { class: 'step' }, h('div', { class: 'step-n' }, String(n)), h('div', { class: 'step-body' }, h('h3', null, title), ...body));
  const link = (url, label) => h('a', { href: url, target: '_blank', rel: 'noopener', class: 'ext' }, label || url);

  const rulesBox = h('pre', { class: 'rules' }, RTDB_RULES);
  const rulesCopy = h('button', { class: 'btn small primary', onclick: async () => toast((await copyText(RTDB_RULES)) ? 'Regeln kopiert 📋' : 'Kopieren nicht möglich – Text lange drücken und markieren') }, '📋 Regeln kopieren');

  const ta = h('textarea', { class: 'text-area', rows: '8', placeholder: 'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  databaseURL: "…",\n  …\n};', spellcheck: 'false', autocapitalize: 'off', autocomplete: 'off' });
  const msg = h('div', { class: 'setup-msg' });
  const save = h('button', { class: 'btn primary big', onclick: () => {
    const parsed = parseConfigText(ta.value);
    if (!parsed) { msg.textContent = '❌ Das sieht nicht wie die Firebase-Konfiguration aus. Kopiere den ganzen Block { apiKey: …, appId: … }.'; msg.className = 'setup-msg bad'; return; }
    saveLocalConfig(parsed);
    msg.textContent = '✅ Gespeichert! Die App startet neu …'; msg.className = 'setup-msg good';
    setTimeout(() => { location.href = location.href.split('#')[0].split('?')[0]; }, 700);
  } }, 'Speichern & neu starten');

  const extra = [];
  if (cfg) {
    extra.push(h('h2', { class: 'sec-title' }, 'Geschwister einladen'));
    extra.push(h('p', { class: 'setup-p' }, 'Damit alle dieselbe Verbindung nutzen, schicke ihnen diesen Link. Ein Tipp darauf übernimmt die Einstellungen automatisch.'));
    extra.push(h('button', { class: 'btn', onclick: async () => {
      const url = shareConfigLink(cfg);
      try { if (navigator.share) { await navigator.share({ title: 'PartyPlay 6 – Einrichtung', url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
      toast((await copyText(url)) ? 'Link kopiert 📋 – schick ihn per WhatsApp' : 'Kopieren nicht möglich');
    } }, '🔗 Einrichtungs-Link teilen'));
    if (source === 'local') {
      extra.push(h('button', { class: 'btn ghost', onclick: async () => {
        const ok = await dialog({ title: 'Verbindung entfernen?', text: 'Die App läuft danach wieder im Demo-Modus.', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Entfernen', value: true, kind: 'danger' }] });
        if (ok) { clearLocalConfig(); location.href = location.href.split('#')[0].split('?')[0]; }
      } }, 'Verbindung entfernen'));
    }
  }

  const el = h('div', { class: 'screen-body setup scroll' },
    backBar('Online-Party einrichten', onBack),
    status,
    h('p', { class: 'setup-p' }, 'Damit ihr auf verschiedenen Handys zusammen spielen könnt, braucht die App eine kostenlose Firebase-Datenbank. Das geht komplett im Handy-Browser und dauert etwa 10 Minuten. Du musst es nur einmal machen.'),
    step(1, 'Firebase-Projekt anlegen', h('p', null, 'Öffne ', link('https://console.firebase.google.com', 'console.firebase.google.com'), ' und melde dich mit einem Google-Konto an. Tippe auf „Projekt erstellen“, gib einen Namen ein (z. B. partyplay) und schalte Google Analytics aus.')),
    step(2, 'Anonyme Anmeldung einschalten', h('p', null, 'Links im Menü (☰): Build → Authentication → „Jetzt starten“ → Tab „Anmeldemethode“ → „Anonym“ → aktivieren → Speichern.')),
    step(3, 'Realtime Database erstellen', h('p', null, 'Build → Realtime Database → „Datenbank erstellen“. Standort: Belgien (europe-west1). Startmodus egal („Gesperrt“ ist ok).')),
    step(4, 'Regeln einfügen', h('p', null, 'In der Realtime Database oben auf den Tab „Regeln“. Alles löschen, die folgenden Regeln einfügen und auf „Veröffentlichen“ tippen.'), rulesCopy, rulesBox),
    step(5, 'Web-App registrieren & Konfiguration kopieren', h('p', null, 'Projekt-Übersicht (Zahnrad ⚙️ → Projekteinstellungen → Allgemein) → ganz unten „App hinzufügen“ → Web-Symbol </> → Spitzname eingeben → „App registrieren“ (Hosting NICHT anhaken). Dann den Code-Kasten „const firebaseConfig = { … }“ markieren und kopieren.')),
    step(6, 'Hier einfügen', h('p', null, 'Füge die kopierte Konfiguration hier ein:'), ta, msg, save),
    ...extra,
    h('div', { class: 'setup-end' }, 'Tipp: Wer die Konfiguration direkt in die Datei core/firebase.js einträgt, braucht Schritt 6 nicht – dann gilt sie automatisch für alle.'));
  return { el, update: () => {} };
}
