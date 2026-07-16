import * as THREE from 'three';

function makeMat(color, opts = {}) {
  const mat = new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    ...opts,
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
  group.add(mesh);
  return mesh;
}

/**
 * Premium blocky starship — NMS explorer silhouette in Minecraft voxels
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
  };

  // === Core fuselage (stepped) ===
  addBox(group, 1.5, 0.85, 4.0, P.hull, 0, 0.5, 0.1);
  addBox(group, 1.2, 0.55, 2.8, P.hullHi, 0, 0.95, -0.1);
  addBox(group, 0.95, 0.4, 1.8, P.dark, 0, 1.2, 0.2);

  // Cockpit canopy — layered glass
  addBox(group, 0.85, 0.42, 1.1, P.glass, 0, 1.15, 1.15, {
    emissive: P.glass,
    emissiveIntensity: 0.15,
  });
  addBox(group, 0.55, 0.28, 0.55, 0xa8e8f8, 0, 1.28, 1.55, {
    emissive: 0x88d4e8,
    emissiveIntensity: 0.2,
  });

  // Nose — aggressive stepped prow
  addBox(group, 1.0, 0.55, 1.0, P.accent, 0, 0.45, 2.2);
  addBox(group, 0.7, 0.4, 0.7, P.accent2, 0, 0.4, 2.75);
  addBox(group, 0.4, 0.25, 0.45, P.trim, 0, 0.35, 3.15);
  addBox(group, 0.22, 0.15, 0.25, P.dark, 0, 0.32, 3.4);

  // Sensor array on nose
  addBox(group, 0.12, 0.12, 0.12, 0xff6040, 0.25, 0.55, 2.9, {
    emissive: 0xff3020,
    emissiveIntensity: 1,
  });
  addBox(group, 0.12, 0.12, 0.12, 0x40ff90, -0.25, 0.55, 2.9, {
    emissive: 0x20ff60,
    emissiveIntensity: 1,
  });

  // Side armor / intake rails
  addBox(group, 0.22, 0.55, 2.6, P.accent, 0.85, 0.5, 0.15);
  addBox(group, 0.22, 0.55, 2.6, P.accent, -0.85, 0.5, 0.15);
  addBox(group, 0.12, 0.3, 1.8, P.trim, 1.0, 0.55, 0.0);
  addBox(group, 0.12, 0.3, 1.8, P.trim, -1.0, 0.55, 0.0);

  // Main wings — sweeping block layers
  addBox(group, 4.2, 0.16, 1.5, P.hull, 0, 0.3, -0.15);
  addBox(group, 3.6, 0.12, 1.0, P.hullHi, 0, 0.4, -0.35);
  addBox(group, 1.0, 0.22, 1.6, P.accent, 2.0, 0.36, -0.1);
  addBox(group, 1.0, 0.22, 1.6, P.accent, -2.0, 0.36, -0.1);
  addBox(group, 1.2, 0.14, 0.9, P.dark, 2.5, 0.28, -0.85);
  addBox(group, 1.2, 0.14, 0.9, P.dark, -2.5, 0.28, -0.85);
  addBox(group, 0.7, 0.1, 0.5, P.accent2, 2.9, 0.32, -1.2);
  addBox(group, 0.7, 0.1, 0.5, P.accent2, -2.9, 0.32, -1.2);

  // Wing tip nav lights
  const tipL = addBox(group, 0.22, 0.22, 0.22, 0xff3030, 3.15, 0.4, -0.2, {
    emissive: 0xff1010,
    emissiveIntensity: 1.2,
  });
  const tipR = addBox(group, 0.22, 0.22, 0.22, 0x30ff70, -3.15, 0.4, -0.2, {
    emissive: 0x10ff40,
    emissiveIntensity: 1.2,
  });

  // Twin vertical fins
  addBox(group, 0.14, 1.1, 0.85, P.accent, 0.45, 1.2, -1.5);
  addBox(group, 0.14, 1.1, 0.85, P.accent, -0.45, 1.2, -1.5);
  addBox(group, 0.1, 0.6, 0.5, P.dark, 0, 1.35, -1.85);
  addBox(group, 0.08, 0.35, 0.3, P.trim, 0.45, 1.7, -1.55);
  addBox(group, 0.08, 0.35, 0.3, P.trim, -0.45, 1.7, -1.55);

  // Engine cluster
  addBox(group, 0.55, 0.55, 1.15, P.dark, 0.85, 0.35, -2.05);
  addBox(group, 0.55, 0.55, 1.15, P.dark, -0.85, 0.35, -2.05);
  addBox(group, 0.4, 0.4, 0.8, P.hull, 0, 0.32, -2.1);
  addBox(group, 0.3, 0.3, 0.5, P.dark, 0.4, 0.55, -1.7);
  addBox(group, 0.3, 0.3, 0.5, P.dark, -0.4, 0.55, -1.7);

  const glowL = addBox(group, 0.4, 0.4, 0.22, P.engine, 0.85, 0.35, -2.7, {
    emissive: P.engine,
    emissiveIntensity: 1.1,
  });
  const glowR = addBox(group, 0.4, 0.4, 0.22, P.engine, -0.85, 0.35, -2.7, {
    emissive: P.engine,
    emissiveIntensity: 1.1,
  });
  const glowC = addBox(group, 0.28, 0.28, 0.16, P.engine, 0, 0.32, -2.55, {
    emissive: P.engine,
    emissiveIntensity: 0.9,
  });

  // Exhaust trail stubs
  addBox(group, 0.25, 0.25, 0.35, 0xffc060, 0.85, 0.35, -2.95, {
    emissive: 0xffa020,
    emissiveIntensity: 0.5,
  });
  addBox(group, 0.25, 0.25, 0.35, 0xffc060, -0.85, 0.35, -2.95, {
    emissive: 0xffa020,
    emissiveIntensity: 0.5,
  });

  // Landing gear
  addBox(group, 0.18, 0.5, 0.18, P.dark, 0.65, -0.05, 0.9);
  addBox(group, 0.18, 0.5, 0.18, P.dark, -0.65, -0.05, 0.9);
  addBox(group, 0.18, 0.4, 0.18, P.dark, 0, 0.0, -1.2);
  addBox(group, 0.35, 0.1, 0.35, P.trim, 0.65, -0.28, 0.9);
  addBox(group, 0.35, 0.1, 0.35, P.trim, -0.65, -0.28, 0.9);
  addBox(group, 0.3, 0.08, 0.3, P.trim, 0, -0.18, -1.2);

  // Underside cargo bay detail
  addBox(group, 0.8, 0.2, 1.2, P.dark, 0, 0.08, 0.3);

  if (options.damaged) {
    addBox(group, 0.55, 0.4, 0.6, 0x4a1818, 0.7, 0.8, 0.3);
    addBox(group, 0.4, 0.3, 0.5, 0x3a1212, -0.6, 0.3, -0.6);
    addBox(group, 0.3, 0.25, 0.35, 0x2a0e0e, 0.35, 0.2, 1.4);
    addBox(group, 0.2, 0.15, 0.25, 0x1a0808, -0.2, 0.9, 0.5);
    // Sparks / emergency light
    const smoke = new THREE.PointLight(0xff5020, 1.2, 14);
    smoke.position.set(0.55, 1.5, 0.2);
    group.add(smoke);
    group.userData.damageLight = smoke;
  }

  const engineLight = new THREE.PointLight(P.engine, 0, 16);
  engineLight.position.set(0, 0.35, -2.9);
  group.add(engineLight);
  group.userData.engineLight = engineLight;
  group.userData.glows = [glowL, glowR, glowC];
  group.userData.navLights = [tipL, tipR];

  group.scale.setScalar(options.scale || 1.35);
  return group;
}

/**
 * Distant planet with voxel continents + atmosphere
 */
