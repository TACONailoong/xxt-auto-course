import * as THREE from 'three';
import { PLANETS, BLOCKS, ITEMS, TRADE_OFFERS } from './constants.js';
import { Inventory } from '../systems/Inventory.js';
import { MissionSystem } from '../systems/Mission.js';
import { PlanetEntry } from '../systems/PlanetEntry.js';
import { Effects, StormSystem, AnalysisVisor } from '../systems/Effects.js';
import { FaunaSystem } from '../systems/Fauna.js';
import { DayNightCycle } from '../systems/DayNight.js';
import { DiscoverySystem } from '../systems/Discovery.js';
import { VoxelWorld } from '../world/VoxelWorld.js';
import { SpaceScene } from '../world/SpaceScene.js';
import { PlayerController } from '../entities/Player.js';
import { ShipController } from '../entities/Ship.js';
import {
  createStarship,
  createAbandonedBuilding,
  createDistressBeacon,
  createCrashDebris,
  createCrystalCluster,
  animateStarship,
} from '../models/ShipModel.js';
import { UIManager } from '../ui/UIManager.js';
import { WaypointHUD } from '../ui/WaypointHUD.js';
import { Multiplayer } from '../net/Multiplayer.js';
import { sound } from '../audio/SoundManager.js';

export class Game {
  constructor() {
    this.mode = 'planet'; // planet | ship_planet | space | entering
    this.flags = {
      scannerRepaired: false,
      scannedShip: false,
      nearShip: false,
      diagnosed: false,
      beaconRead: false,
      hermeticTaken: false,
      unlockedRefiner: false,
      refinerBuilt: false,
      canFly: false,
      spaceTutorial: false,
      enteredSecondPlanet: false,
      unlockedHyperdrive: false,
      hyperdriveInstalled: false,
      tradeUnlocked: false,
    };
    this.currentPlanetId = 'awakening';
    this.inventory = new Inventory();
    this.ui = new UIManager(this);
    this.mission = new MissionSystem(this);
    this.entry = new PlanetEntry(this);
    this.net = new Multiplayer(this);

    this.shipPos = new THREE.Vector3(12, 0, 10);
    this.buildingPos = new THREE.Vector3(48, 0, -28);
    this.markers = [];

    this._clock = new THREE.Clock();
    this._hazardWarn = 0;
    this._keyLatch = {};
    this.spaceGrace = 0;
    this._mining = false;
    this.effects = null;
    this.storm = null;
    this.visor = null;
    this.waypoints = null;
    this.fauna = null;
    this.dayNight = null;
    this.discovery = null;
  }

  log(text) {
    this.ui.log(text);
  }

  async start(playerName) {
    await sound.resume();
    this.playerName = playerName || 'TRAVELLER';
    this.ui.setLoading(0.1, '构建渲染核心…');

    this.canvas = document.getElementById('game-canvas');
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.renderer.setClearColor(0x6ab0d0);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0x6ab0d0, 40, 140);

