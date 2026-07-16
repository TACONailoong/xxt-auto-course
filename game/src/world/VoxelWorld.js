import * as THREE from 'three';
import { BLOCKS, BLOCK_COLORS } from '../core/constants.js';
import { fbm, noise2D } from './noise.js';

const CHUNK_SIZE = 16;
const WORLD_H = 48;

/**
 * Voxel chunk mesh builder — greedy-ish face culling, Minecraft look
 */
export class VoxelWorld {
  constructor(planet, scene) {
    this.planet = planet;
    this.scene = scene;
    this.seed = planet.seed;
    this.biome = planet.biome;
    /** @type {Map<string, {mesh:THREE.Mesh, data:Uint8Array}>} */
    this.chunks = new Map();
    this.group = new THREE.Group();
    this.group.name = 'voxelWorld';
    scene.add(this.group);
    this.originX = 0;
    this.originZ = 0;
  }

  key(cx, cz) {
    return `${cx},${cz}`;
  }

  worldToChunk(x, z) {
    return [Math.floor(x / CHUNK_SIZE), Math.floor(z / CHUNK_SIZE)];
  }

  getBlock(x, y, z) {
    if (y < 0 || y >= WORLD_H) return y < 0 ? BLOCKS.BEDROCK : BLOCKS.AIR;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const chunk = this.chunks.get(this.key(cx, cz));
    if (!chunk) return BLOCKS.AIR;
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return chunk.data[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
  }

  setBlock(x, y, z, id) {
    if (y < 0 || y >= WORLD_H) return;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    const k = this.key(cx, cz);
    let chunk = this.chunks.get(k);
    if (!chunk) return;
    const lx = ((x % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const lz = ((z % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    chunk.data[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = id;
    this.rebuildChunk(cx, cz);
  }

  heightAt(x, z) {
    const n = fbm(x * 0.03, z * 0.03, this.seed, 5);
    let base = 18;
    if (this.biome === 'desert') base = 16;
    if (this.biome === 'frozen') base = 20;
    return Math.floor(base + n * 14);
  }

  waterLevel() {
    if (this.biome === 'desert') return 0;
    if (this.biome === 'frozen') return 17;
    return 16;
  }

  generateChunkData(cx, cz) {
    const data = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_H);
    const waterY = this.waterLevel();
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        const h = this.heightAt(wx, wz);
        for (let y = 0; y < WORLD_H; y++) {
          let id = BLOCKS.AIR;
          if (y === 0) id = BLOCKS.BEDROCK;
          else if (y < h - 4) {
            id = BLOCKS.STONE;
            if (noise2D(wx * 0.2, wz * 0.2 + y * 0.15, this.seed + 9) > 0.84) id = BLOCKS.COPPER_ORE;
          } else if (y < h - 1) id = BLOCKS.DIRT;
          else if (y <= h) {
            if (h < waterY) id = BLOCKS.SAND;
            else if (this.biome === 'desert') id = BLOCKS.SAND;
            else if (this.biome === 'frozen') id = BLOCKS.STONE;
            else id = BLOCKS.GRASS;
          }
          // Fill water in valleys
          if (id === BLOCKS.AIR && waterY > 0 && y <= waterY && y > h) {
            id = BLOCKS.WATER;
          }
          data[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE] = id;
        }

        // Surface decorations (skip underwater)
        const top = h + 1;
        if (top < WORLD_H && h >= waterY) {
          const r = noise2D(wx * 0.37, wz * 0.37, this.seed + 3);
          let decor = BLOCKS.AIR;
          if (r > 0.86) decor = BLOCKS.FERRITE_ROCK;
          else if (r > 0.80) decor = BLOCKS.SODIUM_PLANT;
          else if (r > 0.74) decor = BLOCKS.CARBON_PLANT;
          else if (r > 0.70) decor = BLOCKS.DIHYDROGEN;
          else if (r > 0.685) decor = BLOCKS.CRYSTAL;
          else if (r > 0.66 && this.biome === 'lush') {
            const treeH = 3 + Math.floor(noise2D(wx, wz, this.seed + 5) * 2);
            for (let t = 0; t < treeH; t++) {
              if (top + t < WORLD_H) data[lx + lz * CHUNK_SIZE + (top + t) * CHUNK_SIZE * CHUNK_SIZE] = BLOCKS.LOG;
            }
            const canopyY = top + treeH;
            for (let dy = 0; dy <= 1; dy++) {
              for (let dx = -1; dx <= 1; dx++) {
                for (let dz = -1; dz <= 1; dz++) {
                  if (Math.abs(dx) + Math.abs(dz) > 2) continue;
                  const tx = lx + dx;
                  const tz = lz + dz;
                  const ty = canopyY + dy;
                  if (tx < 0 || tx >= CHUNK_SIZE || tz < 0 || tz >= CHUNK_SIZE || ty >= WORLD_H) continue;
                  const idx = tx + tz * CHUNK_SIZE + ty * CHUNK_SIZE * CHUNK_SIZE;
                  if (data[idx] === BLOCKS.AIR) data[idx] = BLOCKS.LEAVES;
                }
              }
            }
            continue;
          }
          if (decor !== BLOCKS.AIR) {
            data[lx + lz * CHUNK_SIZE + top * CHUNK_SIZE * CHUNK_SIZE] = decor;
          }
        }
      }
    }
    return data;
  }

  buildMesh(cx, cz, data) {
    const positions = [];
    const normals = [];
    const colors = [];
    const indices = [];
    let vi = 0;

    const faces = [
      { d: [0, 1, 0], n: [0, 1, 0], verts: [[0,1,0],[1,1,0],[1,1,1],[0,1,1]] }, // up
      { d: [0,-1,0], n: [0,-1,0], verts: [[0,0,1],[1,0,1],[1,0,0],[0,0,0]] },
      { d: [0,0,1], n: [0,0,1], verts: [[0,0,1],[0,1,1],[1,1,1],[1,0,1]] },
      { d: [0,0,-1], n: [0,0,-1], verts: [[1,0,0],[1,1,0],[0,1,0],[0,0,0]] },
      { d: [1,0,0], n: [1,0,0], verts: [[1,0,1],[1,1,1],[1,1,0],[1,0,0]] },
      { d: [-1,0,0], n: [-1,0,0], verts: [[0,0,0],[0,1,0],[0,1,1],[0,0,1]] },
    ];

    const get = (lx, y, lz) => {
      if (y < 0 || y >= WORLD_H) return BLOCKS.BEDROCK;
      if (lx < 0 || lx >= CHUNK_SIZE || lz < 0 || lz >= CHUNK_SIZE) {
        const wx = cx * CHUNK_SIZE + lx;
        const wz = cz * CHUNK_SIZE + lz;
        return this.getBlock(wx, y, wz);
      }
      return data[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
    };

    for (let y = 0; y < WORLD_H; y++) {
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const id = data[lx + lz * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE];
          if (id === BLOCKS.AIR) continue;
          const baseColor = new THREE.Color(BLOCK_COLORS[id] || 0xffffff);
          // slight per-block variation
          const v = 0.92 + noise2D(cx * 16 + lx, cz * 16 + lz + y, 1) * 0.16;
          const col = baseColor.clone().multiplyScalar(v);

          for (const face of faces) {
            const nx = lx + face.d[0];
            const ny = y + face.d[1];
            const nz = lz + face.d[2];
            const neighbor = get(nx, ny, nz);
            // Water only renders against air; solids render against air/water
            if (id === BLOCKS.WATER) {
              if (neighbor !== BLOCKS.AIR) continue;
            } else if (neighbor !== BLOCKS.AIR && neighbor !== BLOCKS.WATER) {
              continue;
            }

            const shade = face.n[1] > 0 ? 1 : face.n[1] < 0 ? 0.45 : face.n[0] !== 0 ? 0.7 : 0.85;
            const alphaMul = id === BLOCKS.WATER ? 0.75 : 1;
            for (const vert of face.verts) {
              positions.push(
                cx * CHUNK_SIZE + lx + vert[0],
                y + vert[1],
                cz * CHUNK_SIZE + lz + vert[2]
              );
              normals.push(...face.n);
              colors.push(col.r * shade * alphaMul, col.g * shade * alphaMul, col.b * shade * alphaMul);
            }
            indices.push(vi, vi + 1, vi + 2, vi, vi + 2, vi + 3);
            vi += 4;
          }
        }
      }
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setIndex(indices);
    geo.computeBoundingSphere();

    const mat = new THREE.MeshLambertMaterial({
      vertexColors: true,
      flatShading: true,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.chunk = true;
    return mesh;
  }

  ensureChunk(cx, cz) {
    const k = this.key(cx, cz);
    if (this.chunks.has(k)) return;
    const data = this.generateChunkData(cx, cz);
    const mesh = this.buildMesh(cx, cz, data);
    this.group.add(mesh);
    this.chunks.set(k, { mesh, data });
  }

  rebuildChunk(cx, cz) {
    const k = this.key(cx, cz);
    const chunk = this.chunks.get(k);
    if (!chunk) return;
    this.group.remove(chunk.mesh);
    chunk.mesh.geometry.dispose();
    chunk.mesh.material.dispose();
    chunk.mesh = this.buildMesh(cx, cz, chunk.data);
    this.group.add(chunk.mesh);
  }

  updateAround(x, z, radius = 3) {
    const [ccx, ccz] = this.worldToChunk(x, z);
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this.ensureChunk(ccx + dx, ccz + dz);
      }
    }
    // Unload far chunks
    for (const [k, chunk] of this.chunks) {
      const [cx, cz] = k.split(',').map(Number);
      if (Math.abs(cx - ccx) > radius + 1 || Math.abs(cz - ccz) > radius + 1) {
        this.group.remove(chunk.mesh);
        chunk.mesh.geometry.dispose();
        chunk.mesh.material.dispose();
        this.chunks.delete(k);
      }
    }
  }

  /** Surface Y for spawning */
  surfaceY(x, z) {
    return this.heightAt(Math.floor(x), Math.floor(z)) + 1;
  }

  dispose() {
    for (const chunk of this.chunks.values()) {
      this.group.remove(chunk.mesh);
      chunk.mesh.geometry.dispose();
      chunk.mesh.material.dispose();
    }
    this.chunks.clear();
    this.scene.remove(this.group);
  }
}
