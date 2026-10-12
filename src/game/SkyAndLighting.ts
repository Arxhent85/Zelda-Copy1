import * as THREE from 'three';
import { GraphicsQuality } from '../types';

export class SkyAndLightingManager {
  public skyDome: THREE.Mesh | null = null;
  public dirLight: THREE.DirectionalLight | null = null;
  public ambientLight: THREE.AmbientLight | null = null;
  public hemiLight: THREE.HemisphereLight | null = null;
  public moonLight: THREE.DirectionalLight | null = null;
  public rimLight: THREE.DirectionalLight | null = null;
  public fog: THREE.FogExp2 | null = null;

  private skyMaterial: THREE.ShaderMaterial | null = null;
  public timeOfDay = 10.5; // 0.0 to 24.0 hours (Starts mid-morning)
  public timeScale = 0.05; // Base day duration
  public isTimeCycleActive = true; // Auto day/night cycle enabled or frozen
  public customTimeSpeed = 1.0; // Multiplier for day/night progression

  constructor(private scene: THREE.Scene) {}

  public setTimeOfDay(hour: number) {
    this.timeOfDay = Math.max(0, Math.min(24, hour));
  }

  public setTimeCycleActive(active: boolean) {
    this.isTimeCycleActive = active;
  }

  public setTimeSpeed(speed: number) {
    this.customTimeSpeed = Math.max(0, speed);
  }

