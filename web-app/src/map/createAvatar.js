import * as THREE from 'three';
import { CATALOG_BY_ID, DEFAULT_EQUIPPED } from '../../../shared/socialCatalog.mjs';

const mat = (color, roughness = 0.86) => new THREE.MeshStandardMaterial({ color, roughness });
const ball = (geometry, material, parent, position, scale) => {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position); mesh.scale.set(...scale); parent.add(mesh); return mesh;
};

export function createAvatar(THREERef, equipped = DEFAULT_EQUIPPED, clickable = true) {
  const group = new THREERef.Group();
  const skinItem = CATALOG_BY_ID[equipped?.skin] || CATALOG_BY_ID[DEFAULT_EQUIPPED.skin];
  const skin = mat(skinItem?.color || '#c98f68');
  const hairId = equipped?.hair || DEFAULT_EQUIPPED.hair;
  const topId = equipped?.top || DEFAULT_EQUIPPED.top;
  const bottomId = equipped?.bottom || DEFAULT_EQUIPPED.bottom;
  const shoesId = equipped?.shoes || DEFAULT_EQUIPPED.shoes;
  const hairItem = CATALOG_BY_ID[hairId];
  const faceItem = CATALOG_BY_ID[equipped?.face] || CATALOG_BY_ID[DEFAULT_EQUIPPED.face];
  const shirtItem = CATALOG_BY_ID[topId];
  const pantsItem = CATALOG_BY_ID[bottomId];
  const shoeItem = CATALOG_BY_ID[shoesId];
  const hair = mat(hairItem?.color || '#38261e');
  const shirt = mat(shirtItem?.color || '#e9dec5');
  const pants = mat(pantsItem?.color || '#3c526a');
  const shoes = mat(shoeItem?.color || '#ece5d5');
  const black = mat('#231b1a');
  ball(new THREERef.CapsuleGeometry(0.23, 0.42, 3, 8), shirt, group, [0, 0.58, 0], [1, 0.9, 0.72]);
  if (shirtItem?.style === 'stripe') for (const y of [0.48, 0.64, 0.8]) ball(new THREERef.BoxGeometry(0.33, 0.025, 0.32), mat('#f2d7ad'), group, [0, y, 0.13], [1, 1, 1]);
  if (shirtItem?.style === 'jacket') {
    ball(new THREERef.BoxGeometry(0.018, 0.46, 0.018), mat('#d7c9ad'), group, [0, 0.58, 0.17], [1, 1, 1]);
    for (const side of [-1, 1]) ball(new THREERef.BoxGeometry(0.14, 0.22, 0.045), mat('#7895a7'), group, [side * 0.11, 0.58, 0.16], [1, 1, 1]);
  }
  if (shirtItem?.style === 'hoodie') ball(new THREERef.TorusGeometry(0.105, 0.035, 5, 8), shirt, group, [0, 0.79, -0.08], [1, 1, 0.8]);
  if (shirtItem?.style === 'star') ball(new THREERef.OctahedronGeometry(0.09), mat('#e6c36d'), group, [0, 0.61, 0.17], [1, 1, 0.35]);
  if (pantsItem?.style === 'skirt') ball(new THREERef.CylinderGeometry(0.23, 0.28, 0.22, 8), pants, group, [0, 0.25, 0], [1, 1, 0.9]);
  else {
    const legHeight = pantsItem?.style === 'shorts' ? 0.22 : 0.35;
    const legY = pantsItem?.style === 'shorts' ? 0.29 : 0.23;
    ball(new THREERef.CylinderGeometry(0.1, 0.13, legHeight, 7), pants, group, [-0.1, legY, 0], [1, 1, 1]);
    ball(new THREERef.CylinderGeometry(0.1, 0.13, legHeight, 7), pants, group, [0.1, legY, 0], [1, 1, 1]);
  }
  const boot = shoeItem?.style === 'boots';
  ball(new THREERef.SphereGeometry(boot ? 0.13 : 0.12, 8, 6), shoes, group, [-0.11, boot ? 0.08 : 0.04, 0.05], [1.15, boot ? 1.3 : 0.65, 1.4]);
  ball(new THREERef.SphereGeometry(boot ? 0.13 : 0.12, 8, 6), shoes, group, [0.11, boot ? 0.08 : 0.04, 0.05], [1.15, boot ? 1.3 : 0.65, 1.4]);
  ball(new THREERef.SphereGeometry(0.22, 12, 8), skin, group, [0, 1.08, 0], [0.88, 1, 0.86]);
  const hairStyle = hairItem?.style || 'short';
  if (hairStyle !== 'none') {
    const size = ['mid', 'bob'].includes(hairStyle) ? [1.02, 0.82, 1.02] : hairStyle === 'curly' ? [1.12, 0.74, 1.12] : ['mohawk', 'bun'].includes(hairStyle) ? [0.5, 0.95, 0.55] : [1.04, 0.48, 1.04];
    ball(new THREERef.SphereGeometry(0.23, hairStyle === 'curly' ? 8 : 12, 7), hair, group, [0, 1.23, 0], size);
    if (hairStyle === 'ponytail') ball(new THREERef.SphereGeometry(0.09, 8, 6), hair, group, [0.18, 1.12, -0.12], [0.8, 1.8, 0.8]);
    if (hairStyle === 'bun') ball(new THREERef.SphereGeometry(0.095, 8, 6), hair, group, [0, 1.39, -0.02], [1, 1, 1]);
    if (hairStyle === 'mohawk') ball(new THREERef.BoxGeometry(0.11, 0.2, 0.3), hair, group, [0, 1.38, 0], [1, 1, 1]);
    if (hairStyle === 'bob') for (const side of [-1, 1]) ball(new THREERef.SphereGeometry(0.09, 8, 6), hair, group, [side * 0.17, 1.12, 0], [0.85, 1.55, 0.8]);
    if (hairStyle === 'curly') for (let index = 0; index < 5; index += 1) {
      const angle = index * (Math.PI * 2 / 5);
      ball(new THREERef.SphereGeometry(0.075, 6, 5), hair, group, [Math.cos(angle) * 0.18, 1.25, Math.sin(angle) * 0.16], [1, 1, 1]);
    }
    if (hairStyle === 'streak') ball(new THREERef.BoxGeometry(0.08, 0.19, 0.09), mat('#a84f75'), group, [0.08, 1.31, 0.18], [1, 1, 1]);
  }
  ball(new THREERef.SphereGeometry(0.026, 6, 5), black, group, [-0.075, 1.09, 0.19], [1, 1, 0.45]);
  ball(new THREERef.SphereGeometry(0.026, 6, 5), black, group, [0.075, 1.09, 0.19], [1, 1, 0.45]);
  if (faceItem?.style === 'freckles') for (let index = 0; index < 6; index += 1) {
    const side = index % 2 ? 1 : -1;
    const row = Math.floor(index / 2);
    ball(new THREERef.SphereGeometry(0.009, 4, 4), mat('#80513d'), group, [side * (0.045 + row * 0.018), 1.055 - row * 0.012, 0.196], [1, 1, 0.5]);
  }
  if (faceItem?.style === 'moustache') for (const side of [-1, 1]) {
    ball(new THREERef.SphereGeometry(0.035, 6, 5), mat(faceItem.color), group, [side * 0.025, 1.035, 0.205], [1, 0.55, 0.65]);
  }
  const accessory = CATALOG_BY_ID[equipped?.accessory];
  if (accessory?.style === 'cap' || accessory?.style === 'moon') {
    ball(new THREERef.SphereGeometry(0.19, 8, 5), mat(accessory.color), group, [0, 1.35, 0], [1.2, 0.36, 1.1]);
  } else if (accessory?.style === 'glasses') {
    ball(new THREERef.TorusGeometry(0.055, 0.012, 4, 8), mat(accessory.color), group, [-0.07, 1.09, 0.21], [1, 1, 0.5]);
    ball(new THREERef.TorusGeometry(0.055, 0.012, 4, 8), mat(accessory.color), group, [0.07, 1.09, 0.21], [1, 1, 0.5]);
  } else if (accessory?.style === 'earrings') {
    for (const side of [-1, 1]) ball(new THREERef.TorusGeometry(0.035, 0.008, 4, 8), mat(accessory.color), group, [side * 0.2, 1.02, 0.02], [1, 1, 0.6]);
  } else if (accessory?.style === 'scarf') {
    ball(new THREERef.CylinderGeometry(0.15, 0.16, 0.07, 10), mat(accessory.color), group, [0, 0.88, 0], [1, 1, 0.9]);
    ball(new THREERef.BoxGeometry(0.07, 0.22, 0.06), mat(accessory.color), group, [0.08, 0.78, 0.14], [1, 1, 1]);
  }
  group.userData.clickable = clickable;
  return group;
}
