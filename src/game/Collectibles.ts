import * as THREE from 'three';
import { ObstacleCollider, ShrineData, WorldObjectType } from '../types';
import { TerrainManager } from './Terrain';
import { audioEngine } from './AudioEngine';

export class CollectibleManager {
  public objects: { data: WorldObjectType; mesh: THREE.Group }[] = [];
  public group: THREE.Group = new THREE.Group();

  public shrinesData: ShrineData[] = [
    {
      id: 'shrine_awakening',
      name: 'Shrine of Awakening',
      region: 'Central Plains',
      position: { x: 0, y: 0, z: 25 },
      activated: true,
      fastTravelUnlocked: true,
      description: 'The sacred altar where heroes gather strength.',
    },
    {
      id: 'shrine_forest',
      name: 'Forest Rune Shrine',
      region: 'Whispering Forest',
      position: { x: 140, y: 0, z: 90 },
      activated: false,
      fastTravelUnlocked: false,
      description: 'Hidden amid ancient giant pines and glowing flora.',
    },
    {
      id: 'shrine_ruins',
      name: 'Temple of Guardian Runes',
      region: 'Ancient Temple Ruins',
      position: { x: -160, y: 0, z: -80 },
      activated: false,
      fastTravelUnlocked: false,
      description: 'Protected by ancient stone behemoths.',
    },
    {
      id: 'shrine_peak',
      name: 'Dragon Crest Shrine',
      region: 'Northern Alpine Peaks',
      position: { x: -40, y: 0, z: 210 },
      activated: false,
      fastTravelUnlocked: false,
      description: 'High above the clouds where wind streams roar.',
    },
  ];

  constructor(private scene: THREE.Scene) {
    this.group.name = 'CollectiblesGroup';
    this.scene.add(this.group);
  }

