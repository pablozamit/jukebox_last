import { useEffect, useRef, useState } from 'react';
import SocialPeopleList from './SocialPeopleList';
import { createAvatar } from './map/createAvatar';
import { getZoneAtPoint, getZonePosition, MAP_ZONES, ROOM_MAP } from './map/zones';
import { getCameraFov, getCameraPose } from './map/camera';

export default function SocialMapScene({ people, onSelect, onSelectZone, focusZone = null, labels, lang }) {
  const hostRef = useRef(null);
  const peopleRef = useRef(people);
  const onSelectRef = useRef(onSelect);
  const onSelectZoneRef = useRef(onSelectZone);
  const focusZoneRef = useRef(focusZone);
  const sceneContextRef = useRef(null);
  const avatarGroupsRef = useRef([]);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => { peopleRef.current = people; onSelectRef.current = onSelect; onSelectZoneRef.current = onSelectZone; }, [people, onSelect, onSelectZone]);

  useEffect(() => {
    focusZoneRef.current = focusZone;
    sceneContextRef.current?.focusCamera(focusZone);
  }, [focusZone]);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    let renderer;
    let modelRoot;
    let resizeObserver;
    let visibilityHandler;
    let motionQuery;
    let motionHandler;
    let THREE;
    let controls;
    let cameraInitialized = false;
    let cameraTransition = null;
    let cameraTarget;
    const avatarGroups = avatarGroupsRef.current;
    const zoneLabels = [];
    let raycaster;
    let camera;
    let scene;
    let canvas;
    const host = hostRef.current;
    if (!host) return undefined;

    const start = async () => {
      try {
        if (!window.WebGLRenderingContext) {
          if (!disposed) setFailed(true);
          return;
        }
        THREE = await import('three');
        const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
        const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
        if (disposed) return;
        motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        scene = new THREE.Scene();
        scene.background = new THREE.Color('#17130f');
        camera = new THREE.PerspectiveCamera(37, 1, 0.1, 1000);
        cameraTarget = new THREE.Vector3(0, 1.2, 5.4);
        camera.position.set(21, 21, -14);
        camera.lookAt(cameraTarget);
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.05;
        renderer.shadowMap.enabled = false;
        canvas = renderer.domElement;
        canvas.className = 'social-map-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        canvas.style.touchAction = 'none';
        host.appendChild(canvas);
        controls = new OrbitControls(camera, canvas);
        controls.target.copy(cameraTarget);
        cameraTarget = controls.target;
        controls.enableDamping = !motionQuery.matches;
        controls.dampingFactor = 0.08;
        controls.screenSpacePanning = true;
        controls.minDistance = 6;
        controls.maxDistance = 44;
        controls.minPolarAngle = 0.12;
        controls.maxPolarAngle = 1.48;
        controls.addEventListener('start', () => { cameraTransition = null; });
        controls.addEventListener('change', () => {
          clampCameraTarget(controls, camera, THREE);
          requestRender();
        });
        controls.update();

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
          for (const zone of MAP_ZONES) {
            const marker = createNameTag(THREE, zone.label[lang === 'en' ? 'en' : 'es']);
            marker.scale.multiplyScalar(0.48);
            marker.position.set(zone.anchor[0], 0.6, zone.anchor[2]);
            marker.userData.zoneId = zone.id;
            zoneLabels.push(marker);
            scene.add(marker);
          }
          updateSocialMarkers(THREE, scene, peopleRef.current, avatarGroups);
          sceneContextRef.current = { THREE, scene, renderer, camera, requestRender, focusCamera };
          resize();
          setReady(true);
        }, undefined, () => { if (!disposed) setFailed(true); });

        raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const floorPoint = new THREE.Vector3();
        let pointerGesture = null;
        const handleClick = event => {
          const gesture = pointerGesture;
          pointerGesture = null;
          if (!gesture || gesture.moved) return;
          const rect = canvas.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(avatarGroups, true)[0]?.object;
          let node = hit;
          while (node && !node.userData.uid) node = node.parent;
          if (node?.userData.uid) { onSelectRef.current(node.userData.uid); return; }
          const label = raycaster.intersectObjects(zoneLabels, false)[0]?.object;
          if (label?.userData.zoneId) { onSelectZoneRef.current(label.userData.zoneId); return; }
          if (raycaster.ray.intersectPlane(floorPlane, floorPoint)) {
            const zone = getZoneAtPoint(floorPoint.x, floorPoint.z);
            if (zone) onSelectZoneRef.current(zone);
          }
        };
        const handlePointerMove = event => {
          if (pointerGesture && pointerGesture.pointerId === event.pointerId
            && Math.hypot(event.clientX - pointerGesture.x, event.clientY - pointerGesture.y) > 7) {
            pointerGesture.moved = true;
          }
          const rect = canvas.getBoundingClientRect();
          pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
          raycaster.setFromCamera(pointer, camera);
          canvas.style.cursor = raycaster.intersectObjects(avatarGroups, true).length || raycaster.intersectObjects(zoneLabels, false).length || (raycaster.ray.intersectPlane(floorPlane, floorPoint) && getZoneAtPoint(floorPoint.x, floorPoint.z)) ? 'pointer' : 'grab';
        };
        const handlePointerDown = event => {
          if (!event.isPrimary) {
            if (pointerGesture) pointerGesture.moved = true;
            return;
          }
          pointerGesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
          canvas.style.cursor = 'grabbing';
        };
        const handlePointerUp = () => { canvas.style.cursor = 'grab'; };
        const handlePointerCancel = () => { pointerGesture = null; canvas.style.cursor = 'grab'; };
        canvas.addEventListener('pointerdown', handlePointerDown);
        canvas.addEventListener('pointerup', handlePointerUp);
        canvas.addEventListener('pointercancel', handlePointerCancel);
        canvas.addEventListener('click', handleClick);
        canvas.addEventListener('pointermove', handlePointerMove);
        resize._cleanupCanvas = () => {
          canvas?.removeEventListener('pointerdown', handlePointerDown);
          canvas?.removeEventListener('pointerup', handlePointerUp);
          canvas?.removeEventListener('pointercancel', handlePointerCancel);
          canvas?.removeEventListener('click', handleClick);
          canvas?.removeEventListener('pointermove', handlePointerMove);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(host);
        motionHandler = event => {
          controls.enableDamping = !event.matches;
          controls.update();
          if (!event.matches || !cameraTransition) return;
          camera.position.copy(cameraTransition.toPosition);
          cameraTarget.copy(cameraTransition.toTarget);
          camera.lookAt(cameraTarget);
          cameraTransition = null;
          requestRender();
        };
        motionQuery.addEventListener?.('change', motionHandler);
        visibilityHandler = () => {
          if (document.hidden) {
            cancelAnimationFrame(frame);
            frame = 0;
            if (cameraTransition) {
              camera.position.copy(cameraTransition.toPosition);
              cameraTarget.copy(cameraTransition.toTarget);
              camera.lookAt(cameraTarget);
              cameraTransition = null;
            }
          } else {
            resize();
          }
        };
        document.addEventListener('visibilitychange', visibilityHandler);
        requestRender();
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
      camera.fov = getCameraFov(camera.aspect);
      camera.updateProjectionMatrix();
      if (controls) controls.maxDistance = Math.max(44, getCameraPose(null, camera.aspect, camera.fov).distance + 12, camera.position.distanceTo(cameraTarget) + 2);
      if (!cameraInitialized) {
        focusCamera(focusZoneRef.current, true);
        cameraInitialized = true;
      }
      requestRender();
    }

    function focusCamera(zoneId, immediate = false) {
      if (!camera || !cameraTarget) return;
      const pose = getCameraPose(zoneId, camera.aspect, camera.fov);
      if (!pose) return;
      // Keep enough zoom-out room to preserve the fitted overview pose.
      if (controls) controls.maxDistance = Math.max(44, pose.distance + 12, getCameraPose(null, camera.aspect, camera.fov).distance + 12);
      cameraTransition = immediate || motionQuery?.matches ? null : {
        fromPosition: camera.position.clone(),
        fromTarget: cameraTarget.clone(),
        toPosition: new THREE.Vector3(...pose.position),
        toTarget: new THREE.Vector3(...pose.target),
        startedAt: null,
      };
      if (!cameraTransition) {
        camera.position.set(...pose.position);
        cameraTarget.set(...pose.target);
        camera.lookAt(cameraTarget);
        controls?.update();
      }
      requestRender();
    }

    function requestRender() {
      if (disposed || frame || document.hidden || !renderer || !scene || !camera) return;
      frame = requestAnimationFrame(timestamp => {
        frame = 0;
        if (disposed || document.hidden) return;
        if (cameraTransition) {
          if (cameraTransition.startedAt === null) cameraTransition.startedAt = timestamp;
          const progress = Math.min(1, (timestamp - cameraTransition.startedAt) / 460);
          const eased = progress * progress * (3 - 2 * progress);
          camera.position.lerpVectors(cameraTransition.fromPosition, cameraTransition.toPosition, eased);
          cameraTarget.lerpVectors(cameraTransition.fromTarget, cameraTransition.toTarget, eased);
          camera.lookAt(cameraTarget);
          if (progress === 1) cameraTransition = null;
        }
        const controlsMoving = controls?.update() || false;
        renderer.render(scene, camera);
        if (cameraTransition || controlsMoving) requestRender();
      });
    }

    start();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      document.removeEventListener('visibilitychange', visibilityHandler);
      motionQuery?.removeEventListener?.('change', motionHandler);
      controls?.dispose();
      resize._cleanupCanvas?.();
      sceneContextRef.current = null;
      avatarGroups.forEach(disposeObject);
      avatarGroups.length = 0;
      zoneLabels.forEach(label => { scene?.remove(label); disposeObject(label); });
      if (modelRoot) { scene.remove(modelRoot); disposeObject(modelRoot); }
      if (renderer) { renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove(); }
    };
  }, [lang]);

  useEffect(() => {
    const context = sceneContextRef.current;
    const groups = avatarGroupsRef.current;
    if (!context) return;
    updateSocialMarkers(context.THREE, context.scene, people, groups);
    context.requestRender();
  }, [people]);

  return (
    <div className={`social-map-stage ${failed ? 'is-fallback' : ''}`} ref={hostRef} role="region" aria-label={labels.scene}>
      {(!ready || failed) && <div className="social-map-placeholder" aria-hidden="true"><span className="social-map-grid" /><span className="social-map-room-label terrace">{labels.terrace}</span><span className="social-map-room-label bar">{labels.bar}</span><span className="social-map-room-label pool">{labels.pool}</span><span className="social-map-room-label foosball">{labels.foosball}</span></div>}
      {failed && <div className="social-map-failure"><p>{labels.mapFallback}</p><SocialPeopleList people={people} lang={lang} onSelect={onSelect} emptyText={labels.empty} /></div>}
    </div>
  );
}

