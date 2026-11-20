import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { TerrainManager } from '../Terrain';
import { WaterManager } from '../WaterShader';
import { SkyAndLightingManager } from '../SkyAndLighting';
import { CollectibleManager } from '../Collectibles';
import { BuildingSystem } from '../BuildingSystem';
import { starFoxAudio } from './StarFoxAudio';

export interface StarFoxState {
  shield: number;
  maxShield: number;
  boostHeat: number;
  isOverheated: boolean;
  smartBombs: number;
  score: number;
  hits: number;
  speed: number;
  progressPercent: number;
  weaponLevel: 1 | 2 | 3;
  zoneName: string;
  bossHealth: number | null;
  isTargetLocked: boolean;
  dialogue: {
    speaker: string;
    text: string;
    visible: boolean;
  } | null;
  isMissionComplete: boolean;
  isGameOver: boolean;
  shieldActive: boolean;
  combo: number;
  lastKillText: string | null;
}

interface ColliderItem {
  position: THREE.Vector3;
  radius: number;
  halfHeight: number;
  type: 'tower' | 'arch_pillar' | 'carrier' | 'dreadnought' | 'building';
}

interface EnemyEntity {
  mesh: THREE.Group;
  type: 'drone' | 'corvette' | 'crystal' | 'mine' | 'guardian' | 'gate_core' | 'boss_core';
  health: number;
  maxHealth: number;
  points: number;
  basePos: THREE.Vector3;
  movePhase: number;
  moveAmpX: number;
  moveAmpY: number;
  fireCooldown: number;
  destroyed: boolean;
  hitRadius: number;
  bodyRadius: number;
  linkedBarrier?: THREE.Mesh;
  hitFlashTimer?: number;
}

interface Projectile {
  mesh: THREE.Object3D;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  isPlayer: boolean;
  damage: number;
  lifetime: number;
  isChargeShot?: boolean;
  homingTarget?: EnemyEntity | null;
}

interface RingItem {
  mesh: THREE.Group;
  position: THREE.Vector3;
  radius: number;
  type: 'boost_arch' | 'shield_ring' | 'speed_ring' | 'weapon_pod';
  collected: boolean;
}

interface ActiveExplosionFX {
  fireball: THREE.Mesh;
  shockwave: THREE.Mesh;
  age: number;
  maxAge: number;
  maxScale: number;
}

export class StarFoxEngine {
  public canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private isMobile = false;

  // World Scaling for Wide, Playable Hyrule Aerial Arena (1920m x 1920m)
  private readonly WORLD_SCALE_XZ = 2.4;
  private readonly WORLD_SCALE_Y = 1.8;
  private readonly WATER_Y = TerrainManager.WATER_LEVEL * 1.8; // 2.7m

  // Reused Zelda World Modules
  private terrainManager!: TerrainManager;
  private waterManager!: WaterManager;
  private skyLighting!: SkyAndLightingManager;
  private collectibleManager!: CollectibleManager;
  private buildingSystem!: BuildingSystem;
  private windmills: THREE.Object3D[] = [];

  // Extended Outer Ocean
  private outerOceanMaterial!: THREE.ShaderMaterial;

  // Rail & Spline Path (~7800m wide graceful circuit)
  private splineCurve!: THREE.CatmullRomCurve3;
  public currentDistance = 0;
  private totalDistance = 7800;
  private baseSpeed = 58.0; // Playable, smooth pace with plenty of time to aim & dodge!
  private currentSpeed = 58.0;

  // Player ship & Wingmen
  private shipGroup!: THREE.Group;
  private shipMesh!: THREE.Group;
  private leftFlap!: THREE.Mesh;
  private rightFlap!: THREE.Mesh;
  private thrusterFlames: THREE.Mesh[] = [];
  private thrusterCores: THREE.Mesh[] = [];
  private muzzleFlashes: THREE.Mesh[] = [];
  private muzzleFlashTimer = 0;
  private barrelRollRing!: THREE.Mesh;
  private sonicBoomRing!: THREE.Mesh;
  private sonicBoomAge = 99;
  private wasBoosting = false;
  private shieldBubble!: THREE.Mesh;
  private chargeSphere!: THREE.Mesh;
  private chargeRing!: THREE.Mesh;
  public shieldActiveTimer = 0;
  private collisionGraceTimer = 0;
  private wingmen: { group: THREE.Group; offset: THREE.Vector3; phase: number }[] = [];

  // Agile Flight Kinematics
  public inputPitch = 0;
  public inputYawRoll = 0;
  public isBoosting = false;
  public isBraking = false;
  public isFiring = false;
  public autoFire = false;
  private fireCooldown = 0;
  private chargeTime = 0;
  private readonly MAX_CHARGE_TIME = 1.05;

  private shipLocalPos = new THREE.Vector3(0, 24, 0);
  private shipVelX = 0;
  private shipVelY = 0;
  private smoothedYaw = 0;
  private smoothedPitch = 0;
  private smoothedRoll = 0;
  private smoothedCamRoll = 0;
  private currentSplineBank = 0;
  private prevTangent = new THREE.Vector3(0, 0, -1);

  // Barrel Roll
  public isBarrelRolling = false;
  private barrelRollTimer = 0;
  private barrelRollDirection: 'left' | 'right' = 'left';
  private barrelRollCooldown = 0;

  // Vitals & HUD State
  public state: StarFoxState = {
    shield: 100,
    maxShield: 100,
    boostHeat: 0,
    isOverheated: false,
    smartBombs: 3,
    score: 0,
    hits: 0,
    speed: 58,
    progressPercent: 0,
    weaponLevel: 1,
    zoneName: 'CORNERIA OUTER BAY',
    bossHealth: null,
    isTargetLocked: false,
    dialogue: null,
    isMissionComplete: false,
    isGameOver: false,
    shieldActive: false,
    combo: 1,
    lastKillText: null,
  };

  private comboTimer = 0;
  private killTextTimer = 0;
  private hitMarkerTimer = 0;

  public onStateUpdate?: (state: StarFoxState) => void;
  public onReticleUpdate?: (
    nearX: number,
    nearY: number,
    farX: number,
    farY: number,
    locked: boolean,
    hitConfirmed: boolean
  ) => void;

  // World Entities & Colliders
  private colliders: ColliderItem[] = [];
  private archesAndRings: RingItem[] = [];
  private enemies: EnemyEntity[] = [];
  private bossCores: EnemyEntity[] = [];
  private dreadnoughtGroup: THREE.Group | null = null;
  private projectiles: Projectile[] = [];
  private activeIntervals: number[] = [];

  // Pooled/Shared Geometries & Materials (Zero GC Lag on Mobile)
  private laserGeo!: THREE.CapsuleGeometry;
  private laserCoreGeo!: THREE.CapsuleGeometry;
  private laserCoreMat!: THREE.MeshBasicMaterial;
  private playerLaserMats: Record<number, THREE.MeshBasicMaterial> = {};
  private enemyLaserMat!: THREE.MeshBasicMaterial;
  private fireballGeo!: THREE.SphereGeometry;
  private shockwaveGeo!: THREE.TorusGeometry;
  private explosionFXList: ActiveExplosionFX[] = [];
  private particlePools: Array<{ points: THREE.Points; velocities: Float32Array; age: number }> = [];

  // Particles & FX
  private waterSprayParticles!: THREE.Points;
  private speedLinesMesh!: THREE.LineSegments;
  private wingtipTrailGeoLeft!: THREE.BufferGeometry;
  private wingtipTrailGeoRight!: THREE.BufferGeometry;
  private wingtipTrailMat!: THREE.LineBasicMaterial;
  private wingtipPointsLeft: THREE.Vector3[] = [];
  private wingtipPointsRight: THREE.Vector3[] = [];
  private readonly TRAIL_LENGTH = 26;

  // Loop & Timing
  private isRunning = false;
  private animationFrameId: number | null = null;
  private clock = new THREE.Clock();
  private totalTime = 0;
  private cameraShakeIntensity = 0;
  private lastNotifyTime = 0;

  // Scratch vectors to avoid per-frame allocations
  private readonly tmpVec1 = new THREE.Vector3();
  private readonly tmpVec2 = new THREE.Vector3();
  private readonly tmpVec3 = new THREE.Vector3();
  private readonly tmpRailPos = new THREE.Vector3();
  private readonly tmpRailFwd = new THREE.Vector3();
  private readonly tmpRailRight = new THREE.Vector3();
  private readonly tmpRailUp = new THREE.Vector3();
  private readonly tmpUpRef = new THREE.Vector3(0, 1, 0);
  private readonly tmpBasis = new THREE.Matrix4();
  private readonly tmpQuat = new THREE.Quaternion();

  private dialogueEvents = [
    {
      u: 0.01,
      speaker: 'COMMANDER VANCE',
      text: 'All wings! Entering Corneria Outer Bay — wide corridor ahead, clear the drone squadrons!',
      duration: 4.5,
      triggered: false,
    },
    {
      u: 0.16,
      speaker: 'FALCO',
      text: 'Crossing the Hyrule Coast! Watch out for towering spires and Sheikah ground turrets!',
      duration: 4.2,
      triggered: false,
    },
    {
      u: 0.36,
      speaker: 'SLIPPY',
      text: 'Shoot the red core crystals to open Laser Gates and collect green weapon upgrades!',
      duration: 4.2,
      triggered: false,
    },
    {
      u: 0.56,
      speaker: 'PEPPY',
      text: 'Ascending Dragon Crest Mountains! Double-tap or press ROLL to deflect plasma fire!',
      duration: 4.0,
      triggered: false,
    },
    {
      u: 0.76,
      speaker: 'COMMANDER VANCE',
      text: 'Dreadnought Flagship sighted over the Outer Bay! Destroy its 3 glowing Reactor Cores!',
      duration: 5.0,
      triggered: false,
    },
  ];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.isMobile =
      typeof window !== 'undefined' &&
      (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        ('ontouchstart' in window && window.innerWidth < 1024));

