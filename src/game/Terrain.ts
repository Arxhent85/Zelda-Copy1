import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';

// Initialize noise generators with fixed seeds for deterministic world generation
const noise2DPrimary = createNoise2D(() => 0.42);
const noise2DSecondary = createNoise2D(() => 0.88);
const noise2DDetail = createNoise2D(() => 0.13);

const isMobile = typeof window !== 'undefined' && (
  /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
  ('ontouchstart' in window && window.innerWidth < 1024)
);

export class TerrainManager {
  public static WORLD_SIZE = 800; // 800m x 800m open world terrain
  public static SEGMENTS = isMobile ? 160 : 220; // Crisp, smooth mountain ridges on mobile & desktop
  public static WATER_LEVEL = 1.5;

  public terrainMesh: THREE.Mesh | null = null;
  public terrainGeometry: THREE.PlaneGeometry | null = null;

  // Active grid representation for instant, 100% accurate physics height sampling & terraforming
  public static activeHeightGrid: Float32Array | null = null;
  public static customColorGrid: Float32Array | null = null;
  public static gridResolution: number = isMobile ? 160 : 220;
  public static halfSize: number = 400;

  constructor() {}

  private static deformationDeltas: Map<string, number> = new Map();

  public static clearHeightmapCache() {
    // Allows resetting or updating cache if needed
  }

  public static setDeformationDelta(x: number, z: number, deltaY: number) {
    const gx = Math.round(x * 2.0);
    const gz = Math.round(z * 2.0);
    const key = `${gx}_${gz}`;
    this.deformationDeltas.set(key, deltaY);
  }

  public static getDeformationDelta(x: number, z: number): number {
    const gx = Math.round(x * 2.0);
    const gz = Math.round(z * 2.0);
    const key = `${gx}_${gz}`;
    return this.deformationDeltas.get(key) || 0;
  }

  /**
   * Computes height Y for any 3D coordinate (x, z)
   * Samples directly from activeHeightGrid with bilinear interpolation when active,
   * falling back to analytical heightmap formula otherwise.
   */
  public static getTerrainHeight(x: number, z: number): number {
    if (this.activeHeightGrid) {
      const segs = this.gridResolution;
      const step = (this.halfSize * 2) / segs;
      const gx = (x + this.halfSize) / step;
      const gz = (z + this.halfSize) / step;

      const c0 = Math.max(0, Math.min(segs, Math.floor(gx)));
      const r0 = Math.max(0, Math.min(segs, Math.floor(gz)));
      const c1 = Math.min(segs, c0 + 1);
      const r1 = Math.min(segs, r0 + 1);

      const fx = gx - c0;
      const fz = gz - r0;

      const stride = segs + 1;
      const h00 = this.activeHeightGrid[r0 * stride + c0];
      const h10 = this.activeHeightGrid[r0 * stride + c1];
      const h01 = this.activeHeightGrid[r1 * stride + c0];
      const h11 = this.activeHeightGrid[r1 * stride + c1];

      const top = h00 * (1 - fx) + h10 * fx;
      const bottom = h01 * (1 - fx) + h11 * fx;
      return top * (1 - fz) + bottom * fz;
    }
    // Center origin offset
    const nx = x * 0.003;
    const nz = z * 0.003;

    // Base continental elevation
    let height = noise2DPrimary(nx, nz) * 25.0;

    // Mountain ridges (North & West region)
    const mountainWeight = Math.max(0, (z + 100) / 300) * Math.max(0, (x + 200) / 400);
    const mountainNoise = Math.abs(noise2DSecondary(nx * 2.5, nz * 2.5));
    height += mountainNoise * 65.0 * mountainWeight;

    // Rolling hill details
    const hillNoise = noise2DDetail(nx * 8.0, nz * 8.0) * 4.0;
    height += hillNoise;

    // Central Shrine Basin flattening (soft valley around 0, 0)
    const distFromCenter = Math.sqrt(x * x + z * z);
    if (distFromCenter < 90) {
      const flattenFactor = Math.min(1.0, distFromCenter / 90);
      const targetHeight = 4.0 + noise2DDetail(nx * 5, nz * 5) * 1.5;
      height = THREE.MathUtils.lerp(targetHeight, height, flattenFactor);
    }

    // Lake carving (South-East region around x=150, z=-150)
    const lakeDx = x - 150;
    const lakeDz = z + 150;
    const distFromLake = Math.sqrt(lakeDx * lakeDx + lakeDz * lakeDz);
    if (distFromLake < 120) {
      const lakeFactor = Math.pow(Math.max(0, 1 - distFromLake / 120), 2);
      height -= lakeFactor * 18.0;
    }

    // Factor in user dig/build terrain deformation deltas
    const delta = TerrainManager.getDeformationDelta(x, z);
    height += delta;

    return height;
  }

