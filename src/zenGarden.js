import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { triggerWaterRipple } from './waterShader.js';
import sakuraModelUrl from '../assets/sakura.glb?url';
import bambooOneUrl from '../assets/bamboo1.glb?url';
import bambooTwoUrl from '../assets/bamboo2.glb?url';
import ashTreeUrl from '../assets/japanese_ash_tree.glb?url';
import grassGroundUrl from '../assets/grass_ground_diff_4k.jpg?url';
import greyLatiVeneerUrl from '../assets/grey_lati_veneer_diff_1k.jpg?url';
import {
  createTerrainGeometry,
  createTerrainGrid,
  createTerrainSupportGeometry,
  getTerrainHeight,
  isOverPond,
  POND_BOUNDS
} from './terrain.js';

const textureLoader = new THREE.TextureLoader();
const woodTexture = textureLoader.load(
  greyLatiVeneerUrl,
  undefined,
  undefined,
  (error) => console.error(`Unable to load wood veneer texture ${greyLatiVeneerUrl}:`, error)
);
woodTexture.wrapS = THREE.RepeatWrapping;
woodTexture.wrapT = THREE.RepeatWrapping;
woodTexture.repeat.set(1, 1);
woodTexture.colorSpace = THREE.SRGBColorSpace;
woodTexture.anisotropy = 8;

const materials = {
  soil: new THREE.MeshStandardMaterial({ color: '#8fdf4d', vertexColors: true, roughness: 1 }),
  path: [
    new THREE.MeshStandardMaterial({ color: '#aaa69c', roughness: 0.86 }),
    new THREE.MeshStandardMaterial({ color: '#c2b9a7', roughness: 0.84 }),
    new THREE.MeshStandardMaterial({ color: '#918f89', roughness: 0.9 })
  ],
  wood: createWoodMaterial('#684838', 0.76),
  woodLight: createWoodMaterial('#98704d', 0.8),
  vermilion: createWoodMaterial('#a84134', 0.72),
  vermilionLight: createWoodMaterial('#c2523d', 0.68),
  roof: new THREE.MeshStandardMaterial({ color: '#33343a', roughness: 0.82 }),
  roofEdge: new THREE.MeshStandardMaterial({ color: '#514447', roughness: 0.74 }),
  stone: new THREE.MeshStandardMaterial({ color: '#5a5a5e', roughness: 0.92, metalness: 0.02 }),
  stoneVariants: [
    new THREE.MeshStandardMaterial({ color: '#5a5a5e', roughness: 0.92, metalness: 0.02 }),
    new THREE.MeshStandardMaterial({ color: '#424246', roughness: 0.97, metalness: 0.01 }),
    new THREE.MeshStandardMaterial({ color: '#68686a', roughness: 0.86, metalness: 0.025 }),
    new THREE.MeshStandardMaterial({ color: '#50565a', roughness: 0.94, metalness: 0.015 })
  ],
  moss: new THREE.MeshStandardMaterial({
    color: '#66754e',
    roughness: 1,
    transparent: true,
    opacity: 0.52,
    alphaMap: createMossTexture(),
    alphaTest: 0.08,
    depthWrite: false
  }),
  lanternGlow: new THREE.MeshStandardMaterial({
    color: '#ffd391',
    emissive: '#ff9900',
    emissiveIntensity: 1.1,
    transparent: true,
    opacity: 0.74,
    roughness: 0.42,
    side: THREE.DoubleSide,
    depthWrite: false
  }),
  blossom: [
    new THREE.MeshStandardMaterial({ color: '#f1a9b5', roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: '#ffcfce', roughness: 0.94 }),
    new THREE.MeshStandardMaterial({ color: '#d98298', roughness: 0.9 })
  ],
  paper: new THREE.MeshStandardMaterial({ color: '#f3d9aa', emissive: '#e9a963', emissiveIntensity: 0.38, roughness: 0.9 }),
  lanternRoof: new THREE.MeshStandardMaterial({ color: '#42413c', roughness: 0.92 }),
  mountain: new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: 1 })
};

const randomRange = (min, max) => min + Math.random() * (max - min);
const MAX_GARDEN_SCENERY_RADIUS = 16;
const BRIDGE_SPAN = 11.6;
const BRIDGE_CENTER_Z = 2.15;
const BRIDGE_HALF_WIDTH = 0.825;
const PETAL_FALLING = 0;
const PETAL_FLOATING = 2;
const PETAL_INACTIVE = 3;

function createWoodMaterial(color, roughness) {
  const material = new THREE.MeshStandardMaterial({ color, roughness, map: woodTexture });
  material.needsUpdate = true;
  return material;
}

function tintedMaterial(material, tint) {
  const variant = material.clone();
  variant.color.setStyle(tint);
  variant.needsUpdate = true;
  return variant;
}

function createMossTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const image = context.createImageData(size, size);
  for (let i = 0; i < image.data.length; i += 4) {
    const value = Math.random() > 0.58 ? 96 + Math.floor(Math.random() * 160) : 0;
    image.data[i] = value;
    image.data[i + 1] = value;
    image.data[i + 2] = value;
    image.data[i + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  return texture;
}

function addMesh(parent, geometry, material, position, options = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(position[0], position[1], position[2]);
  if (options.rotation) mesh.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2]);
  if (options.scale) mesh.scale.set(options.scale[0], options.scale[1], options.scale[2]);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  parent.add(mesh);
  return mesh;
}

function addCurvedBeam(parent, points, radius, material) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  return addMesh(parent, new THREE.TubeGeometry(curve, 32, radius, 9, false), material, [0, 0, 0]);
}

function roundedStoneGeometry(width, depth, height) {
  const shape = new THREE.Shape();
  const radius = Math.min(width, depth) * 0.18;
  shape.moveTo(-width / 2 + radius, -depth / 2);
  shape.lineTo(width / 2 - radius, -depth / 2);
  shape.quadraticCurveTo(width / 2, -depth / 2, width / 2, -depth / 2 + radius);
  shape.lineTo(width / 2, depth / 2 - radius);
  shape.quadraticCurveTo(width / 2, depth / 2, width / 2 - radius, depth / 2);
  shape.lineTo(-width / 2 + radius, depth / 2);
  shape.quadraticCurveTo(-width / 2, depth / 2, -width / 2, depth / 2 - radius);
  shape.lineTo(-width / 2, -depth / 2 + radius);
  shape.quadraticCurveTo(-width / 2, -depth / 2, -width / 2 + radius, -depth / 2);
  return new THREE.ExtrudeGeometry(shape, {
    depth: height,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.035,
    bevelThickness: 0.025,
    curveSegments: 4
  });
}

