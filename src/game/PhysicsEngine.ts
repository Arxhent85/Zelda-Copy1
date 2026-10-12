import * as THREE from 'three';
import { ObstacleCollider, PlayerActionState, PlayerStats } from '../types';
import { TerrainManager } from './Terrain';
import { audioEngine } from './AudioEngine';

export class PhysicsEngine {
  public position: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public velocity: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
  public rotation = 0; // Y angle in radians

  public actionState: PlayerActionState = 'IDLE';
  public isGrounded = true;
  public isClimbing = false;
  public isGliding = false;
  public isFlying = false;
  public isSwimming = false;
  public isAscending = false;
  public isDescending = false;

  private jumpHoldTimer = 0;

  public attackCooldown = 0;
  public dodgeCooldown = 0;
  public invulnerableTimer = 0;

  public hasDoubleJumped = false;
  private wasJumpPressed = false;

  public staticObstacles: ObstacleCollider[] = [];
  public dynamicObstacles: ObstacleCollider[] = [];

  constructor() {
    // Initial Spawn point in Starter Basin
    const y = TerrainManager.getTerrainHeight(0, 0);
    this.position.set(0, y + 0.1, 0);
  }

  /**
   * Launch player into high soaring flight / paraglider mode
   */
  public triggerFlightBoost() {
    this.isGrounded = false;
    this.isSwimming = false;
    this.isClimbing = false;
    this.isFlying = true;
    this.isGliding = true;
    this.actionState = 'GLIDE';
    this.velocity.y = 24.0;
    this.hasDoubleJumped = true;
    audioEngine.playGliderOpen();
  }

  /**
   * Toggles flight mode on or off
   */
  public toggleFlight(): boolean {
    if (this.isFlying) {
      this.isFlying = false;
      this.isGliding = false;
      this.actionState = 'FALL';
      return false;
    } else {
      this.triggerFlightBoost();
      return true;
    }
  }

  /**
   * Resolves horizontal & vertical object collisions against rocks, trees, ruins, shrines, chests, and enemies.
   */
  private resolveObstacleCollisions(terrainY: number): number {
    const allObstacles = [...this.staticObstacles, ...this.dynamicObstacles];
    const playerRadius = 0.38; // Slender radius for natural navigation around & behind objects
    const playerHeight = 1.8;

    let effectiveGroundY = terrainY;

    // 1. Check for standing on top of obstacles
    for (const obs of allObstacles) {
      const dx = this.position.x - obs.x;
      const dz = this.position.z - obs.z;
      const distSq = dx * dx + dz * dz;
      const minDist = playerRadius + obs.radius;

      if (distSq < minDist * minDist) {
        const obsTop = obs.yBase + obs.height;
        // If player is at or near the top of the obstacle
        if (this.position.y >= obsTop - 0.35 && obsTop > effectiveGroundY) {
          effectiveGroundY = obsTop;
        }
      }
    }

    // 2. Horizontal push-out collision resolution (2 iterations for multiple close objects)
    for (let iter = 0; iter < 2; iter++) {
      for (const obs of allObstacles) {
        // Fast bounding box distance pre-check
        if (Math.abs(this.position.x - obs.x) > 12.0 || Math.abs(this.position.z - obs.z) > 12.0) {
          continue;
        }

        const obsTop = obs.yBase + obs.height;
        // Skip horizontal collision if player is standing safely on top
        if (this.position.y >= obsTop - 0.25) {
          continue;
        }
        // Skip if player is completely below obstacle base
        if (this.position.y + playerHeight <= obs.yBase) {
          continue;
        }

        const dx = this.position.x - obs.x;
        const dz = this.position.z - obs.z;
        const distSq = dx * dx + dz * dz;
        const minDist = playerRadius + obs.radius;

        if (distSq < minDist * minDist && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = minDist - dist;
          const nx = dx / dist;
          const nz = dz / dist;

          // Push player position outwards away from object
          this.position.x += nx * overlap;
          this.position.z += nz * overlap;

          // Slide along obstacle: cancel velocity component into obstacle
          const vDotN = this.velocity.x * nx + this.velocity.z * nz;
          if (vDotN < 0) {
            this.velocity.x -= vDotN * nx;
            this.velocity.z -= vDotN * nz;
          }
        }
      }
    }

    return effectiveGroundY;
  }

