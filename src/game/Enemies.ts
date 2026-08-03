import * as THREE from 'three';
import { EnemyState, ObstacleCollider, Vector3D } from '../types';
import { TerrainManager } from './Terrain';
import { audioEngine } from './AudioEngine';

export class EnemyManager {
  public enemies: { state: EnemyState; mesh: THREE.Group }[] = [];
  public group: THREE.Group = new THREE.Group();

  constructor(private scene: THREE.Scene) {
    this.group.name = 'EnemiesGroup';
    this.scene.add(this.group);
  }

  /**
   * Spawn initial open world enemies across different biomes
   */
  public spawnInitialEnemies() {
    // 1. Boblin camps in plains
    const boblinPositions = [
      { x: 60, z: 80 },
      { x: 75, z: 95 },
      { x: -90, z: 120 },
      { x: -110, z: 60 },
      { x: 180, z: -40 },
    ];

    boblinPositions.forEach((pos, idx) => {
      this.createBoblin(`boblin_${idx}`, pos.x, pos.z);
    });

    // 2. Slimes near water shore and forest
    const slimePositions = [
      { x: 120, z: -120 },
      { x: 140, z: -100 },
      { x: -40, z: -140 },
    ];

    slimePositions.forEach((pos, idx) => {
      this.createSlime(`slime_${idx}`, pos.x, pos.z);
    });

    // 3. Super Mario 64 Goombas! (Kleine Gegner)
    const goombaPositions = [
      { x: 15, z: 25 },
      { x: -20, z: 35 },
      { x: 30, z: -15 },
      { x: -45, z: -30 },
      { x: 50, z: 60 },
      { x: -70, z: 80 },
    ];

    goombaPositions.forEach((pos, idx) => {
      this.createGoomba(`goomba_${idx}`, pos.x, pos.z);
    });

    // 4. Ancient Stone Guardian Boss at West Ruins
    this.createStoneGuardian('boss_guardian', -160, -80);
  }

