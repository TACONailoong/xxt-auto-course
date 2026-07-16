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
    sound.setAmbientMode('storm');
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
    sound.setAmbientMode('planet');
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
    this.focusTarget = null;
  }

  ensureUI() {
    if (this.overlay) return;
    this.overlay = document.createElement('div');
    this.overlay.id = 'visor-overlay';
    this.overlay.className = 'hidden';
    this.overlay.innerHTML = `
      <div class="visor-frame"></div>
      <div class="visor-label">分析面罩 · ANALYSIS VISOR</div>
      <div class="visor-hint">对准目标 · 按住 左键 分析</div>
      <div id="visor-scan-bar" class="hidden"><div id="visor-scan-fill"></div></div>
      <div id="visor-focus" class="hidden"></div>
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
    } else {
      this.game.discovery.scanProgress = 0;
      this.game.discovery.scanning = null;
      this.focusTarget = null;
    }
  }

  update(dt) {
    if (!this.active || this.game.mode !== 'planet') {
      return;
    }
    this.ensureUI();
    const tagsEl = document.getElementById('visor-tags');
    const focusEl = document.getElementById('visor-focus');
    const bar = document.getElementById('visor-scan-bar');
    const fill = document.getElementById('visor-scan-fill');
    if (!tagsEl) return;
    tagsEl.innerHTML = '';

    const origin = this.game.camera.position.clone();
    const dir = this.game.player.lookDir;
    const findings = [];

    // Fauna tags
    for (const c of this.game.fauna.creatures) {
      if (!c.mesh.visible) continue;
      const known = this.game.fauna.discovered.has(c.type.id);
      findings.push({
        x: c.mesh.position.x,
        y: c.mesh.position.y + 1.2,
        z: c.mesh.position.z,
        label: known ? c.type.name : '???',
        color: known ? '#6bcf5a' : '#e8453c',
        kind: 'fauna',
        creature: c,
      });
    }

    // Resources
    const ppos = this.game.player.position;
    for (let dx = -14; dx <= 14; dx += 3) {
      for (let dz = -14; dz <= 14; dz += 3) {
        const x = Math.floor(ppos.x) + dx;
        const z = Math.floor(ppos.z) + dz;
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
          findings.push({
            x,
            y: y + 1,
            z,
            id,
            label: BLOCK_NAMES[id] || '资源',
            color: '#3ecfb4',
            kind: id === BLOCKS.SODIUM_PLANT || id === BLOCKS.CARBON_PLANT ? 'flora' : 'mineral',
            floraId: id === BLOCKS.SODIUM_PLANT ? 'spike_bloom' : id === BLOCKS.CARBON_PLANT ? 'bulb_stalk' : null,
            mineralId: String(id),
          });
        }
      }
    }

    if (this.game.shipMarker?.visible) {
      findings.push({
        x: this.game.ship.position.x,
        y: this.game.ship.position.y + 3,
        z: this.game.ship.position.z,
        label: '坠毁星舰',
        color: '#e8a832',
        kind: 'poi',
      });
    }
    if (this.game.buildingMarker?.visible) {
      findings.push({
        x: this.game.building.position.x,
        y: this.game.building.position.y + 4,
        z: this.game.building.position.z,
        label: '废弃建筑',
        color: '#3ecfb4',
        kind: 'poi',
      });
    }

    const cam = this.game.camera;
    for (const f of findings.slice(0, 30)) {
      const world = new THREE.Vector3(f.x + (f.id != null ? 0.5 : 0), f.y, f.z + (f.id != null ? 0.5 : 0));
      const ndc = world.clone().project(cam);
      if (ndc.z > 1 || Math.abs(ndc.x) > 1.15 || Math.abs(ndc.y) > 1.15) continue;
      const sx = (ndc.x * 0.5 + 0.5) * 100;
      const sy = (-ndc.y * 0.5 + 0.5) * 100;
      const dist = origin.distanceTo(world).toFixed(0);
      const tag = document.createElement('div');
      tag.className = 'visor-tag';
      tag.style.left = `${sx}%`;
      tag.style.top = `${sy}%`;
      tag.style.borderColor = f.color;
      tag.innerHTML = `<span class="vt-name" style="color:${f.color}">${f.label}</span><span class="vt-dist">${dist}u</span>`;
      tagsEl.appendChild(tag);
    }

    // Focus target under crosshair
    let focus = null;
    const creature = this.game.fauna.raycastCreature(origin, dir, 22);
    if (creature) {
      focus = {
        kind: 'fauna',
        key: `fauna:${creature.type.id}:${creature.mesh.uuid}`,
        creature,
        label: this.game.fauna.discovered.has(creature.type.id) ? creature.type.name : '未知生物',
        duration: 1.8,
      };
    } else if (this.game.player.targetBlock) {
      const { id, x, y, z } = this.game.player.targetBlock;
      const isFlora = id === BLOCKS.SODIUM_PLANT || id === BLOCKS.CARBON_PLANT || id === BLOCKS.LEAVES;
      const isMineral =
        id === BLOCKS.FERRITE_ROCK ||
        id === BLOCKS.STONE ||
        id === BLOCKS.CRYSTAL ||
        id === BLOCKS.COPPER_ORE ||
        id === BLOCKS.DIHYDROGEN;
      if (isFlora || isMineral) {
        focus = {
          kind: isFlora ? 'flora' : 'mineral',
          key: `${isFlora ? 'flora' : 'min'}:${id}:${x},${z}`,
          label: BLOCK_NAMES[id] || '目标',
          floraId: id === BLOCKS.SODIUM_PLANT ? 'spike_bloom' : id === BLOCKS.CARBON_PLANT ? 'bulb_stalk' : 'fan_leaf',
          mineralId: `${id}`,
          units: isMineral ? 120 : 200,
          duration: 1.4,
        };
      }
    }
    this.focusTarget = focus;

    if (focus) {
      focusEl.classList.remove('hidden');
      focusEl.innerHTML = `<div class="vf-name">${focus.label}</div><div class="vf-sub">按住左键进行分析</div>`;
    } else {
      focusEl.classList.add('hidden');
    }

    // Hold LMB to scan
    const holding = this.game._mining;
    if (holding && focus && (focus.kind === 'fauna' || focus.kind === 'flora' || focus.kind === 'mineral')) {
      const result = this.game.discovery.updateScan(dt, focus);
      if (result && result.progress != null) {
        bar.classList.remove('hidden');
        fill.style.width = `${result.progress * 100}%`;
        this._scanChirp = (this._scanChirp || 0) + dt;
        if (this._scanChirp > 0.22) {
          this._scanChirp = 0;
          sound.scanPulse(result.progress);
        }
      } else {
        bar.classList.add('hidden');
        fill.style.width = '0%';
      }
      if (result && result.new) {
        bar.classList.add('hidden');
        sound.discoverFanfare();
      } else if (result && result.already) {
        bar.classList.add('hidden');
        sound.uiClick();
      }
    } else {
      this.game.discovery.scanProgress = 0;
      this.game.discovery.scanning = null;
      this._scanChirp = 0;
      bar.classList.add('hidden');
    }
  }
}
