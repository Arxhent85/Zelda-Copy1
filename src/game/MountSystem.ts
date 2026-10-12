import * as THREE from 'three';
import { MountData, MountType, ObstacleCollider, Vector3D } from '../types';
import { TerrainManager } from './Terrain';
import { audioEngine } from './AudioEngine';

export class MountSystem {
  public group: THREE.Group = new THREE.Group();
  public mounts: {
    data: MountData;
    mesh: THREE.Group;
    frontLeftLeg?: THREE.Group;
    frontRightLeg?: THREE.Group;
    backLeftLeg?: THREE.Group;
    backRightLeg?: THREE.Group;
    neckHead?: THREE.Group;
    tail?: THREE.Group;
    turbines?: THREE.Mesh[];
  }[] = [];

  public activeMountedIndex: number = -1;
  public obstacles: ObstacleCollider[] = [];

  // Particle dust trail
  private dustGeo: THREE.BufferGeometry;
  private dustMat: THREE.PointsMaterial;
  private dustPoints: THREE.Points;
  private dustParticles: { pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number }[] = [];

  constructor(private scene: THREE.Scene) {
    this.group.name = 'MountsGroup';
    this.scene.add(this.group);

    // Dust particles when galloping/drifting
    const maxDust = 200;
    this.dustGeo = new THREE.BufferGeometry();
    const pos = new Float32Array(maxDust * 3);
    this.dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dustMat = new THREE.PointsMaterial({
      color: 0xd4b886,
      size: 0.45,
      transparent: true,
      opacity: 0.6,
    });
    this.dustPoints = new THREE.Points(this.dustGeo, this.dustMat);
    this.scene.add(this.dustPoints);

    this.spawnInitialMounts();
  }

  /**
   * Spawns royal steeds and Zonai gliders in open plains & near outposts
   */
  private spawnInitialMounts() {
    // 1. Royal White Steed near Starter Basin (x: 18, z: 12)
    this.createHorse('mount_horse_1', 'Hylia-Schimmel', 18, 12, 0xf8fafc, 0xe2e8f0, 0x0284c7);

    // 2. Midnight Chestnut Steed in East Meadows (x: 95, z: 45)
    this.createHorse('mount_horse_2', 'Epona-Kastanienhengst', 95, 45, 0x6d3b14, 0x221307, 0x991b1b);

    // 3. Ancient Zonai Glider at Ancient Ruins (x: -145, z: -70)
    this.createZonaiGlider('mount_zonai_1', 'Zonai-Himmelsgleiter', -145, -70);

    // 4. Wild Dun Steed in West Pastures (x: -85, z: 75)
    this.createHorse('mount_horse_3', 'Windtänzer', -85, 75, 0xa16207, 0x451a03, 0x059669);
  }