  /**
   * Computes exact surface normal vector at coordinate (x, z)
   */
  public static getTerrainNormal(x: number, z: number): THREE.Vector3 {
    const delta = 0.5;
    const hL = TerrainManager.getTerrainHeight(x - delta, z);
    const hR = TerrainManager.getTerrainHeight(x + delta, z);
    const hD = TerrainManager.getTerrainHeight(x, z - delta);
    const hU = TerrainManager.getTerrainHeight(x, z + delta);

    const normal = new THREE.Vector3(hL - hR, 2.0 * delta, hD - hU);
    normal.normalize();
    return normal;
  }

  /**
   * Checks whether the ground at (x, z) is covered in snow
   */
  public static isSnowAt(x: number, z: number): boolean {
    const vy = TerrainManager.getTerrainHeight(x, z);
    const normal = TerrainManager.getTerrainNormal(x, z);
    if (vy > 24.0 && normal.y > 0.35) return true;
    if (vy > 18.0 && normal.y > 0.65) return true;
    return false;
  }

  /**
   * Build procedural terrain mesh with custom vertex colors for biomes
   */
  public createTerrainMesh(): THREE.Mesh {
    const size = TerrainManager.WORLD_SIZE;
    const segments = TerrainManager.SEGMENTS;

    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2); // Lay flat on XZ plane

    const posAttr = geometry.attributes.position;
    const count = posAttr.count;

    // Color attributes for biomes (Plains green, sand, rock grey, peak snow)
    const colors = new Float32Array(count * 3);
    const color = new THREE.Color();

