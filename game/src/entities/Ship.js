import * as THREE from 'three';
import { sound } from '../audio/SoundManager.js';

/**
 * Starship flight — smooth banking, FOV boost, responsive feel
 */
export class ShipController {
  constructor(shipMesh) {
    this.mesh = shipMesh;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.targetRoll = 0;
    this.speed = 0;
    this.maxSpeed = 80;
    this.spaceSpeed = 240;
    this.inSpace = false;
    this.enteringAtmosphere = false;
    this.entryTimer = 0;
    this.cameraDist = 11;
    this.cameraHeight = 3.2;
    this.mouseSens = 0.002;

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
    this.hyperdrive = {
      installed: false,
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
    this.roll = 0;
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

  tryInstallHyperdrive(inventory) {
    if (this.hyperdrive.installed) return false;
    if (!inventory.has('hyperdrive_core', 1)) return false;
    inventory.remove('hyperdrive_core', 1);
    this.hyperdrive.installed = true;
    sound.shipRepair();
    return true;
  }

  /** Refuel launch thruster from launch_fuel item (+45%) */
  tryRefuelLaunch(inventory) {
    if (!this.launchThruster.repaired) return false;
    if (this.launchThruster.fuel >= 99) return false;
    if (!inventory.has('launch_fuel', 1)) return false;
    inventory.remove('launch_fuel', 1);
    this.launchThruster.fuel = Math.min(100, this.launchThruster.fuel + 45);
    sound.collect();
    return true;
  }

  /** Refuel pulse from dihydrogen (+35%) */
  tryRefuelPulse(inventory) {
    if (!this.pulseEngine.repaired) return false;
    if (this.pulseEngine.fuel >= 99) return false;
    if (!inventory.has('dihydrogen', 25)) return false;
    inventory.remove('dihydrogen', 25);
    this.pulseEngine.fuel = Math.min(100, this.pulseEngine.fuel + 35);
    sound.collect();
    return true;
  }

  _checkPulse() {
    if (this.pulseEngine.hasPlating && this.pulseEngine.hasSeal) {
      this.pulseEngine.repaired = true;
      this.pulseEngine.fuel = 55;
    }
  }

  _checkLaunch() {
    if (this.launchThruster.hasJelly && this.launchThruster.hasFerrite) {
      this.launchThruster.repaired = true;
      this.launchThruster.fuel = 55;
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

    const wantBoost = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const wantLift = this.keys['Space'] ? 1 : this.keys['ControlLeft'] ? -0.7 : 0;
    const canLift = wantLift <= 0 || this.launchThruster.fuel > 0.5;
    const canBoost = wantBoost && this.pulseEngine.fuel > 0.5;
    const throttle = this.keys['KeyW'] ? 1 : this.keys['KeyS'] ? -0.35 : 0.05;
    const lift = canLift ? wantLift : Math.min(0, wantLift);
    const turn = (this.keys['KeyA'] ? 1 : 0) + (this.keys['KeyD'] ? -1 : 0);

    this.yaw += turn * 1.6 * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -1.15, 0.9);

    this.targetRoll = turn * 0.45;
    this.roll = THREE.MathUtils.damp(this.roll, this.targetRoll, 6, dt);

    const targetSpeed = throttle * (canBoost ? 62 : 36);
    this.speed = THREE.MathUtils.damp(this.speed, targetSpeed, 4, dt);

    const forward = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(-this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.position.addScaledVector(forward, this.speed * dt);
    this.position.y += lift * 20 * dt;
    if (this.position.y < 3) this.position.y = 3;

    if (lift > 0 && this.launchThruster.fuel > 0) {
      this.launchThruster.fuel = Math.max(0, this.launchThruster.fuel - 3.5 * dt);
    }
    if (canBoost) {
      this.pulseEngine.fuel = Math.max(0, this.pulseEngine.fuel - 1.8 * dt);
    }

    // Cannot reach space without launch fuel for climb
    if (this.position.y > 120 && this.pulseEngine.repaired && this.launchThruster.fuel > 0) {
      return 'to_space';
    }
    if (this.position.y > 115 && this.launchThruster.fuel <= 0) {
      this.position.y = Math.min(this.position.y, 118);
    }

    if (camera) {
      const targetFov = canBoost ? 82 : 70;
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 5, dt);
      camera.updateProjectionMatrix();
    }

    sound.setThruster(Math.abs(this.speed) > 2 || lift > 0, Math.min(1, Math.abs(this.speed) / 40 + lift * 0.3));
    return null;
  }

  _flySpace(dt, camera, mode) {
    const wantBoost = this.keys['ShiftLeft'] || this.keys['ShiftRight'];
    const throttle = this.keys['KeyW'] ? 1 : this.keys['KeyS'] ? -0.25 : 0.18;
    const turn = (this.keys['KeyA'] ? 1 : 0) + (this.keys['KeyD'] ? -1 : 0);
    const lift = (this.keys['Space'] ? 1 : 0) + (this.keys['ControlLeft'] ? -1 : 0);

    this.yaw += turn * 1.35 * dt;
    this.pitch = THREE.MathUtils.clamp(this.pitch - lift * 0.75 * dt, -1.4, 1.4);

    this.targetRoll = turn * 0.55;
    this.roll = THREE.MathUtils.damp(this.roll, this.targetRoll, 5, dt);

    const hyperMul = this.hyperdrive.installed ? 1.45 : 1;
    const canBoost = wantBoost && this.pulseEngine.fuel > 0.5;
    const max = (canBoost ? this.spaceSpeed : 105) * hyperMul;
    if (canBoost) {
      this.pulseEngine.fuel = Math.max(0, this.pulseEngine.fuel - 2.5 * dt);
    }
    this.speed = THREE.MathUtils.damp(this.speed, throttle * max, 3.5, dt);

    const forward = new THREE.Vector3(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(-this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    );
    this.position.addScaledVector(forward, this.speed * dt);

    if (camera) {
      const targetFov = canBoost ? 88 : 72;
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 4, dt);
      camera.updateProjectionMatrix();
    }

    sound.setThruster(true, Math.min(1, this.speed / 160));

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
    this.position.y = surfaceY + 45;
    this.speed = 28;
    this.pitch = 0.3;
    this.roll = 0;
  }

  _applyMesh() {
    if (!this.mesh) return;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.order = 'YXZ';
    this.mesh.rotation.y = this.yaw;
    this.mesh.rotation.x = this.pitch * 0.9;
    this.mesh.rotation.z = -this.roll;
  }

  _updateEngineFx() {
    if (!this.mesh) return;
    const light = this.mesh.userData.engineLight;
    if (light) {
      light.intensity = this.repaired ? 0.6 + Math.abs(this.speed) / 35 : 0.05;
    }
    const glows = this.mesh.userData.glows || [];
    for (const g of glows) {
      if (g.material) {
        g.material.emissiveIntensity = this.repaired
          ? 0.7 + Math.abs(this.speed) / 70 + Math.sin(performance.now() * 0.01) * 0.15
          : 0.08;
      }
    }
    // Pulse nav lights
    const navs = this.mesh.userData.navLights || [];
    const blink = Math.sin(performance.now() * 0.006) > 0 ? 1.2 : 0.3;
    for (const n of navs) {
      if (n.material) n.material.emissiveIntensity = blink;
    }
  }

  /** Smooth chase camera behind ship */
  updateCamera(camera, dt = 0.016) {
    const back = new THREE.Vector3(
      Math.sin(this.yaw) * Math.cos(this.pitch * 0.5),
      0.2 - Math.sin(this.pitch) * 0.4,
      Math.cos(this.yaw) * Math.cos(this.pitch * 0.5)
    );
    const desired = this.position
      .clone()
      .addScaledVector(back, this.cameraDist)
      .add(new THREE.Vector3(0, this.cameraHeight, 0));

    // Soft follow
    camera.position.lerp(desired, 1 - Math.pow(0.0008, dt));
    camera.rotation.order = 'YXZ';
    camera.rotation.y = THREE.MathUtils.damp(camera.rotation.y, this.yaw, 10, dt);
    // Keep yaw continuous
    camera.rotation.y = this.yaw;
    camera.rotation.x = THREE.MathUtils.damp(camera.rotation.x, this.pitch * 0.85, 10, dt);
    camera.rotation.z = THREE.MathUtils.damp(camera.rotation.z, -this.roll * 0.5, 8, dt);
  }
}
