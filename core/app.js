// Start der App: Verbindung, Startseite, Beitreten, Solo-Training, Spiele-Bibliothek, Profil, Optionen.
import { h, $, showScreen, toast, dialog, sheet, backBar, switchEl, segmented, installButtonFx, clear } from './ui.js';
import { installAudioUnlock, sfx, applyAudioSettings, unlockAudio } from './audio.js';
import { app, AVATARS, COLORS, BOT_LEVELS, BOT_LEVEL_LABEL, CATEGORIES, on, emit } from './state.js';
import { profile, saveProfile, levelInfo } from './profile.js';
import { connectTransport, createSoloTransport } from './transport.js';
import { consumeConfigFromUrl } from './firebase.js';
import { Room, cleanName } from './room.js';
import { Party } from './party.js';
import { GAMES } from '../games/registry.js';
import { setupScreen } from './setup.js';
import { waitingScreen } from './screens.js';
import { lsDel } from './util.js';

const VERSION = 'Etappe 1';

// ---------------------------------------------------------------------------- Hilfen
let busyEl = null;
function busy(text) {
  hideBusy();
  busyEl = h('div', { class: 'busy' }, h('div', { class: 'spinner' }), h('div', null, text));
  document.body.appendChild(busyEl);
}
function hideBusy() { if (busyEl) { busyEl.remove(); busyEl = null; } }

function playerInfo() { return { name: profile.name, avatar: profile.avatar, color: profile.color, level: levelInfo().level }; }

async function ensureName() {
  if (cleanName(profile.name)) return true;
  const inp = h('input', { class: 'text-input', type: 'text', maxlength: '14', placeholder: 'Dein Name', autocomplete: 'off' });
  const ok = await dialog({ title: 'Wie heißt du?', body: inp, buttons: [{ label: 'Abbrechen', value: false }, { label: 'Los!', value: true, kind: 'primary' }] });
  const n = cleanName(inp.value);
  if (!ok || !n) { if (ok) toast('Bitte einen Namen eingeben'); return false; }
  profile.name = n; saveProfile();
  return true;
}

function enterParty(room, solo = false) {
  const party = new Party(room, { solo, onExit: () => showHome() });
  app.party = party;
  party.start();
}

// ---------------------------------------------------------------------------- Aktionen
async function createParty() {
  unlockAudio();
  if (!(await ensureName())) return;
  busy('Party wird erstellt …');
  try { const room = await Room.create(app.tp, playerInfo()); hideBusy(); enterParty(room); }
  catch (e) { hideBusy(); toast(e.message || 'Party konnte nicht erstellt werden', 3500, 'bad'); }
}

async function joinParty(code) {
  unlockAudio();
  if (!(await ensureName())) return false;
  busy('Trete Party bei …');
  try { const room = await Room.join(app.tp, code, playerInfo()); hideBusy(); enterParty(room); return true; }
  catch (e) { hideBusy(); toast(e.message || 'Beitritt nicht möglich', 3500, 'bad'); return false; }
}

function soloSheet() {
  unlockAudio();
  let bots = 3, level = 'mittel';
  const out = h('div', { class: 'solo' });
  const draw = () => {
    clear(out);
    out.appendChild(h('p', { class: 'setup-p' }, 'Übe allein gegen Bots. Du wählst jedes Spiel selbst aus.'));
    out.appendChild(h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, 'Gegner'), segmented([1, 2, 3, 4, 5].map((n) => ({ value: n, label: String(n) })), bots, (v) => { bots = v; draw(); })));
    out.appendChild(h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, 'Stärke'), segmented(BOT_LEVELS.map((l) => ({ value: l, label: BOT_LEVEL_LABEL[l] })), level, (v) => { level = v; draw(); })));
    out.appendChild(h('button', { class: 'btn primary big', onclick: () => { s.close(); startSolo(bots, level); } }, '▶ Training starten'));
  };
  const s = sheet('🤖 Solo-Training', out);
  draw();
}

async function startSolo(bots, level) {
  if (!(await ensureName())) return;
  busy('Training wird vorbereitet …');
  try {
    if (!app.localTp) app.localTp = await createSoloTransport();
    const room = await Room.create(app.localTp, playerInfo());
    await room.setSettings({ partyType: 'free', mode: 'admin', onlyOnce: false, botLevel: level, doubleFinal: false });
    for (let i = 0; i < bots; i++) await room.addBot(level);
    hideBusy();
    enterParty(room, true);
    app.party.driver.run(() => app.party.driver.startParty());
  } catch (e) { hideBusy(); toast(e.message || 'Training konnte nicht starten', 3500, 'bad'); }
}

