import * as THREE from 'three';
import { TerrainManager } from './Terrain';
import { FoliageManager } from './Foliage';
import { EnemyManager } from './Enemies';
import { BuildingSystem, RoadMaterialType, RoadWallType } from './BuildingSystem';
import { CollectibleManager } from './Collectibles';
import { MiningAndHarvestingSystem } from './MiningAndHarvestingSystem';
import { MountSystem } from './MountSystem';
import { WildlifeManager } from './WildlifeManager';
import { VehicleSystem } from './VehicleSystem';
import { audioEngine } from './AudioEngine';

export type EditorToolType =
  | 'sculpt_raise'
  | 'sculpt_lower'
  | 'sculpt_flatten'
  | 'sculpt_smooth'
  | 'paint_grass'
  | 'paint_snow'
  | 'paint_rock'
  | 'paint_sand'
  | 'draw_walled_road'
  | 'plan_road'
  | 'place'
  | 'erase';

export interface PlacedEditorObject {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
  rotationY: number;
  mesh?: THREE.Object3D;
}

export class LevelEditorManager {
  public isEditorActive = false;
  public activeTool: EditorToolType = 'sculpt_raise';
  public brushRadius = 18.0; // in meters (3 to 60)
  public brushStrength = 0.8; // 0.1 to 2.5
  public selectedObjectType = 'tree_oak';
  public flattenTargetHeight = 6.0;
  public touchMode: 'paint' | 'camera' = 'paint';

  public placedObjects: PlacedEditorObject[] = [];
  public editorGroup = new THREE.Group();

  // Road drawing state
  private lastRoadPoint: { x: number; z: number } | null = null;
  public roadStrokeCount = 0;

  // 🛣️ Interactive Road & Track Path Planner State
  public roadPlannerPoints: THREE.Vector3[] = [];
  public roadPlannerMaterial: RoadMaterialType = 'asphalt';
  public roadPlannerWall: RoadWallType = 'racing_wall';
  public roadPlannerIsLoop: boolean = false;
  public roadPlannerWidth: number = 7.5;
  public roadPlannerHasStartGate: boolean = true;
  public lastBuiltRoadSegmentIds: string[] = [];
  public roadPreviewGroup: THREE.Group = new THREE.Group();
  public onRoadPathUpdated?: (info: { pointCount: number; lengthMeters: number; estimatedSegments: number }) => void;
  public onObstaclesChanged?: () => void;

  // 3D Brush Marker
  public brushMarker: THREE.Group = new THREE.Group();
  private brushRingMesh: THREE.Mesh;
  private brushCenterMesh: THREE.Mesh;
  private raycaster = new THREE.Raycaster();

  public hoverTerrainPos: THREE.Vector3 | null = null;
  public isApplyingTool = false;

