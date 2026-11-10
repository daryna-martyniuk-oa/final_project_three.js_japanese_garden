import * as THREE from 'three';

export const POND_BOUNDS = Object.freeze({
  left: -5.15,
  right: 5.15,
  near: -0.95,
  far: 5.25,
  surface: -0.045
});

export const TERRAIN_RADIUS = 24.5;
export const TERRAIN_SEGMENTS = 288;

export function getTerrainHeight(x, z) {
  const broad = Math.sin(x * 0.19 + z * 0.11) * Math.cos(z * 0.16 - x * 0.07);
  const detail = Math.sin(x * 0.41 + z * 0.27) * 0.24;
  const radius = Math.hypot(x, z);
  const edge = THREE.MathUtils.smoothstep(radius, TERRAIN_RADIUS * 0.76, TERRAIN_RADIUS);
  return THREE.MathUtils.lerp(broad * 0.075 + detail * 0.025, -0.33, edge);
}

export function isOverPond(x, z) {
  return x > POND_BOUNDS.left && x < POND_BOUNDS.right &&
    z > POND_BOUNDS.near && z < POND_BOUNDS.far;
}

export function createTerrainSupportGeometry() {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, TERRAIN_RADIUS, 0, Math.PI * 2, false);

  const pondOpening = new THREE.Path();
  pondOpening.moveTo(POND_BOUNDS.left, POND_BOUNDS.near);
  pondOpening.lineTo(POND_BOUNDS.left, POND_BOUNDS.far);
  pondOpening.lineTo(POND_BOUNDS.right, POND_BOUNDS.far);
  pondOpening.lineTo(POND_BOUNDS.right, POND_BOUNDS.near);
  pondOpening.closePath();
  shape.holes.push(pondOpening);

  return new THREE.ShapeGeometry(shape, TERRAIN_SEGMENTS);
}

export function createTerrainGrid() {
  const side = TERRAIN_SEGMENTS + 1;
  const positions = new Float32Array(side * side * 3);
  const colors = new Float32Array(side * side * 3);
  const uvs = new Float32Array(side * side * 2);
  const indices = [];

  for (let iz = 0; iz <= TERRAIN_SEGMENTS; iz += 1) {
    const z = -TERRAIN_RADIUS + (2 * TERRAIN_RADIUS * iz) / TERRAIN_SEGMENTS;
    for (let ix = 0; ix <= TERRAIN_SEGMENTS; ix += 1) {
      const x = -TERRAIN_RADIUS + (2 * TERRAIN_RADIUS * ix) / TERRAIN_SEGMENTS;
      const index = iz * side + ix;
      const radialDistance = Math.hypot(x, z);
      const projection = radialDistance > TERRAIN_RADIUS ? TERRAIN_RADIUS / radialDistance : 1;
      const terrainX = x * projection;
      const terrainZ = z * projection;
      const edgeFade = THREE.MathUtils.smoothstep(radialDistance, TERRAIN_RADIUS * 0.76, TERRAIN_RADIUS);
      positions[index * 3] = terrainX;
      positions[index * 3 + 1] = getTerrainHeight(terrainX, terrainZ);
      positions[index * 3 + 2] = terrainZ;
      uvs[index * 2] = (terrainX + TERRAIN_RADIUS) / (TERRAIN_RADIUS * 2);
      uvs[index * 2 + 1] = (terrainZ + TERRAIN_RADIUS) / (TERRAIN_RADIUS * 2);

      const variation = 0.94 + 0.06 * Math.sin(x * 0.73 + z * 0.31) * Math.cos(z * 0.58 - x * 0.27);
      const edgeShade = 1 - edgeFade * 0.38;
      colors[index * 3] = variation * edgeShade;
      colors[index * 3 + 1] = variation * edgeShade;
      colors[index * 3 + 2] = variation * (1 - edgeFade * 0.3);
    }
  }

  for (let iz = 0; iz < TERRAIN_SEGMENTS; iz += 1) {
    const z = -TERRAIN_RADIUS + (2 * TERRAIN_RADIUS * (iz + 0.5)) / TERRAIN_SEGMENTS;
    for (let ix = 0; ix < TERRAIN_SEGMENTS; ix += 1) {
      const x = -TERRAIN_RADIUS + (2 * TERRAIN_RADIUS * (ix + 0.5)) / TERRAIN_SEGMENTS;
      if (Math.hypot(x, z) > TERRAIN_RADIUS || isOverPond(x, z)) continue;
      const a = iz * side + ix;
      const b = a + 1;
      const c = a + side;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  return { positions, colors, uvs, indices, side };
}

export function createTerrainGeometry(grid = createTerrainGrid()) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(grid.positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(grid.colors, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(grid.uvs, 2));
  geometry.setIndex(grid.indices);
  geometry.computeVertexNormals();
  return geometry;
}
