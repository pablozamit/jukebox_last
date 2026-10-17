import { useEffect, useRef, useState } from 'react';
import SocialPeopleList from './SocialPeopleList';
import { createAvatar } from './map/createAvatar';
import { getZonePosition } from './map/zones';

export default function SocialMapScene({ people, onSelect, labels, lang }) {
  const hostRef = useRef(null);
  const peopleRef = useRef(people);
  const onSelectRef = useRef(onSelect);
  const sceneContextRef = useRef(null);
  const avatarGroupsRef = useRef([]);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { peopleRef.current = people; onSelectRef.current = onSelect; }, [people, onSelect]);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let renderer;
    let modelRoot;
    let resizeObserver;
    let resizeHandler;
    const avatarGroups = avatarGroupsRef.current;
    let raycaster;
    let camera;
    let scene;
    let canvas;
    const host = hostRef.current;
    if (!host || window.matchMedia('(prefers-reduced-motion: reduce)').matches && !window.WebGLRenderingContext) return undefined;

    const start = async () => {
      try {
        const THREE = await import('three');
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        if (disposed) return;
        scene = new THREE.Scene();
        scene.background = new THREE.Color('#17130f');
        camera = new THREE.PerspectiveCamera(37, 1, 0.1, 1000);
        camera.position.set(21, 21, -14);
        camera.lookAt(0, 1.2, 5.4);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = false;
        canvas = renderer.domElement;
        canvas.className = 'social-map-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(canvas);

        scene.add(new THREE.HemisphereLight(0xf8e8c7, 0x211a17, 2.1));
        const key = new THREE.DirectionalLight(0xffd7a0, 2.6);
        key.position.set(-7, 15, 7);
        scene.add(key);
        const fill = new THREE.DirectionalLight(0x81aeb1, 1.1);
        fill.position.set(5, 8, -5);
        scene.add(fill);

        const loader = new GLTFLoader();
        loader.load('/map/la-catrina.glb', gltf => {
          if (disposed) { disposeObject(gltf.scene); return; }
          modelRoot = gltf.scene;
          modelRoot.traverse(object => {
            const name = object.name.toLowerCase();
            if (name.includes('ceiling') || name.includes('roof') || name.includes('techo')) object.visible = false;
            if (object.isMesh) {
              object.castShadow = false;
              object.receiveShadow = false;
              if (object.material) {
                if (object.material.roughness !== undefined) object.material.roughness = Math.max(0.66, object.material.roughness);
              }
            }
          });
          scene.add(modelRoot);
          addSocialMarkers(THREE, scene, peopleRef.current, avatarGroups);
          sceneContextRef.current = { THREE, scene, renderer, camera };
          resize();
          setReady(true);
        }, undefined, () => { if (!disposed) setFailed(true); });

        raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const handleClick = event => {
          const rect = canvas.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(avatarGroups, true)[0]?.object;
          let node = hit;
          while (node && !node.userData.uid) node = node.parent;
          if (node?.userData.uid) onSelectRef.current(node.userData.uid);
        };
        const handlePointerMove = event => {
          const rect = canvas.getBoundingClientRect();
          pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
          raycaster.setFromCamera(pointer, camera);
          canvas.style.cursor = raycaster.intersectObjects(avatarGroups, true).length ? 'pointer' : 'grab';
        };
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('pointermove', handlePointerMove);
        resize._cleanupCanvas = () => {
          canvas?.removeEventListener('click', handleClick);
          canvas?.removeEventListener('pointermove', handlePointerMove);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        resizeHandler = () => { if (!document.hidden) resize(); };
        document.addEventListener('visibilitychange', resizeHandler);
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
        const render = () => {
          if (disposed) return;
          if (!document.hidden) renderer.render(scene, camera);
          if (!prefersReducedMotion.matches && !document.hidden) frame = requestAnimationFrame(render);
        };
        render();
        const onMotionChange = () => {
          cancelAnimationFrame(frame);
          if (!prefersReducedMotion.matches && !document.hidden) render();
          else renderer.render(scene, camera);
        };
        prefersReducedMotion.addEventListener?.('change', onMotionChange);
        document.addEventListener('visibilitychange', onMotionChange);
        resize._cleanupMotion = () => {
          prefersReducedMotion.removeEventListener?.('change', onMotionChange);
          document.removeEventListener('visibilitychange', onMotionChange);
        };
      } catch {
        if (!disposed) setFailed(true);
      }
    };

    function resize() {
      if (!renderer || !camera || !host) return;
      const width = Math.max(1, host.clientWidth);
      const height = Math.max(1, host.clientHeight);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    }

    start();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      document.removeEventListener('visibilitychange', resizeHandler);
      resize._cleanupMotion?.();
      resize._cleanupCanvas?.();
      sceneContextRef.current = null;
      avatarGroups.forEach(disposeObject);
      if (modelRoot) { scene.remove(modelRoot); disposeObject(modelRoot); }
      if (renderer) { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); }
    };
  }, []);

  useEffect(() => {
    const context = sceneContextRef.current;
    const groups = avatarGroupsRef.current;
    if (!context) return;
    groups.forEach(group => { context.scene.remove(group); disposeObject(group); });
    groups.length = 0;
    addSocialMarkers(context.THREE, context.scene, people, groups);
    context.renderer.render(context.scene, context.camera);
  }, [people]);

  return (
    <div className={`social-map-stage ${failed ? 'is-fallback' : ''}`} ref={hostRef} role="region" aria-label={labels.scene}>
      {(!ready || failed) && <div className="social-map-placeholder" aria-hidden="true"><span className="social-map-grid" /><span className="social-map-room-label terrace">{labels.terrace}</span><span className="social-map-room-label bar">{labels.bar}</span><span className="social-map-room-label pool">{labels.pool}</span><span className="social-map-room-label foosball">{labels.foosball}</span></div>}
      {failed && <div className="social-map-failure"><p>{labels.mapFallback}</p><SocialPeopleList people={people} lang={lang} onSelect={onSelect} emptyText={labels.empty} /></div>}
    </div>
  );
}

