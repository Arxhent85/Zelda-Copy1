import React, { useRef, useState, useEffect } from 'react';
import { Sword, Wind, Zap, Shield, Target, Hand, Map, Package, Settings as SettingsIcon, Maximize, Minimize, Pickaxe, Hammer, RotateCw, Check, X, Plane, Compass } from 'lucide-react';
import { InventoryItem } from '../types';

interface TouchControlsProps {
  onMove: (x: number, z: number) => void;
  onCameraRotate: (dx: number, dy: number) => void;
  onAttack: () => void;
  onJumpGlide: () => void;
  onJumpHold?: (holding: boolean) => void;
  onFlyToggle?: () => void;
  onSprintDodge: (sprint: boolean) => void;
  onInteract: () => void;
  onShieldHold?: (holding: boolean) => void;
  onLockOnToggle: () => void;
  onOpenMap?: () => void;
  onOpenInventory?: () => void;
  onOpenSettings?: () => void;
  onOpenStartMenu?: () => void;
  activeEquippedItem?: InventoryItem;
  // Mining, Crafting & Building
  onMineHarvest?: () => void;
  onOpenCrafting?: () => void;
  isBuildModeActive?: boolean;
  onRotateBuildPreview?: () => void;
  onPlaceBuilding?: () => void;
  onCancelBuild?: () => void;
  isBowEquipped?: boolean;
  isEditorActive?: boolean;
  isFlying?: boolean;
  onAscend?: (active: boolean) => void;
  onDescend?: (active: boolean) => void;
  isDriving?: boolean;
  onExitVehicle?: () => void;
  onGas?: (active: boolean) => void;
  onBrake?: (active: boolean) => void;
  onSteer?: (direction: number) => void;
  onDrift?: (active: boolean) => void;
  onTurbo?: (active: boolean) => void;
}

