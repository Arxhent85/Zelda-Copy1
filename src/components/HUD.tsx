import React from 'react';
import { Heart, Sun, Moon, Gem, Crosshair } from 'lucide-react';
import { DamageText, PlayerStats } from '../types';

interface HUDProps {
  stats: PlayerStats;
  stamina: number;
  maxStamina: number;
  timeOfDay: number;
  damageTexts: DamageText[];
  toastMessage: string | null;
  targetEnemyPos?: { x: number; y: number } | null;
}

export const HUD: React.FC<HUDProps> = ({
  stats,
  stamina,
  maxStamina,
  timeOfDay,
  damageTexts,
  toastMessage,
  targetEnemyPos,
}) => {
  // Calculate full, half, and empty hearts (stats.health is in quarters of a heart)
  const totalHearts = Math.ceil(stats.maxHealth / 4);
  const currentQuarters = stats.health;

  const heartsArray = Array.from({ length: totalHearts }).map((_, i) => {
    const heartBase = i * 4;
    const quartersInThisHeart = Math.max(0, Math.min(4, currentQuarters - heartBase));
    return quartersInThisHeart; // 0 = empty, 1 = 25%, 2 = 50%, 3 = 75%, 4 = full
  });

  const isDay = timeOfDay >= 6.0 && timeOfDay <= 18.0;
  const formatTime = (time: number) => {
    const hours = Math.floor(time);
    const mins = Math.floor((time - hours) * 60);
    const padH = hours < 10 ? `0${hours}` : `${hours}`;
    const padM = mins < 10 ? `0${mins}` : `${mins}`;
    return `${padH}:${padM}`;
  };

  const staminaPercent = (stamina / maxStamina) * 100;

  return (
    <div className="pointer-events-none absolute inset-0 select-none overflow-hidden">
      {/* Top Left: Hearts & Stamina Wheel & Currency */}
      <div className="absolute top-4 left-4 z-10 flex flex-col gap-2.5">
        {/* Heart Containers */}
        <div className="flex items-center gap-1 rounded-2xl bg-slate-950/70 px-3.5 py-2 backdrop-blur-md shadow-lg border border-white/10">
          {heartsArray.map((quarters, idx) => (
            <div key={idx} className="relative h-6 w-6 flex items-center justify-center">
              <Heart
                className={`h-6 w-6 transition-transform duration-200 ${
                  quarters === 0 ? 'text-slate-600' : 'text-red-500 fill-red-500 scale-105'
                }`}
                style={{ opacity: quarters === 0 ? 0.35 : 1.0 }}
              />
            </div>
          ))}
        </div>

        {/* Stamina Bar */}
        <div className="flex items-center gap-2 rounded-xl bg-slate-950/70 px-3 py-1.5 backdrop-blur-md border border-white/10 w-48">
          <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
            <div
              className={`h-full transition-all duration-100 ${
                staminaPercent < 20 ? 'bg-red-500 animate-pulse' : 'bg-emerald-400'
              }`}
              style={{ width: `${staminaPercent}%` }}
            />
          </div>
          <span className="text-[10px] font-bold text-emerald-300">{Math.round(staminaPercent)}%</span>
        </div>

        {/* Rupees & Arrow Count */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full bg-slate-950/70 px-3 py-1 backdrop-blur-md border border-white/10 text-emerald-400 text-xs font-bold">
            <Gem className="h-4 w-4 fill-emerald-400" />
            <span>{stats.rupees}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-slate-950/70 px-3 py-1 backdrop-blur-md border border-white/10 text-amber-300 text-xs font-bold">
            <span>🏹 {stats.arrows}</span>
          </div>
        </div>
      </div>

      {/* Top Right: Clock & Weather */}
      <div className="absolute top-4 right-4 z-10 flex items-center gap-2 rounded-full bg-slate-950/70 px-3.5 py-1.5 backdrop-blur-md border border-white/10 text-xs font-medium text-slate-200">
        {isDay ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4 text-indigo-300" />}
        <span>{formatTime(timeOfDay)}</span>
      </div>

      {/* Target Lock-on Reticle Overlay */}
      {targetEnemyPos && (
        <div
          className="absolute z-20 -translate-x-1/2 -translate-y-1/2 animate-spin text-cyan-400"
          style={{ left: `${targetEnemyPos.x}px`, top: `${targetEnemyPos.y}px` }}
        >
          <Crosshair className="h-10 w-10" />
        </div>
      )}

      {/* Floating Damage Text */}
      {damageTexts.map((dt) => (
        <div
          key={dt.id}
          className="absolute z-30 font-extrabold text-sm drop-shadow-md animate-bounce"
          style={{
            left: `${(dt.position.x / window.innerWidth) * 100}%`,
            top: `${(dt.position.y / window.innerHeight) * 100}%`,
            color: dt.color,
            opacity: dt.life,
          }}
        >
          {dt.text}
        </div>
      ))}

      {/* Toast Notification Bar */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 z-30 -translate-x-1/2 pointer-events-none rounded-full bg-slate-900/90 border border-emerald-500/30 px-6 py-2 text-center text-xs sm:text-sm font-bold text-emerald-300 shadow-2xl backdrop-blur-md animate-fade-in max-w-[88vw]">
          ✨ {toastMessage}
        </div>
      )}

      {/* Keyboard Controls Guide Bar (Hidden on small touch screens) */}
      <div className="hidden lg:flex absolute bottom-4 left-1/2 z-10 -translate-x-1/2 items-center gap-3 rounded-full bg-slate-950/75 px-5 py-1.5 backdrop-blur-md border border-white/10 text-[11px] text-slate-300">
        <span><kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-bold text-amber-300">WASD</kbd> Gehen</span>
        <span><kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-bold text-orange-300">F</kbd> Abbauen/Fällen</span>
        <span><kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-bold text-cyan-300">C</kbd> Crafting</span>
        <span><kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-bold text-emerald-300">B</kbd> Bauen</span>
        <span><kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-bold text-red-300">ESC/X</kbd> Bau-Modus Beenden</span>
        <span><kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-bold text-slate-200">M</kbd> Karte</span>
        <span><kbd className="rounded bg-slate-800 px-1.5 py-0.5 font-bold text-slate-200">I</kbd> Inventar</span>
      </div>
    </div>
  );
};
