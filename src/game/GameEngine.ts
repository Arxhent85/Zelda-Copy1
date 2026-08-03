import * as THREE from 'three';
import { DamageText, GameSettings, GraphicsQuality, InventoryItem, PlayerStats, ShrineData } from '../types';
import { audioEngine } from './AudioEngine';
import { AvatarHero } from './Avatar';
import { BuildingSystem } from './BuildingSystem';
import { CameraControls } from './CameraControls';
import { CollectibleManager } from './Collectibles';
import { CraftingSystem } from './CraftingSystem';
import { EnemyManager } from './Enemies';
import { FoliageManager } from './Foliage';
import { MiningAndHarvestingSystem } from './MiningAndHarvestingSystem';
import { PhysicsEngine } from './PhysicsEngine';
import { SkyAndLightingManager } from './SkyAndLighting';
import { TerrainManager } from './Terrain';
import { TerrainDeformationManager } from './TerrainDeformation';
import { WaterManager } from './WaterShader';

export class GameEngine {
  public renderer: THREE.WebGLRenderer;
  public scene: THREE.Scene;
  public camera: THREE.PerspectiveCamera;

  public terrainManager: TerrainManager;
  public terrainDeformation: TerrainDeformationManager;
  public waterManager: WaterManager;
  public skyLighting: SkyAndLightingManager;
  public foliageManager: FoliageManager;
  public avatar: AvatarHero;
  public physics: PhysicsEngine;
  public cameraControls: CameraControls;
  public enemyManager: EnemyManager;
  public collectibleManager: CollectibleManager;
  public miningSystem: MiningAndHarvestingSystem;
  public buildingSystem: BuildingSystem;

  public isRunning = false;
  private animFrameId: number | null = null;
  private clock = new THREE.Clock();
  private lastStateUpdateTimer = 0;

  // Trail Particles (Footsteps / Water Wake)
  private footstepTimer = 0;
  private trailParticles: Array<{
    mesh: THREE.Mesh;
    life: number;
    maxLife: number;
    vel: THREE.Vector3;
  }> = [];
  private trailGroup = new THREE.Group();

  private spawnFootstepParticle(x: number, y: number, z: number, isWater: boolean) {
    const geo = new THREE.SphereGeometry(isWater ? 0.12 : 0.08, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: isWater ? 0xa5f3fc : 0xd1d5db,
      transparent: true,
      opacity: 0.7,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
    this.trailGroup.add(mesh);
    this.trailParticles.push({
      mesh,
      life: 0,
      maxLife: isWater ? 0.6 : 0.45,
      vel: new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        isWater ? Math.random() * 0.8 : Math.random() * 0.5,
        (Math.random() - 0.5) * 0.6
      ),
    });
  }

  private updateTrailParticles(delta: number) {
    for (let i = this.trailParticles.length - 1; i >= 0; i--) {
      const p = this.trailParticles[i];
      p.life += delta;
      const progress = p.life / p.maxLife;
      p.mesh.position.addScaledVector(p.vel, delta);
      p.mesh.scale.setScalar(1.0 - progress);
      (p.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1.0 - progress);

      if (progress >= 1.0) {
        this.trailGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.trailParticles.splice(i, 1);
      }
    }
  }

  // Player Stats State
  public stats: PlayerStats = {
    health: 12, // 3 Hearts (4 quarters per heart)
    maxHealth: 12,
    stamina: 100,
    maxStamina: 100,
    rupees: 45,
    arrows: 20,
    level: 1,
    xp: 0,
    maxXp: 100,
  };

