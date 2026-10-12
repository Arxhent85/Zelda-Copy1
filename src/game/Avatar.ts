import * as THREE from 'three';
import { PlayerActionState, AvatarVariant } from '../types';

export class AvatarHero {
  public mesh: THREE.Group = new THREE.Group();

  // Character Variant Archetype & Visual Components
  public currentVariant: AvatarVariant = 'hylian_hero';
  public tail: THREE.Group = new THREE.Group();
  public headVisuals: THREE.Group = new THREE.Group();
  public torsoVisuals: THREE.Group = new THREE.Group();

  // Dynamic Archetype Materials
  public tunicMat: THREE.MeshStandardMaterial;
  public tunicTrimMat: THREE.MeshStandardMaterial;
  public skinMat: THREE.MeshStandardMaterial;
  public hairMat: THREE.MeshStandardMaterial;
  public darkHairMat: THREE.MeshStandardMaterial;
  public hairHighlightMat: THREE.MeshStandardMaterial;
  public blushMat: THREE.MeshStandardMaterial;
  public lipMat: THREE.MeshStandardMaterial;
  public eyebrowMat: THREE.MeshStandardMaterial;
  public earShadowMat: THREE.MeshStandardMaterial;
  public darkLeatherMat: THREE.MeshStandardMaterial;
  public tanLeatherMat: THREE.MeshStandardMaterial;
  public pantsMat: THREE.MeshStandardMaterial;
  public bootMat: THREE.MeshStandardMaterial;
  public steelMat: THREE.MeshStandardMaterial;
  public goldMat: THREE.MeshStandardMaterial;
  public bronzeMat: THREE.MeshStandardMaterial;
  public sheikahSlateMat: THREE.MeshStandardMaterial;
  public sheikahGlowMat: THREE.MeshStandardMaterial;
  public shieldBlueMat: THREE.MeshStandardMaterial;
  public shieldRedMat: THREE.MeshStandardMaterial;
  public shieldSilverMat: THREE.MeshStandardMaterial;
  public capeMat: THREE.MeshStandardMaterial;
  public capeTrimMat: THREE.MeshStandardMaterial;
  public mantleMesh: THREE.Mesh | null = null;

  // Body Parts & Joint Hierarchy
  public currentEquippedToolType: string = 'sword';
  public torso: THREE.Mesh;
  public head: THREE.Group;
  public hairPonytail: THREE.Group;

  // Articulated Arms (Shoulder & Elbow Joints)
  public leftUpperArm: THREE.Group;
  public leftLowerArm: THREE.Group;
  public rightUpperArm: THREE.Group;
  public rightLowerArm: THREE.Group;

  // Articulated Legs (Hip & Knee Joints)
  public leftUpperLeg: THREE.Group;
  public leftLowerLeg: THREE.Group;
  public rightUpperLeg: THREE.Group;
  public rightLowerLeg: THREE.Group;

  // Flowing Cape / Cloak (Verlet Cloth Physics)
  public capeSegments: THREE.Group[] = [];
  public clothMesh: THREE.Mesh;
  private clothGeo: THREE.PlaneGeometry;
  private clothParticles: Array<{
    pos: THREE.Vector3;
    oldPos: THREE.Vector3;
    pinned: boolean;
    pinOffset: THREE.Vector3;
  }> = [];
  private clothConstraints: Array<{ p1: number; p2: number; dist: number }> = [];
  private clothCols = 14;
  private clothRows = 20;
  private clothWidth = 0.76;
  private clothHeight = 1.15;

  // Accessories & Equipment
  public sword: THREE.Group;
  public shield: THREE.Group;
  public paraglider: THREE.Group;
  public bow: THREE.Group;


  // Animation State
  private animTime = 0;
  public currentAction: PlayerActionState = 'IDLE';
  private actionTime = 0;
  private comboIndex = 0;
  private lastYaw = 0;
  private turnRate = 0;
  private springCur = new Map<THREE.Object3D, THREE.Vector3>();
  private springVel = new Map<THREE.Object3D, THREE.Vector3>();
  private torsoYVel = 0;

  /** Joints driven by damped springs: k = stiffness, c = damping (lower c = more elastic overshoot) */
  private getSpringJoints(): Array<{ o: THREE.Object3D; k: number; c: number }> {
    return [
      { o: this.torso, k: 160, c: 17 },
      { o: this.head, k: 110, c: 13 },
      { o: this.hairPonytail, k: 45, c: 4.5 },
      { o: this.leftUpperArm, k: 220, c: 20 },
      { o: this.rightUpperArm, k: 260, c: 21 },
      { o: this.leftLowerArm, k: 170, c: 14 },
      { o: this.rightLowerArm, k: 200, c: 15 },
      { o: this.leftUpperLeg, k: 320, c: 28 },
      { o: this.rightUpperLeg, k: 320, c: 28 },
      { o: this.leftLowerLeg, k: 280, c: 22 },
      { o: this.rightLowerLeg, k: 280, c: 22 },
      { o: this.paraglider, k: 60, c: 8 },
    ];
  }


