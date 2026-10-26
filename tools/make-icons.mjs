// Erzeugt die App-Icons (PNG) mit Playwright/Chromium. Aufruf: node tools/make-icons.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const html = `<canvas id=c></canvas>`;
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setContent(html);
const draw = (size, maskable) => page.evaluate(({ size, maskable }) => {
  const c = document.getElementById('c');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const S = size;
  const rr = (x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const grad = g.createLinearGradient(0, 0, S, S);
  grad.addColorStop(0, '#7b3ff2'); grad.addColorStop(1, '#3b0f8c');
  g.fillStyle = grad;
  if (maskable) g.fillRect(0, 0, S, S); else { rr(0, 0, S, S, S * 0.22); g.fill(); }
  // Strahlen
  g.save(); g.translate(S / 2, S * 0.48); g.globalAlpha = 0.12; g.fillStyle = '#fff';
  for (let i = 0; i < 12; i++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(0, 0); g.lineTo(S * 0.9, -S * 0.07); g.lineTo(S * 0.9, S * 0.07); g.closePath(); g.fill(); }
  g.restore();
  // Konfetti
  const cols = ['#ff4d6d', '#3d8bff', '#2fd67b', '#ffcf33', '#ff8a3d', '#b66bff'];
  const pos = [[.14, .2, .3], [.82, .16, -.5], [.9, .52, .8], [.1, .62, -.7], [.2, .86, .4], [.78, .86, -.3], [.5, .08, .2], [.62, .93, .9]];
  pos.forEach(([x, y, a], i) => { g.save(); g.translate(S * x, S * y); g.rotate(a); g.fillStyle = cols[i % cols.length]; rr(-S * 0.035, -S * 0.016, S * 0.07, S * 0.032, S * 0.01); g.fill(); g.restore(); });
  // Große 6
  const scale = maskable ? 0.74 : 1;
  g.font = `900 ${S * 0.66 * scale}px system-ui, "Arial Black", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = S * 0.06 * scale; g.strokeStyle = 'rgba(0,0,0,.3)'; g.strokeText('6', S / 2 + S * 0.01, S * 0.54 + S * 0.02);
  g.lineWidth = S * 0.05 * scale; g.strokeStyle = '#fff'; g.strokeText('6', S / 2, S * 0.54);
  g.fillStyle = '#ffd23f'; g.fillText('6', S / 2, S * 0.54);
  // Gesichter-Punkte (6 Spieler)
  const dots = ['#ff4d6d', '#3d8bff', '#2fd67b', '#ffcf33', '#b66bff', '#ff8a3d'];
  dots.forEach((col, i) => { const x = S * (0.5 + (i - 2.5) * 0.105 * scale); const y = S * (0.5 + 0.43 * scale); g.beginPath(); g.arc(x, y, S * 0.04 * scale, 0, 7); g.fillStyle = col; g.fill(); g.lineWidth = S * 0.01; g.strokeStyle = '#fff'; g.stroke(); });
  return c.toDataURL('image/png');
}, { size, maskable });
mkdirSync('icons', { recursive: true });
for (const [name, size, mask] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['icon-maskable-512.png', 512, true], ['apple-touch-icon.png', 180, true]]) {
  const url = await draw(size, mask);
  writeFileSync(`icons/${name}`, Buffer.from(url.split(',')[1], 'base64'));
  console.log('✓', name);
}
await browser.close();
