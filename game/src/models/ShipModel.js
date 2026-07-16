import * as THREE from 'three';

function makeMat(color, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    transparent: !!opts.transparent,
    opacity: opts.opacity ?? 1,
  });
  if (opts.emissive != null) {
    mat.emissive = new THREE.Color(opts.emissive);
    mat.emissiveIntensity = opts.emissiveIntensity ?? 0.6;
  }
  return mat;
}

function addBox(group, w, h, d, color, x, y, z, opts = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeMat(color, opts));
  mesh.position.set(x, y, z);
  if (opts.rx) mesh.rotation.x = opts.rx;
  if (opts.ry) mesh.rotation.y = opts.ry;
  if (opts.rz) mesh.rotation.z = opts.rz;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  if (opts.name) mesh.name = opts.name;
  group.add(mesh);
  return mesh;
}

/** Mirror a list of build calls on ±X */
function addPair(group, fn) {
  fn(1);
  fn(-1);
}

/**
 * High-detail blocky starship — NMS explorer × Minecraft voxels
 */
export function createStarship(options = {}) {
  const group = new THREE.Group();
  group.name = 'starship';

  const P = {
    hull: options.hull || 0x243040,
    hullHi: options.hullHi || 0x3a4a5c,
    accent: options.accent || 0x3ecfb4,
    accent2: options.accent2 || 0x2a9a88,
    engine: options.engine || 0xe8a832,
    glass: options.glass || 0x7ad4ea,
    dark: options.dark || 0x0e141c,
    trim: options.trim || 0xc8d0d8,
    warn: 0xe8a832,
  };

  // ── Hull spine (multi-step) ──
  addBox(group, 1.55, 0.9, 4.2, P.hull, 0, 0.5, 0.05);
  addBox(group, 1.25, 0.5, 3.0, P.hullHi, 0, 1.0, -0.15);
  addBox(group, 1.0, 0.35, 2.0, P.dark, 0, 1.28, 0.15);
  addBox(group, 0.7, 0.25, 1.2, P.hull, 0, 1.45, -0.4);

  // Dorsal spine ridge
  addBox(group, 0.18, 0.2, 2.4, P.accent, 0, 1.55, -0.2);
  addBox(group, 0.12, 0.35, 0.4, P.trim, 0, 1.7, -1.0);

  // ── Cockpit ──
  addBox(group, 0.9, 0.45, 1.2, P.glass, 0, 1.2, 1.2, {
    emissive: P.glass,
    emissiveIntensity: 0.18,
  });
  addBox(group, 0.6, 0.3, 0.65, 0xa8e8f8, 0, 1.35, 1.65, {
    emissive: 0x88d4e8,
    emissiveIntensity: 0.25,
  });
  addBox(group, 0.35, 0.15, 0.3, P.dark, 0, 1.5, 1.85);
  // Frame rails around canopy
  addPair(group, (s) => {
    addBox(group, 0.06, 0.5, 1.15, P.trim, s * 0.48, 1.2, 1.2);
  });

  // ── Nose / prow ──
  addBox(group, 1.05, 0.58, 1.05, P.accent, 0, 0.48, 2.25);
  addBox(group, 0.75, 0.42, 0.75, P.accent2, 0, 0.42, 2.8);
  addBox(group, 0.48, 0.28, 0.5, P.trim, 0, 0.38, 3.2);
  addBox(group, 0.28, 0.18, 0.3, P.dark, 0, 0.34, 3.5);
  addBox(group, 0.15, 0.1, 0.18, P.engine, 0, 0.32, 3.7, {
    emissive: P.engine,
    emissiveIntensity: 0.4,
  });

  // Sensor pods
  addPair(group, (s) => {
    addBox(group, 0.14, 0.14, 0.14, s > 0 ? 0xff6040 : 0x40ff90, s * 0.28, 0.62, 2.95, {
      emissive: s > 0 ? 0xff3020 : 0x20ff60,
      emissiveIntensity: 1.1,
    });
    addBox(group, 0.08, 0.2, 0.08, P.dark, s * 0.28, 0.75, 2.95);
  });

  // Chin intakes
  addPair(group, (s) => {
    addBox(group, 0.3, 0.2, 0.6, P.dark, s * 0.4, 0.18, 2.1);
  });

  // ── Side armor / heat sinks ──
  addPair(group, (s) => {
    addBox(group, 0.24, 0.6, 2.8, P.accent, s * 0.9, 0.52, 0.1);
    addBox(group, 0.14, 0.35, 2.0, P.trim, s * 1.05, 0.58, -0.05);
    addBox(group, 0.18, 0.18, 0.5, P.dark, s * 0.95, 0.85, 0.8);
    // Heat sink fins
    for (let i = 0; i < 4; i++) {
      addBox(group, 0.06, 0.28, 0.35, P.hullHi, s * 1.12, 0.4 + i * 0.02, -0.4 - i * 0.35);
    }
  });

  // ── Wings (layered sweep) ──
  addBox(group, 4.6, 0.14, 1.6, P.hull, 0, 0.28, -0.1);
  addBox(group, 4.0, 0.12, 1.1, P.hullHi, 0, 0.38, -0.3);
  addBox(group, 3.2, 0.08, 0.7, P.dark, 0, 0.46, -0.55);

  addPair(group, (s) => {
    // Outer wing panels
    addBox(group, 1.15, 0.24, 1.7, P.accent, s * 2.15, 0.36, -0.05);
    addBox(group, 0.9, 0.16, 1.1, P.accent2, s * 2.6, 0.42, -0.35);
    addBox(group, 1.3, 0.12, 0.95, P.dark, s * 2.7, 0.26, -0.9);
    addBox(group, 0.8, 0.1, 0.55, P.hullHi, s * 3.1, 0.32, -1.25);
    // Wing struts
    addBox(group, 0.1, 0.35, 0.1, P.trim, s * 1.6, 0.5, 0.2);
    addBox(group, 0.1, 0.35, 0.1, P.trim, s * 2.3, 0.5, -0.5);
    // Missile / hardpoint stubs
    addBox(group, 0.15, 0.12, 0.55, P.dark, s * 1.9, 0.12, 0.15);
    addBox(group, 0.12, 0.1, 0.4, P.warn, s * 2.4, 0.1, -0.2);
  });

  // Wing tip nav lights
  const tipL = addBox(group, 0.24, 0.24, 0.24, 0xff3030, 3.4, 0.4, -0.15, {
    emissive: 0xff1010,
    emissiveIntensity: 1.3,
    name: 'navL',
  });
  const tipR = addBox(group, 0.24, 0.24, 0.24, 0x30ff70, -3.4, 0.4, -0.15, {
    emissive: 0x10ff40,
    emissiveIntensity: 1.3,
    name: 'navR',
  });
  addBox(group, 0.12, 0.12, 0.3, P.trim, 3.4, 0.4, -0.4);
  addBox(group, 0.12, 0.12, 0.3, P.trim, -3.4, 0.4, -0.4);

  // ── Vertical stabilizers ──
  addPair(group, (s) => {
    addBox(group, 0.12, 1.25, 0.95, P.accent, s * 0.5, 1.3, -1.55);
    addBox(group, 0.08, 0.7, 0.55, P.dark, s * 0.5, 1.55, -1.85);
    addBox(group, 0.06, 0.4, 0.3, P.trim, s * 0.5, 1.85, -1.6);
  });
  // Center fin
  addBox(group, 0.1, 0.7, 0.55, P.dark, 0, 1.45, -1.95);
  addBox(group, 0.06, 0.35, 0.25, P.accent, 0, 1.75, -2.0);

  // Spinning antenna dish (animated)
  const antenna = new THREE.Group();
  antenna.name = 'antenna';
  addBox(antenna, 0.08, 0.5, 0.08, P.trim, 0, 0.25, 0);
  addBox(antenna, 0.55, 0.06, 0.55, P.hullHi, 0, 0.5, 0);
  addBox(antenna, 0.2, 0.08, 0.2, P.accent, 0, 0.58, 0, {
    emissive: P.accent,
    emissiveIntensity: 0.5,
  });
  antenna.position.set(0.35, 1.55, -0.3);
  group.add(antenna);

  // ── Engine cluster ──
  addPair(group, (s) => {
    addBox(group, 0.6, 0.6, 1.25, P.dark, s * 0.9, 0.38, -2.15);
    addBox(group, 0.45, 0.45, 0.5, P.hull, s * 0.9, 0.38, -1.7);
    // Cooling rings
    addBox(group, 0.65, 0.08, 0.08, P.trim, s * 0.9, 0.55, -2.4);
    addBox(group, 0.65, 0.08, 0.08, P.trim, s * 0.9, 0.2, -2.4);
  });
  addBox(group, 0.45, 0.45, 0.9, P.hull, 0, 0.35, -2.2);
  addBox(group, 0.35, 0.35, 0.55, P.dark, 0.45, 0.6, -1.75);
  addBox(group, 0.35, 0.35, 0.55, P.dark, -0.45, 0.6, -1.75);

  const glowL = addBox(group, 0.42, 0.42, 0.24, P.engine, 0.9, 0.38, -2.85, {
    emissive: P.engine,
    emissiveIntensity: 1.2,
    name: 'glowL',
  });
  const glowR = addBox(group, 0.42, 0.42, 0.24, P.engine, -0.9, 0.38, -2.85, {
    emissive: P.engine,
    emissiveIntensity: 1.2,
    name: 'glowR',
  });
  const glowC = addBox(group, 0.3, 0.3, 0.18, P.engine, 0, 0.35, -2.7, {
    emissive: P.engine,
    emissiveIntensity: 1.0,
    name: 'glowC',
  });

  // Exhaust plumes (semi-transparent, animated scale)
  const exhaustGroup = new THREE.Group();
  exhaustGroup.name = 'exhaust';
  addPair(exhaustGroup, (s) => {
    addBox(exhaustGroup, 0.28, 0.28, 0.6, 0xffb040, s * 0.9, 0.38, -3.2, {
      emissive: 0xff8020,
      emissiveIntensity: 0.7,
      transparent: true,
      opacity: 0.65,
    });
    addBox(exhaustGroup, 0.18, 0.18, 0.45, 0xffe080, s * 0.9, 0.38, -3.55, {
      emissive: 0xffc040,
      emissiveIntensity: 0.5,
      transparent: true,
      opacity: 0.4,
    });
  });
  addBox(exhaustGroup, 0.2, 0.2, 0.4, 0xffb040, 0, 0.35, -3.05, {
    emissive: 0xff9020,
    emissiveIntensity: 0.5,
    transparent: true,
    opacity: 0.5,
  });
  group.add(exhaustGroup);

  // ── Landing gear ──
  const gear = new THREE.Group();
  gear.name = 'landingGear';
  addPair(gear, (s) => {
    addBox(gear, 0.16, 0.55, 0.16, P.dark, s * 0.7, -0.1, 0.95);
    addBox(gear, 0.4, 0.1, 0.4, P.trim, s * 0.7, -0.35, 0.95);
    addBox(gear, 0.12, 0.12, 0.12, P.accent, s * 0.7, -0.28, 1.15);
  });
  addBox(gear, 0.16, 0.45, 0.16, P.dark, 0, -0.05, -1.25);
  addBox(gear, 0.35, 0.08, 0.35, P.trim, 0, -0.25, -1.25);
  group.add(gear);

  // Underside bay + cargo hatch
  addBox(group, 0.9, 0.22, 1.4, P.dark, 0, 0.05, 0.25);
  addBox(group, 0.6, 0.08, 0.8, P.hullHi, 0, -0.02, 0.3);
  addPair(group, (s) => {
    addBox(group, 0.15, 0.1, 0.15, P.accent, s * 0.35, -0.05, 0.5);
  });

  // Hull panel lines / rivets
  for (let i = 0; i < 5; i++) {
    addBox(group, 1.4, 0.03, 0.04, P.trim, 0, 0.7, -1.2 + i * 0.55);
  }

  if (options.damaged) {
    addBox(group, 0.6, 0.45, 0.65, 0x4a1818, 0.75, 0.85, 0.35);
    addBox(group, 0.45, 0.35, 0.55, 0x3a1212, -0.65, 0.32, -0.55);
    addBox(group, 0.35, 0.28, 0.4, 0x2a0e0e, 0.4, 0.22, 1.45);
    addBox(group, 0.25, 0.2, 0.3, 0x1a0808, -0.25, 0.95, 0.55);
    addBox(group, 0.4, 0.15, 0.5, 0x3a2020, 1.2, 0.35, -0.8, { rz: 0.4 });
    // Broken wing tip
    addBox(group, 0.5, 0.2, 0.4, 0x2a1515, 2.8, 0.2, -0.6, { ry: 0.3, rz: -0.2 });
    const smoke = new THREE.PointLight(0xff5020, 1.3, 16);
    smoke.position.set(0.6, 1.6, 0.25);
    group.add(smoke);
    group.userData.damageLight = smoke;
    // Hide one exhaust when damaged
    exhaustGroup.children[0].visible = false;
  }

  const engineLight = new THREE.PointLight(P.engine, 0, 18);
  engineLight.position.set(0, 0.38, -3.1);
  group.add(engineLight);

  group.userData.engineLight = engineLight;
  group.userData.glows = [glowL, glowR, glowC];
  group.userData.navLights = [tipL, tipR];
  group.userData.antenna = antenna;
  group.userData.exhaust = exhaustGroup;
  group.userData.gear = gear;

  group.scale.setScalar(options.scale || 1.4);
  return group;
}