  constructor() {
    this.mesh.name = 'HeroAvatar';

    // Dynamic Archetype Color Palette (Zelda / Anime / Beast / Dragon)
    this.tunicMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.5, metalness: 0.05 });
    this.tunicTrimMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 });
    this.skinMat = new THREE.MeshStandardMaterial({ color: 0xffd3b6, roughness: 0.65 });
    this.hairMat = new THREE.MeshStandardMaterial({ color: 0xc89b53, roughness: 0.62, metalness: 0.04 });
    this.darkHairMat = new THREE.MeshStandardMaterial({ color: 0x8e6328, roughness: 0.72 });
    this.hairHighlightMat = new THREE.MeshStandardMaterial({ color: 0xe8c17b, roughness: 0.55, metalness: 0.06 });
    this.blushMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.85, transparent: true, opacity: 0.38 });
    this.lipMat = new THREE.MeshStandardMaterial({ color: 0xbe5b6a, roughness: 0.55 });
    this.eyebrowMat = new THREE.MeshStandardMaterial({ color: 0x855c26, roughness: 0.6 });
    this.earShadowMat = new THREE.MeshStandardMaterial({ color: 0xd9826c, roughness: 0.75 });
    this.darkLeatherMat = new THREE.MeshStandardMaterial({ color: 0x382013, roughness: 0.75 });
    this.tanLeatherMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.7 });
    this.pantsMat = new THREE.MeshStandardMaterial({ color: 0xe2d9c8, roughness: 0.85 });
    this.bootMat = new THREE.MeshStandardMaterial({ color: 0x27170e, roughness: 0.8 });
    this.steelMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });
    this.goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.15 });
    this.bronzeMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.75, roughness: 0.3 });
    this.sheikahSlateMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.7, roughness: 0.25 });
    this.sheikahGlowMat = new THREE.MeshStandardMaterial({
      color: 0x00f5ff,
      emissive: 0x00d4ff,
      emissiveIntensity: 2.5,
      roughness: 0.1,
    });
    this.shieldBlueMat = new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.35 });
    this.shieldRedMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.4 });
    this.shieldSilverMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });
    this.capeMat = new THREE.MeshStandardMaterial({
      color: 0x881337,
      roughness: 0.55,
      side: THREE.DoubleSide,
    });
    this.capeTrimMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });

    const tunicMat = this.tunicMat;
    const tunicTrimMat = this.tunicTrimMat;
    const skinMat = this.skinMat;
    const hairMat = this.hairMat;
    const darkHairMat = this.darkHairMat;
    const hairHighlightMat = this.hairHighlightMat;
    const blushMat = this.blushMat;
    const lipMat = this.lipMat;
    const eyebrowMat = this.eyebrowMat;
    const earShadowMat = this.earShadowMat;
    const darkLeatherMat = this.darkLeatherMat;
    const leatherMat = darkLeatherMat;
    const tanLeatherMat = this.tanLeatherMat;
    const pantsMat = this.pantsMat;
    const bootMat = this.bootMat;
    const steelMat = this.steelMat;
    const goldMat = this.goldMat;
    const bronzeMat = this.bronzeMat;
    const sheikahSlateMat = this.sheikahSlateMat;
    const sheikahGlowMat = this.sheikahGlowMat;
    const shieldBlueMat = this.shieldBlueMat;
    const shieldRedMat = this.shieldRedMat;
    const shieldSilverMat = this.shieldSilverMat;
    const capeMat = this.capeMat;
    const capeTrimMat = this.capeTrimMat;
    const clothWingMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, side: THREE.DoubleSide, roughness: 0.5 });

    // -------------------------------------------------------------
    // 1. Torso Base & Dynamic Attachment Nodes
    // -------------------------------------------------------------
    const torsoGeo = new THREE.BoxGeometry(0.62, 0.84, 0.36);
    this.torso = new THREE.Mesh(torsoGeo, this.tunicMat);
    this.torso.position.y = 1.35;
    this.torso.castShadow = true;
    this.torso.receiveShadow = true;
    this.mesh.add(this.torso);

    this.torsoVisuals = new THREE.Group();
    this.torso.add(this.torsoVisuals);

    this.tail = new THREE.Group();
    this.tail.position.set(0, -0.36, -0.19);
    this.torso.add(this.tail);

    // -------------------------------------------------------------
    // 2. Flowing Cloak / Cape (Verlet Cloth Mesh Physics)
    // -------------------------------------------------------------
    this.mantleMesh = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.16, 0.44), this.capeMat);
    this.mantleMesh.position.set(0, 0.4, -0.02);
    this.mantleMesh.castShadow = true;
    this.torso.add(this.mantleMesh);

    // Verlet Cloth Cape Mesh (14 cols x 20 rows grid)
    this.clothGeo = new THREE.PlaneGeometry(
      this.clothWidth,
      this.clothHeight,
      this.clothCols - 1,
      this.clothRows - 1
    );

    this.clothMesh = new THREE.Mesh(this.clothGeo, this.capeMat);
    this.clothMesh.castShadow = true;
    this.clothMesh.receiveShadow = true;
    this.clothMesh.frustumCulled = false;
    this.torso.add(this.clothMesh);

    // Initialize Verlet Cloth Particles
    for (let r = 0; r < this.clothRows; r++) {
      for (let c = 0; c < this.clothCols; c++) {
        const u = c / (this.clothCols - 1);
        const v = r / (this.clothRows - 1);

        // Taper slightly towards bottom
        const w = this.clothWidth * (1.0 - v * 0.15);
        const posX = (u - 0.5) * w;
        const posY = 0.38 - v * this.clothHeight;
        const posZ = -0.22;

        const isPinned = r === 0; // Top row pinned behind shoulders

        this.clothParticles.push({
          pos: new THREE.Vector3(posX, posY, posZ),
          oldPos: new THREE.Vector3(posX, posY, posZ),
          pinned: isPinned,
          pinOffset: new THREE.Vector3(posX, 0.38, -0.22)
        });
      }
    }

    const addSpring = (i1: number, i2: number) => {
      this.clothConstraints.push({
        p1: i1,
        p2: i2,
        dist: this.clothParticles[i1].pos.distanceTo(this.clothParticles[i2].pos)
      });
    };

    // Structural, Shear & Diagonal Spring Constraints
    for (let r = 0; r < this.clothRows; r++) {
      for (let c = 0; c < this.clothCols; c++) {
        const idx = r * this.clothCols + c;
        if (c < this.clothCols - 1) addSpring(idx, idx + 1); // Horizontal
        if (r < this.clothRows - 1) addSpring(idx, idx + this.clothCols); // Vertical
        if (c < this.clothCols - 1 && r < this.clothRows - 1) addSpring(idx, idx + this.clothCols + 1); // Diagonal
        if (c > 0 && r < this.clothRows - 1) addSpring(idx, idx + this.clothCols - 1); // Anti-diagonal
      }
    }

    // -------------------------------------------------------------
    // 3. Head & Visual Containers
    // -------------------------------------------------------------
    this.head = new THREE.Group();
    this.head.position.y = 0.68;
    this.torso.add(this.head);

    this.headVisuals = new THREE.Group();
    this.head.add(this.headVisuals);

    this.hairPonytail = new THREE.Group();
    this.hairPonytail.position.set(0, 0.08, -0.24);
    this.head.add(this.hairPonytail);


    // -------------------------------------------------------------
    // 4. Articulated Left Arm & Archer Vambrace
    // -------------------------------------------------------------
    this.leftUpperArm = new THREE.Group();
    this.leftUpperArm.position.set(-0.42, 0.35, 0);
    this.torso.add(this.leftUpperArm);

    // Shoulder joint & Champion's sleeve
    const lShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), tunicMat);
    this.leftUpperArm.add(lShoulder);

    const lUpperArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.22, 8), tunicMat);
    lUpperArmMesh.position.y = -0.11;
    lUpperArmMesh.castShadow = true;
    this.leftUpperArm.add(lUpperArmMesh);

    const lSleeveCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8), tunicTrimMat);
    lSleeveCuff.position.y = -0.22;
    this.leftUpperArm.add(lSleeveCuff);

    const lBicepSkin = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.072, 0.15, 8), skinMat);
    lBicepSkin.position.y = -0.3;
    this.leftUpperArm.add(lBicepSkin);

    // Left Elbow Joint -> Lower Arm (Forearm)
    this.leftLowerArm = new THREE.Group();
    this.leftLowerArm.position.set(0, -0.38, 0);
    this.leftUpperArm.add(this.leftLowerArm);

    // Archer Leather Vambrace (Bracer with reinforcement & bronze buckles)
    const lVambrace = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.078, 0.26, 8), tanLeatherMat);
    lVambrace.position.y = -0.14;
    lVambrace.castShadow = true;
    this.leftLowerArm.add(lVambrace);

    const lBracerPlate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), darkLeatherMat);
    lBracerPlate.position.set(0, -0.14, 0.04);
    this.leftLowerArm.add(lBracerPlate);

    const lBracerBuckle1 = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.16), bronzeMat);
    lBracerBuckle1.position.y = -0.08;
    this.leftLowerArm.add(lBracerBuckle1);

    const lBracerBuckle2 = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.16), bronzeMat);
    lBracerBuckle2.position.y = -0.2;
    this.leftLowerArm.add(lBracerBuckle2);

    // Left Fingerless Glove Hand
    const lGlove = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.08), darkLeatherMat);
    lGlove.position.y = -0.35;
    this.leftLowerArm.add(lGlove);

    const lFingers = new THREE.Mesh(new THREE.SphereGeometry(0.062, 6, 6), skinMat);
    lFingers.position.y = -0.41;
    this.leftLowerArm.add(lFingers);

    // -------------------------------------------------------------
    // 5. Articulated Right Arm & Archer Vambrace
    // -------------------------------------------------------------
    this.rightUpperArm = new THREE.Group();
    this.rightUpperArm.position.set(0.42, 0.35, 0);
    this.torso.add(this.rightUpperArm);

    const rShoulder = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 8), tunicMat);
    this.rightUpperArm.add(rShoulder);

    const rUpperArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.085, 0.22, 8), tunicMat);
    rUpperArmMesh.position.y = -0.11;
    rUpperArmMesh.castShadow = true;
    this.rightUpperArm.add(rUpperArmMesh);

    const rSleeveCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.05, 8), tunicTrimMat);
    rSleeveCuff.position.y = -0.22;
    this.rightUpperArm.add(rSleeveCuff);

    const rBicepSkin = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.072, 0.15, 8), skinMat);
    rBicepSkin.position.y = -0.3;
    this.rightUpperArm.add(rBicepSkin);

    // Right Elbow Joint -> Lower Arm (Forearm)
    this.rightLowerArm = new THREE.Group();
    this.rightLowerArm.position.set(0, -0.38, 0);
    this.rightUpperArm.add(this.rightLowerArm);

    const rVambrace = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.078, 0.26, 8), tanLeatherMat);
    rVambrace.position.y = -0.14;
    rVambrace.castShadow = true;
    this.rightLowerArm.add(rVambrace);

    const rBracerPlate = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.1), darkLeatherMat);
    rBracerPlate.position.set(0, -0.14, 0.04);
    this.rightLowerArm.add(rBracerPlate);

    const rBracerBuckle1 = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.16), bronzeMat);
    rBracerBuckle1.position.y = -0.08;
    this.rightLowerArm.add(rBracerBuckle1);

    const rBracerBuckle2 = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.03, 0.16), bronzeMat);
    rBracerBuckle2.position.y = -0.2;
    this.rightLowerArm.add(rBracerBuckle2);

    // Right Fingerless Glove Hand
    const rGlove = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.11, 0.08), darkLeatherMat);
    rGlove.position.y = -0.35;
    this.rightLowerArm.add(rGlove);

    const rFingers = new THREE.Mesh(new THREE.SphereGeometry(0.062, 6, 6), skinMat);
    rFingers.position.y = -0.41;
    this.rightLowerArm.add(rFingers);

    // -------------------------------------------------------------
    // 6. Articulated Left Leg (Hylian Trousers & Knight Boot)
    // -------------------------------------------------------------
    this.leftUpperLeg = new THREE.Group();
    this.leftUpperLeg.position.set(-0.2, -0.45, 0);
    this.torso.add(this.leftUpperLeg);

    const lHip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), pantsMat);
    this.leftUpperLeg.add(lHip);

    const lThighMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.098, 0.4, 8), pantsMat);
    lThighMesh.position.y = -0.2;
    lThighMesh.castShadow = true;
    this.leftUpperLeg.add(lThighMesh);

    const lKneePad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.13, 0.07), darkLeatherMat);
    lKneePad.position.set(0, -0.38, 0.06);
    this.leftUpperLeg.add(lKneePad);

    // Left Knee Joint -> Lower Leg (Shin/Calf & Boots)
    this.leftLowerLeg = new THREE.Group();
    this.leftLowerLeg.position.set(0, -0.42, 0);
    this.leftUpperLeg.add(this.leftLowerLeg);

    const lBootCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.098, 0.13, 8), tanLeatherMat);
    lBootCuff.position.y = -0.06;
    this.leftLowerLeg.add(lBootCuff);

    const lShinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.088, 0.32, 8), bootMat);
    lShinMesh.position.y = -0.22;
    lShinMesh.castShadow = true;
    this.leftLowerLeg.add(lShinMesh);

    const lAnkleStrap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.18), darkLeatherMat);
    lAnkleStrap.position.set(0, -0.31, 0.02);
    this.leftLowerLeg.add(lAnkleStrap);

    // Left Foot with Layered Sole & Heel
    const lFoot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.27), bootMat);
    lFoot.position.set(0, -0.41, 0.06);
    this.leftLowerLeg.add(lFoot);

    const lSole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.29), darkLeatherMat);
    lSole.position.set(0, -0.47, 0.06);
    this.leftLowerLeg.add(lSole);

    const lHeel = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.1), darkLeatherMat);
    lHeel.position.set(0, -0.47, -0.04);
    this.leftLowerLeg.add(lHeel);

    // -------------------------------------------------------------
    // 7. Articulated Right Leg (Hylian Trousers & Knight Boot)
    // -------------------------------------------------------------
    this.rightUpperLeg = new THREE.Group();
    this.rightUpperLeg.position.set(0.2, -0.45, 0);
    this.torso.add(this.rightUpperLeg);

    const rHip = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 8), pantsMat);
    this.rightUpperLeg.add(rHip);

    const rThighMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.098, 0.4, 8), pantsMat);
    rThighMesh.position.y = -0.2;
    rThighMesh.castShadow = true;
    this.rightUpperLeg.add(rThighMesh);

    const rKneePad = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.13, 0.07), darkLeatherMat);
    rKneePad.position.set(0, -0.38, 0.06);
    this.rightUpperLeg.add(rKneePad);

    // Right Knee Joint -> Lower Leg (Shin/Calf & Boots)
    this.rightLowerLeg = new THREE.Group();
    this.rightLowerLeg.position.set(0, -0.42, 0);
    this.rightUpperLeg.add(this.rightLowerLeg);

    const rBootCuff = new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.098, 0.13, 8), tanLeatherMat);
    rBootCuff.position.y = -0.06;
    this.rightLowerLeg.add(rBootCuff);

    const rShinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.098, 0.088, 0.32, 8), bootMat);
    rShinMesh.position.y = -0.22;
    rShinMesh.castShadow = true;
    this.rightLowerLeg.add(rShinMesh);

    const rAnkleStrap = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.035, 0.18), darkLeatherMat);
    rAnkleStrap.position.set(0, -0.31, 0.02);
    this.rightLowerLeg.add(rAnkleStrap);

    // Right Foot with Layered Sole & Heel
    const rFoot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.27), bootMat);
    rFoot.position.set(0, -0.41, 0.06);
    this.rightLowerLeg.add(rFoot);

    const rSole = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.29), darkLeatherMat);
    rSole.position.set(0, -0.47, 0.06);
    this.rightLowerLeg.add(rSole);

    const rHeel = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.04, 0.1), darkLeatherMat);
    rHeel.position.set(0, -0.47, -0.04);
    this.rightLowerLeg.add(rHeel);

    // -------------------------------------------------------------
    // 8. Weapons & Paraglider Equipment
    // -------------------------------------------------------------
    // Dynamic Tool & Weapon Attachment Container on Right Lower Arm
    this.sword = new THREE.Group(); // Held Tool/Weapon Container
    this.sword.position.set(0, -0.38, 0.05);
    this.sword.rotation.x = Math.PI / 2;
    this.rightLowerArm.add(this.sword);

    // Build initial default sword model inside container
    this.updateHeldToolOrWeapon({
      id: 'weapon_sword_starter',
      name: 'Ritterschwert',
      type: 'weapon',
      equipped: true,
      quantity: 1,
    });

    // Ornate Hylian Shield with Silver Rim, Triforce and Red Loftwing
    this.shield = new THREE.Group();

    // Shield Body Plates
    const shieldBack = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.72, 0.03), darkLeatherMat);
    this.shield.add(shieldBack);

    const shieldFront = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.68, 0.03), shieldBlueMat);
    shieldFront.position.z = 0.02;
    shieldFront.castShadow = true;
    this.shield.add(shieldFront);

    // Silver Beveled Borders
    const topRim = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.05, 0.05), shieldSilverMat);
    topRim.position.set(0, 0.35, 0.03);
    this.shield.add(topRim);

    const leftRim = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.68, 0.05), shieldSilverMat);
    leftRim.position.set(-0.27, 0, 0.03);
    this.shield.add(leftRim);

    const rightRim = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.68, 0.05), shieldSilverMat);
    rightRim.position.set(0.27, 0, 0.03);
    this.shield.add(rightRim);

    const botTip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.16, 4), shieldSilverMat);
    botTip.rotation.z = Math.PI;
    botTip.position.set(0, -0.4, 0.03);
    this.shield.add(botTip);

    // Golden Triforce Emblems on Upper Front Face
    const triGeo = new THREE.ConeGeometry(0.055, 0.08, 3);
    const triTop = new THREE.Mesh(triGeo, goldMat);
    triTop.position.set(0, 0.22, 0.04);
    this.shield.add(triTop);

    const triLeft = new THREE.Mesh(triGeo, goldMat);
    triLeft.position.set(-0.05, 0.14, 0.04);
    this.shield.add(triLeft);

    const triRight = new THREE.Mesh(triGeo, goldMat);
    triRight.position.set(0.05, 0.14, 0.04);
    this.shield.add(triRight);

    // Crimson Loftwing Bird Wings & Crest
    const loftwingBody = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.13, 4), shieldRedMat);
    loftwingBody.position.set(0, -0.04, 0.04);
    this.shield.add(loftwingBody);

    const wingL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.02), shieldRedMat);
    wingL.position.set(-0.1, -0.01, 0.04);
    wingL.rotation.z = 0.35;
    this.shield.add(wingL);

    const wingR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.04, 0.02), shieldRedMat);
    wingR.position.set(0.1, -0.01, 0.04);
    wingR.rotation.z = -0.35;
    this.shield.add(wingR);

    const tailFeather = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.02), shieldRedMat);
    tailFeather.position.set(0, -0.18, 0.04);
    this.shield.add(tailFeather);

    // Arm Strap on Back
    const shieldHandle = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.02, 6, 12), darkLeatherMat);
    shieldHandle.position.set(0, 0, -0.04);
    this.shield.add(shieldHandle);

    this.shield.position.set(-0.08, -0.2, 0.12);
    this.shield.rotation.y = Math.PI / 2;
    this.leftLowerArm.add(this.shield);

    // Paraglider
    this.paraglider = new THREE.Group();
    const wingGeo = new THREE.PlaneGeometry(3.6, 1.5);
    wingGeo.rotateX(Math.PI / 2);
    const gliderMesh = new THREE.Mesh(wingGeo, clothWingMat);
    const gliderFrame = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 3.8), leatherMat);
    gliderFrame.rotation.z = Math.PI / 2;
    this.paraglider.add(gliderMesh);
    this.paraglider.add(gliderFrame);
    this.paraglider.position.set(0, 1.8, 0);
    this.paraglider.visible = false;
    this.mesh.add(this.paraglider);

    // Bow
    this.bow = new THREE.Group();
    const bowCurve = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.03, 6, 12, Math.PI), leatherMat);
    this.bow.add(bowCurve);
    this.bow.position.set(0, 0, -0.25);
    this.bow.visible = false;
    this.mesh.add(this.bow);

    // Initialize default avatar archetype
    this.setAvatarVariant('hylian_hero');
  }

  /**
   * Generates a high-definition anime eye decal texture on an offscreen canvas
   */
  public createAnimeEyeTexture(irisColorHex: number, isSlit: boolean = false): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    ctx.clearRect(0, 0, 256, 256);

    // 1. Sclera (White eye background with clean almond shape)
    ctx.beginPath();
    ctx.ellipse(128, 128, 92, 74, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Subtle upper eyelid shadow
    const scleraGrad = ctx.createLinearGradient(128, 60, 128, 120);
    scleraGrad.addColorStop(0, 'rgba(195, 205, 222, 0.6)');
    scleraGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = scleraGrad;
    ctx.fill();

    // 2. Iris (Large, radiant anime iris)
    const irisX = 128;
    const irisY = 130;
    const irisR = 60;

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(irisX, irisY, irisR, irisR * 1.08, 0, 0, Math.PI * 2);
    ctx.clip();

    // Rich multi-stop vertical gradient
    const hex = irisColorHex.toString(16).padStart(6, '0');
    const irisGrad = ctx.createLinearGradient(irisX, irisY - irisR, irisX, irisY + irisR);
    irisGrad.addColorStop(0, '#090d16');
    irisGrad.addColorStop(0.35, '#' + hex);
    irisGrad.addColorStop(0.8, '#38bdf8');
    irisGrad.addColorStop(1, '#bae6fd');
    ctx.fillStyle = irisGrad;
    ctx.fill();

    // Lower luminous inner reflection ring
    ctx.beginPath();
    ctx.ellipse(irisX, irisY + 28, 38, 20, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.fill();

    // 3. Pupil
    ctx.beginPath();
    if (isSlit) {
      ctx.ellipse(irisX, irisY, 11, 46, 0, 0, Math.PI * 2);
    } else {
      ctx.ellipse(irisX, irisY - 3, 22, 26, 0, 0, Math.PI * 2);
    }
    ctx.fillStyle = '#090d16';
    ctx.fill();

    // Soft top shadow inside iris
    const irisShadow = ctx.createLinearGradient(irisX, irisY - irisR, irisX, irisY + 5);
    irisShadow.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
    irisShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = irisShadow;
    ctx.fill();

    ctx.restore();

    // 4. Twin Anime Specular Catchlights (Crisp white sparkle reflections)
    // Primary main catchlight (upper left)
    ctx.beginPath();
    ctx.ellipse(106, 102, 16, 18, -0.25, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Secondary cute catchlight (lower right)
    ctx.beginPath();
    ctx.ellipse(150, 156, 8, 8, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();

    // 5. Stylized Upper Eyeliner & Lashes (Crisp anime contour)
    ctx.beginPath();
    ctx.moveTo(38, 134);
    ctx.bezierCurveTo(72, 65, 185, 65, 220, 132);
    ctx.bezierCurveTo(185, 52, 72, 52, 38, 134);
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    // Outer lash flick
    ctx.beginPath();
    ctx.moveTo(212, 126);
    ctx.lineTo(236, 115);
    ctx.lineTo(218, 136);
    ctx.closePath();
    ctx.fillStyle = '#1e293b';
    ctx.fill();

    // Delicate lower lash curve
    ctx.beginPath();
    ctx.moveTo(68, 174);
    ctx.quadraticCurveTo(128, 196, 188, 174);
    ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
    ctx.lineWidth = 4;
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Switches avatar archetype between 4 distinct characters:
   * 1. 'hylian_hero': Champion Link (Männlich)
   * 2. 'princess_zelda': Royal Wisdom Priestess Zelda (Weiblich)
   * 3. 'kitsune_beast': Kitsune Fox-kin Huntress (Tierwesen)
   * 4. 'dragon_warrior': Draconic Champion with horns & spines (Drachenwesen)
   */
  public setAvatarVariant(variant: AvatarVariant) {
    this.currentVariant = variant;

    // Reset visual nodes
    this.torsoVisuals.clear();
    this.headVisuals.clear();
    this.hairPonytail.clear();
    this.tail.clear();

    // 1. Dynamic Material Palettes
    if (variant === 'princess_zelda') {
      this.tunicMat.color.setHex(0xf8fafc); // Royal White Silk
      this.tunicTrimMat.color.setHex(0xf59e0b); // Gold Trim
      this.skinMat.color.setHex(0xffe4d6); // Fair Porcelain Skin
      this.hairMat.color.setHex(0xf59e0b); // Golden Amber
      this.darkHairMat.color.setHex(0xd97706);
      this.hairHighlightMat.color.setHex(0xfde68a);
      this.pantsMat.color.setHex(0xf1f5f9); // Ivory Silk Gown
      this.bootMat.color.setHex(0xe2e8f0);
      this.capeMat.color.setHex(0xffffff); // Royal White Mantle
      this.capeTrimMat.color.setHex(0xf59e0b);
      if (this.mantleMesh) (this.mantleMesh.material as THREE.MeshStandardMaterial).color.setHex(0xffffff);
      this.lipMat.color.setHex(0xf43f5e);
    } else if (variant === 'kitsune_beast') {
      this.tunicMat.color.setHex(0x1e293b); // Obsidian Ninja Leather
      this.tunicTrimMat.color.setHex(0x991b1b); // Crimson Trim
      this.skinMat.color.setHex(0xf3b490); // Sunkissed Skin
      this.hairMat.color.setHex(0xea580c); // Fiery Amber Mane
      this.darkHairMat.color.setHex(0x9a3412);
      this.hairHighlightMat.color.setHex(0xfed7aa);
      this.pantsMat.color.setHex(0x0f172a); // Midnight Wraps
      this.bootMat.color.setHex(0x18181b);
      this.capeMat.color.setHex(0x450a0a); // Crimson Rogue Cloak
      this.capeTrimMat.color.setHex(0xdc2626);
      if (this.mantleMesh) (this.mantleMesh.material as THREE.MeshStandardMaterial).color.setHex(0x450a0a);
      this.lipMat.color.setHex(0xb91c1c);
    } else if (variant === 'dragon_warrior') {
      this.tunicMat.color.setHex(0x090d16); // Dragon Scale Plate
      this.tunicTrimMat.color.setHex(0xdc2626); // Magma Borders
      this.skinMat.color.setHex(0xd1d5db); // Ashen Skin
      this.hairMat.color.setHex(0x1e1b4b); // Dark Obsidian Crest
      this.darkHairMat.color.setHex(0x0f172a);
      this.hairHighlightMat.color.setHex(0xef4444);
      this.pantsMat.color.setHex(0x1e293b); // Scaled Greaves
      this.bootMat.color.setHex(0x0f172a);
      this.capeMat.color.setHex(0x7f1d1d); // Ember Cloak
      this.capeTrimMat.color.setHex(0xf97316);
      if (this.mantleMesh) (this.mantleMesh.material as THREE.MeshStandardMaterial).color.setHex(0x7f1d1d);
      this.lipMat.color.setHex(0x991b1b);
    } else {
      // Hylian Champion Link (Default)
      this.tunicMat.color.setHex(0x0284c7);
      this.tunicTrimMat.color.setHex(0xf8fafc);
      this.skinMat.color.setHex(0xffd3b6);
      this.hairMat.color.setHex(0xc89b53); // Warm authentic golden-wheat blonde
      this.darkHairMat.color.setHex(0x8e6328); // Rich golden-chestnut shading
      this.hairHighlightMat.color.setHex(0xe8c17b); // Soft sunny highlight
      this.eyebrowMat.color.setHex(0x855c26);
      this.earShadowMat.color.setHex(0xd9826c);
      this.pantsMat.color.setHex(0xe2d9c8);
      this.bootMat.color.setHex(0x27170e);
      this.capeMat.color.setHex(0x881337);
      this.capeTrimMat.color.setHex(0xf59e0b);
      if (this.mantleMesh) (this.mantleMesh.material as THREE.MeshStandardMaterial).color.setHex(0x881337);
      this.lipMat.color.setHex(0xbe5b6a);
    }

    // 2. Sculpted Anatomical Neck & Seamless Anime Head
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.082, 0.16, 20), this.skinMat);
    neck.position.set(0, -0.16, -0.015);
    neck.rotation.x = 0.06;
    neck.castShadow = true;
    this.headVisuals.add(neck);

    // Sculpted organic anime cranium & face
    const craniumGeo = new THREE.SphereGeometry(0.185, 32, 24);
    craniumGeo.scale(0.96, 1.05, 0.98);
    const cranium = new THREE.Mesh(craniumGeo, this.skinMat);
    cranium.position.set(0, 0.02, 0);
    cranium.castShadow = true;
    cranium.receiveShadow = true;
    this.headVisuals.add(cranium);

    // Smooth tapering anime jawline (blends seamlessly from ears down to chin)
    const jawGeo = new THREE.CylinderGeometry(0.175, 0.092, 0.16, 28);
    jawGeo.scale(0.92, 1.0, 0.88);
    const jaw = new THREE.Mesh(jawGeo, this.skinMat);
    jaw.position.set(0, -0.085, 0.015);
    jaw.castShadow = true;
    jaw.receiveShadow = true;
    this.headVisuals.add(jaw);

    // Gentle rounded anime chin
    const chinGeo = new THREE.SphereGeometry(0.060, 20, 16);
    chinGeo.scale(0.85, 0.8, 1.02);
    const chin = new THREE.Mesh(chinGeo, this.skinMat);
    chin.position.set(0, -0.162, 0.052);
    chin.castShadow = true;
    chin.receiveShadow = true;
    this.headVisuals.add(chin);

    // Delicate anime nose tip (subtle and stylish, not a protruding pipe)
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.030, 4), this.skinMat);
    nose.position.set(0, -0.014, 0.182);
    nose.rotation.x = 0.22;
    nose.castShadow = true;
    this.headVisuals.add(nose);

    // Soft, friendly anime smile line
    const mouthGeo = new THREE.TorusGeometry(0.022, 0.003, 6, 12, Math.PI * 0.55);
    const mouth = new THREE.Mesh(mouthGeo, this.lipMat);
    mouth.position.set(0, -0.085, 0.168);
    mouth.rotation.set(-0.1, 0, Math.PI + 0.28);
    this.headVisuals.add(mouth);

    // 3. Stylized High-Definition Anime Eyes
    let eyeIrisColor = 0x0284c7; // Brilliant Sapphire for Link
    let isSlitPupil = false;
    if (variant === 'princess_zelda') {
      eyeIrisColor = 0x059669; // Royal Emerald for Zelda
    } else if (variant === 'kitsune_beast') {
      eyeIrisColor = 0xd97706; // Amber Gold
      isSlitPupil = true;
    } else if (variant === 'dragon_warrior') {
      eyeIrisColor = 0xdc2626; // Magma Red
      isSlitPupil = true;
    }

    const leftEyeTex = this.createAnimeEyeTexture(eyeIrisColor, isSlitPupil);
    const rightEyeTex = this.createAnimeEyeTexture(eyeIrisColor, isSlitPupil);
    rightEyeTex.repeat.x = -1;
    rightEyeTex.offset.x = 1;

    const eyeGeo = new THREE.PlaneGeometry(0.082, 0.092);
    for (const isLeft of [true, false]) {
      const side = isLeft ? -1 : 1;
      const eyeMat = new THREE.MeshStandardMaterial({
        map: isLeft ? leftEyeTex : rightEyeTex,
        transparent: true,
        roughness: 0.25,
        metalness: 0.02,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        depthWrite: false,
      });
      const eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
      eyeMesh.position.set(side * 0.074, 0.016, 0.176);
      eyeMesh.rotation.set(-0.05, side * 0.25, 0);
      this.headVisuals.add(eyeMesh);

      // Heroic Eyebrows (Positioned naturally above eyes on the brow ridge)
      const browGeo = new THREE.CylinderGeometry(0.0038, 0.0068, 0.074, 8);
      const brow = new THREE.Mesh(browGeo, this.eyebrowMat);
      brow.position.set(side * 0.074, 0.070, 0.173);
      brow.rotation.set(-0.07, side * 0.24, isLeft ? 1.48 : -1.48);
      this.headVisuals.add(brow);
    }

    // Cheek Accents
    if (variant === 'kitsune_beast') {
      const markMat = new THREE.MeshBasicMaterial({ color: 0xdc2626 });
      for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const whisker = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.006, 0.01), markMat);
          whisker.position.set(side * (0.11 + i * 0.015), -0.035 - i * 0.018, 0.165);
          whisker.rotation.set(0.1, side * -0.35, side * (0.2 - i * 0.15));
          this.headVisuals.add(whisker);
        }
      }
    } else if (variant === 'princess_zelda') {
      const blushGeo = new THREE.SphereGeometry(0.038, 12, 8);
      blushGeo.scale(1.2, 0.6, 0.2);
      const leftBlush = new THREE.Mesh(blushGeo, this.blushMat);
      leftBlush.position.set(-0.1, -0.05, 0.16);
      this.headVisuals.add(leftBlush);
      const rightBlush = leftBlush.clone();
      rightBlush.position.x = 0.1;
      this.headVisuals.add(rightBlush);
    }

    if (variant === 'princess_zelda') {
      // --- PRINCESS ZELDA ---
      // Royal Gold Tiara with Sapphire Drop Gemstone
      const tiaraBand = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.012, 8, 24, Math.PI * 0.7), this.goldMat);
      tiaraBand.position.set(0, 0.08, 0.02);
      tiaraBand.rotation.x = -0.3;
      this.headVisuals.add(tiaraBand);

      const tiaraCrest = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.06, 3), this.goldMat);
      tiaraCrest.position.set(0, 0.15, 0.185);
      tiaraCrest.rotation.x = 0.2;
      this.headVisuals.add(tiaraCrest);

      const tiaraSapphire = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.1 }));
      tiaraSapphire.position.set(0, 0.125, 0.19);
      this.headVisuals.add(tiaraSapphire);

      // Long Elven Ears with Sapphire Drop Earrings
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.25, 12), this.skinMat);
        ear.position.set(side * 0.18, 0.01, -0.02);
        ear.rotation.set(0.1, side * -0.4, side * 1.35);
        this.headVisuals.add(ear);

        const dropEarring = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 8), new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2 }));
        dropEarring.position.set(side * 0.22, -0.05, -0.02);
        this.headVisuals.add(dropEarring);

        // Long Braided Front Locks with Gold Ribbons
        const braid = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.02, 0.42, 10), this.hairMat);
        braid.position.set(side * 0.15, -0.15, 0.14);
        braid.rotation.set(0.1, 0, side * -0.08);
        this.headVisuals.add(braid);

        const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.025, 0.008, 6, 12), this.goldMat);
        ribbon.position.set(side * 0.15, -0.22, 0.15);
        this.headVisuals.add(ribbon);
      }

      // Elegant Royal Plait Cascade
      const cascade = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 0.65, 12), this.hairMat);
      cascade.position.set(0, -0.32, 0.04);
      cascade.rotation.x = -0.15;
      this.hairPonytail.add(cascade);

    } else if (variant === 'kitsune_beast') {
      // --- KITSUNE FOX-KIN ---
      // Fluffy 3D Pointed Fox Ears on top of head
      const foxFurMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 });
      const innerFurMat = new THREE.MeshStandardMaterial({ color: 0xfbcfe8, roughness: 0.85 });
      const earTipMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });

      for (const side of [-1, 1]) {
        const earGroup = new THREE.Group();
        earGroup.position.set(side * 0.12, 0.24, 0.04);
        earGroup.rotation.set(-0.15, side * 0.25, side * -0.4);

        const outerEar = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.24, 8), foxFurMat);
        outerEar.scale.set(1.1, 1.0, 0.5);
        earGroup.add(outerEar);

        const innerFur = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.18, 6), innerFurMat);
        innerFur.position.set(0, -0.02, 0.02);
        innerFur.scale.set(1.0, 1.0, 0.3);
        earGroup.add(innerFur);

        const earTip = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.08, 6), earTipMat);
        earTip.position.set(0, 0.08, 0);
        earTip.scale.set(1.05, 1.0, 0.45);
        earGroup.add(earTip);

        this.headVisuals.add(earGroup);
      }

      // Wild Spiky Bangs
      for (let i = -2; i <= 2; i++) {
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.18, 6), this.hairMat);
        spike.position.set(i * 0.065, 0.14, 0.19);
        spike.rotation.set(0.4, 0, i * -0.2);
        this.headVisuals.add(spike);
      }

      // Wild Mane Ponytail
      const mane = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 10), this.hairMat);
      mane.position.set(0, -0.18, 0.05);
      mane.rotation.x = -0.3;
      this.hairPonytail.add(mane);

      // Fluffy Multi-Tier Kitsune Fox Tail attached to waist
      const whiteFurMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.8 });
      const tailBase = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.28, 12), foxFurMat);
      tailBase.position.set(0, 0.08, -0.12);
      tailBase.rotation.x = -0.7;
      this.tail.add(tailBase);

      const tailMid = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 12), foxFurMat);
      tailMid.scale.set(0.9, 1.3, 0.9);
      tailMid.position.set(0, 0.22, -0.28);
      tailMid.rotation.x = -0.3;
      this.tail.add(tailMid);

      const tailTip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.32, 12), whiteFurMat);
      tailTip.position.set(0, 0.42, -0.38);
      tailTip.rotation.x = 0.4;
      this.tail.add(tailTip);

    } else if (variant === 'dragon_warrior') {
      // --- DRAGON WARRIOR ---
      // Curved Obsidian Horns
      const hornMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 0.3, metalness: 0.6 });
      const hornGlowMat = new THREE.MeshStandardMaterial({ color: 0xf97316, emissive: 0xef4444, emissiveIntensity: 2.2 });

      for (const side of [-1, 1]) {
        const hornBase = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.048, 0.22, 10), hornMat);
        hornBase.position.set(side * 0.14, 0.18, 0.04);
        hornBase.rotation.set(-0.4, side * 0.3, side * 0.55);
        this.headVisuals.add(hornBase);

        const hornTip = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.24, 8), hornGlowMat);
        hornTip.position.set(side * 0.22, 0.32, -0.06);
        hornTip.rotation.set(-0.8, side * 0.3, side * 0.4);
        this.headVisuals.add(hornTip);

        // Dragon Fin Ears
        const finEar = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.22, 5), hornMat);
        finEar.position.set(side * 0.2, 0.02, -0.04);
        finEar.rotation.set(0.2, side * -0.5, side * 1.4);
        this.headVisuals.add(finEar);
      }

      // Spiked Crest
      const crest = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.35, 6), this.hairMat);
      crest.position.set(0, -0.15, 0.02);
      crest.rotation.x = -0.4;
      this.hairPonytail.add(crest);

      // Segmented Dragon Tail with Spines & Spear Tip
      const scaleMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.5 });
      const spineMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.3 });

      for (let s = 0; s < 4; s++) {
        const seg = new THREE.Mesh(new THREE.CylinderGeometry(0.07 - s * 0.012, 0.08 - s * 0.012, 0.18, 8), scaleMat);
        seg.position.set(0, -s * 0.14, -0.1 - s * 0.12);
        seg.rotation.x = -0.8 - s * 0.15;
        this.tail.add(seg);

        const spine = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.08, 4), spineMat);
        spine.position.set(0, -s * 0.14 + 0.06, -0.1 - s * 0.12);
        spine.rotation.x = -0.4;
        this.tail.add(spine);
      }

      const spearTip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 4), spineMat);
      spearTip.position.set(0, -0.58, -0.56);
      spearTip.rotation.x = -1.2;
      this.tail.add(spearTip);

    } else {
      // --- HYLIAN HERO LINK (AUTHENTIC CHAMPION HAIR & NATURAL ELVEN EARS) ---
      // 1. Natural Contoured Crown Hair Volume (seamlessly covers cranium without chopped edges)
      const crownGeo = new THREE.SphereGeometry(0.204, 32, 24);
      crownGeo.scale(1.03, 1.03, 1.06);
      const crownMesh = new THREE.Mesh(crownGeo, this.hairMat);
      crownMesh.position.set(0, 0.046, -0.022);
      crownMesh.castShadow = true;
      this.headVisuals.add(crownMesh);

      // Nape hair volume (hugs back of skull down toward tunic collar)
      const napeGeo = new THREE.CylinderGeometry(0.168, 0.132, 0.18, 24);
      napeGeo.scale(1.0, 1.0, 0.88);
      const napeMesh = new THREE.Mesh(napeGeo, this.darkHairMat);
      napeMesh.position.set(0, -0.076, -0.068);
      napeMesh.rotation.x = -0.22;
      napeMesh.castShadow = true;
      this.headVisuals.add(napeMesh);

      // 2. Feathered Layered Anime Bangs (Breath of the Wild Center-Parted Fringe)
      // Left forehead swept locks (cascading over temple and outer brow)
      const leftBangAngles = [
        { x: -0.038, y: 0.108, z: 0.176, rx: 0.28, ry: 0.16, rz: 0.38, w: 0.042, h: 0.22, mat: this.hairMat },
        { x: -0.082, y: 0.088, z: 0.170, rx: 0.30, ry: 0.24, rz: 0.52, w: 0.044, h: 0.24, mat: this.hairHighlightMat },
        { x: -0.124, y: 0.062, z: 0.155, rx: 0.26, ry: 0.32, rz: 0.65, w: 0.040, h: 0.26, mat: this.hairMat },
        { x: -0.152, y: 0.035, z: 0.130, rx: 0.20, ry: 0.38, rz: 0.78, w: 0.036, h: 0.24, mat: this.darkHairMat },
      ];
      for (const b of leftBangAngles) {
        const bang = new THREE.Mesh(new THREE.ConeGeometry(b.w, b.h, 10), b.mat);
        bang.scale.set(1.0, 1.0, 0.45);
        bang.position.set(b.x, b.y, b.z);
        bang.rotation.set(b.rx, b.ry, b.rz);
        bang.castShadow = true;
        this.headVisuals.add(bang);
      }

      // Right forehead swept locks
      const rightBangAngles = [
        { x: 0.038, y: 0.108, z: 0.176, rx: 0.28, ry: -0.16, rz: -0.38, w: 0.042, h: 0.22, mat: this.hairMat },
        { x: 0.082, y: 0.088, z: 0.170, rx: 0.30, ry: -0.24, rz: -0.52, w: 0.044, h: 0.24, mat: this.hairHighlightMat },
        { x: 0.124, y: 0.062, z: 0.155, rx: 0.26, ry: -0.32, rz: -0.65, w: 0.040, h: 0.26, mat: this.hairMat },
        { x: 0.152, y: 0.035, z: 0.130, rx: 0.20, ry: -0.38, rz: -0.78, w: 0.036, h: 0.24, mat: this.darkHairMat },
      ];
      for (const b of rightBangAngles) {
        const bang = new THREE.Mesh(new THREE.ConeGeometry(b.w, b.h, 10), b.mat);
        bang.scale.set(1.0, 1.0, 0.45);
        bang.position.set(b.x, b.y, b.z);
        bang.rotation.set(b.rx, b.ry, b.rz);
        bang.castShadow = true;
        this.headVisuals.add(bang);
      }

      // Center part accent flick (organic feathering above bridge of nose)
      const centerFlick = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.15, 8), this.hairHighlightMat);
      centerFlick.scale.set(1.0, 1.0, 0.4);
      centerFlick.position.set(-0.008, 0.125, 0.182);
      centerFlick.rotation.set(0.35, 0.05, 0.12);
      this.headVisuals.add(centerFlick);

      // 3. Iconic Face-Framing Side Tresses with Champion Blue Wraps
      const wrapMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.45 });
      for (const side of [-1, 1]) {
        // Upper side lock past cheekbone
        const sideLockUpper = new THREE.Mesh(new THREE.ConeGeometry(0.040, 0.28, 12), this.hairMat);
        sideLockUpper.scale.set(1.0, 1.0, 0.52);
        sideLockUpper.position.set(side * 0.158, -0.042, 0.102);
        sideLockUpper.rotation.set(0.12, 0, side * -0.08);
        sideLockUpper.castShadow = true;
        this.headVisuals.add(sideLockUpper);

        // Lower side lock cascading past jawline
        const sideLockLower = new THREE.Mesh(new THREE.ConeGeometry(0.034, 0.26, 10), this.hairMat);
        sideLockLower.scale.set(1.0, 1.0, 0.48);
        sideLockLower.position.set(side * 0.158, -0.182, 0.092);
        sideLockLower.rotation.set(0.07, 0, side * -0.04);
        sideLockLower.castShadow = true;
        this.headVisuals.add(sideLockLower);

        // Champion Blue Wrap Ring with Gold Border
        const wrapRing = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.009, 8, 16), wrapMat);
        wrapRing.rotation.x = Math.PI / 2;
        wrapRing.position.set(side * 0.158, -0.148, 0.092);
        this.headVisuals.add(wrapRing);

        const wrapBuckle = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.018, 0.015), this.goldMat);
        wrapBuckle.position.set(side * 0.158, -0.148, 0.118);
        this.headVisuals.add(wrapBuckle);

        // 4. Natural Hylian Elven Ears (Angled naturally backward and slightly up, with gold earring)
        const earGroup = new THREE.Group();
        earGroup.position.set(side * 0.162, 0.005, -0.038);
        earGroup.rotation.set(0.12, side * -0.68, side * 1.18);

        const outerEar = new THREE.Mesh(new THREE.ConeGeometry(0.046, 0.22, 12), this.skinMat);
        outerEar.scale.set(0.85, 1.0, 0.42);
        outerEar.castShadow = true;
        earGroup.add(outerEar);

        const innerEar = new THREE.Mesh(new THREE.ConeGeometry(0.030, 0.16, 8), this.earShadowMat);
        innerEar.position.set(0, -0.02, 0.015);
        innerEar.scale.set(0.7, 0.9, 0.25);
        earGroup.add(innerEar);

        const earring = new THREE.Mesh(new THREE.TorusGeometry(0.018, 0.004, 6, 14), this.goldMat);
        earring.position.set(0, -0.08, 0);
        earring.rotation.x = Math.PI / 2;
        earGroup.add(earring);

        this.headVisuals.add(earGroup);
      }

      // 5. Back Ponytail Clasp & Cascading Tiered Ponytail
      const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.014, 8, 20), this.goldMat);
      clasp.position.set(0, 0.078, -0.205);
      clasp.castShadow = true;
      this.headVisuals.add(clasp);

      // Tier 1 (Root)
      const ponyTop = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.28, 12), this.hairMat);
      ponyTop.position.set(0, -0.12, 0.02);
      ponyTop.rotation.x = -0.34;
      ponyTop.castShadow = true;
      this.hairPonytail.add(ponyTop);

      // Tier 2 (Mid body)
      const ponyMid = new THREE.Mesh(new THREE.ConeGeometry(0.056, 0.30, 10), this.hairMat);
      ponyMid.position.set(0, -0.28, 0.08);
      ponyMid.rotation.x = -0.20;
      ponyMid.castShadow = true;
      this.hairPonytail.add(ponyMid);

      // Tier 3 (Tapered tip with sunny highlight)
      const ponyTip = new THREE.Mesh(new THREE.ConeGeometry(0.040, 0.24, 8), this.hairHighlightMat);
      ponyTip.position.set(0, -0.44, 0.13);
      ponyTip.rotation.x = -0.08;
      ponyTip.castShadow = true;
      this.hairPonytail.add(ponyTip);
    }

    // 5. Variant Specific Torso Accessories
    if (variant === 'princess_zelda') {
      // Royal Sapphire Corslet Sash & Golden Filigree
      const sash = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.35, 0.02), new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.3 }));
      sash.position.set(0, 0.05, 0.185);
      this.torsoVisuals.add(sash);

      const triforceMedallion = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.08, 3), this.goldMat);
      triforceMedallion.position.set(0, 0.08, 0.198);
      this.torsoVisuals.add(triforceMedallion);

      const royalBelt = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.1, 0.39), this.goldMat);
      royalBelt.position.y = -0.28;
      this.torsoVisuals.add(royalBelt);

    } else if (variant === 'kitsune_beast') {
      // Fang Talisman Necklace & Rogue Belt
      const boneMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.5 });
      for (let f = -2; f <= 2; f++) {
        const fang = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.08, 6), boneMat);
        fang.position.set(f * 0.07, 0.28 - Math.abs(f) * 0.02, 0.19);
        fang.rotation.x = Math.PI;
        this.torsoVisuals.add(fang);
      }

      const rogueBelt = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.12, 0.39), this.darkLeatherMat);
      rogueBelt.position.y = -0.28;
      this.torsoVisuals.add(rogueBelt);

    } else if (variant === 'dragon_warrior') {
      // Glowing Molten Magma Rune Core
      const magmaCore = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.02, 16), new THREE.MeshStandardMaterial({
        color: 0xf97316,
        emissive: 0xef4444,
        emissiveIntensity: 3.0,
      }));
      magmaCore.rotation.x = Math.PI / 2;
      magmaCore.position.set(0, 0.12, 0.19);
      this.torsoVisuals.add(magmaCore);

      // Spiked Dragon Bone Pauldrons
      const bonePauldrons = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.4 });
      for (const side of [-1, 1]) {
        const pauldron = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.25, 4), bonePauldrons);
        pauldron.position.set(side * 0.38, 0.42, 0);
        pauldron.rotation.set(0, 0, side * -0.6);
        this.torsoVisuals.add(pauldron);
      }

    } else {
      // Hylian Champion Link Accessories (Collar, Stripes, Harness, Sheikah Slate)
      const collar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), this.tunicTrimMat);
      collar.position.set(0, 0.44, 0);
      this.torsoVisuals.add(collar);

      const chestStripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.55, 0.02), this.tunicTrimMat);
      chestStripe.position.set(0, 0.08, 0.185);
      this.torsoVisuals.add(chestStripe);

      const chestCross = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.07, 0.02), this.tunicTrimMat);
      chestCross.position.set(0, 0.18, 0.185);
      this.torsoVisuals.add(chestCross);

      const harness = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.95, 0.39), this.darkLeatherMat);
      harness.rotation.z = -0.36;
      harness.position.set(0, 0.02, 0);
      this.torsoVisuals.add(harness);

      const mainBelt = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.12, 0.39), this.darkLeatherMat);
      mainBelt.position.y = -0.28;
      this.torsoVisuals.add(mainBelt);

      // Sheikah Slate
      const slateGroup = new THREE.Group();
      slateGroup.position.set(0.35, -0.32, 0.06);
      slateGroup.rotation.set(0, -0.2, -0.15);
      const slateBody = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.26, 0.06), this.sheikahSlateMat);
      slateGroup.add(slateBody);
      const slateEye = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.01, 16), this.sheikahGlowMat);
      slateEye.rotation.x = Math.PI / 2;
      slateEye.position.set(0, -0.01, 0.032);
      slateGroup.add(slateEye);
      this.torsoVisuals.add(slateGroup);
    }
  }


  /**
   * Procedural Kinematic Animation Loop with Knees, Elbows, and Dynamic Cape Flow
   */
  public updateAnimation(delta: number, action: PlayerActionState, speed: number) {
    const isMoving = speed > 0.1;
    this.animTime += delta * (isMoving ? Math.max(speed * 0.7, 5.0) : 3.0);
    if (action !== this.currentAction) {
      this.actionTime = 0;
      if (action === 'ATTACK_LIGHT' || action === 'ATTACK_HEAVY') this.comboIndex = (this.comboIndex + 1) % 3;
    } else {
      this.actionTime += delta;
    }
    this.currentAction = action;

    // Turn rate (for banking / leaning into curves)
    let dYaw = this.mesh.rotation.y - this.lastYaw;
    dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
    this.lastYaw = this.mesh.rotation.y;
    const rawTurn = delta > 0 ? dYaw / delta : 0;
    this.turnRate += (THREE.MathUtils.clamp(rawTurn, -6, 6) - this.turnRate) * Math.min(1, delta * 8);

    // Snapshot displayed pose before computing new targets (for elastic spring blending)
    const joints = this.getSpringJoints();
    for (const j of joints) {
      if (!this.springCur.has(j.o)) {
        this.springCur.set(j.o, new THREE.Vector3(j.o.rotation.x, j.o.rotation.y, j.o.rotation.z));
        this.springVel.set(j.o, new THREE.Vector3());
      }
    }
    const prevTorsoY = this.torso.position.y;

    const t = this.animTime;
    const at = this.actionTime;

    // Default Joint Reset
    this.leftUpperArm.rotation.set(0, 0, 0);
    this.leftLowerArm.rotation.set(-0.2, 0, 0); // Slight natural elbow flex
    this.rightUpperArm.rotation.set(0, 0, 0);
    this.rightLowerArm.rotation.set(-0.2, 0, 0);

    this.leftUpperLeg.rotation.set(0, 0, 0);
    this.leftLowerLeg.rotation.set(0, 0, 0); // Straight knee
    this.rightUpperLeg.rotation.set(0, 0, 0);
    this.rightLowerLeg.rotation.set(0, 0, 0);

    this.torso.rotation.set(0, 0, 0);
    this.torso.position.y = 1.35;
    this.head.rotation.set(0, 0, 0);
    this.hairPonytail.rotation.set(0, 0, 0);

    this.paraglider.visible = false;
    this.bow.visible = action === 'BOW_AIM';

    // -------------------------------------------------------------
    // Verlet Cloth Physics for Cloak / Cape (From Snowflow Engine)
    // -------------------------------------------------------------
    const speedRatio = Math.min(speed / 22.0, 1.2);
    const subSteps = 4;
    const subDt = Math.min(delta, 0.033) / subSteps;
    const damping = 0.955;

    // Wind & Aerodynamic forces
    const windLift = isMoving ? 1.5 + speedRatio * 5.5 : 0.4;
    const windBackward = isMoving ? -3.5 - speedRatio * 12.0 : -0.2;
    const gravityVec = new THREE.Vector3(0, -9.81, 0);

    const tmpV = new THREE.Vector3();

    for (let step = 0; step < subSteps; step++) {
      for (let i = 0; i < this.clothParticles.length; i++) {
        const p = this.clothParticles[i];
        if (p.pinned) {
          p.pos.copy(p.pinOffset);
          continue;
        }

        const r = Math.floor(i / this.clothCols);
        const c = i % this.clothCols;

        // Turbulence ripple forces
        const swirlX = Math.sin(t * 12.0 - r * 0.4 + c * 0.3) * (0.4 + speedRatio * 1.5);
        const swirlY = Math.cos(t * 9.0 - r * 0.5) * (0.2 + speedRatio * 0.8);
        const swirlZ = Math.sin(t * 15.0 - r * 0.6) * (0.5 + speedRatio * 2.2);

        const totalWind = new THREE.Vector3(
          swirlX,
          windLift + swirlY,
          windBackward + swirlZ
        );

        tmpV.subVectors(p.pos, p.oldPos).multiplyScalar(damping);
        p.oldPos.copy(p.pos);

        // Apply Verlet Integration
        p.pos.add(tmpV).addScaledVector(
          gravityVec.clone().add(totalWind),
          subDt * subDt
        );

        // Torso / Pelvis Body Collision (Prevent clipping inside avatar body)
        if (p.pos.z > -0.19 && p.pos.y > -0.7 && p.pos.y < 0.4) {
          p.pos.z = -0.19;
        }
        // Lateral body width collision
        const distFromCenter = Math.hypot(p.pos.x, p.pos.z);
        if (distFromCenter < 0.28 && p.pos.y > -0.6 && p.pos.y < 0.38) {
          const pushOut = 0.28 / (distFromCenter || 0.001);
          p.pos.x *= pushOut;
          p.pos.z *= pushOut;
        }
      }

      // Solve Distance Spring Constraints
      for (let i = 0; i < this.clothConstraints.length; i++) {
        const constraint = this.clothConstraints[i];
        const p1 = this.clothParticles[constraint.p1];
        const p2 = this.clothParticles[constraint.p2];

        tmpV.subVectors(p2.pos, p1.pos);
        const currentDist = tmpV.length();
        if (currentDist === 0) continue;

        const deltaDist = currentDist - constraint.dist;
        tmpV.multiplyScalar(0.5 * (deltaDist / currentDist));

        if (!p1.pinned) p1.pos.add(tmpV);
        if (!p2.pinned) p2.pos.sub(tmpV);
      }
    }

    // Update PlaneGeometry Vertex Positions
    const posAttr = this.clothGeo.attributes.position.array as Float32Array;
    for (let i = 0; i < this.clothParticles.length; i++) {
      posAttr[i * 3] = this.clothParticles[i].pos.x;
      posAttr[i * 3 + 1] = this.clothParticles[i].pos.y;
      posAttr[i * 3 + 2] = this.clothParticles[i].pos.z;
    }
    this.clothGeo.attributes.position.needsUpdate = true;
    this.clothGeo.computeVertexNormals();

    // -------------------------------------------------------------
    // Locomotion & Action Kinematics
    // -------------------------------------------------------------
    switch (action) {
      case 'WALK':
      case 'RUN':
      case 'SPRINT': {
        const isSprint = action === 'SPRINT';
        const strideAmp = isSprint ? 1.1 : action === 'RUN' ? 0.85 : 0.6;

        // Gait sine wave
        const gait = Math.sin(t);

        // --- Hips & Legs (Human Anatomical Knee Flexion: Positive X bends knee backward) ---
        // Left Leg: Thigh swings forward/backward
        this.leftUpperLeg.rotation.x = gait * strideAmp;
        if (gait < 0) {
          // Swing phase (leg trailing behind -> flex knee backward with positive angle)
          this.leftLowerLeg.rotation.x = Math.sin(-gait * Math.PI) * (0.85 + strideAmp * 0.45);
        } else {
          // Stance / Forward landing phase -> knee extends straight
          this.leftLowerLeg.rotation.x = 0.02;
        }

        // Right Leg: Opposite gait phase
        this.rightUpperLeg.rotation.x = -gait * strideAmp;
        if (gait > 0) {
          // Swing phase (leg trailing behind -> flex knee backward with positive angle)
          this.rightLowerLeg.rotation.x = Math.sin(gait * Math.PI) * (0.85 + strideAmp * 0.45);
        } else {
          // Stance / Forward landing phase -> knee extends straight
          this.rightLowerLeg.rotation.x = 0.02;
        }

        // --- Shoulder & Arms (Upper Arm & Elbow Bending) ---
        // Left Arm swings opposite left leg
        this.leftUpperArm.rotation.x = -gait * strideAmp * 0.85;
        // Left Elbow bends more during forward swing
        this.leftLowerArm.rotation.x = -0.3 - Math.max(0, -gait) * 0.6;

        // Right Arm (Weapon Arm)
        this.rightUpperArm.rotation.x = gait * strideAmp * 0.85;
        this.rightLowerArm.rotation.x = -0.3 - Math.max(0, gait) * 0.6;

        // --- Torso & Head Dynamics ---
        // Double-bounce per stride (lowest at foot contact, highest mid-stance)
        this.torso.position.y = 1.35 + (Math.cos(t * 2) * -0.5 + 0.5) * (0.04 + strideAmp * 0.05);
        // Forward lean grows with speed, bank into curves
        this.torso.rotation.x = (isSprint ? 0.26 : action === 'RUN' ? 0.14 : 0.06) + Math.abs(gait) * 0.03;
        this.torso.rotation.y = Math.sin(t) * (0.1 + strideAmp * 0.06); // shoulders counter-rotate hips
        this.torso.rotation.z = -this.turnRate * 0.06 * strideAmp + Math.sin(t) * 0.025;

        // Head stabilizes: counter all torso motion, looks into turn
        this.head.rotation.x = -this.torso.rotation.x * 0.7;
        this.head.rotation.y = -this.torso.rotation.y * 0.8 + this.turnRate * 0.05;
        this.head.rotation.z = -this.torso.rotation.z * 0.6;
        this.hairPonytail.rotation.x = 0.35 + strideAmp * 0.45 + Math.sin(t * 2) * 0.12;
        this.hairPonytail.rotation.z = Math.sin(t) * 0.15;
        break;
      }

      case 'JUMP': {
        // Dynamic athletic leap into the air
        const jumpPhase = Math.min(at / 0.5, 1);
        const tuck = Math.sin(jumpPhase * Math.PI);
        this.torso.position.y = 1.38 + tuck * 0.12;
        this.torso.rotation.set(0.18, 0, 0);

        // Arms reach slightly out and back for balance
        this.leftUpperArm.rotation.set(-0.65 - tuck * 0.4, 0, -0.38);
        this.leftLowerArm.rotation.set(-0.8 - tuck * 0.3, 0, 0);
        this.rightUpperArm.rotation.set(-0.65 - tuck * 0.4, 0, 0.38);
        this.rightLowerArm.rotation.set(-0.8 - tuck * 0.3, 0, 0);

        // Legs tuck up: Thighs forward, knees flexed back
        this.leftUpperLeg.rotation.set(0.45 + tuck * 0.55, 0, -0.12);
        this.leftLowerLeg.rotation.set(0.75 + tuck * 0.65, 0, 0);
        this.rightUpperLeg.rotation.set(0.35 + tuck * 0.45, 0, 0.12);
        this.rightLowerLeg.rotation.set(0.85 + tuck * 0.55, 0, 0);

        this.head.rotation.set(-0.12, 0, 0);
        this.hairPonytail.rotation.set(0.45 + tuck * 0.35, 0, 0);
        break;
      }

      case 'FALL': {
        // Airborne descent: limbs anticipate ground contact
        const windBob = Math.sin(at * 8.0) * 0.03;
        this.torso.position.y = 1.35 + windBob;
        this.torso.rotation.set(0.08, 0, 0);

        // Arms raised wide for aerodynamic balance
        this.leftUpperArm.rotation.set(-0.45, 0, -0.55);
        this.leftLowerArm.rotation.set(-0.4, 0, 0);
        this.rightUpperArm.rotation.set(-0.45, 0, 0.55);
        this.rightLowerArm.rotation.set(-0.4, 0, 0);

        // Legs extended downward ready to absorb landing impact
        this.leftUpperLeg.rotation.set(0.15, 0, -0.08);
        this.leftLowerLeg.rotation.set(0.35, 0, 0);
        this.rightUpperLeg.rotation.set(-0.1, 0, 0.08);
        this.rightLowerLeg.rotation.set(0.45, 0, 0);

        this.head.rotation.set(-0.1, 0, 0);
        this.hairPonytail.rotation.set(-0.4 + windBob * 2, 0, 0);
        break;
      }

      case 'GLIDE': {
        this.paraglider.visible = true;
        const flap = Math.sin(at * 2.2);
        const bank = THREE.MathUtils.clamp(-this.turnRate * 0.12, -0.5, 0.5);

        // Overhead grip; arms pull down on the inner side of the turn
        this.leftUpperArm.rotation.set(Math.PI - 0.25 + bank * 0.35 + flap * 0.04, 0, -0.28);
        this.leftLowerArm.rotation.set(-0.45 - bank * 0.2, 0, 0);
        this.rightUpperArm.rotation.set(Math.PI - 0.25 - bank * 0.35 + flap * 0.04, 0, 0.28);
        this.rightLowerArm.rotation.set(-0.45 + bank * 0.2, 0, 0);

        // Legs trail behind & gently pedal in the airstream
        const kick = Math.sin(at * 3.4);
        this.leftUpperLeg.rotation.set(-0.35 + kick * 0.12, 0, -0.06);
        this.leftLowerLeg.rotation.x = 0.55 - kick * 0.15;
        this.rightUpperLeg.rotation.set(-0.3 - kick * 0.12, 0, 0.06);
        this.rightLowerLeg.rotation.x = 0.5 + kick * 0.15;

        // Superman-style body: lean forward, bank with turns, float bob
        this.torso.rotation.set(0.55 + flap * 0.04, 0, bank);
        this.torso.position.y = 1.35 + Math.sin(at * 1.6) * 0.05;
        this.head.rotation.set(-0.45, -bank * 0.3, -bank * 0.4);
        this.hairPonytail.rotation.set(1.25 + Math.sin(at * 14) * 0.08, 0, Math.sin(at * 9) * 0.12);

        this.paraglider.rotation.set(Math.sin(at * 1.3) * 0.04, 0, bank * 0.8 + Math.sin(at * 0.7) * 0.06);
        break;
      }

      case 'RIDE': {
        // Equestrian Riding Pose (Holding reins, seated in saddle, knees bent around horse flank)
        const gallopBob = Math.sin(t * 12.0) * 0.06;
        this.torso.position.y = 1.05 + gallopBob;
        this.torso.rotation.set(0.18 + gallopBob * 0.5, 0, 0);

        // Arms reach forward holding reins
        this.leftUpperArm.rotation.set(0.85, 0.2, -0.3);
        this.leftLowerArm.rotation.set(-1.1, 0, 0);
        this.rightUpperArm.rotation.set(0.85, -0.2, 0.3);
        this.rightLowerArm.rotation.set(-1.1, 0, 0);

        // Legs straddle the mount: Thighs angled out & forward, knees bent back
        this.leftUpperLeg.rotation.set(0.95, 0, -0.45);
        this.leftLowerLeg.rotation.set(1.1, 0, 0);
        this.rightUpperLeg.rotation.set(0.95, 0, 0.45);
        this.rightLowerLeg.rotation.set(1.1, 0, 0);

        this.head.rotation.set(-0.15, 0, 0);
        this.hairPonytail.rotation.set(0.6 + gallopBob, 0, 0);
        break;
      }

      case 'CLIMB': {
        // Vertical Cliff Climbing Pose
        const climbCycle = Math.sin(t * 2.5);
        this.leftUpperArm.rotation.set(Math.PI / 2 + climbCycle * 0.5, 0, -0.25);
        this.leftLowerArm.rotation.set(-0.6, 0, 0);

        this.rightUpperArm.rotation.set(Math.PI / 2 - climbCycle * 0.5, 0, 0.25);
        this.rightLowerArm.rotation.set(-0.6, 0, 0);

        this.leftUpperLeg.rotation.x = climbCycle * 0.4;
        this.leftLowerLeg.rotation.x = 0.5;

        this.rightUpperLeg.rotation.x = -climbCycle * 0.4;
        this.rightLowerLeg.rotation.x = 0.5;

        this.torso.rotation.x = -0.2;
        break;
      }

      case 'ATTACK_LIGHT':
      case 'ATTACK_HEAVY': {
        const heavy = action === 'ATTACK_HEAVY';
        const tool = this.currentEquippedToolType || 'sword';

        if (tool === 'axe' || tool === 'pickaxe' || tool === 'hammer') {
          // ==============================================================
          // 🪓 REALISTIC TWO-HANDED FORWARD OVERHEAD POWER CHOP
          // ==============================================================
          const dur = heavy ? 0.68 : 0.52;
          const p = Math.min(at / dur, 1);
          // 0 - 0.36: High overhead wind-up & shoulder cock
          // 0.36 - 0.6: Explosive forward-downward smash & deep knee sink
          // 0.6 - 1.0: Impact ground recoil & reset
          const windUp = p < 0.36 ? Math.sin((p / 0.36) * Math.PI * 0.5) : 1;
          const strikeRaw = p < 0.36 ? 0 : Math.min((p - 0.36) / 0.24, 1);
          const strike = 1 - Math.pow(1 - strikeRaw, 3);
          const recover = p < 0.6 ? 0 : (p - 0.6) / 0.4;
          const k = strike * (1 - recover * 0.4);

          // Torso: Arches back on windup, slams forward on strike, sinks into earth
          this.torso.rotation.x = THREE.MathUtils.lerp(-0.25 * windUp, 0.46, k);
          this.torso.rotation.y = THREE.MathUtils.lerp(-0.35 * windUp, 0.12, k);
          this.torso.rotation.z = THREE.MathUtils.lerp(0.08 * windUp, -0.06, k);
          this.torso.position.y = 1.35 - strike * (1 - recover) * (heavy ? 0.22 : 0.16);

          // Right Arm (Main chopping arm: high overhead in -X -> forward-down slam in front!)
          const pitchFrom = -2.35;
          const pitchTo = -0.42;
          this.rightUpperArm.rotation.set(
            THREE.MathUtils.lerp(pitchFrom * windUp, pitchTo, k),
            THREE.MathUtils.lerp(-0.25 * windUp, 0.05, k),
            THREE.MathUtils.lerp(0.3 * windUp, 0.1, k)
          );
          this.rightLowerArm.rotation.set(
            THREE.MathUtils.lerp(-1.1 * windUp, -0.12, k),
            0,
            0
          );

          // Left Arm (Assisting two-handed forward grip on the handle)
          this.leftUpperArm.rotation.set(
            THREE.MathUtils.lerp(-2.2 * windUp, -0.38, k),
            THREE.MathUtils.lerp(0.35 * windUp, 0.2, k),
            THREE.MathUtils.lerp(-0.35 * windUp, -0.18, k)
          );
          this.leftLowerArm.rotation.set(
            THREE.MathUtils.lerp(-1.3 * windUp, -0.22, k),
            0,
            0
          );

          // Head looks directly forward-down at impact target
          this.head.rotation.x = THREE.MathUtils.lerp(-0.2 * windUp, 0.32, k);
          this.head.rotation.y = -this.torso.rotation.y * 0.7;
          this.hairPonytail.rotation.set(0.35 + windUp * 0.4 - strike * 0.6, 0, -this.torso.rotation.y * 0.8);

          // Stance: Deep rooted power stance
          if (isMoving) {
            const gait = Math.sin(t);
            this.leftUpperLeg.rotation.x = gait * 0.6;
            this.leftLowerLeg.rotation.x = gait < 0 ? Math.sin(-gait * Math.PI) * 0.7 : 0.05;
            this.rightUpperLeg.rotation.x = -gait * 0.6;
            this.rightLowerLeg.rotation.x = gait > 0 ? Math.sin(gait * Math.PI) * 0.7 : 0.05;
          } else {
            const sink = strike * (1 - recover);
            this.leftUpperLeg.rotation.set(0.35 + sink * 0.4, 0, -0.15);
            this.leftLowerLeg.rotation.x = 0.45 + sink * 0.35;
            this.rightUpperLeg.rotation.set(-0.2 - sink * 0.2, 0, 0.15);
            this.rightLowerLeg.rotation.x = 0.3 + sink * 0.25;
          }

        } else if (tool === 'shovel') {
          // ==============================================================
          // ⛏️ REALISTIC FORWARD SHOVEL DIG & SCOOP (Schaufel)
          // ==============================================================
          const dur = 0.54;
          const p = Math.min(at / dur, 1);
          // Phase 1 (0-0.35): Drive blade forward-down into soil
          // Phase 2 (0.35-0.7): Lever up heavy earth forward
          // Phase 3 (0.7-1.0): Toss & return
          if (p < 0.35) {
            const dig = Math.sin((p / 0.35) * Math.PI * 0.5);
            this.torso.rotation.set(0.42 * dig, 0.1 * dig, 0);
            this.torso.position.y = 1.35 - 0.14 * dig;
            this.rightUpperArm.rotation.set(-0.75 * dig, 0, 0.18);
            this.rightLowerArm.rotation.set(-0.6 * dig, 0, 0);
            this.leftUpperArm.rotation.set(-0.95 * dig, 0.25, -0.28);
            this.leftLowerArm.rotation.set(-0.8 * dig, 0, 0);
          } else if (p < 0.7) {
            const lift = (p - 0.35) / 0.35;
            this.torso.rotation.set(0.42 - 0.55 * lift, 0.1 - 0.25 * lift, 0);
            this.torso.position.y = 1.21 + 0.16 * lift;
            this.rightUpperArm.rotation.set(-0.75 - 0.7 * lift, 0.2 * lift, 0.15);
            this.rightLowerArm.rotation.set(-0.6 + 0.3 * lift, 0, 0);
            this.leftUpperArm.rotation.set(-0.95 - 0.3 * lift, 0.2, -0.2);
          } else {
            const ret = (p - 0.7) / 0.3;
            this.torso.rotation.set(-0.13 * (1 - ret), -0.15 * (1 - ret), 0);
            this.rightUpperArm.rotation.set(-1.45 * (1 - ret), 0, 0);
          }
          this.leftUpperLeg.rotation.set(0.3, 0, -0.1);
          this.leftLowerLeg.rotation.x = 0.35;
          this.rightUpperLeg.rotation.set(-0.15, 0, 0.1);

        } else {
          // ==============================================================
          // ⚔️ DYNAMIC ANIME SWORD COMBOS (Strictly Forward In Front of Link!)
          // ==============================================================
          const dur = heavy ? 0.62 : 0.42;
          const p = Math.min(at / dur, 1);
          const windUp = p < 0.28 ? Math.sin((p / 0.28) * Math.PI * 0.5) : 1;
          const strikeRaw = p < 0.28 ? 0 : Math.min((p - 0.28) / 0.26, 1);
          const strike = 1 - Math.pow(1 - strikeRaw, 3);
          const recover = p < 0.54 ? 0 : (p - 0.54) / 0.46;
          const combo = heavy ? 3 : this.comboIndex;

          if (combo === 0) {
            // Hit 1: Horizontal forward slash sweeping right-to-left across the front chest
            const k = strike * (1 - recover * 0.3);
            this.rightUpperArm.rotation.set(
              THREE.MathUtils.lerp(-0.35 * windUp, -0.65, k),
              THREE.MathUtils.lerp(-1.15 * windUp, 1.25, k),
              THREE.MathUtils.lerp(0.45 * windUp, 0.15, k)
            );
            this.rightLowerArm.rotation.set(
              THREE.MathUtils.lerp(-1.1 * windUp, -0.12, k),
              0,
              0
            );
            this.torso.rotation.y = THREE.MathUtils.lerp(-0.72 * windUp, 0.75, k);
            this.torso.rotation.x = THREE.MathUtils.lerp(-0.05 * windUp, 0.15, k);
            this.leftUpperArm.rotation.set(-0.45, 0.35, -0.35);
            this.leftLowerArm.rotation.set(-0.9, 0, 0);

          } else if (combo === 1) {
            // Hit 2: Dynamic rising diagonal forward uppercut slash across chest to top left
            const k = strike * (1 - recover * 0.35);
            this.rightUpperArm.rotation.set(
              THREE.MathUtils.lerp(-0.25 * windUp, -1.75, k),
              THREE.MathUtils.lerp(1.15 * windUp, -0.85, k),
              THREE.MathUtils.lerp(0.35 * windUp, -0.2, k)
            );
            this.rightLowerArm.rotation.set(
              THREE.MathUtils.lerp(-0.8 * windUp, -0.15, k),
              0,
              0
            );
            this.torso.rotation.y = THREE.MathUtils.lerp(0.68 * windUp, -0.65, k);
            this.torso.rotation.x = THREE.MathUtils.lerp(0.12 * windUp, -0.08, k);
            this.leftUpperArm.rotation.set(-0.5, 0.4, -0.3);
            this.leftLowerArm.rotation.set(-0.8, 0, 0);

          } else if (combo === 2) {
            // Hit 3: Lunging forward pierce / thrust directly in front (+Z)
            const k = strike * (1 - recover * 0.45);
            this.rightUpperArm.rotation.set(
              THREE.MathUtils.lerp(-0.4 * windUp, -Math.PI / 2.05, k),
              THREE.MathUtils.lerp(0.25 * windUp, 0.02, k),
              THREE.MathUtils.lerp(0.15 * windUp, 0.02, k)
            );
            this.rightLowerArm.rotation.set(
              THREE.MathUtils.lerp(-1.5 * windUp, -0.04, k),
              0,
              0
            );
            this.torso.rotation.y = THREE.MathUtils.lerp(-0.45 * windUp, 0.15, k);
            this.torso.rotation.x = THREE.MathUtils.lerp(0.05, 0.35, k);
            this.leftUpperArm.rotation.set(-0.55, 0.4, -0.38);
            this.leftLowerArm.rotation.set(-1.0, 0, 0);

          } else {
            // Heavy: 360 Spin Cleave with horizontal forward blade
            const spin = p * Math.PI * 2;
            this.torso.rotation.y = spin;
            this.torso.rotation.x = 0.18;
            this.rightUpperArm.rotation.set(-Math.PI / 2.2, 0.15, 0.3);
            this.rightLowerArm.rotation.set(-0.1, 0, 0);
            this.leftUpperArm.rotation.set(-Math.PI / 2.2, -0.15, -0.3);
            this.leftLowerArm.rotation.set(-0.1, 0, 0);
            this.torso.position.y = 1.35 + Math.sin(p * Math.PI) * 0.25; // airborne hop
          }

          this.head.rotation.y = -this.torso.rotation.y * 0.6; // Eyes stay locked on forward target
          this.hairPonytail.rotation.set(0.4, 0, -this.torso.rotation.y * 0.8);

          if (isMoving) {
            const gait = Math.sin(t);
            this.leftUpperLeg.rotation.x = gait * 0.7;
            this.leftLowerLeg.rotation.x = gait < 0 ? Math.sin(-gait * Math.PI) * 0.8 : 0.05;
            this.rightUpperLeg.rotation.x = -gait * 0.7;
            this.rightLowerLeg.rotation.x = gait > 0 ? Math.sin(gait * Math.PI) * 0.8 : 0.05;
            this.torso.position.y = 1.33 + Math.abs(Math.sin(t * 2)) * 0.05;
          } else {
            const lunge = strike * (1 - recover);
            this.leftUpperLeg.rotation.set(0.28 + lunge * 0.48, 0, -0.1);
            this.leftLowerLeg.rotation.x = 0.32 + lunge * 0.36;
            this.rightUpperLeg.rotation.set(-0.25 - lunge * 0.25, 0, 0.1);
            this.rightLowerLeg.rotation.x = 0.18 + lunge * 0.2;
            this.torso.position.y = 1.35 - lunge * (heavy ? 0.14 : 0.08);
          }
        }
        break;
      }

      case 'DODGE': {
        // Tucked forward roll over ~0.45s, then snaps upright via spring
        const p = Math.min(at / 0.45, 1);
        const ease = p * p * (3 - 2 * p);
        this.torso.rotation.x = ease * Math.PI * 2;
        this.torso.position.y = 1.35 - Math.sin(p * Math.PI) * 0.55;
        this.head.rotation.x = 0.5 * Math.sin(p * Math.PI);
        this.leftUpperArm.rotation.set(-1.2, 0, -0.3);
        this.rightUpperArm.rotation.set(-1.2, 0, 0.3);
        this.leftLowerArm.rotation.x = -1.2;
        this.rightLowerArm.rotation.x = -1.2;
        this.leftUpperLeg.rotation.x = 1.3 * Math.sin(p * Math.PI);
        this.leftLowerLeg.rotation.x = 1.6 * Math.sin(p * Math.PI);
        this.rightUpperLeg.rotation.x = 1.3 * Math.sin(p * Math.PI);
        this.rightLowerLeg.rotation.x = 1.6 * Math.sin(p * Math.PI);
        break;
      }

      case 'HIT_KNOCKBACK': {
        const p = Math.min(at / 0.4, 1);
        const flinch = Math.sin(p * Math.PI);
        this.torso.rotation.set(-0.35 * flinch, 0, 0);
        this.torso.position.y = 1.35 - 0.1 * flinch;
        this.head.rotation.set(-0.35 * flinch, 0, 0);
        this.leftUpperArm.rotation.set(-0.6 * flinch, 0, -0.4);
        this.rightUpperArm.rotation.set(-0.6 * flinch, 0, 0.4);
        this.leftUpperLeg.rotation.set(0.3 * flinch, 0, 0);
        this.rightUpperLeg.rotation.set(-0.2 * flinch, 0, 0);
      }

      case 'SWIMMING': {
        if (isMoving) {
          // Horizontal Forward Crawl Swimming
          const swimSpeed = 3.6;
          const strokeL = Math.sin(t * swimSpeed);
          const strokeR = Math.sin(t * swimSpeed + Math.PI);

          // Torso lies horizontally with smooth roll into each arm stroke
          this.torso.rotation.x = Math.PI / 2.1;
          this.torso.rotation.z = strokeL * 0.12;
          this.torso.rotation.y = strokeL * 0.08;
          this.torso.position.y = 0.55 + Math.sin(t * 3.0) * 0.03; // Dynamic water bobbing

          // Alternating Arm Strokes (Freestyle Crawl)
          this.leftUpperArm.rotation.set(Math.PI / 2.4 + strokeL * 0.7, 0, -0.6);
          this.leftLowerArm.rotation.set(-0.4 + Math.sin(t * swimSpeed - 0.5) * 0.3, 0, 0);

          this.rightUpperArm.rotation.set(Math.PI / 2.4 + strokeR * 0.7, 0, 0.6);
          this.rightLowerArm.rotation.set(-0.4 + Math.sin(t * swimSpeed + Math.PI - 0.5) * 0.3, 0, 0);

          // Alternating Leg Flutter Kicks
          this.leftUpperLeg.rotation.x = strokeL * 0.5;
          this.leftLowerLeg.rotation.x = Math.abs(strokeL) * 0.4;

          this.rightUpperLeg.rotation.x = strokeR * 0.5;
          this.rightLowerLeg.rotation.x = Math.abs(strokeR) * 0.4;

          this.head.rotation.x = -0.58; // Eyes look forward above water
        } else {
          // Treading Water Stance (Stationary in Water)
          const tread = Math.sin(t * 2.2);

          // Torso inclined slightly upright
          this.torso.rotation.x = Math.PI / 5.5;
          this.torso.rotation.y = tread * 0.05;
          this.torso.rotation.z = 0;
          this.torso.position.y = 0.65 + tread * 0.035;

          // Gentle Water Treading Arm Movements
          this.leftUpperArm.rotation.set(0.3, 0, -0.65 + tread * 0.15);
          this.leftLowerArm.rotation.set(-0.5, 0, 0);

          this.rightUpperArm.rotation.set(0.3, 0, 0.65 - tread * 0.15);
          this.rightLowerArm.rotation.set(-0.5, 0, 0);

          // Gentle Leg Sculling
          this.leftUpperLeg.rotation.x = tread * 0.3;
          this.leftLowerLeg.rotation.x = 0.3;

          this.rightUpperLeg.rotation.x = -tread * 0.3;
          this.rightLowerLeg.rotation.x = 0.3;

          this.head.rotation.x = -0.2;
        }
        break;
      }

      case 'BOW_AIM': {
        this.leftUpperArm.rotation.set(Math.PI / 2 - 0.1, 0, 0.35);
        this.leftLowerArm.rotation.set(-0.1, 0, 0);
        this.rightUpperArm.rotation.set(Math.PI / 2, 0, -0.2);
        this.rightLowerArm.rotation.set(-0.8, 0, 0); // Pull string
        this.torso.rotation.y = -Math.PI / 3;
        break;
      }

      case 'IDLE':
      default: {
        // Breathing, slow weight shift between legs and occasional look-around
        const breath = Math.sin(t * 0.8);
        const shift = Math.sin(t * 0.23);
        const look = Math.sin(t * 0.17) * Math.sin(t * 0.41);
        this.torso.position.y = 1.35 + breath * 0.02 - Math.abs(shift) * 0.015;
        this.torso.rotation.set(-breath * 0.02, shift * 0.06, shift * 0.035);
        this.head.rotation.set(0.03 - breath * 0.02, look * 0.45 - shift * 0.05, -shift * 0.03);
        this.leftUpperArm.rotation.set(0.04 + breath * 0.02, 0, -0.1 + breath * 0.025);
        this.leftLowerArm.rotation.x = -0.25;
        this.rightUpperArm.rotation.set(0.04 + breath * 0.02, 0, 0.1 - breath * 0.025);
        this.rightLowerArm.rotation.x = -0.25;

        this.leftUpperLeg.rotation.set(0.02, 0, -0.06 - shift * 0.04);
        this.rightUpperLeg.rotation.set(-0.02, 0, 0.06 - shift * 0.04);
        this.leftLowerLeg.rotation.x = 0.06 + Math.max(0, -shift) * 0.12;
        this.rightLowerLeg.rotation.x = 0.06 + Math.max(0, shift) * 0.12;
        this.hairPonytail.rotation.set(0.15 + breath * 0.03, 0, Math.sin(t * 0.5) * 0.06);
        break;
      }
    }

    // -------------------------------------------------------------
    // Elastic Damped-Spring Blending (overlap, follow-through, natural inertia)
    // -------------------------------------------------------------
    const dt = Math.min(delta, 0.05);
    const snappy = action === 'ATTACK_LIGHT' || action === 'ATTACK_HEAVY' || action === 'DODGE' ? 2.6 : 1.0;
    const TWO_PI = Math.PI * 2;
    const steps = 2;
    const h = dt / steps;
    for (const j of joints) {
      const cur = this.springCur.get(j.o)!;
      const vel = this.springVel.get(j.o)!;
      const tx = j.o.rotation.x, ty = j.o.rotation.y, tz = j.o.rotation.z;
      // Unwrap so springs take the shortest path (e.g. after a full roll)
      cur.x += Math.round((tx - cur.x) / TWO_PI) * TWO_PI;
      cur.y += Math.round((ty - cur.y) / TWO_PI) * TWO_PI;
      cur.z += Math.round((tz - cur.z) / TWO_PI) * TWO_PI;
      const k = j.k * snappy;
      const c = j.c * Math.sqrt(snappy);
      for (let s = 0; s < steps; s++) {
        vel.x += ((tx - cur.x) * k - vel.x * c) * h;
        vel.y += ((ty - cur.y) * k - vel.y * c) * h;
        vel.z += ((tz - cur.z) * k - vel.z * c) * h;
        cur.addScaledVector(vel, h);
      }
      j.o.rotation.set(cur.x, cur.y, cur.z);
    }

    // Ponytail secondary motion: reacts to body bounce & turning
    this.hairPonytail.rotation.z += this.turnRate * 0.04;

    // Dynamic Tail Secondary Motion (Kitsune Fox-Tail / Dragon Tail)
    if (this.tail && this.tail.children.length > 0) {
      const isMovingState = action === 'WALK' || action === 'RUN' || action === 'SPRINT' || action === 'SWIMMING';
      const tailSpeed = isMovingState ? 8.0 : 2.6;
      const tailSway = Math.sin(t * tailSpeed);
      this.tail.rotation.y = tailSway * (isMovingState ? 0.35 : 0.18) + this.turnRate * 0.12;
      this.tail.rotation.x = isMovingState ? 0.22 + Math.abs(Math.sin(t * tailSpeed * 0.5)) * 0.14 : 0.08;
      this.tail.rotation.z = Math.cos(t * tailSpeed) * 0.08;
    }

    // Vertical body spring (soft landings / squash on footfalls)
    const targetY = this.torso.position.y;
    this.torsoYVel += ((targetY - prevTorsoY) * 260 * snappy - this.torsoYVel * 22) * dt;
    this.torso.position.y = prevTorsoY + this.torsoYVel * dt;
  }

  /**
   * Dynamically rebuild the 3D mesh model held in the hero's right hand based on equipped item.
   * Completely redesigned authentic fantasy tools (Bearded Axe, Miner's Pickaxe, D-Grip Spade, War Hammer, Crystal Blade, Master Sword, Torch, Bow).
   */
  public updateHeldToolOrWeapon(item?: any) {
    if (!this.sword) return;

    // Remove all previous child meshes from right hand
    while (this.sword.children.length > 0) {
      this.sword.remove(this.sword.children[0]);
    }

    if (!item) {
      this.currentEquippedToolType = 'unarmed';
      return; // Un-equipped / empty hand
    }

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.75 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x3d2817, roughness: 0.8 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.88, roughness: 0.18 });
    const darkIronMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.75, roughness: 0.35 });
    const bladeEdgeMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.95, roughness: 0.1 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.15 });
    const leatherWrapMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.7 });
    const stoneHeadMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.85 });
    const bronzeMat = new THREE.MeshStandardMaterial({ color: 0xb45309, metalness: 0.8, roughness: 0.25 });

    const toolType = item.toolType || (item.type === 'tool' ? 'axe' : undefined);
    const itemName = (item.name || '').toLowerCase();
    const itemId = (item.id || '').toLowerCase();

    // -------------------------------------------------------------
    // 1. AUTHENTIC BEARDED WOODCUTTER'S AXE (Bartaxt)
    // -------------------------------------------------------------
    if (toolType === 'axe' || itemName.includes('axt') || itemName.includes('axe')) {
      this.currentEquippedToolType = 'axe';
      const isWood = itemId.includes('wood') || itemName.includes('holz');
      const isStone = itemId.includes('stone') || itemName.includes('stein');

      const axeGroup = new THREE.Group();

      // Ergonomic Curved Hardwood Shaft
      const shaftGeo = new THREE.CylinderGeometry(0.026, 0.034, 1.25, 12);
      const shaft = new THREE.Mesh(shaftGeo, isWood ? woodMat : darkWoodMat);
      shaft.position.y = 0.35;
      shaft.rotation.z = -0.04;
      shaft.castShadow = true;
      axeGroup.add(shaft);

      // Criss-Cross Leather Grip Wrapping on lower handle
      const gripWrap = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.42, 10), leatherWrapMat);
      gripWrap.position.set(-0.01, 0.14, 0);
      axeGroup.add(gripWrap);

      // Flared Butt-Hook Pommel at handle base
      const buttHook = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.028, 0.08, 10), darkWoodMat);
      buttHook.position.set(-0.015, -0.28, 0);
      axeGroup.add(buttHook);

      // Iron Socket / Eye wrapping around top of shaft
      const headMat = isWood ? stoneHeadMat : isStone ? stoneHeadMat : darkIronMat;
      const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.16, 12), headMat);
      socket.position.set(0.01, 0.82, 0);
      socket.castShadow = true;
      axeGroup.add(socket);

      // Wooden / Steel Wedge pinned into the top crown
      const wedge = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.04, 0.04), bronzeMat);
      wedge.position.set(0.01, 0.91, 0);
      axeGroup.add(wedge);

      // Rear Flat Hammer Poll (Nacken) for splitting logs
      const poll = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.12, 0.09), headMat);
      poll.position.set(-0.08, 0.82, 0);
      poll.castShadow = true;
      axeGroup.add(poll);

      // Authentic Bearded Axe Blade (curves down into a broad sharp cutting beard)
      // Main Blade Shoulder & Cheek
      const bladeBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.032), headMat);
      bladeBody.position.set(0.12, 0.76, 0);
      bladeBody.rotation.z = -0.18;
      bladeBody.castShadow = true;
      axeGroup.add(bladeBody);

      // Drooping Beard Cutout & Hook
      const beardDrop = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.28, 8), headMat);
      beardDrop.position.set(0.16, 0.64, 0);
      beardDrop.rotation.z = 1.35;
      axeGroup.add(beardDrop);

      // Honed Razor Bevel Cutting Edge (Polished Silver Steel)
      const edge = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.36, 0.016), isStone || isWood ? stoneHeadMat : bladeEdgeMat);
      edge.position.set(0.24, 0.74, 0);
      edge.rotation.z = -0.12;
      edge.castShadow = true;
      axeGroup.add(edge);

      // Reinforcement Rivets
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.012, 6, 6), bronzeMat);
      rivet.position.set(0.02, 0.78, 0.04);
      axeGroup.add(rivet);

      this.sword.add(axeGroup);

    // -------------------------------------------------------------
    // 2. AUTHENTIC MINER'S PICKAXE (Spitzhacke)
    // -------------------------------------------------------------
    } else if (toolType === 'pickaxe' || itemName.includes('spitzhacke') || itemName.includes('pickaxe')) {
      this.currentEquippedToolType = 'pickaxe';
      const pickGroup = new THREE.Group();

      // Hickory Shaft
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.032, 1.3, 10), woodMat);
      shaft.position.y = 0.35;
      shaft.castShadow = true;
      pickGroup.add(shaft);

      // Wrapped Grip
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.38, 8), leatherWrapMat);
      grip.position.y = 0.12;
      pickGroup.add(grip);

      // Iron Socket Collar with Langets running down handle
      const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.046, 0.22, 10), darkIronMat);
      collar.position.y = 0.85;
      pickGroup.add(collar);

      const langetL = new THREE.Mesh(new THREE.BoxGeometry(0.015, 0.24, 0.06), darkIronMat);
      langetL.position.set(0, 0.74, 0);
      pickGroup.add(langetL);

      // Arched Rock-Breaking Armor Piercing Pick Point (Forward curved pick)
      const pickGeo = new THREE.ConeGeometry(0.042, 0.46, 4);
      const pick = new THREE.Mesh(pickGeo, steelMat);
      pick.position.set(0.22, 0.82, 0);
      pick.rotation.z = -Math.PI / 2.3;
      pick.castShadow = true;
      pickGroup.add(pick);

      // Broad Horizontal Chisel / Mattock Adze Blade (Rear chisel edge)
      const adze = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.018, 0.1), steelMat);
      adze.position.set(-0.18, 0.84, 0);
      adze.rotation.z = 0.25;
      adze.castShadow = true;
      pickGroup.add(adze);

      this.sword.add(pickGroup);

    // -------------------------------------------------------------
    // 3. AUTHENTIC D-GRIP SPADE / SHOVEL (Schaufel)
    // -------------------------------------------------------------
    } else if (toolType === 'shovel' || itemName.includes('schaufel') || itemName.includes('shovel')) {
      this.currentEquippedToolType = 'shovel';
      const shovelGroup = new THREE.Group();

      // Ashwood Shaft
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 1.25, 10), woodMat);
      shaft.position.y = 0.35;
      shaft.castShadow = true;
      shovelGroup.add(shaft);

      // Classic Wooden D-Grip at handle top
      const dGripTorus = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.018, 8, 16, Math.PI), darkWoodMat);
      dGripTorus.position.set(0, -0.28, 0);
      dGripTorus.rotation.z = Math.PI;
      shovelGroup.add(dGripTorus);

      const dGripBar = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.12, 8), darkWoodMat);
      dGripBar.position.set(0, -0.32, 0);
      dGripBar.rotation.z = Math.PI / 2;
      shovelGroup.add(dGripBar);

      // Rolled Steel Socket Sleeve with Rivets
      const socket = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.2, 10), darkIronMat);
      socket.position.y = 0.82;
      shovelGroup.add(socket);

      // Dished Curved Spade Blade with folded foot-steps
      const spadeBlade = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 0.035), steelMat);
      spadeBlade.position.set(0, 1.0, 0.02);
      spadeBlade.rotation.x = 0.12;
      spadeBlade.castShadow = true;
      shovelGroup.add(spadeBlade);

      // Triangular Pointed Cutting Tip
      const spadeTip = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.18, 3), steelMat);
      spadeTip.position.set(0, 1.22, 0.04);
      spadeTip.rotation.z = Math.PI;
      spadeTip.castShadow = true;
      shovelGroup.add(spadeTip);

      this.sword.add(shovelGroup);

    // -------------------------------------------------------------
    // 4. FORGED WAR HAMMER / MALLET (Bau- & Kriegshammer)
    // -------------------------------------------------------------
    } else if (toolType === 'hammer' || itemName.includes('hammer')) {
      this.currentEquippedToolType = 'hammer';
      const hammerGroup = new THREE.Group();

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.034, 1.2, 10), darkWoodMat);
      shaft.position.y = 0.35;
      shaft.castShadow = true;
      hammerGroup.add(shaft);

      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.35, 8), leatherWrapMat);
      grip.position.y = 0.15;
      hammerGroup.add(grip);

      // Octagonal Forged Steel Hammer Head
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.26, 8), darkIronMat);
      head.position.set(0.08, 0.82, 0);
      head.rotation.z = Math.PI / 2;
      head.castShadow = true;
      hammerGroup.add(head);

      // Rear Crow's Beak Armor-Piercing Spike
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.24, 4), steelMat);
      spike.position.set(-0.16, 0.82, 0);
      spike.rotation.z = Math.PI / 2;
      hammerGroup.add(spike);

      this.sword.add(hammerGroup);

    // -------------------------------------------------------------
    // 5. PRISMATIC GLOWING CRYSTAL BLADE (Kristallklinge)
    // -------------------------------------------------------------
    } else if (itemId.includes('crystal') || itemName.includes('kristall')) {
      this.currentEquippedToolType = 'sword';
      const crystalGroup = new THREE.Group();

      const crystalBladeMat = new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        emissive: 0x0284c7,
        emissiveIntensity: 2.2,
        roughness: 0.1,
        metalness: 0.3,
      });

      // Faceted Jagged Crystal Blade
      const blade = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.25, 0.035), crystalBladeMat);
      blade.position.y = 0.72;
      blade.castShadow = true;
      crystalGroup.add(blade);

      const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.28, 4), crystalBladeMat);
      bladeTip.position.y = 1.42;
      bladeTip.rotation.y = Math.PI / 4;
      crystalGroup.add(bladeTip);

      // Sharded Crossguard
      const guard = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.08), darkIronMat);
      guard.position.y = 0.1;
      crystalGroup.add(guard);

      // Glowing Crystal Shards on Guard
      const shardL = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), crystalBladeMat);
      shardL.position.set(-0.18, 0.14, 0);
      shardL.rotation.z = -0.4;
      crystalGroup.add(shardL);

      const shardR = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.14, 4), crystalBladeMat);
      shardR.position.set(0.18, 0.14, 0);
      shardR.rotation.z = 0.4;
      crystalGroup.add(shardR);

      // Grip & Crystal Pommel
      const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.03, 0.3, 8), leatherWrapMat);
      grip.position.y = -0.1;
      crystalGroup.add(grip);

      const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), crystalBladeMat);
      pommel.position.y = -0.28;
      crystalGroup.add(pommel);

      this.sword.add(crystalGroup);

    // -------------------------------------------------------------
    // 6. BURNING TORCH (Fackel)
    // -------------------------------------------------------------
    } else if (itemId.includes('torch') || itemName.includes('fackel')) {
      this.currentEquippedToolType = 'torch';
      const torchGroup = new THREE.Group();

      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 1.0, 8), woodMat);
      shaft.position.y = 0.32;
      shaft.castShadow = true;
      torchGroup.add(shaft);

      // Pitch-soaked linen cloth head bundle
      const bundle = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.22, 10), darkIronMat);
      bundle.position.y = 0.82;
      torchGroup.add(bundle);

      // Glowing animated fire flame
      const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7700 });
      const flameCoreMat = new THREE.MeshBasicMaterial({ color: 0xffea00 });

      const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 8), flameMat);
      flameOuter.position.y = 1.0;
      torchGroup.add(flameOuter);

      const flameCore = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.18, 6), flameCoreMat);
      flameCore.position.y = 0.98;
      torchGroup.add(flameCore);

      this.sword.add(torchGroup);

    // -------------------------------------------------------------
    // 7. COMPOSITE RECURVE BOW (Bogen)
    // -------------------------------------------------------------
    } else if (item.type === 'bow' || itemName.includes('bogen') || itemName.includes('bow')) {
      this.currentEquippedToolType = 'bow';
      const bowGroup = new THREE.Group();

      const bowCore = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.028, 8, 20, Math.PI * 0.85), darkWoodMat);
      bowCore.rotation.z = Math.PI * 0.58;
      bowCore.position.set(0, 0.3, 0);
      bowGroup.add(bowCore);

      // Bowstring
      const stringMat = new THREE.MeshBasicMaterial({ color: 0xf8fafc });
      const bowString = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.95, 4), stringMat);
      bowString.position.set(-0.24, 0.3, 0);
      bowGroup.add(bowString);

      this.sword.add(bowGroup);

    // -------------------------------------------------------------
    // 8. ICONIC MASTER SWORD OF RESURRECTION (Default)
    // -------------------------------------------------------------
    } else {
      this.currentEquippedToolType = 'sword';
      const masterBladeMat = new THREE.MeshStandardMaterial({
        color: 0xf1f5f9,
        metalness: 0.95,
        roughness: 0.12,
      });
      const masterHiltMat = new THREE.MeshStandardMaterial({
        color: 0x4338ca, // Royal Indigo / Winged Crossguard
        metalness: 0.5,
        roughness: 0.3,
      });
      const masterGripMat = new THREE.MeshStandardMaterial({
        color: 0x059669, // Forest Emerald Wrapped Hilt
        roughness: 0.55,
      });

      // Polished Silver Blade Body
      const bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.09, 1.25, 0.024), masterBladeMat);
      bladeMesh.position.y = 0.68;
      bladeMesh.castShadow = true;
      this.sword.add(bladeMesh);

      // Angled Diamond Blade Tip
      const bladeTip = new THREE.Mesh(new THREE.ConeGeometry(0.065, 0.22, 4), masterBladeMat);
      bladeTip.position.y = 1.38;
      bladeTip.rotation.y = Math.PI / 4;
      bladeTip.castShadow = true;
      this.sword.add(bladeTip);

      // Central Fuller / Blood Groove
      const fuller = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.9, 0.027), steelMat);
      fuller.position.y = 0.62;
      this.sword.add(fuller);

      // Gold Triforce Inscription on Blade Base
      const bladeTriforce = new THREE.Mesh(new THREE.ConeGeometry(0.032, 0.05, 3), goldMat);
      bladeTriforce.position.set(0, 0.16, 0.014);
      this.sword.add(bladeTriforce);

      // Winged Purple Crossguard
      const guardCenter = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.09, 0.09), masterHiltMat);
      guardCenter.position.y = 0.08;
      guardCenter.castShadow = true;
      this.sword.add(guardCenter);

      const wingLeft = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.065, 0.065), masterHiltMat);
      wingLeft.position.set(-0.15, 0.11, 0);
      wingLeft.rotation.z = 0.32;
      this.sword.add(wingLeft);

      const wingRight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.065, 0.065), masterHiltMat);
      wingRight.position.set(0.15, 0.11, 0);
      wingRight.rotation.z = -0.32;
      this.sword.add(wingRight);

      const guardGold = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.1), goldMat);
      guardGold.position.y = 0.08;
      this.sword.add(guardGold);

      // Emerald Green Grip
      const gripMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.034, 0.32, 8), masterGripMat);
      gripMesh.position.y = -0.12;
      this.sword.add(gripMesh);

      // Gold Wire Rings
      for (let w = -0.06; w >= -0.18; w -= 0.06) {
        const wireRing = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.007, 6, 12), goldMat);
        wireRing.rotation.x = Math.PI / 2;
        wireRing.position.y = w;
        this.sword.add(wireRing);
      }

      // Polished Gold Pommel
      const pommel = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), goldMat);
      pommel.position.y = -0.3;
      pommel.castShadow = true;
      this.sword.add(pommel);
    }
  }
}

