import * as THREE from 'three';
import { TerrainManager } from './Terrain';
import { audioEngine } from './AudioEngine';

interface WaterParticle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
}

interface WaterRipple {
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  life: number;
  maxLife: number;
  startScale: number;
  targetScale: number;
}

export class WaterManager {
  public waterMesh: THREE.Mesh | null = null;
  public effectsGroup: THREE.Group = new THREE.Group();
  private material: THREE.ShaderMaterial | null = null;

  // Particle & Ripple Collections
  private particles: WaterParticle[] = [];
  private ripples: WaterRipple[] = [];

  // Reusable Geometries
  private splashGeo = new THREE.SphereGeometry(0.1, 6, 6);
  private splashMat = new THREE.MeshStandardMaterial({
    color: 0xebfcff,
    roughness: 0.1,
    metalness: 0.1,
    transparent: true,
    opacity: 0.85,
    emissive: 0xa2f0fc,
    emissiveIntensity: 0.5,
  });

  private rippleGeo = new THREE.PlaneGeometry(1, 1);
  
  // Track player water transition state
  private wasSwimmingLastFrame = false;
  private swimSplashTimer = 0;

  public createWaterMesh(): THREE.Mesh {
    const isMobile = typeof window !== 'undefined' && (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      ('ontouchstart' in window && window.innerWidth < 1024)
    );
    const size = TerrainManager.WORLD_SIZE;
    const segments = isMobile ? 48 : 80;
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const customShaderMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uDeepColor: { value: new THREE.Color('#00264d') },
        uShallowColor: { value: new THREE.Color('#14b2d1') },
        uFoamColor: { value: new THREE.Color('#ffffff') },
        uSunDirection: { value: new THREE.Vector3(0.4, 0.8, 0.4).normalize() },
      },
      vertexShader: `
        uniform float uTime;
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying float vWaveHeight;

        void main() {
          vUv = uv;
          vec3 pos = position;

          // Multi-octave wave displacement for rich realistic motion
          float w1 = sin(pos.x * 0.12 + uTime * 1.6) * cos(pos.z * 0.12 + uTime * 1.4) * 0.22;
          float w2 = sin(pos.x * 0.35 - uTime * 2.2) * sin(pos.z * 0.28 + uTime * 2.0) * 0.08;
          float w3 = cos(pos.x * 0.8 + uTime * 3.5) * sin(pos.z * 0.7 - uTime * 3.0) * 0.03;
          
          float totalWave = w1 + w2 + w3;
          pos.y += totalWave;
          vWaveHeight = totalWave;

          // Compute analytical normal for specular lighting
          float dx = (cos(pos.x * 0.12 + uTime * 1.6) * 0.12 * 0.22) + (cos(pos.x * 0.35 - uTime * 2.2) * 0.35 * 0.08);
          float dz = (-sin(pos.z * 0.12 + uTime * 1.4) * 0.12 * 0.22) + (cos(pos.z * 0.28 + uTime * 2.0) * 0.28 * 0.08);
          vNormal = normalize(vec3(-dx, 1.0, -dz));

          vec4 worldPosition = modelMatrix * vec4(pos, 1.0);
          vWorldPosition = worldPosition.xyz;

          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uDeepColor;
        uniform vec3 uShallowColor;
        uniform vec3 uFoamColor;
        uniform vec3 uSunDirection;
        varying vec3 vWorldPosition;
        varying vec3 vNormal;
        varying vec2 vUv;
        varying float vWaveHeight;

        void main() {
          vec3 viewDir = normalize(cameraPosition - vWorldPosition);
          vec3 normal = normalize(vNormal);

          // Fresnel reflection factor
          float fresnel = pow(1.0 - max(0.0, dot(viewDir, normal)), 3.5);

          // Base water color mix
          vec3 color = mix(uShallowColor, uDeepColor, 0.60 + fresnel * 0.40);

          // Sun Specular Shimmer on wave crests
          vec3 halfDir = normalize(uSunDirection + viewDir);
          float spec = pow(max(0.0, dot(normal, halfDir)), 64.0);
          color += vec3(1.0, 0.98, 0.9) * spec * 0.8;

          // Animated Foam crests
          float foamMask = smoothstep(0.14, 0.28, vWaveHeight);
          color = mix(color, uFoamColor, foamMask * 0.65);

          // Transparency
          float alpha = 0.84 + fresnel * 0.14;

          gl_FragColor = vec4(color, alpha);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, customShaderMaterial);
    mesh.position.y = TerrainManager.WATER_LEVEL;
    mesh.name = 'WaterMesh';

    this.waterMesh = mesh;
    this.material = customShaderMaterial;
    return mesh;
  }

  /**
   * Spawns an animated water splash spray & expanding surface ripple rings!
   */
  public createWaterSplash(x: number, y: number, z: number, isHeavy: boolean = false) {
    const waterLevel = TerrainManager.WATER_LEVEL;
    const splashY = Math.max(y, waterLevel + 0.08);

    // 1. Water Spray Droplets / Foam Burst
    const count = isHeavy ? 28 : 12;
    for (let i = 0; i < count; i++) {
      const pMesh = new THREE.Mesh(this.splashGeo, this.splashMat.clone());
      const size = 0.08 + Math.random() * (isHeavy ? 0.18 : 0.10);
      pMesh.scale.set(size, size, size);
      pMesh.position.set(
        x + (Math.random() - 0.5) * 0.5,
        splashY + Math.random() * 0.15,
        z + (Math.random() - 0.5) * 0.5
      );

      const angle = Math.random() * Math.PI * 2;
      const speed = isHeavy ? 2.0 + Math.random() * 3.0 : 1.0 + Math.random() * 1.8;
      const upVel = isHeavy ? 3.0 + Math.random() * 3.5 : 1.5 + Math.random() * 2.0;

      const vel = new THREE.Vector3(
        Math.cos(angle) * speed,
        upVel,
        Math.sin(angle) * speed
      );

      this.effectsGroup.add(pMesh);
      this.particles.push({
        mesh: pMesh,
        vel,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.35,
        size,
      });
    }

    // 2. Silky Soft Shader-Based Water Surface Ripple Ring
    const ringCount = isHeavy ? 3 : 1;
    for (let r = 0; r < ringCount; r++) {
      const rippleMat = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.NormalBlending,
        uniforms: {
          uProgress: { value: 0 },
          uColor: { value: new THREE.Color(0xa2f0fc) },
        },
        vertexShader: `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec2 vUv;
          uniform float uProgress;
          uniform vec3 uColor;

