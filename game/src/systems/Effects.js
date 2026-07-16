import * as THREE from 'three';
import { BLOCK_COLORS, BLOCK_NAMES, BLOCKS } from '../core/constants.js';
import { sound } from '../audio/SoundManager.js';
import { createMultiTool } from '../models/ShipModel.js';

/**
 * Visual FX: block outline, mining beam, break particles, floating loot text
 */
export class Effects {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.particles = [];
    this.floatTexts = [];

    // Block highlight wireframe
    const geo = new THREE.BoxGeometry(1.02, 1.02, 1.02);
    const edges = new THREE.EdgesGeometry(geo);
    this.highlight = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.95,
        depthTest: false,
      })
    );
    this.highlight.renderOrder = 999;
    this.highlight.visible = false;
    scene.add(this.highlight);

    // Mining beam
    const beamGeo = new THREE.CylinderGeometry(0.03, 0.06, 1, 6);
    beamGeo.rotateX(Math.PI / 2);
    this.beam = new THREE.Mesh(
      beamGeo,
      new THREE.MeshBasicMaterial({
        color: 0x3ecfb4,
        transparent: true,
        opacity: 0.85,
      })
    );
    this.beam.visible = false;
    scene.add(this.beam);

    this.beamLight = new THREE.PointLight(0x3ecfb4, 0, 8);
    scene.add(this.beamLight);

    // Multi-tool held model
    this.tool = createMultiTool();
    this.tool.visible = false;
    camera.add(this.tool);
    this.tool.position.set(0.32, -0.24, -0.48);
    this.tool.rotation.set(0.12, -0.2, 0.08);
    this.toolBob = 0;
  }

  setHighlight(block) {
    if (!block) {
      this.highlight.visible = false;
      return;
    }
    this.highlight.visible = true;
    this.highlight.position.set(block.x + 0.5, block.y + 0.5, block.z + 0.5);
    const c = BLOCK_COLORS[block.id];
    if (c) this.highlight.material.color.setHex(c).offsetHSL(0, 0, 0.35);
  }

  setMiningBeam(active, from, to) {
    this.beam.visible = active;
    if (!active) {
      this.beamLight.intensity = 0;
      return;
    }
    const dir = to.clone().sub(from);
    const dist = dir.length();
    if (dist < 0.01) return;
    this.beam.position.copy(from).lerp(to, 0.5);
    this.beam.scale.set(1.2, 1.2, Math.max(0.15, dist));
    this.beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
    this.beamLight.position.copy(to);
    this.beamLight.intensity = 1.6 + Math.sin(performance.now() * 0.025) * 0.5;
    const t = (Math.sin(performance.now() * 0.02) + 1) * 0.5;
    this.beam.material.color.setRGB(0.1 + t * 0.3, 0.95, 0.5 + t * 0.3);
    this.tool.position.z = -0.48 + Math.sin(performance.now() * 0.04) * 0.015;
    this.tool.rotation.x = 0.12 + Math.sin(performance.now() * 0.05) * 0.04;
  }

  setToolVisible(v) {
    this.tool.visible = v;
  }

  spawnBreak(x, y, z, blockId) {
    const color = BLOCK_COLORS[blockId] || 0xffffff;
    for (let i = 0; i < 10; i++) {
      const size = 0.08 + Math.random() * 0.12;
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(size, size, size),
        new THREE.MeshBasicMaterial({ color })
      );
      mesh.position.set(x + 0.5, y + 0.5, z + 0.5);
      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4,
        2 + Math.random() * 3,
        (Math.random() - 0.5) * 4
      );
      this.scene.add(mesh);
      this.particles.push({ mesh, vel, life: 0.6 + Math.random() * 0.4 });
    }
  }

  spawnLootText(worldPos, text, color = '#3ecfb4') {
    const el = document.createElement('div');
    el.className = 'loot-float';
    el.textContent = text;
    el.style.color = color;
    document.getElementById('game-ui').appendChild(el);
    this.floatTexts.push({ el, pos: worldPos.clone(), life: 1.4, vy: 0.8 });
  }

  update(dt, camera) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      p.vel.y -= 12 * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      p.mesh.rotation.x += dt * 4;
      p.mesh.rotation.y += dt * 3;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        this.particles.splice(i, 1);
      }
    }

    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const f = this.floatTexts[i];
      f.life -= dt;
      f.pos.y += f.vy * dt;
      const ndc = f.pos.clone().project(camera);
      if (ndc.z > 1 || f.life <= 0) {
        f.el.remove();
        this.floatTexts.splice(i, 1);
        continue;
      }
      const x = (ndc.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-ndc.y * 0.5 + 0.5) * window.innerHeight;
      f.el.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px)`;
      f.el.style.opacity = String(Math.min(1, f.life));
    }

    if (this.tool.visible && !this.beam.visible) {
      this.toolBob += dt;
      this.tool.position.y = -0.24 + Math.sin(this.toolBob * 2) * 0.008;
      this.tool.rotation.z = 0.08 + Math.sin(this.toolBob * 1.5) * 0.02;
    }
  }
}

/**
 * Storm weather — NMS-style hazard storm during hermetic trek
 */
export class StormSystem {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.timer = 0;
    this.cooldown = 0;
    this.particles = null;
    this.overlay = null;
  }

  ensureOverlay() {
    if (this.overlay) return;
    this.overlay = document.createElement('div');
    this.overlay.id = 'storm-overlay';
    this.overlay.className = 'hidden';
    this.overlay.innerHTML = '<div class="storm-warn">⚠ 行星风暴 · 寻找掩体</div>';
    document.getElementById('game-ui').appendChild(this.overlay);
  }

  tryTrigger() {
    // Trigger when heading to building after beacon read
    if (this.active || this.cooldown > 0) return;
    if (!this.game.flags.beaconRead || this.game.flags.hermeticTaken) return;
    if (this.game.mode !== 'planet') return;
    this.start();
  }

  start() {
    this.ensureOverlay();
    this.active = true;
    this.timer = 45;
    this.overlay.classList.remove('hidden');
    this.game.log('风暴来临！防护急速下降 — 躲进洞穴或建筑。');
    this._spawnRain();
    sound.stormAmbience();
    this._stormSoundTimer = 0;
  }

  _spawnRain() {
    const geo = new THREE.BufferGeometry();
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 60;
      pos[i * 3 + 1] = Math.random() * 40;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 60;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.particles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: 0xa0c0d0,
        size: 0.15,
        transparent: true,
        opacity: 0.55,
      })
    );
    this.game.scene.add(this.particles);
  }

  update(dt) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (!this.active) {
      // Auto-trigger once player is halfway to building
      if (
        this.game.flags.beaconRead &&
        !this.game.flags.hermeticTaken &&
        this.game.mode === 'planet' &&
        this.cooldown <= 0
      ) {
        const d = this.game.player.position.distanceTo(this.game.building.position);
        if (d < 55 && d > 12) this.tryTrigger();
      }
      return;
    }

    this.timer -= dt;
    this._stormSoundTimer = (this._stormSoundTimer || 0) + dt;
    if (this._stormSoundTimer > 2.5) {
      this._stormSoundTimer = 0;
      sound.stormAmbience();
    }
    // Extra hazard drain
    const sheltered = this._isSheltered();
    if (!sheltered) {
      this.game.player.hazard = Math.max(0, this.game.player.hazard - 8 * dt);
    }

    if (this.particles) {
      const arr = this.particles.geometry.attributes.position.array;
      const origin = this.game.player.position;
      this.particles.position.set(origin.x, origin.y, origin.z);
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= 25 * dt;
        arr[i] += 8 * dt;
        if (arr[i + 1] < 0) {
          arr[i + 1] = 35;
          arr[i] = (Math.random() - 0.5) * 60;
          arr[i + 2] = (Math.random() - 0.5) * 60;
        }
      }
      this.particles.geometry.attributes.position.needsUpdate = true;
    }

    if (this.timer <= 0 || this.game.flags.hermeticTaken) {
      this.end();
    }
  }

  _isSheltered() {
    const p = this.game.player.position;
    // Near building or underground-ish (block above head)
    if (this.game.building && p.distanceTo(this.game.building.position) < 4) return true;
    const above = this.game.world.getBlock(Math.floor(p.x), Math.floor(p.y + 2.2), Math.floor(p.z));
    return above !== BLOCKS.AIR && above !== BLOCKS.WATER && above !== BLOCKS.LEAVES;
  }

  end() {
    this.active = false;
    this.cooldown = 90;
    if (this.overlay) this.overlay.classList.add('hidden');
    if (this.particles) {
      this.game.scene.remove(this.particles);
      this.particles.geometry.dispose();
      this.particles.material.dispose();
      this.particles = null;
    }
    this.game.log('风暴消散。');
  }
}

/**
 * Analysis Visor — hold V to tag resources (NMS style)
 */
export class AnalysisVisor {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.tags = [];
    this.overlay = null;
  }

  ensureUI() {
    if (this.overlay) return;
    this.overlay = document.createElement('div');
    this.overlay.id = 'visor-overlay';
    this.overlay.className = 'hidden';
    this.overlay.innerHTML = `
      <div class="visor-frame"></div>
      <div class="visor-label">分析面罩 · ANALYSIS VISOR</div>
      <div id="visor-tags"></div>
    `;
    document.getElementById('game-ui').appendChild(this.overlay);
  }

  setActive(on) {
    if (!this.game.flags.scannerRepaired && on) {
      this.game.log('扫描器尚未修复，无法启用分析面罩。');
      return;
    }
    this.ensureUI();
    this.active = on;
    this.overlay.classList.toggle('hidden', !on);
    if (on) {
      this.game.ui.showScan();
    }
  }

  update(dt) {
    if (!this.active || this.game.mode !== 'planet') {
      if (this.overlay && !this.overlay.classList.contains('hidden') && !this.active) {
        /* noop */
      }
      return;
    }
    const tagsEl = document.getElementById('visor-tags');
    if (!tagsEl) return;
    tagsEl.innerHTML = '';

    const origin = this.game.player.position;
    const findings = [];
    // Sample nearby surface for resources
    for (let dx = -12; dx <= 12; dx += 2) {
      for (let dz = -12; dz <= 12; dz += 2) {
        const x = Math.floor(origin.x) + dx;
        const z = Math.floor(origin.z) + dz;
        const y = this.game.world.surfaceY(x, z);
        const id = this.game.world.getBlock(x, y, z);
        if (
          id === BLOCKS.FERRITE_ROCK ||
          id === BLOCKS.SODIUM_PLANT ||
          id === BLOCKS.CARBON_PLANT ||
          id === BLOCKS.DIHYDROGEN ||
          id === BLOCKS.CRYSTAL ||
          id === BLOCKS.COPPER_ORE
        ) {
          findings.push({ x, y, z, id });
        }
      }
    }

    // Also tag ship / building
    if (this.game.shipMarker?.visible) {
      findings.push({
        x: this.game.ship.position.x,
        y: this.game.ship.position.y + 3,
        z: this.game.ship.position.z,
        id: 'ship',
        label: '坠毁星舰',
        color: '#e8a832',
      });
    }
    if (this.game.buildingMarker?.visible) {
      findings.push({
        x: this.game.building.position.x,
        y: this.game.building.position.y + 4,
        z: this.game.building.position.z,
        id: 'building',
        label: '废弃建筑',
        color: '#3ecfb4',
      });
    }

    const cam = this.game.camera;
    for (const f of findings.slice(0, 24)) {
      const world = new THREE.Vector3(f.x + 0.5, f.y + 1.2, f.z + 0.5);
      const ndc = world.clone().project(cam);
      if (ndc.z > 1 || Math.abs(ndc.x) > 1.1 || Math.abs(ndc.y) > 1.1) continue;
      const sx = (ndc.x * 0.5 + 0.5) * 100;
      const sy = (-ndc.y * 0.5 + 0.5) * 100;
      const label = f.label || BLOCK_NAMES[f.id] || '资源';
      const color = f.color || '#3ecfb4';
      const dist = origin.distanceTo(world).toFixed(0);
      const tag = document.createElement('div');
      tag.className = 'visor-tag';
      tag.style.left = `${sx}%`;
      tag.style.top = `${sy}%`;
      tag.style.borderColor = color;
      tag.innerHTML = `<span class="vt-name" style="color:${color}">${label}</span><span class="vt-dist">${dist}u</span>`;
      tagsEl.appendChild(tag);
    }
  }
}
