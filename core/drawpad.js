// Zeichen-Werkzeug (DRAW): Farbpalette, 3 Pinselstärken, Rückgängig, Löschen.
import { h } from './ui.js';
import { vibrate } from './audio.js';

export const PALETTE = ['#111111', '#ffffff', '#ff4d6d', '#ff8a3d', '#ffd23f', '#2fd67b', '#3d8bff', '#b66bff'];
export const SIZES = [3, 7, 14];

export function drawPad(box, { onUndo, onClear } = {}) {
  const st = { c: 0, s: 1 };
  const el = h('div', { class: 'w-drawpad' });
  const colors = h('div', { class: 'dp-colors' });
  const sizes = h('div', { class: 'dp-sizes' });
  const acts = h('div', { class: 'dp-acts' });
  const cb = PALETTE.map((hex, i) => {
    const b = h('button', { class: 'dp-color' + (i === 0 ? ' on' : ''), type: 'button', style: { background: hex }, 'aria-label': 'Farbe ' + (i + 1) });
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); st.c = i; cb.forEach((x, k) => x.classList.toggle('on', k === i)); vibrate(5); });
    colors.appendChild(b); return b;
  });
  const sb = SIZES.map((px, i) => {
    const b = h('button', { class: 'dp-size' + (i === 1 ? ' on' : ''), type: 'button', 'aria-label': 'Stärke ' + (i + 1) }, h('span', { style: { width: px + 4 + 'px', height: px + 4 + 'px' } }));
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); st.s = i; sb.forEach((x, k) => x.classList.toggle('on', k === i)); vibrate(5); });
    sizes.appendChild(b); return b;
  });
  const undo = h('button', { class: 'dp-act', type: 'button' }, '↶ Zurück');
  undo.addEventListener('pointerdown', (e) => { e.preventDefault(); onUndo && onUndo(); vibrate(8); });
  const clr = h('button', { class: 'dp-act', type: 'button' }, '🗑 Löschen');
  clr.addEventListener('pointerdown', (e) => { e.preventDefault(); onClear && onClear(); vibrate(8); });
  acts.append(undo, clr);
  el.append(colors, sizes, acts);
  box.appendChild(el);
  return { el, color: () => PALETTE[st.c], colorIdx: () => st.c, size: () => SIZES[st.s] };
}