  constructor(
    public scene: THREE.Scene,
    public terrainManager: TerrainManager,
    public foliageManager: FoliageManager,
    public enemyManager: EnemyManager,
    public buildingSystem: BuildingSystem,
    public collectibleManager: CollectibleManager,
    public miningSystem: MiningAndHarvestingSystem,
    public mountSystem?: MountSystem,
    public wildlifeManager?: WildlifeManager,
    public vehicleSystem?: VehicleSystem
  ) {
    this.editorGroup.name = 'LevelEditorGroup';
    this.scene.add(this.editorGroup);

    // Create 3D Brush Projection Ring
    const ringGeo = new THREE.RingGeometry(0.92, 1.0, 36);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    this.brushRingMesh = new THREE.Mesh(ringGeo, ringMat);

    const centerGeo = new THREE.SphereGeometry(0.4, 8, 8);
    const centerMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0.9,
    });
    this.brushCenterMesh = new THREE.Mesh(centerGeo, centerMat);

    this.brushMarker.add(this.brushRingMesh);
    this.brushMarker.add(this.brushCenterMesh);
    this.brushMarker.visible = false;
    this.scene.add(this.brushMarker);

    this.roadPreviewGroup.name = 'RoadPathPreviewGroup';
    this.scene.add(this.roadPreviewGroup);

    this.loadActiveWorld();
  }

  /**
   * Update 3D Brush ring position and radius on terrain
   */
  public updateBrushMarker(pos: THREE.Vector3) {
    this.hoverTerrainPos = pos;
    this.brushMarker.position.set(pos.x, pos.y + 0.15, pos.z);
    this.brushRingMesh.scale.set(this.brushRadius, this.brushRadius, this.brushRadius);
    this.brushMarker.visible = this.isEditorActive;

    // Change color based on active tool
    const ringMat = this.brushRingMesh.material as THREE.MeshBasicMaterial;
    const centerMat = this.brushCenterMesh.material as THREE.MeshBasicMaterial;

    if (this.activeTool === 'sculpt_raise' || this.activeTool === 'sculpt_flatten') {
      ringMat.color.setHex(0xf59e0b); // Gold
      centerMat.color.setHex(0xf59e0b);
    } else if (this.activeTool === 'sculpt_lower') {
      ringMat.color.setHex(0x06b6d4); // Cyan / Water
      centerMat.color.setHex(0x06b6d4);
    } else if (this.activeTool === 'sculpt_smooth') {
      ringMat.color.setHex(0xa855f7); // Purple
      centerMat.color.setHex(0xa855f7);
    } else if (this.activeTool === 'paint_grass') {
      ringMat.color.setHex(0x22c55e); // Green
      centerMat.color.setHex(0x22c55e);
    } else if (this.activeTool === 'paint_snow') {
      ringMat.color.setHex(0xf8fafc); // Pure White
      centerMat.color.setHex(0xf8fafc);
    } else if (this.activeTool === 'paint_rock') {
      ringMat.color.setHex(0x64748b); // Slate Rock
      centerMat.color.setHex(0x64748b);
    } else if (this.activeTool === 'paint_sand') {
      ringMat.color.setHex(0xeab308); // Sand
      centerMat.color.setHex(0xeab308);
    } else if (this.activeTool === 'draw_walled_road' || this.activeTool === 'plan_road') {
      ringMat.color.setHex(0x00f0ff); // Bright Cyan / Neon for Road Planner
      centerMat.color.setHex(0xfbbf24); // Golden pen stylus
    } else if (this.activeTool === 'place') {
      ringMat.color.setHex(0x3b82f6); // Blue
      centerMat.color.setHex(0x3b82f6);
    } else if (this.activeTool === 'erase') {
      ringMat.color.setHex(0xef4444); // Red
      centerMat.color.setHex(0xef4444);
    }
  }

  /**
   * Raycast from screen coordinate to terrain mesh
   */
  public raycastTerrain(screenX: number, screenY: number, camera: THREE.Camera): THREE.Vector3 | null {
    if (!this.terrainManager.terrainMesh) return null;
    this.raycaster.setFromCamera(new THREE.Vector2(screenX, screenY), camera);
    const hits = this.raycaster.intersectObject(this.terrainManager.terrainMesh);
    if (hits.length > 0) {
      return hits[0].point;
    }
    return null;
  }

  /**
   * Continuous sculpting, painting, and road drawing tick
   */
  public update(delta: number) {
    if (!this.isEditorActive || !this.isApplyingTool || !this.hoverTerrainPos) return;

    const { x, z } = this.hoverTerrainPos;

    if (this.activeTool.startsWith('sculpt_')) {
      this.applySculpt(x, z, delta);
    } else if (this.activeTool.startsWith('paint_')) {
      const biome = this.activeTool.replace('paint_', '') as 'grass' | 'snow' | 'rock' | 'sand';
      this.applyPaint(x, z, biome, delta);
    } else if (this.activeTool === 'draw_walled_road') {
      this.applyRoadStroke(x, z);
    } else if (this.activeTool === 'plan_road') {
      this.addRoadPathPoint(x, z, 2.8);
    }
  }

  /**
   * Sculpt Terrain relief
   */
  public applySculpt(worldX: number, worldZ: number, delta: number) {
    const geo = this.terrainManager.terrainGeometry;
    if (!geo) return;

    const posAttr = geo.attributes.position;
    const count = posAttr.count;
    const radius = this.brushRadius;
    const strength = this.brushStrength;
    const speed = 14.0 * strength * delta;

    let modified = false;

    // In 'smooth' mode, calculate mean average height in radius first
    let sumHeight = 0;
    let nearbyCount = 0;
    if (this.activeTool === 'sculpt_smooth') {
      for (let i = 0; i < count; i++) {
        const vx = posAttr.getX(i);
        const vz = posAttr.getZ(i);
        if (Math.hypot(vx - worldX, vz - worldZ) < radius) {
          sumHeight += posAttr.getY(i);
          nearbyCount++;
        }
      }
    }
    const avgHeight = nearbyCount > 0 ? sumHeight / nearbyCount : 0;

    for (let i = 0; i < count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const dist = Math.hypot(vx - worldX, vz - worldZ);

      if (dist < radius) {
        const falloff = Math.cos((dist / radius) * (Math.PI * 0.5));
        const currentY = posAttr.getY(i);
        let newY = currentY;

        if (this.activeTool === 'sculpt_raise') {
          newY += falloff * speed;
        } else if (this.activeTool === 'sculpt_lower') {
          // Can dig below water level to create lakes and rivers!
          newY = Math.max(-12.0, currentY - falloff * speed);
        } else if (this.activeTool === 'sculpt_flatten') {
          newY = THREE.MathUtils.lerp(currentY, this.flattenTargetHeight, falloff * Math.min(1.0, speed * 0.4));
        } else if (this.activeTool === 'sculpt_smooth') {
          newY = THREE.MathUtils.lerp(currentY, avgHeight, falloff * Math.min(1.0, speed * 0.35));
        }

        if (Math.abs(newY - currentY) > 0.001) {
          posAttr.setY(i, newY);
          modified = true;
        }
      }
    }

    if (modified) {
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
      this.terrainManager.syncHeightGrid();
      this.foliageManager.syncGrassHeightsInRadius(worldX, worldZ, radius + 4.0);
      this.miningSystem.syncNodesInRadius(worldX, worldZ, radius + 4.0);
      this.collectibleManager.syncCollectiblesInRadius(worldX, worldZ, radius + 4.0);
    }
  }

  /**
   * Paint Terrain biomes in real time (grows real 3D grass or removes it dynamically!)
   */
  public applyPaint(worldX: number, worldZ: number, biome: 'grass' | 'snow' | 'rock' | 'sand', delta: number) {
    const geo = this.terrainManager.terrainGeometry;
    if (!geo) return;

    const colAttr = geo.attributes.color;
    const posAttr = geo.attributes.position;
    if (!colAttr) return;

    const count = colAttr.count;
    const radius = this.brushRadius;
    const strength = this.brushStrength;
    const blendRate = Math.min(1.0, 5.0 * strength * delta);

    const targetColor = new THREE.Color();
    if (biome === 'grass') targetColor.setHex(0x3b7a36); // Emerald Grass
    else if (biome === 'snow') targetColor.setHex(0xfcfdff); // Pure Snow Ice
    else if (biome === 'rock') targetColor.setHex(0x555f68); // Dark Cliff Rock
    else if (biome === 'sand') targetColor.setHex(0xd4b886); // Shore Sand

    const curCol = new THREE.Color();
    let modified = false;

    for (let i = 0; i < count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const dist = Math.hypot(vx - worldX, vz - worldZ);

      if (dist < radius) {
        const falloff = Math.cos((dist / radius) * (Math.PI * 0.5));
        const r = colAttr.getX(i);
        const g = colAttr.getY(i);
        const b = colAttr.getZ(i);
        curCol.setRGB(r, g, b);

        curCol.lerp(targetColor, falloff * blendRate);

        colAttr.setXYZ(i, curCol.r, curCol.g, curCol.b);
        modified = true;
      }
    }

    if (modified) {
      colAttr.needsUpdate = true;

      // Dynamically GROW lush 3D grass if painting grass biome, or REMOVE grass if painting rock/snow/sand!
      if (biome === 'grass') {
        this.foliageManager.growGrassInRadius(worldX, worldZ, radius, this.brushStrength);
      } else {
        this.foliageManager.removeGrassInRadius(worldX, worldZ, radius * 0.95);
      }
    }
  }

  /**
   * Continuous road stroke drawing with side walls and auto-flattened terrain
   */
  public applyRoadStroke(worldX: number, worldZ: number) {
    if (!this.lastRoadPoint) {
      this.placeRoadSegment(worldX, worldZ, 0);
      this.lastRoadPoint = { x: worldX, z: worldZ };
      this.roadStrokeCount = 1;
      return;
    }

    const dx = worldX - this.lastRoadPoint.x;
    const dz = worldZ - this.lastRoadPoint.z;
    const dist = Math.hypot(dx, dz);
    const SEGMENT_STEP = 2.8; // segment length

    if (dist >= SEGMENT_STEP) {
      const steps = Math.floor(dist / SEGMENT_STEP);
      const angle = Math.atan2(dx, dz); // heading

      for (let s = 1; s <= steps; s++) {
        const t = (s * SEGMENT_STEP) / dist;
        const segX = this.lastRoadPoint.x + dx * t;
        const segZ = this.lastRoadPoint.z + dz * t;
        this.placeRoadSegment(segX, segZ, angle);
        this.roadStrokeCount++;
      }

      this.lastRoadPoint = {
        x: this.lastRoadPoint.x + dx * ((steps * SEGMENT_STEP) / dist),
        z: this.lastRoadPoint.z + dz * ((steps * SEGMENT_STEP) / dist),
      };
    }
  }

  public endRoadStroke() {
    this.lastRoadPoint = null;
  }

  /**
   * Helper to place a single walled road segment with ground flattening and foliage clearing
   */
  public placeRoadSegment(x: number, z: number, rotationY: number): THREE.Group {
    // 1. Level / flatten terrain slightly around segment so road sits flush
    const groundY = TerrainManager.getTerrainHeight(x, z);
    this.flattenTerrainUnderRoad(x, z, groundY, 4.2);

    // 2. Clear grass so it doesn't poke through road bed
    this.foliageManager.removeGrassInRadius(x, z, 3.8);

    // 3. Place walled_road structure
    const roadGroup = this.buildingSystem.placeBuildingAt('walled_road', new THREE.Vector3(x, groundY + 0.05, z), rotationY);

    const id = `editor_walled_road_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    this.placedObjects.push({
      id,
      type: 'walled_road',
      position: { x, y: groundY + 0.05, z },
      rotationY,
      mesh: roadGroup,
    });

    return roadGroup;
  }

  private flattenTerrainUnderRoad(worldX: number, worldZ: number, targetY: number, radius: number) {
    const geo = this.terrainManager.terrainGeometry;
    if (!geo) return;
    const posAttr = geo.attributes.position;
    const count = posAttr.count;
    let modified = false;

    for (let i = 0; i < count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      const d = Math.hypot(vx - worldX, vz - worldZ);
      if (d < radius) {
        const falloff = Math.cos((d / radius) * (Math.PI * 0.5));
        const curY = posAttr.getY(i);
        const newY = THREE.MathUtils.lerp(curY, targetY, falloff * 0.7);
        if (Math.abs(newY - curY) > 0.01) {
          posAttr.setY(i, newY);
          modified = true;
        }
      }
    }

    if (modified) {
      posAttr.needsUpdate = true;
      geo.computeVertexNormals();
      this.terrainManager.syncHeightGrid();
    }
  }

  // ==========================================
  // 🛣️ INTERACTIVE ROAD & TRACK PATH PLANNER
  // ==========================================

  public startRoadPath(worldX: number, worldZ: number) {
    const groundY = TerrainManager.getTerrainHeight(worldX, worldZ);
    this.roadPlannerPoints.push(new THREE.Vector3(worldX, groundY, worldZ));
    this.updateRoadPreview();
  }

  public addRoadPathPoint(worldX: number, worldZ: number, minDistance: number = 2.8) {
    if (this.roadPlannerPoints.length === 0) {
      this.startRoadPath(worldX, worldZ);
      return;
    }
    const last = this.roadPlannerPoints[this.roadPlannerPoints.length - 1];
    const dist = Math.hypot(worldX - last.x, worldZ - last.z);
    if (dist >= minDistance) {
      const groundY = TerrainManager.getTerrainHeight(worldX, worldZ);
      this.roadPlannerPoints.push(new THREE.Vector3(worldX, groundY, worldZ));
      this.updateRoadPreview();
    }
  }

  public endRoadPathStroke() {
    this.updateRoadPreview();
  }

  public clearPlannedPath() {
    this.roadPlannerPoints = [];
    this.clearRoadPreview();
    if (this.onRoadPathUpdated) {
      this.onRoadPathUpdated({ pointCount: 0, lengthMeters: 0, estimatedSegments: 0 });
    }
  }

  public toggleRoadLoop(isLoop?: boolean) {
    this.roadPlannerIsLoop = isLoop !== undefined ? isLoop : !this.roadPlannerIsLoop;
    this.updateRoadPreview();
  }

  public setRoadMaterial(mat: RoadMaterialType) {
    this.roadPlannerMaterial = mat;
  }

  public setRoadWall(wall: RoadWallType) {
    this.roadPlannerWall = wall;
  }

  public setRoadWidth(width: number) {
    this.roadPlannerWidth = Math.max(2.5, Math.min(20.0, width));
    this.updateRoadPreview();
  }

  public clearRoadPreview() {
    while (this.roadPreviewGroup.children.length > 0) {
      const obj = this.roadPreviewGroup.children[0];
      this.roadPreviewGroup.remove(obj);
      if ((obj as THREE.Mesh).geometry) {
        (obj as THREE.Mesh).geometry.dispose();
      }
    }
  }

  /**
   * Update dynamic glowing 3D path preview with Catmull-Rom spline, waypoints, and Start/Finish flags
   */
  public updateRoadPreview() {
    this.clearRoadPreview();

    const ptsCount = this.roadPlannerPoints.length;
    if (ptsCount === 0) {
      if (this.onRoadPathUpdated) {
        this.onRoadPathUpdated({ pointCount: 0, lengthMeters: 0, estimatedSegments: 0 });
      }
      return;
    }

    if (ptsCount === 1) {
      // Single start point marker
      const p = this.roadPlannerPoints[0];
      const y = TerrainManager.getTerrainHeight(p.x, p.z);
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.2, 16),
        new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.85 })
      );
      marker.position.set(p.x, y + 0.2, p.z);
      this.roadPreviewGroup.add(marker);
      if (this.onRoadPathUpdated) {
        this.onRoadPathUpdated({ pointCount: 1, lengthMeters: 0, estimatedSegments: 0 });
      }
      return;
    }

    // 2 or more points: generate Catmull-Rom spline
    const curve = new THREE.CatmullRomCurve3(this.roadPlannerPoints, this.roadPlannerIsLoop, 'centripetal', 0.5);
    const lengthMeters = curve.getLength();
    const SEGMENT_STEP = 2.8;
    const estimatedSegments = Math.max(2, Math.round(lengthMeters / SEGMENT_STEP));

    // Sample dense points for smooth visual line
    const divisions = Math.max(30, Math.min(250, Math.round(lengthMeters * 2)));
    const sampled = curve.getPoints(divisions);

    // Elevated spline line following terrain
    const elevatedPoints = sampled.map((pt) => {
      const groundY = TerrainManager.getTerrainHeight(pt.x, pt.z);
      return new THREE.Vector3(pt.x, groundY + 0.35, pt.z);
    });

    const lineGeo = new THREE.BufferGeometry().setFromPoints(elevatedPoints);
    const lineColor = this.roadPlannerIsLoop ? 0x10b981 : 0x00f0ff;
    const lineMat = new THREE.LineBasicMaterial({
      color: lineColor,
      linewidth: 3,
    });
    const lineMesh = new THREE.Line(lineGeo, lineMat);
    this.roadPreviewGroup.add(lineMesh);

    // Glowing Waypoint Spheres
    const wpGeo = new THREE.SphereGeometry(0.32, 8, 8);
    const wpMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    this.roadPlannerPoints.forEach((pt) => {
      const gy = TerrainManager.getTerrainHeight(pt.x, pt.z);
      const wp = new THREE.Mesh(wpGeo, wpMat);
      wp.position.set(pt.x, gy + 0.35, pt.z);
      this.roadPreviewGroup.add(wp);
    });

    // 🚩 Start Marker Flag (at point 0)
    const p0 = elevatedPoints[0];
    const startGroup = new THREE.Group();
    startGroup.position.set(p0.x, p0.y, p0.z);

    const startRing = new THREE.Mesh(
      new THREE.RingGeometry(0.7, 1.1, 24),
      new THREE.MeshBasicMaterial({ color: 0x10b981, side: THREE.DoubleSide })
    );
    startRing.rotation.x = -Math.PI / 2;
    startGroup.add(startRing);

    const startPole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    startPole.position.y = 1.4;
    startGroup.add(startPole);

    const startFlag = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.5, 0.04),
      new THREE.MeshBasicMaterial({ color: 0x10b981 })
    );
    startFlag.position.set(0.4, 2.5, 0);
    startGroup.add(startFlag);
    this.roadPreviewGroup.add(startGroup);

    // 🏁 Finish Marker Flag (at end point, if not closed loop)
    if (!this.roadPlannerIsLoop) {
      const pEnd = elevatedPoints[elevatedPoints.length - 1];
      const finishGroup = new THREE.Group();
      finishGroup.position.set(pEnd.x, pEnd.y, pEnd.z);

      const finishRing = new THREE.Mesh(
        new THREE.RingGeometry(0.7, 1.1, 24),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide })
      );
      finishRing.rotation.x = -Math.PI / 2;
      finishGroup.add(finishRing);

      const finishPole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 2.8, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      finishPole.position.y = 1.4;
      finishGroup.add(finishPole);

      const finishFlag = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.5, 0.04),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b })
      );
      finishFlag.position.set(0.4, 2.5, 0);
      finishGroup.add(finishFlag);
      this.roadPreviewGroup.add(finishGroup);
    }

    if (this.onRoadPathUpdated) {
      this.onRoadPathUpdated({
        pointCount: ptsCount,
        lengthMeters,
        estimatedSegments,
      });
    }
  }

  /**
   * Procedural canvas texture generator for seamless continuous roads
   */
  private createRoadTexture(matType: RoadMaterialType): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;

    if (matType === 'asphalt') {
      // Slate Gray Racing Tarmac (bright, clear, crisp visibility)
      ctx.fillStyle = '#4b5563';
      ctx.fillRect(0, 0, 512, 512);
      // Realistic asphalt grain
      for (let i = 0; i < 2500; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#64748b' : '#374151';
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
      }
      // Red and White Alternating Racing Curbs along outer track edges (FIA & Mario Kart Kerbs)
      const curbWidth = 32;
      const curbStep = 48;
      for (let y = 0; y < 512; y += curbStep) {
        const isRed = (Math.floor(y / curbStep) % 2) === 0;
        ctx.fillStyle = isRed ? '#dc2626' : '#ffffff';
        // Left outer curb
        ctx.fillRect(0, y, curbWidth, curbStep);
        // Right outer curb
        ctx.fillRect(512 - curbWidth, y, curbWidth, curbStep);
      }
      // Inner asphalt boundary white line
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(curbWidth + 2, 0, 10, 512);
      ctx.fillRect(512 - curbWidth - 12, 0, 10, 512);

      // Golden yellow dashed centerline
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 14;
      ctx.setLineDash([48, 48]);
      ctx.beginPath();
      ctx.moveTo(256, 0);
      ctx.lineTo(256, 512);
      ctx.stroke();

    } else if (matType === 'cobblestone') {
      // Rustic Hyrule Cobblestone
      ctx.fillStyle = '#374151';
      ctx.fillRect(0, 0, 512, 512);
      const cols = 8;
      const rows = 16;
      const cw = 512 / cols;
      const rh = 512 / rows;
      for (let r = 0; r < rows; r++) {
        const offset = (r % 2) * (cw / 2);
        for (let c = -1; c <= cols; c++) {
          const shade = Math.floor(100 + Math.random() * 50);
          ctx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 8})`;
          ctx.fillRect(c * cw + offset + 3, r * rh + 3, cw - 6, rh - 6);
        }
      }

    } else if (matType === 'wood') {
      // Sturdy Wooden Bridge / Plank Way
      ctx.fillStyle = '#5c3514';
      ctx.fillRect(0, 0, 512, 512);
      const plankW = 512 / 6;
      for (let p = 0; p < 6; p++) {
        const s = Math.floor(95 + Math.random() * 30);
        ctx.fillStyle = `rgb(${s + 20}, ${s - 15}, ${s - 40})`;
        ctx.fillRect(p * plankW + 2, 0, plankW - 4, 512);
        // Rivets/Nails
        ctx.fillStyle = '#1c1917';
        ctx.beginPath();
        ctx.arc(p * plankW + plankW / 2, 32, 4, 0, Math.PI * 2);
        ctx.arc(p * plankW + plankW / 2, 256, 4, 0, Math.PI * 2);
        ctx.arc(p * plankW + plankW / 2, 480, 4, 0, Math.PI * 2);
        ctx.fill();
      }

    } else if (matType === 'dirt') {
      // Natural Offroad Dirt & Gravel
      ctx.fillStyle = '#784d19';
      ctx.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 3000; i++) {
        ctx.fillStyle = Math.random() > 0.5 ? '#925f24' : '#593810';
        ctx.fillRect(Math.random() * 512, Math.random() * 512, 3, 3);
      }
      ctx.fillStyle = 'rgba(60, 36, 12, 0.4)';
      ctx.fillRect(96, 0, 72, 512);
      ctx.fillRect(512 - 168, 0, 72, 512);

    } else {
      // Sheikah Cyber Neon
      ctx.fillStyle = '#090d16';
      ctx.fillRect(0, 0, 512, 512);
      ctx.fillStyle = '#00f0ff';
      ctx.fillRect(16, 0, 20, 512);
      ctx.fillRect(512 - 36, 0, 20, 512);
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 10;
      ctx.setLineDash([64, 32]);
      ctx.beginPath();
      ctx.moveTo(256, 0);
      ctx.lineTo(256, 512);
      ctx.stroke();
      ctx.fillStyle = '#38bdf8';
      for (let y = 32; y < 512; y += 96) {
        ctx.fillRect(140, y, 24, 24);
        ctx.fillRect(512 - 164, y, 24, 24);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 1);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    return tex;
  }

  /**
   * Instantiates a CONTINUOUS lofted road ribbon mesh adhering smoothly to terrain elevation
   * with downward side skirts (zero gaps), selectable width, and continuous walls/curbs.
   */
  public buildRoadFromPlannedPath(): {
    success: boolean;
    message: string;
    segmentCount: number;
    lengthMeters: number;
  } {
    if (this.roadPlannerPoints.length < 2) {
      return {
        success: false,
        message: 'Bitte zeichne zuerst eine Linie mit mindestens 2 Wegpunkten auf das Gelände!',
        segmentCount: 0,
        lengthMeters: 0,
      };
    }

    const curve = new THREE.CatmullRomCurve3(this.roadPlannerPoints, this.roadPlannerIsLoop, 'centripetal', 0.5);
    const lengthMeters = curve.getLength();
    const STEP_SIZE = 0.85; // dense slices for seamless curves
    const numSteps = Math.max(8, Math.round(lengthMeters / STEP_SIZE));
    const roadWidth = this.roadPlannerWidth; // Selectable width (3.5m, 5.5m, 8.5m, 12m)
    const halfW = roadWidth * 0.5;
    const wallType = this.roadPlannerWall;
    const isSolidWall = wallType === 'racing_wall' || wallType === 'stone_wall' || wallType === 'wood_fence';

    const roadGroupId = `road_circuit_${Date.now()}`;
    const roadGroup = new THREE.Group();
    roadGroup.name = roadGroupId;
    this.lastBuiltRoadSegmentIds = [roadGroupId];

    // Buffers for Continuous Roadbed Ribbon (5 vertices per cross-section)
    const roadPositions: number[] = [];
    const roadUvs: number[] = [];
    const roadIndices: number[] = [];

    // Buffers for Continuous Side Barriers / Curbs
    const wallPositions: number[] = [];
    const wallUvs: number[] = [];
    const wallIndices: number[] = [];

    const wallH = wallType === 'curbs_only' ? 0.22 : 1.25;
    const wallThick = wallType === 'curbs_only' ? 0.5 : 0.35;

    // 1. Generate Slices along Curve
    for (let i = 0; i <= numSteps; i++) {
      const u = this.roadPlannerIsLoop && i === numSteps ? 0 : i / numSteps;
      const pos = curve.getPointAt(u);
      const tan = curve.getTangentAt(u);
      const norm = new THREE.Vector3(-tan.z, 0, tan.x).normalize();

      // Terrain Heights
      const yCenter = TerrainManager.getTerrainHeight(pos.x, pos.z) + 0.12;

      const posL = pos.clone().addScaledVector(norm, -halfW);
      const yL = TerrainManager.getTerrainHeight(posL.x, posL.z) + 0.12;

      const posR = pos.clone().addScaledVector(norm, halfW);
      const yR = TerrainManager.getTerrainHeight(posR.x, posR.z) + 0.12;

      // 100% Foliage & Flower Clearing with buffer
      this.foliageManager.removeGrassInRadius(pos.x, pos.z, halfW + 2.4);

      // Smooth terrain under road so no micro-spikes penetrate
      this.flattenTerrainUnderRoad(pos.x, pos.z, (yL + yR + yCenter) / 3 - 0.12, halfW * 1.15);

      // --- Roadbed Cross-Section (5 Vertices) ---
      // 0: Skirt bottom left (-1.2m into ground to seal all terrain gaps)
      roadPositions.push(posL.x, yL - 1.2, posL.z);
      // 1: Road left edge
      roadPositions.push(posL.x, yL, posL.z);
      // 2: Road center (slight 4cm camber for realism)
      roadPositions.push(pos.x, Math.max(yCenter, (yL + yR) / 2 + 0.04), pos.z);
      // 3: Road right edge
      roadPositions.push(posR.x, yR, posR.z);
      // 4: Skirt bottom right (-1.2m into ground)
      roadPositions.push(posR.x, yR - 1.2, posR.z);

      const v = (i / numSteps) * (lengthMeters / 4.0);
      roadUvs.push(0, v, 0, v, 0.5, v, 1, v, 1, v);

      // Connect quads to next slice
      if (i < numSteps) {
        const baseA = i * 5;
        const nextSlice = this.roadPlannerIsLoop && i === numSteps - 1 ? 0 : i + 1;
        const baseB = nextSlice * 5;

        // Quad 0: Left Skirt
        roadIndices.push(baseA + 0, baseB + 0, baseB + 1);
        roadIndices.push(baseA + 0, baseB + 1, baseA + 1);

        // Quad 1: Left Driving Lane (pointing UP +Y)
        roadIndices.push(baseA + 1, baseA + 2, baseB + 2);
        roadIndices.push(baseA + 1, baseB + 2, baseB + 1);

        // Quad 2: Right Driving Lane (pointing UP +Y)
        roadIndices.push(baseA + 2, baseA + 3, baseB + 3);
        roadIndices.push(baseA + 2, baseB + 3, baseB + 2);

        // Quad 3: Right Skirt
        roadIndices.push(baseA + 3, baseB + 3, baseB + 4);
        roadIndices.push(baseA + 3, baseB + 4, baseA + 4);
      }

      // --- Continuous Side Barriers / Curbs ---
      if (wallType !== 'none') {
        const wBaseIdx = i * 8;
        // Left Wall: 4 vertices (inner base, inner top, outer top, outer base)
        wallPositions.push(posL.x, yL, posL.z);
        wallPositions.push(posL.x, yL + wallH, posL.z);
        wallPositions.push(posL.x - norm.x * wallThick, yL + wallH, posL.z - norm.z * wallThick);
        wallPositions.push(posL.x - norm.x * wallThick, yL - 0.4, posL.z - norm.z * wallThick);

        // Right Wall: 4 vertices (inner base, inner top, outer top, outer base)
        wallPositions.push(posR.x, yR, posR.z);
        wallPositions.push(posR.x, yR + wallH, posR.z);
        wallPositions.push(posR.x + norm.x * wallThick, yR + wallH, posR.z + norm.z * wallThick);
        wallPositions.push(posR.x + norm.x * wallThick, yR - 0.4, posR.z + norm.z * wallThick);

        const wv = (i / numSteps) * (lengthMeters / 2.0);
        for (let k = 0; k < 8; k++) wallUvs.push(k % 2 === 0 ? 0 : 1, wv);

        if (i < numSteps) {
          const nextW = this.roadPlannerIsLoop && i === numSteps - 1 ? 0 : i + 1;
          const wBaseB = nextW * 8;

          // Left Wall Faces: Top & Inner
          wallIndices.push(wBaseIdx + 0, wBaseB + 0, wBaseB + 1);
          wallIndices.push(wBaseIdx + 0, wBaseB + 1, wBaseIdx + 1);
          wallIndices.push(wBaseIdx + 1, wBaseB + 1, wBaseB + 2);
          wallIndices.push(wBaseIdx + 1, wBaseB + 2, wBaseIdx + 2);
          wallIndices.push(wBaseIdx + 2, wBaseB + 2, wBaseB + 3);
          wallIndices.push(wBaseIdx + 2, wBaseB + 3, wBaseIdx + 3);

          // Right Wall Faces: Top & Inner
          wallIndices.push(wBaseIdx + 4, wBaseB + 4, wBaseB + 5);
          wallIndices.push(wBaseIdx + 4, wBaseB + 5, wBaseIdx + 5);
          wallIndices.push(wBaseIdx + 5, wBaseB + 5, wBaseB + 6);
          wallIndices.push(wBaseIdx + 5, wBaseB + 6, wBaseIdx + 6);
          wallIndices.push(wBaseIdx + 6, wBaseB + 6, wBaseB + 7);
          wallIndices.push(wBaseIdx + 6, wBaseB + 7, wBaseIdx + 7);
        }

        // Solid Physics Colliders along wall perimeter every SINGLE slice (airtight wall coverage)
        if (isSolidWall) {
          const centerL = posL.clone().addScaledVector(norm, -wallThick * 0.5);
          this.buildingSystem.obstacles.push({
            id: `${roadGroupId}_wl_${i}`,
            type: 'prop',
            x: centerL.x,
            z: centerL.z,
            yBase: yL - 0.2,
            height: wallH + 0.45,
            radius: 0.75,
          });

          const centerR = posR.clone().addScaledVector(norm, wallThick * 0.5);
          this.buildingSystem.obstacles.push({
            id: `${roadGroupId}_wr_${i}`,
            type: 'prop',
            x: centerR.x,
            z: centerR.z,
            yBase: yR - 0.2,
            height: wallH + 0.45,
            radius: 0.75,
          });
        }
      }
    }

    // 2. Build Roadbed Mesh
    const roadGeo = new THREE.BufferGeometry();
    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
    roadGeo.setIndex(roadIndices);
    roadGeo.computeVertexNormals();

    const roadTex = this.createRoadTexture(this.roadPlannerMaterial);
    const matConfigs: Record<string, { color: number; roughness: number; metalness: number; emissive?: number; emissiveIntensity?: number }> = {
      asphalt: { color: 0xffffff, roughness: 0.72, metalness: 0.05 },
      cobblestone: { color: 0xffffff, roughness: 0.82, metalness: 0.05 },
      wood: { color: 0xffffff, roughness: 0.70, metalness: 0.05 },
      dirt: { color: 0xffffff, roughness: 0.88, metalness: 0.02 },
      sheikah_neon: { color: 0xffffff, roughness: 0.25, metalness: 0.4, emissive: 0x00f0ff, emissiveIntensity: 0.6 },
    };
    const cfg = matConfigs[this.roadPlannerMaterial] || matConfigs.asphalt;

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTex,
      color: cfg.color,
      roughness: cfg.roughness,
      metalness: cfg.metalness,
      emissive: cfg.emissive || 0x000000,
      emissiveIntensity: cfg.emissiveIntensity || 0,
      side: THREE.DoubleSide,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.receiveShadow = true;
    roadGroup.add(roadMesh);

    // 3. Build Wall Mesh if enabled
    if (wallType !== 'none') {
      const wallGeo = new THREE.BufferGeometry();
      wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wallPositions, 3));
      wallGeo.setAttribute('uv', new THREE.Float32BufferAttribute(wallUvs, 2));
      wallGeo.setIndex(wallIndices);
      wallGeo.computeVertexNormals();

      let wallMat: THREE.Material;
      if (wallType === 'curbs_only') {
        wallMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.6, side: THREE.DoubleSide });
      } else if (wallType === 'racing_wall') {
        wallMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide });
      } else if (wallType === 'stone_wall') {
        wallMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9, side: THREE.DoubleSide });
      } else {
        wallMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.8, side: THREE.DoubleSide });
      }

      const wallMesh = new THREE.Mesh(wallGeo, wallMat);
      wallMesh.castShadow = true;
      wallMesh.receiveShadow = true;
      roadGroup.add(wallMesh);
    }

    // 4. Place Start Gate if requested
    const p0 = curve.getPointAt(0);
    const t0 = curve.getTangentAt(0);
    const y0 = TerrainManager.getTerrainHeight(p0.x, p0.z);
    const rotY0 = Math.atan2(t0.x, t0.z);

    if (this.roadPlannerHasStartGate) {
      const startGateMesh = this.buildingSystem.placeBuildingAt(
        'track_start_gate',
        new THREE.Vector3(p0.x, y0 + 0.05, p0.z),
        rotY0
      );
      this.lastBuiltRoadSegmentIds.push(startGateMesh.id ? `road_gate_start_${startGateMesh.id}` : `road_gate_start_${Date.now()}`);

      // Auto-spawn a starter kart right on the starting line grid!
      if (this.vehicleSystem) {
        const kx = p0.x + Math.sin(rotY0) * 2.5;
        const kz = p0.z + Math.cos(rotY0) * 2.5;
        this.vehicleSystem.createVehicle('kart_classic', kx, kz, rotY0, 'Rennstrecken-Kart');
      }
    }

    // 5. Place Finish Gate if Sprint course (not loop) and requested
    if (!this.roadPlannerIsLoop && this.roadPlannerHasStartGate) {
      const pEnd = curve.getPointAt(1);
      const tEnd = curve.getTangentAt(1);
      const yEnd = TerrainManager.getTerrainHeight(pEnd.x, pEnd.z);
      const rotYEnd = Math.atan2(tEnd.x, tEnd.z);

      const finishGateMesh = this.buildingSystem.placeBuildingAt(
        'track_finish_gate',
        new THREE.Vector3(pEnd.x, yEnd + 0.05, pEnd.z),
        rotYEnd
      );
      this.lastBuiltRoadSegmentIds.push(finishGateMesh.id ? `road_gate_finish_${finishGateMesh.id}` : `road_gate_finish_${Date.now()}`);
    }

    // 6. Register Road Circuit to BuildingSystem & LevelEditor
    this.buildingSystem.group.add(roadGroup);
    const structType = `road_${this.roadPlannerMaterial}_${this.roadPlannerWall}`;
    this.buildingSystem.structures.push({
      mesh: roadGroup,
      data: {
        id: roadGroupId,
        type: structType,
        position: { x: p0.x, y: y0, z: p0.z },
        rotationY: rotY0,
        health: 9999,
      },
    });

    this.placedObjects.push({
      id: roadGroupId,
      type: structType,
      position: { x: p0.x, y: y0, z: p0.z },
      rotationY: rotY0,
      mesh: roadGroup,
    });

    // Notify physics engine of new airtight wall barriers
    this.onObstaclesChanged?.();

    // Audio Fanfare & Path Reset
    audioEngine.playShrineFanfare();
    this.clearPlannedPath();

    const modeName = this.roadPlannerIsLoop ? 'Rundkurs' : 'Sprintstrecke';
    const matName =
      this.roadPlannerMaterial === 'asphalt'
        ? 'Asphalt'
        : this.roadPlannerMaterial === 'cobblestone'
        ? 'Pflasterstein'
        : this.roadPlannerMaterial === 'wood'
        ? 'Holzdielen'
        : this.roadPlannerMaterial === 'dirt'
        ? 'Schotter'
        : 'Sheikah-Runen';

    return {
      success: true,
      message: `🏎️ ${modeName} (${matName}, ${roadWidth.toFixed(1)}m Breit) nahtlos gebaut! (${lengthMeters.toFixed(1)}m)`,
      segmentCount: numSteps,
      lengthMeters,
    };
  }

  /**
   * Undo the last constructed road circuit
   */
  public undoLastBuiltRoad(): { success: boolean; message: string } {
    if (this.lastBuiltRoadSegmentIds.length === 0) {
      return { success: false, message: 'Keine kürzlich gebaute Straße zum Rückgängigmachen vorhanden.' };
    }

    const removeIds = new Set(this.lastBuiltRoadSegmentIds);
    let count = 0;

    // 1. Remove from buildingSystem structures
    for (let i = this.buildingSystem.structures.length - 1; i >= 0; i--) {
      const s = this.buildingSystem.structures[i];
      if (removeIds.has(s.data.id) || this.lastBuiltRoadSegmentIds.includes(s.data.id)) {
        this.buildingSystem.group.remove(s.mesh);
        this.buildingSystem.structures.splice(i, 1);
        count++;
      }
    }

    // 2. Remove from buildingSystem obstacles
    this.buildingSystem.obstacles = this.buildingSystem.obstacles.filter(
      (obs) => !this.lastBuiltRoadSegmentIds.some((id) => obs.id.startsWith(id))
    );

    // 3. Remove from editor placedObjects
    this.placedObjects = this.placedObjects.filter((p) => !removeIds.has(p.id));

    this.lastBuiltRoadSegmentIds = [];
    audioEngine.playMenuSelect();
    this.onObstaclesChanged?.();

    return { success: true, message: `↩️ ${count} Straßensegmente erfolgreich rückgängig gemacht!` };
  }

  /**
   * Place an object at (worldX, worldZ)
   */
  public placeSelectedObject(worldX: number, worldZ: number): string {
    const y = TerrainManager.getTerrainHeight(worldX, worldZ);
    const objType = this.selectedObjectType;
    const id = `editor_${objType}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    let newMesh: THREE.Object3D | null = null;

    if (objType === 'tree_oak') {
      newMesh = this.miningSystem.createTreeNode(worldX, y, worldZ, true);
    } else if (objType === 'tree_pine') {
      newMesh = this.miningSystem.createTreeNode(worldX, y, worldZ, false);
    } else if (objType === 'rock_boulder') {
      newMesh = this.miningSystem.createRockNode(worldX, y, worldZ);
    } else if (objType === 'ore_iron') {
      newMesh = this.miningSystem.createOreNode(worldX, y, worldZ, {
        type: 'ore_iron',
        name: 'Eisenerz-Ader',
        color: 0x8d99ae,
        yield: 'Eisenerz',
        reqTier: 'stone',
      });
    } else if (objType === 'ore_gold') {
      newMesh = this.miningSystem.createOreNode(worldX, y, worldZ, {
        type: 'ore_gold',
        name: 'Golderz-Ader',
        color: 0xffd166,
        yield: 'Golderz',
        reqTier: 'stone',
      });
    } else if (objType === 'ore_crystal') {
      newMesh = this.miningSystem.createOreNode(worldX, y, worldZ, {
        type: 'ore_crystal',
        name: 'Kristall-Geode',
        color: 0x06b6d4,
        yield: 'Kristall',
        reqTier: 'iron',
      });
    } else if (objType === 'tree_sakura') {
      newMesh = this.miningSystem.createSakuraTree(worldX, y, worldZ);
    } else if (objType === 'tree_birch') {
      newMesh = this.miningSystem.createBirchTree(worldX, y, worldZ);
    } else if (objType === 'tree_apple') {
      newMesh = this.miningSystem.createAppleTree(worldX, y, worldZ);
    } else if (objType === 'flower_silent_princess') {
      newMesh = this.miningSystem.createSilentPrincess(worldX, y, worldZ);
    } else if (objType === 'shroom_cluster') {
      newMesh = this.miningSystem.createShroomCluster(worldX, y, worldZ);
    } else if (objType === 'berry_bush') {
      newMesh = this.miningSystem.createBerryBush(worldX, y, worldZ);
    } else if (objType === 'walled_road') {
      newMesh = this.placeRoadSegment(worldX, worldZ, 0);
    } else if (objType === 'track_start_gate') {
      newMesh = this.buildingSystem.placeBuildingAt('track_start_gate', new THREE.Vector3(worldX, y, worldZ), 0);
    } else if (objType === 'mount_horse' && this.mountSystem) {
      this.mountSystem.createHorse(id, 'Hylia-Schimmel', worldX, worldZ, 0xf8fafc, 0xe2e8f0, 0x0284c7);
    } else if (objType === 'mount_epona' && this.mountSystem) {
      this.mountSystem.createHorse(id, 'Epona', worldX, worldZ, 0x6d3b14, 0x221307, 0x991b1b);
    } else if (objType === 'mount_glider' && this.mountSystem) {
      this.mountSystem.createZonaiGlider(id, 'Zonai-Gleiter', worldX, worldZ);
    } else if (objType === 'vehicle_kart_classic' && this.vehicleSystem) {
      this.vehicleSystem.createVehicle('kart_classic', worldX, worldZ, 0, 'Standard-Kart');
    } else if (objType === 'vehicle_kart_sport' && this.vehicleSystem) {
      this.vehicleSystem.createVehicle('kart_sport', worldX, worldZ, 0, 'Turbo GT Racer');
    } else if (objType === 'vehicle_buggy_offroad' && this.vehicleSystem) {
      this.vehicleSystem.createVehicle('buggy_offroad', worldX, worldZ, 0, 'Offroad-Buggy');
    } else if (objType === 'vehicle_hover_cycle' && this.vehicleSystem) {
      this.vehicleSystem.createVehicle('hover_cycle', worldX, worldZ, 0, 'Sheikah-Bike');
    } else if (objType === 'wildlife_stag' && this.wildlifeManager) {
      this.wildlifeManager.createStag(worldX, worldZ);
    } else if (objType === 'wildlife_blupee' && this.wildlifeManager) {
      this.wildlifeManager.createBlupee(worldX, worldZ);
    } else if (objType === 'wildlife_birds' && this.wildlifeManager) {
      this.wildlifeManager.createBird(worldX, y + 3.0, worldZ);
    } else if (
      objType === 'catan_settlement' ||
      objType === 'catan_city' ||
      objType === 'catan_road' ||
      objType === 'catan_knight_tower' ||
      objType === 'campfire' ||
      objType === 'torch' ||
      objType === 'windmill' ||
      objType === 'watchtower' ||
      objType === 'stone_well' ||
      objType === 'lantern_post' ||
      objType === 'camp_tent' ||
      objType === 'barrel_stack' ||
      objType === 'crate_wooden' ||
      objType === 'target_dummy' ||
      objType === 'track_finish_gate' ||
      objType === 'track_pylon' ||
      objType === 'track_tires' ||
      objType === 'track_barrier' ||
      objType === 'track_boost_pad' ||
      objType === 'track_coin'
    ) {
      newMesh = this.buildingSystem.placeBuildingAt(objType, new THREE.Vector3(worldX, y, worldZ), 0);
    } else if (objType === 'enemy_goomba') {
      this.enemyManager.createGoomba(id, worldX, worldZ);
    } else if (objType === 'enemy_boblin') {
      this.enemyManager.createBoblin(id, worldX, worldZ);
    } else if (objType === 'enemy_slime') {
      this.enemyManager.createSlime(id, worldX, worldZ);
    } else if (objType === 'enemy_talus') {
      this.enemyManager.createStoneTalus(id, worldX, worldZ);
    } else if (objType === 'chest') {
      this.collectibleManager.createChest(id, worldX, y, worldZ);
    } else if (objType === 'shrine') {
      this.collectibleManager.createCustomShrine(id, 'Erschaffener Schrein', worldX, worldZ);
    }

    this.placedObjects.push({
      id,
      type: objType,
      position: { x: worldX, y, z: worldZ },
      rotationY: 0,
      mesh: newMesh || undefined,
    });

    this.onObstaclesChanged?.();
    audioEngine.playPlaceStructure();
    return `Platziert: ${objType}`;
  }

  /**
   * Erase objects and buildings in radius
   */
  public eraseInRadius(worldX: number, worldZ: number): string {
    const radius = this.brushRadius;
    let erasedCount = 0;

    // 1. Remove editor placed objects
    for (let i = this.placedObjects.length - 1; i >= 0; i--) {
      const obj = this.placedObjects[i];
      const dist = Math.hypot(obj.position.x - worldX, obj.position.z - worldZ);
      if (dist < radius) {
        if (obj.mesh) {
          this.scene.remove(obj.mesh);
        }
        this.placedObjects.splice(i, 1);
        erasedCount++;
      }
    }

    // 2. Remove buildings
    for (let i = this.buildingSystem.structures.length - 1; i >= 0; i--) {
      const s = this.buildingSystem.structures[i];
      const dist = Math.hypot(s.data.position.x - worldX, s.data.position.z - worldZ);
      if (dist < radius) {
        this.buildingSystem.group.remove(s.mesh);
        this.buildingSystem.structures.splice(i, 1);
        erasedCount++;
      }
    }

    // 3. Remove enemies
    for (let i = this.enemyManager.enemies.length - 1; i >= 0; i--) {
      const e = this.enemyManager.enemies[i];
      const dist = Math.hypot(e.state.position.x - worldX, e.state.position.z - worldZ);
      if (dist < radius) {
        this.enemyManager.group.remove(e.mesh);
        this.enemyManager.enemies.splice(i, 1);
        erasedCount++;
      }
    }

    if (erasedCount > 0) {
      this.onObstaclesChanged?.();
      audioEngine.playSwordHit();
      return `${erasedCount} Elemente gelöscht!`;
    }
    return 'Keine Elemente im Radius gefunden.';
  }

  /**
   * Generate entire world landscape from templates
   */
  public generateTemplate(template: 'flat' | 'circuit_flat' | 'islands' | 'mountains' | 'procedural' | 'clear') {
    const geo = this.terrainManager.terrainGeometry;
    if (!geo) return;

    const posAttr = geo.attributes.position;
    const colAttr = geo.attributes.color;
    const count = posAttr.count;

    const cSand = new THREE.Color('#d4b886');
    const cGreen = new THREE.Color('#3b7a36');
    const cRock = new THREE.Color('#555f68');
    const cSnow = new THREE.Color('#fcfdff');
    const curCol = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      let y = 4.0;

      if (template === 'circuit_flat') {
        // Perfectly flat emerald race plain y = 4.0m for tracks and road circuits
        y = 4.0;
        curCol.copy(cGreen);
      } else if (template === 'flat') {
        // Flat Green Plains (y = 4.5m)
        y = 4.5 + Math.sin(x * 0.02) * Math.cos(z * 0.02) * 0.4;
        curCol.copy(cGreen);
      } else if (template === 'islands') {
        // Archipelago of Islands surrounded by Ocean (Water level: 1.5)
        const dCenter = Math.hypot(x, z);
        const island1 = Math.max(0, 1 - Math.hypot(x - 90, z - 70) / 140);
        const island2 = Math.max(0, 1 - Math.hypot(x + 110, z - 80) / 120);
        const island3 = Math.max(0, 1 - Math.hypot(x + 50, z + 120) / 150);
        const centerIsland = Math.max(0, 1 - dCenter / 90);

        const islandMask = Math.max(island1, Math.max(island2, Math.max(island3, centerIsland)));
        if (islandMask > 0.01) {
          y = -1.0 + Math.pow(islandMask, 1.8) * 32.0;
        } else {
          y = -4.5; // Deep Ocean
        }

        if (y < TerrainManager.WATER_LEVEL + 1.2) {
          curCol.copy(cSand);
        } else if (y > 22.0) {
          curCol.copy(cRock).lerp(cSnow, (y - 22.0) / 10.0);
        } else {
          curCol.copy(cGreen);
        }
      } else if (template === 'mountains') {
        // Alpine High Mountain peaks with glacial snow
        const nx = x * 0.005;
        const nz = z * 0.005;
        const mRidge = Math.abs(Math.sin(nx * 3.0 + nz * 2.0) * Math.cos(nx * 2.0 - nz * 3.0));
        y = 6.0 + Math.pow(mRidge, 1.4) * 65.0 + Math.sin(x * 0.04) * 2.5;

        if (y > 32.0) {
          curCol.copy(cSnow);
        } else if (y > 18.0) {
          curCol.copy(cRock);
        } else {
          curCol.copy(cGreen);
        }
      } else if (template === 'clear') {
        y = 3.5;
        curCol.copy(cGreen);
      } else {
        // Procedural
        y = TerrainManager.getTerrainHeight(x, z);
        curCol.copy(cGreen);
      }

      posAttr.setY(i, y);
      if (colAttr) {
        colAttr.setXYZ(i, curCol.r, curCol.g, curCol.b);
      }
    }

    posAttr.needsUpdate = true;
    if (colAttr) colAttr.needsUpdate = true;
    geo.computeVertexNormals();
    this.terrainManager.syncHeightGrid();

    try {
      localStorage.setItem('HYRULE_ACTIVE_TEMPLATE', template);
      localStorage.removeItem('HYRULE_ACTIVE_WORLD_NAME');
    } catch {}

    this.syncEntireWorldToTerrain();
    audioEngine.playShrineActivate();
  }

  /**
   * Save current world to localStorage
   */
  public saveWorld(worldName: string = 'Meine Welt'): boolean {
    const geo = this.terrainManager.terrainGeometry;
    if (!geo) return false;

    try {
      const posAttr = geo.attributes.position;
      const count = posAttr.count;
      const heights: number[] = [];
      for (let i = 0; i < count; i++) {
        heights.push(Math.round(posAttr.getY(i) * 10) / 10);
      }

      const worldData = {
        name: worldName,
        savedAt: new Date().toISOString(),
        waterLevel: TerrainManager.WATER_LEVEL,
        heights,
        placedObjects: this.placedObjects.map((o) => ({
          id: o.id,
          type: o.type,
          position: o.position,
          rotationY: o.rotationY,
        })),
      };

      localStorage.setItem(`HYRULE_SAVE_${worldName}`, JSON.stringify(worldData));

      // Update world names list
      const list = this.getSavedWorldNames();
      if (!list.includes(worldName)) {
        list.push(worldName);
        localStorage.setItem('HYRULE_WORLDS_LIST', JSON.stringify(list));
      }

      audioEngine.playCraftSuccess();
      return true;
    } catch (e) {
      console.error('Failed to save world:', e);
      return false;
    }
  }

  /**
   * Load saved world from localStorage
   */
  public loadWorld(worldName: string): boolean {
    try {
      const raw = localStorage.getItem(`HYRULE_SAVE_${worldName}`);
      if (!raw) return false;

      const data = JSON.parse(raw);
      if (data.heights && this.terrainManager.terrainGeometry) {
        const heightsArr = new Float32Array(data.heights);
        this.terrainManager.applyHeightsArray(heightsArr);
      }

      if (data.waterLevel) {
        TerrainManager.WATER_LEVEL = data.waterLevel;
      }

      // Re-place objects
      if (data.placedObjects && Array.isArray(data.placedObjects)) {
        data.placedObjects.forEach((po: any) => {
          this.selectedObjectType = po.type;
          this.placeSelectedObject(po.position.x, po.position.z);
        });
      }

      try {
        localStorage.setItem('HYRULE_ACTIVE_WORLD_NAME', worldName);
      } catch {}

      audioEngine.playShrineActivate();
      this.syncEntireWorldToTerrain();
      return true;
    } catch (e) {
      console.error('Failed to load world:', e);
      return false;
    }
  }

  /**
   * Synchronize all placed objects in Level Editor to ground height
   */
  public syncAllPlacedObjectsToTerrain() {
    for (const po of this.placedObjects) {
      const ny = TerrainManager.getTerrainHeight(po.position.x, po.position.z);
      po.position.y = ny;
      if (po.mesh) {
        po.mesh.position.y = ny;
      }
    }
  }

  /**
   * Complete, atomic synchronization of the entire world to the terrain surface
   * Snaps flowers, grass, trees, rocks, ores, shrines, chests, mounts, wildlife, enemies & buildings
   */
  public syncEntireWorldToTerrain() {
    // 1. Resample all grass, wildflowers, and snap boulders/ruins
    this.foliageManager.repopulateAllGrass();

    // 2. Snap harvestable nodes (trees, rocks, ores, crops)
    this.miningSystem.syncAllNodesToTerrain();

    // 3. Snap shrines, chests, and rupees
    this.collectibleManager.syncAllCollectiblesToTerrain();

    // 4. Snap mounts (horses & gliders)
    if (this.mountSystem) {
      this.mountSystem.syncAllMountsToTerrain();
    }

    // 5. Snap wildlife (stags, blupees, birds)
    if (this.wildlifeManager) {
      this.wildlifeManager.syncAllWildlifeToTerrain();
    }

    // 6. Snap enemies and bosses
    this.enemyManager.syncAllEnemiesToTerrain();

    // 7. Snap player-built structures
    this.buildingSystem.syncAllStructuresToTerrain();

    // 8. Snap editor-placed objects
    this.syncAllPlacedObjectsToTerrain();
  }

  public getSavedWorldNames(): string[] {
    try {
      const raw = localStorage.getItem('HYRULE_WORLDS_LIST');
      if (raw) return JSON.parse(raw);
    } catch {}
    return ['Welt 1'];
  }

  public loadActiveWorld() {
    try {
      const activeWorld = localStorage.getItem('HYRULE_ACTIVE_WORLD_NAME');
      if (activeWorld && localStorage.getItem(`HYRULE_SAVE_${activeWorld}`)) {
        this.loadWorld(activeWorld);
        return;
      }
      const activeTemplate = localStorage.getItem('HYRULE_ACTIVE_TEMPLATE') as any;
      if (activeTemplate && activeTemplate !== 'procedural') {
        this.generateTemplate(activeTemplate);
        return;
      }
    } catch (e) {
      console.warn('Could not restore active world:', e);
    }
    // For default procedural world with deltas or initial boot:
    this.syncEntireWorldToTerrain();
  }

  /**
   * Complete, clean world reset to pristine default state:
   * 1. Resets terrain heights & vertex colors to default procedural state
   * 2. Clears and removes all player-built structures, roads, tracks, walls, towers, obstacles
   * 3. Clears and removes all level-editor placed objects & preview paths
   * 4. Cleans all local storage saves (HYRULE_BUILT_STRUCTURES, HYRULE_TERRAIN_DELTAS, HYRULE_ACTIVE_TEMPLATE, HYRULE_ACTIVE_WORLD_NAME)
   * 5. Repopulates foliage and wildflowers to default ground heights
   * 6. Notifies physics engine that obstacles changed
   */
  public resetWorldToDefault() {
    // 1. Reset terrain heights and colors
    this.terrainManager.resetToOriginalProceduralTerrain();

    // 2. Remove and dispose all meshes from buildingSystem.group
    while (this.buildingSystem.group.children.length > 0) {
      const child = this.buildingSystem.group.children[0];
      this.buildingSystem.group.remove(child);
      child.traverse((node) => {
        if ((node as THREE.Mesh).geometry) {
          (node as THREE.Mesh).geometry.dispose();
        }
        if ((node as THREE.Mesh).material) {
          const mat = (node as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            mat.dispose();
          }
        }
      });
    }

    // Reset building system lists
    this.buildingSystem.structures = [];
    this.buildingSystem.obstacles = [];
    this.buildingSystem.catanRoadSegments = [];
    this.buildingSystem.roadSplines = [];
    this.buildingSystem.nextStructureId = 1;

    // 3. Remove and dispose all meshes from editorGroup
    while (this.editorGroup.children.length > 0) {
      const child = this.editorGroup.children[0];
      this.editorGroup.remove(child);
      child.traverse((node) => {
        if ((node as THREE.Mesh).geometry) {
          (node as THREE.Mesh).geometry.dispose();
        }
        if ((node as THREE.Mesh).material) {
          const mat = (node as THREE.Mesh).material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => m.dispose());
          } else {
            mat.dispose();
          }
        }
      });
    }

    // Reset editor placed objects and road planner
    this.placedObjects = [];
    this.roadPlannerPoints = [];
    this.lastBuiltRoadSegmentIds = [];

    // Clear road preview group
    while (this.roadPreviewGroup.children.length > 0) {
      const child = this.roadPreviewGroup.children[0];
      this.roadPreviewGroup.remove(child);
    }
    this.onRoadPathUpdated?.({ pointCount: 0, lengthMeters: 0, estimatedSegments: 0 });

    // 4. Remove localStorage persistent items
    try {
      localStorage.removeItem('HYRULE_BUILT_STRUCTURES');
      localStorage.removeItem('HYRULE_TERRAIN_DELTAS');
      localStorage.removeItem('HYRULE_ACTIVE_TEMPLATE');
      localStorage.removeItem('HYRULE_ACTIVE_WORLD_NAME');
    } catch (e) {
      console.warn('Could not clear localStorage during world reset:', e);
    }

    // 5. Atomic sync of world, repopulate flowers & grass
    this.syncEntireWorldToTerrain();

    // 6. Notify physics & audio
    this.onObstaclesChanged?.();
    audioEngine.playShrineFanfare();
  }
}
