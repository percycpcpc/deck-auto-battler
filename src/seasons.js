const card = (id, name, cost, atk, hp, extra = {}) => Object.freeze({ id, name, cost, atk, hp, ...extra });
const starter = (id, name, blurb, cards) => Object.freeze({ id, name, blurb, cards: Object.freeze(cards), ids: Object.freeze(cards) });

export const BASE_CARD_POOL = Object.freeze([
  card('dagger_imp', 'Dagger Imp', 1, 2, 2, { tier: 'common' }), card('sellsword', 'Sellsword', 1, 2, 3, { tier: 'common' }),
  card('twinfang', 'Twinfang', 1, 1, 4, { tier: 'rare', keywords: ['windfury'] }),
  card('brood_wisp', 'Brood Wisp', 1, 1, 4, { tier: 'rare', deathrattle: 'summon1' }),
  card('hex_hurler', 'Hex Hurler', 1, 1, 5, { tier: 'rare', battlecry: 'hex_hurler' }),
  card('tax_collector', 'Tax Collector', 1, 1, 4, { tier: 'rare', battlecry: 'tax' }),
  card('chrono_imp', 'Chrono Imp', 1, 1, 4, { tier: 'rare', battlecry: 'chrono' }),
  card('gate_crasher', 'Gate Crasher', 1, 2, 4, { tier: 'rare', battlecry: 'gate' }),
  card('leeching_tick', 'Leeching Tick', 1, 1, 5, { tier: 'rare', onKill: 'grow' }),
  card('squire', 'Squire', 1, 1, 4, { tier: 'rare', battlecry: 'squire' }),
  card('spiteful_imp', 'Spiteful Imp', 1, 1, 4, { tier: 'rare', deathrattle: 'spite' }),
  card('scout', 'Scout', 1, 2, 4, { tier: 'rare', battlecry: 'scout' }),
  card('oathbound', 'Oathbound', 1, 2, 6, { tier: 'common', portraitId: 'aegis_knight' }),
  card('road_ogre', 'Road Ogre', 2, 3, 6, { tier: 'common' }),
  card('aegis_knight', 'Aegis Knight', 2, 2, 7, { tier: 'rare', keywords: ['shield'] }),
  card('venom_hound', 'Venom Hound', 2, 3, 5, { tier: 'rare', keywords: ['poisonous'] }),
  card('plague_bearer', 'Plague Bearer', 2, 2, 9, { tier: 'rare', deathrattle: 'plague' }),
  card('warlord', 'Warlord', 2, 2, 9, { tier: 'rare', aura: 'adjacentAtk' }),
  card('bulwark', 'Bulwark', 2, 1, 9, { tier: 'rare', deathrattle: 'oppositeAtkDown' }),
  card('duelist', 'Duelist', 2, 3, 5, { tier: 'rare', battlecry: 'duelist' }),
  card('hexblade', 'Hexblade', 2, 2, 6, { tier: 'mythic', battlecry: 'hexblade' }),
  card('gravedigger', 'Gravedigger', 2, 2, 6, { tier: 'rare', battlecry: 'gravedigger' }),
  card('meddler', 'Meddler', 2, 2, 6, { tier: 'rare', battlecry: 'meddler' }),
  card('headsman', 'Headsman', 2, 3, 8, { tier: 'rare', onKill: 2, portraitId: 'doomcaller' }),
  card('firebelcher', 'Firebelcher', 2, 2, 9, { tier: 'rare', battlecry: 'firebelch', portraitId: 'plague_bearer' }),
  card('shield_saint', 'Shield Saint', 2, 3, 6, { tier: 'rare', keywords: ['shield'], portraitId: 'aegis_knight' }),
  card('bristleback', 'Bristleback', 2, 1, 9, { tier: 'rare', onDamaged: 3, portraitId: 'venom_hound' }),
  card('colossus', 'Colossus', 3, 6, 9, { tier: 'common' }),
  card('inquisitor', 'Inquisitor', 3, 4, 10, { tier: 'mythic', battlecry: 'inquisitor' }),
  card('brood_queen', 'Brood Queen', 3, 3, 10, { tier: 'mythic', deathrattle: 'summon2x2' }),
  card('doomcaller', 'Doomcaller', 3, 4, 10, { tier: 'mythic', battlecry: 'doom' }),
  card('copycat', 'Copycat', 2, 3, 6, { tier: 'mythic', battlecry: 'copycat' }),
  card('overlord', 'Overlord', 3, 2, 10, { tier: 'mythic', aura: 'all' }),
  card('cultist', 'Cultist', 3, 3, 8, { tier: 'mythic', battlecry: 'cultist' }),
  card('cataclysm', 'Cataclysm', 3, 2, 6, { tier: 'mythic', battlecry: 'cataclysm' }),
  card('quillback_elder', 'Quillback Elder', 3, 3, 13, { tier: 'rare', onSummonPing: 1, portraitId: 'warlord' }),
]);

