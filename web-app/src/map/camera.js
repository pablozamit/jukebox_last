import { MAP_ZONES, ROOM_MAP } from './zones.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = vector => {
  const length = Math.hypot(...vector);
  return vector.map(value => value / length);
};

export function getCameraFov(aspect) {
  const baseHalfFov = 37 * Math.PI / 360;
  const adaptedHalfFov = Math.atan(Math.tan(baseHalfFov) / Math.max(0.25, aspect));
  return Math.max(37, Math.min(52, adaptedHalfFov * 360 / Math.PI));
}

export function getCameraPose(zoneId, aspect, verticalFov = 37) {
  const zone = MAP_ZONES.find(item => item.id === zoneId);
  const overview = !zone;
  const venueFloors = ROOM_MAP.floorRegions.filter(region => ['terrace', 'vestibule', 'main-room'].includes(region.name));
  const venueBounds = venueFloors.reduce((bounds, region) => ({
    minX: Math.min(bounds.minX, region.minX),
    maxX: Math.max(bounds.maxX, region.maxX),
    minZ: Math.min(bounds.minZ, region.minZ),
    maxZ: Math.max(bounds.maxZ, region.maxZ),
  }), { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity });
  const barFocus = zone?.id === 'bar';
  const target = overview
    ? [0, 1.2, (venueBounds.minZ + venueBounds.maxZ) / 2]
    : barFocus ? [zone.anchor[0], 1.1, 10.9] : [zone.anchor[0], 1.1, zone.anchor[2]];
  const direction = normalize([21, 21, -19.4]);
  const forward = direction.map(value => -value);
  const right = normalize([forward[2], 0, -forward[0]]);
  const up = normalize([
    forward[1] * right[2] - forward[2] * right[1],
    forward[2] * right[0] - forward[0] * right[2],
    forward[0] * right[1] - forward[1] * right[0],
  ]);
  const verticalTangent = Math.tan(verticalFov * Math.PI / 360) * 0.88;
  const horizontalTangent = verticalTangent * Math.max(0.25, aspect);
  let minX = venueBounds.minX;
  let maxX = venueBounds.maxX;
  let minZ = venueBounds.minZ;
  let maxZ = venueBounds.maxZ;
  let minY = -0.3;
  let maxY = 6;
  if (!overview) {
    const span = zone.id === 'terrace' ? [5.2, 3.3] : zone.id === 'tables' ? [4.4, 4.2] : zone.id === 'entrance' ? [2.6, 3.1] : barFocus ? [3.8, 6.8] : [3.8, 3.7];
    minX = zone.anchor[0] - span[0];
    maxX = zone.anchor[0] + span[0];
    minZ = zone.anchor[2] - span[1];
    maxZ = zone.anchor[2] + span[1];
    minY = -0.2;
    maxY = 4.5;
  }
  let distance = 0;
  for (const x of [minX, maxX]) for (const y of [minY, maxY]) for (const z of [minZ, maxZ]) {
    const delta = [x - target[0], y - target[1], z - target[2]];
    const nearerBy = dot(delta, direction);
    distance = Math.max(
      distance,
      nearerBy + Math.abs(dot(delta, right)) / horizontalTangent,
      nearerBy + Math.abs(dot(delta, up)) / verticalTangent,
    );
  }
  distance += overview ? 2 : 1.5;
  return { target, position: target.map((value, index) => value + direction[index] * distance), distance };
}