    this.initThree();
    this.initSharedAssets();
    this.createHyruleIntegratedWorld();
    this.createSpline();
    this.createSkyAndCelestial();
    this.createOuterOcean();
    this.createClouds();
    this.createPlayerShip();
    this.createWingmen();
    this.createWingtipTrails();
    this.createWorldEntitiesAndEncounterWave();
    this.createSpeedLines();
    this.createWaterSpray();
  }

  private getHyruleHeight(wx: number, wz: number): number {
    return (
      TerrainManager.getTerrainHeight(wx / this.WORLD_SCALE_XZ, wz / this.WORLD_SCALE_XZ) *
      this.WORLD_SCALE_Y
    );
  }

  // -------------------------------------------------------------
  // INITIALIZATION (ULTRA-FLUID 60FPS + HDR ENVIRONMENT REFLECTIONS)
  // -------------------------------------------------------------
  private initThree() {
    this.scene = new THREE.Scene();

    const width = Math.max(this.canvas.clientWidth || window.innerWidth, 100);
    const height = Math.max(this.canvas.clientHeight || window.innerHeight, 100);

    this.camera = new THREE.PerspectiveCamera(72.0, width / height, 0.8, 13000);
    this.camera.position.set(0, 30, 1280);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.isMobile,
      powerPreference: 'high-performance',
      precision: 'highp', // Essential: prevents mobile mediump float overflow on snow/terrain shaders!
    });
    this.renderer.setSize(width, height);

    const pixelRatio = this.isMobile
      ? Math.min(window.devicePixelRatio || 1, 1.4)
      : Math.min(window.devicePixelRatio || 1, 1.85);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    // Generate lightweight procedural Sky + Sun + Ocean Environment Map (0 runtime cost, huge visual upgrade for metallic ships/arches!)
    try {
      const pmrem = new THREE.PMREMGenerator(this.renderer);
      const envScene = new THREE.Scene();
      const envGeo = new THREE.SphereGeometry(50, 16, 12);
      const envMat = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: `
          varying vec3 vPos;
          void main() {
            vPos = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vPos;
          void main() {
            vec3 skyTop = vec3(0.18, 0.52, 0.88);
            vec3 horizon = vec3(0.75, 0.92, 1.0);
            vec3 ground = vec3(0.16, 0.42, 0.55);
            vec3 col = vPos.y >= 0.0
              ? mix(horizon, skyTop, pow(vPos.y, 0.6))
              : mix(horizon, ground, pow(-vPos.y, 0.5));
            vec3 sunDir = normalize(vec3(0.45, 0.78, 0.38));
            float sunAmt = max(0.0, dot(vPos, sunDir));
            col += vec3(1.0, 0.96, 0.82) * pow(sunAmt, 16.0) * 1.8;
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      });
      envScene.add(new THREE.Mesh(envGeo, envMat));
      const envRT = pmrem.fromScene(envScene);
      this.scene.environment = envRT.texture;
      pmrem.dispose();
      envGeo.dispose();
      envMat.dispose();
    } catch {
      // Fallback if PMREM unavailable
    }

    // Disable expensive real-time shadow maps & multi-pass HDR bloom on smartphones!
    this.renderer.shadowMap.enabled = !this.isMobile;
    if (!this.isMobile) {
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      try {
        this.composer = new EffectComposer(this.renderer);
        this.composer.setPixelRatio(pixelRatio);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.38, 0.35, 0.82));
        this.composer.addPass(new OutputPass());
      } catch {
        this.composer = null;
      }
    } else {
      this.composer = null;
    }
  }

  private initSharedAssets() {
    this.laserGeo = new THREE.CapsuleGeometry(0.42, 5.6, 4, 8);
    this.laserGeo.rotateX(Math.PI / 2);

    this.laserCoreGeo = new THREE.CapsuleGeometry(0.18, 5.2, 4, 6);
    this.laserCoreGeo.rotateX(Math.PI / 2);
    this.laserCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    this.playerLaserMats = {
      1: new THREE.MeshBasicMaterial({ color: 0x00f5d4, transparent: true, opacity: 0.78 }),
      2: new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.82 }),
      3: new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.85 }),
    };
    this.enemyLaserMat = new THREE.MeshBasicMaterial({ color: 0xff1e56 });

    this.fireballGeo = new THREE.SphereGeometry(1.0, 12, 10);
    this.shockwaveGeo = new THREE.TorusGeometry(1.0, 0.14, 8, 28);
  }

  // -------------------------------------------------------------
  // INTEGRATE REAL ZELDA HYRULE LANDSCAPE + INSTANCED FORESTS (4 DRAW CALLS!)
  // -------------------------------------------------------------
  private createHyruleIntegratedWorld() {
    this.terrainManager = new TerrainManager();
    const terrainMesh = this.terrainManager.createTerrainMesh();
    // Scale Hyrule 2.4x wide (~1920m x 1920m) so flight feels sweeping, huge, and uncrowded!
    terrainMesh.scale.set(this.WORLD_SCALE_XZ, this.WORLD_SCALE_Y, this.WORLD_SCALE_XZ);
    terrainMesh.castShadow = false;
    terrainMesh.receiveShadow = !this.isMobile;
    this.scene.add(terrainMesh);

    this.waterManager = new WaterManager();
    const hyruleWater = this.waterManager.createWaterMesh();
    hyruleWater.scale.set(this.WORLD_SCALE_XZ, 1.0, this.WORLD_SCALE_XZ);
    hyruleWater.position.y = this.WATER_Y;
    this.scene.add(hyruleWater);

    this.skyLighting = new SkyAndLightingManager(this.scene);
    this.skyLighting.initLighting(this.isMobile ? 'low' : 'high');
    // Lock golden mid-morning sun angle for maximum alpine mountain & water beauty
    this.skyLighting.timeOfDay = 10.6;
    this.skyLighting.isTimeCycleActive = false;

    if (this.skyLighting.skyDome) {
      this.skyLighting.skyDome.scale.setScalar(20);
    }
    if (this.skyLighting.fog) {
      this.skyLighting.fog.density = 0.00018;
    }

    // Batched Instanced Zelda Pine Trees & Boulders (Only 4 WebGL Draw Calls Total!)
    this.populateInstancedHyruleNature();

    // Real Zelda Sheikah Shrines with Sky Beams (Scaled nicely for wide aerial view)
    this.collectibleManager = new CollectibleManager(this.scene);
    this.collectibleManager.shrinesData.forEach((shrine) => {
      shrine.position.x *= this.WORLD_SCALE_XZ;
      shrine.position.z *= this.WORLD_SCALE_XZ;
    });
    this.collectibleManager.initWorldObjects();
    // Adjust Shrine vertical position & scale for the 2.4x Hyrule terrain
    this.collectibleManager.objects.forEach((obj) => {
      if (obj.data.type === 'shrine') {
        const y = this.getHyruleHeight(obj.data.position.x, obj.data.position.z);
        obj.mesh.position.set(obj.data.position.x, y, obj.data.position.z);
        obj.mesh.scale.setScalar(1.8);
      }
    });

    // Zelda Castles, Windmills & Watchtowers (Exterior-only, zero PointLights for 60 FPS!)
    this.buildingSystem = new BuildingSystem(this.scene);
    // Clear saved structures' heavy lights if any exist
    this.buildingSystem.group.visible = false;

    const scenicLandmarks: Array<{ type: string; x: number; z: number; rotY: number; scale: number; rad: number }> = [
      { type: 'catan_city', x: 180, z: 420, rotY: 0.5, scale: 2.2, rad: 12 },
      { type: 'windmill', x: 390, z: 110, rotY: -0.4, scale: 2.0, rad: 8 },
      { type: 'watchtower', x: 220, z: -210, rotY: 0.8, scale: 2.2, rad: 7 },
      { type: 'catan_settlement', x: -200, z: -280, rotY: 1.2, scale: 2.0, rad: 10 },
      { type: 'windmill', x: -300, z: 200, rotY: 0.2, scale: 1.9, rad: 8 },
      { type: 'watchtower', x: 30, z: -110, rotY: 0.0, scale: 2.2, rad: 7 },
    ];

    scenicLandmarks.forEach((lm) => {
      const y = this.getHyruleHeight(lm.x, lm.z);
      if (y > this.WATER_Y + 1.0) {
        const mesh = this.buildingSystem.createStructureMesh(lm.type, false);
        // Strip PointLights so mobile GPUs maintain locked 60fps
        const lightsToRemove: THREE.Object3D[] = [];
        mesh.traverse((child) => {
          if (child instanceof THREE.PointLight) lightsToRemove.push(child);
        });
        lightsToRemove.forEach((l) => l.parent?.remove(l));

        const rotor = mesh.getObjectByName('WindmillRotor');
        if (rotor) this.windmills.push(rotor);

        mesh.position.set(lm.x, y, lm.z);
        mesh.rotation.y = lm.rotY;
        mesh.scale.setScalar(lm.scale);
        this.scene.add(mesh);

        this.colliders.push({
          position: new THREE.Vector3(lm.x, y + 10, lm.z),
          radius: lm.rad,
          halfHeight: 16,
          type: 'building',
        });
      }
    });
  }

  private populateInstancedHyruleNature() {
    const treeCount = this.isMobile ? 240 : 360;
    const rockCount = this.isMobile ? 110 : 180;

    const trunkGeo = new THREE.CylinderGeometry(0.42, 0.72, 5.5, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c3a1e, roughness: 0.85, metalness: 0.05 });
    const f1Geo = new THREE.ConeGeometry(4.4, 8.2, 8);
    const fMatLower = new THREE.MeshStandardMaterial({ color: 0x24632b, roughness: 0.72, metalness: 0.04 });
    const fMatUpper = new THREE.MeshStandardMaterial({ color: 0x348c3d, roughness: 0.68, metalness: 0.04 });

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const f1Inst = new THREE.InstancedMesh(f1Geo, fMatLower, treeCount);
    const f2Inst = new THREE.InstancedMesh(f1Geo, fMatUpper, treeCount);

    const dummy = new THREE.Object3D();
    let placedTrees = 0;

    for (let i = 0; i < treeCount * 2 && placedTrees < treeCount; i++) {
      const wx = (Math.random() - 0.5) * 1650;
      const wz = (Math.random() - 0.5) * 1650;
      const wy = this.getHyruleHeight(wx, wz);
      if (wy > this.WATER_Y + 1.5 && wy < 46) {
        const s = 1.2 + Math.random() * 1.1;

        dummy.position.set(wx, wy + 2.5 * s, wz);
        dummy.scale.set(s, s, s);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        dummy.updateMatrix();
        trunkInst.setMatrixAt(placedTrees, dummy.matrix);

        dummy.position.set(wx, wy + 7.0 * s, wz);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        f1Inst.setMatrixAt(placedTrees, dummy.matrix);

        dummy.position.set(wx, wy + 10.8 * s, wz);
        dummy.scale.set(s * 0.74, s * 0.78, s * 0.74);
        dummy.updateMatrix();
        f2Inst.setMatrixAt(placedTrees, dummy.matrix);

        placedTrees++;
      }
    }
    trunkInst.count = placedTrees;
    f1Inst.count = placedTrees;
    f2Inst.count = placedTrees;
    this.scene.add(trunkInst, f1Inst, f2Inst);

    const rockGeo = new THREE.DodecahedronGeometry(3.0, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a8896, roughness: 0.75, metalness: 0.08 });
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    let placedRocks = 0;

    for (let i = 0; i < rockCount * 2 && placedRocks < rockCount; i++) {
      const wx = (Math.random() - 0.5) * 1750;
      const wz = (Math.random() - 0.5) * 1750;
      const wy = this.getHyruleHeight(wx, wz);
      if (wy > this.WATER_Y + 0.5 && wy < 42) {
        const s = 1.0 + Math.random() * 1.9;
        dummy.position.set(wx, wy + s * 0.45, wz);
        dummy.scale.set(s * 1.1, s * 0.72, s * 1.25);
        dummy.rotation.set(Math.random() * 0.4, Math.random() * Math.PI, Math.random() * 0.4);
        dummy.updateMatrix();
        rockInst.setMatrixAt(placedRocks, dummy.matrix);
        placedRocks++;
      }
    }
    rockInst.count = placedRocks;
    this.scene.add(rockInst);
  }

  // -------------------------------------------------------------
  // WIDE, SWEEPING 3D CIRCUIT (~7,800m FOR SMOOTH & PLAYABLE PACING)
  // -------------------------------------------------------------
  private createSpline() {
    const rawWaypoints: Array<{ x: number; z: number; minAlt: number; clearance: number }> = [
      { x: 0, z: 1420, minAlt: 28, clearance: 20 },      // Wide Corneria Outer Bay entry
      { x: 45, z: 1080, minAlt: 30, clearance: 20 },     // Flanked by giant spaced towers
      { x: 220, z: 740, minAlt: 34, clearance: 24 },     // Hyrule eastern coast
      { x: 470, z: 360, minAlt: 42, clearance: 26 },     // Over Whispering Forest & Windmill
      { x: 560, z: -60, minAlt: 38, clearance: 24 },     // Emerald Valley curve
      { x: 360, z: -360, minAlt: 20, clearance: 18 },    // Wide Hyrule Lake water-skim
      { x: 60, z: -610, minAlt: 40, clearance: 26 },     // Southern cliffs past Castle
      { x: -390, z: -420, minAlt: 38, clearance: 24 },   // Ancient Temple Ruins
      { x: -560, z: -40, minAlt: 54, clearance: 28 },    // Western Canyon ascent
      { x: -350, z: 340, minAlt: 82, clearance: 32 },    // High Dragon Crest Peaks!
      { x: -75, z: 530, minAlt: 90, clearance: 32 },     // Past Dragon Crest Shrine
      { x: 250, z: 390, minAlt: 68, clearance: 28 },     // Cloud dive into Central Basin
      { x: 25, z: 75, minAlt: 32, clearance: 22 },       // Shrine of Awakening flyby
      { x: -110, z: -410, minAlt: 34, clearance: 24 },   // Outbound strait
      { x: -50, z: -960, minAlt: 34, clearance: 24 },    // Outer Bay Gauntlet
      { x: 0, z: -1540, minAlt: 44, clearance: 26 },     // Dreadnought Arena
      { x: 0, z: -2150, minAlt: 50, clearance: 26 },     // Victory Flyover
    ];

    const halfWorld = 400 * this.WORLD_SCALE_XZ - 15;
    const points = rawWaypoints.map((wp) => {
      let y = wp.minAlt;
      if (Math.abs(wp.x) < halfWorld && Math.abs(wp.z) < halfWorld) {
        const groundY = this.getHyruleHeight(wp.x, wp.z);
        y = Math.max(wp.minAlt, groundY + wp.clearance);
      }
      return new THREE.Vector3(wp.x, y, wp.z);
    });

    this.splineCurve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.45);
    this.totalDistance = this.splineCurve.getLength();
    this.prevTangent = this.splineCurve.getTangentAt(0).normalize();
  }

  private createSkyAndCelestial() {
    const planetGroup = new THREE.Group();
    planetGroup.position.set(2200, 1850, -6800);

    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(780, 32, 32),
      new THREE.MeshStandardMaterial({
        color: 0xdbeafe,
        roughness: 0.65,
        metalness: 0.1,
        emissive: 0x3b82f6,
        emissiveIntensity: 0.28,
      })
    );
    planetGroup.add(planet);

    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(1020, 1520, 48),
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.72,
      })
    );
    innerRing.rotation.set(Math.PI / 2.3, -0.25, 0.65);
    planetGroup.add(innerRing);

    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(1580, 2050, 48),
      new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.42,
      })
    );
    outerRing.rotation.set(Math.PI / 2.3, -0.25, 0.65);
    planetGroup.add(outerRing);

    // Orbiting Corneria Moon
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(210, 20, 20),
      new THREE.MeshStandardMaterial({
        color: 0xfef3c7,
        roughness: 0.7,
        emissive: 0xf59e0b,
        emissiveIntensity: 0.22,
      })
    );
    moon.position.set(-1650, 520, 400);
    planetGroup.add(moon);

    this.scene.add(planetGroup);
  }

  private createOuterOcean() {
    const oceanGeo = new THREE.PlaneGeometry(16000, 16000, 64, 64);
    oceanGeo.rotateX(-Math.PI / 2);

    this.outerOceanMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeepColor: { value: new THREE.Color('#00264d') },
        uShallowColor: { value: new THREE.Color('#14b2d1') },
        uSunDirection: { value: new THREE.Vector3(0.45, 0.7, 0.35).normalize() },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying float vWave;
        void main() {
          vec3 pos = position;
          float w = sin(pos.x * 0.025 + uTime * 1.4) * cos(pos.z * 0.025 + uTime * 1.1) * 0.55;
          pos.y += w;
          vWave = w;
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uSunDirection;
        varying vec3 vWorldPos;
        varying float vWave;
        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 normal = normalize(vec3(vWave * 0.15, 1.0, -vWave * 0.15));
          float fresnel = pow(1.0 - max(0.0, dot(viewDir, normal)), 3.2);
          vec3 col = mix(uDeepColor, uShallowColor, clamp(vWave * 0.5 + 0.35, 0.0, 1.0));
          col = mix(col, vec3(0.55, 0.82, 0.98), fresnel * 0.5);
          vec3 halfDir = normalize(uSunDirection + viewDir);
          float spec = pow(max(0.0, dot(normal, halfDir)), 48.0);
          col += vec3(1.0, 0.96, 0.88) * spec * 1.1;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const outerMesh = new THREE.Mesh(oceanGeo, this.outerOceanMaterial);
    outerMesh.position.y = this.WATER_Y - 0.18;
    this.scene.add(outerMesh);
  }

  private createClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      transparent: true,
      opacity: 0.78,
    });
    const puffGeo = new THREE.SphereGeometry(22, 10, 8);

    const cloudSpots = [
      new THREE.Vector3(-280, 125, 320),
      new THREE.Vector3(-90, 130, 520),
      new THREE.Vector3(160, 118, 410),
      new THREE.Vector3(410, 132, 80),
      new THREE.Vector3(-520, 128, -140),
      new THREE.Vector3(90, 138, -580),
      new THREE.Vector3(-220, 145, -1100),
      new THREE.Vector3(280, 140, -1450),
    ];

    cloudSpots.forEach((spot) => {
      const cluster = new THREE.Group();
      cluster.position.copy(spot);
      for (let i = 0; i < 4; i++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set((i - 1.5) * 24, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 14);
        puff.scale.set(1.5, 0.55, 1.5);
        cluster.add(puff);
      }
      this.scene.add(cluster);
    });
  }

  // -------------------------------------------------------------
  // PLAYER SHIP: ICONIC ARWING INTERCEPTOR + SPECIAL FX RINGS
  // -------------------------------------------------------------
  private createPlayerShip() {
    this.shipGroup = new THREE.Group();
    this.shipMesh = new THREE.Group();
    this.shipMesh.scale.setScalar(1.22);

    // Bright pearl-white ceramic & royal cobalt armor with subtle emissive lift so it always gleams in sun or shade
    const ceramicMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.2,
      metalness: 0.45,
      emissive: 0x334155,
      emissiveIntensity: 0.25,
    });
    const blueArmorMat = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.22,
      metalness: 0.65,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.35,
    });
    const gDiffuserGlowMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const redTrimMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.25,
      metalness: 0.45,
      emissive: 0x991b1b,
      emissiveIntensity: 0.3,
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.08,
      metalness: 0.85,
      emissive: 0x0284c7,
      emissiveIntensity: 0.55,
    });

    // Sleek forward nosecone & fuselage spine
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.88, 4.6, 6).rotateX(-Math.PI / 2), ceramicMat);
    nose.position.set(0, 0, -2.5);
    this.shipMesh.add(nose);

    const dorsalSpine = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.72, 3.8), ceramicMat);
    dorsalSpine.position.set(0, 0.16, 0.1);
    this.shipMesh.add(dorsalSpine);

    const cockpit = new THREE.Mesh(new THREE.ConeGeometry(0.68, 2.7, 6).rotateX(-Math.PI / 2), canopyMat);
    cockpit.position.set(0, 0.52, -1.1);
    this.shipMesh.add(cockpit);

    const lowerHull = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.65, 3.5), blueArmorMat);
    lowerHull.position.set(0, -0.18, 0.25);
    this.shipMesh.add(lowerHull);

    // Iconic Twin Blue G-Diffuser Pods + Cyan Gravity Glow Strips + Under-Wing Plasma Cannons & Muzzle Flashes
    [-1.48, 1.48].forEach((xOff) => {
      const diffuserPod = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.58, 3.6), blueArmorMat);
      diffuserPod.position.set(xOff, 0.0, 0.25);
      this.shipMesh.add(diffuserPod);

      const glowStrip = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.16, 2.9), gDiffuserGlowMat);
      glowStrip.position.set(xOff, 0.12, 0.15);
      this.shipMesh.add(glowStrip);

      const cannonBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 3.4, 8).rotateX(Math.PI / 2),
        ceramicMat
      );
      cannonBarrel.position.set(xOff * 1.15, -0.18, -0.85);
      this.shipMesh.add(cannonBarrel);

      const muzzleFlash = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.0 })
      );
      muzzleFlash.position.set(xOff * 1.15, -0.18, -2.6);
      this.shipMesh.add(muzzleFlash);
      this.muzzleFlashes.push(muzzleFlash);
    });

    // Volumetric Swept Main Wings (solid thickness so visible from all bank angles!)
    const leftWing = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 1.75), ceramicMat);
    leftWing.position.set(-2.95, 0.18, 1.05);
    leftWing.rotation.set(0, -0.26, -0.08);
    this.shipMesh.add(leftWing);

    const rightWing = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.14, 1.75), ceramicMat);
    rightWing.position.set(2.95, 0.18, 1.05);
    rightWing.rotation.set(0, 0.26, 0.08);
    this.shipMesh.add(rightWing);

    // Crimson Wingtip Stabilizer Fins
    const finGeo = new THREE.BoxGeometry(0.18, 1.35, 1.65);
    const leftFin = new THREE.Mesh(finGeo, redTrimMat);
    leftFin.position.set(-5.0, 0.48, 1.75);
    leftFin.rotation.z = 0.15;
    this.shipMesh.add(leftFin);

    const rightFin = new THREE.Mesh(finGeo, redTrimMat);
    rightFin.position.set(5.0, 0.48, 1.75);
    rightFin.rotation.z = -0.15;
    this.shipMesh.add(rightFin);

    const flapGeo = new THREE.BoxGeometry(1.6, 0.1, 0.65);
    this.leftFlap = new THREE.Mesh(flapGeo, redTrimMat);
    this.leftFlap.position.set(-2.6, 0.24, 1.98);
    this.shipMesh.add(this.leftFlap);

    this.rightFlap = new THREE.Mesh(flapGeo, redTrimMat);
    this.rightFlap.position.set(2.6, 0.24, 1.98);
    this.shipMesh.add(this.rightFlap);

    // Multi-Layered Plasma Afterburners (White-hot core + glowing plasma outer cone)
    const thrusterMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.2 });
    const outerFlameMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.82 });
    const innerCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    [
      new THREE.Vector3(-1.45, 0.0, 2.0),
      new THREE.Vector3(1.45, 0.0, 2.0),
      new THREE.Vector3(0.0, 0.18, 2.05),
    ].forEach((pos, idx) => {
      const isCenter = idx === 2;
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(isCenter ? 0.46 : 0.34, isCenter ? 0.54 : 0.42, 0.9, 12).rotateX(Math.PI / 2),
        thrusterMat
      );
      nozzle.position.copy(pos);
      this.shipMesh.add(nozzle);

      const nozzleRing = new THREE.Mesh(
        new THREE.TorusGeometry(isCenter ? 0.48 : 0.36, 0.07, 8, 16),
        gDiffuserGlowMat
      );
      nozzleRing.position.set(pos.x, pos.y, pos.z + 0.45);
      this.shipMesh.add(nozzleRing);

      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(isCenter ? 0.48 : 0.36, isCenter ? 3.4 : 2.6, 10).rotateX(Math.PI / 2),
        outerFlameMat.clone()
      );
      flame.position.set(pos.x, pos.y, pos.z + 1.45);
      this.shipMesh.add(flame);
      this.thrusterFlames.push(flame);

      const coreFlame = new THREE.Mesh(
        new THREE.ConeGeometry(isCenter ? 0.24 : 0.18, isCenter ? 2.2 : 1.7, 8).rotateX(Math.PI / 2),
        innerCoreMat
      );
      coreFlame.position.set(pos.x, pos.y, pos.z + 1.15);
      this.shipMesh.add(coreFlame);
      this.thrusterCores.push(coreFlame);
    });

    // Electromagnetic Barrel Roll Deflector Vortex Ring
    this.barrelRollRing = new THREE.Mesh(
      new THREE.TorusGeometry(5.4, 0.22, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.0 })
    );
    this.barrelRollRing.visible = false;
    this.shipMesh.add(this.barrelRollRing);

    // Sonic Boom Vapor Shock-Ring on Boost Ignition
    this.sonicBoomRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.2, 0.28, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xfffbeb, transparent: true, opacity: 0.0 })
    );
    this.sonicBoomRing.visible = false;
    this.shipGroup.add(this.sonicBoomRing);

    // Hexagonal Energy Shield Bubble
    this.shieldBubble = new THREE.Mesh(
      new THREE.IcosahedronGeometry(4.8, 2),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.0 })
    );
    this.shieldBubble.visible = false;
    this.shipMesh.add(this.shieldBubble);

    // Nose Charge-Shot Plasma Orb + Orbiting Gyro Ring
    this.chargeSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.0 })
    );
    this.chargeSphere.position.set(0, 0, -4.8);
    this.shipMesh.add(this.chargeSphere);

    this.chargeRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.15, 0.09, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.0 })
    );
    this.chargeRing.position.set(0, 0, -4.8);
    this.shipMesh.add(this.chargeRing);

    this.shipGroup.add(this.shipMesh);
    this.scene.add(this.shipGroup);
  }

  private createWingmen() {
    const offsets = [new THREE.Vector3(-34, 8, -42), new THREE.Vector3(34, 7, -46)];
    offsets.forEach((offset, idx) => {
      const g = new THREE.Group();
      const whiteMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        metalness: 0.45,
        roughness: 0.25,
        emissive: 0x334155,
        emissiveIntensity: 0.2,
      });
      const accentMat = new THREE.MeshStandardMaterial({
        color: idx === 0 ? 0x10b981 : 0x3b82f6,
        metalness: 0.6,
        roughness: 0.25,
        emissive: idx === 0 ? 0x059669 : 0x1d4ed8,
        emissiveIntensity: 0.35,
      });
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.75, 3.8, 5).rotateX(-Math.PI / 2), whiteMat);
      nose.position.z = -1.6;
      g.add(nose);
      const wings = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.18, 1.5), accentMat);
      wings.position.z = 0.6;
      g.add(wings);
      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(0.36, 2.4, 8).rotateX(Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: idx === 0 ? 0x34d399 : 0x38bdf8 })
      );
      flame.position.z = 2.2;
      g.add(flame);
      this.scene.add(g);
      this.wingmen.push({ group: g, offset, phase: idx * Math.PI });
    });
  }

  private createWingtipTrails() {
    this.wingtipTrailMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.85 });
    this.wingtipTrailGeoLeft = new THREE.BufferGeometry();
    this.wingtipTrailGeoRight = new THREE.BufferGeometry();
    const empty = new Float32Array(this.TRAIL_LENGTH * 3);
    this.wingtipTrailGeoLeft.setAttribute('position', new THREE.BufferAttribute(empty.slice(), 3));
    this.wingtipTrailGeoRight.setAttribute('position', new THREE.BufferAttribute(empty.slice(), 3));
    this.scene.add(new THREE.Line(this.wingtipTrailGeoLeft, this.wingtipTrailMat));
    this.scene.add(new THREE.Line(this.wingtipTrailGeoRight, this.wingtipTrailMat));
  }

  private createSkyscraperTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0c1626';
    ctx.fillRect(0, 0, 256, 512);

    const cols = 16;
    const rows = 56;
    const cw = 256 / cols;
    const ch = 512 / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() > 0.34) {
          const rnd = Math.random();
          ctx.fillStyle = rnd > 0.85 ? '#ffffff' : rnd > 0.45 ? '#7dd3fc' : '#38bdf8';
          ctx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 3);
        }
      }
    }
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(0, 0, 5, 512);
    ctx.fillRect(126, 0, 5, 512);
    ctx.fillRect(251, 0, 5, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 5);
    return tex;
  }

  // -------------------------------------------------------------
  // WIDE, SPACIOUS ENTITIES & COLLIDERS
  // -------------------------------------------------------------
  private createWorldEntitiesAndEncounterWave() {
    const skyscraperTex = this.createSkyscraperTexture();
    const towerMat = new THREE.MeshStandardMaterial({
      map: skyscraperTex,
      metalness: 0.75,
      roughness: 0.25,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.4,
      emissiveMap: skyscraperTex,
    });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 });
    const cyanNeonMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    // Wide-spaced Corneria Bay Skyscrapers flanking Ocean Entry & Final Bay Arena (with full 3D Colliders!)
    const towerCoords: Array<{ x: number; z: number; h: number }> = [
      { x: -115, z: 1240, h: 240 },
      { x: 125, z: 1120, h: 260 },
      { x: -125, z: 960, h: 280 },
      { x: 145, z: 900, h: 220 },
      { x: -140, z: -980, h: 260 },
      { x: 135, z: -1080, h: 280 },
      { x: -155, z: -1360, h: 300 },
      { x: 155, z: -1420, h: 290 },
    ];

    towerCoords.forEach((tc) => {
      const g = new THREE.Group();
      const centerY = tc.h * 0.45;
      g.position.set(tc.x, centerY, tc.z);

      g.add(new THREE.Mesh(new THREE.CylinderGeometry(13, 20, tc.h, 16), towerMat));

      const pontoon = new THREE.Mesh(new THREE.CylinderGeometry(28, 34, 9, 16), baseMat);
      pontoon.position.y = -centerY + this.WATER_Y;
      g.add(pontoon);

      const baseRing = new THREE.Mesh(new THREE.TorusGeometry(30, 1.3, 8, 24).rotateX(Math.PI / 2), cyanNeonMat);
      baseRing.position.y = -centerY + this.WATER_Y + 4;
      g.add(baseRing);

      const collar = new THREE.Mesh(new THREE.TorusGeometry(18, 1.6, 8, 24).rotateX(Math.PI / 2), cyanNeonMat);
      collar.position.y = tc.h * 0.22;
      g.add(collar);

      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 2.0, 55, 8), baseMat);
      spire.position.y = tc.h * 0.5 + 27;
      g.add(spire);

      this.scene.add(g);

      // Register solid Tower Collider!
      this.colliders.push({
        position: new THREE.Vector3(tc.x, centerY, tc.z),
        radius: 17,
        halfHeight: tc.h * 0.5 + 20,
        type: 'tower',
      });
    });

    // Wide Golden Boost Arches (Radius = 28m, Pillars get colliders!)
    [0.08, 0.28, 0.56, 0.80].forEach((u) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      this.spawnBoostArch(pos, tangent);
    });

    // Generous Shield Rings (Radius = 11.5m)
    [0.16, 0.42, 0.67, 0.85].forEach((u, i) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, this.tmpUpRef).normalize();
      pos.addScaledVector(right, (i % 2 === 0 ? 1 : -1) * 14);
      this.spawnCollectRing(pos, tangent, 'shield_ring', 0x00f0ff);
    });

    // Weapon Upgrade Pods
    [0.21, 0.50].forEach((u) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      this.spawnCollectRing(pos, tangent, 'weapon_pod', 0x22c55e);
    });

    // Shootable Laser Barrier Gates
    [0.34, 0.63, 0.77].forEach((u) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      this.spawnLaserGate(pos, tangent);
    });

    // Wider-spaced, larger Enemies, Crystals & Naval Mines
    for (let u = 0.045; u <= 0.84; u += 0.055) {
      const center = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, this.tmpUpRef).normalize();

      const squadCount = u < 0.2 ? 3 : 4;
      for (let k = 0; k < squadCount; k++) {
        const offsetX = (k - (squadCount - 1) / 2) * 22;
        const offsetY = k % 2 === 0 ? 5 : -4;
        const pos = center.clone().addScaledVector(right, offsetX);
        pos.y += offsetY;
        this.spawnDartDrone(pos, k * 1.4, 12 + k * 2, 4.5);
      }

      if (Math.round(u * 100) % 2 === 0) {
        const cPos = center.clone().addScaledVector(right, (Math.random() - 0.5) * 44);
        cPos.y += (Math.random() - 0.5) * 12;
        this.spawnEnergyCrystal(cPos);
      } else {
        const mPos = center.clone().addScaledVector(right, (Math.random() - 0.5) * 40);
        mPos.y += (Math.random() - 0.5) * 10;
        this.spawnNavalMine(mPos);
      }
    }

    // Heavy Corvettes
    [0.24, 0.47, 0.71].forEach((u) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      pos.y += 10;
      this.spawnHeavyCorvette(pos, tangent);
    });

    // Ground Sheikah Guardians perched on wide Hyrule hills
    [
      { x: 380, z: 220 },
      { x: 460, z: -130 },
      { x: -310, z: -280 },
      { x: -210, z: 390 },
      { x: 70, z: 25 },
    ].forEach((gs) => {
      const gy = this.getHyruleHeight(gs.x, gs.z);
      if (gy > this.WATER_Y + 0.5) {
        this.spawnGroundGuardian(new THREE.Vector3(gs.x, gy + 2.0, gs.z));
      }
    });

    // Flanking Aero-Carriers
    this.spawnAeroCarrier(new THREE.Vector3(-155, 110, 790));
    this.spawnAeroCarrier(new THREE.Vector3(165, 105, -1040));

    // ZONE 4 FINALE: Corneria Dreadnought Boss
    this.spawnDreadnoughtBoss(new THREE.Vector3(0, 62, -1680));
  }

  private spawnBoostArch(pos: THREE.Vector3, tangent: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.lookAt(pos.clone().add(tangent));

    const archMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.88 });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(28, 3.0, 12, 36, Math.PI), archMat);
    arch.position.y = -4;
    g.add(arch);

    const field = new THREE.Mesh(
      new THREE.CircleGeometry(26, 24, 0, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.32, side: THREE.DoubleSide })
    );
    field.position.y = -4;
    g.add(field);

    this.scene.add(g);
    this.archesAndRings.push({ mesh: g, position: pos.clone(), radius: 28, type: 'boost_arch', collected: false });

    // Solid colliders on both arch pillars!
    const right = new THREE.Vector3().crossVectors(tangent, this.tmpUpRef).normalize();
    [-28, 28].forEach((offset) => {
      this.colliders.push({
        position: pos.clone().addScaledVector(right, offset),
        radius: 4.5,
        halfHeight: 28,
        type: 'arch_pillar',
      });
    });
  }

  private spawnCollectRing(
    pos: THREE.Vector3,
    tangent: THREE.Vector3,
    type: 'shield_ring' | 'speed_ring' | 'weapon_pod',
    colorHex: number
  ) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.lookAt(pos.clone().add(tangent));

    g.add(new THREE.Mesh(new THREE.TorusGeometry(11.5, 0.75, 10, 28), new THREE.MeshBasicMaterial({ color: colorHex })));
    if (type === 'weapon_pod') {
      g.add(
        new THREE.Mesh(
          new THREE.OctahedronGeometry(3.4, 0),
          new THREE.MeshBasicMaterial({ color: 0xfacc15, wireframe: true })
        )
      );
    }

    this.scene.add(g);
    this.archesAndRings.push({ mesh: g, position: pos.clone(), radius: 12.0, type, collected: false });
  }

  private spawnLaserGate(pos: THREE.Vector3, tangent: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.lookAt(pos.clone().add(tangent));

    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.25 });
    const right = new THREE.Vector3().crossVectors(tangent, this.tmpUpRef).normalize();
    [-32, 32].forEach((x) => {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.2, 46, 10), pylonMat);
      pylon.position.set(x, 0, 0);
      g.add(pylon);

      this.colliders.push({
        position: pos.clone().addScaledVector(right, x),
        radius: 4.0,
        halfHeight: 23,
        type: 'arch_pillar',
      });
    });

    const barrier = new THREE.Mesh(
      new THREE.PlaneGeometry(62, 22),
      new THREE.MeshBasicMaterial({ color: 0xff0055, transparent: true, opacity: 0.34, side: THREE.DoubleSide })
    );
    g.add(barrier);

    const coreGroup = new THREE.Group();
    coreGroup.add(
      new THREE.Mesh(
        new THREE.OctahedronGeometry(5.2, 0),
        new THREE.MeshStandardMaterial({ color: 0xff3366, emissive: 0xff0055, emissiveIntensity: 1.5 })
      )
    );
    coreGroup.position.copy(pos);
    this.scene.add(g, coreGroup);

    this.enemies.push({
      mesh: coreGroup,
      type: 'gate_core',
      health: 26,
      maxHealth: 26,
      points: 1000,
      basePos: pos.clone(),
      movePhase: 0,
      moveAmpX: 0,
      moveAmpY: 0,
      fireCooldown: 9999,
      destroyed: false,
      hitRadius: 9.5,
      bodyRadius: 12.0,
      linkedBarrier: barrier,
    });
  }

  private spawnDartDrone(pos: THREE.Vector3, phase: number, ampX: number, ampY: number) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.scale.setScalar(1.35);

    const mat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.8, roughness: 0.25 });
    g.add(new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.0, 5).rotateX(Math.PI / 2), mat));
    const wings = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 1.4), mat);
    wings.position.z = -0.4;
    g.add(wings);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.48, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff1e56 }));
    eye.position.set(0, 0.25, 1.9);
    g.add(eye);

    this.scene.add(g);
    this.enemies.push({
      mesh: g,
      type: 'drone',
      health: 20,
      maxHealth: 20,
      points: 200,
      basePos: pos.clone(),
      movePhase: phase,
      moveAmpX: ampX,
      moveAmpY: ampY,
      fireCooldown: 1.8 + Math.random() * 1.8,
      destroyed: false,
      hitRadius: 7.2,
      bodyRadius: 4.5,
    });
  }

  private spawnHeavyCorvette(pos: THREE.Vector3, tangent: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.lookAt(pos.clone().sub(tangent));
    g.scale.setScalar(1.3);

    const hullMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.88, roughness: 0.25 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2e63 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.6, 15), hullMat));
    const wings = new THREE.Mesh(new THREE.BoxGeometry(20, 0.7, 5.2), hullMat);
    wings.position.set(0, 0.2, -1);
    g.add(wings);
    [-6, 6].forEach((xOff) => {
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 1.8, 8), glowMat);
      t.position.set(xOff, 0.9, 1.8);
      g.add(t);
    });

    this.scene.add(g);
    this.enemies.push({
      mesh: g,
      type: 'corvette',
      health: 95,
      maxHealth: 95,
      points: 750,
      basePos: pos.clone(),
      movePhase: Math.random() * 6,
      moveAmpX: 16,
      moveAmpY: 5,
      fireCooldown: 2.0,
      destroyed: false,
      hitRadius: 11.5,
      bodyRadius: 9.5,
    });
  }

  private spawnGroundGuardian(pos: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.scale.setScalar(1.5);
    const dome = new THREE.Mesh(
      new THREE.ConeGeometry(3.5, 6.0, 8),
      new THREE.MeshStandardMaterial({ color: 0x3f4752, roughness: 0.7, metalness: 0.3 })
    );
    dome.position.y = 3.0;
    g.add(dome);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1.2, 10, 10), new THREE.MeshBasicMaterial({ color: 0xff007f }));
    eye.position.y = 4.6;
    g.add(eye);
    this.scene.add(g);

    this.enemies.push({
      mesh: g,
      type: 'guardian',
      health: 40,
      maxHealth: 40,
      points: 450,
      basePos: pos.clone(),
      movePhase: 0,
      moveAmpX: 0,
      moveAmpY: 0,
      fireCooldown: 2.2,
      destroyed: false,
      hitRadius: 8.5,
      bodyRadius: 5.5,
    });
  }

  private spawnEnergyCrystal(pos: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.add(
      new THREE.Mesh(
        new THREE.OctahedronGeometry(3.5, 0),
        new THREE.MeshStandardMaterial({ color: 0x00f5d4, emissive: 0x00bbf9, emissiveIntensity: 1.0, roughness: 0.1 })
      )
    );
    this.scene.add(g);
    this.enemies.push({
      mesh: g,
      type: 'crystal',
      health: 12,
      maxHealth: 12,
      points: 300,
      basePos: pos.clone(),
      movePhase: 0,
      moveAmpX: 0,
      moveAmpY: 0,
      fireCooldown: 9999,
      destroyed: false,
      hitRadius: 7.0,
      bodyRadius: 4.0,
    });
  }

  private spawnNavalMine(pos: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.add(
      new THREE.Mesh(
        new THREE.IcosahedronGeometry(3.0, 0),
        new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, emissive: 0xff6b00, emissiveIntensity: 0.9 })
      )
    );
    this.scene.add(g);
    this.enemies.push({
      mesh: g,
      type: 'mine',
      health: 15,
      maxHealth: 15,
      points: 250,
      basePos: pos.clone(),
      movePhase: Math.random() * 6,
      moveAmpX: 4,
      moveAmpY: 4,
      fireCooldown: 9999,
      destroyed: false,
      hitRadius: 7.2,
      bodyRadius: 4.5,
    });
  }

  private spawnAeroCarrier(startPos: THREE.Vector3) {
    const cruiser = new THREE.Group();
    cruiser.position.copy(startPos);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.82, roughness: 0.35 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00b4d8 });
    cruiser.add(new THREE.Mesh(new THREE.BoxGeometry(50, 16, 150), hullMat));
    const wings = new THREE.Mesh(new THREE.BoxGeometry(125, 5, 70), hullMat);
    wings.position.set(0, 2, 10);
    cruiser.add(wings);
    [-20, 0, 20].forEach((xOff) => {
      const p = new THREE.Mesh(new THREE.ConeGeometry(7.0, 60, 12).rotateX(Math.PI / 2), glowMat);
      p.position.set(xOff, 2, 90);
      cruiser.add(p);
    });
    this.scene.add(cruiser);

    this.colliders.push({
      position: startPos.clone(),
      radius: 42,
      halfHeight: 16,
      type: 'carrier',
    });
  }

  private spawnDreadnoughtBoss(centerPos: THREE.Vector3) {
    const boss = new THREE.Group();
    boss.position.copy(centerPos);

    const armorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.88, roughness: 0.25 });
    const redGlowMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });

    boss.add(new THREE.Mesh(new THREE.BoxGeometry(85, 24, 210), armorMat));
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(34, 22, 50), armorMat);
    bridge.position.set(0, 20, 28);
    boss.add(bridge);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(165, 6, 75), armorMat);
    wing.position.set(0, 2, -10);
    boss.add(wing);

    this.scene.add(boss);
    this.dreadnoughtGroup = boss;

    [
      new THREE.Vector3(-48, 8, 45),
      new THREE.Vector3(48, 8, 45),
      new THREE.Vector3(0, 20, 60),
    ].forEach((off) => {
      const cGroup = new THREE.Group();
      const worldCorePos = centerPos.clone().add(off);
      cGroup.position.copy(worldCorePos);
      cGroup.add(new THREE.Mesh(new THREE.SphereGeometry(7.0, 14, 14), redGlowMat));
      cGroup.add(
        new THREE.Mesh(new THREE.TorusGeometry(9.0, 0.6, 8, 22), new THREE.MeshBasicMaterial({ color: 0xfacc15 }))
      );
      this.scene.add(cGroup);

      const coreEntity: EnemyEntity = {
        mesh: cGroup,
        type: 'boss_core',
        health: 120,
        maxHealth: 120,
        points: 1500,
        basePos: worldCorePos.clone(),
        movePhase: 0,
        moveAmpX: 0,
        moveAmpY: 0,
        fireCooldown: 1.8,
        destroyed: false,
        hitRadius: 13.0,
        bodyRadius: 9.0,
      };
      this.enemies.push(coreEntity);
      this.bossCores.push(coreEntity);
    });
  }

  private createSpeedLines() {
    const lineGeo = new THREE.BufferGeometry();
    const count = this.isMobile ? 75 : 110;
    const positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 8.0 + Math.random() * 26.0;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const z = -45 + Math.random() * 100;
      const len = 18 + Math.random() * 24;
      positions[i * 6 + 0] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x;
      positions[i * 6 + 4] = y;
      positions[i * 6 + 5] = z + len;
    }
    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.speedLinesMesh = new THREE.LineSegments(
      lineGeo,
      new THREE.LineBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.28 })
    );
    this.camera.add(this.speedLinesMesh);
    this.scene.add(this.camera);
  }

  private createWaterSpray() {
    const count = 90;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 10;
      pos[i * 3 + 1] = Math.random() * 3;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 14;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.waterSprayParticles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.85, transparent: true, opacity: 0.68 })
    );
    this.waterSprayParticles.visible = false;
    this.scene.add(this.waterSprayParticles);
  }

  // -------------------------------------------------------------
  // WEAPON FIRE & AIM ASSIST
  // -------------------------------------------------------------
  private getShipAimDirection(shipWorldQuat: THREE.Quaternion, worldShipPos: THREE.Vector3): {
    aimDir: THREE.Vector3;
    lockedEnemy: EnemyEntity | null;
  } {
    const shipForward = new THREE.Vector3(0, 0, -1).applyQuaternion(shipWorldQuat).normalize();
    let bestEnemy: EnemyEntity | null = null;
    let bestDot = 0.98; // ~11 deg lock cone

    for (const enemy of this.enemies) {
      if (enemy.destroyed) continue;
      const toEnemy = this.tmpVec1.subVectors(enemy.mesh.position, worldShipPos);
      const dist = toEnemy.length();
      if (dist < 10 || dist > 560) continue;
      toEnemy.divideScalar(dist);
      const d = toEnemy.dot(shipForward);
      if (d > bestDot) {
        bestDot = d;
        bestEnemy = enemy;
      }
    }

    if (bestEnemy) {
      return {
        aimDir: new THREE.Vector3().subVectors(bestEnemy.mesh.position, worldShipPos).normalize(),
        lockedEnemy: bestEnemy,
      };
    }
    return { aimDir: shipForward, lockedEnemy: null };
  }

  public fireWeapon(isContinuous = false) {
    if (this.state.isGameOver || this.state.isMissionComplete) return;
    if (isContinuous && this.fireCooldown > 0) return;

    this.fireCooldown = 0.13;
    this.muzzleFlashTimer = 0.06;
    this.shipMesh.getWorldQuaternion(this.tmpQuat);
    const { aimDir, lockedEnemy } = this.getShipAimDirection(this.tmpQuat, this.shipGroup.position);

    const lvl = this.state.weaponLevel;
    const flashColor = lvl === 3 ? 0x10b981 : lvl === 2 ? 0x38bdf8 : 0x00f5d4;
    this.muzzleFlashes.forEach((mf) => {
      const mat = mf.material as THREE.MeshBasicMaterial;
      mat.color.setHex(flashColor);
      mat.opacity = 0.95;
      mf.scale.setScalar(1.35);
    });

    if (lvl === 1) {
      this.spawnPlayerLaser(-1.65, -0.18, -2.5, aimDir, 1, 25, null);
      this.spawnPlayerLaser(1.65, -0.18, -2.5, aimDir, 1, 25, null);
    } else if (lvl === 2) {
      this.spawnPlayerLaser(-1.75, -0.18, -2.5, aimDir, 2, 30, lockedEnemy);
      this.spawnPlayerLaser(1.75, -0.18, -2.5, aimDir, 2, 30, lockedEnemy);
      this.spawnPlayerLaser(0, 0.15, -3.6, aimDir, 2, 26, lockedEnemy);
    } else {
      this.spawnPlayerLaser(-1.95, -0.18, -2.5, aimDir, 3, 36, lockedEnemy);
      this.spawnPlayerLaser(1.95, -0.18, -2.5, aimDir, 3, 36, lockedEnemy);
      this.spawnPlayerLaser(0, 0.2, -3.8, aimDir, 3, 36, lockedEnemy);
    }
    starFoxAudio.playLaser();
  }

  private spawnPlayerLaser(
    lx: number,
    ly: number,
    lz: number,
    aimDir: THREE.Vector3,
    lvl: number,
    damage: number,
    homingTarget: EnemyEntity | null
  ) {
    const boltGroup = new THREE.Group();
    boltGroup.add(new THREE.Mesh(this.laserGeo, this.playerLaserMats[lvl]));
    boltGroup.add(new THREE.Mesh(this.laserCoreGeo, this.laserCoreMat));

    this.shipMesh.updateMatrixWorld();
    const worldPos = new THREE.Vector3(lx, ly, lz).applyMatrix4(this.shipMesh.matrixWorld);
    boltGroup.position.copy(worldPos);
    boltGroup.lookAt(worldPos.x + aimDir.x, worldPos.y + aimDir.y, worldPos.z + aimDir.z);

    this.scene.add(boltGroup);
    this.projectiles.push({
      mesh: boltGroup,
      position: boltGroup.position,
      velocity: aimDir.clone().multiplyScalar(440),
      isPlayer: true,
      damage,
      lifetime: 1.75,
      homingTarget: lvl >= 2 ? homingTarget : null,
    });
  }

  private releaseChargeShot() {
    starFoxAudio.playChargeShot();
    this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, 0.18);
    this.shipMesh.getWorldQuaternion(this.tmpQuat);
    const { aimDir, lockedEnemy } = this.getShipAimDirection(this.tmpQuat, this.shipGroup.position);

    const chargeGroup = new THREE.Group();
    chargeGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(2.3, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 })
      )
    );
    chargeGroup.add(
      new THREE.Mesh(new THREE.SphereGeometry(1.3, 10, 10), this.laserCoreMat)
    );
    chargeGroup.add(
      new THREE.Mesh(
        new THREE.TorusGeometry(2.9, 0.22, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      )
    );

    const worldPos = new THREE.Vector3(0, 0, -4.8).applyMatrix4(this.shipMesh.matrixWorld);
    chargeGroup.position.copy(worldPos);

    this.scene.add(chargeGroup);
    this.projectiles.push({
      mesh: chargeGroup,
      position: chargeGroup.position,
      velocity: aimDir.clone().multiplyScalar(310),
      isPlayer: true,
      damage: 210,
      lifetime: 2.6,
      isChargeShot: true,
      homingTarget: lockedEnemy,
    });

    this.chargeSphere.scale.set(1, 1, 1);
    (this.chargeSphere.material as THREE.MeshBasicMaterial).opacity = 0;
    (this.chargeRing.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  public triggerBarrelRoll(direction: 'left' | 'right' = 'left') {
    if (this.isBarrelRolling || this.barrelRollCooldown > 0) return;
    this.isBarrelRolling = true;
    this.barrelRollTimer = 0.54;
    this.barrelRollDirection = direction;
    this.barrelRollCooldown = 0.62;
    this.cameraShakeIntensity = 0.2;
    this.shipVelX += direction === 'left' ? -38 : 38;
    starFoxAudio.playBarrelRoll();

    this.projectiles.forEach((p) => {
      if (!p.isPlayer && p.position.distanceTo(this.shipGroup.position) < 46) {
        p.velocity.negate().multiplyScalar(1.5);
        p.isPlayer = true;
      }
    });
  }

  public launchSmartBomb() {
    if (this.state.smartBombs <= 0 || this.state.isGameOver) return;
    this.state.smartBombs--;
    starFoxAudio.playSmartBomb();
    this.cameraShakeIntensity = 0.6;

    this.projectiles = this.projectiles.filter((p) => {
      if (!p.isPlayer) {
        this.scene.remove(p.mesh);
        return false;
      }
      return true;
    });

    const bombCenter = this.shipGroup.position
      .clone()
      .addScaledVector(this.tmpRailFwd, 110);
    this.spawnExplosionFX(bombCenter, 65, 0x00f5d4);
    this.spawnExplosionParticles(bombCenter, 55, 0x38bdf8);

    this.enemies.forEach((enemy) => {
      if (!enemy.destroyed && enemy.mesh.position.distanceTo(this.shipGroup.position) < 540) {
        enemy.health -= 280;
        if (enemy.health <= 0) this.destroyEnemy(enemy);
      }
    });
    this.notifyState();
  }

  private spawnExplosionFX(pos: THREE.Vector3, maxScale = 24, ringColorHex = 0xff9e00) {
    const fireballMat = new THREE.MeshBasicMaterial({
      color: 0xfff3b0,
      transparent: true,
      opacity: 0.95,
    });
    const fireball = new THREE.Mesh(this.fireballGeo, fireballMat);
    fireball.position.copy(pos);

    const shockMat = new THREE.MeshBasicMaterial({
      color: ringColorHex,
      transparent: true,
      opacity: 0.9,
    });
    const shockwave = new THREE.Mesh(this.shockwaveGeo, shockMat);
    shockwave.position.copy(pos);
    shockwave.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

    this.scene.add(fireball, shockwave);
    this.explosionFXList.push({
      fireball,
      shockwave,
      age: 0,
      maxAge: 0.48,
      maxScale,
    });
  }

  private destroyEnemy(enemy: EnemyEntity) {
    enemy.destroyed = true;
    this.scene.remove(enemy.mesh);
    if (enemy.linkedBarrier) enemy.linkedBarrier.visible = false;

    // Combo multiplier streak
    if (this.comboTimer > 0) {
      this.state.combo = Math.min(5, this.state.combo + 1);
    } else {
      this.state.combo = 1;
    }
    this.comboTimer = 3.6;

    const earnedPoints = enemy.points * this.state.combo;
    this.state.score += earnedPoints;
    this.state.hits++;
    this.hitMarkerTimer = 0.18;

    const labelMap: Record<EnemyEntity['type'], string> = {
      drone: 'INTERCEPTOR',
      corvette: 'HEAVY CORVETTE',
      crystal: 'ENERGY CRYSTAL',
      mine: 'PLASMA MINE',
      guardian: 'TURRET',
      gate_core: 'GATE OPENED',
      boss_core: 'REACTOR CORE',
    };
    this.state.lastKillText =
      this.state.combo > 1
        ? `${labelMap[enemy.type]} +${earnedPoints} (${this.state.combo}x COMBO!)`
        : `${labelMap[enemy.type]} +${earnedPoints}`;
    this.killTextTimer = 1.65;

    starFoxAudio.playExplosion();
    const isBig = enemy.type === 'boss_core' || enemy.type === 'corvette' || enemy.type === 'gate_core';
    this.spawnExplosionFX(
      enemy.mesh.position,
      isBig ? 34 : 18,
      enemy.type === 'crystal' ? 0x00f5d4 : 0xff7b00
    );
    this.spawnExplosionParticles(
      enemy.mesh.position,
      isBig ? 42 : 24,
      enemy.type === 'crystal' ? 0x00f5d4 : 0xffaa00
    );

    if (enemy.type === 'mine') {
      this.enemies.forEach((other) => {
        if (!other.destroyed && other.mesh.position.distanceTo(enemy.mesh.position) < 46) {
          other.health -= 70;
          if (other.health <= 0) this.destroyEnemy(other);
        }
      });
    }

    if (enemy.type === 'boss_core') {
      const aliveCores = this.bossCores.filter((c) => !c.destroyed).length;
      if (aliveCores === 0 && this.dreadnoughtGroup) {
        this.state.score += 5000;
        this.state.lastKillText = 'DREADNOUGHT DESTROYED +5000!';
        this.killTextTimer = 3.0;
        this.cameraShakeIntensity = 0.75;
        this.spawnExplosionFX(this.dreadnoughtGroup.position, 85, 0x00f5d4);
        this.spawnExplosionParticles(this.dreadnoughtGroup.position, 65, 0xffaa00);
        this.scene.remove(this.dreadnoughtGroup);
        this.dreadnoughtGroup = null;
      }
    }
    this.notifyState();
  }

  private spawnExplosionParticles(pos: THREE.Vector3, count = 24, colorHex = 0xffaa00) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      const speed = 22 + Math.random() * 44;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      velocities[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i * 3 + 2] = Math.cos(phi) * speed;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: colorHex, size: 2.8, transparent: true, opacity: 1.0 });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.particlePools.push({ points, velocities, age: 0 });
  }

  // -------------------------------------------------------------
  // MAIN SIMULATION TICK (ZERO PER-FRAME REACT CHURN + REAL 3D COLLISIONS)
  // -------------------------------------------------------------
  public update(dt: number) {
    if (this.state.isGameOver) return;
    this.totalTime += dt;
    if (this.collisionGraceTimer > 0) this.collisionGraceTimer -= dt;
    if (this.hitMarkerTimer > 0) this.hitMarkerTimer -= dt;

    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0 && this.state.combo > 1) {
        this.state.combo = 1;
      }
    }
    if (this.killTextTimer > 0) {
      this.killTextTimer -= dt;
      if (this.killTextTimer <= 0 && this.state.lastKillText) {
        this.state.lastKillText = null;
      }
    }

    // 1. Speed & Boost/Brake + Sonic Boom Ignition FX
    let speedMult = 1.0;
    const activeBoost = this.isBoosting && !this.state.isOverheated;
    if (activeBoost && !this.wasBoosting) {
      // Trigger Sonic Boom Vapor Ring!
      this.sonicBoomAge = 0;
      this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, 0.14);
    }
    this.wasBoosting = activeBoost;

    if (activeBoost) {
      speedMult = 1.68;
      this.state.boostHeat = Math.min(1.0, this.state.boostHeat + dt * 0.22);
      if (this.state.boostHeat >= 1.0) this.state.isOverheated = true;
    } else {
      this.state.boostHeat = Math.max(0, this.state.boostHeat - dt * 0.24);
      if (this.state.boostHeat <= 0.2) this.state.isOverheated = false;
    }
    if (this.isBraking) speedMult = 0.55;

    this.currentSpeed = this.baseSpeed * speedMult;
    this.state.speed = Math.round(this.currentSpeed);
    starFoxAudio.setThrusterIntensity(speedMult, activeBoost);

    // 2. Spline Progress
    this.currentDistance += this.currentSpeed * dt;
    const progressU = Math.min(1.0, this.currentDistance / this.totalDistance);
    this.state.progressPercent = Math.round(progressU * 100);

    if (progressU < 0.16) this.state.zoneName = 'CORNERIA OUTER BAY';
    else if (progressU < 0.42) this.state.zoneName = 'WHISPERING FOREST & LAKE';
    else if (progressU < 0.70) this.state.zoneName = 'DRAGON CREST ALPINE PASS';
    else this.state.zoneName = 'DREADNOUGHT SHOWDOWN';

    if (progressU >= 0.992 && !this.state.isMissionComplete) {
      this.state.isMissionComplete = true;
      this.notifyState();
    }

    // Spline Coordinate Frame
    this.splineCurve.getPointAt(progressU, this.tmpRailPos);
    this.splineCurve.getTangentAt(progressU, this.tmpRailFwd).normalize();
    this.tmpRailRight.crossVectors(this.tmpRailFwd, this.tmpUpRef).normalize();
    this.tmpRailUp.crossVectors(this.tmpRailRight, this.tmpRailFwd).normalize();

    const turnDelta = this.tmpVec1.copy(this.tmpRailFwd).sub(this.prevTangent);
    const turnSide = turnDelta.dot(this.tmpRailRight) / Math.max(0.005, dt);
    this.prevTangent.copy(this.tmpRailFwd);
    const targetSplineBank = THREE.MathUtils.clamp(-turnSide * 0.45, -0.24, 0.24);
    this.currentSplineBank = THREE.MathUtils.lerp(this.currentSplineBank, targetSplineBank, dt * 3.0);

    // 3. Agile Flight Movement over Generous Corridor (No forced auto-center!)
    const maxLatSpeed = 62.0;
    const maxVertSpeed = 48.0;
    this.shipVelX = THREE.MathUtils.lerp(this.shipVelX, this.inputYawRoll * maxLatSpeed, dt * 13.0);
    this.shipVelY = THREE.MathUtils.lerp(this.shipVelY, this.inputPitch * maxVertSpeed, dt * 13.0);

    this.shipLocalPos.x = THREE.MathUtils.clamp(this.shipLocalPos.x + this.shipVelX * dt, -65, 65);
    this.shipLocalPos.y = THREE.MathUtils.clamp(this.shipLocalPos.y + this.shipVelY * dt, -22, 52);

    const worldShipPos = this.tmpVec2
      .copy(this.tmpRailPos)
      .addScaledVector(this.tmpRailRight, this.shipLocalPos.x)
      .addScaledVector(this.tmpRailUp, this.shipLocalPos.y);

    // 4. REAL TERRAIN & OCEAN FLOOR COLLISION!
    let minWorldY = this.WATER_Y + 3.2;
    const halfWorld = 400 * this.WORLD_SCALE_XZ - 5;
    if (Math.abs(worldShipPos.x) < halfWorld && Math.abs(worldShipPos.z) < halfWorld) {
      const groundH = this.getHyruleHeight(worldShipPos.x, worldShipPos.z);
      minWorldY = Math.max(minWorldY, groundH + 4.0);
    }
    if (worldShipPos.y < minWorldY) {
      const pushUp = minWorldY - worldShipPos.y;
      if (pushUp > 1.2 && this.collisionGraceTimer <= 0) {
        this.collisionGraceTimer = 0.75;
        this.takePlayerDamage(10);
        this.shipVelY = Math.max(this.shipVelY, 24);
      }
      worldShipPos.y = minWorldY;
      this.shipLocalPos.y += pushUp;
    }

    // 5. REAL SOLID 3D COLLISION WITH TOWERS, CARRIERS, ARCH PILLARS & BUILDINGS!
    const shipRadius = 3.2;
    for (const col of this.colliders) {
      const dy = Math.abs(worldShipPos.y - col.position.y);
      if (dy < col.halfHeight + shipRadius) {
        const dx = worldShipPos.x - col.position.x;
        const dz = worldShipPos.z - col.position.z;
        const distXZ = Math.hypot(dx, dz);
        const minDist = col.radius + shipRadius;

        if (distXZ < minDist && distXZ > 0.001) {
          const push = minDist - distXZ + 1.5;
          const nx = dx / distXZ;
          const nz = dz / distXZ;
          worldShipPos.x += nx * push;
          worldShipPos.z += nz * push;

          const relX = this.tmpVec3.set(nx, 0, nz).dot(this.tmpRailRight);
          this.shipLocalPos.x += relX * push;
          this.shipVelX = Math.sign(relX || 1) * 32;

          if (this.collisionGraceTimer <= 0) {
            this.collisionGraceTimer = 0.75;
            this.spawnExplosionParticles(worldShipPos, 16, 0xff7b00);
            this.takePlayerDamage(16);
          }
        }
      }
    }

    this.shipGroup.position.copy(worldShipPos);

    this.tmpBasis.makeBasis(this.tmpRailRight, this.tmpRailUp, this.tmpVec3.copy(this.tmpRailFwd).negate());
    this.shipGroup.quaternion.setFromRotationMatrix(this.tmpBasis);

    // 6. Nose Yaw/Pitch + Banking + Barrel Roll Deflector Vortex
    const targetYaw = -this.inputYawRoll * THREE.MathUtils.degToRad(22.0);
    const targetPitch = this.inputPitch * THREE.MathUtils.degToRad(24.0);
    const targetRoll = -this.inputYawRoll * THREE.MathUtils.degToRad(58.0) + this.currentSplineBank * 0.5;

    this.smoothedYaw = THREE.MathUtils.lerp(this.smoothedYaw, targetYaw, dt * 13.0);
    this.smoothedPitch = THREE.MathUtils.lerp(this.smoothedPitch, targetPitch, dt * 13.0);

    if (this.isBarrelRolling) {
      this.barrelRollTimer -= dt;
      const rollProgress = 1.0 - this.barrelRollTimer / 0.54;
      this.smoothedRoll = rollProgress * Math.PI * 2 * (this.barrelRollDirection === 'left' ? 1 : -1);
      this.barrelRollRing.visible = true;
      this.barrelRollRing.rotation.z = this.smoothedRoll * 1.5;
      (this.barrelRollRing.material as THREE.MeshBasicMaterial).opacity =
        Math.sin(rollProgress * Math.PI) * 0.75;
      if (this.barrelRollTimer <= 0) {
        this.isBarrelRolling = false;
        this.barrelRollRing.visible = false;
      }
    } else {
      this.smoothedRoll = THREE.MathUtils.lerp(this.smoothedRoll, targetRoll, dt * 12.0);
      this.barrelRollRing.visible = false;
    }

    this.shipMesh.rotation.order = 'YXZ';
    this.shipMesh.rotation.set(this.smoothedPitch, this.smoothedYaw, this.smoothedRoll);

    if (this.barrelRollCooldown > 0) this.barrelRollCooldown -= dt;

    // Sonic Boom Vapor Shock-Ring Animation
    if (this.sonicBoomAge < 0.42) {
      this.sonicBoomAge += dt;
      const p = this.sonicBoomAge / 0.42;
      this.sonicBoomRing.visible = true;
      this.sonicBoomRing.scale.setScalar(0.8 + p * 3.8);
      this.sonicBoomRing.position.z = p * 8.5;
      (this.sonicBoomRing.material as THREE.MeshBasicMaterial).opacity = (1.0 - p) * 0.72;
    } else {
      this.sonicBoomRing.visible = false;
    }

    // Muzzle Flash Fade
    if (this.muzzleFlashTimer > 0) {
      this.muzzleFlashTimer -= dt;
      const op = Math.max(0, this.muzzleFlashTimer / 0.06);
      this.muzzleFlashes.forEach((mf) => {
        (mf.material as THREE.MeshBasicMaterial).opacity = op;
        mf.scale.setScalar(0.6 + op * 0.8);
      });
    } else {
      this.muzzleFlashes.forEach((mf) => {
        (mf.material as THREE.MeshBasicMaterial).opacity = 0;
      });
    }

    // 7. Flaps, Plasma Afterburners & Boost Color Shift
    const flapAngle = this.isBraking ? THREE.MathUtils.degToRad(40.0) : 0;
    this.leftFlap.rotation.x = THREE.MathUtils.lerp(this.leftFlap.rotation.x, flapAngle, dt * 12.0);
    this.rightFlap.rotation.x = THREE.MathUtils.lerp(this.rightFlap.rotation.x, flapAngle, dt * 12.0);

    const flameScale = activeBoost ? 3.1 : this.isBraking ? 0.35 : 1.1;
    const flameHex = activeBoost ? 0xff8800 : 0x00f0ff;
    this.thrusterFlames.forEach((f) => {
      f.scale.set(1.0 + Math.random() * 0.14, 1.0 + Math.random() * 0.14, flameScale);
      (f.material as THREE.MeshBasicMaterial).color.setHex(flameHex);
    });
    this.thrusterCores.forEach((c) => {
      c.scale.set(1.0, 1.0, flameScale * 0.85);
    });
    this.wingtipTrailMat.color.setHex(activeBoost ? 0xf59e0b : 0x00e5ff);

    // 8. Firing & Charge Shot
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.isFiring || this.autoFire) this.fireWeapon(true);

    if (this.isFiring) {
      this.chargeTime = Math.min(this.MAX_CHARGE_TIME, this.chargeTime + dt);
      const ratio = this.chargeTime / this.MAX_CHARGE_TIME;
      const s = 0.5 + ratio * 2.2;
      this.chargeSphere.scale.set(s, s, s);
      (this.chargeSphere.material as THREE.MeshBasicMaterial).opacity = ratio * 0.85;
      this.chargeRing.scale.setScalar(0.6 + ratio * 1.9);
      this.chargeRing.rotation.z += dt * 10.0;
      this.chargeRing.rotation.x += dt * 6.0;
      (this.chargeRing.material as THREE.MeshBasicMaterial).opacity = ratio > 0.25 ? ratio * 0.9 : 0;
      if (ratio > 0.25) starFoxAudio.playChargeHum(ratio);
    } else if (this.chargeTime >= 0.72) {
      this.releaseChargeShot();
      this.chargeTime = 0;
    } else {
      this.chargeTime = 0;
      (this.chargeSphere.material as THREE.MeshBasicMaterial).opacity = 0;
      (this.chargeRing.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    // 9. Smooth Chase Camera
    const targetCamPos = this.tmpVec3
      .copy(worldShipPos)
      .sub(this.tmpVec1.copy(this.tmpRailFwd).multiplyScalar(17.5))
      .addScaledVector(this.tmpRailUp, 5.2)
      .addScaledVector(this.tmpRailRight, -this.inputYawRoll * 2.5);

    this.camera.position.lerp(targetCamPos, dt * 12.0);
    const camLookTarget = this.tmpVec1
      .copy(worldShipPos)
      .addScaledVector(this.tmpRailFwd, 65)
      .addScaledVector(this.tmpRailRight, this.inputYawRoll * 7.5)
      .addScaledVector(this.tmpRailUp, this.inputPitch * 6.0);
    this.camera.lookAt(camLookTarget);

    this.smoothedCamRoll = THREE.MathUtils.lerp(
      this.smoothedCamRoll,
      this.currentSplineBank + (this.isBarrelRolling ? 0 : this.smoothedRoll * 0.2),
      dt * 7.5
    );
    this.camera.rotation.z += this.smoothedCamRoll;

    const targetFov = activeBoost ? 86.0 : this.isBraking ? 62.0 : 72.0;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 6.0);
    this.camera.updateProjectionMatrix();

    if (this.cameraShakeIntensity > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShakeIntensity * 2;
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShakeIntensity * 2;
      this.cameraShakeIntensity = Math.max(0, this.cameraShakeIntensity - dt * 1.6);
    }

    // 10. Direct 60FPS HUD Reticle Callback (Zero React re-render overhead!)
    this.shipMesh.getWorldQuaternion(this.tmpQuat);
    const { aimDir, lockedEnemy } = this.getShipAimDirection(this.tmpQuat, worldShipPos);
    this.state.isTargetLocked = !!lockedEnemy;

    if (this.onReticleUpdate) {
      const pNear = this.tmpVec1.copy(worldShipPos).addScaledVector(aimDir, 44).project(this.camera);
      const pFar = this.tmpVec3.copy(worldShipPos).addScaledVector(aimDir, 120).project(this.camera);
      this.onReticleUpdate(
        THREE.MathUtils.clamp((pNear.x + 1) * 50, 8, 92),
        THREE.MathUtils.clamp((1 - pNear.y) * 50, 10, 90),
        THREE.MathUtils.clamp((pFar.x + 1) * 50, 8, 92),
        THREE.MathUtils.clamp((1 - pFar.y) * 50, 10, 90),
        this.state.isTargetLocked,
        this.hitMarkerTimer > 0
      );
    }

    // 11. Wingmen & Wingtip Trails
    this.wingmen.forEach((w) => {
      const wTarget = this.tmpVec1
        .copy(this.tmpRailPos)
        .addScaledVector(this.tmpRailRight, w.offset.x + Math.sin(this.totalTime * 1.2 + w.phase) * 5)
        .addScaledVector(this.tmpRailUp, w.offset.y + Math.cos(this.totalTime * 1.5 + w.phase) * 3)
        .addScaledVector(this.tmpRailFwd, -w.offset.z);
      w.group.position.lerp(wTarget, dt * 5.0);
      w.group.quaternion.setFromRotationMatrix(this.tmpBasis);
    });

    this.shipMesh.updateMatrixWorld();
    const leftTip = new THREE.Vector3(-5.0, 0.45, 1.9).applyMatrix4(this.shipMesh.matrixWorld);
    const rightTip = new THREE.Vector3(5.0, 0.45, 1.9).applyMatrix4(this.shipMesh.matrixWorld);
    this.wingtipPointsLeft.unshift(leftTip);
    this.wingtipPointsRight.unshift(rightTip);
    if (this.wingtipPointsLeft.length > this.TRAIL_LENGTH) this.wingtipPointsLeft.pop();
    if (this.wingtipPointsRight.length > this.TRAIL_LENGTH) this.wingtipPointsRight.pop();

    const leftArr = (this.wingtipTrailGeoLeft.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const rightArr = (this.wingtipTrailGeoRight.attributes.position as THREE.BufferAttribute).array as Float32Array;
    for (let i = 0; i < this.TRAIL_LENGTH; i++) {
      const pL = this.wingtipPointsLeft[i] || leftTip;
      const pR = this.wingtipPointsRight[i] || rightTip;
      leftArr[i * 3 + 0] = pL.x;
      leftArr[i * 3 + 1] = pL.y;
      leftArr[i * 3 + 2] = pL.z;
      rightArr[i * 3 + 0] = pR.x;
      rightArr[i * 3 + 1] = pR.y;
      rightArr[i * 3 + 2] = pR.z;
    }
    this.wingtipTrailGeoLeft.attributes.position.needsUpdate = true;
    this.wingtipTrailGeoRight.attributes.position.needsUpdate = true;

    // 12. Lightweight World Updates (No CPU Foliage Bottleneck!)
    this.terrainManager.updateTime(this.totalTime);
    this.waterManager.update(this.totalTime, dt);
    this.skyLighting.update(dt, worldShipPos);
    if (this.outerOceanMaterial) this.outerOceanMaterial.uniforms.uTime.value = this.totalTime;
    this.windmills.forEach((rotor) => {
      rotor.rotation.z += dt * 1.2;
    });

    const nearWater = worldShipPos.y <= this.WATER_Y + 12.0;
    this.waterSprayParticles.visible = nearWater;
    if (nearWater) {
      this.waterSprayParticles.position.set(worldShipPos.x, this.WATER_Y + 0.5, worldShipPos.z);
    }

    if (this.speedLinesMesh) {
      (this.speedLinesMesh.material as THREE.LineBasicMaterial).opacity = activeBoost ? 0.78 : 0.22;
      this.speedLinesMesh.rotation.z += dt * (activeBoost ? 3.2 : 0.8);
    }

    // 13. Frame-Driven 3D Fireball + Shockwave Explosion FX Tick
    for (let i = this.explosionFXList.length - 1; i >= 0; i--) {
      const fx = this.explosionFXList[i];
      fx.age += dt;
      const p = Math.min(1.0, fx.age / fx.maxAge);

      const fbScale = fx.maxScale * 0.45 * Math.sin(p * Math.PI);
      fx.fireball.scale.setScalar(Math.max(0.1, fbScale));
      const fbMat = fx.fireball.material as THREE.MeshBasicMaterial;
      if (p < 0.3) fbMat.color.setHex(0xffffff);
      else if (p < 0.65) fbMat.color.setHex(0xff8800);
      else fbMat.color.setHex(0xef4444);
      fbMat.opacity = Math.max(0, 1.0 - p * 1.15);

      fx.shockwave.scale.setScalar(1.0 + p * fx.maxScale);
      (fx.shockwave.material as THREE.MeshBasicMaterial).opacity = Math.max(0, (1.0 - p) * 0.88);

      if (fx.age >= fx.maxAge) {
        this.scene.remove(fx.fireball, fx.shockwave);
        (fx.fireball.material as THREE.Material).dispose();
        (fx.shockwave.material as THREE.Material).dispose();
        this.explosionFXList.splice(i, 1);
      }
    }

    // Explosion Particle Pool Tick
    for (let i = this.particlePools.length - 1; i >= 0; i--) {
      const pp = this.particlePools[i];
      pp.age += dt;
      const attr = pp.points.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let j = 0; j < arr.length; j += 3) {
        arr[j] += pp.velocities[j] * dt;
        arr[j + 1] += pp.velocities[j + 1] * dt;
        arr[j + 2] += pp.velocities[j + 2] * dt;
      }
      attr.needsUpdate = true;
      (pp.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1.0 - pp.age * 1.55);
      if (pp.age >= 0.68) {
        this.scene.remove(pp.points);
        pp.points.geometry.dispose();
        (pp.points.material as THREE.Material).dispose();
        this.particlePools.splice(i, 1);
      }
    }

    // 14. Shield Bubble
    if (this.shieldActiveTimer > 0) {
      this.shieldActiveTimer -= dt;
      this.shieldBubble.visible = true;
      this.shieldBubble.rotation.y += dt * 3.5;
      (this.shieldBubble.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, this.shieldActiveTimer * 2.0);
      this.state.shieldActive = true;
    } else {
      this.shieldBubble.visible = false;
      this.state.shieldActive = false;
    }

    // 15. Collectibles
    this.archesAndRings.forEach((ring) => {
      if (!ring.collected && ring.position.distanceTo(worldShipPos) < ring.radius + 5.5) {
        ring.collected = true;
        ring.mesh.visible = false;
        starFoxAudio.playRingCollect();
        this.spawnExplosionFX(ring.position, 16, 0x00f5d4);

        if (ring.type === 'boost_arch') {
          this.state.score += 1000;
          this.state.boostHeat = 0;
          this.state.isOverheated = false;
          this.state.lastKillText = 'COOLANT ARCH +1000';
          this.killTextTimer = 1.4;
        } else if (ring.type === 'shield_ring') {
          this.state.shield = Math.min(this.state.maxShield, this.state.shield + 35);
          this.shieldActiveTimer = 4.0;
          this.state.score += 400;
          this.state.lastKillText = 'SHIELD RECHARGED +35%';
          this.killTextTimer = 1.4;
        } else if (ring.type === 'weapon_pod') {
          this.state.weaponLevel = Math.min(3, this.state.weaponLevel + 1) as 1 | 2 | 3;
          this.state.score += 800;
          this.state.lastKillText = `HYPER LASER LV.${this.state.weaponLevel}!`;
          this.killTextTimer = 1.8;
        } else {
          this.state.score += 500;
        }
        this.notifyState();
      }
    });

    // 16. Boss Bar & Enemy Update + SOLID ENEMY RAMMING COLLISION
    let activeBossHp = 0;
    let maxBossHp = 0;
    this.bossCores.forEach((c) => {
      maxBossHp += c.maxHealth;
      if (!c.destroyed) activeBossHp += c.health;
    });
    this.state.bossHealth =
      progressU >= 0.70 && this.dreadnoughtGroup && maxBossHp > 0
        ? Math.round((activeBossHp / maxBossHp) * 100)
        : null;

    this.enemies.forEach((enemy) => {
      if (enemy.destroyed) return;

      if (enemy.hitFlashTimer && enemy.hitFlashTimer > 0) {
        enemy.hitFlashTimer -= dt;
        const s = enemy.hitFlashTimer > 0 ? 1.12 : 1.0;
        enemy.mesh.scale.setScalar(
          (enemy.type === 'drone' ? 1.35 : enemy.type === 'corvette' ? 1.3 : enemy.type === 'guardian' ? 1.5 : 1.0) * s
        );
      }

      if (enemy.type === 'crystal' || enemy.type === 'mine' || enemy.type === 'gate_core' || enemy.type === 'boss_core') {
        enemy.mesh.rotation.y += dt * 1.6;
      }

      if (enemy.moveAmpX > 0 || enemy.moveAmpY > 0) {
        enemy.mesh.position.set(
          enemy.basePos.x + Math.sin(this.totalTime * 1.2 + enemy.movePhase) * enemy.moveAmpX,
          enemy.basePos.y + Math.cos(this.totalTime * 1.0 + enemy.movePhase) * enemy.moveAmpY,
          enemy.basePos.z
        );
      }

      const distToPlayer = enemy.mesh.position.distanceTo(worldShipPos);
      if (distToPlayer < enemy.bodyRadius + shipRadius) {
        if (enemy.type === 'crystal') {
          this.destroyEnemy(enemy);
          return;
        } else {
          this.destroyEnemy(enemy);
          if (this.collisionGraceTimer <= 0) {
            this.collisionGraceTimer = 0.75;
            this.takePlayerDamage(enemy.type === 'mine' ? 20 : 15);
          }
          return;
        }
      }

      if (distToPlayer < 450 && distToPlayer > 35 && enemy.fireCooldown < 500) {
        enemy.fireCooldown -= dt;
        if (enemy.fireCooldown <= 0) {
          enemy.fireCooldown = enemy.type === 'drone' ? 2.2 : enemy.type === 'guardian' ? 2.5 : 1.9;
          this.spawnHostileLaser(enemy.mesh.position, worldShipPos);
        }
      }
    });

    // 17. Projectiles Update (with Homing Assist & Charge AoE Blast!)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.lifetime -= dt;

      if (p.isPlayer && p.homingTarget && !p.homingTarget.destroyed) {
        const toTarget = this.tmpVec1.subVectors(p.homingTarget.mesh.position, p.position).normalize();
        const speed = p.velocity.length();
        p.velocity.normalize().lerp(toTarget, dt * 6.5).normalize().multiplyScalar(speed);
        p.mesh.lookAt(p.position.x + p.velocity.x, p.position.y + p.velocity.y, p.position.z + p.velocity.z);
      }

      p.position.addScaledVector(p.velocity, dt);

      if (p.isPlayer) {
        for (const enemy of this.enemies) {
          if (!enemy.destroyed && p.position.distanceTo(enemy.mesh.position) < (p.isChargeShot ? 20 : enemy.hitRadius)) {
            enemy.health -= p.damage;
            enemy.hitFlashTimer = 0.09;
            this.hitMarkerTimer = 0.14;
            p.lifetime = 0;

            if (p.isChargeShot) {
              // Nova Charge Shot triggers an AoE splash shockwave!
              this.spawnExplosionFX(p.position, 32, 0x38bdf8);
              this.enemies.forEach((other) => {
                if (!other.destroyed && other !== enemy && other.mesh.position.distanceTo(p.position) < 42) {
                  other.health -= 110;
                  if (other.health <= 0) this.destroyEnemy(other);
                }
              });
            }

            if (enemy.health <= 0) {
              this.destroyEnemy(enemy);
            } else {
              this.spawnExplosionParticles(p.position, 8, 0x38bdf8);
            }
            break;
          }
        }
      } else {
        if (p.position.distanceTo(worldShipPos) < 4.5) {
          p.lifetime = 0;
          if (this.isBarrelRolling) {
            starFoxAudio.playBarrelRoll();
          } else if (this.shieldActiveTimer > 0) {
            starFoxAudio.playHit();
            this.cameraShakeIntensity = 0.16;
          } else {
            this.takePlayerDamage(p.damage);
          }
        }
      }

      if (p.lifetime <= 0) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }

    // 18. Dialogue
    for (const d of this.dialogueEvents) {
      if (!d.triggered && progressU >= d.u) {
        d.triggered = true;
        this.state.dialogue = { speaker: d.speaker, text: d.text, visible: true };
        starFoxAudio.playRadioBeep();
        this.notifyState();
        const tid = window.setTimeout(() => {
          if (this.state.dialogue?.text === d.text) {
            this.state.dialogue = null;
            this.notifyState();
          }
        }, d.duration * 1000);
        this.activeIntervals.push(tid);
        break;
      }
    }
  }

  private spawnHostileLaser(from: THREE.Vector3, to: THREE.Vector3) {
    const laserMesh = new THREE.Mesh(this.laserGeo, this.enemyLaserMat);
    laserMesh.position.copy(from);
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    laserMesh.lookAt(to);
    this.scene.add(laserMesh);
    this.projectiles.push({
      mesh: laserMesh,
      position: laserMesh.position,
      velocity: dir.multiplyScalar(115),
      isPlayer: false,
      damage: 12,
      lifetime: 4.0,
    });
  }

  public takePlayerDamage(damage: number) {
    if (this.isBarrelRolling || this.shieldActiveTimer > 0) return;
    this.state.shield = Math.max(0, this.state.shield - damage);
    this.cameraShakeIntensity = 0.35;
    starFoxAudio.playHit();
    this.shieldActiveTimer = 0.65;

    if (this.state.shield <= 0) {
      this.state.isGameOver = true;
      this.spawnExplosionFX(this.shipGroup.position, 42, 0xef4444);
      this.spawnExplosionParticles(this.shipGroup.position, 50, 0xff5500);
      starFoxAudio.playExplosion();
    }
    this.notifyState();
  }

  private notifyState() {
    if (this.onStateUpdate) {
      this.onStateUpdate({ ...this.state });
    }
  }

  // -------------------------------------------------------------
  // RENDER & LIFECYCLE
  // -------------------------------------------------------------
  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();
    starFoxAudio.init();
    starFoxAudio.resume();
    starFoxAudio.startMusic();

    const loop = () => {
      if (!this.isRunning) return;
      const dt = Math.min(0.05, this.clock.getDelta());
      this.update(dt);
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      // Throttle React state updates to 8 Hz (~125ms) to keep mobile JS thread silky smooth!
      if (this.totalTime - this.lastNotifyTime > 0.125) {
        this.lastNotifyTime = this.totalTime;
        this.notifyState();
      }
      this.animationFrameId = requestAnimationFrame(loop);
    };

    this.animationFrameId = requestAnimationFrame(loop);
  }

  public stop() {
    this.isRunning = false;
    starFoxAudio.stopMusic();
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  public resize(width: number, height: number) {
    if (!this.camera || !this.renderer) return;
    const w = Math.max(width, 100);
    const h = Math.max(height, 100);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) this.composer.setSize(w, h);
  }

  public restart() {
    this.currentDistance = 0;
    this.shipLocalPos.set(0, 24, 0);
    this.shipVelX = 0;
    this.shipVelY = 0;
    this.shieldActiveTimer = 0;
    this.collisionGraceTimer = 0;
    this.comboTimer = 0;
    this.killTextTimer = 0;
    this.hitMarkerTimer = 0;
    this.state = {
      shield: 100,
      maxShield: 100,
      boostHeat: 0,
      isOverheated: false,
      smartBombs: 3,
      score: 0,
      hits: 0,
      speed: 58,
      progressPercent: 0,
      weaponLevel: 1,
      zoneName: 'CORNERIA OUTER BAY',
      bossHealth: null,
      isTargetLocked: false,
      dialogue: null,
      isMissionComplete: false,
      isGameOver: false,
      shieldActive: false,
      combo: 1,
      lastKillText: null,
    };
    this.dialogueEvents.forEach((d) => (d.triggered = false));
    this.archesAndRings.forEach((r) => {
      r.collected = false;
      r.mesh.visible = true;
    });
    this.enemies.forEach((e) => {
      e.destroyed = false;
      e.health = e.maxHealth;
      if (!e.mesh.parent) this.scene.add(e.mesh);
      if (e.linkedBarrier) e.linkedBarrier.visible = true;
    });
    if (this.dreadnoughtGroup && !this.dreadnoughtGroup.parent) {
      this.scene.add(this.dreadnoughtGroup);
    }
    this.notifyState();
  }

  public dispose() {
    this.stop();
    this.activeIntervals.forEach((id) => {
      clearInterval(id);
      clearTimeout(id);
    });
    starFoxAudio.dispose();
    this.renderer.dispose();
  }
}