  public update(
    delta: number,
    moveDir: { x: number; z: number }, // Input normalized (-1 to 1)
    cameraYaw: number,
    isSprint: boolean,
    isJumpPressed: boolean,
    isAttackPressed: boolean,
    isDodgePressed: boolean,
    isBowAiming: boolean,
    stats: PlayerStats,
    onStaminaDepleted: () => void,
    cameraPitch: number = 0,
    isRoadSpeedBoost: boolean = false
  ) {
    this.attackCooldown = Math.max(0, this.attackCooldown - delta);
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - delta);
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - delta);

    const terrainY = TerrainManager.getTerrainHeight(this.position.x, this.position.z);
    const normal = TerrainManager.getTerrainNormal(this.position.x, this.position.z);
    const slope = 1.0 - normal.y; // 0 = flat ground, 1 = vertical wall

    const waterSurfaceY = TerrainManager.WATER_LEVEL;
    const waterDepthAtPos = Math.max(0, waterSurfaceY - terrainY);
    const surfaceSwimY = waterSurfaceY - 0.75; // Sinks character waist-deep so torso is submerged in water

    // Automatic shore exit check: if water depth is shallow (<0.7m), or terrain rises up near water surface
    const isAtShoreline = waterDepthAtPos < 0.7 || terrainY >= waterSurfaceY - 0.25;

    // Swimming trigger: water depth > 0.7m and not already on dry shore
    if (waterDepthAtPos > 0.7 && !isAtShoreline && this.position.y <= waterSurfaceY + 0.35) {
      this.isSwimming = true;
      this.actionState = 'SWIMMING';
      this.isGrounded = false;
      this.isFlying = false;
      this.isGliding = false;
      this.isClimbing = false;
    } else {
      if (this.isSwimming && isAtShoreline) {
        // Step out onto shoreline / dry land seamlessly!
        this.position.y = terrainY + 0.1;
        this.velocity.y = 0;
        this.isGrounded = true;
      }
      this.isSwimming = false;
    }

    // 1. Attack Trigger
    if (isAttackPressed && this.attackCooldown <= 0 && !this.isClimbing && !this.isGliding && !this.isSwimming) {
      this.actionState = 'ATTACK_LIGHT';
      this.attackCooldown = 0.45;
      audioEngine.playSwordSlash();
    }

    // 2. Dodge Roll
    if (isDodgePressed && this.dodgeCooldown <= 0 && this.isGrounded && stats.stamina > 15) {
      this.actionState = 'DODGE';
      this.dodgeCooldown = 0.8;
      this.invulnerableTimer = 0.4;
      stats.stamina = Math.max(0, stats.stamina - 15);
      // Impulse forward
      const dodgeDir = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
      this.velocity.add(dodgeDir.multiplyScalar(20.0));
    }

    // Reset double jump on ground landing
    if (this.isGrounded) {
      this.hasDoubleJumped = false;
    }

    const justPressedJump = isJumpPressed && !this.wasJumpPressed;

    // 3. Jump, Double Jump, Flight, Diving & Surfacing Logic
    if (this.isSwimming) {
      // SWIMMING WATER CONTROLS (Diving, Surfacing & Leaping out into the air/flight!)
      if (justPressedJump) {
        // 🐬 DELPHIN-SPRUNG AUS DEM WASSER: Katapultiert Link kraftvoll in die Luft!
        this.velocity.y = 16.5; // High catapult upward out of water
        // Forward impulse along current swimming heading
        const swimDir = new THREE.Vector3(Math.sin(this.rotation), 0, Math.cos(this.rotation));
        this.velocity.add(swimDir.multiplyScalar(8.0));
        this.isSwimming = false;
        this.isGrounded = false;
        this.actionState = 'JUMP';
        this.hasDoubleJumped = false; // Allows immediate double-jump / glide activation!
        audioEngine.playWaterSplash();
      } else {
        const isDivingInput = isDodgePressed || (cameraPitch < -0.28 && Math.abs(moveDir.z) > 0.2);
        const isSurfacingInput = isJumpPressed || (cameraPitch > 0.28 && Math.abs(moveDir.z) > 0.2);

        if (isSurfacingInput) {
          // Swim upward / Surface (Auftauchen)
          this.velocity.y = 5.0;
          this.position.y = Math.min(surfaceSwimY + 0.3, this.position.y + delta * 5.0);
        } else if (isDivingInput) {
          // Swim downward / Dive (Abtauchen)
          this.velocity.y = -5.0;
          this.position.y = Math.max(terrainY + 0.35, this.position.y - delta * 5.0);
        } else {
          // Neutral buoyancy - settle at surfaceSwimY (submerged chest deep)
          if (this.position.y < surfaceSwimY - 0.08) {
            this.position.y = Math.min(surfaceSwimY, this.position.y + delta * 3.2);
            this.velocity.y = 0;
          } else if (this.position.y > surfaceSwimY + 0.08) {
            this.position.y = Math.max(surfaceSwimY, this.position.y - delta * 3.2);
            this.velocity.y = 0;
          } else {
            this.position.y = surfaceSwimY;
            this.velocity.y = 0;
          }
        }
      }
    } else if (this.isFlying || this.isGliding) {
      // 🪂 ACTIVE SOARING / PARAGLIDER FLIGHT MODE
      this.actionState = 'GLIDE';
      if (isJumpPressed || this.isAscending) {
        // Ascend (Steigen mit Windauftrieb)
        this.velocity.y = Math.min(26.0, this.velocity.y + delta * 42.0);
      } else if (isDodgePressed || this.isDescending) {
        // Descend (Sinken / Aerodynamischer Sturzflug)
        this.velocity.y = Math.max(-24.0, this.velocity.y - delta * 42.0);
      } else {
        // Gentle stable aerodynamic glide
        this.velocity.y = Math.max(-2.5, this.velocity.y * 0.95);
      }
    } else if (isJumpPressed) {
      this.jumpHoldTimer += delta;

      if (!this.isGrounded) {
        // MID-AIR: Double Jump & Flight Paraglider Mode
        if (justPressedJump && !this.hasDoubleJumped) {
          // 🚀 DOPPELSPRUNG (Double Jump Impulse)
          this.hasDoubleJumped = true;
          this.velocity.y = 16.5;
          this.isFlying = true;
          this.isGliding = true;
          this.actionState = 'GLIDE';
          audioEngine.playGliderOpen();
        } else {
          // 🪂 CONTINUOUS FLIGHT / PARAGLIDER
          this.isFlying = true;
          this.isGliding = true;
          this.actionState = 'GLIDE';
          this.velocity.y = Math.min(28.0, Math.max(this.velocity.y + delta * 60.0, 7.0));
        }
      } else if (this.isGrounded && !this.isClimbing && stats.stamina > 5) {
        // 🦘 NORMAL GROUND JUMP IMPULSE
        this.velocity.y = 15.0;
        this.isGrounded = false;
        this.hasDoubleJumped = false;
        stats.stamina = Math.max(0, stats.stamina - 6);
      } else if (slope > 0.6 && !this.isClimbing && stats.stamina > 15) {
        // Mount steep cliff for climbing
        this.isClimbing = true;
        this.isGliding = false;
        this.actionState = 'CLIMB';
      }
    } else {
      this.jumpHoldTimer = 0;
    }

    this.wasJumpPressed = isJumpPressed;

    // 4. Movement Physics Calculation
    const moveMagnitude = Math.sqrt(moveDir.x * moveDir.x + moveDir.z * moveDir.z);

    if (moveMagnitude > 0.05) {
      // Calculate movement vector relative to camera rotation
      const inputAngle = Math.atan2(moveDir.x, -moveDir.z);
      const targetRotation = cameraYaw + inputAngle;
      this.rotation = targetRotation;

      // Determine movement speed
      let speed = 11.0; // Base Walk speed
      if (this.isSwimming) {
        speed = isSprint ? 9.5 : 5.8; // Relaxed Swimming Speed
        if (isSprint && stats.stamina > 0) {
          stats.stamina = Math.max(0, stats.stamina - delta * 6.0);
        }
      } else if (this.isFlying) {
        speed = isSprint ? 36.0 : 26.0; // Supersonic Flight Speed!
      } else if (isSprint && stats.stamina > 0 && this.isGrounded) {
        speed = 22.0; // Sprint speed
        stats.stamina = Math.max(0, stats.stamina - delta * 18);
        if (this.attackCooldown <= 0) this.actionState = 'SPRINT';
      } else if (this.isGliding) {
        speed = 20.0; // Paraglider speed
        stats.stamina = Math.max(0, stats.stamina - delta * 12);
      } else if (this.isClimbing) {
        speed = 6.0; // Climb speed
        stats.stamina = Math.max(0, stats.stamina - delta * 22);
      } else if (this.isGrounded) {
        speed = moveMagnitude > 0.6 ? 16.0 : 11.0; // Run vs Walk
        if (this.attackCooldown <= 0) {
          this.actionState = moveMagnitude > 0.6 ? 'RUN' : 'WALK';
        }
      }

      // 🏎️ High-Speed Road & Circuit Bonus (+30% velocity on paved tracks & roads)
      if (this.isGrounded && isRoadSpeedBoost && !this.isSwimming && !this.isClimbing) {
        speed *= 1.30;
      }

      if (stats.stamina <= 0) {
        onStaminaDepleted();
        this.isGliding = false;
        this.isFlying = false;
        this.isClimbing = false;
      }

      const moveX = Math.sin(targetRotation) * speed;
      const moveZ = Math.cos(targetRotation) * speed;

      if (this.isClimbing) {
        // Climb vertically up cliff face
        this.velocity.y = speed * 0.8;
      } else {
        this.velocity.x = moveX;
        this.velocity.z = moveZ;
      }
    } else {
      // Friction / Deceleration
      this.velocity.x *= 0.82;
      this.velocity.z *= 0.82;
      if (this.isGrounded && this.attackCooldown <= 0 && this.actionState !== 'DODGE') {
        this.actionState = isBowAiming ? 'BOW_AIM' : 'IDLE';
      }
    }

    // Preserve actionState as FALL if mid-air and not gliding/climbing/attacking
    if (!this.isGrounded && !this.isGliding && !this.isClimbing && !this.isSwimming && this.attackCooldown <= 0) {
      this.actionState = 'FALL';
    }

    // 5. Gravity & Ground Collision
    if (this.isFlying) {
      // Gentle floating descent rate when not ascending
      if (!isJumpPressed) {
        this.velocity.y = Math.max(-1.5, this.velocity.y - delta * 3.0);
      }
    } else if (this.isGliding) {
      // Paraglider terminal fall limit
      this.velocity.y = Math.max(-2.5, this.velocity.y - delta * 5.0);
    } else if (!this.isGrounded && !this.isClimbing && !this.isSwimming) {
      // Snappy, punchy gravity when falling
      this.velocity.y -= delta * 52.0;
    }

    const wasGrounded = this.isGrounded;

    // Integrate Position
    this.position.x += this.velocity.x * delta;
    this.position.y += this.velocity.y * delta;
    this.position.z += this.velocity.z * delta;

    // Resolve Obstacle Collisions & Standing on top
    const effectiveGroundY = this.resolveObstacleCollisions(terrainY);

    // Ground Alignment & Downhill Slope Snap
    // If previously grounded, not jumping upward, and near ground (within 2.5m down)
    const verticalDistanceToGround = this.position.y - (effectiveGroundY + 0.1);
    const isMovingDown = this.velocity.y <= 0.05;

    if (
      (wasGrounded || verticalDistanceToGround <= 0.15) &&
      isMovingDown &&
      verticalDistanceToGround < 2.5 &&
      !this.isSwimming &&
      !this.isGliding &&
      !this.isFlying &&
      !this.isClimbing
    ) {
      // Smoothly snap to terrain or obstacle top downhill
      this.position.y = effectiveGroundY + 0.1;
      this.velocity.y = 0;
      this.isGrounded = true;
      this.isGliding = false;
      this.isFlying = false;
      this.isClimbing = false;
    } else if (this.position.y <= effectiveGroundY + 0.1 && !this.isSwimming) {
      this.position.y = effectiveGroundY + 0.1;
      this.velocity.y = 0;
      this.isGrounded = true;
      this.isGliding = false;
      this.isFlying = false;
      this.isClimbing = false;
    } else {
      this.isGrounded = false;
    }

    // Stamina Natural Regeneration when grounded & standing/walking
    if (this.isGrounded && !isSprint && stats.stamina < stats.maxStamina) {
      stats.stamina = Math.min(stats.maxStamina, stats.stamina + delta * 30);
    }
  }
}