function createTerrain(scene) {
  const terrainGrid = createTerrainGrid();
  const grassTexture = new THREE.TextureLoader().load(
    grassGroundUrl,
    undefined,
    undefined,
    (error) => console.error(`Unable to load grass ground texture ${grassGroundUrl}:`, error)
  );
  grassTexture.wrapS = THREE.RepeatWrapping;
  grassTexture.wrapT = THREE.RepeatWrapping;
  grassTexture.repeat.set(18, 18);
  grassTexture.colorSpace = THREE.SRGBColorSpace;
  grassTexture.anisotropy = 8;
  const groundMaterial = materials.soil.clone();
  groundMaterial.map = grassTexture;
  groundMaterial.needsUpdate = true;
  const terrainSupport = addMesh(scene, createTerrainSupportGeometry(),
    new THREE.MeshStandardMaterial({ color: '#667c43', roughness: 1, side: THREE.DoubleSide }),
    [0, -0.38, 0], { castShadow: false });
  terrainSupport.rotation.x = -Math.PI / 2;
  terrainSupport.receiveShadow = true;
  const ground = addMesh(scene, createTerrainGeometry(terrainGrid), groundMaterial, [0, 0, 0], {
    castShadow: false
  });
  ground.receiveShadow = true;
  const pondBed = addMesh(scene, new THREE.BoxGeometry(10.3, 0.32, 6.2), new THREE.MeshStandardMaterial({
    color: '#263b39',
    roughness: 1
  }), [0, -1.12, 2.15], { castShadow: false });
  pondBed.receiveShadow = true;

  const shoreMaterial = new THREE.MeshStandardMaterial({ color: '#737b57', roughness: 1 });
  const rimSegments = 24;
  const rimHeight = 0.08;
  const addShoreEdge = (horizontal, fixed, start, end) => {
    const segmentLength = (end - start) / rimSegments;
    for (let i = 0; i < rimSegments; i += 1) {
      const along = start + (i + 0.5) * segmentLength;
      const x = horizontal ? along : fixed;
      const z = horizontal ? fixed : along;
      const groundY = getTerrainHeight(x, z);
      const geometry = horizontal
        ? new THREE.BoxGeometry(segmentLength + 0.012, rimHeight, 0.2)
        : new THREE.BoxGeometry(0.2, rimHeight, segmentLength + 0.012);
      addMesh(scene, geometry, shoreMaterial, [x, groundY - 0.02, z]);
    }
  };
  addShoreEdge(true, POND_BOUNDS.near - 0.1, POND_BOUNDS.left, POND_BOUNDS.right);
  addShoreEdge(true, POND_BOUNDS.far + 0.1, POND_BOUNDS.left, POND_BOUNDS.right);
  addShoreEdge(false, POND_BOUNDS.left - 0.1, POND_BOUNDS.near, POND_BOUNDS.far);
  addShoreEdge(false, POND_BOUNDS.right + 0.1, POND_BOUNDS.near, POND_BOUNDS.far);

  return { ground, pondBed, terrainGrid };
}

function createPath(scene) {
  const paths = [
    [
      new THREE.Vector3(-9.2, 0, 5.3), new THREE.Vector3(-8.2, 0, 4.45),
      new THREE.Vector3(-7.3, 0, 3.65), new THREE.Vector3(-6.4, 0, 2.8),
      new THREE.Vector3(-5.78, 0, 2.15)
    ],
    [
      new THREE.Vector3(5.78, 0, 2.15), new THREE.Vector3(6.4, 0, 2.8),
      new THREE.Vector3(7.3, 0, 3.65), new THREE.Vector3(8.2, 0, 4.45),
      new THREE.Vector3(9.2, 0, 5.3)
    ]
  ];
  const steppingStones = [];
  for (const points of paths) {
    const curve = new THREE.CatmullRomCurve3(points);
    const stoneCount = 6;
    for (let i = 0; i < stoneCount; i += 1) {
      const t = i / (stoneCount - 1);
      const point = curve.getPoint(THREE.MathUtils.clamp(t + randomRange(-0.018, 0.018), 0, 1));
      if (isOverPond(point.x, point.z)) continue;
      const tangent = curve.getTangent(t);
      const radius = randomRange(0.4, 0.53);
      const height = randomRange(0.1, 0.15);
      const scaleX = randomRange(0.9, 1.2);
      const scaleZ = randomRange(0.85, 1.18);
      const stoneX = point.x + randomRange(-0.06, 0.06);
      const stoneZ = point.z + randomRange(-0.06, 0.06);
      const groundY = getTerrainHeight(point.x, point.z);
      const stone = addMesh(scene, new THREE.CylinderGeometry(
        radius * randomRange(0.86, 0.96),
        radius,
        height,
        10
      ), materials.path[Math.floor(Math.random() * materials.path.length)], [
        stoneX,
        groundY + 0.035,
        stoneZ
      ], {
        rotation: [0, -Math.atan2(tangent.z, tangent.x) + Math.PI / 2 + randomRange(-0.2, 0.2), 0],
        scale: [scaleX, 0.55, scaleZ]
      });
      stone.rotation.z = randomRange(-0.035, 0.035);
      steppingStones.push({
        x: stoneX,
        z: stoneZ,
        radiusX: radius * scaleX,
        radiusZ: radius * scaleZ,
        topY: groundY + 0.035 + height * 0.55 / 2
      });
    }
  }
  return steppingStones;
}

function addTubeEndCaps(scene, points, radius, material) {
  for (const point of [points[0], points[points.length - 1]]) {
    addMesh(scene, new THREE.SphereGeometry(radius, 10, 8), material, point.toArray());
  }
}

function createTorii(scene) {
  const group = new THREE.Group();
  const centerX = -5.3;
  const centerZ = -2.35;
  const terrainY = getTerrainHeight(centerX, centerZ);
  group.position.set(centerX, terrainY, centerZ);
  scene.add(group);
  const pillarX = 1.42;
  const pillarHeight = 3.42;
  for (const x of [-pillarX, pillarX]) {
    const pillar = addMesh(group, new THREE.CylinderGeometry(0.17, 0.23, pillarHeight, 12), materials.vermilion, [x, pillarHeight / 2, 0]);
    pillar.scale.x = 1.08;
    const pillarGround = getTerrainHeight(centerX + x, centerZ);
    pillar.position.y += pillarGround - terrainY;
  }
  addMesh(group, new THREE.BoxGeometry(4.2, 0.3, 0.4), materials.vermilion, [0, 2.67, 0]);
  addMesh(group, new THREE.BoxGeometry(0.32, 0.48, 0.62), materials.vermilion, [0, 2.91, 0]);
  addMesh(group, new THREE.BoxGeometry(5.15, 0.36, 0.66), materials.vermilionLight, [0, 3.28, 0]);
  addCurvedBeam(group, [
    [-2.58, 3.31, 0], [-1.6, 3.24, 0], [0, 3.22, 0], [1.6, 3.24, 0], [2.58, 3.31, 0]
  ], 0.17, materials.vermilion);
}

