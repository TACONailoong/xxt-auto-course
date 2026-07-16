import * as THREE from 'three';
import { Game } from './core/Game.js';
import { sound } from './audio/SoundManager.js';
import { createStarship, createPlanetMesh, animateStarship } from './models/ShipModel.js';

/**
 * Title screen voxel starfield animation
 */
function initTitleCanvas() {
  const canvas = document.getElementById('title-canvas');
  if (!canvas) return null;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 500);
  camera.position.set(0, 2, 28);

  const hemi = new THREE.HemisphereLight(0xb0d8f0, 0x1a3040, 0.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d0, 0.9);
  sun.position.set(10, 20, 8);
  scene.add(sun);

  // Floating voxel cubes
  const cubes = [];
  for (let i = 0; i < 60; i++) {
    const size = 0.25 + Math.random() * 1.0;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size, size, size),
      new THREE.MeshLambertMaterial({
        color: new THREE.Color().setHSL(0.45 + Math.random() * 0.1, 0.55, 0.4 + Math.random() * 0.25),
        flatShading: true,
        transparent: true,
        opacity: 0.4 + Math.random() * 0.35,
      })
    );
    mesh.position.set(
      (Math.random() - 0.5) * 70,
      (Math.random() - 0.5) * 36,
      (Math.random() - 0.5) * 40 - 15
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);
    mesh.userData.spin = (Math.random() - 0.5) * 0.5;
    mesh.userData.drift = 0.5 + Math.random();
    scene.add(mesh);
    cubes.push(mesh);
  }

  // Detailed planet
  const planet = createPlanetMesh({
    id: 'title',
    name: 'Title',
    seed: 1,
    biome: 'lush',
    color: 0x2a6a4a,
    atmosphere: 0x4a90b0,
    radius: 7,
  });
  planet.position.set(16, -3, -22);
  planet.scale.setScalar(1);
  scene.add(planet);

  // Full starship model on title
  const shipCore = createStarship({ scale: 1.1, damaged: false });
  shipCore.position.set(-9, 1.5, 2);
  shipCore.rotation.y = 0.6;
  shipCore.rotation.x = -0.15;
  shipCore.userData.forceExhaust = true;
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
    planet.rotation.y += dt * 0.08;
    shipCore.position.x = -9 + Math.sin(performance.now() * 0.00035) * 1.5;
    shipCore.position.y = 1.5 + Math.cos(performance.now() * 0.00045) * 0.8;
    shipCore.rotation.z = Math.sin(performance.now() * 0.0005) * 0.12;
    animateStarship(shipCore, dt, 40);
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