export const VirtualTouchControls: React.FC<TouchControlsProps> = ({
  onMove,
  onCameraRotate,
  onAttack,
  onJumpGlide,
  onJumpHold,
  onFlyToggle,
  onSprintDodge,
  onInteract,
  onShieldHold,
  onLockOnToggle,
  onOpenMap,
  onOpenInventory,
  onOpenSettings,
  onOpenStartMenu,
  activeEquippedItem,
  onMineHarvest,
  onOpenCrafting,
  isBuildModeActive = false,
  onRotateBuildPreview,
  onPlaceBuilding,
  onCancelBuild,
  isBowEquipped = false,
  isEditorActive = false,
  isFlying = false,
  onAscend,
  onDescend,
  isDriving = false,
  onExitVehicle,
  onGas,
  onBrake,
  onSteer,
  onDrift,
  onTurbo,
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
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  useEffect(() => {
    const checkTouch = () => (
      'ontouchstart' in window ||
      navigator.maxTouchPoints > 0 ||
      (navigator as any).msMaxTouchPoints > 0 ||
      window.matchMedia('(pointer: coarse)').matches
    );
    setIsTouchDevice(checkTouch());

    // Instant unlock on first touch for iPads, Android tablets and touch screens
    const onFirstTouch = () => {
      setIsTouchDevice(true);
      window.removeEventListener('touchstart', onFirstTouch);
    };
    window.addEventListener('touchstart', onFirstTouch, { passive: true });
    return () => window.removeEventListener('touchstart', onFirstTouch);
  }, []);

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

  // Dynamic Action Button Morphing based on equipped tool/weapon
  const getActionMeta = () => {
    if (!activeEquippedItem) {
      return {
        type: 'sword',
        label: 'Schlag',
        sublabel: 'Faust / Schwert',
        icon: <Sword className="h-7 w-7 text-white drop-shadow" />,
        gradient: 'from-emerald-600 via-teal-500 to-green-400',
        borderColor: 'border-emerald-300',
      };
    }

    const nameLower = activeEquippedItem.name.toLowerCase();
    const idLower = activeEquippedItem.id.toLowerCase();
    const toolType = activeEquippedItem.toolType;

    // 1. Woodcutter Axe
    if (toolType === 'axe' || nameLower.includes('axt') || idLower.includes('axe')) {
      return {
        type: 'axe',
        label: 'Fällen',
        sublabel: activeEquippedItem.name,
        icon: <span className="text-2xl filter drop-shadow">🪓</span>,
        gradient: 'from-amber-600 via-orange-500 to-yellow-500',
        borderColor: 'border-amber-300',
      };
    }

    // 2. Miner Pickaxe
    if (toolType === 'pickaxe' || nameLower.includes('spitzhacke') || idLower.includes('pickaxe')) {
      return {
        type: 'pickaxe',
        label: 'Abbauen',
        sublabel: activeEquippedItem.name,
        icon: <Pickaxe className="h-7 w-7 text-amber-100 drop-shadow" />,
        gradient: 'from-slate-700 via-zinc-600 to-amber-600',
        borderColor: 'border-amber-300',
      };
    }

    // 3. Shovel / Broom
    if (toolType === 'shovel' || nameLower.includes('schaufel') || nameLower.includes('besen') || idLower.includes('shovel')) {
      const isBroom = nameLower.includes('besen');
      return {
        type: 'shovel',
        label: isBroom ? 'Fegen' : 'Graben',
        sublabel: activeEquippedItem.name,
        icon: <span className="text-2xl filter drop-shadow">{isBroom ? '🧹' : '🪚'}</span>,
        gradient: 'from-yellow-700 via-amber-700 to-stone-600',
        borderColor: 'border-yellow-400',
      };
    }

    // 4. Bow & Arrow
    if (activeEquippedItem.type === 'bow' || nameLower.includes('bogen') || idLower.includes('bow')) {
      return {
        type: 'bow',
        label: 'Schuss',
        sublabel: activeEquippedItem.name,
        icon: <span className="text-2xl filter drop-shadow">🏹</span>,
        gradient: 'from-indigo-600 via-cyan-500 to-sky-400',
        borderColor: 'border-cyan-300',
      };
    }

    // 5. Default Weapon / Sword
    return {
      type: 'weapon',
      label: 'Angriff',
      sublabel: activeEquippedItem.name,
      icon: <Sword className="h-7 w-7 text-white drop-shadow" />,
      gradient: 'from-emerald-600 via-teal-500 to-green-400',
      borderColor: 'border-emerald-300',
    };
  };

  const actionMeta = getActionMeta();

  return (
    <div className="pointer-events-none absolute inset-0 select-none touch-none overflow-hidden z-10">
      {/* Left Touch Screen Region for Dynamic Joystick - Only rendered on active touch devices during gameplay */}
      {isTouchDevice && !isEditorActive && (
        <>
          <div
            className="pointer-events-auto absolute top-0 left-0 bottom-0 w-1/2 touch-none"
            onTouchStart={handleLeftTouchStart}
          />
          <div
            className="pointer-events-auto absolute top-0 right-0 bottom-0 w-1/2 touch-none"
            onTouchStart={handleRightTouchStart}
          />
        </>
      )}

      {/* Left Bottom Control: Dynamic Joystick OR Dedicated Steer Buttons when driving */}
      {!isEditorActive && (
        isDriving ? (
          <div className="pointer-events-auto absolute bottom-8 left-6 z-30 flex items-center gap-3 touch-none select-none">
            {/* Left Steer Button */}
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSteer?.(-1);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSteer?.(0);
              }}
              onTouchCancel={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSteer?.(0);
              }}
              onMouseDown={() => onSteer?.(-1)}
              onMouseUp={() => onSteer?.(0)}
              onMouseLeave={() => onSteer?.(0)}
              className="flex h-16 w-16 sm:h-20 sm:w-20 flex-col items-center justify-center rounded-2xl bg-gradient-to-tr from-slate-900 to-slate-800 text-white shadow-2xl backdrop-blur-md active:scale-90 border-2 border-cyan-400/80 font-black active:border-cyan-300"
              title="Nach links lenken (A)"
            >
              <span className="text-2xl sm:text-3xl text-cyan-300">◀</span>
              <span className="text-[10px] font-black uppercase tracking-wider text-cyan-200">LINKS</span>
            </button>

            {/* Right Steer Button */}
            <button
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSteer?.(1);
              }}
              onTouchEnd={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSteer?.(0);
              }}
              onTouchCancel={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onSteer?.(0);
              }}
              onMouseDown={() => onSteer?.(1)}
              onMouseUp={() => onSteer?.(0)}
              onMouseLeave={() => onSteer?.(0)}
              className="flex h-16 w-16 sm:h-20 sm:w-20 flex-col items-center justify-center rounded-2xl bg-gradient-to-tr from-slate-900 to-slate-800 text-white shadow-2xl backdrop-blur-md active:scale-90 border-2 border-cyan-400/80 font-black active:border-cyan-300"
              title="Nach rechts lenken (D)"
            >
              <span className="text-2xl sm:text-3xl text-cyan-300">▶</span>
              <span className="text-[10px] font-black uppercase tracking-wider text-cyan-200">RECHTS</span>
            </button>
          </div>
        ) : (
          joystickCenter ? (
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
          )
        )
      )}

      {/* Action Buttons Cluster (Right Bottom) - Only in play mode */}
      {!isEditorActive && (
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

        {/* Top Row: Lock-On Target (if bow) & 🛡️ Royal Shield Guard / Interact */}
        <div className="flex items-center gap-3">
          {isBowEquipped && (
            <button
              onTouchStart={(e) => e.stopPropagation()}
              onClick={onLockOnToggle}
              className="flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600/90 text-white shadow-xl backdrop-blur-md active:scale-90 border border-blue-400/50"
              title="Ziel erfassen / Bogen zielen"
            >
              <Target className="h-6 w-6" />
            </button>
          )}

          {/* 🛡️ Royal Shield Guard & Interact (Replaces separate hand & tool buttons) */}
          <button
            onTouchStart={(e) => {
              e.stopPropagation();
              onShieldHold?.(true);
              onInteract();
            }}
            onTouchEnd={(e) => {
              e.stopPropagation();
              onShieldHold?.(false);
            }}
            onTouchCancel={(e) => {
              e.stopPropagation();
              onShieldHold?.(false);
            }}
            onMouseDown={() => {
              onShieldHold?.(true);
              onInteract();
            }}
            onMouseUp={() => {
              onShieldHold?.(false);
            }}
            onClick={onInteract}
            className="flex h-12 w-12 sm:h-13 sm:w-13 flex-col items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-700 via-indigo-600 to-sky-500 text-white shadow-xl backdrop-blur-md active:scale-90 border-2 border-amber-300/80 transition-all select-none"
            title="Schild Guard (Halten zum Blocken) / Interagieren (Tippen) (E)"
          >
            <Shield className="h-5 w-5 text-amber-300 fill-amber-400/20 drop-shadow" />
            <span className="text-[8px] font-black uppercase text-amber-200 tracking-wider leading-none mt-0.5">SCHILD</span>
          </button>
        </div>

        {/* 🏎️ MARIO KART / VEHICLE DRIVING TOUCH CONTROLS (Tablets & Smartphones) */}
        {isDriving ? (
          <div className="flex flex-col items-end gap-3 animate-fade-in select-none">
            {/* Top Row: Turbo Boost & Exit Car */}
            <div className="flex items-center gap-2.5">
              {/* 🚀 Instant Nitro Turbo Launch Button */}
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTurbo?.(true);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTurbo?.(false);
                }}
                onTouchCancel={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onTurbo?.(false);
                }}
                onMouseDown={() => onTurbo?.(true)}
                onMouseUp={() => onTurbo?.(false)}
                onMouseLeave={() => onTurbo?.(false)}
                className="flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500 via-blue-600 to-indigo-600 px-4 py-2.5 text-xs sm:text-sm font-black text-white shadow-2xl backdrop-blur-md active:scale-90 border-2 border-cyan-300 animate-pulse"
                title="Nitro Turbo Boost (Shift / Tap)"
              >
                <Zap className="h-4 w-4 fill-cyan-200" />
                <span className="tracking-wider">TURBO</span>
              </button>

              {/* 🚪 Exit Vehicle Button */}
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (onExitVehicle) onExitVehicle();
                  else onInteract();
                }}
                onClick={() => {
                  if (onExitVehicle) onExitVehicle();
                  else onInteract();
                }}
                className="flex items-center gap-1.5 rounded-2xl bg-rose-600/95 px-3.5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xl backdrop-blur-md active:scale-90 border border-rose-300"
                title="Aussteigen (E)"
              >
                <span>🚪</span>
                <span>Aussteigen</span>
              </button>
            </div>

            {/* Bottom Row: Brake/Reverse, Drift Power-Slide, Gas Forward */}
            <div className="flex items-end gap-3">
              {/* 🛑 Brake / Reverse Pedal */}
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onBrake?.(true);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onBrake?.(false);
                }}
                onTouchCancel={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onBrake?.(false);
                }}
                onMouseDown={() => onBrake?.(true)}
                onMouseUp={() => onBrake?.(false)}
                onMouseLeave={() => onBrake?.(false)}
                className="flex h-16 w-16 sm:h-20 sm:w-20 flex-col items-center justify-center rounded-2xl bg-gradient-to-tr from-red-700 to-rose-600 text-white shadow-2xl backdrop-blur-md active:scale-90 border-2 border-red-300 font-black"
                title="Bremse / Rückwärts (S - Halten)"
              >
                <span className="text-xl sm:text-2xl">🛑</span>
                <span className="text-[9px] sm:text-[10px] font-black tracking-wider">BREMSE</span>
              </button>

              {/* ⭐ Power-Slide Drift (Hold to charge sparks, release for mini-turbo boost!) */}
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDrift?.(true);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDrift?.(false);
                }}
                onTouchCancel={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDrift?.(false);
                }}
                onMouseDown={() => onDrift?.(true)}
                onMouseUp={() => onDrift?.(false)}
                onMouseLeave={() => onDrift?.(false)}
                className="flex h-18 w-18 sm:h-22 sm:w-22 flex-col items-center justify-center rounded-3xl bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 text-slate-950 shadow-2xl backdrop-blur-md active:scale-90 border-2 border-yellow-100 font-black"
                title="Power-Slide Drift (Space - Halten zum Driften, Loslassen für Mini-Turbo!)"
              >
                <span className="text-2xl sm:text-3xl">⭐</span>
                <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider">DRIFT</span>
              </button>

              {/* 🏎️ Gas Forward Pedal */}
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onGas?.(true);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onGas?.(false);
                }}
                onTouchCancel={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onGas?.(false);
                }}
                onMouseDown={() => onGas?.(true)}
                onMouseUp={() => onGas?.(false)}
                onMouseLeave={() => onGas?.(false)}
                className="flex h-20 w-20 sm:h-24 sm:w-24 flex-col items-center justify-center rounded-3xl bg-gradient-to-tr from-emerald-600 via-green-500 to-emerald-400 text-white shadow-2xl backdrop-blur-md active:scale-90 border-2 border-green-200 font-black"
                title="Gas geben (W - Halten)"
              >
                <span className="text-2xl sm:text-3xl">▲</span>
                <span className="text-xs sm:text-sm font-black tracking-wider">GAS</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Soaring Flight Vertical Altitude Cluster (Ascend ⬆️ / Descend ⬇️) */}
            {isFlying && (
              <div className="flex items-center gap-3 mb-1 animate-fade-in bg-slate-950/85 p-1.5 rounded-2xl border border-sky-400/50 backdrop-blur-md shadow-2xl">
                <button
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    onAscend?.(true);
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    onAscend?.(false);
                  }}
                  onMouseDown={() => onAscend?.(true)}
                  onMouseUp={() => onAscend?.(false)}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-t from-sky-600 to-cyan-400 px-3.5 py-2 text-xs font-black text-slate-950 active:scale-95 shadow-lg border border-cyan-200"
                  title="Steigen (Hold to fly up)"
                >
                  <span>⬆️</span> Steigen
                </button>
                <button
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    onDescend?.(true);
                  }}
                  onTouchEnd={(e) => {
                    e.stopPropagation();
                    onDescend?.(false);
                  }}
                  onMouseDown={() => onDescend?.(true)}
                  onMouseUp={() => onDescend?.(false)}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-t from-blue-800 to-indigo-600 px-3.5 py-2 text-xs font-black text-white active:scale-95 shadow-lg border border-indigo-300"
                  title="Sinken (Hold to dive)"
                >
                  <span>⬇️</span> Sinken
                </button>
              </div>
            )}

            {/* Bottom Cluster: Jump/Glide, Sprint/Dodge, Attack */}
            <div className="flex items-end gap-3">
              <button
                onTouchStart={(e) => {
                  e.stopPropagation();
                  onJumpHold?.(true);
                  onJumpGlide();
                }}
                onTouchEnd={(e) => {
                  e.stopPropagation();
                  onJumpHold?.(false);
                }}
                onTouchCancel={(e) => {
                  e.stopPropagation();
                  onJumpHold?.(false);
                }}
                onMouseDown={() => {
                  onJumpHold?.(true);
                  onJumpGlide();
                }}
                onMouseUp={() => {
                  onJumpHold?.(false);
                }}
                onClick={onJumpGlide}
                className="flex h-14 w-14 items-center justify-center rounded-full bg-cyan-500/90 text-white shadow-xl backdrop-blur-md active:scale-90"
                title="Jump / Paraglide (Space - Halten zum Gleiten, Loslassen zum schnellen Fallen)"
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

              {/* Dynamic Morphed Action Button (Axt, Spitzhacke, Schaufel, Besen, Bogen oder Schwert) */}
              <button
                onTouchStart={(e) => {
                  e.stopPropagation();
                  onAttack();
                }}
                onClick={onAttack}
                className={`relative flex h-16 w-16 sm:h-18 sm:w-18 flex-col items-center justify-center rounded-3xl bg-gradient-to-tr ${actionMeta.gradient} text-white shadow-2xl backdrop-blur-md active:scale-90 border-2 ${actionMeta.borderColor} transition-all duration-200 select-none`}
                title={`${actionMeta.label} - ${actionMeta.sublabel} (F / Mausklick)`}
              >
                <div className="flex items-center justify-center leading-none">
                  {actionMeta.icon}
                </div>
                <span className="text-[9px] font-black uppercase tracking-wider drop-shadow mt-1 leading-none">
                  {actionMeta.label}
                </span>
              </button>
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
};
