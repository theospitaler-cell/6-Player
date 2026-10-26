// Smoke-Test: jedes Spiel mit verschiedenen Spielerzahlen komplett durchspielen (Node, Fake-Canvas).
import assert from 'node:assert/strict';
import { GAMES } from '../games/registry.js';
import { runGame } from './harness.mjs';
import { movesFor as require_moves } from '../games/dame.js';

// Eingaben für Spiele mit eigener Oberfläche (PICK). Schlüssel = Spiel-ID.
export const FUZZ = {
  elfmeter: (inst, uid, rng, t, s) => (inst.ph === 'pick' && rng() < 0.06 ? { z: Math.floor(rng() * 6), n: ++s.n } : null),
  zeichnenraten: (inst, uid, rng, t, s) => (inst.ph === 'draw' && uid !== inst.drawer() && rng() < 0.04 ? { g: rng() < 0.35 ? inst.word() : 'Irrtum', n: ++s.n } : null),
  dame: (inst, uid, rng, t, s) => { const i = inst.idx(uid); if (i !== inst.turn || rng() > 0.2) return null; const ms = inst.b ? require_moves(inst.b, i, inst.must) : []; return ms.length ? { from: ms[0].from, to: ms[0].to } : null; },
  groesse: (inst, uid, rng, t, s) => (inst.ph === 'pick' && rng() < 0.1 ? { a: Math.floor(rng() * 1001), ok: rng() < 0.4 ? 1 : 0, n: ++s.n } : null),
  mehrheit: (inst, uid, rng, t, s) => (inst.ph === 'pick' && rng() < 0.08 ? { pick: Math.floor(rng() * 4), n: ++s.n } : null),
  ssp: (inst, uid, rng, t, s) => (inst.ph === 'pick' && rng() < 0.05 ? { pick: Math.floor(rng() * 3), n: ++s.n } : null),
  farbgedaechtnis: (inst, uid, rng, t, s) => (inst.phase === 'input' && rng() < 0.15 ? { pick: rng() < 0.6 ? inst.seq[inst.pos] : Math.floor(rng() * 4), n: ++s.n } : null),
  quiz: (inst, uid, rng, t, s) => (rng() < 0.12 ? { pick: rng() < 0.55 ? inst.correct : Math.floor(rng() * 4), n: ++s.n } : null),
  schaetzen: (inst, uid, rng, t, s) => (inst.phase === 'ask' && rng() < 0.05 ? { num: Math.max(1, Math.round(inst.rd.n * (0.6 + rng() * 0.8))) } : null),
  winkel: (inst, uid, rng, t, s) => (inst.phase === 'ask' && rng() < 0.05 ? { val: Math.max(0, Math.min(180, Math.round(inst.rd.a + (rng() - 0.5) * 30))) } : null),
  wortblitz: (inst, uid, rng, t, s) => (rng() < 0.1 ? (rng() < 0.2 ? { skip: 1 } : { text: rng() < 0.6 ? inst.word : 'XYZ' }) : null),
  matheblitz: (inst, uid, rng, t, s) => (rng() < 0.08 ? { pick: rng() < 0.5 ? inst.task.correct : Math.floor(rng() * 4), n: ++s.n } : null),
  farbwort: (inst, uid, rng, t, s) => (rng() < 0.1 ? { pick: rng() < 0.5 ? inst.task.ink : Math.floor(rng() * 4), n: ++s.n } : null),
};

const only = process.argv[2];
let ok = 0, fail = 0;
for (const game of GAMES) {
  if (only && game.id !== only) continue;
  const counts = Array.from(new Set([game.min, Math.min(game.max, Math.ceil((game.min + Math.min(game.max, 6)) / 2)), Math.min(game.max, 6)])).filter((c) => c >= 2 || game.min >= 2);
  const t0 = Date.now();
  try {
    let info = [];
    for (const count of counts) {
      for (const seed of [1, 2]) {
        const r = runGame(game, count, { seed, extra: { fuzz: FUZZ[game.id] } });
        assert.ok(r.result.ranks.length === count);
        info.push(`${count}Sp/${r.simTime.toFixed(0)}s`);
      }
    }
    console.log(`  ✓ ${game.emoji} ${game.id.padEnd(16)} ${info.join(' ')}  (${Date.now() - t0} ms)`);
    ok++;
  } catch (e) {
    console.log(`  ✗ ${game.emoji} ${game.id}: ${e.stack.split('\n').slice(0, 4).join('\n      ')}`);
    fail++;
  }
}
console.log(`\n${ok} Spiele ok, ${fail} fehlerhaft`);
process.exit(fail ? 1 : 0);
