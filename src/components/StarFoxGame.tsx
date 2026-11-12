import React, { useRef, useEffect, useState, useCallback } from 'react';
import { StarFoxEngine, StarFoxState } from '../game/starfox/StarFoxEngine';
import { starFoxAudio } from '../game/starfox/StarFoxAudio';
import {
  Flame,
  Shield,
  Bomb,
  RotateCw,
  Crosshair,
  ArrowLeft,
  RefreshCw,
  Maximize,
  Minimize,
  Radio,
  Octagon,
  Smartphone,
  Gamepad2,
  Compass,
  Zap,
  AlertTriangle,
} from 'lucide-react';

interface StarFoxGameProps {
  onBackToMenu: () => void;
}

export const StarFoxGame: React.FC<StarFoxGameProps> = ({ onBackToMenu }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<StarFoxEngine | null>(null);

  // 60 FPS Reticle DOM refs (no React re-render per frame!)
  const reticleFarRef = useRef<HTMLDivElement>(null);
  const reticleFarBoxRef = useRef<HTMLDivElement>(null);
  const reticleFarDotRef = useRef<HTMLDivElement>(null);
  const reticleLockLabelRef = useRef<HTMLDivElement>(null);
  const reticleNearRef = useRef<HTMLDivElement>(null);
  const reticleNearRingRef = useRef<HTMLDivElement>(null);
  const tiltDotRef = useRef<HTMLDivElement>(null);

  const [gameState, setGameState] = useState<StarFoxState>({
    shield: 100,
    maxShield: 100,
    boostHeat: 0,
    isOverheated: false,
    smartBombs: 3,
    score: 0,
    hits: 0,
    speed: 58,
    progressPercent: 0,
    weaponLevel: 1,
    zoneName: 'CORNERIA OUTER BAY',
    bossHealth: null,
    isTargetLocked: false,
    dialogue: {
      speaker: 'COMMANDER VANCE',
      text: 'All wings! Corneria Skyscrapers ahead — weave through the towers and engage forward interceptors!',
      visible: true,
    },
    isMissionComplete: false,
    isGameOver: false,
    shieldActive: false,
  });

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoFire, setAutoFire] = useState(false);

  // Steering Mode: 'touch' vs 'tilt'
  const [steeringMode, setSteeringMode] = useState<'touch' | 'tilt'>('touch');
  const [sensorStatus, setSensorStatus] = useState<'idle' | 'checking' | 'active' | 'blocked'>('idle');
  const [invertTiltX, setInvertTiltX] = useState(false);
  const [invertTiltY, setInvertTiltY] = useState(false);

  const steeringModeRef = useRef<'touch' | 'tilt'>('touch');
  const sensorStatusRef = useRef<'idle' | 'checking' | 'active' | 'blocked'>('idle');
  const invertTiltXRef = useRef(false);
  const invertTiltYRef = useRef(false);

  const neutralTilt = useRef<{ roll: number; pitch: number }>({ roll: 0, pitch: 0 });
  const latestTilt = useRef<{ roll: number; pitch: number }>({ roll: 0, pitch: 0 });
  const smoothedDelta = useRef<{ roll: number; pitch: number }>({ roll: 0, pitch: 0 });
  const sensorSamplesRef = useRef<number>(0);

  // Virtual Joystick touch state
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickOrigin, setJoystickOrigin] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [joystickPos, setJoystickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeTouchId = useRef<number | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const lastKeyTime = useRef<{ [key: string]: number }>({});

  useEffect(() => {
    steeringModeRef.current = steeringMode;
  }, [steeringMode]);

  useEffect(() => {
    sensorStatusRef.current = sensorStatus;
  }, [sensorStatus]);

  useEffect(() => {
    invertTiltXRef.current = invertTiltX;
  }, [invertTiltX]);

  useEffect(() => {
    invertTiltYRef.current = invertTiltY;
  }, [invertTiltY]);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFSChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.autoFire = autoFire;
    }
  }, [autoFire]);

  // -------------------------------------------------------------
  // ROBUST SENSOR / GYROSCOPE + GRAVITY TILT STEERING (iOS + ANDROID BRAVE/CHROME)
  // -------------------------------------------------------------
  const calibrateTilt = useCallback(() => {
    neutralTilt.current = { ...latestTilt.current };
    smoothedDelta.current = { roll: 0, pitch: 0 };
    if (tiltDotRef.current) {
      tiltDotRef.current.style.transform = 'translate(-50%, -50%)';
    }
  }, []);

  const switchSteeringMode = async (mode: 'touch' | 'tilt') => {
    if (mode === 'tilt') {
      sensorSamplesRef.current = 0;
      smoothedDelta.current = { roll: 0, pitch: 0 };
      setSensorStatus('checking');
      sensorStatusRef.current = 'checking';

      let deniedByPrompt = false;
      // Safely try iOS / privacy browser permission APIs without throwing blocking alerts
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof (DeviceOrientationEvent as any).requestPermission === 'function'
      ) {
        try {
          const perm = await (DeviceOrientationEvent as any).requestPermission();
          if (perm === 'denied') deniedByPrompt = true;
        } catch {
          deniedByPrompt = true;
        }
      }

      if (
        typeof DeviceMotionEvent !== 'undefined' &&
        typeof (DeviceMotionEvent as any).requestPermission === 'function'
      ) {
        try {
          const permM = await (DeviceMotionEvent as any).requestPermission();
          if (permM === 'granted') deniedByPrompt = false;
        } catch {
          // ignore
        }
      }

      setSteeringMode('tilt');
      steeringModeRef.current = 'tilt';
      if (engineRef.current) {
        engineRef.current.inputYawRoll = 0;
        engineRef.current.inputPitch = 0;
      }

      // Check after 900ms if live sensor samples arrived (works cleanly across Android Brave/Chrome & iOS)
      window.setTimeout(() => {
        if (sensorSamplesRef.current > 0) {
          setSensorStatus('active');
          sensorStatusRef.current = 'active';
          calibrateTilt();
        } else {
          const next = deniedByPrompt ? 'blocked' : 'blocked';
          setSensorStatus(next);
          sensorStatusRef.current = next;
        }
      }, 900);
    } else {
      setSteeringMode('touch');
      steeringModeRef.current = 'touch';
      setSensorStatus('idle');
      sensorStatusRef.current = 'idle';
      if (engineRef.current) {
        engineRef.current.inputYawRoll = 0;
        engineRef.current.inputPitch = 0;
      }
    }
  };

  useEffect(() => {
    const wrap180 = (deg: number) => {
      let a = (((deg + 180) % 360) + 360) % 360 - 180;
      if (a < -180) a += 360;
      return a;
    };

    let lastSource: 'orientation' | 'motion' | 'w3c' | null = null;
    let lastOrientationMs = 0;

    const applyTiltSteering = (rollDeg: number, pitchDeg: number, source: 'orientation' | 'motion' | 'w3c') => {
      const now = performance.now();
      if (source === 'orientation') {
        lastOrientationMs = now;
        lastSource = 'orientation';
      } else if (source === 'motion' && lastSource === 'orientation' && now - lastOrientationMs < 500) {
        // Orientation events are active — avoid mixing incompatible euler vs atan2 angles
        sensorSamplesRef.current += 1;
        return;
      }

      latestTilt.current = { roll: rollDeg, pitch: pitchDeg };
      sensorSamplesRef.current += 1;

      if (steeringModeRef.current !== 'tilt' || !engineRef.current) return;
      if (sensorStatusRef.current !== 'active') {
        sensorStatusRef.current = 'active';
        setSensorStatus('active');
        // Auto-calibrate on first live sample so plane never jerks
        neutralTilt.current = { roll: rollDeg, pitch: pitchDeg };
        smoothedDelta.current = { roll: 0, pitch: 0 };
      }

      const rawDRoll = wrap180(rollDeg - neutralTilt.current.roll);
      const rawDPitch = wrap180(pitchDeg - neutralTilt.current.pitch);

      // Exponential moving average (EMA) low-pass filter to eliminate handheld micro-jitter
      const alpha = 0.24;
      smoothedDelta.current.roll += (rawDRoll - smoothedDelta.current.roll) * alpha;
      smoothedDelta.current.pitch += (rawDPitch - smoothedDelta.current.pitch) * alpha;

      const maxTilt = 22.0;
      const deadzone = 1.8;

      const shape = (delta: number) => {
        if (Math.abs(delta) < deadzone) return 0;
        const norm = (Math.abs(delta) - deadzone) / (maxTilt - deadzone);
        return Math.sign(delta) * Math.min(1, Math.pow(norm, 0.85));
      };

      const xSign = invertTiltXRef.current ? -1 : 1;
      const ySign = invertTiltYRef.current ? -1 : 1;

      const yaw = shape(smoothedDelta.current.roll) * xSign;
      const pitch = shape(smoothedDelta.current.pitch) * ySign;

      engineRef.current.inputYawRoll = yaw;
      engineRef.current.inputPitch = pitch;

      // Update live miniature horizon indicator dot directly via DOM ref (zero React overhead)
      if (tiltDotRef.current) {
        const px = yaw * 14;
        const py = -pitch * 14;
        tiltDotRef.current.style.transform = `translate(calc(-50% + ${px.toFixed(1)}px), calc(-50% + ${py.toFixed(1)}px))`;
      }
    };

    const getScreenAngle = () => {
      if (typeof window.screen?.orientation?.angle === 'number') {
        return window.screen.orientation.angle;
      }
      return typeof window.orientation === 'number' ? (window.orientation as number) : 0;
    };

    const handleOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null && e.gamma === null) return;
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;
      if (beta === 0 && gamma === 0) return;

      const angle = ((getScreenAngle() % 360) + 360) % 360;
      let rollDeg = 0;
      let pitchDeg = 0;

      if (angle === 90) {
        // Landscape primary (Home button / USB-C on right):
        // Tilting phone right (steering right) decreases beta, tilting forward/back changes gamma
        rollDeg = -beta;
        pitchDeg = gamma;
      } else if (angle === 270) {
        // Landscape secondary (rotated 180 deg)
        rollDeg = beta;
        pitchDeg = -gamma;
      } else if (angle === 180) {
        rollDeg = -gamma;
        pitchDeg = beta;
      } else {
        // Portrait
        rollDeg = gamma;
        pitchDeg = -beta;
      }

      applyTiltSteering(rollDeg, pitchDeg, 'orientation');
    };

    // Fallback: DeviceMotion gravity vector works on Android WebViews / privacy browsers where DeviceOrientation is muted
    const handleMotion = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (!g || g.x === null || g.y === null || g.z === null) return;
      const mag = Math.hypot(g.x, g.y, g.z);
      if (mag < 1.0) return;

      const angle = ((getScreenAngle() % 360) + 360) % 360;
      let rollDeg = 0;
      let pitchDeg = 0;
      const radToDeg = 180 / Math.PI;

      if (angle === 90) {
        rollDeg = Math.atan2(-g.y, Math.hypot(g.x, g.z)) * radToDeg;
        pitchDeg = Math.atan2(-g.z, g.x) * radToDeg;
      } else if (angle === 270) {
        rollDeg = Math.atan2(g.y, Math.hypot(g.x, g.z)) * radToDeg;
        pitchDeg = Math.atan2(-g.z, -g.x) * radToDeg;
      } else {
        rollDeg = Math.atan2(-g.x, Math.hypot(g.y, g.z)) * radToDeg;
        pitchDeg = Math.atan2(g.z, g.y) * radToDeg;
      }

      applyTiltSteering(rollDeg, pitchDeg, 'motion');
    };

    // Optional W3C Generic Sensor API fallback (Accelerometer)
    let w3cAccel: any = null;
    try {
      const AccelCtor = (window as any).Accelerometer;
      if (typeof AccelCtor === 'function') {
        w3cAccel = new AccelCtor({ frequency: 60 });
        w3cAccel.addEventListener('reading', () => {
          if (w3cAccel.x == null || w3cAccel.y == null || w3cAccel.z == null) return;
          if (lastSource === 'orientation' && performance.now() - lastOrientationMs < 500) return;
          const angle = ((getScreenAngle() % 360) + 360) % 360;
          const radToDeg = 180 / Math.PI;
          let rollDeg = 0;
          let pitchDeg = 0;
          if (angle === 90) {
            rollDeg = Math.atan2(-w3cAccel.y, Math.hypot(w3cAccel.x, w3cAccel.z)) * radToDeg;
            pitchDeg = Math.atan2(-w3cAccel.z, w3cAccel.x) * radToDeg;
          } else if (angle === 270) {
            rollDeg = Math.atan2(w3cAccel.y, Math.hypot(w3cAccel.x, w3cAccel.z)) * radToDeg;
            pitchDeg = Math.atan2(-w3cAccel.z, -w3cAccel.x) * radToDeg;
          } else {
            rollDeg = Math.atan2(-w3cAccel.x, Math.hypot(w3cAccel.y, w3cAccel.z)) * radToDeg;
            pitchDeg = Math.atan2(w3cAccel.z, w3cAccel.y) * radToDeg;
          }
          applyTiltSteering(rollDeg, pitchDeg, 'w3c');
        });
        w3cAccel.addEventListener('error', () => {
          w3cAccel = null;
        });
        w3cAccel.start();
      }
    } catch {
      w3cAccel = null;
    }

    window.addEventListener('deviceorientation', handleOrientation, true);
    window.addEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
    window.addEventListener('devicemotion', handleMotion, true);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
      window.removeEventListener('deviceorientationabsolute', handleOrientation as EventListener, true);
      window.removeEventListener('devicemotion', handleMotion, true);
      if (w3cAccel && typeof w3cAccel.stop === 'function') {
        try {
          w3cAccel.stop();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  // -------------------------------------------------------------
  // ENGINE LIFECYCLE & DESKTOP KEYBOARD INPUTS
  // -------------------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new StarFoxEngine(canvasRef.current);
    engineRef.current = engine;
    engine.autoFire = autoFire;

    engine.onStateUpdate = (newState) => {
      setGameState(newState);
    };

    let lastLockState = false;
    engine.onReticleUpdate = (nearX, nearY, farX, farY, locked) => {
      if (reticleFarRef.current) {
        reticleFarRef.current.style.left = `${farX.toFixed(2)}%`;
        reticleFarRef.current.style.top = `${farY.toFixed(2)}%`;
      }
      if (reticleNearRef.current) {
        reticleNearRef.current.style.left = `${nearX.toFixed(2)}%`;
        reticleNearRef.current.style.top = `${nearY.toFixed(2)}%`;
      }
      if (locked !== lastLockState) {
        lastLockState = locked;
        if (reticleFarBoxRef.current) {
          reticleFarBoxRef.current.className = `w-10 h-10 sm:w-12 sm:h-12 border-2 rounded-sm flex items-center justify-center transition-colors ${
            locked ? 'border-amber-400 scale-110 shadow-[0_0_16px_rgba(251,191,36,0.9)]' : 'border-cyan-400/70'
          }`;
        }
        if (reticleFarDotRef.current) {
          reticleFarDotRef.current.className = `w-1.5 h-1.5 rounded-full ${
            locked ? 'bg-red-500 animate-ping' : 'bg-cyan-300'
          }`;
        }
        if (reticleLockLabelRef.current) {
          reticleLockLabelRef.current.style.display = locked ? 'block' : 'none';
        }
        if (reticleNearRingRef.current) {
          reticleNearRingRef.current.className = `w-16 h-16 sm:w-20 sm:h-20 border rounded-full flex items-center justify-center ${
            locked ? 'border-red-400/80' : 'border-cyan-400/35'
          }`;
        }
      }
    };

    const handleFirstInteraction = () => {
      starFoxAudio.init();
      starFoxAudio.resume();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    engine.start();

    const handleResize = () => {
      if (canvasRef.current && engineRef.current) {
        engineRef.current.resize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (!engineRef.current) return;
      const now = performance.now();

      if (e.code === 'KeyW' || e.code === 'ArrowUp') engineRef.current.inputPitch = 1.0;
      else if (e.code === 'KeyS' || e.code === 'ArrowDown') engineRef.current.inputPitch = -1.0;

      if (e.code === 'KeyA' || e.code === 'ArrowLeft') {
        engineRef.current.inputYawRoll = -1.0;
        if (lastKeyTime.current['KeyA'] && now - lastKeyTime.current['KeyA'] < 260) {
          engineRef.current.triggerBarrelRoll('left');
        }
        lastKeyTime.current['KeyA'] = now;
      } else if (e.code === 'KeyD' || e.code === 'ArrowRight') {
        engineRef.current.inputYawRoll = 1.0;
        if (lastKeyTime.current['KeyD'] && now - lastKeyTime.current['KeyD'] < 260) {
          engineRef.current.triggerBarrelRoll('right');
        }
        lastKeyTime.current['KeyD'] = now;
      }

      if (e.code === 'KeyQ') engineRef.current.triggerBarrelRoll('left');
      else if (e.code === 'KeyE') engineRef.current.triggerBarrelRoll('right');

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') engineRef.current.isBoosting = true;
      if (e.code === 'ControlLeft' || e.code === 'KeyX') engineRef.current.isBraking = true;

      if (e.code === 'Space') {
        engineRef.current.isFiring = true;
        engineRef.current.fireWeapon(false);
      }

      if (e.code === 'KeyB' || e.code === 'KeyF') engineRef.current.launchSmartBomb();
      if (e.code === 'Escape') onBackToMenu();
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!engineRef.current) return;
      if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'KeyS' || e.code === 'ArrowDown') {
        engineRef.current.inputPitch = 0;
      }
      if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight') {
        engineRef.current.inputYawRoll = 0;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') engineRef.current.isBoosting = false;
      if (e.code === 'ControlLeft' || e.code === 'KeyX') engineRef.current.isBraking = false;
      if (e.code === 'Space') engineRef.current.isFiring = false;
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (!engineRef.current) return;
      if ((e.target as HTMLElement)?.closest('button')) return;
      if (e.button === 0) {
        engineRef.current.isFiring = true;
        engineRef.current.fireWeapon(false);
      } else if (e.button === 2) {
        engineRef.current.launchSmartBomb();
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!engineRef.current) return;
      if (e.button === 0) engineRef.current.isFiring = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('resize', handleResize);
      engine.dispose();
    };
  }, [onBackToMenu]);

  // -------------------------------------------------------------
  // AGILE FLOATING TOUCH JOYSTICK (WITH GLIDING ANCHOR & DOUBLE-TAP ROLL)
  // -------------------------------------------------------------
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (steeringMode !== 'touch') return;
    if ((e.target as HTMLElement)?.closest('button')) return;

    const now = performance.now();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX < window.innerWidth * 0.62 && activeTouchId.current === null) {
        // Double-tap left side triggers agile Barrel Roll!
        if (now - lastTapTimeRef.current < 260) {
          engineRef.current?.triggerBarrelRoll(touch.clientX < window.innerWidth * 0.3 ? 'left' : 'right');
        }
        lastTapTimeRef.current = now;

        activeTouchId.current = touch.identifier;
        setJoystickOrigin({ x: touch.clientX, y: touch.clientY });
        setJoystickPos({ x: touch.clientX, y: touch.clientY });
        setJoystickActive(true);
        break;
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (steeringMode !== 'touch' || activeTouchId.current === null || !engineRef.current) return;

    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === activeTouchId.current) {
        let originX = joystickOrigin.x;
        let originY = joystickOrigin.y;
        const deltaX = touch.clientX - originX;
        const deltaY = touch.clientY - originY;
        const maxDist = 42; // Crisp agile response radius!
        const glideThreshold = maxDist * 1.35;
        const dist = Math.hypot(deltaX, deltaY);

        // Floating anchor glide: never hit an invisible thumb wall!
        if (dist > glideThreshold) {
          const pull = (dist - glideThreshold) / dist;
          originX += deltaX * pull;
          originY += deltaY * pull;
          setJoystickOrigin({ x: originX, y: originY });
        }

        const newDx = touch.clientX - originX;
        const newDy = touch.clientY - originY;
        const newDist = Math.hypot(newDx, newDy);
        let clampedX = newDx;
        let clampedY = newDy;
        if (newDist > maxDist) {
          clampedX = (newDx / newDist) * maxDist;
          clampedY = (newDy / newDist) * maxDist;
        }

        setJoystickPos({ x: originX + clampedX, y: originY + clampedY });

        const applyCurve = (raw: number) => {
          const dz = 0.04;
          if (Math.abs(raw) < dz) return 0;
          const n = (Math.abs(raw) - dz) / (1 - dz);
          return Math.sign(raw) * Math.min(1, Math.pow(n, 0.82));
        };

        engineRef.current.inputYawRoll = applyCurve(clampedX / maxDist);
        engineRef.current.inputPitch = applyCurve(-clampedY / maxDist);
        break;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLDivElement>) => {
    if (steeringMode !== 'touch') return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.identifier === activeTouchId.current) {
        activeTouchId.current = null;
        setJoystickActive(false);
        if (engineRef.current) {
          engineRef.current.inputYawRoll = 0;
          engineRef.current.inputPitch = 0;
        }
        break;
      }
    }
  };

  const handleRestart = () => {
    engineRef.current?.restart();
  };

  return (
    <div
      className="relative w-screen h-screen overflow-hidden select-none bg-slate-950 font-sans touch-none"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      {/* 3D WebGL Canvas */}
      <canvas ref={canvasRef} className="w-full h-full block cursor-crosshair touch-none" onContextMenu={(e) => e.preventDefault()} />

      {/* ------------------------------------------------------------- */}
      {/* DYNAMIC 3D PROJECTED TWIN TARGETING RETICLES (60 FPS DOM REF) */}
      {/* Follows Arwing nose direction & turns Amber/Red on Target Lock */}
      {/* ------------------------------------------------------------- */}
      <div
        ref={reticleFarRef}
        className="absolute pointer-events-none z-10 -translate-x-1/2 -translate-y-1/2 will-change-[left,top]"
        style={{ left: '50%', top: '50%' }}
      >
        <div
          ref={reticleFarBoxRef}
          className="w-10 h-10 sm:w-12 sm:h-12 border-2 rounded-sm flex items-center justify-center transition-colors border-cyan-400/70"
        >
          <div ref={reticleFarDotRef} className="w-1.5 h-1.5 rounded-full bg-cyan-300" />
        </div>
        <div
          ref={reticleLockLabelRef}
          style={{ display: 'none' }}
          className="text-[8px] font-black tracking-widest text-amber-300 text-center mt-0.5 drop-shadow"
        >
          LOCK
        </div>
      </div>

      <div
        ref={reticleNearRef}
        className="absolute pointer-events-none z-10 -translate-x-1/2 -translate-y-1/2 will-change-[left,top]"
        style={{ left: '50%', top: '50%' }}
      >
        <div
          ref={reticleNearRingRef}
          className="w-16 h-16 sm:w-20 sm:h-20 border rounded-full flex items-center justify-center border-cyan-400/35"
        />
      </div>

      {/* ------------------------------------------------------------- */}
      {/* FLOATING VIRTUAL JOYSTICK INDICATOR (TOUCH MODE)              */}
      {/* ------------------------------------------------------------- */}
      {steeringMode === 'touch' && joystickActive && (
        <div
          className="fixed pointer-events-none z-30 transform -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${joystickOrigin.x}px`, top: `${joystickOrigin.y}px` }}
        >
          <div className="w-24 h-24 rounded-full border-2 border-cyan-400/55 bg-cyan-950/40 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <div className="absolute w-full h-[1px] bg-cyan-400/30" />
            <div className="absolute h-full w-[1px] bg-cyan-400/30" />
          </div>
          <div
            className="absolute top-1/2 left-1/2 w-11 h-11 rounded-full bg-gradient-to-tr from-cyan-400 to-blue-400 border-2 border-white shadow-xl shadow-cyan-400/60"
            style={{
              transform: `translate(calc(-50% + ${joystickPos.x - joystickOrigin.x}px), calc(-50% + ${joystickPos.y - joystickOrigin.y}px))`,
            }}
          />
        </div>
      )}

      {/* TILT STATUS / NON-BLOCKING BROWSER SENSOR HELPER */}
      {steeringMode === 'tilt' && sensorStatus === 'blocked' && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 max-w-md w-[92%] bg-amber-950/95 border border-amber-400/70 rounded-2xl p-3 shadow-2xl text-amber-100 pointer-events-auto">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-xs leading-snug">
              <div className="font-bold text-amber-300">Bewegungssensor vom Browser blockiert</div>
              <p className="mt-1 text-amber-100/90">
                Brave/Chrome blockiert standardmäßig Bewegungssensoren. Tippe oben links in der Adressleiste auf das{' '}
                <strong>Filter/Schloss-Symbol</strong> → <strong>Berechtigungen</strong> →{' '}
                <strong>Bewegungssensoren erlauben</strong>.
              </p>
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => switchSteeringMode('tilt')}
                  className="px-3 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-[11px]"
                >
                  Erneut prüfen
                </button>
                <button
                  onClick={() => switchSteeringMode('touch')}
                  className="px-3 py-1 rounded-lg bg-slate-800 text-white font-bold text-[11px]"
                >
                  Touch-Stick nutzen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {steeringMode === 'tilt' && sensorStatus === 'active' && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-auto z-30 flex items-center gap-1.5 bg-slate-950/85 backdrop-blur-md p-1.5 rounded-full border border-cyan-500/40 shadow-xl">
          {/* Live Tilt Horizon Indicator */}
          <div
            className="relative w-8 h-8 rounded-full border border-cyan-400/50 bg-slate-900/90 shrink-0 overflow-hidden"
            title="Live Neigungs-Horizont"
          >
            <div className="absolute top-1/2 left-0 right-0 h-[1px] bg-cyan-500/30" />
            <div className="absolute left-1/2 top-0 bottom-0 w-[1px] bg-cyan-500/30" />
            <div
              ref={tiltDotRef}
              className="absolute top-1/2 left-1/2 w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.9)]"
              style={{ transform: 'translate(-50%, -50%)' }}
            />
          </div>

          <button
            onClick={calibrateTilt}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-cyan-600 hover:bg-cyan-500 text-white text-[11px] font-bold active:scale-95 transition"
            title="Aktuelle Haltung als Nullpunkt setzen"
          >
            <Compass className="h-3.5 w-3.5" />
            <span>Kalibrieren</span>
          </button>

          <button
            onClick={() => setInvertTiltX((v) => !v)}
            className={`px-2 py-1.5 rounded-full text-[10px] font-black border transition active:scale-95 ${
              invertTiltX
                ? 'bg-amber-500 text-slate-950 border-amber-300'
                : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:text-white'
            }`}
            title="Links/Rechts umkehren"
          >
            X ↔
          </button>

          <button
            onClick={() => setInvertTiltY((v) => !v)}
            className={`px-2 py-1.5 rounded-full text-[10px] font-black border transition active:scale-95 ${
              invertTiltY
                ? 'bg-amber-500 text-slate-950 border-amber-300'
                : 'bg-slate-800/90 text-slate-300 border-slate-700 hover:text-white'
            }`}
            title="Hoch/Runter umkehren"
          >
            Y ↕
          </button>
        </div>
      )}

      {/* Mobile Touch Hint */}
      {steeringMode === 'touch' && !joystickActive && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 pointer-events-none sm:hidden flex items-center gap-2 bg-slate-950/65 backdrop-blur-sm border border-cyan-500/30 px-3 py-1 rounded-full text-[10px] text-cyan-300 font-bold">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          Links wischen: Steuern • Doppel-Tip: Roll
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TOP HEADER BAR                                                */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between pointer-events-none z-20 gap-2">
        {/* Left Telemetry */}
        <div className="hidden sm:block bg-slate-950/75 backdrop-blur-sm border border-cyan-500/35 rounded-xl px-3 py-1.5 text-[10px] font-mono text-cyan-300 shadow-md">
          <div className="flex items-center gap-1.5 font-bold text-white">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            {gameState.zoneName}
          </div>
          <div className="text-slate-400 flex items-center gap-3">
            <span>
              SPD: <span className="text-amber-400 font-bold">{gameState.speed} KTS</span>
            </span>
            <span>
              WPN: <span className="text-emerald-400 font-bold">LV.{gameState.weaponLevel}</span>
            </span>
            <span>
              DIST: <span className="text-cyan-300 font-bold">{gameState.progressPercent}%</span>
            </span>
          </div>
        </div>

        {/* Center Banner or Boss Health */}
        {gameState.bossHealth !== null ? (
          <div className="bg-rose-950/90 backdrop-blur-md px-4 py-1.5 rounded-2xl border border-rose-500/70 text-center shadow-lg min-w-[180px] sm:min-w-[260px]">
            <div className="text-[9px] sm:text-[10px] font-black tracking-widest text-rose-300">
              DREADNOUGHT BOSS • REACTORS
            </div>
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mt-1 border border-rose-400/40">
              <div
                className="h-full bg-gradient-to-r from-rose-600 to-amber-400 transition-all duration-150"
                style={{ width: `${gameState.bossHealth}%` }}
              />
            </div>
          </div>
        ) : (
          <div className="bg-slate-950/75 backdrop-blur-md px-3 sm:px-5 py-1 rounded-full border border-cyan-500/40 text-center shadow-lg shadow-cyan-500/20">
            <div className="text-[10px] sm:text-xs tracking-widest font-black text-cyan-400">
              STAR FOX × HYRULE SKY RAID
            </div>
            <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden mt-0.5">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 transition-all duration-300"
                style={{ width: `${gameState.progressPercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Right Top Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          {/* Auto-Fire Toggle */}
          <button
            onClick={() => setAutoFire((v) => !v)}
            className={`px-2 sm:px-2.5 py-1.5 rounded-xl border text-[10px] sm:text-xs font-bold flex items-center gap-1 shadow-md transition ${
              autoFire
                ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                : 'bg-slate-900/90 text-slate-300 border-slate-700 hover:text-white'
            }`}
            title="Dauerfeuer automatisch aktivieren"
          >
            <Zap className="h-3.5 w-3.5" />
            <span className="hidden md:inline">Auto-Fire</span>
          </button>

          {/* Touch vs Neigung Toggle */}
          <div className="flex bg-slate-950/85 p-0.5 rounded-xl border border-cyan-500/40 shadow-md">
            <button
              onClick={() => switchSteeringMode('touch')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition ${
                steeringMode === 'touch'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Touch-Joystick"
            >
              <Gamepad2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Touch</span>
            </button>
            <button
              onClick={() => switchSteeringMode('tilt')}
              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition ${
                steeringMode === 'tilt'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-400 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Bewegungssensor / Neigung"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Neigung</span>
            </button>
          </div>

          {/* Score */}
          <div className="bg-slate-950/75 backdrop-blur-sm border border-cyan-500/30 rounded-xl px-2 sm:px-3 py-1 font-mono text-right shadow-md">
            <div className="text-[8px] text-slate-400">SCORE</div>
            <div className="text-xs sm:text-sm font-black text-amber-300 leading-none">
              {gameState.score.toString().padStart(6, '0')}
            </div>
          </div>

          {/* Vollbild */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-cyan-300 hover:text-white border border-cyan-500/40 shadow-lg active:scale-95 transition flex items-center gap-1 text-xs font-bold"
            title={isFullscreen ? 'Vollbild beenden' : 'Vollbild aktivieren'}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          </button>

          {/* Menü */}
          <button
            onClick={onBackToMenu}
            className="p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 hover:border-cyan-400 shadow-lg active:scale-95 transition flex items-center gap-1 text-xs font-bold"
            title="Zurück zur Spielauswahl"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden md:inline">Menü</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* BOTTOM-LEFT VITAL GAUGES                                      */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute bottom-4 left-3 sm:bottom-6 sm:left-6 pointer-events-none max-w-[190px] sm:max-w-xs w-full bg-slate-950/75 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-2.5 sm:p-4 shadow-xl text-white space-y-2">
        <div>
          <div className="flex justify-between items-center text-[9px] sm:text-[10px] font-bold tracking-wider text-cyan-400 mb-0.5">
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> SHIELD
            </span>
            <span className={gameState.shield < 30 ? 'text-red-400 animate-pulse' : 'text-cyan-300'}>
              {Math.max(0, Math.round(gameState.shield))}%
            </span>
          </div>
          <div className="w-full h-2 sm:h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/80 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-150 ${
                gameState.shield < 30 ? 'bg-gradient-to-r from-red-600 to-rose-400' : 'bg-gradient-to-r from-cyan-500 to-blue-400'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, gameState.shield))}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex justify-between items-center text-[9px] sm:text-[10px] font-bold tracking-wider text-amber-400 mb-0.5">
            <span className="flex items-center gap-1">
              <Flame className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> BOOST HEAT
            </span>
            <span className={gameState.isOverheated ? 'text-red-500 font-black animate-pulse' : 'text-amber-300'}>
              {gameState.isOverheated ? 'OVERHEAT!' : `${Math.round(gameState.boostHeat * 100)}%`}
            </span>
          </div>
          <div className="w-full h-1.5 sm:h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700/80 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-100 ${
                gameState.isOverheated ? 'bg-red-500 animate-pulse' : 'bg-gradient-to-r from-amber-400 via-orange-400 to-red-500'
              }`}
              style={{ width: `${Math.round(gameState.boostHeat * 100)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
          <div className="text-[8px] sm:text-[10px] font-bold text-slate-400 tracking-wider">BOMBS:</div>
          <div className="flex items-center gap-1">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded flex items-center justify-center border transition ${
                  idx <= gameState.smartBombs
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-slate-900 border-slate-800 text-slate-600'
                }`}
              >
                <Bomb className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* RADIO DIALOGUE BOX                                            */}
      {/* ------------------------------------------------------------- */}
      {gameState.dialogue && gameState.dialogue.visible && sensorStatus !== 'blocked' && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 pointer-events-none w-full max-w-lg px-3 animate-fade-in z-20">
          <div className="bg-slate-950/85 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-2 sm:p-2.5 shadow-2xl flex items-center gap-2.5">
            <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-cyan-950/80 border border-cyan-400/50 flex items-center justify-center shrink-0">
              <Radio className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-300 animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[9px] sm:text-[11px] font-black tracking-widest text-cyan-300 uppercase">
                  {gameState.dialogue.speaker}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <p className="text-[10px] sm:text-xs text-slate-100 font-medium leading-snug mt-0.5">
                "{gameState.dialogue.text}"
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* BOTTOM-RIGHT ACTION CLUSTER                                   */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute bottom-4 right-3 sm:bottom-6 sm:right-6 flex flex-col items-end gap-2 pointer-events-auto z-30">
        <div className="flex items-center gap-1.5 sm:gap-2">
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              engineRef.current?.triggerBarrelRoll('left');
            }}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-cyan-600/85 hover:bg-cyan-500 active:scale-90 text-white flex flex-col items-center justify-center border border-cyan-300/40 shadow-lg transition text-[8px] sm:text-[9px] font-bold touch-none"
          >
            <RotateCw className="h-4 w-4 sm:h-5 sm:w-5 mb-0.5" />
            <span>ROLL</span>
          </button>

          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              engineRef.current?.launchSmartBomb();
            }}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-amber-600/85 hover:bg-amber-500 active:scale-90 text-white flex flex-col items-center justify-center border border-amber-300/40 shadow-lg transition text-[8px] sm:text-[9px] font-bold touch-none"
          >
            <Bomb className="h-4 w-4 sm:h-5 sm:w-5 mb-0.5" />
            <span>BOMB</span>
          </button>

          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              if (engineRef.current) engineRef.current.isBraking = true;
            }}
            onPointerUp={() => {
              if (engineRef.current) engineRef.current.isBraking = false;
            }}
            onPointerLeave={() => {
              if (engineRef.current) engineRef.current.isBraking = false;
            }}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-rose-700/85 hover:bg-rose-600 active:scale-90 text-white flex flex-col items-center justify-center border border-rose-300/40 shadow-lg transition text-[8px] sm:text-[9px] font-bold touch-none"
          >
            <Octagon className="h-4 w-4 sm:h-5 sm:w-5 mb-0.5" />
            <span>BRAKE</span>
          </button>

          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              if (engineRef.current) engineRef.current.isBoosting = true;
            }}
            onPointerUp={() => {
              if (engineRef.current) engineRef.current.isBoosting = false;
            }}
            onPointerLeave={() => {
              if (engineRef.current) engineRef.current.isBoosting = false;
            }}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-t from-orange-600 to-amber-500 hover:brightness-110 active:scale-90 text-white flex flex-col items-center justify-center border border-amber-300/50 shadow-xl transition text-[9px] sm:text-[10px] font-black touch-none"
          >
            <Flame className="h-5 w-5 sm:h-6 sm:w-6" />
            <span>BOOST</span>
          </button>

          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              if (engineRef.current) {
                engineRef.current.isFiring = true;
                engineRef.current.fireWeapon(false);
              }
            }}
            onPointerUp={() => {
              if (engineRef.current) engineRef.current.isFiring = false;
            }}
            onPointerLeave={() => {
              if (engineRef.current) engineRef.current.isFiring = false;
            }}
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-t from-cyan-600 to-blue-500 hover:brightness-110 active:scale-90 text-white flex flex-col items-center justify-center border-2 border-cyan-300 shadow-xl transition text-[10px] sm:text-xs font-black touch-none"
          >
            <Crosshair className="h-6 w-6 sm:h-7 sm:w-7" />
            <span>FIRE</span>
          </button>
        </div>

        <div className="hidden lg:block text-right text-[10px] text-slate-400 font-mono bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
          <span className="text-cyan-300 font-bold">W/A/S/D</span>: Steuern •{' '}
          <span className="text-cyan-300 font-bold">Q/E</span>: Roll •{' '}
          <span className="text-cyan-300 font-bold">Shift</span>: Boost •{' '}
          <span className="text-cyan-300 font-bold">Space</span>: Laser •{' '}
          <span className="text-cyan-300 font-bold">B</span>: Bombe
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* GAME OVER & VICTORY OVERLAYS                                  */}
      {/* ------------------------------------------------------------- */}
      {gameState.isGameOver && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl z-50 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
          <h1 className="text-4xl sm:text-7xl font-black text-red-500 tracking-widest">MISSION FAILED</h1>
          <p className="mt-2 text-xs sm:text-sm text-slate-400">Arwing Strikefighter down over Hyrule Bay.</p>
          <div className="mt-4 flex items-center gap-6 text-slate-300 font-mono text-xs sm:text-sm">
            <div>
              SCORE: <span className="text-amber-400 font-bold">{gameState.score}</span>
            </div>
            <div>
              HITS: <span className="text-cyan-400 font-bold">{gameState.hits}</span>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3 sm:gap-4">
            <button
              onClick={handleRestart}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 px-6 sm:px-8 py-3 text-sm sm:text-base font-bold text-white shadow-xl active:scale-95 transition"
            >
              <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" /> Erneut versuchen
            </button>
            <button
              onClick={onBackToMenu}
              className="flex items-center gap-2 rounded-full bg-slate-800 px-5 sm:px-6 py-3 text-sm sm:text-base font-bold text-slate-300 hover:text-white active:scale-95 transition"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" /> Hauptmenü
            </button>
          </div>
        </div>
      )}

      {gameState.isMissionComplete && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl z-50 flex flex-col items-center justify-center p-6 text-center pointer-events-auto">
          <h1 className="text-4xl sm:text-7xl font-black text-cyan-400 tracking-widest">MISSION ACCOMPLISHED</h1>
          <p className="mt-2 text-xs sm:text-base text-slate-300 font-medium">
            Hyrule & Corneria Bay cleared!
          </p>
          <div className="mt-4 bg-slate-900/80 border border-cyan-500/40 rounded-2xl p-4 sm:p-6 max-w-sm w-full font-mono text-left space-y-2 text-xs sm:text-sm">
            <div className="flex justify-between text-slate-400">
              <span>SCORE:</span>
              <span className="text-amber-300 font-bold">{gameState.score}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>HITS:</span>
              <span className="text-cyan-300 font-bold">{gameState.hits}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>SHIELD:</span>
              <span className="text-emerald-400 font-bold">{Math.round(gameState.shield)}%</span>
            </div>
            <div className="border-t border-slate-800 pt-2 flex justify-between text-white font-bold text-sm sm:text-base">
              <span>RANK:</span>
              <span className="text-amber-400">★ S-RANK ★</span>
            </div>
          </div>
          <div className="mt-6 flex items-center gap-3 sm:gap-4">
            <button
              onClick={handleRestart}
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 px-6 sm:px-8 py-3 text-sm sm:text-base font-bold text-white shadow-xl active:scale-95 transition"
            >
              <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" /> Flug wiederholen
            </button>
            <button
              onClick={onBackToMenu}
              className="flex items-center gap-2 rounded-full bg-slate-800 px-5 sm:px-6 py-3 text-sm sm:text-base font-bold text-slate-300 hover:text-white active:scale-95 transition"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" /> Spielauswahl
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
