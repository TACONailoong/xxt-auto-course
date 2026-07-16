import * as THREE from 'three';
import { sound } from '../audio/SoundManager.js';

function addBox(group, w, h, d, color, x, y, z, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
  });
  if (opts.emissive != null) {
    mat.emissive = new THREE.Color(opts.emissive);
    mat.emissiveIntensity = opts.emissiveIntensity ?? 0.5;
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set(x, y, z);
  if (opts.ry) mesh.rotation.y = opts.ry;
  mesh.castShadow = true;
  group.add(mesh);
  return mesh;
}

const FAUNA_TYPES = [
  {
    id: 'block_hopper',
    name: '方块跃兔',
    diet: '食草',
    temper: '温顺',
    units: 500,
    build(color) {
      const g = new THREE.Group();
      addBox(g, 0.55, 0.4, 0.7, color, 0, 0.45, 0);
      addBox(g, 0.4, 0.35, 0.4, color, 0, 0.7, 0.35);
      addBox(g, 0.12, 0.12, 0.08, 0x111111, 0.1, 0.75, 0.52);
      addBox(g, 0.12, 0.12, 0.08, 0x111111, -0.1, 0.75, 0.52);
      addBox(g, 0.12, 0.35, 0.12, color, 0.18, 0.2, -0.2);
      addBox(g, 0.12, 0.35, 0.12, color, -0.18, 0.2, -0.2);
      addBox(g, 0.1, 0.45, 0.1, color, 0.15, 0.25, 0.25);
      addBox(g, 0.1, 0.45, 0.1, color, -0.15, 0.25, 0.25);
      addBox(g, 0.08, 0.08, 0.35, color, 0, 0.5, -0.45);
      return g;
    },
  },
  {
    id: 'tri_walker',
    name: '三角行者',
    diet: '杂食',
    temper: '警惕',
    units: 800,
    build(color) {
      const g = new THREE.Group();
      addBox(g, 0.7, 0.5, 1.0, color, 0, 0.7, 0);
      addBox(g, 0.45, 0.4, 0.45, color, 0, 1.0, 0.4);
      addBox(g, 0.15, 0.15, 0.1, 0xe8a832, 0.12, 1.05, 0.6, {
        emissive: 0xe8a832,
        emissiveIntensity: 0.4,
      });
      addBox(g, 0.15, 0.15, 0.1, 0xe8a832, -0.12, 1.05, 0.6, {
        emissive: 0xe8a832,
        emissiveIntensity: 0.4,
      });
      for (const x of [-0.25, 0, 0.25]) {
        addBox(g, 0.12, 0.55, 0.12, color, x, 0.3, 0.15);
        addBox(g, 0.12, 0.45, 0.12, color, x, 0.25, -0.3);
      }
      return g;
    },
  },
  {
    id: 'float_cube',
    name: '浮空立方',
    diet: '光合',
    temper: '无害',
    units: 1200,
    flying: true,
    build(color) {
      const g = new THREE.Group();
      addBox(g, 0.6, 0.6, 0.6, color, 0, 0.8, 0, {
        emissive: color,
        emissiveIntensity: 0.25,
      });
      addBox(g, 0.2, 0.2, 0.2, 0xffffff, 0, 0.8, 0.35, {
        emissive: 0xffffff,
        emissiveIntensity: 0.5,
      });
      addBox(g, 0.15, 0.4, 0.08, color, 0.4, 0.8, 0);
      addBox(g, 0.15, 0.4, 0.08, color, -0.4, 0.8, 0);
      addBox(g, 0.08, 0.15, 0.4, color, 0, 1.15, 0);
      return g;
    },
  },
  {
    id: 'spine_beast',
    name: '脊刺兽',
    diet: '肉食',
    temper: '好斗',
    units: 1500,
    build(color) {
      const g = new THREE.Group();
      addBox(g, 0.8, 0.55, 1.3, color, 0, 0.6, 0);
      addBox(g, 0.5, 0.45, 0.55, color, 0, 0.75, 0.7);
      addBox(g, 0.35, 0.2, 0.4, 0x2a1515, 0, 0.55, 1.0);
      for (let i = 0; i < 4; i++) {
        addBox(g, 0.08, 0.35 + i * 0.05, 0.08, 0x1a1010, 0, 0.95 + i * 0.05, -0.3 + i * 0.25);
      }
      addBox(g, 0.14, 0.5, 0.14, color, 0.28, 0.28, 0.35);
      addBox(g, 0.14, 0.5, 0.14, color, -0.28, 0.28, 0.35);
      addBox(g, 0.14, 0.45, 0.14, color, 0.25, 0.25, -0.4);
      addBox(g, 0.14, 0.45, 0.14, color, -0.25, 0.25, -0.4);
      return g;
    },
  },
];

