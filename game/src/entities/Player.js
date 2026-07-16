import * as THREE from 'three';
import { BLOCKS, BLOCK_DROPS } from '../core/constants.js';
import { sound } from '../audio/SoundManager.js';

export class PlayerController {
  constructor(camera, world) {
    this.camera = camera;
    this.world = world;
    this.position = new THREE.Vector3(0, 40, 0);
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.flying = false; // ship mode handled elsewhere
    this.height = 1.7;
    this.radius = 0.3;
    this.speed = 6;
    this.sprintMul = 1.6;
    this.jumpForce = 8;
    this.jetpackFuel = 100;
    this.jetpackMax = 100;
    this.life = 100;
    this.hazard = 100;
    this.keys = {};
    this.pointerLocked = false;
    this.footTimer = 0;
    this.mineCooldown = 0;
    this.targetBlock = null;

    this._onKeyDown = (e) => {
      this.keys[e.code] = true;
      if (['Space', 'Tab'].includes(e.code)) e.preventDefault();
    };
    this._onKeyUp = (e) => {
      this.keys[e.code] = false;
    };
    this._onMouseMove = (e) => {
      if (!this.pointerLocked) return;
      this.yaw -= e.movementX * 0.0022;
      this.pitch -= e.movementY * 0.0022;
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

  updateCamera() {
    this.camera.position.copy(this.position);
    this.camera.position.y += this.height;
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }

  update(dt, inventory, onMine) {
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
    const spd = this.speed * (sprint ? this.sprintMul : 1);
    this.velocity.x = wish.x * spd;
    this.velocity.z = wish.z * spd;

    // Jump / jetpack
    const jump = this.keys['Space'];
    if (jump && this.onGround) {
      this.velocity.y = this.jumpForce;
      this.onGround = false;
    } else if (jump && !this.onGround && this.jetpackFuel > 0) {
      this.velocity.y = Math.min(6, this.velocity.y + 25 * dt);
      this.jetpackFuel = Math.max(0, this.jetpackFuel - 35 * dt);
      if (Math.random() < 0.15) sound.jetpack();
    } else {
      this.velocity.y -= 22 * dt;
      if (this.onGround) {
        this.jetpackFuel = Math.min(this.jetpackMax, this.jetpackFuel + 25 * dt);
      }
    }

    this._moveAxis(dt, 'x');
    this._moveAxis(dt, 'y');
    this._moveAxis(dt, 'z');

    // Footsteps
    if (this.onGround && wish.lengthSq() > 0) {
      this.footTimer += dt;
      if (this.footTimer > (sprint ? 0.28 : 0.4)) {
        this.footTimer = 0;
        sound.footstep();
      }
    }

    this.updateCamera();
    this.targetBlock = this.raycastBlock(5);

    // Hazard drain
    this.hazard = Math.max(0, this.hazard - 1.2 * dt);
    if (this.hazard < 15) {
      this.life = Math.max(0, this.life - 3 * dt);
    }
  }

  tryMine(inventory) {
    if (this.mineCooldown > 0 || !this.targetBlock) return null;
    const { x, y, z, id } = this.targetBlock;
    if (id === BLOCKS.AIR || id === BLOCKS.BEDROCK) return null;
    this.world.setBlock(x, y, z, BLOCKS.AIR);
    this.mineCooldown = 0.2;
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
    for (let i = 0; i < 64; i++) {
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