export function createPlanetMesh(planet) {
  const group = new THREE.Group();
  group.name = `planet_${planet.id}`;

  const geo = new THREE.IcosahedronGeometry(planet.radius, 3);
  const pos = geo.attributes.position;
  const colors = [];
  const colorA = new THREE.Color(planet.color);
  const colorB = new THREE.Color(planet.color).offsetHSL(0.02, -0.1, 0.12);
  const colorC = new THREE.Color(planet.atmosphere).lerp(colorA, 0.4);

  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const len = v.length();
    // Faceted / quantized radius
    const noise = Math.sin(v.x * 0.15) * Math.cos(v.z * 0.12) * Math.sin(v.y * 0.1);
    const q = Math.round((len + noise * 2.5) * 3) / 3;
    v.setLength(q);
    pos.setXYZ(i, v.x, v.y, v.z);

    // Continent-like color patches
    const n = Math.sin(v.x * 0.08 + 1) * Math.cos(v.y * 0.1) * Math.sin(v.z * 0.09);
    const c = n > 0.25 ? colorB : n < -0.2 ? colorC : colorA;
    colors.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mesh = new THREE.Mesh(
    geo,
    new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
    })
  );
  group.add(mesh);

  // Atmosphere glow shells
  const atmo = new THREE.Mesh(
    new THREE.IcosahedronGeometry(planet.radius * 1.1, 2),
    new THREE.MeshBasicMaterial({
      color: planet.atmosphere,
      transparent: true,
      opacity: 0.2,
      side: THREE.BackSide,
    })
  );
  group.add(atmo);

  const atmo2 = new THREE.Mesh(
    new THREE.IcosahedronGeometry(planet.radius * 1.18, 1),
    new THREE.MeshBasicMaterial({
      color: planet.atmosphere,
      transparent: true,
      opacity: 0.08,
      side: THREE.BackSide,
    })
  );
  group.add(atmo2);

  // Blocky cloud blobs for lush planets
  if (planet.biome === 'lush') {
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * Math.PI * 2;
      const b = (Math.random() - 0.5) * Math.PI;
      const r = planet.radius * 1.05;
      const cloud = new THREE.Mesh(
        new THREE.BoxGeometry(8 + Math.random() * 10, 2, 6 + Math.random() * 8),
        new THREE.MeshBasicMaterial({ color: 0xe8f0f8, transparent: true, opacity: 0.35 })
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
      new THREE.RingGeometry(planet.radius * 1.25, planet.radius * 1.7, 48),
      new THREE.MeshBasicMaterial({
        color: 0xa0d0e8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.45,
      })
    );
    ring.rotation.x = Math.PI / 2.3;
    group.add(ring);
    // Blocky ring chunks
    for (let i = 0; i < 20; i++) {
      const ang = (i / 20) * Math.PI * 2;
      const rr = planet.radius * (1.35 + (i % 3) * 0.08);
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.8, 4),
        new THREE.MeshBasicMaterial({ color: 0xb8d8e8, transparent: true, opacity: 0.5 })
      );
      chunk.position.set(Math.cos(ang) * rr, Math.sin(ang * 0.1) * 2, Math.sin(ang) * rr);
      group.add(chunk);
    }
  }

  if (planet.biome === 'desert') {
    // Dust band
    const dust = new THREE.Mesh(
      new THREE.TorusGeometry(planet.radius * 0.95, 3, 4, 24),
      new THREE.MeshBasicMaterial({ color: 0xd4a060, transparent: true, opacity: 0.15 })
    );
    dust.rotation.x = Math.PI / 2.5;
    group.add(dust);
  }

  return group;
}

