import * as THREE from 'three';
import { BuildingStructure, ObstacleCollider } from '../types';
import { TerrainManager } from './Terrain';
import { audioEngine } from './AudioEngine';

export type RoadMaterialType = 'asphalt' | 'cobblestone' | 'wood' | 'dirt' | 'sheikah_neon';
export type RoadWallType = 'racing_wall' | 'stone_wall' | 'wood_fence' | 'curbs_only' | 'none';

export class BuildingSystem {
  public group: THREE.Group = new THREE.Group();
  public structures: { data: BuildingStructure; mesh: THREE.Group }[] = [];
  public obstacles: ObstacleCollider[] = [];

  // Hologram preview for build placement
  private hologramGroup: THREE.Group = new THREE.Group();
  private hologramMaterial: THREE.MeshStandardMaterial;
  private currentPreviewType: string | null = null;
  public isBuildModeActive: boolean = false;
  private currentBuildRotation: number = 0;
  public onStructurePlaced?: (pos: { x: number; y: number; z: number }, type: string) => void;

  // Materials for realistic structures
  private matWoodPlanks: THREE.MeshStandardMaterial;
  private matLogDark: THREE.MeshStandardMaterial;
  private matStoneAshlar: THREE.MeshStandardMaterial;
  private matIronTrim: THREE.MeshStandardMaterial;
  private matRoofShingle: THREE.MeshStandardMaterial;

