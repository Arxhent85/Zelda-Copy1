import * as THREE from 'three';
import { TerrainManager } from './Terrain';

export class CameraControls {
  public camera: THREE.PerspectiveCamera;
  public yaw = 0; // Horizontal rotation angle around player
  public pitch = 0.25; // Vertical tilt angle (-0.2 to 1.2)
  public distance = 8.0; // Follow distance

  public targetLockEnemy: THREE.Vector3 | null = null;
  public isLockedOn = false;
  public isEditorMode = false;
  public editorViewMode: '3d' | 'topdown' | 'isometric' = '3d';
  public editorTarget: THREE.Vector3 = new THREE.Vector3(0, 6, 0);

  // 🏎️ GTA & Mario Kart Vehicle Chase Camera State
  public isDrivingMode = false;
  public drivingVehicleYaw = 0;
  public drivingSpeed = 0;
  public drivingIsTurbo = false;

  private smoothedFocus = new THREE.Vector3();
  private isInitialized = false;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  public setEditorViewMode(mode: '3d' | 'topdown' | 'isometric') {
    this.editorViewMode = mode;
    if (mode === 'topdown') {
      this.pitch = 1.54; // Directly overhead
      this.yaw = 0; // True North
      this.distance = Math.max(35.0, this.distance);
    } else if (mode === 'isometric') {
      this.pitch = 0.785; // 45 degrees
      this.yaw = 0.785; // 45 degrees
      this.distance = Math.max(25.0, this.distance);
    } else {
      this.pitch = 0.45;
      this.distance = Math.min(60.0, this.distance);
    }
  }

  public setEditorZoom(dist: number) {
    this.distance = Math.max(8.0, Math.min(250.0, dist));
  }

  public focusPoint(pos: THREE.Vector3, zoomDist?: number) {
    this.editorTarget.set(pos.x, TerrainManager.getTerrainHeight(pos.x, pos.z) + 1.5, pos.z);
    if (zoomDist !== undefined) {
      this.setEditorZoom(zoomDist);
    }
  }

  public zoom(delta: number) {
    const minD = this.isEditorMode ? 8.0 : this.isDrivingMode ? 5.5 : 3.5;
    const maxD = this.isEditorMode ? 250.0 : this.isDrivingMode ? 14.0 : 25.0;
    this.distance = Math.max(minD, Math.min(maxD, this.distance + delta));
  }

  public panEditor(forward: number, right: number) {
    if (this.editorViewMode === 'topdown') {
      // In topdown mode, pan strictly along world X (right) and Z (forward)
      this.editorTarget.x += right;
      this.editorTarget.z -= forward;
    } else {
      const cosYaw = Math.cos(this.yaw);
      const sinYaw = Math.sin(this.yaw);
      // Move relative to camera viewing direction
      this.editorTarget.x += (-sinYaw * forward + cosYaw * right);
      this.editorTarget.z += (-cosYaw * forward - sinYaw * right);
    }
    this.editorTarget.y = TerrainManager.getTerrainHeight(this.editorTarget.x, this.editorTarget.z) + 1.5;
  }

  public handleMouseMove(deltaX: number, deltaY: number, sensitivity: number = 0.003) {
    if (this.isLockedOn) return; // Locked-on camera follows target automatically
    if (this.isEditorMode && this.editorViewMode === 'topdown') {
      return;
    }
    this.yaw -= deltaX * sensitivity;
    this.pitch += deltaY * sensitivity;

    // Clamp pitch to avoid flipped camera
    const minP = this.isEditorMode ? 0.05 : this.isDrivingMode ? 0.05 : -0.1;
    const maxP = this.isEditorMode ? 1.54 : this.isDrivingMode ? 0.85 : 1.1;
    this.pitch = Math.max(minP, Math.min(maxP, this.pitch));
  }

  public updateCamera(playerPos: THREE.Vector3, delta: number) {
    const focusTarget = this.isEditorMode
      ? this.editorTarget
      : this.isDrivingMode
      ? playerPos.clone().add(new THREE.Vector3(0, 1.1, 0))
      : playerPos.clone().add(new THREE.Vector3(0, 1.8, 0));

    if (!this.isInitialized) {
      this.smoothedFocus.copy(focusTarget);
      this.isInitialized = true;
    }

    if (this.isLockedOn && this.targetLockEnemy) {
      // Auto-face locked target
      const lookDir = new THREE.Vector3().subVectors(this.targetLockEnemy, focusTarget).normalize();
      this.yaw = Math.atan2(-lookDir.x, -lookDir.z);
    } else if (this.isDrivingMode) {
      // 🏎️ Classic GTA / Mario Kart Chase Camera:
      // Camera smoothly tracks behind the vehicle's heading
      const targetYaw = this.drivingVehicleYaw + Math.PI;
      const yawDiff = Math.atan2(Math.sin(targetYaw - this.yaw), Math.cos(targetYaw - this.yaw));
      this.yaw += yawDiff * Math.min(1.0, delta * 5.5);

      // Camera distance widens with high speed
      const targetDist = 6.6 + Math.min(1.0, Math.abs(this.drivingSpeed) / 30.0) * 3.2;
      this.distance = THREE.MathUtils.lerp(this.distance, targetDist, delta * 4.0);
      this.pitch = THREE.MathUtils.lerp(this.pitch, 0.22, delta * 3.5);

      // Turbo FOV rush
      const targetFov = this.drivingIsTurbo ? 74 : (65 + Math.min(1.0, Math.abs(this.drivingSpeed) / 35.0) * 4);
      if (Math.abs(this.camera.fov - targetFov) > 0.1) {
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 5.0);
        this.camera.updateProjectionMatrix();
      }
    } else {
      // Restore standard 65 FOV when on-foot
      if (Math.abs(this.camera.fov - 65) > 0.1) {
        this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 65, delta * 4.0);
        this.camera.updateProjectionMatrix();
      }
    }

    // Framerate-independent exponential dampening alpha factor
    const alpha = 1.0 - Math.exp((this.isDrivingMode ? -24.0 : -18.0) * delta);

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