    const cSand = new THREE.Color('#d8b982');
    const cPlainsGreen = new THREE.Color('#3e8e38');
    const cEmeraldValley = new THREE.Color('#5cb84d');
    const cForestMoss = new THREE.Color('#27592a');
    const cRockDark = new THREE.Color('#3f4957');
    const cRockLight = new THREE.Color('#667588');
    const cSnowIce = new THREE.Color('#b8dafc');
    const cSnowPure = new THREE.Color('#f8fbff');
    const tmpSlopeCol = new THREE.Color();
    const tmpBiomeCol = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);

      const vy = TerrainManager.getTerrainHeight(vx, vz);
      posAttr.setY(i, vy);

      const normal = TerrainManager.getTerrainNormal(vx, vz);
      const slope = 1.0 - normal.y; // 0 = flat, 1 = vertical cliff
      const detailVar = (noise2DDetail(vx * 0.055, vz * 0.055) + 1.0) * 0.5;
      const microVar = (noise2DDetail(vx * 0.19, vz * 0.19) + 1.0) * 0.5;

      // 1. Rich BotW Emerald Meadow & Warm Savanna Grass Patching (no pale pastel green!)
      tmpBiomeCol.copy(cPlainsGreen).lerp(cEmeraldValley, detailVar * 0.8 + microVar * 0.2);

      // Shoreline wet golden beach blend
      const shoreT = THREE.MathUtils.smoothstep(vy, TerrainManager.WATER_LEVEL - 0.6, TerrainManager.WATER_LEVEL + 2.0);
      color.copy(cSand).lerp(tmpBiomeCol, shoreT);

      // Mid-altitude alpine pine forest floor (12m -> 24m)
      const forestT = THREE.MathUtils.smoothstep(vy + detailVar * 3.0, 12.0, 24.0);
      color.lerp(cForestMoss, forestT * 0.72);

      // Rugged Rocky Cliffs & Ridges (lower slope threshold so hillsides look sculpted & geological!)
      const rockSlopeT = THREE.MathUtils.smoothstep(slope + microVar * 0.08, 0.18, 0.44);
      const highRockT = THREE.MathUtils.smoothstep(vy + detailVar * 4.0, 22.0, 34.0);
      const rockMask = Math.max(rockSlopeT, highRockT * 0.82);
      tmpSlopeCol.copy(cRockDark).lerp(cRockLight, detailVar * 0.65 + normal.y * 0.25);
      color.lerp(tmpSlopeCol, rockMask);

      // True High-Altitude Glacial Snow Caps ONLY on tall summits (vy > 31m)
      const snowAltT = THREE.MathUtils.smoothstep(vy + detailVar * 4.5, 30.5, 40.0);
      const snowFlatT = THREE.MathUtils.smoothstep(normal.y, 0.42, 0.78);
      const snowAmount = snowAltT * (0.28 + 0.72 * snowFlatT);
      tmpBiomeCol.copy(cSnowIce).lerp(cSnowPure, THREE.MathUtils.smoothstep(vy, 34.0, 44.0));
      color.lerp(tmpBiomeCol, snowAmount);

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0.02,
      flatShading: false,
    });

    // High-Contrast AAA Stylized Biome Shader (Crisp sunlit ridges vs cool teal/indigo shadows, textured micro-relief!)
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      this.terrainMaterialShader = shader;

      shader.vertexShader = `
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;
        varying float vTerrainLocalY;
        ${shader.vertexShader}
      `.replace(
        '#include <worldpos_vertex>',
        `
        #include <worldpos_vertex>
        vTerrainLocalY = transformed.y;
        vTerrainWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vTerrainWorldNormal = normalize(objectNormal);
        `
      );

      shader.fragmentShader = `
        uniform float uTime;
        varying vec3 vTerrainWorldPos;
        varying vec3 vTerrainWorldNormal;
        varying float vTerrainLocalY;
        ${shader.fragmentShader}
      `.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>

        vec3 wPos = vTerrainWorldPos;
        vec3 wNorm = normalize(vTerrainWorldNormal);
        vec3 sunDir = normalize(vec3(0.55, 0.72, 0.42));
        float sunDot = clamp(dot(wNorm, sunDir), 0.0, 1.0);
        float ridgeAngle = 1.0 - clamp(wNorm.y, 0.0, 1.0);

        // Multi-scale bounded procedural micro-detail so hills never look plastic or airbrushed!
        float macroPat = sin(wPos.x * 0.045 + cos(wPos.z * 0.038) * 1.4) * sin(wPos.z * 0.045);
        float finePat = sin(wPos.x * 0.24) * cos(wPos.z * 0.24) * 0.5 + sin((wPos.x + wPos.z) * 0.55) * 0.5;

        // 1. High-altitude alpine snow ONLY on lofty peaks (> 31.5m local), keeping crisp shadow contrast
        float pixelSnowAlt = smoothstep(31.5, 41.0, vTerrainLocalY + macroPat * 2.5);
        float pixelSnowSlope = smoothstep(0.45, 0.78, wNorm.y);
        float pixelSnowMask = pixelSnowAlt * (0.25 + 0.75 * pixelSnowSlope);

        if (pixelSnowMask > 0.02) {
          vec3 snowShadow = vec3(0.36, 0.52, 0.74); // Cool crisp alpine shadow!
          vec3 snowSun = vec3(1.0, 0.98, 0.94);     // Warm sunlit crest!
          float crispLit = smoothstep(0.18, 0.78, sunDot);
          vec3 snowCol = mix(snowShadow, snowSun, crispLit);
          snowCol += vec3(finePat * 0.025);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, snowCol, pixelSnowMask * 0.85);
        }

        // 2. Sculpted World-Space Cliff Strata & Granite Cracks on slopes (high geological crispness!)
        float cliffMask = smoothstep(0.18, 0.48, ridgeAngle) * (1.0 - pixelSnowMask * 0.75);
        if (cliffMask > 0.02) {
          float strataBand = sin(vTerrainLocalY * 1.45 + macroPat * 1.8) * 0.065
                           + sin(vTerrainLocalY * 3.8 + finePat * 1.2) * 0.035;
          vec3 rockShadow = vec3(0.18, 0.22, 0.30);
          vec3 rockLit = vec3(0.56, 0.62, 0.68);
          vec3 rockTone = mix(rockShadow, rockLit, smoothstep(0.12, 0.85, sunDot)) + vec3(strataBand);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, max(rockTone, vec3(0.08)), cliffMask * 0.72);
        }

        // 3. Meadow Grass Texture & Sunlight Contrast in valleys
        if (cliffMask < 0.5 && pixelSnowMask < 0.25 && vTerrainLocalY > 2.2) {
          float grassGrain = macroPat * 0.045 + finePat * 0.035;
          gl_FragColor.rgb += vec3(grassGrain * 0.6, grassGrain * 1.05, grassGrain * 0.3);
        }

        // 4. Crisp Sun-vs-Shadow Micro-Contrast Boost (rich dark shadow valleys vs warm golden highlights)
        float shadowContrast = mix(0.76, 1.12, smoothstep(0.1, 0.85, sunDot));
        gl_FragColor.rgb *= shadowContrast;
        gl_FragColor.rgb = mix(gl_FragColor.rgb, gl_FragColor.rgb * vec3(0.84, 0.90, 1.08), (1.0 - sunDot) * 0.22);
        `
      );
    };

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'TerrainMesh';

    this.terrainMesh = mesh;
    this.terrainGeometry = geometry;

    // Cache active grid for instant bilinear physics sampling
    TerrainManager.activeHeightGrid = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      TerrainManager.activeHeightGrid[i] = posAttr.getY(i);
    }
    TerrainManager.gridResolution = segments;
    TerrainManager.halfSize = size / 2;

    return mesh;
  }

  public terrainMaterialShader: { uniforms: { [key: string]: THREE.IUniform } } | null = null;

  public updateTime(time: number) {
    if (this.terrainMaterialShader && this.terrainMaterialShader.uniforms.uTime) {
      this.terrainMaterialShader.uniforms.uTime.value = time;
    }
  }

  /**
   * Sync activeHeightGrid from geometry position attribute
   */
  public syncHeightGrid() {
    if (!this.terrainGeometry) return;
    const pos = this.terrainGeometry.attributes.position;
    const count = pos.count;
    if (!TerrainManager.activeHeightGrid || TerrainManager.activeHeightGrid.length !== count) {
      TerrainManager.activeHeightGrid = new Float32Array(count);
    }
    for (let i = 0; i < count; i++) {
      TerrainManager.activeHeightGrid[i] = pos.getY(i);
    }
  }

  /**
   * Apply bulk heights array (e.g. from template or load game)
   */
  public applyHeightsArray(heights: Float32Array) {
    if (!this.terrainGeometry) return;
    const pos = this.terrainGeometry.attributes.position;
    const count = Math.min(pos.count, heights.length);
    for (let i = 0; i < count; i++) {
      pos.setY(i, heights[i]);
    }
    pos.needsUpdate = true;
    this.terrainGeometry.computeVertexNormals();
    this.syncHeightGrid();
  }

  /**
   * Apply bulk colors array (e.g. from template or load game)
   */
  public applyColorsArray(colors: Float32Array) {
    if (!this.terrainGeometry) return;
    const colAttr = this.terrainGeometry.attributes.color;
    if (!colAttr) return;
    const count = Math.min(colAttr.count * 3, colors.length);
    const arr = colAttr.array as Float32Array;
    for (let i = 0; i < count; i++) {
      arr[i] = colors[i];
    }
    colAttr.needsUpdate = true;
  }

  /**
   * Pristine procedural height formula without any deformation deltas
   */
  public static getOriginalProceduralHeight(x: number, z: number): number {
    const nx = x * 0.003;
    const nz = z * 0.003;

    // Base continental elevation
    let height = noise2DPrimary(nx, nz) * 25.0;

    // Mountain ridges (North & West region)
    const mountainWeight = Math.max(0, (z + 100) / 300) * Math.max(0, (x + 200) / 400);
    const mountainNoise = Math.abs(noise2DSecondary(nx * 2.5, nz * 2.5));
    height += mountainNoise * 65.0 * mountainWeight;

    // Rolling hill details
    const hillNoise = noise2DDetail(nx * 8.0, nz * 8.0) * 4.0;
    height += hillNoise;

    // Central Shrine Basin flattening (soft valley around 0, 0)
    const distFromCenter = Math.sqrt(x * x + z * z);
    if (distFromCenter < 90) {
      const flattenFactor = Math.min(1.0, distFromCenter / 90);
      const targetHeight = 4.0 + noise2DDetail(nx * 5, nz * 5) * 1.5;
      height = THREE.MathUtils.lerp(targetHeight, height, flattenFactor);
    }

    // Lake carving (South-East region around x=150, z=-150)
    const lakeDx = x - 150;
    const lakeDz = z + 150;
    const distFromLake = Math.sqrt(lakeDx * lakeDx + lakeDz * lakeDz);
    if (distFromLake < 120) {
      const lakeFactor = Math.pow(Math.max(0, 1 - distFromLake / 120), 2);
      height -= lakeFactor * 18.0;
    }

    return height;
  }

  /**
   * Resets the entire terrain back to pristine procedural starter state:
   * clears all deformation deltas, restores original procedural heights and biome vertex colors.
   */
  public resetToOriginalProceduralTerrain() {
    TerrainManager.deformationDeltas.clear();
    TerrainManager.WATER_LEVEL = 1.0;

    if (!this.terrainGeometry) return;
    const posAttr = this.terrainGeometry.attributes.position;
    const colAttr = this.terrainGeometry.attributes.color;
    const count = posAttr.count;

    const cSand = new THREE.Color('#e5d3b3');
    const cPlainsGreen = new THREE.Color('#52a446');
    const cEmeraldValley = new THREE.Color('#65be54');
    const cForestMoss = new THREE.Color('#3a7532');
    const cRockSlate = new THREE.Color('#64748b');
    const cSnowPure = new THREE.Color('#ffffff');
    const cSnowIce = new THREE.Color('#dbeafe');
    const tempCol = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const vy = TerrainManager.getOriginalProceduralHeight(vx, vz);
      posAttr.setY(i, vy);
    }
    posAttr.needsUpdate = true;
    this.terrainGeometry.computeVertexNormals();
    this.syncHeightGrid();

    if (colAttr) {
      for (let i = 0; i < count; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        const vy = posAttr.getY(i);
        const normal = TerrainManager.getTerrainNormal(vx, vz);
        const slope = 1.0 - normal.y;

        if (vy < TerrainManager.WATER_LEVEL + 1.2) {
          tempCol.copy(cSand).lerp(cPlainsGreen, Math.max(0, (vy - TerrainManager.WATER_LEVEL) / 1.2));
        } else if (slope > 0.48) {
          tempCol.copy(cRockSlate);
          if (vy > 25.0) tempCol.lerp(cSnowPure, Math.min(1.0, (vy - 25.0) / 20.0) * 0.35);
        } else if (vy > 25.0) {
          const snowDepth = Math.min(1.0, (vy - 25.0) / 10.0);
          const uprightFactor = Math.pow(Math.max(0, normal.y), 1.5);
          if (uprightFactor > 0.35) {
            tempCol.copy(cSnowIce).lerp(cSnowPure, snowDepth * uprightFactor);
          } else {
            tempCol.copy(cRockSlate).lerp(cSnowIce, snowDepth * 0.5);
          }
        } else if (vy > 18.0) {
          const alpineFactor = (vy - 18.0) / 7.0;
          const noiseVar = (noise2DDetail(vx * 0.08, vz * 0.08) + 1.0) * 0.5;
          const uprightFactor = Math.max(0, normal.y);
          if (noiseVar + alpineFactor * 0.8 > 0.72 && uprightFactor > 0.5) {
            tempCol.copy(cSnowIce).lerp(cSnowPure, 0.7);
          } else {
            tempCol.copy(cForestMoss).lerp(cRockSlate, alpineFactor * 0.4);
          }
        } else {
          const detailVar = (noise2DDetail(vx * 0.05, vz * 0.05) + 1.0) * 0.5;
          tempCol.copy(cPlainsGreen).lerp(cEmeraldValley, detailVar);
        }

        colAttr.setXYZ(i, tempCol.r, tempCol.g, tempCol.b);
      }
      colAttr.needsUpdate = true;
    }
  }
}
