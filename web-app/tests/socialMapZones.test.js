import test from 'node:test';
import assert from 'node:assert/strict';
import { AVATAR_CLEARANCE, MAP_ZONES, MAX_ZONE_SLOTS, ROOM_MAP, SLOT_SPACING, getZoneAtPoint, getZonePosition, isSafeZonePoint } from '../src/map/zones.js';

test('taps select the nearest area on the bar floor, not the street', () => {
  for (const zone of MAP_ZONES) assert.equal(getZoneAtPoint(zone.anchor[0], zone.anchor[2]), zone.id);
  assert.equal(getZoneAtPoint(0, -8), null);
  assert.equal(getZoneAtPoint(50, 50), null);
  assert.equal(getZoneAtPoint(NaN, 1), null);
});

test('all eight avatar slots in every social zone stay on walkable floor and clear of solid footprints', () => {
  for (const zone of MAP_ZONES) {
    const positions = Array.from({ length: MAX_ZONE_SLOTS }, (_, slot) => getZonePosition(zone.id, slot));
    assert.equal(positions.length, 8, `${zone.id} slot count`);
    assert.ok(positions.every(Boolean), `${zone.id} has eight positions`);
    for (const [x, , z] of positions) {
      assert.ok(isSafeZonePoint(zone.id, x, z), `${zone.id} position ${x}, ${z} is walkable and clear`);
      for (const object of ROOM_MAP.objects.filter(item => item.solid)) {
        const blockedX = Math.abs(x - object.position[0]) < object.size[0] / 2 + AVATAR_CLEARANCE;
        const blockedZ = Math.abs(z - object.position[2]) < object.size[2] / 2 + AVATAR_CLEARANCE;
        assert.ok(!(blockedX && blockedZ), `${zone.id} position overlaps ${object.name}`);
      }
    }
    for (let a = 0; a < positions.length; a += 1) {
      for (let b = a + 1; b < positions.length; b += 1) {
        const distance = Math.hypot(positions[a][0] - positions[b][0], positions[a][2] - positions[b][2]);
        assert.ok(distance >= SLOT_SPACING - 0.005, `${zone.id} slots ${a} and ${b} overlap`);
      }
    }
  }
});

test('zone slots preserve the terrace group around its declared anchor and cap overflow', () => {
  const terrace = MAP_ZONES.find(zone => zone.id === 'terrace');
  const anchor = getZonePosition('terrace', 0);
  assert.ok(Math.hypot(anchor[0] - terrace.anchor[0], anchor[2] - terrace.anchor[2]) < 0.5);
  assert.equal(getZonePosition('terrace', 8), null);
});
