// Themen-Cups: vorgefertigte Spielelisten (wie die Cups im Original). Spiele tragen Kategorie + tags.
export const CUPS = {
  gemischt: { name: 'Gemischter Cup', emoji: '🎉', desc: 'Von allem etwas', filter: () => true },
  rennen: { name: 'Rennen-Cup', emoji: '🏁', desc: 'Schnell, schneller, am schnellsten', filter: (g) => g.category === 'Rennen' || g.category === 'Reaktion' || (g.tags || []).includes('rennen') },
  arena: { name: 'Arena-Cup', emoji: '🥊', desc: 'Schubsen, schießen, überleben', filter: (g) => g.category === 'Arena' },
  denken: { name: 'Denk-Cup', emoji: '🧠', desc: 'Köpfchen und Brettspiele', filter: (g) => g.category === 'Denken' || g.category === 'Brett' },
  sport: { name: 'Sport-Cup', emoji: '⚽', desc: 'Bälle, Tore und Treffer', filter: (g) => g.category === 'Sport' || (g.tags || []).includes('sport') },
  chaos: { name: 'Chaos-Cup', emoji: '🌀', desc: 'Bomben, Meteoriten und Partyspaß', filter: (g) => (g.tags || []).includes('chaos') || g.category === 'Party' || g.category === 'Koop' || (g.tags || []).includes('party') },
};
export const CUP_IDS = Object.keys(CUPS);
export const cupLabel = (id) => (CUPS[id] ? `${CUPS[id].emoji} ${CUPS[id].name}` : 'Freie Auswahl');