/** Per-frame ship part animation */
export function animateStarship(ship, dt, speed = 0) {
  if (!ship?.userData) return;
  const t = performance.now() * 0.001;
  if (ship.userData.antenna) {
    ship.userData.antenna.rotation.y += dt * 1.8;
  }
  if (ship.userData.exhaust) {
    const pulse = 0.85 + Math.sin(t * 12) * 0.15 + Math.min(0.4, Math.abs(speed) / 200);
    ship.userData.exhaust.scale.z = pulse;
    ship.userData.exhaust.visible = Math.abs(speed) > 1 || ship.userData.forceExhaust;
  }
  const navs = ship.userData.navLights || [];
  const blink = Math.sin(t * 4) > 0 ? 1.3 : 0.25;
  for (const n of navs) {
    if (n.material) n.material.emissiveIntensity = blink;
  }
}

/**
 * Distant planet with continents, atmosphere, biome details
 */
export function createPlanetMesh(planet) {
  const group = new THREE.Group();
  group.name = `planet_${planet.id}`;

  const geo = new THREE.IcosahedronGeometry(planet.radius, 3);
  const pos = geo.attributes.position;
  const colors = [];
  const colorA = new THREE.Color(planet.color);
  const colorB = new THREE.Color(planet.color).offsetHSL(0.03, -0.12, 0.15);
  const colorC = new THREE.Color(planet.atmosphere).lerp(colorA, 0.35);
  const colorD = new THREE.Color(planet.color).offsetHSL(-0.05, 0.1, -0.1);

  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const len = v.length();
    const noise =
      Math.sin(v.x * 0.14) * Math.cos(v.z * 0.11) * Math.sin(v.y * 0.09) +
      Math.sin(v.x * 0.31 + 2) * Math.cos(v.z * 0.28) * 0.4;
    const q = Math.round((len + noise * 3.2) * 3) / 3;
    v.setLength(q);
    pos.setXYZ(i, v.x, v.y, v.z);

    const n = Math.sin(v.x * 0.07 + 1) * Math.cos(v.y * 0.09) * Math.sin(v.z * 0.08);
    const c = n > 0.3 ? colorB : n > 0.05 ? colorA : n < -0.25 ? colorD : colorC;
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  group.add(
    new THREE.Mesh(
      geo,
      new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
    )
  );

  // Dual atmosphere shells
  group.add(
    new THREE.Mesh(
      new THREE.IcosahedronGeometry(planet.radius * 1.1, 2),
      new THREE.MeshBasicMaterial({
        color: planet.atmosphere,
        transparent: true,
        opacity: 0.22,
        side: THREE.BackSide,
      })
    )
  );
  group.add(
    new THREE.Mesh(
      new THREE.IcosahedronGeometry(planet.radius * 1.2, 1),
      new THREE.MeshBasicMaterial({
        color: planet.atmosphere,
        transparent: true,
        opacity: 0.07,
        side: THREE.BackSide,
      })
    )
  );

  // City lights for night side hint (emissive dots)
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2;
    const b = (Math.random() - 0.5) * Math.PI * 0.8;
    const r = planet.radius * 1.01;
    const light = addBox(
      group,
      1.5 + Math.random() * 2,
      0.8,
      1.5 + Math.random() * 2,
      0xe8c060,
      Math.cos(a) * Math.cos(b) * r,
      Math.sin(b) * r,
      Math.sin(a) * Math.cos(b) * r,
      { emissive: 0xe8a832, emissiveIntensity: 0.6 }
    );
    light.lookAt(0, 0, 0);
  }

  if (planet.biome === 'lush') {
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      const r = planet.radius * 1.06;
      const cloud = new THREE.Mesh(
        new THREE.BoxGeometry(10 + Math.random() * 14, 2.5, 7 + Math.random() * 10),
        new THREE.MeshBasicMaterial({ color: 0xe8f0f8, transparent: true, opacity: 0.32 })
      );
      cloud.position.set(
        Math.cos(a) * Math.cos(b) * r,
        Math.sin(b) * r,
        Math.sin(a) * Math.cos(b) * r
      );
      cloud.lookAt(0, 0, 0);
      group.add(cloud);
    }
  }

  if (planet.id === 'frost_shard') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(planet.radius * 1.22, planet.radius * 1.75, 64),
      new THREE.MeshBasicMaterial({
        color: 0xa0d0e8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
      })
    );
    ring.rotation.x = Math.PI / 2.25;
    group.add(ring);
    for (let i = 0; i < 28; i++) {
      const ang = (i / 28) * Math.PI * 2;
      const rr = planet.radius * (1.32 + (i % 4) * 0.08);
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(2.5 + (i % 3), 0.6, 3 + (i % 2)),
        new THREE.MeshBasicMaterial({ color: 0xb8d8e8, transparent: true, opacity: 0.55 })
      );
      chunk.position.set(Math.cos(ang) * rr, Math.sin(ang * 2) * 1.5, Math.sin(ang) * rr);
      group.add(chunk);
    }
  }

  if (planet.biome === 'desert') {
    const dust = new THREE.Mesh(
      new THREE.TorusGeometry(planet.radius * 0.92, 4, 4, 28),
      new THREE.MeshBasicMaterial({ color: 0xd4a060, transparent: true, opacity: 0.12 })
    );
    dust.rotation.x = Math.PI / 2.6;
    group.add(dust);
  }

  return group;
}

