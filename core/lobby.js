// Lobby: Party-Code, Spielerkarten, Bots, Einstellungen (Admin) und Start.
import { h, sheet, toast, dialog, segmented, switchEl, avatarChip } from './ui.js';
import { sfx } from './audio.js';
import { app, AVATARS, COLORS, BOT_LEVELS, BOT_LEVEL_LABEL, MAX_PLAYERS, TEAM_COLORS, CATEGORIES } from './state.js';
import { profile, saveProfile } from './profile.js';
import { cleanName, toList } from './room.js';
import { GAMES } from '../games/registry.js';
import { gameFits } from './pool.js';
import { copyText } from './util.js';

export function inviteLink(code) {
  const base = location.href.split('#')[0].split('?')[0];
  return `${base}?code=${code}`;
}

let qrLoading = null;
function loadQr() {
  if (window.qrcode) return Promise.resolve(window.qrcode);
  if (qrLoading) return qrLoading;
  qrLoading = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js';
    s.onload = () => (window.qrcode ? res(window.qrcode) : rej(new Error('qr')));
    s.onerror = () => { qrLoading = null; rej(new Error('qr')); };
    document.head.appendChild(s);
  });
  return qrLoading;
}

async function showQr(code) {
  try {
    const qrcode = await loadQr();
    const qr = qrcode(0, 'M');
    qr.addData(inviteLink(code));
    qr.make();
    const box = h('div', { class: 'qr-box', html: qr.createSvgTag({ scalable: true, margin: 2 }) });
    dialog({ title: `Party ${code}`, text: 'Scannen und direkt beitreten:', body: box, buttons: [{ label: 'Schließen', value: true, kind: 'primary' }] });
  } catch { toast('QR-Code ist gerade nicht verfügbar (Internet?).'); }
}

