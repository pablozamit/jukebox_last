import * as THREE from 'three';
import { CATALOG_BY_ID, DEFAULT_EQUIPPED } from '../../../shared/socialCatalog.mjs';

const mat = (color, roughness = 0.86) => new THREE.MeshStandardMaterial({ color, roughness });
const ball = (geometry, material, parent, position, scale) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh); return mesh;
};

export function createAvatar(THREERef, equipped = DEFAULT_EQUIPPED, clickable = true) {
  const group = new THREERef.Group();
  const skin = mat('#c98f68');
  const hairId = equipped?.hair || DEFAULT_EQUIPPED.hair;
  const topId = equipped?.top || DEFAULT_EQUIPPED.top;
  const bottomId = equipped?.bottom || DEFAULT_EQUIPPED.bottom;
  const shoesId = equipped?.shoes || DEFAULT_EQUIPPED.shoes;
  const hairItem = CATALOG_BY_ID[hairId];
  const shirtItem = CATALOG_BY_ID[topId];
  const pantsItem = CATALOG_BY_ID[bottomId];
  const shoeItem = CATALOG_BY_ID[shoesId];
  const hair = mat(hairItem?.color || '#38261e');
  const shirt = mat(shirtItem?.color || '#e9dec5');
  const pants = mat(pantsItem?.color || '#3c526a');
  const shoes = mat(shoeItem?.color || '#ece5d5');
  const black = mat('#231b1a');
  ball(new THREERef.CapsuleGeometry(0.23, 0.42, 3, 8), shirt, group, [0, 0.58, 0], [1, 0.9, 0.72]);
  ball(new THREERef.CylinderGeometry(0.1, 0.13, 0.35, 7), pants, group, [-0.1, 0.23, 0], [1, 1, 1]);
  ball(new THREERef.CylinderGeometry(0.1, 0.13, 0.35, 7), pants, group, [0.1, 0.23, 0], [1, 1, 1]);
  ball(new THREERef.SphereGeometry(0.12, 8, 6), shoes, group, [-0.11, 0.04, 0.05], [1.15, 0.65, 1.4]);
  ball(new THREERef.SphereGeometry(0.12, 8, 6), shoes, group, [0.11, 0.04, 0.05], [1.15, 0.65, 1.4]);
  ball(new THREERef.SphereGeometry(0.22, 12, 8), skin, group, [0, 1.08, 0], [0.88, 1, 0.86]);
  const hairStyle = hairItem?.style || 'short';
  if (hairStyle !== 'none') {
    const size = hairStyle === 'mid' ? [1.02, 0.82, 1.02] : hairStyle === 'curly' ? [1.12, 0.74, 1.12] : [1.04, 0.48, 1.04];
    ball(new THREERef.SphereGeometry(0.23, hairStyle === 'curly' ? 8 : 12, 7), hair, group, [0, 1.23, 0], size);
    if (hairStyle === 'curly') for (let index = 0; index < 5; index += 1) {
      const angle = index * (Math.PI * 2 / 5);
      ball(new THREERef.SphereGeometry(0.075, 6, 5), hair, group, [Math.cos(angle) * 0.18, 1.25, Math.sin(angle) * 0.16], [1, 1, 1]);
    }
    if (hairStyle === 'streak') ball(new THREERef.BoxGeometry(0.08, 0.19, 0.09), mat('#a84f75'), group, [0.08, 1.31, 0.18], [1, 1, 1]);
  }
  ball(new THREERef.SphereGeometry(0.026, 6, 5), black, group, [-0.075, 1.09, 0.19], [1, 1, 0.45]);
  ball(new THREERef.SphereGeometry(0.026, 6, 5), black, group, [0.075, 1.09, 0.19], [1, 1, 0.45]);
  const accessory = CATALOG_BY_ID[equipped?.accessory];
  if (accessory?.style === 'cap' || accessory?.style === 'moon') {
    ball(new THREERef.SphereGeometry(0.19, 8, 5), mat(accessory.color), group, [0, 1.35, 0], [1.2, 0.36, 1.1]);
  } else if (accessory?.style === 'glasses') {
    ball(new THREERef.TorusGeometry(0.055, 0.012, 4, 8), mat(accessory.color), group, [-0.07, 1.09, 0.21], [1, 1, 0.5]);
    ball(new THREERef.TorusGeometry(0.055, 0.012, 4, 8), mat(accessory.color), group, [0.07, 1.09, 0.21], [1, 1, 0.5]);
  }
  group.userData.clickable = clickable;
  return group;
}
