import * as THREE from 'three';
import { TerrainManager } from './Terrain';

export class TerrainDeformationManager {
  // Store height deltas keyed by "gridX_gridZ" or vertex index
  private deltas: Map<string, number> = new Map();
  private terrainMesh: THREE.Mesh | null = null;
  private terrainGeometry: THREE.PlaneGeometry | null = null;

  constructor(private terrainManager: TerrainManager) {
    this.terrainMesh = terrainManager.terrainMesh;
    this.terrainGeometry = terrainManager.terrainGeometry;
    this.loadDeltas();
  }

  private getKey(x: number, z: number): string {
    const gx = Math.round(x * 2.0); // 0.5m grid precision
    const gz = Math.round(z * 2.0);
    return `${gx}_${gz}`;
  }

  /**
   * Modify terrain height at world position (x, z) within a given radius.
   * deltaY > 0 -> Pile up dirt mound
   * deltaY < 0 -> Dig pit / trench
   */
  public deformTerrain(worldX: number, worldZ: number, deltaY: number, radius: number = 2.2): boolean {
    if (!this.terrainGeometry || !this.terrainMesh) return false;

    const posAttr = this.terrainGeometry.attributes.position;
    const count = posAttr.count;
    let modified = false;

    // Convert world position to terrain mesh local space if needed
    for (let i = 0; i < count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);

      const dist = Math.hypot(vx - worldX, vz - worldZ);
      if (dist < radius) {
        // Gaussian smooth falloff
        const falloff = Math.cos((dist / radius) * (Math.PI * 0.5));
        const amount = deltaY * falloff;

        const currentY = posAttr.getY(i);
        // Limit digging to not go lower than water level - 1.5m
        const newY = Math.max(TerrainManager.WATER_LEVEL - 1.2, currentY + amount);
        posAttr.setY(i, newY);

        const key = this.getKey(vx, vz);
        const existingDelta = this.deltas.get(key) || 0;
        const totalDelta = existingDelta + (newY - currentY);
        this.deltas.set(key, totalDelta);
        TerrainManager.setDeformationDelta(vx, vz, totalDelta);

        modified = true;
      }
    }

    if (modified) {
      posAttr.needsUpdate = true;
      this.terrainGeometry.computeVertexNormals();

      // Clear/invalidate heightmap cache in TerrainManager so physics uses updated heights
      TerrainManager.clearHeightmapCache();

      // Save deltas to localStorage
      this.saveDeltas();
    }

    return modified;
  }

  /**
   * Save terrain deltas to localStorage for persistence across sessions
   */
  private saveDeltas() {
    try {
      const obj: Record<string, number> = {};
      this.deltas.forEach((val, key) => {
        if (Math.abs(val) > 0.01) {
          obj[key] = val;
        }
      });
      localStorage.setItem('HYRULE_TERRAIN_DELTAS', JSON.stringify(obj));
    } catch (e) {
      console.warn('Failed to save terrain deltas:', e);
    }
  }

  /**
   * Load saved terrain deltas on startup
   */
  private loadDeltas() {
    try {
      const raw = localStorage.getItem('HYRULE_TERRAIN_DELTAS');
      if (!raw || !this.terrainGeometry) return;

      const obj: Record<string, number> = JSON.parse(raw);
      const posAttr = this.terrainGeometry.attributes.position;
      const count = posAttr.count;
      let loadedCount = 0;

      for (let i = 0; i < count; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        const key = this.getKey(vx, vz);

        if (obj[key]) {
          const delta = obj[key];
          this.deltas.set(key, delta);
          TerrainManager.setDeformationDelta(vx, vz, delta);
          posAttr.setY(i, posAttr.getY(i) + delta);
          loadedCount++;
        }
      }

      if (loadedCount > 0) {
        posAttr.needsUpdate = true;
        this.terrainGeometry.computeVertexNormals();
        TerrainManager.clearHeightmapCache();
      }
    } catch (e) {
      console.warn('Failed to load terrain deltas:', e);
    }
  }

  /**
   * Clears all deformation deltas in memory and localStorage
   */
  public clearAllDeltas() {
    this.deltas.clear();
    TerrainManager.clearHeightmapCache();
    try {
      localStorage.removeItem('HYRULE_TERRAIN_DELTAS');
    } catch {}
  }
}
