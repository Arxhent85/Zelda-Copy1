import React, { useState, useEffect } from 'react';
import { X, Sliders, Volume2, Monitor, Gamepad2, Sun, Moon, Clock, Play, Pause, Maximize, Minimize, RotateCcw } from 'lucide-react';
import { GameSettings, GraphicsQuality } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GameSettings;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => void;
  onResetWorld?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  onResetWorld,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  if (!isOpen) return null;

  const currentTime = settings.timeOfDay ?? 12.0;
  const isCycleActive = settings.isTimeCycleActive ?? true;
  const cycleSpeed = settings.timeCycleSpeed ?? 1.0;

  const formatTime = (time: number) => {
    const hours = Math.floor(time);
    const mins = Math.floor((time - hours) * 60);
    const padH = hours < 10 ? `0${hours}` : `${hours}`;
    const padM = mins < 10 ? `0${mins}` : `${mins}`;
    return `${padH}:${padM} Uhr`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-2 sm:p-4 backdrop-blur-xl animate-fade-in select-none">
      <div className="relative flex max-h-[92dvh] w-full max-w-3xl flex-col rounded-2xl sm:rounded-3xl border border-slate-700 bg-slate-900/95 p-3.5 sm:p-6 text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-white/10 pb-2.5 sm:pb-3">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Sliders className="h-5 w-5 sm:h-6 sm:w-6 text-cyan-400" />
            <h2 className="text-base sm:text-xl font-bold tracking-wide text-white">Einstellungen & Steuerung</h2>
          </div>
          <div className="flex items-center gap-2">
            {/* Vollbild-Knopf direkt im Header */}
            <button
              onClick={toggleFullscreen}
              className="flex items-center gap-1.5 rounded-full bg-slate-800 hover:bg-slate-700 px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-bold text-cyan-300 border border-cyan-400/30 transition shadow-sm"
              title="Vollbild umschalten"
            >
              {isFullscreen ? <Minimize className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <Maximize className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
              <span>{isFullscreen ? 'Fenster' : 'Vollbild'}</span>
            </button>
            <button
              onClick={onClose}
              className="rounded-full bg-slate-800 p-1.5 sm:p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3.5 sm:gap-5 py-3 sm:py-4 pr-1">
          {/* Tageszeit & Tag/Nacht-Zyklus Manuell bestimmen */}
          <div className="flex flex-col gap-3.5 rounded-2xl border border-amber-500/30 bg-slate-950/70 p-4 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
                <Sun className="h-4 w-4 text-amber-400" /> Tageszeit & Tag/Nacht-Zyklus
              </div>
              <div className="flex items-center gap-1.5 bg-slate-900 px-2.5 py-1 rounded-xl border border-white/10 text-xs font-mono font-bold text-amber-200">
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span>{formatTime(currentTime)}</span>
              </div>
            </div>

            {/* Slider für genaue Uhrzeit */}
            <div>
              <div className="flex justify-between text-xs text-slate-400 mb-1">
                <span>Uhrzeit manuell einstellen:</span>
                <span className="text-amber-300 font-bold">{formatTime(currentTime)}</span>
              </div>
              <input
                type="range"
                min="0"
                max="24"
                step="0.1"
                value={currentTime}
                onChange={(e) => onUpdateSettings({ timeOfDay: parseFloat(e.target.value) })}
                className="w-full accent-amber-400 h-2 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>

            {/* Schnellwahl Buttons */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                onClick={() => onUpdateSettings({ timeOfDay: 6.0 })}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition ${
                  Math.abs(currentTime - 6.0) < 1.0
                    ? 'border-amber-400 bg-amber-500/25 text-amber-200 shadow-sm'
                    : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-white'
                }`}
              >
                <span>🌅 Morgen (06:00)</span>
              </button>
              <button
                onClick={() => onUpdateSettings({ timeOfDay: 12.0 })}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition ${
                  Math.abs(currentTime - 12.0) < 1.0
                    ? 'border-amber-400 bg-amber-500/25 text-amber-200 shadow-sm'
                    : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-white'
                }`}
              >
                <span>☀️ Mittag (12:00)</span>
              </button>
              <button
                onClick={() => onUpdateSettings({ timeOfDay: 18.5 })}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition ${
                  Math.abs(currentTime - 18.5) < 1.0
                    ? 'border-orange-400 bg-orange-500/25 text-orange-200 shadow-sm'
                    : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-white'
                }`}
              >
                <span>🌇 Abend (18:30)</span>
              </button>
              <button
                onClick={() => onUpdateSettings({ timeOfDay: 23.0 })}
                className={`flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition ${
                  currentTime > 21.5 || currentTime < 4.0
                    ? 'border-indigo-400 bg-indigo-500/25 text-indigo-200 shadow-sm'
                    : 'border-white/10 bg-slate-900/60 text-slate-400 hover:text-white'
                }`}
              >
                <span>🌙 Nacht (23:00)</span>
              </button>
            </div>

            {/* Zyklus Toggle & Tempo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-white/10">
              <div className="flex items-center justify-between bg-slate-900/70 p-2.5 rounded-xl border border-white/10">
                <div className="flex flex-col">
                  <span className="text-xs font-bold text-slate-200">Automatischer Zyklus</span>
                  <span className="text-[10px] text-slate-400">
                    {isCycleActive ? 'Uhrzeit schreitet stetig voran' : 'Uhrzeit bleibt fixiert stehen'}
                  </span>
                </div>
                <button
                  onClick={() => onUpdateSettings({ isTimeCycleActive: !isCycleActive })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                    isCycleActive
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                  }`}
                >
                  {isCycleActive ? <Play className="h-3.5 w-3.5 fill-emerald-300" /> : <Pause className="h-3.5 w-3.5" />}
                  <span>{isCycleActive ? 'Aktiv' : 'Pausiert'}</span>
                </button>
              </div>

              <div className="flex flex-col justify-center bg-slate-900/70 p-2.5 rounded-xl border border-white/10">
                <div className="flex justify-between text-xs text-slate-300 mb-1">
                  <span>Zyklus-Tempo:</span>
                  <span className="font-bold text-amber-300">{cycleSpeed.toFixed(1)}x {cycleSpeed === 1.0 ? '(Normal)' : cycleSpeed < 1.0 ? '(Langsam)' : '(Schnell)'}</span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="4.0"
                  step="0.1"
                  value={cycleSpeed}
                  onChange={(e) => onUpdateSettings({ timeCycleSpeed: parseFloat(e.target.value) })}
                  className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Graphics Quality */}
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-sm">
              <Monitor className="h-4 w-4" /> Graphics Quality & Performance
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {(['low', 'medium', 'high', 'ultra'] as GraphicsQuality[]).map((q) => (
                <button
                  key={q}
                  onClick={() => onUpdateSettings({ graphicsQuality: q })}
                  className={`rounded-xl py-2.5 text-xs font-bold capitalize transition border ${
                    settings.graphicsQuality === q
                      ? 'border-cyan-400 bg-cyan-500/20 text-cyan-300'
                      : 'border-white/10 bg-slate-800/40 text-slate-400 hover:border-slate-600'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* Audio Sliders */}
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
              <Volume2 className="h-4 w-4" /> Audio Volumes
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">
                  Music Volume ({Math.round(settings.musicVolume * 100)}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.musicVolume}
                  onChange={(e) => onUpdateSettings({ musicVolume: parseFloat(e.target.value) })}
                  className="w-full accent-amber-400"
                />
              </div>

              <div>
                <label className="text-xs text-slate-400 font-semibold block mb-1">
                  SFX Volume ({Math.round(settings.soundVolume * 100)}%)
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={settings.soundVolume}
                  onChange={(e) => onUpdateSettings({ soundVolume: parseFloat(e.target.value) })}
                  className="w-full accent-amber-400"
                />
              </div>
            </div>
          </div>

          {/* Controls Overview */}
          <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-slate-950/50 p-4">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <Gamepad2 className="h-4 w-4" /> Desktop & Touch Controls Guide
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-300">
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-slate-400">Move Hero:</span>
                <span className="font-bold">W A S D / Left Virtual Joystick</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-slate-400">Camera Orbit:</span>
                <span className="font-bold">Mouse Drag / Right Screen Drag</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-slate-400">Standard-Angriff / Schlagen:</span>
                <span className="font-bold text-emerald-400">Linker Klick (Left Click) / 🗡️ Button</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-slate-400">Schwerer Wirbelschlag:</span>
                <span className="font-bold text-amber-400">Rechter Klick (Right Click)</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-slate-400">Jump / Glide / Climb:</span>
                <span className="font-bold">Space / 🪂 Wing Button</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-slate-400">Sprint / Roll:</span>
                <span className="font-bold">Shift / ⚡ Sprint Button</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-slate-400">Interact Chest/Shrine:</span>
                <span className="font-bold">Key E / ✋ Hand Button</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-slate-400">Lock-On Camera:</span>
                <span className="font-bold">Key Tab / 🎯 Target Button</span>
              </div>
              <div className="flex justify-between border-b border-white/5 pb-1">
                <span className="text-slate-400">World Map / Fast Travel:</span>
                <span className="font-bold">Key M / 🗺️ Map Button</span>
              </div>
            </div>
          </div>

          {/* Welt-Verwaltung & Zurücksetzen auf Standardmodus */}
          {onResetWorld && (
            <div className="flex flex-col gap-2 rounded-2xl border border-red-500/30 bg-red-950/30 p-4 shadow-lg">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex flex-col">
                  <div className="text-red-300 font-bold text-sm flex items-center gap-2">
                    <RotateCcw className="h-4 w-4 text-red-400" /> Welt auf Standard-Zustand zurücksetzen
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    Löscht alle gebauten Straßen, Häuser, Rennstrecken und Gelände-Verformungen. Die Welt startet wie neu im Standardmodus.
                  </div>
                </div>
                <button
                  onClick={() => {
                    if (window.confirm('Möchtest du wirklich die gesamte Welt auf den Standard-Zustand zurücksetzen? Alle Straßen, Bauten und Gelände-Änderungen werden unwiderruflich gelöscht.')) {
                      onResetWorld();
                      onClose();
                    }
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-red-700 to-rose-600 hover:from-red-600 px-4 py-2 text-xs font-bold text-white shadow-md active:scale-95 transition border border-red-400/40"
                >
                  <RotateCcw className="h-4 w-4" /> Standard-Welt laden
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