  private createBoblin(id: string, x: number, z: number) {
    const y = TerrainManager.getTerrainHeight(x, z);
    const group = new THREE.Group();

    // Red/Brown Goblin Body
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.7 });
    const leatherMat = new THREE.MeshStandardMaterial({ color: 0x4a2e16 });
    const clubMat = new THREE.MeshStandardMaterial({ color: 0x5c3a21 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.5), bodyMat);
    torso.position.y = 1.0;
    torso.castShadow = true;
    group.add(torso);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35, 8, 8), bodyMat);
    head.position.y = 1.75;
    head.castShadow = true;
    group.add(head);

    // Goblin Ears
    const earGeo = new THREE.ConeGeometry(0.12, 0.35, 4);
    const earL = new THREE.Mesh(earGeo, bodyMat);
    earL.rotation.z = -Math.PI / 3;
    earL.position.set(-0.35, 1.8, 0);
    group.add(earL);

    const earR = new THREE.Mesh(earGeo, bodyMat);
    earR.rotation.z = Math.PI / 3;
    earR.position.set(0.35, 1.8, 0);
    group.add(earR);

    // Wooden Spiked Club weapon
    const club = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.05, 1.2), clubMat);
    club.position.set(0.5, 1.0, 0.3);
    club.rotation.x = Math.PI / 4;
    group.add(club);

    group.position.set(x, y, z);
    this.group.add(group);

    const state: EnemyState = {
      id,
      type: 'boblins',
      name: 'Bokoblin Warrior',
      position: { x, y, z },
      rotation: Math.random() * Math.PI * 2,
      health: 30,
      maxHealth: 30,
      level: 2,
      state: 'PATROL',
      targetDistance: 999,
      velocity: { x: 0, y: 0, z: 0 },
      attackCooldown: 0,
    };

    this.enemies.push({ state, mesh: group });
  }

  private createGoomba(id: string, x: number, z: number) {
    const y = TerrainManager.getTerrainHeight(x, z);
    const group = new THREE.Group();

    // Goomba Chestnut Brown Cap
    const capMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.6 });
    const stemMat = new THREE.MeshStandardMaterial({ color: 0xffedd5, roughness: 0.7 });
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const pupilMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
    const footMat = new THREE.MeshStandardMaterial({ color: 0x3e2723, roughness: 0.8 });

    // Chestnut Dome Head
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.55, 12, 12), capMat);
    head.position.y = 0.65;
    head.scale.set(1.1, 0.95, 1.0);
    head.castShadow = true;
    group.add(head);

    // Cream Stem Base
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 0.35, 10), stemMat);
    stem.position.y = 0.22;
    stem.castShadow = true;
    group.add(stem);

    // White Eyes
    const eyeGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.04, 8);
    eyeGeo.rotateX(Math.PI / 2);

    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.16, 0.68, 0.48);
    group.add(eyeL);

    const pupilL = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8), pupilMat);
    pupilL.rotation.x = Math.PI / 2;
    pupilL.position.set(-0.16, 0.68, 0.5);
    group.add(pupilL);

    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.16, 0.68, 0.48);
    group.add(eyeR);

    const pupilR = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.05, 8), pupilMat);
    pupilR.rotation.x = Math.PI / 2;
    pupilR.position.set(0.16, 0.68, 0.5);
    group.add(pupilR);

    // Angry Eyebrows
    const browGeo = new THREE.BoxGeometry(0.22, 0.04, 0.04);
    const browL = new THREE.Mesh(browGeo, pupilMat);
    browL.position.set(-0.16, 0.78, 0.48);
    browL.rotation.z = -0.25;
    group.add(browL);

    const browR = new THREE.Mesh(browGeo, pupilMat);
    browR.position.set(0.16, 0.78, 0.48);
    browR.rotation.z = 0.25;
    group.add(browR);

    // Tiny Fangs
    const fangGeo = new THREE.ConeGeometry(0.04, 0.1, 4);
    fangGeo.rotateX(Math.PI);
    const fangL = new THREE.Mesh(fangGeo, eyeMat);
    fangL.position.set(-0.1, 0.52, 0.5);
    group.add(fangL);

    const fangR = new THREE.Mesh(fangGeo, eyeMat);
    fangR.position.set(0.1, 0.52, 0.5);
    group.add(fangR);

    // Two Waddling Dark Feet
    const footGeo = new THREE.SphereGeometry(0.18, 8, 8);
    footGeo.scale(1.4, 0.6, 1.0);

    const footL = new THREE.Mesh(footGeo, footMat);
    footL.position.set(-0.25, 0.1, 0);
    footL.castShadow = true;
    group.add(footL);

    const footR = new THREE.Mesh(footGeo, footMat);
    footR.position.set(0.25, 0.1, 0);
    footR.castShadow = true;
    group.add(footR);

    group.position.set(x, y, z);
    this.group.add(group);

    const state: EnemyState = {
      id,
      type: 'goomba',
      name: 'Super Mario Gumba',
      position: { x, y, z },
      rotation: 0,
      health: 15,
      maxHealth: 15,
      level: 1,
      state: 'PATROL',
      targetDistance: 999,
      velocity: { x: 0, y: 0, z: 0 },
      attackCooldown: 0,
    };

    this.enemies.push({ state, mesh: group });
  }

  private createSlime(id: string, x: number, z: number) {
    const y = TerrainManager.getTerrainHeight(x, z);
    const group = new THREE.Group();

    // Translucent Blue Gel Slime
    const slimeMat = new THREE.MeshStandardMaterial({
      color: 0x00b4d8,
      transparent: true,
      opacity: 0.85,
      roughness: 0.2,
    });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.7, 12, 12), slimeMat);
    body.position.y = 0.6;
    body.scale.set(1.1, 0.85, 1.1);
    body.castShadow = true;
    group.add(body);

    // Cute glowing core
    const coreMat = new THREE.MeshBasicMaterial({ color: 0x90e0ef });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), coreMat);
    core.position.y = 0.6;
    group.add(core);

    group.position.set(x, y, z);
    this.group.add(group);

    const state: EnemyState = {
      id,
      type: 'slime',
      name: 'Water Slime',
      position: { x, y, z },
      rotation: 0,
      health: 18,
      maxHealth: 18,
      level: 1,
      state: 'PATROL',
      targetDistance: 999,
      velocity: { x: 0, y: 0, z: 0 },
      attackCooldown: 0,
    };

    this.enemies.push({ state, mesh: group });
  }

  private createStoneGuardian(id: string, x: number, z: number) {
    const y = TerrainManager.getTerrainHeight(x, z);
    const group = new THREE.Group();

    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.9 });
    const runeMat = new THREE.MeshStandardMaterial({
      color: 0x3b82f6,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.9,
    });

    // Giant Torso
    const torso = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2, 1), stoneMat);
    torso.position.y = 4.5;
    torso.castShadow = true;
    group.add(torso);

    // Glowing Eye Core
    const eye = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.4, 12), runeMat);
    eye.position.set(0, 5.2, 2.5);
    eye.rotation.x = Math.PI / 2;
    group.add(eye);

    // Arms
    const armL = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.0, 1.2), stoneMat);
    armL.position.set(-3.2, 3.5, 0);
    group.add(armL);

    const armR = new THREE.Mesh(new THREE.BoxGeometry(1.2, 4.0, 1.2), stoneMat);
    armR.position.set(3.2, 3.5, 0);
    group.add(armR);

    group.position.set(x, y, z);
    this.group.add(group);

    const state: EnemyState = {
      id,
      type: 'stone_guardian',
      name: 'Ancient Stone Guardian (BOSS)',
      position: { x, y, z },
      rotation: 0,
      health: 180,
      maxHealth: 180,
      level: 10,
      state: 'PATROL',
      targetDistance: 999,
      velocity: { x: 0, y: 0, z: 0 },
      attackCooldown: 0,
    };

    this.enemies.push({ state, mesh: group });
  }

  /**
   * Update Enemy AI behavior state machines
   */
  public updateAI(delta: number, playerPos: THREE.Vector3, onDamagePlayer: (damage: number) => void) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const item = this.enemies[i];
      const { state, mesh } = item;

      if (state.state === 'DEAD') {
        if (state.deathTimer === undefined) state.deathTimer = 0;
        state.deathTimer += delta;

        // Fall over collapse animation (rotates 90 degrees onto the ground)
        mesh.rotation.z = THREE.MathUtils.lerp(mesh.rotation.z, Math.PI / 2.1, delta * 8.0);
        mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, 0.35, delta * 5.0);

        const groundY = TerrainManager.getTerrainHeight(state.position.x, state.position.z);
        mesh.position.y = Math.max(groundY + 0.12, mesh.position.y - delta * 1.8);

        // Fade / shrink out after lying flat on ground for 2 seconds
        if (state.deathTimer > 2.0) {
          const scale = Math.max(0.01, 1.0 - (state.deathTimer - 2.0) * 1.5);
          mesh.scale.set(scale, scale, scale);
        }

        // Complete cleanup and removal
        if (state.deathTimer >= 2.8) {
          this.group.remove(mesh);
          mesh.traverse((c) => {
            if ((c as THREE.Mesh).geometry) (c as THREE.Mesh).geometry.dispose();
          });
          this.enemies.splice(i, 1);
        }
        continue;
      }

      const ePos = new THREE.Vector3(state.position.x, state.position.y, state.position.z);
      const distToPlayer = ePos.distanceTo(playerPos);
      state.targetDistance = distToPlayer;

      // 0. Handle Super Mario Stomp Squish Animation!
      if (state.isSquished) {
        state.squishProgress = (state.squishProgress || 0) + delta * 2.8;
        const p = state.squishProgress;
        mesh.scale.set(1.5 + p * 0.5, Math.max(0.04, 1.0 - p * 0.95), 1.5 + p * 0.5);
        mesh.position.set(state.position.x, state.position.y, state.position.z);
        if (p >= 1.0) {
          state.state = 'DEAD';
          mesh.visible = false;
        }
        continue;
      }

      state.attackCooldown = Math.max(0, state.attackCooldown - delta);

      // State machine logic
      if (distToPlayer < 22.0) {
        state.state = 'ALERT';
        if (distToPlayer < 1.4 && state.attackCooldown <= 0) {
          // Direct physical contact / melee attack damage!
          state.state = 'ATTACK';
          state.attackCooldown = state.type === 'stone_guardian' ? 2.5 : 1.2;
          onDamagePlayer(state.type === 'stone_guardian' ? 20 : 10);
          audioEngine.playHitImpact();
        } else if (distToPlayer >= 1.4) {
          // Chase player
          state.state = 'CHASE';
          const dir = new THREE.Vector3().subVectors(playerPos, ePos).normalize();
          dir.y = 0;
          const speed = state.type === 'stone_guardian' ? 2.5 : state.type === 'slime' ? 3.2 : state.type === 'goomba' ? 3.8 : 4.0;

          state.position.x += dir.x * speed * delta;
          state.position.z += dir.z * speed * delta;
          state.position.y = TerrainManager.getTerrainHeight(state.position.x, state.position.z);

          state.rotation = Math.atan2(dir.x, dir.z);
        }
      } else {
        state.state = 'PATROL';
      }

      // Sync mesh
      mesh.position.set(state.position.x, state.position.y, state.position.z);
      mesh.rotation.y = state.rotation;

      // Slime bounce animation
      if (state.type === 'slime') {
        const bounce = Math.abs(Math.sin(Date.now() * 0.006)) * 0.4;
        mesh.position.y += bounce;
      } else if (state.type === 'goomba') {
        const waddle = Math.sin(Date.now() * 0.012) * 0.2;
        mesh.rotation.z = waddle * 0.15;
        mesh.position.y += Math.abs(Math.sin(Date.now() * 0.012)) * 0.08;
      }
    }
  }

  public getObstacles(): ObstacleCollider[] {
    const list: ObstacleCollider[] = [];
    this.enemies.forEach((item) => {
      if (item.state.state === 'DEAD') return;
      const isBoss = item.state.type === 'stone_guardian';
      const isSlime = item.state.type === 'slime';
      list.push({
        id: item.state.id,
        type: 'enemy',
        x: item.state.position.x,
        z: item.state.position.z,
        yBase: item.state.position.y,
        height: isBoss ? 7.0 : isSlime ? 1.4 : 2.0,
        radius: isBoss ? 2.8 : isSlime ? 0.9 : 0.8,
      });
    });
    return list;
  }
}