/**
 * Abandoned outpost — detailed voxel shelter
 */
export function createAbandonedBuilding() {
  const g = new THREE.Group();
  const add = (w, h, d, c, x, y, z, opts = {}) => addBox(g, w, h, d, c, x, y, z, opts);

  // Platform
  add(8, 0.4, 8, 0x3a3e44, 0, 0.1, 0);
  add(7, 0.3, 7, 0x5a6068, 0, 0.4, 0);
  add(6.4, 0.15, 6.4, 0x4a5058, 0, 0.55, 0);

  // Walls
  add(6.6, 3.4, 0.45, 0x6a7078, 0, 2.15, -3.1);
  add(0.45, 3.4, 6.6, 0x6a7078, -3.1, 2.15, 0);
  add(0.45, 3.4, 6.6, 0x6a7078, 3.1, 2.15, 0);
  add(2.1, 3.4, 0.45, 0x6a7078, -2.15, 2.15, 3.1);
  add(2.1, 3.4, 0.45, 0x6a7078, 2.15, 2.15, 3.1);
  add(2.4, 1.1, 0.45, 0x6a7078, 0, 3.7, 3.1);

  // Window slits with glow
  add(1.2, 0.9, 0.15, 0x3ecfb4, -1.5, 2.4, -3.25, {
    emissive: 0x3ecfb4,
    emissiveIntensity: 0.35,
  });
  add(1.2, 0.9, 0.15, 0x3ecfb4, 1.5, 2.4, -3.25, {
    emissive: 0x3ecfb4,
    emissiveIntensity: 0.35,
  });

  // Corner pillars + caps
  for (const [x, z] of [
    [3.0, 3.0],
    [-3.0, 3.0],
    [3.0, -3.0],
    [-3.0, -3.0],
  ]) {
    add(0.55, 4.0, 0.55, 0x4a5058, x, 2.2, z);
    add(0.7, 0.25, 0.7, 0x3a4048, x, 4.3, z);
  }

  // Roof
  add(7.4, 0.3, 7.4, 0x2a3038, 0, 3.95, 0);
  add(5.8, 0.25, 5.8, 0x3a4048, 0, 4.25, 0);
  add(3.5, 0.2, 3.5, 0x2a3540, 0, 4.5, 0);
  // Solar panels on roof
  add(2.2, 0.08, 1.2, 0x1a4060, -1.5, 4.65, -1.0, {
    emissive: 0x204080,
    emissiveIntensity: 0.2,
  });
  add(2.2, 0.08, 1.2, 0x1a4060, 1.5, 4.65, -1.0, {
    emissive: 0x204080,
    emissiveIntensity: 0.2,
  });

  // Interior terminal desk
  add(1.4, 1.5, 1.0, 0x2a3540, 0, 1.25, -1.9);
  add(1.0, 0.75, 0.12, 0x3ecfb4, 0, 1.65, -1.35, {
    emissive: 0x3ecfb4,
    emissiveIntensity: 0.85,
  });
  add(0.4, 0.15, 0.4, 0xe8a832, 0.5, 1.9, -1.7, {
    emissive: 0xe8a832,
    emissiveIntensity: 0.4,
  });
  const termLight = new THREE.PointLight(0x3ecfb4, 1.1, 14);
  termLight.position.set(0, 2.4, -1.5);
  g.add(termLight);

  // Storage crates
  add(0.9, 0.7, 0.7, 0x5a4838, -2.0, 0.9, 1.5);
  add(0.7, 0.55, 0.7, 0x4a3830, -2.0, 1.5, 1.5);
  add(0.8, 0.6, 0.8, 0x3a5058, 2.2, 0.85, 1.2);

  // Beacon tower
  add(0.65, 6.0, 0.65, 0xe8a832, 4.0, 3.1, 4.0);
  add(1.0, 0.45, 1.0, 0xffc040, 4.0, 6.2, 4.0, {
    emissive: 0xe8a832,
    emissiveIntensity: 0.9,
  });
  add(0.3, 0.8, 0.3, 0xffe080, 4.0, 6.8, 4.0, {
    emissive: 0xffc040,
    emissiveIntensity: 0.5,
  });
  const beaconLight = new THREE.PointLight(0xe8a832, 1.4, 24);
  beaconLight.position.set(4.0, 6.5, 4.0);
  g.add(beaconLight);

  // Stairs to entrance
  add(1.8, 0.25, 0.6, 0x5a6068, 0, 0.35, 3.6);
  add(1.8, 0.25, 0.6, 0x5a6068, 0, 0.55, 4.1);

  // Debris
  add(0.9, 0.45, 0.7, 0x5a4040, 2.2, 0.55, 4.5, { ry: 0.4 });
  add(0.55, 0.55, 0.55, 0x4a5058, -2.6, 0.6, 4.2);
  add(1.1, 0.2, 0.4, 0x3a4048, -1.5, 0.45, 4.8, { rz: 0.3 });

  return g;
}

