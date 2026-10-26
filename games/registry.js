// Spiele-Registry: Ein neues Spiel = eine neue Datei in games/ + eine Zeile hier.
import tipprennen from './tipprennen.js';
import schnellzieher from './schnellzieher.js';
import tauziehen from './tauziehen.js';
import schubser from './schubser.js';
import matheblitz from './matheblitz.js';
import tictactoe from './tictactoe.js';

export const GAMES = [tipprennen, schnellzieher, tauziehen, schubser, matheblitz, tictactoe];
export const byId = Object.fromEntries(GAMES.map((g) => [g.id, g]));
export const STECHEN_GAME = 'schnellzieher'; // Entscheidungsspiel bei Gleichstand an der Spitze