function updateSocialMarkers(THREE, scene, people, groups) {
  const zoneOffsets = new Map();
  const previousGroups = new Map(groups.map(group => [group.userData.uid, group]));
  const nextGroups = [];
  people.forEach(person => {
    const zoneId = person.zone || 'terrace';
    const index = zoneOffsets.get(zoneId) || 0;
    zoneOffsets.set(zoneId, index + 1);
    if (index >= 8) return;
    const position = getZonePosition(zoneId, index);
    if (!position) return;
    const name = String(person.name || 'DJ').trim() || 'DJ';
    const equipped = person.equipped || {};
    const appearance = ['skin', 'face', 'hair', 'top', 'bottom', 'shoes', 'accessory'].map(key => equipped[key] || '').join('|');
    let avatar = previousGroups.get(person.uid);
    if (avatar && (avatar.userData.appearance !== appearance || avatar.userData.displayName !== name)) {
      scene.remove(avatar);
      disposeObject(avatar);
      previousGroups.delete(person.uid);
      avatar = null;
    }
    if (!avatar) {
      avatar = createAvatar(THREE, person.equipped);
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
      const nameTag = createNameTag(THREE, name);
      nameTag.position.set(0, 1.72, 0);
      nameTag.userData.uid = person.uid;
      avatar.add(nameTag);
      scene.add(avatar);
    } else {
      previousGroups.delete(person.uid);
    }
    avatar.position.set(...position);
    avatar.userData.appearance = appearance;
    avatar.userData.displayName = name;
    nextGroups.push(avatar);
  });
  previousGroups.forEach(avatar => {
    scene.remove(avatar);
    disposeObject(avatar);
  });
  groups.splice(0, groups.length, ...nextGroups);
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

function clampCameraTarget(controls, camera) {
  if (!controls?.target || !camera) return;
  const target = controls.target;
  const x = Math.max(ROOM_MAP.bounds.minX - 2, Math.min(ROOM_MAP.bounds.maxX + 2, target.x));
  const y = Math.max(0.25, Math.min(4.5, target.y));
  const z = Math.max(ROOM_MAP.bounds.minZ - 2, Math.min(ROOM_MAP.bounds.maxZ + 2, target.z));
  const shiftX = x - target.x;
  const shiftY = y - target.y;
  const shiftZ = z - target.z;
  if (shiftX || shiftY || shiftZ) {
    target.set(x, y, z);
    camera.position.x += shiftX;
    camera.position.y += shiftY;
    camera.position.z += shiftZ;
  }
}
