import * as THREE from 'three';

/**
 * Blocky starship — Minecraft voxel aesthetic × NMS explorer silhouette
 */
export function createStarship(options = {}) {
  const group = new THREE.Group();
  group.name = 'starship';

  const palette = {
    hull: options.hull || 0x2a3544,
    accent: options.accent || 0x3ecfb4,
    engine: options.engine || 0xe8a832,
    glass: options.glass || 0x88d4e8,
    dark: options.dark || 0x121820,
    damage: options.damaged ? 0x5a3030 : null,
  };

  const box = (w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color, flatShading: true })
    );
    mesh.position.set(x, y, z);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };

  // Main fuselage — stepped voxel look
  box(1.2, 0.7, 3.2, palette.hull, 0, 0.4, 0);
  box(0.9, 0.5, 1.4, palette.dark, 0, 0.75, -0.2); // cockpit ridge
  box(0.7, 0.35, 0.8, palette.glass, 0, 0.85, 0.9); // canopy

  // Nose
  box(0.7, 0.45, 0.8, palette.accent, 0, 0.35, 1.8);
  box(0.4, 0.3, 0.5, palette.hull, 0, 0.3, 2.3);

  // Wings — angular NMS-like with blocky voxels
  box(2.8, 0.12, 1.0, palette.hull, 0, 0.25, -0.3);
  box(0.5, 0.15, 1.2, palette.accent, 1.5, 0.28, -0.2);
  box(0.5, 0.15, 1.2, palette.accent, -1.5, 0.28, -0.2);
  box(0.8, 0.1, 0.6, palette.dark, 1.8, 0.22, -0.8);
  box(0.8, 0.1, 0.6, palette.dark, -1.8, 0.22, -0.8);

  // Vertical stabilizers
  box(0.1, 0.7, 0.6, palette.accent, 0.35, 0.9, -1.2);
  box(0.1, 0.7, 0.6, palette.accent, -0.35, 0.9, -1.2);

  // Engines
  const engL = box(0.45, 0.45, 0.9, palette.dark, 0.7, 0.3, -1.7);
  const engR = box(0.45, 0.45, 0.9, palette.dark, -0.7, 0.3, -1.7);
  const glowL = box(0.3, 0.3, 0.15, palette.engine, 0.7, 0.3, -2.2);
  const glowR = box(0.3, 0.3, 0.15, palette.engine, -0.7, 0.3, -2.2);
  glowL.material.emissive = new THREE.Color(palette.engine);
  glowL.material.emissiveIntensity = 0.8;
  glowR.material.emissive = new THREE.Color(palette.engine);
  glowR.material.emissiveIntensity = 0.8;

  // Underside landing gear blocks
  box(0.2, 0.35, 0.2, palette.dark, 0.5, -0.05, 0.6);
  box(0.2, 0.35, 0.2, palette.dark, -0.5, -0.05, 0.6);
  box(0.2, 0.25, 0.2, palette.dark, 0, -0.02, -1.0);

  if (options.damaged) {
    box(0.4, 0.3, 0.5, 0x4a2020, 0.6, 0.6, 0.2);
    box(0.3, 0.2, 0.4, 0x3a1818, -0.5, 0.2, -0.5);
    // smoke marker light
    const smoke = new THREE.PointLight(0xff6020, 0.6, 8);
    smoke.position.set(0.5, 1.2, 0);
    group.add(smoke);
  }

  // Engine light
  const engineLight = new THREE.PointLight(palette.engine, 0, 12);
  engineLight.position.set(0, 0.3, -2.4);
  group.add(engineLight);
  group.userData.engineLight = engineLight;
  group.userData.glows = [glowL, glowR];

  group.scale.setScalar(options.scale || 1.2);
  return group;
}

/**
 * Distant planet sphere with voxel-faceted look
 */
