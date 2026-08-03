import * as THREE from 'three';
import { TerrainManager } from './Terrain';

export class CameraControls {
  public camera: THREE.PerspectiveCamera;
  public yaw = 0; // Horizontal rotation angle around player
  public pitch = 0.25; // Vertical tilt angle (-0.2 to 1.2)
  public distance = 8.0; // Follow distance

  public targetLockEnemy: THREE.Vector3 | null = null;
  public isLockedOn = false;

  private smoothedFocus = new THREE.Vector3();
  private isInitialized = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  public handleMouseMove(deltaX: number, deltaY: number, sensitivity: number = 0.003) {
    if (this.isLockedOn) return; // Locked-on camera follows target automatically
    this.yaw -= deltaX * sensitivity;
    this.pitch += deltaY * sensitivity;

    // Clamp pitch to avoid flipped camera
    this.pitch = Math.max(-0.1, Math.min(1.1, this.pitch));
  }

  public updateCamera(playerPos: THREE.Vector3, delta: number) {
    const focusTarget = playerPos.clone().add(new THREE.Vector3(0, 1.8, 0));

    if (!this.isInitialized) {
      this.smoothedFocus.copy(focusTarget);
      this.isInitialized = true;
    }

    if (this.isLockedOn && this.targetLockEnemy) {
      // Auto-face locked target
      const lookDir = new THREE.Vector3().subVectors(this.targetLockEnemy, focusTarget).normalize();
      this.yaw = Math.atan2(-lookDir.x, -lookDir.z);
    }

    // Framerate-independent exponential dampening alpha factor
    const alpha = 1.0 - Math.exp(-18.0 * delta);

    // Smooth focus target
    this.smoothedFocus.lerp(focusTarget, alpha);

    // Calculate desired camera position in world space
    const cosPitch = Math.cos(this.pitch);
    const sinPitch = Math.sin(this.pitch);
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);

    let camX = this.smoothedFocus.x + this.distance * cosPitch * sinYaw;
    let camY = this.smoothedFocus.y + this.distance * sinPitch;
    let camZ = this.smoothedFocus.z + this.distance * cosPitch * cosYaw;

    // Terrain Collision Avoidance for Camera
    const minHeightOverTerrain = TerrainManager.getTerrainHeight(camX, camZ) + 1.2;
    if (camY < minHeightOverTerrain) {
      camY = minHeightOverTerrain;
    }

    const desiredPos = new THREE.Vector3(camX, camY, camZ);

    // Smooth Lerp Camera Position
    this.camera.position.lerp(desiredPos, alpha);
    this.camera.lookAt(this.smoothedFocus);
  }
}
