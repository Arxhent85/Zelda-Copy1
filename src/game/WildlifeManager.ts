import * as THREE from 'three';
import { TerrainManager } from './Terrain';
import { audioEngine } from './AudioEngine';

interface StagEntity {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  targetPos: THREE.Vector3;
  speed: number;
  rotation: number;
  state: 'GRAZE' | 'ALERT' | 'FLEE';
  legs: THREE.Group[];
  antlers: THREE.Group;
  grazeTimer: number;
}

interface BlupeeEntity {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  rotation: number;
  hopCycle: number;
  health: number;
  light: THREE.PointLight;
}

interface BirdEntity {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  flying: boolean;
  wings: THREE.Mesh[];
}

export class WildlifeManager {
  public group: THREE.Group = new THREE.Group();
  public stags: StagEntity[] = [];
  public blupees: BlupeeEntity[] = [];
  public birds: BirdEntity[] = [];

  public onRupeeDropped?: (amount: number, pos: { x: number; y: number; z: number }) => void;

  constructor(private scene: THREE.Scene) {
    this.group.name = 'WildlifeGroup';
    this.scene.add(this.group);

    this.spawnWildlife();
  }

  private spawnWildlife() {
    // 1. Forest Stags grazing in meadows
    const stagSpawns = [
      { x: 35, z: 28 },
      { x: -55, z: 40 },
      { x: 75, z: -60 },
      { x: -110, z: -35 },
    ];
    stagSpawns.forEach((s) => this.createStag(s.x, s.z));

    // 2. Magical Blupee Rabbits in quiet glades
    const blupeeSpawns = [
      { x: -25, z: 18 },
      { x: 45, z: -35 },
      { x: -75, z: -85 },
    ];
    blupeeSpawns.forEach((b) => this.createBlupee(b.x, b.z));

    // 3. Flocks of forest birds
    const birdSpawns = [
      { x: 12, z: 15 },
      { x: -18, z: 22 },
      { x: 28, z: -10 },
      { x: -35, z: -25 },
      { x: 60, z: 30 },
    ];
    birdSpawns.forEach((b) => this.createBird(b.x, b.z));
  }