          void main() {
            vec2 center = vUv - vec2(0.5);
            float dist = length(center) * 2.0; // 0 to 1

            // Concentric foam ring profile
            float ringRadius = mix(0.1, 0.9, pow(uProgress, 0.55));
            float thickness = mix(0.09, 0.02, uProgress);

            float ring = smoothstep(thickness, 0.0, abs(dist - ringRadius));
            float alpha = ring * pow(1.0 - uProgress, 1.4) * 0.85;

            gl_FragColor = vec4(uColor, alpha);
          }
        `,
      });

      const rMesh = new THREE.Mesh(this.rippleGeo, rippleMat);
      rMesh.rotation.x = -Math.PI / 2;
      rMesh.position.set(x, waterLevel + 0.02 + r * 0.003, z);

      this.effectsGroup.add(rMesh);
      this.ripples.push({
        mesh: rMesh,
        material: rippleMat,
        life: 0,
        maxLife: 0.7 + r * 0.25,
        startScale: 0.6 + r * 0.2,
        targetScale: isHeavy ? 3.2 + r * 0.8 : 1.8 + r * 0.4,
      });
    }

    // 3. Play water splash audio
    audioEngine.playWaterSplash(isHeavy ? 'heavy' : 'paddle');
  }

  public update(
    time: number,
    delta: number,
    playerPos?: THREE.Vector3,
    isSwimming: boolean = false,
    isMoving: boolean = false
  ) {
    if (this.material) {
      this.material.uniforms.uTime.value = time;
    }

    // Handle Player Swimming Splashes & Entrance
    if (playerPos) {
      const waterLevel = TerrainManager.WATER_LEVEL;

      // Player just entered water!
      if (isSwimming && !this.wasSwimmingLastFrame) {
        this.createWaterSplash(playerPos.x, waterLevel, playerPos.z, true);
      }

      // Continuous swimming movement churn & paddle splashes
      if (isSwimming) {
        this.swimSplashTimer += delta;
        const interval = isMoving ? 0.36 : 0.85;
        if (this.swimSplashTimer >= interval) {
          this.swimSplashTimer = 0;
          this.createWaterSplash(playerPos.x, waterLevel, playerPos.z, isMoving);
        }
      }

      this.wasSwimmingLastFrame = isSwimming;
    }

    // Update Splash Droplets Physics
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += delta;
      const progress = p.life / p.maxLife;

      // Integrate position & gravity
      p.vel.y -= 9.81 * delta * 1.8;
      p.mesh.position.addScaledVector(p.vel, delta);

      // Fade out and shrink near end of life
      const scale = p.size * (1.0 - progress);
      p.mesh.scale.set(scale, scale, scale);

      if (progress >= 1.0 || p.mesh.position.y <= TerrainManager.WATER_LEVEL - 0.2) {
        this.effectsGroup.remove(p.mesh);
        p.mesh.geometry.dispose();
        (p.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }

    // Update Water Ring Ripples Shader Uniforms & Scaling
    for (let i = this.ripples.length - 1; i >= 0; i--) {
      const r = this.ripples[i];
      r.life += delta;
      const progress = r.life / r.maxLife;

      r.material.uniforms.uProgress.value = Math.min(1.0, progress);

      // Expand ring size
      const scale = THREE.MathUtils.lerp(r.startScale, r.targetScale, Math.pow(progress, 0.65));
      r.mesh.scale.set(scale, scale, scale);

      if (progress >= 1.0) {
        this.effectsGroup.remove(r.mesh);
        r.mesh.geometry.dispose();
        r.material.dispose();
        this.ripples.splice(i, 1);
      }
    }
  }
}


