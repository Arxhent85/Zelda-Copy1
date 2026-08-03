import React, { useRef, useState, useEffect } from 'react';
import { Sword, Wind, Zap, Shield, Target, Hand, Map, Package, Settings as SettingsIcon, Maximize, Minimize, Pickaxe, Hammer, RotateCw, Check, X, Plane } from 'lucide-react';

interface TouchControlsProps {
  onMove: (x: number, z: number) => void;
  onCameraRotate: (dx: number, dy: number) => void;
  onAttack: () => void;
  onJumpGlide: () => void;
  onFlyToggle?: () => void;
  onSprintDodge: (sprint: boolean) => void;
  onInteract: () => void;
  onLockOnToggle: () => void;
  onOpenMap: () => void;
  onOpenInventory: () => void;
  onOpenSettings: () => void;
  // Mining, Crafting & Building
  onMineHarvest?: () => void;
  onOpenCrafting?: () => void;
  isBuildModeActive?: boolean;
  onRotateBuildPreview?: () => void;
  onPlaceBuilding?: () => void;
  onCancelBuild?: () => void;
}

export const VirtualTouchControls: React.FC<TouchControlsProps> = ({
  onMove,
  onCameraRotate,
  onAttack,
  onJumpGlide,
  onFlyToggle,
  onSprintDodge,
  onInteract,
  onLockOnToggle,
  onOpenMap,
  onOpenInventory,
  onOpenSettings,
  onMineHarvest,
  onOpenCrafting,
  isBuildModeActive = false,
  onRotateBuildPreview,
  onPlaceBuilding,
  onCancelBuild,
}) => {
  // Joystick State
  const joystickTouchId = useRef<number | null>(null);
  const joystickOrigin = useRef<{ x: number; y: number } | null>(null);
  const [joystickCenter, setJoystickCenter] = useState<{ x: number; y: number } | null>(null);
  const [knobOffset, setKnobOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Camera Touch State
  const cameraTouchId = useRef<number | null>(null);
  const lastCameraPos = useRef<{ x: number; y: number } | null>(null);

  const [isSprinting, setIsSprinting] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const handleFSChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFSChange);
    return () => document.removeEventListener('fullscreenchange', handleFSChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Left Side Touch Handler (Joystick)
  const handleLeftTouchStart = (e: React.TouchEvent) => {
    // Stop event propagation if touching left area
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      // Only capture if left half of screen
      if (touch.clientX < window.innerWidth * 0.5 && joystickTouchId.current === null) {
        joystickTouchId.current = touch.identifier;
        joystickOrigin.current = { x: touch.clientX, y: touch.clientY };
        setJoystickCenter({ x: touch.clientX, y: touch.clientY });
        setKnobOffset({ x: 0, y: 0 });
        break;
      }
    }
  };

  // Right Side Touch Handler (Camera Look)
  const handleRightTouchStart = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const touch = e.changedTouches[i];
      // Capture if right half of screen
      if (touch.clientX >= window.innerWidth * 0.5 && cameraTouchId.current === null) {
        cameraTouchId.current = touch.identifier;
        lastCameraPos.current = { x: touch.clientX, y: touch.clientY };
        break;
      }
    }
  };

  // Global Touch Move & End Listeners
  useEffect(() => {
    const handleTouchMove = (e: TouchEvent) => {
      // 1. Process Joystick Touch
      if (joystickTouchId.current !== null && joystickOrigin.current) {
        for (let i = 0; i < e.touches.length; i++) {
          const touch = e.touches[i];
          if (touch.identifier === joystickTouchId.current) {
            const dx = touch.clientX - joystickOrigin.current.x;
            const dy = touch.clientY - joystickOrigin.current.y;
            const dist = Math.hypot(dx, dy);
            const maxRadius = 50;

            const clampedDist = Math.min(dist, maxRadius);
            const angle = Math.atan2(dy, dx);

            const kx = Math.cos(angle) * clampedDist;
            const ky = Math.sin(angle) * clampedDist;
            setKnobOffset({ x: kx, y: ky });

            // Normalized (-1 to 1) for physics move
            const nx = (Math.cos(angle) * clampedDist) / maxRadius;
            const ny = (Math.sin(angle) * clampedDist) / maxRadius;
            // ny is positive going down screen, so -ny is forward (up)
            onMove(nx, -ny);
            break;
          }
        }
      }

      // 2. Process Camera Touch
      if (cameraTouchId.current !== null && lastCameraPos.current) {
        for (let i = 0; i < e.touches.length; i++) {
          const touch = e.touches[i];
          if (touch.identifier === cameraTouchId.current) {
            const dx = touch.clientX - lastCameraPos.current.x;
            const dy = touch.clientY - lastCameraPos.current.y;

            onCameraRotate(dx, dy);
            lastCameraPos.current = { x: touch.clientX, y: touch.clientY };
            break;
          }
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === joystickTouchId.current) {
          joystickTouchId.current = null;
          joystickOrigin.current = null;
          setJoystickCenter(null);
          setKnobOffset({ x: 0, y: 0 });
          onMove(0, 0);
        }
        if (touch.identifier === cameraTouchId.current) {
          cameraTouchId.current = null;
          lastCameraPos.current = null;
        }
      }
    };

    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    window.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
      window.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [onMove, onCameraRotate]);

  return (
    <div className="pointer-events-none absolute inset-0 select-none touch-none overflow-hidden z-10">
      {/* Left Touch Screen Region for Dynamic Joystick */}
      <div
        className="pointer-events-auto absolute top-0 left-0 bottom-0 w-1/2 touch-none"
        onTouchStart={handleLeftTouchStart}
      />

      {/* Right Touch Screen Region for Camera Orbit */}
      <div
        className="pointer-events-auto absolute top-0 right-0 bottom-0 w-1/2 touch-none"
        onTouchStart={handleRightTouchStart}
      />

      {/* Visual Dynamic Joystick Ring & Knob */}
      {joystickCenter ? (
        <div
          className="pointer-events-none absolute z-20 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-emerald-400/60 bg-slate-900/50 backdrop-blur-md shadow-2xl animate-fade-in"
          style={{ left: joystickCenter.x, top: joystickCenter.y }}
        >
          <div
            className="h-12 w-12 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-300 shadow-lg"
            style={{
              transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)`,
            }}
          />
        </div>
      ) : (
        /* Default Hint Joystick Ring in bottom left if untouched */
        <div className="pointer-events-none absolute bottom-10 left-10 z-20 flex h-28 w-28 items-center justify-center rounded-full border border-white/20 bg-slate-900/30 backdrop-blur-sm opacity-60">
          <div className="h-10 w-10 rounded-full bg-emerald-500/50" />
        </div>
      )}

      {/* Top Header Controls */}
      <div className="pointer-events-auto absolute top-4 left-4 z-30 flex items-center gap-2 flex-wrap max-w-[80vw]">
        <button
          onTouchStart={(e) => e.stopPropagation()}
          onClick={onOpenMap}
          className="flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-emerald-400 backdrop-blur-md transition hover:bg-slate-800 active:scale-95"
        >
          <Map className="h-4 w-4" /> Map
        </button>
        <button
          onTouchStart={(e) => e.stopPropagation()}
          onClick={onOpenInventory}
          className="flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-amber-400 backdrop-blur-md transition hover:bg-slate-800 active:scale-95"
        >
          <Package className="h-4 w-4" /> Inventar
        </button>
        {onOpenCrafting && (
          <button
            onTouchStart={(e) => e.stopPropagation()}
            onClick={onOpenCrafting}
            className="flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-orange-400 backdrop-blur-md transition hover:bg-slate-800 active:scale-95 border border-orange-500/30"
          >
            <Hammer className="h-4 w-4" /> Crafting
          </button>
        )}
        <button
          onTouchStart={(e) => e.stopPropagation()}
          onClick={toggleFullscreen}
          className="flex items-center gap-1.5 rounded-full bg-slate-900/80 px-3 py-1.5 text-xs font-semibold text-cyan-400 backdrop-blur-md transition hover:bg-slate-800 active:scale-95"
          title="Vollbildmodus umschalten"
        >
          {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
          <span className="hidden sm:inline">{isFullscreen ? 'Beenden' : 'Vollbild'}</span>
        </button>
        <button
          onTouchStart={(e) => e.stopPropagation()}
          onClick={onOpenSettings}
          className="flex items-center gap-1.5 rounded-full bg-slate-900/80 p-2 text-slate-200 backdrop-blur-md transition hover:bg-slate-800 active:scale-95"
        >
          <SettingsIcon className="h-4 w-4" />
        </button>
      </div>

      {/* Action Buttons Cluster (Right Bottom) */}
      <div className="pointer-events-auto absolute bottom-8 right-6 z-30 flex flex-col items-end gap-3 touch-none">
        {/* Build Mode Controls Bar if Active */}
        {isBuildModeActive && (
          <div className="flex items-center gap-2 bg-slate-950/90 p-2 rounded-2xl border border-cyan-500/50 backdrop-blur-md mb-1 animate-fade-in shadow-2xl">
            <button
              onTouchStart={(e) => e.stopPropagation()}
              onClick={onRotateBuildPreview}
              className="flex items-center gap-1 rounded-xl bg-slate-800 px-3 py-2 text-xs font-bold text-cyan-300 active:scale-95 border border-cyan-500/30"
            >
              <RotateCw className="h-4 w-4" /> Drehen
            </button>
            <button
              onTouchStart={(e) => e.stopPropagation()}
              onClick={onPlaceBuilding}
              className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-3.5 py-2 text-xs font-bold text-slate-950 active:scale-95 shadow-lg"
            >
              <Check className="h-4 w-4" /> Platzieren
            </button>
            <button
              onTouchStart={(e) => e.stopPropagation()}
              onClick={onCancelBuild}
              className="flex items-center gap-1 rounded-xl bg-red-600/90 hover:bg-red-600 px-3 py-2 text-xs font-bold text-white active:scale-95 shadow-lg border border-red-400/50"
              title="Bau-Modus Beenden"
            >
              <X className="h-4 w-4" /> Beenden
            </button>
          </div>
        )}

        {/* Top Row: Mine/Harvest, Lock-On & Interact */}
        <div className="flex items-center gap-3">
          {onMineHarvest && (
            <button
              onTouchStart={(e) => e.stopPropagation()}
              onClick={onMineHarvest}
              className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-600/90 text-white shadow-xl backdrop-blur-md active:scale-90 border border-orange-400/50"
              title="Abbauen / Fällen / Graben"
            >
              <Pickaxe className="h-6 w-6" />
            </button>
          )}

          <button
            onTouchStart={(e) => e.stopPropagation()}
            onClick={onLockOnToggle}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-600/90 text-white shadow-xl backdrop-blur-md active:scale-90"
            title="Target Lock"
          >
            <Target className="h-6 w-6" />
          </button>
          <button
            onTouchStart={(e) => e.stopPropagation()}
            onClick={onInteract}
            className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/90 text-white shadow-xl backdrop-blur-md active:scale-90"
            title="Interact (E)"
          >
            <Hand className="h-6 w-6" />
          </button>
        </div>

        {/* Bottom Cluster: Fliegen, Jump/Glide, Sprint/Dodge, Attack */}
        <div className="flex items-end gap-2.5">
          {onFlyToggle && (
            <button
              onTouchStart={(e) => {
                e.stopPropagation();
                onFlyToggle();
              }}
              onClick={onFlyToggle}
              className="flex h-14 w-14 flex-col items-center justify-center rounded-full bg-gradient-to-tr from-sky-500 via-blue-600 to-indigo-500 text-white shadow-xl backdrop-blur-md active:scale-90 border-2 border-sky-300/70"
              title="Fliegen 🚀 (Flight Boost)"
            >
              <Plane className="h-6 w-6" />
              <span className="text-[9px] font-black tracking-tighter uppercase leading-none mt-0.5 text-cyan-100">Fliegen</span>
            </button>
          )}

          <button
            onTouchStart={(e) => {
              e.stopPropagation();
              onJumpGlide();
            }}
            onClick={onJumpGlide}
            className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/90 text-white shadow-xl backdrop-blur-md active:scale-90"
            title="Jump / Paraglide (Space)"
          >
            <Wind className="h-7 w-7" />
          </button>

          <button
            onTouchStart={(e) => {
              e.stopPropagation();
              const next = !isSprinting;
              setIsSprinting(next);
              onSprintDodge(next);
            }}
            onClick={() => {
              const next = !isSprinting;
              setIsSprinting(next);
              onSprintDodge(next);
            }}
            className={`flex h-12 w-12 items-center justify-center rounded-full shadow-xl backdrop-blur-md active:scale-90 ${
              isSprinting ? 'bg-amber-400 text-slate-950 font-bold' : 'bg-slate-700/90 text-white'
            }`}
            title="Sprint / Dodge Roll (Shift/C)"
          >
            <Zap className="h-6 w-6" />
          </button>

          <button
            onTouchStart={(e) => {
              e.stopPropagation();
              onAttack();
            }}
            onClick={onAttack}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-tr from-emerald-600 to-green-400 text-white shadow-2xl backdrop-blur-md active:scale-90"
            title="Attack (F)"
          >
            <Sword className="h-9 w-9" />
          </button>
        </div>
      </div>
    </div>
  );
};
