import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { TerrainManager } from '../Terrain';
import { WaterManager } from '../WaterShader';
import { SkyAndLightingManager } from '../SkyAndLighting';
import { FoliageManager } from '../Foliage';
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
  reticleNear: { x: number; y: number };
  reticleFar: { x: number; y: number };
  isTargetLocked: boolean;
  dialogue: {
    speaker: string;
    text: string;
    visible: boolean;
  } | null;
  isMissionComplete: boolean;
  isGameOver: boolean;
  shieldActive: boolean;
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
  linkedBarrier?: THREE.Mesh;
}

interface Projectile {
  mesh: THREE.Mesh;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  isPlayer: boolean;
  damage: number;
  lifetime: number;
  isChargeShot?: boolean;
}

interface RingItem {
  mesh: THREE.Group;
  position: THREE.Vector3;
  radius: number;
  type: 'boost_arch' | 'shield_ring' | 'speed_ring' | 'weapon_pod';
  collected: boolean;
}

export class StarFoxEngine {
  public canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private composer: EffectComposer | null = null;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;

  // Integrated Zelda World Subsystems
  private terrainManager!: TerrainManager;
  private waterManager!: WaterManager;
  private skyLighting!: SkyAndLightingManager;
  private foliageManager!: FoliageManager;
  private collectibleManager!: CollectibleManager;
  private buildingSystem!: BuildingSystem;

  // Extended Outer Ocean & Clouds
  private outerOceanMaterial!: THREE.ShaderMaterial;
  private cloudsGroup: THREE.Group = new THREE.Group();

  // Rail & Spline Path
  private splineCurve!: THREE.CatmullRomCurve3;
  public currentDistance = 0;
  private totalDistance = 5200;
  private baseSpeed = 108.0;
  private currentSpeed = 108.0;

  // Player ship & Wingmen
  private shipGroup!: THREE.Group;
  private shipMesh!: THREE.Group;
  private leftFlap!: THREE.Mesh;
  private rightFlap!: THREE.Mesh;
  private thrusterFlames: THREE.Mesh[] = [];
  private shieldBubble!: THREE.Mesh;
  private chargeSphere!: THREE.Mesh;
  public shieldActiveTimer = 0;
  private wingmen: { group: THREE.Group; offset: THREE.Vector3; phase: number; fireTimer: number }[] = [];

  // Agile Flight Kinematics
  public inputPitch = 0; // -1 to 1 (Up is positive)
  public inputYawRoll = 0; // -1 to 1 (Right is positive)
  public isBoosting = false;
  public isBraking = false;
  public isFiring = false;
  public autoFire = false;
  private fireCooldown = 0;
  private chargeTime = 0;
  private readonly MAX_CHARGE_TIME = 1.1;

