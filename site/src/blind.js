import * as THREE from 'three';

// Venetian slats unfold from a compressed stack above the opening. They share
// the window's transform and the sun's shadow map rather than painting stripes.
export function createBlind(material, width, height) {
  const group = new THREE.Group();
  group.name = 'window-blind';
  group.position.z = -0.64;
  const count = Math.max(12, Math.round(height / 0.51));
  const stack = 0.028;
  const top = height / 2 - 0.15;
  const bottom = -height / 2 + 0.15;
  const pitch = (top - bottom) / (count - 1);
  const geometry = new THREE.BoxGeometry(width + 0.12, 0.045, 0.40, 24, 1, 1);
  const vertices = geometry.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    vertices.setY(i, vertices.getY(i) + Math.cos(vertices.getX(i) / width * Math.PI) * 0.008);
  }
  geometry.computeVertexNormals();
  const slats = new THREE.InstancedMesh(geometry, material, count);
  slats.name = 'blind-slats';
  slats.castShadow = true;
  slats.frustumCulled = false;
  slats.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(slats);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(width + 0.14, 0.10, 0.24), material);
  rail.castShadow = true;
  group.add(rail);
  const transform = new THREE.Object3D();

  function setProgress(value) {
    const progress = THREE.MathUtils.clamp(value, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    const edge = THREE.MathUtils.lerp(top + count * stack + 0.25, bottom, eased);
    group.visible = progress > 0;
    group.userData.progress = progress;
    for (let i = 0; i < count; i++) {
      transform.position.set(0, Math.max(top - i * pitch, edge + (count - 1 - i) * stack), 0);
      transform.rotation.set(-0.10 + Math.sin(i * 2.1) * 0.006, 0, 0);
      transform.updateMatrix();
      slats.setMatrixAt(i, transform.matrix);
    }
    slats.instanceMatrix.needsUpdate = true;
    rail.position.set(0, edge - 0.075, 0);
  }
  setProgress(0);
  return { group, setProgress };
}
