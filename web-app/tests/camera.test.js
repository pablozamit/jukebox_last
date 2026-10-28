import test from 'node:test';
import assert from 'node:assert/strict';
import { getCameraFov, getCameraPose } from '../src/map/camera.js';
import { MAP_ZONES, ROOM_MAP } from '../src/map/zones.js';

const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
const normalize = vector => {
  const length = Math.hypot(...vector);
  return vector.map(value => value / length);
};

test('overview camera fits the full room bounds at narrow and wide map sizes', () => {
  for (const aspect of [0.72, 0.78, 1.6]) {
    const pose = getCameraPose(null, aspect);
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
    for (const x of [ROOM_MAP.bounds.minX, ROOM_MAP.bounds.maxX]) {
      for (const y of [-0.3, 6]) for (const z of [ROOM_MAP.bounds.minZ, ROOM_MAP.bounds.maxZ]) {
        const delta = [x - pose.target[0], y - pose.target[1], z - pose.target[2]];
        const depth = pose.distance - dot(delta, direction);
        assert.ok(Math.abs(dot(delta, right)) <= depth * horizontalLimit + 1e-6, `horizontal crop at aspect ${aspect}`);
        assert.ok(Math.abs(dot(delta, up)) <= depth * verticalLimit + 1e-6, `vertical crop at aspect ${aspect}`);
      }
    }
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
