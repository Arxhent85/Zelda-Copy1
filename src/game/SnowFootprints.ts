import * as THREE from 'three';
import { TerrainManager } from './Terrain';

function createBootprintTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, 128, 256);

    // Subtle soft snow compression aura
    const auraGrad = ctx.createRadialGradient(64, 128, 20, 64, 128, 90);
    auraGrad.addColorStop(0, 'rgba(120, 160, 200, 0.45)');
    auraGrad.addColorStop(0.7, 'rgba(160, 195, 225, 0.2)');
    auraGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = auraGrad;
    ctx.beginPath();
    ctx.ellipse(64, 128, 52, 105, 0, 0, Math.PI * 2);
    ctx.fill();

    // Heel indentation
    ctx.fillStyle = '#3a5369';
    ctx.beginPath();
    ctx.ellipse(64, 195, 26, 34, 0, 0, Math.PI * 2);
    ctx.fill();

    // Front sole indentation
    ctx.beginPath();
    ctx.ellipse(64, 82, 34, 52, 0, 0, Math.PI * 2);
    ctx.fill();

    // Inner arch groove
    ctx.fillStyle = '#496782';
    ctx.beginPath();
    ctx.ellipse(64, 140, 20, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tread lines (gripping ridges in snow)
    ctx.strokeStyle = '#283c4e';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    for (let y = 52; y <= 118; y += 16) {
      ctx.beginPath();
      ctx.moveTo(42, y);
      ctx.lineTo(86, y);
      ctx.stroke();
    }

    // Heel tread grip
    ctx.beginPath();
    ctx.moveTo(48, 190);
    ctx.lineTo(80, 190);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(50, 210);
    ctx.lineTo(78, 210);
    ctx.stroke();

    // Pristine rim highlight (snow edge displacement)
    ctx.strokeStyle = 'rgba(235, 246, 255, 0.65)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(64, 82, 35, 53, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(64, 195, 27, 35, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

interface FootprintDecal {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  life: number;
  maxLife: number;
  active: boolean;
}

export class SnowFootprintManager {
  public group = new THREE.Group();
  private pool: FootprintDecal[] = [];
  private poolIndex = 0;
  private readonly maxDecals = 90;
  private lastFootstepPos = new THREE.Vector3();
  private isLeftFoot = false;
  private distanceSinceStep = 0;
  private bootTexture: THREE.CanvasTexture;

  constructor() {
    this.bootTexture = createBootprintTexture();

    const geo = new THREE.PlaneGeometry(0.36, 0.72);
    geo.rotateX(-Math.PI / 2); // Lay flat on XZ plane

    for (let i = 0; i < this.maxDecals; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: this.bootTexture,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      this.group.add(mesh);

      this.pool.push({
        mesh,
        life: 0,
        maxLife: 15.0, // Persist for 15 seconds
        active: false,
      });
    }
  }

  public update(
    delta: number,
    playerPos: THREE.Vector3,
    playerRotation: number,
    isGrounded: boolean,
    isMoving: boolean
  ) {
    // 1. Check distance traveled on snow for new footprint
    if (isGrounded && isMoving) {
      if (this.lastFootstepPos.lengthSq() === 0) {
        this.lastFootstepPos.copy(playerPos);
      }

      const dist = Math.hypot(
        playerPos.x - this.lastFootstepPos.x,
        playerPos.z - this.lastFootstepPos.z
      );
      this.distanceSinceStep += dist;
      this.lastFootstepPos.copy(playerPos);

      // Footstep cadence: ~0.72 meters per stride
      if (this.distanceSinceStep >= 0.72) {
        this.distanceSinceStep = 0;

        if (TerrainManager.isSnowAt(playerPos.x, playerPos.z)) {
          this.placeFootprint(playerPos, playerRotation);
        }
      }
    } else {
      this.lastFootstepPos.set(0, 0, 0);
    }

    // 2. Age and fade existing footprints
    for (const decal of this.pool) {
      if (!decal.active) continue;

      decal.life += delta;
      const progress = decal.life / decal.maxLife;

      if (progress >= 1.0) {
        decal.active = false;
        decal.mesh.visible = false;
        decal.mesh.material.opacity = 0;
      } else {
        // Smooth linear fade-out after first 5 seconds
        const alphaFactor = progress < 0.4 ? 1.0 : (1.0 - (progress - 0.4) / 0.6);
        decal.mesh.material.opacity = Math.max(0, 0.88 * alphaFactor);
      }
    }
  }

  private placeFootprint(playerPos: THREE.Vector3, playerRotation: number) {
    this.isLeftFoot = !this.isLeftFoot;
    const lateralOffset = this.isLeftFoot ? -0.18 : 0.18;

    // Perpendicular lateral vector relative to player facing direction
    const latX = Math.cos(playerRotation) * lateralOffset;
    const latZ = -Math.sin(playerRotation) * lateralOffset;

    const fx = playerPos.x + latX;
    const fz = playerPos.z + latZ;
    const groundY = TerrainManager.getTerrainHeight(fx, fz);
    const normal = TerrainManager.getTerrainNormal(fx, fz);

    const decal = this.pool[this.poolIndex];
    this.poolIndex = (this.poolIndex + 1) % this.maxDecals;

    decal.active = true;
    decal.life = 0;
    decal.mesh.visible = true;
    decal.mesh.material.opacity = 0.88;

    // Position snug onto terrain surface
    decal.mesh.position.set(fx, groundY + 0.02, fz);

    // Align mesh orientation to ground slope normal and player yaw
    const up = normal.clone();
    const forward = new THREE.Vector3(Math.sin(playerRotation), 0, Math.cos(playerRotation));
    // Project forward onto terrain plane
    forward.sub(up.clone().multiplyScalar(forward.dot(up))).normalize();
    const right = new THREE.Vector3().crossVectors(up, forward).normalize();

    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(right, up, forward.negate());
    decal.mesh.quaternion.setFromRotationMatrix(rotMatrix);
  }
}
