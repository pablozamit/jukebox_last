import test from 'node:test';
import assert from 'node:assert/strict';
import { getCameraFov, getCameraPose } from '../src/map/camera.js';
import { MAP_ZONES, ROOM_MAP } from '../src/map/zones.js';

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const normalize = vector => {
  const length = Math.hypot(...vector);
  return vector.map(value => value / length);
};

function assertBoundsFit(pose, aspect, bounds, label) {
  const direction = normalize(pose.position.map((value, index) => value - pose.target[index]));
  const forward = direction.map(value => -value);
  const right = normalize([forward[2], 0, -forward[0]]);
  const up = normalize([
    forward[1] * right[2] - forward[2] * right[1],
    forward[2] * right[0] - forward[0] * right[2],
    forward[0] * right[1] - forward[1] * right[0],
  ]);
  const verticalLimit = Math.tan(getCameraFov(aspect) * Math.PI / 360) * 0.88;
  const horizontalLimit = verticalLimit * aspect;
  for (const x of [bounds.minX, bounds.maxX]) {
    for (const y of [bounds.minY, bounds.maxY]) for (const z of [bounds.minZ, bounds.maxZ]) {
      const delta = [x - pose.target[0], y - pose.target[1], z - pose.target[2]];
      const depth = pose.distance - dot(delta, direction);
      assert.ok(Math.abs(dot(delta, right)) <= depth * horizontalLimit + 1e-6, `horizontal crop for ${label} at aspect ${aspect}`);
      assert.ok(Math.abs(dot(delta, up)) <= depth * verticalLimit + 1e-6, `vertical crop for ${label} at aspect ${aspect}`);
    }
  }
}

const venueFloors = ROOM_MAP.floorRegions.filter(region => ['terrace', 'vestibule', 'main-room'].includes(region.name));
const venueBounds = {
  minX: Math.min(...venueFloors.map(region => region.minX)),
  maxX: Math.max(...venueFloors.map(region => region.maxX)),
  minZ: Math.min(...venueFloors.map(region => region.minZ)),
  maxZ: Math.max(...venueFloors.map(region => region.maxZ)),
  minY: -0.3,
  maxY: 6,
};

test('overview camera fits the venue floors at mobile and wide map sizes', () => {
  for (const aspect of [0.35, 0.72, 0.78, 1.6, 2.2]) {
    assertBoundsFit(getCameraPose(null, aspect), aspect, venueBounds, 'venue overview');
  }
});

test('initial bar framing fits its room and counter at mobile and wide map sizes', () => {
  for (const aspect of [0.35, 0.72, 0.78, 1.6, 2.2]) {
    const pose = getCameraPose('bar', aspect);
    assert.ok(pose.distance < getCameraPose(null, aspect).distance, `bar should be closer at aspect ${aspect}`);
    assertBoundsFit(pose, aspect, {
      minX: 0.05 - 3.8,
      maxX: 0.05 + 3.8,
      minZ: 10.9 - 6.8,
      maxZ: 10.9 + 6.8,
      minY: -0.2,
      maxY: 4.5,
    }, 'initial bar view');
  }
});

test('zone focus zooms in and overview restores the original full-room pose', () => {
  const overview = getCameraPose(null, 0.78);
  for (const zone of MAP_ZONES) {
    const focused = getCameraPose(zone.id, 0.78);
    assert.ok(focused.distance < overview.distance, `${zone.id} should be closer than overview`);
    assert.deepEqual(getCameraPose('', 0.78), overview);
  }
});