  public initWorldObjects() {
    // 1. Shrines
    this.shrinesData.forEach((shrine) => {
      const y = TerrainManager.getTerrainHeight(shrine.position.x, shrine.position.z);
      shrine.position.y = y;

      const shrineGroup = new THREE.Group();

      // Ancient Shrine Stepped Pyramid Base
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x3a424a, roughness: 0.8 });
      const runeBlue = new THREE.MeshStandardMaterial({
        color: 0x00f0ff,
        emissive: 0x0088cc,
        emissiveIntensity: 1.2,
      });

      const b1 = new THREE.Mesh(new THREE.BoxGeometry(10, 2, 10), baseMat);
      b1.position.y = 1;
      b1.castShadow = true;
      shrineGroup.add(b1);

      const b2 = new THREE.Mesh(new THREE.BoxGeometry(8, 2, 8), baseMat);
      b2.position.y = 3;
      b2.castShadow = true;
      shrineGroup.add(b2);

      // Glowing Pedestal Core
      const core = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 2.5, 8), runeBlue);
      core.position.y = 5.25;
      shrineGroup.add(core);

      // Sky Teleport Light Beam
      const beamGeo = new THREE.CylinderGeometry(1.2, 1.2, 120, 16);
      const beamMat = new THREE.MeshBasicMaterial({
        color: 0x00f0ff,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
      });
      const beam = new THREE.Mesh(beamGeo, beamMat);
      beam.position.y = 60;
      shrineGroup.add(beam);

      shrineGroup.position.set(shrine.position.x, y, shrine.position.z);
      this.group.add(shrineGroup);

      const objData: WorldObjectType = {
        id: shrine.id,
        type: 'shrine',
        name: shrine.name,
        position: shrine.position,
        activated: shrine.activated,
      };

      this.objects.push({ data: objData, mesh: shrineGroup });
    });

    // 2. Treasure Chests
    const chestPositions = [
      { x: 15, z: 35, lootName: 'Fire Blade', lootType: 'weapon', atk: 25 },
      { x: 155, z: 105, lootName: 'Elixir of Stamina', lootType: 'potion', stm: 100 },
      { x: -175, z: -95, lootName: 'Royal Hylian Shield', lootType: 'shield', def: 30 },
      { x: -50, z: 225, lootName: 'Heart Container (+1 Heart)', lootType: 'valuable', hp: 4 },
    ];

    chestPositions.forEach((cp, idx) => {
      const y = TerrainManager.getTerrainHeight(cp.x, cp.z);
      const chestGroup = new THREE.Group();

      const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4726, roughness: 0.7 });
      const goldTrim = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8 });

      const box = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 1.0), woodMat);
      box.position.y = 0.45;
      box.castShadow = true;
      chestGroup.add(box);

      const lid = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.3, 1.02), goldTrim);
      lid.position.set(0, 0.9, 0);
      lid.name = 'ChestLid';
      chestGroup.add(lid);

      chestGroup.position.set(cp.x, y, cp.z);
      this.group.add(chestGroup);

      const objData: WorldObjectType = {
        id: `chest_${idx}`,
        type: 'chest',
        name: 'Ancient Treasure Chest',
        position: { x: cp.x, y, z: cp.z },
        opened: false,
        loot: {
          id: `loot_${idx}`,
          name: cp.lootName,
          type: cp.lootType as any,
          description: 'A legendary reward found in ancient chests.',
          icon: cp.lootType === 'weapon' ? '🗡️' : cp.lootType === 'shield' ? '🛡️' : '🧪',
          attackPower: cp.atk,
          defensePower: cp.def,
          restoreHealth: cp.hp,
          restoreStamina: cp.stm,
          quantity: 1,
        },
      };

      this.objects.push({ data: objData, mesh: chestGroup });
    });

    // 3. Scatter Gold Rupees across valley
    for (let i = 0; i < 40; i++) {
      const rx = (Math.random() - 0.5) * 350;
      const rz = (Math.random() - 0.5) * 350;
      const ry = TerrainManager.getTerrainHeight(rx, rz);

      if (ry > TerrainManager.WATER_LEVEL + 0.5) {
        this.spawnRupee(rx, rz, 1, 5);
      }
    }
  }

  public spawnRupee(x: number, z: number, count = 1, val = 5) {
    for (let i = 0; i < count; i++) {
      const rx = x + (Math.random() - 0.5) * 1.5;
      const rz = z + (Math.random() - 0.5) * 1.5;
      const ry = TerrainManager.getTerrainHeight(rx, rz) + 0.8;

      const group = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({
        color: val === 20 ? 0xef4444 : val === 50 ? 0x3b82f6 : 0x10b981,
        metalness: 0.9,
        roughness: 0.1,
      });

      const rupeeGeo = new THREE.OctahedronGeometry(0.35, 0);
      const mesh = new THREE.Mesh(rupeeGeo, mat);
      mesh.scale.set(0.7, 1.4, 0.7);
      mesh.castShadow = true;
      group.add(mesh);

      group.position.set(rx, ry, rz);
      this.group.add(group);

      const data: WorldObjectType = {
        id: `rupee_${Math.random()}`,
        type: 'rupee',
        name: 'Green Rupee',
        position: { x: rx, y: ry, z: rz },
      };

      this.objects.push({ data, mesh: group });
    }
  }

  public getObstacles(): ObstacleCollider[] {
    const list: ObstacleCollider[] = [];
    this.objects.forEach((obj) => {
      if (obj.data.type === 'shrine') {
        list.push({
          id: obj.data.id,
          type: 'shrine',
          x: obj.data.position.x,
          z: obj.data.position.z,
          yBase: obj.data.position.y,
          height: 4.5,
          radius: 4.8,
        });
      } else if (obj.data.type === 'chest') {
        list.push({
          id: obj.data.id,
          type: 'chest',
          x: obj.data.position.x,
          z: obj.data.position.z,
          yBase: obj.data.position.y,
          height: 1.2,
          radius: 0.85,
        });
      }
    });
    return list;
  }

  public update(time: number, playerPos: THREE.Vector3, onPickupRupee: (val: number) => void) {
    // Spin & bob collectibles & handle player magnetic pickup
    this.objects.forEach((item, index) => {
      const { data, mesh } = item;
      if (data.type === 'rupee') {
        mesh.rotation.y = time * 3.0;
        mesh.position.y = data.position.y + Math.sin(time * 4.0 + index) * 0.15;

        // Magnetized pickup check
        const dist = mesh.position.distanceTo(playerPos);
        if (dist < 2.5) {
          onPickupRupee(5);
          audioEngine.playRupeeChime();
          this.group.remove(mesh);
          this.objects.splice(index, 1);
        }
      }
    });
  }
}
