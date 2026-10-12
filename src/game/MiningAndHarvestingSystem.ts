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

    // 5. Enchanted Sakura Cherry Blossom Groves (East Riverbank & Hills)
    const sakuraPositions = [
      { x: 32, z: 24 },
      { x: 40, z: 18 },
      { x: 48, z: 32 },
      { x: -65, z: 50 },
      { x: -75, z: 62 },
    ];
    sakuraPositions.forEach((pt) => {
      const y = TerrainManager.getTerrainHeight(pt.x, pt.z);
      this.createSakuraTree(pt.x, y, pt.z);
    });

    // 6. Silver Birch Forests (North-East Birch Meadows)
    const birchPositions = [
      { x: 55, z: -35 },
      { x: 68, z: -48 },
      { x: 80, z: -30 },
      { x: -45, z: -65 },
      { x: -58, z: -80 },
    ];
    birchPositions.forEach((pt) => {
      const y = TerrainManager.getTerrainHeight(pt.x, pt.z);
      this.createBirchTree(pt.x, y, pt.z);
    });

    // 7. Crisp Apple Trees (Near Village Outpost & Starter Glade)
    const applePositions = [
      { x: -14, z: -5 },
      { x: 25, z: -10 },
      { x: -28, z: 30 },
      { x: 12, z: 28 },
    ];
    applePositions.forEach((pt) => {
      const y = TerrainManager.getTerrainHeight(pt.x, pt.z);
      this.createAppleTree(pt.x, y, pt.z);
    });

    // 8. Sacred Silent Princess Flowers (Hidden in quiet clearings & near shrines)
    const silentPrincessPositions = [
      { x: 5, z: 16 },
      { x: -18, z: 18 },
      { x: 38, z: 28 },
      { x: -60, z: 45 },
      { x: 72, z: -55 },
      { x: -120, z: -60 },
    ];
    silentPrincessPositions.forEach((pt) => {
      const y = TerrainManager.getTerrainHeight(pt.x, pt.z);
      this.createSilentPrincess(pt.x, y, pt.z);
    });

    // 9. Forest Mushrooms & Stamella Shroom Clusters (Near tree roots)
    const shroomPositions = [
      { x: 9, z: 7 },
      { x: -11, z: 13 },
      { x: 19, z: 16 },
      { x: 26, z: -9 },
      { x: -21, z: -11 },
      { x: 42, z: 20 },
    ];
    shroomPositions.forEach((pt) => {
      const y = TerrainManager.getTerrainHeight(pt.x, pt.z);
      this.createShroomCluster(pt.x, y, pt.z);
    });

    // 10. Sweet Wild Berry Bushes (Edges of forests & hillsides)
    const berryPositions = [
      { x: 15, z: 4 },
      { x: -7, z: 22 },
      { x: 30, z: 12 },
      { x: -32, z: -15 },
      { x: 50, z: -20 },
    ];
    berryPositions.forEach((pt) => {
      const y = TerrainManager.getTerrainHeight(pt.x, pt.z);
      this.createBerryBush(pt.x, y, pt.z);
    });
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

  public createTreeNode(x: number, y: number, z: number, isOak: boolean = true): THREE.Group {
    const nodeGroup = new THREE.Group();

    // High-Detail Wooden Trunk with flared root base
    const trunkMat = new THREE.MeshStandardMaterial({ color: isOak ? 0x543618 : 0x382310, roughness: 0.88 });
    const mossBaseMat = new THREE.MeshStandardMaterial({ color: 0x2e5927, roughness: 0.92 });
    const trunkGeo = new THREE.CylinderGeometry(0.36, 0.72, 4.8, 16);
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 2.4;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    nodeGroup.add(trunk);

    // Moss collar at base of trunk
    const mossCollar = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.76, 0.38, 16), mossBaseMat);
    mossCollar.position.y = 0.2;
    mossCollar.castShadow = true;
    nodeGroup.add(mossCollar);

    // Root buttresses spreading organically into terrain
    for (let r = 0; r < 4; r++) {
      const rootAngle = (r / 4) * Math.PI * 2 + 0.35;
      const rootGeo = new THREE.ConeGeometry(0.26, 1.4, 8);
      const root = new THREE.Mesh(rootGeo, trunkMat);
      root.position.set(Math.cos(rootAngle) * 0.58, 0.5, Math.sin(rootAngle) * 0.58);
      root.rotation.x = Math.sin(rootAngle) * 0.48;
      root.rotation.z = -Math.cos(rootAngle) * 0.48;
      root.castShadow = true;
      nodeGroup.add(root);
    }

    // Branch Forks & Foliage Canopies
    if (isOak) {
      // 3 Heavy architectural branches
      const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.2, 8), trunkMat);
      b1.position.set(0.48, 4.0, 0.28);
      b1.rotation.z = -Math.PI / 4.6;
      b1.castShadow = true;
      nodeGroup.add(b1);

      const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.26, 2.0, 8), trunkMat);
      b2.position.set(-0.46, 4.2, -0.28);
      b2.rotation.z = Math.PI / 4.4;
      b2.castShadow = true;
      nodeGroup.add(b2);

      const b3 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.24, 1.8, 8), trunkMat);
      b3.position.set(0.1, 4.3, -0.45);
      b3.rotation.x = Math.PI / 4.8;
      b3.castShadow = true;
      nodeGroup.add(b3);

      // Lush BotW Stylized Organic Leaf Clumps (High-Poly Subdivided Icosahedrons)
      const greens = [0x275922, 0x1d4719, 0x33742d, 0x245e1f, 0x3d8635, 0x47943f];
      const clusterOffsets = [
        { x: 0, y: 5.7, z: 0, r: 2.6, c: greens[0], sy: 0.92 },
        { x: 1.3, y: 5.4, z: 0.85, r: 2.0, c: greens[1], sy: 0.88 },
        { x: -1.2, y: 5.6, z: -0.75, r: 2.1, c: greens[2], sy: 0.88 },
        { x: 0.85, y: 6.5, z: -0.95, r: 1.9, c: greens[3], sy: 0.90 },
        { x: -0.9, y: 6.4, z: 0.95, r: 2.0, c: greens[4], sy: 0.88 },
        { x: 0.1, y: 7.2, z: 0.1, r: 1.8, c: greens[5], sy: 0.94 },
        { x: 1.1, y: 6.3, z: 0.7, r: 1.6, c: greens[2], sy: 0.88 },
        { x: -0.6, y: 5.1, z: 1.4, r: 1.7, c: greens[1], sy: 0.86 },
        { x: 0.7, y: 5.2, z: -1.3, r: 1.7, c: greens[3], sy: 0.86 },
      ];

      clusterOffsets.forEach((cl) => {
        const mat = new THREE.MeshStandardMaterial({
          color: cl.c,
          roughness: 0.62,
          metalness: 0.03,
          flatShading: false,
        });
        const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(cl.r, 2), mat);
        crown.position.set(cl.x, cl.y, cl.z);
        crown.scale.set(1.0, cl.sy, 1.0);
        crown.castShadow = true;
        crown.receiveShadow = true;
        nodeGroup.add(crown);
      });
    } else {
      // Alpine Pine 5-Tier Canopy with High-Poly Branch Rings & summit snow frosting
      const isMountainSnowZone = y > 22.0;
      const pineGreens = [0x133824, 0x1a462e, 0x0c2518, 0x22583b, 0x2e6d4c];
      const snowWhite = 0xf0f7ff;
      const tiers = [
        { y: 4.6, r: 3.2, h: 3.6, c: pineGreens[0] },
        { y: 6.2, r: 2.6, h: 3.1, c: pineGreens[1] },
        { y: 7.6, r: 2.0, h: 2.7, c: pineGreens[2] },
        { y: 8.8, r: 1.5, h: 2.3, c: isMountainSnowZone ? snowWhite : pineGreens[3] },
        { y: 9.8, r: 1.0, h: 1.9, c: isMountainSnowZone ? snowWhite : pineGreens[4] },
      ];

      tiers.forEach((t) => {
        const mat = new THREE.MeshStandardMaterial({
          color: t.c,
          roughness: 0.68,
          metalness: 0.04,
        });
        const cone = new THREE.Mesh(new THREE.ConeGeometry(t.r, t.h, 16), mat);
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
    return nodeGroup;
  }

  public createOreNode(x: number, y: number, z: number, config: any): THREE.Group {
    const nodeGroup = new THREE.Group();

    // Dark slate rock matrix base with natural facets
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.85 });
    const baseMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.25, 2), baseMat);
    baseMesh.scale.set(1.2, 0.75, 1.2);
    baseMesh.castShadow = true;
    baseMesh.receiveShadow = true;
    nodeGroup.add(baseMesh);

    // Vein / Crystal spikes with sharp specular reflections and glowing facets
    const veinMat = new THREE.MeshStandardMaterial({
      color: config.color,
      roughness: 0.15,
      metalness: 0.95,
      emissive: config.type === 'ore_crystal' ? config.color : 0x111111,
      emissiveIntensity: config.type === 'ore_crystal' ? 0.9 : 0.15,
    });

    for (let j = 0; j < 7; j++) {
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.15, 6), veinMat);
      spike.position.set(
        (Math.random() - 0.5) * 1.0,
        0.35 + Math.random() * 0.55,
        (Math.random() - 0.5) * 1.0
      );
      spike.rotation.set(Math.random() * 0.6, Math.random() * Math.PI, Math.random() * 0.6);
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
    return nodeGroup;
  }

  public createRockNode(x: number, y: number, z: number): THREE.Group {
    const nodeGroup = new THREE.Group();
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.80 });
    const mossCapMat = new THREE.MeshStandardMaterial({ color: 0x2e5e29, roughness: 0.88 });

    // Weathered high-poly rock boulder
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 2), rockMat);
    mesh.scale.set(1.15, 0.8, 1.25);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    nodeGroup.add(mesh);

    // Natural moss crest on the top surface
    const mossCap = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 0.18, 12), mossCapMat);
    mossCap.position.y = 0.72;
    mossCap.castShadow = true;
    nodeGroup.add(mossCap);

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
    return nodeGroup;
  }

  public createSakuraTree(x: number, y: number, z: number): THREE.Group {
    const nodeGroup = new THREE.Group();
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.88 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.68, 5.0, 14), trunkMat);
    trunk.position.y = 2.5;
    trunk.rotation.z = (Math.random() - 0.5) * 0.18;
    trunk.castShadow = true;
    trunk.receiveShadow = true;
    nodeGroup.add(trunk);

    for (const side of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 2.4, 8), trunkMat);
      b.position.set(side * 0.52, 4.3, 0);
      b.rotation.z = side * -0.58;
      b.castShadow = true;
      nodeGroup.add(b);
    }

    const bFront = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 2.0, 8), trunkMat);
    bFront.position.set(0, 4.4, 0.5);
    bFront.rotation.x = 0.55;
    bFront.castShadow = true;
    nodeGroup.add(bFront);

    const pinkPinks = [0xf472b6, 0xfbcfe8, 0xf9a8d4, 0xf43f5e];
    const cl1 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.8, 2), new THREE.MeshStandardMaterial({ color: pinkPinks[0], roughness: 0.65 }));
    cl1.position.set(0, 6.0, 0);
    cl1.scale.set(1.4, 1.1, 1.4);
    cl1.castShadow = true;
    nodeGroup.add(cl1);

    const cl2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 2), new THREE.MeshStandardMaterial({ color: pinkPinks[1], roughness: 0.65 }));
    cl2.position.set(1.5, 5.5, 0.9);
    cl2.scale.set(1.15, 0.92, 1.15);
    cl2.castShadow = true;
    nodeGroup.add(cl2);

    const cl3 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5, 2), new THREE.MeshStandardMaterial({ color: pinkPinks[2], roughness: 0.65 }));
    cl3.position.set(-1.4, 5.7, -0.8);
    cl3.scale.set(1.2, 0.95, 1.2);
    cl3.castShadow = true;
    nodeGroup.add(cl3);

    const cl4 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, 2), new THREE.MeshStandardMaterial({ color: pinkPinks[3], roughness: 0.65 }));
    cl4.position.set(0.2, 6.8, -0.4);
    cl4.scale.set(1.1, 0.9, 1.1);
    cl4.castShadow = true;
    nodeGroup.add(cl4);

    nodeGroup.position.set(x, y, z);
    this.group.add(nodeGroup);

    const nodeData: HarvestableNode = {
      id: `sakura_${Math.random()}`,
      type: 'tree_sakura',
      position: { x, y, z },
      health: 100,
      maxHealth: 100,
      requiredTool: 'axe',
      minTier: 'wood',
      yieldItem: 'Kirschblütenholz',
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
      radius: 0.5,
    });
    return nodeGroup;
  }

  public createBirchTree(x: number, y: number, z: number): THREE.Group {
    const nodeGroup = new THREE.Group();
    const birchMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.68 });
    const darkNotchMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.9 });
    const leafMat1 = new THREE.MeshStandardMaterial({ color: 0x84cc16, roughness: 0.65 });
    const leafMat2 = new THREE.MeshStandardMaterial({ color: 0xa3e635, roughness: 0.65 });

    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.40, 6.2, 14), birchMat);
    trunk.position.y = 3.1;
    trunk.castShadow = true;
    nodeGroup.add(trunk);

    for (let n = 0; n < 6; n++) {
      const notch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.54), darkNotchMat);
      notch.position.set(0, 1.0 + n * 0.85, 0);
      notch.rotation.y = n * 1.35;
      nodeGroup.add(notch);
    }

    const crown1 = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 2), leafMat1);
    crown1.position.y = 6.2;
    crown1.scale.set(1.0, 1.4, 1.0);
    crown1.castShadow = true;
    nodeGroup.add(crown1);

    const crown2 = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 2), leafMat2);
    crown2.position.set(0.4, 7.5, 0.2);
    crown2.scale.set(0.9, 1.2, 0.9);
    crown2.castShadow = true;
    nodeGroup.add(crown2);

    nodeGroup.position.set(x, y, z);
    this.group.add(nodeGroup);

    const nodeData: HarvestableNode = {
      id: `birch_${Math.random()}`,
      type: 'tree_birch',
      position: { x, y, z },
      health: 80,
      maxHealth: 80,
      requiredTool: 'axe',
      minTier: 'wood',
      yieldItem: 'Birkenholz',
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
      height: 8.0,
      radius: 0.4,
    });
    return nodeGroup;
  }

  public createAppleTree(x: number, y: number, z: number): THREE.Group {
    const nodeGroup = this.createTreeNode(x, y, z, true);
    const appleMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.3, metalness: 0.1 });
    const appleOffsets = [
      { x: 0.9, y: 4.8, z: 0.6 },
      { x: -0.8, y: 4.7, z: 0.7 },
      { x: 0.4, y: 4.9, z: -0.9 },
      { x: -0.6, y: 5.0, z: -0.8 },
      { x: 1.1, y: 5.2, z: -0.3 },
      { x: -1.0, y: 5.1, z: 0.2 },
    ];
    appleOffsets.forEach((ao) => {
      const apple = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), appleMat);
      apple.position.set(ao.x, ao.y, ao.z);
      apple.castShadow = true;
      nodeGroup.add(apple);
    });

    const targetNode = this.nodes.find((n) => n.mesh === nodeGroup);
    if (targetNode) {
      targetNode.data.type = 'tree_apple';
      targetNode.data.yieldItem = 'Knackiger Apfel';
      targetNode.data.yieldQuantity = 3;
    }
    return nodeGroup;
  }

  public createSilentPrincess(x: number, y: number, z: number): THREE.Group {
    const nodeGroup = new THREE.Group();
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 });
    const petalMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 2.5,
      roughness: 0.2,
    });
    const whitePetalMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      emissive: 0xbae6fd,
      emissiveIntensity: 1.5,
    });

    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.9, 6), stemMat);
    stem.position.y = 0.45;
    stem.rotation.z = (Math.random() - 0.5) * 0.2;
    nodeGroup.add(stem);

    for (let p = 0; p < 5; p++) {
      const angle = (p / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.45, 4), p % 2 === 0 ? petalMat : whitePetalMat);
      petal.position.set(Math.cos(angle) * 0.22, 0.88, Math.sin(angle) * 0.22);
      petal.rotation.set(Math.sin(angle) * 0.85, 0, -Math.cos(angle) * 0.85);
      nodeGroup.add(petal);
    }

    const glow = new THREE.PointLight(0x38bdf8, 2.0, 6);
    glow.position.set(0, 0.9, 0);
    nodeGroup.add(glow);

    nodeGroup.position.set(x, y, z);
    this.group.add(nodeGroup);

    const nodeData: HarvestableNode = {
      id: `flower_${Math.random()}`,
      type: 'flower_silent_princess',
      position: { x, y, z },
      health: 15,
      maxHealth: 15,
      yieldItem: 'Prinzessinnen-Enzian',
      yieldQuantity: 1,
    };
    this.nodes.push({ data: nodeData, mesh: nodeGroup });
    return nodeGroup;
  }

  public createShroomCluster(x: number, y: number, z: number): THREE.Group {
    const nodeGroup = new THREE.Group();
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.8 });
    const redCapMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.5 });
    const greenCapMat = new THREE.MeshStandardMaterial({ color: 0x10b981, roughness: 0.5 });

    const shroomCoords = [
      { x: 0, z: 0, r: 0.28, h: 0.5, mat: redCapMat },
      { x: 0.35, z: 0.2, r: 0.22, h: 0.4, mat: greenCapMat },
      { x: -0.28, z: 0.3, r: 0.18, h: 0.35, mat: redCapMat },
    ];

    shroomCoords.forEach((sc) => {
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, sc.h, 6), stemMat);
      stem.position.set(sc.x, sc.h * 0.5, sc.z);
      nodeGroup.add(stem);

      const cap = new THREE.Mesh(new THREE.SphereGeometry(sc.r, 8, 8), sc.mat);
      cap.position.set(sc.x, sc.h + 0.05, sc.z);
      cap.scale.set(1.2, 0.7, 1.2);
      cap.castShadow = true;
      nodeGroup.add(cap);
    });

    nodeGroup.position.set(x, y, z);
    this.group.add(nodeGroup);

    const nodeData: HarvestableNode = {
      id: `shroom_${Math.random()}`,
      type: 'shroom_cluster',
      position: { x, y, z },
      health: 15,
      maxHealth: 15,
      yieldItem: 'Hylia-Pilz',
      yieldQuantity: 2,
    };
    this.nodes.push({ data: nodeData, mesh: nodeGroup });
    return nodeGroup;
  }

  public createBerryBush(x: number, y: number, z: number): THREE.Group {
    const nodeGroup = new THREE.Group();
    const bushMat = new THREE.MeshStandardMaterial({ color: 0x166534, roughness: 0.8 });
    const berryMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 });

    const bush = new THREE.Mesh(new THREE.DodecahedronGeometry(0.9, 1), bushMat);
    bush.position.y = 0.55;
    bush.scale.set(1.2, 0.8, 1.2);
    bush.castShadow = true;
    nodeGroup.add(bush);

    for (let b = 0; b < 8; b++) {
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.09, 6, 6), berryMat);
      berry.position.set(
        (Math.random() - 0.5) * 1.1,
        0.4 + Math.random() * 0.5,
        (Math.random() - 0.5) * 1.1
      );
      nodeGroup.add(berry);
    }

    nodeGroup.position.set(x, y, z);
    this.group.add(nodeGroup);

    const nodeData: HarvestableNode = {
      id: `berry_${Math.random()}`,
      type: 'berry_bush',
      position: { x, y, z },
      health: 20,
      maxHealth: 20,
      yieldItem: 'Waldbeeren',
      yieldQuantity: 3,
    };
    this.nodes.push({ data: nodeData, mesh: nodeGroup });
    return nodeGroup;
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

  /**
   * Synchronize all harvestable resource nodes (trees, rocks, ores, crops) directly to terrain surface
   */
  public syncAllNodesToTerrain() {
    for (const n of this.nodes) {
      const ny = TerrainManager.getTerrainHeight(n.data.position.x, n.data.position.z);
      n.data.position.y = ny;
      n.mesh.position.y = ny;

      const obs = this.obstacles.find(
        (o) => o.id === n.data.id || (Math.abs(o.x - n.data.position.x) < 0.1 && Math.abs(o.z - n.data.position.z) < 0.1)
      );
      if (obs) {
        obs.yBase = ny;
      }
    }
  }

  /**
   * Synchronize nodes within radius (e.g. terraforming brush or shovel dig)
   */
  public syncNodesInRadius(x: number, z: number, radius: number) {
    const radSq = radius * radius;
    for (const n of this.nodes) {
      const dx = n.data.position.x - x;
      const dz = n.data.position.z - z;
      if (dx * dx + dz * dz < radSq) {
        const ny = TerrainManager.getTerrainHeight(n.data.position.x, n.data.position.z);
        n.data.position.y = ny;
        n.mesh.position.y = ny;

        const obs = this.obstacles.find(
          (o) => o.id === n.data.id || (Math.abs(o.x - n.data.position.x) < 0.1 && Math.abs(o.z - n.data.position.z) < 0.1)
        );
        if (obs) {
          obs.yBase = ny;
        }
      }
    }
  }
}