/**
 * Distress beacon with rotating dish
 */
export function createDistressBeacon() {
  const g = new THREE.Group();
  addBox(g, 1.5, 0.35, 1.5, 0x3a4048, 0, 0.18, 0);
  addBox(g, 1.1, 0.22, 1.1, 0x2a3038, 0, 0.42, 0);
  addBox(g, 0.85, 0.12, 0.85, 0x4a5058, 0, 0.55, 0);
  addBox(g, 0.42, 2.6, 0.42, 0x1a2028, 0, 1.65, 0);

  // Cross braces
  addBox(g, 0.08, 1.2, 0.08, 0x5a6068, 0.25, 1.4, 0.25, { rz: 0.3 });
  addBox(g, 0.08, 1.2, 0.08, 0x5a6068, -0.25, 1.4, -0.25, { rz: -0.3 });

  const lamp = addBox(g, 0.6, 0.6, 0.6, 0xff3030, 0, 3.1, 0, {
    emissive: 0xff1010,
    emissiveIntensity: 1.3,
  });
  addBox(g, 0.28, 0.9, 0.28, 0xff6060, 0, 3.7, 0, {
    emissive: 0xff2020,
    emissiveIntensity: 0.7,
  });

  // Rotating dish
  const dish = new THREE.Group();
  dish.name = 'beaconDish';
  addBox(dish, 1.0, 0.08, 1.0, 0x5a6068, 0, 0, 0);
  addBox(dish, 0.15, 0.4, 0.15, 0x4a5058, 0, -0.2, 0);
  addBox(dish, 0.2, 0.2, 0.2, 0x3ecfb4, 0, 0.12, 0, {
    emissive: 0x3ecfb4,
    emissiveIntensity: 0.5,
  });
  dish.position.set(0.55, 2.1, 0);
  g.add(dish);

  const light = new THREE.PointLight(0xff3030, 1.6, 22);
  light.position.y = 3.2;
  g.add(light);
  g.userData.lamp = lamp;
  g.userData.dish = dish;
  return g;
}

