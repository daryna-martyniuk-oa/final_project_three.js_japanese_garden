import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import GUI from 'lil-gui';
import { createWaterMaterial } from './waterShader.js';
import { createZenGarden } from './zenGarden.js';

const container = document.getElementById('canvas-root');
const loading = document.getElementById('loading');

const scene = new THREE.Scene();
const skyColor = new THREE.Color('#cbd4d2');
scene.background = skyColor.clone();
scene.fog = new THREE.FogExp2(skyColor, 0.025);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 180);
camera.position.set(13.7, 10.4, 16.8);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.5, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.maxPolarAngle = Math.PI * 0.42;
controls.maxDistance = 14.5;
controls.minDistance = 3.5;
controls.update();

function constrainGardenCamera() {
  const maxTargetRadius = 7.5;
  const targetRadius = Math.hypot(controls.target.x, controls.target.z);
  if (targetRadius > maxTargetRadius) {
    const scale = maxTargetRadius / targetRadius;
    controls.target.x *= scale;
    controls.target.z *= scale;
  }
  controls.target.y = THREE.MathUtils.clamp(controls.target.y, 0.35, 5);

  const maxCameraRadius = 14.7;
  const cameraRadius = Math.hypot(camera.position.x, camera.position.z);
  if (cameraRadius > maxCameraRadius) {
    const scale = maxCameraRadius / cameraRadius;
    camera.position.x *= scale;
    camera.position.z *= scale;
  }
  camera.position.y = Math.max(camera.position.y, 0.4);
  camera.lookAt(controls.target);
}
constrainGardenCamera();

scene.add(new THREE.HemisphereLight('#ffd1a4', '#1a2a3a', 1.28));
scene.add(new THREE.AmbientLight('#fff0dd', 0.22));
const sun = new THREE.DirectionalLight('#ffaa66', 3.2);
sun.position.set(-10, 13, -7);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -18;
sun.shadow.camera.right = 18;
sun.shadow.camera.top = 18;
sun.shadow.camera.bottom = -18;
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 60;
sun.shadow.bias = -0.00028;
sun.shadow.normalBias = 0.025;
sun.target.position.set(0, 1, 0);
scene.add(sun, sun.target);

const waterMaterial = createWaterMaterial();
const garden = createZenGarden(scene, waterMaterial, (error) => {
  console.error('Unable to load Sakura tree model from ./sakura.glb:', error);
  loading.textContent = 'Sakura model unavailable — check ./sakura.glb';
});

const settings = {
  timeOfDay: 0.43,
  sunIntensity: 3.2,
  windSpeed: 1.15,
  petalDensity: 620
};

function updateSun() {
  const progress = settings.timeOfDay;
  const angle = THREE.MathUtils.lerp(0.18, 1.32, progress);
  const azimuth = THREE.MathUtils.lerp(-1.22, 0.82, progress);
  sun.position.set(Math.sin(azimuth) * 20, 7 + Math.sin(angle) * 11, Math.cos(azimuth) * 20);
  sun.intensity = settings.sunIntensity;
  const warm = new THREE.Color('#ff9d67');
  const pale = new THREE.Color('#fff1cf');
  sun.color.copy(warm).lerp(pale, progress);
}
updateSun();

const gui = new GUI({ title: 'Garden atmosphere' });
gui.add(settings, 'timeOfDay', 0, 1, 0.01).name('Time of day').onChange(updateSun);
gui.add(settings, 'sunIntensity', 0.2, 5, 0.05).name('Sun intensity').onChange(updateSun);
gui.add(settings, 'windSpeed', 0, 3, 0.05).name('Wind speed');
gui.add(settings, 'petalDensity', 0, garden.maxPetals, 1).name('Petal density');
gui.add({ clearPetals: () => garden.clearPetals() }, 'clearPetals').name('Clear Petals');

const timer = new THREE.Timer();
timer.connect(document);
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let pointerStart = null;
let elapsedTime = 0;

renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY, button: event.button };
});

renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerStart || pointerStart.button !== 0 || event.button !== 0) return;
  const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  pointerStart = null;
  if (moved > 5) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects(scene.children, true);
  const hit = intersections.find((intersection) => intersection.object === garden.water);
  if (!hit) return;
  const waterPoint = garden.water.worldToLocal(hit.point.clone());
  const x = garden.water.position.x + waterPoint.x;
  const z = garden.water.position.z - waterPoint.y;
  garden.setRipple(x, z, elapsedTime, 1);
  garden.disperseFloatingPetals(x, z);
});
renderer.domElement.addEventListener('pointercancel', () => { pointerStart = null; });

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onResize);

function animate() {
  requestAnimationFrame(animate);
  timer.update();
  const delta = Math.min(timer.getDelta(), 0.05);
  const elapsed = timer.getElapsed();
  elapsedTime = elapsed;
  controls.update();
  constrainGardenCamera();
  garden.update(elapsed, delta, settings.windSpeed, settings.petalDensity);
  renderer.render(scene, camera);
}

animate();
garden.treeReady.then((loaded) => {
  if (!loaded) return;
  loading.classList.add('is-hidden');
  window.setTimeout(() => loading.remove(), 750);
});