function createRoofTier(scene, x, z, y, width, topWidth, roofHeight) {
  const divisions = 18;
  const vertices = [];
  const indices = [];
  for (let side = 0; side < 4; side += 1) {
    for (let i = 0; i <= divisions; i += 1) {
      const t = -1 + (2 * i) / divisions;
      const curve = Math.pow(Math.abs(t), 2.1);
      const eaveY = y + roofHeight * curve + 0.08 * Math.cos(t * Math.PI / 2);
      const innerX = t * topWidth / 2;
      const outerX = t * width / 2;
      const inner = [innerX, y + roofHeight, -topWidth / 2];
      const outer = [outerX, eaveY, -width / 2 + Math.abs(t) * 0.11];
      for (const [px, py, pz] of [inner, outer]) {
        let rx = px;
        let rz = pz;
        for (let turn = 0; turn < side; turn += 1) [rx, rz] = [-rz, rx];
        vertices.push(x + rx, py, z + rz);
      }
    }
    for (let i = 0; i < divisions; i += 1) {
      const a = side * (divisions + 1) * 2 + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const roof = addMesh(scene, geometry, materials.roof, [0, 0, 0]);
  roof.material.side = THREE.DoubleSide;
  addMesh(scene, new THREE.BoxGeometry(width * 1.03, 0.12, width * 1.03), materials.roofEdge, [x, y + 0.02, z], {
    castShadow: true
  });
}

function createPagoda(scene) {
  const x = 3.05;
  const z = -2.65;
  const groundY = getTerrainHeight(x, z);
  const floorLevels = [0.58 + groundY, 2.35 + groundY, 4.12 + groundY];
  const roofSpecs = [
    { y: 1.72 + groundY, width: 4.25, top: 0.96, height: 0.63 },
    { y: 3.48 + groundY, width: 3.35, top: 0.78, height: 0.64 },
    { y: 5.24 + groundY, width: 2.47, top: 0.62, height: 0.64 }
  ];
  addMesh(scene, new THREE.BoxGeometry(2.45, 0.3, 2.45), materials.stone, [x, groundY + 0.1, z]);
  addMesh(scene, new THREE.BoxGeometry(1.85, 0.2, 1.85), materials.wood, [x, groundY + 0.35, z]);
  addMesh(scene, new THREE.BoxGeometry(0.92, 5.2, 0.92), materials.wood, [x, groundY + 2.95, z], {
    castShadow: false
  });
  for (let tier = 0; tier < floorLevels.length; tier += 1) {
    const baseY = floorLevels[tier];
    const width = 1.92 - tier * 0.43;
    const trimColors = ['#a17a59', '#92704f', '#a88360'];
    const beamColors = ['#75533c', '#684838', '#7b5940'];
    addMesh(scene, new THREE.BoxGeometry(width, 0.18, width),
      tintedMaterial(materials.woodLight, trimColors[tier]), [x, baseY, z]);
    const pillarOffset = width * 0.39;
    const height = 1.04;
    for (const px of [-pillarOffset, pillarOffset]) {
      for (const pz of [-pillarOffset, pillarOffset]) {
        const pillarTerrain = getTerrainHeight(x + px, z + pz);
        const pillarY = baseY + height / 2 + 0.08 + pillarTerrain - groundY;
        addMesh(scene, new THREE.BoxGeometry(0.13, height, 0.13),
          tintedMaterial(materials.wood, beamColors[tier]), [x + px, pillarY, z + pz]);
      }
    }
    addMesh(scene, new THREE.BoxGeometry(width * 0.86, 0.94, width * 0.86), materials.wood, [x, baseY + 0.55, z], { castShadow: false });
    addMesh(scene, new THREE.BoxGeometry(width * 0.7, 0.76, 0.08), materials.paper, [x, baseY + 0.55, z + width * 0.44]);
    addMesh(scene, new THREE.BoxGeometry(0.08, 0.78, width * 0.66), materials.paper, [x + width * 0.44, baseY + 0.55, z]);
    addMesh(scene, new THREE.BoxGeometry(width * 1.03, 0.12, width * 1.03),
      tintedMaterial(materials.woodLight, trimColors[(tier + 1) % trimColors.length]), [x, baseY + 1.12, z]);
  }
  for (const spec of roofSpecs) createRoofTier(scene, x, z, spec.y, spec.width, spec.top, spec.height);
  const spireBase = 5.88 + groundY;
  addMesh(scene, new THREE.CylinderGeometry(0.46, 0.52, 0.42, 12), materials.wood, [
    x, groundY + 5.69, z
  ], { castShadow: false });
  addMesh(scene, new THREE.CylinderGeometry(0.07, 0.15, 0.28, 10), materials.roofEdge, [x, spireBase + 0.14, z]);
  for (let i = 0; i < 7; i += 1) {
    const y = spireBase + 0.22 + i * 0.16;
    const radius = 0.28 * (1 - i / 9);
    addMesh(scene, new THREE.CylinderGeometry(radius * 0.78, radius, 0.055, 12), materials.roofEdge, [x, y, z]);
  }
  const rodBottom = spireBase - 0.08;
  const rodTop = 7.67 + groundY + 0.11;
  addMesh(scene, new THREE.CylinderGeometry(0.035, 0.055, rodTop - rodBottom, 10), materials.woodLight, [
    x, (rodTop + rodBottom) / 2, z
  ]);
  addMesh(scene, new THREE.SphereGeometry(0.105, 10, 8), materials.vermilionLight, [x, 7.67 + groundY, z]);
}

function createBridge(scene) {
  const span = 11.6;
  const centerX = 0;
  const centerZ = 2.15;
  const deckY = (x) => {
    const groundY = getTerrainHeight(centerX + x, centerZ);
    return groundY + 0.065 + 0.48 * (1 - Math.pow(x / (span / 2), 2));
  };
  const boardCount = 41;
  const boardWidth = span / (boardCount - 1) + 0.025;
  for (let i = 0; i < boardCount; i += 1) {
    const x = -span / 2 + (span * i) / (boardCount - 1);
    const y = deckY(x);
    const plankTints = ['#73543e', '#806047', '#684a37', '#8a684d'];
    const plank = addMesh(scene, new THREE.BoxGeometry(boardWidth, 0.13, 1.65),
      tintedMaterial(i % 3 === 0 ? materials.woodLight : materials.wood, plankTints[i % plankTints.length]),
      [centerX + x, y, centerZ], {
      scale: [1, 1, 1],
      rotation: [0, randomRange(-0.012, 0.012), 0]
    });
    plank.castShadow = true;
    if (i % 5 === 0 || i === boardCount - 1) {
      const supportX = centerX + x;
      for (const side of [-1, 1]) {
        const supportZ = centerZ + side * 0.66;
        const supportGround = getTerrainHeight(supportX, supportZ);
        const supportHeight = y - 0.065 - supportGround;
        if (supportHeight > 0.06) {
          addMesh(scene, new THREE.BoxGeometry(0.16, supportHeight, 0.16), materials.wood, [
            supportX, supportGround + supportHeight / 2, supportZ
          ]);
        }
      }
    }
  }
  for (const side of [-1, 1]) {
    const railPoints = Array.from({ length: 11 }, (_, i) => {
      const x = -span / 2 + (span * i) / 10;
      return new THREE.Vector3(centerX + x, deckY(x) + 0.87, centerZ + side * 0.83);
    });
    const railCurve = new THREE.CatmullRomCurve3(railPoints);
    addMesh(scene, new THREE.TubeGeometry(railCurve, 48, 0.075, 8, false), materials.woodLight, [0, 0, 0]);
    addTubeEndCaps(scene, railPoints, 0.075, materials.woodLight);
    for (let i = 0; i <= 24; i += 1) {
      const x = -span / 2 + (span * i) / 24;
      const y = deckY(x);
      addMesh(scene, new THREE.BoxGeometry(0.14, 0.84, 0.14), materials.wood, [
        centerX + x, y + 0.42, centerZ + side * 0.83
      ]);
    }
  }
  const stringerPoints = Array.from({ length: 13 }, (_, i) => {
    const x = -span / 2 + (span * i) / 12;
    return new THREE.Vector3(centerX + x, deckY(x) - 0.12, centerZ);
  });
  const stringerCurve = new THREE.CatmullRomCurve3(stringerPoints);
  addMesh(scene, new THREE.TubeGeometry(stringerCurve, 52, 0.12, 8, false), materials.wood, [0, 0, 0]);
  addTubeEndCaps(scene, stringerPoints, 0.12, materials.wood);
}

function createSakura(scene, onTreeError) {
  const treeX = 5.45;
  const treeZ = 7.05;
  const root = new THREE.Group();
  root.position.set(treeX, getTerrainHeight(treeX, treeZ), treeZ);
  scene.add(root);
  const state = {
    root,
    treeVisual: null,
    petalGeometry: null,
    positions: null,
    velocities: null,
    phases: null,
    modes: null,
    active: null,
    ages: null,
    opacities: null,
    waterOrigins: null,
    settledGeometry: null,
    settledPositions: null,
    settledOpacities: null,
    settledCount: 0,
    settledCapacity: 256,
    canopy: null,
    maxPetals: 1000,
    activeCount: 0,
    nextSpawnIndex: 0,
    emissionAccumulator: 0
  };
  const loader = new GLTFLoader();
  state.treeReady = new Promise((resolve) => {
    loader.load(sakuraModelUrl, (gltf) => {
      const model = gltf.scene;
      const sourceBounds = new THREE.Box3().setFromObject(model);
      const sourceSize = sourceBounds.getSize(new THREE.Vector3());
      if (!Number.isFinite(sourceSize.y) || sourceSize.y <= 0) {
        const error = new Error('The Sakura GLTF has no measurable height.');
        onTreeError(error);
        resolve(false);
        return;
      }

      const targetHeight = 5.4;
      const scale = targetHeight / sourceSize.y;
      const centerX = (sourceBounds.min.x + sourceBounds.max.x) / 2;
      const centerZ = (sourceBounds.min.z + sourceBounds.max.z) / 2;
      model.scale.setScalar(scale);
      model.position.set(-centerX * scale, -sourceBounds.min.y * scale, -centerZ * scale);
      model.traverse((child) => {
        if (!child.isMesh) return;
        child.castShadow = true;
        child.receiveShadow = true;
      });
      root.add(model);
      state.treeVisual = model;

      const canopy = {
        minX: -((sourceBounds.max.x - sourceBounds.min.x) * scale * 0.39),
        maxX: (sourceBounds.max.x - sourceBounds.min.x) * scale * 0.39,
        minZ: -((sourceBounds.max.z - sourceBounds.min.z) * scale * 0.39),
        maxZ: (sourceBounds.max.z - sourceBounds.min.z) * scale * 0.39,
        minY: targetHeight * 0.4,
        maxY: targetHeight * 0.8
      };
      state.canopy = canopy;
      state.positions = new Float32Array(state.maxPetals * 3);
      state.velocities = new Float32Array(state.maxPetals * 3);
      state.phases = new Float32Array(state.maxPetals);
      state.modes = new Uint8Array(state.maxPetals);
      state.active = new Uint8Array(state.maxPetals);
      state.ages = new Float32Array(state.maxPetals);
      state.opacities = new Float32Array(state.maxPetals);
      state.waterOrigins = new Float32Array(state.maxPetals * 2);
      state.modes.fill(PETAL_INACTIVE);
      for (let i = 0; i < state.maxPetals; i += 1) state.phases[i] = Math.random() * Math.PI * 2;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(state.positions, 3).setUsage(THREE.DynamicDrawUsage));
      geometry.setAttribute('aOpacity', new THREE.BufferAttribute(state.opacities, 1).setUsage(THREE.DynamicDrawUsage));
      geometry.setDrawRange(0, state.maxPetals);
      state.petalGeometry = geometry;
      const petalMaterial = createPetalMaterial(createPetalTexture());
      const petals = new THREE.Points(geometry, petalMaterial);
      petals.frustumCulled = false;
      root.add(petals);

      state.settledPositions = new Float32Array(state.settledCapacity * 3);
      state.settledOpacities = new Float32Array(state.settledCapacity).fill(1);
      state.settledGeometry = new THREE.BufferGeometry();
      state.settledGeometry.setAttribute(
        'position',
        new THREE.BufferAttribute(state.settledPositions, 3).setUsage(THREE.DynamicDrawUsage)
      );
      state.settledGeometry.setAttribute(
        'aOpacity',
        new THREE.BufferAttribute(state.settledOpacities, 1).setUsage(THREE.DynamicDrawUsage)
      );
      state.settledGeometry.setDrawRange(0, 0);
      const settledPetals = new THREE.Points(state.settledGeometry, petalMaterial);
      settledPetals.frustumCulled = false;
      root.add(settledPetals);
      resolve(true);
    }, undefined, (error) => {
      onTreeError(error);
      resolve(false);
    });
  });
  return state;
}

function resetPetal(state, petalIndex) {
  const index = petalIndex * 3;
  const canopy = state.canopy;
  const verticalPosition = randomRange(-1, 1);
  const crownRadius = Math.sqrt(Math.max(0, 1 - verticalPosition * verticalPosition));
  const angle = randomRange(0, Math.PI * 2);
  const horizontalRadius = Math.sqrt(Math.random()) * crownRadius;
  const centerY = (canopy.minY + canopy.maxY) / 2;
  const halfHeight = (canopy.maxY - canopy.minY) / 2;
  state.positions[index] = Math.cos(angle) * horizontalRadius * canopy.maxX;
  state.positions[index + 1] = centerY + verticalPosition * halfHeight;
  state.positions[index + 2] = Math.sin(angle) * horizontalRadius * canopy.maxZ;
  state.velocities[index] = randomRange(-0.16, 0.16);
  state.velocities[index + 1] = randomRange(-0.42, -0.2);
  state.velocities[index + 2] = randomRange(-0.13, 0.13);
  state.modes[petalIndex] = PETAL_FALLING;
  state.ages[petalIndex] = 0;
  state.opacities[petalIndex] = 1;
  if (state.active[petalIndex] === 0) {
    state.active[petalIndex] = 1;
    state.activeCount += 1;
  }
}

function deactivatePetal(state, petalIndex) {
  if (state.active[petalIndex] === 0) return;
  state.active[petalIndex] = 0;
  state.modes[petalIndex] = PETAL_INACTIVE;
  state.ages[petalIndex] = 0;
  state.opacities[petalIndex] = 0;
  state.activeCount = Math.max(0, state.activeCount - 1);
}

function addSettledPetal(state, x, y, z) {
  if (state.settledCount >= state.settledCapacity) {
    const nextCapacity = state.settledCapacity * 2;
    const positions = new Float32Array(nextCapacity * 3);
    positions.set(state.settledPositions);
    const opacities = new Float32Array(nextCapacity).fill(1);
    opacities.set(state.settledOpacities);
    state.settledCapacity = nextCapacity;
    state.settledPositions = positions;
    state.settledOpacities = opacities;
    state.settledGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage)
    );
    state.settledGeometry.setAttribute(
      'aOpacity',
      new THREE.BufferAttribute(opacities, 1).setUsage(THREE.DynamicDrawUsage)
    );
  }

  const index = state.settledCount * 3;
  state.settledPositions[index] = x;
  state.settledPositions[index + 1] = y;
  state.settledPositions[index + 2] = z;
  state.settledCount += 1;
  state.settledGeometry.setDrawRange(0, state.settledCount);
  state.settledGeometry.attributes.position.needsUpdate = true;
}