// ---------------------------------------------------------------------------- Startseite
export function showHome() {
  app.party = null;
  const li = levelInfo();
  const conn = h('div', { class: 'conn-pill ' + (app.online ? 'on' : 'demo') }, h('span', { class: 'conn-dot ' + (app.online ? 'on' : 'off') }), app.online ? 'Online' : 'Demo');
  const nameInp = h('input', { class: 'name-input', type: 'text', maxlength: '14', placeholder: 'Dein Name', value: profile.name, autocomplete: 'off', 'aria-label': 'Dein Name' });
  nameInp.addEventListener('input', () => { profile.name = nameInp.value; saveProfile(); });
  const avBtn = h('button', { class: 'av-pick', type: 'button', style: { background: (COLORS.find((c) => c.id === profile.color) || COLORS[0]).hex }, onclick: () => avatarSheet(() => { avBtn.textContent = profile.avatar; }) }, profile.avatar);

  const el = h('div', { class: 'screen-body home' },
    h('div', { class: 'home-top' },
      h('div', { class: 'lv-chip' }, h('div', { class: 'lv-badge' }, 'Lv ' + li.level), h('div', { class: 'lv-bar' }, h('div', { class: 'lv-fill', style: { width: li.frac * 100 + '%' } }))),
      h('div', { class: 'coin-chip' }, '🪙 ' + profile.coins), conn),
    h('div', { class: 'home-left' },
      h('div', { class: 'logo' }, h('div', { class: 'logo-emoji' }, '🎉'), h('h1', null, 'PartyPlay ', h('span', { class: 'six' }, '6')), h('p', null, 'Minispiele für bis zu 6 Spieler – jeder auf dem eigenen Handy')),
      h('div', { class: 'name-row' }, avBtn, nameInp),
      !app.online ? h('button', { class: 'setup-banner', type: 'button', onclick: showSetup },
        app.netError ? `⚠️ Online-Verbindung fehlgeschlagen – Anleitung` : '🧪 Online-Party nicht eingerichtet – Anleitung') : null),
    h('div', { class: 'menu home-right' },
      h('button', { class: 'btn big primary', onclick: createParty }, '🎉 Party erstellen'),
      h('button', { class: 'btn big blue', onclick: () => showJoin() }, '🔑 Party beitreten'),
      h('button', { class: 'btn big green', onclick: soloSheet }, '🤖 Solo-Training'),
      h('div', { class: 'menu-row' },
        h('button', { class: 'btn', onclick: showLibrary }, '📚 Spiele'),
        h('button', { class: 'btn', onclick: showProfile }, '👤 Profil'),
        h('button', { class: 'btn', onclick: showSettings }, '⚙️ Optionen')),
      h('div', { class: 'menu-row soon' },
        h('button', { class: 'btn disabled', onclick: () => toast('🛒 Der Shop kommt in einer späteren Etappe!') }, '🛒 Shop · bald'),
        h('button', { class: 'btn disabled', onclick: () => toast('👥 Freunde kommen in einer späteren Etappe!') }, '👥 Freunde · bald'))),
    h('div', { class: 'home-foot' }, `PartyPlay 6 · ${VERSION}`));
  showScreen('home', { el, update: () => {} });
}

function avatarSheet(done) {
  const grid = h('div', { class: 'av-grid' });
  const cols = h('div', { class: 'col-row' });
  const draw = () => {
    clear(grid); clear(cols);
    AVATARS.forEach((a) => grid.appendChild(h('button', { class: 'av-btn' + (a === profile.avatar ? ' on' : ''), type: 'button', onclick: () => { profile.avatar = a; saveProfile(); draw(); done && done(); } }, a)));
    COLORS.forEach((c) => cols.appendChild(h('button', { class: 'col-btn' + (c.id === profile.color ? ' on' : ''), type: 'button', style: { background: c.hex }, 'aria-label': c.name, onclick: () => { profile.color = c.id; saveProfile(); draw(); done && done(); showHomeColor(c.hex); } })));
  };
  draw();
  sheet('Deine Figur', h('div', null, h('label', { class: 'lbl' }, 'Figur'), grid, h('label', { class: 'lbl' }, 'Lieblingsfarbe (in der Party bekommst du sie, wenn sie frei ist)'), cols));
}
function showHomeColor(hex) { const b = $('.av-pick'); if (b) b.style.background = hex; }