const FLORA_EXTRA = [
  { id: 'bulb_stalk', name: '球茎茎', element: '碳', units: 200 },
  { id: 'fan_leaf', name: '扇叶苔', element: '氧', units: 180 },
  { id: 'spike_bloom', name: '刺芒花', element: '钠', units: 250 },
];

/**
 * Fauna manager — spawn, wander, animate voxel creatures
 */
export class FaunaSystem {
  constructor(game) {
    this.game = game;
    this.creatures = [];
    this.discovered = new Set();
    this.floraDiscovered = new Set();
  }

  clear() {
    for (const c of this.creatures) this.game.scene.remove(c.mesh);
    this.creatures = [];
    for (const f of this.floraProps || []) this.game.scene.remove(f);
    this.floraProps = [];
  }

  /** Decorative alien flora props near a point */
  spawnFloraProps(cx, cz, count = 6) {
    this.floraProps = this.floraProps || [];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 4 + Math.random() * 18;
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      const y = this.game.world.surfaceY(Math.floor(x), Math.floor(z));
      const g = this._buildFloraMesh(i % 3);
      g.position.set(x + 0.5, y, z + 0.5);
      g.scale.setScalar(0.8 + Math.random() * 0.5);
      this.game.scene.add(g);
      this.floraProps.push(g);
    }
  }

  _buildFloraMesh(kind) {
    const g = new THREE.Group();
    if (kind === 0) {
      // Bulb stalk
      addBox(g, 0.15, 1.2, 0.15, 0x3a8a4a, 0, 0.6, 0);
      addBox(g, 0.45, 0.45, 0.45, 0x6bcf5a, 0, 1.35, 0, {
        emissive: 0x2a6a30,
        emissiveIntensity: 0.35,
      });
    } else if (kind === 1) {
      // Fan leaf
      addBox(g, 0.12, 0.8, 0.12, 0x2d6b3a, 0, 0.4, 0);
      addBox(g, 1.0, 0.08, 0.5, 0x4aad5a, 0, 0.9, 0, { ry: 0.3 });
      addBox(g, 0.8, 0.08, 0.4, 0x3a9a4a, 0, 1.05, 0.1, { ry: -0.4 });
    } else {
      // Spike bloom
      addBox(g, 0.2, 0.5, 0.2, 0x5a4a2a, 0, 0.25, 0);
      addBox(g, 0.35, 0.35, 0.35, 0xe8a832, 0, 0.7, 0, {
        emissive: 0xe8a832,
        emissiveIntensity: 0.4,
      });
      for (const a of [0, 1.2, 2.4]) {
        addBox(g, 0.08, 0.5, 0.08, 0xc08020, Math.cos(a) * 0.25, 0.55, Math.sin(a) * 0.25);
      }
    }
    return g;
  }

  spawnAround(cx, cz, count = 8) {
    // Clear far creatures
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      const dx = c.mesh.position.x - cx;
      const dz = c.mesh.position.z - cz;
      if (dx * dx + dz * dz > 90 * 90) {
        this.game.scene.remove(c.mesh);
        this.creatures.splice(i, 1);
      }
    }
    if (this.creatures.length >= count) return;

    const need = count - this.creatures.length;
    for (let i = 0; i < need; i++) {
      const type = FAUNA_TYPES[Math.floor(Math.random() * FAUNA_TYPES.length)];
      const hue = Math.random();
      const color = new THREE.Color().setHSL(hue, 0.45 + Math.random() * 0.3, 0.4 + Math.random() * 0.2);
      const mesh = type.build(color.getHex());
      const angle = Math.random() * Math.PI * 2;
      // First few closer so player sees them soon after waking
      const dist =
        this.creatures.length < 3 ? 6 + Math.random() * 10 : 12 + Math.random() * 35;
      const x = cx + Math.cos(angle) * dist;
      const z = cz + Math.sin(angle) * dist;
      const y = this.game.world.surfaceY(Math.floor(x), Math.floor(z));
      mesh.position.set(x, type.flying ? y + 3 + Math.random() * 4 : y, z);
      mesh.rotation.y = Math.random() * Math.PI * 2;
      this.game.scene.add(mesh);
      this.creatures.push({
        mesh,
        type,
        color: `#${color.getHexString()}`,
        vx: 0,
        vz: 0,
        timer: Math.random() * 4,
        phase: Math.random() * Math.PI * 2,
        flying: !!type.flying,
        baseY: mesh.position.y,
        callTimer: 3 + Math.random() * 8,
      });
    }
  }

  update(dt) {
    const player = this.game.mode === 'planet' ? this.game.player.position : null;
    if (!player || this.game.mode !== 'planet') {
      for (const c of this.creatures) c.mesh.visible = this.game.mode === 'planet';
      return;
    }
    this.spawnAround(player.x, player.z, 10);

    for (const c of this.creatures) {
      c.mesh.visible = true;
      c.timer -= dt;
      c.phase += dt * 3;

      if (c.timer <= 0) {
        c.timer = 2 + Math.random() * 4;
        const a = Math.random() * Math.PI * 2;
        const spd = c.flying ? 2.5 : 1.8 + Math.random();
        c.vx = Math.cos(a) * spd;
        c.vz = Math.sin(a) * spd;
        // Flee if aggressive and player close
        if (c.type.temper === '好斗') {
          const dx = player.x - c.mesh.position.x;
          const dz = player.z - c.mesh.position.z;
          if (dx * dx + dz * dz < 100) {
            // Charge toward player
            c.vx = dx * 0.25;
            c.vz = dz * 0.25;
          }
        }
      }

      c.mesh.position.x += c.vx * dt;
      c.mesh.position.z += c.vz * dt;
      if (c.flying) {
        c.mesh.position.y = c.baseY + Math.sin(c.phase * 0.7) * 1.2;
        c.mesh.rotation.y += dt * 0.8;
      } else {
        const gy = this.game.world.surfaceY(
          Math.floor(c.mesh.position.x),
          Math.floor(c.mesh.position.z)
        );
        c.mesh.position.y = THREE.MathUtils.lerp(c.mesh.position.y, gy, 0.15);
        // Bob walk
        c.mesh.position.y += Math.abs(Math.sin(c.phase * 2)) * 0.05;
        if (c.vx !== 0 || c.vz !== 0) {
          c.mesh.rotation.y = Math.atan2(c.vx, c.vz);
        }
      }

      // Occasional fauna call when near player
      c.callTimer = (c.callTimer ?? 5) - dt;
      if (c.callTimer <= 0) {
        c.callTimer = 6 + Math.random() * 10;
        const dx = c.mesh.position.x - player.x;
        const dz = c.mesh.position.z - player.z;
        if (dx * dx + dz * dz < 400) {
          sound.faunaCall();
        }
      }
    }
  }

  /** Creature under crosshair within range */
  raycastCreature(origin, dir, maxDist = 25) {
    let best = null;
    let bestT = maxDist;
    for (const c of this.creatures) {
      if (!c.mesh.visible) continue;
      const to = c.mesh.position.clone().sub(origin);
      const t = to.dot(dir);
      if (t < 0 || t > bestT) continue;
      const closest = origin.clone().addScaledVector(dir, t);
      if (closest.distanceTo(c.mesh.position) < 1.8) {
        bestT = t;
        best = c;
      }
    }
    return best;
  }

  discover(creature) {
    if (this.discovered.has(creature.type.id)) return null;
    this.discovered.add(creature.type.id);
    return {
      name: creature.type.name,
      units: creature.type.units,
      diet: creature.type.diet,
      temper: creature.type.temper,
      id: creature.type.id,
    };
  }

  discoverFlora(floraId) {
    const def = FLORA_EXTRA.find((f) => f.id === floraId) || {
      id: floraId,
      name: floraId,
      units: 150,
      element: '未知',
    };
    if (this.floraDiscovered.has(def.id)) return null;
    this.floraDiscovered.add(def.id);
    return def;
  }

  get list() {
    return FAUNA_TYPES.map((t) => ({
      ...t,
      known: this.discovered.has(t.id),
    }));
  }
}

export { FAUNA_TYPES, FLORA_EXTRA };