/**
 * Crash debris field around ship
 */
export function createCrashDebris() {
  const g = new THREE.Group();
  g.name = 'crashDebris';
  const pieces = [
    [1.2, 0.3, 0.8, 0x3a4048, 3.5, 0.2, 2.0, 0.4],
    [0.8, 0.4, 0.6, 0x2a3540, -2.8, 0.25, 1.5, -0.5],
    [0.5, 0.5, 0.5, 0x4a2020, 2.0, 0.3, -2.5, 0.8],
    [1.0, 0.2, 0.4, 0x3ecfb4, -3.5, 0.15, -1.0, 0.2],
    [0.6, 0.25, 0.9, 0x243040, 4.2, 0.2, -0.5, -0.3],
    [0.35, 0.35, 0.7, 0xe8a832, -1.5, 0.25, 3.2, 0.6],
    [0.9, 0.15, 0.5, 0x1a2028, 1.0, 0.12, 3.8, 0.1],
    [0.4, 0.6, 0.4, 0x5a3030, -4.0, 0.35, 0.5, -0.2],
    [0.7, 0.2, 0.7, 0x4a5564, 0.5, 0.15, -3.5, 0.9],
    [0.3, 0.3, 0.3, 0xff6040, 3.0, 0.4, 1.0, 0, true],
  ];
  for (const [w, h, d, c, x, y, z, ry, emit] of pieces) {
    addBox(g, w, h, d, c, x, y, z, {
      ry,
      ...(emit ? { emissive: 0xff3020, emissiveIntensity: 0.6 } : {}),
    });
  }
  // Scattered small cubes
  for (let i = 0; i < 14; i++) {
    const s = 0.15 + Math.random() * 0.25;
    addBox(
      g,
      s,
      s,
      s,
      Math.random() > 0.5 ? 0x3a4048 : 0x2a3038,
      (Math.random() - 0.5) * 10,
      s * 0.5,
      (Math.random() - 0.5) * 8,
      { ry: Math.random() * 2 }
    );
  }
  return g;
}

