// Eingabe-Bausteine für PICK-Spiele: Farbwähler, Zahlenblock, Auswahlkarten, Tastatur, Schieberegler.
// Alles per Pointer-Events (sofort, ohne 300-ms-Verzögerung) und ohne native Handy-Tastatur
// (die würde im Querformat den halben Bildschirm verdecken).
import { h } from './ui.js';
import { vibrate, sfx } from './audio.js';

const tap = (el, fn) => el.addEventListener('pointerdown', (e) => { e.preventDefault(); if (!el.classList.contains('lock')) fn(e); });

/** Farbwähler: Knöpfe in Farben. colors = [{id, hex, label?}] */
export function colorGrid(box, colors, onPick, { cols = 2 } = {}) {
  const el = h('div', { class: 'w-colors', style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } });
  const btns = colors.map((c, i) => {
    const b = h('button', { class: 'w-color', type: 'button', style: { background: c.hex }, 'aria-label': c.label || c.id }, c.label || '');
    tap(b, () => { vibrate(8); onPick(i, c); });
    el.appendChild(b);
    return b;
  });
  box.appendChild(el);
  return { el, setEnabled(on) { btns.forEach((b) => b.classList.toggle('lock', !on)); }, flash(i) { btns[i].classList.add('flash'); setTimeout(() => btns[i].classList.remove('flash'), 220); } };
}

/** Auswahlkarten: Textkarten, z. B. Quiz-Antworten. */
export function choiceCards(box, labels, onPick, { cols = 1 } = {}) {
  const el = h('div', { class: 'w-cards', style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } });
  const btns = labels.map((t, i) => {
    const b = h('button', { class: 'w-card', type: 'button' }, t);
    tap(b, () => { vibrate(8); onPick(i); });
    el.appendChild(b);
    return b;
  });
  box.appendChild(el);
  return {
    el, btns,
    setLabels(arr) { btns.forEach((b, i) => { b.textContent = arr[i] == null ? '' : arr[i]; b.classList.remove('good', 'bad', 'picked'); b.style.visibility = arr[i] == null ? 'hidden' : ''; }); },
    setEnabled(on) { btns.forEach((b) => b.classList.toggle('lock', !on)); },
    mark(i, kind) { if (btns[i]) btns[i].classList.add(kind); },
  };
}

/** Zahlenblock mit Anzeige. onSubmit(zahl) beim Tippen auf ✓. */
export function numpad(box, { onSubmit, maxLen = 5, negative = false } = {}) {
  let v = '';
  const disp = h('div', { class: 'w-disp' }, ' ');
  const show = () => { disp.textContent = v === '' ? ' ' : v; };
  const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', negative ? '±' : '⌫', '0', '✓'];
  const grid = h('div', { class: 'w-numpad' });
  const el = h('div', { class: 'w-numwrap' }, disp, grid);
  keys.forEach((k) => {
    const b = h('button', { class: 'w-key' + (k === '✓' ? ' ok' : ''), type: 'button' }, k);
    tap(b, () => {
      vibrate(6); sfx('tap');
      if (k === '✓') { if (v !== '' && v !== '-') { const n = Number(v); onSubmit && onSubmit(n); v = ''; } }
      else if (k === '⌫') v = v.slice(0, -1);
      else if (k === '±') v = v.startsWith('-') ? v.slice(1) : '-' + v;
      else if (v.replace('-', '').length < maxLen) v += k;
      show();
    });
    grid.appendChild(b);
  });
  box.appendChild(el);
  return { el, clear() { v = ''; show(); }, setEnabled(on) { el.classList.toggle('lock', !on); } };
}

const ROWS = ['QWERTZUIOP', 'ASDFGHJKL', 'YXCVBNM'];
/** Bildschirm-Tastatur (nur Buchstaben A–Z). onSubmit(text) beim Tippen auf OK. */
export function keyboard(box, { onSubmit, onChange, onSkip, maxLen = 14, placeholder = 'Tippe deine Antwort …' } = {}) {
  let v = '';
  const disp = h('div', { class: 'w-disp small' }, placeholder);
  const show = () => { disp.textContent = v || placeholder; disp.classList.toggle('ph', !v); onChange && onChange(v); };
  const el = h('div', { class: 'w-kb' }, disp);
  ROWS.forEach((r, ri) => {
    const row = h('div', { class: 'w-kbrow' });
    for (const ch of r) {
      const b = h('button', { class: 'w-kbkey', type: 'button' }, ch);
      tap(b, () => { vibrate(5); if (v.length < maxLen) { v += ch; show(); } });
      row.appendChild(b);
    }
    if (ri === 2) {
      const del = h('button', { class: 'w-kbkey wide', type: 'button' }, '⌫');
      tap(del, () => { v = v.slice(0, -1); show(); });
      row.appendChild(del);
    }
    el.appendChild(row);
  });
  const ok = h('button', { class: 'w-kbkey send', type: 'button' }, 'OK ✓');
  tap(ok, () => { if (v) { const t = v; v = ''; show(); onSubmit && onSubmit(t); } });
  const last = h('div', { class: 'w-kbrow' });
  if (onSkip) { const sk = h('button', { class: 'w-kbkey wide', type: 'button' }, '↻'); tap(sk, () => { v = ''; show(); onSkip(); }); last.appendChild(sk); }
  last.appendChild(ok);
  el.appendChild(last);
  box.appendChild(el);
  show();
  return { el, clear() { v = ''; show(); }, value: () => v, setEnabled(on) { el.classList.toggle('lock', !on); } };
}

/** Schieberegler mit großem Wert und „Abschicken“-Knopf. */
export function slider(box, { min = 0, max = 100, step = 1, value = 50, unit = '', onSubmit, label = 'Abschicken ✓' } = {}) {
  let v = value;
  const out = h('div', { class: 'w-disp' }, `${v}${unit}`);
  const inp = h('input', { type: 'range', class: 'w-range', min: String(min), max: String(max), step: String(step), value: String(v) });
  inp.addEventListener('input', () => { v = Number(inp.value); out.textContent = `${v}${unit}`; });
  const go = h('button', { class: 'w-kbkey send', type: 'button' }, label);
  tap(go, () => onSubmit && onSubmit(v));
  const el = h('div', { class: 'w-slider' }, out, inp, go);
  box.appendChild(el);
  return {
    el,
    setRange(a, b, val) { inp.min = String(a); inp.max = String(b); v = val != null ? val : Math.round((a + b) / 2); inp.value = String(v); out.textContent = `${v}${unit}`; },
    value: () => v, setEnabled(on) { el.classList.toggle('lock', !on); },
  };
}
