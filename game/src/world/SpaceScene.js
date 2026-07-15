import * as THREE from 'three';
import { PLANETS } from '../core/constants.js';
import { createPlanetMesh } from '../models/ShipModel.js';

/**
 * Space scene with orbiting voxel-faceted planets + starfield
 */
export class SpaceScene {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'space';
    this.group.visible = false;
    scene.add(this.group);

    this.planets = [];
    this.starfield = null;
    this.sun = null;
  }

  build() {
    // Starfield — blocky points
    const starGeo = new THREE.BufferGeometry();
    const count = 4000;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 400 + Math.random() * 1200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      const c = new THREE.Color().setHSL(0.1 + Math.random() * 0.5, 0.3, 0.7 + Math.random() * 0.3);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.starfield = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 2, vertexColors: true, sizeAttenuation: true })
    );
    this.group.add(this.starfield);

    // Sun
    this.sun = new THREE.Mesh(
      new THREE.IcosahedronGeometry(30, 1),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0 })
    );
    this.sun.position.set(-200, 80, -300);
    this.group.add(this.sun);
    const sunLight = new THREE.PointLight(0xfff0d0, 2, 2000);
    sunLight.position.copy(this.sun.position);
    this.group.add(sunLight);

    // Planets
    for (const def of PLANETS) {
      const mesh = createPlanetMesh(def);
      const dist = def.orbit.distance || 0;
      if (dist === 0) {
        mesh.position.set(0, 0, 0);
      } else {
        mesh.position.set(
          Math.cos(def.orbit.angle) * dist,
          Math.sin(def.orbit.angle * 0.3) * 40,
          Math.sin(def.orbit.angle) * dist
        );
      }
      mesh.userData.planetId = def.id;
      mesh.userData.def = def;
      this.group.add(mesh);
      this.planets.push({ def, mesh });
    }

    // Asteroid belt blocks
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = 280 + Math.random() * 60;
      const rock = new THREE.Mesh(
        new THREE.BoxGeometry(
          1 + Math.random() * 3,
          1 + Math.random() * 3,
          1 + Math.random() * 3
        ),
        new THREE.MeshLambertMaterial({ color: 0x6a7078, flatShading: true })
      );
      rock.position.set(Math.cos(a) * d, (Math.random() - 0.5) * 30, Math.sin(a) * d);
      rock.rotation.set(Math.random(), Math.random(), Math.random());
      this.group.add(rock);
    }
  }

  setActive(active) {
    this.group.visible = active;
  }

  update(dt) {
    for (const p of this.planets) {
      p.mesh.rotation.y += dt * 0.05;
    }
  }

  /** Nearest planet within approach distance */
  findApproach(pos, maxDist = 100) {
    let best = null;
    let bestD = maxDist;
    for (const p of this.planets) {
      // Skip home planet if we just left? Allow all
      const d = pos.distanceTo(p.mesh.position) - p.def.radius;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  getPlanetWorldPos(id) {
    const p = this.planets.find((x) => x.def.id === id);
    return p ? p.mesh.position.clone() : new THREE.Vector3();
  }
}