export const STARTER_IDS = Object.freeze(['dagger_imp', 'sellsword', 'oathbound', 'brood_wisp', 'twinfang', 'hex_hurler', 'oathbound', 'road_ogre']);
export const BASE_STARTERS = Object.freeze([
  starter('oathbound_line', 'Oathbound Line', 'A steady line of proven fighters built to hold and answer.', STARTER_IDS),
  starter('rat_pack', 'Rat Pack', 'Fast, vicious bodies overwhelm the line before it can settle.', ['dagger_imp', 'dagger_imp', 'twinfang', 'sellsword', 'hex_hurler', 'leeching_tick', 'road_ogre', 'duelist']),
  starter('iron_bastion', 'Iron Bastion', 'Durable defenders blunt the assault and win the long battle.', ['oathbound', 'sellsword', 'twinfang', 'brood_wisp', 'aegis_knight', 'bulwark', 'plague_bearer', 'squire']),
]);

const seasonTwoCards = Object.freeze({
  ember_scout: card('ember_scout', 'Ember Scout', 1, 2, 2, { tier: 'common', portraitId: 'scout' }),
  ashguard: card('ashguard', 'Ashguard', 1, 1, 5, { tier: 'rare', keywords: ['shield'], portraitId: 'shield_saint' }),
  cinder_duelist: card('cinder_duelist', 'Cinder Duelist', 1, 2, 4, { tier: 'rare', battlecry: 'duelist', portraitId: 'duelist' }),
  furnace_hound: card('furnace_hound', 'Furnace Hound', 2, 3, 6, { tier: 'rare', keywords: ['poisonous'], portraitId: 'venom_hound' }),
  pyre_keeper: card('pyre_keeper', 'Pyre Keeper', 2, 2, 8, { tier: 'rare', aura: 'adjacentAtk', portraitId: 'warlord' }),
  coalheart: card('coalheart', 'Coalheart', 2, 2, 8, { tier: 'rare', onDamaged: 3, portraitId: 'bristleback' }),
  phoenix_matron: card('phoenix_matron', 'Phoenix Matron', 3, 4, 10, { tier: 'mythic', deathrattle: 'summon2x2', portraitId: 'brood_queen' }),
});

const seasonTwoStarter = starter('ember_vanguard', 'Ember Vanguard', 'Shielded outriders hold the line while a rekindling matron closes.', [
  'ember_scout', 'ember_scout', 'ashguard', 'cinder_duelist', 'furnace_hound', 'pyre_keeper', 'coalheart', 'phoenix_matron',
]);

export const SEASONS = Object.freeze([
  Object.freeze({ id: 'season_1', name: 'Founders March', startsAt: '2026-11-01T00:00:00.000Z', endsAt: '2026-11-29T00:00:00.000Z', starters: BASE_STARTERS, cardDefs: Object.freeze({}), poolExtras: Object.freeze([]), enemyKeyword: null }),
  Object.freeze({ id: 'season_2', name: 'Emberwake', startsAt: '2026-11-29T00:00:00.000Z', endsAt: '2026-12-27T00:00:00.000Z', starters: Object.freeze([seasonTwoStarter]), cardDefs: seasonTwoCards, poolExtras: Object.freeze(Object.keys(seasonTwoCards)), enemyKeyword: 'shield' }),
]);

let nowOverride = null;
const nowMs = now => nowOverride ?? (now instanceof Date ? now.getTime() : Number(now));

export function currentSeason(now = Date.now()) {
  const at = nowMs(now);
  const inWindow = SEASONS.find(season => at >= Date.parse(season.startsAt) && at < Date.parse(season.endsAt));
  if (inWindow) return inWindow;
  return [...SEASONS].reverse().find(season => at >= Date.parse(season.startsAt)) || SEASONS[0];
}

export const activeStarters = now => currentSeason(now).starters;
export function activePool(now) {
  const activeIndex = SEASONS.indexOf(currentSeason(now));
  const ids = new Set([...BASE_CARD_POOL.map(cardDef => cardDef.id), ...SEASONS.slice(0, activeIndex + 1).flatMap(season => season.poolExtras)]);
  return unionPool().filter(cardDef => ids.has(cardDef.id));
}
export function unionPool() {
  return Object.freeze([...BASE_CARD_POOL, ...SEASONS.flatMap(season => Object.values(season.cardDefs))]);
}
export const allStarters = () => Object.freeze(SEASONS.flatMap(season => season.starters));

export let ACTIVE_STARTERS = activeStarters();
export function __setNowOverride(iso) {
  nowOverride = iso == null ? null : Date.parse(iso);
  if (iso != null && !Number.isFinite(nowOverride)) throw new TypeError('Season clock override must be an ISO timestamp');
  ACTIVE_STARTERS = activeStarters();
}