/**
 * Abandoned building — more detailed voxel shelter
 */
export function createAbandonedBuilding() {
  const g = new THREE.Group();
  const add = (w, h, d, c, x, y, z, opts = {}) => addBox(g, w, h, d, c, x, y, z, opts);

  // Foundation + floor
  add(7, 0.5, 7, 0x3a3e44, 0, 0.15, 0);
  add(6.2, 0.25, 6.2, 0x5a6068, 0, 0.45, 0);

  // Walls with window cutouts (simulated by panels)
  add(6.4, 3.2, 0.4, 0x6a7078, 0, 2.0, -3.0);
  add(0.4, 3.2, 6.4, 0x6a7078, -3.0, 2.0, 0);
  add(0.4, 3.2, 6.4, 0x6a7078, 3.0, 2.0, 0);
  // Front with doorway gap
  add(2.0, 3.2, 0.4, 0x6a7078, -2.1, 2.0, 3.0);
  add(2.0, 3.2, 0.4, 0x6a7078, 2.1, 2.0, 3.0);
  add(2.2, 1.0, 0.4, 0x6a7078, 0, 3.5, 3.0); // lintel

  // Corner pillars
  add(0.5, 3.6, 0.5, 0x4a5058, 2.9, 2.0, 2.9);
  add(0.5, 3.6, 0.5, 0x4a5058, -2.9, 2.0, 2.9);
  add(0.5, 3.6, 0.5, 0x4a5058, 2.9, 2.0, -2.9);
  add(0.5, 3.6, 0.5, 0x4a5058, -2.9, 2.0, -2.9);

  // Roof layers
  add(7.0, 0.3, 7.0, 0x2a3038, 0, 3.7, 0);
  add(5.5, 0.25, 5.5, 0x3a4048, 0, 4.0, 0);

  // Interior terminal
  add(1.2, 1.4, 0.9, 0x2a3540, 0, 1.15, -1.8);
  add(0.9, 0.7, 0.15, 0x3ecfb4, 0, 1.5, -1.3, {
    emissive: 0x3ecfb4,
    emissiveIntensity: 0.7,
  });
  const light = new THREE.PointLight(0x3ecfb4, 1.0, 12);
  light.position.set(0, 2.2, -1.5);
  g.add(light);

  // Exterior beacon tower
  add(0.6, 5.5, 0.6, 0xe8a832, 3.8, 2.8, 3.8);
  add(0.9, 0.4, 0.9, 0xffc040, 3.8, 5.6, 3.8, {
    emissive: 0xe8a832,
    emissiveIntensity: 0.8,
  });
  const beaconLight = new THREE.PointLight(0xe8a832, 1.2, 20);
  beaconLight.position.set(3.8, 6, 3.8);
  g.add(beaconLight);

  // Debris
  add(0.8, 0.4, 0.6, 0x5a4040, 2.0, 0.5, 4.2);
  add(0.5, 0.5, 0.5, 0x4a5058, -2.5, 0.55, 4.0);

  return g;
}

