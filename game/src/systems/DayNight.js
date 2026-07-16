import * as THREE from 'three';

/**
 * Day / night cycle — sun path, sky/fog tint, ambient shift
 */
export class DayNightCycle {
  constructor(game) {
    this.game = game;
    this.time = 0.28; // 0-1, start morning
    this.speed = 0.008; // full day ~2 min
    this.sun = null;
    this.moon = null;
    this.sunMesh = null;
    this.moonMesh = null;
  }

  ensureLights() {
    if (this.sun) return;
    this.sun = new THREE.DirectionalLight(0xfff2d0, 1.1);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.near = 1;
    this.sun.shadow.camera.far = 220;
    this.sun.shadow.camera.left = -70;
    this.sun.shadow.camera.right = 70;
    this.sun.shadow.camera.top = 70;
    this.sun.shadow.camera.bottom = -70;
    this.sun.userData.planetLight = true;
    this.sun.userData.dayNight = true;
    this.game.scene.add(this.sun);

    this.moon = new THREE.DirectionalLight(0x8090c0, 0.15);
    this.moon.userData.planetLight = true;
    this.moon.userData.dayNight = true;
    this.game.scene.add(this.moon);

    this.sunMesh = new THREE.Mesh(
      new THREE.BoxGeometry(4, 4, 4),
      new THREE.MeshBasicMaterial({ color: 0xffe8a0 })
    );
    this.sunMesh.userData.planetLight = true;
    this.sunMesh.userData.dayNight = true;
    this.game.scene.add(this.sunMesh);

    this.moonMesh = new THREE.Mesh(
      new THREE.BoxGeometry(2.5, 2.5, 2.5),
      new THREE.MeshBasicMaterial({ color: 0xc0d0e8 })
    );
    this.moonMesh.userData.planetLight = true;
    this.moonMesh.userData.dayNight = true;
    this.game.scene.add(this.moonMesh);
  }

  clearRefs() {
    this.sun = null;
    this.moon = null;
    this.sunMesh = null;
    this.moonMesh = null;
  }

  update(dt) {
    if (this.game.mode !== 'planet' && this.game.mode !== 'ship_planet') {
      if (this.sunMesh) this.sunMesh.visible = false;
      if (this.moonMesh) this.moonMesh.visible = false;
      return;
    }
    this.ensureLights();
    this.sunMesh.visible = true;
    this.moonMesh.visible = true;

    this.time = (this.time + dt * this.speed) % 1;
    const angle = this.time * Math.PI * 2 - Math.PI * 0.5;

    const sunX = Math.cos(angle) * 80;
    const sunY = Math.sin(angle) * 70;
    const sunZ = 40;
    this.sun.position.set(sunX, Math.max(5, sunY), sunZ);
    this.sunMesh.position.copy(this.sun.position);
    this.sunMesh.rotation.x += dt * 0.2;
    this.sunMesh.rotation.y += dt * 0.15;

    this.moon.position.set(-sunX * 0.7, Math.max(5, -sunY * 0.7), -sunZ);
    this.moonMesh.position.copy(this.moon.position);

    const dayFactor = Math.max(0, Math.sin(angle));
    this.sun.intensity = 0.15 + dayFactor * 1.0;
    this.moon.intensity = 0.35 * (1 - dayFactor);

    const daySky = new THREE.Color(this.game._baseSky || 0x6ab0d0);
    const duskSky = new THREE.Color(0xc07040);
    const nightSky = new THREE.Color(0x060e1c);
    let sky;
    if (dayFactor > 0.15) {
      sky = daySky.clone().lerp(duskSky, Math.max(0, 1 - dayFactor * 1.5) * 0.4);
    } else {
      sky = nightSky.clone().lerp(duskSky, dayFactor / 0.15);
    }
    this.game.renderer.setClearColor(sky);
    if (this.game.scene.fog) {
      this.game.scene.fog.color.copy(sky);
      this.game.scene.fog.near = 35 + (1 - dayFactor) * 20;
      this.game.scene.fog.far = 120 + dayFactor * 40;
    }

    for (const c of this.game.scene.children) {
      if (c.isHemisphereLight && c.userData.planetLight) {
        c.intensity = 0.2 + dayFactor * 0.4;
      }
      if (c.isAmbientLight && c.userData.planetLight) {
        c.intensity = 0.12 + dayFactor * 0.25;
      }
    }

    // Cloud tint with time of day
    if (this.game._clouds) {
      this.game._clouds.traverse((o) => {
        if (o.isMesh && o.material?.color) {
          const night = 1 - dayFactor;
          o.material.color.setRGB(0.91 - night * 0.4, 0.94 - night * 0.45, 0.97 - night * 0.35);
          o.material.opacity = 0.35 + dayFactor * 0.25;
        }
      });
      this.game._clouds.rotation.y += dt * 0.01;
    }

    this.sunMesh.visible = dayFactor > -0.05;
    this.moonMesh.visible = dayFactor < 0.45;
  }

  get label() {
    const t = this.time;
    if (t < 0.2 || t > 0.85) return '深夜';
    if (t < 0.3) return '黎明';
    if (t < 0.55) return '日间';
    if (t < 0.7) return '黄昏';
    return '夜晚';
  }

  get clockStr() {
    const hours = Math.floor(this.time * 24);
    const mins = Math.floor((this.time * 24 * 60) % 60);
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
}
