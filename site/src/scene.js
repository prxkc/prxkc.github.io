import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { createWall, createWindow } from './environment.js';
import { pcss } from '@pmndrs/vanilla/core/pcss.js';
import { createFoliage } from './foliage.js';

// One wall, one sun, and actual geometry between them. The canvas is an
// illumination layer over the HTML, so photographs and text share the light.
const mount = document.querySelector('.daylight');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const blindToggle = document.getElementById('blind-toggle');
if (blindToggle) blindToggle.hidden = true;
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'low-power' });
} catch {
  mount.dataset.state = 'still';
}

if (renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#ded8cc');
  const camera = new THREE.PerspectiveCamera(32, 1.5, 0.1, 100);
  camera.position.set(1.5, 0.45, 17.44);
  camera.lookAt(0, 0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  // Library PCSS makes the penumbra grow with distance from the wall.
  const restoreShadows = pcss({ size: 12, samples: 32, focus: 0 });
  // Keep PCSS, but give ANGLE one return path. The library's early return plus
  // unreachable PCF branch produces an uninitialized-output warning on Windows.
  THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment.replace(
    /float getShadow\([\s\S]*?\n\t}\n/,
    `float getShadow(sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity,
      float shadowBias, float shadowRadius, vec4 shadowCoord) {
      shadowCoord.xyz /= shadowCoord.w;
      shadowCoord.z += shadowBias;
      float visibility = 1.0;
      bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0
        && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0 && shadowCoord.z <= 1.0;
      if (inFrustum) visibility = PCSS(shadowMap, shadowCoord);
      return mix(1.0, visibility, shadowIntensity);
    }
`
  );
  mount.append(renderer.domElement);
  renderer.domElement.setAttribute('aria-hidden', 'true');

  const wall = createWall();
  scene.add(wall);
  scene.add(new THREE.AmbientLight('#d9e1e8', 0.78));
  RectAreaLightUniformsLib.init();
  const sky = new THREE.RectAreaLight('#e6eaf0', 0.85, 6.2, 7.5);
  sky.position.set(1.2, 1.2, 4.5);
  sky.lookAt(0.6, 0, 0);
  scene.add(sky);
  const bounce = new THREE.PointLight('#f8d3a1', 16, 50, 2);
  bounce.position.set(1.5, -5.5, 3.5);
  scene.add(bounce);
  const sun = new THREE.DirectionalLight('#ffc276', 4.1);
  sun.position.set(-6, 9, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 0.1, far: 60 });
  sun.shadow.bias = -0.00012;
  sun.shadow.normalBias = 0.015;
  scene.add(sun, sun.target);

  // These objects are outside the camera's room. They write to the shadow map,
  // but do not paint visible window frames or plants on the page itself.
  const occluder = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide });
  const rig = new THREE.Group();
  scene.add(rig);
  let windowAssembly = null, openingWidth = 0;
  let blindTarget = 0;
  try { blindTarget = localStorage.getItem('minifolio-blind') === 'down' ? 1 : 0; } catch { /* Storage is optional. */ }
  let blindProgress = blindTarget;
  function applyBlind() {
    windowAssembly?.userData.setBlind(blindProgress);
    mount.dataset.blind = blindProgress === blindTarget ? (blindTarget ? 'down' : 'up') : 'moving';
  }
  function labelBlind() {
    if (!blindToggle) return;
    blindToggle.textContent = blindTarget ? 'raise the blind' : 'lower the blind';
    blindToggle.setAttribute('aria-pressed', String(blindTarget === 1));
  }
  function toggleBlind() {
    blindTarget = 1 - blindTarget;
    labelBlind();
    try { localStorage.setItem('minifolio-blind', blindTarget ? 'down' : 'up'); } catch { /* Storage is optional. */ }
    if (reduced.matches) {
      blindProgress = blindTarget;
      applyBlind();
      render();
    } else {
      applyBlind();
      if (!frame && !document.hidden) syncMotion();
    }
  }
  const foliage = createFoliage(occluder);
  rig.add(foliage.group);
  scene.add(foliage.instances);

  let time = 0, previous = 0, frame = 0, disposed = false, contextLost = false;
  function render() {
    if (contextLost || disposed) return;
    rig.updateMatrixWorld(true);
    foliage.syncInstances();
    renderer.render(scene, camera);
  }
  function resize() {
    const width = document.documentElement.clientWidth, height = innerHeight;
    const viewWidth = width / height * 10;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    const shadowSpan = Math.max(13, viewWidth * 0.95);
    Object.assign(sun.shadow.camera, { left: -shadowSpan, right: shadowSpan });
    sun.shadow.camera.updateProjectionMatrix();
    const scale = Math.min(1, viewWidth / 6.4);
    const desiredOpening = viewWidth * (width < 700 ? 0.94 : 0.89) / scale;
    if (Math.abs(desiredOpening - openingWidth) > 0.03) {
      if (windowAssembly) {
        rig.remove(windowAssembly);
        windowAssembly.traverse(object => { object.geometry?.dispose(); if (object.isInstancedMesh) object.dispose(); });
      }
      openingWidth = desiredOpening;
      windowAssembly = createWindow(occluder, sun.position, openingWidth, 11.2);
      rig.add(windowAssembly);
      applyBlind();
    }
    rig.scale.setScalar(scale);
    rig.position.set(viewWidth * 0.04 - 2.3 * scale, width < 700 ? 0 : -0.12, 0);
    foliage.setLayout(openingWidth);
    wall.userData.setCorner(rig.position.x + (2.3 + openingWidth * 0.10) * scale);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.4, 1700 / Math.max(width, height)));
    renderer.setSize(width, height);
    render();
  }
  function animate(now) {
    frame = requestAnimationFrame(animate);
    if (now - previous < 1000 / 30) return;
    const dt = previous ? Math.min((now - previous) / 1000, 0.08) : 0;
    previous = now;
    time += dt;
    foliage.update(time, dt);
    if (blindProgress !== blindTarget) {
      const step = dt / 1.6;
      blindProgress = blindTarget > blindProgress
        ? Math.min(blindTarget, blindProgress + step)
        : Math.max(blindTarget, blindProgress - step);
      applyBlind();
    }
    render();
  }
  function syncMotion() {
    cancelAnimationFrame(frame); frame = 0; previous = 0;
    if (disposed || contextLost) return;
    if (reduced.matches) { blindProgress = blindTarget; applyBlind(); }
    mount.dataset.motion = reduced.matches ? 'reduced' : document.hidden ? 'paused' : 'running';
    if (!reduced.matches && !document.hidden) frame = requestAnimationFrame(animate);
    else render();
  }
  function onContextLost(event) {
    event.preventDefault();
    contextLost = true;
    cancelAnimationFrame(frame);
    mount.dataset.state = 'still';
    mount.dataset.motion = 'paused';
    if (blindToggle) blindToggle.disabled = true;
  }
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);
  renderer.domElement.addEventListener('webglcontextrestored', () => { contextLost = false; render(); mount.dataset.state = 'ready'; if (blindToggle) blindToggle.disabled = false; syncMotion(); });
  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', syncMotion);
  reduced.addEventListener('change', syncMotion);
  resize();
  mount.dataset.state = 'ready';
  labelBlind();
  if (blindToggle) {
    blindToggle.hidden = false;
    blindToggle.disabled = false;
    blindToggle.addEventListener('click', toggleBlind);
  }
  syncMotion();

  // Vite replaces this module during development without leaking GPU resources.
  if (import.meta.hot) import.meta.hot.dispose(() => {
    disposed = true;
    blindToggle?.removeEventListener('click', toggleBlind);
    if (blindToggle) blindToggle.hidden = true;
    cancelAnimationFrame(frame);
    removeEventListener('resize', resize);
    document.removeEventListener('visibilitychange', syncMotion);
    reduced.removeEventListener('change', syncMotion);
    restoreShadows(renderer, scene, camera);
    const geometries = new Set(), materials = new Set();
    scene.traverse(object => { if (object.isInstancedMesh) object.dispose(); if (object.geometry) geometries.add(object.geometry); if (object.material) materials.add(object.material); });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => { material.bumpMap?.dispose(); material.dispose(); });
    sun.shadow.dispose(); renderer.dispose(); renderer.domElement.remove();
  });
}
