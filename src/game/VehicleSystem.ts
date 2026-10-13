import * as THREE from 'three';
import { VehicleData, VehicleType, ObstacleCollider } from '../types';
import { TerrainManager } from './Terrain';
import { audioEngine } from './AudioEngine';
import { BuildingSystem } from './BuildingSystem';

interface WheelMeshes {
  flHub: THREE.Group;
  frHub: THREE.Group;
  flWheel: THREE.Mesh;
  frWheel: THREE.Mesh;
  rlWheel: THREE.Mesh;
  rrWheel: THREE.Mesh;
  steeringWheel?: THREE.Mesh;
  chassisMesh: THREE.Group;
  exhaustPipes: THREE.Vector3[];
  brakeLights?: THREE.Mesh[];
  brakeMat?: THREE.MeshStandardMaterial;
}

export class VehicleSystem {
  public group: THREE.Group = new THREE.Group();
  public vehicles: {
    data: VehicleData;
    mesh: THREE.Group;
    parts: WheelMeshes;
  }[] = [];

  public activeVehicleIndex: number = -1;

  // Particle systems
  private sparkGeo: THREE.BufferGeometry;
  private sparkMat: THREE.PointsMaterial;
  private sparkPoints: THREE.Points;
  private sparkParticles: { pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number; color: THREE.Color }[] = [];

  private flameGeo: THREE.BufferGeometry;
  private flameMat: THREE.PointsMaterial;
  private flamePoints: THREE.Points;
  private flameParticles: { pos: THREE.Vector3; vel: THREE.Vector3; life: number; maxLife: number }[] = [];

  private lastScrapeSoundTime = 0;