  public inventory: InventoryItem[] = [
    {
      id: 'inv_master_sword',
      name: 'Master Sword',
      type: 'weapon',
      description: 'The blade that seals the darkness. High durability and attack.',
      icon: '🗡️',
      attackPower: 35,
      equipped: true,
      quantity: 1,
    },
    {
      id: 'inv_hylian_shield',
      name: 'Hylian Shield',
      type: 'shield',
      description: 'A sturdy hero shield bearing the Crest of Hyrule.',
      icon: '🛡️',
      defensePower: 25,
      equipped: true,
      quantity: 1,
    },
    {
      id: 'inv_paraglider',
      name: 'Paraglider',
      type: 'glider',
      description: 'Allows safe gliding across vast valleys and mountain winds.',
      icon: '🪂',
      equipped: true,
      quantity: 1,
    },
    {
      id: 'tool_axe_wood',
      name: 'Holzaxt',
      type: 'tool',
      toolType: 'axe',
      toolTier: 'wood',
      durability: 35,
      maxDurability: 35,
      miningSpeed: 2.0,
      description: 'Fällt Bäume im Wald für Eichenholz & Stöcke.',
      icon: '🪓',
      equipped: false,
      quantity: 1,
    },
    {
      id: 'tool_pickaxe_wood',
      name: 'Holzspitzhacke',
      type: 'tool',
      toolType: 'pickaxe',
      toolTier: 'wood',
      durability: 35,
      maxDurability: 35,
      miningSpeed: 2.0,
      description: 'Baut Gestein & Erzfelsen in den Bergen ab.',
      icon: '⛏️',
      equipped: false,
      quantity: 1,
    },
    {
      id: 'tool_shovel_wood',
      name: 'Holzschaufel',
      type: 'tool',
      toolType: 'shovel',
      toolTier: 'wood',
      durability: 30,
      maxDurability: 30,
      miningSpeed: 2.0,
      description: 'Gräbt Löcher, Gräben & schüttet Erde auf.',
      icon: '🧹',
      equipped: false,
      quantity: 1,
    },
    {
      id: 'mat_wood_starter',
      name: 'Eichenholz',
      type: 'material',
      description: 'Robustes Holz aus Hyrule-Wäldern. (Catan-Material: Holz)',
      icon: '🪵',
      quantity: 12,
    },
    {
      id: 'mat_clay_starter',
      name: 'Lehm',
      type: 'material',
      description: 'Formbarer Lehm aus Flussufern. (Catan-Material: Lehm)',
      icon: '🧱',
      quantity: 8,
    },
    {
      id: 'mat_wheat_starter',
      name: 'Getreide',
      type: 'material',
      description: 'Goldgelbes Weizengetreide aus den Wiesen. (Catan-Material: Getreide)',
      icon: '🌾',
      quantity: 6,
    },
    {
      id: 'mat_wool_starter',
      name: 'Wolle',
      type: 'material',
      description: 'Weiche Flachswolle aus Schafweiden. (Catan-Material: Wolle)',
      icon: '🐑',
      quantity: 6,
    },
    {
      id: 'mat_stone_starter',
      name: 'Eisenerz',
      type: 'material',
      description: 'Schweres Erz aus Bergfelsen. (Catan-Material: Erz)',
      icon: '🪨',
      quantity: 8,
    },
  ];

  public damageTexts: DamageText[] = [];

  // Callbacks to update React UI HUD
  public onStateUpdate?: () => void;
  public onToastMessage?: (msg: string) => void;