  constructor(private scene: THREE.Scene) {
    this.group.name = 'BuildingStructuresGroup';
    this.scene.add(this.group);

    // Realistic fantasy materials
    this.matWoodPlanks = new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.75 });
    this.matLogDark = new THREE.MeshStandardMaterial({ color: 0x4a2e16, roughness: 0.85 });
    this.matStoneAshlar = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
    this.matIronTrim = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
    this.matRoofShingle = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.6 });

    // Hologram preview material
    this.hologramMaterial = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00a8ff,
      emissiveIntensity: 0.9,
      transparent: true,
      opacity: 0.55,
      wireframe: false,
    });

    this.hologramGroup.name = 'BuildHologram';
    this.hologramGroup.visible = false;
    this.scene.add(this.hologramGroup);

    this.loadBuiltStructures();
  }

  /**
   * Set active building preview item
   */
  public setPreviewStructure(type: string | null) {
    if (!type) {
      this.isBuildModeActive = false;
      this.currentPreviewType = null;
      this.hologramGroup.visible = false;
      return;
    }

    this.isBuildModeActive = true;
    this.currentPreviewType = type;
    this.hologramGroup.visible = true;

    // Clear existing hologram geometry
    while (this.hologramGroup.children.length > 0) {
      this.hologramGroup.remove(this.hologramGroup.children[0]);
    }

    // Create hologram mesh preview
    const protoMesh = this.createStructureMesh(type, true);
    this.hologramGroup.add(protoMesh);
  }

  public rotatePreview() {
    this.currentBuildRotation += Math.PI / 2;
  }

  /**
   * Update placement location of preview hologram in front of player with snapping
   */
  public updateHologram(playerPos: THREE.Vector3, playerRotY: number) {
    if (!this.isBuildModeActive || !this.currentPreviewType) return;

    // Position 2.5m in front of player avatar
    let targetX = playerPos.x + Math.sin(playerRotY + this.currentBuildRotation) * 2.8;
    let targetZ = playerPos.z + Math.cos(playerRotY + this.currentBuildRotation) * 2.8;
    let targetY = TerrainManager.getTerrainHeight(targetX, targetZ);

    // Snapping to nearby built structures (within 3.0m radius)
    let snapped = false;
    for (const struct of this.structures) {
      const sp = struct.data.position;
      const dist = Math.hypot(sp.x - targetX, sp.z - targetZ);
      if (dist < 3.2 && Math.abs(sp.y - targetY) < 4.0) {
        // Snap along grid offset
        targetX = sp.x + (targetX > sp.x ? 2.5 : -2.5);
        targetZ = sp.z + (targetZ > sp.z ? 2.5 : -2.5);
        targetY = sp.y;
        snapped = true;
        break;
      }
    }

    this.hologramGroup.position.set(targetX, targetY, targetZ);
    this.hologramGroup.rotation.y = playerRotY + this.currentBuildRotation;
  }

  /**
   * Confirm placement and spawn 3D building element in the world
   */
  public placeStructure(playerPos: THREE.Vector3, playerRotY: number): { success: boolean; message: string } {
    if (!this.isBuildModeActive || !this.currentPreviewType) {
      return { success: false, message: 'Keine Bau-Vorschau aktiv!' };
    }

    const pos = this.hologramGroup.position.clone();
    const rotY = this.hologramGroup.rotation.y;

    const group = this.createStructureMesh(this.currentPreviewType, false);
    group.position.copy(pos);
    group.rotation.y = rotY;

    this.group.add(group);

    const data: BuildingStructure = {
      id: `struct_${Math.random().toString(36).substring(2, 9)}`,
      type: this.currentPreviewType,
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotationY: rotY,
      health: 200,
      maxHealth: 200,
    };

    this.structures.push({ data, mesh: group });

    // Register obstacle collider for physics
    this.registerStructureObstacle(data);

    if (this.onStructurePlaced) {
      this.onStructurePlaced(data.position, data.type);
    }

    // Play placement audio & particle feedback
    audioEngine.playShrineFanfare();

    this.saveBuiltStructures();

    return { success: true, message: `Gebäude platziert!` };
  }

  /**
   * Directly place building at coordinates (used by Level Editor)
   */
  public placeBuildingAt(type: string, pos: THREE.Vector3, rotY: number = 0): THREE.Group {
    const group = this.createStructureMesh(type, false);
    group.position.copy(pos);
    group.rotation.y = rotY;

    this.group.add(group);

    const data: BuildingStructure = {
      id: `struct_${Math.random().toString(36).substring(2, 9)}`,
      type,
      position: { x: pos.x, y: pos.y, z: pos.z },
      rotationY: rotY,
      health: 200,
      maxHealth: 200,
    };

    this.structures.push({ data, mesh: group });
    this.registerStructureObstacle(data);

    if (this.onStructurePlaced) {
      this.onStructurePlaced(data.position, data.type);
    }

    this.saveBuiltStructures();
    return group;
  }

  private buildInteriorFurniture(group: THREE.Group, houseType: string) {
    const isCity = houseType === 'catan_city';
    const randStyle = Math.floor(Math.random() * 3); // 0, 1, 2

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4226, roughness: 0.8 });
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 });
    const fabricMat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });
    const ironMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.8, roughness: 0.3 });
    const pillowMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });

    if (randStyle === 0 || isCity) {
      // 🏰 STYLE 1: Cozy Living Room & Fireplace
      // Fireplace in Back Left Corner
      const fp = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 1.0), stoneMat);
      fp.position.set(-1.8, 0.9, -1.8);
      fp.castShadow = true;
      group.add(fp);

      const fpHole = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 0.6), new THREE.MeshBasicMaterial({ color: 0x000000 }));
      fpHole.position.set(-1.8, 0.6, -1.55);
      group.add(fpHole);

      // Glowing Fire Embers
      const emberMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xf97316, emissiveIntensity: 2.5 });
      const embers = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), emberMat);
      embers.position.set(-1.8, 0.4, -1.55);
      group.add(embers);

      const fpLight = new THREE.PointLight(0xf97316, 2.5, 8);
      fpLight.position.set(-1.8, 0.7, -1.4);
      group.add(fpLight);

      // Wooden Bed on Right Wall
      const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 2.0), woodMat);
      bedFrame.position.set(1.8, 0.18, -0.8);
      bedFrame.castShadow = true;
      group.add(bedFrame);

      const mattress = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.2, 1.9), fabricMat);
      mattress.position.set(1.8, 0.38, -0.8);
      group.add(mattress);

      const pillow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.45), pillowMat);
      pillow.position.set(1.8, 0.5, -1.5);
      group.add(pillow);

      // Table & Stools
      const table = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.7, 0.8), woodMat);
      table.position.set(0, 0.35, -0.8);
      table.castShadow = true;
      group.add(table);

      const stool1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.45, 8), woodMat);
      stool1.position.set(-0.8, 0.225, -0.8);
      group.add(stool1);

      const stool2 = stool1.clone();
      stool2.position.set(0.8, 0.225, -0.8);
      group.add(stool2);

      // Treasure Chest in Corner
      const chest = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.5, 0.5), goldMat);
      chest.position.set(1.8, 0.25, 1.5);
      chest.castShadow = true;
      group.add(chest);

      // Carpet
      const rug = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.02, 1.8), fabricMat);
      rug.position.set(0, 0.08, -0.4);
      group.add(rug);
    }

    if (randStyle === 1 || isCity) {
      // ⚔️ STYLE 2: Craftsman Studio & Weapon Rack
      // Anvil
      const anvil = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.35, 0.6, 8), ironMat);
      anvil.position.set(-1.8, 0.3, 0.8);
      anvil.castShadow = true;
      group.add(anvil);

      // Weapon Rack on Back Wall
      const rack = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.2, 0.15), woodMat);
      rack.position.set(0, 1.8, -2.5);
      rack.castShadow = true;
      group.add(rack);

      const swordOnRack = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 0.05), ironMat);
      swordOnRack.position.set(-0.4, 1.8, -2.4);
      group.add(swordOnRack);

      const shieldOnRack = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), goldMat);
      shieldOnRack.position.set(0.4, 1.8, -2.4);
      group.add(shieldOnRack);

      // Soft Bed roll
      const bedRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.6, 12), fabricMat);
      bedRoll.rotation.z = Math.PI / 2;
      bedRoll.position.set(1.8, 0.18, -1.8);
      group.add(bedRoll);

      // Magic Alchemist Lantern on table
      const lanternMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 2.0 });
      const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), lanternMat);
      lantern.position.set(1.8, 0.8, 1.0);
      group.add(lantern);

      const lLight = new THREE.PointLight(0x38bdf8, 2.0, 6);
      lLight.position.set(1.8, 0.8, 1.0);
      group.add(lLight);
    }

    if (randStyle === 2 || isCity) {
      // 🍷 STYLE 3: Adventurer Tavern & Feast Hall
      // Round Barrels in Corner
      const barrel1 = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.8, 10), woodMat);
      barrel1.position.set(-1.8, 0.4, -1.8);
      barrel1.castShadow = true;
      group.add(barrel1);

      const barrel2 = barrel1.clone();
      barrel2.position.set(-1.2, 0.4, -1.8);
      group.add(barrel2);

      // Long Banquet Bench
      const bench = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.45, 0.5), woodMat);
      bench.position.set(0, 0.225, 0.8);
      bench.castShadow = true;
      group.add(bench);

      // Drinking Steins
      const stein = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 8), goldMat);
      stein.position.set(-0.3, 0.54, 0.8);
      group.add(stein);
    }
  }

  /**
   * Build realistic 3D structure models (AAA Fantasy aesthetics)
   */
  private createStructureMesh(type: string, isHologram: boolean): THREE.Group {
    if (type.startsWith('road_')) {
      return this.createCustomRoadMesh(type, isHologram);
    }

    const group = new THREE.Group();
    const woodMat = isHologram ? this.hologramMaterial : this.matWoodPlanks;
    const logMat = isHologram ? this.hologramMaterial : this.matLogDark;
    const stoneMat = isHologram ? this.hologramMaterial : this.matStoneAshlar;
    const ironMat = isHologram ? this.hologramMaterial : this.matIronTrim;
    const roofMat = isHologram ? this.hologramMaterial : this.matRoofShingle;

    switch (type) {
      case 'wall_wood': {
        // Wooden Plank Wall Segment (3m wide x 2.8m high x 0.3m thick)
        const wall = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.8, 0.3), woodMat);
        wall.position.y = 1.4;
        wall.castShadow = true;
        wall.receiveShadow = true;
        group.add(wall);

        // Vertical Log Frame Posts
        const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3.0, 8), logMat);
        p1.position.set(-1.4, 1.5, 0);
        p1.castShadow = true;
        group.add(p1);

        const p2 = p1.clone();
        p2.position.set(1.4, 1.5, 0);
        group.add(p2);
        break;
      }

      case 'wall_stone': {
        // Stone Masonry Wall (3.0m wide x 2.8m high x 0.45m thick)
        const wall = new THREE.Mesh(new THREE.BoxGeometry(3.0, 2.8, 0.45), stoneMat);
        wall.position.y = 1.4;
        wall.castShadow = true;
        wall.receiveShadow = true;
        group.add(wall);

        // Decorative Cap Trim
        const cap = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 0.55), ironMat);
        cap.position.y = 2.85;
        cap.castShadow = true;
        group.add(cap);
        break;
      }

      case 'roof_wood': {
        // Pitched Roof Section
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.8, 4), roofMat);
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 3.6;
        roof.scale.set(1.4, 1.0, 1.4);
        roof.castShadow = true;
        group.add(roof);
        break;
      }

      case 'pillar_wood': {
        // Support Timber Column
        const col = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, 3.2, 8), logMat);
        col.position.y = 1.6;
        col.castShadow = true;
        group.add(col);
        break;
      }

      case 'bridge_wood': {
        // Wooden Floor Platform / Bridge Plank
        const floor = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.2, 3.0), woodMat);
        floor.position.y = 0.1;
        floor.castShadow = true;
        floor.receiveShadow = true;
        group.add(floor);
        break;
      }

      case 'fence_wood': {
        // Rustic Fence Barricade
        const bar1 = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.15, 0.1), woodMat);
        bar1.position.set(0, 0.5, 0);
        group.add(bar1);

        const bar2 = bar1.clone();
        bar2.position.set(0, 1.0, 0);
        group.add(bar2);

        const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.2, 6), logMat);
        post1.position.set(-1.3, 0.6, 0);
        group.add(post1);

        const post2 = post1.clone();
        post2.position.set(1.3, 0.6, 0);
        group.add(post2);
        break;
      }

      case 'workbench': {
        // Crafting Workbench with Anvil & Tools
        const table = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.0), woodMat);
        table.position.y = 0.45;
        table.castShadow = true;
        group.add(table);

        const anvil = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.3), ironMat);
        anvil.position.set(-0.4, 1.1, 0);
        anvil.castShadow = true;
        group.add(anvil);
        break;
      }

      case 'campfire': {
        // Campfire with Stone Surround & Fire FX
        const stones = new THREE.Mesh(new THREE.TorusGeometry(0.8, 0.18, 8, 12), stoneMat);
        stones.rotation.x = Math.PI / 2;
        stones.position.y = 0.1;
        group.add(stones);

        if (!isHologram) {
          const fireMat = new THREE.MeshStandardMaterial({
            color: 0xff6600,
            emissive: 0xff3300,
            emissiveIntensity: 1.5,
          });
          const flame = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 6), fireMat);
          flame.position.y = 0.4;
          group.add(flame);

          // Point Light source for warm campfire glow
          const light = new THREE.PointLight(0xff7700, 2.5, 12);
          light.position.y = 0.8;
          group.add(light);
        }
        break;
      }

      case 'catan_road': {
        // Catan Paved Road Segment (4.0m long x 2.2m wide x 0.15m height)
        const roadTile = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 4.0), stoneMat);
        roadTile.position.y = 0.08;
        roadTile.castShadow = true;
        roadTile.receiveShadow = true;
        group.add(roadTile);

        // Side Timber Borders
        const b1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.25, 4.0), logMat);
        b1.position.set(-1.1, 0.12, 0);
        b1.castShadow = true;
        group.add(b1);

        const b2 = b1.clone();
        b2.position.set(1.1, 0.12, 0);
        group.add(b2);

        // Side Stone Lantern
        if (!isHologram) {
          const lPost = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.4, 6), ironMat);
          lPost.position.set(1.2, 0.7, 0);
          group.add(lPost);

          const lGlow = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0xd97706, emissiveIntensity: 2.0 }));
          lGlow.position.set(1.2, 1.4, 0);
          group.add(lGlow);

          const light = new THREE.PointLight(0xf59e0b, 1.5, 8);
          light.position.set(1.2, 1.4, 0);
          group.add(light);
        }
        break;
      }

      case 'catan_settlement': {
        // Catan Settlement House (Level 1) - Enterable Hollow Structure!
        // Dimensions: 6.2m Wide (X) x 3.8m Tall (Y) x 5.6m Deep (Z)
        
        // 1. Wooden Plank Floor
        const floor = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.15, 5.6), woodMat);
        floor.position.y = 0.075;
        floor.receiveShadow = true;
        group.add(floor);

        // 2. Hollow Timber Walls
        // Left Wall
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.8, 5.6), woodMat);
        leftWall.position.set(-2.975, 1.9, 0);
        leftWall.castShadow = true;
        leftWall.receiveShadow = true;
        group.add(leftWall);

        // Right Wall
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3.8, 5.6), woodMat);
        rightWall.position.set(2.975, 1.9, 0);
        rightWall.castShadow = true;
        rightWall.receiveShadow = true;
        group.add(rightWall);

        // Back Wall
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3.8, 0.25), woodMat);
        backWall.position.set(0, 1.9, -2.675);
        backWall.castShadow = true;
        backWall.receiveShadow = true;
        group.add(backWall);

        // Front Wall Left Panel
        const frontWallL = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.8, 0.25), woodMat);
        frontWallL.position.set(-2.05, 1.9, 2.675);
        frontWallL.castShadow = true;
        group.add(frontWallL);

        // Front Wall Right Panel
        const frontWallR = new THREE.Mesh(new THREE.BoxGeometry(2.1, 3.8, 0.25), woodMat);
        frontWallR.position.set(2.05, 1.9, 2.675);
        frontWallR.castShadow = true;
        group.add(frontWallR);

        // Entrance Doorway Lintel Header (Leaving 2.0m Wide x 2.8m High Open Doorway!)
        const doorHeader = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.0, 0.35), logMat);
        doorHeader.position.set(0, 3.3, 2.675);
        doorHeader.castShadow = true;
        group.add(doorHeader);

        // Decorative Door Posts
        const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.8, 8), logMat);
        postL.position.set(-1.0, 1.4, 2.7);
        group.add(postL);

        const postR = postL.clone();
        postR.position.set(1.0, 1.4, 2.7);
        group.add(postR);

        // Corner Timber Posts
        const corners = [
          { x: -2.9, z: -2.6 }, { x: 2.9, z: -2.6 },
          { x: -2.9, z: 2.6 }, { x: 2.9, z: 2.6 }
        ];
        corners.forEach(c => {
          const post = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 4.0, 8), logMat);
          post.position.set(c.x, 2.0, c.z);
          post.castShadow = true;
          group.add(post);
        });

        // High Pitched Red Shingle Roof Overhead
        const roof = new THREE.Mesh(new THREE.ConeGeometry(4.8, 2.4, 4), roofMat);
        roof.rotation.y = Math.PI / 4;
        roof.position.y = 4.8;
        roof.scale.set(1.3, 1.0, 1.2);
        roof.castShadow = true;
        group.add(roof);

        // Chimney
        const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.6, 2.2, 0.6), stoneMat);
        chimney.position.set(1.8, 4.8, -1.2);
        chimney.castShadow = true;
        group.add(chimney);

        // Banner Flag
        const flagPole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), ironMat);
        flagPole.position.set(-2.0, 5.8, 0);
        group.add(flagPole);

        const bannerMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.4 });
        const banner = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.04), bannerMat);
        banner.position.set(-1.6, 6.2, 0);
        group.add(banner);

        // RANDOM INTERIOR FURNITURE!
        if (!isHologram) {
          this.buildInteriorFurniture(group, 'catan_settlement');

          // Warm Interior Lighting
          const light = new THREE.PointLight(0xf59e0b, 3.5, 12);
          light.position.set(0, 2.6, 0);
          group.add(light);
        }
        break;
      }

      case 'catan_city': {
        // Catan City Fortress (Level 2) - Grand Enterable Fortress Keep!
        // Dimensions: 8.5m Wide (X) x 5.2m Tall (Y) x 7.5m Deep (Z)

        // 1. Ashlar Stone Floor
        const floor = new THREE.Mesh(new THREE.BoxGeometry(8.5, 0.2, 7.5), stoneMat);
        floor.position.y = 0.1;
        floor.receiveShadow = true;
        group.add(floor);

        // 2. Stone Walls
        // Left Wall
        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.2, 7.5), stoneMat);
        leftWall.position.set(-4.075, 2.6, 0);
        leftWall.castShadow = true;
        leftWall.receiveShadow = true;
        group.add(leftWall);

        // Right Wall
        const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.35, 5.2, 7.5), stoneMat);
        rightWall.position.set(4.075, 2.6, 0);
        rightWall.castShadow = true;
        rightWall.receiveShadow = true;
        group.add(rightWall);

        // Back Wall
        const backWall = new THREE.Mesh(new THREE.BoxGeometry(8.5, 5.2, 0.35), stoneMat);
        backWall.position.set(0, 2.6, -3.575);
        backWall.castShadow = true;
        backWall.receiveShadow = true;
        group.add(backWall);

        // Front Wall Left
        const frontWallL = new THREE.Mesh(new THREE.BoxGeometry(2.8, 5.2, 0.35), stoneMat);
        frontWallL.position.set(-2.85, 2.6, 3.575);
        frontWallL.castShadow = true;
        group.add(frontWallL);

        // Front Wall Right
        const frontWallR = new THREE.Mesh(new THREE.BoxGeometry(2.8, 5.2, 0.35), stoneMat);
        frontWallR.position.set(2.85, 2.6, 3.575);
        frontWallR.castShadow = true;
        group.add(frontWallR);

        // Grand Double Archway Header (Leaves 2.9m Wide x 3.6m High Entrance!)
        const archHeader = new THREE.Mesh(new THREE.BoxGeometry(2.9, 1.6, 0.45), ironMat);
        archHeader.position.set(0, 4.4, 3.575);
        archHeader.castShadow = true;
        group.add(archHeader);

        // Iron Rampart Cap
        const cap = new THREE.Mesh(new THREE.BoxGeometry(8.9, 0.4, 7.9), ironMat);
        cap.position.y = 5.4;
        cap.castShadow = true;
        group.add(cap);

        // Central High Watch Spire
        const spire = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.8, 3.8, 8), stoneMat);
        spire.position.set(0, 7.1, 0);
        spire.castShadow = true;
        group.add(spire);

        const spireRoof = new THREE.Mesh(new THREE.ConeGeometry(2.0, 2.8, 8), roofMat);
        spireRoof.position.set(0, 10.2, 0);
        spireRoof.castShadow = true;
        group.add(spireRoof);

        // Golden Crest Emblem
        const crestMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });
        const crest = new THREE.Mesh(new THREE.OctahedronGeometry(0.8), crestMat);
        crest.position.set(0, 6.2, 3.8);
        group.add(crest);

        // RANDOM DELUXE INTERIOR FURNITURE!
        if (!isHologram) {
          this.buildInteriorFurniture(group, 'catan_city');

          const light = new THREE.PointLight(0x38bdf8, 4.5, 18);
          light.position.set(0, 3.5, 0);
          group.add(light);
        }
        break;
      }

      case 'catan_knight_tower': {
        // Catan Knight Guard Tower (Auto-attacks enemies)
        // Tall Stone Base Column (1.8m diameter x 5.5m high)
        const towerCol = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.2, 5.5, 10), stoneMat);
        towerCol.position.y = 2.75;
        towerCol.castShadow = true;
        towerCol.receiveShadow = true;
        group.add(towerCol);

        // Top Platform & Shield Guard Trim
        const topRim = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.2, 0.5, 10), ironMat);
        topRim.position.y = 5.75;
        topRim.castShadow = true;
        group.add(topRim);

        // Guardian Light Crystal Beacon
        const crystalMat = new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 2.2,
          roughness: 0.1,
        });
        const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.65), crystalMat);
        crystal.position.y = 6.7;
        crystal.castShadow = true;
        group.add(crystal);

        if (!isHologram) {
          const light = new THREE.PointLight(0x38bdf8, 3.0, 16);
          light.position.y = 6.7;
          group.add(light);
        }
        break;
      }

      case 'windmill': {
        // 🌾 Grand Windmill with Animated Spinning Sails
        // 1. Cobblestone Masonry Base
        const baseCol = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.8, 6.0, 12), stoneMat);
        baseCol.position.y = 3.0;
        baseCol.castShadow = true;
        baseCol.receiveShadow = true;
        group.add(baseCol);

        // 2. Upper Wooden Tower Section
        const woodUpper = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.2, 3.2, 10), woodMat);
        woodUpper.position.y = 7.4;
        woodUpper.castShadow = true;
        group.add(woodUpper);

        // 3. Conical Shingle Roof
        const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 2.2, 10), roofMat);
        roof.position.y = 10.0;
        roof.castShadow = true;
        group.add(roof);

        // 4. Wooden Entrance Door
        const door = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.3), logMat);
        door.position.set(0, 1.1, 2.7);
        group.add(door);

        // 5. Rotor Hub & Spinning Sails
        const rotorHub = new THREE.Group();
        rotorHub.name = 'WindmillRotor';
        rotorHub.position.set(0, 7.8, 2.1); // Front face of windmill

        // Central Axle Cap
        const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.6, 8), ironMat);
        axle.rotation.x = Math.PI / 2;
        rotorHub.add(axle);

        const sailClothMat = isHologram
          ? this.hologramMaterial
          : new THREE.MeshStandardMaterial({ color: 0xf5eedb, roughness: 0.85, side: THREE.DoubleSide });

        // 4 Sail Arms in Cross Formation
        for (let a = 0; a < 4; a++) {
          const armGroup = new THREE.Group();
          armGroup.rotation.z = (a * Math.PI) / 2;

          // Wooden Spar / Lattice Arm
          const spar = new THREE.Mesh(new THREE.BoxGeometry(0.12, 4.4, 0.12), logMat);
          spar.position.y = 2.2;
          spar.castShadow = true;
          armGroup.add(spar);

          // White Canvas Sail
          const sail = new THREE.Mesh(new THREE.BoxGeometry(0.9, 3.6, 0.04), sailClothMat);
          sail.position.set(0.48, 2.4, 0.05);
          sail.castShadow = true;
          armGroup.add(sail);

          rotorHub.add(armGroup);
        }

        group.add(rotorHub);
        break;
      }

      case 'watchtower': {
        // 🏰 Timber Watchtower (Lookout Post)
        // 4 Angled Log Corner Pillars (7m high)
        const pillarDist = 1.4;
        const corners = [
          { x: -pillarDist, z: -pillarDist },
          { x: pillarDist, z: -pillarDist },
          { x: -pillarDist, z: pillarDist },
          { x: pillarDist, z: pillarDist },
        ];

        corners.forEach((c) => {
          const p = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 6.8, 8), logMat);
          p.position.set(c.x, 3.4, c.z);
          p.castShadow = true;
          group.add(p);
        });

        // Cross Braces
        const brace1 = new THREE.Mesh(new THREE.BoxGeometry(3.0, 0.12, 0.12), woodMat);
        brace1.position.set(0, 2.4, pillarDist);
        group.add(brace1);
        const brace2 = brace1.clone();
        brace2.position.set(0, 2.4, -pillarDist);
        group.add(brace2);

        // Observation Deck Floor Platform at y = 5.6
        const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.25, 3.6), woodMat);
        deck.position.y = 5.6;
        deck.castShadow = true;
        deck.receiveShadow = true;
        group.add(deck);

        // Deck Guard Railing
        const railFront = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 0.1), logMat);
        railFront.position.set(0, 6.6, 1.75);
        group.add(railFront);
        const railBack = railFront.clone();
        railBack.position.set(0, 6.6, -1.75);
        group.add(railBack);
        const railLeft = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 3.6), logMat);
        railLeft.position.set(-1.75, 6.6, 0);
        group.add(railLeft);
        const railRight = railLeft.clone();
        railRight.position.set(1.75, 6.6, 0);
        group.add(railRight);

        // Deck Roof Pillars & Canopy
        corners.forEach((c) => {
          const roofP = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.2, 6), logMat);
          roofP.position.set(c.x * 1.05, 6.7, c.z * 1.05);
          group.add(roofP);
        });

        const watchRoof = new THREE.Mesh(new THREE.ConeGeometry(3.0, 1.8, 4), roofMat);
        watchRoof.rotation.y = Math.PI / 4;
        watchRoof.position.y = 8.5;
        watchRoof.castShadow = true;
        group.add(watchRoof);

        // Lookout Lantern
        if (!isHologram) {
          const lGlow = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xf59e0b }));
          lGlow.position.set(0, 7.3, 0);
          group.add(lGlow);

          const light = new THREE.PointLight(0xf59e0b, 2.2, 10);
          light.position.set(0, 7.3, 0);
          group.add(light);
        }
        break;
      }

      case 'stone_well': {
        // 💧 Village Stone Water Well with Canopy & Bucket
        // Circular Cobblestone Well Basin
        const rim = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 1.0, 12), stoneMat);
        rim.position.y = 0.5;
        rim.castShadow = true;
        rim.receiveShadow = true;
        group.add(rim);

        // Dark Water Surface inside
        const waterMat = new THREE.MeshStandardMaterial({
          color: 0x0284c7,
          roughness: 0.1,
          metalness: 0.8,
        });
        const water = new THREE.Mesh(new THREE.CircleGeometry(1.2, 12), waterMat);
        water.rotation.x = -Math.PI / 2;
        water.position.y = 0.6;
        group.add(water);

        // Twin Wooden Roof Posts
        const postL = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.6, 8), logMat);
        postL.position.set(-1.25, 1.7, 0);
        postL.castShadow = true;
        group.add(postL);

        const postR = postL.clone();
        postR.position.set(1.25, 1.7, 0);
        group.add(postR);

        // Crossbeam & Winch Drum
        const winch = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 2.4, 8), logMat);
        winch.rotation.z = Math.PI / 2;
        winch.position.set(0, 2.3, 0);
        group.add(winch);

        // Rope & Hanging Bucket
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1), woodMat);
        rope.position.set(0, 1.7, 0);
        group.add(rope);

        const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.18, 0.38, 8), woodMat);
        bucket.position.set(0, 1.0, 0);
        bucket.castShadow = true;
        group.add(bucket);

        // Wooden Gable Roof
        const wellRoof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 1.2, 4), roofMat);
        wellRoof.rotation.y = Math.PI / 4;
        wellRoof.position.y = 3.3;
        wellRoof.castShadow = true;
        group.add(wellRoof);
        break;
      }

      case 'lantern_post': {
        // 🏮 Medieval Wrought Iron Lamppost with Amber Point Light
        // Iron Base & Tall Fluted Column
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.15, 3.2, 8), ironMat);
        pole.position.y = 1.6;
        pole.castShadow = true;
        group.add(pole);

        // Curved Decorative Bracket Arm
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.12), ironMat);
        arm.position.set(0.35, 3.1, 0);
        group.add(arm);

        // Lantern Housing
        const lanternGeo = new THREE.CylinderGeometry(0.26, 0.18, 0.55, 6);
        const lanternMesh = new THREE.Mesh(lanternGeo, ironMat);
        lanternMesh.position.set(0.65, 2.8, 0);
        lanternMesh.castShadow = true;
        group.add(lanternMesh);

        // Amber Glowing Filament Core & Dynamic Point Light
        const glowMat = new THREE.MeshStandardMaterial({
          color: 0xf59e0b,
          emissive: 0xd97706,
          emissiveIntensity: 2.5,
        });
        const glowCore = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 8), glowMat);
        glowCore.position.set(0.65, 2.8, 0);
        group.add(glowCore);

        if (!isHologram) {
          const light = new THREE.PointLight(0xf59e0b, 2.8, 14);
          light.position.set(0.65, 2.8, 0);
          group.add(light);
        }
        break;
      }

      case 'camp_tent': {
        // ⛺ Adventurer Camp Tent (Canvas A-Frame Shelter)
        const canvasMat = isHologram
          ? this.hologramMaterial
          : new THREE.MeshStandardMaterial({ color: 0xd6c4a8, roughness: 0.85, side: THREE.DoubleSide });

        // Left Slanted Canvas Flap
        const flapL = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 3.2), canvasMat);
        flapL.position.set(-0.85, 1.1, 0);
        flapL.rotation.z = Math.PI / 4;
        flapL.castShadow = true;
        flapL.receiveShadow = true;
        group.add(flapL);

        // Right Slanted Canvas Flap
        const flapR = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 3.2), canvasMat);
        flapR.position.set(0.85, 1.1, 0);
        flapR.rotation.z = -Math.PI / 4;
        flapR.castShadow = true;
        flapR.receiveShadow = true;
        group.add(flapR);

        // Ridge Pole
        const ridge = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.4), logMat);
        ridge.rotation.x = Math.PI / 2;
        ridge.position.set(0, 1.95, 0);
        group.add(ridge);

        // Inside Rolled Bedroll & Straw Mat
        const bedMat = new THREE.MeshStandardMaterial({ color: 0x991b1b, roughness: 0.7 });
        const bed = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 2.2), bedMat);
        bed.position.set(0, 0.08, 0);
        group.add(bed);

        const pillow = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 1.0, 8), canvasMat);
        pillow.rotation.z = Math.PI / 2;
        pillow.position.set(0, 0.2, -0.85);
        group.add(pillow);
        break;
      }

      case 'barrel_stack': {
        // 🛢️ Stack of 3 Oak Wood Barrels with Iron Hoops
        const barrelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.85, 10);

        // Bottom Left Barrel
        const b1 = new THREE.Mesh(barrelGeo, woodMat);
        b1.position.set(-0.4, 0.42, 0);
        b1.castShadow = true;
        group.add(b1);

        // Bottom Right Barrel
        const b2 = new THREE.Mesh(barrelGeo, woodMat);
        b2.position.set(0.4, 0.42, 0);
        b2.castShadow = true;
        group.add(b2);

        // Top Centered Barrel (lying sideways)
        const b3 = new THREE.Mesh(barrelGeo, woodMat);
        b3.rotation.z = Math.PI / 2;
        b3.position.set(0, 1.15, 0);
        b3.castShadow = true;
        group.add(b3);

        // Decorative Iron Hoops on b1 & b2
        const hoopGeo = new THREE.TorusGeometry(0.39, 0.03, 6, 12);
        hoopGeo.rotateX(Math.PI / 2);
        const h1 = new THREE.Mesh(hoopGeo, ironMat);
        h1.position.set(-0.4, 0.6, 0);
        group.add(h1);
        const h2 = new THREE.Mesh(hoopGeo, ironMat);
        h2.position.set(0.4, 0.6, 0);
        group.add(h2);
        break;
      }

      case 'crate_wooden': {
        // 📦 Sturdy Reinforced Wooden Storage Crate
        const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), woodMat);
        crate.position.y = 0.6;
        crate.castShadow = true;
        crate.receiveShadow = true;
        group.add(crate);

        // Iron Corner Brackets & Trim
        const trimMat = ironMat;
        const topRim = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.08, 1.26), trimMat);
        topRim.position.y = 1.18;
        group.add(topRim);

        const botRim = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.08, 1.26), trimMat);
        botRim.position.y = 0.06;
        group.add(botRim);
        break;
      }

      case 'target_dummy': {
        // 🎯 Archery & Sword Practice Training Dummy
        // Cross Wooden Base Stand
        const baseWood = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 1.2), woodMat);
        baseWood.position.y = 0.06;
        group.add(baseWood);

        // Central Vertical Wooden Post
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.1, 8), logMat);
        post.position.y = 1.05;
        post.castShadow = true;
        group.add(post);

        // Cross Horizontal Arm Bar
        const arms = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.14, 0.14), logMat);
        arms.position.y = 1.5;
        group.add(arms);

        // Straw / Burlap Torso
        const strawMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.9 });
        const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.3, 0.85, 8), strawMat);
        torso.position.y = 1.35;
        torso.castShadow = true;
        group.add(torso);

        // Straw Head with Red Bandana
        const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), strawMat);
        head.position.y = 1.95;
        head.castShadow = true;
        group.add(head);

        const bandana = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.04, 6, 10), roofMat);
        bandana.rotation.x = Math.PI / 2;
        bandana.position.y = 1.95;
        group.add(bandana);

        // Target Bullseye on Chest
        const bullseyeMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
        const ring = new THREE.Mesh(new THREE.RingGeometry(0.12, 0.22, 12), bullseyeMat);
        ring.position.set(0, 1.35, 0.37);
        group.add(ring);
        break;
      }

      case 'walled_road': {
        // 🛣️ Paved Walled Road / Circuit Track with High Boundary Walls
        // 1. Central Asphalt Roadbed (4.6m wide x 3.2m long x 0.16m high)
        const roadbedMat = isHologram
          ? this.hologramMaterial
          : new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 });
        const roadbed = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.16, 3.2), roadbedMat);
        roadbed.position.y = 0.08;
        roadbed.castShadow = true;
        roadbed.receiveShadow = true;
        group.add(roadbed);

        // Center dashed road stripe
        const stripeMat = isHologram
          ? this.hologramMaterial
          : new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.5 });
        const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.02, 1.8), stripeMat);
        stripe.position.set(0, 0.17, 0);
        group.add(stripe);

        // 2. Left Boundary Wall / Curb (x = -2.3, height = 1.25m)
        const wallMat = isHologram
          ? this.hologramMaterial
          : new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.75 });
        const wallTrimMat = isHologram
          ? this.hologramMaterial
          : new THREE.MeshStandardMaterial({ color: 0xb91c1c, roughness: 0.6 });

        const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.25, 3.2), wallMat);
        wallL.position.set(-2.3, 0.625, 0);
        wallL.castShadow = true;
        wallL.receiveShadow = true;
        group.add(wallL);

        // Left Wall Curb Cap (Red Racing Trim)
        const curbCapL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 3.2), wallTrimMat);
        curbCapL.position.set(-2.3, 1.28, 0);
        curbCapL.castShadow = true;
        group.add(curbCapL);

        // 3. Right Boundary Wall / Curb (x = +2.3, height = 1.25m)
        const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.25, 3.2), wallMat);
        wallR.position.set(2.3, 0.625, 0);
        wallR.castShadow = true;
        wallR.receiveShadow = true;
        group.add(wallR);

        // Right Wall Curb Cap (White Racing Trim)
        const curbCapRMat = isHologram
          ? this.hologramMaterial
          : new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.6 });
        const curbCapR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.15, 3.2), curbCapRMat);
        curbCapR.position.set(2.3, 1.28, 0);
        curbCapR.castShadow = true;
        group.add(curbCapR);
        break;
      }

      case 'track_start_gate': {
        // 🏁 Monumental Start/Finish Archway across Track
        // 1. Roadbed underneath
        const roadbed = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 3.6), stoneMat);
        roadbed.position.y = 0.08;
        roadbed.receiveShadow = true;
        group.add(roadbed);

        // 2. Checkered Start Line Stripe
        const startStripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
        const startStripe = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.02, 0.6), startStripeMat);
        startStripe.position.set(0, 0.17, 0);
        group.add(startStripe);

        // 3. Left Stone Column Tower
        const towerL = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 5.2, 8), stoneMat);
        towerL.position.set(-2.6, 2.6, 0);
        towerL.castShadow = true;
        group.add(towerL);

        // 4. Right Stone Column Tower
        const towerR = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 5.2, 8), stoneMat);
        towerR.position.set(2.6, 2.6, 0);
        towerR.castShadow = true;
        group.add(towerR);

        // 5. Overhead Wooden Banner Arch Crossbeam
        const beam = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.8, 0.4), logMat);
        beam.position.set(0, 5.0, 0);
        beam.castShadow = true;
        group.add(beam);

        // Banner Sign (START / ZIEL)
        const bannerMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.5 });
        const banner = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.6, 0.08), bannerMat);
        banner.position.set(0, 5.0, 0.22);
        group.add(banner);

        // Braziers / Torches on towers with warm lights
        if (!isHologram) {
          const torchMat = new THREE.MeshBasicMaterial({ color: 0xf97316 });
          const flameL = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), torchMat);
          flameL.position.set(-2.6, 5.4, 0);
          group.add(flameL);

          const lightL = new THREE.PointLight(0xf97316, 2.2, 10);
          lightL.position.set(-2.6, 5.4, 0);
          group.add(lightL);

          const flameR = new THREE.Mesh(new THREE.SphereGeometry(0.2, 8, 8), torchMat);
          flameR.position.set(2.6, 5.4, 0);
          group.add(flameR);

          const lightR = new THREE.PointLight(0xf97316, 2.2, 10);
          lightR.position.set(2.6, 5.4, 0);
          group.add(lightR);
        }
        break;
      }

      case 'track_finish_gate': {
        // 🏁 Monumental Finish Archway across Track with Checkered Banner and Golden Victory Trim
        // Roadbed underneath
        const roadbed = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.16, 3.6), stoneMat);
        roadbed.position.y = 0.08;
        roadbed.receiveShadow = true;
        group.add(roadbed);

        // Checkered Finish Line Stripe
        const finishStripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
        const finishStripe = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.02, 0.7), finishStripeMat);
        finishStripe.position.set(0, 0.17, 0);
        group.add(finishStripe);

        // Black checkered blocks on the white stripe
        const blackMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4 });
        for (let bx = -2.0; bx <= 2.0; bx += 0.8) {
          const cb = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.025, 0.35), blackMat);
          cb.position.set(bx, 0.175, 0.175);
          group.add(cb);
          const cb2 = cb.clone();
          cb2.position.set(bx + 0.4, 0.175, -0.175);
          group.add(cb2);
        }

        // Left & Right Marble Pillar Towers
        const marbleMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.3, metalness: 0.1 });
        const towerL = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 5.2, 10), marbleMat);
        towerL.position.set(-2.6, 2.6, 0);
        towerL.castShadow = true;
        group.add(towerL);

        const towerR = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 5.2, 10), marbleMat);
        towerR.position.set(2.6, 2.6, 0);
        towerR.castShadow = true;
        group.add(towerR);

        // Gold Trim Cap on Towers
        const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.2 });
        const goldCapL = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.6, 0.4, 10), goldMat);
        goldCapL.position.set(-2.6, 5.3, 0);
        group.add(goldCapL);

        const goldCapR = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.6, 0.4, 10), goldMat);
        goldCapR.position.set(2.6, 5.3, 0);
        group.add(goldCapR);

        // Golden Victory Trophies on top
        const trophyGeo = new THREE.OctahedronGeometry(0.35);
        const trophyL = new THREE.Mesh(trophyGeo, goldMat);
        trophyL.position.set(-2.6, 5.75, 0);
        group.add(trophyL);

        const trophyR = new THREE.Mesh(trophyGeo, goldMat);
        trophyR.position.set(2.6, 5.75, 0);
        group.add(trophyR);

        // Overhead Grand Arch Crossbeam
        const beam = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.9, 0.45), marbleMat);
        beam.position.set(0, 5.0, 0);
        beam.castShadow = true;
        group.add(beam);

        // Checkered Finish Banner (ZIEL)
        const bannerMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.4 });
        const banner = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.7, 0.08), bannerMat);
        banner.position.set(0, 5.0, 0.25);
        group.add(banner);

        // Sparkling Victory Lights
        if (!isHologram) {
          const lightL = new THREE.PointLight(0x10b981, 3.0, 12);
          lightL.position.set(-2.6, 5.5, 0);
          group.add(lightL);

          const lightR = new THREE.PointLight(0x10b981, 3.0, 12);
          lightR.position.set(2.6, 5.5, 0);
          group.add(lightR);
        }
        break;
      }
    }

    return group;
  }

  /**
   * Procedural road piece with selectable surface material & boundary wall style
   */
  public createCustomRoadMesh(
    typeOrMat: string,
    isHologram: boolean = false,
    customWidth: number = 5.0,
    customLength: number = 3.2
  ): THREE.Group {
    const group = new THREE.Group();

    // Parse 'road_{material}_{wall}'
    let material: RoadMaterialType = 'asphalt';
    let wall: RoadWallType = 'racing_wall';

    if (typeOrMat.startsWith('road_')) {
      const rest = typeOrMat.substring(5);
      const mats: RoadMaterialType[] = ['asphalt', 'cobblestone', 'wood', 'dirt', 'sheikah_neon'];
      for (const m of mats) {
        if (rest.startsWith(m + '_')) {
          material = m;
          wall = rest.substring(m.length + 1) as RoadWallType;
          break;
        }
      }
    }

    const width = customWidth;
    const length = customLength;
    const halfW = width * 0.5;

    if (isHologram) {
      const bed = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, length), this.hologramMaterial);
      bed.position.y = 0.08;
      group.add(bed);

      if (wall !== 'none') {
        const wallH = wall === 'curbs_only' ? 0.25 : 1.25;
        const wL = new THREE.Mesh(new THREE.BoxGeometry(0.35, wallH, length), this.hologramMaterial);
        wL.position.set(-halfW, wallH * 0.5, 0);
        group.add(wL);

        const wR = new THREE.Mesh(new THREE.BoxGeometry(0.35, wallH, length), this.hologramMaterial);
        wR.position.set(halfW, wallH * 0.5, 0);
        group.add(wR);
      }
      return group;
    }

    // --- 1. Roadbed Surface Material ---
    let roadMat: THREE.Material;
    if (material === 'asphalt') {
      roadMat = new THREE.MeshStandardMaterial({ color: 0x222a35, roughness: 0.82, metalness: 0.05 });
    } else if (material === 'cobblestone') {
      roadMat = new THREE.MeshStandardMaterial({ color: 0x57606e, roughness: 0.92, metalness: 0.02 });
    } else if (material === 'wood') {
      roadMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.78, metalness: 0.0 });
    } else if (material === 'dirt') {
      roadMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.95, metalness: 0.0 });
    } else {
      // Sheikah Neon
      roadMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.2 });
    }

    const roadbed = new THREE.Mesh(new THREE.BoxGeometry(width, 0.16, length), roadMat);
    roadbed.position.y = 0.08;
    roadbed.castShadow = true;
    roadbed.receiveShadow = true;
    group.add(roadbed);

    // --- 2. Material-Specific Surface Details ---
    if (material === 'asphalt') {
      // Dashed yellow/white centerline
      const lineMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.45 });
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.02, length * 0.6), lineMat);
      line.position.set(0, 0.17, 0);
      group.add(line);

      // Edge tire ruts / rubber markings
      const skidMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.9 });
      const skidL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.005, length), skidMat);
      skidL.position.set(-halfW * 0.5, 0.165, 0);
      group.add(skidL);
      const skidR = skidL.clone();
      skidR.position.set(halfW * 0.5, 0.165, 0);
      group.add(skidR);
    } else if (material === 'cobblestone') {
      // Medieval paving flagstones & center curb
      const blockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85 });
      const darkJointMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.95 });

      for (let zOff = -length * 0.35; zOff <= length * 0.35; zOff += length * 0.35) {
        const joint = new THREE.Mesh(new THREE.BoxGeometry(width * 0.96, 0.015, 0.08), darkJointMat);
        joint.position.set(0, 0.17, zOff);
        group.add(joint);
      }
      const centerSpine = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.02, length), blockMat);
      centerSpine.position.set(0, 0.17, 0);
      group.add(centerSpine);
    } else if (material === 'wood') {
      // Heavy timber sleepers and iron bolt heads
      const beamMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.85 });
      const ironBoltMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });

      for (let zOff = -length * 0.35; zOff <= length * 0.35; zOff += length * 0.35) {
        const sleeper = new THREE.Mesh(new THREE.BoxGeometry(width * 1.02, 0.03, 0.28), beamMat);
        sleeper.position.set(0, 0.175, zOff);
        sleeper.castShadow = true;
        group.add(sleeper);

        const boltL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.04, 6), ironBoltMat);
        boltL.position.set(-halfW + 0.2, 0.19, zOff);
        group.add(boltL);
        const boltR = boltL.clone();
        boltR.position.set(halfW - 0.2, 0.19, zOff);
        group.add(boltR);
      }
    } else if (material === 'dirt') {
      // Sandy gravel tracks with dual dirt ruts
      const rutMat = new THREE.MeshStandardMaterial({ color: 0x573108, roughness: 0.98 });
      const rutL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.015, length), rutMat);
      rutL.position.set(-halfW * 0.45, 0.165, 0);
      group.add(rutL);
      const rutR = rutL.clone();
      rutR.position.set(halfW * 0.45, 0.165, 0);
      group.add(rutR);
    } else if (material === 'sheikah_neon') {
      // Glowing Sheikah energy glyph central rail
      const neonMat = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x00e5ff,
        emissiveIntensity: 2.4,
        roughness: 0.1,
      });
      const neonCore = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.025, length), neonMat);
      neonCore.position.set(0, 0.175, 0);
      group.add(neonCore);

      const edgeNeonL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.02, length), neonMat);
      edgeNeonL.position.set(-halfW + 0.2, 0.175, 0);
      group.add(edgeNeonL);
      const edgeNeonR = edgeNeonL.clone();
      edgeNeonR.position.set(halfW - 0.2, 0.175, 0);
      group.add(edgeNeonR);
    }

    // --- 3. Boundary Walls & Obstacles ---
    if (wall === 'racing_wall') {
      // 1.25m tall crash barrier with Red-White Racing Curbs & Steel Top Guardrail
      const barrierMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.75 });
      const redTrimMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.5 });
      const whiteTrimMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
      const railMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.75, roughness: 0.3 });

      // Left Wall
      const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.25, length), barrierMat);
      wallL.position.set(-halfW, 0.625, 0);
      wallL.castShadow = true;
      wallL.receiveShadow = true;
      group.add(wallL);

      const curbL = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, length), redTrimMat);
      curbL.position.set(-halfW, 1.28, 0);
      curbL.castShadow = true;
      group.add(curbL);

      const guardrailL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, length, 8), railMat);
      guardrailL.rotation.x = Math.PI / 2;
      guardrailL.position.set(-halfW + 0.12, 0.85, 0);
      group.add(guardrailL);

      // Right Wall
      const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.25, length), barrierMat);
      wallR.position.set(halfW, 0.625, 0);
      wallR.castShadow = true;
      wallR.receiveShadow = true;
      group.add(wallR);

      const curbR = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.16, length), whiteTrimMat);
      curbR.position.set(halfW, 1.28, 0);
      curbR.castShadow = true;
      group.add(curbR);

      const guardrailR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, length, 8), railMat);
      guardrailR.rotation.x = Math.PI / 2;
      guardrailR.position.set(halfW - 0.12, 0.85, 0);
      group.add(guardrailR);
    } else if (wall === 'stone_wall') {
      // 1.25m tall Natural Stone Wall with Coping Stones
      const stoneWallMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.88 });
      const capMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.8 });

      // Left Wall
      const wallL = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.25, length), stoneWallMat);
      wallL.position.set(-halfW, 0.625, 0);
      wallL.castShadow = true;
      wallL.receiveShadow = true;
      group.add(wallL);

      const capL = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, length), capMat);
      capL.position.set(-halfW, 1.28, 0);
      capL.castShadow = true;
      group.add(capL);

      // Right Wall
      const wallR = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.25, length), stoneWallMat);
      wallR.position.set(halfW, 0.625, 0);
      wallR.castShadow = true;
      wallR.receiveShadow = true;
      group.add(wallR);

      const capR = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.14, length), capMat);
      capR.position.set(halfW, 1.28, 0);
      capR.castShadow = true;
      group.add(capR);
    } else if (wall === 'wood_fence') {
      // 1.15m tall Timber Paddock Fence with Two Horizontal Rail Bars & End Posts
      const fenceWoodMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.8 });
      const fencePostMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });

      // Left Fence
      const postL1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.25, 6), fencePostMat);
      postL1.position.set(-halfW, 0.625, -length * 0.45);
      postL1.castShadow = true;
      group.add(postL1);

      const postL2 = postL1.clone();
      postL2.position.set(-halfW, 0.625, length * 0.45);
      group.add(postL2);

      const railL1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, length), fenceWoodMat);
      railL1.position.set(-halfW, 0.55, 0);
      railL1.castShadow = true;
      group.add(railL1);

      const railL2 = railL1.clone();
      railL2.position.set(-halfW, 1.05, 0);
      group.add(railL2);

      // Right Fence
      const postR1 = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 1.25, 6), fencePostMat);
      postR1.position.set(halfW, 0.625, -length * 0.45);
      postR1.castShadow = true;
      group.add(postR1);

      const postR2 = postR1.clone();
      postR2.position.set(halfW, 0.625, length * 0.45);
      group.add(postR2);

      const railR1 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, length), fenceWoodMat);
      railR1.position.set(halfW, 0.55, 0);
      railR1.castShadow = true;
      group.add(railR1);

      const railR2 = railR1.clone();
      railR2.position.set(halfW, 1.05, 0);
      group.add(railR2);
    } else if (wall === 'curbs_only') {
      // 0.25m Low Beveled Edge Curbs
      const curbMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.7 });
      const curbL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, length), curbMat);
      curbL.position.set(-halfW, 0.125, 0);
      curbL.castShadow = true;
      group.add(curbL);

      const curbR = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, length), curbMat);
      curbR.position.set(halfW, 0.125, 0);
      curbR.castShadow = true;
      group.add(curbR);
    }

    return group;
  }

  private registerStructureObstacle(struct: BuildingStructure) {
    const rot = struct.rotationY || 0;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);

    // Helper to transform local (lx, lz) offset to world coordinates
    const toWorld = (lx: number, lz: number) => ({
      x: struct.position.x + lx * cos - lz * sin,
      z: struct.position.z + lx * sin + lz * cos,
    });

    if (struct.type === 'catan_settlement') {
      // Dimensions: local X from -3.0 to +3.0, local Z from -2.7 to +2.7.
      // Doorway is on Front Wall (local Z = +2.7) from local X = -1.0 to +1.0.
      const yBase = struct.position.y;
      const height = 4.0;
      const r = 0.5;

      // 1. Left Wall (local X = -2.975, Z from -2.6 to +2.6)
      for (let lz = -2.5; lz <= 2.5; lz += 0.8) {
        const pt = toWorld(-2.975, lz);
        this.obstacles.push({ id: `${struct.id}_lw_${lz.toFixed(1)}`, type: 'ruins', x: pt.x, z: pt.z, yBase, height, radius: r });
      }

      // 2. Right Wall (local X = +2.975, Z from -2.6 to +2.6)
      for (let lz = -2.5; lz <= 2.5; lz += 0.8) {
        const pt = toWorld(2.975, lz);
        this.obstacles.push({ id: `${struct.id}_rw_${lz.toFixed(1)}`, type: 'ruins', x: pt.x, z: pt.z, yBase, height, radius: r });
      }

      // 3. Back Wall (local Z = -2.675, X from -2.8 to +2.8)
      for (let lx = -2.7; lx <= 2.7; lx += 0.8) {
        const pt = toWorld(lx, -2.675);
        this.obstacles.push({ id: `${struct.id}_bw_${lx.toFixed(1)}`, type: 'ruins', x: pt.x, z: pt.z, yBase, height, radius: r });
      }

      // 4. Front Wall Left Panel (local Z = +2.675, X from -2.9 to -1.1)
      for (let lx = -2.8; lx <= -1.1; lx += 0.7) {
        const pt = toWorld(lx, 2.675);
        this.obstacles.push({ id: `${struct.id}_fwl_${lx.toFixed(1)}`, type: 'ruins', x: pt.x, z: pt.z, yBase, height, radius: r });
      }

      // 5. Front Wall Right Panel (local Z = +2.675, X from +1.1 to +2.9)
      for (let lx = 1.1; lx <= 2.8; lx += 0.7) {
        const pt = toWorld(lx, 2.675);
        this.obstacles.push({ id: `${struct.id}_fwr_${lx.toFixed(1)}`, type: 'ruins', x: pt.x, z: pt.z, yBase, height, radius: r });
      }

      return;
    }

    if (struct.type === 'catan_city') {
      // Dimensions: local X from -4.1 to +4.1, local Z from -3.6 to +3.6.
      // Doorway is on Front Wall (local Z = +3.6) from local X = -1.45 to +1.45.
      const yBase = struct.position.y;
      const height = 5.5;
      const r = 0.6;

      // 1. Left Wall (local X = -4.075, Z from -3.4 to +3.4)
      for (let lz = -3.4; lz <= 3.4; lz += 0.9) {
        const pt = toWorld(-4.075, lz);
        this.obstacles.push({ id: `${struct.id}_lw_${lz.toFixed(1)}`, type: 'ruins', x: pt.x, z: pt.z, yBase, height, radius: r });
      }

      // 2. Right Wall (local X = +4.075, Z from -3.4 to +3.4)
      for (let lz = -3.4; lz <= 3.4; lz += 0.9) {
        const pt = toWorld(4.075, lz);
        this.obstacles.push({ id: `${struct.id}_rw_${lz.toFixed(1)}`, type: 'ruins', x: pt.x, z: pt.z, yBase, height, radius: r });
      }

      // 3. Back Wall (local Z = -3.575, X from -3.8 to +3.8)
      for (let lx = -3.8; lx <= 3.8; lx += 0.9) {
        const pt = toWorld(lx, -3.575);
        this.obstacles.push({ id: `${struct.id}_bw_${lx.toFixed(1)}`, type: 'ruins', x: pt.x, z: pt.z, yBase, height, radius: r });
      }

      // 4. Front Wall Left Panel (local Z = +3.575, X from -3.8 to -1.5)
      for (let lx = -3.8; lx <= -1.5; lx += 0.8) {
        const pt = toWorld(lx, 3.575);
        this.obstacles.push({ id: `${struct.id}_fwl_${lx.toFixed(1)}`, type: 'ruins', x: pt.x, z: pt.z, yBase, height, radius: r });
      }

      // 5. Front Wall Right Panel (local Z = +3.575, X from +1.5 to +3.8)
      for (let lx = 1.5; lx <= 3.8; lx += 0.8) {
        const pt = toWorld(lx, 3.575);
        this.obstacles.push({ id: `${struct.id}_fwr_${lx.toFixed(1)}`, type: 'ruins', x: pt.x, z: pt.z, yBase, height, radius: r });
      }

      return;
    }

    if (struct.type === 'walled_road' || struct.type.startsWith('road_')) {
      // Check if wall style requires solid collision (racing_wall, stone_wall, wood_fence)
      let isSolidWall = true;
      let halfW = 2.5; // standard width / 2
      if (struct.type.startsWith('road_')) {
        const sub = struct.type.substring(5);
        if (sub.endsWith('_curbs_only') || sub.endsWith('_none')) {
          isSolidWall = false;
        }
      }

      if (isSolidWall) {
        const yBase = struct.position.y;
        const height = 1.35;
        const r = 0.55;

        // Left Wall Obstacle
        const ptL = toWorld(-halfW, 0);
        this.obstacles.push({
          id: `${struct.id}_lw`,
          type: 'prop',
          x: ptL.x,
          z: ptL.z,
          yBase,
          height,
          radius: r,
        });

        // Right Wall Obstacle
        const ptR = toWorld(halfW, 0);
        this.obstacles.push({
          id: `${struct.id}_rw`,
          type: 'prop',
          x: ptR.x,
          z: ptR.z,
          yBase,
          height,
          radius: r,
        });
      }
      return;
    }

    if (struct.type === 'track_start_gate' || struct.type === 'track_finish_gate') {
      const yBase = struct.position.y;
      const height = 5.5;
      const r = 0.8;

      const ptL = toWorld(-2.6, 0);
      this.obstacles.push({
        id: `${struct.id}_postL`,
        type: 'prop',
        x: ptL.x,
        z: ptL.z,
        yBase,
        height,
        radius: r,
      });

      const ptR = toWorld(2.6, 0);
      this.obstacles.push({
        id: `${struct.id}_postR`,
        type: 'prop',
        x: ptR.x,
        z: ptR.z,
        yBase,
        height,
        radius: r,
      });
      return;
    }

    let radius = 1.5;
    let height = 2.8;

    if (struct.type === 'pillar_wood') { radius = 0.5; height = 3.2; }
    else if (struct.type === 'campfire' || struct.type === 'workbench') { radius = 0.9; height = 1.2; }
    else if (struct.type === 'lantern_post') { radius = 0.45; height = 3.4; }
    else if (struct.type === 'target_dummy') { radius = 0.65; height = 2.2; }
    else if (struct.type === 'crate_wooden') { radius = 0.85; height = 1.3; }
    else if (struct.type === 'barrel_stack') { radius = 1.1; height = 1.6; }
    else if (struct.type === 'camp_tent') { radius = 1.8; height = 2.2; }
    else if (struct.type === 'stone_well') { radius = 1.6; height = 3.4; }
    else if (struct.type === 'watchtower') { radius = 2.2; height = 7.5; }
    else if (struct.type === 'windmill') { radius = 2.9; height = 10.0; }

    this.obstacles.push({
      id: struct.id,
      type: 'ruins',
      x: struct.position.x,
      z: struct.position.z,
      yBase: struct.position.y,
      height,
      radius,
    });
  }

  /**
   * Save placed structures to localStorage
   */
  private saveBuiltStructures() {
    try {
      const dataList = this.structures.map((s) => s.data);
      localStorage.setItem('HYRULE_BUILT_STRUCTURES', JSON.stringify(dataList));
    } catch (e) {
      console.warn('Failed to save structures:', e);
    }
  }

  /**
   * Load saved structures from localStorage
   */
  private loadBuiltStructures() {
    try {
      const raw = localStorage.getItem('HYRULE_BUILT_STRUCTURES');
      if (!raw) return;

      const list: BuildingStructure[] = JSON.parse(raw);
      list.forEach((struct) => {
        const group = this.createStructureMesh(struct.type, false);
        group.position.set(struct.position.x, struct.position.y, struct.position.z);
        group.rotation.y = struct.rotationY;

        this.group.add(group);
        this.structures.push({ data: struct, mesh: group });
        this.registerStructureObstacle(struct);
      });
    } catch (e) {
      console.warn('Failed to load structures:', e);
    }
  }

  /**
   * Check if player is standing near a Catan Settlement (Level 1) that can be upgraded
   */
  public getNearbySettlementToUpgrade(playerPos: THREE.Vector3): { data: BuildingStructure; mesh: THREE.Group } | null {
    for (const struct of this.structures) {
      if (struct.data.type === 'catan_settlement' && !struct.data.isUpgraded) {
        const p = struct.data.position;
        const dist = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
        if (dist < 5.0) {
          return struct;
        }
      }
    }
    return null;
  }

  /**
   * Upgrade a Level 1 Catan Settlement to a Level 2 Catan City Fortress
   */
  public upgradeSettlementToCity(structureId: string): boolean {
    const structIndex = this.structures.findIndex(s => s.data.id === structureId);
    if (structIndex === -1) return false;

    const target = this.structures[structIndex];
    if (target.data.type !== 'catan_settlement' || target.data.isUpgraded) return false;

    // Remove old mesh
    this.group.remove(target.mesh);

    // Create new Level 2 City Fortress mesh
    const cityMesh = this.createStructureMesh('catan_city', false);
    cityMesh.position.set(target.data.position.x, target.data.position.y, target.data.position.z);
    cityMesh.rotation.y = target.data.rotationY;

    this.group.add(cityMesh);

    // Clear old settlement obstacles
    this.obstacles = this.obstacles.filter(o => !o.id.startsWith(structureId));

    // Update data object
    target.data.type = 'catan_city';
    target.data.level = 2;
    target.data.isUpgraded = true;
    target.data.maxHealth = 600;
    target.data.health = 600;
    target.mesh = cityMesh;

    // Register new city obstacles
    this.registerStructureObstacle(target.data);

    if (this.onStructurePlaced) {
      this.onStructurePlaced(target.data.position, 'catan_city');
    }

    audioEngine.playShrineFanfare();
    this.saveBuiltStructures();
    return true;
  }

  /**
   * Check if player is standing on or near a Catan Road or Circuit Track (+30% movement speed)
   */
  public isPlayerOnCatanRoad(playerPos: THREE.Vector3): boolean {
    return this.structures.some((s) => {
      if (
        s.data.type === 'catan_road' ||
        s.data.type === 'walled_road' ||
        s.data.type === 'track_start_gate' ||
        s.data.type === 'track_finish_gate' ||
        s.data.type.startsWith('road_')
      ) {
        const p = s.data.position;
        return Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < 3.5;
      }
      return false;
    });
  }

  /**
   * Check if player is near a Catan Settlement or City for Health & Stamina Regeneration
   */
  public getNearbyBuildingHealing(playerPos: THREE.Vector3): number {
    let maxHeal = 0;
    for (const s of this.structures) {
      if (s.data.type === 'catan_settlement' || s.data.type === 'catan_city' || s.data.type === 'campfire') {
        const p = s.data.position;
        const dist = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
        if (dist < 6.5) {
          if (s.data.type === 'catan_city') maxHeal = Math.max(maxHeal, 1.5); // Fast HP regen
          else if (s.data.type === 'catan_settlement') maxHeal = Math.max(maxHeal, 0.8);
          else maxHeal = Math.max(maxHeal, 0.3);
        }
      }
    }
    return maxHeal;
  }

  /**
   * Check if player is near a Workbench to unlock advanced crafting
   */
  public isNearWorkbench(playerPos: THREE.Vector3): boolean {
    return this.structures.some((s) => {
      if (s.data.type === 'workbench') {
        const p = s.data.position;
        return Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < 4.5;
      }
      return false;
    });
  }

  /**
   * Continuous animation update for mechanical/animated structures (e.g. windmills)
   */
  public update(delta: number) {
    for (const struct of this.structures) {
      if (struct.data.type === 'windmill') {
        const rotor = struct.mesh.getObjectByName('WindmillRotor');
        if (rotor) {
          rotor.rotation.z += delta * 1.2;
        }
      }
    }

    // Also rotate active preview hologram if windmill
    if (this.currentPreviewType === 'windmill' && this.hologramGroup.visible) {
      const protoRotor = this.hologramGroup.getObjectByName('WindmillRotor');
      if (protoRotor) {
        protoRotor.rotation.z += delta * 1.2;
      }
    }
  }

  /**
   * Synchronize all placed player structures directly to terrain surface
   */
  public syncAllStructuresToTerrain() {
    for (const struct of this.structures) {
      const ny = TerrainManager.getTerrainHeight(struct.data.position.x, struct.data.position.z);
      struct.data.position.y = ny;
      struct.mesh.position.y = ny;

      const obs = this.obstacles.find((o) => o.id === struct.data.id);
      if (obs) {
        obs.yBase = ny;
      }
    }
  }
}

