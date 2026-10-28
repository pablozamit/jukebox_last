import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createAvatar } from '../src/map/createAvatar.js';
import { DEFAULT_EQUIPPED } from '../../shared/socialCatalog.mjs';

function appearance(changes) {
  const avatar = createAvatar(THREE, { ...DEFAULT_EQUIPPED, ...changes });
  const parts = [];
  avatar.traverse(part => {
    if (!part.isMesh) return;
    parts.push({ geometry: part.geometry.type, color: part.material.color.getHexString(), position: part.position.toArray() });
  });
  return parts;
}

test('new skin tones and face details change the 3D avatar', () => {
  const natural = appearance({ skin: 'skin-tan', face: 'face-natural' });
  assert.notDeepEqual(appearance({ skin: 'skin-deep', face: 'face-natural' }), natural);
  assert.notDeepEqual(appearance({ skin: 'skin-tan', face: 'face-freckles' }), natural);
  assert.notDeepEqual(appearance({ skin: 'skin-tan', face: 'face-moustache' }), natural);
});

test('new hair, clothes and accessories appear on the 3D avatar', () => {
  const standard = appearance({});
  for (const choice of [{ hair: 'hair-ponytail' }, { hair: 'hair-bun' }, { hair: 'hair-mohawk' }, { top: 'tee-stripe' }, { top: 'hoodie-night' }, { bottom: 'skirt-olive' }, { accessory: 'earrings-gold' }, { accessory: 'scarf-red' }]) {
    assert.notDeepEqual(appearance(choice), standard, JSON.stringify(choice));
  }
});
