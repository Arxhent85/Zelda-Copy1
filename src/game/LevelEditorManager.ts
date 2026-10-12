import * as THREE from 'three';
import { TerrainManager } from './Terrain';
import { FoliageManager } from './Foliage';
import { EnemyManager } from './Enemies';
import { BuildingSystem, RoadMaterialType, RoadWallType } from './BuildingSystem';
import { CollectibleManager } from './Collectibles';
import { MiningAndHarvestingSystem } from './MiningAndHarvestingSystem';
import { MountSystem } from './MountSystem';
import { WildlifeManager } from './WildlifeManager';
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
  public roadPlannerWidth: number = 5.0;
  public roadPlannerHasStartGate: boolean = true;
  public lastBuiltRoadSegmentIds: string[] = [];
  public roadPreviewGroup: THREE.Group = new THREE.Group();
  public onRoadPathUpdated?: (info: { pointCount: number; lengthMeters: number; estimatedSegments: number }) => void;

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
    public wildlifeManager?: WildlifeManager
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
   * Instantiates all road segments, gates, and obstacles along the planned curve
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
    const SEGMENT_STEP = 2.8;
    const numSegments = Math.max(2, Math.round(lengthMeters / SEGMENT_STEP));
    const structType = `road_${this.roadPlannerMaterial}_${this.roadPlannerWall}`;

    this.lastBuiltRoadSegmentIds = [];

    // 1. Place road segments along curve
    for (let i = 0; i < numSegments; i++) {
      const u = this.roadPlannerIsLoop ? i / numSegments : i / Math.max(1, numSegments - 1);
      const pos = curve.getPointAt(u);
      const tangent = curve.getTangentAt(u);
      const angleY = Math.atan2(tangent.x, tangent.z);

      const groundY = TerrainManager.getTerrainHeight(pos.x, pos.z);

      // Level terrain smoothly under roadbed
      this.flattenTerrainUnderRoad(pos.x, pos.z, groundY, this.roadPlannerWidth * 0.75);

      // Clear grass & flowers so they never poke through
      this.foliageManager.removeGrassInRadius(pos.x, pos.z, this.roadPlannerWidth * 0.7);

      // Place road structure
      const mesh = this.buildingSystem.placeBuildingAt(structType, new THREE.Vector3(pos.x, groundY + 0.05, pos.z), angleY);

      const id = `road_seg_${Date.now()}_${i}_${Math.floor(Math.random() * 1000)}`;
      this.placedObjects.push({
        id,
        type: structType,
        position: { x: pos.x, y: groundY + 0.05, z: pos.z },
        rotationY: angleY,
        mesh,
      });
      this.lastBuiltRoadSegmentIds.push(id);
    }

    // 2. Place Start Gate if requested
    if (this.roadPlannerHasStartGate) {
      const p0 = curve.getPointAt(0);
      const t0 = curve.getTangentAt(0);
      const y0 = TerrainManager.getTerrainHeight(p0.x, p0.z);
      const rotY0 = Math.atan2(t0.x, t0.z);

      const startGateMesh = this.buildingSystem.placeBuildingAt(
        'track_start_gate',
        new THREE.Vector3(p0.x, y0 + 0.05, p0.z),
        rotY0
      );
      const gateId = `road_gate_start_${Date.now()}`;
      this.placedObjects.push({
        id: gateId,
        type: 'track_start_gate',
        position: { x: p0.x, y: y0 + 0.05, z: p0.z },
        rotationY: rotY0,
        mesh: startGateMesh,
      });
      this.lastBuiltRoadSegmentIds.push(gateId);
    }

    // 3. Place Finish Gate if Sprint course (not loop) and requested
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
      const finishId = `road_gate_finish_${Date.now()}`;
      this.placedObjects.push({
        id: finishId,
        type: 'track_finish_gate',
        position: { x: pEnd.x, y: yEnd + 0.05, z: pEnd.z },
        rotationY: rotYEnd,
        mesh: finishGateMesh,
      });
      this.lastBuiltRoadSegmentIds.push(finishId);
    }

    // Sound fanfare & cleanup
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
      message: `🛣️ ${modeName} (${matName}) erfolgreich gebaut! (${lengthMeters.toFixed(1)}m, ${numSegments} Segmente)`,
      segmentCount: numSegments,
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
      objType === 'target_dummy'
    ) {
      this.buildingSystem.placeBuildingAt(objType, new THREE.Vector3(worldX, y, worldZ), 0);
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
}
