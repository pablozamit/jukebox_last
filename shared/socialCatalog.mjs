const item = (id, category, es, en, color, style, price = 0, achievement = null) => ({
  id, category, label: { es, en }, color, style, price, achievement,
  source: achievement ? 'achievement' : price ? 'shop' : 'starter', active: true,
});

export const SOCIAL_CATALOG = Object.freeze([
  item('tee-cream', 'top', 'Camiseta crema', 'Cream tee', '#e9dec5', 'tee'),
  item('tee-teal', 'top', 'Camiseta petróleo', 'Teal tee', '#276d70', 'tee'),
  item('jeans', 'bottom', 'Vaqueros', 'Jeans', '#3c526a', 'jeans'),
  item('sneakers', 'shoes', 'Zapatillas', 'Sneakers', '#ece5d5', 'sneakers'),
  item('hair-short', 'hair', 'Pelo corto', 'Short hair', '#38261e', 'short'),
  item('hair-mid', 'hair', 'Media melena', 'Medium hair', '#67442c', 'mid'),
  item('hair-none', 'hair', 'Sin pelo', 'No hair', '#bf9471', 'none'),
  item('tee-amber', 'top', 'Camiseta ámbar', 'Amber tee', '#d89839', 'tee', 50),
  item('hair-curly', 'hair', 'Rizos', 'Curls', '#2f201b', 'curly', 50),
  item('jacket-denim', 'top', 'Chaqueta vaquera', 'Denim jacket', '#537da1', 'jacket', 100),
  item('boots', 'shoes', 'Botas', 'Boots', '#4e3525', 'boots', 100),
  item('jacket-dj', 'top', 'Chaqueta de DJ', 'DJ jacket', '#9d4b6b', 'jacket', 200),
  item('cap', 'accessory', 'Gorra', 'Cap', '#305e59', 'cap', 200),
  item('bracelet-music', 'accessory', 'Pulsera musical', 'Music bracelet', '#cfa34d', 'bracelet', 0, 'first_vote'),
  item('tee-stage', 'top', 'Camiseta del escenario', 'Stage tee', '#8e4141', 'star', 0, 'protagonist'),
  item('jacket-hits', 'top', 'Chaqueta de éxitos', 'Hitmaker jacket', '#cfac57', 'jacket', 0, 'hitmaker'),
  item('glasses-star', 'accessory', 'Gafas de estrella', 'Star glasses', '#debd63', 'glasses', 0, 'influencer'),
  item('hair-streak', 'hair', 'Mechón de color', 'Colour streak', '#a84f75', 'streak', 0, 'streak'),
  item('tee-catrina', 'top', 'Camiseta La Catrina', 'La Catrina tee', '#335f51', 'star', 0, 'loyal'),
  item('cap-sunrise', 'accessory', 'Gorra amanecer', 'Sunrise cap', '#d4884e', 'cap', 0, 'early_bird'),
  item('moon', 'accessory', 'Luna', 'Moon', '#b7afdc', 'moon', 0, 'night_owl'),
]);
export const CATALOG_BY_ID = Object.fromEntries(SOCIAL_CATALOG.map(entry => [entry.id, entry]));
export const STARTER_IDS = SOCIAL_CATALOG.filter(entry => entry.source === 'starter').map(entry => entry.id);
export const DEFAULT_EQUIPPED = Object.freeze({ hair: 'hair-short', top: 'tee-cream', bottom: 'jeans', shoes: 'sneakers', accessory: null });
export const CATEGORIES = Object.freeze(['hair', 'top', 'bottom', 'shoes', 'accessory']);
export const ACHIEVEMENT_IDS = Object.freeze(['first_vote', 'protagonist', 'hitmaker', 'influencer', 'streak', 'loyal', 'early_bird', 'night_owl']);
export const SOCIAL_ZONES = Object.freeze([
  { id: 'terrace', label: { es: 'Terraza', en: 'Terrace' }, anchor: [0, 0, -4] },
  { id: 'entrance', label: { es: 'Entrada', en: 'Entrance' }, anchor: [0, 0, 1] },
  { id: 'bar', label: { es: 'Barra', en: 'Bar' }, anchor: [-0.5, 0, 10] },
  { id: 'pool', label: { es: 'Billar', en: 'Pool' }, anchor: [0, 0, 5] },
  { id: 'foosball', label: { es: 'Futbolín', en: 'Foosball' }, anchor: [-0.5, 0, 3] },
  { id: 'tables', label: { es: 'Mesas', en: 'Tables' }, anchor: [0.6, 0, 15] },
]);
export const INVITATION_TYPES = Object.freeze(['drink', 'pool', 'foosball']);
export const INVITATION_TTL_MS = 300000;
export const HEARTBEAT_MS = 60000;
export function visibleCount(buckets = {}, now = Date.now()) {
  return Object.entries(buckets).reduce((sum, [expiry, count]) => sum + (Number(expiry) > now ? Math.max(0, Number(count) || 0) : 0), 0);
}
