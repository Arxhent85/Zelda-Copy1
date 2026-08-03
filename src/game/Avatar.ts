import * as THREE from 'three';
import { PlayerActionState } from '../types';

export class AvatarHero {
  public mesh: THREE.Group = new THREE.Group();

  // Body Parts & Joint Hierarchy
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

  constructor() {
    this.mesh.name = 'HeroAvatar';

    // Premium Color Palette
    const tunicMat = new THREE.MeshStandardMaterial({ color: 0x1da1f2, roughness: 0.45 }); // Champion's Blue
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffd1b3, roughness: 0.6 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0xf5ce42, roughness: 0.35 }); // Blonde Hair
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1b, roughness: 0.75 }); // Dark Leather
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x2b1a0e, roughness: 0.8 });
    const metalMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.15 });

    // Flowing Cape / Cloak Material (Royal Crimson with Gold Trim accent)
    const capeMat = new THREE.MeshStandardMaterial({
      color: 0x991b1b, // Rich Crimson Red
      roughness: 0.5,
      side: THREE.DoubleSide,
    });
    const capeTrimMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.3,
      side: THREE.DoubleSide,
    });

    const clothWingMat = new THREE.MeshStandardMaterial({ color: 0x2563eb, side: THREE.DoubleSide, roughness: 0.5 });

    // -------------------------------------------------------------
    // 1. Torso & Belt
    // -------------------------------------------------------------
    const torsoGeo = new THREE.BoxGeometry(0.65, 0.9, 0.38);
    this.torso = new THREE.Mesh(torsoGeo, tunicMat);
    this.torso.position.y = 1.35;
    this.torso.castShadow = true;
    this.torso.receiveShadow = true;
    this.mesh.add(this.torso);

    // Leather Belt & Chest Strap
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.42), leatherMat);
    belt.position.y = -0.32;
    this.torso.add(belt);

    const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.45), goldMat);
    buckle.position.set(0, -0.32, 0);
    this.torso.add(buckle);

    // Chest Cross-Strap
    const strap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.92, 0.4), leatherMat);
    strap.rotation.z = -0.35;
    this.torso.add(strap);

    // -------------------------------------------------------------
    // 2. Flowing Cloak / Cape (Verlet Cloth Mesh Physics)
    // -------------------------------------------------------------
    // Shoulder cowl/mantle
    const mantle = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.16, 0.48), capeMat);
    mantle.position.set(0, 0.4, -0.02);
    mantle.castShadow = true;
    this.torso.add(mantle);

    // Verlet Cloth Cape Mesh (14 cols x 20 rows grid)
    this.clothGeo = new THREE.PlaneGeometry(
      this.clothWidth,
      this.clothHeight,
      this.clothCols - 1,
      this.clothRows - 1
    );

    this.clothMesh = new THREE.Mesh(this.clothGeo, capeMat);
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
    // 3. Head & Hair Ponytail
    // -------------------------------------------------------------
    this.head = new THREE.Group();
    this.head.position.y = 0.68;
    this.torso.add(this.head);

    const headMesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.42, 0.42), skinMat);
    headMesh.castShadow = true;
    this.head.add(headMesh);

    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
    const leftEye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.02), eyeMat);
    leftEye.position.set(-0.1, 0.02, 0.22);
    const rightEye = leftEye.clone();
    rightEye.position.x = 0.1;
    this.head.add(leftEye);
    this.head.add(rightEye);

    // Hair Cap & Bangs
    const hairCap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.46), hairMat);
    hairCap.position.y = 0.16;
    this.head.add(hairCap);

    const hairBangs = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.15, 0.22), hairMat);
    hairBangs.position.set(0, 0.1, 0.16);
    this.head.add(hairBangs);

    // Ponytail (sways during running)
    this.hairPonytail = new THREE.Group();
    this.hairPonytail.position.set(0, 0.08, -0.24);
    this.head.add(this.hairPonytail);

    const ponytailMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.12, 0.45), hairMat);
    ponytailMesh.position.y = -0.2;
    ponytailMesh.rotation.x = -0.3;
    this.hairPonytail.add(ponytailMesh);

    // -------------------------------------------------------------
    // 4. Articulated Left Arm (Shoulder & Elbow)
    // -------------------------------------------------------------
    this.leftUpperArm = new THREE.Group();
    this.leftUpperArm.position.set(-0.42, 0.35, 0);
    this.torso.add(this.leftUpperArm);

    const lUpperArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.38), tunicMat);
    lUpperArmMesh.position.y = -0.19;
    lUpperArmMesh.castShadow = true;
    this.leftUpperArm.add(lUpperArmMesh);

    // Left Elbow Joint -> Lower Arm (Forearm)
    this.leftLowerArm = new THREE.Group();
    this.leftLowerArm.position.set(0, -0.38, 0);
    this.leftUpperArm.add(this.leftLowerArm);

    const lLowerArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.38), skinMat);
    lLowerArmMesh.position.y = -0.19;
    lLowerArmMesh.castShadow = true;
    this.leftLowerArm.add(lLowerArmMesh);

    // Left Hand
    const lHand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), skinMat);
    lHand.position.y = -0.38;
    this.leftLowerArm.add(lHand);

    // -------------------------------------------------------------
    // 5. Articulated Right Arm (Shoulder & Elbow)
    // -------------------------------------------------------------
    this.rightUpperArm = new THREE.Group();
    this.rightUpperArm.position.set(0.42, 0.35, 0);
    this.torso.add(this.rightUpperArm);

    const rUpperArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.08, 0.38), tunicMat);
    rUpperArmMesh.position.y = -0.19;
    rUpperArmMesh.castShadow = true;
    this.rightUpperArm.add(rUpperArmMesh);

    // Right Elbow Joint -> Lower Arm (Forearm)
    this.rightLowerArm = new THREE.Group();
    this.rightLowerArm.position.set(0, -0.38, 0);
    this.rightUpperArm.add(this.rightLowerArm);

    const rLowerArmMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.07, 0.38), skinMat);
    rLowerArmMesh.position.y = -0.19;
    rLowerArmMesh.castShadow = true;
    this.rightLowerArm.add(rLowerArmMesh);

    // Right Hand
    const rHand = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 8), skinMat);
    rHand.position.y = -0.38;
    this.rightLowerArm.add(rHand);

    // -------------------------------------------------------------
    // 6. Articulated Left Leg (Hip & Knee)
    // -------------------------------------------------------------
    this.leftUpperLeg = new THREE.Group();
    this.leftUpperLeg.position.set(-0.2, -0.45, 0);
    this.torso.add(this.leftUpperLeg);

    const lThighMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.42), leatherMat);
    lThighMesh.position.y = -0.21;
    lThighMesh.castShadow = true;
    this.leftUpperLeg.add(lThighMesh);

    // Left Knee Joint -> Lower Leg (Shin/Calf)
    this.leftLowerLeg = new THREE.Group();
    this.leftLowerLeg.position.set(0, -0.42, 0);
    this.leftUpperLeg.add(this.leftLowerLeg);

    const lShinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.42), bootMat);
    lShinMesh.position.y = -0.21;
    lShinMesh.castShadow = true;
    this.leftLowerLeg.add(lShinMesh);

    // Left Boot Foot
    const lFoot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.26), bootMat);
    lFoot.position.set(0, -0.42, 0.06);
    this.leftLowerLeg.add(lFoot);

    // -------------------------------------------------------------
    // 7. Articulated Right Leg (Hip & Knee)
    // -------------------------------------------------------------
    this.rightUpperLeg = new THREE.Group();
    this.rightUpperLeg.position.set(0.2, -0.45, 0);
    this.torso.add(this.rightUpperLeg);

    const rThighMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.42), leatherMat);
    rThighMesh.position.y = -0.21;
    rThighMesh.castShadow = true;
    this.rightUpperLeg.add(rThighMesh);

    // Right Knee Joint -> Lower Leg (Shin/Calf)
    this.rightLowerLeg = new THREE.Group();
    this.rightLowerLeg.position.set(0, -0.42, 0);
    this.rightUpperLeg.add(this.rightLowerLeg);

    const rShinMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.08, 0.42), bootMat);
    rShinMesh.position.y = -0.21;
    rShinMesh.castShadow = true;
    this.rightLowerLeg.add(rShinMesh);

    // Right Boot Foot
    const rFoot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.26), bootMat);
    rFoot.position.set(0, -0.42, 0.06);
    this.rightLowerLeg.add(rFoot);

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

    // Hylian Shield archetype
    this.shield = new THREE.Group();
    const shieldShape = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.68, 0.06), goldMat);
    shieldShape.castShadow = true;
    this.shield.add(shieldShape);
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
  }

  /**
   * Procedural Kinematic Animation Loop with Knees, Elbows, and Dynamic Cape Flow
   */
  public updateAnimation(delta: number, action: PlayerActionState, speed: number) {
    const isMoving = speed > 0.1;
    this.animTime += delta * (isMoving ? Math.max(speed * 0.7, 5.0) : 3.0);
    this.currentAction = action;

    const t = this.animTime;

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
        // Vertical step bounce
        this.torso.position.y = 1.35 + Math.abs(Math.sin(t * 2)) * (0.06 + strideAmp * 0.04);
        // Forward inclination when sprinting
        this.torso.rotation.x = isSprint ? 0.22 : 0.08;
        // Subtle torso hip swivel
        this.torso.rotation.y = Math.sin(t) * 0.08;

        // Head keeps level & counter-swivels
        this.head.rotation.y = -Math.sin(t) * 0.05;
        this.hairPonytail.rotation.x = 0.3 + Math.abs(Math.sin(t * 2)) * 0.3;
        break;
      }

      case 'GLIDE': {
        this.paraglider.visible = true;
        // Paraglider overhead grip
        this.leftUpperArm.rotation.set(Math.PI - 0.2, 0, -0.2);
        this.leftLowerArm.rotation.set(-0.3, 0, 0);
        this.rightUpperArm.rotation.set(Math.PI - 0.2, 0, 0.2);
        this.rightLowerArm.rotation.set(-0.3, 0, 0);

        // Legs hang freely with slight natural human knee bend backward
        this.leftUpperLeg.rotation.x = 0.2;
        this.leftLowerLeg.rotation.x = 0.25;
        this.rightUpperLeg.rotation.x = 0.25;
        this.rightLowerLeg.rotation.x = 0.2;

        this.torso.rotation.x = 0.35; // Lean forward in wind
        this.paraglider.rotation.z = Math.sin(t * 0.6) * 0.08;
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
        // Upper Body Sword Slash
        const slashProgress = (Math.sin(t * 5.0) + 1.0) * 0.5;
        this.rightUpperArm.rotation.set(Math.PI / 2.2, -Math.PI / 3 + slashProgress * Math.PI * 0.9, 0);
        this.rightLowerArm.rotation.set(-0.1, 0, 0);
        this.torso.rotation.y = -Math.PI / 4 + slashProgress * Math.PI * 0.7;

        // If simultaneously moving while attacking, blend running leg gait!
        if (isMoving) {
          const gait = Math.sin(t);
          const strideAmp = 0.8;
          this.leftUpperLeg.rotation.x = gait * strideAmp;
          if (gait < 0) {
            this.leftLowerLeg.rotation.x = Math.sin(-gait * Math.PI) * 0.8;
          } else {
            this.leftLowerLeg.rotation.x = 0.02;
          }
          this.rightUpperLeg.rotation.x = -gait * strideAmp;
          if (gait > 0) {
            this.rightLowerLeg.rotation.x = Math.sin(gait * Math.PI) * 0.8;
          } else {
            this.rightLowerLeg.rotation.x = 0.02;
          }
          this.torso.position.y = 1.35 + Math.abs(Math.sin(t * 2)) * 0.05;
        } else {
          this.leftUpperLeg.rotation.x = 0.3;
          this.leftLowerLeg.rotation.x = 0.3;
          this.rightUpperLeg.rotation.x = -0.2;
          this.rightLowerLeg.rotation.x = 0.1;
        }
        break;
      }

      case 'DODGE': {
        // Spin Roll
        this.torso.rotation.x = t * 7.0;
        this.leftUpperLeg.rotation.x = 0.8;
        this.leftLowerLeg.rotation.x = 0.9;
        this.rightUpperLeg.rotation.x = 0.8;
        this.rightLowerLeg.rotation.x = 0.9;
        break;
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
        // Gentle Breathing & Soft Stance
        const breath = Math.sin(t * 0.8);
        this.torso.position.y = 1.35 + breath * 0.025;
        this.leftUpperArm.rotation.z = -0.06 + breath * 0.02;
        this.leftLowerArm.rotation.x = -0.2;
        this.rightUpperArm.rotation.z = 0.06 - breath * 0.02;
        this.rightLowerArm.rotation.x = -0.2;

        this.leftUpperLeg.rotation.z = -0.05;
        this.rightUpperLeg.rotation.z = 0.05;
        this.leftLowerLeg.rotation.x = 0.05;
        this.rightLowerLeg.rotation.x = 0.05;
        break;
      }
    }
  }

  /**
   * Dynamically rebuild the 3D mesh model held in the hero's right hand based on equipped item
   */
  public updateHeldToolOrWeapon(item?: any) {
    if (!this.sword) return;

    // Remove all previous child meshes from right hand
    while (this.sword.children.length > 0) {
      this.sword.remove(this.sword.children[0]);
    }

    if (!item) return; // Un-equipped / empty hand

    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c3d1e, roughness: 0.8 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, metalness: 0.85, roughness: 0.2 });
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, metalness: 0.9, roughness: 0.15 });
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x4a2e1b, roughness: 0.75 });

    const toolType = item.toolType || (item.type === 'tool' ? 'axe' : undefined);

    if (toolType === 'axe') {
      // --- LUMBERJACK AXE ---
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 1.25), woodMat);
      handle.position.y = 0.35;
      handle.castShadow = true;
      this.sword.add(handle);

      // Iron Axe Socket
      const socket = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.18, 0.12), steelMat);
      socket.position.y = 0.82;
      this.sword.add(socket);

      // Curved Axe Blade (Left Side)
      const bladeGeo = new THREE.ConeGeometry(0.26, 0.42, 4);
      const bladeLeft = new THREE.Mesh(bladeGeo, steelMat);
      bladeLeft.rotation.z = -Math.PI / 2;
      bladeLeft.position.set(0.18, 0.82, 0);
      bladeLeft.castShadow = true;
      this.sword.add(bladeLeft);

      // Rear Axe Spike (Right Side)
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.22, 4), steelMat);
      spike.rotation.z = Math.PI / 2;
      spike.position.set(-0.14, 0.82, 0);
      this.sword.add(spike);
    } else if (toolType === 'pickaxe') {
      // --- MINING PICKAXE ---
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.038, 1.25), woodMat);
      handle.position.y = 0.35;
      handle.castShadow = true;
      this.sword.add(handle);

      // Double Pick Head
      const pickHeadGroup = new THREE.Group();
      pickHeadGroup.position.y = 0.85;

      const leftPick = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.48, 5), steelMat);
      leftPick.rotation.z = -Math.PI / 2.2;
      leftPick.position.x = 0.22;
      pickHeadGroup.add(leftPick);

      const rightPick = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.48, 5), steelMat);
      rightPick.rotation.z = Math.PI / 2.2;
      rightPick.position.x = -0.22;
      pickHeadGroup.add(rightPick);

      this.sword.add(pickHeadGroup);
    } else if (toolType === 'shovel') {
      // --- DIGGING SHOVEL ---
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.3), woodMat);
      shaft.position.y = 0.38;
      shaft.castShadow = true;
      this.sword.add(shaft);

      // Spade Head
      const spade = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.36, 0.03), steelMat);
      spade.position.y = 0.88;
      spade.castShadow = true;
      this.sword.add(spade);
    } else if (toolType === 'hammer') {
      // --- WAR HAMMER / MALLET ---
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.2), woodMat);
      handle.position.y = 0.35;
      this.sword.add(handle);

      const mallet = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.24, 0.24), steelMat);
      mallet.position.y = 0.82;
      mallet.castShadow = true;
      this.sword.add(mallet);
    } else {
      // --- MASTER SWORD / BLADE WEAPON ---
      const bladeMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.2, 0.03), steelMat);
      bladeMesh.position.y = 0.6;
      bladeMesh.castShadow = true;
      this.sword.add(bladeMesh);

      const guardMesh = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.06, 0.08), goldMat);
      guardMesh.position.y = 0.05;
      this.sword.add(guardMesh);

      const hiltMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3), leatherMat);
      hiltMesh.position.y = -0.12;
      this.sword.add(hiltMesh);
    }
  }
}