  constructor(canvas: HTMLCanvasElement, public settings: GameSettings) {
    // 1. WebGL Renderer with device pixel ratio scaling & antialiasing
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: settings.graphicsQuality !== 'low',
      powerPreference: 'high-performance',
    });

    const pixelRatio = settings.graphicsQuality === 'ultra' ? Math.min(window.devicePixelRatio, 2) : 1;
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.shadowMap.enabled = settings.shadowsEnabled;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // 2. Three.js Scene & Camera Setup
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, canvas.clientWidth / canvas.clientHeight, 0.1, 1000);

    // 3. Sub-system Instances
    this.terrainManager = new TerrainManager();
    this.waterManager = new WaterManager();
    this.skyLighting = new SkyAndLightingManager(this.scene);
    this.foliageManager = new FoliageManager(this.scene);
    this.avatar = new AvatarHero();
    this.physics = new PhysicsEngine();
    this.cameraControls = new CameraControls(this.camera);
    this.enemyManager = new EnemyManager(this.scene);
    this.collectibleManager = new CollectibleManager(this.scene);
    this.miningSystem = new MiningAndHarvestingSystem(this.scene);
    this.buildingSystem = new BuildingSystem(this.scene);

    this.initWorld();
    this.terrainDeformation = new TerrainDeformationManager(this.terrainManager);
  }

  private initWorld() {
    // Terrain & Water
    const terrainMesh = this.terrainManager.createTerrainMesh();
    this.scene.add(terrainMesh);

    const waterMesh = this.waterManager.createWaterMesh();
    this.scene.add(waterMesh);
    this.scene.add(this.waterManager.effectsGroup);

    // Lighting & Sky
    this.skyLighting.initLighting(this.settings.graphicsQuality);

    // Foliage & Details
    this.foliageManager.init(this.settings.graphicsQuality);

    // Avatar Hero & Particle Trail Group
    this.scene.add(this.avatar.mesh);
    this.scene.add(this.trailGroup);

    // Enemies & Collectibles
    this.enemyManager.spawnInitialEnemies();
    this.collectibleManager.initWorldObjects();

    // Register Static Obstacle Colliders (Trees, Rocks, Ruins, Shrines, Chests, Ore Nodes, Buildings)
    this.physics.staticObstacles = [
      ...this.foliageManager.obstacles,
      ...this.collectibleManager.getObstacles(),
      ...this.miningSystem.obstacles,
      ...this.buildingSystem.obstacles,
    ];

    // Clear grass underneath all built structures
    this.buildingSystem.onStructurePlaced = (pos, type) => {
      const radius = type === 'catan_city' ? 5.2 : type === 'catan_settlement' ? 4.2 : 2.5;
      this.foliageManager.removeGrassInRadius(pos.x, pos.z, radius);
    };

    for (const struct of this.buildingSystem.structures) {
      const p = struct.data.position;
      const radius = struct.data.type === 'catan_city' ? 5.2 : struct.data.type === 'catan_settlement' ? 4.2 : 2.5;
      this.foliageManager.removeGrassInRadius(p.x, p.z, radius);
    }
  }

  public resize(width: number, height: number) {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  public inputPollFn?: () => {
    moveX: number;
    moveZ: number;
    isSprint: boolean;
    isJump: boolean;
    isAttack: boolean;
    isDodge: boolean;
  };

  public start() {
    if (this.isRunning) return;
    this.isRunning = true;
    this.clock.start();

    // Start background music
    audioEngine.playMusic('day');

    const loop = () => {
      if (!this.isRunning) return;

      try {
        const delta = Math.min(0.05, this.clock.getDelta());
        const elapsedTime = this.clock.getElapsedTime();

        // Poll inputs and update physics in locked sync with requestAnimationFrame
        if (this.inputPollFn) {
          const input = this.inputPollFn();

          this.physics.update(
            delta,
            { x: input.moveX, z: input.moveZ },
            this.cameraControls.yaw,
            input.isSprint,
            input.isJump,
            input.isAttack,
            input.isDodge,
            false,
            this.stats,
            () => {
              if (this.onToastMessage) this.onToastMessage('Ausdauer verbraucht!');
            },
            this.cameraControls.pitch
          );

          if (input.isAttack && this.physics.attackCooldown <= 0.05) {
            this.performAttackOrHarvest();
          }
        }

        this.update(delta, elapsedTime);
        this.renderer.render(this.scene, this.camera);
      } catch (err) {
        console.warn('GameEngine frame loop recovered from error:', err);
      }

      this.animFrameId = requestAnimationFrame(loop);
    };

    loop();
  }

  public stop() {
    this.isRunning = false;
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }
  }

  public update(delta: number, elapsedTime: number) {
    // 0. Update Dynamic Enemy Colliders for Physics
    this.physics.dynamicObstacles = this.enemyManager.getObstacles();

    const horizSpeed = Math.sqrt(this.physics.velocity.x ** 2 + this.physics.velocity.z ** 2);

    // 1. Sky & Water update
    this.skyLighting.update(delta, this.physics.position);
    this.waterManager.update(
      elapsedTime,
      delta,
      this.physics.position,
      this.physics.isSwimming,
      horizSpeed > 0.5
    );
    this.foliageManager.update(elapsedTime, delta, this.physics.position);
    this.terrainManager.updateTime(elapsedTime);

    // Dynamic music transition based on time or nearby enemies
    const nearestEnemy = this.enemyManager.enemies.find((e) => e.state.targetDistance < 15.0 && e.state.state !== 'DEAD');
    if (nearestEnemy) {
      audioEngine.playMusic('combat');
    } else {
      const isNight = this.skyLighting.timeOfDay < 6.0 || this.skyLighting.timeOfDay > 18.0;
      audioEngine.playMusic(isNight ? 'night' : 'day');
    }

    // 2. Avatar Mesh Sync with Physics
    this.avatar.mesh.position.copy(this.physics.position);
    this.avatar.mesh.rotation.y = this.physics.rotation;

    // Avatar animation loop
    this.avatar.updateAnimation(delta, this.physics.actionState, horizSpeed);

    // 3. Camera Controls Update
    this.cameraControls.updateCamera(this.physics.position, delta);

    // 3.5. Movement Trail & Footstep Particles (Dust on land, Water Ripples in water)
    this.footstepTimer += delta;
    if (horizSpeed > 1.0 && this.footstepTimer >= (this.physics.isSwimming ? 0.22 : 0.32)) {
      this.footstepTimer = 0;
      this.spawnFootstepParticle(
        this.physics.position.x,
        this.physics.position.y + 0.05,
        this.physics.position.z,
        this.physics.isSwimming
      );
    }
    this.updateTrailParticles(delta);

    // 4. Enemy AI Update & Damage Handling
    this.enemyManager.updateAI(delta, this.physics.position, (damage) => {
      // Player received damage from enemy contact
      if (this.physics.invulnerableTimer > 0) return;
      this.physics.invulnerableTimer = 1.0; // 1 second invulnerability
      this.stats.health = Math.max(0, this.stats.health - Math.round(damage / 2));
      const heartLoss = Math.max(0.5, Number((damage / 20).toFixed(1)));
      this.addDamageText(`-${heartLoss} ♥`, new THREE.Vector3(this.physics.position.x, this.physics.position.y + 1.8, this.physics.position.z), '#ef4444');
      audioEngine.playHitImpact();

      // Knockback player away from enemy
      if (nearestEnemy) {
        const kx = this.physics.position.x - nearestEnemy.state.position.x;
        const kz = this.physics.position.z - nearestEnemy.state.position.z;
        const dist = Math.hypot(kx, kz) || 1;
        this.physics.velocity.x += (kx / dist) * 12.0;
        this.physics.velocity.z += (kz / dist) * 12.0;
        this.physics.velocity.y = 5.0;
      }

      if (this.onStateUpdate) this.onStateUpdate();
    });

    // 4.5. Super Mario 64 Jump Stomp Check!
    if (!this.physics.isGrounded && this.physics.velocity.y < 3.0) {
      for (const item of this.enemyManager.enemies) {
        if (item.state.state === 'DEAD' || item.state.isSquished) continue;
        const ePos = item.state.position;
        const dx = this.physics.position.x - ePos.x;
        const dz = this.physics.position.z - ePos.z;
        const distHoriz = Math.hypot(dx, dz);
        const dy = this.physics.position.y - ePos.y;

        if (distHoriz < 1.35 && dy >= -0.2 && dy <= 2.2) {
          // 🍄 SUPER MARIO 64 STOMP BOUNCE!
          this.physics.velocity.y = 17.5; // High Mario jump bounce impulse!
          this.physics.hasDoubleJumped = false; // Reset double jump
          this.physics.isGliding = false;
          audioEngine.playShrineFanfare();

          // Squish animation trigger!
          item.state.isSquished = true;
          item.state.squishProgress = 0.0;

          this.stats.rupees += 20;
          this.collectibleManager.spawnRupee(ePos.x, ePos.z, 3);
          this.addDamageText('⭐ PLATT GESTAMPFT! +20 Rubine', new THREE.Vector3(ePos.x, ePos.y + 1.8, ePos.z), '#10b981');
          if (this.onStateUpdate) this.onStateUpdate();
          break;
        }
      }
    }

    // 5. Mining & Building Systems Update
    this.miningSystem.update(delta);
    if (this.buildingSystem.isBuildModeActive) {
      this.buildingSystem.updateHologram(this.physics.position, this.physics.rotation);
    }

    // 7. Collectibles Update (Rupee magnetically collected)
    this.collectibleManager.update(elapsedTime, this.physics.position, (rupeeVal) => {
      this.stats.rupees += rupeeVal;
      if (this.onStateUpdate) this.onStateUpdate();
    });

    // 8. Update Floating Damage Texts
    for (let i = this.damageTexts.length - 1; i >= 0; i--) {
      const dt = this.damageTexts[i];
      dt.life -= delta * 1.5;
      dt.position.y += delta * 1.2;
      if (dt.life <= 0) {
        this.damageTexts.splice(i, 1);
      }
    }

    // Throttle React state sync to 10Hz to eliminate DOM thrashing & crashes
    this.lastStateUpdateTimer += delta;
    if (this.lastStateUpdateTimer >= 0.1) {
      this.lastStateUpdateTimer = 0;
      if (this.onStateUpdate) this.onStateUpdate();
    }
  }

  /**
   * Action: Attack enemies or Chop/Mine trees and resource nodes
   */
  public performAttackOrHarvest(): string {
    // Trigger swing animation & sound
    this.physics.actionState = 'ATTACK_LIGHT';
    this.physics.attackCooldown = 0.42;
    audioEngine.playSwordSlash();

    const equippedTool =
      this.inventory.find((i) => i.equipped && (i.type === 'tool' || i.type === 'weapon')) ||
      this.inventory.find((i) => i.equipped);

    const playerPos = this.physics.position;
    const playerRot = this.physics.rotation;

    let hitAny = false;
    let enemyHitMsg = '';

    // Check if player is looking down at the ground
    const isLookingDown = this.cameraControls.pitch < -0.3;
    const isShovel = equippedTool?.toolType === 'shovel';

    if (isLookingDown || isShovel) {
      const frontX = playerPos.x + Math.sin(playerRot) * 2.0;
      const frontZ = playerPos.z + Math.cos(playerRot) * 2.0;

      // Dig a crater / hole in the terrain!
      this.terrainDeformation.deformTerrain(frontX, frontZ, -0.85, 2.6);
      hitAny = true;

      const earth = this.inventory.find((i) => i.name === 'Erde');
      if (earth) {
        earth.quantity += 1;
      } else {
        this.inventory.push({
          id: 'mat_dirt',
          name: 'Erde',
          type: 'material',
          description: 'Aus dem Boden gegrabene Erde.',
          icon: '🟤',
          quantity: 1,
        });
      }
      enemyHitMsg = '🕳️ Loch in den Boden gegraben! (+1 Erde)';
    }

    // 1. Check Enemies in front of Link
    const frontPos = playerPos.clone().add(
      new THREE.Vector3(Math.sin(playerRot) * 2.2, 0, Math.cos(playerRot) * 2.2)
    );

    this.enemyManager.enemies.forEach((enemy) => {
      if (enemy.state.state === 'DEAD') return;
      const ePos = new THREE.Vector3(enemy.state.position.x, enemy.state.position.y, enemy.state.position.z);
      const distFromRay = ePos.distanceTo(frontPos);
      const distFromPlayer = ePos.distanceTo(playerPos);

      if (distFromRay < 3.2 || distFromPlayer < 2.8) {
        hitAny = true;
        const baseDmg = equippedTool?.attackPower || 16;
        const dmg = baseDmg + Math.floor(Math.random() * 8);
        enemy.state.health -= dmg;
        audioEngine.playHitImpact();

        this.addDamageText(`-${dmg}`, ePos, '#f59e0b', true);

        if (enemy.state.health <= 0) {
          enemy.state.state = 'DEAD';
          // Enemy handles fall-over collapse animation inside EnemyManager.updateAI

          // Reward XP & Rupees
          this.stats.xp += 35;
          this.stats.rupees += 20;
          enemyHitMsg = `💥 ${enemy.state.name} besiegt! (+20 Rubine)`;
          if (this.onToastMessage) this.onToastMessage(enemyHitMsg);

          // Drop rupees
          this.collectibleManager.spawnRupee(ePos.x, ePos.y + 0.5, ePos.z, 25);
        } else {
          enemyHitMsg = `⚔️ ${enemy.state.name} getroffen! (${enemy.state.health}/${enemy.state.maxHealth} HP)`;
        }
      }
    });

    // 2. Check Harvestable Nodes (Trees, Ore, Rocks)
    const nodeRes = this.miningSystem.hitHarvestableNode(playerPos, playerRot, equippedTool);
    if (nodeRes.hit) {
      hitAny = true;
      if (nodeRes.itemYielded) {
        const existing = this.inventory.find((i) => i.name === nodeRes.itemYielded!.name);
        if (existing) {
          existing.quantity += nodeRes.itemYielded.qty;
        } else {
          this.inventory.push({
            id: `item_${nodeRes.itemYielded.name.toLowerCase()}`,
            name: nodeRes.itemYielded.name,
            type: 'material',
            description: `Gefundenes Material.`,
            icon: nodeRes.itemYielded.name.includes('holz') ? '🪵' : nodeRes.itemYielded.name.includes('Eisenerz') ? '🔩' : nodeRes.itemYielded.name.includes('Kristall') ? '💎' : '🪨',
            quantity: nodeRes.itemYielded.qty,
          });
        }

        if (nodeRes.itemYielded.name === 'Eichenholz') {
          const sticks = this.inventory.find((i) => i.name === 'Stock');
          if (sticks) {
            sticks.quantity += 2;
          } else {
            this.inventory.push({
              id: 'mat_stick',
              name: 'Stock',
              type: 'material',
              description: 'Dünner Holzstock für Werkzeuge & Fackeln.',
              icon: '🥢',
              quantity: 2,
            });
          }
        }
      }

      // Re-aggregate obstacle colliders after node destroyed/felled
      this.physics.staticObstacles = [
        ...this.foliageManager.obstacles,
        ...this.collectibleManager.getObstacles(),
        ...this.miningSystem.obstacles,
        ...this.buildingSystem.obstacles,
      ];
    }

    const finalMsg = enemyHitMsg || nodeRes.message || (hitAny ? 'Treffer!' : 'Schlag ins Leere');
    if (finalMsg && this.onToastMessage) {
      this.onToastMessage(finalMsg);
    }
    return finalMsg;
  }

  /**
   * Action: Mine resource node or Dig terrain with equipped tool
   */
  public mineOrHarvest(): string {
    const equippedTool = this.inventory.find((i) => i.equipped && i.type === 'tool') || this.inventory.find((i) => i.equipped);

    // Shovel Digging Action (modifies terrain permanently)
    if (equippedTool?.toolType === 'shovel') {
      const frontX = this.physics.position.x + Math.sin(this.physics.rotation) * 2.2;
      const frontZ = this.physics.position.z + Math.cos(this.physics.rotation) * 2.2;

      // Dig pit (-0.6m depth)
      const success = this.terrainDeformation.deformTerrain(frontX, frontZ, -0.6, 2.2);

      // Decrement durability
      if (equippedTool.durability !== undefined) {
        equippedTool.durability = Math.max(0, equippedTool.durability - 1);
      }

      // Add dirt/clay item to inventory
      const existing = this.inventory.find((i) => i.name === 'Erde');
      if (existing) {
        existing.quantity += 2;
      } else {
        this.inventory.push({
          id: 'mat_dirt',
          name: 'Erde',
          type: 'material',
          description: 'Nahrhafter Boden für Bauten & Beete.',
          icon: '🟤',
          quantity: 2,
        });
      }

      audioEngine.playHitImpact();
      return 'Erde gegraben! (+2 Erde)';
    }

    return this.performAttackOrHarvest();
  }

  /**
   * Equip or unequip an item from inventory
   */
  public equipItem(id: string): string {
    const target = this.inventory.find((i) => i.id === id);
    if (!target) return 'Gegenstand nicht gefunden!';

    const isEquipping = !target.equipped;

    if (isEquipping) {
      // Un-equip other tools and weapons so Link only holds the newly selected tool/weapon
      if (target.type === 'tool' || target.type === 'weapon') {
        this.inventory
          .filter((i) => i.type === 'tool' || i.type === 'weapon')
          .forEach((i) => (i.equipped = false));
      }
    }

    target.equipped = isEquipping;

    // Find active tool or weapon to render on Hero
    const activeItem =
      this.inventory.find((i) => i.equipped && (i.type === 'tool' || i.type === 'weapon')) ||
      this.inventory.find((i) => i.equipped);

    this.avatar.updateHeldToolOrWeapon(activeItem);

    const status = isEquipping ? `${target.name} ausgerüstet!` : `${target.name} abgelegt.`;
    return `${target.icon || '⚔️'} ${status}`;
  }

  /**
   * Toggle Build Mode / Select Building Structure to place
   */
  public selectBuildingType(buildingType: string | null) {
    this.buildingSystem.setPreviewStructure(buildingType);
  }

  public rotateBuildingPreview() {
    this.buildingSystem.rotatePreview();
  }

  /**
   * Confirm placing active building hologram
   */
  public placeBuilding(): string {
    const res = this.buildingSystem.placeStructure(this.physics.position, this.physics.rotation);

    if (res.success) {
      // Refresh obstacles
      this.physics.staticObstacles = [
        ...this.foliageManager.obstacles,
        ...this.collectibleManager.getObstacles(),
        ...this.miningSystem.obstacles,
        ...this.buildingSystem.obstacles,
      ];
    }

    return res.message;
  }

  /**
   * Craft an item recipe
   */
  public craftItem(recipeId: string): string {
    const recipe = CraftingSystem.RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return 'Rezept nicht gefunden!';

    const isNearWorkbench = this.buildingSystem.isNearWorkbench(this.physics.position);
    const result = CraftingSystem.craftRecipe(recipe, this.inventory, isNearWorkbench);

    if (result.success) {
      audioEngine.playShrineFanfare();
    }

    return result.message;
  }

  public addDamageText(text: string, pos: THREE.Vector3, color: string, critical: boolean = false) {
    if (this.damageTexts.length > 12) {
      this.damageTexts.shift();
    }
    this.damageTexts.push({
      id: `dt_${Math.random()}`,
      text,
      position: { x: pos.x, y: pos.y + 1.5, z: pos.z },
      color,
      life: 1.0,
      critical,
    });
  }

  public fastTravelToShrine(shrineId: string) {
    const shrine = this.collectibleManager.shrinesData.find((s) => s.id === shrineId);
    if (shrine) {
      const y = TerrainManager.getTerrainHeight(shrine.position.x, shrine.position.z);
      this.physics.position.set(shrine.position.x, y + 0.5, shrine.position.z + 4);
      this.physics.velocity.set(0, 0, 0);
      audioEngine.playShrineFanfare();
      if (this.onToastMessage) this.onToastMessage(`Fast Traveled to ${shrine.name}`);
    }
  }

  public interactWithNearbyObject(): string | null {
    // Check nearby Shrines or Chests
    const playerPos = this.physics.position;

    for (const obj of this.collectibleManager.objects) {
      const { data, mesh } = obj;
      const dist = playerPos.distanceTo(mesh.position);

      if (dist < 4.0) {
        if (data.type === 'shrine' && !data.activated) {
          data.activated = true;
          audioEngine.playShrineFanfare();

          const sData = this.collectibleManager.shrinesData.find((s) => s.id === data.id);
          if (sData) {
            sData.activated = true;
            sData.fastTravelUnlocked = true;
          }
          return `Activated ${data.name}! Fast Travel point unlocked.`;
        }

        if (data.type === 'chest' && !data.opened) {
          data.opened = true;
          // Animate lid opening
          const lid = mesh.getObjectByName('ChestLid');
          if (lid) lid.rotation.x = -Math.PI / 2.2;
          audioEngine.playRupeeChime();

          if (data.loot) {
            this.inventory.push(data.loot);
            return `Opened Chest! Obtained ${data.loot.name}!`;
          }
        }
      }
    }

    return null;
  }
}
