import * as THREE from 'three';
import { GraphicsQuality, ObstacleCollider } from '../types';
import { TerrainManager } from './Terrain';

function createSnowflakeTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 30);
  gradient.addColorStop(0.0, 'rgba(255, 255, 255, 1.0)');
  gradient.addColorStop(0.25, 'rgba(235, 248, 255, 0.95)');
  gradient.addColorStop(0.55, 'rgba(190, 225, 255, 0.45)');
  gradient.addColorStop(1.0, 'rgba(160, 210, 255, 0.0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(32, 32, 30, 0, Math.PI * 2);
  ctx.fill();

  // Draw delicate 6-arm crystalline star
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
  ctx.lineWidth = 2.0;
  for (let i = 0; i < 6; i++) {
    const angle = (i * Math.PI) / 3;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    ctx.beginPath();
    ctx.moveTo(32, 32);
    ctx.lineTo(32 + cos * 20, 32 + sin * 20);
    ctx.stroke();

    // Side branches
    ctx.beginPath();
    ctx.moveTo(32 + cos * 10, 32 + sin * 10);
    ctx.lineTo(32 + cos * 10 + Math.cos(angle + 0.6) * 6, 32 + sin * 10 + Math.sin(angle + 0.6) * 6);
    ctx.moveTo(32 + cos * 10, 32 + sin * 10);
    ctx.lineTo(32 + cos * 10 + Math.cos(angle - 0.6) * 6, 32 + sin * 10 + Math.sin(angle - 0.6) * 6);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createSnowMistTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
  gradient.addColorStop(0.0, 'rgba(225, 242, 255, 0.4)');
  gradient.addColorStop(0.4, 'rgba(200, 230, 255, 0.2)');
  gradient.addColorStop(1.0, 'rgba(180, 220, 255, 0.0)');

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

const isMobileDevice = typeof window !== 'undefined' && (
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  ('ontouchstart' in window && window.innerWidth < 1024)
);

export class FoliageManager {
  public grassMesh: THREE.InstancedMesh | null = null;
  public flowerMesh: THREE.InstancedMesh | null = null;
  public treeGroup: THREE.Group = new THREE.Group();
  public ruinsGroup: THREE.Group = new THREE.Group();
  public particleSystem: THREE.Points | null = null;
  public snowParticleSystem: THREE.Points | null = null;
  public snowMistSystem: THREE.Points | null = null;
  public obstacles: ObstacleCollider[] = [];

  // Persistent instance coordinates buffer: [x, z, rotY, baseScale] for every instance
  // Guarantees zero height/position loss across terraforming, templates, and restarts!
  public grassCoords: Float32Array | null = null;
  public flowerCoords: Float32Array | null = null;
  private staticRocks: { mesh: THREE.Mesh; x: number; z: number; scaleY: number; obstacleIndex: number }[] = [];
  private staticRuins: { mesh: THREE.Mesh; x: number; z: number }[] = [];

  private grassMaterial: THREE.ShaderMaterial | null = null;
  private flowerMaterial: THREE.ShaderMaterial | null = null;
  private particleGeo: THREE.BufferGeometry | null = null;
  private snowGeo: THREE.BufferGeometry | null = null;
  private snowMistGeo: THREE.BufferGeometry | null = null;

  constructor(private scene: THREE.Scene) {}

  public init(quality: GraphicsQuality) {
    this.createInstancedGrass(quality);
    this.createInstancedFlowers(quality);
    this.createTreesAndRocks();
    this.createAncientRuins();
    this.createAmbientParticles();
    this.createMountainSnowfall();
  }

  /**
   * Instanced Multi-Blade Grass Carpet with Multi-Octave Wind & Subsurface Backlight Transmission (Zelda BotW Style)
   */
  private createInstancedGrass(quality: GraphicsQuality) {
    const count = isMobileDevice
      ? (quality === 'ultra' ? 50000 : quality === 'high' ? 36000 : 25000)
      : (quality === 'ultra' ? 180000 : quality === 'high' ? 130000 : 80000);

    const bladeGeo = new THREE.BufferGeometry();
    const posList: number[] = [];
    const uvList: number[] = [];
    const indexList: number[] = [];

    const bladesCount = isMobileDevice ? 10 : 14;
    const vertsPerBlade = 5;
    const bladeWidthBase = isMobileDevice ? 0.12 : 0.08;
    const bladeWidthMid = isMobileDevice ? 0.07 : 0.05;
    const baseBladeHeight = 0.40;

    for (let b = 0; b < bladesCount; b++) {
      const phi = b * 2.39996;
      const dist = Math.sqrt((b + 0.5) / bladesCount) * 0.55;
      const offsetX = Math.cos(phi) * dist;
      const offsetZ = Math.sin(phi) * dist;

      const bladeAngle = (b / bladesCount) * Math.PI * 2 + (b * 1.7);
      const cosA = Math.cos(bladeAngle);
      const sinA = Math.sin(bladeAngle);

      const hScale = 0.82 + ((b * 19) % 13) * 0.045;
      const h = baseBladeHeight * hScale;

      const baseVertIdx = b * vertsPerBlade;

      const xL = offsetX - bladeWidthBase * cosA;
      const zL = offsetZ - bladeWidthBase * sinA;
      const xR = offsetX + bladeWidthBase * cosA;
      const zR = offsetZ + bladeWidthBase * sinA;

      const bendFactor = 0.045 + (dist * 0.06);
      const dirX = dist > 0.001 ? offsetX / dist : cosA;
      const dirZ = dist > 0.001 ? offsetZ / dist : sinA;

      const bendX = dirX * bendFactor;
      const bendZ = dirZ * bendFactor;

      const xML = offsetX + bendX - bladeWidthMid * cosA;
      const zML = offsetZ + bendZ - bladeWidthMid * sinA;
      const xMR = offsetX + bendX + bladeWidthMid * cosA;
      const zMR = offsetZ + bendZ + bladeWidthMid * sinA;

      const xT = offsetX + bendX * 2.5;
      const zT = offsetZ + bendZ * 2.5;

      posList.push(
        xL, 0.0, zL,
        xR, 0.0, zR,
        xML, h * 0.50, zML,
        xMR, h * 0.50, zMR,
        xT, h, zT
      );

      uvList.push(
        0, 0,
        1, 0,
        0, 0.50,
        1, 0.50,
        0.5, 1.0
      );

      indexList.push(
        baseVertIdx + 0, baseVertIdx + 1, baseVertIdx + 2,
        baseVertIdx + 1, baseVertIdx + 3, baseVertIdx + 2,
        baseVertIdx + 2, baseVertIdx + 3, baseVertIdx + 4
      );
    }

    bladeGeo.setAttribute('position', new THREE.Float32BufferAttribute(posList, 3));
    bladeGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvList, 2));
    bladeGeo.setIndex(indexList);

    this.grassMaterial = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uBaseColor: { value: new THREE.Color('#143818') }, // Deep rich soil root green
        uMidColor: { value: new THREE.Color('#246e2a') },  // Zelda BotW meadow green
        uTipColor: { value: new THREE.Color('#4ea83b') },  // Sunlit warm sage green
        uSunDir: { value: new THREE.Vector3(0.5, 0.8, 0.3).normalize() },
      },
      vertexShader: `
        uniform float uTime;
        uniform vec3 uSunDir;
        varying vec2 vUv;
        varying float vHeightNorm;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          vUv = uv;
          vec3 pos = position;

          // Rolling harmonic wind wave across Hyrule plains
          vec4 worldOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float heightFactor = pos.y * pos.y * 2.4;

          float windWave1 = sin(uTime * 2.2 + worldOrigin.x * 0.055 + worldOrigin.z * 0.045) * 0.18;
          float windWave2 = cos(uTime * 3.1 - worldOrigin.x * 0.07 + worldOrigin.z * 0.06) * 0.09;
          float tipFlutter = sin(uTime * 7.5 + worldOrigin.x * 0.8 + worldOrigin.z * 0.8) * 0.035;

          pos.x += (windWave1 + tipFlutter) * heightFactor;
          pos.z += (windWave2 + tipFlutter * 0.8) * heightFactor;

          vHeightNorm = clamp(pos.y / 0.40, 0.0, 1.0);

          vec4 instancePosition = instanceMatrix * vec4(pos, 1.0);
          vWorldPosition = instancePosition.xyz;
          vWorldNormal = normalize(mat3(instanceMatrix) * vec3(0.0, 1.0, 0.0));
          gl_Position = projectionMatrix * viewMatrix * instancePosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uBaseColor;
        uniform vec3 uMidColor;
        uniform vec3 uTipColor;
        uniform vec3 uSunDir;
        varying vec2 vUv;
        varying float vHeightNorm;
        varying vec3 vWorldNormal;
        varying vec3 vWorldPosition;

        void main() {
          // 3-stop lush gradient from deep soil to sunlit blade tips
          vec3 color = vHeightNorm < 0.45
            ? mix(uBaseColor, uMidColor, vHeightNorm / 0.45)
            : mix(uMidColor, uTipColor, (vHeightNorm - 0.45) / 0.55);

          // Subsurface scattering backlighting (tamed, rich natural translucency)
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          float backLight = max(0.0, dot(-viewDir, uSunDir));
          float sssTransmission = pow(backLight, 4.0) * vHeightNorm * 0.18;
          color += vec3(0.65, 0.85, 0.35) * sssTransmission;

          // Ambient top specular sheen
          float skyRim = pow(max(0.0, dot(vWorldNormal, vec3(0.0, 1.0, 0.0))), 2.0) * 0.08 * vHeightNorm;
          color += color * skyRim;

          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    const mesh = new THREE.InstancedMesh(bladeGeo, this.grassMaterial, count);
    mesh.name = 'GrassInstanced';

    this.grassCoords = new Float32Array(count * 4);
    const dummy = new THREE.Object3D();
    let placed = 0;

    for (let i = 0; i < count * 6 && placed < count; i++) {
      const isInner = Math.random() < 0.72;
      const maxR = isInner ? 180 : 380;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * maxR;

      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      const y = TerrainManager.getTerrainHeight(x, z);
      const normal = TerrainManager.getTerrainNormal(x, z);
      const slope = 1.0 - normal.y;

      const isNearWater = y > TerrainManager.WATER_LEVEL + 0.05 && y < TerrainManager.WATER_LEVEL + 7.5;

      if (y > TerrainManager.WATER_LEVEL + 0.08 && y < 39.0 && slope < 0.52) {
        const rotY = Math.random() * Math.PI * 2;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, rotY, 0);

        const altitudeScale = Math.max(0.35, 1.0 - Math.max(0, (y - 22.0) / 16.0));
        const waterBoost = isNearWater ? 1.15 : 1.0;
        const baseScale = (0.75 + Math.random() * 0.3) * waterBoost;
        const finalScale = baseScale * altitudeScale;

        dummy.scale.set(finalScale, finalScale, finalScale);
        dummy.updateMatrix();

        mesh.setMatrixAt(placed, dummy.matrix);

        const offset = placed * 4;
        this.grassCoords[offset] = x;
        this.grassCoords[offset + 1] = z;
        this.grassCoords[offset + 2] = rotY;
        this.grassCoords[offset + 3] = finalScale;

        placed++;
      }
    }

    // Hide any unused slots initially so they can be grown on demand!
    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = placed; i < count; i++) {
      mesh.setMatrixAt(i, zeroMat);
      const offset = i * 4;
      this.grassCoords[offset] = 0;
      this.grassCoords[offset + 1] = 0;
      this.grassCoords[offset + 2] = 0;
      this.grassCoords[offset + 3] = 0;
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = true;
    this.scene.add(mesh);
    this.grassMesh = mesh;
  }

  /**
   * Instanced Wildflower Meadow Blossoms (Poppies, Princess Bluebells, Buttercups, White Clover)
   */
  private createInstancedFlowers(quality: GraphicsQuality) {
    const count = isMobileDevice
      ? (quality === 'ultra' ? 8000 : 4000)
      : (quality === 'ultra' ? 24000 : 15000);

    // Cross-plane blossom petals
    const flowerGeo = new THREE.BufferGeometry();
    const pos: number[] = [];
    const colors: number[] = [];
    const uvs: number[] = [];
    const indices: number[] = [];

    const flowerWidth = 0.22;
    const flowerHeight = 0.38;

    // Cross plane 1 (along X)
    pos.push(
      -flowerWidth * 0.5, 0.0, 0.0,
       flowerWidth * 0.5, 0.0, 0.0,
      -flowerWidth * 0.5, flowerHeight, 0.0,
       flowerWidth * 0.5, flowerHeight, 0.0
    );
    // Cross plane 2 (along Z)
    pos.push(
      0.0, 0.0, -flowerWidth * 0.5,
      0.0, 0.0,  flowerWidth * 0.5,
      0.0, flowerHeight, -flowerWidth * 0.5,
      0.0, flowerHeight,  flowerWidth * 0.5
    );

    indices.push(
      0, 1, 2, 1, 3, 2,
      4, 5, 6, 5, 7, 6
    );

    uvs.push(
      0, 0, 1, 0, 0, 1, 1, 1,
      0, 0, 1, 0, 0, 1, 1, 1
    );

    flowerGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    flowerGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    flowerGeo.setIndex(indices);

    this.flowerMaterial = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying vec3 vWorldPosition;

        void main() {
          vUv = uv;
          vec3 pos = position;

          vec4 worldOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          float heightFactor = pos.y * pos.y * 3.2;

          float wind = sin(uTime * 2.2 + worldOrigin.x * 0.06 + worldOrigin.z * 0.05) * 0.16;
          pos.x += wind * heightFactor;
          pos.z += wind * 0.7 * heightFactor;

          vec4 instancePosition = instanceMatrix * vec4(pos, 1.0);
          vWorldPosition = instancePosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * instancePosition;
        }
      `,
      fragmentShader: `
        varying vec2 vUv;
        varying vec3 vWorldPosition;

        void main() {
          // Stalk green at bottom to vivid floral color at top
          vec3 stemGreen = vec3(0.18, 0.52, 0.22);

          // Procedural flower petal color selection per location hash
          float hash = fract(sin(dot(floor(vWorldPosition.xz * 2.0), vec2(12.9898, 78.233))) * 43758.5453);
          vec3 petalColor;
          if (hash < 0.30) {
            petalColor = vec3(0.96, 0.22, 0.22); // Scarlet Wild Poppy
          } else if (hash < 0.60) {
            petalColor = vec3(0.24, 0.72, 0.98); // Silent Princess Bluebell
          } else if (hash < 0.82) {
            petalColor = vec3(0.98, 0.82, 0.18); // Golden Buttercup
          } else {
            petalColor = vec3(0.98, 0.98, 0.98); // White Clover
          }

          vec3 finalColor = vUv.y < 0.45
            ? mix(stemGreen, petalColor, vUv.y / 0.45)
            : petalColor;

          // Gentle center highlight
          if (vUv.y > 0.65 && abs(vUv.x - 0.5) < 0.18) {
            finalColor += vec3(0.15, 0.12, 0.0);
          }

          gl_FragColor = vec4(finalColor, 1.0);
        }
      `,
    });

    const flowerMesh = new THREE.InstancedMesh(flowerGeo, this.flowerMaterial, count);
    flowerMesh.name = 'FlowersInstanced';

    this.flowerCoords = new Float32Array(count * 4);
    const dummy = new THREE.Object3D();
    let placed = 0;

    for (let i = 0; i < count * 8 && placed < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * 220;

      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      const y = TerrainManager.getTerrainHeight(x, z);
      const normal = TerrainManager.getTerrainNormal(x, z);

      if (y > TerrainManager.WATER_LEVEL + 0.3 && y < 32.0 && normal.y > 0.75) {
        const rotY = Math.random() * Math.PI * 2;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, rotY, 0);
        const s = 0.8 + Math.random() * 0.5;
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();

        flowerMesh.setMatrixAt(placed, dummy.matrix);

        const offset = placed * 4;
        this.flowerCoords[offset] = x;
        this.flowerCoords[offset + 1] = z;
        this.flowerCoords[offset + 2] = rotY;
        this.flowerCoords[offset + 3] = s;

        placed++;
      }
    }

    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = placed; i < count; i++) {
      flowerMesh.setMatrixAt(i, zeroMat);
      const offset = i * 4;
      this.flowerCoords[offset] = 0;
      this.flowerCoords[offset + 1] = 0;
      this.flowerCoords[offset + 2] = 0;
      this.flowerCoords[offset + 3] = 0;
    }

    flowerMesh.instanceMatrix.needsUpdate = true;
    this.scene.add(flowerMesh);
    this.flowerMesh = flowerMesh;
  }

  /**
   * Dynamically GROW grass instances in real-time when painted in the Level Editor!
   */
  public growGrassInRadius(x: number, z: number, radius: number, density: number = 1.0) {
    if (!this.grassMesh || !this.grassCoords) return;
    const count = this.grassMesh.count;
    const dummy = new THREE.Object3D();

    const patchesToAdd = Math.min(500, Math.round(radius * radius * 0.4 * density));
    let added = 0;

    for (let i = 0; i < count && added < patchesToAdd; i++) {
      const offset = i * 4;
      const isScaleZero = this.grassCoords[offset + 3] === 0;
      const gx = this.grassCoords[offset];
      const gz = this.grassCoords[offset + 1];
      const distFromCenter = Math.hypot(gx - x, gz - z);

      if (isScaleZero || distFromCenter > 260) {
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * radius;
        const px = x + Math.cos(angle) * r;
        const pz = z + Math.sin(angle) * r;
        const py = TerrainManager.getTerrainHeight(px, pz);
        const normal = TerrainManager.getTerrainNormal(px, pz);

        if (py > TerrainManager.WATER_LEVEL + 0.08 && normal.y > 0.45) {
          const rotY = Math.random() * Math.PI * 2;
          const s = 0.9 + Math.random() * 0.45;
          dummy.position.set(px, py, pz);
          dummy.rotation.set(0, rotY, 0);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();

          this.grassMesh.setMatrixAt(i, dummy.matrix);

          this.grassCoords[offset] = px;
          this.grassCoords[offset + 1] = pz;
          this.grassCoords[offset + 2] = rotY;
          this.grassCoords[offset + 3] = s;

          added++;
        }
      }
    }

    if (added > 0) {
      this.grassMesh.instanceMatrix.needsUpdate = true;
    }
  }

  /**
   * Remove/hide grass and flower instances within a given radius (e.g. structure built, rock/snow painted, or erased)
   */
  public removeGrassInRadius(x: number, z: number, radius: number) {
    const radSq = radius * radius;
    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

    if (this.grassMesh && this.grassCoords) {
      const count = this.grassMesh.count;
      let modified = false;

      for (let i = 0; i < count; i++) {
        const offset = i * 4;
        if (this.grassCoords[offset + 3] === 0) continue;
        const gx = this.grassCoords[offset];
        const gz = this.grassCoords[offset + 1];
        const distSq = (gx - x) * (gx - x) + (gz - z) * (gz - z);
        if (distSq < radSq) {
          this.grassMesh.setMatrixAt(i, zeroMat);
          this.grassCoords[offset + 3] = 0;
          modified = true;
        }
      }

      if (modified) {
        this.grassMesh.instanceMatrix.needsUpdate = true;
      }
    }

    if (this.flowerMesh && this.flowerCoords) {
      const count = this.flowerMesh.count;
      let modified = false;

      for (let i = 0; i < count; i++) {
        const offset = i * 4;
        if (this.flowerCoords[offset + 3] === 0) continue;
        const gx = this.flowerCoords[offset];
        const gz = this.flowerCoords[offset + 1];
        const distSq = (gx - x) * (gx - x) + (gz - z) * (gz - z);
        if (distSq < radSq) {
          this.flowerMesh.setMatrixAt(i, zeroMat);
          this.flowerCoords[offset + 3] = 0;
          modified = true;
        }
      }

      if (modified) {
        this.flowerMesh.instanceMatrix.needsUpdate = true;
      }
    }
  }

  /**
   * Synchronize grass, flower, and boulder heights to updated terrain after terraforming/sculpting
   */
  public syncGrassHeightsInRadius(x: number, z: number, radius: number) {
    const dummy = new THREE.Object3D();
    const radSq = radius * radius;
    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

    if (this.grassMesh && this.grassCoords) {
      const count = this.grassMesh.count;
      let modified = false;

      for (let i = 0; i < count; i++) {
        const offset = i * 4;
        const s = this.grassCoords[offset + 3];
        if (s <= 0) continue;
        const gx = this.grassCoords[offset];
        const gz = this.grassCoords[offset + 1];
        const distSq = (gx - x) * (gx - x) + (gz - z) * (gz - z);

        if (distSq < radSq) {
          const ny = TerrainManager.getTerrainHeight(gx, gz);
          const normal = TerrainManager.getTerrainNormal(gx, gz);

          if (ny <= TerrainManager.WATER_LEVEL + 0.05 || normal.y < 0.45) {
            this.grassMesh.setMatrixAt(i, zeroMat);
          } else {
            dummy.position.set(gx, ny, gz);
            dummy.rotation.set(0, this.grassCoords[offset + 2], 0);
            dummy.scale.set(s, s, s);
            dummy.updateMatrix();
            this.grassMesh.setMatrixAt(i, dummy.matrix);
          }
          modified = true;
        }
      }

      if (modified) {
        this.grassMesh.instanceMatrix.needsUpdate = true;
      }
    }

    if (this.flowerMesh && this.flowerCoords) {
      const count = this.flowerMesh.count;
      let modified = false;

      for (let i = 0; i < count; i++) {
        const offset = i * 4;
        const s = this.flowerCoords[offset + 3];
        if (s <= 0) continue;
        const gx = this.flowerCoords[offset];
        const gz = this.flowerCoords[offset + 1];
        const distSq = (gx - x) * (gx - x) + (gz - z) * (gz - z);

        if (distSq < radSq) {
          const ny = TerrainManager.getTerrainHeight(gx, gz);
          const normal = TerrainManager.getTerrainNormal(gx, gz);

          if (ny <= TerrainManager.WATER_LEVEL + 0.1 || normal.y < 0.65) {
            this.flowerMesh.setMatrixAt(i, zeroMat);
          } else {
            dummy.position.set(gx, ny, gz);
            dummy.rotation.set(0, this.flowerCoords[offset + 2], 0);
            dummy.scale.set(s, s, s);
            dummy.updateMatrix();
            this.flowerMesh.setMatrixAt(i, dummy.matrix);
          }
          modified = true;
        }
      }

      if (modified) {
        this.flowerMesh.instanceMatrix.needsUpdate = true;
      }
    }

    // Sync static rocks in radius
    for (const r of this.staticRocks) {
      const distSq = (r.x - x) * (r.x - x) + (r.z - z) * (r.z - z);
      if (distSq < radSq) {
        const ny = TerrainManager.getTerrainHeight(r.x, r.z);
        r.mesh.position.y = ny + 0.5;
        if (this.obstacles[r.obstacleIndex]) {
          this.obstacles[r.obstacleIndex].yBase = ny;
        }
      }
    }
  }

  /**
   * Resamples and repopulates all wildflowers across updated terrain heights
   */
  public repopulateAllFlowers() {
    if (!this.flowerMesh || !this.flowerCoords) return;
    const count = this.flowerMesh.count;
    const dummy = new THREE.Object3D();
    let placed = 0;

    for (let i = 0; i < count * 8 && placed < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * 220;

      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      const y = TerrainManager.getTerrainHeight(x, z);
      const normal = TerrainManager.getTerrainNormal(x, z);

      if (y > TerrainManager.WATER_LEVEL + 0.3 && y < 32.0 && normal.y > 0.75) {
        const rotY = Math.random() * Math.PI * 2;
        const s = 0.8 + Math.random() * 0.5;

        dummy.position.set(x, y, z);
        dummy.rotation.set(0, rotY, 0);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();

        this.flowerMesh.setMatrixAt(placed, dummy.matrix);

        const offset = placed * 4;
        this.flowerCoords[offset] = x;
        this.flowerCoords[offset + 1] = z;
        this.flowerCoords[offset + 2] = rotY;
        this.flowerCoords[offset + 3] = s;

        placed++;
      }
    }

    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = placed; i < count; i++) {
      this.flowerMesh.setMatrixAt(i, zeroMat);
      const offset = i * 4;
      this.flowerCoords[offset] = 0;
      this.flowerCoords[offset + 1] = 0;
      this.flowerCoords[offset + 2] = 0;
      this.flowerCoords[offset + 3] = 0;
    }

    this.flowerMesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Snaps every rock boulder and ancient ruin pillar directly to the terrain surface
   */
  public syncAllRocksAndRuinsToTerrain() {
    for (const r of this.staticRocks) {
      const ny = TerrainManager.getTerrainHeight(r.x, r.z);
      r.mesh.position.y = ny + 0.5;
      if (this.obstacles[r.obstacleIndex]) {
        this.obstacles[r.obstacleIndex].yBase = ny;
      }
    }
    for (const ru of this.staticRuins) {
      const ny = TerrainManager.getTerrainHeight(ru.x, ru.z);
      ru.mesh.position.y = ny + 4.0;
    }
  }

  /**
   * Resamples and repopulates the entire grass and flower carpet across the world
   * Ensures 100% ground coupling for both grass blades, meadow blossoms, and rocks
   */
  public repopulateAllGrass() {
    if (!this.grassMesh || !this.grassCoords) return;
    const count = this.grassMesh.count;
    const dummy = new THREE.Object3D();
    let placed = 0;

    for (let i = 0; i < count * 6 && placed < count; i++) {
      const isInner = Math.random() < 0.72;
      const maxR = isInner ? 180 : 380;
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * maxR;

      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      const y = TerrainManager.getTerrainHeight(x, z);
      const normal = TerrainManager.getTerrainNormal(x, z);
      const slope = 1.0 - normal.y;

      if (y > TerrainManager.WATER_LEVEL + 0.08 && y < 39.0 && slope < 0.52) {
        const rotY = Math.random() * Math.PI * 2;
        dummy.position.set(x, y, z);
        dummy.rotation.set(0, rotY, 0);

        const altitudeScale = Math.max(0.35, 1.0 - Math.max(0, (y - 22.0) / 16.0));
        const waterBoost = (y > TerrainManager.WATER_LEVEL + 0.05 && y < TerrainManager.WATER_LEVEL + 7.5) ? 1.15 : 1.0;
        const baseScale = (0.75 + Math.random() * 0.3) * waterBoost;
        const finalScale = baseScale * altitudeScale;

        dummy.scale.set(finalScale, finalScale, finalScale);
        dummy.updateMatrix();

        this.grassMesh.setMatrixAt(placed, dummy.matrix);

        const offset = placed * 4;
        this.grassCoords[offset] = x;
        this.grassCoords[offset + 1] = z;
        this.grassCoords[offset + 2] = rotY;
        this.grassCoords[offset + 3] = finalScale;

        placed++;
      }
    }

    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = placed; i < count; i++) {
      this.grassMesh.setMatrixAt(i, zeroMat);
      const offset = i * 4;
      this.grassCoords[offset] = 0;
      this.grassCoords[offset + 1] = 0;
      this.grassCoords[offset + 2] = 0;
      this.grassCoords[offset + 3] = 0;
    }

    this.grassMesh.instanceMatrix.needsUpdate = true;

    // Repopulate flowers & snap rocks so nothing ever floats!
    this.repopulateAllFlowers();
    this.syncAllRocksAndRuinsToTerrain();
  }

  /**
   * Fast global snap for all existing foliage instances to updated terrain without respawn
   */
  public syncAllFoliageToTerrain() {
    const dummy = new THREE.Object3D();
    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);

    if (this.grassMesh && this.grassCoords) {
      const count = this.grassMesh.count;
      for (let i = 0; i < count; i++) {
        const offset = i * 4;
        const s = this.grassCoords[offset + 3];
        if (s <= 0) {
          this.grassMesh.setMatrixAt(i, zeroMat);
          continue;
        }
        const x = this.grassCoords[offset];
        const z = this.grassCoords[offset + 1];
        const rotY = this.grassCoords[offset + 2];
        const y = TerrainManager.getTerrainHeight(x, z);
        const normal = TerrainManager.getTerrainNormal(x, z);

        if (y <= TerrainManager.WATER_LEVEL + 0.05 || normal.y < 0.45) {
          this.grassMesh.setMatrixAt(i, zeroMat);
        } else {
          dummy.position.set(x, y, z);
          dummy.rotation.set(0, rotY, 0);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          this.grassMesh.setMatrixAt(i, dummy.matrix);
        }
      }
      this.grassMesh.instanceMatrix.needsUpdate = true;
    }

    if (this.flowerMesh && this.flowerCoords) {
      const count = this.flowerMesh.count;
      for (let i = 0; i < count; i++) {
        const offset = i * 4;
        const s = this.flowerCoords[offset + 3];
        if (s <= 0) {
          this.flowerMesh.setMatrixAt(i, zeroMat);
          continue;
        }
        const x = this.flowerCoords[offset];
        const z = this.flowerCoords[offset + 1];
        const rotY = this.flowerCoords[offset + 2];
        const y = TerrainManager.getTerrainHeight(x, z);
        const normal = TerrainManager.getTerrainNormal(x, z);

        if (y <= TerrainManager.WATER_LEVEL + 0.2 || normal.y < 0.65) {
          this.flowerMesh.setMatrixAt(i, zeroMat);
        } else {
          dummy.position.set(x, y, z);
          dummy.rotation.set(0, rotY, 0);
          dummy.scale.set(s, s, s);
          dummy.updateMatrix();
          this.flowerMesh.setMatrixAt(i, dummy.matrix);
        }
      }
      this.flowerMesh.instanceMatrix.needsUpdate = true;
    }

    this.syncAllRocksAndRuinsToTerrain();
  }

  /**
   * Procedural Trees & Boulders
   */
  private createTreesAndRocks() {
    // 1. Pine Tree Mesh Prototype
    const trunkGeo = new THREE.CylinderGeometry(0.3, 0.5, 4, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e16, roughness: 0.9 });

    const foliageGeo = new THREE.ConeGeometry(3.0, 6.0, 6);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x225522, roughness: 0.7 });

    const treeProto = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2;
    trunk.castShadow = true;
    treeProto.add(trunk);

    const f1 = new THREE.Mesh(foliageGeo, foliageMat);
    f1.position.y = 5.5;
    f1.castShadow = true;
    treeProto.add(f1);

    const f2 = new THREE.Mesh(foliageGeo, foliageMat);
    f2.position.y = 7.5;
    f2.scale.set(0.75, 0.75, 0.75);
    f2.castShadow = true;
    treeProto.add(f2);

    // Tree generation is now handled by MiningAndHarvestingSystem so ALL trees can be chopped down!
    // 2. Boulders & Rocks
    const rockGeo = new THREE.DodecahedronGeometry(1.5, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5a626a, roughness: 0.8 });

    for (let i = 0; i < 90; i++) {
      const x = (Math.random() - 0.5) * 500;
      const z = (Math.random() - 0.5) * 500;
      const y = TerrainManager.getTerrainHeight(x, z);

      if (y > TerrainManager.WATER_LEVEL) {
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.set(x, y + 0.5, z);
        const s = 0.6 + Math.random() * 1.8;
        rock.scale.set(s, s * 0.7, s);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = true;
        rock.receiveShadow = true;
        this.treeGroup.add(rock);

        // Add rock boulder collision
        this.obstacles.push({
          type: 'rock',
          x,
          z,
          yBase: y,
          height: 1.8 * s,
          radius: Math.max(0.7, 1.25 * s),
        });

        // Store reference for dynamic height synchronization
        this.staticRocks.push({
          mesh: rock,
          x,
          z,
          scaleY: s * 0.7,
          obstacleIndex: this.obstacles.length - 1,
        });
      }
    }

    this.scene.add(this.treeGroup);
  }

  /**
   * Ancient Temple Ruins & Rune Pillars
   */
  private createAncientRuins() {
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x7a8288, roughness: 0.8 });
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.8,
    });

    // Pillar archetype
    const pillarGeo = new THREE.CylinderGeometry(0.9, 1.1, 8, 8);

    // Place ruins in West basin (around x = -160, z = -80)
    const ruinCenterX = -160;
    const ruinCenterZ = -80;

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const rx = ruinCenterX + Math.cos(angle) * 22;
      const rz = ruinCenterZ + Math.sin(angle) * 22;
      const ry = TerrainManager.getTerrainHeight(rx, rz);

      const pillar = new THREE.Mesh(pillarGeo, stoneMat);
      pillar.position.set(rx, ry + 4, rz);
      pillar.castShadow = true;
      pillar.receiveShadow = true;

      if (i % 3 === 0) {
        // Broken tilt
        pillar.rotation.z = (Math.random() - 0.5) * 0.4;
      }

      // Glowing rune ring on pillar
      const ringGeo = new THREE.TorusGeometry(1.05, 0.1, 8, 16);
      const ring = new THREE.Mesh(ringGeo, runeMat);
      ring.position.y = 1.0;
      ring.rotation.x = Math.PI / 2;
      pillar.add(ring);

      this.ruinsGroup.add(pillar);

      // Add ruin pillar collision
      this.obstacles.push({
        type: 'ruins',
        x: rx,
        z: rz,
        yBase: ry,
        height: 8.0,
        radius: 1.1,
      });

      this.staticRuins.push({
        mesh: pillar,
        x: rx,
        z: rz,
      });
    }

    this.scene.add(this.ruinsGroup);
  }

  /**
   * Floating Leaves / Fireflies Ambient Particles
   */
  private createAmbientParticles() {
    const count = 300;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 400;
      positions[i * 3 + 1] = 2.0 + Math.random() * 25;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 400;

      // Yellow/green glowing firefly tint
      color.setHSL(0.18 + Math.random() * 0.1, 0.9, 0.6);
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.45,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });

    this.particleSystem = new THREE.Points(geometry, material);
    this.particleGeo = geometry;
    this.scene.add(this.particleSystem);
  }

  /**
   * Realistic Mountain Snowfall & Blizzard Flakes Particle System (Snowflow style)
   */
  private createMountainSnowfall() {
    const flakeTexture = createSnowflakeTexture();
    const mistTexture = createSnowMistTexture();

    // 1. Crystalline Soft Snowflake Particles
    const count = isMobileDevice ? 800 : 2500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);

    const cPureSnow = new THREE.Color('#ffffff');
    const cBlueIce = new THREE.Color('#d8efff');

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 350;
      positions[i * 3 + 1] = 12.0 + Math.random() * 65;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 350;

      velocities[i * 3] = (Math.random() - 0.5) * 2.8; // Wind drift X
      velocities[i * 3 + 1] = -(1.2 + Math.random() * 2.8); // Falling speed Y
      velocities[i * 3 + 2] = (Math.random() - 0.5) * 2.8; // Wind drift Z

      const isGlitter = Math.random() < 0.4;
      const col = isGlitter ? cPureSnow : cBlueIce;
      colors[i * 3] = col.r;
      colors[i * 3 + 1] = col.g;
      colors[i * 3 + 2] = col.b;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    (geometry as any).velocities = velocities;

    const material = new THREE.PointsMaterial({
      size: 0.22,
      map: flakeTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });

    this.snowParticleSystem = new THREE.Points(geometry, material);
    this.snowParticleSystem.visible = false; // Only visible on mountain summits
    this.snowGeo = geometry;
    this.scene.add(this.snowParticleSystem);

    // 2. Volumetric Mountain Snow Mist / Blizzard Haze
    const mistCount = 280;
    const mistGeo = new THREE.BufferGeometry();
    const mistPos = new Float32Array(mistCount * 3);
    const mistVels = new Float32Array(mistCount * 3);

    for (let i = 0; i < mistCount; i++) {
      mistPos[i * 3] = (Math.random() - 0.5) * 300;
      mistPos[i * 3 + 1] = 18.0 + Math.random() * 45;
      mistPos[i * 3 + 2] = (Math.random() - 0.5) * 300;

      mistVels[i * 3] = 1.2 + Math.random() * 2.0; // Slow sweeping fog drift
      mistVels[i * 3 + 1] = (Math.random() - 0.5) * 0.4;
      mistVels[i * 3 + 2] = 0.8 + Math.random() * 1.5;
    }

    mistGeo.setAttribute('position', new THREE.BufferAttribute(mistPos, 3));
    (mistGeo as any).velocities = mistVels;

    const mistMat = new THREE.PointsMaterial({
      size: 8.0,
      map: mistTexture,
      transparent: true,
      opacity: 0.12,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      color: 0xd8eeff,
    });

    this.snowMistSystem = new THREE.Points(mistGeo, mistMat);
    this.snowMistSystem.visible = false; // Only visible on mountain summits
    this.snowMistGeo = mistGeo;
    this.scene.add(this.snowMistSystem);
  }

  public update(time: number, delta: number, playerPos?: THREE.Vector3, sunDir?: THREE.Vector3) {
    if (this.grassMaterial) {
      this.grassMaterial.uniforms.uTime.value = time;
      if (sunDir) {
        this.grassMaterial.uniforms.uSunDir.value.copy(sunDir);
      }
    }
    if (this.flowerMaterial) {
      this.flowerMaterial.uniforms.uTime.value = time;
    }

    // Animate ambient firefly particles
    if (this.particleGeo) {
      const posAttr = this.particleGeo.attributes.position;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i);
        y += Math.sin(time * 2.0 + i) * 0.02 + 0.01;
        if (y > 30.0) y = 2.0;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
    }

    // Check if player is at high snowy mountain altitude
    const isSnowAltitude = !!(playerPos && playerPos.y > 17.5);
    if (this.snowParticleSystem) this.snowParticleSystem.visible = isSnowAltitude;
    if (this.snowMistSystem) this.snowMistSystem.visible = isSnowAltitude;

    // Animate Mountain Snowfall Flakes only when in alpine zone
    if (isSnowAltitude && this.snowGeo && this.snowGeo.attributes.position) {
      const posAttr = this.snowGeo.attributes.position;
      const vels = (this.snowGeo as any).velocities as Float32Array;
      const count = posAttr.count;

      const px = playerPos ? playerPos.x : 0;
      const pz = playerPos ? playerPos.z : 0;
      const py = playerPos ? playerPos.y : 0;

      for (let i = 0; i < count; i++) {
        let x = posAttr.getX(i);
        let y = posAttr.getY(i);
        let z = posAttr.getZ(i);

        // Natural swirling harmonic turbulence
        const swirlX = Math.sin(time * 2.2 + i * 0.3) * 0.9;
        const swirlZ = Math.cos(time * 1.8 + i * 0.4) * 0.9;

        x += (vels[i * 3] + swirlX) * delta * 1.8;
        y += vels[i * 3 + 1] * delta * 2.2;
        z += (vels[i * 3 + 2] + swirlZ) * delta * 1.8;

        const groundY = TerrainManager.getTerrainHeight(x, z);
        if (y < groundY + 0.2 || Math.abs(x - px) > 220 || Math.abs(z - pz) > 220) {
          x = px + (Math.random() - 0.5) * 240;
          z = pz + (Math.random() - 0.5) * 240;
          const targetGround = TerrainManager.getTerrainHeight(x, z);
          y = Math.max(targetGround + 4.0, py + 10.0) + Math.random() * 32.0;
        }

        posAttr.setXYZ(i, x, y, z);
      }

      posAttr.needsUpdate = true;
    }

    // Animate Volumetric Mountain Snow Mist
    if (isSnowAltitude && this.snowMistGeo && this.snowMistGeo.attributes.position) {
      const posAttr = this.snowMistGeo.attributes.position;
      const vels = (this.snowMistGeo as any).velocities as Float32Array;
      const count = posAttr.count;

      const px = playerPos ? playerPos.x : 0;
      const pz = playerPos ? playerPos.z : 0;

      for (let i = 0; i < count; i++) {
        let x = posAttr.getX(i);
        let y = posAttr.getY(i);
        let z = posAttr.getZ(i);

        x += vels[i * 3] * delta * 2.5;
        y += Math.sin(time * 0.8 + i) * delta * 0.5;
        z += vels[i * 3 + 2] * delta * 2.5;

        if (Math.abs(x - px) > 220 || Math.abs(z - pz) > 220) {
          x = px + (Math.random() - 0.5) * 260;
          z = pz + (Math.random() - 0.5) * 260;
          const groundY = TerrainManager.getTerrainHeight(x, z);
          y = groundY + 8.0 + Math.random() * 25.0;
        }

        posAttr.setXYZ(i, x, y, z);
      }

      posAttr.needsUpdate = true;
    }
  }
}
