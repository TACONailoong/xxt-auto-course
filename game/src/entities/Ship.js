import * as THREE from 'three';
import { sound } from '../audio/SoundManager.js';

/**
 * Starship flight controller — planet atmosphere + space
 */
export class ShipController {
  constructor(shipMesh) {
    this.mesh = shipMesh;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.maxSpeed = 80;
    this.spaceSpeed = 220;
    this.inSpace = false;
    this.enteringAtmosphere = false;
    this.entryTimer = 0;

    this.pulseEngine = {
      repaired: false,
      hasPlating: false,
      hasSeal: false,
      fuel: 0,
    };
    this.launchThruster = {
      repaired: false,
      hasJelly: false,
      hasFerrite: false,
      fuel: 0,
    };

    this.keys = {};
  }

  syncKeys(keys) {
    this.keys = keys;
  }

  place(x, y, z, yaw = 0) {
    this.position.set(x, y, z);
    this.yaw = yaw;
    this.pitch = 0;
    this.speed = 0;
    this.velocity.set(0, 0, 0);
    this._applyMesh();
  }

  get repaired() {
    return this.pulseEngine.repaired && this.launchThruster.repaired;
  }

  tryInstallPlating(inventory) {
    if (this.pulseEngine.hasPlating) return false;
    if (!inventory.has('metal_plating', 1)) return false;
    inventory.remove('metal_plating', 1);
    this.pulseEngine.hasPlating = true;
    sound.shipRepair();
    this._checkPulse();
    return true;
  }

  tryInstallSeal(inventory) {
    if (this.pulseEngine.hasSeal) return false;
    if (!inventory.has('hermetic_seal', 1)) return false;
    inventory.remove('hermetic_seal', 1);
    this.pulseEngine.hasSeal = true;
    sound.shipRepair();
    this._checkPulse();
    return true;
  }

  tryInstallJelly(inventory) {
    if (this.launchThruster.hasJelly) return false;
    if (!inventory.has('dihydrogen_jelly', 1)) return false;
    inventory.remove('dihydrogen_jelly', 1);
    this.launchThruster.hasJelly = true;
    sound.shipRepair();
    this._checkLaunch();
    return true;
  }

  tryInstallFerrite(inventory) {
    if (this.launchThruster.hasFerrite) return false;
    if (!inventory.has('pure_ferrite', 50)) return false;
    inventory.remove('pure_ferrite', 50);
    this.launchThruster.hasFerrite = true;
    sound.shipRepair();
    this._checkLaunch();
    return true;
  }

  _checkPulse() {
    if (this.pulseEngine.hasPlating && this.pulseEngine.hasSeal) {
      this.pulseEngine.repaired = true;
      this.pulseEngine.fuel = 50;
    }
  }

  _checkLaunch() {
    if (this.launchThruster.hasJelly && this.launchThruster.hasFerrite) {
      this.launchThruster.repaired = true;
      this.launchThruster.fuel = 50;
    }
  }

  update(dt, mode, camera) {
    let transition = null;
    if (mode === 'ship_planet') {
      transition = this._flyAtmosphere(dt, camera);
    } else if (mode === 'space' || mode === 'entering') {
      this._flySpace(dt, camera, mode);
    }
    this._applyMesh();
    this._updateEngineFx();
    return transition;
  }

  _flyAtmosphere(dt, camera) {
    if (!this.repaired) return null;

    const boost = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const throttle = this.keys['KeyW'] ? 1 : this.keys['KeyS'] ? -0.4 : 0;
    const lift = this.keys['Space'] ? 1 : this.keys['ControlLeft'] ? -0.6 : 0;
    const turn = (this.keys['KeyA'] ? 1 : 0) + (this.keys['KeyD'] ? -1 : 0);

    // Steer with mouse (yaw/pitch already synced from player) + A/D
    this.yaw += turn * 1.5 * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.2, 0.85);

    const targetSpeed = throttle * (boost ? 55 : 32);
    this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, 1 - Math.pow(0.05, dt));

    const forward = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(-this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.position.addScaledVector(forward, this.speed * dt);
    this.position.y += lift * 18 * dt;

    // Keep above terrain roughly
    if (this.position.y < 2) this.position.y = 2;

    if (lift > 0 && this.launchThruster.fuel > 0) {
      this.launchThruster.fuel = Math.max(0, this.launchThruster.fuel - 4 * dt);
    }

    if (this.position.y > 120 && this.pulseEngine.repaired) {
      return 'to_space';
    }

    sound.setThruster(Math.abs(this.speed) > 2 || lift > 0, Math.min(1, Math.abs(this.speed) / 40 + lift * 0.3));
    return null;
  }

  _flySpace(dt, camera, mode) {
    const boost = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const throttle = this.keys['KeyW'] ? 1 : this.keys['KeyS'] ? -0.3 : 0.2;
    const turn = (this.keys['KeyA'] ? 1 : 0) + (this.keys['KeyD'] ? -1 : 0);
    const lift = (this.keys['Space'] ? 1 : 0) + (this.keys['ControlLeft'] ? -1 : 0);

    this.yaw += turn * 1.2 * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch - lift * 0.7 * dt, -1.4, 1.4);

    const max = boost && this.pulseEngine.fuel > 0 ? this.spaceSpeed : 100;
    if (boost && this.pulseEngine.fuel > 0) {
      this.pulseEngine.fuel = Math.max(0, this.pulseEngine.fuel - 3 * dt);
    }
    this.speed = THREE.MathUtils.lerp(this.speed, throttle * max, 1 - Math.pow(0.08, dt));

    const forward = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(-this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.position.addScaledVector(forward, this.speed * dt);

    sound.setThruster(true, Math.min(1, this.speed / 150));

    if (mode === 'entering') {
      this.entryTimer += dt;
    }
  }

  beginEntry() {
    this.enteringAtmosphere = true;
    this.entryTimer = 0;
    sound.atmosphereEntry();
  }

  endEntry(surfaceY) {
    this.enteringAtmosphere = false;
    this.inSpace = false;
    this.position.y = surfaceY + 40;
    this.speed = 30;
    this.pitch = 0.35;
  }

  _applyMesh() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = this.yaw;
    this.mesh.rotation.x = this.pitch * 0.85;
    this.mesh.rotation.z = -this.roll;
  }

  _updateEngineFx() {
    if (!this.mesh) return;
    const light = this.mesh.userData.engineLight;
    if (light) {
      light.intensity = this.repaired ? 0.5 + Math.abs(this.speed) / 40 : 0.05;
    }
    const glows = this.mesh.userData.glows || [];
    for (const g of glows) {
      g.material.emissiveIntensity = this.repaired ? 0.6 + Math.abs(this.speed) / 80 : 0.1;
    }
  }

  /** Third-person camera behind ship */
  updateCamera(camera) {
    const back = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch * 0.6),
      0.25 - Math.sin(this.pitch) * 0.5,
      Math.cos(this.yaw) * Math.cos(this.pitch * 0.6)
    );
    camera.position.copy(this.position).addScaledVector(back, 9).add(new THREE.Vector3(0, 2.8, 0));
    camera.rotation.order = 'YXZ';
    camera.rotation.y = this.yaw;
    camera.rotation.x = this.pitch * 0.9;
    camera.rotation.z = 0;
  }
}
