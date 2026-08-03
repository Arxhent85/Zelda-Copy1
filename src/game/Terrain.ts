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
  public static SEGMENTS = isMobile ? 120 : 200; // Adaptive grid resolution for mobile performance
  public static WATER_LEVEL = 1.5;

  public terrainMesh: THREE.Mesh | null = null;
  public terrainGeometry: THREE.PlaneGeometry | null = null;

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
   * Analytical Heightmap function - computes height Y for any 3D coordinate (x, z)
   */
  public static getTerrainHeight(x: number, z: number): number {
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

    const cSand = new THREE.Color('#d4b886');
    const cPlainsGreen = new THREE.Color('#3b7a36');
    const cEmeraldValley = new THREE.Color('#4a8f3c');
    const cForestMoss = new THREE.Color('#2d5727');
    const cRockSlate = new THREE.Color('#555f68');
    const cSnowIce = new THREE.Color('#d2e8ff');
    const cSnowPure = new THREE.Color('#fcfdff');

    for (let i = 0; i < count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);

      const vy = TerrainManager.getTerrainHeight(vx, vz);
      posAttr.setY(i, vy);

      const normal = TerrainManager.getTerrainNormal(vx, vz);
      const slope = 1.0 - normal.y; // 0 = flat, 1 = vertical cliff

      // Biome color blending logic with Directional Snow Accumulation (Snowflow Shader effect)
      if (vy < TerrainManager.WATER_LEVEL + 1.2) {
        // Sand / Shoreline
        color.copy(cSand).lerp(cPlainsGreen, Math.max(0, (vy - TerrainManager.WATER_LEVEL) / 1.2));
      } else if (slope > 0.48) {
        // Steep Cliff Rocks
        color.copy(cRockSlate);
        // High steep cliffs get subtle ice frosting
        if (vy > 25.0) color.lerp(cSnowPure, Math.min(1.0, (vy - 25.0) / 20.0) * 0.35);
      } else if (vy > 25.0) {
        // Directional Snowflow: Upward flat and gentle mountain slopes collect thick, pristine snow
        const snowDepth = Math.min(1.0, (vy - 25.0) / 10.0);
        const uprightFactor = Math.pow(Math.max(0, normal.y), 1.5);
        
        if (uprightFactor > 0.35) {
          color.copy(cSnowIce).lerp(cSnowPure, snowDepth * uprightFactor);
        } else {
          color.copy(cRockSlate).lerp(cSnowIce, snowDepth * 0.5);
        }
      } else if (vy > 18.0) {
        // Alpine Transition Zone: Patchy snow drifts on grass & rocks
        const alpineFactor = (vy - 18.0) / 7.0;
        const noiseVar = (noise2DDetail(vx * 0.08, vz * 0.08) + 1.0) * 0.5;
        const uprightFactor = Math.max(0, normal.y);
        
        if (noiseVar + alpineFactor * 0.8 > 0.72 && uprightFactor > 0.5) {
          color.copy(cSnowIce).lerp(cSnowPure, 0.7);
        } else {
          color.copy(cForestMoss).lerp(cRockSlate, alpineFactor * 0.4);
        }
      } else {
        // Lush Emerald Plains Valley
        const detailVar = (noise2DDetail(vx * 0.05, vz * 0.05) + 1.0) * 0.5;
        color.copy(cPlainsGreen).lerp(cEmeraldValley, detailVar);
      }

      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.computeVertexNormals();

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.75,
      metalness: 0.08,
      flatShading: false,
    });

    // Custom Shader Modification for High-Precision Crystalline Snow Glint & Subsurface Scatter
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      this.terrainMaterialShader = shader;

      shader.fragmentShader = `
        uniform float uTime;
        ${shader.fragmentShader}
      `;

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <dithering_fragment>',
        `
        #include <dithering_fragment>

        // Detect snow vertices based on high cyan/white RGB tint
        if (gl_FragColor.r > 0.72 && gl_FragColor.b > 0.82) {
          // High-frequency procedural sparkle noise on snow crystals
          vec3 worldPos = vViewPosition;
          float pNoise = fract(sin(dot(worldPos.xz * 65.0 + vec2(uTime * 0.05), vec2(12.9898, 78.233))) * 43758.5453);
          float pSparkle = pow(pNoise, 38.0) * 3.5;

          // Sparkling glint depending on view angle
          vec3 viewDir = normalize(-vViewPosition);
          float sparkleFactor = clamp(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);

          // Subsurface Scattering tint (soft glacial blue in ambient shadows)
          gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.85, 0.93, 1.0), 0.12);
          gl_FragColor.rgb += vec3(0.95, 0.98, 1.0) * pSparkle * sparkleFactor;
        }
        `
      );
    };

    const mesh = new THREE.Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    mesh.name = 'TerrainMesh';

    this.terrainMesh = mesh;
    this.terrainGeometry = geometry;
    return mesh;
  }

  public terrainMaterialShader: { uniforms: { [key: string]: THREE.IUniform } } | null = null;

  public updateTime(time: number) {
    if (this.terrainMaterialShader && this.terrainMaterialShader.uniforms.uTime) {
      this.terrainMaterialShader.uniforms.uTime.value = time;
    }
  }
}
