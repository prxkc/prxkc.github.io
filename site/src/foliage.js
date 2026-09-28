import * as THREE from 'three';
import { SimplexNoise } from 'three/addons/math/SimplexNoise.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Three botanical silhouettes, shared by all leaves. The midrib and curved
// surface give differently oriented leaves genuinely different projections.
function leafGeometry(variant) {
  const positions = [], uvs = [], indices = [];
  const widths = [0.28, 0.34, 0.225];
  const segments = 14;
  for (let row = 0; row <= segments; row++) {
    const t = row / segments;
    const outline = Math.pow(Math.sin(Math.PI * t), 0.80 + variant * 0.09);
    const width = widths[variant] * outline * (1 + 0.024 * Math.sin(t * Math.PI * 18));
    const midrib = Math.sin(t * Math.PI) * (variant - 1) * 0.023;
    for (let side = -1; side <= 1; side++) {
      const asymmetry = side < 0 ? 0.93 : 1.04;
      positions.push(midrib + side * width * asymmetry, t,
        Math.sin(t * Math.PI) * 0.045 - Math.abs(side) * outline * 0.055 + t ** 4 * 0.035);
      uvs.push((side + 1) / 2, t);
    }
    if (row < segments) {
      const a = row * 3;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4,
        a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function taperedStem(curve, radius, segments = 12) {
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 5, false);
  const points = geometry.attributes.position;
  const center = new THREE.Vector3();
  for (let ring = 0; ring <= segments; ring++) {
    const t = ring / segments;
    curve.getPointAt(t, center);
    const taper = 1 - t * 0.87;
    for (let edge = 0; edge <= 5; edge++) {
      const index = ring * 6 + edge;
      points.setXYZ(index,
        center.x + (points.getX(index) - center.x) * taper,
        center.y + (points.getY(index) - center.y) * taper,
        center.z + (points.getZ(index) - center.z) * taper);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

export function createFoliage(material) {
  const group = new THREE.Group();
  const instances = new THREE.Group();
  let seed = 384719;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const noise = new SimplexNoise({ random });
  const joints = [], leaves = [[], [], []], roots = [];
  const leafShapes = [0, 1, 2].map(leafGeometry);

  function branch(parent, length, radius, level, angle, sizeBias = 1) {
    const joint = new THREE.Group();
    joint.rotation.set((random() - 0.5) * 0.48, (random() - 0.5) * 0.3, angle);
    parent.add(joint);
    joints.push({ object: joint, rest: joint.rotation.z, phase: random() * 40,
      flexibility: [0.006, 0.013, 0.023][level], lag: level * 0.3 });
    const bend = (random() - 0.4) * length * 0.22;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(),
      new THREE.Vector3(bend * 0.3, length * 0.32, (random() - 0.5) * 0.18),
      new THREE.Vector3(bend, length * 0.73, (random() - 0.5) * 0.38),
      new THREE.Vector3(bend * 1.15, length, (random() - 0.5) * 0.32),
    ]);
    const parts = [taperedStem(curve, radius)];

    // Leaves collect on the fine shoots. Bare stretches and overlapping tips
    // leave irregular pools of sunlight between connected clusters.
    if (level === 2) {
      const count = 5 + Math.floor(random() * 4);
      for (let i = 0; i < count; i++) {
        if (random() < 0.1 && i < count - 2) continue;
        const t = 0.13 + (i + random() * 0.6) / count * 0.85;
        const node = curve.getPoint(t);
        const side = i % 2 ? 1 : -1;
        const reach = 0.06 + random() * 0.08;
        const anchor = node.clone().add(new THREE.Vector3(side * reach, reach * 0.48, (random() - 0.5) * 0.07));
        const stalk = new THREE.QuadraticBezierCurve3(node, node.clone().lerp(anchor, 0.55).add(new THREE.Vector3(0, 0.03, 0)), anchor);
        parts.push(taperedStem(stalk, radius * 0.28, 3));
        const leaf = new THREE.Object3D();
        leaf.position.copy(anchor);
        leaf.rotation.set((random() - 0.5) * 0.85, (random() - 0.5) * 0.9,
          -side * (0.48 + random() * 0.98));
        const size = (0.21 + random() * 0.17) * sizeBias * (0.85 + t * 0.15);
        leaf.scale.set(size * (0.83 + random() * 0.28), size, size);
        joint.add(leaf);
        const variant = Math.floor(random() * leafShapes.length);
        leaves[variant].push({ object: leaf, x: leaf.rotation.x, y: leaf.rotation.y,
          z: leaf.rotation.z, phase: random() * 60 });
      }
    } else {
      const count = level === 0 ? 6 : 3 + Math.floor(random() * 2);
      for (let i = 0; i < count; i++) {
        const t = 0.19 + (i + random() * 0.5) / count * 0.73;
        const fork = new THREE.Group();
        fork.position.copy(curve.getPoint(t));
        joint.add(fork);
        const side = i % 2 ? 1 : -1;
        const childLength = length * (level === 0 ? 0.40 : 0.44)
          * (0.8 + random() * 0.45) * (1.08 - t * 0.18);
        branch(fork, childLength, radius * 0.43, level + 1,
          side * (0.40 + random() * 0.64), sizeBias);
      }
    }
    const geometry = mergeGeometries(parts);
    parts.forEach(part => part.dispose());
    const stem = new THREE.Mesh(geometry, material);
    stem.castShadow = true;
    joint.add(stem);
  }

  function bough(length, angle, depth, side, y, sizeBias, level = 0) {
    const root = new THREE.Group();
    group.add(root);
    roots.push({ object: root, depth, side, y });
    branch(root, length, level === 0 ? 0.047 : 0.020, level, angle, sizeBias);
  }
  bough(5.0, -0.77, 3.5, -0.48, -4.8, 1);
  bough(4.3, -0.22, 4.2, -0.49, -4.8, 0.92);
  bough(5.8, 2.50, 5.1, 0.49, 5.9, 0.92);
  bough(4.7, 2.84, 5.6, 0.50, 4.5, 0.85);
  bough(3.9, -2.10, 5.5, -0.47, 5.8, 0.78, 1);

  const batches = leaves.map((items, i) => {
    const mesh = new THREE.InstancedMesh(leafShapes[i], material, items.length);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instances.add(mesh);
    return mesh;
  });

  return {
    group, instances,
    leafCount: leaves.reduce((count, items) => count + items.length, 0),
    setLayout(width) {
      const scale = THREE.MathUtils.clamp(width / 9.5, 0.70, 1.16);
      for (const root of roots) {
        root.object.scale.setScalar(scale);
        // Place the branch by its intended shadow on the wall, compensating for
        // the sun direction. Changing depth therefore changes softness, not layout.
        root.object.position.set(2.3 + width * root.side - root.depth / 3,
          root.y + root.depth / 2, root.depth);
      }
    },
    update(time, dt) {
      for (const joint of joints) {
        const breeze = noise.noise((time - joint.lag) * 0.075, 4.2) * 0.82
          + noise.noise(time * 0.15, joint.phase) * 0.18;
        joint.object.rotation.z = THREE.MathUtils.damp(joint.object.rotation.z,
          joint.rest + breeze * joint.flexibility, 2.1, dt);
      }
      for (const items of leaves) for (const leaf of items) {
        leaf.object.rotation.x = leaf.x + noise.noise(time * 0.26, leaf.phase) * 0.075;
        leaf.object.rotation.y = leaf.y + noise.noise(time * 0.32, leaf.phase + 2) * 0.13;
        leaf.object.rotation.z = leaf.z + noise.noise(time * 0.17, leaf.phase + 1) * 0.023;
      }
    },
    syncInstances() {
      leaves.forEach((items, batch) => {
        items.forEach((leaf, index) => batches[batch].setMatrixAt(index, leaf.object.matrixWorld));
        batches[batch].instanceMatrix.needsUpdate = true;
      });
    },
  };
}