export function createPlanetMesh(planet) {
  const group = new THREE.Group();
  group.name = `planet_${planet.id}`;

  // Low-poly icosahedron for blocky silhouette from space
  const geo = new THREE.IcosahedronGeometry(planet.radius, 2);
  // Push vertices toward quantized "voxel sphere"
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(pos, i);
    const len = v.length();
    // quantize radius slightly for faceted look
    const q = Math.round(len * 4) / 4;
    v.setLength(q);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({
    color: planet.color,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geo, mat);
  group.add(mesh);

  // Atmosphere shell
  const atmo = new THREE.Mesh(
    new THREE.IcosahedronGeometry(planet.radius * 1.08, 2),
    new THREE.MeshBasicMaterial({
      color: planet.atmosphere,
      transparent: true,
      opacity: 0.22,
      side: THREE.BackSide,
    })
  );
  group.add(atmo);

  // Ring for some planets
  if (planet.id === 'frost_shard') {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(planet.radius * 1.3, planet.radius * 1.6, 32),
      new THREE.MeshBasicMaterial({
        color: 0xa0d0e8,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
      })
    );
    ring.rotation.x = Math.PI / 2.4;
    group.add(ring);
  }

  return group;
}

/**
 * Abandoned building — voxel shelter for hermetic seal
 */
export function createAbandonedBuilding() {
  const g = new THREE.Group();
  const mat = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
  const add = (w, h, d, c, x, y, z) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c));
    m.position.set(x, y, z);
    m.castShadow = true;
    g.add(m);
  };
  // Floor
  add(6, 0.4, 6, 0x4a4e54, 0, 0.2, 0);
  // Walls
  add(6, 3, 0.4, 0x5a6068, 0, 1.7, -2.8);
  add(0.4, 3, 6, 0x5a6068, -2.8, 1.7, 0);
  add(0.4, 3, 6, 0x5a6068, 2.8, 1.7, 0);
  add(2, 3, 0.4, 0x5a6068, -2, 1.7, 2.8);
  add(2, 3, 0.4, 0x5a6068, 2, 1.7, 2.8);
  // Roof
  add(6.4, 0.35, 6.4, 0x3a4048, 0, 3.3, 0);
  // Terminal / chest
  add(1, 1.2, 0.8, 0x3ecfb4, 0, 1.0, -1.5);
  const light = new THREE.PointLight(0x3ecfb4, 0.8, 10);
  light.position.set(0, 2, -1.5);
  g.add(light);
  // Beacon pillar
  add(0.5, 4, 0.5, 0xe8a832, 3.5, 2, 3.5);
  return g;
}

/**
 * Distress beacon near crashed ship
 */
export function createDistressBeacon() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 0.4, 1.2),
    new THREE.MeshLambertMaterial({ color: 0x3a4048, flatShading: true })
  );
  base.position.y = 0.2;
  g.add(base);
  const pillar = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 2.2, 0.35),
    new THREE.MeshLambertMaterial({ color: 0x2a3038, flatShading: true })
  );
  pillar.position.y = 1.4;
  g.add(pillar);
  const lamp = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshLambertMaterial({
      color: 0xff4040,
      emissive: 0xff2020,
      emissiveIntensity: 0.9,
      flatShading: true,
    })
  );
  lamp.position.y = 2.6;
  g.add(lamp);
  const light = new THREE.PointLight(0xff3030, 1.2, 16);
  light.position.y = 2.8;
  g.add(light);
  g.userData.lamp = lamp;
  return g;
}

/**
 * Blocky player avatar for multiplayer
 */
export function createPlayerAvatar(color = 0x3ecfb4) {
  const g = new THREE.Group();
  const mat = new THREE.MeshLambertMaterial({ color, flatShading: true });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1a2430, flatShading: true });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), mat);
  head.position.y = 1.55;
  g.add(head);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.3), dark);
  body.position.y = 0.95;
  g.add(body);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.25), mat);
  legL.position.set(-0.14, 0.3, 0);
  g.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.25), mat);
  legR.position.set(0.14, 0.3, 0);
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), mat);
  armL.position.set(-0.4, 1.0, 0);
  g.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 0.2), mat);
  armR.position.set(0.4, 1.0, 0);
  g.add(armR);
  return g;
}
