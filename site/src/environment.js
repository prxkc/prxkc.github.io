import * as THREE from 'three';
import { createBlind } from './blind.js';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';

// Painted plaster: shallow variations in the actual surface, not a grain overlay.
export function createWall() {
  let seed = 7812;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const noise = new SimplexNoise({ random });
  const size = 512;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const value = 128 + noise.noise(x * 0.065, y * 0.065) * 14
        + noise.noise(x * 0.36, y * 0.36) * 9 + (random() - 0.5) * 6;
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = Math.round(value);
      data[i + 3] = 255;
    }
  }
  const relief = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  relief.wrapS = relief.wrapT = THREE.RepeatWrapping;
  relief.repeat.set(14, 14);
  relief.generateMipmaps = true;
  relief.minFilter = THREE.LinearMipmapLinearFilter;
  relief.magFilter = THREE.LinearFilter;
  relief.needsUpdate = true;
  const surface = new THREE.PlaneGeometry(80, 80, 240, 240);
  const positions = surface.attributes.position;
  const crease = { value: 1.0 };
  const setCorner = xCorner => {
    crease.value = xCorner;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i);
      const distance = x - xCorner;
      // A rounded plaster return changes the receiving plane. Window rays bend
      // across it geometrically; the right-hand panes cannot remain rectangles.
      const turn = (distance + Math.sqrt(distance * distance + 0.0064)) * 0.5;
      positions.setZ(i, noise.noise(x * 0.19, y * 0.19) * 0.018 - turn * 0.52);
    }
    positions.needsUpdate = true;
    surface.computeVertexNormals();
    surface.computeBoundingSphere();
  };
  setCorner(1.0);
  const material = new THREE.MeshStandardMaterial({
    color: '#eee5d4', roughness: 0.97, metalness: 0,
    bumpMap: relief, bumpScale: 0.012,
  });
  // A small amount of indirect occlusion where the two plaster faces meet.
  // Sunlight remains untouched: the corner does not paint a dark stripe over it.
  material.onBeforeCompile = shader => {
    shader.uniforms.uCrease = crease;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uCrease;\nvarying float vCreaseDistance;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvCreaseDistance = position.x - uCrease;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vCreaseDistance;')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.indirectDiffuse *= 1.0 - 0.13 * exp(-abs(vCreaseDistance) * 7.0);');
  };
  const wall = new THREE.Mesh(surface, material);
  wall.receiveShadow = true;
  wall.userData.setCorner = setCorner;
  return wall;
}

export function createWindow(material, lightPosition, width = 6.2, height = 7.5) {
  const assembly = new THREE.Group();
  const frame = new THREE.Group();
  frame.position.set(-0.03, 4.0, 7);
  frame.rotation.set(0.035, -0.63, 0.008);
  assembly.add(frame);
  function timber(w, h, x, y, depth = 0.22, z = 0) {
    const geometry = new THREE.BoxGeometry(w, h, depth, w > h ? 24 : 1, h > w ? 24 : 1, 1);
    const p = geometry.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const along = w > h ? p.getX(i) : p.getY(i);
      const variation = Math.sin(along * 2.1 + x) * 0.003 + Math.sin(along * 5.4 + y) * 0.0015;
      if (w > h) p.setY(i, p.getY(i) + variation);
      else p.setX(i, p.getX(i) + variation);
    }
    geometry.computeVertexNormals();
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    frame.add(mesh);
    return mesh;
  }
  // A recessed opening, unequal sashes, and two meeting rails at different depths.
  timber(1.2, height + 2.4, -width / 2 - 0.6, 0, 0.65);
  timber(1.2, height + 2.4, width / 2 + 0.6, 0, 0.65);
  timber(width, 1.2, 0, height / 2 + 0.6, 0.55);
  timber(width, 1.2, 0, -height / 2 - 0.6, 0.85, -0.12);
  const meetingStile = width * 0.10;
  timber(0.24, height, meetingStile, 0, 0.30);
  timber(0.07, height, meetingStile + 0.17, 0, 0.11, -0.31);
  timber(0.065, height, -width * 0.215, 0, 0.11, -0.22);
  timber(width, 0.34, 0, height * 0.085, 0.42);
  timber(width, 0.07, 0, height * 0.085 - 0.24, 0.12, -0.28);
  timber(width, 0.055, 0, height * 0.31, 0.10, -0.18);
  timber(width, 0.065, 0, -height * 0.267, 0.12, -0.14);
  timber(width + 0.1, 0.13, 0, -height / 2 + 0.02, 0.95, -0.40);
  const latch = timber(0.10, 0.28, meetingStile - 0.21, height * 0.11, 0.11, -0.32);
  latch.rotation.z = -0.18;

  const blind = createBlind(material, width, height);
  frame.add(blind.group);
  assembly.userData.setBlind = blind.setProgress;

  // Continue the opaque room wall on a plane parallel to the receiver. Its hole
  // is the ray-projected opening, so wide screens cannot look past a tilted wall.
  frame.updateMatrix();
  const slope = new THREE.Vector2(-lightPosition.x / lightPosition.z, -lightPosition.y / lightPosition.z);
  const guardDepth = 10;
  const outline = new THREE.Shape();
  outline.moveTo(-60, -60); outline.lineTo(60, -60);
  outline.lineTo(60, 60); outline.lineTo(-60, 60); outline.closePath();
  const hole = new THREE.Path();
  [[-1,-1],[1,-1],[1,1],[-1,1]].forEach(([x,y], i) => {
    const p = new THREE.Vector3(x * (width / 2 + 0.075), y * (height / 2 + 0.075), 0).applyMatrix4(frame.matrix);
    const px = p.x + (p.z - guardDepth) * slope.x;
    const py = p.y + (p.z - guardDepth) * slope.y;
    if (i === 0) hole.moveTo(px, py); else hole.lineTo(px, py);
  });
  hole.closePath(); outline.holes.push(hole);
  const guard = new THREE.Mesh(new THREE.ShapeGeometry(outline), material);
  guard.position.z = guardDepth;
  guard.castShadow = true;
  assembly.add(guard);
  return assembly;
}