async function shareParty(code) {
  const url = inviteLink(code);
  const text = `Komm in meine Party bei PartyPlay 6! Code: ${code}`;
  try {
    if (navigator.share) { await navigator.share({ title: 'PartyPlay 6', text, url }); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const ok = await copyText(`${text}\n${url}`);
  toast(ok ? 'Einladung kopiert 📋' : 'Kopieren nicht möglich');
}

function editMeSheet(room) {
  const me = room.me;
  if (!me) return;
  let name = me.name, avatar = me.avatar;
  const inp = h('input', { class: 'text-input', type: 'text', maxlength: '14', value: name, placeholder: 'Dein Name' });
  inp.addEventListener('input', () => { name = inp.value; });
  const avs = h('div', { class: 'av-grid' });
  const cols = h('div', { class: 'col-row' });
  const o = { close: () => {} };
  const draw = () => {
    avs.innerHTML = '';
    AVATARS.forEach((a) => avs.appendChild(h('button', { class: 'av-btn' + (a === avatar ? ' on' : ''), type: 'button', onclick: () => { avatar = a; draw(); } }, a)));
    cols.innerHTML = '';
    const taken = new Set(room.list().filter((p) => p.uid !== room.uid).map((p) => p.color));
    const cur = room.me ? room.me.color : me.color;
    COLORS.forEach((c) => cols.appendChild(h('button', {
      class: 'col-btn' + (c.id === cur ? ' on' : ''), type: 'button', disabled: taken.has(c.id), style: { background: c.hex }, 'aria-label': c.name,
      onclick: async () => { const ok = await room.setColor(c.id); if (ok) { profile.color = c.id; saveProfile(); } else toast('Die Farbe ist schon vergeben'); draw(); },
    })));
  };
  draw();
  const save = h('button', { class: 'btn primary big', onclick: () => {
    const n = cleanName(name) || me.name;
    profile.name = n; profile.avatar = avatar; saveProfile();
    room.updateMe({ name: n, avatar });
    s.close();
  } }, 'Speichern');
  const s = sheet('Dein Spieler', h('div', { class: 'edit-me' }, h('label', { class: 'lbl' }, 'Name'), inp, h('label', { class: 'lbl' }, 'Figur'), avs, h('label', { class: 'lbl' }, 'Farbe (jede nur einmal)'), cols, save));
}

function playerSheet(party, p) {
  const room = party.room;
  const s = sheet(`${p.avatar} ${p.name}`, h('div', { class: 'act-list' },
    !p.isBot ? h('button', { class: 'btn', onclick: () => { room.transferHost(p.uid); s.close(); toast(`${p.name} ist jetzt Admin 👑`); } }, '👑 Zum Admin machen') : null,
    p.isBot ? h('div', { class: 'seg-wrap' }, h('span', { class: 'lbl' }, 'Bot-Stärke'), segmented(BOT_LEVELS.map((l) => ({ value: l, label: BOT_LEVEL_LABEL[l] })), p.botLevel, (v) => { room.setPlayer(p.uid, { botLevel: v }); s.close(); })) : null,
    h('button', { class: 'btn danger', onclick: () => { room.removePlayer(p.uid); s.close(); } }, p.isBot ? '🗑️ Bot entfernen' : '🚪 Aus der Party werfen')));
}

// ---------------------------------------------------------------------------- Einstellungen
function poolSheet(room) {
  const s0 = room.settings();
  const off = { ...s0.off }, offCats = { ...s0.offCats };
  const body = h('div', { class: 'pool' });
  const sh = sheet('Spiele-Pool', body);
  const draw = () => {
    body.innerHTML = '';
    const nAct = room.active().length, nHum = room.active().filter((p) => !p.isBot).length;
    const cats = Array.from(new Set(GAMES.map((g) => g.category)));
    for (const c of cats) {
      body.appendChild(h('div', { class: 'pool-cat' }, switchEl(!offCats[c], (v) => { if (v) delete offCats[c]; else offCats[c] = true; room.setSettings({ offCats: { ...offCats } }); draw(); }, `${CATEGORIES[c] || ''} ${c}`)));
      for (const g of GAMES.filter((x) => x.category === c)) {
        const fit = gameFits(g, { off: {}, offCats: {} }, nAct, nHum);
        body.appendChild(h('div', { class: 'pool-game' + (offCats[c] ? ' dim' : '') },
          switchEl(!off[g.id], (v) => { if (v) delete off[g.id]; else off[g.id] = true; room.setSettings({ off: { ...off } }); }, `${g.emoji} ${g.name}`),
          h('small', null, fit.ok ? (g.min === g.max ? `${g.min} Spieler` : `${g.min}–${g.max} Spieler`) : fit.reason)));
      }
    }
  };
  draw();
}

function settingsPanel(party) {
  const room = party.room;
  const wrap = h('div', { class: 'settings' });
  let key = '';
  const render = () => {
    const s = room.settings();
    const host = room.isHost;
    const k = JSON.stringify([s, host]);
    if (k === key) return;
    key = k;
    wrap.innerHTML = '';
    const row = (label, ctl) => wrap.appendChild(h('div', { class: 'set-row' }, h('div', { class: 'set-label' }, label), ctl));
    const seg = (opts, val, key2) => segmented(opts, val, (v) => room.setSettings({ [key2]: v }), { disabled: !host });
    const sw = (val, key2) => switchEl(val, (v) => room.setSettings({ [key2]: v }));
    if (!host) wrap.classList.add('ro'); else wrap.classList.remove('ro');
    row('Spielauswahl', seg([{ value: 'admin', label: 'Admin wählt' }, { value: 'vote', label: 'Abstimmung' }, { value: 'random', label: 'Zufall' }], s.mode, 'mode'));
    row('Party-Typ', seg([{ value: 'cup', label: '🏆 Cup' }, { value: 'free', label: '♾️ Freies Spiel' }], s.partyType, 'partyType'));
    if (s.partyType === 'cup') row('Runden im Cup', seg([3, 5, 7, 10].map((n) => ({ value: n, label: String(n) })), s.rounds, 'rounds'));
    row('Jedes Spiel nur einmal', host ? sw(s.onlyOnce, 'onlyOnce') : h('b', null, s.onlyOnce ? 'Ja' : 'Nein'));
    row('Teams', seg([{ value: 'aus', label: 'Zufällig' }, { value: 'zufall', label: 'Pro Runde' }, { value: 'fest', label: 'Fest' }], s.teamMode, 'teamMode'));
    row('Bots auffüllen (bis 4)', host ? sw(s.fillBots, 'fillBots') : h('b', null, s.fillBots ? 'Ja' : 'Nein'));
    row('Bot-Stärke', seg(BOT_LEVELS.map((l) => ({ value: l, label: BOT_LEVEL_LABEL[l] })), s.botLevel, 'botLevel'));
    row('Bot übernimmt bei Verbindungsverlust', host ? sw(s.botTakeover, 'botTakeover') : h('b', null, s.botTakeover ? 'Ja' : 'Nein'));
    row('Spielzeit', seg([{ value: 0.75, label: 'Kurz' }, { value: 1, label: 'Normal' }, { value: 1.5, label: 'Lang' }], s.timeFactor, 'timeFactor'));
    row('Doppelte Punkte im Finale', host ? sw(s.doubleFinal, 'doubleFinal') : h('b', null, s.doubleFinal ? 'Ja' : 'Nein'));
    const nOff = Object.keys(s.off).length + Object.keys(s.offCats).length;
    row('Spiele-Pool', h('button', { class: 'btn small', onclick: () => host ? poolSheet(room) : toast('Nur der Admin kann den Pool ändern.') }, `${GAMES.length - Object.keys(s.off).length} Spiele${nOff ? ' (angepasst)' : ''} ›`));
  };
  render();
  return { el: wrap, update: render };
}

// ---------------------------------------------------------------------------- Lobby
export function lobbyScreen(party) {
  const room = party.room;
  const code = room.code;
  const netNote = !app.online ? h('div', { class: 'demo-note' }, '🧪 Demo-Modus: Diese Party läuft nur auf diesem Gerät. Für Mitspieler auf anderen Handys: Party verlassen → ⚙️ Optionen → „Online-Party einrichten“.') : null;
  const grid = h('div', { class: 'p-grid' });
  const botRow = h('div', { class: 'bot-row' });
  const foot = h('div', { class: 'lobby-foot' });
  const countEl = h('span', { class: 'p-count' });
  const sp = settingsPanel(party);

  const el = h('div', { class: 'screen-body lobby' },
    h('div', { class: 'lobby-left' },
      h('div', { class: 'topbar' },
        h('button', { class: 'icon-btn', onclick: () => party.confirmLeave(), 'aria-label': 'Verlassen' }, '←'),
        h('h1', null, 'Party-Lobby'),
        h('span', { class: 'conn-dot ' + (party.room.online ? 'on' : 'off'), id: 'lobby-conn', title: 'Verbindung' })),
      h('div', { class: 'code-card' },
        h('div', { class: 'code-label' }, 'Party-Code'),
        h('div', { class: 'code-digits' }, code.split('').map((d) => h('span', null, d))),
        h('div', { class: 'code-btns' },
          h('button', { class: 'btn small', onclick: () => shareParty(code) }, '📤 Einladen'),
          h('button', { class: 'btn small', onclick: () => showQr(code) }, '▦ QR'),
          h('button', { class: 'btn small', onclick: async () => { toast((await copyText(inviteLink(code))) ? 'Link kopiert 📋' : 'Kopieren nicht möglich'); } }, '🔗 Link'))),
      botRow,
      h('div', { class: 'lobby-spacer' }),
      foot),
    h('div', { class: 'lobby-right' },
      netNote,
      h('h2', { class: 'sec-title' }, 'Spieler ', countEl),
      grid,
      h('h2', { class: 'sec-title' }, 'Einstellungen'), sp.el));

  const card = (p) => {
    const mine = p.uid === room.uid;
    const host = room.meta && room.meta.hostUid === p.uid;
    const s = room.settings();
    const canEdit = mine || room.isHost;
    const teamBtn = room.isHost && s.teamMode === 'fest'
      ? h('button', { class: 'team-toggle', type: 'button', style: { background: p.team === 1 ? TEAM_COLORS[1].hex : (p.team === 0 ? TEAM_COLORS[0].hex : '#555') },
        onclick: (e) => { e.stopPropagation(); room.setPlayer(p.uid, { team: p.team === 0 ? 1 : 0 }); } }, p.team === 0 ? 'Team 🔴' : p.team === 1 ? 'Team 🔵' : 'Team ?')
      : null;
    return h('div', { class: 'p-card' + (mine ? ' me' : '') + (p.connected === false ? ' off' : ''), style: { '--pc': p.colorHex }, onclick: () => { if (mine) editMeSheet(room); else if (room.isHost) playerSheet(party, p); } },
      h('div', { class: 'p-avatar', style: { background: p.colorHex } }, p.avatar, host ? h('span', { class: 'crown' }, '👑') : null),
      h('div', { class: 'p-name' }, p.name),
      h('div', { class: 'p-sub' }, p.isBot ? `🤖 ${BOT_LEVEL_LABEL[p.botLevel] || ''}` : `Lv ${p.level || 1}`),
      h('div', { class: 'p-status' }, p.connected === false ? '📡 offline' : (p.isBot || p.ready || host ? '✅ bereit' : '⏳ nicht bereit')),
      teamBtn, canEdit && mine ? h('div', { class: 'p-edit' }, '✎') : null);
  };

  const render = () => {
    const list = room.list();
    countEl.textContent = `(${list.length}/${MAX_PLAYERS})`;
    grid.innerHTML = '';
    list.forEach((p) => grid.appendChild(card(p)));
    for (let i = list.length; i < MAX_PLAYERS; i++) grid.appendChild(h('div', { class: 'p-card empty' }, h('div', { class: 'p-avatar ghost' }, '＋'), h('div', { class: 'p-name' }, 'frei')));
    const dot = el.querySelector('#lobby-conn'); if (dot) dot.className = 'conn-dot ' + (room.online ? 'on' : 'off');
    // Bots (Admin)
    botRow.innerHTML = '';
    if (room.isHost) {
      const lvl = room.settings().botLevel;
      botRow.appendChild(h('button', { class: 'btn', disabled: list.length >= MAX_PLAYERS, onclick: async () => { sfx('join'); await room.addBot(lvl); } }, `🤖 Bot hinzufügen (${BOT_LEVEL_LABEL[lvl]})`));
    }
    sp.update();
    // Fußleiste
    foot.innerHTML = '';
    const me = room.me;
    const active = room.active();
    const others = room.humans().filter((p) => p.uid !== room.uid && p.connected !== false);
    const notReady = others.filter((p) => !p.ready);
    if (room.isHost) {
      const enough = active.length >= 2;
      const label = !enough ? 'Mindestens 2 Spieler nötig' : (notReady.length ? `▶ Trotzdem starten (${notReady.length} nicht bereit)` : '▶ Party starten!');
      foot.appendChild(h('button', {
        class: 'btn big ' + (enough && !notReady.length ? 'primary pulse' : 'warn'), disabled: !enough,
        onclick: () => { sfx('go'); party.driver.run(() => party.driver.startParty()).catch(() => {}); },
      }, label));
      foot.appendChild(h('div', { class: 'foot-hint' }, 'Du bist Admin 👑 – du entscheidest, wann es losgeht.'));
    } else {
      const ready = !!(me && me.ready);
      foot.appendChild(h('button', { class: 'btn big ' + (ready ? 'green' : 'primary'), onclick: () => { sfx('ready'); room.setReady(!ready); } }, ready ? '✅ Bereit – tippen zum Abbrechen' : '👍 Ich bin bereit'));
      foot.appendChild(h('div', { class: 'foot-hint' }, 'Warte, bis der Admin die Party startet …'));
    }
  };
  render();
  return { el, update: render };
}