/**
 * Distress beacon — more elaborate
 */
export function createDistressBeacon() {
  const g = new THREE.Group();
  addBox(g, 1.4, 0.35, 1.4, 0x3a4048, 0, 0.18, 0);
  addBox(g, 1.0, 0.2, 1.0, 0x2a3038, 0, 0.4, 0);
  addBox(g, 0.4, 2.4, 0.4, 0x1a2028, 0, 1.5, 0);
  const lamp = addBox(g, 0.55, 0.55, 0.55, 0xff3030, 0, 2.85, 0, {
    emissive: 0xff1010,
    emissiveIntensity: 1.2,
  });
  addBox(g, 0.25, 0.8, 0.25, 0xff6060, 0, 3.4, 0, {
    emissive: 0xff2020,
    emissiveIntensity: 0.6,
  });
  addBox(g, 0.8, 0.08, 0.8, 0x5a6068, 0.5, 2.0, 0);
  addBox(g, 0.08, 0.5, 0.08, 0x4a5058, 0.5, 1.7, 0);

  const light = new THREE.PointLight(0xff3030, 1.5, 20);
  light.position.y = 3.0;
  g.add(light);
  g.userData.lamp = lamp;
  return g;
}

/**
 * Exosuit player avatar
 */
export function createPlayerAvatar(color = 0x3ecfb4) {
  const g = new THREE.Group();
  const suit = color;
  const dark = 0x1a2430;
  const visor = 0x7ad4ea;

  addBox(g, 0.48, 0.48, 0.48, suit, 0, 1.58, 0);
  addBox(g, 0.42, 0.18, 0.15, visor, 0, 1.58, 0.22, {
    emissive: visor,
    emissiveIntensity: 0.35,
  });
  addBox(g, 0.58, 0.72, 0.32, dark, 0, 0.95, 0);
  addBox(g, 0.5, 0.25, 0.36, suit, 0, 1.15, 0); // chest plate
  addBox(g, 0.2, 0.55, 0.22, suit, -0.14, 0.32, 0);
  addBox(g, 0.2, 0.55, 0.22, suit, 0.14, 0.32, 0);
  addBox(g, 0.16, 0.55, 0.18, suit, -0.4, 1.0, 0);
  addBox(g, 0.16, 0.55, 0.18, suit, 0.4, 1.0, 0);
  // Jetpack
  addBox(g, 0.35, 0.5, 0.18, dark, 0, 1.05, -0.22);
  addBox(g, 0.12, 0.12, 0.1, 0xe8a832, -0.1, 0.85, -0.3, {
    emissive: 0xe8a832,
    emissiveIntensity: 0.5,
  });
  addBox(g, 0.12, 0.12, 0.1, 0xe8a832, 0.1, 0.85, -0.3, {
    emissive: 0xe8a832,
    emissiveIntensity: 0.5,
  });
  return g;
}

/**
 * First-person multi-tool (held)
 */
export function createMultiTool() {
  const g = new THREE.Group();
  addBox(g, 0.1, 0.12, 0.42, 0x2a3544, 0, 0, 0);
  addBox(g, 0.08, 0.08, 0.2, 0x1a2430, 0, -0.02, 0.08);
  addBox(g, 0.07, 0.07, 0.14, 0x3ecfb4, 0, 0.01, -0.28, {
    emissive: 0x3ecfb4,
    emissiveIntensity: 0.5,
  });
  addBox(g, 0.04, 0.04, 0.08, 0xe8a832, 0.06, 0.04, -0.1, {
    emissive: 0xe8a832,
    emissiveIntensity: 0.4,
  });
  addBox(g, 0.12, 0.05, 0.1, 0x4a5564, 0, 0.06, 0.05);
  return g;
}