  constructor(
    private scene: THREE.Scene,
    private buildingSystem: BuildingSystem
  ) {
    this.group.name = 'VehiclesGroup';
    this.scene.add(this.group);

    // 1. Drift sparks particle system
    const maxSparks = 250;
    this.sparkGeo = new THREE.BufferGeometry();
    const sparkPos = new Float32Array(maxSparks * 3);
    const sparkCol = new Float32Array(maxSparks * 3);
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
    this.sparkMat = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
    });
    this.sparkPoints = new THREE.Points(this.sparkGeo, this.sparkMat);
    this.scene.add(this.sparkPoints);

    // 2. Exhaust turbo flames particle system
    const maxFlames = 180;
    this.flameGeo = new THREE.BufferGeometry();
    const flamePos = new Float32Array(maxFlames * 3);
    this.flameGeo.setAttribute('position', new THREE.BufferAttribute(flamePos, 3));
    this.flameMat = new THREE.PointsMaterial({
      color: 0x38bdf8,
      size: 0.55,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
    });
    this.flamePoints = new THREE.Points(this.flameGeo, this.flameMat);
    this.scene.add(this.flamePoints);

    this.spawnDefaultVehicles();
  }

  /**
   * Spawns initial vehicles near the starter basin and road track
   */
  private spawnDefaultVehicles() {
    // 1. Classic Mario Kart at starter basin (x: 12, z: 8)
    this.createVehicle('kart_classic', 12, 8, 0, 'Standard-Kart');

    // 2. Turbo GT Racer near the east road (x: 45, z: 20)
    this.createVehicle('kart_sport', 45, 20, Math.PI / 4, 'Turbo GT Racer');

    // 3. Offroad Buggy near the mountain foothills (x: -35, z: 35)
    this.createVehicle('buggy_offroad', -35, 35, -Math.PI / 3, 'Offroad-Buggy');

    // 4. Sheikah Master Cycle near ancient ruins (x: -65, z: -40)
    this.createVehicle('hover_cycle', -65, -40, Math.PI / 2, 'Sheikah-Bike');
  }

  /**
   * Public creation method to place a vehicle at any coordinate in the world or track
   */
  public createVehicle(
    type: VehicleType,
    x: number,
    z: number,
    rotation: number = 0,
    name?: string
  ): { id: string; index: number } {
    const y = TerrainManager.getTerrainHeight(x, z);
    const id = `vehicle_${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    const vehicleGroup = new THREE.Group();
    vehicleGroup.position.set(x, y, z);
    vehicleGroup.rotation.y = rotation;
    vehicleGroup.scale.set(1.46, 1.46, 1.46); // Scaled naturally to fit avatar hero cleanly inside the cockpit!

    let parts: WheelMeshes;
    let maxSpeed = 28.0;

    switch (type) {
      case 'kart_sport':
        parts = this.buildSportKartMesh(vehicleGroup);
        maxSpeed = 35.0;
        break;
      case 'buggy_offroad':
        parts = this.buildBuggyMesh(vehicleGroup);
        maxSpeed = 26.0;
        break;
      case 'hover_cycle':
        parts = this.buildHoverCycleMesh(vehicleGroup);
        maxSpeed = 33.0;
        break;
      case 'kart_classic':
      default:
        parts = this.buildClassicKartMesh(vehicleGroup);
        maxSpeed = 29.0;
        break;
    }

    this.group.add(vehicleGroup);

    const defaultNames: Record<VehicleType, string> = {
      kart_classic: 'Standard-Kart',
      kart_sport: 'Turbo GT Racer',
      buggy_offroad: 'Offroad-Buggy',
      hover_cycle: 'Sheikah-Bike',
    };

    const data: VehicleData = {
      id,
      type,
      name: name || defaultNames[type],
      position: { x, y, z },
      rotation,
      velocity: { x: 0, y: 0, z: 0 },
      speed: 0,
      maxSpeed,
      steerAngle: 0,
      isDriving: false,
      isDrifting: false,
      driftStage: 0,
      turboTimer: 0,
    };

    const index = this.vehicles.length;
    this.vehicles.push({ data, mesh: vehicleGroup, parts });
    return { id, index };
  }

  // ==========================================
  // PROCEDURAL 3D VEHICLE MESH BUILDERS
  // ==========================================

  /**
   * 1. CLASSIC GO-KART (Mario Kart style red & white racing kart)
   */
  private buildClassicKartMesh(root: THREE.Group): WheelMeshes {
    const chassisGroup = new THREE.Group();
    root.add(chassisGroup);

    const redMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.35, metalness: 0.2 });
    const whiteMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    const blackMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });
    const chromeMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.9, roughness: 0.15 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.9 });
    const yellowMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.3 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });

    // Chassis tub base
    const tub = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 2.2), redMat);
    tub.position.y = 0.32;
    tub.castShadow = true;
    chassisGroup.add(tub);

    // White center racing stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.23, 2.22), whiteMat);
    stripe.position.y = 0.32;
    chassisGroup.add(stripe);

    // Front aerofoil / bumper nose
    const nose = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.15, 0.55), redMat);
    nose.position.set(0, 0.25, 1.2);
    nose.castShadow = true;
    chassisGroup.add(nose);

    // Twin front round headlights
    const hlL = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12), lightMat);
    hlL.rotation.x = Math.PI / 2;
    hlL.position.set(-0.45, 0.32, 1.45);
    chassisGroup.add(hlL);
    const hlR = hlL.clone();
    hlR.position.x = 0.45;
    chassisGroup.add(hlR);

    // Radiator side pods
    const podL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.28, 1.1), redMat);
    podL.position.set(-0.68, 0.34, -0.05);
    chassisGroup.add(podL);
    const podR = podL.clone();
    podR.position.x = 0.68;
    chassisGroup.add(podR);

    // Driver bucket seat (Wide ergonomically contoured sports seat)
    const seatBase = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.18, 0.58), blackMat);
    seatBase.position.set(0, 0.38, -0.16);
    chassisGroup.add(seatBase);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.65, 0.16), blackMat);
    seatBack.position.set(0, 0.70, -0.44);
    seatBack.rotation.x = -0.14;
    chassisGroup.add(seatBack);

    // Steering column and wheel
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8), chromeMat);
    column.rotation.x = -Math.PI / 4;
    column.position.set(0, 0.55, 0.35);
    chassisGroup.add(column);

    const steerGeo = new THREE.TorusGeometry(0.18, 0.03, 8, 16);
    const steerWheel = new THREE.Mesh(steerGeo, yellowMat);
    steerWheel.position.set(0, 0.75, 0.18);
    steerWheel.rotation.x = -Math.PI / 4;
    chassisGroup.add(steerWheel);

    // Rear engine block
    const engine = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.5), chromeMat);
    engine.position.set(0, 0.52, -0.85);
    chassisGroup.add(engine);

    // Rear wing spoiler
    const wingStrutL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.45, 0.08), blackMat);
    wingStrutL.position.set(-0.45, 0.72, -1.1);
    chassisGroup.add(wingStrutL);
    const wingStrutR = wingStrutL.clone();
    wingStrutR.position.x = 0.45;
    chassisGroup.add(wingStrutR);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.06, 0.35), redMat);
    wing.position.set(0, 0.94, -1.15);
    wing.castShadow = true;
    chassisGroup.add(wing);

    // Glowing LED Tail / Brake Lights
    const brakeMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
    const brakeLightL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.08, 0.06), brakeMat);
    brakeLightL.position.set(-0.48, 0.42, -1.26);
    chassisGroup.add(brakeLightL);
    const brakeLightR = brakeLightL.clone();
    brakeLightR.position.x = 0.48;
    chassisGroup.add(brakeLightR);

    // Chrome twin exhaust pipes
    const pipeL = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 10), chromeMat);
    pipeL.rotation.x = Math.PI / 2;
    pipeL.position.set(-0.2, 0.38, -1.25);
    chassisGroup.add(pipeL);
    const pipeR = pipeL.clone();
    pipeR.position.x = 0.2;
    chassisGroup.add(pipeR);

    // 4 Wheels (Front hubs pivot for steering, wheels spin)
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.24, 16);
    wheelGeo.rotateZ(Math.PI / 2);

    const capGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.26, 12);
    capGeo.rotateZ(Math.PI / 2);

    const createWheel = (capColor: number) => {
      const g = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, tireMat);
      tire.castShadow = true;
      g.add(tire);
      const cap = new THREE.Mesh(capGeo, new THREE.MeshStandardMaterial({ color: capColor, metalness: 0.6 }));
      g.add(cap);
      return g as any;
    };

    // Front Left Hub
    const flHub = new THREE.Group();
    flHub.position.set(-0.72, 0.3, 0.85);
    root.add(flHub);
    const flWheel = createWheel(0xdc2626);
    flHub.add(flWheel);

    // Front Right Hub
    const frHub = new THREE.Group();
    frHub.position.set(0.72, 0.3, 0.85);
    root.add(frHub);
    const frWheel = createWheel(0xdc2626);
    frHub.add(frWheel);

    // Rear Wheels
    const rlWheel = createWheel(0xdc2626);
    rlWheel.position.set(-0.76, 0.34, -0.8);
    rlWheel.scale.set(1.15, 1.15, 1.25);
    root.add(rlWheel);

    const rrWheel = createWheel(0xdc2626);
    rrWheel.position.set(0.76, 0.34, -0.8);
    rrWheel.scale.set(1.15, 1.15, 1.25);
    root.add(rrWheel);

    return {
      flHub,
      frHub,
      flWheel,
      frWheel,
      rlWheel,
      rrWheel,
      steeringWheel: steerWheel,
      chassisMesh: chassisGroup,
      brakeLights: [brakeLightL, brakeLightR],
      brakeMat,
      exhaustPipes: [
        new THREE.Vector3(-0.2 * 1.46, 0.38 * 1.46, -1.3 * 1.46),
        new THREE.Vector3(0.2 * 1.46, 0.38 * 1.46, -1.3 * 1.46),
      ],
    };
  }

  /**
   * 2. TURBO GT SPORT RACER (Cyan / Gold high-speed aerodynamic kart)
   */
  private buildSportKartMesh(root: THREE.Group): WheelMeshes {
    const chassisGroup = new THREE.Group();
    root.add(chassisGroup);

    const cyanMat = new THREE.MeshStandardMaterial({ color: 0x06b6d4, roughness: 0.25, metalness: 0.35 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.2, metalness: 0.85 });
    const carbonMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.85 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });

    // Wedge body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.24, 2.4), cyanMat);
    body.position.y = 0.34;
    body.castShadow = true;
    chassisGroup.add(body);

    // Gold aero stripes
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.25, 2.42), goldMat);
    stripe.position.y = 0.34;
    chassisGroup.add(stripe);

    // Pointed nose splitter
    const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.08, 0.65), carbonMat);
    splitter.position.set(0, 0.22, 1.35);
    splitter.castShadow = true;
    chassisGroup.add(splitter);

    // LED headlights
    const ledL = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.08), lightMat);
    ledL.position.set(-0.45, 0.36, 1.48);
    chassisGroup.add(ledL);
    const ledR = ledL.clone();
    ledR.position.x = 0.45;
    chassisGroup.add(ledR);

    // Streamlined cockpit cowling
    const cowl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.8, 12), cyanMat);
    cowl.rotation.x = Math.PI / 2;
    cowl.position.set(0, 0.52, 0.3);
    chassisGroup.add(cowl);

    // Sport steering wheel
    const steerWheel = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.035, 8, 16), goldMat);
    steerWheel.position.set(0, 0.72, 0.2);
    steerWheel.rotation.x = -Math.PI / 4;
    chassisGroup.add(steerWheel);

    // Large high-downforce GT rear wing
    const wingStrut = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.5, 0.1), carbonMat);
    wingStrut.position.set(-0.5, 0.75, -1.15);
    chassisGroup.add(wingStrut);
    const wingStrutR = wingStrut.clone();
    wingStrutR.position.x = 0.5;
    chassisGroup.add(wingStrutR);

    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.05, 0.42), cyanMat);
    wing.position.set(0, 1.0, -1.2);
    wing.castShadow = true;
    chassisGroup.add(wing);

    // Triple exhaust cluster
    const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.2 });
    [-0.22, 0, 0.22].forEach((px) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.35, 10), exhaustMat);
      p.rotation.x = Math.PI / 2;
      p.position.set(px, 0.38, -1.3);
      chassisGroup.add(p);
    });

    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.26, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const createWheel = () => {
      const g = new THREE.Group();
      const tire = new THREE.Mesh(wheelGeo, tireMat);
      tire.castShadow = true;
      g.add(tire);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.28, 12), goldMat);
      rim.rotation.z = Math.PI / 2;
      g.add(rim);
      return g as any;
    };

    const flHub = new THREE.Group();
    flHub.position.set(-0.76, 0.32, 0.95);
    root.add(flHub);
    const flWheel = createWheel();
    flHub.add(flWheel);

    const frHub = new THREE.Group();
    frHub.position.set(0.76, 0.32, 0.95);
    root.add(frHub);
    const frWheel = createWheel();
    frHub.add(frWheel);

    const rlWheel = createWheel();
    rlWheel.position.set(-0.8, 0.36, -0.85);
    rlWheel.scale.set(1.2, 1.2, 1.3);
    root.add(rlWheel);

    const rrWheel = createWheel();
    rrWheel.position.set(0.8, 0.36, -0.85);
    rrWheel.scale.set(1.2, 1.2, 1.3);
    root.add(rrWheel);

    // Glowing LED Tail / Brake Lights
    const brakeMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0xdc2626,
      emissiveIntensity: 0.9,
      roughness: 0.2,
    });
    const brakeLightL = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 0.06), brakeMat);
    brakeLightL.position.set(-0.54, 0.42, -1.32);
    chassisGroup.add(brakeLightL);
    const brakeLightR = brakeLightL.clone();
    brakeLightR.position.x = 0.54;
    chassisGroup.add(brakeLightR);

    return {
      flHub,
      frHub,
      flWheel,
      frWheel,
      rlWheel,
      rrWheel,
      steeringWheel: steerWheel,
      chassisMesh: chassisGroup,
      brakeLights: [brakeLightL, brakeLightR],
      brakeMat,
      exhaustPipes: [
        new THREE.Vector3(-0.22 * 1.46, 0.38 * 1.46, -1.35 * 1.46),
        new THREE.Vector3(0, 0.38 * 1.46, -1.35 * 1.46),
        new THREE.Vector3(0.22 * 1.46, 0.38 * 1.46, -1.35 * 1.46),
      ],
    };
  }

  /**
   * 3. OFFROAD DUNE BUGGY (Roll cage, high ground clearance, knobby tires)
   */
  private buildBuggyMesh(root: THREE.Group): WheelMeshes {
    const chassisGroup = new THREE.Group();
    root.add(chassisGroup);

    const greenMat = new THREE.MeshStandardMaterial({ color: 0x4d7c0f, roughness: 0.6 });
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.4 });
    const tubeMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.5, metalness: 0.7 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.95 });
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });

    // High tub body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 2.1), greenMat);
    body.position.y = 0.52;
    body.castShadow = true;
    chassisGroup.add(body);

    // Tubular Roll Cage Frame
    const cageCorners = [
      { x: -0.5, z: 0.6 },
      { x: 0.5, z: 0.6 },
      { x: -0.5, z: -0.6 },
      { x: 0.5, z: -0.6 },
    ];
    cageCorners.forEach((c) => {
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.85, 8), tubeMat);
      p.position.set(c.x, 0.95, c.z);
      chassisGroup.add(p);
    });

    // Roof rack & 4 rally lights
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 1.3), orangeMat);
    roof.position.set(0, 1.38, 0);
    roof.castShadow = true;
    chassisGroup.add(roof);

    for (let i = -1.5; i <= 1.5; i += 1.0) {
      const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.08, 10), lightMat);
      lamp.rotation.x = Math.PI / 2;
      lamp.position.set(i * 0.28, 1.48, 0.65);
      chassisGroup.add(lamp);
    }

    // Steering wheel
    const steerWheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.035, 8, 16), orangeMat);
    steerWheel.position.set(0, 0.82, 0.25);
    steerWheel.rotation.x = -Math.PI / 4;
    chassisGroup.add(steerWheel);

    // Giant knobby tires
    const tireGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.35, 16);
    tireGeo.rotateZ(Math.PI / 2);
    const createKnobbyWheel = () => {
      const g = new THREE.Group();
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.castShadow = true;
      g.add(tire);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.37, 12), orangeMat);
      hub.rotation.z = Math.PI / 2;
      g.add(hub);
      return g as any;
    };

    const flHub = new THREE.Group();
    flHub.position.set(-0.85, 0.45, 0.85);
    root.add(flHub);
    const flWheel = createKnobbyWheel();
    flHub.add(flWheel);

    const frHub = new THREE.Group();
    frHub.position.set(0.85, 0.45, 0.85);
    root.add(frHub);
    const frWheel = createKnobbyWheel();
    frHub.add(frWheel);

    const rlWheel = createKnobbyWheel();
    rlWheel.position.set(-0.9, 0.48, -0.85);
    rlWheel.scale.set(1.15, 1.15, 1.15);
    root.add(rlWheel);

    const rrWheel = createKnobbyWheel();
    rrWheel.position.set(0.9, 0.48, -0.85);
    rrWheel.scale.set(1.15, 1.15, 1.15);
    root.add(rrWheel);

    return {
      flHub,
      frHub,
      flWheel,
      frWheel,
      rlWheel,
      rrWheel,
      steeringWheel: steerWheel,
      chassisMesh: chassisGroup,
      exhaustPipes: [
        new THREE.Vector3(-0.35 * 1.46, 0.95 * 1.46, -1.15 * 1.46),
        new THREE.Vector3(0.35 * 1.46, 0.95 * 1.46, -1.15 * 1.46),
      ],
    };
  }

  /**
   * 4. SHEIKAH MASTER CYCLE (Futuristic ancient-tech racing superbike)
   */
  private buildHoverCycleMesh(root: THREE.Group): WheelMeshes {
    const chassisGroup = new THREE.Group();
    root.add(chassisGroup);

    const sheikahMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.5 });
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xb45309, roughness: 0.35, metalness: 0.8 });
    const runeNeonMat = new THREE.MeshStandardMaterial({
      color: 0x00f0ff,
      emissive: 0x00d8f6,
      emissiveIntensity: 2.2,
      roughness: 0.1,
    });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.8 });

    // Streamlined central spine
    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 2.3), sheikahMat);
    spine.position.y = 0.55;
    spine.castShadow = true;
    chassisGroup.add(spine);

    // Horse/Eagle Visor Cowl Front
    const cowl = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 6), bronzeMat);
    cowl.rotation.x = Math.PI / 2.3;
    cowl.position.set(0, 0.72, 1.1);
    cowl.castShadow = true;
    chassisGroup.add(cowl);

    // Glowing Ancient Rune Eye on Cowl
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 12), runeNeonMat);
    eye.position.set(0, 0.82, 1.35);
    chassisGroup.add(eye);

    // Handlebars
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8), bronzeMat);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 0.85, 0.55);
    chassisGroup.add(bar);

    // Ancient Turbine Wheels with glowing Sheikah Rings
    const createCycleWheel = () => {
      const g = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.28, 18), tireMat);
      tire.rotation.z = Math.PI / 2;
      tire.castShadow = true;
      g.add(tire);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.04, 8, 18), runeNeonMat);
      ring.rotation.y = Math.PI / 2;
      g.add(ring);
      return g as any;
    };

    const flHub = new THREE.Group();
    flHub.position.set(0, 0.45, 1.15);
    root.add(flHub);
    const frontWheel = createCycleWheel();
    flHub.add(frontWheel);

    const rearWheel = createCycleWheel();
    rearWheel.position.set(0, 0.45, -0.95);
    root.add(rearWheel);

    // Stub dummy wheels for wheel interface compatibility
    const dummyWheel = new THREE.Mesh();

    return {
      flHub,
      frHub: flHub,
      flWheel: frontWheel,
      frWheel: dummyWheel,
      rlWheel: rearWheel,
      rrWheel: dummyWheel,
      chassisMesh: chassisGroup,
      exhaustPipes: [
        new THREE.Vector3(-0.16 * 1.46, 0.55 * 1.46, -1.25 * 1.46),
        new THREE.Vector3(0.16 * 1.46, 0.55 * 1.46, -1.25 * 1.46),
      ],
    };
  }

  // ==========================================
  // DRIVER INTERACTION & MOUNTING
  // ==========================================

  /**
   * Find nearby vehicle within interactable radius
   */
  public getNearbyVehicle(playerPos: THREE.Vector3, maxDist: number = 3.8): { vehicle: VehicleData; index: number } | null {
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i].data;
      const dist = Math.hypot(v.position.x - playerPos.x, v.position.z - playerPos.z);
      if (dist < maxDist) {
        return { vehicle: v, index: i };
      }
    }
    return null;
  }

  /**
   * Enter vehicle driver's seat
   */
  public enterVehicle(index: number): { success: boolean; message: string } {
    if (index < 0 || index >= this.vehicles.length) {
      return { success: false, message: 'Fahrzeug nicht gefunden!' };
    }
    this.activeVehicleIndex = index;
    const v = this.vehicles[index];
    v.data.isDriving = true;
    audioEngine.playVehicleEnter();
    return {
      success: true,
      message: `🏎️ Eingestiegen in ${v.data.name}! [WASD] Fahren, [Space] Power-Slide Drift, [Shift] Turbo, [E] Aussteigen.`,
    };
  }

  /**
   * Exit active vehicle
   */
  public exitVehicle(): { success: boolean; exitPos: THREE.Vector3; message: string } {
    if (this.activeVehicleIndex < 0) {
      return { success: false, exitPos: new THREE.Vector3(), message: 'Du sitzt in keinem Fahrzeug!' };
    }
    const v = this.vehicles[this.activeVehicleIndex];
    v.data.isDriving = false;
    v.data.speed = 0;
    v.data.isDrifting = false;
    v.data.driftStage = 0;

    // Spawn player safely to the left of the car
    const exitX = v.data.position.x - Math.cos(v.data.rotation) * 2.2;
    const exitZ = v.data.position.z + Math.sin(v.data.rotation) * 2.2;
    const exitY = TerrainManager.getTerrainHeight(exitX, exitZ) + 0.2;
    const exitPos = new THREE.Vector3(exitX, exitY, exitZ);

    this.activeVehicleIndex = -1;
    audioEngine.playVehicleExit();
    return { success: true, exitPos, message: `${v.data.name} verlassen.` };
  }

  // ==========================================
  // MARIO KART DRIVING PHYSICS & SIMULATION
  // ==========================================

  public update(
    delta: number,
    input?: { moveX: number; moveZ: number; isSprint?: boolean; isJump?: boolean },
    cameraYaw: number = 0
  ) {
    const dt = Math.min(0.05, delta);

    // 1. Update all vehicles
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const data = v.data;
      const isPlayerDriving = i === this.activeVehicleIndex;

      if (isPlayerDriving && input) {
        this.updateDriverPhysics(v, input, dt, cameraYaw);
      } else {
        // Idle vehicle physics: ground adhesion and slight rolling friction
        data.speed = THREE.MathUtils.lerp(data.speed, 0, dt * 4.0);
        const groundY = TerrainManager.getTerrainHeight(data.position.x, data.position.z);
        data.position.y = groundY;
        v.mesh.position.set(data.position.x, data.position.y, data.position.z);
      }
    }

    // 2. Update particle systems
    this.updateParticles(dt);
  }

  /**
   * Handles user input, acceleration, steering, Mario Kart drifting, mini-turbo, and wall collision
   */
  private updateDriverPhysics(
    veh: { data: VehicleData; mesh: THREE.Group; parts: WheelMeshes },
    input: { moveX: number; moveZ: number; isSprint?: boolean; isJump?: boolean },
    dt: number,
    _cameraYaw: number
  ) {
    const data = veh.data;
    const parts = veh.parts;

    const gasInput = input.moveZ; // 1 = gas forward, -1 = brake/reverse
    const steerInput = -input.moveX; // 1 = steer left, -1 = steer right
    const driftKey = !!input.isJump; // Space holds drift
    const manualBoostKey = !!input.isSprint; // Shift boost

    // 1. Acceleration & Braking Dynamics
    let targetSpeed = 0;
    const accelRate = 22.0; // m/s²
    const brakeRate = 30.0; // m/s²
    const naturalFriction = 6.0; // m/s²

    if (gasInput > 0.05) {
      targetSpeed = data.maxSpeed * gasInput;
      if (data.turboTimer > 0) {
        targetSpeed += 14.0; // Turbo boost top speed extension!
      }
      data.speed = THREE.MathUtils.lerp(data.speed, targetSpeed, dt * (accelRate / data.maxSpeed));
    } else if (gasInput < -0.05) {
      if (data.speed > 1.0) {
        // Strong foot brake
        data.speed = THREE.MathUtils.lerp(data.speed, 0, dt * (brakeRate / data.maxSpeed));
      } else {
        // Reverse gear
        targetSpeed = -10.0;
        data.speed = THREE.MathUtils.lerp(data.speed, targetSpeed, dt * 3.5);
      }
    } else {
      // Natural rolling friction coasting
      data.speed = THREE.MathUtils.lerp(data.speed, 0, dt * naturalFriction);
    }

    // Dynamic brake lights illumination
    const isBraking = gasInput < -0.05;
    if (parts.brakeMat) {
      parts.brakeMat.emissiveIntensity = isBraking ? 3.8 : 0.8;
      parts.brakeMat.color.setHex(isBraking ? 0xff0000 : 0xef4444);
    }

    // Manual Nitro Boost (Shift on PC, Turbo Button on Tablet)
    if (manualBoostKey && data.turboTimer <= 0) {
      data.turboTimer = 2.0;
      data.speed = Math.max(data.speed + 14.0, 22.0);
      audioEngine.playMiniTurboBoost(2);
    }

    // Turbo Timer countdown
    if (data.turboTimer > 0) {
      data.turboTimer -= dt;
      // Spawn boost exhaust flames!
      if (Math.random() < 0.6) {
        this.spawnBoostFlame(veh);
      }
    }

    // 2. Mario Kart Power-Slide Drift System (Can drift once rolling > 3.5 m/s)
    const canDrift = Math.abs(data.speed) > 3.5;

    if (driftKey && canDrift && Math.abs(steerInput) > 0.15) {
      if (!data.isDrifting) {
        // Hop into drift!
        data.isDrifting = true;
        data.driftStage = 0;
        audioEngine.playDriftSqueal();
      }

      // Progress drift stages based on continuous slide duration
      if (data.driftStage === 0) {
        data.driftStage = 1; // Stage 1 (Blue sparks)
      } else if (data.driftStage === 1 && Math.random() < dt * 0.9) {
        data.driftStage = 2; // Stage 2 (Orange sparks)
      } else if (data.driftStage === 2 && Math.random() < dt * 0.7) {
        data.driftStage = 3; // Stage 3 (Purple ultra mini-turbo)
      }

      // Emit dynamic drift sparks from rear wheels
      this.spawnDriftSparks(veh, data.driftStage);
      audioEngine.playDriftSqueal();
    } else if (!driftKey && data.isDrifting) {
      // RELEASE DRIFT -> TRIGGER MINI-TURBO!
      const stage = data.driftStage;
      data.isDrifting = false;
      data.driftStage = 0;

      if (stage >= 1) {
        const boostDuration = stage === 3 ? 2.5 : stage === 2 ? 1.8 : 1.0;
        const boostSpeedBump = stage === 3 ? 22.0 : stage === 2 ? 14.0 : 8.0;
        data.turboTimer = boostDuration;
        data.speed = Math.min(data.maxSpeed + 16.0, data.speed + boostSpeedBump);
        audioEngine.playMiniTurboBoost(stage);
      }
    }

    // 3. Responsive Steering with Steering Lock
    const targetSteerAngle = steerInput * (data.isDrifting ? 0.65 : 0.48);
    data.steerAngle = THREE.MathUtils.lerp(data.steerAngle, targetSteerAngle, dt * 10.0);

    // Front wheel visual turning
    if (parts.flHub && parts.frHub) {
      parts.flHub.rotation.y = data.steerAngle;
      parts.frHub.rotation.y = data.steerAngle;
    }
    if (parts.steeringWheel) {
      parts.steeringWheel.rotation.z = -data.steerAngle * 1.8;
    }

    // Wheel spin rotation proportional to distance traveled
    const wheelSpin = (data.speed * dt) / 0.32;
    if (parts.flWheel) parts.flWheel.rotation.x += wheelSpin;
    if (parts.frWheel) parts.frWheel.rotation.x += wheelSpin;
    if (parts.rlWheel) parts.rlWheel.rotation.x += wheelSpin;
    if (parts.rrWheel) parts.rrWheel.rotation.x += wheelSpin;

    // Apply vehicle yaw turning (turns faster while drifting)
    const turnSensitivity = data.isDrifting ? 3.4 : 2.6;
    const speedFraction = Math.min(1.0, Math.abs(data.speed) / 14.0);
    const turnDelta = data.steerAngle * turnSensitivity * speedFraction * (data.speed >= 0 ? 1 : -1) * dt;
    data.rotation += turnDelta;

    // Visual Chassis Body Lean / Roll into turns
    const targetRoll = -data.steerAngle * 0.22;
    parts.chassisMesh.rotation.z = THREE.MathUtils.lerp(parts.chassisMesh.rotation.z, targetRoll, dt * 8.0);

    // 4. Position Progression & WALL COLLISION DETECTION
    const forwardX = Math.sin(data.rotation) * data.speed;
    const forwardZ = Math.cos(data.rotation) * data.speed;

    const nextX = data.position.x + forwardX * dt;
    const nextZ = data.position.z + forwardZ * dt;

    // Solid Wall & Obstacle Collision Check (Radius = 1.35m matching 1.46x scaled vehicle body)
    const vehicleRadius = 1.35;
    let finalX = nextX;
    let finalZ = nextZ;

    const allObstacles = this.buildingSystem.obstacles;
    for (let k = 0; k < allObstacles.length; k++) {
      const obs = allObstacles[k];
      const dx = finalX - obs.x;
      const dz = finalZ - obs.z;
      const dist = Math.hypot(dx, dz);
      const minDist = obs.radius + vehicleRadius;

      if (dist < minDist && dist > 0.001) {
        // HIT SOLID WALL / BARRIER!
        const pen = minDist - dist;
        const nx = dx / dist;
        const nz = dz / dist;

        // Push back outside the wall boundary
        finalX += nx * pen;
        finalZ += nz * pen;

        // Wall deflection: cancel velocity component pointing into the wall
        const dot = forwardX * nx + forwardZ * nz;
        if (dot < 0) {
          // Slide along wall tangent!
          data.speed *= 0.82; // Wall friction slowdown
        }

        // Trigger impact sparks & sound if colliding at speed
        if (Math.abs(data.speed) > 7.0) {
          this.spawnImpactSparks(finalX, data.position.y + 0.4, finalZ);
          const now = performance.now();
          if (now - this.lastScrapeSoundTime > 300) {
            this.lastScrapeSoundTime = now;
            audioEngine.playVehicleImpact();
          }
        }
      }
    }

    data.position.x = finalX;
    data.position.z = finalZ;

    // 5. Terrain Ground Adhesion and Pitch/Roll Slope Hugging
    const groundY = TerrainManager.getTerrainHeight(data.position.x, data.position.z);
    data.position.y = groundY;

    // Sample terrain ahead and behind for natural vehicle slope pitch
    const frontX = data.position.x + Math.sin(data.rotation) * 1.2;
    const frontZ = data.position.z + Math.cos(data.rotation) * 1.2;
    const rearX = data.position.x - Math.sin(data.rotation) * 1.2;
    const rearZ = data.position.z - Math.cos(data.rotation) * 1.2;

    const yFront = TerrainManager.getTerrainHeight(frontX, frontZ);
    const yRear = TerrainManager.getTerrainHeight(rearX, rearZ);
    const slopePitch = Math.atan2(yFront - yRear, 2.4);

    veh.mesh.position.set(data.position.x, data.position.y, data.position.z);
    veh.mesh.rotation.y = data.rotation;
    veh.mesh.rotation.x = THREE.MathUtils.lerp(veh.mesh.rotation.x, slopePitch, dt * 9.0);
  }

  // ==========================================
  // PARTICLE SPAWNERS (SPARKS & TURBO FLAMES)
  // ==========================================

  private spawnDriftSparks(
    veh: { data: VehicleData; mesh: THREE.Group },
    stage: number
  ) {
    if (this.sparkParticles.length >= 240) return;

    // Stage 1 = Blue (#38bdf8), Stage 2 = Orange (#f97316), Stage 3 = Purple (#a855f7)
    const color =
      stage === 3
        ? new THREE.Color(0xa855f7)
        : stage === 2
        ? new THREE.Color(0xf97316)
        : new THREE.Color(0x38bdf8);

    const pos = veh.mesh.position;
    const yaw = veh.data.rotation;

    // Spawn sparks from both rear wheels
    [-0.75, 0.75].forEach((offsetX) => {
      const rx = pos.x + Math.cos(yaw) * offsetX - Math.sin(yaw) * 0.8;
      const rz = pos.z + Math.sin(yaw) * offsetX - Math.cos(yaw) * 0.8;
      const ry = pos.y + 0.15;

      this.sparkParticles.push({
        pos: new THREE.Vector3(rx, ry, rz),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 4.0 - Math.sin(yaw) * 3.0,
          Math.random() * 2.5 + 0.5,
          (Math.random() - 0.5) * 4.0 - Math.cos(yaw) * 3.0
        ),
        life: 0,
        maxLife: 0.35 + Math.random() * 0.2,
        color,
      });
    });
  }

  private spawnImpactSparks(x: number, y: number, z: number) {
    if (this.sparkParticles.length >= 240) return;
    const gold = new THREE.Color(0xfde047);
    for (let i = 0; i < 4; i++) {
      this.sparkParticles.push({
        pos: new THREE.Vector3(x, y, z),
        vel: new THREE.Vector3(
          (Math.random() - 0.5) * 6.0,
          Math.random() * 4.0 + 1.0,
          (Math.random() - 0.5) * 6.0
        ),
        life: 0,
        maxLife: 0.25 + Math.random() * 0.15,
        color: gold,
      });
    }
  }

  private spawnBoostFlame(veh: { data: VehicleData; mesh: THREE.Group; parts: WheelMeshes }) {
    if (this.flameParticles.length >= 170) return;
    const pos = veh.mesh.position;
    const yaw = veh.data.rotation;

    veh.parts.exhaustPipes.forEach((pipe) => {
      const px = pos.x + Math.cos(yaw) * pipe.x + Math.sin(yaw) * pipe.z;
      const pz = pos.z - Math.sin(yaw) * pipe.x + Math.cos(yaw) * pipe.z;
      const py = pos.y + pipe.y;

      this.flameParticles.push({
        pos: new THREE.Vector3(px, py, pz),
        vel: new THREE.Vector3(
          -Math.sin(yaw) * 14.0 + (Math.random() - 0.5) * 1.5,
          (Math.random() - 0.5) * 1.0,
          -Math.cos(yaw) * 14.0 + (Math.random() - 0.5) * 1.5
        ),
        life: 0,
        maxLife: 0.2 + Math.random() * 0.1,
      });
    });
  }

  private updateParticles(dt: number) {
    // 1. Update Drift Sparks
    const sparkPositions = this.sparkGeo.attributes.position.array as Float32Array;
    const sparkColors = this.sparkGeo.attributes.color.array as Float32Array;
    let sparkActiveCount = 0;

    for (let i = this.sparkParticles.length - 1; i >= 0; i--) {
      const p = this.sparkParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.sparkParticles.splice(i, 1);
        continue;
      }

      p.pos.addScaledVector(p.vel, dt);
      p.vel.y -= 9.8 * dt; // Gravity

      const idx = sparkActiveCount * 3;
      sparkPositions[idx] = p.pos.x;
      sparkPositions[idx + 1] = p.pos.y;
      sparkPositions[idx + 2] = p.pos.z;

      sparkColors[idx] = p.color.r;
      sparkColors[idx + 1] = p.color.g;
      sparkColors[idx + 2] = p.color.b;

      sparkActiveCount++;
    }

    this.sparkGeo.setDrawRange(0, sparkActiveCount);
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;

    // 2. Update Turbo Flames
    const flamePositions = this.flameGeo.attributes.position.array as Float32Array;
    let flameActiveCount = 0;

    for (let i = this.flameParticles.length - 1; i >= 0; i--) {
      const p = this.flameParticles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.flameParticles.splice(i, 1);
        continue;
      }

      p.pos.addScaledVector(p.vel, dt);

      const idx = flameActiveCount * 3;
      flamePositions[idx] = p.pos.x;
      flamePositions[idx + 1] = p.pos.y;
      flamePositions[idx + 2] = p.pos.z;

      flameActiveCount++;
    }

    this.flameGeo.setDrawRange(0, flameActiveCount);
    this.flameGeo.attributes.position.needsUpdate = true;
  }
}