  /**
   * Majestic Hylian Stag (Hirsch mit Geweih)
   */
  public createStag(x: number, z: number) {
    const y = TerrainManager.getTerrainHeight(x, z);
    const stagGroup = new THREE.Group();

    const coatMat = new THREE.MeshStandardMaterial({ color: 0x854d0e, roughness: 0.7 });
    const antlerMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.5 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.7 });

    // Torso
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.8, 1.6), coatMat);
    body.position.y = 1.35;
    body.castShadow = true;
    stagGroup.add(body);

    // White belly patch
    const belly = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.1, 1.2), whiteMat);
    belly.position.set(0, 0.95, 0);
    stagGroup.add(belly);

    // Neck & Head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.28, 0.9, 6), coatMat);
    neck.position.set(0, 1.75, 0.7);
    neck.rotation.x = 0.45;
    neck.castShadow = true;
    stagGroup.add(neck);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.28, 0.52), coatMat);
    head.position.set(0, 2.15, 0.95);
    head.rotation.x = 0.2;
    head.castShadow = true;
    stagGroup.add(head);

    // Branching Antlers
    const antlersGroup = new THREE.Group();
    antlersGroup.position.set(0, 2.3, 0.95);

    for (const side of [-1, 1]) {
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.8, 5), antlerMat);
      beam.position.set(side * 0.2, 0.35, 0);
      beam.rotation.z = side * -0.45;
      beam.rotation.x = -0.2;
      antlersGroup.add(beam);

      const tine1 = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.35, 5), antlerMat);
      tine1.position.set(side * 0.32, 0.45, 0.1);
      tine1.rotation.z = side * -0.8;
      antlersGroup.add(tine1);

      const tine2 = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.3, 5), antlerMat);
      tine2.position.set(side * 0.38, 0.65, -0.05);
      tine2.rotation.z = side * 0.3;
      antlersGroup.add(tine2);
    }
    stagGroup.add(antlersGroup);

    // 4 Articulated Legs
    const legs: THREE.Group[] = [];
    const legPositions = [
      { x: 0.25, z: 0.55 },
      { x: -0.25, z: 0.55 },
      { x: 0.25, z: -0.55 },
      { x: -0.25, z: -0.55 },
    ];

    legPositions.forEach((lp) => {
      const legG = new THREE.Group();
      legG.position.set(lp.x, 1.25, lp.z);

      const legMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 1.25, 6), coatMat);
      legMesh.position.y = -0.6;
      legMesh.castShadow = true;
      legG.add(legMesh);

      stagGroup.add(legG);
      legs.push(legG);
    });

    stagGroup.position.set(x, y, z);
    this.group.add(stagGroup);

    this.stags.push({
      mesh: stagGroup,
      pos: new THREE.Vector3(x, y, z),
      targetPos: new THREE.Vector3(x, y, z),
      speed: 0,
      rotation: Math.random() * Math.PI * 2,
      state: 'GRAZE',
      legs,
      antlers: antlersGroup,
      grazeTimer: 2.0 + Math.random() * 3.0,
    });
  }

  /**
   * Magical Blupee Bunny (Luminous Rabbit that drops rupees when touched/hit)
   */
  public createBlupee(x: number, z: number) {
    const y = TerrainManager.getTerrainHeight(x, z);
    const blupeeGroup = new THREE.Group();

    const glowMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 1.8,
      roughness: 0.3,
    });

    // Body
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.35, 10, 8), glowMat);
    body.position.y = 0.38;
    body.scale.set(0.85, 1.0, 1.2);
    body.castShadow = true;
    blupeeGroup.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 8, 8), glowMat);
    head.position.set(0, 0.55, 0.32);
    blupeeGroup.add(head);

    // Long glowing ears
    const earGeo = new THREE.ConeGeometry(0.08, 0.55, 6);
    const earL = new THREE.Mesh(earGeo, glowMat);
    earL.position.set(-0.12, 0.85, 0.25);
    earL.rotation.set(-0.25, 0, -0.2);
    blupeeGroup.add(earL);

    const earR = new THREE.Mesh(earGeo, glowMat);
    earR.position.set(0.12, 0.85, 0.25);
    earR.rotation.set(-0.25, 0, 0.2);
    blupeeGroup.add(earR);

    // Shimmering Light
    const pointLight = new THREE.PointLight(0x38bdf8, 2.0, 8);
    pointLight.position.set(0, 0.6, 0);
    blupeeGroup.add(pointLight);

    blupeeGroup.position.set(x, y, z);
    this.group.add(blupeeGroup);

    this.blupees.push({
      mesh: blupeeGroup,
      pos: new THREE.Vector3(x, y, z),
      rotation: Math.random() * Math.PI * 2,
      hopCycle: Math.random() * 10,
      health: 1,
      light: pointLight,
    });
  }

  /**
   * Forest Birds / Pigeons
   */
  public createBird(x: number, z: number) {
    const y = TerrainManager.getTerrainHeight(x, z);
    const birdGroup = new THREE.Group();

    const birdMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.8 });
    const wingMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.8 });

    const body = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 6), birdMat);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.15;
    birdGroup.add(body);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), birdMat);
    head.position.set(0, 0.22, 0.18);
    birdGroup.add(head);

    // Wings
    const wingGeo = new THREE.BoxGeometry(0.28, 0.02, 0.18);
    const wingL = new THREE.Mesh(wingGeo, wingMat);
    wingL.position.set(-0.18, 0.18, 0);
    birdGroup.add(wingL);

    const wingR = new THREE.Mesh(wingGeo, wingMat);
    wingR.position.set(0.18, 0.18, 0);
    birdGroup.add(wingR);

    birdGroup.position.set(x, y, z);
    this.group.add(birdGroup);

    this.birds.push({
      mesh: birdGroup,
      pos: new THREE.Vector3(x, y, z),
      vel: new THREE.Vector3(0, 0, 0),
      flying: false,
      wings: [wingL, wingR],
    });
  }

  /**
   * Check if player hits Blupee rabbit -> drops sparkling Rupees!
   */
  public checkHitBlupee(attackPos: THREE.Vector3, attackRadius: number = 2.5): number {
    for (let i = this.blupees.length - 1; i >= 0; i--) {
      const b = this.blupees[i];
      const dist = attackPos.distanceTo(b.pos);
      if (dist < attackRadius) {
        const rewardRupees = 25;
        audioEngine.playRupeeCollect();

        if (this.onRupeeDropped) {
          this.onRupeeDropped(rewardRupees, { x: b.pos.x, y: b.pos.y, z: b.pos.z });
        }

        // Flee / teleport with puff
        b.pos.x += (Math.random() - 0.5) * 60;
        b.pos.z += (Math.random() - 0.5) * 60;
        b.pos.y = TerrainManager.getTerrainHeight(b.pos.x, b.pos.z);
        b.mesh.position.copy(b.pos);

        return rewardRupees;
      }
    }
    return 0;
  }

  /**
   * Update wildlife animation & AI behaviors
   */
  public update(delta: number, playerPos: THREE.Vector3) {
    const t = performance.now() * 0.001;

    // 1. STAGS BEHAVIOR
    for (const stag of this.stags) {
      const distToPlayer = stag.pos.distanceTo(playerPos);

      if (distToPlayer < 14.0) {
        // Startled by player! Flee in opposite direction
        stag.state = 'FLEE';
        const fleeDir = new THREE.Vector3().subVectors(stag.pos, playerPos).normalize();
        stag.targetPos.copy(stag.pos).addScaledVector(fleeDir, 35.0);
        stag.rotation = Math.atan2(fleeDir.x, fleeDir.z);
        stag.speed = 18.0; // Swift graceful leaping gallop
      } else if (distToPlayer > 30.0 && stag.state === 'FLEE') {
        stag.state = 'GRAZE';
        stag.speed = 0;
      }

      if (stag.state === 'FLEE') {
        const moveStep = stag.speed * delta;
        stag.pos.x += Math.sin(stag.rotation) * moveStep;
        stag.pos.z += Math.cos(stag.rotation) * moveStep;
        stag.pos.y = TerrainManager.getTerrainHeight(stag.pos.x, stag.pos.z);

        // Leg running animation
        const runCycle = t * 14.0;
        stag.legs.forEach((leg, idx) => {
          leg.rotation.x = Math.sin(runCycle + idx * Math.PI * 0.5) * 0.65;
        });
      } else {
        // Grazing peacefully
        stag.grazeTimer -= delta;
        if (stag.grazeTimer <= 0) {
          stag.grazeTimer = 3.0 + Math.random() * 4.0;
          stag.antlers.rotation.x = (Math.random() - 0.5) * 0.35;
        }
        stag.pos.y = TerrainManager.getTerrainHeight(stag.pos.x, stag.pos.z);
        stag.legs.forEach((leg) => (leg.rotation.x = 0));
      }

      stag.mesh.position.copy(stag.pos);
      stag.mesh.rotation.y = stag.rotation;
    }

    // 2. BLUPEE RABBITS HOPPING
    for (const blupee of this.blupees) {
      blupee.pos.y = TerrainManager.getTerrainHeight(blupee.pos.x, blupee.pos.z);
      blupee.hopCycle += delta * 4.5;
      const hop = Math.abs(Math.sin(blupee.hopCycle)) * 0.45;
      blupee.mesh.position.y = blupee.pos.y + hop;

      // Pulsing starlight glow
      blupee.light.intensity = 1.5 + Math.sin(t * 5.0) * 0.8;
    }

    // 3. FOREST BIRDS FLOCKING
    for (const bird of this.birds) {
      const dist = bird.pos.distanceTo(playerPos);
      if (dist < 8.0 && !bird.flying) {
        bird.flying = true;
        bird.vel.set((Math.random() - 0.5) * 12, 10.0 + Math.random() * 6, (Math.random() - 0.5) * 12);
      }

      if (bird.flying) {
        bird.pos.addScaledVector(bird.vel, delta);
        bird.vel.y += delta * 1.5; // Rise into the sky
        bird.mesh.position.copy(bird.pos);

        // Wing flapping
        const flap = Math.sin(t * 28.0) * 0.7;
        bird.wings[0].rotation.z = flap;
        bird.wings[1].rotation.z = -flap;

        // Reset if flown far away
        if (bird.pos.y > 60.0) {
          bird.flying = false;
          bird.pos.x = playerPos.x + (Math.random() - 0.5) * 90;
          bird.pos.z = playerPos.z + (Math.random() - 0.5) * 90;
          bird.pos.y = TerrainManager.getTerrainHeight(bird.pos.x, bird.pos.z);
          bird.mesh.position.copy(bird.pos);
        }
      }
    }
  }

  /**
   * Synchronize all wildlife animals directly to terrain surface
   */
  public syncAllWildlifeToTerrain() {
    for (const stag of this.stags) {
      stag.pos.y = TerrainManager.getTerrainHeight(stag.pos.x, stag.pos.z);
      stag.mesh.position.copy(stag.pos);
    }
    for (const blupee of this.blupees) {
      blupee.pos.y = TerrainManager.getTerrainHeight(blupee.pos.x, blupee.pos.z);
      blupee.mesh.position.copy(blupee.pos);
    }
    for (const bird of this.birds) {
      if (!bird.flying) {
        bird.pos.y = TerrainManager.getTerrainHeight(bird.pos.x, bird.pos.z);
        bird.mesh.position.copy(bird.pos);
      }
    }
  }
}