  /**
   * Builds an authentic, articulated 3D Horse (Torso, 4 Jointed Legs, Neck/Head, Mane, Tail, Saddle, Stirrups)
   */
  public createHorse(
    id: string,
    name: string,
    x: number,
    z: number,
    coatColor: number = 0x6d3b14,
    maneColor: number = 0x221307,
    saddleBlanketColor: number = 0x0284c7
  ) {
    const y = TerrainManager.getTerrainHeight(x, z);
    const horseGroup = new THREE.Group();

    const coatMat = new THREE.MeshStandardMaterial({ color: coatColor, roughness: 0.65 });
    const darkCoatMat = new THREE.MeshStandardMaterial({ color: 0x1f1610, roughness: 0.8 });
    const maneMat = new THREE.MeshStandardMaterial({ color: maneColor, roughness: 0.85 });
    const hoofMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4, metalness: 0.2 });
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.7 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.85, roughness: 0.2 });
    const blanketMat = new THREE.MeshStandardMaterial({ color: saddleBlanketColor, roughness: 0.6 });

    // 1. Horse Torso / Barrel
    const barrelGeo = new THREE.CylinderGeometry(0.55, 0.62, 2.3, 12);
    barrelGeo.rotateZ(Math.PI / 2);
    const barrel = new THREE.Mesh(barrelGeo, coatMat);
    barrel.position.y = 1.65;
    barrel.castShadow = true;
    barrel.receiveShadow = true;
    horseGroup.add(barrel);

    // Chest & Flank contours
    const chestGeo = new THREE.SphereGeometry(0.62, 10, 10);
    const chest = new THREE.Mesh(chestGeo, coatMat);
    chest.position.set(0.95, 1.68, 0);
    chest.scale.set(1.1, 1.0, 0.92);
    chest.castShadow = true;
    horseGroup.add(chest);

    const rumpGeo = new THREE.SphereGeometry(0.66, 10, 10);
    const rump = new THREE.Mesh(rumpGeo, coatMat);
    rump.position.set(-0.95, 1.7, 0);
    rump.scale.set(1.1, 1.02, 0.94);
    rump.castShadow = true;
    horseGroup.add(rump);

    // 2. Neck and Head Assembly
    const neckHeadGroup = new THREE.Group();
    neckHeadGroup.position.set(0.95, 1.85, 0);

    const neckGeo = new THREE.CylinderGeometry(0.32, 0.48, 1.35, 8);
    neckGeo.rotateZ(-Math.PI / 3.4);
    const neck = new THREE.Mesh(neckGeo, coatMat);
    neck.position.set(0.42, 0.52, 0);
    neck.castShadow = true;
    neckHeadGroup.add(neck);

    // Mane along neck crest
    const mane = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.12), maneMat);
    mane.position.set(0.38, 0.78, 0);
    mane.rotation.z = -Math.PI / 3.4;
    neckHeadGroup.add(mane);

    // Sculpted Head & Muzzle
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.38, 0.4), coatMat);
    head.position.set(0.88, 1.05, 0);
    head.rotation.z = -0.32;
    head.castShadow = true;
    neckHeadGroup.add(head);

    const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.32), darkCoatMat);
    muzzle.position.set(1.22, 0.94, 0);
    muzzle.rotation.z = -0.32;
    neckHeadGroup.add(muzzle);

    // Alert Horse Ears
    const earGeo = new THREE.ConeGeometry(0.08, 0.28, 4);
    const earL = new THREE.Mesh(earGeo, coatMat);
    earL.position.set(0.72, 1.35, 0.15);
    earL.rotation.set(-0.15, 0, -0.35);
    neckHeadGroup.add(earL);

    const earR = new THREE.Mesh(earGeo, coatMat);
    earR.position.set(0.72, 1.35, -0.15);
    earR.rotation.set(0.15, 0, -0.35);
    neckHeadGroup.add(earR);

    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x09090b });
    const eyeL = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
    eyeL.position.set(0.85, 1.15, 0.21);
    neckHeadGroup.add(eyeL);

    const eyeR = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 6), eyeMat);
    eyeR.position.set(0.85, 1.15, -0.21);
    neckHeadGroup.add(eyeR);

    // Leather Bridle & Golden Bit
    const bridle = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 6, 12), leatherMat);
    bridle.position.set(1.15, 0.98, 0);
    bridle.rotation.y = Math.PI / 2;
    neckHeadGroup.add(bridle);

    horseGroup.add(neckHeadGroup);

    // 3. Saddle & Royal Saddle Blanket
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.08, 1.25), blanketMat);
    blanket.position.set(0.05, 2.05, 0);
    horseGroup.add(blanket);

    const saddle = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.22, 0.72), leatherMat);
    saddle.position.set(0.05, 2.15, 0);
    saddle.castShadow = true;
    horseGroup.add(saddle);

    // Saddle Pommel & Cantle (front/back seat lips)
    const pommel = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.35, 6), leatherMat);
    pommel.position.set(0.45, 2.3, 0);
    pommel.rotation.z = Math.PI / 8;
    horseGroup.add(pommel);

    const cantle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.35, 6), leatherMat);
    cantle.position.set(-0.35, 2.3, 0);
    cantle.rotation.z = -Math.PI / 8;
    horseGroup.add(cantle);

    // Stirrups & Leather Straps hanging down
    for (const zSide of [-0.48, 0.48]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.75, 0.02), leatherMat);
      strap.position.set(0.05, 1.6, zSide);
      horseGroup.add(strap);

      const stirrup = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.02, 6, 8, Math.PI), goldMat);
      stirrup.position.set(0.05, 1.22, zSide);
      stirrup.rotation.x = Math.PI;
      horseGroup.add(stirrup);
    }

    // 4. Flowing Tail Assembly
    const tailGroup = new THREE.Group();
    tailGroup.position.set(-1.15, 1.85, 0);

    const tailGeo = new THREE.ConeGeometry(0.16, 1.45, 8);
    tailGeo.rotateX(Math.PI);
    const tailMesh = new THREE.Mesh(tailGeo, maneMat);
    tailMesh.position.set(-0.25, -0.65, 0);
    tailMesh.rotation.z = -0.35;
    tailMesh.castShadow = true;
    tailGroup.add(tailMesh);

    horseGroup.add(tailGroup);

    // 5. Four Articulated Legs (Upper Leg -> Knee -> Shin -> Hoof)
    const legWidth = 0.14;
    const legMat = coatMat;

    const buildLeg = (posX: number, posZ: number): THREE.Group => {
      const legGroup = new THREE.Group();
      legGroup.position.set(posX, 1.45, posZ);

      // Thigh / Upper Shoulder
      const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.12, 0.75, 8), legMat);
      upper.position.y = -0.32;
      upper.castShadow = true;
      legGroup.add(upper);

      // Knee / Hock Joint
      const knee = new THREE.Mesh(new THREE.SphereGeometry(0.11, 6, 6), legMat);
      knee.position.y = -0.7;
      legGroup.add(knee);

      // Cannon Bone / Lower Leg
      const lower = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.09, 0.7, 8), legMat);
      lower.position.y = -1.05;
      lower.castShadow = true;
      legGroup.add(lower);

      // Solid Iron/Horn Hoof
      const hoof = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 0.18, 8), hoofMat);
      hoof.position.y = -1.42;
      hoof.castShadow = true;
      legGroup.add(hoof);

      horseGroup.add(legGroup);
      return legGroup;
    };

    const frontLeftLeg = buildLeg(0.85, 0.38);
    const frontRightLeg = buildLeg(0.85, -0.38);
    const backLeftLeg = buildLeg(-0.85, 0.38);
    const backRightLeg = buildLeg(-0.85, -0.38);

    // Initial world orientation
    horseGroup.position.set(x, y, z);
    // Face forward along +Z or +X
    horseGroup.rotation.y = Math.PI / 2;
    this.group.add(horseGroup);

    const mountData: MountData = {
      id,
      type: 'horse',
      name,
      position: { x, y, z },
      rotation: Math.PI / 2,
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      maxSpeed: 24.0, // 24 m/s Gallop!
      isMounted: false,
      stamina: 100,
      maxStamina: 100,
    };

    this.mounts.push({
      data: mountData,
      mesh: horseGroup,
      frontLeftLeg,
      frontRightLeg,
      backLeftLeg,
      backRightLeg,
      neckHead: neckHeadGroup,
      tail: tailGroup,
    });

    this.obstacles.push({
      id,
      type: 'mount',
      x,
      z,
      yBase: y,
      height: 2.3,
      radius: 1.2,
    });
  }

  /**
   * Builds a futuristic ancient Zonai Hovercraft with green energy turbines
   */
  public createZonaiGlider(id: string, name: string, x: number, z: number) {
    const y = TerrainManager.getTerrainHeight(x, z);
    const gliderGroup = new THREE.Group();

    const zonaiStoneMat = new THREE.MeshStandardMaterial({ color: 0x1f342b, roughness: 0.7, metalness: 0.3 });
    const zonaiGoldMat = new THREE.MeshStandardMaterial({ color: 0xd4af37, metalness: 0.85, roughness: 0.25 });
    const zonaiGlowMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 2.2,
      transparent: true,
      opacity: 0.9,
    });

    // 1. Aerodynamic Main Hull / Platform
    const hull = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.25, 3.2), zonaiStoneMat);
    hull.position.y = 0.45;
    hull.castShadow = true;
    hull.receiveShadow = true;
    gliderGroup.add(hull);

    // Glowing Zonai Inscriptions on Platform
    const runeInlay = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.6), zonaiGlowMat);
    runeInlay.rotation.x = -Math.PI / 2;
    runeInlay.position.y = 0.59;
    gliderGroup.add(runeInlay);

    // 2. Swept-Forward Zonai Wings
    const wingGeo = new THREE.BoxGeometry(1.6, 0.12, 1.2);
    const leftWing = new THREE.Mesh(wingGeo, zonaiStoneMat);
    leftWing.position.set(-1.8, 0.48, 0.2);
    leftWing.rotation.y = 0.2;
    gliderGroup.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, zonaiStoneMat);
    rightWing.position.set(1.8, 0.48, 0.2);
    rightWing.rotation.y = -0.2;
    gliderGroup.add(rightWing);

    // 3. Dual Rear Thrust Turbines
    const turbines: THREE.Mesh[] = [];
    for (const tX of [-0.85, 0.85]) {
      const fanHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.48, 0.6, 12), zonaiGoldMat);
      fanHousing.rotation.x = Math.PI / 2;
      fanHousing.position.set(tX, 0.65, -1.6);
      gliderGroup.add(fanHousing);

      const fanBlades = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.08), zonaiGlowMat);
      fanBlades.position.set(tX, 0.65, -1.6);
      gliderGroup.add(fanBlades);
      turbines.push(fanBlades);

      const jetLight = new THREE.PointLight(0x10b981, 2.5, 6);
      jetLight.position.set(tX, 0.65, -1.9);
      gliderGroup.add(jetLight);
    }

    // 4. Steering Column & Yoke
    const yokeCol = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 0.9, 8), zonaiGoldMat);
    yokeCol.position.set(0, 0.9, 0.85);
    yokeCol.rotation.x = -0.2;
    gliderGroup.add(yokeCol);

    const yokeBar = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.08, 0.12), zonaiGoldMat);
    yokeBar.position.set(0, 1.35, 0.75);
    gliderGroup.add(yokeBar);

    gliderGroup.position.set(x, y, z);
    this.group.add(gliderGroup);

    const mountData: MountData = {
      id,
      type: 'zonai_glider',
      name,
      position: { x, y, z },
      rotation: 0,
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      maxSpeed: 28.0, // High-speed hovercraft
      isMounted: false,
      stamina: 100,
      maxStamina: 100,
    };

    this.mounts.push({
      data: mountData,
      mesh: gliderGroup,
      turbines,
    });

    this.obstacles.push({
      id,
      type: 'mount',
      x,
      z,
      yBase: y,
      height: 1.5,
      radius: 1.6,
    });
  }

  /**
   * Find nearby mount to interact with
   */
  public getNearbyMount(playerPos: THREE.Vector3, maxDist: number = 3.6): { mount: MountData; index: number } | null {
    for (let i = 0; i < this.mounts.length; i++) {
      const m = this.mounts[i].data;
      const dist = Math.hypot(m.position.x - playerPos.x, m.position.z - playerPos.z);
      if (dist < maxDist) {
        return { mount: m, index: i };
      }
    }
    return null;
  }

  /**
   * Toggle mount / dismount player
   */
  public toggleMount(playerPos: THREE.Vector3): { success: boolean; mounted: boolean; message: string } {
    if (this.activeMountedIndex >= 0) {
      // Dismount!
      const active = this.mounts[this.activeMountedIndex];
      active.data.isMounted = false;
      this.activeMountedIndex = -1;
      audioEngine.playHitImpact();
      return { success: true, mounted: false, message: `${active.data.name} abgesessen.` };
    }

    const nearby = this.getNearbyMount(playerPos);
    if (!nearby) {
      return { success: false, mounted: false, message: 'Kein Reittier in der Nähe!' };
    }

    this.activeMountedIndex = nearby.index;
    const active = this.mounts[nearby.index];
    active.data.isMounted = true;
    audioEngine.playShrineFanfare();
    return { success: true, mounted: true, message: `Auf ${active.data.name} aufgesessen! [WASD] Reiten, [E] Absteigen.` };
  }

  /**
   * Update mount simulation, leg IK gallop gait cycles, and particle dust
   */
  public update(
    delta: THREE.Vector3 | number,
    inputMoveDir?: { x: number; z: number },
    cameraYaw: number = 0,
    isSprint: boolean = false
  ) {
    const dt = typeof delta === 'number' ? delta : 0.016;
    const t = performance.now() * 0.001;

    for (let i = 0; i < this.mounts.length; i++) {
      const m = this.mounts[i];
      const data = m.data;
      const isPlayerRiding = i === this.activeMountedIndex;

      if (isPlayerRiding && inputMoveDir) {
        // Player Riding controls
        const moveMag = Math.hypot(inputMoveDir.x, inputMoveDir.z);

        if (moveMag > 0.05) {
          const inputAngle = Math.atan2(inputMoveDir.x, -inputMoveDir.z);
          const targetAngle = cameraYaw + inputAngle;

          // Smooth turning towards camera movement direction
          const angleDiff = Math.atan2(Math.sin(targetAngle - data.rotation), Math.cos(targetAngle - data.rotation));
          data.rotation += angleDiff * Math.min(1.0, dt * 7.5);

          // Target acceleration
          const topSpeed = isSprint ? data.maxSpeed : data.maxSpeed * 0.6;
          data.speed = THREE.MathUtils.lerp(data.speed, topSpeed, dt * 4.5);

          // Spawn dust particles during fast gallop
          if (data.speed > 12.0 && Math.random() < 0.45) {
            this.spawnDust(data.position.x, data.position.y, data.position.z);
          }
        } else {
          // Decelerate smoothly
          data.speed = THREE.MathUtils.lerp(data.speed, 0, dt * 6.0);
        }

        // Apply forward velocity
        const forwardX = Math.sin(data.rotation) * data.speed;
        const forwardZ = Math.cos(data.rotation) * data.speed;

        data.position.x += forwardX * dt;
        data.position.z += forwardZ * dt;

        // Ground adhesion
        const groundY = TerrainManager.getTerrainHeight(data.position.x, data.position.z);
        data.position.y = groundY;

        m.mesh.position.set(data.position.x, data.position.y, data.position.z);
        m.mesh.rotation.y = data.rotation;
      } else {
        // Idle mount ground adhesion
        const groundY = TerrainManager.getTerrainHeight(data.position.x, data.position.z);
        data.position.y = groundY;
        m.mesh.position.y = groundY;
      }

      // 1. HORSE Gallop Animation Gait Cycle
      if (data.type === 'horse') {
        const gaitSpeed = data.speed > 0.5 ? (data.speed * 1.2) : 1.2;
        const gallopCycle = t * gaitSpeed;
        const gallopAmp = Math.min(1.0, data.speed / 10.0);

        if (m.frontLeftLeg && m.frontRightLeg && m.backLeftLeg && m.backRightLeg) {
          // Diagonal 4-beat gallop leg swinging
          m.frontLeftLeg.rotation.z = Math.sin(gallopCycle) * 0.65 * gallopAmp;
          m.frontRightLeg.rotation.z = Math.sin(gallopCycle + Math.PI * 0.8) * 0.65 * gallopAmp;
          m.backLeftLeg.rotation.z = Math.sin(gallopCycle + Math.PI * 0.4) * 0.65 * gallopAmp;
          m.backRightLeg.rotation.z = Math.sin(gallopCycle + Math.PI * 1.2) * 0.65 * gallopAmp;
        }

        // Head & Tail Natural Bobbing
        if (m.neckHead) {
          m.neckHead.rotation.z = Math.sin(gallopCycle * 2) * 0.08 * gallopAmp;
        }
        if (m.tail) {
          m.tail.rotation.y = Math.sin(gallopCycle) * 0.25;
          m.tail.rotation.z = Math.abs(Math.sin(gallopCycle * 0.5)) * 0.2 * gallopAmp;
        }
      }

      // 2. ZONAI GLIDER Turbine Rotation & Hover Bob
      if (data.type === 'zonai_glider' && m.turbines) {
        const spinSpeed = (data.speed > 0.5 ? 25.0 : 6.0) * dt;
        m.turbines.forEach((tMesh) => {
          tMesh.rotation.z += spinSpeed;
        });

        // Hover bobbing
        m.mesh.position.y = data.position.y + 0.15 + Math.sin(t * 3.5) * 0.06;
      }
    }

    // Update Dust Particles
    this.updateDust(dt);
  }

  private spawnDust(x: number, y: number, z: number) {
    if (this.dustParticles.length >= 200) return;
    this.dustParticles.push({
      pos: new THREE.Vector3(x + (Math.random() - 0.5) * 0.8, y + 0.2, z + (Math.random() - 0.5) * 0.8),
      vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 1.5),
      life: 0,
      maxLife: 0.6 + Math.random() * 0.4,
    });
  }

  private updateDust(dt: number) {
    const posArr = this.dustGeo.attributes.position.array as Float32Array;

    for (let i = this.dustParticles.length - 1; i >= 0; i--) {
      const p = this.dustParticles[i];
      p.life += dt;
      p.pos.addScaledVector(p.vel, dt);
      p.vel.y -= dt * 1.8; // gravity

      if (p.life >= p.maxLife) {
        this.dustParticles.splice(i, 1);
      }
    }

    for (let i = 0; i < 200; i++) {
      if (i < this.dustParticles.length) {
        posArr[i * 3] = this.dustParticles[i].pos.x;
        posArr[i * 3 + 1] = this.dustParticles[i].pos.y;
        posArr[i * 3 + 2] = this.dustParticles[i].pos.z;
      } else {
        posArr[i * 3] = 0;
        posArr[i * 3 + 1] = -999;
        posArr[i * 3 + 2] = 0;
      }
    }

    this.dustGeo.attributes.position.needsUpdate = true;
  }

  /**
   * Synchronize all mounts directly to terrain surface
   */
  public syncAllMountsToTerrain() {
    for (const m of this.mounts) {
      const ny = TerrainManager.getTerrainHeight(m.data.position.x, m.data.position.z);
      m.data.position.y = ny;
      m.mesh.position.y = ny;
    }
  }
}
