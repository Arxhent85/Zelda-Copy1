import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createNoise2D } from 'simplex-noise';
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
  dialogue: {
    speaker: string;
    text: string;
    visible: boolean;
  } | null;
  isMissionComplete: boolean;
  isGameOver: boolean;
  shieldActive: boolean;
}

interface EnemyShip {
  mesh: THREE.Group;
  type: 'drone' | 'corvette' | 'crystal' | 'turret';
  health: number;
  maxHealth: number;
  points: number;
  speed: number;
  railOffset: THREE.Vector3;
  railDistance: number;
  fireCooldown: number;
  destroyed: boolean;
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
  type: 'boost_arch' | 'shield_ring' | 'speed_ring';
  collected: boolean;
}

export class StarFoxEngine {
  public canvas: HTMLCanvasElement;
  private renderer!: THREE.WebGLRenderer;
  private composer!: EffectComposer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;

  // Rail & Spline Path
  private splineCurve!: THREE.CatmullRomCurve3;
  public currentDistance = 0;
  private totalDistance = 8500;
  private baseSpeed = 105.0;
  private currentSpeed = 105.0;

  // Player ship
  private shipGroup!: THREE.Group;
  private shipMesh!: THREE.Group;
  private leftFlap!: THREE.Mesh;
  private rightFlap!: THREE.Mesh;
  private thrusterFlames: THREE.Mesh[] = [];
  private shieldBubble!: THREE.Mesh;
  private chargeSphere!: THREE.Mesh;
  public shieldActiveTimer = 0;

  // Kinematics & steering (Agile flight physics)
  public inputPitch = 0; // -1 to 1 (Up is positive)
  public inputYawRoll = 0; // -1 to 1 (Right is positive)
  public isBoosting = false;
  public isBraking = false;
  public isFiring = false;
  private chargeTime = 0;
  private readonly MAX_CHARGE_TIME = 1.25;

  private shipLocalPos = new THREE.Vector3(0, 16, 0);

  // Barrel Roll
  public isBarrelRolling = false;
  private barrelRollTimer = 0;
  private barrelRollDirection: 'left' | 'right' = 'left';
  private barrelRollCooldown = 0;

  // Vitals & Stats
  public state: StarFoxState = {
    shield: 100,
    maxShield: 100,
    boostHeat: 0,
    isOverheated: false,
    smartBombs: 3,
    score: 0,
    hits: 0,
    speed: 105,
    progressPercent: 0,
    dialogue: null,
    isMissionComplete: false,
    isGameOver: false,
    shieldActive: false,
  };

  public onStateUpdate?: (state: StarFoxState) => void;

  // Environment & Objects
  private terrainMesh!: THREE.Mesh;
  private oceanMesh!: THREE.Mesh;
  private oceanMaterial!: THREE.ShaderMaterial;
  private towers: THREE.Group[] = [];
  private archesAndRings: RingItem[] = [];
  private capitalShips: THREE.Group[] = [];
  private enemies: EnemyShip[] = [];
  private projectiles: Projectile[] = [];
  private pineTreesGroup!: THREE.Group;

  // Particles & Visual FX
  private explosionParticles: THREE.Points[] = [];
  private waterSprayParticles!: THREE.Points;
  private speedLinesMesh!: THREE.LineSegments;
  private wingtipTrailGeoLeft!: THREE.BufferGeometry;
  private wingtipTrailGeoRight!: THREE.BufferGeometry;
  private wingtipPointsLeft: THREE.Vector3[] = [];
  private wingtipPointsRight: THREE.Vector3[] = [];
  private readonly TRAIL_LENGTH = 28;

  // Animation & Loop
  private isRunning = false;
  private animationFrameId: number | null = null;
  private clock = new THREE.Clock();

  // Screen shake
  private cameraShakeIntensity = 0;

