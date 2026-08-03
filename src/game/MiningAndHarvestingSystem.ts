import * as THREE from 'three';
import { HarvestableNode, InventoryItem, ObstacleCollider, ToolTier, ToolType } from '../types';
import { TerrainManager } from './Terrain';
import { audioEngine } from './AudioEngine';

export class MiningAndHarvestingSystem {
  public group: THREE.Group = new THREE.Group();
  public nodes: { data: HarvestableNode; mesh: THREE.Group }[] = [];
  public obstacles: ObstacleCollider[] = [];

  // Floating debris / particles for mining feedback
  private particleGeo: THREE.BufferGeometry;
  private particleMat: THREE.PointsMaterial;
  private particleSystem: THREE.Points;
  private activeParticles: { pos: THREE.Vector3; vel: THREE.Vector3; color: THREE.Color; life: number; maxLife: number }[] = [];

  constructor(private scene: THREE.Scene) {
    this.group.name = 'MiningHarvestingGroup';
    this.scene.add(this.group);

    // Dynamic mining particle pool
    const pCount = 500;
    this.particleGeo = new THREE.BufferGeometry();
    const posArr = new Float32Array(pCount * 3);
    const colArr = new Float32Array(pCount * 3);
    this.particleGeo.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    this.particleGeo.setAttribute('color', new THREE.BufferAttribute(colArr, 3));

    this.particleMat = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });

    this.particleSystem = new THREE.Points(this.particleGeo, this.particleMat);
    this.scene.add(this.particleSystem);

    this.spawnWorldNodes();
  }

  /**
   * Populate world with realistic harvestable resource nodes
   */
  private spawnWorldNodes() {
    // 1. Ore Deposits in Mountains & Cliff Walls
    const oreTypes: { type: 'ore_iron' | 'ore_gold' | 'ore_crystal'; name: string; color: number; yield: string; reqTier: ToolTier }[] = [
      { type: 'ore_iron', name: 'Eisenerz-Ader', color: 0x8d99ae, yield: 'Eisenerz', reqTier: 'stone' },
      { type: 'ore_gold', name: 'Golderz-Ader', color: 0xffd166, yield: 'Golderz', reqTier: 'stone' },
      { type: 'ore_crystal', name: 'Kristall-Geode', color: 0x06b6d4, yield: 'Kristall', reqTier: 'iron' },
    ];

    for (let i = 0; i < 65; i++) {
      const x = (Math.random() - 0.5) * 600;
      const z = (Math.random() - 0.5) * 600;
      const y = TerrainManager.getTerrainHeight(x, z);
      const normal = TerrainManager.getTerrainNormal(x, z);

      // Place ores higher on mountains or steep cliffs
      if (y > 18.0 || (normal.y < 0.85 && y > 8.0)) {
        const oreConfig = y > 35.0 ? oreTypes[2] : (Math.random() < 0.35 ? oreTypes[1] : oreTypes[0]);
        this.createOreNode(x, y, z, oreConfig);
      }
    }

    // 2. Extra Boulders & Rock Formations (Loose Stone & Flint)
    for (let i = 0; i < 45; i++) {
      const x = (Math.random() - 0.5) * 500;
      const z = (Math.random() - 0.5) * 500;
      const y = TerrainManager.getTerrainHeight(x, z);

      if (y > TerrainManager.WATER_LEVEL + 0.5) {
        this.createRockNode(x, y, z);
      }
    }

    // 3. Harvestable Trees (Oak & Pine timber forests)
    // Starter trees close to player spawn point (x: 0, z: 0)
    const starterTreePositions = [
      { x: 8, z: 6, oak: true },
      { x: 12, z: -8, oak: true },
      { x: -10, z: 12, oak: true },
      { x: 18, z: 15, oak: false },
      { x: -15, z: -12, oak: true },
      { x: 22, z: -18, oak: false },
      { x: -22, z: 20, oak: true },
      { x: 6, z: -20, oak: true },
    ];
    starterTreePositions.forEach((pt) => {
      const y = TerrainManager.getTerrainHeight(pt.x, pt.z);
      this.createTreeNode(pt.x, y, pt.z, pt.oak);
    });

    // Starter Catan resources near spawn point (x: 0, z: 0)
    const starterNodes = [
      // Clay deposits near riverbank
      { x: 14, z: 10, type: 'clay' },
      { x: -16, z: 8, type: 'clay' },
      { x: 10, z: -14, type: 'clay' },
      // Wheat crops in plains
      { x: 6, z: 12, type: 'wheat' },
      { x: -8, z: -10, type: 'wheat' },
      { x: 15, z: -6, type: 'wheat' },
      // Wool bushes in pastures
      { x: -12, z: 14, type: 'wool' },
      { x: 16, z: 18, type: 'wool' },
      { x: -18, z: -8, type: 'wool' },
    ];
    starterNodes.forEach((s) => {
      const y = TerrainManager.getTerrainHeight(s.x, s.z);
      if (s.type === 'clay') this.createClayNode(s.x, y, s.z);
      if (s.type === 'wheat') this.createWheatNode(s.x, y, s.z);
      if (s.type === 'wool') this.createWoolNode(s.x, y, s.z);
    });

    // 4. Random Catan Resource Deposits Across World (Clay, Wheat, Wool)
    for (let i = 0; i < 60; i++) {
      const x = (Math.random() - 0.5) * 450;
      const z = (Math.random() - 0.5) * 450;
      const y = TerrainManager.getTerrainHeight(x, z);
      const normal = TerrainManager.getTerrainNormal(x, z);

      if (y > TerrainManager.WATER_LEVEL + 0.2 && y < 35.0 && normal.y > 0.65) {
        const rand = Math.random();
        if (rand < 0.35) {
          this.createClayNode(x, y, z);
        } else if (rand < 0.70) {
          this.createWheatNode(x, y, z);
        } else {
          this.createWoolNode(x, y, z);
        }
      }
    }
  }

  private createClayNode(x: number, y: number, z: number) {
    const nodeGroup = new THREE.Group();

    // Terracotta Clay Pit Mound
    const clayMat = new THREE.MeshStandardMaterial({ color: 0xc05621, roughness: 0.95 });
    const mound = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 1), clayMat);
    mound.scale.set(1.4, 0.6, 1.4);
    mound.position.y = 0.3;
    mound.castShadow = true;
    mound.receiveShadow = true;
    nodeGroup.add(mound);

    // Clay brick clumps
    const brickMat = new THREE.MeshStandardMaterial({ color: 0x9c4221, roughness: 0.9 });
    for (let b = 0; b < 3; b++) {
      const brick = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.4), brickMat);
      brick.position.set((b - 1) * 0.45, 0.5, (b % 2) * 0.3 - 0.15);
      brick.rotation.y = Math.random() * Math.PI;
      brick.castShadow = true;
      nodeGroup.add(brick);
    }

    nodeGroup.position.set(x, y, z);
    this.group.add(nodeGroup);

    const nodeData: HarvestableNode = {
      id: `clay_${Math.random()}`,
      type: 'clay_deposit',
      position: { x, y, z },
      health: 60,
      maxHealth: 60,
      yieldItem: 'Lehm',
      yieldQuantity: 3,
      isFallen: false,
    };

    this.nodes.push({ data: nodeData, mesh: nodeGroup });
    this.obstacles.push({ id: nodeData.id, type: 'rock', x, z, yBase: y, height: 1.0, radius: 0.8 });
  }

  private createWheatNode(x: number, y: number, z: number) {
    const nodeGroup = new THREE.Group();

    // Golden Wheat Sheaf Cluster
    const wheatMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.6 });
    const stalkMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.8 });

    for (let s = 0; s < 7; s++) {
      const angle = (s / 7) * Math.PI * 2;
      const r = 0.25 + Math.random() * 0.25;
      const sx = Math.cos(angle) * r;
      const sz = Math.sin(angle) * r;

      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.2, 5), stalkMat);
      stalk.position.set(sx, 0.6, sz);
      stalk.rotation.z = (Math.random() - 0.5) * 0.3;
      stalk.castShadow = true;
      nodeGroup.add(stalk);

      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 6), wheatMat);
      ear.position.set(sx, 1.2, sz);
      ear.castShadow = true;
      nodeGroup.add(ear);
    }

    nodeGroup.position.set(x, y, z);
    this.group.add(nodeGroup);

    const nodeData: HarvestableNode = {
      id: `wheat_${Math.random()}`,
      type: 'wheat_crop',
      position: { x, y, z },
      health: 40,
      maxHealth: 40,
      yieldItem: 'Getreide',
      yieldQuantity: 3,
      isFallen: false,
    };

    this.nodes.push({ data: nodeData, mesh: nodeGroup });
  }

  private createWoolNode(x: number, y: number, z: number) {
    const nodeGroup = new THREE.Group();

    // Soft White Wool Shrub / Sheep Pasture Bush
    const woolMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.9, metalness: 0.05 });
    const woolBaseMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.85 });

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.6, 6), woolBaseMat);
    stem.position.y = 0.3;
    nodeGroup.add(stem);

    for (let w = 0; w < 4; w++) {
      const puff = new THREE.Mesh(new THREE.DodecahedronGeometry(0.42, 1), woolMat);
      const angle = (w / 4) * Math.PI * 2;
      puff.position.set(Math.cos(angle) * 0.25, 0.7 + (w % 2) * 0.15, Math.sin(angle) * 0.25);
      puff.castShadow = true;
      nodeGroup.add(puff);
    }

    nodeGroup.position.set(x, y, z);
    this.group.add(nodeGroup);

    const nodeData: HarvestableNode = {
      id: `wool_${Math.random()}`,
      type: 'wool_bush',
      position: { x, y, z },
      health: 40,
      maxHealth: 40,
      yieldItem: 'Wolle',
      yieldQuantity: 3,
      isFallen: false,
    };

    this.nodes.push({ data: nodeData, mesh: nodeGroup });
  }

  private createTreeNode(x: number, y: number, z: number, isOak: boolean = true) {
    const nodeGroup = new THREE.Group();

    // Wooden Trunk with flared root base
    const trunkMat = new THREE.MeshStandardMaterial({ color: isOak ? 0x5c3d1e : 0x3d2712, roughness: 0.88 });
    const trunkGeo = new THREE.CylinderGeometry(0.32, 0.62, 4.4, 8);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.2;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    nodeGroup.add(trunk);

    // Branch Forks
    if (isOak) {
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 1.8, 6), trunkMat);
      b1.position.set(0.4, 3.8, 0.2);
      b1.rotation.z = -Math.PI / 5;
      b1.castShadow = true;
      nodeGroup.add(b1);

      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 1.6, 6), trunkMat);
      b2.position.set(-0.35, 4.0, -0.2);
      b2.rotation.z = Math.PI / 4.5;
      b2.castShadow = true;
      nodeGroup.add(b2);

      // Lush Multi-Cluster Canopy
      const greens = [0x2e7d32, 0x1b5e20, 0x388e3c, 0x226b28];
      const clusterOffsets = [
        { x: 0, y: 5.5, z: 0, r: 2.4, c: greens[0] },
        { x: 1.1, y: 5.2, z: 0.8, r: 1.8, c: greens[1] },
        { x: -1.0, y: 5.4, z: -0.7, r: 1.9, c: greens[2] },
        { x: 0.7, y: 6.2, z: -0.9, r: 1.7, c: greens[3] },
        { x: -0.8, y: 6.1, z: 0.9, r: 1.8, c: greens[0] },
        { x: 0, y: 6.8, z: 0, r: 1.6, c: greens[2] },
      ];

      clusterOffsets.forEach((cl) => {
        const mat = new THREE.MeshStandardMaterial({ color: cl.c, roughness: 0.65 });
        const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(cl.r, 1), mat);
        crown.position.set(cl.x, cl.y, cl.z);
        crown.castShadow = true;
        crown.receiveShadow = true;
        nodeGroup.add(crown);
      });
    } else {
      // Alpine Pine Canopy Tiers
      const pineGreens = [0x1b4332, 0x2d6a4f, 0x081c15, 0x40916c];
      const tiers = [
        { y: 4.8, r: 2.8, h: 3.8, c: pineGreens[0] },
        { y: 6.4, r: 2.2, h: 3.2, c: pineGreens[1] },
        { y: 7.8, r: 1.6, h: 2.6, c: pineGreens[2] },
        { y: 9.0, r: 1.0, h: 2.0, c: pineGreens[3] },
      ];

      tiers.forEach((t) => {
        const mat = new THREE.MeshStandardMaterial({ color: t.c, roughness: 0.7 });
        const cone = new THREE.Mesh(new THREE.ConeGeometry(t.r, t.h, 7), mat);
        cone.position.y = t.y;
        cone.castShadow = true;
        cone.receiveShadow = true;
        nodeGroup.add(cone);
      });
    }

    nodeGroup.position.set(x, y, z);
    this.group.add(nodeGroup);

    const nodeData: HarvestableNode = {
      id: `tree_${Math.random()}`,
      type: isOak ? 'tree_oak' : 'tree_pine',
      position: { x, y, z },
      health: 100,
      maxHealth: 100,
      requiredTool: 'axe',
      minTier: 'wood',
      yieldItem: isOak ? 'Eichenholz' : 'Kiefernholz',
      yieldQuantity: 4,
      isFallen: false,
    };

    this.nodes.push({ data: nodeData, mesh: nodeGroup });
    this.obstacles.push({
      id: nodeData.id,
      type: 'tree',
      x,
      z,
      yBase: y,
      height: 7.5,
      radius: 0.45,
    });
  }

  private createOreNode(x: number, y: number, z: number, config: any) {
    const nodeGroup = new THREE.Group();

    // Dark slate rock matrix base
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 });
    const baseMesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1.2, 1), baseMat);
    baseMesh.scale.set(1.2, 0.8, 1.2);
    baseMesh.castShadow = true;
    nodeGroup.add(baseMesh);

    // Vein / Crystal spikes
    const veinMat = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.2,
      metalness: 0.9,
      emissive: config.type === 'ore_crystal' ? config.color : 0x000000,
      emissiveIntensity: config.type === 'ore_crystal' ? 0.8 : 0,
    });

    for (let j = 0; j < 5; j++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.35, 1.1, 5), veinMat);
      spike.position.set(
        (Math.random() - 0.5) * 0.9,
        0.4 + Math.random() * 0.5,
        (Math.random() - 0.5) * 0.9
      );
      spike.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
      spike.castShadow = true;
      nodeGroup.add(spike);
    }

    nodeGroup.position.set(x, y, z);
    this.group.add(nodeGroup);

    const nodeData: HarvestableNode = {
      id: `ore_${Math.random()}`,
      type: config.type,
      position: { x, y, z },
      health: config.type === 'ore_crystal' ? 80 : 50,
      maxHealth: config.type === 'ore_crystal' ? 80 : 50,
      requiredTool: 'pickaxe',
      minTier: config.reqTier,
      yieldItem: config.yield,
      yieldQuantity: config.type === 'ore_crystal' ? 2 : 3,
    };

    this.nodes.push({ data: nodeData, mesh: nodeGroup });
    this.obstacles.push({
      id: nodeData.id,
      type: 'rock',
      x,
      z,
      yBase: y,
      height: 1.5,
      radius: 1.1,
    });
  }

  private createRockNode(x: number, y: number, z: number) {
    const nodeGroup = new THREE.Group();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.82 });

    const mesh = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 1), rockMat);
    mesh.scale.set(1.1, 0.75, 1.1);
    mesh.castShadow = true;
    nodeGroup.add(mesh);

    nodeGroup.position.set(x, y, z);
    this.group.add(nodeGroup);

    const nodeData: HarvestableNode = {
      id: `rock_${Math.random()}`,
      type: 'rock_boulder',
      position: { x, y, z },
      health: 40,
      maxHealth: 40,
      requiredTool: 'pickaxe',
      minTier: 'wood',
      yieldItem: 'Rohstein',
      yieldQuantity: 4,
    };

    this.nodes.push({ data: nodeData, mesh: nodeGroup });
    this.obstacles.push({
      id: nodeData.id,
      type: 'rock',
      x,
      z,
      yBase: y,
      height: 1.2,
      radius: 1.0,
    });
  }

  /**
   * Handle player striking a node or terrain with an equipped tool
   */
  public hitHarvestableNode(
    playerPos: THREE.Vector3,
    playerRotY: number,
    equippedTool?: InventoryItem
  ): { hit: boolean; message?: string; itemYielded?: { name: string; qty: number } } {
    // Strike ray vector 2.6 meters in front of player
    const strikeTarget = new THREE.Vector3(
      playerPos.x + Math.sin(playerRotY) * 2.5,
      playerPos.y + 1.0,
      playerPos.z + Math.cos(playerRotY) * 2.5
    );

    let closestNodeIdx = -1;
    let minDistance = 4.2; // Generous reach for comfortable harvesting & tree chopping

    this.nodes.forEach((item, index) => {
      const nodePos = new THREE.Vector3(item.data.position.x, item.data.position.y + 0.6, item.data.position.z);
      const distFromRay = strikeTarget.distanceTo(nodePos);
      const distFromPlayer = playerPos.distanceTo(nodePos);
      // Combine distance from strike point & player body center
      const effectiveDist = Math.min(distFromRay, distFromPlayer * 0.82);

      if (effectiveDist < minDistance) {
        minDistance = effectiveDist;
        closestNodeIdx = index;
      }
    });

    if (closestNodeIdx >= 0) {
      const target = this.nodes[closestNodeIdx];
      const { data, mesh } = target;

      const toolType = equippedTool?.toolType || 'sword';
      const toolTier = equippedTool?.toolTier || 'wood';

      // Damage calculation
      let damage = 18; // Base strike damage
      let multiplier = 1.0;

      const isTree = data.type === 'tree_oak' || data.type === 'tree_pine';

      if (isTree) {
        if (toolType === 'axe') {
          multiplier = toolTier === 'steel' ? 5.0 : toolTier === 'iron' ? 3.8 : toolTier === 'stone' ? 2.8 : 2.2;
        } else {
          multiplier = 1.2;
        }
      } else if (data.requiredTool && toolType === data.requiredTool) {
        multiplier = toolTier === 'steel' ? 4.5 : toolTier === 'iron' ? 3.2 : toolTier === 'stone' ? 2.2 : 1.5;
      } else if (data.requiredTool) {
        multiplier = 0.4;
      }

      const totalDamage = Math.round(damage * multiplier);

      // Spawn strike particles
      let pColor = new THREE.Color(0xe2e8f0);
      if (isTree) {
        pColor = new THREE.Color(0x8b5a2b); // Wood chip brown
      } else if (data.type === 'ore_gold') {
        pColor = new THREE.Color(0xffd166);
      } else if (data.type === 'ore_crystal') {
        pColor = new THREE.Color(0x06b6d4);
      }
      this.spawnDebrisParticles(mesh.position, pColor, 22);

      // Play impact sound effect
      audioEngine.playSwordSlash();

      // Tool durability reduction
      if (equippedTool && equippedTool.durability !== undefined) {
        equippedTool.durability = Math.max(0, equippedTool.durability - 1);
      }

      // Special 2-Phase Tree Logic
      if (isTree && !data.isFallen) {
        data.health -= totalDamage;

        if (data.health <= 50) {
          // 2nd Strike: Tree Falls Over onto the ground!
          data.isFallen = true;
          data.health = 50; // Set health for the fallen log

          // Tilt tree trunk over onto the ground in front of player
          mesh.rotation.z = Math.PI / 2;
          mesh.rotation.x = playerRotY;
          mesh.position.y = TerrainManager.getTerrainHeight(data.position.x, data.position.z) + 0.35;

          // Timber crash sound + leaf explosion particles
          this.spawnDebrisParticles(
            new THREE.Vector3(data.position.x, mesh.position.y + 0.5, data.position.z),
            new THREE.Color(0x388e3c),
            45
          );
          audioEngine.playHitImpact();

          // Reduce obstacle height so player can step over/onto fallen trunk
          const obs = this.obstacles.find((o) => o.id === data.id);
          if (obs) {
            obs.height = 0.8;
            obs.radius = 0.8;
          }

          return {
            hit: true,
            message: '🪓 Baum gefällt! Schlag den liegenden Stamm, um Holz & Stöcke zu ernten.',
          };
        } else {
          // 1st Strike: Tree wobbles back & forth
          mesh.rotation.z = 0.15;
          setTimeout(() => (mesh.rotation.z = 0), 180);

          return {
            hit: true,
            message: '🌳 Baum angeschlagen! Noch ein Schlag, um ihn zu fällen.',
          };
        }
      }

      // Normal node or fallen tree log chopping
      data.health -= totalDamage;

      if (data.health <= 0) {
        // Destroy node/log with shatter burst
        this.spawnDebrisParticles(mesh.position, pColor, 50);
        this.group.remove(mesh);
        this.nodes.splice(closestNodeIdx, 1);

        // Remove obstacle collider so player can walk freely through
        const obsIdx = this.obstacles.findIndex((o) => o.id === data.id);
        if (obsIdx >= 0) this.obstacles.splice(obsIdx, 1);

        audioEngine.playHitImpact();

        const successMsg = isTree
          ? `Holz geerntet: +${data.yieldQuantity} ${data.yieldItem} & +2 Stöcke!`
          : `Ressource abgebaut: +${data.yieldQuantity} ${data.yieldItem}!`;

        return {
          hit: true,
          message: successMsg,
          itemYielded: { name: data.yieldItem, qty: data.yieldQuantity },
        };
      } else {
        // Wobble hit feedback animation
        mesh.scale.set(1.15, 0.85, 1.15);
        setTimeout(() => mesh.scale.set(1.0, 1.0, 1.0), 120);

        return {
          hit: true,
          message: `${data.yieldItem} getroffen! HP: ${Math.max(0, data.health)}/${data.maxHealth}`,
        };
      }
    }

    return { hit: false };
  }

  private spawnDebrisParticles(pos: THREE.Vector3, color: THREE.Color, count: number) {
    for (let i = 0; i < count; i++) {
      this.activeParticles.push({
        pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.4, (Math.random() - 0.5) * 0.6)),
        vel: new THREE.Vector3((Math.random() - 0.5) * 4.5, 2.5 + Math.random() * 4.0, (Math.random() - 0.5) * 4.5),
        color: color.clone(),
        life: 0,
        maxLife: 0.4 + Math.random() * 0.4,
      });
    }
  }

  public update(delta: number) {
    // Update active particle pool
    const posAttr = this.particleGeo.attributes.position as THREE.BufferAttribute;
    const colAttr = this.particleGeo.attributes.color as THREE.BufferAttribute;

    let idx = 0;
    for (let i = this.activeParticles.length - 1; i >= 0; i--) {
      const p = this.activeParticles[i];
      p.life += delta;

      if (p.life >= p.maxLife) {
        this.activeParticles.splice(i, 1);
        continue;
      }

      p.pos.addScaledVector(p.vel, delta);
      p.vel.y -= 9.8 * delta; // Gravity

      posAttr.setXYZ(idx, p.pos.x, p.pos.y, p.pos.z);
      colAttr.setXYZ(idx, p.color.r, p.color.g, p.color.b);
      idx++;
    }

    // Hide remaining unused particle vertices
    for (let i = idx; i < 500; i++) {
      posAttr.setXYZ(i, 0, -1000, 0);
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
  }
}