function recycleOrRetirePetal(state, petalIndex, targetCount) {
  if (state.activeCount > targetCount) deactivatePetal(state, petalIndex);
  else resetPetal(state, petalIndex);
}

function emitPetalsTowardTarget(state, targetCount, delta) {
  if (state.activeCount >= targetCount) {
    state.emissionAccumulator = 0;
    return;
  }

  state.emissionAccumulator += delta * 72;
  while (state.emissionAccumulator >= 1 && state.activeCount < targetCount) {
    let slot = -1;
    for (let offset = 0; offset < state.maxPetals; offset += 1) {
      const candidate = (state.nextSpawnIndex + offset) % state.maxPetals;
      if (state.active[candidate] === 0) {
        slot = candidate;
        state.nextSpawnIndex = (candidate + 1) % state.maxPetals;
        break;
      }
    }
    if (slot < 0) break;
    resetPetal(state, slot);
    state.emissionAccumulator -= 1;
  }
}

function createPetalMaterial(texture) {
  return new THREE.ShaderMaterial({
    uniforms: { uPetalMap: { value: texture } },
    vertexShader: `
      attribute float aOpacity;
      varying float vOpacity;

      void main() {
        vOpacity = aOpacity;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        gl_PointSize = clamp(90.0 / max(1.0, -mvPosition.z), 1.0, 8.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D uPetalMap;
      varying float vOpacity;

      void main() {
        vec4 petal = texture2D(uPetalMap, gl_PointCoord);
        float alpha = petal.a * vOpacity * 0.92;
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(vec3(1.0, 0.72, 0.79) * petal.rgb, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false
  });
}

function createPetalTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 30);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.55, 'rgba(255,255,255,0.95)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.beginPath();
  context.ellipse(32, 32, 16, 25, 0.36, 0, Math.PI * 2);
  context.fill();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createMountainGeometry(radius, height) {
  const vertices = [];
  const colors = [];
  const indices = [];
  const segments = 8;
  const peakX = randomRange(-radius * 0.18, radius * 0.18);
  const peakZ = randomRange(-radius * 0.14, radius * 0.14);
  const fogColor = new THREE.Color('#cbd4d2');
  const summitColor = new THREE.Color('#87938d');
  const addVertex = (x, y, z) => {
    vertices.push(x, y, z);
    const heightMix = THREE.MathUtils.smoothstep(y / height + 0.5, 0.02, 0.82);
    const color = fogColor.clone().lerp(summitColor, heightMix);
    colors.push(color.r, color.g, color.b);
  };
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const baseRadius = radius * randomRange(0.82, 1.12);
    const middleRadius = radius * randomRange(0.42, 0.66);
    addVertex(Math.cos(angle) * baseRadius, -height / 2, Math.sin(angle) * baseRadius);
    addVertex(
      peakX + Math.cos(angle + 0.12) * middleRadius,
      -height / 2 + height * randomRange(0.42, 0.64),
      peakZ + Math.sin(angle + 0.12) * middleRadius
    );
    const next = (i + 1) % segments;
    const currentBase = i * 2;
    const nextBase = next * 2;
    indices.push(currentBase, nextBase, currentBase + 1, nextBase, nextBase + 1, currentBase + 1);
    indices.push(currentBase + 1, nextBase + 1, segments * 2);
  }
  addVertex(peakX, height / 2, peakZ);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function createLantern(scene, x, z, scale = 1) {
  const group = new THREE.Group();
  const groundY = getTerrainHeight(x, z);
  group.position.set(x, groundY, z);
  group.scale.setScalar(scale);
  scene.add(group);
  addMesh(group, new THREE.CylinderGeometry(0.19, 0.25, 0.2, 8), materials.stone, [0, 0.14, 0]);
  addMesh(group, new THREE.CylinderGeometry(0.13, 0.16, 0.7, 8), materials.stone, [0, 0.56, 0]);
  addMesh(group, new THREE.BoxGeometry(0.7, 0.12, 0.7), materials.stone, [0, 0.97, 0]);
  addMesh(group, new THREE.BoxGeometry(0.53, 0.53, 0.53), materials.lanternGlow, [0, 1.3, 0]);
  addMesh(group, new THREE.BoxGeometry(0.09, 0.55, 0.08), materials.stone, [0, 1.3, 0.3]);
  addMesh(group, new THREE.BoxGeometry(0.09, 0.55, 0.08), materials.stone, [0, 1.3, -0.3]);
  addMesh(group, new THREE.BoxGeometry(0.09, 0.55, 0.08), materials.stone, [0.3, 1.3, 0]);
  addMesh(group, new THREE.BoxGeometry(0.09, 0.55, 0.08), materials.stone, [-0.3, 1.3, 0]);
  addMesh(group, new THREE.CylinderGeometry(0.4, 0.16, 0.24, 8), materials.lanternRoof, [0, 1.69, 0]);
  addMesh(group, new THREE.CylinderGeometry(0.12, 0.2, 0.12, 8), materials.stone, [0, 1.87, 0]);
  const light = new THREE.PointLight('#ffb700', 2.0, 4.0, 2);
  light.position.set(0, 1.3, 0);
  group.add(light);
  return { group, light, phase: Math.random() * Math.PI * 2 };
}

function createMountains(scene) {
  const rings = [
    { radius: 22.5, count: 48, width: 6.4, height: 13.5 },
    { radius: 37, count: 56, width: 7.2, height: 17.5 }
  ];
  for (let ringIndex = 0; ringIndex < rings.length; ringIndex += 1) {
    const ring = rings[ringIndex];
    for (let i = 0; i < ring.count; i += 1) {
      const angle = ((i + (ringIndex === 0 ? 0 : 0.5)) / ring.count) * Math.PI * 2 +
        randomRange(-0.025, 0.025);
      const radius = ring.radius + randomRange(-0.8, 0.8);
      const height = ring.height * randomRange(0.72, 1.28);
      const peakRadius = ring.width * randomRange(0.85, 1.15);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const mountain = addMesh(scene, createMountainGeometry(peakRadius, height), materials.mountain, [
        x, height / 2 - 0.3, z
      ], {
        rotation: [randomRange(-0.035, 0.035), randomRange(-0.2, 0.2), randomRange(-0.08, 0.08)],
        castShadow: false
      });
      mountain.material.side = THREE.DoubleSide;
      mountain.receiveShadow = false;
    }
  }
}

function createGardenDetails(scene) {
  const boulderGeometry = createBoulderGeometry();
  const pathSegments = [
    [[-9.2, 5.3], [-8.2, 4.45], [-7.3, 3.65], [-6.4, 2.8], [-5.78, 2.15]],
    [[5.78, 2.15], [6.4, 2.8], [7.3, 3.65], [8.2, 4.45], [9.2, 5.3]]
  ];
  const bridgeLandings = [[-5.8, 2.15], [5.8, 2.15]];
  const accepted = [];
  const pointSegmentDistance = (x, z, a, b) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0 ? 0 : THREE.MathUtils.clamp(
      ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSquared, 0, 1
    );
    return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
  };
  const isClear = (x, z) => {
    if (Math.hypot(x, z) > MAX_GARDEN_SCENERY_RADIUS) return false;
    if (Math.hypot(x - 5.45, z - 7.05) < 2.0) return false;
    if (x > POND_BOUNDS.left - 1.8 && x < POND_BOUNDS.right + 1.8 &&
      z > POND_BOUNDS.near - 1.8 && z < POND_BOUNDS.far + 1.8) return false;
    if (Math.abs(x - 3.05) < 2.2 && Math.abs(z + 2.65) < 2.2) return false;
    if (Math.abs(x + 5.3) < 2.0 && Math.abs(z + 2.35) < 2.0) return false;
    if (bridgeLandings.some(([landingX, landingZ]) => Math.hypot(x - landingX, z - landingZ) < 1.8)) return false;
    if (pathSegments.some((points) => points.slice(1).some((point, index) =>
      pointSegmentDistance(x, z, points[index], point) < 1.8
    ))) return false;
    return accepted.every((position) => Math.hypot(x - position.x, z - position.z) > 0.28);
  };

  for (let i = 0; i < 84; i += 1) {
    let position = null;
    for (let attempt = 0; attempt < 120; attempt += 1) {
      const angle = randomRange(0, Math.PI * 2);
      const radius = Math.sqrt(Math.random()) * (MAX_GARDEN_SCENERY_RADIUS - 0.2);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (isClear(x, z)) {
        position = { x, z };
        accepted.push(position);
        break;
      }
    }
    if (!position) continue;

    const x = position.x;
    const z = position.z;
    const stoneScale = randomRange(0.1, 0.35);
    const radius = stoneScale * randomRange(0.85, 1.15);
    const yScale = stoneScale * randomRange(0.58, 0.82);
    const groundY = getTerrainHeight(x, z);
    const boulderY = groundY + yScale * 0.7;
    const stoneMaterial = materials.stoneVariants[Math.floor(Math.random() * materials.stoneVariants.length)];
    const boulder = addMesh(scene, boulderGeometry, stoneMaterial, [x, boulderY, z], {
      scale: [radius, yScale, radius * randomRange(0.8, 1.18)]
    });
    boulder.rotation.y = randomRange(0, Math.PI);
  }
  return accepted;
}

function createBoulderGeometry() {
  const geometry = mergeVertices(new THREE.IcosahedronGeometry(1, 3), 1e-4);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const noise = Math.sin(x * 5.4 + z * 3.1) * Math.cos(y * 4.7 - x * 2.2);
    const broad = Math.sin(z * 2.6 + y * 1.9) * 0.04;
    const radius = 1 + noise * 0.035 + broad;
    positions.setXYZ(i, x * radius, y * radius, z * radius);
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function loadBambooModels(scene, onModelError, rockPositions) {
  const loader = new GLTFLoader();
  const placements = [];
  const occupiedPositions = [];
  const pagoda = { x: 3.05, z: -2.65 };
  const torii = { x: -5.3, z: -2.35 };
  const sakura = { x: 5.45, z: 7.05 };
  const benches = [[-8.1, 1.8], [8.35, 2.2]];
  const pathSegments = [
    [[-9.2, 5.3], [-8.2, 4.45], [-7.3, 3.65], [-6.4, 2.8], [-5.78, 2.15]],
    [[5.78, 2.15], [6.4, 2.8], [7.3, 3.65], [8.2, 4.45], [9.2, 5.3]]
  ];
  const pointSegmentDistance = (x, z, a, b) => {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const lengthSquared = dx * dx + dz * dz;
    const t = lengthSquared === 0 ? 0 : THREE.MathUtils.clamp(((x - a[0]) * dx + (z - a[1]) * dz) / lengthSquared, 0, 1);
    return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
  };
  const isClear = (x, z) => {
    if (Math.hypot(x, z) > MAX_GARDEN_SCENERY_RADIUS - 0.05) return false;
    if (x > POND_BOUNDS.left - 0.9 && x < POND_BOUNDS.right + 0.9 &&
      z > POND_BOUNDS.near - 0.9 && z < POND_BOUNDS.far + 0.9) return false;
    if (Math.abs(x - pagoda.x) <= 3.4 && Math.abs(z - pagoda.z) <= 3.4) return false;
    if (Math.abs(x - torii.x) < 3.4 && Math.abs(z - torii.z) < 2.8) return false;
    if (rockPositions.some(({ x: rockX, z: rockZ }) => Math.hypot(x - rockX, z - rockZ) < 0.95)) return false;
    if (Math.hypot(x - sakura.x, z - sakura.z) < 3.5) return false;
    if (benches.some(([benchX, benchZ]) => Math.hypot(x - benchX, z - benchZ) < 2.8)) return false;
    if ([[-5.8, 2.15], [5.8, 2.15]].some(([landingX, landingZ]) =>
      Math.hypot(x - landingX, z - landingZ) < 1.5
    )) return false;
    return pathSegments.every((points) => points.slice(1).every((point, i) =>
      pointSegmentDistance(x, z, points[i], point) > 1.5
    ));
  };
  const addPlant = (url, kind, preferredAngle, minimumSpacing, radiusRange, attempts = 180) => {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const angle = attempt < 72
        ? preferredAngle + randomRange(-0.24, 0.24)
        : randomRange(0, Math.PI * 2);
      const radius = randomRange(radiusRange[0], radiusRange[1]);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (!isClear(x, z)) continue;
      if (occupiedPositions.some((position) =>
        Math.hypot(x - position.x, z - position.z) < Math.max(minimumSpacing, position.minimumSpacing)
      )) continue;
      placements.push({
        x,
        z,
        url,
        kind,
        zone: radiusRange[0] < 14 ? 'interior' : 'perimeter'
      });
      occupiedPositions.push({ x, z, minimumSpacing });
      return true;
    }
    return false;
  };
  const ashCount = 8;
  for (let i = 0; i < ashCount; i += 1) {
    const angle = (i / ashCount) * Math.PI * 2;
    if (!addPlant(ashTreeUrl, 'ash', angle, 2.6, [14.1, 15.7])) {
      console.warn(`Unable to place perimeter Japanese ash tree ${i + 1} of ${ashCount}.`);
    }
  }
  const bambooCount = 60;
  for (let i = 0; i < bambooCount; i += 1) {
    const url = i % 2 === 0 ? bambooOneUrl : bambooTwoUrl;
    const angle = (i / bambooCount) * Math.PI * 2 + randomRange(-0.08, 0.08);
    if (!addPlant(url, 'bamboo', angle, 0.82, [14.1, 15.7])) {
      console.warn(`Unable to place perimeter bamboo ${i + 1} of ${bambooCount}.`);
    }
  }

  const shrubMaterials = ['#647b42', '#748b4a', '#536c39'].map((color) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.94 })
  );
  const addShrub = (x, z) => {
    const shrub = new THREE.Group();
    shrub.position.set(x, getTerrainHeight(x, z), z);
    for (let i = 0; i < 7; i += 1) {
      const size = randomRange(0.25, 0.48);
      const geometry = new THREE.IcosahedronGeometry(size, 1);
      const foliage = new THREE.Mesh(geometry, shrubMaterials[i % shrubMaterials.length]);
      foliage.position.set(randomRange(-0.38, 0.38), size * 0.55, randomRange(-0.38, 0.38));
      foliage.scale.set(1, randomRange(0.7, 1.1), 1);
      foliage.castShadow = true;
      foliage.receiveShadow = true;
      shrub.add(foliage);
    }
    scene.add(shrub);
  };
  const interiorBambooCount = 28;
  for (let i = 0; i < interiorBambooCount; i += 1) {
    const angle = (i / interiorBambooCount) * Math.PI * 2 + randomRange(-0.2, 0.2);
    if (!addPlant(i % 2 === 0 ? bambooOneUrl : bambooTwoUrl, 'bamboo', angle, 1.25, [7.1, 14.8])) {
      console.warn(`Unable to place interior bamboo cluster ${i + 1} of ${interiorBambooCount}.`);
    }
  }
  const shrubCount = 24;
  for (let i = 0; i < shrubCount; i += 1) {
    let placed = false;
    for (let attempt = 0; attempt < 80 && !placed; attempt += 1) {
      const angle = randomRange(0, Math.PI * 2);
      const radius = randomRange(7.5, 15.2);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      if (!isClear(x, z)) continue;
      if (occupiedPositions.some((position) => Math.hypot(x - position.x, z - position.z) < 1.0)) continue;
      occupiedPositions.push({ x, z, minimumSpacing: 1.0 });
      addShrub(x, z);
      placed = true;
    }
    if (!placed) {
      console.warn(`Unable to place interior greenery bush ${i + 1} of ${shrubCount}.`);
    }
  }

  const modelCache = new Map();

  const loadModel = (url) => {
    if (!modelCache.has(url)) {
      modelCache.set(url, new Promise((resolve) => {
        loader.load(url, resolve, undefined, (error) => {
          onModelError(error, url);
          resolve(null);
        });
      }));
    }
    return modelCache.get(url);
  };

  return Promise.all(placements.map(async ({ x, z, url, kind, zone }) => {
    const gltf = await loadModel(url);
    if (!gltf) return false;
    const template = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(template);
    const size = bounds.getSize(new THREE.Vector3());
    if (size.y <= 0 || !Number.isFinite(size.y)) {
      onModelError(new Error(`${kind} GLTF has no measurable height.`), url);
      return false;
    }
    const targetHeight = kind === 'ash' ? 4.8 : zone === 'interior' ? 1.75 : 3.0;
    const scale = (targetHeight / size.y) * randomRange(0.5, 1.4);
    const instance = template.clone(true);
    instance.scale.setScalar(scale);
    instance.position.set(
      -((bounds.min.x + bounds.max.x) / 2) * scale,
      -bounds.min.y * scale,
      -((bounds.min.z + bounds.max.z) / 2) * scale
    );
    instance.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      child.receiveShadow = true;
    });
    const stand = new THREE.Group();
    stand.position.set(x, getTerrainHeight(x, z), z);
    stand.rotation.y = randomRange(0, Math.PI * 2);
    stand.add(instance);
    scene.add(stand);
    return true;
  }));
}

function createLoungers(scene) {
  const width = 1.8;
  const seatHeight = 0.46;
  const benches = [[-8.1, 1.8, -0.22], [8.35, 2.2, 0.22]];
  for (const [x, z, facing] of benches) {
    const groundY = getTerrainHeight(x, z);
    const bench = new THREE.Group();
    bench.position.set(x, groundY, z);
    bench.rotation.y = facing;
    scene.add(bench);
    addMesh(bench, new THREE.BoxGeometry(width, 0.14, 0.72), materials.woodLight, [0, seatHeight, 0]);
    for (const side of [-1, 1]) {
      for (const depth of [-1, 1]) {
        const legX = x + side * 0.7 * Math.cos(facing) + depth * 0.24 * Math.sin(facing);
        const legZ = z - side * 0.7 * Math.sin(facing) + depth * 0.24 * Math.cos(facing);
        const legTerrain = getTerrainHeight(legX, legZ);
        const legHeight = seatHeight + groundY - legTerrain;
        addMesh(bench, new THREE.BoxGeometry(0.13, seatHeight, 0.13), materials.wood, [
          side * 0.7, (seatHeight + legTerrain - groundY) / 2, depth * 0.24
        ], { scale: [1, legHeight / seatHeight, 1] });
      }
    }
    const backrest = new THREE.Group();
    const recline = Math.PI / 12;
    backrest.position.set(0, seatHeight + 0.07, -0.31);
    backrest.rotation.x = -recline;
    addMesh(backrest, new THREE.BoxGeometry(width, 0.72, 0.12), materials.wood, [0, 0.36, 0]);
    bench.add(backrest);
  }
}

export function createZenGarden(scene, waterMaterial, onTreeError = (error) => console.error('Unable to load the Sakura GLTF asset:', error)) {
  const island = new THREE.Group();
  island.scale.setScalar(0.92);
  scene.add(island);

  const terrain = createTerrain(island);
  createMountains(scene);
  const steppingStones = createPath(island);
  createTorii(island);
  createPagoda(island);
  createBridge(island);
  const rockPositions = createGardenDetails(island);
  const bambooReady = loadBambooModels(island, (error, url) => {
    console.error(`Unable to load perimeter vegetation model ${url}:`, error);
  }, rockPositions);
  createLoungers(island);
  const lanterns = [
    createLantern(island, -7.15, 0.15, 0.92),
    createLantern(island, 7.1, 0.25, 1.1),
    createLantern(island, -1.4, 6.4, 0.78)
  ];
  const sakura = createSakura(island, onTreeError);
  const pondWidth = POND_BOUNDS.right - POND_BOUNDS.left;
  const pondDepth = POND_BOUNDS.far - POND_BOUNDS.near;
  const pondCenterX = (POND_BOUNDS.left + POND_BOUNDS.right) / 2;
  const pondCenterZ = (POND_BOUNDS.near + POND_BOUNDS.far) / 2;
  const waterGeometry = new THREE.PlaneGeometry(pondWidth, pondDepth);
  const reflection = new Reflector(waterGeometry, {
    clipBias: 0.003,
    textureWidth: 1024,
    textureHeight: 1024,
    color: 0x50625e
  });
  reflection.rotation.x = -Math.PI / 2;
  reflection.position.set(
    (POND_BOUNDS.left + POND_BOUNDS.right) / 2,
    POND_BOUNDS.surface,
    (POND_BOUNDS.near + POND_BOUNDS.far) / 2
  );
  island.add(reflection);

  const water = new THREE.Mesh(waterGeometry.clone(), waterMaterial);
  water.rotation.x = -Math.PI / 2;
  water.position.set(
    (POND_BOUNDS.left + POND_BOUNDS.right) / 2,
    POND_BOUNDS.surface + 0.006,
    (POND_BOUNDS.near + POND_BOUNDS.far) / 2
  );
  water.receiveShadow = true;
  water.renderOrder = 1;
  island.add(water);
  return {
    ...sakura,
    ...terrain,
    water,
    lanterns,
    treeReady: Promise.all([sakura.treeReady, bambooReady]).then(([loaded]) => loaded),
    setRipple(x, z, time, strength = 1) {
      triggerWaterRipple(waterMaterial, x - pondCenterX, z - pondCenterZ, time, strength);
    },
    disperseFloatingPetals(x, z, radius = 3.2, impulse = 2.8) {
      for (let i = 0; i < sakura.maxPetals; i += 1) {
        if (sakura.modes[i] !== 2) continue;
        const index = i * 3;
        const petalX = sakura.root.position.x + sakura.positions[index];
        const petalZ = sakura.root.position.z + sakura.positions[index + 2];
        const dx = petalX - x;
        const dz = petalZ - z;
        const distance = Math.hypot(dx, dz);
        if (distance >= radius) continue;
        const falloff = 1 - distance / radius;
        const directionX = distance > 1e-4 ? dx / distance : Math.cos(sakura.phases[i]);
        const directionZ = distance > 1e-4 ? dz / distance : Math.sin(sakura.phases[i]);
        sakura.velocities[index] += directionX * impulse * falloff;
        sakura.velocities[index + 2] += directionZ * impulse * falloff;
      }
    },
    clearPetals() {
      if (!sakura.petalGeometry) return;
      for (let i = 0; i < sakura.maxPetals; i += 1) deactivatePetal(sakura, i);
      sakura.emissionAccumulator = 0;
      sakura.settledCount = 0;
      sakura.settledGeometry.setDrawRange(0, 0);
      sakura.petalGeometry.attributes.position.needsUpdate = true;
      sakura.petalGeometry.attributes.aOpacity.needsUpdate = true;
    },
    update(time, delta, windSpeed, petalDensity) {
      if (sakura.petalGeometry) {
        const targetPetals = THREE.MathUtils.clamp(Math.floor(petalDensity), 0, sakura.maxPetals);
        emitPetalsTowardTarget(sakura, targetPetals, delta);
        const windX = (0.08 + Math.sin(time * 0.31) * 0.12) * windSpeed;
        const windZ = (0.035 + Math.cos(time * 0.24) * 0.09) * windSpeed;
        const waterLevel = POND_BOUNDS.surface + 0.006;
        for (let i = 0; i < sakura.maxPetals; i += 1) {
          if (sakura.active[i] === 0) continue;
          const index = i * 3;
          const phase = sakura.phases[i];
          const mode = sakura.modes[i];

          if (mode === PETAL_FALLING) {
            sakura.positions[index] += (
              sakura.velocities[index] + windX + Math.sin(time * 0.7 + phase) * 0.035 * windSpeed
            ) * delta * windSpeed;
            sakura.positions[index + 1] += sakura.velocities[index + 1] * delta;
            sakura.positions[index + 2] += (
              sakura.velocities[index + 2] + windZ + Math.cos(time * 0.55 + phase) * 0.025 * windSpeed
            ) * delta * windSpeed;
            sakura.ages[i] += delta;

            const x = sakura.root.position.x + sakura.positions[index];
            const z = sakura.root.position.z + sakura.positions[index + 2];
            const onBridge = Math.abs(x) <= BRIDGE_SPAN / 2 &&
              Math.abs(z - BRIDGE_CENTER_Z) <= BRIDGE_HALF_WIDTH;
            const steppingStone = onBridge ? null : steppingStones.find((stone) =>
              ((x - stone.x) / stone.radiusX) ** 2 + ((z - stone.z) / stone.radiusZ) ** 2 <= 1
            );
            const bridgeTop = getTerrainHeight(x, BRIDGE_CENTER_Z) + 0.13 +
              0.48 * (1 - Math.pow(x / (BRIDGE_SPAN / 2), 2));
            const overPond = isOverPond(x, z) && !onBridge && !steppingStone;
            let landingY = getTerrainHeight(x, z);
            if (onBridge) {
              landingY = bridgeTop;
            } else if (steppingStone) {
              landingY = steppingStone.topY;
            } else if (overPond) {
              landingY = waterLevel;
            }
            const absoluteY = sakura.root.position.y + sakura.positions[index + 1];

            if (absoluteY <= landingY + 0.015) {
              if (overPond) {
                sakura.positions[index + 1] = waterLevel - sakura.root.position.y;
                sakura.modes[i] = PETAL_FLOATING;
                sakura.ages[i] = 0;
                sakura.waterOrigins[i * 2] = sakura.positions[index];
                sakura.waterOrigins[i * 2 + 1] = sakura.positions[index + 2];
                triggerWaterRipple(
                  waterMaterial,
                  x - pondCenterX,
                  z - pondCenterZ,
                  time,
                  0.035
                );
              } else {
                addSettledPetal(
                  sakura,
                  sakura.positions[index],
                  landingY + 0.02 - sakura.root.position.y,
                  sakura.positions[index + 2]
                );
                deactivatePetal(sakura, i);
              }
            } else if (sakura.ages[i] >= 30) {
              recycleOrRetirePetal(sakura, i, targetPetals);
            }
          } else {
            sakura.ages[i] += delta;
            if (mode === PETAL_FLOATING) {
              const age = sakura.ages[i];
              sakura.positions[index] += (
                sakura.velocities[index] * 0.42 + Math.sin(time * 0.72 + phase) * 0.018
              ) * delta;
              sakura.positions[index + 2] += (
                sakura.velocities[index + 2] * 0.42 + Math.cos(time * 0.58 + phase) * 0.014
              ) * delta;
              const floatX = THREE.MathUtils.clamp(
                sakura.root.position.x + sakura.positions[index],
                POND_BOUNDS.left + 0.08,
                POND_BOUNDS.right - 0.08
              );
              const floatZ = THREE.MathUtils.clamp(
                sakura.root.position.z + sakura.positions[index + 2],
                POND_BOUNDS.near + 0.08,
                POND_BOUNDS.far - 0.08
              );
              sakura.positions[index] = floatX - sakura.root.position.x;
              sakura.positions[index + 2] = floatZ - sakura.root.position.z;
              const waterDamping = Math.exp(-1.35 * delta);
              sakura.velocities[index] *= waterDamping;
              sakura.velocities[index + 2] *= waterDamping;
              sakura.positions[index + 1] = waterLevel - sakura.root.position.y +
                Math.sin(time * 1.4 + phase) * 0.012;

              const fadeStart = 90;
              const lifetime = 120;
              sakura.opacities[i] = THREE.MathUtils.clamp(
                1 - (age - fadeStart) / (lifetime - fadeStart),
                0,
                1
              );
              if (age >= lifetime) recycleOrRetirePetal(sakura, i, targetPetals);
            }
          }
        }
        sakura.petalGeometry.attributes.position.needsUpdate = true;
        sakura.petalGeometry.attributes.aOpacity.needsUpdate = true;
      }
      if (sakura.treeVisual) {
        sakura.treeVisual.rotation.z = Math.sin(time * 0.55 * windSpeed) * 0.012 * windSpeed;
      }
      for (const lantern of lanterns) {
        lantern.light.intensity = 2 + 0.22 * Math.sin(time * 4.1 + lantern.phase) + 0.08 * Math.sin(time * 9.4 + lantern.phase);
      }
      waterMaterial.uniforms.uTime.value = time;
    }
  };
}