function addSocialMarkers(THREE, scene, people, groups) {
  const zoneOffsets = new Map();
  people.forEach(person => {
    const zoneId = person.zone || 'terrace';
    const index = zoneOffsets.get(zoneId) || 0;
    zoneOffsets.set(zoneId, index + 1);
    if (index >= 8) return;
    const position = getZonePosition(zoneId, index);
    if (!position) return;
    const avatar = createAvatar(THREE, person.equipped);
    avatar.position.set(...position);
    avatar.scale.setScalar(0.88);
    avatar.userData.uid = person.uid;
    avatar.traverse(child => { child.userData.uid = person.uid; });
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.34, 0.43, 32),
      new THREE.MeshBasicMaterial({ color: '#d9b978', transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.025;
    marker.userData.uid = person.uid;
    avatar.add(marker);
    const nameTag = createNameTag(THREE, person.name || 'DJ');
    nameTag.position.set(0, 1.72, 0);
    nameTag.userData.uid = person.uid;
    avatar.add(nameTag);
    scene.add(avatar);
    groups.push(avatar);
  });
}

function createNameTag(THREE, rawName) {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  const name = String(rawName).trim().slice(0, 18) || 'DJ';
  context.font = '600 36px Arial, sans-serif';
  const measured = Math.ceil(context.measureText(name).width);
  canvas.width = Math.min(420, measured + 40);
  canvas.height = 64;
  context.font = '600 36px Arial, sans-serif';
  context.fillStyle = 'rgba(24, 19, 15, 0.92)';
  context.strokeStyle = 'rgba(217, 185, 120, 0.86)';
  context.lineWidth = 3;
  context.beginPath();
  context.roundRect(2, 2, canvas.width - 4, 60, 20);
  context.fill();
  context.stroke();
  context.fillStyle = '#fff2d7';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(name, canvas.width / 2, canvas.height / 2 + 1, canvas.width - 24);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  // Keep names legible at every camera distance and above occluding furniture.
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
  sprite.scale.set(0.075 * canvas.width / canvas.height, 0.075, 1);
  sprite.renderOrder = 3;
  return sprite;
}

function disposeObject(object) {
  object.traverse?.(child => {
    child.geometry?.dispose();
    if (Array.isArray(child.material)) child.material.forEach(material => material.dispose());
    else { child.material?.map?.dispose(); child.material?.dispose(); }
  });
}
