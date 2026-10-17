import { SOCIAL_ZONES } from '../../../shared/socialCatalog.mjs';
import mapData from './mapData.mjs';

const SAFE_ANCHORS = {
  terrace: [-0.7, 0, -4.1],
  entrance: [0.7, 0, -1.1],
  bar: [0.05, 0, 7.7],
  pool: [2.1, 0, 5.55],
  foosball: [-0.1, 0, 3.15],
  tables: [0.85, 0, 15.5],
};

const ZONE_FLOORS = {
  terrace: 'terrace',
  entrance: 'vestibule',
  bar: 'main-room',
  pool: 'main-room',
  foosball: 'main-room',
  tables: 'main-room',
};

export const ROOM_MAP = mapData;
export const MAX_ZONE_SLOTS = 8;
export const AVATAR_CLEARANCE = 0.16;
export const SLOT_SPACING = 0.42;
export const MAP_ZONES = SOCIAL_ZONES.map(zone => ({ ...zone, anchor: SAFE_ANCHORS[zone.id] || zone.anchor }));

const solidFootprints = mapData.objects.filter(object => object.solid && object.position?.length >= 3 && object.size?.length >= 3);
const floorsByName = new Map(mapData.floorRegions.map(region => [region.name, region]));
const zoneSlots = new Map(MAP_ZONES.map(zone => [zone.id, findZoneSlots(zone)]));

export function getZonePosition(zoneId, offset = 0) {
  const slot = Math.trunc(offset);
  if (!Number.isFinite(slot) || slot < 0 || slot >= MAX_ZONE_SLOTS) return null;
  const candidates = zoneSlots.get(zoneId) || zoneSlots.get(MAP_ZONES[0].id);
  return candidates[slot] || null;
}

export function isSafeZonePoint(zoneId, x, z) {
  const region = floorsByName.get(ZONE_FLOORS[zoneId] || 'main-room');
  if (!region || x < region.minX + AVATAR_CLEARANCE || x > region.maxX - AVATAR_CLEARANCE || z < region.minZ + AVATAR_CLEARANCE || z > region.maxZ - AVATAR_CLEARANCE) return false;
  return !solidFootprints.some(object => {
    const dx = Math.abs(x - object.position[0]);
    const dz = Math.abs(z - object.position[2]);
    return dx < object.size[0] / 2 + AVATAR_CLEARANCE && dz < object.size[2] / 2 + AVATAR_CLEARANCE;
  });
}

export function findZoneSlots(zone) {
  const [anchorX, , anchorZ] = zone.anchor;
  const region = floorsByName.get(ZONE_FLOORS[zone.id] || 'main-room');
  if (!region) return [];
  const candidates = [];
  const step = SLOT_SPACING;
  for (let x = region.minX + AVATAR_CLEARANCE; x <= region.maxX - AVATAR_CLEARANCE; x += step) {
    for (let z = region.minZ + AVATAR_CLEARANCE; z <= region.maxZ - AVATAR_CLEARANCE; z += step) {
      if (!isSafeZonePoint(zone.id, x, z)) continue;
      const distance = Math.hypot(x - anchorX, z - anchorZ);
      candidates.push({ x, z, distance });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.x - b.x || a.z - b.z);
  const selected = [];
  for (const candidate of candidates) {
    if (selected.some(point => Math.hypot(point[0] - candidate.x, point[2] - candidate.z) < step - 0.005)) continue;
    selected.push([candidate.x, zone.anchor[1], candidate.z]);
    if (selected.length === MAX_ZONE_SLOTS) return selected;
  }
  return selected;
}
