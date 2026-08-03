import * as THREE from 'three';
import { BuildingStructure, ObstacleCollider } from '../types';
import { TerrainManager } from './Terrain';
import { audioEngine } from './AudioEngine';

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

    let radius = 1.5;
    let height = 2.8;

    if (struct.type === 'pillar_wood') radius = 0.5;
    if (struct.type === 'campfire' || struct.type === 'workbench') radius = 0.9;

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
   * Check if player is standing on or near a Catan Road (+25% movement speed)
   */
  public isPlayerOnCatanRoad(playerPos: THREE.Vector3): boolean {
    return this.structures.some(s => {
      if (s.data.type === 'catan_road') {
        const p = s.data.position;
        return Math.hypot(p.x - playerPos.x, p.z - playerPos.z) < 2.5;
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
}
