import React from 'react';
import { X, Sliders, Volume2, Monitor, Gamepad2 } from 'lucide-react';
import { GameSettings, GraphicsQuality } from '../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: GameSettings;
  onUpdateSettings: (newSettings: Partial<GameSettings>) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4 backdrop-blur-xl animate-fade-in">
      <div className="relative flex h-[85vh] w-[95vw] max-w-3xl flex-col rounded-3xl border border-slate-700 bg-slate-900/95 p-6 text-slate-100 shadow-2xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2.5">
            <Sliders className="h-6 w-6 text-cyan-400" />
            <h2 className="text-xl font-bold tracking-wide text-white">Game Settings & Controls</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-800 p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex flex-col gap-6 py-4">
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
                <span className="text-slate-400">Sword Attack:</span>
                <span className="font-bold">Left Click / 🗡️ Sword Button</span>
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
        </div>
      </div>
    </div>
  );
};