    this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 3000);
    this.scene.add(this.camera); // so held multi-tool renders

    this.ui.setLoading(0.3, '生成方块行星…');
    await this._delay(50);

    this._setupPlanetLights();
    const planet = PLANETS.find((p) => p.id === this.currentPlanetId);
    this.world = new VoxelWorld(planet, this.scene);
    this.world.updateAround(0, 0, 4);

    this.effects = new Effects(this.scene, this.camera);
    this.storm = new StormSystem(this);
    this.visor = new AnalysisVisor(this);
    this.waypoints = new WaypointHUD(this);
    this.fauna = new FaunaSystem(this);
    this.dayNight = new DayNightCycle(this);
    this.discovery = new DiscoverySystem(this);
    this._baseSky = 0x6ab0d0;
    this.dayNight.ensureLights();
    this._placedRefiners = [];
    this._deathTimer = 0;

    this.ui.setLoading(0.55, '部署坠毁星舰…');
    await this._delay(50);

    // Place ship on surface
    const sx = this.shipPos.x;
    const sz = this.shipPos.z;
    const sy = this.world.surfaceY(sx, sz);
    this.shipPos.y = sy;
    this.shipMesh = createStarship({ damaged: true, accent: 0x3ecfb4, engine: 0xe8a832, scale: 1.65 });
    this.shipMesh.position.set(sx, sy, sz);
    this.shipMesh.rotation.y = 0.8;
    this.shipMesh.rotation.z = 0.12;
    this.scene.add(this.shipMesh);

    // Crash debris field
    this.debris = createCrashDebris();
    this.debris.position.set(sx, sy, sz);
    this.debris.rotation.y = 0.8;
    this.scene.add(this.debris);

    // Visible crash plume light
    const crashLight = new THREE.PointLight(0xff6020, 1.4, 28);
    crashLight.position.set(sx, sy + 4, sz);
    this.scene.add(crashLight);

    this.ship = new ShipController(this.shipMesh);
    this.ship.place(sx, sy + 0.5, sz, 0.8);

    this.beacon = createDistressBeacon();
    this.beacon.position.set(sx + 4, sy, sz + 3);
    this.scene.add(this.beacon);

    const by = this.world.surfaceY(this.buildingPos.x, this.buildingPos.z);
    this.buildingPos.y = by;
    this.building = createAbandonedBuilding();
    this.building.position.set(this.buildingPos.x, by, this.buildingPos.z);
    this.scene.add(this.building);

    // Waypoint markers (sprites via simple meshes)
    this.shipMarker = this._makeMarker(0xe8a832);
    this.shipMarker.position.set(sx, sy + 8, sz);
    this.shipMarker.visible = false;
    this.scene.add(this.shipMarker);

    this.buildingMarker = this._makeMarker(0x3ecfb4);
    this.buildingMarker.position.set(this.buildingPos.x, by + 10, this.buildingPos.z);
    this.buildingMarker.visible = false;
    this.scene.add(this.buildingMarker);

    this.player = new PlayerController(this.camera, this.world);
    this.player.bind(this.canvas);
    try {
      const s = localStorage.getItem('voxbound_sens');
      if (s) this.player.mouseSens = parseFloat(s) || 0.002;
    } catch { /* ignore */ }
    this.player.spawn(2, 2);
    // Face toward crashed ship
    {
      const dx = sx - 2.5;
      const dz = sz - 2.5;
      this.player.yaw = Math.atan2(-dx, -dz);
    }
    this.player.setHazardProfile(planet?.hazard || 'heat');

    // Guaranteed starter resources near spawn
    this._seedStarterResources();

    // Decorative crystal props near spawn / path to ship
    this._propCrystals = [];
    for (const [x, z, col] of [
      [6, 3, 0x4a9eff],
      [9, 6, 0x7ae0ff],
      [11, 9, 0x4a9eff],
      [4, 8, 0x60b0ff],
    ]) {
      const crystal = createCrystalCluster(col);
      const cy = this.world.surfaceY(x, z);
      crystal.position.set(x + 0.5, cy, z + 0.5);
      crystal.scale.setScalar(0.85 + Math.random() * 0.3);
      this.scene.add(crystal);
      this._propCrystals.push(crystal);
    }

    // Tall smoke plume so ship is easy to spot
    this._crashPlume = new THREE.Group();
    for (let i = 0; i < 8; i++) {
      const p = new THREE.Mesh(
        new THREE.BoxGeometry(0.5 + i * 0.15, 0.5, 0.5 + i * 0.15),
        new THREE.MeshBasicMaterial({
          color: i < 3 ? 0xff6020 : 0x555555,
          transparent: true,
          opacity: 0.55 - i * 0.04,
        })
      );
      p.position.set(sx + (Math.random() - 0.5) * 0.5, sy + 3 + i * 1.1, sz + (Math.random() - 0.5) * 0.5);
      this._crashPlume.add(p);
    }
    this.scene.add(this._crashPlume);

    this.space = new SpaceScene(this.scene);
    this.space.build();

    this.ui.setLoading(0.8, '连接星际网络…');
    this.net.connect(this.playerName);

    // Restore save if present
    const restored = this._loadProgress();
    if (restored) {
      this.log('检测到航迹存档，已恢复进度。');
      if (this.flags.scannedShip) this.shipMarker.visible = true;
      if (this.flags.beaconRead && !this.flags.hermeticTaken) this.buildingMarker.visible = true;
      await this._restoreWorldFromSave(restored);
    }

    this._bindInput();
    window.addEventListener('resize', () => this._onResize());

    this.ui.setLoading(1, '苏醒序列完成');
    await this._delay(400);

    this.ui.showScreen('game-ui');
    this.log('我在陌生的方块世界醒来，记忆一片空白… 外骨骼提示：采集铁尘修复扫描器。');
    this.ui.refreshMission();

    // Initial fauna + flora near spawn
    this.fauna.spawnAround(this.player.position.x, this.player.position.z, 8);
    this.fauna.spawnFloraProps(this.player.position.x, this.player.position.z, 7);
    sound.setAmbientMode('planet');

    // Pointer lock on click
    this.canvas.addEventListener('click', () => {
      if (!this.ui.anyModalOpen()) this.canvas.requestPointerLock();
    });
    document.addEventListener('pointerlockchange', () => {
      this.player.pointerLocked = document.pointerLockElement === this.canvas;
    });

    this._loop();
  }

  _seedStarterResources() {
    const spots = [
      [3, 2, BLOCKS.FERRITE_ROCK],
      [4, 3, BLOCKS.FERRITE_ROCK],
      [5, 4, BLOCKS.FERRITE_ROCK],
      [5, 5, BLOCKS.FERRITE_ROCK],
      [6, 6, BLOCKS.FERRITE_ROCK],
      [7, 7, BLOCKS.FERRITE_ROCK],
      [3, 6, BLOCKS.FERRITE_ROCK],
      [7, 2, BLOCKS.FERRITE_ROCK],
      [4, 5, BLOCKS.SODIUM_PLANT],
      [6, 7, BLOCKS.SODIUM_PLANT],
      [2, 8, BLOCKS.SODIUM_PLANT],
      [8, 4, BLOCKS.CARBON_PLANT],
      [8, 5, BLOCKS.CARBON_PLANT],
      [9, 9, BLOCKS.DIHYDROGEN],
      [1, 5, BLOCKS.DIHYDROGEN],
      [10, 8, BLOCKS.DIHYDROGEN],
    ];
    for (const [x, z, id] of spots) {
      const y = this.world.surfaceY(x, z);
      this.world.setBlock(x, y, z, id);
    }
  }

  _setupPlanetLights(fogColor = 0x6ab0d0) {
    this._baseSky = fogColor;
    // Remove old lights (keep dayNight ones that will be recreated)
    const toRemove = this.scene.children.filter(
      (c) => c.userData.planetLight && !c.userData.dayNight
    );
    toRemove.forEach((c) => this.scene.remove(c));
    // Also remove previous dayNight lights so they rebuild cleanly
    const dnRemove = this.scene.children.filter((c) => c.userData.dayNight);
    dnRemove.forEach((c) => this.scene.remove(c));
    if (this.dayNight) {
      this.dayNight.sun = null;
      this.dayNight.moon = null;
      this.dayNight.sunMesh = null;
      this.dayNight.moonMesh = null;
    }

    const hemi = new THREE.HemisphereLight(0xb8d8f0, 0x3a5a2a, 0.5);
    hemi.userData.planetLight = true;
    this.scene.add(hemi);

    const fill = new THREE.AmbientLight(0x405060, 0.3);
    fill.userData.planetLight = true;
    this.scene.add(fill);

    this.scene.fog = new THREE.Fog(fogColor, 40, 140);
    this.renderer.setClearColor(fogColor);

    // Blocky cloud puffs
    if (!this._clouds) {
      this._clouds = new THREE.Group();
      this._clouds.userData.planetLight = true;
      for (let i = 0; i < 18; i++) {
        const cloud = new THREE.Group();
        const mat = new THREE.MeshLambertMaterial({
          color: 0xe8f0f8,
          transparent: true,
          opacity: 0.55,
          flatShading: true,
        });
        for (let j = 0; j < 4; j++) {
          const b = new THREE.Mesh(new THREE.BoxGeometry(4 + Math.random() * 4, 2, 3 + Math.random() * 3), mat);
          b.position.set(j * 3 - 4, Math.random() * 1.5, (Math.random() - 0.5) * 4);
          cloud.add(b);
        }
        cloud.position.set((Math.random() - 0.5) * 160, 45 + Math.random() * 20, (Math.random() - 0.5) * 160);
        this._clouds.add(cloud);
      }
      this.scene.add(this._clouds);
    } else {
      this._clouds.visible = true;
      this.scene.add(this._clouds);
    }

    // DayNight owns the sun
    this.dayNight?.ensureLights();
    sound.setAmbientMode(this.storm?.active ? 'storm' : 'planet');
  }

  _setupSpaceLights() {
    const toRemove = this.scene.children.filter((c) => c.userData.planetLight);
    toRemove.forEach((c) => this.scene.remove(c));
    this.dayNight?.clearRefs();
    if (this._clouds) this._clouds.visible = false;
    const amb = new THREE.AmbientLight(0x304050, 0.4);
    amb.userData.planetLight = true;
    this.scene.add(amb);
    const sun = new THREE.DirectionalLight(0xfff0d0, 0.6);
    sun.position.set(-1, 0.4, -0.8);
    sun.userData.planetLight = true;
    this.scene.add(sun);
    this.scene.fog = null;
    this.renderer.setClearColor(0x02060c);
    sound.setAmbientMode('space');
  }

  _makeMarker(color) {
    const g = new THREE.Group();
    const diamond = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.8, 0),
      new THREE.MeshBasicMaterial({ color })
    );
    g.add(diamond);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.2, 1.5, 4),
      new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.7 })
    );
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    g.userData.diamond = diamond;
    return g;
  }

  _bindInput() {
    window.addEventListener('keydown', (e) => {
      if (this._keyLatch[e.code]) return;
      this._keyLatch[e.code] = true;

      if (e.code === 'Tab') {
        e.preventDefault();
        this.ui.toggleInventory();
        if (this.ui.anyModalOpen()) document.exitPointerLock();
      }
      if (e.code === 'KeyC') {
        this.ui.toggleCraft();
        if (this.ui.anyModalOpen()) document.exitPointerLock();
      }
      if (e.code === 'Escape') {
        this.ui.closeModals();
      }
      if (e.code === 'KeyR') this._doScan();
      if (e.code === 'KeyE') this._doInteract();
      if (e.code === 'KeyF') this._toggleShip();
      if (e.code === 'KeyQ') {
        const cold = this.player.hazardType === 'cold';
        if (cold) {
          if (this.inventory.has('oxygen', 5)) {
            this.inventory.remove('oxygen', 5);
            this.player.rechargeHazard(40);
            sound.collect();
            this.log('生命维持已充能（氧）。');
          } else {
            this.log('寒冷环境需要氧×5 充能防护。');
          }
        } else if (this.inventory.has('sodium', 5)) {
          this.inventory.remove('sodium', 5);
          this.player.rechargeHazard(40);
          sound.collect();
          this.log('防护系统已充能（钠）。');
        } else {
          this.log('需要钠×5 充能防护。');
        }
      }
      // Hotbar 1-5
      if (e.code >= 'Digit1' && e.code <= 'Digit5') {
        this.player.hotbarIndex = Number(e.code.replace('Digit', '')) - 1;
        this.ui.refreshHotbar();
      }
      if (e.code === 'KeyV') {
        this.visor?.setActive(true);
        sound.scan();
      }
      if (e.code === 'KeyP') {
        this.log(this._paused ? '继续航行。' : '已暂停。按 P 继续。');
        this._paused = !this._paused;
      }
      if (e.code === 'Comma') {
        this.player.mouseSens = Math.max(0.0008, this.player.mouseSens - 0.0003);
        this._toastSens();
      }
      if (e.code === 'Period') {
        this.player.mouseSens = Math.min(0.005, this.player.mouseSens + 0.0003);
        this._toastSens();
      }
    });
    window.addEventListener('keyup', (e) => {
      this._keyLatch[e.code] = false;
      if (e.code === 'KeyV') this.visor?.setActive(false);
    });

    this._mining = false;
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this._mining = true;
      if (e.button === 2 && this.mode === 'planet' && !this.ui.anyModalOpen()) {
        e.preventDefault();
        this._tryPlaceBlock();
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._mining = false;
    });
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _tryPlaceBlock() {
    if (this.visor?.active || this.player.dead) return;
    const result = this.player.tryPlace(this.inventory);
    if (!result) return;
    if (result.kind === 'prop' && result.id === 'refiner') {
      this.flags.refinerBuilt = true;
      this.inventory.refinerAvailable = true;
      // Visual: small blocky refiner
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(0.9, 1.1, 0.9),
        new THREE.MeshLambertMaterial({ color: 0xe8a832, flatShading: true })
      );
      body.position.y = 0.55;
      g.add(body);
      const top = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.3, 0.5),
        new THREE.MeshLambertMaterial({
          color: 0x3ecfb4,
          flatShading: true,
          emissive: 0x3ecfb4,
          emissiveIntensity: 0.4,
        })
      );
      top.position.y = 1.25;
      g.add(top);
      g.position.set(result.x + 0.5, result.y, result.z + 0.5);
      this.scene.add(g);
      this._placedRefiners.push(g);
      this.log('便携精炼机已部署。打开制作台可精炼铁尘。');
    } else {
      this.log('方块已放置。');
    }
  }

  _doScan() {
    if (!this.flags.scannerRepaired && this.inventory.count('ferrite_dust') < 75) {
      this.log('扫描器损坏。需要铁尘×75。');
      return;
    }
    if (!this.flags.scannerRepaired && this.inventory.count('ferrite_dust') >= 75) {
      this.inventory.remove('ferrite_dust', 75);
      this.flags.scannerRepaired = true;
    }
    sound.scan();
    this.ui.showScan();
    this.flags.scannedShip = true;
    this.shipMarker.visible = true;
    this.log('扫描完成：检测到坠毁星舰信号。');
    if (this.flags.beaconRead && !this.flags.hermeticTaken) {
      this.buildingMarker.visible = true;
      this.log('废弃建筑坐标已标定。');
    }
  }

  _doInteract() {
    if (this.mode !== 'planet') return;
    const pos = this.player.position;

    // Beacon
    if (this.beacon && pos.distanceTo(this.beacon.position) < 4) {
      this.flags.beaconRead = true;
      this.buildingMarker.visible = true;
      this.log('求救信标：行星图已解码。前往废弃建筑寻找密封环。风暴预警…');
      sound.uiClick();
      return;
    }

    // Building terminal
    if (this.building && pos.distanceTo(this.building.position) < 5) {
      if (!this.flags.hermeticTaken) {
        this.flags.hermeticTaken = true;
        this.inventory.add('hermetic_seal', 1);
        this.buildingMarker.visible = false;
        sound.craft();
        this.log('获得密封环！返回星舰安装。');
      } else {
        this.flags.tradeUnlocked = true;
        this.ui.toggleTrade(true);
        document.exitPointerLock();
        this.log('银河贸易终端已连接。');
      }
      return;
    }

    // Ship interact when near
    if (pos.distanceTo(this.ship.position) < 5) {
      this.flags.nearShip = true;
      if (!this.flags.diagnosed) {
        this.flags.diagnosed = true;
        this.ui.toggleShipPanel(true);
        document.exitPointerLock();
        this.log('诊断：脉冲引擎与发射推进器离线。');
      } else {
        this.ui.toggleShipPanel(true);
        document.exitPointerLock();
      }
    }
  }

  _toggleShip() {
    if (this.mode === 'planet') {
      if (this.player.position.distanceTo(this.ship.position) > 6) {
        this.log('距离星舰过远。');
        return;
      }
      this.flags.nearShip = true;
      if (!this.flags.diagnosed) {
        this.flags.diagnosed = true;
        this.log('进入驾驶舱。系统离线 — 打开诊断面板。');
        this.ui.toggleShipPanel(true);
        document.exitPointerLock();
        return;
      }
      if (!this.ship.repaired) {
        this.ui.toggleShipPanel(true);
        document.exitPointerLock();
        return;
      }
      // Board ship for flight
      this.mode = 'ship_planet';
      this.shipMesh.rotation.z = 0;
      // Swap to repaired look
      if (this.ship.repaired && this.shipMesh.userData.damaged !== false) {
        const pos = this.shipMesh.position.clone();
        const rotY = this.shipMesh.rotation.y;
        this.scene.remove(this.shipMesh);
        this.shipMesh = createStarship({ damaged: false, accent: 0x3ecfb4, engine: 0xe8a832, scale: 1.65 });
        this.shipMesh.position.copy(pos);
        this.shipMesh.rotation.y = rotY;
        this.shipMesh.userData.damaged = false;
        this.scene.add(this.shipMesh);
        this.ship.mesh = this.shipMesh;
        if (this.debris) this.debris.visible = false;
      }
      sound.shipEnter();
      sound.liftoff();
      this.log('星舰就绪。WASD 飞行 · Space 升空 · 高度 120 进入太空。');
      this.ship.position.copy(this.shipMesh.position);
      this.ship.position.y += 2;
    } else if (this.mode === 'ship_planet') {
      // Land / exit
      const sy = this.world.surfaceY(this.ship.position.x, this.ship.position.z);
      if (this.ship.position.y > sy + 8) {
        this.log('高度过高，无法降落。降低高度后再试。');
        return;
      }
      this.mode = 'planet';
      this.ship.position.y = sy + 0.5;
      this.shipMesh.position.copy(this.ship.position);
      this.player.position.set(this.ship.position.x + 3, sy + 2, this.ship.position.z);
      this.player.velocity.set(0, 0, 0);
      sound.setThruster(false);
      sound.shipEnter();
      this.log('已离舰。');
    } else if (this.mode === 'space') {
      this.log('在太空中选择行星俯冲进入大气层。');
    }
  }

  enterSpace() {
    this.mode = 'space';
    this.spaceGrace = 4; // seconds before atmosphere entry can trigger
    this._setupSpaceLights();
    this.fauna?.clear();
    if (this.world) {
      this.world.group.visible = false;
    }
    this.beacon.visible = false;
    this.building.visible = false;
    this.shipMarker.visible = false;
    this.buildingMarker.visible = false;
    this.space.setActive(true);

    const home = this.space.planets[0];
    this.ship.position.set(0, home.def.radius + 50, home.def.radius + 60);
    this.ship.inSpace = true;
    this.ship.speed = 50;
    this.shipMesh.rotation.z = 0;
    sound.liftoff();
    this.log('冲出大气层。深空就绪。飞向邻近行星，接近后自动进入大气。');
  }

  landOnPlanet(planetDef, fromSpace = false) {
    this.currentPlanetId = planetDef.id;
    if (fromSpace && planetDef.id !== 'awakening') {
      this.flags.enteredSecondPlanet = true;
    }

    this.space.setActive(false);
    this.fauna?.clear();
    this._setupPlanetLights(planetDef.atmosphere);

    // Rebuild voxel world for this planet
    if (this.world) this.world.dispose();
    this.world = new VoxelWorld(planetDef, this.scene);
    this.world.updateAround(0, 0, 4);
    this.player.world = this.world;

    // Place ship in air then allow landing
    const sy = this.world.surfaceY(0, 0);
    this.ship.endEntry(sy);
    this.shipMesh.position.copy(this.ship.position);

    // Show/hide story props only on awakening
    const home = planetDef.id === 'awakening';
    this.beacon.visible = home;
    this.building.visible = home;
    if (this.debris) this.debris.visible = home;
    if (this._crashPlume) this._crashPlume.visible = home;
    if (this._propCrystals) {
      for (const c of this._propCrystals) c.visible = home;
    }

    // Seed copper near land site for hyperdrive mission
    if (!home) {
      for (const [x, z] of [
        [3, 4],
        [5, 2],
        [7, 6],
        [-2, 5],
        [4, -3],
      ]) {
        const y = this.world.surfaceY(x, z);
        this.world.setBlock(x, y, z, BLOCKS.COPPER_ORE);
      }
    }

    // Respawn local life
    this.fauna.spawnAround(0, 0, 10);
    this.fauna.spawnFloraProps(0, 0, 8);
    this.player.setHazardProfile(planetDef.hazard || 'heat');

    this.mode = 'ship_planet';
    this.log(
      `降落于 ${planetDef.name}（${planetDef.hazard === 'cold' ? '极寒' : '高温'}）。按 F 在低空离舰探索。`
    );
  }

  _onPlayerDeath() {
    this.player.kill();
    this._deathTimer = 0;
    sound.hazardWarning();
    // Soft penalty — lose some sodium/oxygen
    if (this.inventory.has('sodium', 10)) this.inventory.remove('sodium', 10);
    else if (this.inventory.has('oxygen', 10)) this.inventory.remove('oxygen', 10);
    this.log('外骨骼失效… 正在将你传送回星舰。');
    document.getElementById('death-overlay')?.classList.remove('hidden');
  }

  _respawnPlayer() {
    document.getElementById('death-overlay')?.classList.add('hidden');
    const sx = this.ship.position.x;
    const sz = this.ship.position.z;
    this.player.respawnAt(Math.floor(sx) + 2, Math.floor(sz) + 2);
    this.player.yaw = this.ship.yaw;
    this._deathTimer = 0;
    this.log('在星舰旁苏醒。防护已部分恢复。');
  }

  _updateMarkers(dt) {
    for (const m of [this.shipMarker, this.buildingMarker]) {
      if (!m || !m.visible) continue;
      m.userData.diamond.rotation.y += dt * 2;
      m.position.y += Math.sin(performance.now() * 0.003) * 0.01;
    }
    // Near ship check
    if (this.mode === 'planet' && this.player.position.distanceTo(this.ship.position) < 10) {
      this.flags.nearShip = true;
    }
  }

  _updateInteractPrompt() {
    if (this.mode !== 'planet') {
      this.ui.setInteract(null);
      return;
    }
    const pos = this.player.position;
    if (pos.distanceTo(this.ship.position) < 5) {
      this.ui.setInteract(this.ship.repaired ? '进入星舰' : '星舰诊断');
    } else if (this.beacon && pos.distanceTo(this.beacon.position) < 4) {
      this.ui.setInteract('调查求救信标');
    } else if (this.building && pos.distanceTo(this.building.position) < 5) {
      this.ui.setInteract(this.flags.hermeticTaken ? '银河贸易终端' : '取得密封环');
    } else {
      this.ui.setInteract(null);
    }
  }

  _updateCompass() {
    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    let yaw = this.mode === 'planet' ? this.player.yaw : this.ship.yaw;
    let idx = Math.round(((-yaw + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 4)) % 8;
    document.getElementById('compass-markers').textContent = dirs[idx];
  }

  _loop() {
    requestAnimationFrame(() => this._loop());
    const dt = Math.min(0.05, this._clock.getDelta());
    if (this._paused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (this.mode === 'planet') {
      if (this.player.dead) {
        this._deathTimer += dt;
        this.effects?.setMiningBeam(false);
        this.effects?.setToolVisible(false);
        if (this._deathTimer > 2.8) {
          this._respawnPlayer();
        }
      } else if (this.player.life <= 0 && !this.player.dead) {
        this._onPlayerDeath();
      } else {
      this.player.update(dt);
      this.world.updateAround(this.player.position.x, this.player.position.z, 3);
      this.effects?.setHighlight(this.player.targetBlock);
      this.effects?.setToolVisible(true);
      this._updateCrosshair(!!this.player.targetBlock, this._mining);

      // Skip mining blocks while analyzing in visor
      const mining =
        this._mining &&
        this.player.targetBlock &&
        (this.player.pointerLocked || document.pointerLockElement === this.canvas) &&
        !(this.visor?.active);
      if (mining) {
        const from = this.camera.position.clone();
        const to = this.player.getMineTargetPoint();
        this.effects.setMiningBeam(true, from, to);
        sound.beamHum();
        const result = this.player.tryMine(this.inventory);
        if (result) {
          this.effects.spawnBreak(result.x, result.y, result.z, result.id);
          if (result.item && result.qty) {
            const def = ITEMS[result.item];
            this.effects.spawnLootText(
              new THREE.Vector3(result.x + 0.5, result.y + 1.2, result.z + 0.5),
              `+${result.qty} ${def?.name || result.item}`,
              def?.color || '#3ecfb4'
            );
          }
        }
      } else {
        this.effects?.setMiningBeam(false);
      }
      }
    } else if (this.mode === 'ship_planet') {
      this.effects?.setHighlight(null);
      this.effects?.setMiningBeam(false);
      this.effects?.setToolVisible(false);
      this._updateCrosshair(false, false);
      this.ship.syncKeys(this.player.keys);
      this.ship.yaw = this.player.yaw;
      this.ship.pitch = this.player.pitch;
      const transition = this.ship.update(dt, 'ship_planet', this.camera);
      this.player.yaw = this.ship.yaw;
      this.player.pitch = this.ship.pitch;
      this.ship.updateCamera(this.camera, dt);
      this.player.position.copy(this.ship.position);
      if (this.world) this.world.updateAround(this.ship.position.x, this.ship.position.z, 3);
      if (transition === 'to_space') {
        this.enterSpace();
      } else if (this.ship.position.y > 118 && this.ship.launchThruster.fuel <= 0) {
        // Soft warn once
        if (!this._fuelWarn) {
          this._fuelWarn = true;
          this.log('发射燃料耗尽！返回星舰面板加注发射燃料。');
        }
      } else if (this.ship.launchThruster.fuel > 5) {
        this._fuelWarn = false;
      }
    } else if (this.mode === 'space') {
      this.effects?.setToolVisible(false);
      this._updateCrosshair(false, false);
      if (this.spaceGrace > 0) this.spaceGrace -= dt;
      this.ship.syncKeys(this.player.keys);
      this.ship.yaw = this.player.yaw;
      this.ship.pitch = this.player.pitch;
      this.ship.update(dt, 'space', this.camera);
      this.player.yaw = this.ship.yaw;
      this.player.pitch = this.ship.pitch;
      this.ship.updateCamera(this.camera, dt);
      const boosting =
        !!(this.player.keys['ShiftLeft'] || this.player.keys['ShiftRight']) && this.ship.speed > 40;
      this.space.update(dt, this.ship.position, boosting);

      if (this.spaceGrace <= 0) {
        const approach = this.space.findApproach(this.ship.position, 30);
        if (approach) {
          const dist = this.ship.position.distanceTo(approach.mesh.position) - approach.def.radius;
          if (dist < 18) {
            this.entry.start(approach);
          }
        }
      }
    } else if (this.mode === 'entering') {
      this.ship.syncKeys(this.player.keys);
      this.ship.update(dt, 'entering', this.camera);
      this.ship.updateCamera(this.camera, dt);
      this.entry.update(dt);
      this.space.update(dt);
    }

    // Beacon pulse + dish spin
    if (this.beacon && this.beacon.userData.lamp) {
      const pulse = 0.5 + Math.sin(performance.now() * 0.008) * 0.5;
      this.beacon.userData.lamp.material.emissiveIntensity = pulse;
    }
    if (this.beacon?.userData.dish) {
      this.beacon.userData.dish.rotation.y += dt * 1.2;
    }

    // Animate starship parts
    if (this.shipMesh) {
      const spd = this.mode === 'planet' ? 0 : this.ship.speed;
      animateStarship(this.shipMesh, dt, spd);
    }

    // Debris / crystal subtle idle
    if (this._propCrystals) {
      for (const c of this._propCrystals) {
        c.rotation.y += dt * 0.3;
      }
    }

    // Hazard warning
    if (this.player.hazard < 25) {
      this._hazardWarn += dt;
      if (this._hazardWarn > 3) {
        this._hazardWarn = 0;
        sound.hazardWarning();
      }
    }

    // Animate crash plume
    if (this._crashPlume && this.mode === 'planet') {
      for (const c of this._crashPlume.children) {
        c.position.y += Math.sin(performance.now() * 0.003 + c.position.x) * 0.01;
        c.rotation.y += dt * 0.5;
      }
    }
    if (this._crashPlume) this._crashPlume.visible = this.mode === 'planet' && this.currentPlanetId === 'awakening';

    this._updateMarkers(dt);
    this._updateInteractPrompt();
    this._updateCompass();
    this.storm?.update(dt);
    this.visor?.update(dt);
    this.waypoints?.update();
    this.effects?.update(dt, this.camera);
    this.fauna?.update(dt);
    this.dayNight?.update(dt);
    this.mission.update();
    this.ui.update(dt);
    this.net.update(dt);
    this._autosaveTimer = (this._autosaveTimer || 0) + dt;
    if (this._autosaveTimer > 8) {
      this._autosaveTimer = 0;
      this._saveProgress();
    }

    this.renderer.render(this.scene, this.camera);
  }

  _toastSens() {
    const el = document.getElementById('settings-toast');
    if (!el) return;
    const pct = Math.round((this.player.mouseSens / 0.002) * 100);
    el.textContent = `鼠标灵敏度 ${pct}%`;
    el.classList.remove('hidden');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.add('hidden'), 1200);
    try {
      localStorage.setItem('voxbound_sens', String(this.player.mouseSens));
    } catch { /* ignore */ }
  }

  _updateCrosshair(hasTarget, mining) {
    const ch = document.getElementById('crosshair');
    if (!ch) return;
    ch.classList.toggle('has-target', hasTarget);
    ch.classList.toggle('mining', mining);
  }

  _saveProgress() {
    try {
      const data = {
        flags: this.flags,
        inventory: this.inventory.items,
        mission: this.mission.stageIndex,
        ship: {
          pulse: this.ship.pulseEngine,
          launch: this.ship.launchThruster,
          hyperdrive: this.ship.hyperdrive,
        },
        planet: this.currentPlanetId,
        mode: this.mode === 'entering' ? 'space' : this.mode,
        pos: {
          x: this.mode === 'planet' ? this.player.position.x : this.ship.position.x,
          y: this.mode === 'planet' ? this.player.position.y : this.ship.position.y,
          z: this.mode === 'planet' ? this.player.position.z : this.ship.position.z,
          yaw: this.mode === 'planet' ? this.player.yaw : this.ship.yaw,
        },
        name: this.playerName,
        units: this.discovery?.units || 0,
        fauna: [...(this.fauna?.discovered || [])],
        flora: [...(this.fauna?.floraDiscovered || [])],
        minerals: [...(this.discovery?._minerals || [])],
        dayTime: this.dayNight?.time ?? 0.28,
      };
      localStorage.setItem('voxbound_save', JSON.stringify(data));
    } catch {
      /* ignore */
    }
  }

  _loadProgress() {
    try {
      const raw = localStorage.getItem('voxbound_save');
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (data.flags) Object.assign(this.flags, data.flags);
      if (data.inventory) this.inventory.items = data.inventory;
      if (typeof data.mission === 'number') this.mission.stageIndex = data.mission;
      if (data.ship?.pulse) Object.assign(this.ship.pulseEngine, data.ship.pulse);
      if (data.ship?.launch) Object.assign(this.ship.launchThruster, data.ship.launch);
      if (data.ship?.hyperdrive) Object.assign(this.ship.hyperdrive, data.ship.hyperdrive);
      if (this.ship.hyperdrive?.installed) this.flags.hyperdriveInstalled = true;
      if (typeof data.units === 'number' && this.discovery) this.discovery.units = data.units;
      if (data.fauna && this.fauna) this.fauna.discovered = new Set(data.fauna);
      if (data.flora && this.fauna) this.fauna.floraDiscovered = new Set(data.flora);
      if (data.minerals && this.discovery) this.discovery._minerals = new Set(data.minerals);
      if (typeof data.dayTime === 'number' && this.dayNight) this.dayNight.time = data.dayTime;
      this._pendingRestore = data;
      return data;
    } catch {
      return null;
    }
  }

  async _restoreWorldFromSave(data) {
    if (!data?.planet || data.planet === this.currentPlanetId) {
      if (data?.pos && data.mode === 'planet') {
        this.player.position.set(data.pos.x, data.pos.y, data.pos.z);
        this.player.yaw = data.pos.yaw || this.player.yaw;
        this.world.updateAround(data.pos.x, data.pos.z, 4);
      }
      return;
    }
    const def = PLANETS.find((p) => p.id === data.planet);
    if (!def) return;
    // Land without cinematic
    this.space.setActive(false);
    this.fauna?.clear();
    this._setupPlanetLights(def.atmosphere);
    if (this.world) this.world.dispose();
    this.world = new VoxelWorld(def, this.scene);
    this.world.updateAround(0, 0, 4);
    this.player.world = this.world;
    this.currentPlanetId = def.id;
    const home = def.id === 'awakening';
    this.beacon.visible = home;
    this.building.visible = home;
    if (this.debris) this.debris.visible = home;
    if (this._crashPlume) this._crashPlume.visible = home;
    if (this._propCrystals) for (const c of this._propCrystals) c.visible = home;

    const sy = this.world.surfaceY(0, 0);
    if (data.mode === 'space') {
      this.enterSpace();
      if (data.pos) this.ship.position.set(data.pos.x, data.pos.y, data.pos.z);
    } else if (data.mode === 'ship_planet') {
      this.ship.endEntry(sy);
      if (data.pos) this.ship.position.set(data.pos.x, data.pos.y, data.pos.z);
      this.shipMesh.position.copy(this.ship.position);
      this.mode = 'ship_planet';
    } else {
      this.ship.place(2, sy, 2);
      this.shipMesh.position.copy(this.ship.position);
      this.mode = 'planet';
      if (data.pos) {
        this.player.position.set(data.pos.x, data.pos.y, data.pos.z);
        this.player.yaw = data.pos.yaw || 0;
      } else {
        this.player.spawn(2, 2);
      }
      this.fauna.spawnAround(this.player.position.x, this.player.position.z, 8);
      this.fauna.spawnFloraProps(this.player.position.x, this.player.position.z, 6);
    }
    this.player.setHazardProfile(def.hazard || 'heat');
  }

  _onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  _delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }
}
