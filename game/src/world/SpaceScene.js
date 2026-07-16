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
    this._twinkle = 0;
  }

  build() {
    // Starfield — blocky points
    const starGeo = new THREE.BufferGeometry();
    const count = 4500;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 400 + Math.random() * 1200;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
      const c = new THREE.Color().setHSL(0.08 + Math.random() * 0.55, 0.25 + Math.random() * 0.3, 0.65 + Math.random() * 0.35);
      colors[i * 3] = c.r;
      colors[i * 3 + 1] = c.g;
      colors[i * 3 + 2] = c.b;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    this.starfield = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ size: 2.2, vertexColors: true, sizeAttenuation: true })
    );
    this.group.add(this.starfield);

    // Nebula dust clouds (blocky translucent cubes)
    this.nebula = new THREE.Group();
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: new THREE.Color().setHSL(0.05 + Math.random() * 0.15, 0.55, 0.35),
        transparent: true,
        opacity: 0.04 + Math.random() * 0.06,
        depthWrite: false,
      });
      const cloud = new THREE.Mesh(
        new THREE.BoxGeometry(40 + Math.random() * 80, 20 + Math.random() * 40, 40 + Math.random() * 80),
        mat
      );
      const a = Math.random() * Math.PI * 2;
      const d = 180 + Math.random() * 400;
      cloud.position.set(Math.cos(a) * d, (Math.random() - 0.5) * 120, Math.sin(a) * d);
      cloud.rotation.set(Math.random(), Math.random(), Math.random());
      this.nebula.add(cloud);
    }
    this.group.add(this.nebula);

    // Sun
    this.sun = new THREE.Mesh(
      new THREE.IcosahedronGeometry(30, 1),
      new THREE.MeshBasicMaterial({ color: 0xffe0a0 })
    );
    this.sun.position.set(-200, 80, -300);
    this.group.add(this.sun);
    const sunGlow = new THREE.Mesh(
      new THREE.BoxGeometry(50, 50, 50),
      new THREE.MeshBasicMaterial({ color: 0xffc070, transparent: true, opacity: 0.15, depthWrite: false })
    );
    sunGlow.position.copy(this.sun.position);
    this.group.add(sunGlow);
    this._sunGlow = sunGlow;
    const sunLight = new THREE.PointLight(0xfff0d0, 2.2, 2200);
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
    for (let i = 0; i < 55; i++) {
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
      rock.userData.spin = (Math.random() - 0.5) * 0.8;
      this.group.add(rock);
      if (!this._asteroids) this._asteroids = [];
      this._asteroids.push(rock);
    }

    // Engine trail particles (activated while boosting in space)
    const trailGeo = new THREE.BufferGeometry();
    const tn = 80;
    const tpos = new Float32Array(tn * 3);
    trailGeo.setAttribute('position', new THREE.BufferAttribute(tpos, 3));
    this.trail = new THREE.Points(
      trailGeo,
      new THREE.PointsMaterial({
        color: 0x3ecfb4,
        size: 1.2,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    this.trail.visible = false;
    this.group.add(this.trail);
    this._trailIdx = 0;
  }

  setActive(active) {
    this.group.visible = active;
  }

  update(dt, shipPos = null, boosting = false) {
    this._twinkle += dt;
    for (const p of this.planets) {
      p.mesh.rotation.y += dt * 0.05;
    }
    if (this.nebula) this.nebula.rotation.y += dt * 0.008;
    if (this._sunGlow) {
      const s = 1 + Math.sin(this._twinkle * 1.5) * 0.06;
      this._sunGlow.scale.setScalar(s);
    }
    if (this.starfield?.material) {
      this.starfield.material.size = 2 + Math.sin(this._twinkle * 2.2) * 0.35;
    }
    if (this._asteroids) {
      for (const a of this._asteroids) {
        a.rotation.x += a.userData.spin * dt;
        a.rotation.y += a.userData.spin * 0.7 * dt;
      }
    }

    // Trail behind ship
    if (this.trail && shipPos) {
      this.trail.visible = boosting;
      if (boosting) {
        const arr = this.trail.geometry.attributes.position.array;
        const i = this._trailIdx % 80;
        arr[i * 3] = shipPos.x + (Math.random() - 0.5) * 2;
        arr[i * 3 + 1] = shipPos.y + (Math.random() - 0.5) * 2;
        arr[i * 3 + 2] = shipPos.z + (Math.random() - 0.5) * 2;
        this._trailIdx++;
        this.trail.geometry.attributes.position.needsUpdate = true;
      }
    }
  }

  /** Nearest planet surface distance */
  nearestInfo(pos) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.planets) {
      const d = pos.distanceTo(p.mesh.position) - p.def.radius;
      if (d < bestD) {
        bestD = d;
        best = { def: p.def, dist: d, mesh: p.mesh };
      }
    }
    return best;
  }

  /** Nearest planet within approach distance */
  findApproach(pos, maxDist = 100) {
    let best = null;
    let bestD = maxDist;
    for (const p of this.planets) {
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
