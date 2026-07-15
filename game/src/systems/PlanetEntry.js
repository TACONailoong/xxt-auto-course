import * as THREE from 'three';
import { sound } from '../audio/SoundManager.js';

/**
 * Planet atmospheric entry cinematic — NMS heat + Minecraft block dissolve
 */
export class PlanetEntry {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.timer = 0;
    this.duration = 4.2;
    this.targetPlanet = null;
    this.particles = null;
    this.heatLight = null;
  }

  start(planetInfo) {
    this.active = true;
    this.timer = 0;
    this.targetPlanet = planetInfo;
    this.game.mode = 'entering';
    this.game.ship.beginEntry();
    this.game.ui.showEntry(
      planetInfo.def.name,
      `LAT ${((Math.random() - 0.5) * 180).toFixed(2)}  ·  LON ${((Math.random() - 0.5) * 360).toFixed(2)}`
    );

    // Heat light on ship
    this.heatLight = new THREE.PointLight(0xff6020, 3, 40);
    this.game.ship.mesh.add(this.heatLight);

    // Block particles streaming past
    const geo = new THREE.BufferGeometry();
    const n = 200;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 40;
      pos[i * 3 + 1] = (Math.random() - 0.5) * 30;
      pos[i * 3 + 2] = -Math.random() * 60;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xe8a832,
        size: 1.2,
        transparent: true,
        opacity: 0.85,
      })
    );
    this.game.ship.mesh.add(this.particles);

    // Voxel debris cubes
    this.debris = [];
    for (let i = 0; i < 24; i++) {
      const cube = new THREE.Mesh(
        new THREE.BoxGeometry(0.4 + Math.random() * 0.8, 0.4 + Math.random() * 0.8, 0.4 + Math.random() * 0.8),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color().setHSL(0.08 + Math.random() * 0.06, 0.9, 0.5 + Math.random() * 0.2),
        })
      );
      cube.position.set((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 12, -5 - Math.random() * 40);
      this.game.ship.mesh.add(cube);
      this.debris.push(cube);
    }

    sound.atmosphereEntry();
  }

  update(dt) {
    if (!this.active) return;
    this.timer += dt;
    const t = this.timer / this.duration;

    // Shake camera
    const shake = (1 - t) * 0.15;
    this.game.camera.position.x += (Math.random() - 0.5) * shake;
    this.game.camera.position.y += (Math.random() - 0.5) * shake;

    // Dive toward planet
    this.game.ship.speed = 180 - t * 80;
    this.game.ship.pitch = 0.5 - t * 0.3;
    this.game.player.pitch = this.game.ship.pitch;
    this.game.player.yaw = this.game.ship.yaw;

    if (this.heatLight) {
      this.heatLight.intensity = 2 + Math.sin(this.timer * 20) * 1.5;
    }

    // Stream particles
    if (this.particles) {
      const arr = this.particles.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 2] += 80 * dt;
        if (arr[i + 2] > 10) {
          arr[i] = (Math.random() - 0.5) * 40;
          arr[i + 1] = (Math.random() - 0.5) * 30;
          arr[i + 2] = -60;
        }
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    for (const d of this.debris || []) {
      d.position.z += 50 * dt;
      d.rotation.x += dt * 4;
      d.rotation.y += dt * 3;
      if (d.position.z > 15) {
        d.position.z = -40;
        d.position.x = (Math.random() - 0.5) * 20;
      }
    }

    // Screen flash intensity via overlay CSS already animating

    if (this.timer >= this.duration) {
      this.finish();
    }
  }

  finish() {
    this.active = false;
    this.game.ui.hideEntry();

    // Cleanup fx
    if (this.heatLight) {
      this.game.ship.mesh.remove(this.heatLight);
      this.heatLight = null;
    }
    if (this.particles) {
      this.game.ship.mesh.remove(this.particles);
      this.particles.geometry.dispose();
      this.particles.material.dispose();
      this.particles = null;
    }
    for (const d of this.debris || []) {
      this.game.ship.mesh.remove(d);
      d.geometry.dispose();
      d.material.dispose();
    }
    this.debris = [];

    const planet = this.targetPlanet.def;
    this.game.landOnPlanet(planet, true);
  }
}
