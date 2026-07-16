import * as THREE from 'three';
import { BLOCKS, BLOCK_DROPS } from '../core/constants.js';
import { sound } from '../audio/SoundManager.js';

export class PlayerController {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.position = new THREE.Vector3(0, 40, 0);
    this.velocity = new THREE.Vector3();
    this.wishVel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.height = 1.7;
    this.radius = 0.32;
    this.speed = 6.5;
    this.sprintMul = 1.7;
    this.jumpForce = 8.2;
    this.accel = 28;
    this.airAccel = 10;
    this.friction = 12;
    this.jetpackFuel = 100;
    this.jetpackMax = 100;
    this.life = 100;
    this.hazard = 100;
    this.keys = {};
    this.pointerLocked = false;
    this.footTimer = 0;
    this.mineCooldown = 0;
    this.targetBlock = null;
    this.mouseSens = 0.002;
    this.bobPhase = 0;
    this.bobAmt = 0;
    this.fovBase = 70;
    this.fovSprint = 76;

    this._onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
    };
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      // Slight acceleration curve for fine aim
      const dx = e.movementX;
      const dy = e.movementY;
      const mag = Math.sqrt(dx * dx + dy * dy);
      const curve = 1 + Math.min(1.4, mag * 0.015);
      this.yaw -= dx * this.mouseSens * curve;
      this.pitch -= dy * this.mouseSens * curve;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    };
  }

  bind(dom) {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    document.addEventListener('mousemove', this._onMouseMove);
    this.dom = dom;
  }

  unbind() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    document.removeEventListener('mousemove', this._onMouseMove);
  }

  spawn(x, z) {
    const y = this.world.surfaceY(x, z) + 2;
    this.position.set(x + 0.5, y, z + 0.5);
    this.velocity.set(0, 0, 0);
  }

  get lookDir() {
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
    return dir;
  }

  updateCamera(dt = 0.016) {
    // Head bob when walking
    const moving = this.onGround && (Math.abs(this.velocity.x) + Math.abs(this.velocity.z)) > 1;
    if (moving) {
      this.bobPhase += dt * (this.keys['ShiftLeft'] || this.keys['ShiftRight'] ? 14 : 10);
      this.bobAmt = THREE.MathUtils.lerp(this.bobAmt, 1, 1 - Math.pow(0.01, dt));
    } else {
      this.bobAmt = THREE.MathUtils.lerp(this.bobAmt, 0, 1 - Math.pow(0.001, dt));
    }
    const bobY = Math.sin(this.bobPhase) * 0.04 * this.bobAmt;
    const bobX = Math.cos(this.bobPhase * 0.5) * 0.02 * this.bobAmt;

    this.camera.position.copy(this.position);
    this.camera.position.y += this.height + bobY;
    this.camera.position.x += Math.cos(this.yaw) * bobX;
    this.camera.position.z += Math.sin(this.yaw) * bobX;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // FOV punch when sprinting
    const sprint = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const targetFov = sprint && moving ? this.fovSprint : this.fovBase;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, 1 - Math.pow(0.01, dt));
    this.camera.updateProjectionMatrix();
  }

  update(dt) {
    if (this.mineCooldown > 0) this.mineCooldown -= dt;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const wish = new THREE.Vector3();
    if (this.keys['KeyW']) wish.add(forward);
    if (this.keys['KeyS']) wish.sub(forward);
    if (this.keys['KeyA']) wish.sub(right);
    if (this.keys['KeyD']) wish.add(right);
    if (wish.lengthSq() > 0) wish.normalize();

    const sprint = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const crouch = this.keys['ControlLeft'] || this.keys['KeyC'] && false; // C is craft
    const spd = this.speed * (sprint ? this.sprintMul : 1) * (this.keys['ControlLeft'] ? 0.55 : 1);
    this.wishVel.set(wish.x * spd, 0, wish.z * spd);

    // Smooth horizontal acceleration
    const accel = this.onGround ? this.accel : this.airAccel;
    this.velocity.x = THREE.MathUtils.damp(this.velocity.x, this.wishVel.x, accel * 0.15, dt);
    this.velocity.z = THREE.MathUtils.damp(this.velocity.z, this.wishVel.z, accel * 0.15, dt);

    // Ground friction when no input
    if (this.onGround && wish.lengthSq() === 0) {
      this.velocity.x = THREE.MathUtils.damp(this.velocity.x, 0, this.friction * 0.2, dt);
      this.velocity.z = THREE.MathUtils.damp(this.velocity.z, 0, this.friction * 0.2, dt);
    }

    // Jump / jetpack
    const jump = this.keys['Space'];
    if (jump && this.onGround) {
      this.velocity.y = this.jumpForce;
      this.onGround = false;
      sound.footstep();
    } else if (jump && !this.onGround && this.jetpackFuel > 0) {
      this.velocity.y = Math.min(7, this.velocity.y + 28 * dt);
      this.jetpackFuel = Math.max(0, this.jetpackFuel - 32 * dt);
      if (Math.random() < 0.12) sound.jetpack();
    } else {
      this.velocity.y -= 24 * dt;
      if (this.onGround) {
        this.jetpackFuel = Math.min(this.jetpackMax, this.jetpackFuel + 28 * dt);
      }
    }

    // Cap fall speed
    this.velocity.y = Math.max(-40, this.velocity.y);

    this._moveAxis(dt, 'x');
    this._moveAxis(dt, 'y');
    this._moveAxis(dt, 'z');

    if (this.onGround && wish.lengthSq() > 0) {
      this.footTimer += dt;
      if (this.footTimer > (sprint ? 0.26 : 0.38)) {
        this.footTimer = 0;
        sound.footstep();
      }
    }

    this.updateCamera(dt);
    this.targetBlock = this.raycastBlock(5.5);

    // Hazard drain
    this.hazard = Math.max(0, this.hazard - 1.0 * dt);
    if (this.hazard < 15) {
      this.life = Math.max(0, this.life - 2.5 * dt);
    }
  }

  tryMine(inventory) {
    if (this.mineCooldown > 0 || !this.targetBlock) return null;
    const { x, y, z, id } = this.targetBlock;
    if (id === BLOCKS.AIR || id === BLOCKS.BEDROCK || id === BLOCKS.WATER) return null;
    this.world.setBlock(x, y, z, BLOCKS.AIR);
    this.mineCooldown = 0.18;
    const hard = id === BLOCKS.STONE || id === BLOCKS.FERRITE_ROCK || id === BLOCKS.COPPER_ORE;
    sound.mine(hard);
    const drop = BLOCK_DROPS[id];
    let result = { x, y, z, id, item: null, qty: 0 };
    if (drop) {
      const [lo, hi] = drop.amount;
      const qty = lo + Math.floor(Math.random() * (hi - lo + 1));
      inventory.add(drop.item, qty);
      sound.collect();
      result.item = drop.item;
      result.qty = qty;
    }
    return result;
  }

  getMineTargetPoint() {
    if (!this.targetBlock) return null;
    return new THREE.Vector3(
      this.targetBlock.x + 0.5,
      this.targetBlock.y + 0.5,
      this.targetBlock.z + 0.5
    );
  }

  _moveAxis(dt, axis) {
    const p = this.position.clone();
    p[axis] += this.velocity[axis] * dt;
    if (!this._collides(p)) {
      this.position[axis] = p[axis];
      if (axis === 'y') this.onGround = false;
    } else if (axis === 'y') {
      if (this.velocity.y < 0) this.onGround = true;
      this.velocity.y = 0;
    } else {
      // Slide: kill that axis
      this.velocity[axis] = 0;
    }
  }

  _collides(pos) {
    const minX = Math.floor(pos.x - this.radius);
    const maxX = Math.floor(pos.x + this.radius);
    const minY = Math.floor(pos.y);
    const maxY = Math.floor(pos.y + this.height);
    const minZ = Math.floor(pos.z - this.radius);
    const maxZ = Math.floor(pos.z + this.radius);
    for (let y = minY; y <= maxY; y++) {
      for (let z = minZ; z <= maxZ; z++) {
        for (let x = minX; x <= maxX; x++) {
          const b = this.world.getBlock(x, y, z);
          if (b !== BLOCKS.AIR && b !== BLOCKS.WATER) return true;
        }
      }
    }
    return false;
  }

  raycastBlock(maxDist = 5) {
    const origin = this.camera.position.clone();
    const dir = this.lookDir;
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);
    const stepX = dir.x > 0 ? 1 : dir.x < 0 ? -1 : 0;
    const stepY = dir.y > 0 ? 1 : dir.y < 0 ? -1 : 0;
    const stepZ = dir.z > 0 ? 1 : dir.z < 0 ? -1 : 0;
    const tDeltaX = stepX !== 0 ? Math.abs(1 / dir.x) : Infinity;
    const tDeltaY = stepY !== 0 ? Math.abs(1 / dir.y) : Infinity;
    const tDeltaZ = stepZ !== 0 ? Math.abs(1 / dir.z) : Infinity;
    let tMaxX = stepX > 0 ? (Math.floor(origin.x) + 1 - origin.x) * tDeltaX : (origin.x - Math.floor(origin.x)) * tDeltaX;
    let tMaxY = stepY > 0 ? (Math.floor(origin.y) + 1 - origin.y) * tDeltaY : (origin.y - Math.floor(origin.y)) * tDeltaY;
    let tMaxZ = stepZ > 0 ? (Math.floor(origin.z) + 1 - origin.z) * tDeltaZ : (origin.z - Math.floor(origin.z)) * tDeltaZ;
    let dist = 0;
    for (let i = 0; i < 72; i++) {
      const id = this.world.getBlock(x, y, z);
      if (id !== BLOCKS.AIR && id !== BLOCKS.WATER) {
        return { x, y, z, id };
      }
      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          x += stepX;
          dist = tMaxX;
          tMaxX += tDeltaX;
        } else {
          z += stepZ;
          dist = tMaxZ;
          tMaxZ += tDeltaZ;
        }
      } else if (tMaxY < tMaxZ) {
        y += stepY;
        dist = tMaxY;
        tMaxY += tDeltaY;
      } else {
        z += stepZ;
        dist = tMaxZ;
        tMaxZ += tDeltaZ;
      }
      if (dist > maxDist) break;
    }
    return null;
  }

  rechargeHazard(amount) {
    this.hazard = Math.min(100, this.hazard + amount);
  }
}
