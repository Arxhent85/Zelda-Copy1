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
} from 'lucide-react';

interface StarFoxGameProps {
  onBackToMenu: () => void;
}

export const StarFoxGame: React.FC<StarFoxGameProps> = ({ onBackToMenu }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<StarFoxEngine | null>(null);

  const [gameState, setGameState] = useState<StarFoxState>({
    shield: 100,
    maxShield: 100,
    boostHeat: 0,
    isOverheated: false,
    smartBombs: 3,
    score: 0,
    hits: 0,
    speed: 105,
    progressPercent: 0,
    dialogue: {
      speaker: 'COMMANDER VANCE',
      text: 'All wings report in! Maintain low ceiling across the Hyrule Bay to evade long-range radar.',
      visible: true,
    },
    isMissionComplete: false,
    isGameOver: false,
    shieldActive: false,
  });

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Steering Mode: 'touch' (Virtual Stick) vs 'tilt' (Phone Gyroscope / Neigung)
  const [steeringMode, setSteeringMode] = useState<'touch' | 'tilt'>('touch');
  const [tiltCalibrated, setTiltCalibrated] = useState(false);
  const neutralTilt = useRef<{ beta: number; gamma: number }>({ beta: 45, gamma: 0 });
  const rawTiltValues = useRef<{ beta: number; gamma: number }>({ beta: 0, gamma: 0 });

  // Virtual Joystick touch state (Touch Mode)
  const [joystickActive, setJoystickActive] = useState(false);
  const [joystickOrigin, setJoystickOrigin] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [joystickPos, setJoystickPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const activeTouchId = useRef<number | null>(null);

  // Key states for double-tap detection (Barrel Roll)
  const lastKeyTime = useRef<{ [key: string]: number }>({});

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
    const handleFSChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  // -------------------------------------------------------------
  // GYROSCOPE / PHONE TILT STEERING
  // -------------------------------------------------------------
  const calibrateTilt = useCallback(() => {
    neutralTilt.current = {
      beta: rawTiltValues.current.beta,
      gamma: rawTiltValues.current.gamma,
    };
    setTiltCalibrated(true);
  }, []);

  const switchSteeringMode = async (mode: 'touch' | 'tilt') => {
    if (mode === 'tilt') {
      // iOS 13+ permission request
      if (
        typeof DeviceOrientationEvent !== 'undefined' &&
        typeof (DeviceOrientationEvent as any).requestPermission === 'function'
      ) {
        try {
          const permission = await (DeviceOrientationEvent as any).requestPermission();
          if (permission !== 'granted') {
            alert('Sensor-Zugriff verweigert. Touch-Steuerung bleibt aktiv.');
            return;
          }
        } catch {
          // Fallback if rejected
        }
      }
      setSteeringMode('tilt');
      // Reset input when switching
      if (engineRef.current) {
        engineRef.current.inputYawRoll = 0;
        engineRef.current.inputPitch = 0;
      }
      setTimeout(calibrateTilt, 150);
    } else {
      setSteeringMode('touch');
      if (engineRef.current) {
        engineRef.current.inputYawRoll = 0;
        engineRef.current.inputPitch = 0;
      }
    }
  };

  useEffect(() => {
    const handleOrientation = (e: DeviceOrientationEvent) => {
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;
      rawTiltValues.current = { beta, gamma };

      if (steeringMode !== 'tilt' || !engineRef.current) return;

      // Detect screen orientation
      const screenAngle =
        typeof window.screen?.orientation?.angle === 'number'
          ? window.screen.orientation.angle
          : typeof window.orientation === 'number'
          ? (window.orientation as number)
          : 0;

      let deltaRoll = 0;
      let deltaPitch = 0;

      if (screenAngle === 90) {
        // Landscape (Held rotated 90 deg counter-clockwise)
        // Tilting phone left/right corresponds to -beta
        deltaRoll = -(beta - neutralTilt.current.beta);
        // Tilting phone up/down corresponds to gamma
        deltaPitch = gamma - neutralTilt.current.gamma;
      } else if (screenAngle === -90 || screenAngle === 270) {
        // Landscape (Held rotated 90 deg clockwise)
        deltaRoll = beta - neutralTilt.current.beta;
        deltaPitch = -(gamma - neutralTilt.current.gamma);
      } else {
        // Portrait or unknown
        deltaRoll = gamma - neutralTilt.current.gamma;
        deltaPitch = -(beta - neutralTilt.current.beta);
      }

      // Max tilt angle sensitivity (approx 28 degrees gives full deflection)
      const maxTilt = 28.0;
      const deadzone = 2.5;

      let normRoll = 0;
      if (Math.abs(deltaRoll) > deadzone) {
        normRoll = (deltaRoll - Math.sign(deltaRoll) * deadzone) / (maxTilt - deadzone);
      }

      let normPitch = 0;
      if (Math.abs(deltaPitch) > deadzone) {
        normPitch = (deltaPitch - Math.sign(deltaPitch) * deadzone) / (maxTilt - deadzone);
      }

      // Smooth clamping [-1, 1]
      normRoll = Math.max(-1, Math.min(1, normRoll));
      normPitch = Math.max(-1, Math.min(1, normPitch));

      // Right is positive, Left is negative
      // Up is positive, Down is negative
      engineRef.current.inputYawRoll = normRoll;
      engineRef.current.inputPitch = normPitch;
    };

    window.addEventListener('deviceorientation', handleOrientation, true);
    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [steeringMode]);

  // -------------------------------------------------------------
  // GAME ENGINE LIFECYCLE & INPUT
  // -------------------------------------------------------------
  useEffect(() => {
    if (!canvasRef.current) return;

    const engine = new StarFoxEngine(canvasRef.current);
    engineRef.current = engine;

    engine.onStateUpdate = (newState) => {
      setGameState(newState);
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

    // Keyboard bindings
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!engineRef.current) return;
      const now = performance.now();

      // W / Up = pitch up (+1), S / Down = pitch down (-1)
      if (e.code === 'KeyW' || e.code === 'ArrowUp') {
        engineRef.current.inputPitch = 1.0;
      } else if (e.code === 'KeyS' || e.code === 'ArrowDown') {
        engineRef.current.inputPitch = -1.0;
      }

      // A / Left = steer left (-1), D / Right = steer right (+1)
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

      if (e.code === 'KeyQ') {
        engineRef.current.triggerBarrelRoll('left');
      } else if (e.code === 'KeyE') {
        engineRef.current.triggerBarrelRoll('right');
      }

      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        engineRef.current.isBoosting = true;
      }
      if (e.code === 'ControlLeft' || e.code === 'KeyX') {
        engineRef.current.isBraking = true;
      }

      if (e.code === 'Space') {
        engineRef.current.isFiring = true;
        engineRef.current.fireWeapon(false);
      }

      if (e.code === 'KeyB' || e.code === 'KeyF') {
        engineRef.current.launchSmartBomb();
      }

      if (e.code === 'Escape') {
        onBackToMenu();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!engineRef.current) return;
      if (e.code === 'KeyW' || e.code === 'ArrowUp' || e.code === 'KeyS' || e.code === 'ArrowDown') {
        engineRef.current.inputPitch = 0;
      }
      if (e.code === 'KeyA' || e.code === 'ArrowLeft' || e.code === 'KeyD' || e.code === 'ArrowRight') {
        engineRef.current.inputYawRoll = 0;
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        engineRef.current.isBoosting = false;
      }
      if (e.code === 'ControlLeft' || e.code === 'KeyX') {
        engineRef.current.isBraking = false;
      }
      if (e.code === 'Space') {
        engineRef.current.isFiring = false;
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (!engineRef.current) return;
      if (e.button === 0) {
        engineRef.current.isFiring = true;
        engineRef.current.fireWeapon(false);
      } else if (e.button === 2) {
        engineRef.current.launchSmartBomb();
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (!engineRef.current) return;
      if (e.button === 0) {
        engineRef.current.isFiring = false;
      }
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
  // TOUCH STEERING / VIRTUAL JOYSTICK HANDLERS
  // -------------------------------------------------------------
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (steeringMode !== 'touch') return;

    // Only capture touches on left 65% of screen
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      if (touch.clientX < window.innerWidth * 0.65 && activeTouchId.current === null) {
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
        const deltaX = touch.clientX - joystickOrigin.x;
        const deltaY = touch.clientY - joystickOrigin.y;
        const maxDist = 65; // Max joystick radius
        const dist = Math.hypot(deltaX, deltaY);

        let clampedX = deltaX;
        let clampedY = deltaY;

        if (dist > maxDist) {
          clampedX = (deltaX / dist) * maxDist;
          clampedY = (deltaY / dist) * maxDist;
        }

        setJoystickPos({
          x: joystickOrigin.x + clampedX,
          y: joystickOrigin.y + clampedY,
        });

        // Proportional steering:
        // Horizontal: right = +1, left = -1
        const rawYaw = clampedX / maxDist;
        // Vertical: dragging UP pulls nose UP (+1), dragging DOWN pushes nose DOWN (-1)
        const rawPitch = -clampedY / maxDist;

        // Apply deadzone of 0.08
        engineRef.current.inputYawRoll = Math.abs(rawYaw) > 0.08 ? rawYaw : 0;
        engineRef.current.inputPitch = Math.abs(rawPitch) > 0.08 ? rawPitch : 0;
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
    if (engineRef.current) {
      engineRef.current.restart();
    }
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
      {/* VIRTUAL JOYSTICK INDICATOR (Appears in Touch Mode)             */}
      {/* ------------------------------------------------------------- */}
      {steeringMode === 'touch' && joystickActive && (
        <div
          className="fixed pointer-events-none z-30 transform -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${joystickOrigin.x}px`, top: `${joystickOrigin.y}px` }}
        >
          {/* Outer Ring Base */}
          <div className="w-32 h-32 rounded-full border-2 border-cyan-400/50 bg-cyan-950/40 backdrop-blur-sm flex items-center justify-center shadow-lg shadow-cyan-500/20">
            {/* Cross guides */}
            <div className="absolute w-full h-[1px] bg-cyan-400/30" />
            <div className="absolute h-full w-[1px] bg-cyan-400/30" />
          </div>

          {/* Draggable Inner Nub */}
          <div
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-400 border-2 border-white shadow-xl shadow-cyan-400/60"
            style={{
              transform: `translate(calc(-50% + ${joystickPos.x - joystickOrigin.x}px), calc(-50% + ${joystickPos.y - joystickOrigin.y}px))`,
            }}
          />
        </div>
      )}

      {/* Tilt Indicator Banner (In Tilt Mode) */}
      {steeringMode === 'tilt' && (
        <div className="absolute bottom-24 left-6 pointer-events-auto z-30 flex items-center gap-2">
          <button
            onClick={calibrateTilt}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-600/80 hover:bg-cyan-500 text-white text-xs font-bold border border-cyan-300/40 shadow-lg backdrop-blur-md active:scale-95 transition"
            title="Aktuelle Neigung als Nullpunkt zentrieren"
          >
            <Compass className="h-4 w-4 animate-spin-slow" />
            <span>Neigung Kalibrieren</span>
          </button>
        </div>
      )}

      {/* Left Touch Steering Hint on Mobile */}
      {steeringMode === 'touch' && !joystickActive && (
        <div className="absolute bottom-10 left-8 pointer-events-none sm:hidden flex items-center gap-2 bg-slate-950/60 backdrop-blur-sm border border-cyan-500/30 px-3 py-1.5 rounded-full text-[10px] text-cyan-300 font-bold">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
          Links wischen zum Steuern
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* TOP HEADER & CONTROLS                                         */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none z-20">
        {/* Left Telemetry (Hidden on small screens) */}
        <div className="hidden sm:block bg-slate-950/65 backdrop-blur-sm border border-cyan-500/30 rounded-xl px-3 py-1.5 text-[10px] font-mono text-cyan-300 shadow-md">
          <div className="flex items-center gap-1.5 font-bold text-white">
            <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            HYRULE BAY CORRIDOR
          </div>
          <div className="text-slate-400">
            VELOCITY: <span className="text-amber-400 font-bold">{gameState.speed} KTS</span>
          </div>
        </div>

        {/* Center Mission Banner */}
        <div className="bg-slate-950/75 backdrop-blur-md px-3 sm:px-6 py-1 rounded-full border border-cyan-500/40 text-center shadow-lg shadow-cyan-500/20">
          <div className="text-[10px] sm:text-xs tracking-widest font-black text-cyan-400">
            STAR FOX: NEW CORNERIA BAY
          </div>
          <div className="text-[8px] sm:text-[9px] tracking-wider text-slate-300 font-medium">
            HYRULE CANYON FLIGHT
          </div>
        </div>

        {/* Right Top Controls: Steering Mode Switcher + Score + Fullscreen + Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          {/* STEERING MODE TOGGLE BUTTON */}
          <div className="flex bg-slate-950/80 p-0.5 rounded-xl border border-cyan-500/40 shadow-md">
            <button
              onClick={() => switchSteeringMode('touch')}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition ${
                steeringMode === 'touch'
                  ? 'bg-cyan-500 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Steuerung per virtuellem Touch-Joystick"
            >
              <Gamepad2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Touch</span>
            </button>

            <button
              onClick={() => switchSteeringMode('tilt')}
              className={`flex items-center gap-1 px-2 sm:px-2.5 py-1 rounded-lg text-[10px] sm:text-xs font-bold transition ${
                steeringMode === 'tilt'
                  ? 'bg-gradient-to-r from-cyan-400 to-blue-400 text-slate-950 shadow-sm'
                  : 'text-slate-300 hover:text-white'
              }`}
              title="Steuerung durch Neigen des Smartphones (Gyroscope)"
            >
              <Smartphone className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Neigung</span>
            </button>
          </div>

          {/* Score Badge */}
          <div className="bg-slate-950/75 backdrop-blur-sm border border-cyan-500/30 rounded-xl px-2.5 sm:px-3 py-1 font-mono text-right shadow-md">
            <div className="text-[8px] text-slate-400">SCORE</div>
            <div className="text-xs sm:text-sm font-black text-amber-300 leading-none">
              {gameState.score.toString().padStart(6, '0')}
            </div>
          </div>

          {/* VOLLBILD (FULLSCREEN) BUTTON */}
          <button
            onClick={toggleFullscreen}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-cyan-300 hover:text-white border border-cyan-500/40 shadow-lg active:scale-95 transition flex items-center gap-1 text-xs font-bold"
            title={isFullscreen ? 'Vollbild beenden' : 'Vollbild aktivieren'}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            <span className="hidden md:inline">{isFullscreen ? 'Normal' : 'Vollbild'}</span>
          </button>

          {/* Menü Button */}
          <button
            onClick={onBackToMenu}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700 hover:border-cyan-400 shadow-lg active:scale-95 transition flex items-center gap-1 text-xs font-bold"
            title="Zurück zum Hauptmenü / Spielauswahl"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden md:inline">Menü</span>
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* CENTER RETICLE / CROSSHAIR                                    */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="relative w-16 h-16 sm:w-20 sm:h-20 border border-cyan-400/50 rounded-full flex items-center justify-center animate-spin-slow">
          <div className="w-8 h-8 sm:w-10 sm:h-10 border-2 border-cyan-300 rounded-sm" />
          <div className="absolute w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
          <div className="absolute w-1 h-1 bg-white rounded-full" />
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* BOTTOM-LEFT VITAL GAUGES: SHIELD, BOOST-HEAT & SMART BOMBS    */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute bottom-4 left-3 sm:bottom-6 sm:left-6 pointer-events-none max-w-[210px] sm:max-w-xs w-full bg-slate-950/75 backdrop-blur-md border border-cyan-500/30 rounded-2xl p-2.5 sm:p-4 shadow-xl text-white space-y-2">
        {/* SHIELD BAR */}
        <div>
          <div className="flex justify-between items-center text-[9px] sm:text-[10px] font-bold tracking-wider text-cyan-400 mb-0.5">
            <span className="flex items-center gap-1">
              <Shield className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> SHIELD
            </span>
            <span className={gameState.shield < 30 ? 'text-red-400 animate-pulse' : 'text-cyan-300'}>
              {Math.max(0, Math.round(gameState.shield))}%
            </span>
          </div>
          <div className="w-full h-2 sm:h-3 bg-slate-800 rounded-full overflow-hidden border border-slate-700/80 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-150 ${
                gameState.shield < 30
                  ? 'bg-gradient-to-r from-red-600 to-rose-400'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-400'
              }`}
              style={{ width: `${Math.max(0, Math.min(100, gameState.shield))}%` }}
            />
          </div>
        </div>

        {/* BOOST HEAT GAUGE */}
        <div>
          <div className="flex justify-between items-center text-[9px] sm:text-[10px] font-bold tracking-wider text-amber-400 mb-0.5">
            <span className="flex items-center gap-1">
              <Flame className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> BOOST HEAT
            </span>
            <span className={gameState.isOverheated ? 'text-red-500 font-black animate-pulse' : 'text-amber-300'}>
              {gameState.isOverheated ? 'OVERHEAT!' : `${Math.round(gameState.boostHeat * 100)}%`}
            </span>
          </div>
          <div className="w-full h-1.5 sm:h-2.5 bg-slate-800 rounded-full overflow-hidden border border-slate-700/80 p-0.5">
            <div
              className={`h-full rounded-full transition-all duration-100 ${
                gameState.isOverheated
                  ? 'bg-red-500 animate-pulse'
                  : 'bg-gradient-to-r from-amber-400 via-orange-400 to-red-500'
              }`}
              style={{ width: `${Math.round(gameState.boostHeat * 100)}%` }}
            />
          </div>
        </div>

        {/* SMART BOMB ICONS */}
        <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
          <div className="text-[8px] sm:text-[10px] font-bold text-slate-400 tracking-wider">BOMBS:</div>
          <div className="flex items-center gap-1">
            {[1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`w-5 h-5 sm:w-7 sm:h-7 rounded flex items-center justify-center border transition ${
                  idx <= gameState.smartBombs
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300 shadow-md shadow-amber-500/20'
                    : 'bg-slate-900 border-slate-800 text-slate-600'
                }`}
              >
                <Bomb className="h-3 w-3 sm:h-4 sm:w-4" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* RADIO DIALOGUE BOX (COMMANDER VANCE)                          */}
      {/* ------------------------------------------------------------- */}
      {gameState.dialogue && gameState.dialogue.visible && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 pointer-events-none w-full max-w-lg px-3 animate-fade-in z-20">
          <div className="bg-slate-950/85 backdrop-blur-xl border border-cyan-500/40 rounded-2xl p-2.5 sm:p-3 shadow-2xl flex items-center gap-2.5 sm:gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-cyan-950/80 border border-cyan-400/50 flex flex-col items-center justify-center shrink-0 relative overflow-hidden">
              <Radio className="h-5 w-5 text-cyan-300 animate-pulse" />
              <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/20 to-transparent" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] sm:text-xs font-black tracking-widest text-cyan-300 uppercase">
                  {gameState.dialogue.speaker}
                </span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              </div>
              <p className="text-[11px] sm:text-xs text-slate-100 font-medium leading-snug mt-0.5">
                "{gameState.dialogue.text}"
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* BOTTOM-RIGHT ACTION BUTTONS (MOBILE OPTIMIZED TOUCH CLUSTER) */}
      {/* ------------------------------------------------------------- */}
      <div className="absolute bottom-4 right-3 sm:bottom-6 sm:right-6 flex flex-col items-end gap-2 pointer-events-auto z-30">
        <div className="flex items-center gap-1.5 sm:gap-2">
          {/* BARREL ROLL */}
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              engineRef.current?.triggerBarrelRoll('left');
            }}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-cyan-600/85 hover:bg-cyan-500 active:scale-90 text-white flex flex-col items-center justify-center border border-cyan-300/40 shadow-lg shadow-cyan-600/30 transition text-[8px] sm:text-[9px] font-bold touch-none"
            title="Barrel Roll (Q / E oder Doppel-A/D)"
          >
            <RotateCw className="h-4 w-4 sm:h-5 sm:w-5 mb-0.5" />
            <span>ROLL</span>
          </button>

          {/* SMART BOMB */}
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              engineRef.current?.launchSmartBomb();
            }}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-amber-600/85 hover:bg-amber-500 active:scale-90 text-white flex flex-col items-center justify-center border border-amber-300/40 shadow-lg shadow-amber-600/30 transition text-[8px] sm:text-[9px] font-bold touch-none"
            title="Smart Bomb (B / F)"
          >
            <Bomb className="h-4 w-4 sm:h-5 sm:w-5 mb-0.5" />
            <span>BOMB</span>
          </button>

          {/* BRAKE */}
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              if (engineRef.current) engineRef.current.isBraking = true;
            }}
            onPointerUp={() => {
              if (engineRef.current) engineRef.current.isBraking = false;
            }}
            className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-rose-700/85 hover:bg-rose-600 active:scale-90 text-white flex flex-col items-center justify-center border border-rose-300/40 shadow-lg shadow-rose-600/30 transition text-[8px] sm:text-[9px] font-bold touch-none"
            title="Airbrake (Strg / X)"
          >
            <Octagon className="h-4 w-4 sm:h-5 sm:w-5 mb-0.5" />
            <span>BRAKE</span>
          </button>

          {/* BOOST */}
          <button
            onPointerDown={(e) => {
              e.stopPropagation();
              if (engineRef.current) engineRef.current.isBoosting = true;
            }}
            onPointerUp={() => {
              if (engineRef.current) engineRef.current.isBoosting = false;
            }}
            className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-gradient-to-t from-orange-600 to-amber-500 hover:brightness-110 active:scale-90 text-white flex flex-col items-center justify-center border border-amber-300/50 shadow-xl shadow-orange-600/30 transition text-[9px] sm:text-[10px] font-black touch-none"
            title="Boost Thruster (Shift)"
          >
            <Flame className="h-5 w-5 sm:h-6 sm:w-6" />
            <span>BOOST</span>
          </button>

          {/* FIRE / CHARGE */}
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
            className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-t from-cyan-600 to-blue-500 hover:brightness-110 active:scale-90 text-white flex flex-col items-center justify-center border-2 border-cyan-300 shadow-xl shadow-cyan-500/40 transition text-[10px] sm:text-xs font-black touch-none"
            title="Laser abfeuern / Halten für Charge-Shot"
          >
            <Crosshair className="h-6 w-6 sm:h-7 sm:w-7" />
            <span>FIRE</span>
          </button>
        </div>

        {/* Desktop Controls Hint */}
        <div className="hidden lg:block text-right text-[10px] text-slate-400 font-mono bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800">
          <span className="text-cyan-300 font-bold">W/A/S/D</span>: Steuern •{' '}
          <span className="text-cyan-300 font-bold">Q/E</span>: Roll •{' '}
          <span className="text-cyan-300 font-bold">Shift</span>: Boost •{' '}
          <span className="text-cyan-300 font-bold">Space</span>: Laser •{' '}
          <span className="text-cyan-300 font-bold">B</span>: Bombe
        </div>
      </div>

      {/* ------------------------------------------------------------- */}
      {/* GAME OVER OVERLAY                                             */}
      {/* ------------------------------------------------------------- */}
      {gameState.isGameOver && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl z-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in pointer-events-auto">
          <h1 className="text-4xl sm:text-7xl font-black text-red-500 tracking-widest drop-shadow-[0_0_25px_rgba(239,68,68,0.5)]">
            MISSION FAILED
          </h1>
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
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 px-6 sm:px-8 py-3 text-sm sm:text-base font-bold text-white shadow-xl shadow-cyan-600/30 active:scale-95 transition"
            >
              <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" /> Erneut versuchen
            </button>

            <button
              onClick={onBackToMenu}
              className="flex items-center gap-2 rounded-full bg-slate-800 hover:bg-slate-700 px-5 sm:px-6 py-3 text-sm sm:text-base font-bold text-slate-300 hover:text-white active:scale-95 transition"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" /> Hauptmenü
            </button>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* MISSION COMPLETE OVERLAY                                      */}
      {/* ------------------------------------------------------------- */}
      {gameState.isMissionComplete && (
        <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-2xl z-50 flex flex-col items-center justify-center p-6 text-center animate-fade-in pointer-events-auto">
          <h1 className="text-4xl sm:text-7xl font-black text-cyan-400 tracking-widest drop-shadow-[0_0_30px_rgba(0,240,255,0.6)]">
            MISSION ACCOMPLISHED
          </h1>
          <p className="mt-2 text-xs sm:text-base text-slate-300 font-medium">
            Hyrule Bay perimeter successfully cleared!
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
              className="flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 px-6 sm:px-8 py-3 text-sm sm:text-base font-bold text-white shadow-xl shadow-cyan-600/30 active:scale-95 transition"
            >
              <RefreshCw className="h-4 w-4 sm:h-5 sm:w-5" /> Flug wiederholen
            </button>

            <button
              onClick={onBackToMenu}
              className="flex items-center gap-2 rounded-full bg-slate-800 hover:bg-slate-700 px-5 sm:px-6 py-3 text-sm sm:text-base font-bold text-slate-300 hover:text-white active:scale-95 transition"
            >
              <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" /> Spielauswahl
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