  private shipLocalPos = new THREE.Vector3(0, 18, 0);
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
    speed: 108,
    progressPercent: 0,
    weaponLevel: 1,
    zoneName: 'CORNERIA OUTER BAY',
    bossHealth: null,
    reticleNear: { x: 50, y: 50 },
    reticleFar: { x: 50, y: 50 },
    isTargetLocked: false,
    dialogue: null,
    isMissionComplete: false,
    isGameOver: false,
    shieldActive: false,
  };

  public onStateUpdate?: (state: StarFoxState) => void;

  // World Entities
  private archesAndRings: RingItem[] = [];
  private enemies: EnemyEntity[] = [];
  private bossCores: EnemyEntity[] = [];
  private dreadnoughtGroup: THREE.Group | null = null;
  private projectiles: Projectile[] = [];
  private activeIntervals: number[] = [];

  // Particles & FX
  private waterSprayParticles!: THREE.Points;
  private speedLinesMesh!: THREE.LineSegments;
  private wingtipTrailGeoLeft!: THREE.BufferGeometry;
  private wingtipTrailGeoRight!: THREE.BufferGeometry;
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

  // Radio Dialogue Queue (mapped by progress 0..1)
  private dialogueEvents = [
    {
      u: 0.01,
      speaker: 'COMMANDER VANCE',
      text: 'All wings! Corneria Skyscrapers ahead — weave through the towers and engage forward interceptors!',
      duration: 4.5,
      triggered: false,
    },
    {
      u: 0.14,
      speaker: 'FALCO',
      text: 'Entering Hyrule Coastline! Watch for Sheikah ground guardians near the ruins!',
      duration: 4.2,
      triggered: false,
    },
    {
      u: 0.34,
      speaker: 'SLIPPY',
      text: 'Shoot the glowing cores on Laser Gates to shatter the barriers and grab weapon upgrades!',
      duration: 4.2,
      triggered: false,
    },
    {
      u: 0.52,
      speaker: 'PEPPY',
      text: 'Climbing Dragon Crest Peaks! Use Barrel Rolls to deflect enemy plasma bolts!',
      duration: 4.0,
      triggered: false,
    },
    {
      u: 0.72,
      speaker: 'COMMANDER VANCE',
      text: 'Hyrule Lake dive complete! Dreadnought Flagship spotted ahead — destroy its 3 Reactor Cores!',
      duration: 5.0,
      triggered: false,
    },
  ];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initThree();
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

  // -------------------------------------------------------------
  // INITIALIZATION (WITH ACES + BLOOM + OUTPUT PASS)
  // -------------------------------------------------------------
  private initThree() {
    this.scene = new THREE.Scene();

    const width = Math.max(this.canvas.clientWidth || window.innerWidth, 100);
    const height = Math.max(this.canvas.clientHeight || window.innerHeight, 100);

    this.camera = new THREE.PerspectiveCamera(70.0, width / height, 0.5, 14000);
    this.camera.position.set(0, 22, 600);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      precision: 'highp',
    });
    this.renderer.setSize(width, height);
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2.0);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    try {
      this.composer = new EffectComposer(this.renderer);
      this.composer.setPixelRatio(pixelRatio);
      this.composer.addPass(new RenderPass(this.scene, this.camera));

      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        0.38, // Crisp glowing plasma/engines without washing out terrain
        0.35,
        0.84
      );
      this.composer.addPass(bloomPass);
      this.composer.addPass(new OutputPass());
    } catch {
      this.composer = null;
    }
  }

  // -------------------------------------------------------------
  // INTEGRATE REAL ZELDA HYRULE LANDSCAPE, FOLIA, SHRINES & BUILDINGS
  // -------------------------------------------------------------
  private createHyruleIntegratedWorld() {
    this.terrainManager = new TerrainManager();
    const terrainMesh = this.terrainManager.createTerrainMesh();
    this.scene.add(terrainMesh);

    this.waterManager = new WaterManager();
    const hyruleWater = this.waterManager.createWaterMesh();
    this.scene.add(hyruleWater);
    this.scene.add(this.waterManager.effectsGroup);

    const isMobile =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      window.innerWidth < 1024;

    this.skyLighting = new SkyAndLightingManager(this.scene);
    this.skyLighting.initLighting(isMobile ? 'medium' : 'high');
    this.skyLighting.timeOfDay = 10.2;
    this.skyLighting.timeScale = 0.08; // Slowly shifts toward golden sunset over the flight!

    // Scale Zelda SkyDome to cover the grand aerial horizon and soften fog for long-range flight
    if (this.skyLighting.skyDome) {
      this.skyLighting.skyDome.scale.setScalar(18);
    }
    if (this.skyLighting.fog) {
      this.skyLighting.fog.density = 0.00038;
    }

    // Real Zelda Trees, Rocks, Ruins, Grass, Wildflowers & Alpine Snowfall!
    this.foliageManager = new FoliageManager(this.scene);
    this.foliageManager.init(isMobile ? 'medium' : 'high');

    // Real Zelda Sheikah Shrines with glowing cyan sky-beams & Treasures!
    this.collectibleManager = new CollectibleManager(this.scene);
    this.collectibleManager.initWorldObjects();

    // Real Zelda Landmarks (Castles, Windmills, Watchtowers along Hyrule hillsides)
    this.buildingSystem = new BuildingSystem(this.scene);
    const scenicLandmarks: Array<{ type: string; x: number; z: number; rotY: number; scale: number }> = [
      { type: 'catan_city', x: 75, z: 180, rotY: 0.5, scale: 1.5 },
      { type: 'windmill', x: 165, z: 45, rotY: -0.4, scale: 1.4 },
      { type: 'watchtower', x: 95, z: -90, rotY: 0.8, scale: 1.5 },
      { type: 'catan_settlement', x: -85, z: -120, rotY: 1.2, scale: 1.4 },
      { type: 'windmill', x: -125, z: 85, rotY: 0.2, scale: 1.3 },
      { type: 'watchtower', x: 12, z: -45, rotY: 0.0, scale: 1.6 },
    ];

    scenicLandmarks.forEach((lm) => {
      const y = TerrainManager.getTerrainHeight(lm.x, lm.z);
      if (y > TerrainManager.WATER_LEVEL + 0.8) {
        const mesh = this.buildingSystem.createStructureMesh(lm.type, false);
        mesh.position.set(lm.x, y, lm.z);
        mesh.rotation.y = lm.rotY;
        mesh.scale.setScalar(lm.scale);
        this.scene.add(mesh);
      }
    });
  }

  // -------------------------------------------------------------
  // SWEEPING WINDING 3D CIRCUIT OVER HYRULE + CORNERIA BAY
  // -------------------------------------------------------------
  private createSpline() {
    const rawWaypoints: Array<{ x: number; z: number; minAlt: number; clearance: number }> = [
      { x: 0, z: 680, minAlt: 18, clearance: 15 },       // Zone 1 Launch over Corneria Bay
      { x: 25, z: 500, minAlt: 20, clearance: 15 },      // Between glowing bay skyscrapers
      { x: 95, z: 320, minAlt: 24, clearance: 18 },      // Eastern coast beach entry
      { x: 195, z: 150, minAlt: 28, clearance: 18 },     // Over Whispering Forest Shrine & Windmill
      { x: 235, z: -20, minAlt: 24, clearance: 17 },     // Emerald Valley sweeping turn
      { x: 155, z: -155, minAlt: 13, clearance: 12 },    // Plunge low over Hyrule Lake waves!
      { x: 25, z: -255, minAlt: 26, clearance: 18 },     // Southern cliff curve past Catan Castle
      { x: -165, z: -175, minAlt: 24, clearance: 17 },   // Ancient Temple Ruins & Guardian Shrine
      { x: -235, z: -15, minAlt: 34, clearance: 20 },    // Western Canyon climb
      { x: -145, z: 140, minAlt: 56, clearance: 22 },    // High Dragon Crest Alpine Peaks!
      { x: -30, z: 220, minAlt: 62, clearance: 22 },     // Past Dragon Crest Shrine & Snow Clouds
      { x: 105, z: 165, minAlt: 46, clearance: 20 },     // Cloud layer dive back into Central Basin
      { x: 10, z: 30, minAlt: 20, clearance: 15 },       // Roar low past Shrine of Awakening
      { x: -45, z: -165, minAlt: 22, clearance: 16 },    // Outbound coastal strait
      { x: -20, z: -410, minAlt: 22, clearance: 18 },    // Outer Bay Gauntlet
      { x: 0, z: -680, minAlt: 28, clearance: 20 },      // Dreadnought Boss Arena
      { x: 0, z: -960, minAlt: 34, clearance: 20 },      // Victory Flyover under Ringed Planet
    ];

    const points = rawWaypoints.map((wp) => {
      let y = wp.minAlt;
      if (Math.abs(wp.x) < 395 && Math.abs(wp.z) < 395) {
        const groundY = TerrainManager.getTerrainHeight(wp.x, wp.z);
        y = Math.max(wp.minAlt, groundY + wp.clearance);
      }
      return new THREE.Vector3(wp.x, y, wp.z);
    });

    this.splineCurve = new THREE.CatmullRomCurve3(points, false, 'catmullrom', 0.45);
    this.totalDistance = this.splineCurve.getLength();
    this.prevTangent = this.splineCurve.getTangentAt(0).normalize();
  }

  // -------------------------------------------------------------
  // CELESTIAL RINGED PLANET
  // -------------------------------------------------------------
  private createSkyAndCelestial() {
    const planetGroup = new THREE.Group();
    planetGroup.position.set(1600, 1450, -5200);

    const planetGeo = new THREE.SphereGeometry(620, 48, 48);
    const planetMat = new THREE.MeshStandardMaterial({
      color: 0xe6eff8,
      roughness: 0.78,
      metalness: 0.05,
      emissive: 0x1e3a5f,
      emissiveIntensity: 0.25,
    });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planetGroup.add(planet);

    const ringGeo = new THREE.RingGeometry(820, 1550, 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xc8e0f4,
      roughness: 0.6,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.72,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.3;
    ring.rotation.y = -0.25;
    ring.rotation.z = 0.65;
    planetGroup.add(ring);

    this.scene.add(planetGroup);
  }

  // -------------------------------------------------------------
  // ENDLESS SURROUNDING CORNERIA BAY OCEAN
  // -------------------------------------------------------------
  private createOuterOcean() {
    const oceanGeo = new THREE.PlaneGeometry(14000, 14000, 96, 96);
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
          float w = sin(pos.x * 0.03 + uTime * 1.4) * cos(pos.z * 0.03 + uTime * 1.1) * 0.4;
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
          float spec = pow(max(0.0, dot(normal, halfDir)), 50.0);
          col += vec3(1.0, 0.96, 0.88) * spec * 1.1;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });

    const outerMesh = new THREE.Mesh(oceanGeo, this.outerOceanMaterial);
    // Placed 0.12m beneath Zelda WaterManager mesh so inside [-400,400] Hyrule WaterManager takes clean priority
    outerMesh.position.y = TerrainManager.WATER_LEVEL - 0.12;
    this.scene.add(outerMesh);
  }

  // -------------------------------------------------------------
  // VOLUMETRIC LAYERED CLOUDS IN THE SKY & MOUNTAIN PASSES
  // -------------------------------------------------------------
  private createClouds() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 0.82,
    });
    const puffGeo = new THREE.SphereGeometry(14, 12, 10);

    const cloudSpots = [
      new THREE.Vector3(-120, 72, 130),
      new THREE.Vector3(-45, 78, 215),
      new THREE.Vector3(60, 68, 175),
      new THREE.Vector3(160, 82, 40),
      new THREE.Vector3(-210, 74, -60),
      new THREE.Vector3(40, 85, -240),
      new THREE.Vector3(-90, 92, -480),
      new THREE.Vector3(120, 88, -620),
      new THREE.Vector3(-180, 90, 420),
      new THREE.Vector3(210, 95, 380),
    ];

    cloudSpots.forEach((spot) => {
      const cluster = new THREE.Group();
      cluster.position.copy(spot);
      for (let i = 0; i < 5; i++) {
        const puff = new THREE.Mesh(puffGeo, cloudMat);
        puff.position.set(
          (i - 2) * 14 + (Math.random() - 0.5) * 6,
          (Math.random() - 0.5) * 5,
          (Math.random() - 0.5) * 10
        );
        const sx = 1.2 + Math.random() * 0.9;
        const sy = 0.55 + Math.random() * 0.25;
        puff.scale.set(sx, sy, sx);
        cluster.add(puff);
      }
      this.cloudsGroup.add(cluster);
    });

    this.scene.add(this.cloudsGroup);
  }

  // -------------------------------------------------------------
  // PLAYER SHIP: ARWING - UNIFIED RIGHT-HANDED FRAME
  // Nose = -Z, Thrusters = +Z, Right Wing = +X, Left Wing = -X
  // -------------------------------------------------------------
  private createPlayerShip() {
    this.shipGroup = new THREE.Group();
    this.shipMesh = new THREE.Group();

    const ceramicMat = new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.22,
      metalness: 0.78,
    });
    const blueArmorMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.28,
      metalness: 0.85,
    });
    const redTrimMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.25,
      metalness: 0.65,
    });
    const canopyMat = new THREE.MeshPhysicalMaterial({
      color: 0x081a30,
      roughness: 0.05,
      metalness: 0.95,
      transmission: 0.85,
      ior: 1.5,
    });

    // 1. Sleek Needle Nose (-Z forward)
    const noseGeo = new THREE.ConeGeometry(0.85, 4.2, 6);
    noseGeo.rotateX(-Math.PI / 2);
    const nose = new THREE.Mesh(noseGeo, ceramicMat);
    nose.position.set(0, 0, -2.4);
    nose.castShadow = true;
    this.shipMesh.add(nose);

    // 2. Canopy
    const cockpitGeo = new THREE.ConeGeometry(0.7, 2.5, 6);
    cockpitGeo.rotateX(-Math.PI / 2);
    const cockpit = new THREE.Mesh(cockpitGeo, canopyMat);
    cockpit.position.set(0, 0.45, -1.3);
    this.shipMesh.add(cockpit);

    // 3. Central Armor Spine + Twin Side Fuselage Blasters
    const coreGeo = new THREE.BoxGeometry(1.65, 0.9, 3.6);
    const core = new THREE.Mesh(coreGeo, blueArmorMat);
    core.position.set(0, 0, 0.2);
    core.castShadow = true;
    this.shipMesh.add(core);

    [-1.4, 1.4].forEach((xOff) => {
      const gunPod = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 3.2, 8).rotateX(Math.PI / 2), blueArmorMat);
      gunPod.position.set(xOff, -0.1, -0.5);
      this.shipMesh.add(gunPod);
    });

    // 4. Swept Delta Wings (+X Right, -X Left)
    const wingGeo = new THREE.BufferGeometry();
    const wingVerts = new Float32Array([
      0.8, 0.06, 0.1, 5.0, 0.45, 1.9, 0.8, 0.0, 1.9,
      -0.8, 0.06, 0.1, -0.8, 0.0, 1.9, -5.0, 0.45, 1.9,
    ]);
    wingGeo.setAttribute('position', new THREE.BufferAttribute(wingVerts, 3));
    wingGeo.computeVertexNormals();
    const mainWings = new THREE.Mesh(wingGeo, ceramicMat);
    mainWings.castShadow = true;
    this.shipMesh.add(mainWings);

    // Wingtip Winglets
    const finGeo = new THREE.BoxGeometry(0.14, 1.35, 1.5);
    const leftFin = new THREE.Mesh(finGeo, redTrimMat);
    leftFin.position.set(-5.0, 0.55, 1.9);
    this.shipMesh.add(leftFin);

    const rightFin = new THREE.Mesh(finGeo, redTrimMat);
    rightFin.position.set(5.0, 0.55, 1.9);
    this.shipMesh.add(rightFin);

    // Airbrake Flaps
    const flapGeo = new THREE.BoxGeometry(1.5, 0.08, 0.65);
    this.leftFlap = new THREE.Mesh(flapGeo, redTrimMat);
    this.leftFlap.position.set(-2.6, 0.2, 2.0);
    this.shipMesh.add(this.leftFlap);

    this.rightFlap = new THREE.Mesh(flapGeo, redTrimMat);
    this.rightFlap.position.set(2.6, 0.2, 2.0);
    this.shipMesh.add(this.rightFlap);

    // 5. Afterburner Nozzles & Dynamic Plasma Plumes (+Z rear)
    const thrusterMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.9, roughness: 0.2 });
    const flameMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    const nozzlePositions = [
      new THREE.Vector3(-1.0, 0.1, 1.95),
      new THREE.Vector3(1.0, 0.1, 1.95),
      new THREE.Vector3(0.0, 0.45, 2.05),
    ];

    nozzlePositions.forEach((pos, idx) => {
      const nozzleGeo = new THREE.CylinderGeometry(0.36, 0.44, 0.95, 12);
      nozzleGeo.rotateX(Math.PI / 2);
      const nozzle = new THREE.Mesh(nozzleGeo, thrusterMat);
      nozzle.position.copy(pos);
      this.shipMesh.add(nozzle);

      const flameGeo = new THREE.ConeGeometry(0.34, 2.4 + (idx === 2 ? 0.7 : 0), 12);
      flameGeo.rotateX(Math.PI / 2);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(pos.x, pos.y, pos.z + 1.25);
      this.shipMesh.add(flame);
      this.thrusterFlames.push(flame);
    });

    // 6. Shield Energy Sphere (Strictly invisible unless hit or collecting Shield Ring!)
    const shieldGeo = new THREE.IcosahedronGeometry(4.3, 2);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.0,
    });
    this.shieldBubble = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldBubble.visible = false;
    this.shipMesh.add(this.shieldBubble);

    // 7. Nose Plasma Charge Sphere
    const chargeGeo = new THREE.SphereGeometry(0.55, 16, 16);
    const chargeMat = new THREE.MeshBasicMaterial({
      color: 0x48cae4,
      transparent: true,
      opacity: 0.0,
    });
    this.chargeSphere = new THREE.Mesh(chargeGeo, chargeMat);
    this.chargeSphere.position.set(0, 0, -4.5);
    this.shipMesh.add(this.chargeSphere);

    this.shipGroup.add(this.shipMesh);
    this.scene.add(this.shipGroup);
  }

  // -------------------------------------------------------------
  // AI ALLIED WINGMEN (FALCO & SLIPPY FLYING IN FORMATION)
  // -------------------------------------------------------------
  private createWingmen() {
    const offsets = [new THREE.Vector3(-24, 6, -32), new THREE.Vector3(24, 5, -36)];
    offsets.forEach((offset, idx) => {
      const wingman = this.buildMiniArwing(idx === 0 ? 0x10b981 : 0x3b82f6);
      this.scene.add(wingman);
      this.wingmen.push({ group: wingman, offset, phase: idx * Math.PI, fireTimer: 1.5 + idx });
    });
  }

  private buildMiniArwing(accentHex: number): THREE.Group {
    const g = new THREE.Group();
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.7, roughness: 0.3 });
    const accentMat = new THREE.MeshStandardMaterial({ color: accentHex, metalness: 0.8, roughness: 0.3 });
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.65, 3.2, 5).rotateX(-Math.PI / 2), whiteMat);
    nose.position.z = -1.5;
    g.add(nose);
    const wings = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.14, 1.4), accentMat);
    wings.position.z = 0.6;
    g.add(wings);
    const flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.28, 1.8, 8).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: accentHex })
    );
    flame.position.z = 2.0;
    g.add(flame);
    return g;
  }

  private createWingtipTrails() {
    const trailMat = new THREE.LineBasicMaterial({ color: 0x00e5ff, transparent: true, opacity: 0.75 });
    this.wingtipTrailGeoLeft = new THREE.BufferGeometry();
    this.wingtipTrailGeoRight = new THREE.BufferGeometry();
    const empty = new Float32Array(this.TRAIL_LENGTH * 3);
    this.wingtipTrailGeoLeft.setAttribute('position', new THREE.BufferAttribute(empty.slice(), 3));
    this.wingtipTrailGeoRight.setAttribute('position', new THREE.BufferAttribute(empty.slice(), 3));
    this.scene.add(new THREE.Line(this.wingtipTrailGeoLeft, trailMat));
    this.scene.add(new THREE.Line(this.wingtipTrailGeoRight, trailMat));
  }

  private createSkyscraperTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0c1626';
    ctx.fillRect(0, 0, 512, 1024);

    const cols = 24;
    const rows = 88;
    const cw = 512 / cols;
    const ch = 1024 / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() > 0.32) {
          const rnd = Math.random();
          ctx.fillStyle = rnd > 0.85 ? '#ffffff' : rnd > 0.45 ? '#7dd3fc' : '#38bdf8';
          ctx.fillRect(c * cw + 3, r * ch + 2, cw - 6, ch - 4);
        }
      }
    }
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(0, 0, 8, 1024);
    ctx.fillRect(252, 0, 8, 1024);
    ctx.fillRect(504, 0, 8, 1024);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 6);
    return tex;
  }

  // -------------------------------------------------------------
  // WORLD ENTITIES ALONG THE SPLINE: TOWERS, GATES, ENEMIES & BOSS
  // -------------------------------------------------------------
  private createWorldEntitiesAndEncounterWave() {
    const skyscraperTex = this.createSkyscraperTexture();
    const towerMat = new THREE.MeshStandardMaterial({
      map: skyscraperTex,
      metalness: 0.75,
      roughness: 0.25,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.35,
      emissiveMap: skyscraperTex,
    });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.85, roughness: 0.25 });
    const cyanNeonMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    // Corneria Bay Illuminated Towers flanking Ocean Entry (Zone 1) & Final Bay Arena (Zone 4)
    const towerCoords: Array<{ x: number; z: number; h: number }> = [
      { x: -65, z: 590, h: 170 },
      { x: 75, z: 540, h: 190 },
      { x: -75, z: 440, h: 210 },
      { x: 95, z: 420, h: 160 },
      { x: -95, z: -430, h: 190 },
      { x: 85, z: -470, h: 210 },
      { x: -115, z: -610, h: 230 },
      { x: 115, z: -640, h: 220 },
    ];

    towerCoords.forEach((tc) => {
      const g = new THREE.Group();
      g.position.set(tc.x, tc.h * 0.45, tc.z);

      const body = new THREE.Mesh(new THREE.CylinderGeometry(10, 16, tc.h, 24), towerMat);
      body.castShadow = true;
      g.add(body);

      const pontoon = new THREE.Mesh(new THREE.CylinderGeometry(24, 28, 7, 24), baseMat);
      pontoon.position.y = -tc.h * 0.45;
      g.add(pontoon);

      const baseRing = new THREE.Mesh(new THREE.TorusGeometry(26, 1.1, 10, 32).rotateX(Math.PI / 2), cyanNeonMat);
      baseRing.position.y = -tc.h * 0.45 + 3.5;
      g.add(baseRing);

      const collar = new THREE.Mesh(new THREE.TorusGeometry(14.5, 1.4, 10, 32).rotateX(Math.PI / 2), cyanNeonMat);
      collar.position.y = tc.h * 0.22;
      g.add(collar);

      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 1.6, 40, 10), baseMat);
      spire.position.y = tc.h * 0.5 + 20;
      g.add(spire);

      this.scene.add(g);
    });

    // Place Boost Arches, Shield Rings, Weapon Upgrade Pods & Laser Barrier Gates along the spline!
    const archUs = [0.07, 0.27, 0.58, 0.81];
    archUs.forEach((u) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      this.spawnBoostArch(pos, tangent);
    });

    const shieldRingUs = [0.16, 0.42, 0.67, 0.85];
    shieldRingUs.forEach((u, i) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
      pos.addScaledVector(right, (i % 2 === 0 ? 1 : -1) * 8);
      this.spawnCollectRing(pos, tangent, 'shield_ring', 0x00f0ff);
    });

    // Weapon Upgrade Pods (Level 1 -> 2 -> 3!)
    [0.21, 0.51].forEach((u) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      this.spawnCollectRing(pos, tangent, 'weapon_pod', 0x22c55e);
    });

    // Shootable Laser Barrier Gates (Shoot the central glowing crystal to shatter!)
    [0.34, 0.63, 0.78].forEach((u) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      this.spawnLaserGate(pos, tangent);
    });

    // Dynamic Enemy Squadrons, Crystals & Mines distributed smoothly along the ENTIRE route!
    for (let u = 0.04; u <= 0.86; u += 0.042) {
      const center = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      const right = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();

      // Spawn Dart Drone Squadron
      const squadCount = u < 0.2 ? 3 : 4;
      for (let k = 0; k < squadCount; k++) {
        const offsetX = (k - (squadCount - 1) / 2) * 14;
        const offsetY = (k % 2 === 0 ? 3 : -2);
        const pos = center.clone().addScaledVector(right, offsetX);
        pos.y += offsetY;
        this.spawnDartDrone(pos, k * 1.4, 9 + k * 2, 3.5);
      }

      // Floating Shootable Crystals & Naval Mines
      if (Math.round(u * 100) % 2 === 0) {
        const cPos = center.clone().addScaledVector(right, (Math.random() - 0.5) * 26);
        cPos.y += (Math.random() - 0.5) * 8;
        this.spawnEnergyCrystal(cPos);
      } else {
        const mPos = center.clone().addScaledVector(right, (Math.random() - 0.5) * 24);
        mPos.y += (Math.random() - 0.5) * 6;
        this.spawnNavalMine(mPos);
      }
    }

    // Heavy Corvettes in Key Sectors
    [0.24, 0.47, 0.72].forEach((u) => {
      const pos = this.splineCurve.getPointAt(u);
      const tangent = this.splineCurve.getTangentAt(u).normalize();
      pos.y += 6;
      this.spawnHeavyCorvette(pos, tangent);
    });

    // Hyrule Ground Guardians perched on hills/ruins below spline
    const guardianSpots = [
      { x: 160, z: 95 },
      { x: 195, z: -55 },
      { x: -130, z: -120 },
      { x: -90, z: 165 },
      { x: 30, z: 10 },
    ];
    guardianSpots.forEach((gs) => {
      const gy = TerrainManager.getTerrainHeight(gs.x, gs.z);
      if (gy > TerrainManager.WATER_LEVEL + 0.5) {
        this.spawnGroundGuardian(new THREE.Vector3(gs.x, gy + 1.5, gs.z));
      }
    });

    // Floating Aero-Carriers flanking Corneria Bay
    this.spawnAeroCarrier(new THREE.Vector3(-85, 78, 360));
    this.spawnAeroCarrier(new THREE.Vector3(95, 74, -460));

    // ZONE 4 FINALE: Colossal Corneria Dreadnought Boss Cruiser!
    this.spawnDreadnoughtBoss(new THREE.Vector3(0, 44, -760));
  }

  private spawnBoostArch(pos: THREE.Vector3, tangent: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.lookAt(pos.clone().add(tangent));

    const archMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.25, metalness: 0.88 });
    const arch = new THREE.Mesh(new THREE.TorusGeometry(22, 2.2, 14, 42, Math.PI), archMat);
    arch.position.y = -4;
    g.add(arch);

    const field = new THREE.Mesh(
      new THREE.CircleGeometry(20, 28, 0, Math.PI),
      new THREE.MeshBasicMaterial({ color: 0x00f0ff, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    field.position.y = -4;
    g.add(field);

    this.scene.add(g);
    this.archesAndRings.push({ mesh: g, position: pos.clone(), radius: 22, type: 'boost_arch', collected: false });
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

    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(8.5, 0.55, 12, 32),
      new THREE.MeshBasicMaterial({ color: colorHex })
    );
    g.add(ring);

    if (type === 'weapon_pod') {
      const core = new THREE.Mesh(
        new THREE.OctahedronGeometry(2.5, 0),
        new THREE.MeshBasicMaterial({ color: 0xfacc15, wireframe: true })
      );
      g.add(core);
    }

    this.scene.add(g);
    this.archesAndRings.push({ mesh: g, position: pos.clone(), radius: 9.0, type, collected: false });
  }

  private spawnLaserGate(pos: THREE.Vector3, tangent: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.lookAt(pos.clone().add(tangent));

    const pylonMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.85, roughness: 0.25 });
    [-22, 22].forEach((x) => {
      const pylon = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2.5, 36, 12), pylonMat);
      pylon.position.set(x, 0, 0);
      g.add(pylon);
    });

    const barrierMat = new THREE.MeshBasicMaterial({
      color: 0xff0055,
      transparent: true,
      opacity: 0.38,
      side: THREE.DoubleSide,
    });
    const barrier = new THREE.Mesh(new THREE.PlaneGeometry(42, 16), barrierMat);
    g.add(barrier);

    const coreMesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(3.8, 0),
      new THREE.MeshStandardMaterial({
        color: 0xff3366,
        emissive: 0xff0055,
        emissiveIntensity: 1.5,
      })
    );
    const coreGroup = new THREE.Group();
    coreGroup.add(coreMesh);
    coreGroup.position.copy(pos);
    this.scene.add(g);
    this.scene.add(coreGroup);

    this.enemies.push({
      mesh: coreGroup,
      type: 'gate_core',
      health: 30,
      maxHealth: 30,
      points: 1000,
      basePos: pos.clone(),
      movePhase: 0,
      moveAmpX: 0,
      moveAmpY: 0,
      fireCooldown: 9999,
      destroyed: false,
      hitRadius: 7.5,
      linkedBarrier: barrier,
    });
  }

  private spawnDartDrone(pos: THREE.Vector3, phase: number, ampX: number, ampY: number) {
    const g = new THREE.Group();
    g.position.copy(pos);

    const mat = new THREE.MeshStandardMaterial({ color: 0xb91c1c, metalness: 0.8, roughness: 0.25 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff1e56 });

    const hull = new THREE.Mesh(new THREE.ConeGeometry(1.1, 4.0, 5).rotateX(Math.PI / 2), mat);
    g.add(hull);
    const wings = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.2, 1.4), mat);
    wings.position.z = -0.4;
    g.add(wings);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.45, 8, 8), glowMat);
    eye.position.set(0, 0.25, 1.9);
    g.add(eye);

    this.scene.add(g);
    this.enemies.push({
      mesh: g,
      type: 'drone',
      health: 22,
      maxHealth: 22,
      points: 200,
      basePos: pos.clone(),
      movePhase: phase,
      moveAmpX: ampX,
      moveAmpY: ampY,
      fireCooldown: 1.4 + Math.random() * 1.6,
      destroyed: false,
      hitRadius: 5.2,
    });
  }

  private spawnHeavyCorvette(pos: THREE.Vector3, tangent: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    g.lookAt(pos.clone().sub(tangent));

    const hullMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.88, roughness: 0.25 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff2e63 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(6.5, 2.6, 15), hullMat);
    g.add(body);
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
      health: 100,
      maxHealth: 100,
      points: 750,
      basePos: pos.clone(),
      movePhase: Math.random() * 6,
      moveAmpX: 12,
      moveAmpY: 4,
      fireCooldown: 1.8,
      destroyed: false,
      hitRadius: 8.5,
    });
  }

  private spawnGroundGuardian(pos: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x3f4752, roughness: 0.7, metalness: 0.3 });
    const magentaMat = new THREE.MeshBasicMaterial({ color: 0xff007f });

    const dome = new THREE.Mesh(new THREE.ConeGeometry(3.5, 6.0, 8), stoneMat);
    dome.position.y = 3.0;
    g.add(dome);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 12), magentaMat);
    eye.position.y = 4.6;
    g.add(eye);

    this.scene.add(g);
    this.enemies.push({
      mesh: g,
      type: 'guardian',
      health: 45,
      maxHealth: 45,
      points: 450,
      basePos: pos.clone(),
      movePhase: 0,
      moveAmpX: 0,
      moveAmpY: 0,
      fireCooldown: 2.0,
      destroyed: false,
      hitRadius: 6.5,
    });
  }

  private spawnEnergyCrystal(pos: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(2.6, 0),
      new THREE.MeshStandardMaterial({
        color: 0x00f5d4,
        emissive: 0x00bbf9,
        emissiveIntensity: 1.0,
        roughness: 0.1,
      })
    );
    g.add(mesh);
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
      hitRadius: 5.0,
    });
  }

  private spawnNavalMine(pos: THREE.Vector3) {
    const g = new THREE.Group();
    g.position.copy(pos);
    const mine = new THREE.Mesh(
      new THREE.IcosahedronGeometry(2.2, 0),
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.85,
        emissive: 0xff6b00,
        emissiveIntensity: 0.85,
      })
    );
    g.add(mine);
    this.scene.add(g);
    this.enemies.push({
      mesh: g,
      type: 'mine',
      health: 15,
      maxHealth: 15,
      points: 250,
      basePos: pos.clone(),
      movePhase: Math.random() * 6,
      moveAmpX: 3,
      moveAmpY: 3,
      fireCooldown: 9999,
      destroyed: false,
      hitRadius: 5.5,
    });
  }

  private spawnAeroCarrier(startPos: THREE.Vector3) {
    const cruiser = new THREE.Group();
    cruiser.position.copy(startPos);
    const hullMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.82, roughness: 0.35 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00b4d8 });
    cruiser.add(new THREE.Mesh(new THREE.BoxGeometry(45, 14, 140), hullMat));
    const wings = new THREE.Mesh(new THREE.BoxGeometry(115, 4, 65), hullMat);
    wings.position.set(0, 2, 10);
    cruiser.add(wings);
    [-18, 0, 18].forEach((xOff) => {
      const p = new THREE.Mesh(new THREE.ConeGeometry(6.5, 55, 16).rotateX(Math.PI / 2), glowMat);
      p.position.set(xOff, 2, 85);
      cruiser.add(p);
    });
    this.scene.add(cruiser);
  }

  private spawnDreadnoughtBoss(centerPos: THREE.Vector3) {
    const boss = new THREE.Group();
    boss.position.copy(centerPos);

    const armorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.88, roughness: 0.25 });
    const redGlowMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });

    const hull = new THREE.Mesh(new THREE.BoxGeometry(75, 22, 190), armorMat);
    boss.add(hull);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(30, 20, 45), armorMat);
    bridge.position.set(0, 18, 25);
    boss.add(bridge);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(145, 5, 65), armorMat);
    wing.position.set(0, 2, -10);
    boss.add(wing);

    this.scene.add(boss);
    this.dreadnoughtGroup = boss;

    // 3 Destructible Reactor Cores on the Dreadnought
    const coreOffsets = [
      new THREE.Vector3(-42, 6, 40),
      new THREE.Vector3(42, 6, 40),
      new THREE.Vector3(0, 18, 55),
    ];
    coreOffsets.forEach((off) => {
      const cGroup = new THREE.Group();
      const worldCorePos = centerPos.clone().add(off);
      cGroup.position.copy(worldCorePos);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(5.5, 16, 16), redGlowMat);
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(7.2, 0.5, 8, 24),
        new THREE.MeshBasicMaterial({ color: 0xfacc15 })
      );
      cGroup.add(orb);
      cGroup.add(ring);
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
        fireCooldown: 1.5,
        destroyed: false,
        hitRadius: 10.5,
      };
      this.enemies.push(coreEntity);
      this.bossCores.push(coreEntity);
    });
  }

  private createSpeedLines() {
    const lineGeo = new THREE.BufferGeometry();
    const count = 110;
    const positions = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 7.0 + Math.random() * 24.0;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const z = -40 + Math.random() * 95;
      const len = 14 + Math.random() * 20;
      positions[i * 6 + 0] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;
      positions[i * 6 + 3] = x;
      positions[i * 6 + 4] = y;
      positions[i * 6 + 5] = z + len;
    }
    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0xa5f3fc, transparent: true, opacity: 0.25 });
    this.speedLinesMesh = new THREE.LineSegments(lineGeo, lineMat);
    this.camera.add(this.speedLinesMesh);
    this.scene.add(this.camera);
  }

  private createWaterSpray() {
    const sprayGeo = new THREE.BufferGeometry();
    const count = 150;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 9;
      pos[i * 3 + 1] = Math.random() * 2.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.waterSprayParticles = new THREE.Points(
      sprayGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, transparent: true, opacity: 0.68 })
    );
    this.waterSprayParticles.visible = false;
    this.scene.add(this.waterSprayParticles);
  }

  // -------------------------------------------------------------
  // WEAPON FIRE, AIM ASSIST & SPECIAL ABILITIES
  // -------------------------------------------------------------
  private getShipAimDirection(shipWorldQuat: THREE.Quaternion, worldShipPos: THREE.Vector3): {
    aimDir: THREE.Vector3;
    lockedEnemy: EnemyEntity | null;
  } {
    const shipForward = new THREE.Vector3(0, 0, -1).applyQuaternion(shipWorldQuat).normalize();
    let bestEnemy: EnemyEntity | null = null;
    let bestDot = 0.985; // ~10 degree lock cone

    for (const enemy of this.enemies) {
      if (enemy.destroyed) continue;
      const toEnemy = new THREE.Vector3().subVectors(enemy.mesh.position, worldShipPos);
      const dist = toEnemy.length();
      if (dist < 10 || dist > 460) continue;
      const dir = toEnemy.divideScalar(dist);
      const d = dir.dot(shipForward);
      if (d > bestDot) {
        bestDot = d;
        bestEnemy = enemy;
      }
    }

    if (bestEnemy) {
      const aimDir = new THREE.Vector3().subVectors(bestEnemy.mesh.position, worldShipPos).normalize();
      return { aimDir, lockedEnemy: bestEnemy };
    }
    return { aimDir: shipForward, lockedEnemy: null };
  }

  public fireWeapon(isContinuous = false) {
    if (this.state.isGameOver || this.state.isMissionComplete) return;
    if (isContinuous && this.fireCooldown > 0) return;

    this.fireCooldown = 0.13;
    const shipWorldQuat = new THREE.Quaternion();
    this.shipMesh.getWorldQuaternion(shipWorldQuat);
    const { aimDir } = this.getShipAimDirection(shipWorldQuat, this.shipGroup.position);

    const lvl = this.state.weaponLevel;
    if (lvl === 1) {
      this.spawnPlayerLaser(new THREE.Vector3(-1.4, -0.1, -2.2), aimDir, 0x00f5d4, 24);
      this.spawnPlayerLaser(new THREE.Vector3(1.4, -0.1, -2.2), aimDir, 0x00f5d4, 24);
    } else if (lvl === 2) {
      this.spawnPlayerLaser(new THREE.Vector3(-1.6, -0.1, -2.2), aimDir, 0x38bdf8, 30);
      this.spawnPlayerLaser(new THREE.Vector3(1.6, -0.1, -2.2), aimDir, 0x38bdf8, 30);
      this.spawnPlayerLaser(new THREE.Vector3(0, 0.1, -3.5), aimDir, 0xfacc15, 22);
    } else {
      // Lv 3 Hyper Emerald Triple-Spread
      this.spawnPlayerLaser(new THREE.Vector3(-1.8, -0.1, -2.2), aimDir, 0x10b981, 36);
      this.spawnPlayerLaser(new THREE.Vector3(1.8, -0.1, -2.2), aimDir, 0x10b981, 36);
      this.spawnPlayerLaser(new THREE.Vector3(0, 0.2, -3.5), aimDir, 0x34d399, 36);
    }
    starFoxAudio.playLaser();
  }

  private spawnPlayerLaser(localOffset: THREE.Vector3, aimDir: THREE.Vector3, colorHex: number, damage: number) {
    const laserGeo = new THREE.CapsuleGeometry(0.22, 3.8, 4, 8);
    laserGeo.rotateX(Math.PI / 2);
    const laserMesh = new THREE.Mesh(laserGeo, new THREE.MeshBasicMaterial({ color: colorHex }));

    this.shipMesh.updateMatrixWorld();
    const worldPos = localOffset.clone().applyMatrix4(this.shipMesh.matrixWorld);
    laserMesh.position.copy(worldPos);
    laserMesh.lookAt(worldPos.clone().add(aimDir));

    this.scene.add(laserMesh);
    this.projectiles.push({
      mesh: laserMesh,
      position: laserMesh.position,
      velocity: aimDir.clone().multiplyScalar(520),
      isPlayer: true,
      damage,
      lifetime: 1.9,
    });
  }

  private releaseChargeShot() {
    starFoxAudio.playChargeShot();
    const shipWorldQuat = new THREE.Quaternion();
    this.shipMesh.getWorldQuaternion(shipWorldQuat);
    const { aimDir } = this.getShipAimDirection(shipWorldQuat, this.shipGroup.position);

    const chargeMesh = new THREE.Mesh(
      new THREE.SphereGeometry(2.0, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    const worldPos = new THREE.Vector3(0, 0, -4.5).applyMatrix4(this.shipMesh.matrixWorld);
    chargeMesh.position.copy(worldPos);

    this.scene.add(chargeMesh);
    this.projectiles.push({
      mesh: chargeMesh,
      position: chargeMesh.position,
      velocity: aimDir.clone().multiplyScalar(320),
      isPlayer: true,
      damage: 190,
      lifetime: 2.6,
      isChargeShot: true,
    });

    this.chargeSphere.scale.set(1, 1, 1);
    (this.chargeSphere.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  public triggerBarrelRoll(direction: 'left' | 'right' = 'left') {
    if (this.isBarrelRolling || this.barrelRollCooldown > 0) return;
    this.isBarrelRolling = true;
    this.barrelRollTimer = 0.52;
    this.barrelRollDirection = direction;
    this.barrelRollCooldown = 0.65;
    this.cameraShakeIntensity = 0.22;
    // Quick lateral dash dodge boost on roll!
    this.shipVelX += (direction === 'left' ? -40 : 40);
    starFoxAudio.playBarrelRoll();

    this.projectiles.forEach((p) => {
      if (!p.isPlayer && p.position.distanceTo(this.shipGroup.position) < 38) {
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
    this.createShockwave(this.shipGroup.position, 45);

    this.enemies.forEach((enemy) => {
      if (!enemy.destroyed && enemy.mesh.position.distanceTo(this.shipGroup.position) < 420) {
        enemy.health -= 260;
        if (enemy.health <= 0) {
          this.destroyEnemy(enemy);
        }
      }
    });
    this.notifyState();
  }

  private createShockwave(pos: THREE.Vector3, maxScale = 36) {
    const shockGeo = new THREE.TorusGeometry(2, 0.8, 12, 36);
    const shockMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.85 });
    const shockMesh = new THREE.Mesh(shockGeo, shockMat);
    shockMesh.position.copy(pos);
    this.scene.add(shockMesh);

    let progress = 0;
    const id = window.setInterval(() => {
      progress += 0.06;
      shockMesh.scale.setScalar(progress * maxScale);
      shockMat.opacity = Math.max(0, 0.85 - progress * 0.9);
      if (progress >= 1.0) {
        clearInterval(id);
        this.scene.remove(shockMesh);
        shockGeo.dispose();
        shockMat.dispose();
      }
    }, 25);
    this.activeIntervals.push(id);
  }

  private destroyEnemy(enemy: EnemyEntity) {
    enemy.destroyed = true;
    this.scene.remove(enemy.mesh);
    if (enemy.linkedBarrier) {
      enemy.linkedBarrier.visible = false;
    }
    this.state.score += enemy.points;
    this.state.hits++;
    starFoxAudio.playExplosion();
    this.createExplosionParticles(enemy.mesh.position, enemy.type === 'boss_core' ? 75 : 40);

    // If Naval Mine destroyed, shockwave damages nearby enemies!
    if (enemy.type === 'mine') {
      this.createShockwave(enemy.mesh.position, 18);
      this.enemies.forEach((other) => {
        if (!other.destroyed && other.mesh.position.distanceTo(enemy.mesh.position) < 35) {
          other.health -= 60;
          if (other.health <= 0) this.destroyEnemy(other);
        }
      });
    }

    // Check if all Dreadnought Boss Cores destroyed!
    if (enemy.type === 'boss_core') {
      const aliveCores = this.bossCores.filter((c) => !c.destroyed).length;
      if (aliveCores === 0 && this.dreadnoughtGroup) {
        this.state.score += 5000;
        this.createShockwave(this.dreadnoughtGroup.position, 65);
        this.createExplosionParticles(this.dreadnoughtGroup.position, 90);
        this.scene.remove(this.dreadnoughtGroup);
        this.dreadnoughtGroup = null;
      }
    }
    this.notifyState();
  }

  private createExplosionParticles(pos: THREE.Vector3, count = 40) {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;
      velocities.push(
        new THREE.Vector3((Math.random() - 0.5) * 45, (Math.random() - 0.5) * 45, (Math.random() - 0.5) * 45)
      );
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0xffaa00, size: 2.0, transparent: true, opacity: 1.0 });
    const p = new THREE.Points(geo, mat);
    this.scene.add(p);

    let age = 0;
    const id = window.setInterval(() => {
      age += 0.04;
      const attr = geo.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < count; i++) {
        arr[i * 3 + 0] += velocities[i].x * 0.04;
        arr[i * 3 + 1] += velocities[i].y * 0.04;
        arr[i * 3 + 2] += velocities[i].z * 0.04;
      }
      attr.needsUpdate = true;
      mat.opacity = Math.max(0, 1.0 - age * 1.45);
      if (age >= 0.72) {
        clearInterval(id);
        this.scene.remove(p);
        geo.dispose();
        mat.dispose();
      }
    }, 35);
    this.activeIntervals.push(id);
  }

  // -------------------------------------------------------------
  // MAIN SIMULATION TICK
  // -------------------------------------------------------------
  public update(dt: number) {
    if (this.state.isGameOver) return;
    this.totalTime += dt;

    // 1. Boost & Brake Mechanics
    let speedMult = 1.0;
    if (this.isBoosting && !this.state.isOverheated) {
      speedMult = 1.85;
      this.state.boostHeat = Math.min(1.0, this.state.boostHeat + dt * 0.25);
      if (this.state.boostHeat >= 1.0) this.state.isOverheated = true;
    } else {
      this.state.boostHeat = Math.max(0, this.state.boostHeat - dt * 0.24);
      if (this.state.boostHeat <= 0.2) this.state.isOverheated = false;
    }
    if (this.isBraking) speedMult = 0.48;

    this.currentSpeed = this.baseSpeed * speedMult;
    this.state.speed = Math.round(this.currentSpeed);
    starFoxAudio.setThrusterIntensity(speedMult, this.isBoosting && !this.state.isOverheated);

    // 2. Spline Progress & Zone Naming
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

    // Spline Coordinate Frame + Curvature Auto-Bank!
    const railPos = this.splineCurve.getPointAt(progressU);
    const railForward = this.splineCurve.getTangentAt(progressU).normalize();
    const upRef = new THREE.Vector3(0, 1, 0);
    const railRight = new THREE.Vector3().crossVectors(railForward, upRef).normalize();
    const railUp = new THREE.Vector3().crossVectors(railRight, railForward).normalize();

    // Calculate curve turn rate so the horizon tilts into sweeping canyon turns
    const turnDelta = railForward.clone().sub(this.prevTangent);
    const turnSide = turnDelta.dot(railRight) / Math.max(0.005, dt);
    this.prevTangent.copy(railForward);
    const targetSplineBank = THREE.MathUtils.clamp(-turnSide * 0.55, -0.32, 0.32);
    this.currentSplineBank = THREE.MathUtils.lerp(this.currentSplineBank, targetSplineBank, dt * 3.0);

    // 3. Agile Arcade Flight Steering (Zero forced center snap-back!)
    const maxLatSpeed = 88.0;
    const maxVertSpeed = 70.0;
    const targetVelX = this.inputYawRoll * maxLatSpeed;
    const targetVelY = this.inputPitch * maxVertSpeed;

    this.shipVelX = THREE.MathUtils.lerp(this.shipVelX, targetVelX, dt * 15.0);
    this.shipVelY = THREE.MathUtils.lerp(this.shipVelY, targetVelY, dt * 15.0);

    this.shipLocalPos.x += this.shipVelX * dt;
    this.shipLocalPos.y += this.shipVelY * dt;

    // Generous maneuvering arena relative to spline center
    this.shipLocalPos.x = THREE.MathUtils.clamp(this.shipLocalPos.x, -48, 48);
    this.shipLocalPos.y = THREE.MathUtils.clamp(this.shipLocalPos.y, -16, 42);

    const worldShipPos = railPos
      .clone()
      .addScaledVector(railRight, this.shipLocalPos.x)
      .addScaledVector(railUp, this.shipLocalPos.y);

    // Dynamic Terrain & Ocean Floor Protection: Never clip under Hyrule hills or ocean waves!
    let minWorldY = TerrainManager.WATER_LEVEL + 3.0;
    if (Math.abs(worldShipPos.x) < 395 && Math.abs(worldShipPos.z) < 395) {
      const groundH = TerrainManager.getTerrainHeight(worldShipPos.x, worldShipPos.z);
      minWorldY = Math.max(minWorldY, groundH + 3.5);
    }
    if (worldShipPos.y < minWorldY) {
      const pushUp = minWorldY - worldShipPos.y;
      worldShipPos.y = minWorldY;
      this.shipLocalPos.y += pushUp;
    }

    this.shipGroup.position.copy(worldShipPos);

    // Unified Right-Handed Frame: Local +X Right, Local +Y Up, Local -Z Forward
    const basis = new THREE.Matrix4().makeBasis(railRight, railUp, railForward.clone().negate());
    this.shipGroup.quaternion.setFromRotationMatrix(basis);

    // 4. Crisp Nose Yaw/Pitch Aiming + Deep 62° Banking + Barrel Roll
    const targetYaw = -this.inputYawRoll * THREE.MathUtils.degToRad(24.0);
    const targetPitch = this.inputPitch * THREE.MathUtils.degToRad(26.0);
    const targetRoll = -this.inputYawRoll * THREE.MathUtils.degToRad(62.0) + this.currentSplineBank * 0.5;

    this.smoothedYaw = THREE.MathUtils.lerp(this.smoothedYaw, targetYaw, dt * 14.0);
    this.smoothedPitch = THREE.MathUtils.lerp(this.smoothedPitch, targetPitch, dt * 14.0);

    if (this.isBarrelRolling) {
      this.barrelRollTimer -= dt;
      const rollProgress = 1.0 - this.barrelRollTimer / 0.52;
      this.smoothedRoll = rollProgress * Math.PI * 2 * (this.barrelRollDirection === 'left' ? 1 : -1);
      if (this.barrelRollTimer <= 0) this.isBarrelRolling = false;
    } else {
      this.smoothedRoll = THREE.MathUtils.lerp(this.smoothedRoll, targetRoll, dt * 13.0);
    }

    this.shipMesh.rotation.order = 'YXZ';
    this.shipMesh.rotation.set(this.smoothedPitch, this.smoothedYaw, this.smoothedRoll);

    if (this.barrelRollCooldown > 0) this.barrelRollCooldown -= dt;

    // 5. Flaps & Flame Effects
    const flapAngle = this.isBraking ? THREE.MathUtils.degToRad(40.0) : 0;
    this.leftFlap.rotation.x = THREE.MathUtils.lerp(this.leftFlap.rotation.x, flapAngle, dt * 12.0);
    this.rightFlap.rotation.x = THREE.MathUtils.lerp(this.rightFlap.rotation.x, flapAngle, dt * 12.0);

    const flameScale = this.isBoosting && !this.state.isOverheated ? 2.8 : this.isBraking ? 0.35 : 1.05;
    this.thrusterFlames.forEach((f) => f.scale.set(1.0, 1.0 + Math.random() * 0.18, flameScale));

    // 6. Rapid Fire + Auto-Fire + Charge Shot
    if (this.fireCooldown > 0) this.fireCooldown -= dt;
    if (this.isFiring || this.autoFire) {
      this.fireWeapon(true);
    }

    if (this.isFiring) {
      this.chargeTime = Math.min(this.MAX_CHARGE_TIME, this.chargeTime + dt);
      const ratio = this.chargeTime / this.MAX_CHARGE_TIME;
      const s = 0.5 + ratio * 2.2;
      this.chargeSphere.scale.set(s, s, s);
      (this.chargeSphere.material as THREE.MeshBasicMaterial).opacity = ratio * 0.85;
      if (ratio > 0.25) starFoxAudio.playChargeHum(ratio);
    } else if (this.chargeTime >= 0.72) {
      this.releaseChargeShot();
      this.chargeTime = 0;
    } else {
      this.chargeTime = 0;
      (this.chargeSphere.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    // 7. Chase Camera with Dynamic Bank Horizon + FOV Kicks
    const defaultCamDist = 14.0;
    const defaultCamHeight = 4.2;
    const targetCamPos = worldShipPos
      .clone()
      .sub(railForward.clone().multiplyScalar(defaultCamDist))
      .add(railUp.clone().multiplyScalar(defaultCamHeight))
      .add(railRight.clone().multiplyScalar(-this.inputYawRoll * 2.2));

    this.camera.position.lerp(targetCamPos, dt * 13.0);
    const camLookTarget = worldShipPos
      .clone()
      .addScaledVector(railForward, 52)
      .addScaledVector(railRight, this.inputYawRoll * 6.5)
      .addScaledVector(railUp, this.inputPitch * 5.0);
    this.camera.lookAt(camLookTarget);

    this.smoothedCamRoll = THREE.MathUtils.lerp(
      this.smoothedCamRoll,
      this.currentSplineBank + (this.isBarrelRolling ? 0 : this.smoothedRoll * 0.22),
      dt * 8.0
    );
    this.camera.rotation.z += this.smoothedCamRoll;

    const targetFov = this.isBoosting && !this.state.isOverheated ? 84.0 : this.isBraking ? 60.0 : 70.0;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 6.0);
    this.camera.updateProjectionMatrix();

    if (this.cameraShakeIntensity > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShakeIntensity * 2;
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShakeIntensity * 2;
      this.cameraShakeIntensity = Math.max(0, this.cameraShakeIntensity - dt * 1.6);
    }

    // 8. Project Live 3D Reticles (Near + Far) onto Screen %
    const shipWorldQuat = new THREE.Quaternion();
    this.shipMesh.getWorldQuaternion(shipWorldQuat);
    const { aimDir, lockedEnemy } = this.getShipAimDirection(shipWorldQuat, worldShipPos);

    const projectToScreen = (pt: THREE.Vector3) => {
      const p = pt.clone().project(this.camera);
      return {
        x: THREE.MathUtils.clamp((p.x + 1) * 50, 8, 92),
        y: THREE.MathUtils.clamp((1 - p.y) * 50, 10, 90),
      };
    };
    this.state.reticleNear = projectToScreen(worldShipPos.clone().addScaledVector(aimDir, 38));
    this.state.reticleFar = projectToScreen(worldShipPos.clone().addScaledVector(aimDir, 105));
    this.state.isTargetLocked = !!lockedEnemy;

    // 9. Update AI Wingmen Formation
    this.wingmen.forEach((w) => {
      const wTarget = railPos
        .clone()
        .addScaledVector(railRight, w.offset.x + Math.sin(this.totalTime * 1.4 + w.phase) * 4)
        .addScaledVector(railUp, w.offset.y + Math.cos(this.totalTime * 1.7 + w.phase) * 2.5)
        .addScaledVector(railForward, -w.offset.z);
      w.group.position.lerp(wTarget, dt * 6.0);
      w.group.quaternion.setFromRotationMatrix(basis);
    });

    // 10. Wingtip Ribbon Contrails
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

    // 11. Zelda World Animations (Water waves, Grass wind, Snow over peaks, Lighting, Building windmills!)
    this.terrainManager.updateTime(this.totalTime);
    this.waterManager.update(this.totalTime, dt);
    this.skyLighting.update(dt, worldShipPos);
    if (this.outerOceanMaterial) {
      this.outerOceanMaterial.uniforms.uTime.value = this.totalTime;
    }

    // Trigger snow mist only when over Hyrule snow peaks so bay air stays clear
    const overSnow =
      Math.abs(worldShipPos.x) < 395 &&
      Math.abs(worldShipPos.z) < 395 &&
      TerrainManager.isSnowAt(worldShipPos.x, worldShipPos.z);
    const foliageTrackPos = worldShipPos.clone();
    if (!overSnow) foliageTrackPos.y = 5.0;
    this.foliageManager.update(this.totalTime, dt, foliageTrackPos, this.skyLighting.dirLight?.position);
    this.buildingSystem.update(dt);

    // Low-altitude Water Spray over Ocean/Lake
    const nearWater = worldShipPos.y <= TerrainManager.WATER_LEVEL + 9.0 &&
      (Math.abs(worldShipPos.x) > 395 || Math.abs(worldShipPos.z) > 395 ||
        TerrainManager.getTerrainHeight(worldShipPos.x, worldShipPos.z) < TerrainManager.WATER_LEVEL + 0.5);
    this.waterSprayParticles.visible = nearWater;
    if (nearWater) {
      this.waterSprayParticles.position.set(worldShipPos.x, TerrainManager.WATER_LEVEL + 0.4, worldShipPos.z);
    }

    if (this.speedLinesMesh) {
      (this.speedLinesMesh.material as THREE.LineBasicMaterial).opacity = this.isBoosting ? 0.72 : 0.22;
      this.speedLinesMesh.rotation.z += dt * (this.isBoosting ? 2.6 : 0.7);
    }

    // 12. Shield Bubble Visibility (Strictly vanishes after timeout!)
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

    // 13. Arches, Shield Rings & Weapon Upgrade Pods Collection
    this.archesAndRings.forEach((ring) => {
      if (!ring.collected && ring.position.distanceTo(worldShipPos) < ring.radius + 4.5) {
        ring.collected = true;
        ring.mesh.visible = false;
        starFoxAudio.playRingCollect();

        if (ring.type === 'boost_arch') {
          this.state.score += 1000;
          this.state.boostHeat = 0;
          this.state.isOverheated = false;
        } else if (ring.type === 'shield_ring') {
          this.state.shield = Math.min(this.state.maxShield, this.state.shield + 35);
          this.shieldActiveTimer = 4.0;
          this.state.score += 400;
        } else if (ring.type === 'weapon_pod') {
          this.state.weaponLevel = Math.min(3, this.state.weaponLevel + 1) as 1 | 2 | 3;
          this.state.score += 800;
        } else {
          this.state.score += 500;
        }
        this.notifyState();
      }
    });

    // 14. Dynamic Enemy Movement, Targeting & Firing + Boss Health Bar
    let activeBossHp = 0;
    let maxBossHp = 0;
    this.bossCores.forEach((c) => {
      maxBossHp += c.maxHealth;
      if (!c.destroyed) activeBossHp += c.health;
    });
    if (progressU >= 0.70 && this.dreadnoughtGroup && maxBossHp > 0) {
      this.state.bossHealth = Math.round((activeBossHp / maxBossHp) * 100);
    } else {
      this.state.bossHealth = null;
    }

    this.enemies.forEach((enemy) => {
      if (enemy.destroyed) return;

      if (enemy.type === 'crystal' || enemy.type === 'mine' || enemy.type === 'gate_core' || enemy.type === 'boss_core') {
        enemy.mesh.rotation.y += dt * 1.8;
      }

      // Sine-wave attack weaving for aerial drones & corvettes
      if (enemy.moveAmpX > 0 || enemy.moveAmpY > 0) {
        const oscX = Math.sin(this.totalTime * 1.6 + enemy.movePhase) * enemy.moveAmpX;
        const oscY = Math.cos(this.totalTime * 1.2 + enemy.movePhase) * enemy.moveAmpY;
        enemy.mesh.position.set(enemy.basePos.x + oscX, enemy.basePos.y + oscY, enemy.basePos.z);
      }

      // Collision check with Laser Barrier if still intact!
      if (enemy.type === 'gate_core' && enemy.mesh.position.distanceTo(worldShipPos) < 12) {
        this.takePlayerDamage(18);
        this.destroyEnemy(enemy);
        return;
      }

      const distToPlayer = enemy.mesh.position.distanceTo(worldShipPos);
      if (distToPlayer < 380 && distToPlayer > 25 && enemy.fireCooldown < 500) {
        enemy.fireCooldown -= dt;
        if (enemy.fireCooldown <= 0) {
          enemy.fireCooldown = enemy.type === 'drone' ? 1.8 : enemy.type === 'guardian' ? 2.2 : 1.5;
          this.spawnHostileLaser(enemy.mesh.position, worldShipPos);
        }
      }
    });

    // 15. Projectiles Update & Hit Detection
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.lifetime -= dt;
      p.position.addScaledVector(p.velocity, dt);

      if (p.isPlayer) {
        for (const enemy of this.enemies) {
          if (!enemy.destroyed && p.position.distanceTo(enemy.mesh.position) < (p.isChargeShot ? 16 : enemy.hitRadius)) {
            enemy.health -= p.damage;
            p.lifetime = 0;
            if (enemy.health <= 0) {
              this.destroyEnemy(enemy);
            }
            break;
          }
        }
      } else {
        if (p.position.distanceTo(worldShipPos) < 4.2) {
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

    // 16. Dialogue Triggers
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
    const laserMesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 2.5, 4, 8).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff0055 })
    );
    laserMesh.position.copy(from);
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    laserMesh.lookAt(to);

    this.scene.add(laserMesh);
    this.projectiles.push({
      mesh: laserMesh,
      position: laserMesh.position,
      velocity: dir.multiplyScalar(155),
      isPlayer: false,
      damage: 14,
      lifetime: 3.4,
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
      this.createExplosionParticles(this.shipGroup.position, 70);
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
      const dt = Math.min(0.08, this.clock.getDelta());
      this.update(dt);
      if (this.composer) {
        this.composer.render();
      } else {
        this.renderer.render(this.scene, this.camera);
      }
      if (this.totalTime - this.lastNotifyTime > 0.033) {
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
    this.shipLocalPos.set(0, 18, 0);
    this.shipVelX = 0;
    this.shipVelY = 0;
    this.shieldActiveTimer = 0;
    this.state = {
      shield: 100,
      maxShield: 100,
      boostHeat: 0,
      isOverheated: false,
      smartBombs: 3,
      score: 0,
      hits: 0,
      speed: 108,
      progressPercent: 0,
      weaponLevel: 1,
      zoneName: 'CORNERIA OUTER BAY',
      bossHealth: null,
      reticleNear: { x: 50, y: 50 },
      reticleFar: { x: 50, y: 50 },
      isTargetLocked: false,
      dialogue: null,
      isMissionComplete: false,
      isGameOver: false,
      shieldActive: false,
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