/**
 * Decorative crystal formation
 */
export function createCrystalCluster(color = 0x4a9eff) {
  const g = new THREE.Group();
  const shards = [
    [0.35, 1.4, 0.35, 0, 0.7, 0],
    [0.25, 1.0, 0.25, 0.3, 0.5, 0.2],
    [0.2, 0.8, 0.2, -0.25, 0.4, 0.15],
    [0.15, 0.6, 0.15, 0.15, 0.3, -0.25],
    [0.18, 0.9, 0.18, -0.35, 0.45, -0.1],
  ];
  for (const [w, h, d, x, y, z] of shards) {
    addBox(g, w, h, d, color, x, y, z, {
      emissive: color,
      emissiveIntensity: 0.35,
      ry: Math.random() * 0.5,
    });
  }
  addBox(g, 0.8, 0.2, 0.8, 0x3a4050, 0, 0.1, 0);
  return g;
}

/**
 * Exosuit traveller avatar
 */
export function createPlayerAvatar(color = 0x3ecfb4) {
  const g = new THREE.Group();
  const suit = color;
  const dark = 0x1a2430;
  const visor = 0x7ad4ea;
  const trim = 0xc8d0d8;

  // Helmet
  addBox(g, 0.5, 0.5, 0.5, suit, 0, 1.6, 0);
  addBox(g, 0.44, 0.2, 0.16, visor, 0, 1.6, 0.24, {
    emissive: visor,
    emissiveIntensity: 0.4,
  });
  addBox(g, 0.12, 0.12, 0.08, trim, 0.2, 1.75, 0.15);
  // Torso
  addBox(g, 0.6, 0.75, 0.34, dark, 0, 0.95, 0);
  addBox(g, 0.52, 0.3, 0.38, suit, 0, 1.15, 0.02);
  addBox(g, 0.2, 0.15, 0.1, 0xe8a832, 0, 1.05, 0.2, {
    emissive: 0xe8a832,
    emissiveIntensity: 0.3,
  });
  // Legs
  addBox(g, 0.22, 0.58, 0.24, suit, -0.15, 0.32, 0);
  addBox(g, 0.22, 0.58, 0.24, suit, 0.15, 0.32, 0);
  addBox(g, 0.24, 0.12, 0.28, dark, -0.15, 0.05, 0.02);
  addBox(g, 0.24, 0.12, 0.28, dark, 0.15, 0.05, 0.02);
  // Arms
  addBox(g, 0.17, 0.58, 0.2, suit, -0.42, 1.0, 0);
  addBox(g, 0.17, 0.58, 0.2, suit, 0.42, 1.0, 0);
  addBox(g, 0.14, 0.14, 0.14, dark, -0.42, 0.7, 0.05);
  addBox(g, 0.14, 0.14, 0.14, dark, 0.42, 0.7, 0.05);
  // Jetpack
  addBox(g, 0.4, 0.55, 0.2, dark, 0, 1.08, -0.24);
  addBox(g, 0.14, 0.14, 0.12, 0xe8a832, -0.12, 0.88, -0.32, {
    emissive: 0xe8a832,
    emissiveIntensity: 0.55,
  });
  addBox(g, 0.14, 0.14, 0.12, 0xe8a832, 0.12, 0.88, -0.32, {
    emissive: 0xe8a832,
    emissiveIntensity: 0.55,
  });
  addBox(g, 0.3, 0.2, 0.12, suit, 0, 1.25, -0.28);
  return g;
}