  public initLighting(quality: GraphicsQuality) {
    // 1. Fog
    this.fog = new THREE.FogExp2(0x87ceeb, 0.0025);
    this.scene.fog = this.fog;

    // 2. Ambient & Hemisphere Light (Tuned for bright, clear visibility across terrain & roads)
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.65);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x4a7c38, 0.58);
    this.scene.add(this.hemiLight);

    const isMobile = typeof window !== 'undefined' && (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      ('ontouchstart' in window && window.innerWidth < 1024)
    );

    // 3. Sun Directional Light (Main shadow caster - crisp 1.35 intensity)
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.35);
    sunLight.castShadow = quality !== 'low';

    // Configure Tight Shadow Map Cascade
    const shadowRes = isMobile ? 1024 : (quality === 'ultra' ? 2048 : quality === 'high' ? 2048 : 1024);
    sunLight.shadow.mapSize.width = shadowRes;
    sunLight.shadow.mapSize.height = shadowRes;
    sunLight.shadow.camera.near = 1.0;
    sunLight.shadow.camera.far = 320;
    sunLight.shadow.camera.left = -65;
    sunLight.shadow.camera.right = 65;
    sunLight.shadow.camera.top = 65;
    sunLight.shadow.camera.bottom = -65;
    sunLight.shadow.bias = -0.0001;
    sunLight.shadow.normalBias = 0.025;

    this.scene.add(sunLight);
    this.scene.add(sunLight.target);
    this.dirLight = sunLight;

    // 4. Subtle BotW-style Rim Light (Opposes sun angle for hero & foliage silhouette highlights)
    const rim = new THREE.DirectionalLight(0xbae6fd, 0.35);
    rim.castShadow = false;
    this.scene.add(rim);
    this.scene.add(rim.target);
    this.rimLight = rim;

    // 5. Moon Light
    const moon = new THREE.DirectionalLight(0x8faaff, 0.35);
    moon.castShadow = false;
    this.scene.add(moon);
    this.scene.add(moon.target);
    this.moonLight = moon;

    // 5. Procedural Sky Dome Shader
    this.createSkyDome();
  }

  private createSkyDome() {
    const geometry = new THREE.SphereGeometry(600, 32, 16);
    const material = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uSunPosition: { value: new THREE.Vector3() },
        uTimeOfDay: { value: this.timeOfDay },
        uTopColor: { value: new THREE.Color('#3a7bd5') },
        uBottomColor: { value: new THREE.Color('#3a6073') },
        uSunColor: { value: new THREE.Color('#fff2a3') },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPos = worldPosition.xyz;
          gl_Position = projectionMatrix * viewMatrix * worldPosition;
        }
      `,
      fragmentShader: `
        uniform vec3 uSunPosition;
        uniform float uTimeOfDay;
        uniform vec3 uTopColor;
        uniform vec3 uBottomColor;
        uniform vec3 uSunColor;
        varying vec3 vWorldPos;

        void main() {
          vec3 dir = normalize(vWorldPos);
          float height = clamp(dir.y, 0.0, 1.0);

          // Sky gradient base
          vec3 skyColor = mix(uBottomColor, uTopColor, height);

          // Sun disc & glow
          vec3 sunDir = normalize(uSunPosition);
          float sunCos = max(0.0, dot(dir, sunDir));
          float sunDisc = step(0.998, sunCos);
          float sunGlow = pow(sunCos, 8.0) * 0.4;

          skyColor += uSunColor * (sunDisc * 2.0 + sunGlow);

          // Star dots at night
          if (uTimeOfDay < 6.0 || uTimeOfDay > 18.0) {
            float starNoise = fract(sin(dot(dir.xz * 120.0, vec2(12.9898, 78.233))) * 43758.5453);
            if (starNoise > 0.992 && height > 0.2) {
              skyColor += vec3(0.9, 0.95, 1.0) * (starNoise - 0.992) * 80.0;
            }
          }

          gl_FragColor = vec4(skyColor, 1.0);
        }
      `,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.name = 'SkyDome';
    this.scene.add(mesh);

    this.skyDome = mesh;
    this.skyMaterial = material;
  }

  public update(delta: number, playerPos: THREE.Vector3) {
    // Advance Day-Night cycle only if active
    if (this.isTimeCycleActive) {
      this.timeOfDay = (this.timeOfDay + delta * this.timeScale * this.customTimeSpeed) % 24.0;
    }

    // Sun angle calculation (6 = sunrise East, 12 = overhead South, 18 = sunset West)
    const sunAngle = ((this.timeOfDay - 6.0) / 24.0) * Math.PI * 2;
    const sunDist = 200;
    const sunX = Math.cos(sunAngle) * sunDist;
    const sunY = Math.sin(sunAngle) * sunDist;
    const sunZ = 50;

    const sunPos = new THREE.Vector3(playerPos.x + sunX, playerPos.y + Math.max(-10, sunY), playerPos.z + sunZ);

    if (this.dirLight) {
      this.dirLight.position.copy(sunPos);
      this.dirLight.target.position.copy(playerPos);
      this.dirLight.target.updateMatrixWorld();
    }

    if (this.moonLight) {
      this.moonLight.position.set(playerPos.x - sunX, playerPos.y - sunY, playerPos.z - sunZ);
      this.moonLight.target.position.copy(playerPos);
      this.moonLight.target.updateMatrixWorld();
    }

    if (this.rimLight) {
      this.rimLight.position.set(playerPos.x - sunX * 0.6, playerPos.y + 45, playerPos.z - sunZ * 0.6);
      this.rimLight.target.position.copy(playerPos);
      this.rimLight.target.updateMatrixWorld();
    }

    // Sky Dome tracks player position
    if (this.skyDome) {
      this.skyDome.position.copy(playerPos);
    }

    // Dynamic Atmosphere & Color Palette changes
    const isDay = this.timeOfDay >= 6.0 && this.timeOfDay <= 18.0;
    const isSunset = (this.timeOfDay >= 17.0 && this.timeOfDay <= 19.0) || (this.timeOfDay >= 5.0 && this.timeOfDay <= 7.0);

    const cTop = new THREE.Color();
    const cBottom = new THREE.Color();

    if (isSunset) {
      cTop.set('#4a2e5d'); // Twilight purple
      cBottom.set('#f37335'); // Vibrant sunset orange
      if (this.ambientLight) {
        this.ambientLight.color.set('#ffcba4');
        this.ambientLight.intensity = 0.52;
      }
      if (this.dirLight) {
        this.dirLight.color.set('#ffaa44');
        this.dirLight.intensity = 1.10;
      }
      if (this.hemiLight) this.hemiLight.intensity = 0.45;
      if (this.fog) this.fog.color.set('#f37335');
    } else if (isDay) {
      cTop.set('#2980b9'); // Emerald Zelda Sky Blue
      cBottom.set('#87ceeb');
      if (this.ambientLight) {
        this.ambientLight.color.set('#ffffff');
        this.ambientLight.intensity = 0.65;
      }
      if (this.dirLight) {
        this.dirLight.color.set('#fffce6');
        this.dirLight.intensity = 1.35;
      }
      if (this.hemiLight) this.hemiLight.intensity = 0.58;
      if (this.fog) this.fog.color.set('#87ceeb');
    } else {
      // Night
      cTop.set('#050b14');
      cBottom.set('#0f2027');
      if (this.ambientLight) {
        this.ambientLight.color.set('#334a6d');
        this.ambientLight.intensity = 0.32;
      }
      if (this.dirLight) {
        this.dirLight.color.set('#4b6b94');
        this.dirLight.intensity = 0.38;
      }
      if (this.hemiLight) this.hemiLight.intensity = 0.28;
      if (this.fog) this.fog.color.set('#0d1b2a');
    }

    if (this.skyMaterial) {
      this.skyMaterial.uniforms.uSunPosition.value.copy(sunPos);
      this.skyMaterial.uniforms.uTimeOfDay.value = this.timeOfDay;
      this.skyMaterial.uniforms.uTopColor.value.copy(cTop);
      this.skyMaterial.uniforms.uBottomColor.value.copy(cBottom);
    }
  }
}
