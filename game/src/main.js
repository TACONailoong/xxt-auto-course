import * as THREE from 'three';
import { Game } from './core/Game.js';
import { sound } from './audio/SoundManager.js';

/**
 * Title screen voxel starfield animation
 */
function initTitleCanvas() {
  const canvas = document.getElementById('title-canvas');
  if (!canvas) return null;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.z = 30;

  // Floating voxel cubes
  const cubes = [];
  for (let i = 0; i < 80; i++) {
    const size = 0.3 + Math.random() * 1.2;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.45 + Math.random() * 0.1, 0.6, 0.4 + Math.random() * 0.3),
        transparent: true,
        opacity: 0.35 + Math.random() * 0.4,
      })
    );
    mesh.position.set(
      (Math.random() - 0.5) * 60,
      (Math.random() - 0.5) * 40,
      (Math.random() - 0.5) * 40 - 10
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    mesh.userData.spin = (Math.random() - 0.5) * 0.5;
    mesh.userData.drift = 0.5 + Math.random();
    scene.add(mesh);
    cubes.push(mesh);
  }

  // Distant planet silhouette
  const planet = new THREE.Mesh(
    new THREE.IcosahedronGeometry(8, 1),
    new THREE.MeshBasicMaterial({ color: 0x1a4050 })
  );
  planet.position.set(14, -4, -20);
  scene.add(planet);

  const shipCore = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.6, 3.5),
    new THREE.MeshBasicMaterial({ color: 0x3ecfb4 })
  );
  shipCore.add(hull);
  const wing = new THREE.Mesh(
    new THREE.BoxGeometry(4, 0.15, 1.2),
    new THREE.MeshBasicMaterial({ color: 0xe8a832 })
  );
  wing.position.y = -0.1;
  shipCore.add(wing);
  shipCore.position.set(-8, 2, 0);
  scene.add(shipCore);

  let running = true;
  const clock = new THREE.Clock();

  function frame() {
    if (!running) return;
    requestAnimationFrame(frame);
    const dt = clock.getDelta();
    for (const c of cubes) {
      c.rotation.x += c.userData.spin * dt;
      c.rotation.y += c.userData.spin * 0.7 * dt;
      c.position.y += Math.sin(performance.now() * 0.001 * c.userData.drift) * 0.005;
    }
    planet.rotation.y += dt * 0.1;
    shipCore.position.x = -8 + Math.sin(performance.now() * 0.0004) * 2;
    shipCore.position.y = 2 + Math.cos(performance.now() * 0.0005) * 1.2;
    shipCore.rotation.z = Math.sin(performance.now() * 0.0006) * 0.15;
    renderer.render(scene, camera);
  }
  frame();

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return () => {
    running = false;
    renderer.dispose();
  };
}

const stopTitle = initTitleCanvas();

const nameInput = document.getElementById('player-name');
const saved = localStorage.getItem('voxbound_name');
if (saved) nameInput.value = saved;

document.getElementById('btn-play').addEventListener('click', async () => {
  const name = (nameInput.value || 'TRAVELLER').trim().slice(0, 16);
  localStorage.setItem('voxbound_name', name);
  await sound.resume();
  sound.uiClick();
  if (stopTitle) stopTitle();
  document.getElementById('title-screen').classList.remove('active');
  const game = new Game();
  await game.start(name);
});
