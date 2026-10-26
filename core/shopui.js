// Shop-Oberfläche: Figuren und Rahmen kaufen und anlegen.
import { h, backBar, toast, dialog, avatarChip, clear } from './ui.js';
import { profile } from './profile.js';
import { FIGURES, FRAMES, TIER_LABEL, buy, owns, equipFrame, equipAvatar } from './shop.js';
import { track } from './progress.js';
import { announce } from './profileui.js';
import { sfx, vibrate } from './audio.js';
import { COLORS } from './state.js';

export function shopScreen({ onBack }) {
  let tab = 'figuren';
  const coin = h('div', { class: 'coin-chip' }, '🪙 ' + profile.coins);
  const grid = h('div', { class: 'shop-grid' });
  const tabs = h('div', { class: 'seg tabs' });
  const colorHex = (COLORS.find((c) => c.id === profile.color) || COLORS[0]).hex;
  const preview = (p) => avatarChip({ avatar: p.avatar, colorHex, frame: p.frame }, { size: 54 });

  const act = async (item) => {
    const isFig = item.kind === 'figur';
    const ownedNow = item.price === 0 || owns(item.id);
    const equipped = isFig ? profile.avatar === item.emoji : profile.equipped.frame === item.frame;
    if (ownedNow) {
      if (equipped) { toast('Schon angelegt ✔'); return; }
      if (isFig ? equipAvatar(item.emoji) : equipFrame(item.frame)) { sfx('ready'); toast(isFig ? `${item.emoji} ist jetzt deine Figur` : `Rahmen „${item.name}“ angelegt`); draw(); }
      return;
    }
    const ok = await dialog({
      title: isFig ? `${item.emoji} ${item.name}` : `Rahmen „${item.name}“`,
      body: h('div', { class: 'shop-dlg' }, isFig ? h('div', { class: 'big-emoji' }, item.emoji) : preview({ avatar: profile.avatar, frame: item.frame }), h('div', { class: 'shop-price' }, `${item.price} 🪙`), h('small', null, `Du hast ${profile.coins} 🪙`)),
      buttons: [{ label: 'Abbrechen', value: false }, { label: `Kaufen für ${item.price} 🪙`, value: true, kind: profile.coins >= item.price ? 'primary' : 'disabled' }],
    });
    if (!ok) return;
    const r = buy(item);
    if (!r.ok) { sfx('error'); toast(r.reason, 2500, 'bad'); return; }
    sfx('coin'); vibrate(40);
    if (isFig) equipAvatar(item.emoji); else equipFrame(item.frame);
    toast(`Gekauft und angelegt! ${isFig ? item.emoji : '🎨'}`);
    announce(track('buy'));
    draw();
  };

  const card = (item) => {
    const isFig = item.kind === 'figur';
    const ownedNow = item.price === 0 || owns(item.id);
    const equipped = isFig ? profile.avatar === item.emoji : profile.equipped.frame === item.frame;
    return h('button', { class: 'shop-card' + (equipped ? ' equipped' : '') + (ownedNow ? ' owned' : '') + (isFig ? ' t-' + item.tier : ''), type: 'button', onclick: () => act(item) },
      isFig ? h('div', { class: 'shop-emoji' }, item.emoji) : h('div', { class: 'shop-emoji' }, preview({ avatar: profile.avatar, frame: item.frame })),
      h('div', { class: 'shop-name' }, item.name),
      isFig ? h('div', { class: 'shop-tier' }, TIER_LABEL[item.tier]) : null,
      h('div', { class: 'shop-state' }, equipped ? '✔ Angelegt' : ownedNow ? 'Anlegen' : `🪙 ${item.price}`));
  };

  const draw = () => {
    coin.textContent = '🪙 ' + profile.coins;
    clear(grid);
    const list = tab === 'figuren' ? FIGURES : FRAMES;
    list.forEach((it) => grid.appendChild(card(it)));
    tabBtns.forEach((b, i) => b.classList.toggle('on', (i === 0) === (tab === 'figuren')));
  };
  const tabBtns = [['figuren', '🦊 Figuren'], ['rahmen', '🖼️ Rahmen']].map(([id, label]) => {
    const b = h('button', { class: 'seg-btn', type: 'button', onclick: () => { tab = id; draw(); } }, label);
    tabs.appendChild(b); return b;
  });
  draw();
  return { el: h('div', { class: 'screen-body shop' }, backBar('Shop', onBack, coin), h('p', { class: 'screen-sub' }, 'Münzen verdienst du in Runden und Partys – kein Echtgeld, keine Werbung.'), tabs, grid), update: () => {} };
}
