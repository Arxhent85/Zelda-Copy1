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
import { EnemyManager } from '../Enemies';
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

export interface TargetProjection {
  id: number;
  x: number;
  y: number;
  hpRatio: number;
  distance: number;
  isLocked: boolean;
  isPriority: boolean;
}

interface ColliderItem {
  position: THREE.Vector3;
  radius: number;
  halfHeight: number;
  type: 'tower' | 'arch_pillar' | 'carrier' | 'dreadnought' | 'building';
}

interface EnemyEntity {
  id: number;
  mesh: THREE.Group;
  type: 'drone' | 'corvette' | 'crystal' | 'mine' | 'guardian' | 'talus' | 'rupee_bonus' | 'gate_core' | 'boss_core';
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
  baseScale?: number;
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

  // World Scaling: Expansive 1920m x 1920m Hyrule Basin with sculpted 1.32x vertical contrast
  private readonly WORLD_SCALE_XZ = 2.4;
  private readonly WORLD_SCALE_Y = 1.32;
  private readonly WATER_Y = TerrainManager.WATER_LEVEL * 1.32; // ~1.98m

  // Reused Zelda World Modules
  private terrainManager!: TerrainManager;
  private waterManager!: WaterManager;
  private skyLighting!: SkyAndLightingManager;
  private collectibleManager!: CollectibleManager;
  private buildingSystem!: BuildingSystem;
  private enemyManager!: EnemyManager;
  private windmills: THREE.Object3D[] = [];
  private navBeacons: THREE.Mesh[] = [];

  // Extended Outer Ocean
  private outerOceanMaterial!: THREE.ShaderMaterial;

  // Rail & Spline Path (~7800m wide scenic circuit with clear valley sightlines)
  private splineCurve!: THREE.CatmullRomCurve3;
  public currentDistance = 0;
  private totalDistance = 7800;
  private baseSpeed = 58.0;
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

  // 3D Volumetric Wingtip Contrail Ribbon Meshes (replaces 1px WebGL lines!)
  private ribbonGeoLeft!: THREE.BufferGeometry;
  private ribbonGeoRight!: THREE.BufferGeometry;
  private ribbonMat!: THREE.MeshBasicMaterial;
  private wingtipPointsLeft: THREE.Vector3[] = [];
  private wingtipPointsRight: THREE.Vector3[] = [];
  private readonly TRAIL_LENGTH = 24;

  // Procedural Canvas Textures
  private glowSpriteTex!: THREE.CanvasTexture;
  private arwingHullTex!: THREE.CanvasTexture;
  private arwingBumpTex!: THREE.CanvasTexture;
  private stoneBrickTex!: THREE.CanvasTexture;
  private roofShingleTex!: THREE.CanvasTexture;

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
  private nextEnemyId = 1;

  public onStateUpdate?: (state: StarFoxState) => void;
  public onReticleUpdate?: (
    nearX: number,
    nearY: number,
    farX: number,
    farY: number,
    locked: boolean,
    hitConfirmed: boolean
  ) => void;
  public onTargetsUpdate?: (targets: TargetProjection[]) => void;
  public onDamageFlash?: () => void;

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
  private readonly tmpVec4 = new THREE.Vector3();
  private readonly tmpRailPos = new THREE.Vector3();
  private readonly tmpRailFwd = new THREE.Vector3();
  private readonly tmpRailRight = new THREE.Vector3();
  private readonly tmpRailUp = new THREE.Vector3();
  private readonly tmpUpRef = new THREE.Vector3(0, 1, 0);
  private readonly tmpBasis = new THREE.Matrix4();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly projectedTargetsBuffer: TargetProjection[] = [];

  private dialogueEvents = [
    {
      u: 0.01,
      speaker: 'COMMANDER VANCE',
      text: 'All wings! Sweep through Corneria Harbor Gate into Hyrule Bay!',
      duration: 4.0,
      triggered: false,
    },
    {
      u: 0.19,
      speaker: 'FALCO',
      text: 'Passing Kakariko Windmill & Hyrule Citadel! Stay sharp for interceptors!',
      duration: 3.8,
      triggered: false,
    },
    {
      u: 0.43,
      speaker: 'SLIPPY',
      text: 'Ancient Guardian Ruins below! Blast the Sheikah turrets & unlock the Gate!',
      duration: 3.8,
      triggered: false,
    },
    {
      u: 0.62,
      speaker: 'PEPPY',
      text: 'Ascending Dragon Crest Pass — do a Barrel Roll to deflect incoming plasma!',
      duration: 3.8,
      triggered: false,
    },
    {
      u: 0.78,
      speaker: 'COMMANDER VANCE',
      text: 'Dreadnought Flagship spotted! Destroy all 3 Reactor Cores!',
      duration: 4.5,
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
    this.initTextures();
    this.initSharedAssets();
    this.createSpline();
    this.createHyruleIntegratedWorld();
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
  // INITIALIZATION (HIGH-CONTRAST ACES PBR + CRISP REFLECTIONS)
  // -------------------------------------------------------------
  private initThree() {
    this.scene = new THREE.Scene();

    const width = Math.max(this.canvas.clientWidth || window.innerWidth, 100);
    const height = Math.max(this.canvas.clientHeight || window.innerHeight, 100);

    this.camera = new THREE.PerspectiveCamera(72.0, width / height, 0.8, 14000);
    this.camera.position.set(0, 30, 1360);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: !this.isMobile,
      powerPreference: 'high-performance',
      precision: 'highp',
    });
    this.renderer.setSize(width, height, false);

    const pixelRatio = this.isMobile
      ? Math.min(window.devicePixelRatio || 1, 1.45)
      : Math.min(window.devicePixelRatio || 1, 1.85);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;

    // High-contrast Sky + Deep Ocean PMREM Environment Map so brushed armor & chrome gleam cleanly
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
            vec3 skyTop = vec3(0.08, 0.28, 0.62);
            vec3 horizon = vec3(0.58, 0.80, 0.96);
            vec3 ground = vec3(0.06, 0.16, 0.24);
            vec3 col = vPos.y >= 0.0
              ? mix(horizon, skyTop, pow(vPos.y, 0.55))
              : mix(horizon * 0.55, ground, pow(-vPos.y, 0.45));
            vec3 sunDir = normalize(vec3(0.55, 0.72, 0.42));
            float sunAmt = max(0.0, dot(vPos, sunDir));
            col += vec3(1.0, 0.94, 0.78) * pow(sunAmt, 24.0) * 1.4;
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
      // Fallback
    }