// ---------------------------------------------------------------------------- Beitreten
function showJoin(prefill = '') {
  let code = typeof prefill === 'string' ? prefill.replace(/\D/g, '').slice(0, 4) : '';
  const digits = h('div', { class: 'join-digits' });
  const draw = () => {
    clear(digits);
    for (let i = 0; i < 4; i++) digits.appendChild(h('div', { class: 'join-d' + (i === code.length ? ' cur' : '') }, code[i] || ''));
  };
  const go = async () => {
    if (code.length !== 4) { toast('Der Code hat 4 Ziffern'); return; }
    const ok = await joinParty(code);
    if (!ok) { code = ''; draw(); }
  };
  const press = (k) => {
    sfx('tap');
    if (k === 'del') code = code.slice(0, -1);
    else if (code.length < 4) code += k;
    draw();
    if (code.length === 4) setTimeout(go, 180);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'del', '0', 'ok'];
  const pad = h('div', { class: 'numpad' }, keys.map((k) => h('button', {
    class: 'num-key' + (k === 'ok' ? ' ok' : '') + (k === 'del' ? ' del' : ''), type: 'button',
    onclick: () => (k === 'ok' ? go() : press(k)),
  }, k === 'del' ? '⌫' : k === 'ok' ? '✓' : k)));
  draw();
  const onKey = (e) => { if (/^\d$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('del'); else if (e.key === 'Enter') go(); };
  window.addEventListener('keydown', onKey);
  showScreen('join', {
    el: h('div', { class: 'screen-body join' }, backBar('Party beitreten', showHome), h('div', { class: 'join-left' }, h('p', { class: 'screen-sub' }, 'Gib den 4-stelligen Code deines Admins ein'), digits), pad),
    update: () => {}, destroy: () => window.removeEventListener('keydown', onKey),
  });
}

// ---------------------------------------------------------------------------- Bibliothek, Profil, Optionen, Einrichtung
function showLibrary() {
  const list = h('div', { class: 'lib-list' });
  for (const g of GAMES) {
    const det = h('div', { class: 'lib-det' },
      h('ul', null, g.howTo.map((t) => h('li', null, t))),
      h('div', { class: 'lib-tags' }, h('span', null, `${CATEGORIES[g.category] || ''} ${g.category}`), h('span', null, g.min === g.max ? `${g.min} Spieler` : `${g.min}–${g.max} Spieler`), g.teams === 'only' ? h('span', null, '🧑‍🤝‍🧑 Teams') : null, g.duel ? h('span', null, '⚔️ Duell') : null, h('span', null, `⏱ ${g.duration} s`)),
      h('p', { class: 'lib-wert' }, 'Wertung: ' + g.wertung));
    const card = h('button', { class: 'lib-card', type: 'button', onclick: () => card.classList.toggle('open') },
      h('div', { class: 'lib-head' }, h('span', { class: 'lib-emoji' }, g.emoji), h('span', { class: 'lib-name' }, g.name), h('span', { class: 'lib-chev' }, '›')), det);
    list.appendChild(card);
  }
  showScreen('library', { el: h('div', { class: 'screen-body scroll' }, backBar('Spiele', showHome), h('p', { class: 'screen-sub' }, `${GAMES.length} Spiele – mehr kommen mit jeder Etappe!`), list), update: () => {} });
}

function showProfile() {
  const li = levelInfo();
  const st = profile.stats;
  const avBtn = h('button', { class: 'av-pick big', type: 'button', style: { background: (COLORS.find((c) => c.id === profile.color) || COLORS[0]).hex }, onclick: () => avatarSheet(() => showProfile()) }, profile.avatar);
  const stat = (n, l) => h('div', { class: 'stat' }, h('b', null, String(n)), h('span', null, l));
  showScreen('profile', {
    el: h('div', { class: 'screen-body scroll' }, backBar('Profil', showHome),
      h('div', { class: 'prof-card' }, avBtn, h('div', { class: 'prof-name' }, profile.name || 'Spieler'), h('div', { class: 'prof-lv' }, `Level ${li.level}`),
        h('div', { class: 'lv-bar wide' }, h('div', { class: 'lv-fill', style: { width: li.frac * 100 + '%' } })), h('small', null, `${li.into} / ${li.need} XP bis Level ${li.level + 1}`)),
      h('div', { class: 'stats' }, stat('🪙 ' + profile.coins, 'Münzen'), stat(st.parties, 'Partys'), stat(st.wins, 'Party-Siege'), stat(st.rounds, 'Runden'), stat(st.roundWins, 'Rundensiege'))),
    update: () => {},
  });
}

function showSettings() {
  const row = (label, key) => h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, label), switchEl(profile.settings[key], (v) => { profile.settings[key] = v; saveProfile(); applyAudioSettings(); }));
  const s = profile.settings;
  showScreen('settings', {
    el: h('div', { class: 'screen-body scroll' }, backBar('Optionen', showHome),
      h('div', { class: 'settings' }, row('🎵 Musik', 'music'), row('🔊 Sound', 'sound'), row('📳 Vibration', 'vibration'),
        h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, 'Tipp-Button (Tippspiele)'), segmented([{ value: 'L', label: '◀ Links' }, { value: 'R', label: 'Rechts ▶' }], profile.settings.tapSide, (v) => { profile.settings.tapSide = v; saveProfile(); })),
        h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, '⛶ Vollbild'), switchEl(!!document.fullscreenElement, (v) => { v ? goFullscreen() : (document.exitFullscreen && document.exitFullscreen().catch(() => {})); }))),
      h('h2', { class: 'sec-title' }, 'Online-Party'),
      h('div', { class: 'conn-card ' + (app.online ? 'ok' : 'warn') }, app.online ? '✅ Online verbunden' : (app.netError ? '⚠️ ' + app.netError : '🧪 Demo-Modus (nur dieses Gerät)')),
      h('button', { class: 'btn primary', onclick: showSetup }, '🌐 Online-Party einrichten'),
      h('h2', { class: 'sec-title' }, 'Sonstiges'),
      h('button', { class: 'btn ghost', onclick: async () => {
        const ok = await dialog({ title: 'Profil zurücksetzen?', text: 'Name, Level, Münzen und Statistik werden gelöscht.', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Zurücksetzen', value: true, kind: 'danger' }] });
        if (ok) { lsDel('pp6.profile.v1'); location.reload(); }
      } }, '🗑️ Profil zurücksetzen'),
      h('p', { class: 'credits' }, 'PartyPlay 6 · Minispiel-Sammlung im Stil von „2 3 4 Player Games“. Alle Sounds und Grafiken werden im Spiel selbst erzeugt – keine Werbung, kein Echtgeld.')),
    update: () => {},
  });
}

