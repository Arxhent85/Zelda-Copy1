import * as THREE from 'three';
import { GraphicsQuality } from '../types';

export class SkyAndLightingManager {
  public skyDome: THREE.Mesh | null = null;
  public dirLight: THREE.DirectionalLight | null = null;
  public ambientLight: THREE.AmbientLight | null = null;
  public hemiLight: THREE.HemisphereLight | null = null;
  public moonLight: THREE.DirectionalLight | null = null;
  public fog: THREE.FogExp2 | null = null;

  private skyMaterial: THREE.ShaderMaterial | null = null;
  public timeOfDay = 10.5; // 0.0 to 24.0 hours (Starts mid-morning)
  public timeScale = 0.05; // Day lasts ~480 seconds (8 mins)

  constructor(private scene: THREE.Scene) {}

  public initLighting(quality: GraphicsQuality) {
    // 1. Fog
    this.fog = new THREE.FogExp2(0x87ceeb, 0.0025);
    this.scene.fog = this.fog;

    // 2. Ambient & Hemisphere Light
    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.45);
    this.scene.add(this.ambientLight);

    this.hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x3b7a36, 0.6);
    this.scene.add(this.hemiLight);

    const isMobile = typeof window !== 'undefined' && (
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
      ('ontouchstart' in window && window.innerWidth < 1024)
    );

    // 3. Sun Directional Light (Main shadow caster)
    const sunLight = new THREE.DirectionalLight(0xfffaed, 1.4);
    sunLight.castShadow = quality !== 'low';

    // Configure Shadow Map
    const shadowRes = isMobile ? 512 : (quality === 'ultra' ? 2048 : quality === 'high' ? 1024 : 512);
    sunLight.shadow.mapSize.width = shadowRes;
    sunLight.shadow.mapSize.height = shadowRes;
    sunLight.shadow.camera.near = 10;
    sunLight.shadow.camera.far = 350;
    sunLight.shadow.camera.left = -80;
    sunLight.shadow.camera.right = 80;
    sunLight.shadow.camera.top = 80;
    sunLight.shadow.camera.bottom = -80;
    sunLight.shadow.bias = -0.0003;
    sunLight.shadow.radius = quality === 'ultra' ? 3 : 1.5;

    this.scene.add(sunLight);
    this.dirLight = sunLight;

    // 4. Moon Light
    const moon = new THREE.DirectionalLight(0x8faaff, 0.2);
    moon.castShadow = false;
    this.scene.add(moon);
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
    // Advance Day-Night cycle
    this.timeOfDay = (this.timeOfDay + delta * this.timeScale) % 24.0;

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
      if (this.ambientLight) this.ambientLight.color.set('#ffab6b');
      if (this.dirLight) this.dirLight.color.set('#ffaa44');
      if (this.fog) this.fog.color.set('#f37335');
    } else if (isDay) {
      cTop.set('#2980b9'); // Emerald Zelda Sky Blue
      cBottom.set('#87ceeb');
      if (this.ambientLight) this.ambientLight.color.set('#ffffff');
      if (this.dirLight) this.dirLight.color.set('#fffce6');
      if (this.fog) this.fog.color.set('#87ceeb');
    } else {
      // Night
      cTop.set('#050b14');
      cBottom.set('#0f2027');
      if (this.ambientLight) this.ambientLight.color.set('#1a2638');
      if (this.dirLight) this.dirLight.color.set('#3a506b');
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
