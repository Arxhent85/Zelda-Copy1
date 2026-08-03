import React, { useState, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { GameCanvas } from './components/GameCanvas';
import { HUD } from './components/HUD';
import { Minimap } from './components/Minimap';
import { VirtualTouchControls } from './components/VirtualTouchControls';
import { FullMapModal } from './components/FullMapModal';
import { InventoryModal } from './components/InventoryModal';
import { CraftingModal } from './components/CraftingModal';
import { SettingsModal } from './components/SettingsModal';
import { GameEngine } from './game/GameEngine';
import { DamageText, GameSettings, PlayerStats, ShrineData, Vector3D } from './types';
import { RefreshCw, Play, RotateCw, Check, X } from 'lucide-react';

export default function App() {
  const [engine, setEngine] = useState<GameEngine | null>(null);

  // React copies of engine state for reactive UI rendering
  const [playerPos, setPlayerPos] = useState<Vector3D>({ x: 0, y: 0, z: 0 });
  const [playerRotation, setPlayerRotation] = useState<number>(0);
  const [stats, setStats] = useState<PlayerStats>({
    health: 12,
    maxHealth: 12,
    stamina: 100,
    maxStamina: 100,
    rupees: 45,
    arrows: 20,
    level: 1,
    xp: 0,
    maxXp: 100,
  });
  const [timeOfDay, setTimeOfDay] = useState<number>(10.5);
  const [shrines, setShrines] = useState<ShrineData[]>([]);
  const [damageTexts, setDamageTexts] = useState<DamageText[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const toastTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  const showToast = useCallback((msg: string | null) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    setToastMessage(msg);
    if (msg) {
      toastTimerRef.current = setTimeout(() => {
        setToastMessage(null);
        toastTimerRef.current = null;
      }, 3000); // MAX 3 SECONDS
    }
  }, []);

  // Show welcome toast on mount and clear after 3 seconds
  useEffect(() => {
    showToast('Willkommen in Hyrule! Entdecke, ernte Erze, baue Unterstände & schalte Schrein-Teleporte frei.');
  }, [showToast]);

  // Touch Move State
  const [touchMoveDir, setTouchMoveDir] = useState<{ x: number; z: number }>({ x: 0, z: 0 });

  // Modals state
  const [isMapOpen, setIsMapOpen] = useState<boolean>(false);
  const [isInventoryOpen, setIsInventoryOpen] = useState<boolean>(false);
  const [isCraftingOpen, setIsCraftingOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isBuildActive, setIsBuildActive] = useState<boolean>(false);

  // Settings
  const [settings, setSettings] = useState<GameSettings>({
    graphicsQuality: 'high',
    shadowsEnabled: true,
    grassDensity: 0.8,
    soundVolume: 0.7,
    musicVolume: 0.5,
    cameraSensitivity: 0.003,
    invertY: false,
    touchControls: true,
  });

  // Target lock reticle position
  const [targetScreenPos, setTargetScreenPos] = useState<{ x: number; y: number } | null>(null);

  const handleEngineReady = useCallback((inst: GameEngine) => {
    setEngine(inst);
    setShrines(inst.collectibleManager.shrinesData);

    // Sync state update hook from 3D physics loop into React HUD
    inst.onStateUpdate = () => {
      setPlayerPos({ ...inst.physics.position });
      setPlayerRotation(inst.physics.rotation);
      setStats({ ...inst.stats });
      setTimeOfDay(inst.skyLighting.timeOfDay);
      setShrines([...inst.collectibleManager.shrinesData]);
      setDamageTexts([...inst.damageTexts]);

      // Calculate 2D screen coordinate for lock-on reticle if active
      if (inst.cameraControls.isLockedOn && inst.cameraControls.targetLockEnemy) {
        const p = inst.cameraControls.targetLockEnemy.clone().project(inst.camera);
        const sx = (p.x * 0.5 + 0.5) * window.innerWidth;
        const sy = (-(p.y * 0.5) + 0.5) * window.innerHeight;
        setTargetScreenPos({ x: sx, y: sy });
      } else {
        setTargetScreenPos(null);
      }
    };

    inst.onToastMessage = (msg: string) => {
      showToast(msg);
    };
  }, [showToast]);

  const handleCancelBuild = useCallback(() => {
    if (!engine) return;
    engine.selectBuildingType(null);
    setIsBuildActive(false);
    showToast('Bau-Modus Beendet');
  }, [engine, showToast]);

  // Global Keyboard shortcuts for Modals & Actions
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyM') {
        setIsMapOpen((prev) => !prev);
      } else if (e.code === 'KeyI') {
        setIsInventoryOpen((prev) => !prev);
      } else if (e.code === 'KeyC') {
        setIsCraftingOpen((prev) => !prev);
      } else if (e.code === 'KeyU') {
        handleUpgradeSettlement();
      } else if (e.code === 'KeyB') {
        if (engine) {
          if (isBuildActive) {
            handleCancelBuild();
          } else {
            setIsBuildActive(true);
            engine.selectBuildingType('catan_road');
            showToast('Bau-Modus Aktiv: Platziere Catan-Straße');
          }
        }
      } else if (e.code === 'KeyX' && isBuildActive) {
        handleCancelBuild();
      } else if (e.code === 'KeyR' && isBuildActive) {
        if (engine) engine.rotateBuildingPreview();
      } else if (e.code === 'KeyF') {
        if (engine) {
          const msg = engine.mineOrHarvest();
          showToast(msg);
        }
      } else if (e.code === 'Escape') {
        setIsMapOpen(false);
        setIsInventoryOpen(false);
        setIsCraftingOpen(false);
        setIsSettingsOpen(false);
        if (isBuildActive) {
          handleCancelBuild();
        }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [engine, isBuildActive, showToast, handleCancelBuild]);

  // Right-click to cancel build mode
  useEffect(() => {
    const handleContextMenu = (e: MouseEvent) => {
      if (isBuildActive && engine) {
        e.preventDefault();
        handleCancelBuild();
      }
    };
    window.addEventListener('contextmenu', handleContextMenu);
    return () => window.removeEventListener('contextmenu', handleContextMenu);
  }, [isBuildActive, engine, handleCancelBuild]);

  const handleUpgradeSettlement = () => {
    if (!engine) return;
    const settlement = engine.buildingSystem.getNearbySettlementToUpgrade(engine.physics.position);
    if (!settlement) {
      showToast('Keine Catan-Siedlung in der Nähe!');
      return;
    }

    // Check cost: 3x Erz, 2x Getreide
    const erzItem = engine.inventory.find(i => i.name.toLowerCase().includes('erz') || i.name.toLowerCase().includes('stein') || i.id.toLowerCase().includes('stone'));
    const getreideItem = engine.inventory.find(i => i.name.toLowerCase().includes('getreide') || i.name.toLowerCase().includes('weizen'));

    const erzCount = erzItem ? erzItem.quantity : 0;
    const getreideCount = getreideItem ? getreideItem.quantity : 0;

    if (erzCount < 3 || getreideCount < 2) {
      showToast(`Fehlende Catan-Materialien: Benötigt 3x Erz (${erzCount}/3), 2x Getreide (${getreideCount}/2)!`);
      return;
    }

    // Deduct
    if (erzItem) {
      erzItem.quantity -= 3;
      if (erzItem.quantity <= 0) engine.inventory.splice(engine.inventory.indexOf(erzItem), 1);
    }
    if (getreideItem) {
      getreideItem.quantity -= 2;
      if (getreideItem.quantity <= 0) engine.inventory.splice(engine.inventory.indexOf(getreideItem), 1);
    }

    const ok = engine.buildingSystem.upgradeSettlementToCity(settlement.data.id);
    if (ok) {
      engine.stats.maxHealth += 4; // Permanent +1 Heart Container!
      engine.stats.health = engine.stats.maxHealth;
      engine.stats.rupees += 50;
      showToast('🏰 GRATULATION! Siedlung zur gewaltigen Catan-Festungsstadt ausgebaut! Max. Leben & Rubine erhöht!');
    }
  };

  const handleMineHarvest = () => {
    if (!engine) return;
    const msg = engine.mineOrHarvest();
    showToast(msg);
  };

  const handleCraft = (recipeId: string) => {
    if (!engine) return;
    const msg = engine.craftItem(recipeId);
    showToast(msg);
  };

  const handleSelectBuildType = (buildType: string) => {
    if (!engine) return;
    engine.selectBuildingType(buildType);
    setIsBuildActive(true);
    showToast(`Bau-Modus: ${buildType}`);
  };

  const handleRotateBuild = () => {
    if (!engine) return;
    engine.rotateBuildingPreview();
  };

  const handlePlaceBuild = () => {
    if (!engine) return;
    const msg = engine.placeBuilding();
    showToast(msg);
  };

  const handleEquipItem = (id: string) => {
    if (!engine) return;
    const msg = engine.equipItem(id);
    showToast(msg);
  };

  const handleUseItem = (id: string) => {
    if (!engine) return;
    const itemIdx = engine.inventory.findIndex((i) => i.id === id);
    if (itemIdx >= 0) {
      const item = engine.inventory[itemIdx];
      if (item.restoreHealth) {
        engine.stats.health = Math.min(engine.stats.maxHealth, engine.stats.health + item.restoreHealth);
      }
      if (item.restoreStamina) {
        engine.stats.stamina = engine.stats.maxStamina;
      }
      engine.inventory.splice(itemIdx, 1);
      showToast(`Used ${item.name}! Health restored.`);
    }
  };

  const handleRespawn = () => {
    if (!engine) return;
    engine.stats.health = engine.stats.maxHealth;
    engine.stats.stamina = engine.stats.maxStamina;
    engine.fastTravelToShrine('shrine_awakening');
  };

  const enemiesList = engine
    ? engine.enemyManager.enemies.map((e) => ({ position: e.state.position, state: e.state.state }))
    : [];

  const chestsList = engine
    ? engine.collectibleManager.objects
        .filter((o) => o.data.type === 'chest')
        .map((c) => ({ position: c.data.position, opened: c.data.opened }))
    : [];

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-slate-950 font-sans select-none">
      {/* 3D WebGL Canvas Layer */}
      <GameCanvas settings={settings} onEngineReady={handleEngineReady} moveInput={touchMoveDir} />

      {/* React HUD Layer */}
      <HUD
        stats={stats}
        stamina={stats.stamina}
        maxStamina={stats.maxStamina}
        timeOfDay={timeOfDay}
        damageTexts={damageTexts}
        toastMessage={toastMessage}
        targetEnemyPos={targetScreenPos}
      />

      {/* Top Floating Build Mode Toolbar Banner */}
      {isBuildActive && engine && (
        <div className="absolute top-16 left-1/2 z-40 -translate-x-1/2 flex items-center gap-2 sm:gap-3 rounded-2xl border border-cyan-400/60 bg-slate-950/95 px-4 sm:px-5 py-2 sm:py-2.5 shadow-2xl backdrop-blur-md animate-fade-in max-w-[92vw]">
          <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm font-bold text-cyan-300 whitespace-nowrap">
            <span className="text-base sm:text-lg animate-pulse">🔨</span>
            <span>Bau-Modus Aktiv</span>
          </div>
          <div className="h-4 w-[1px] bg-white/20" />
          <button
            onClick={handleRotateBuild}
            className="flex items-center gap-1 rounded-xl bg-slate-800 px-2.5 sm:px-3 py-1.5 text-xs font-semibold text-cyan-200 hover:bg-slate-700 active:scale-95 border border-cyan-500/30 transition whitespace-nowrap"
          >
            <RotateCw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Drehen</span> (R)
          </button>
          <button
            onClick={handlePlaceBuild}
            className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-3 sm:px-4 py-1.5 text-xs font-bold text-slate-950 hover:scale-105 active:scale-95 shadow-md transition whitespace-nowrap"
          >
            <Check className="h-3.5 w-3.5" /> Platzieren
          </button>
          <button
            onClick={handleCancelBuild}
            className="flex items-center gap-1 rounded-xl bg-red-600/90 hover:bg-red-500 px-3 sm:px-3.5 py-1.5 text-xs font-bold text-white active:scale-95 shadow-md border border-red-400/50 transition whitespace-nowrap"
          >
            <X className="h-3.5 w-3.5" /> Beenden <span className="hidden sm:inline">(ESC / B / X)</span>
          </button>
        </div>
      )}

      {/* Catan Settlement Upgrade Prompt */}
      {engine && engine.buildingSystem.getNearbySettlementToUpgrade(new THREE.Vector3(playerPos.x, playerPos.y, playerPos.z)) && (
        <div className="absolute bottom-28 left-1/2 z-30 -translate-x-1/2 flex items-center gap-3 rounded-2xl border border-amber-400/60 bg-slate-950/90 px-5 py-3 shadow-2xl backdrop-blur-md animate-bounce">
          <div className="text-2xl">🛖 ➔ 🏰</div>
          <div>
            <div className="text-xs font-bold text-amber-300">Catan-Siedlung bereit zum Ausbau!</div>
            <div className="text-[11px] text-slate-300">Kosten: 3x Erz 🪨, 2x Getreide 🌾</div>
          </div>
          <button
            onClick={handleUpgradeSettlement}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg hover:scale-105 active:scale-95 transition"
          >
            Zur Stadt ausbauen (U)
          </button>
        </div>
      )}

      {/* Minimap Radar */}
      <Minimap
        playerPos={playerPos}
        playerRotation={playerRotation}
        shrines={shrines}
        enemies={enemiesList}
        chests={chestsList}
        onOpenFullMap={() => setIsMapOpen(true)}
      />

      {/* Virtual Dual Touch Controls Cluster */}
      <VirtualTouchControls
        onMove={(x, z) => setTouchMoveDir({ x, z })}
        onCameraRotate={(dx, dy) => {
          if (engine) engine.cameraControls.handleMouseMove(dx, dy);
        }}
        onAttack={() => {
          if (engine) {
            const msg = engine.performAttackOrHarvest();
            if (msg) showToast(msg);
          }
        }}
        onJumpGlide={() => {
          if (engine) {
            if (engine.physics.isGrounded) {
              engine.physics.velocity.y = 12.0;
              engine.physics.isGrounded = false;
            } else {
              engine.physics.isFlying = !engine.physics.isFlying;
              engine.physics.isGliding = engine.physics.isFlying;
            }
          }
        }}
        onFlyToggle={() => {
          if (engine) {
            engine.physics.triggerFlightBoost();
            showToast('🚀 FLIEGEN AKTIVIERT!');
          }
        }}
        onSprintDodge={(sprint) => {
          if (engine && !sprint) {
            // Dodge roll trigger
            engine.physics.actionState = 'DODGE';
            engine.physics.dodgeCooldown = 0.8;
          }
        }}
        onInteract={() => {
          if (engine) {
            const msg = engine.interactWithNearbyObject();
            if (msg) showToast(msg);
          }
        }}
        onLockOnToggle={() => {
          if (engine) {
            engine.cameraControls.isLockedOn = !engine.cameraControls.isLockedOn;
            if (engine.cameraControls.isLockedOn) {
              const nearest = engine.enemyManager.enemies.find((e) => e.state.targetDistance < 25.0);
              if (nearest) {
                engine.cameraControls.targetLockEnemy = new THREE.Vector3(
                  nearest.state.position.x,
                  nearest.state.position.y + 1.2,
                  nearest.state.position.z
                );
              }
            }
          }
        }}
        onOpenMap={() => setIsMapOpen(true)}
        onOpenInventory={() => setIsInventoryOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onMineHarvest={handleMineHarvest}
        onOpenCrafting={() => setIsCraftingOpen(true)}
        isBuildModeActive={isBuildActive}
        onRotateBuildPreview={handleRotateBuild}
        onPlaceBuilding={handlePlaceBuild}
        onCancelBuild={handleCancelBuild}
      />

      {/* Modals */}
      <FullMapModal
        isOpen={isMapOpen}
        onClose={() => setIsMapOpen(false)}
        playerPos={playerPos}
        shrines={shrines}
        onFastTravel={(shrineId) => {
          if (engine) engine.fastTravelToShrine(shrineId);
        }}
      />

      <InventoryModal
        isOpen={isInventoryOpen}
        onClose={() => setIsInventoryOpen(false)}
        items={engine ? engine.inventory : []}
        onEquipItem={handleEquipItem}
        onUseItem={handleUseItem}
      />

      <CraftingModal
        isOpen={isCraftingOpen}
        onClose={() => setIsCraftingOpen(false)}
        inventory={engine ? engine.inventory : []}
        isNearWorkbench={engine ? engine.buildingSystem.isNearWorkbench(engine.physics.position) : false}
        onCraft={handleCraft}
        onSelectBuildType={handleSelectBuildType}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onUpdateSettings={(newS) => setSettings((prev) => ({ ...prev, ...newS }))}
      />

      {/* Game Over Screen */}
      {stats.health <= 0 && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-slate-950/95 p-6 backdrop-blur-2xl animate-fade-in text-center">
          <h1 className="text-4xl sm:text-6xl font-extrabold text-red-500 tracking-wider">GAME OVER</h1>
          <p className="mt-3 text-sm text-slate-400">The darkness has fallen over Hyrule...</p>
          <button
            onClick={handleRespawn}
            className="mt-8 flex items-center gap-2 rounded-full bg-gradient-to-r from-red-600 to-rose-500 px-8 py-3 text-base font-bold text-white shadow-xl hover:scale-105 transition"
          >
            <RefreshCw className="h-5 w-5" /> Respawn at Shrine of Awakening
          </button>
        </div>
      )}
    </div>
  );
}
