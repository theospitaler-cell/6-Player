// Freunde-Oberfläche: Liste mit Anwesenheit, Anfragen, Freunde hinzufügen, eigener Code.
import { h, backBar, toast, dialog, avatarChip, clear, sheet } from './ui.js';
import { app } from './state.js';
import { friends, showCode, agoText } from './friends.js';
import { profile } from './profile.js';
import { copyText } from './util.js';
import { sfx } from './audio.js';

export function friendLink() {
  const base = location.href.split('#')[0].split('?')[0];
  return `${base}?friend=${friends.code}`;
}

async function shareCode() {
  const url = friendLink();
  const text = `Sei mein Freund bei PartyPlay 6! Mein Freundescode: ${showCode(friends.code)}`;
  try { if (navigator.share) { await navigator.share({ title: 'PartyPlay 6', text, url }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
  toast((await copyText(`${text}\n${url}`)) ? 'Einladung kopiert 📋' : 'Kopieren nicht möglich');
}

export function friendsScreen({ onBack, onJoin, onSetup }) {
  let tab = 'list';
  const body = h('div', { class: 'fr-body' });
  const tabs = h('div', { class: 'seg tabs' });
  const tabBtns = {};
  const chip = (p) => avatarChip(p, { size: 46 });

  const demo = () => h('div', { class: 'fr-demo' },
    h('div', { class: 'big-emoji' }, '🧪'),
    h('p', null, 'Freunde brauchen die Online-Verbindung. Im Demo-Modus sind sie nicht verfügbar.'),
    h('button', { class: 'btn primary', type: 'button', onclick: onSetup }, '🌐 Online-Party einrichten'));

  const statusOf = (f) => (f.room ? h('span', { class: 'fr-st party' }, `🎮 In Party ${f.room}`) : f.online ? h('span', { class: 'fr-st on' }, '🟢 Online') : h('span', { class: 'fr-st' }, '⚫ ' + agoText(f.lastSeen, app.tp.serverNow())));

  const listTab = () => {
    const fl = friends.list(), inv = friends.inviteList();
    const out = h('div', null);
    if (inv.length) {
      out.appendChild(h('h2', { class: 'sec-title' }, '📨 Einladungen'));
      inv.forEach((i) => out.appendChild(h('div', { class: 'fr-row invite' },
        h('div', { class: 'fr-em' }, i.avatar || '🙂'), h('div', { class: 'fr-info' }, h('b', null, i.name || 'Freund'), h('small', null, `lädt dich in Party ${i.code} ein`)),
        h('button', { class: 'btn small primary', type: 'button', onclick: () => { friends.dismissInvite(i.uid); onJoin(i.code); } }, 'Beitreten'),
        h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Ablehnen', onclick: () => friends.dismissInvite(i.uid) }, '✕'))));
    }
    if (!fl.length) {
      out.appendChild(h('div', { class: 'fr-empty' }, h('div', { class: 'big-emoji' }, '👥'), h('p', null, 'Noch keine Freunde.'), h('button', { class: 'btn primary', type: 'button', onclick: () => { tab = 'add'; draw(); } }, '➕ Freund hinzufügen')));
      return out;
    }
    out.appendChild(h('h2', { class: 'sec-title' }, `Freunde (${fl.length})`));
    fl.forEach((f) => out.appendChild(h('div', { class: 'fr-row' + (f.online ? ' online' : '') },
      chip(f), h('div', { class: 'fr-info' }, h('b', null, f.name), h('small', null, `Lv ${f.level}`), statusOf(f)),
      f.room ? h('button', { class: 'btn small primary', type: 'button', onclick: () => onJoin(f.room) }, 'Beitreten') : null,
      h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Entfernen', onclick: async () => {
        const ok = await dialog({ title: `${f.name} entfernen?`, text: 'Ihr seid danach nicht mehr befreundet.', buttons: [{ label: 'Abbrechen', value: false }, { label: 'Entfernen', value: true, kind: 'danger' }] });
        if (ok) { await friends.removeFriend(f.uid); toast('Freund entfernt'); }
      } }, '🗑️'))));
    return out;
  };

  const reqTab = () => {
    const rl = friends.requestList();
    if (!rl.length) return h('div', { class: 'fr-empty' }, h('div', { class: 'big-emoji' }, '📭'), h('p', null, 'Keine offenen Anfragen.'));
    return h('div', null, rl.map((r) => h('div', { class: 'fr-row' },
      h('div', { class: 'fr-em' }, r.avatar), h('div', { class: 'fr-info' }, h('b', null, r.name), h('small', null, 'möchte dein Freund sein')),
      h('button', { class: 'btn small primary', type: 'button', onclick: async () => { sfx('join'); await friends.accept(r.uid); toast(`${r.name} ist jetzt dein Freund 🎉`); } }, 'Annehmen'),
      h('button', { class: 'btn small ghost', type: 'button', 'aria-label': 'Ablehnen', onclick: () => friends.decline(r.uid) }, '✕'))));
  };

  const inp = h('input', { class: 'text-input code-in', type: 'text', maxlength: '8', placeholder: 'ABC-DEF', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
  const addTab = () => h('div', { class: 'fr-add' },
    h('div', { class: 'fr-mycode' }, h('small', null, 'Dein Freundescode'), h('div', { class: 'fr-code' }, showCode(friends.code) || '…'),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', type: 'button', onclick: async () => toast((await copyText(showCode(friends.code))) ? 'Code kopiert 📋' : 'Kopieren nicht möglich') }, '📋 Kopieren'),
        h('button', { class: 'btn small primary', type: 'button', onclick: shareCode }, '📤 Teilen'))),
    h('label', { class: 'lbl' }, 'Code eines Freundes eingeben'), inp,
    h('button', { class: 'btn primary big', type: 'button', onclick: async () => {
      const r = await friends.addByCode(inp.value);
      if (!r.ok) { sfx('error'); toast(r.reason, 3200, 'bad'); return; }
      inp.value = '';
      sfx('ready'); toast(r.accepted ? 'Ihr seid jetzt befreundet 🎉' : 'Anfrage gesendet ✔', 3000);
    } }, 'Anfrage senden'));

  const draw = () => {
    clear(body);
    if (!app.online) { body.appendChild(demo()); return; }
    if (!friends.ready) { body.appendChild(h('div', { class: 'fr-empty' }, h('div', { class: 'spinner' }), h('p', null, 'Verbinde …'))); return; }
    body.appendChild(tab === 'list' ? listTab() : tab === 'req' ? reqTab() : addTab());
    for (const [id, b] of Object.entries(tabBtns)) b.classList.toggle('on', id === tab);
    const n = friends.requestList().length;
    tabBtns.req.textContent = n ? `📬 Anfragen (${n})` : '📬 Anfragen';
  };
  [['list', '👥 Freunde'], ['req', '📬 Anfragen'], ['add', '➕ Hinzufügen']].forEach(([id, label]) => {
    const b = h('button', { class: 'seg-btn', type: 'button', onclick: () => { tab = id; draw(); } }, label);
    tabBtns[id] = b; tabs.appendChild(b);
  });
  draw();
  const un = friends.on((what) => { if (what === 'change' || what === 'ready') { if (tab === 'add') return; draw(); } });
  const timer = setInterval(() => { if (tab === 'list') draw(); }, 30000); // „vor x Min“ auffrischen
  return { el: h('div', { class: 'screen-body scroll' }, backBar('Freunde', onBack), tabs, body), update: () => {}, destroy: () => { un(); clearInterval(timer); } };
}

/** „Freunde einladen“ in der Lobby: Liste der Freunde, online zuerst. */
export function inviteSheet(code) {
  const box = h('div', { class: 'fr-invite' });
  let sh = null;
  const draw = () => {
    clear(box);
    if (!app.online) { box.appendChild(h('p', { class: 'setup-p' }, 'Freunde einladen geht nur mit Online-Verbindung.')); return; }
    const fl = friends.list();
    if (!fl.length) { box.appendChild(h('p', { class: 'setup-p' }, 'Du hast noch keine Freunde. Füge sie unter „Freunde“ im Hauptmenü hinzu.')); return; }
    fl.forEach((f) => box.appendChild(h('div', { class: 'fr-row' + (f.online ? ' online' : '') },
      avatarChip(f, { size: 40 }), h('div', { class: 'fr-info' }, h('b', null, f.name), f.room === code ? h('span', { class: 'fr-st on' }, '✔ ist schon in der Party') : f.room ? h('span', { class: 'fr-st party' }, `🎮 In Party ${f.room}`) : f.online ? h('span', { class: 'fr-st on' }, '🟢 Online') : h('span', { class: 'fr-st' }, '⚫ offline')),
      h('button', { class: 'btn small primary', type: 'button', disabled: !f.online || f.room === code, onclick: async () => { try { await friends.invite(f.uid, code); sfx('join'); toast(`Einladung an ${f.name} geschickt 📨`); } catch { toast('Einladung fehlgeschlagen', 2500, 'bad'); } } }, 'Einladen'))));
  };
  draw();
  sh = sheet('👥 Freunde einladen', box, { onClose: () => un() });
  const un = friends.on((w) => { if (w === 'change') draw(); });
  return sh;
}