    this.renderer.shadowMap.enabled = !this.isMobile;
    if (!this.isMobile) {
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      try {
        this.composer = new EffectComposer(this.renderer);
        this.composer.setPixelRatio(pixelRatio);
        this.composer.addPass(new RenderPass(this.scene, this.camera));
        this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(width, height), 0.34, 0.32, 0.86));
        this.composer.addPass(new OutputPass());
      } catch {
        this.composer = null;
      }
    } else {
      this.composer = null;
    }
  }

  private initTextures() {
    // 1. Soft Radial Glow Sprite (sparks, exhaust halos, water mist)
    const gCanvas = document.createElement('canvas');
    gCanvas.width = 64;
    gCanvas.height = 64;
    const gCtx = gCanvas.getContext('2d')!;
    const grad = gCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0.0, 'rgba(255,255,255,1.0)');
    grad.addColorStop(0.28, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.65, 'rgba(255,255,255,0.22)');
    grad.addColorStop(1.0, 'rgba(255,255,255,0.0)');
    gCtx.fillStyle = grad;
    gCtx.fillRect(0, 0, 64, 64);
    this.glowSpriteTex = new THREE.CanvasTexture(gCanvas);

    // 2. Aerospace Titanium Panel-Line Hull Texture + Matching Bump Map (Eliminates toy-plastic look!)
    const hCanvas = document.createElement('canvas');
    hCanvas.width = 512;
    hCanvas.height = 512;
    const hCtx = hCanvas.getContext('2d')!;

    const bCanvas = document.createElement('canvas');
    bCanvas.width = 512;
    bCanvas.height = 512;
    const bCtx = bCanvas.getContext('2d')!;

    // Metallic titanium panels with subtle tonal variation
    hCtx.fillStyle = '#dde5ef';
    hCtx.fillRect(0, 0, 512, 512);
    bCtx.fillStyle = '#808080';
    bCtx.fillRect(0, 0, 512, 512);

    const panels = [
      [8, 8, 240, 120, '#cfd9e6'],
      [256, 8, 248, 120, '#e6edf6'],
      [8, 136, 160, 190, '#d5dfec'],
      [176, 136, 160, 190, '#e2e9f3'],
      [344, 136, 160, 190, '#c8d4e3'],
      [8, 334, 240, 170, '#dce4ef'],
      [256, 334, 248, 170, '#cfdbe8'],
    ] as const;

    panels.forEach(([x, y, w, h, col]) => {
      hCtx.fillStyle = col;
      hCtx.fillRect(x, y, w, h);
      hCtx.strokeStyle = '#475569';
      hCtx.lineWidth = 3;
      hCtx.strokeRect(x, y, w, h);

      bCtx.strokeStyle = '#262626';
      bCtx.lineWidth = 4;
      bCtx.strokeRect(x, y, w, h);

      // Corner rivets
      hCtx.fillStyle = '#64748b';
      bCtx.fillStyle = '#c8c8c8';
      [
        [x + 8, y + 8],
        [x + w - 8, y + 8],
        [x + 8, y + h - 8],
        [x + w - 8, y + h - 8],
      ].forEach(([rx, ry]) => {
        hCtx.fillRect(rx - 2, ry - 2, 4, 4);
        bCtx.fillRect(rx - 2, ry - 2, 4, 4);
      });
    });

    // Squadron cobalt blue stripes & hazard louvers
    hCtx.fillStyle = '#1d4ed8';
    hCtx.fillRect(0, 215, 512, 22);
    hCtx.fillStyle = '#38bdf8';
    hCtx.fillRect(0, 241, 512, 6);

    // Dark intake cooling louver slots
    for (let y = 370; y < 445; y += 12) {
      hCtx.fillStyle = '#1e293b';
      hCtx.fillRect(42, y, 74, 6);
      hCtx.fillRect(396, y, 74, 6);
      bCtx.fillStyle = '#141414';
      bCtx.fillRect(42, y, 74, 6);
      bCtx.fillRect(396, y, 74, 6);
    }

    this.arwingHullTex = new THREE.CanvasTexture(hCanvas);
    this.arwingHullTex.wrapS = THREE.RepeatWrapping;
    this.arwingHullTex.wrapT = THREE.RepeatWrapping;
    this.arwingHullTex.colorSpace = THREE.SRGBColorSpace;

    this.arwingBumpTex = new THREE.CanvasTexture(bCanvas);
    this.arwingBumpTex.wrapS = THREE.RepeatWrapping;
    this.arwingBumpTex.wrapT = THREE.RepeatWrapping;

    // 3. Hyrule Ashlar Stone Masonry Texture (upgrades all Zelda Castle/Ruins walls)
    const sCanvas = document.createElement('canvas');
    sCanvas.width = 256;
    sCanvas.height = 256;
    const sCtx = sCanvas.getContext('2d')!;
    sCtx.fillStyle = '#5a6573';
    sCtx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 8; row++) {
      const y = row * 32;
      const offset = (row % 2) * 32;
      for (let col = -1; col < 5; col++) {
        const x = col * 64 + offset;
        const shade = 82 + Math.floor(Math.random() * 26);
        sCtx.fillStyle = `rgb(${shade}, ${shade + 7}, ${shade + 14})`;
        sCtx.fillRect(x + 2, y + 2, 60, 28);
      }
    }
    this.stoneBrickTex = new THREE.CanvasTexture(sCanvas);
    this.stoneBrickTex.wrapS = THREE.RepeatWrapping;
    this.stoneBrickTex.wrapT = THREE.RepeatWrapping;
    this.stoneBrickTex.repeat.set(2, 2);
    this.stoneBrickTex.colorSpace = THREE.SRGBColorSpace;

    // 4. Crimson Terracotta Roof Shingles Texture
    const rCanvas = document.createElement('canvas');
    rCanvas.width = 256;
    rCanvas.height = 256;
    const rCtx = rCanvas.getContext('2d')!;
    rCtx.fillStyle = '#8b1e1e';
    rCtx.fillRect(0, 0, 256, 256);
    for (let row = 0; row < 12; row++) {
      const y = row * 22;
      for (let col = 0; col < 8; col++) {
        const x = col * 32 + (row % 2) * 16;
        const r = 135 + Math.floor(Math.random() * 40);
        rCtx.fillStyle = `rgb(${r}, ${Math.floor(r * 0.24)}, ${Math.floor(r * 0.22)})`;
        rCtx.fillRect(x + 1, y + 1, 30, 19);
      }
    }
    this.roofShingleTex = new THREE.CanvasTexture(rCanvas);
    this.roofShingleTex.wrapS = THREE.RepeatWrapping;
    this.roofShingleTex.wrapT = THREE.RepeatWrapping;
    this.roofShingleTex.repeat.set(3, 3);
    this.roofShingleTex.colorSpace = THREE.SRGBColorSpace;
  }

  private initSharedAssets() {
    this.laserGeo = new THREE.CapsuleGeometry(0.45, 6.2, 4, 8);
    this.laserGeo.rotateX(Math.PI / 2);

    this.laserCoreGeo = new THREE.CapsuleGeometry(0.2, 5.8, 4, 6);
    this.laserCoreGeo.rotateX(Math.PI / 2);
    this.laserCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    this.playerLaserMats = {
      1: new THREE.MeshBasicMaterial({ color: 0x00f5d4, transparent: true, opacity: 0.85 }),
      2: new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.88 }),
      3: new THREE.MeshBasicMaterial({ color: 0x10b981, transparent: true, opacity: 0.9 }),
    };
    this.enemyLaserMat = new THREE.MeshBasicMaterial({ color: 0xff2a6d });

    this.fireballGeo = new THREE.SphereGeometry(1.0, 12, 10);
    this.shockwaveGeo = new THREE.TorusGeometry(1.0, 0.14, 8, 28);
  }

  // -------------------------------------------------------------
  // 1. SWEEPING, OPEN HYRULE FLIGHT CORRIDOR (~7,800m)
  // Built BEFORE terrain carving so hills NEVER block sightlines!
  // -------------------------------------------------------------
  private createSpline() {
    const rawWaypoints: Array<{ x: number; z: number; y: number }> = [
      { x: 0, z: 1460, y: 26 },      // Corneria Outer Bay entry over gleaming ocean
      { x: 25, z: 1120, y: 26 },     // Through Harbor Gate & Towers
      { x: 185, z: 750, y: 30 },     // Eastern Hyrule Coast flyby past Citadel
      { x: 430, z: 360, y: 36 },     // Over Kakariko Village & Windmills
      { x: 510, z: -40, y: 34 },     // Emerald Valley sweeping turn
      { x: 320, z: -340, y: 20 },    // Low water-skim over Hyrule Lake & Stone Bridge
      { x: 40, z: -570, y: 36 },     // Past Hyrule Southern Fortress
      { x: -370, z: -380, y: 38 },   // Through Ancient Temple Guardian Ruins!
      { x: -510, z: -20, y: 46 },    // Western Canyon ascent
      { x: -310, z: 340, y: 68 },    // High Dragon Crest Alpine Peaks
      { x: -65, z: 500, y: 74 },     // Past Dragon Crest Shrine beacon
      { x: 220, z: 340, y: 54 },     // Dive back into Central Hyrule Basin
      { x: 15, z: 60, y: 28 },       // Low pass over Shrine of Awakening
      { x: -95, z: -430, y: 30 },    // Outbound Coastal Strait
      { x: -35, z: -980, y: 32 },    // Outer Bay Armada Approach
      { x: 0, z: -1560, y: 40 },     // Corneria Dreadnought Arena
      { x: 0, z: -2150, y: 46 },     // Victory Flyover
    ];

    const points = rawWaypoints.map((wp) => new THREE.Vector3(wp.x, wp.y, wp.z));
    this.splineCurve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.45);
    this.totalDistance = this.splineCurve.getLength();
    this.prevTangent = this.splineCurve.getTangentAt(0).normalize();
  }

  // -------------------------------------------------------------
  // 2. ZELDA HYRULE LANDSCAPE + VALLEY SCULPTING + FULL ZELDA REPO INTEGRATION
  // -------------------------------------------------------------
  private createHyruleIntegratedWorld() {
    this.terrainManager = new TerrainManager();
    const terrainMesh = this.terrainManager.createTerrainMesh();

    // Carve an open, clear scenic valley along the flight path so mounds NEVER block enemies or blind the pilot!
    this.sculptFlightValleyAndContrast(terrainMesh);

    terrainMesh.scale.set(this.WORLD_SCALE_XZ, this.WORLD_SCALE_Y, this.WORLD_SCALE_XZ);
    terrainMesh.castShadow = false;
    terrainMesh.receiveShadow = !this.isMobile;
    this.scene.add(terrainMesh);

    this.waterManager = new WaterManager();
    const hyruleWater = this.waterManager.createWaterMesh();
    hyruleWater.scale.set(this.WORLD_SCALE_XZ, 1.0, this.WORLD_SCALE_XZ);
    hyruleWater.position.y = this.WATER_Y;
    this.scene.add(hyruleWater);

    // High-Contrast Golden Morning Lighting Rig (deep shadow clarity, zero pastel washout!)
    this.skyLighting = new SkyAndLightingManager(this.scene);
    this.skyLighting.initLighting(this.isMobile ? 'low' : 'high');
    this.skyLighting.timeOfDay = 9.4;
    this.skyLighting.isTimeCycleActive = false;

    if (this.skyLighting.ambientLight) {
      this.skyLighting.ambientLight.color.setHex(0x94a3b8);
      this.skyLighting.ambientLight.intensity = 0.22;
    }
    if (this.skyLighting.hemiLight) {
      this.skyLighting.hemiLight.color.setHex(0x7dd3fc);
      this.skyLighting.hemiLight.groundColor.setHex(0x163024);
      this.skyLighting.hemiLight.intensity = 0.34;
    }
    if (this.skyLighting.dirLight) {
      this.skyLighting.dirLight.color.setHex(0xfff1cc);
      this.skyLighting.dirLight.intensity = 2.15;
    }
    if (this.skyLighting.rimLight) {
      this.skyLighting.rimLight.color.setHex(0x60a5fa);
      this.skyLighting.rimLight.intensity = 0.88;
    }
    if (this.skyLighting.skyDome) {
      this.skyLighting.skyDome.scale.setScalar(22);
    }
    if (this.skyLighting.fog) {
      this.skyLighting.fog.color.setHex(0x74b9e8);
      this.skyLighting.fog.density = 0.00014;
    }

    // 1. Batched Instanced Zelda Pine Forests & Mossy Granite Boulders
    this.populateInstancedHyruleNature();

    // 2. All 4 Sheikah Shrines with Sky Beams (CollectibleManager)
    this.collectibleManager = new CollectibleManager(this.scene);
    this.collectibleManager.shrinesData.forEach((shrine) => {
      shrine.position.x *= this.WORLD_SCALE_XZ;
      shrine.position.z *= this.WORLD_SCALE_XZ;
    });
    this.collectibleManager.initWorldObjects();
    this.collectibleManager.objects.forEach((obj) => {
      if (obj.data.type === 'shrine') {
        const y = this.getHyruleHeight(obj.data.position.x, obj.data.position.z);
        obj.mesh.position.set(obj.data.position.x, y, obj.data.position.z);
        obj.mesh.scale.setScalar(2.4);
      } else {
        obj.mesh.visible = false; // Hide tiny foot-level chests/rupees; we spawn giant aerial rupees instead
      }
    });

    // 3. Temple of Guardian Runes: 12 Ancient Stone Pillars with Glowing Emerald Sheikah Rings (Foliage.ts design!)
    this.populateAncientRuinsCircle();

    // 4. Authentic Zelda Villages, Hyrule Citadel Castle, Windmills, Watchtowers, Bridges & Harbor Gates!
    this.buildingSystem = new BuildingSystem(this.scene);
    this.buildingSystem.group.visible = false;
    this.populateZeldaStructures();

    // 5. Iconic Zelda Stone Guardians & Mossy Stone Talus Colossi (EnemyManager)
    this.enemyManager = new EnemyManager(this.scene);
    this.enemyManager.group.visible = true;
    this.populateZeldaColossi();
  }

  private sculptFlightValleyAndContrast(terrainMesh: THREE.Mesh) {
    const geom = this.terrainManager.terrainGeometry;
    if (!geom) return;

    // Sample 140 points along spline in unscaled local terrain space
    const samples: Array<{ lx: number; lz: number; maxGroundY: number }> = [];
    for (let i = 0; i <= 140; i++) {
      const u = i / 140;
      const p = this.splineCurve.getPointAt(u);
      samples.push({
        lx: p.x / this.WORLD_SCALE_XZ,
        lz: p.z / this.WORLD_SCALE_XZ,
        maxGroundY: Math.max(0.5, (p.y - 16) / this.WORLD_SCALE_Y),
      });
    }

    const posAttr = geom.attributes.position as THREE.BufferAttribute;
    const colAttr = geom.attributes.color as THREE.BufferAttribute;
    const cRock = new THREE.Color('#475361');
    const cGrass = new THREE.Color('#3b8a36');
    const cSand = new THREE.Color('#d8b87e');
    const cTmp = new THREE.Color();

    for (let i = 0; i < posAttr.count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);
      let vy = posAttr.getY(i);

      // Gentle overall vertical moderation so hills are majestic ridges, not bulbous blobs
      if (vy > 18) {
        vy = 18 + (vy - 18) * 0.72;
      }

      // Check closest spline point and smoothly carve open corridor valleys
      let minDistSq = Infinity;
      let targetCap = vy;
      for (let s = 0; s < samples.length; s++) {
        const sp = samples[s];
        const dx = vx - sp.lx;
        const dz = vz - sp.lz;
        const dSq = dx * dx + dz * dz;
        if (dSq < minDistSq) {
          minDistSq = dSq;
          targetCap = sp.maxGroundY;
        }
      }

      const dist = Math.sqrt(minDistSq);
      const corridorWidth = 26; // ~62m wide in scaled world space
      if (dist < corridorWidth * 1.9 && vy > targetCap) {
        const blend = THREE.MathUtils.smoothstep(dist, corridorWidth * 0.55, corridorWidth * 1.9);
        vy = THREE.MathUtils.lerp(targetCap, vy, blend);
        posAttr.setY(i, vy);

        // Refresh vertex color on carved corridor walls so valleys turn rich emerald/rock instead of bright white snow!
        if (vy <= TerrainManager.WATER_LEVEL + 1.4) {
          cTmp.copy(cSand);
        } else if (vy > 22) {
          cTmp.copy(cRock);
        } else {
          cTmp.copy(cGrass).lerp(cRock, THREE.MathUtils.smoothstep(vy, 14, 24) * 0.65);
        }
        colAttr.setXYZ(i, cTmp.r, cTmp.g, cTmp.b);
      } else {
        posAttr.setY(i, vy);
      }
    }

    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    geom.computeVertexNormals();
    this.terrainManager.syncHeightGrid();
    terrainMesh.updateMatrixWorld();
  }

  private enhanceZeldaStructureMaterials(mesh: THREE.Object3D) {
    const toRemove: THREE.Object3D[] = [];
    mesh.traverse((child) => {
      if (child instanceof THREE.PointLight) {
        toRemove.push(child);
      } else if (child instanceof THREE.Mesh && child.material instanceof THREE.MeshStandardMaterial) {
        const mat = child.material;
        const hex = mat.color.getHex();
        // Enhance plain flat grey ashlar stones & red roofs with crisp procedural masonry & shingle textures!
        if (hex === 0x64748b || hex === 0x526074) {
          const textured = mat.clone();
          textured.map = this.stoneBrickTex;
          textured.roughness = 0.78;
          child.material = textured;
        } else if (hex === 0x991b1b) {
          const texturedRoof = mat.clone();
          texturedRoof.map = this.roofShingleTex;
          texturedRoof.roughness = 0.52;
          child.material = texturedRoof;
        }
      }
    });
    toRemove.forEach((l) => l.parent?.remove(l));
  }

  private populateZeldaStructures() {
    const landmarks: Array<{ type: string; x: number; z: number; rotY: number; scale: number; rad: number }> = [
      // Hyrule Fortress Citadel overlooking Eastern Coast
      { type: 'catan_city', x: 115, z: 540, rotY: 0.4, scale: 3.4, rad: 20 },
      { type: 'catan_knight_tower', x: 75, z: 540, rotY: 0.0, scale: 2.8, rad: 7 },
      { type: 'catan_knight_tower', x: 155, z: 540, rotY: 0.0, scale: 2.8, rad: 7 },
      { type: 'wall_stone', x: 115, z: 575, rotY: 0.0, scale: 3.2, rad: 8 },
      // Kakariko Windmill Village beside Whispering Forest curve
      { type: 'catan_settlement', x: 340, z: 240, rotY: 0.9, scale: 2.4, rad: 12 },
      { type: 'catan_settlement', x: 375, z: 295, rotY: -0.4, scale: 2.3, rad: 12 },
      { type: 'catan_settlement', x: 310, z: 310, rotY: 1.8, scale: 2.2, rad: 12 },
      { type: 'windmill', x: 360, z: 185, rotY: -0.6, scale: 2.6, rad: 11 },
      { type: 'windmill', x: 465, z: 115, rotY: 1.1, scale: 2.4, rad: 11 },
      { type: 'stone_well', x: 342, z: 272, rotY: 0.2, scale: 2.6, rad: 5 },
      { type: 'watchtower', x: 265, z: 215, rotY: 0.5, scale: 2.6, rad: 8 },
      // Southern Hyrule Castle Keep
      { type: 'catan_city', x: -10, z: -690, rotY: 0.1, scale: 3.6, rad: 22 },
      { type: 'watchtower', x: 55, z: -670, rotY: -0.7, scale: 2.6, rad: 8 },
      { type: 'watchtower', x: -75, z: -670, rotY: 0.7, scale: 2.6, rad: 8 },
      // Central Basin Settlement & Bridge Watchpost
      { type: 'catan_settlement', x: 95, z: -15, rotY: 2.1, scale: 2.3, rad: 12 },
      { type: 'windmill', x: -245, z: 220, rotY: 0.3, scale: 2.4, rad: 10 },
      { type: 'catan_knight_tower', x: -135, z: -260, rotY: 0.0, scale: 2.8, rad: 7 },
    ];

    landmarks.forEach((lm) => {
      const y = this.getHyruleHeight(lm.x, lm.z);
      if (y > this.WATER_Y + 0.4) {
        const mesh = this.buildingSystem.createStructureMesh(lm.type, false);
        this.enhanceZeldaStructureMaterials(mesh);

        const rotor = mesh.getObjectByName('WindmillRotor');
        if (rotor) this.windmills.push(rotor);

        mesh.position.set(lm.x, y, lm.z);
        mesh.rotation.y = lm.rotY;
        mesh.scale.setScalar(lm.scale);
        this.scene.add(mesh);

        this.colliders.push({
          position: new THREE.Vector3(lm.x, y + 12, lm.z),
          radius: lm.rad,
          halfHeight: 20,
          type: 'building',
        });
      }
    });

    // Hyrule Stone Coastal Bridge spanning Hyrule Lake right along the low-skim curve (`u ~ 0.31`)
    const bridgePos = this.splineCurve.getPointAt(0.31);
    const bridgeFwd = this.splineCurve.getTangentAt(0.31).normalize();
    const bridgeRight = new THREE.Vector3().crossVectors(bridgeFwd, this.tmpUpRef).normalize();
    for (let i = -3; i <= 3; i++) {
      const segPos = bridgePos.clone().addScaledVector(bridgeRight, i * 18);
      const seg = this.buildingSystem.createStructureMesh('walled_road', false);
      this.enhanceZeldaStructureMaterials(seg);
      seg.position.set(segPos.x, this.WATER_Y + 2.5, segPos.z);
      seg.lookAt(segPos.x + bridgeRight.x, this.WATER_Y + 2.5, segPos.z + bridgeRight.z);
      seg.scale.set(5.5, 4.0, 5.5);
      this.scene.add(seg);

      // Bridge Stone Pier columns dipping into water
      const pier = new THREE.Mesh(
        new THREE.CylinderGeometry(3.2, 4.0, 14, 10),
        new THREE.MeshStandardMaterial({ map: this.stoneBrickTex, color: 0x748497, roughness: 0.85 })
      );
      pier.position.set(segPos.x, this.WATER_Y - 4.0, segPos.z);
      this.scene.add(pier);
    }

    // Monumental Zelda Harbor Start Gate over Corneria Entry (`u = 0.04`)
    const gatePos = this.splineCurve.getPointAt(0.04);
    const gateFwd = this.splineCurve.getTangentAt(0.04).normalize();
    const startGate = this.buildingSystem.createStructureMesh('track_start_gate', false);
    this.enhanceZeldaStructureMaterials(startGate);
    startGate.position.set(gatePos.x, this.WATER_Y, gatePos.z);
    startGate.lookAt(gatePos.x + gateFwd.x, this.WATER_Y, gatePos.z + gateFwd.z);
    startGate.scale.set(14.5, 11.5, 9.0);
    this.scene.add(startGate);
  }

  private populateAncientRuinsCircle() {
    const ruinCenterX = -160 * this.WORLD_SCALE_XZ;
    const ruinCenterZ = -80 * this.WORLD_SCALE_XZ;
    const stoneMat = new THREE.MeshStandardMaterial({ map: this.stoneBrickTex, color: 0x828c99, roughness: 0.8 });
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 1.4,
    });
    const pillarGeo = new THREE.CylinderGeometry(2.4, 3.0, 26, 8);
    const ringGeo = new THREE.TorusGeometry(2.85, 0.28, 8, 16);

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const rx = ruinCenterX + Math.cos(angle) * 52;
      const rz = ruinCenterZ + Math.sin(angle) * 52;
      const ry = this.getHyruleHeight(rx, rz);

      const pillar = new THREE.Mesh(pillarGeo, stoneMat);
      pillar.position.set(rx, ry + 11, rz);
      if (i % 3 === 0) pillar.rotation.z = (i % 2 === 0 ? 1 : -1) * 0.16;

      const ring = new THREE.Mesh(ringGeo, runeMat);
      ring.position.y = 4.0;
      ring.rotation.x = Math.PI / 2;
      pillar.add(ring);
      this.scene.add(pillar);

      this.colliders.push({
        position: new THREE.Vector3(rx, ry + 12, rz),
        radius: 3.5,
        halfHeight: 14,
        type: 'building',
      });
    }
  }

  private populateZeldaColossi() {
    // Scenic / Shootable Stone Guardians & Stone Talus Colossi straight from Enemies.ts!
    const colossiSpots: Array<{ kind: 'guardian' | 'talus'; x: number; z: number; scale: number }> = [
      { kind: 'guardian', x: -310, z: -260, scale: 3.4 },
      { kind: 'guardian', x: 260, z: 320, scale: 3.2 },
      { kind: 'talus', x: -240, z: 350, scale: 3.5 },
      { kind: 'talus', x: 420, z: -120, scale: 3.5 },
    ];

    colossiSpots.forEach((spot, idx) => {
      const lx = spot.x / this.WORLD_SCALE_XZ;
      const lz = spot.z / this.WORLD_SCALE_XZ;
      const wy = this.getHyruleHeight(spot.x, spot.z);
      if (wy < this.WATER_Y + 0.5) return;

      const mesh =
        spot.kind === 'guardian'
          ? this.enemyManager.createStoneGuardian(`sf_col_${idx}`, lx, lz)
          : this.enemyManager.createStoneTalus(`sf_talus_${idx}`, lx, lz);

      // Remove PointLights from Talus for 60 FPS
      const lights: THREE.Object3D[] = [];
      mesh.traverse((c) => {
        if (c instanceof THREE.PointLight) lights.push(c);
      });
      lights.forEach((l) => l.parent?.remove(l));

      mesh.position.set(spot.x, wy, spot.z);
      mesh.scale.setScalar(spot.scale);

      this.enemies.push({
        id: this.nextEnemyId++,
        mesh,
        type: spot.kind,
        health: 120,
        maxHealth: 120,
        points: 1200,
        basePos: mesh.position.clone(),
        movePhase: idx * 1.4,
        moveAmpX: 0,
        moveAmpY: 0,
        fireCooldown: 2.4,
        destroyed: false,
        hitRadius: 16.0,
        bodyRadius: 12.0,
        baseScale: spot.scale,
      });
    });
  }

  private populateInstancedHyruleNature() {
    const treeCount = this.isMobile ? 260 : 380;
    const rockCount = this.isMobile ? 120 : 200;

    const trunkGeo = new THREE.CylinderGeometry(0.45, 0.78, 5.5, 7);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4f3016, roughness: 0.88 });
    const coneGeo = new THREE.ConeGeometry(4.5, 7.8, 7);
    const fDark = new THREE.MeshStandardMaterial({ color: 0x1a4d22, roughness: 0.78 });
    const fMid = new THREE.MeshStandardMaterial({ color: 0x2a7030, roughness: 0.72 });
    const fTip = new THREE.MeshStandardMaterial({ color: 0x3fa340, roughness: 0.68 });

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
    const f1Inst = new THREE.InstancedMesh(coneGeo, fDark, treeCount);
    const f2Inst = new THREE.InstancedMesh(coneGeo, fMid, treeCount);
    const f3Inst = new THREE.InstancedMesh(coneGeo, fTip, treeCount);

    const dummy = new THREE.Object3D();
    let placedTrees = 0;

    for (let i = 0; i < treeCount * 2 && placedTrees < treeCount; i++) {
      const wx = (Math.random() - 0.5) * 1650;
      const wz = (Math.random() - 0.5) * 1650;
      const wy = this.getHyruleHeight(wx, wz);
      if (wy > this.WATER_Y + 1.5 && wy < 36) {
        const s = 1.15 + Math.random() * 1.05;

        dummy.position.set(wx, wy + 2.4 * s, wz);
        dummy.scale.set(s, s, s);
        dummy.rotation.y = Math.random() * Math.PI * 2;
        dummy.updateMatrix();
        trunkInst.setMatrixAt(placedTrees, dummy.matrix);

        dummy.position.set(wx, wy + 6.5 * s, wz);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        f1Inst.setMatrixAt(placedTrees, dummy.matrix);

        dummy.position.set(wx, wy + 9.6 * s, wz);
        dummy.scale.set(s * 0.78, s * 0.82, s * 0.78);
        dummy.updateMatrix();
        f2Inst.setMatrixAt(placedTrees, dummy.matrix);

        dummy.position.set(wx, wy + 12.2 * s, wz);
        dummy.scale.set(s * 0.54, s * 0.64, s * 0.54);
        dummy.updateMatrix();
        f3Inst.setMatrixAt(placedTrees, dummy.matrix);

        placedTrees++;
      }
    }
    trunkInst.count = placedTrees;
    f1Inst.count = placedTrees;
    f2Inst.count = placedTrees;
    f3Inst.count = placedTrees;
    this.scene.add(trunkInst, f1Inst, f2Inst, f3Inst);

    const rockGeo = new THREE.DodecahedronGeometry(3.2, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x5c6875,
      roughness: 0.82,
      metalness: 0.08,
      flatShading: true,
    });
    const rockInst = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    let placedRocks = 0;

    for (let i = 0; i < rockCount * 2 && placedRocks < rockCount; i++) {
      const wx = (Math.random() - 0.5) * 1750;
      const wz = (Math.random() - 0.5) * 1750;
      const wy = this.getHyruleHeight(wx, wz);
      if (wy > this.WATER_Y + 0.5) {
        const s = 1.0 + Math.random() * 2.1;
        dummy.position.set(wx, wy + s * 0.42, wz);
        dummy.scale.set(s * 1.15, s * 0.78, s * 1.25);
        dummy.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, Math.random() * 0.5);
        dummy.updateMatrix();
        rockInst.setMatrixAt(placedRocks, dummy.matrix);
        placedRocks++;
      }
    }
    rockInst.count = placedRocks;
    this.scene.add(rockInst);
  }

  // -------------------------------------------------------------
  // 3. TEXTURED PLANET, ATMOSPHERIC RINGS & VOLUMETRIC CLOUD RIDGES
  // -------------------------------------------------------------
  private createSkyAndCelestial() {
    const pCanvas = document.createElement('canvas');
    pCanvas.width = 512;
    pCanvas.height = 256;
    const pCtx = pCanvas.getContext('2d')!;
    const pGrad = pCtx.createLinearGradient(0, 0, 0, 256);
    pGrad.addColorStop(0.0, '#1e3a8a');
    pGrad.addColorStop(0.25, '#3b82f6');
    pGrad.addColorStop(0.45, '#93c5fd');
    pGrad.addColorStop(0.6, '#60a5fa');
    pGrad.addColorStop(0.8, '#2563eb');
    pGrad.addColorStop(1.0, '#0f172a');
    pCtx.fillStyle = pGrad;
    pCtx.fillRect(0, 0, 512, 256);

    // Subtle gas giant cloud bands
    for (let i = 0; i < 24; i++) {
      pCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.12)';
      pCtx.fillRect(0, i * 11, 512, 5 + (i % 3));
    }
    const planetTex = new THREE.CanvasTexture(pCanvas);
    planetTex.colorSpace = THREE.SRGBColorSpace;

    const planetGroup = new THREE.Group();
    planetGroup.position.set(2200, 1850, -6800);

    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(760, 32, 32),
      new THREE.MeshStandardMaterial({
        map: planetTex,
        roughness: 0.72,
        metalness: 0.05,
        emissive: 0x1d4ed8,
        emissiveIntensity: 0.16,
      })
    );
    planetGroup.add(planet);

    const innerRing = new THREE.Mesh(
      new THREE.RingGeometry(1020, 1480, 56),
      new THREE.MeshBasicMaterial({
        color: 0xe0f2fe,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.58,
      })
    );
    innerRing.rotation.set(Math.PI / 2.3, -0.25, 0.65);
    planetGroup.add(innerRing);

    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(1540, 1980, 56),
      new THREE.MeshBasicMaterial({
        color: 0x7dd3fc,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.34,
      })
    );
    outerRing.rotation.set(Math.PI / 2.3, -0.25, 0.65);
    planetGroup.add(outerRing);

    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(190, 20, 20),
      new THREE.MeshStandardMaterial({
        color: 0xfde68a,
        roughness: 0.8,
        emissive: 0xd97706,
        emissiveIntensity: 0.14,
      })
    );
    moon.position.set(-1650, 520, 400);
    planetGroup.add(moon);

    this.scene.add(planetGroup);
  }

  private createOuterOcean() {
    const oceanGeo = new THREE.PlaneGeometry(16000, 16000, 72, 72);
    oceanGeo.rotateX(-Math.PI / 2);

    this.outerOceanMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 },
        uDeepColor: { value: new THREE.Color('#04294f') },
        uShallowColor: { value: new THREE.Color('#0e8ab8') },
        uSkyHorizon: { value: new THREE.Color('#74b9e8') },
        uSunDirection: { value: new THREE.Vector3(0.55, 0.72, 0.42).normalize() },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPos;
        varying float vWave;
        void main() {
          vec3 pos = position;
          float w = sin(pos.x * 0.025 + uTime * 1.6) * cos(pos.z * 0.025 + uTime * 1.3) * 0.65
                  + sin(pos.x * 0.07 - uTime * 2.1) * 0.25;
          pos.y += w;
          vWave = w;
          vec4 wp = modelMatrix * vec4(pos, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uSkyHorizon;
        uniform vec3 uSunDirection;
        varying vec3 vWorldPos;
        varying float vWave;
        void main() {
          vec3 viewVec = cameraPosition - vWorldPos;
          float dist = length(viewVec);
          vec3 viewDir = normalize(viewVec);

          float rippleX = cos(vWorldPos.x * 0.14 + uTime * 2.2) * 0.09 + sin(vWorldPos.z * 0.22 - uTime * 1.7) * 0.06;
          float rippleZ = sin(vWorldPos.z * 0.14 + uTime * 1.8) * 0.09;
          vec3 normal = normalize(vec3(rippleX, 1.0, rippleZ));

          float fresnel = pow(1.0 - max(0.0, dot(viewDir, normal)), 3.0);
          vec3 waterCol = mix(uDeepColor, uShallowColor, clamp(vWave * 0.45 + 0.42, 0.0, 1.0));
          waterCol = mix(waterCol, uSkyHorizon, fresnel * 0.68);

          // Crisp diamond sun sparkle path on ocean waves
          vec3 halfDir = normalize(uSunDirection + viewDir);
          float spec = pow(max(0.0, dot(normal, halfDir)), 96.0);
          waterCol += vec3(1.0, 0.95, 0.80) * spec * 1.65;

          // Smooth horizon atmospheric blend
          float horizonFog = clamp(smoothstep(1800.0, 6200.0, dist), 0.0, 0.92);
          waterCol = mix(waterCol, uSkyHorizon, horizonFog);

          gl_FragColor = vec4(waterCol, 1.0);
        }
      `,
    });

    const outerMesh = new THREE.Mesh(oceanGeo, this.outerOceanMaterial);
    outerMesh.position.y = this.WATER_Y - 0.18;
    this.scene.add(outerMesh);
  }

  private createClouds() {
    // Shaded multi-layer cumulus cloud formations (warm cream top + cool slate-blue undersides!)
    const cloudMatTop = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.92,
      metalness: 0.0,
    });
    const cloudMatBelly = new THREE.MeshStandardMaterial({
      color: 0x7c9bc4,
      roughness: 0.95,
      metalness: 0.0,
    });
    const puffGeo = new THREE.IcosahedronGeometry(18, 1);

    const cloudSpots = [
      new THREE.Vector3(-290, 145, 340),
      new THREE.Vector3(-90, 155, 520),
      new THREE.Vector3(240, 140, 410),
      new THREE.Vector3(460, 148, 60),
      new THREE.Vector3(-540, 142, -160),
      new THREE.Vector3(110, 158, -620),
      new THREE.Vector3(-260, 162, -1120),
      new THREE.Vector3(310, 154, -1480),
    ];

    cloudSpots.forEach((spot) => {
      const cluster = new THREE.Group();
      cluster.position.copy(spot);

      // Cool shaded base deck
      for (let i = 0; i < 3; i++) {
        const belly = new THREE.Mesh(puffGeo, cloudMatBelly);
        belly.position.set((i - 1) * 28, -4, (i % 2 === 0 ? 1 : -1) * 8);
        belly.scale.set(1.75, 0.42, 1.45);
        cluster.add(belly);
      }
      // Sculpted sunlit billowing tops
      for (let i = 0; i < 4; i++) {
        const top = new THREE.Mesh(puffGeo, cloudMatTop);
        top.position.set((i - 1.5) * 21, 5 + (i === 1 || i === 2 ? 7 : 0), (Math.random() - 0.5) * 14);
        top.scale.set(1.25, 0.72, 1.15);
        top.rotation.y = i * 1.1;
        cluster.add(top);
      }
      this.scene.add(cluster);
    });
  }

  // -------------------------------------------------------------
  // 4. AAA HERO ARWING INTERCEPTOR (TEXTURED TITANIUM, CANTED FINS, 3D RIBBONS!)
  // -------------------------------------------------------------
  private createPlayerShip() {
    this.shipGroup = new THREE.Group();
    this.shipMesh = new THREE.Group();
    this.shipMesh.scale.setScalar(1.22);

    const hullMat = new THREE.MeshStandardMaterial({
      map: this.arwingHullTex,
      bumpMap: this.arwingBumpTex,
      bumpScale: 0.08,
      color: 0xf1f5f9,
      roughness: 0.28,
      metalness: 0.62,
    });
    const wingMat = new THREE.MeshStandardMaterial({
      map: this.arwingHullTex,
      bumpMap: this.arwingBumpTex,
      bumpScale: 0.06,
      color: 0xe2e8f0,
      roughness: 0.26,
      metalness: 0.58,
    });
    const cobaltArmorMat = new THREE.MeshStandardMaterial({
      color: 0x1e40af,
      roughness: 0.25,
      metalness: 0.75,
    });
    const darkSteelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.35,
      metalness: 0.88,
    });
    const crimsonFinMat = new THREE.MeshStandardMaterial({
      color: 0xdc2626,
      roughness: 0.3,
      metalness: 0.45,
    });
    const goldTrimMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.22,
      metalness: 0.9,
    });
    const canopyMat = new THREE.MeshStandardMaterial({
      color: 0x0369a1,
      roughness: 0.05,
      metalness: 0.92,
      emissive: 0x0284c7,
      emissiveIntensity: 0.28,
    });
    const cyanGlowMat = new THREE.MeshBasicMaterial({ color: 0x00f5ff });

    // A. Sculpted Faceted Nosecone + Nose Sensor Tip + Chin Radar Pod
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.84, 4.9, 8).rotateX(-Math.PI / 2), hullMat);
    nose.position.set(0, 0.02, -2.55);
    this.shipMesh.add(nose);

    const noseTip = new THREE.Mesh(new THREE.ConeGeometry(0.24, 1.1, 8).rotateX(-Math.PI / 2), darkSteelMat);
    noseTip.position.set(0, 0.02, -4.9);
    this.shipMesh.add(noseTip);

    // Main Hexagonal Armored Fuselage Spine & Side Strakes
    const fuselageCore = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.96, 4.2, 6).rotateX(Math.PI / 2), hullMat);
    fuselageCore.scale.set(1.15, 0.76, 1.0);
    fuselageCore.position.set(0, 0.05, 0.15);
    this.shipMesh.add(fuselageCore);

    const dorsalFin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.55, 2.2), cobaltArmorMat);
    dorsalFin.position.set(0, 0.72, 0.8);
    dorsalFin.rotation.x = 0.28;
    this.shipMesh.add(dorsalFin);

    const ventralKeel = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.36, 3.0), darkSteelMat);
    ventralKeel.position.set(0, -0.45, 0.0);
    this.shipMesh.add(ventralKeel);

    // Armored Obsidian-Sapphire Glass Canopy + Canopy Frame + Pilot Helmet
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(0.66, 2.8, 8).rotateX(-Math.PI / 2), canopyMat);
    canopy.scale.set(0.95, 0.72, 1.0);
    canopy.position.set(0, 0.56, -1.05);
    this.shipMesh.add(canopy);

    const pilotHelmet = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 8, 8),
      new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.35 })
    );
    pilotHelmet.position.set(0, 0.44, -0.7);
    this.shipMesh.add(pilotHelmet);

    const canopyFrame = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.06, 6, 12, Math.PI), darkSteelMat);
    canopyFrame.position.set(0, 0.4, -0.5);
    this.shipMesh.add(canopyFrame);

    // B. Sculpted Swept Compound Delta Wings (ExtrudeGeometry with Bevels!)
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0.75, -0.7);
    wingShape.lineTo(4.95, 1.35);
    wingShape.lineTo(5.05, 2.15);
    wingShape.lineTo(2.4, 1.85);
    wingShape.lineTo(0.75, 2.05);
    wingShape.closePath();

    const wingExtrude = new THREE.ExtrudeGeometry(wingShape, {
      depth: 0.14,
      bevelEnabled: true,
      bevelThickness: 0.05,
      bevelSize: 0.06,
      bevelSegments: 2,
    });
    wingExtrude.rotateX(Math.PI / 2);

    const rightWing = new THREE.Mesh(wingExtrude, wingMat);
    rightWing.position.set(0, 0.14, 0.0);
    rightWing.rotation.z = 0.05;
    this.shipMesh.add(rightWing);

    const leftWing = rightWing.clone();
    leftWing.scale.x = -1;
    leftWing.rotation.z = -0.05;
    this.shipMesh.add(leftWing);

    // Wing Cobalt Squadron Markings
    [-3.1, 3.1].forEach((xPos) => {
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.16, 0.42), cobaltArmorMat);
      stripe.position.set(xPos, 0.12, 1.1);
      stripe.rotation.y = xPos > 0 ? -0.34 : 0.34;
      this.shipMesh.add(stripe);
    });

    // C. Iconic Angled Canted Wingtip Stabilizer Fins (ExtrudeGeometry Trapezoid, NOT flat slabs!)
    const finShape = new THREE.Shape();
    finShape.moveTo(-0.55, -0.25);
    finShape.lineTo(0.75, -0.25);
    finShape.lineTo(1.15, 1.15);
    finShape.lineTo(0.15, 1.25);
    finShape.closePath();

    const finExtrude = new THREE.ExtrudeGeometry(finShape, {
      depth: 0.12,
      bevelEnabled: true,
      bevelThickness: 0.03,
      bevelSize: 0.03,
      bevelSegments: 1,
    });
    finExtrude.rotateY(Math.PI / 2);

    const leftFin = new THREE.Mesh(finExtrude, crimsonFinMat);
    leftFin.position.set(-4.95, 0.22, 1.55);
    leftFin.rotation.z = 0.42; // Dramatic 24 deg outward Star Fox cant!
    this.shipMesh.add(leftFin);

    const rightFin = new THREE.Mesh(finExtrude, crimsonFinMat);
    rightFin.position.set(4.95, 0.22, 1.55);
    rightFin.rotation.z = -0.42;
    this.shipMesh.add(rightFin);

    // Glowing Aviation Nav Lights on Wingtips (Red Port, Emerald-Cyan Starboard)
    const navLeft = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a6d }));
    navLeft.position.set(-5.35, 1.22, 2.1);
    this.shipMesh.add(navLeft);

    const navRight = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 8), new THREE.MeshBasicMaterial({ color: 0x00f5d4 }));
    navRight.position.set(5.35, 1.22, 2.1);
    this.shipMesh.add(navRight);

    // Articulated Trailing-Edge Flight Flaps
    const flapGeo = new THREE.BoxGeometry(1.75, 0.1, 0.55);
    this.leftFlap = new THREE.Mesh(flapGeo, darkSteelMat);
    this.leftFlap.position.set(-2.45, 0.12, 1.98);
    this.shipMesh.add(this.leftFlap);

    this.rightFlap = new THREE.Mesh(flapGeo, darkSteelMat);
    this.rightFlap.position.set(2.45, 0.12, 1.98);
    this.shipMesh.add(this.rightFlap);

    // D. Twin G-Diffuser Pods + Turbines + Plasma Laser Cannons with Gold Cooling Rings
    [-1.45, 1.45].forEach((xOff) => {
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.42, 3.8, 8).rotateX(Math.PI / 2), cobaltArmorMat);
      pod.position.set(xOff, -0.02, 0.1);
      this.shipMesh.add(pod);

      // Front dark turbine intake bezel + cyan diffuser ring
      const intakeRing = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.06, 6, 16), darkSteelMat);
      intakeRing.position.set(xOff, -0.02, -1.8);
      this.shipMesh.add(intakeRing);

      // Top & side G-Diffuser glowing plasma vents
      const topVent = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 2.6), cyanGlowMat);
      topVent.position.set(xOff, 0.34, 0.2);
      this.shipMesh.add(topVent);

      // Wing-mounted twin Plasma Cannons with golden heat-sink collars
      const barrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.16, 3.6, 8).rotateX(Math.PI / 2),
        darkSteelMat
      );
      barrel.position.set(xOff * 1.18, -0.24, -1.0);
      this.shipMesh.add(barrel);

      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.45, 8).rotateX(Math.PI / 2), goldTrimMat);
      collar.position.set(xOff * 1.18, -0.24, -2.25);
      this.shipMesh.add(collar);

      const muzzleFlash = new THREE.Mesh(
        new THREE.SphereGeometry(0.48, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.0 })
      );
      muzzleFlash.position.set(xOff * 1.18, -0.24, -2.9);
      this.shipMesh.add(muzzleFlash);
      this.muzzleFlashes.push(muzzleFlash);
    });

    // E. Sculpted 3-Nozzle Vector Afterburners + Dual-Cone Plasma Plumes
    const outerFlameMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.78 });
    const innerCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });

    [
      new THREE.Vector3(-1.45, -0.02, 2.05),
      new THREE.Vector3(1.45, -0.02, 2.05),
      new THREE.Vector3(0.0, 0.1, 2.15),
    ].forEach((pos, idx) => {
      const isCenter = idx === 2;
      const nozzle = new THREE.Mesh(
        new THREE.CylinderGeometry(isCenter ? 0.5 : 0.34, isCenter ? 0.38 : 0.26, 0.85, 10).rotateX(Math.PI / 2),
        darkSteelMat
      );
      nozzle.position.copy(pos);
      this.shipMesh.add(nozzle);

      const nozzleGlowRing = new THREE.Mesh(
        new THREE.TorusGeometry(isCenter ? 0.4 : 0.27, 0.06, 6, 16),
        cyanGlowMat
      );
      nozzleGlowRing.position.set(pos.x, pos.y, pos.z + 0.4);
      this.shipMesh.add(nozzleGlowRing);

      const flame = new THREE.Mesh(
        new THREE.ConeGeometry(isCenter ? 0.46 : 0.32, isCenter ? 3.5 : 2.5, 10).rotateX(Math.PI / 2),
        outerFlameMat.clone()
      );
      flame.position.set(pos.x, pos.y, pos.z + 1.5);
      this.shipMesh.add(flame);
      this.thrusterFlames.push(flame);

      const coreFlame = new THREE.Mesh(
        new THREE.ConeGeometry(isCenter ? 0.22 : 0.16, isCenter ? 2.2 : 1.5, 8).rotateX(Math.PI / 2),
        innerCoreMat
      );
      coreFlame.position.set(pos.x, pos.y, pos.z + 1.2);
      this.shipMesh.add(coreFlame);
      this.thrusterCores.push(coreFlame);
    });

    // F. Special FX Rings Attached to Ship
    this.barrelRollRing = new THREE.Mesh(
      new THREE.TorusGeometry(5.6, 0.22, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.0 })
    );
    this.barrelRollRing.visible = false;
    this.shipMesh.add(this.barrelRollRing);

    this.sonicBoomRing = new THREE.Mesh(
      new THREE.TorusGeometry(3.4, 0.28, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xfffbeb, transparent: true, opacity: 0.0 })
    );
    this.sonicBoomRing.visible = false;
    this.shipGroup.add(this.sonicBoomRing);

    this.shieldBubble = new THREE.Mesh(
      new THREE.IcosahedronGeometry(5.0, 2),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.0 })
    );
    this.shieldBubble.visible = false;
    this.shipMesh.add(this.shieldBubble);

    this.chargeSphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.65, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.0 })
    );
    this.chargeSphere.position.set(0, 0, -5.2);
    this.shipMesh.add(this.chargeSphere);

    this.chargeRing = new THREE.Mesh(
      new THREE.TorusGeometry(1.2, 0.09, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xfacc15, transparent: true, opacity: 0.0 })
    );
    this.chargeRing.position.set(0, 0, -5.2);
    this.shipMesh.add(this.chargeRing);

    this.shipGroup.add(this.shipMesh);
    this.scene.add(this.shipGroup);
  }

  private createWingmen() {
    const offsets = [new THREE.Vector3(-34, 8, -44), new THREE.Vector3(34, 7, -48)];
    offsets.forEach((offset, idx) => {
      const g = new THREE.Group();
      const whiteMat = new THREE.MeshStandardMaterial({
        map: this.arwingHullTex,
        color: 0xe2e8f0,
        metalness: 0.55,
        roughness: 0.3,
      });
      const accentMat = new THREE.MeshStandardMaterial({
        color: idx === 0 ? 0x10b981 : 0x2563eb,
        metalness: 0.65,
        roughness: 0.28,
      });
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.75, 4.2, 6).rotateX(-Math.PI / 2), whiteMat);
      nose.position.z = -1.6;
      g.add(nose);

      const core = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.65, 3.0), accentMat);
      g.add(core);

      const wingL = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.14, 1.35), whiteMat);
      wingL.position.set(-2.2, 0.05, 0.7);
      wingL.rotation.y = 0.26;
      g.add(wingL);

      const wingR = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.14, 1.35), whiteMat);
      wingR.position.set(2.2, 0.05, 0.7);
      wingR.rotation.y = -0.26;
      g.add(wingR);

      const finL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.1, 1.1), accentMat);
      finL.position.set(-3.9, 0.35, 1.1);
      finL.rotation.z = 0.35;
      g.add(finL);

      const finR = finL.clone();
      finR.position.set(3.9, 0.35, 1.1);
      finR.rotation.z = -0.35;
      g.add(finR);

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
    // True 3D Triangle-Strip Wingtip Contrail Ribbons (vivid glowing condensation streams!)
    this.ribbonMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      transparent: true,
      opacity: 0.62,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const createRibbon = () => {
      const geo = new THREE.BufferGeometry();
      const verts = new Float32Array(this.TRAIL_LENGTH * 2 * 3);
      const indices: number[] = [];
      for (let i = 0; i < this.TRAIL_LENGTH - 1; i++) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
      geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      geo.setIndex(indices);
      return geo;
    };

    this.ribbonGeoLeft = createRibbon();
    this.ribbonGeoRight = createRibbon();

    const mL = new THREE.Mesh(this.ribbonGeoLeft, this.ribbonMat);
    const mR = new THREE.Mesh(this.ribbonGeoRight, this.ribbonMat);
    mL.frustumCulled = false;
    mR.frustumCulled = false;
    this.scene.add(mL, mR);
  }

  private createSkyscraperTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 256, 512);

    const cols = 14;
    const rows = 48;
    const cw = 256 / cols;
    const ch = 512 / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() > 0.35) {
          const rnd = Math.random();
          ctx.fillStyle = rnd > 0.85 ? '#fef08a' : rnd > 0.45 ? '#7dd3fc' : '#38bdf8';
          ctx.fillRect(c * cw + 2, r * ch + 2, cw - 4, ch - 3);
        }
      }
    }
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(0, 0, 4, 512);
    ctx.fillRect(126, 0, 4, 512);
    ctx.fillRect(252, 0, 4, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 5);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // -------------------------------------------------------------
  // 5. SPLINE-FLANKING TOWERS, HIGH-CONTRAST ENEMIES & REPO RUPEES
  // -------------------------------------------------------------
  private createWorldEntitiesAndEncounterWave() {
    const skyscraperTex = this.createSkyscraperTexture();
    const towerMat = new THREE.MeshStandardMaterial({
      map: skyscraperTex,
      metalness: 0.72,
      roughness: 0.28,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.28,
      emissiveMap: skyscraperTex,
    });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 });
    const cyanNeonMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2a6d });

    // Strictly Spline-Flanking Ocean Skyscrapers (±72m to ±92m Left/Right -> NEVER blocking sightlines!)
    const towerStations: Array<{ u: number; side: number; lat: number; h: number }> = [
      { u: 0.025, side: -1, lat: 76, h: 220 },
      { u: 0.030, side: 1, lat: 78, h: 240 },
      { u: 0.075, side: -1, lat: 84, h: 260 },
      { u: 0.085, side: 1, lat: 86, h: 230 },
      { u: 0.80, side: -1, lat: 88, h: 270 },
      { u: 0.81, side: 1, lat: 90, h: 290 },
      { u: 0.87, side: -1, lat: 95, h: 300 },
      { u: 0.88, side: 1, lat: 92, h: 280 },
    ];

    towerStations.forEach((st) => {
      const p = this.splineCurve.getPointAt(st.u);
      const fwd = this.splineCurve.getTangentAt(st.u).normalize();
      const right = new THREE.Vector3().crossVectors(fwd, this.tmpUpRef).normalize();
      const pos = p.clone().addScaledVector(right, st.side * st.lat);

      const g = new THREE.Group();
      const centerY = st.h * 0.45;
      g.position.set(pos.x, centerY, pos.z);

      g.add(new THREE.Mesh(new THREE.CylinderGeometry(12, 19, st.h, 16), towerMat));

      const pontoon = new THREE.Mesh(new THREE.CylinderGeometry(28, 34, 9, 16), baseMat);
      pontoon.position.y = -centerY + this.WATER_Y;
      g.add(pontoon);

      const baseRing = new THREE.Mesh(new THREE.TorusGeometry(30, 1.2, 8, 24).rotateX(Math.PI / 2), cyanNeonMat);
      baseRing.position.y = -centerY + this.WATER_Y + 4;
      g.add(baseRing);

      const collar = new THREE.Mesh(new THREE.TorusGeometry(17, 1.5, 8, 24).rotateX(Math.PI / 2), cyanNeonMat);
      collar.position.y = st.h * 0.22;
      g.add(collar);

      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 2.0, 50, 8), baseMat);
      spire.position.y = st.h * 0.5 + 25;
      g.add(spire);

      const beacon = new THREE.Mesh(new THREE.SphereGeometry(2.2, 8, 8), beaconMat);
      beacon.position.y = st.h * 0.5 + 50;
      g.add(beacon);
      this.navBeacons.push(beacon);

      this.scene.add(g);

      this.colliders.push({
        position: new THREE.Vector3(pos.x, centerY, pos.z),
        radius: 17,
        halfHeight: st.h * 0.5 + 20,
        type: 'tower',
      });
    });

    // Golden Boost Arches
    [0.09, 0.31, 0.57, 0.80].forEach((u) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      this.spawnBoostArch(pos, tangent);
    });

    // Shield Rings
    [0.16, 0.42, 0.67, 0.85].forEach((u, i) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, this.tmpUpRef).normalize();
      pos.addScaledVector(right, (i % 2 === 0 ? 1 : -1) * 14);
      this.spawnCollectRing(pos, tangent, 'shield_ring', 0x00f0ff);
    });

    // Weapon Upgrade Pods
    [0.21, 0.51].forEach((u) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      this.spawnCollectRing(pos, tangent, 'weapon_pod', 0x22c55e);
    });

    // Laser Barrier Gates
    [0.36, 0.63, 0.77].forEach((u) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      this.spawnLaserGate(pos, tangent);
    });

    // High-Contrast Interceptor Squadrons, Energy Crystals, Mines & Giant Hyrule Rupees!
    for (let u = 0.05; u <= 0.83; u += 0.055) {
      const center = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, this.tmpUpRef).normalize();

      const squadCount = u < 0.2 ? 3 : 4;
      for (let k = 0; k < squadCount; k++) {
        const offsetX = (k - (squadCount - 1) / 2) * 20;
        const offsetY = k % 2 === 0 ? 4 : -4;
        const pos = center.clone().addScaledVector(right, offsetX);
        pos.y += offsetY;
        this.spawnDartDrone(pos, tangent, k * 1.4, 11 + k * 2, 4.0);
      }

      if (Math.round(u * 100) % 2 === 0) {
        const cPos = center.clone().addScaledVector(right, (Math.random() - 0.5) * 40);
        cPos.y += (Math.random() - 0.5) * 10;
        this.spawnEnergyCrystal(cPos);
      } else if (Math.round(u * 100) % 3 === 0) {
        // Giant Hyrule Rupee Bonus Clusters from Zelda Collectibles!
        const rPos = center.clone().addScaledVector(right, (Math.random() - 0.5) * 32);
        this.spawnGiantRupee(rPos);
      } else {
        const mPos = center.clone().addScaledVector(right, (Math.random() - 0.5) * 36);
        mPos.y += (Math.random() - 0.5) * 8;
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

    // Flanking Aero-Carriers positioned clearly left/right of the harbor & bay
    const c1Pos = this.splineCurve.getPointAt(0.11);
    const c1Right = new THREE.Vector3().crossVectors(this.splineCurve.getTangentAt(0.11), this.tmpUpRef).normalize();
    this.spawnAeroCarrier(c1Pos.clone().addScaledVector(c1Right, -95).setY(88));

    const c2Pos = this.splineCurve.getPointAt(0.83);
    const c2Right = new THREE.Vector3().crossVectors(this.splineCurve.getTangentAt(0.83), this.tmpUpRef).normalize();
    this.spawnAeroCarrier(c2Pos.clone().addScaledVector(c2Right, 98).setY(92));

    // ZONE 4 FINALE: Corneria Dreadnought Boss
    this.spawnDreadnoughtBoss(new THREE.Vector3(0, 56, -1680));
  }

  private spawnBoostArch(pos: THREE.Vector3, tangent: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.lookAt(pos.clone().add(tangent));

    const archMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.85 });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(28, 3.0, 12, 36, Math.PI), archMat);
    arch.position.y = -4;
    g.add(arch);

    const field = new THREE.Mesh(
      new THREE.CircleGeometry(26, 24, 0, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.26, side: THREE.DoubleSide })
    );
    field.position.y = -4;
    g.add(field);

    this.scene.add(g);
    this.archesAndRings.push({ mesh: g, position: pos.clone(), radius: 28, type: 'boost_arch', collected: false });

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

    g.add(new THREE.Mesh(new THREE.TorusGeometry(11.5, 0.85, 10, 28), new THREE.MeshBasicMaterial({ color: colorHex })));
    if (type === 'weapon_pod') {
      g.add(
        new THREE.Mesh(
          new THREE.OctahedronGeometry(3.6, 0),
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

    const pylonMat = new THREE.MeshStandardMaterial({
      map: this.stoneBrickTex,
      color: 0x475569,
      metalness: 0.65,
      roughness: 0.35,
    });
    const right = new THREE.Vector3().crossVectors(tangent, this.tmpUpRef).normalize();
    [-32, 32].forEach((x) => {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.4, 48, 10), pylonMat);
      pylon.position.set(x, 0, 0);
      g.add(pylon);

      this.colliders.push({
        position: pos.clone().addScaledVector(right, x),
        radius: 4.2,
        halfHeight: 24,
        type: 'arch_pillar',
      });
    });

    const barrier = new THREE.Mesh(
      new THREE.PlaneGeometry(62, 22),
      new THREE.MeshBasicMaterial({ color: 0xff0055, transparent: true, opacity: 0.36, side: THREE.DoubleSide })
    );
    g.add(barrier);

    const coreGroup = new THREE.Group();
    coreGroup.add(
      new THREE.Mesh(
        new THREE.OctahedronGeometry(5.6, 0),
        new THREE.MeshStandardMaterial({ color: 0xff3366, emissive: 0xff0055, emissiveIntensity: 1.6 })
      )
    );
    coreGroup.position.copy(pos);
    this.scene.add(g, coreGroup);

    this.enemies.push({
      id: this.nextEnemyId++,
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
      hitRadius: 10.5,
      bodyRadius: 12.0,
      linkedBarrier: barrier,
    });
  }

  private spawnDartDrone(
    pos: THREE.Vector3,
    tangent: THREE.Vector3,
    phase: number,
    ampX: number,
    ampY: number
  ) {
    // High-contrast, sharply recognizable Venomian Fighter Squadron!
    const g = new THREE.Group();
    g.position.copy(pos);
    g.lookAt(pos.clone().sub(tangent));
    g.scale.setScalar(1.85);

    const darkChassis = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.85, roughness: 0.25 });
    const crimsonWing = new THREE.MeshStandardMaterial({
      color: 0xe11d48,
      metalness: 0.45,
      roughness: 0.3,
      emissive: 0x881337,
      emissiveIntensity: 0.35,
    });
    const visorGlow = new THREE.MeshBasicMaterial({ color: 0xff9e00 });
    const thrusterGlow = new THREE.MeshBasicMaterial({ color: 0xff1e56 });

    // Nose & Fuselage
    const fuselage = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.6, 6).rotateX(Math.PI / 2), darkChassis);
    g.add(fuselage);

    // Forward-swept jagged Venomian wing blades (distinct silhouette from Arwing!)
    const wingL = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.22, 1.5), crimsonWing);
    wingL.position.set(-2.0, 0, -0.35);
    wingL.rotation.y = 0.42;
    g.add(wingL);

    const wingR = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.22, 1.5), crimsonWing);
    wingR.position.set(2.0, 0, -0.35);
    wingR.rotation.y = -0.42;
    g.add(wingR);

    // Bright glowing Cockpit Eye & Wingtip Fins
    const cockpit = new THREE.Mesh(new THREE.SphereGeometry(0.58, 8, 8), visorGlow);
    cockpit.position.set(0, 0.35, 0.8);
    g.add(cockpit);

    const engineGlow = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), thrusterGlow);
    engineGlow.position.set(0, 0, -2.3);
    g.add(engineGlow);

    this.scene.add(g);
    this.enemies.push({
      id: this.nextEnemyId++,
      mesh: g,
      type: 'drone',
      health: 22,
      maxHealth: 22,
      points: 250,
      basePos: pos.clone(),
      movePhase: phase,
      moveAmpX: ampX,
      moveAmpY: ampY,
      fireCooldown: 1.8 + Math.random() * 1.8,
      destroyed: false,
      hitRadius: 8.5,
      bodyRadius: 5.5,
      baseScale: 1.85,
    });
  }

  private spawnHeavyCorvette(pos: THREE.Vector3, tangent: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.lookAt(pos.clone().sub(tangent));
    g.scale.setScalar(1.45);

    const hullMat = new THREE.MeshStandardMaterial({
      map: this.arwingHullTex,
      color: 0x334155,
      metalness: 0.85,
      roughness: 0.25,
    });
    const crimsonTrim = new THREE.MeshStandardMaterial({ color: 0xe11d48, metalness: 0.5, roughness: 0.3 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2e63 });

    g.add(new THREE.Mesh(new THREE.BoxGeometry(7.2, 3.0, 16), hullMat));
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(3.6, 2.4, 5.2), crimsonTrim);
    bridge.position.set(0, 2.5, -2.0);
    g.add(bridge);

    const wings = new THREE.Mesh(new THREE.BoxGeometry(22, 0.9, 5.6), hullMat);
    wings.position.set(0, 0.2, -1);
    g.add(wings);

    [-7, 0, 7].forEach((xOff) => {
      const vent = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.95, 2.0, 8), glowMat);
      vent.position.set(xOff, 1.0, 2.0);
      g.add(vent);
    });

    this.scene.add(g);
    this.enemies.push({
      id: this.nextEnemyId++,
      mesh: g,
      type: 'corvette',
      health: 95,
      maxHealth: 95,
      points: 850,
      basePos: pos.clone(),
      movePhase: Math.random() * 6,
      moveAmpX: 16,
      moveAmpY: 5,
      fireCooldown: 2.0,
      destroyed: false,
      hitRadius: 12.5,
      bodyRadius: 10.5,
      baseScale: 1.45,
    });
  }

  private spawnEnergyCrystal(pos: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.add(
      new THREE.Mesh(
        new THREE.OctahedronGeometry(3.8, 0),
        new THREE.MeshStandardMaterial({ color: 0x00f5d4, emissive: 0x00bbf9, emissiveIntensity: 1.2, roughness: 0.1 })
      )
    );
    this.scene.add(g);
    this.enemies.push({
      id: this.nextEnemyId++,
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
      hitRadius: 8.0,
      bodyRadius: 4.5,
    });
  }

  private spawnGiantRupee(pos: THREE.Vector3) {
    // Giant Hyrule Rupee Gem Collectible (Green/Blue/Crimson)
    const g = new THREE.Group();
    g.position.copy(pos);
    const mat = new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: 0x059669,
      emissiveIntensity: 0.9,
      metalness: 0.85,
      roughness: 0.1,
    });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(3.4, 0), mat);
    gem.scale.set(0.75, 1.5, 0.75);
    g.add(gem);
    this.scene.add(g);

    this.enemies.push({
      id: this.nextEnemyId++,
      mesh: g,
      type: 'rupee_bonus',
      health: 8,
      maxHealth: 8,
      points: 400,
      basePos: pos.clone(),
      movePhase: 0,
      moveAmpX: 0,
      moveAmpY: 0,
      fireCooldown: 9999,
      destroyed: false,
      hitRadius: 8.5,
      bodyRadius: 6.0,
    });
  }

  private spawnNavalMine(pos: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.add(
      new THREE.Mesh(
        new THREE.IcosahedronGeometry(3.5, 0),
        new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, emissive: 0xff5500, emissiveIntensity: 1.1 })
      )
    );
    g.add(new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.25, 6, 18), new THREE.MeshBasicMaterial({ color: 0xff9e00 })));
    this.scene.add(g);
    this.enemies.push({
      id: this.nextEnemyId++,
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
      hitRadius: 8.0,
      bodyRadius: 5.0,
    });
  }

  private spawnAeroCarrier(startPos: THREE.Vector3) {
    const cruiser = new THREE.Group();
    cruiser.position.copy(startPos);
    const hullMat = new THREE.MeshStandardMaterial({
      map: this.arwingHullTex,
      color: 0x334155,
      metalness: 0.78,
      roughness: 0.35,
    });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.3 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00b4d8 });

    cruiser.add(new THREE.Mesh(new THREE.BoxGeometry(50, 16, 150), hullMat));
    const tower = new THREE.Mesh(new THREE.BoxGeometry(16, 22, 34), trimMat);
    tower.position.set(10, 18, -25);
    cruiser.add(tower);

    const wings = new THREE.Mesh(new THREE.BoxGeometry(125, 5, 70), trimMat);
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

    const armorMat = new THREE.MeshStandardMaterial({
      map: this.arwingHullTex,
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.25,
    });
    const crimsonAccent = new THREE.MeshStandardMaterial({ color: 0xbe123c, metalness: 0.6, roughness: 0.3 });
    const redGlowMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });

    boss.add(new THREE.Mesh(new THREE.BoxGeometry(88, 26, 220), armorMat));
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(36, 26, 52), armorMat);
    bridge.position.set(0, 22, 28);
    boss.add(bridge);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(175, 7, 78), crimsonAccent);
    wing.position.set(0, 2, -10);
    boss.add(wing);

    this.scene.add(boss);
    this.dreadnoughtGroup = boss;

    [
      new THREE.Vector3(-48, 8, 45),
      new THREE.Vector3(48, 8, 45),
      new THREE.Vector3(0, 22, 62),
    ].forEach((off) => {
      const cGroup = new THREE.Group();
      const worldCorePos = centerPos.clone().add(off);
      cGroup.position.copy(worldCorePos);
      cGroup.add(new THREE.Mesh(new THREE.SphereGeometry(7.5, 14, 14), redGlowMat));
      cGroup.add(
        new THREE.Mesh(new THREE.TorusGeometry(10.0, 0.8, 8, 22), new THREE.MeshBasicMaterial({ color: 0xfacc15 }))
      );
      this.scene.add(cGroup);

      const coreEntity: EnemyEntity = {
        id: this.nextEnemyId++,
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
        hitRadius: 14.0,
        bodyRadius: 10.0,
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
      const radius = 8.5 + Math.random() * 25.0;
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
      new THREE.LineBasicMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.28 })
    );
    this.camera.add(this.speedLinesMesh);
    this.scene.add(this.camera);
  }

  private createWaterSpray() {
    const count = 90;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 12;
      pos[i * 3 + 1] = Math.random() * 3.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.waterSprayParticles = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        map: this.glowSpriteTex,
        color: 0xe0f2fe,
        size: 1.6,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
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
    let bestDot = 0.978;

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
      mf.scale.setScalar(1.4);
    });

    if (lvl === 1) {
      this.spawnPlayerLaser(-1.7, -0.24, -2.9, aimDir, 1, 25, null);
      this.spawnPlayerLaser(1.7, -0.24, -2.9, aimDir, 1, 25, null);
    } else if (lvl === 2) {
      this.spawnPlayerLaser(-1.75, -0.24, -2.9, aimDir, 2, 30, lockedEnemy);
      this.spawnPlayerLaser(1.75, -0.24, -2.9, aimDir, 2, 30, lockedEnemy);
      this.spawnPlayerLaser(0, 0.15, -4.0, aimDir, 2, 26, lockedEnemy);
    } else {
      this.spawnPlayerLaser(-1.95, -0.24, -2.9, aimDir, 3, 36, lockedEnemy);
      this.spawnPlayerLaser(1.95, -0.24, -2.9, aimDir, 3, 36, lockedEnemy);
      this.spawnPlayerLaser(0, 0.2, -4.0, aimDir, 3, 36, lockedEnemy);
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
      velocity: aimDir.clone().multiplyScalar(450),
      isPlayer: true,
      damage,
      lifetime: 1.75,
      homingTarget: lvl >= 2 ? homingTarget : null,
    });
  }

  private releaseChargeShot() {
    starFoxAudio.playChargeShot();
    this.cameraShakeIntensity = Math.max(this.cameraShakeIntensity, 0.2);
    this.shipMesh.getWorldQuaternion(this.tmpQuat);
    const { aimDir, lockedEnemy } = this.getShipAimDirection(this.tmpQuat, this.shipGroup.position);

    const chargeGroup = new THREE.Group();
    chargeGroup.add(
      new THREE.Mesh(
        new THREE.SphereGeometry(2.5, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.85 })
      )
    );
    chargeGroup.add(new THREE.Mesh(new THREE.SphereGeometry(1.4, 10, 10), this.laserCoreMat));
    chargeGroup.add(
      new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.25, 8, 24), new THREE.MeshBasicMaterial({ color: 0xfacc15 }))
    );

    const worldPos = new THREE.Vector3(0, 0, -5.2).applyMatrix4(this.shipMesh.matrixWorld);
    chargeGroup.position.copy(worldPos);

    this.scene.add(chargeGroup);
    this.projectiles.push({
      mesh: chargeGroup,
      position: chargeGroup.position,
      velocity: aimDir.clone().multiplyScalar(320),
      isPlayer: true,
      damage: 220,
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
      if (!p.isPlayer && p.position.distanceTo(this.shipGroup.position) < 48) {
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

    const bombCenter = this.shipGroup.position.clone().addScaledVector(this.tmpRailFwd, 110);
    this.spawnExplosionFX(bombCenter, 70, 0x00f5d4);
    this.spawnExplosionParticles(bombCenter, 55, 0x38bdf8);

    this.enemies.forEach((enemy) => {
      if (!enemy.destroyed && enemy.mesh.position.distanceTo(this.shipGroup.position) < 560) {
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
      maxAge: 0.5,
      maxScale,
    });
  }

  private destroyEnemy(enemy: EnemyEntity) {
    enemy.destroyed = true;
    this.scene.remove(enemy.mesh);
    if (enemy.linkedBarrier) enemy.linkedBarrier.visible = false;

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
      guardian: 'STONE GUARDIAN',
      talus: 'STONE TALUS',
      rupee_bonus: 'HYRULE RUPEE',
      gate_core: 'GATE OPENED',
      boss_core: 'REACTOR CORE',
    };
    this.state.lastKillText =
      this.state.combo > 1
        ? `${labelMap[enemy.type]} +${earnedPoints} (${this.state.combo}x COMBO!)`
        : `${labelMap[enemy.type]} +${earnedPoints}`;
    this.killTextTimer = 1.65;

    starFoxAudio.playExplosion();
    const isBig =
      enemy.type === 'boss_core' ||
      enemy.type === 'corvette' ||
      enemy.type === 'gate_core' ||
      enemy.type === 'guardian' ||
      enemy.type === 'talus';
    const fxColor =
      enemy.type === 'crystal' || enemy.type === 'rupee_bonus'
        ? 0x00f5d4
        : enemy.type === 'guardian'
        ? 0xd946ef
        : 0xff7b00;
    this.spawnExplosionFX(enemy.mesh.position, isBig ? 36 : 20, fxColor);
    this.spawnExplosionParticles(enemy.mesh.position, isBig ? 42 : 26, fxColor);

    if (enemy.type === 'mine') {
      this.enemies.forEach((other) => {
        if (!other.destroyed && other.mesh.position.distanceTo(enemy.mesh.position) < 48) {
          other.health -= 75;
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
        this.spawnExplosionFX(this.dreadnoughtGroup.position, 88, 0x00f5d4);
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
      const speed = 22 + Math.random() * 46;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      velocities[i * 3 + 0] = Math.sin(phi) * Math.cos(theta) * speed;
      velocities[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
      velocities[i * 3 + 2] = Math.cos(phi) * speed;
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      map: this.glowSpriteTex,
      color: colorHex,
      size: 4.5,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    this.scene.add(points);
    this.particlePools.push({ points, velocities, age: 0 });
  }

  // -------------------------------------------------------------
  // MAIN SIMULATION TICK
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

    // 1. Speed & Boost/Brake + Sonic Boom Ignition
    let speedMult = 1.0;
    const activeBoost = this.isBoosting && !this.state.isOverheated;
    if (activeBoost && !this.wasBoosting) {
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
    else if (progressU < 0.42) this.state.zoneName = 'KAKARIKO & HYRULE LAKE';
    else if (progressU < 0.70) this.state.zoneName = 'ANCIENT RUINS & PEAKS';
    else this.state.zoneName = 'DREADNOUGHT SHOWDOWN';

    if (progressU >= 0.992 && !this.state.isMissionComplete) {
      this.state.isMissionComplete = true;
      this.notifyState();
    }

    this.splineCurve.getPointAt(progressU, this.tmpRailPos);
    this.splineCurve.getTangentAt(progressU, this.tmpRailFwd).normalize();
    this.tmpRailRight.crossVectors(this.tmpRailFwd, this.tmpUpRef).normalize();
    this.tmpRailUp.crossVectors(this.tmpRailRight, this.tmpRailFwd).normalize();

    const turnDelta = this.tmpVec1.copy(this.tmpRailFwd).sub(this.prevTangent);
    const turnSide = turnDelta.dot(this.tmpRailRight) / Math.max(0.005, dt);
    this.prevTangent.copy(this.tmpRailFwd);
    const targetSplineBank = THREE.MathUtils.clamp(-turnSide * 0.45, -0.24, 0.24);
    this.currentSplineBank = THREE.MathUtils.lerp(this.currentSplineBank, targetSplineBank, dt * 3.0);

    // 3. Agile Flight Movement over Generous Corridor
    const maxLatSpeed = 62.0;
    const maxVertSpeed = 48.0;
    this.shipVelX = THREE.MathUtils.lerp(this.shipVelX, this.inputYawRoll * maxLatSpeed, dt * 13.0);
    this.shipVelY = THREE.MathUtils.lerp(this.shipVelY, this.inputPitch * maxVertSpeed, dt * 13.0);

    this.shipLocalPos.x = THREE.MathUtils.clamp(this.shipLocalPos.x + this.shipVelX * dt, -58, 58);
    this.shipLocalPos.y = THREE.MathUtils.clamp(this.shipLocalPos.y + this.shipVelY * dt, -18, 48);

    const worldShipPos = this.tmpVec2
      .copy(this.tmpRailPos)
      .addScaledVector(this.tmpRailRight, this.shipLocalPos.x)
      .addScaledVector(this.tmpRailUp, this.shipLocalPos.y);

    // 4. REAL TERRAIN & OCEAN FLOOR COLLISION
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

    // 5. SOLID 3D COLLISION WITH TOWERS, CARRIERS, ARCH PILLARS & ZELDA BUILDINGS
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
      (this.barrelRollRing.material as THREE.MeshBasicMaterial).opacity = Math.sin(rollProgress * Math.PI) * 0.75;
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

    // 7. Flaps, Plasma Afterburners & Contrail Ribbon Color Shift
    const flapAngle = this.isBraking ? THREE.MathUtils.degToRad(40.0) : 0;
    this.leftFlap.rotation.x = THREE.MathUtils.lerp(this.leftFlap.rotation.x, flapAngle, dt * 12.0);
    this.rightFlap.rotation.x = THREE.MathUtils.lerp(this.rightFlap.rotation.x, flapAngle, dt * 12.0);

    const flameScale = activeBoost ? 3.2 : this.isBraking ? 0.35 : 1.15;
    const flameHex = activeBoost ? 0xff8800 : 0x00f0ff;
    this.thrusterFlames.forEach((f) => {
      f.scale.set(1.0 + Math.random() * 0.14, 1.0 + Math.random() * 0.14, flameScale);
      (f.material as THREE.MeshBasicMaterial).color.setHex(flameHex);
    });
    this.thrusterCores.forEach((c) => {
      c.scale.set(1.0, 1.0, flameScale * 0.85);
    });
    this.ribbonMat.color.setHex(activeBoost ? 0xf59e0b : 0x00f0ff);
    this.ribbonMat.opacity = activeBoost ? 0.82 : 0.56;

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

    // 10. Direct 60FPS HUD Reticle & Tactical Target Diamonds Callback (Zero React overhead!)
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

    if (this.onTargetsUpdate) {
      this.projectedTargetsBuffer.length = 0;
      const shipForward = this.tmpVec4.set(0, 0, -1).applyQuaternion(this.shipGroup.quaternion).normalize();
      for (const enemy of this.enemies) {
        if (enemy.destroyed || enemy.type === 'crystal' || enemy.type === 'rupee_bonus') continue;
        const toE = this.tmpVec1.subVectors(enemy.mesh.position, worldShipPos);
        const dist = toE.length();
        if (dist > 340 || dist < 12) continue;
        if (toE.dot(shipForward) <= 0) continue; // Only enemies ahead of the Arwing

        const proj = this.tmpVec3.copy(enemy.mesh.position).project(this.camera);
        if (proj.z > 1) continue;
        const sx = (proj.x + 1) * 50;
        const sy = (1 - proj.y) * 50;
        if (sx < 4 || sx > 96 || sy < 6 || sy > 94) continue;

        this.projectedTargetsBuffer.push({
          id: enemy.id,
          x: sx,
          y: sy,
          hpRatio: Math.max(0, enemy.health / enemy.maxHealth),
          distance: dist,
          isLocked: enemy === lockedEnemy,
          isPriority: enemy.type === 'corvette' || enemy.type === 'boss_core' || enemy.type === 'gate_core',
        });
      }
      this.projectedTargetsBuffer.sort((a, b) => a.distance - b.distance);
      if (this.projectedTargetsBuffer.length > 5) this.projectedTargetsBuffer.length = 5;
      this.onTargetsUpdate(this.projectedTargetsBuffer);
    }

    // 11. Wingmen & 3D Tapered Wingtip Contrail Ribbons
    this.wingmen.forEach((w) => {
      const wTarget = this.tmpVec1
        .copy(this.tmpRailPos)
        .addScaledVector(this.tmpRailRight, w.offset.x + Math.sin(this.totalTime * 1.2 + w.phase) * 5)
        .addScaledVector(this.tmpRailUp, w.offset.y + Math.cos(this.totalTime * 1.5 + w.phase) * 3)
        .addScaledVector(this.tmpRailFwd, -w.offset.z);
      w.group.position.lerp(wTarget, dt * 5.0);
      w.group.quaternion.setFromRotationMatrix(this.tmpBasis);
      w.group.rotation.z = Math.sin(this.totalTime * 1.2 + w.phase) * 0.25;
    });

    this.shipMesh.updateMatrixWorld();
    const leftTip = new THREE.Vector3(-5.15, 0.9, 1.95).applyMatrix4(this.shipMesh.matrixWorld);
    const rightTip = new THREE.Vector3(5.15, 0.9, 1.95).applyMatrix4(this.shipMesh.matrixWorld);
    this.wingtipPointsLeft.unshift(leftTip);
    this.wingtipPointsRight.unshift(rightTip);
    if (this.wingtipPointsLeft.length > this.TRAIL_LENGTH) this.wingtipPointsLeft.pop();
    if (this.wingtipPointsRight.length > this.TRAIL_LENGTH) this.wingtipPointsRight.pop();

    const upVec = this.tmpVec1.copy(this.tmpRailUp);
    const updateRibbon = (pts: THREE.Vector3[], fallback: THREE.Vector3, geo: THREE.BufferGeometry) => {
      const arr = (geo.attributes.position as THREE.BufferAttribute).array as Float32Array;
      for (let i = 0; i < this.TRAIL_LENGTH; i++) {
        const pt = pts[i] || fallback;
        const taper = (1 - i / this.TRAIL_LENGTH) * (activeBoost ? 0.36 : 0.22);
        const idx = i * 6;
        arr[idx + 0] = pt.x + upVec.x * taper;
        arr[idx + 1] = pt.y + upVec.y * taper;
        arr[idx + 2] = pt.z + upVec.z * taper;
        arr[idx + 3] = pt.x - upVec.x * taper;
        arr[idx + 4] = pt.y - upVec.y * taper;
        arr[idx + 5] = pt.z - upVec.z * taper;
      }
      geo.attributes.position.needsUpdate = true;
    };
    updateRibbon(this.wingtipPointsLeft, leftTip, this.ribbonGeoLeft);
    updateRibbon(this.wingtipPointsRight, rightTip, this.ribbonGeoRight);

    // 12. Lightweight World Updates
    this.terrainManager.updateTime(this.totalTime);
    this.waterManager.update(this.totalTime, dt);
    this.skyLighting.update(dt, worldShipPos);
    if (this.skyLighting.dirLight) {
      // Lock key sunlight angle & intensity consistently across high contrast flight
      this.skyLighting.dirLight.intensity = 2.15;
      this.skyLighting.dirLight.color.setHex(0xfff1cc);
    }
    if (this.outerOceanMaterial) this.outerOceanMaterial.uniforms.uTime.value = this.totalTime;

    this.windmills.forEach((rotor) => {
      rotor.rotation.z += dt * 1.4;
    });

    const pulseScale = 0.8 + Math.abs(Math.sin(this.totalTime * 4.2)) * 0.65;
    this.navBeacons.forEach((b) => b.scale.setScalar(pulseScale));

    const nearWater = worldShipPos.y <= this.WATER_Y + 12.0;
    this.waterSprayParticles.visible = nearWater;
    if (nearWater) {
      this.waterSprayParticles.position.set(worldShipPos.x, this.WATER_Y + 0.5, worldShipPos.z);
    }

    if (this.speedLinesMesh) {
      (this.speedLinesMesh.material as THREE.LineBasicMaterial).opacity = activeBoost ? 0.78 : 0.24;
      this.speedLinesMesh.rotation.z += dt * (activeBoost ? 3.2 : 0.8);
    }

    // 13. Frame-Driven 3D Fireball + Shockwave Explosion FX Tick
    for (let i = this.explosionFXList.length - 1; i >= 0; i--) {
      const fx = this.explosionFXList[i];
      fx.age += dt;
      const p = Math.min(1.0, fx.age / fx.maxAge);

      const fbScale = fx.maxScale * 0.48 * Math.sin(p * Math.PI);
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
      (pp.points.material as THREE.PointsMaterial).opacity = Math.max(0, 1.0 - pp.age * 1.5);
      if (pp.age >= 0.7) {
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
        this.spawnExplosionFX(ring.position, 18, 0x00f5d4);

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

    // 16. Boss Bar & Enemy Update
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
        const bs = enemy.baseScale || 1.0;
        enemy.mesh.scale.setScalar(bs * (enemy.hitFlashTimer > 0 ? 1.12 : 1.0));
      }

      if (
        enemy.type === 'crystal' ||
        enemy.type === 'rupee_bonus' ||
        enemy.type === 'mine' ||
        enemy.type === 'gate_core' ||
        enemy.type === 'boss_core'
      ) {
        enemy.mesh.rotation.y += dt * 1.8;
      }

      if (enemy.moveAmpX > 0 || enemy.moveAmpY > 0) {
        const dx = Math.cos(this.totalTime * 1.2 + enemy.movePhase) * enemy.moveAmpX;
        enemy.mesh.position.set(
          enemy.basePos.x + Math.sin(this.totalTime * 1.2 + enemy.movePhase) * enemy.moveAmpX,
          enemy.basePos.y + Math.cos(this.totalTime * 1.0 + enemy.movePhase) * enemy.moveAmpY,
          enemy.basePos.z
        );
        if (enemy.type === 'drone') {
          enemy.mesh.rotation.z = THREE.MathUtils.clamp(-dx * 0.05, -0.65, 0.65);
        }
      }

      const distToPlayer = enemy.mesh.position.distanceTo(worldShipPos);
      if (distToPlayer < enemy.bodyRadius + shipRadius) {
        if (enemy.type === 'crystal' || enemy.type === 'rupee_bonus') {
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
          enemy.fireCooldown = enemy.type === 'drone' ? 2.2 : enemy.type === 'guardian' || enemy.type === 'talus' ? 2.6 : 1.9;
          this.spawnHostileLaser(enemy.mesh.position, worldShipPos);
        }
      }
    });

    // 17. Projectiles Update (Homing + AoE Charge Blast)
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.lifetime -= dt;

      if (p.isPlayer && p.homingTarget && !p.homingTarget.destroyed) {
        const toTarget = this.tmpVec1.subVectors(p.homingTarget.mesh.position, p.position).normalize();
        const speed = p.velocity.length();
        p.velocity.normalize().lerp(toTarget, dt * 7.0).normalize().multiplyScalar(speed);
        p.mesh.lookAt(p.position.x + p.velocity.x, p.position.y + p.velocity.y, p.position.z + p.velocity.z);
      }

      p.position.addScaledVector(p.velocity, dt);

      if (p.isPlayer) {
        for (const enemy of this.enemies) {
          if (!enemy.destroyed && p.position.distanceTo(enemy.mesh.position) < (p.isChargeShot ? 22 : enemy.hitRadius)) {
            enemy.health -= p.damage;
            enemy.hitFlashTimer = 0.09;
            this.hitMarkerTimer = 0.14;
            p.lifetime = 0;

            if (p.isChargeShot) {
              this.spawnExplosionFX(p.position, 34, 0x38bdf8);
              this.enemies.forEach((other) => {
                if (!other.destroyed && other !== enemy && other.mesh.position.distanceTo(p.position) < 46) {
                  other.health -= 115;
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
    if (this.onDamageFlash) this.onDamageFlash();

    if (this.state.shield <= 0) {
      this.state.isGameOver = true;
      this.spawnExplosionFX(this.shipGroup.position, 44, 0xef4444);
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
    this.renderer.setSize(w, h, false);
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
