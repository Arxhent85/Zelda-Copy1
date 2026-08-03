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
  public treeGroup: THREE.Group = new THREE.Group();
  public ruinsGroup: THREE.Group = new THREE.Group();
  public particleSystem: THREE.Points | null = null;
  public snowParticleSystem: THREE.Points | null = null;
  public snowMistSystem: THREE.Points | null = null;
  public obstacles: ObstacleCollider[] = [];

  private grassMaterial: THREE.ShaderMaterial | null = null;
  private particleGeo: THREE.BufferGeometry | null = null;
  private snowGeo: THREE.BufferGeometry | null = null;
  private snowMistGeo: THREE.BufferGeometry | null = null;

  constructor(private scene: THREE.Scene) {}

  public init(quality: GraphicsQuality) {
    this.createInstancedGrass(quality);
    this.createTreesAndRocks();
    this.createAncientRuins();
    this.createAmbientParticles();
    this.createMountainSnowfall();
  }

  /**
   * Instanced Multi-Blade Grass Carpet with GLSL Wind Animation & Altitude Scaling
   */
  private createInstancedGrass(quality: GraphicsQuality) {
    const count = isMobileDevice
      ? (quality === 'ultra' ? 60000 : quality === 'high' ? 45000 : 32000)
      : (quality === 'ultra' ? 240000 : quality === 'high' ? 160000 : 100000);

    const bladeGeo = new THREE.BufferGeometry();
    const posList: number[] = [];
    const uvList: number[] = [];
    const indexList: number[] = [];

    const bladesCount = isMobileDevice ? 10 : 14;
    const vertsPerBlade = 5;
    const bladeWidthBase = isMobileDevice ? 0.16 : 0.11; // Wider base for rich carpet coverage
    const bladeWidthMid = isMobileDevice ? 0.10 : 0.07;
    const baseBladeHeight = 0.52; // Vibrant height

    for (let b = 0; b < bladesCount; b++) {
      // Golden ratio spiral distribution across a 0.55m patch radius
      const phi = b * 2.39996; // ~137.5 degrees
      const dist = Math.sqrt((b + 0.5) / bladesCount) * 0.55;
      const offsetX = Math.cos(phi) * dist;
      const offsetZ = Math.sin(phi) * dist;

      // Varied blade facing direction and natural outward arching fan
      const bladeAngle = (b / bladesCount) * Math.PI * 2 + (b * 1.7);
      const cosA = Math.cos(bladeAngle);
      const sinA = Math.sin(bladeAngle);

      const hScale = 0.8 + ((b * 19) % 13) * 0.045;
      const h = baseBladeHeight * hScale;

      const baseVertIdx = b * vertsPerBlade;

      // Base vertices
      const xL = offsetX - bladeWidthBase * cosA;
      const zL = offsetZ - bladeWidthBase * sinA;
      const xR = offsetX + bladeWidthBase * cosA;
      const zR = offsetZ + bladeWidthBase * sinA;

      // Mid vertices with natural outward arching curve
      const bendFactor = 0.04 + (dist * 0.06);
      const dirX = dist > 0.001 ? offsetX / dist : cosA;
      const dirZ = dist > 0.001 ? offsetZ / dist : sinA;

      const bendX = dirX * bendFactor;
      const bendZ = dirZ * bendFactor;

      const xML = offsetX + bendX - bladeWidthMid * cosA;
      const zML = offsetZ + bendZ - bladeWidthMid * sinA;
      const xMR = offsetX + bendX + bladeWidthMid * cosA;
      const zMR = offsetZ + bendZ + bladeWidthMid * sinA;

      // Tip vertex with full outward arch
      const xT = offsetX + bendX * 2.4;
      const zT = offsetZ + bendZ * 2.4;

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
        uBaseColor: { value: new THREE.Color('#14532d') }, // Rich deep forest green
        uTipColor: { value: new THREE.Color('#84cc16') },  // Vibrant sunlit lime green
      },
      vertexShader: `
        uniform float uTime;
        varying vec2 vUv;
        varying float vHeightNorm;

        void main() {
          vUv = uv;
          vec3 pos = position;

          // Natural gentle wind swaying on upper parts of grass
          float heightFactor = pos.y * pos.y * 2.2;
          float windX = sin(uTime * 2.8 + instanceMatrix[3][0] * 0.35 + instanceMatrix[3][2] * 0.35) * 0.15;
          float windZ = cos(uTime * 2.2 + instanceMatrix[3][0] * 0.35 - instanceMatrix[3][2] * 0.45) * 0.12;

          pos.x += windX * heightFactor;
          pos.z += windZ * heightFactor;

          vHeightNorm = clamp(pos.y / 0.52, 0.0, 1.0);

          vec4 instancePosition = instanceMatrix * vec4(pos, 1.0);
          gl_Position = projectionMatrix * viewMatrix * instancePosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uBaseColor;
        uniform vec3 uTipColor;
        varying vec2 vUv;
        varying float vHeightNorm;

        void main() {
          // Deep soil shadow green at base to vibrant sunlit green at tips
          vec3 color = mix(uBaseColor, uTipColor, vHeightNorm);
          gl_FragColor = vec4(color, 1.0);
        }
      `,
    });

    const mesh = new THREE.InstancedMesh(bladeGeo, this.grassMaterial, count);
    mesh.name = 'GrassInstanced';

    const dummy = new THREE.Object3D();
    let placed = 0;

    // Concentric density sampling: 70% concentrated in active play area (0 - 180m radius)
    for (let i = 0; i < count * 8 && placed < count; i++) {
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

      // Cover green ground above water level and below high rocky peaks
      if (y > TerrainManager.WATER_LEVEL + 0.08 && y < 39.0 && slope < 0.52) {
        dummy.position.set(x, y, z);
        dummy.rotation.y = Math.random() * Math.PI * 2;

        // Near water grass is much lusher, taller and thicker (shoreline reeds & dense grass)
        const altitudeScale = Math.max(0.35, 1.0 - Math.max(0, (y - 22.0) / 16.0));
        const waterBoost = isNearWater ? 1.55 : 1.0;
        const baseScale = (0.9 + Math.random() * 0.5) * waterBoost;
        const finalScale = baseScale * altitudeScale;

        dummy.scale.set(finalScale, finalScale * (isNearWater ? 1.45 : 1.0), finalScale);
        dummy.updateMatrix();

        mesh.setMatrixAt(placed, dummy.matrix);
        placed++;
      }
    }

    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = true;
    this.scene.add(mesh);
    this.grassMesh = mesh;
  }

  /**
   * Remove/hide grass instances within a given radius around a built structure
   */
  public removeGrassInRadius(x: number, z: number, radius: number) {
    if (!this.grassMesh) return;
    const count = this.grassMesh.count;
    const dummyMatrix = new THREE.Matrix4();
    let modified = false;

    for (let i = 0; i < count; i++) {
      this.grassMesh.getMatrixAt(i, dummyMatrix);
      const gx = dummyMatrix.elements[12];
      const gz = dummyMatrix.elements[14];
      const distSq = (gx - x) * (gx - x) + (gz - z) * (gz - z);
      if (distSq < radius * radius) {
        if (dummyMatrix.elements[0] !== 0) {
          dummyMatrix.makeScale(0, 0, 0);
          this.grassMesh.setMatrixAt(i, dummyMatrix);
          modified = true;
        }
      }
    }

    if (modified) {
      this.grassMesh.instanceMatrix.needsUpdate = true;
    }
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
      size: 0.85,
      map: flakeTexture,
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
    });

    this.snowParticleSystem = new THREE.Points(geometry, material);
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
      size: 14.0,
      map: mistTexture,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
      sizeAttenuation: true,
      blending: THREE.AdditiveBlending,
      color: 0xd8eeff,
    });

    this.snowMistSystem = new THREE.Points(mistGeo, mistMat);
    this.snowMistGeo = mistGeo;
    this.scene.add(this.snowMistSystem);
  }

  public update(time: number, delta: number, playerPos?: THREE.Vector3) {
    if (this.grassMaterial) {
      this.grassMaterial.uniforms.uTime.value = time;
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

    // Animate Mountain Snowfall Flakes
    if (this.snowGeo && this.snowGeo.attributes.position) {
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
    if (this.snowMistGeo && this.snowMistGeo.attributes.position) {
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