/**
 * First-person multi-tool
 */
export function createMultiTool() {
  const g = new THREE.Group();
  // Body
  addBox(g, 0.11, 0.13, 0.48, 0x2a3544, 0, 0, 0);
  addBox(g, 0.09, 0.09, 0.22, 0x1a2430, 0, -0.03, 0.1);
  // Grip
  addBox(g, 0.08, 0.16, 0.1, 0x3a4555, 0, -0.1, 0.15, { rx: 0.3 });
  // Barrel / emitter
  addBox(g, 0.08, 0.08, 0.16, 0x3ecfb4, 0, 0.02, -0.3, {
    emissive: 0x3ecfb4,
    emissiveIntensity: 0.55,
  });
  addBox(g, 0.05, 0.05, 0.1, 0xa0f0e0, 0, 0.02, -0.4, {
    emissive: 0x80e8d0,
    emissiveIntensity: 0.7,
  });
  // Side module
  addBox(g, 0.06, 0.06, 0.12, 0xe8a832, 0.08, 0.05, -0.08, {
    emissive: 0xe8a832,
    emissiveIntensity: 0.45,
  });
  // Scope / sensor
  addBox(g, 0.14, 0.06, 0.12, 0x4a5564, 0, 0.08, 0.05);
  addBox(g, 0.04, 0.04, 0.04, 0xff6040, 0.05, 0.1, 0.08, {
    emissive: 0xff3020,
    emissiveIntensity: 0.5,
  });
  // Cable detail
  addBox(g, 0.03, 0.03, 0.2, 0x1a2028, -0.06, -0.02, -0.05);
  return g;
}