function showSetup() { showScreen('setup', setupScreen({ onBack: showSettings })); }

// ---------------------------------------------------------------------------- Start
async function restoreFlow(sess) {
  const names = { lobby: 'in der Lobby', finished: 'bei der Siegerehrung' };
  const ok = await dialog({
    title: 'Zurück zur Party?', text: `Du warst in Party ${sess.code} (${names[sess.status] || 'mitten im Spiel'}).`,
    buttons: [{ label: 'Nein', value: false }, { label: 'Ja, zurück!', value: true, kind: 'primary' }], dismissable: false,
  });
  if (ok) await joinParty(sess.code); else Room.forget();
}

/** Vollbild + Querformat sperren (klappt auf Android; auf dem iPhone hilft nur „Zum Home-Bildschirm“). */
export async function goFullscreen() {
  try { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { /* egal */ }
  lockLandscape();
}
function lockLandscape() {
  try { if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {}); } catch { /* egal */ }
}

export async function boot() {
  window.__pp6 = { app, Room }; // praktisch zum Testen/Debuggen in der Konsole
  installButtonFx(); installAudioUnlock();
  lockLandscape();
  consumeConfigFromUrl();
  try { if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('./sw.js').catch(() => {}); } catch { /* optional */ }
  showScreen('boot', waitingScreen('Verbinde …'));
  const res = await connectTransport();
  app.tp = res.tp; app.online = res.online; app.netError = res.error;
  app.tp.onConnection((c) => { app.connected = c; emit('net', c); });
  const params = new URLSearchParams(location.search);
  const code = (params.get('code') || '').replace(/\D/g, '').slice(0, 4);
  if (params.has('code')) history.replaceState(null, '', location.href.split('?')[0]);
  showHome();
  if (res.online) {
    const sess = await Room.findSession(app.tp);
    if (sess && sess.code !== code) { await restoreFlow(sess); return; }
  }
  if (code.length === 4) { const ok = await joinParty(code); if (!ok) showJoin(code); }
}