  // Radio Dialogue Queue
  private dialogueEvents = [
    {
      dist: 50,
      speaker: 'COMMANDER VANCE',
      text: 'All wings report in! Enemy vanguard spotted in the Hyrule Bay corridor. Weapons free!',
      duration: 4.2,
      triggered: false,
    },
    {
      dist: 350,
      speaker: 'COMMANDER VANCE',
      text: 'Fly through the golden Shiekah arches for an instant SuperBoost recharge!',
      duration: 3.8,
      triggered: false,
    },
    {
      dist: 1100,
      speaker: 'FALCO',
      text: 'These drones are flies on my windshield! Keep banking through the towers!',
      duration: 3.5,
      triggered: false,
    },
    {
      dist: 2300,
      speaker: 'SLIPPY',
      text: 'Shield power rings detected ahead! Fly straight through them to recharge!',
      duration: 3.8,
      triggered: false,
    },
    {
      dist: 4500,
      speaker: 'PEPPY',
      text: 'Do a Barrel Roll! Double-tap Roll to deflect hostile plasma bolts!',
      duration: 3.6,
      triggered: false,
    },
    {
      dist: 6400,
      speaker: 'COMMANDER VANCE',
      text: 'Approaching the Inner Shiekah Spire! Finish off remaining cruisers!',
      duration: 4.0,
      triggered: false,
    },
  ];

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.initThree();
    this.createSpline();
    this.createSkyAndCelestial();
    this.createHyruleLandscape();
    this.createOcean();
    this.createPlayerShip();
    this.createWingtipTrails();
    this.createWorldEntities();
    this.createSpeedLines();
    this.createWaterSpray();
  }

  // -------------------------------------------------------------
  // INITIALIZATION WITH VIBRANT, NON-WASHED LIGHTING
  // -------------------------------------------------------------
  private initThree() {
    this.scene = new THREE.Scene();
    // Balanced atmospheric fog: keeps distant mountains visible without washing out
    this.scene.fog = new THREE.Fog(0x427aa1, 150, 4800);

    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.camera = new THREE.PerspectiveCamera(68.0, width / height, 0.5, 16000);
    this.camera.position.set(0, 20, 20);

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      precision: 'highp',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.0));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.98; // Vibrant contrast, prevents white-out
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Post-processing UnrealBloom: calibrated to bloom glowing lasers & thrusters only
    this.composer = new EffectComposer(this.renderer);
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.65, // Controlled bloom intensity
      0.35, // Tight radius
      0.82  // High threshold so terrain doesn't glow
    );
    this.composer.addPass(bloomPass);

    // Dynamic Hyrule Lighting
    const ambient = new THREE.AmbientLight(0x486988, 0.65);
    this.scene.add(ambient);

    const hemi = new THREE.HemisphereLight(0x7ab6eb, 0x1d3624, 0.75);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff6e5, 1.85);
    sun.position.set(380, 520, -420);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 2800;
    const d = 350;
    sun.shadow.camera.left = -d;
    sun.shadow.camera.right = d;
    sun.shadow.camera.top = d;
    sun.shadow.camera.bottom = -d;
    sun.shadow.bias = -0.0002;
    this.scene.add(sun);
  }

  // -------------------------------------------------------------
  // SPLINE CORRIDOR
  // -------------------------------------------------------------
  private createSpline() {
    const waypoints = [
      new THREE.Vector3(0, 16, 0),
      new THREE.Vector3(-15, 14, -600),
      new THREE.Vector3(25, 18, -1400),
      new THREE.Vector3(0, 12, -2300),
      new THREE.Vector3(-40, 16, -3400),
      new THREE.Vector3(30, 22, -4800),
      new THREE.Vector3(0, 28, -6200),
      new THREE.Vector3(0, 30, -8500),
    ];
    this.splineCurve = new THREE.CatmullRomCurve3(waypoints, false, 'catmullrom', 0.45);
  }

  // -------------------------------------------------------------
  // CELESTIAL BACKGROUND & SKY (RICH AZURE WITH SATURN RINGED PLANET)
  // -------------------------------------------------------------
  private createSkyAndCelestial() {
    const skyGeo = new THREE.SphereGeometry(14000, 32, 32);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0x133e69) },
        horizonColor: { value: new THREE.Color(0x609bc6) },
        bottomColor: { value: new THREE.Color(0x0e2030) },
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPosition;
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 bottomColor;
        void main() {
          float h = normalize(vWorldPosition).y;
          vec3 sky = mix(horizonColor, topColor, clamp(h * 1.5, 0.0, 1.0));
          sky = mix(sky, bottomColor, clamp(-h * 2.0, 0.0, 1.0));
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);

    // Majestic Ringed Celestial Planet (Corneria / Lylat system)
    const planetGroup = new THREE.Group();
    planetGroup.position.set(1600, 1600, -6800);

    const planetGeo = new THREE.SphereGeometry(680, 64, 64);
    const planetMat = new THREE.MeshStandardMaterial({
      color: 0xebf2fa,
      roughness: 0.8,
      metalness: 0.05,
      emissive: 0x1d3557,
      emissiveIntensity: 0.2,
    });
    const planet = new THREE.Mesh(planetGeo, planetMat);
    planetGroup.add(planet);

    // Rings
    const ringGeo = new THREE.RingGeometry(850, 1600, 64);
    const ringMat = new THREE.MeshStandardMaterial({
      color: 0xc5dbe8,
      roughness: 0.65,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.78,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2.3;
    ring.rotation.y = -0.25;
    ring.rotation.z = 0.65;
    planetGroup.add(ring);

    this.scene.add(planetGroup);
  }

  // -------------------------------------------------------------
  // HYRULE COASTAL VALLEY & FJORD TERRAIN (VERDANT & DETAILED)
  // -------------------------------------------------------------
  private createHyruleLandscape() {
    const noise2D = createNoise2D(() => 0.42);
    const noise2DDetail = createNoise2D(() => 0.88);

    const width = 1600;
    const length = 9800;
    const segsX = 96;
    const segsZ = 280;

    const terrainGeo = new THREE.PlaneGeometry(width, length, segsX, segsZ);
    terrainGeo.rotateX(-Math.PI / 2);
    terrainGeo.translate(0, 0, -4500);

    const posAttr = terrainGeo.attributes.position;
    const count = posAttr.count;
    const colors = new Float32Array(count * 3);

    const cSand = new THREE.Color(0xd9c28e);
    const cPlainsGreen = new THREE.Color(0x4a8f27);
    const cEmeraldValley = new THREE.Color(0x316f1d);
    const cForestMoss = new THREE.Color(0x234d1e);
    const cRockSlate = new THREE.Color(0x4e565f);
    const cSnowPure = new THREE.Color(0xf4f8fb);

    const color = new THREE.Color();

    for (let i = 0; i < count; i++) {
      const vx = posAttr.getX(i);
      const vz = posAttr.getZ(i);

      const distFromCenter = Math.abs(vx);
      let vy = -6.0;

      if (distFromCenter < 75.0) {
        vy = -8.0 + noise2D(vx * 0.02, vz * 0.02) * 2.0;
      } else {
        const landFactor = Math.min(1.0, (distFromCenter - 75.0) / 120.0);
        const mountainFactor = Math.max(0, (distFromCenter - 180.0) / 240.0);

        const hills = (noise2D(vx * 0.005, vz * 0.005) + 0.5) * 35.0;
        const mountains = Math.pow(mountainFactor, 1.4) * (70.0 + Math.abs(noise2DDetail(vx * 0.008, vz * 0.008)) * 120.0);

        vy = -2.0 + (hills + mountains) * landFactor;
      }

      posAttr.setY(i, vy);

      if (vy < 1.8) {
        color.copy(cSand).lerp(cPlainsGreen, Math.max(0, vy / 1.8));
      } else if (vy > 65.0) {
        const snowT = Math.min(1.0, (vy - 65.0) / 35.0);
        color.copy(cRockSlate).lerp(cSnowPure, snowT);
      } else if (vy > 35.0) {
        color.copy(cForestMoss).lerp(cRockSlate, (vy - 35.0) / 30.0);
      } else {
        const detailVar = (noise2DDetail(vx * 0.05, vz * 0.05) + 1.0) * 0.5;
        color.copy(cPlainsGreen).lerp(cEmeraldValley, detailVar);
      }

      colors[i * 3 + 0] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }

    terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    terrainGeo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.84,
      metalness: 0.05,
      flatShading: false,
    });

    this.terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
    this.terrainMesh.receiveShadow = true;
    this.scene.add(this.terrainMesh);

    this.populateZeldaFoliage();
  }

  private populateZeldaFoliage() {
    this.pineTreesGroup = new THREE.Group();

    const trunkGeo = new THREE.CylinderGeometry(0.4, 0.6, 5.0, 6);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a2e16, roughness: 0.9 });
    const foliageGeo = new THREE.ConeGeometry(3.6, 7.5, 6);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1e4620, roughness: 0.75 });

    const rockGeo = new THREE.IcosahedronGeometry(2.0, 1);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x5e6872, roughness: 0.85 });

    for (let i = 0; i < 180; i++) {
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = side * (85 + Math.random() * 240);
      const z = -200 - Math.random() * 8000;
      const y = 8.0 + Math.random() * 32.0;

      if (i % 3 === 0) {
        const rock = new THREE.Mesh(rockGeo, rockMat);
        rock.position.set(x, y, z);
        const s = 0.8 + Math.random() * 1.5;
        rock.scale.set(s, s * 0.75, s * 1.1);
        rock.rotation.set(Math.random(), Math.random(), Math.random());
        rock.castShadow = true;
        this.pineTreesGroup.add(rock);
      } else {
        const tree = new THREE.Group();
        tree.position.set(x, y, z);

        const trunk = new THREE.Mesh(trunkGeo, trunkMat);
        trunk.position.y = 2.5;
        trunk.castShadow = true;
        tree.add(trunk);

        const f1 = new THREE.Mesh(foliageGeo, foliageMat);
        f1.position.y = 6.5;
        f1.castShadow = true;
        tree.add(f1);

        const f2 = new THREE.Mesh(foliageGeo, foliageMat);
        f2.position.y = 9.5;
        f2.scale.set(0.72, 0.72, 0.72);
        f2.castShadow = true;
        tree.add(f2);

        const scale = 0.75 + Math.random() * 0.5;
        tree.scale.set(scale, scale, scale);
        this.pineTreesGroup.add(tree);
      }
    }

    this.scene.add(this.pineTreesGroup);
  }

  // -------------------------------------------------------------
  // DYNAMIC OCEAN WATER WITH SHADER WAVES & FRESNEL SPECULAR REFLECTION
  // -------------------------------------------------------------
  private createOcean() {
    const oceanGeo = new THREE.PlaneGeometry(16000, 16000, 128, 128);
    oceanGeo.rotateX(-Math.PI / 2);

    this.oceanMaterial = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        waterColor: { value: new THREE.Color(0x0e5482) }, // Deep vibrant azure
        deepColor: { value: new THREE.Color(0x04192b) },  // Rich deep oceanic blue
        sunDirection: { value: new THREE.Vector3(0.45, 0.6, -0.4).normalize() },
        sunColor: { value: new THREE.Color(0xfff8e8) },
      },
      vertexShader: `
        uniform float time;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying vec2 vUv;
        varying float vElevation;

        void main() {
          vUv = uv;
          vec3 pos = position;

          float wave1 = sin(pos.x * 0.035 + time * 1.5) * cos(pos.z * 0.035 + time * 1.2) * 0.45;
          float wave2 = sin(pos.x * 0.07 - time * 2.1) * sin(pos.z * 0.06 + time * 1.8) * 0.25;
          pos.y += wave1 + wave2;
          vElevation = pos.y;

          vec3 n = vec3(
            -cos(pos.x * 0.035 + time * 1.5) * 0.03,
            1.0,
            -cos(pos.z * 0.035 + time * 1.2) * 0.03
          );
          vNormal = normalize(normalMatrix * n);

          vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
          vViewPosition = -mvPosition.xyz;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 waterColor;
        uniform vec3 deepColor;
        uniform vec3 sunDirection;
        uniform vec3 sunColor;
        varying vec3 vNormal;
        varying vec3 vViewPosition;
        varying float vElevation;

        void main() {
          vec3 viewDir = normalize(vViewPosition);
          vec3 normal = normalize(vNormal);

          float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 3.0);
          vec3 halfDir = normalize(sunDirection + viewDir);
          float spec = pow(max(dot(normal, halfDir), 0.0), 54.0) * 2.2;

          vec3 base = mix(deepColor, waterColor, clamp(vElevation + 0.6, 0.0, 1.0));
          vec3 finalColor = mix(base, vec3(0.5, 0.75, 0.95), fresnel * 0.6);
          finalColor += sunColor * spec;

          gl_FragColor = vec4(finalColor, 0.94);
        }
      `,
      transparent: true,
    });

    this.oceanMesh = new THREE.Mesh(oceanGeo, this.oceanMaterial);
    this.oceanMesh.position.y = 0.0;
    this.oceanMesh.receiveShadow = true;
    this.scene.add(this.oceanMesh);
  }

  // -------------------------------------------------------------
  // PLAYER SHIP: ARWING - UNIFIED COORDINATE FRAME
  // Local -Z is Forward (Nose). Local +Z is Backward (Thrusters towards camera).
  // Local +X is Screen Right (Right wing). Local -X is Screen Left (Left wing).
  // -------------------------------------------------------------
  private createPlayerShip() {
    this.shipGroup = new THREE.Group();
    this.shipMesh = new THREE.Group();

    const ceramicMat = new THREE.MeshStandardMaterial({
      color: 0xf5f8fc,
      roughness: 0.24,
      metalness: 0.8,
    });

    const blueArmorMat = new THREE.MeshStandardMaterial({
      color: 0x1d4ed8,
      roughness: 0.32,
      metalness: 0.82,
    });

    const redTrimMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.28,
      metalness: 0.65,
    });

    const canopyMat = new THREE.MeshPhysicalMaterial({
      color: 0x071526,
      roughness: 0.05,
      metalness: 0.95,
      transmission: 0.85,
      ior: 1.52,
    });

    // 1. Nose points forward along local -Z
    const noseGeo = new THREE.ConeGeometry(0.85, 3.8, 6);
    noseGeo.rotateX(-Math.PI / 2); // Apex points to -Z
    const nose = new THREE.Mesh(noseGeo, ceramicMat);
    nose.position.set(0, 0, -2.2);
    nose.castShadow = true;
    this.shipMesh.add(nose);

    // 2. Fuselage Cockpit
    const cockpitGeo = new THREE.ConeGeometry(0.72, 2.6, 6);
    cockpitGeo.rotateX(-Math.PI / 2);
    const cockpit = new THREE.Mesh(cockpitGeo, canopyMat);
    cockpit.position.set(0, 0.45, -1.5);
    this.shipMesh.add(cockpit);

    // 3. Central Core Body
    const coreGeo = new THREE.BoxGeometry(1.6, 0.9, 3.4);
    const core = new THREE.Mesh(coreGeo, blueArmorMat);
    core.position.set(0, 0, 0.2);
    core.castShadow = true;
    this.shipMesh.add(core);

    // 4. Main Swept Wings (+X = Right wing, -X = Left wing)
    const wingGeo = new THREE.BufferGeometry();
    const wingVerts = new Float32Array([
      // Right wing (+X): root, tip, trailing edge
      0.8, 0.05, 0.2,
      4.8, 0.4, 1.8,
      0.8, 0.0, 1.8,
      // Left wing (-X): root, tip, trailing edge
      -0.8, 0.05, 0.2,
      -0.8, 0.0, 1.8,
      -4.8, 0.4, 1.8,
    ]);
    wingGeo.setAttribute('position', new THREE.BufferAttribute(wingVerts, 3));
    wingGeo.computeVertexNormals();
    const mainWings = new THREE.Mesh(wingGeo, ceramicMat);
    mainWings.castShadow = true;
    this.shipMesh.add(mainWings);

    // Wingtip Red Fin Trim
    const finGeo = new THREE.BoxGeometry(0.12, 1.2, 1.4);
    const leftFin = new THREE.Mesh(finGeo, redTrimMat);
    leftFin.position.set(-4.8, 0.5, 1.8);
    this.shipMesh.add(leftFin);

    const rightFin = new THREE.Mesh(finGeo, redTrimMat);
    rightFin.position.set(4.8, 0.5, 1.8);
    this.shipMesh.add(rightFin);

    // Airbrake Ailerons
    const flapGeo = new THREE.BoxGeometry(1.4, 0.08, 0.6);
    this.leftFlap = new THREE.Mesh(flapGeo, redTrimMat);
    this.leftFlap.position.set(-2.5, 0.2, 1.9);
    this.shipMesh.add(this.leftFlap);

    this.rightFlap = new THREE.Mesh(flapGeo, redTrimMat);
    this.rightFlap.position.set(2.5, 0.2, 1.9);
    this.shipMesh.add(this.rightFlap);

    // 5. Thruster Nozzles & Glowing Plasma Flames (pointing +Z towards camera)
    const thrusterMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.9,
      roughness: 0.2,
    });

    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
    });

    const nozzlePositions = [
      new THREE.Vector3(-1.0, 0.1, 1.9),
      new THREE.Vector3(1.0, 0.1, 1.9),
      new THREE.Vector3(0.0, 0.5, 2.0),
    ];

    nozzlePositions.forEach((pos, idx) => {
      const nozzleGeo = new THREE.CylinderGeometry(0.35, 0.42, 0.9, 12);
      nozzleGeo.rotateX(Math.PI / 2);
      const nozzle = new THREE.Mesh(nozzleGeo, thrusterMat);
      nozzle.position.copy(pos);
      this.shipMesh.add(nozzle);

      // Plasma Flame pointing backwards (+Z)
      const flameGeo = new THREE.ConeGeometry(0.32, 2.2 + (idx === 2 ? 0.6 : 0), 12);
      flameGeo.rotateX(Math.PI / 2);
      const flame = new THREE.Mesh(flameGeo, flameMat);
      flame.position.set(pos.x, pos.y, pos.z + 1.2);
      this.shipMesh.add(flame);
      this.thrusterFlames.push(flame);
    });

    // 6. Shield Energy Sphere (INVISIBLE by default, only appears when hit or collecting shield ring!)
    const shieldGeo = new THREE.IcosahedronGeometry(4.2, 2);
    const shieldMat = new THREE.MeshBasicMaterial({
      color: 0x00f0ff,
      wireframe: true,
      transparent: true,
      opacity: 0.0,
    });
    this.shieldBubble = new THREE.Mesh(shieldGeo, shieldMat);
    this.shieldBubble.visible = false; // Strictly hidden unless active!
    this.shipMesh.add(this.shieldBubble);

    // 7. Nose Plasma Charge Sphere
    const chargeGeo = new THREE.SphereGeometry(0.6, 16, 16);
    const chargeMat = new THREE.MeshBasicMaterial({
      color: 0x48cae4,
      transparent: true,
      opacity: 0.0,
    });
    this.chargeSphere = new THREE.Mesh(chargeGeo, chargeMat);
    this.chargeSphere.position.set(0, 0, -4.2);
    this.shipMesh.add(this.chargeSphere);

    this.shipGroup.add(this.shipMesh);
    this.scene.add(this.shipGroup);
  }

  // -------------------------------------------------------------
  // 3D WINGTIP RIBBON TRAILS
  // -------------------------------------------------------------
  private createWingtipTrails() {
    const trailMat = new THREE.LineBasicMaterial({
      color: 0x00e5ff,
      transparent: true,
      opacity: 0.75,
      linewidth: 2,
    });

    this.wingtipTrailGeoLeft = new THREE.BufferGeometry();
    this.wingtipTrailGeoRight = new THREE.BufferGeometry();

    const initialPositions = new Float32Array(this.TRAIL_LENGTH * 3);
    this.wingtipTrailGeoLeft.setAttribute('position', new THREE.BufferAttribute(initialPositions.slice(), 3));
    this.wingtipTrailGeoRight.setAttribute('position', new THREE.BufferAttribute(initialPositions.slice(), 3));

    const trailLeft = new THREE.Line(this.wingtipTrailGeoLeft, trailMat);
    const trailRight = new THREE.Line(this.wingtipTrailGeoRight, trailMat);

    this.scene.add(trailLeft);
    this.scene.add(trailRight);
  }

  // -------------------------------------------------------------
  // PROCEDURAL HIGH-TECH SKYSCRAPER TEXTURE
  // Creates glowing window grid matching the reference screenshots
  // -------------------------------------------------------------
  private createSkyscraperTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;

    // Deep high-tech metallic facade
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, 512, 1024);

    // Illuminated windows lattice
    const cols = 24;
    const rows = 96;
    const cw = 512 / cols;
    const ch = 1024 / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (Math.random() > 0.32) {
          const rand = Math.random();
          ctx.fillStyle = rand > 0.85 ? '#ffffff' : rand > 0.45 ? '#7dd3fc' : '#38bdf8';
          ctx.fillRect(c * cw + 3, r * ch + 2, cw - 6, ch - 4);
        }
      }
    }

    // Vertical neon power conduits
    ctx.fillStyle = '#00f0ff';
    ctx.fillRect(0, 0, 8, 1024);
    ctx.fillRect(252, 0, 8, 1024);
    ctx.fillRect(504, 0, 8, 1024);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 6);
    return texture;
  }

  // -------------------------------------------------------------
  // WORLD ENTITIES: ILLUMINATED TOWERS, ARCHES, TARGETS & SQUADRONS
  // -------------------------------------------------------------
  private createWorldEntities() {
    const skyscraperTex = this.createSkyscraperTexture();

    // 1. Futuristic Spires rising from water & canyon
    const towerPositions = [
      new THREE.Vector3(-65, 85, -350),
      new THREE.Vector3(70, 75, -450),
      new THREE.Vector3(-80, 100, -900),
      new THREE.Vector3(75, 90, -1000),
      new THREE.Vector3(-55, 75, -1600),
      new THREE.Vector3(90, 115, -1850),
      new THREE.Vector3(-70, 85, -2650),
      new THREE.Vector3(60, 95, -3200),
      new THREE.Vector3(-85, 105, -4500),
      new THREE.Vector3(80, 110, -5600),
    ];

    const towerMat = new THREE.MeshStandardMaterial({
      map: skyscraperTex,
      metalness: 0.75,
      roughness: 0.28,
      emissive: 0x00e5ff,
      emissiveIntensity: 0.35,
      emissiveMap: skyscraperTex,
    });

    const floatingBaseMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      metalness: 0.85,
      roughness: 0.25,
    });

    const cyanNeonMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    towerPositions.forEach((pos) => {
      const towerGroup = new THREE.Group();
      towerGroup.position.copy(pos);

      // Main skyscraper tapered tower
      const cylGeo = new THREE.CylinderGeometry(10, 16, 180, 24);
      const cyl = new THREE.Mesh(cylGeo, towerMat);
      cyl.castShadow = true;
      towerGroup.add(cyl);

      // Floating pontoon base platform at water surface
      const baseGeo = new THREE.CylinderGeometry(24, 28, 8, 24);
      const base = new THREE.Mesh(baseGeo, floatingBaseMat);
      base.position.y = -85;
      towerGroup.add(base);

      // Glowing base neon ring
      const baseRingGeo = new THREE.TorusGeometry(26, 1.1, 12, 32);
      baseRingGeo.rotateX(Math.PI / 2);
      const baseRing = new THREE.Mesh(baseRingGeo, cyanNeonMat);
      baseRing.position.y = -81;
      towerGroup.add(baseRing);

      // Mid-height glowing observatory collar ring
      const collarGeo = new THREE.TorusGeometry(14, 1.4, 12, 32);
      collarGeo.rotateX(Math.PI / 2);
      const collar = new THREE.Mesh(collarGeo, cyanNeonMat);
      collar.position.y = 25;
      towerGroup.add(collar);

      // Needle antenna spire on top
      const spireGeo = new THREE.CylinderGeometry(0.3, 1.6, 45, 12);
      const spire = new THREE.Mesh(spireGeo, floatingBaseMat);
      spire.position.y = 110;
      towerGroup.add(spire);

      // Antenna beacon tip
      const beaconGeo = new THREE.SphereGeometry(1.2, 12, 12);
      const beacon = new THREE.Mesh(beaconGeo, cyanNeonMat);
      beacon.position.y = 132;
      towerGroup.add(beacon);

      this.scene.add(towerGroup);
      this.towers.push(towerGroup);
    });

    // 2. Shiekah Ancient Speed Arches
    const archPositions = [
      new THREE.Vector3(0, 18, -300),
      new THREE.Vector3(-12, 22, -2150),
      new THREE.Vector3(15, 20, -4200),
    ];

    archPositions.forEach((pos) => {
      const archGroup = new THREE.Group();
      archGroup.position.copy(pos);

      const archGeo = new THREE.TorusGeometry(26, 2.8, 16, 48, Math.PI);
      const archMat = new THREE.MeshStandardMaterial({
        color: 0xd4af37,
        roughness: 0.25,
        metalness: 0.85,
      });
      const archMesh = new THREE.Mesh(archGeo, archMat);
      archMesh.position.y = -4;
      archGroup.add(archMesh);

      const fieldGeo = new THREE.CircleGeometry(24, 32, 0, Math.PI);
      const fieldMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.45,
        side: THREE.DoubleSide,
      });
      const field = new THREE.Mesh(fieldGeo, fieldMat);
      field.position.y = -4;
      archGroup.add(field);

      this.scene.add(archGroup);
      this.archesAndRings.push({
        mesh: archGroup,
        position: pos.clone(),
        radius: 26,
        type: 'boost_arch',
        collected: false,
      });
    });

    // 3. Shield & Speed Powerup Rings
    const ringPositions = [
      { pos: new THREE.Vector3(4, 16, -500), type: 'shield_ring' as const, color: 0x00f0ff },
      { pos: new THREE.Vector3(-8, 18, -800), type: 'speed_ring' as const, color: 0xffd700 },
      { pos: new THREE.Vector3(14, 16, -1200), type: 'shield_ring' as const, color: 0x00f0ff },
      { pos: new THREE.Vector3(-6, 22, -1700), type: 'speed_ring' as const, color: 0xffd700 },
      { pos: new THREE.Vector3(10, 18, -2900), type: 'shield_ring' as const, color: 0x00f0ff },
      { pos: new THREE.Vector3(-14, 20, -3700), type: 'speed_ring' as const, color: 0xffd700 },
    ];

    ringPositions.forEach(({ pos, type, color }) => {
      const ringGroup = new THREE.Group();
      ringGroup.position.copy(pos);

      const ringGeo = new THREE.TorusGeometry(7.5, 0.45, 12, 32);
      const ringMat = new THREE.MeshBasicMaterial({ color });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringGroup.add(ringMesh);

      this.scene.add(ringGroup);
      this.archesAndRings.push({
        mesh: ringGroup,
        position: pos.clone(),
        radius: 7.5,
        type,
        collected: false,
      });
    });

    // 4. Aero-Carriers
    this.createCapitalCruiser(new THREE.Vector3(65, 80, -280));
    this.createCapitalCruiser(new THREE.Vector3(-75, 68, -750));

    // 5. Populate Active Enemies & Targets Right from the Start!
    this.spawnContinuousEnemiesAndTargets();
  }

  private createCapitalCruiser(startPos: THREE.Vector3) {
    const cruiser = new THREE.Group();
    cruiser.position.copy(startPos);

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.8,
      roughness: 0.35,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0x00b4d8 });

    const hullGeo = new THREE.BoxGeometry(45, 14, 140);
    const hull = new THREE.Mesh(hullGeo, hullMat);
    hull.castShadow = true;
    cruiser.add(hull);

    const wingGeo = new THREE.BoxGeometry(110, 4, 65);
    const wings = new THREE.Mesh(wingGeo, hullMat);
    wings.position.set(0, 2, 10);
    wings.castShadow = true;
    cruiser.add(wings);

    [-18, 0, 18].forEach((xOffset) => {
      const plumeGeo = new THREE.ConeGeometry(6.5, 55, 16);
      plumeGeo.rotateX(Math.PI / 2);
      const plume = new THREE.Mesh(plumeGeo, glowMat);
      plume.position.set(xOffset, 2, 85);
      cruiser.add(plume);
    });

    this.scene.add(cruiser);
    this.capitalShips.push(cruiser);
  }

  /**
   * Spawns squadrons, floating energy crystals, and targets right from the start!
   */
  private spawnContinuousEnemiesAndTargets() {
    // Wave 0: Immediate action at 80m - 200m!
    const immediateSquad = [
      new THREE.Vector3(-10, 16, -100),
      new THREE.Vector3(10, 16, -100),
      new THREE.Vector3(0, 22, -140),
      new THREE.Vector3(-18, 14, -180),
      new THREE.Vector3(18, 14, -180),
    ];
    immediateSquad.forEach((pos) => this.spawnDartDrone(pos));

    // Shootable Energy Crystals on the water & canyon
    const crystals = [
      new THREE.Vector3(-14, 8, -80),
      new THREE.Vector3(14, 10, -120),
      new THREE.Vector3(0, 12, -220),
      new THREE.Vector3(-20, 14, -360),
      new THREE.Vector3(22, 16, -480),
      new THREE.Vector3(-12, 10, -620),
      new THREE.Vector3(12, 18, -750),
      new THREE.Vector3(0, 14, -920),
      new THREE.Vector3(-18, 12, -1150),
      new THREE.Vector3(18, 14, -1350),
      new THREE.Vector3(0, 16, -1550),
    ];
    crystals.forEach((pos) => this.spawnEnergyCrystal(pos));

    // Wave 1: Inverted-Vee Drone Squadron at -450m
    const wave1 = [
      new THREE.Vector3(0, 18, -450),
      new THREE.Vector3(-14, 22, -490),
      new THREE.Vector3(14, 22, -490),
      new THREE.Vector3(-28, 26, -530),
      new THREE.Vector3(28, 26, -530),
    ];
    wave1.forEach((pos) => this.spawnDartDrone(pos));

    // Wave 2: Heavy Gunships & Corvettes
    this.spawnHeavyCorvette(new THREE.Vector3(-20, 24, -980));
    this.spawnHeavyCorvette(new THREE.Vector3(20, 24, -1380));
    this.spawnHeavyCorvette(new THREE.Vector3(0, 28, -2100));

    // Wave 3: Canyon Ambush Squadrons
    const wave3 = [
      new THREE.Vector3(-16, 14, -1700),
      new THREE.Vector3(16, 14, -1720),
      new THREE.Vector3(0, 20, -1750),
      new THREE.Vector3(-22, 16, -2400),
      new THREE.Vector3(22, 16, -2420),
      new THREE.Vector3(-10, 24, -3100),
      new THREE.Vector3(10, 24, -3120),
    ];
    wave3.forEach((pos) => this.spawnDartDrone(pos));
  }

  private spawnDartDrone(pos: THREE.Vector3) {
    const droneGroup = new THREE.Group();
    droneGroup.position.copy(pos);

    const mat = new THREE.MeshStandardMaterial({
      color: 0x991b1b,
      metalness: 0.8,
      roughness: 0.3,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });

    const hullGeo = new THREE.ConeGeometry(0.9, 3.4, 5);
    hullGeo.rotateX(Math.PI / 2); // Faces towards player (+Z)
    const hull = new THREE.Mesh(hullGeo, mat);
    droneGroup.add(hull);

    const wingGeo = new THREE.BoxGeometry(4.2, 0.15, 1.2);
    const wings = new THREE.Mesh(wingGeo, mat);
    wings.position.set(0, 0, -0.4);
    droneGroup.add(wings);

    const eyeGeo = new THREE.SphereGeometry(0.35, 8, 8);
    const eye = new THREE.Mesh(eyeGeo, glowMat);
    eye.position.set(0, 0.2, 1.6);
    droneGroup.add(eye);

    this.scene.add(droneGroup);
    this.enemies.push({
      mesh: droneGroup,
      type: 'drone',
      health: 20,
      maxHealth: 20,
      points: 150,
      speed: 25,
      railOffset: pos.clone(),
      railDistance: Math.abs(pos.z),
      fireCooldown: 1.5 + Math.random() * 1.5,
      destroyed: false,
    });
  }

  private spawnHeavyCorvette(pos: THREE.Vector3) {
    const corvetteGroup = new THREE.Group();
    corvetteGroup.position.copy(pos);

    const hullMat = new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.85,
      roughness: 0.25,
    });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xff3366 });

    const bodyGeo = new THREE.BoxGeometry(5.5, 2.2, 12);
    const body = new THREE.Mesh(bodyGeo, hullMat);
    body.castShadow = true;
    corvetteGroup.add(body);

    const wingGeo = new THREE.BoxGeometry(16, 0.6, 4.5);
    const wings = new THREE.Mesh(wingGeo, hullMat);
    wings.position.set(0, 0.2, -1);
    wings.castShadow = true;
    corvetteGroup.add(wings);

    [-5, 5].forEach((xOffset) => {
      const turretGeo = new THREE.CylinderGeometry(0.5, 0.7, 1.4, 8);
      const turret = new THREE.Mesh(turretGeo, glowMat);
      turret.position.set(xOffset, 0.8, 1.5);
      corvetteGroup.add(turret);
    });

    this.scene.add(corvetteGroup);
    this.enemies.push({
      mesh: corvetteGroup,
      type: 'corvette',
      health: 90,
      maxHealth: 90,
      points: 600,
      speed: 18,
      railOffset: pos.clone(),
      railDistance: Math.abs(pos.z),
      fireCooldown: 2.2,
      destroyed: false,
    });
  }

  private spawnEnergyCrystal(pos: THREE.Vector3) {
    const crystalGroup = new THREE.Group();
    crystalGroup.position.copy(pos);

    const crystalGeo = new THREE.OctahedronGeometry(2.4, 0);
    const crystalMat = new THREE.MeshStandardMaterial({
      color: 0x00f5d4,
      metalness: 0.1,
      roughness: 0.1,
      emissive: 0x00bbf9,
      emissiveIntensity: 0.8,
    });
    const crystal = new THREE.Mesh(crystalGeo, crystalMat);
    crystalGroup.add(crystal);

    this.scene.add(crystalGroup);
    this.enemies.push({
      mesh: crystalGroup,
      type: 'crystal',
      health: 10,
      maxHealth: 10,
      points: 250,
      speed: 0,
      railOffset: pos.clone(),
      railDistance: Math.abs(pos.z),
      fireCooldown: 9999,
      destroyed: false,
    });
  }

  // -------------------------------------------------------------
  // VISUAL EFFECTS: SPEED LINES & LOW-ALT WATER SPRAY
  // -------------------------------------------------------------
  private createSpeedLines() {
    const lineGeo = new THREE.BufferGeometry();
    const count = 120;
    const positions = new Float32Array(count * 6);

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 6.0 + Math.random() * 24.0;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      const z = -40 + Math.random() * 100;
      const len = 14 + Math.random() * 20;

      positions[i * 6 + 0] = x;
      positions[i * 6 + 1] = y;
      positions[i * 6 + 2] = z;

      positions[i * 6 + 3] = x;
      positions[i * 6 + 4] = y;
      positions[i * 6 + 5] = z + len;
    }

    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const lineMat = new THREE.LineBasicMaterial({
      color: 0x99ddff,
      transparent: true,
      opacity: 0.35,
    });

    this.speedLinesMesh = new THREE.LineSegments(lineGeo, lineMat);
    this.camera.add(this.speedLinesMesh);
    this.scene.add(this.camera);
  }

  private createWaterSpray() {
    const sprayGeo = new THREE.BufferGeometry();
    const count = 180;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 0] = (Math.random() - 0.5) * 8;
      pos[i * 3 + 1] = Math.random() * 2;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 12;
    }
    sprayGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const sprayMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.65,
      transparent: true,
      opacity: 0.65,
    });
    this.waterSprayParticles = new THREE.Points(sprayGeo, sprayMat);
    this.waterSprayParticles.visible = false;
    this.scene.add(this.waterSprayParticles);
  }

  // -------------------------------------------------------------
  // CONTROLS & WEAPON ACTIONS
  // -------------------------------------------------------------
  public fireWeapon(isContinuous = false) {
    if (this.state.isGameOver || this.state.isMissionComplete) return;

    if (!isContinuous) {
      this.spawnPlayerLaser(new THREE.Vector3(-2.8, -0.3, -2.0));
      this.spawnPlayerLaser(new THREE.Vector3(2.8, -0.3, -2.0));
      starFoxAudio.playLaser();
    }
  }

  public triggerBarrelRoll(direction: 'left' | 'right' = 'left') {
    if (this.isBarrelRolling || this.barrelRollCooldown > 0) return;
    this.isBarrelRolling = true;
    this.barrelRollTimer = 0.55;
    this.barrelRollDirection = direction;
    this.barrelRollCooldown = 0.75;
    this.cameraShakeIntensity = 0.22;
    starFoxAudio.playBarrelRoll();

    // Deflect nearby hostile lasers
    this.projectiles.forEach((p) => {
      if (!p.isPlayer && p.position.distanceTo(this.shipGroup.position) < 32) {
        p.velocity.negate().multiplyScalar(1.4);
        p.isPlayer = true;
      }
    });
  }

  public launchSmartBomb() {
    if (this.state.smartBombs <= 0 || this.state.isGameOver) return;
    this.state.smartBombs--;
    starFoxAudio.playSmartBomb();
    this.cameraShakeIntensity = 0.5;

    this.projectiles = this.projectiles.filter((p) => p.isPlayer);
    this.createShockwave(this.shipGroup.position);

    this.enemies.forEach((enemy) => {
      if (!enemy.destroyed) {
        enemy.health -= 350;
        if (enemy.health <= 0) {
          this.destroyEnemy(enemy);
        }
      }
    });

    this.notifyState();
  }

  private spawnPlayerLaser(localOffset: THREE.Vector3) {
    const laserGeo = new THREE.CapsuleGeometry(0.18, 3.2, 6, 8);
    laserGeo.rotateX(Math.PI / 2);
    const laserMat = new THREE.MeshBasicMaterial({
      color: 0x00f5d4,
    });
    const laserMesh = new THREE.Mesh(laserGeo, laserMat);

    const worldPos = localOffset.clone().applyMatrix4(this.shipMesh.matrixWorld);
    laserMesh.position.copy(worldPos);

    const progressU = Math.min(1.0, this.currentDistance / this.totalDistance);
    const railTangent = this.splineCurve.getTangentAt(progressU).normalize();
    const velocity = railTangent.clone().multiplyScalar(460);

    this.scene.add(laserMesh);
    this.projectiles.push({
      mesh: laserMesh,
      position: laserMesh.position,
      velocity,
      isPlayer: true,
      damage: 25,
      lifetime: 2.2,
    });
  }

  private releaseChargeShot() {
    starFoxAudio.playChargeShot();
    const chargeGeo = new THREE.SphereGeometry(1.6, 16, 16);
    const chargeMat = new THREE.MeshBasicMaterial({
      color: 0x48cae4,
    });
    const chargeMesh = new THREE.Mesh(chargeGeo, chargeMat);

    const worldPos = new THREE.Vector3(0, 0, -4.2).applyMatrix4(this.shipMesh.matrixWorld);
    chargeMesh.position.copy(worldPos);

    const progressU = Math.min(1.0, this.currentDistance / this.totalDistance);
    const railTangent = this.splineCurve.getTangentAt(progressU).normalize();
    const velocity = railTangent.clone().multiplyScalar(280);

    this.scene.add(chargeMesh);
    this.projectiles.push({
      mesh: chargeMesh,
      position: chargeMesh.position,
      velocity,
      isPlayer: true,
      damage: 180,
      lifetime: 3.0,
      isChargeShot: true,
    });

    this.chargeSphere.scale.set(1, 1, 1);
    (this.chargeSphere.material as THREE.MeshBasicMaterial).opacity = 0;
  }

  private createShockwave(pos: THREE.Vector3) {
    const shockGeo = new THREE.TorusGeometry(2, 0.8, 16, 48);
    const shockMat = new THREE.MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.85,
    });
    const shockMesh = new THREE.Mesh(shockGeo, shockMat);
    shockMesh.position.copy(pos);
    this.scene.add(shockMesh);

    let progress = 0;
    const interval = setInterval(() => {
      progress += 0.05;
      shockMesh.scale.set(progress * 40, progress * 40, progress * 40);
      shockMat.opacity = Math.max(0, 0.85 - progress * 0.9);
      if (progress >= 1.0) {
        clearInterval(interval);
        this.scene.remove(shockMesh);
        shockGeo.dispose();
        shockMat.dispose();
      }
    }, 25);
  }

  private destroyEnemy(enemy: EnemyShip) {
    enemy.destroyed = true;
    this.scene.remove(enemy.mesh);
    this.state.score += enemy.points;
    this.state.hits++;
    starFoxAudio.playExplosion();

    this.createExplosionParticles(enemy.mesh.position);
    this.notifyState();
  }

  private createExplosionParticles(pos: THREE.Vector3) {
    const count = 45;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities: THREE.Vector3[] = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = pos.x;
      positions[i * 3 + 1] = pos.y;
      positions[i * 3 + 2] = pos.z;

      velocities.push(
        new THREE.Vector3(
          (Math.random() - 0.5) * 35,
          (Math.random() - 0.5) * 35,
          (Math.random() - 0.5) * 35
        )
      );
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xffaa00,
      size: 1.6,
      transparent: true,
      opacity: 1.0,
    });

    const p = new THREE.Points(geo, mat);
    this.scene.add(p);
    this.explosionParticles.push(p);

    let age = 0;
    const interval = setInterval(() => {
      age += 0.04;
      const attr = geo.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;

      for (let i = 0; i < count; i++) {
        arr[i * 3 + 0] += velocities[i].x * 0.04;
        arr[i * 3 + 1] += velocities[i].y * 0.04;
        arr[i * 3 + 2] += velocities[i].z * 0.04;
      }
      attr.needsUpdate = true;
      mat.opacity = Math.max(0, 1.0 - age * 1.5);

      if (age >= 0.7) {
        clearInterval(interval);
        this.scene.remove(p);
        geo.dispose();
        mat.dispose();
      }
    }, 40);
  }

  // -------------------------------------------------------------
  // UPDATE TICK
  // -------------------------------------------------------------
  public update(dt: number) {
    if (this.state.isGameOver) return;

    // 1. Boost & Brake Mechanics
    let speedMult = 1.0;
    if (this.isBoosting && !this.state.isOverheated) {
      speedMult = 1.9;
      this.state.boostHeat = Math.min(1.0, this.state.boostHeat + dt * 0.28);
      if (this.state.boostHeat >= 1.0) {
        this.state.isOverheated = true;
      }
    } else {
      this.state.boostHeat = Math.max(0, this.state.boostHeat - dt * 0.22);
      if (this.state.boostHeat <= 0.2) {
        this.state.isOverheated = false;
      }
    }

    if (this.isBraking) {
      speedMult = 0.45;
    }

    this.currentSpeed = this.baseSpeed * speedMult;
    this.state.speed = Math.round(this.currentSpeed);

    starFoxAudio.setThrusterIntensity(speedMult, this.isBoosting && !this.state.isOverheated);

    // 2. Rail Curve Progress
    this.currentDistance += this.currentSpeed * dt;
    const progressU = Math.min(1.0, this.currentDistance / this.totalDistance);
    this.state.progressPercent = Math.round(progressU * 100);

    if (progressU >= 0.99 && !this.state.isMissionComplete) {
      this.state.isMissionComplete = true;
      this.notifyState();
    }

    // Spline Rail coordinate frame
    const railPos = this.splineCurve.getPointAt(progressU);
    const railTangent = this.splineCurve.getTangentAt(progressU).normalize();
    const railForward = railTangent.clone().normalize();
    const upRef = new THREE.Vector3(0, 1, 0);

    // Screen Right vector: cross(forward, up)
    const railRight = new THREE.Vector3().crossVectors(railForward, upRef).normalize();
    // Screen Up vector: cross(right, forward)
    const railUp = new THREE.Vector3().crossVectors(railRight, railForward).normalize();

    // 3. Agile Kinematics Steering:
    // inputYawRoll > 0 (right) moves +railRight (Screen Right)!
    // inputYawRoll < 0 (left) moves -railRight (Screen Left)!
    // inputPitch > 0 (up) moves +railUp (Screen Up)!
    // inputPitch < 0 (down) moves -railUp (Screen Down)!
    const lateralSpeed = 62.0; // Highly responsive & agile!
    const verticalSpeed = 50.0;

    this.shipLocalPos.x += this.inputYawRoll * lateralSpeed * dt;
    this.shipLocalPos.y += this.inputPitch * verticalSpeed * dt;

    // Screen Bounding Box: minX: -32, maxX: 32, minY: 3.5, maxY: 35
    this.shipLocalPos.x = THREE.MathUtils.clamp(this.shipLocalPos.x, -32, 32);
    this.shipLocalPos.y = THREE.MathUtils.clamp(this.shipLocalPos.y, 3.5, 35);

    if (this.inputYawRoll === 0) {
      this.shipLocalPos.x = THREE.MathUtils.lerp(this.shipLocalPos.x, 0, dt * 2.0);
    }

    // World position of the ship along rail coordinate system
    const worldShipPos = railPos
      .clone()
      .add(railRight.clone().multiplyScalar(this.shipLocalPos.x))
      .add(railUp.clone().multiplyScalar(this.shipLocalPos.y));

    this.shipGroup.position.copy(worldShipPos);

    // Unified Right-Handed Basis:
    // Local +X = railRight (Screen Right)
    // Local +Y = railUp (Screen Up)
    // Local -Z = railForward (Flight Forward)
    // Local +Z = -railForward (Towards Camera)
    const basis = new THREE.Matrix4().makeBasis(railRight, railUp, railForward.clone().negate());
    this.shipGroup.quaternion.setFromRotationMatrix(basis);

    // 4. Banking & Barrel Roll (100% Correct Direction):
    // Steer Right (inputYawRoll > 0) -> targetRoll = -inputYawRoll * 55 deg (right wing down, left wing up)!
    // Steer Left (inputYawRoll < 0) -> targetRoll = -inputYawRoll * 55 deg (left wing down, right wing up)!
    // Pull Up (inputPitch > 0) -> targetPitch = inputPitch * 25 deg (nose up)!
    // Dive Down (inputPitch < 0) -> targetPitch = inputPitch * 25 deg (nose down)!
    let targetRoll = -this.inputYawRoll * THREE.MathUtils.degToRad(55.0);
    let targetPitch = this.inputPitch * THREE.MathUtils.degToRad(25.0);

    if (this.isBarrelRolling) {
      this.barrelRollTimer -= dt;
      const rollProgress = 1.0 - this.barrelRollTimer / 0.55;
      const spinAngle = rollProgress * Math.PI * 2 * (this.barrelRollDirection === 'left' ? 1 : -1);
      this.shipMesh.rotation.z = spinAngle;

      if (this.barrelRollTimer <= 0) {
        this.isBarrelRolling = false;
      }
    } else {
      this.shipMesh.rotation.z = THREE.MathUtils.lerp(this.shipMesh.rotation.z, targetRoll, dt * 10.0);
    }
    this.shipMesh.rotation.x = THREE.MathUtils.lerp(this.shipMesh.rotation.x, targetPitch, dt * 10.0);

    if (this.barrelRollCooldown > 0) {
      this.barrelRollCooldown -= dt;
    }

    // 5. Airbrake Flaps Deployment & Thruster Flames
    const flapTargetAngle = this.isBraking ? THREE.MathUtils.degToRad(38.0) : 0;
    this.leftFlap.rotation.x = THREE.MathUtils.lerp(this.leftFlap.rotation.x, flapTargetAngle, dt * 12.0);
    this.rightFlap.rotation.x = THREE.MathUtils.lerp(this.rightFlap.rotation.x, flapTargetAngle, dt * 12.0);

    const flameScale = this.isBoosting && !this.state.isOverheated ? 2.6 : this.isBraking ? 0.35 : 1.0;
    this.thrusterFlames.forEach((flame) => {
      flame.scale.set(1.0, 1.0 + Math.random() * 0.15, flameScale);
    });

    // 6. Charge Shot Accumulation
    if (this.isFiring) {
      this.chargeTime = Math.min(this.MAX_CHARGE_TIME, this.chargeTime + dt);
      const chargeRatio = this.chargeTime / this.MAX_CHARGE_TIME;
      const s = 0.5 + chargeRatio * 2.2;
      this.chargeSphere.scale.set(s, s, s);
      (this.chargeSphere.material as THREE.MeshBasicMaterial).opacity = chargeRatio * 0.85;
      starFoxAudio.playChargeHum(chargeRatio);
    } else if (this.chargeTime >= 0.7) {
      this.releaseChargeShot();
      this.chargeTime = 0;
    } else {
      this.chargeTime = 0;
      (this.chargeSphere.material as THREE.MeshBasicMaterial).opacity = 0;
    }

    // 7. Chase Camera with Dynamic Bank Tilt & Speed FOV
    const defaultCamDist = 14.5;
    const defaultCamHeight = 4.2;
    const targetCamPos = worldShipPos
      .clone()
      .sub(railForward.clone().multiplyScalar(defaultCamDist))
      .add(railUp.clone().multiplyScalar(defaultCamHeight))
      .add(railRight.clone().multiplyScalar(this.shipLocalPos.x * 0.22));

    this.camera.position.lerp(targetCamPos, dt * 11.0);

    const camLookTarget = worldShipPos.clone().add(railForward.clone().multiplyScalar(55));
    this.camera.lookAt(camLookTarget);

    // Dynamic camera roll for visceral flight feel
    this.camera.rotation.z += this.shipMesh.rotation.z * 0.18;

    const targetFov = this.isBoosting && !this.state.isOverheated ? 82.0 : this.isBraking ? 60.0 : 68.0;
    this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, dt * 6.0);
    this.camera.updateProjectionMatrix();

    if (this.cameraShakeIntensity > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.cameraShakeIntensity * 2;
      this.camera.position.y += (Math.random() - 0.5) * this.cameraShakeIntensity * 2;
      this.cameraShakeIntensity = Math.max(0, this.cameraShakeIntensity - dt * 1.5);
    }

    // 8. 3D Wingtip Contrails Update
    const leftTipLocal = new THREE.Vector3(-4.8, 0.4, 1.8);
    const rightTipLocal = new THREE.Vector3(4.8, 0.4, 1.8);
    const leftTipWorld = leftTipLocal.applyMatrix4(this.shipMesh.matrixWorld);
    const rightTipWorld = rightTipLocal.applyMatrix4(this.shipMesh.matrixWorld);

    this.wingtipPointsLeft.unshift(leftTipWorld.clone());
    this.wingtipPointsRight.unshift(rightTipWorld.clone());
    if (this.wingtipPointsLeft.length > this.TRAIL_LENGTH) this.wingtipPointsLeft.pop();
    if (this.wingtipPointsRight.length > this.TRAIL_LENGTH) this.wingtipPointsRight.pop();

    const leftArr = (this.wingtipTrailGeoLeft.attributes.position as THREE.BufferAttribute).array as Float32Array;
    const rightArr = (this.wingtipTrailGeoRight.attributes.position as THREE.BufferAttribute).array as Float32Array;

    for (let i = 0; i < this.TRAIL_LENGTH; i++) {
      const pL = this.wingtipPointsLeft[i] || leftTipWorld;
      const pR = this.wingtipPointsRight[i] || rightTipWorld;
      leftArr[i * 3 + 0] = pL.x;
      leftArr[i * 3 + 1] = pL.y;
      leftArr[i * 3 + 2] = pL.z;
      rightArr[i * 3 + 0] = pR.x;
      rightArr[i * 3 + 1] = pR.y;
      rightArr[i * 3 + 2] = pR.z;
    }
    this.wingtipTrailGeoLeft.attributes.position.needsUpdate = true;
    this.wingtipTrailGeoRight.attributes.position.needsUpdate = true;

    // 9. Low-Altitude Water Spray
    if (worldShipPos.y <= 8.0) {
      this.waterSprayParticles.visible = true;
      this.waterSprayParticles.position.set(worldShipPos.x, 0.4, worldShipPos.z);
    } else {
      this.waterSprayParticles.visible = false;
    }

    if (this.speedLinesMesh) {
      (this.speedLinesMesh.material as THREE.LineBasicMaterial).opacity = this.isBoosting ? 0.75 : 0.25;
      this.speedLinesMesh.rotation.z += dt * (this.isBoosting ? 2.5 : 0.6);
    }

    // 10. Water Ocean Shader Animation
    if (this.oceanMaterial) {
      this.oceanMaterial.uniforms.time.value += dt;
    }

    // 11. Shield Bubble State (Disappears unless active!)
    if (this.shieldActiveTimer > 0) {
      this.shieldActiveTimer -= dt;
      this.shieldBubble.visible = true;
      this.shieldBubble.rotation.y += dt * 3.0;
      (this.shieldBubble.material as THREE.MeshBasicMaterial).opacity = Math.min(0.85, this.shieldActiveTimer * 2.0);
      this.state.shieldActive = true;
    } else {
      this.shieldBubble.visible = false;
      this.state.shieldActive = false;
    }

    // 12. Arches & Rings Collision Check
    this.archesAndRings.forEach((ring) => {
      if (!ring.collected && ring.position.distanceTo(worldShipPos) < ring.radius + 3.0) {
        ring.collected = true;
        ring.mesh.visible = false;
        starFoxAudio.playRingCollect();

        if (ring.type === 'boost_arch') {
          this.state.score += 1000;
          this.state.boostHeat = 0;
        } else if (ring.type === 'shield_ring') {
          // Activates shield bubble for 4 seconds!
          this.state.shield = Math.min(this.state.maxShield, this.state.shield + 30);
          this.shieldActiveTimer = 4.0;
          this.state.score += 350;
        } else {
          this.state.score += 500;
        }
        this.notifyState();
      }
    });

    // 13. Enemy Behaviors & Fire
    this.enemies.forEach((enemy) => {
      if (enemy.destroyed) return;

      if (enemy.type === 'crystal') {
        enemy.mesh.rotation.y += dt * 1.5;
        return;
      }

      const distToPlayer = enemy.mesh.position.distanceTo(worldShipPos);

      if (distToPlayer < 360 && enemy.mesh.position.z < worldShipPos.z) {
        enemy.fireCooldown -= dt;
        if (enemy.fireCooldown <= 0) {
          enemy.fireCooldown = enemy.type === 'drone' ? 1.6 : 2.4;
          this.spawnHostileLaser(enemy.mesh.position, worldShipPos);
        }
      }
    });

    // 14. Projectiles Update & Collisions
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.lifetime -= dt;
      p.position.addScaledVector(p.velocity, dt);

      if (p.isPlayer) {
        for (const enemy of this.enemies) {
          if (!enemy.destroyed && p.position.distanceTo(enemy.mesh.position) < (p.isChargeShot ? 14 : 4.5)) {
            enemy.health -= p.damage;
            p.lifetime = 0;
            if (enemy.health <= 0) {
              this.destroyEnemy(enemy);
            }
            break;
          }
        }
      } else {
        if (p.position.distanceTo(worldShipPos) < 3.8) {
          p.lifetime = 0;
          if (this.isBarrelRolling) {
            starFoxAudio.playBarrelRoll();
          } else if (this.shieldActiveTimer > 0) {
            // Shield absorbed!
            starFoxAudio.playHit();
            this.cameraShakeIntensity = 0.15;
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

    // 15. Radio Dialogue Triggers
    this.checkRadioDialogue();
  }

  private spawnHostileLaser(from: THREE.Vector3, to: THREE.Vector3) {
    const laserGeo = new THREE.CapsuleGeometry(0.25, 2.2, 6, 8);
    laserGeo.rotateX(Math.PI / 2);
    const laserMat = new THREE.MeshBasicMaterial({ color: 0xff0055 });
    const laserMesh = new THREE.Mesh(laserGeo, laserMat);

    laserMesh.position.copy(from);
    const dir = new THREE.Vector3().subVectors(to, from).normalize();
    laserMesh.lookAt(to);

    this.scene.add(laserMesh);
    this.projectiles.push({
      mesh: laserMesh,
      position: laserMesh.position,
      velocity: dir.multiplyScalar(150),
      isPlayer: false,
      damage: 15,
      lifetime: 3.5,
    });
  }

  public takePlayerDamage(damage: number) {
    if (this.isBarrelRolling || this.shieldActiveTimer > 0) return;
    this.state.shield = Math.max(0, this.state.shield - damage);
    this.cameraShakeIntensity = 0.35;
    starFoxAudio.playHit();

    // Brief flash of shield on damage
    this.shieldActiveTimer = 0.6;

    if (this.state.shield <= 0) {
      this.state.isGameOver = true;
      this.createExplosionParticles(this.shipGroup.position);
      starFoxAudio.playExplosion();
    }
    this.notifyState();
  }

  private checkRadioDialogue() {
    for (const d of this.dialogueEvents) {
      if (!d.triggered && this.currentDistance >= d.dist) {
        d.triggered = true;
        this.state.dialogue = {
          speaker: d.speaker,
          text: d.text,
          visible: true,
        };
        starFoxAudio.playRadioBeep();
        this.notifyState();

        setTimeout(() => {
          if (this.state.dialogue?.text === d.text) {
            this.state.dialogue = null;
            this.notifyState();
          }
        }, d.duration * 1000);
        break;
      }
    }
  }

  private notifyState() {
    if (this.onStateUpdate) {
      this.onStateUpdate({ ...this.state });
    }
  }

  // -------------------------------------------------------------
  // RENDER & RUN LOOP
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
      const dt = Math.min(0.1, this.clock.getDelta());
      this.update(dt);
      this.composer.render();
      this.notifyState();
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
    if (!this.camera || !this.renderer || !this.composer) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.composer.setSize(width, height);
  }

  public restart() {
    this.currentDistance = 0;
    this.shipLocalPos.set(0, 16, 0);
    this.shieldActiveTimer = 0;
    this.state = {
      shield: 100,
      maxShield: 100,
      boostHeat: 0,
      isOverheated: false,
      smartBombs: 3,
      score: 0,
      hits: 0,
      speed: 105,
      progressPercent: 0,
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
    });
    this.notifyState();
  }

  public dispose() {
    this.stop();
    starFoxAudio.dispose();
    this.renderer.dispose();
  }
}
