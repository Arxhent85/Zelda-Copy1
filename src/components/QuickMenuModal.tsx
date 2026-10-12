import React, { useState, useEffect } from 'react';
import { 
  X, 
  Map, 
  Package, 
  Hammer, 
  User, 
  Mountain, 
  Settings as SettingsIcon, 
  Maximize, 
  Minimize, 
  Compass, 
  Sparkles, 
  ShieldCheck 
} from 'lucide-react';

interface QuickMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenMap: () => void;
  onOpenInventory: () => void;
  onOpenCrafting: () => void;
  onOpenStartMenu: () => void;
  onOpenEditor: () => void;
  onOpenSettings: () => void;
}

export const QuickMenuModal: React.FC<QuickMenuModalProps> = ({
  isOpen,
  onClose,
  onOpenMap,
  onOpenInventory,
  onOpenCrafting,
  onOpenStartMenu,
  onOpenEditor,
  onOpenSettings,
}) => {
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

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-fade-in select-none"
      onClick={onClose}
    >
      <div 
        className="relative w-full max-w-lg max-h-[92dvh] flex flex-col rounded-2xl sm:rounded-3xl border border-amber-500/40 bg-gradient-to-b from-slate-900/95 via-slate-950/95 to-slate-900/95 p-3.5 sm:p-6 shadow-2xl backdrop-blur-xl animate-scale-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar - Always pinned to top */}
        <div className="shrink-0 flex items-center justify-between pb-2.5 sm:pb-3 border-b border-white/10">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <div className="flex h-8 w-8 sm:h-9 sm:w-9 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 shadow-md">
              <Compass className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-lg font-black tracking-wide text-amber-300">HYRULE HAUPTMENÜ</h2>
              <p className="text-[10px] sm:text-[11px] text-slate-400">Schnellzugriff auf alle Spielfunktionen</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 active:scale-95 transition"
            title="Schließen (ESC)"
          >
            <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          </button>
        </div>

        {/* Scrollable Content Body - Adapts to phone landscape, tablet & PC */}
        <div className="flex-1 min-h-0 mt-2.5 sm:mt-4 flex flex-col gap-3 sm:gap-4 overflow-y-auto pr-1">
          {/* 1. Unterpunkt: ABENTEUER & AKTIONEN */}
          <div>
            <div className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-widest text-amber-400 mb-1.5 sm:mb-2 flex items-center gap-1.5">
              <Compass className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Abenteuer & Aktionen
            </div>
            <div className="grid grid-cols-3 gap-1.5 sm:gap-2">
              {/* Weltkarte */}
              <button
                onClick={() => {
                  onClose();
                  onOpenMap();
                }}
                className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-emerald-500/30 text-emerald-300 hover:text-emerald-200 text-xs font-bold gap-1 active:scale-95 transition shadow-md group"
              >
                <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl bg-emerald-500/15 group-hover:bg-emerald-500/25 transition">
                  <Map className="h-4 w-4 sm:h-5 sm:w-5 text-emerald-400" />
                </div>
                <span className="text-[11px] sm:text-xs">Weltkarte</span>
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-normal">Taste M</span>
              </button>

              {/* Inventar */}
              <button
                onClick={() => {
                  onClose();
                  onOpenInventory();
                }}
                className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-amber-500/30 text-amber-300 hover:text-amber-200 text-xs font-bold gap-1 active:scale-95 transition shadow-md group"
              >
                <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl bg-amber-500/15 group-hover:bg-amber-500/25 transition">
                  <Package className="h-4 w-4 sm:h-5 sm:w-5 text-amber-400" />
                </div>
                <span className="text-[11px] sm:text-xs">Inventar</span>
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-normal">Taste I</span>
              </button>

              {/* Crafting */}
              <button
                onClick={() => {
                  onClose();
                  onOpenCrafting();
                }}
                className="flex flex-col items-center justify-center p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-orange-500/30 text-orange-300 hover:text-orange-200 text-xs font-bold gap-1 active:scale-95 transition shadow-md group"
              >
                <div className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-lg sm:rounded-xl bg-orange-500/15 group-hover:bg-orange-500/25 transition">
                  <Hammer className="h-4 w-4 sm:h-5 sm:w-5 text-orange-400" />
                </div>
                <span className="text-[11px] sm:text-xs">Crafting</span>
                <span className="text-[9px] sm:text-[10px] text-slate-400 font-normal">Taste C</span>
              </button>
            </div>
          </div>

          {/* 2. Unterpunkt: WELT & HELD */}
          <div>
            <div className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-widest text-cyan-400 mb-1.5 sm:mb-2 flex items-center gap-1.5">
              <Sparkles className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> Welt & Held
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {/* Held wählen & Startmenü */}
              <button
                onClick={() => {
                  onClose();
                  onOpenStartMenu();
                }}
                className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-cyan-500/30 text-cyan-200 text-xs font-bold active:scale-95 transition shadow-md group text-left"
              >
                <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-cyan-500/15 group-hover:bg-cyan-500/25 transition">
                  <User className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-[11px] sm:text-xs text-cyan-300 truncate">Held & Weltmenü</div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 font-normal truncate">4 Helden, Seeds & Biome (P)</div>
                </div>
              </button>

              {/* Welten-Editor */}
              <button
                onClick={() => {
                  onClose();
                  onOpenEditor();
                }}
                className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-blue-500/30 text-blue-200 text-xs font-bold active:scale-95 transition shadow-md group text-left"
              >
                <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-blue-500/15 group-hover:bg-blue-500/25 transition">
                  <Mountain className="h-4 w-4 sm:h-5 sm:w-5 text-blue-400" />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-[11px] sm:text-xs text-blue-300 truncate">Welten-Editor</div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 font-normal truncate">Terrain & Bau (L / F2)</div>
                </div>
              </button>
            </div>
          </div>

          {/* 3. Unterpunkt: SYSTEM & ANSICHT */}
          <div>
            <div className="text-[9px] sm:text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-1.5 sm:mb-2 flex items-center gap-1.5">
              <ShieldCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> System & Ansicht
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {/* Einstellungen */}
              <button
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-700 text-slate-200 text-xs font-bold active:scale-95 transition shadow-md group text-left"
              >
                <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-slate-800 group-hover:bg-slate-700 transition">
                  <SettingsIcon className="h-4 w-4 sm:h-5 sm:w-5 text-slate-300" />
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-[11px] sm:text-xs text-slate-200 truncate">Einstellungen</div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 font-normal truncate">Grafik, Audio, Touch</div>
                </div>
              </button>

              {/* Vollbildmodus */}
              <button
                onClick={toggleFullscreen}
                className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-xl sm:rounded-2xl bg-slate-900/90 hover:bg-slate-800/90 border border-slate-700 text-slate-200 text-xs font-bold active:scale-95 transition shadow-md group text-left"
              >
                <div className="flex h-8 w-8 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg sm:rounded-xl bg-slate-800 group-hover:bg-slate-700 transition">
                  {isFullscreen ? (
                    <Minimize className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-400" />
                  ) : (
                    <Maximize className="h-4 w-4 sm:h-5 sm:w-5 text-cyan-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="font-extrabold text-[11px] sm:text-xs text-cyan-300 truncate">
                    {isFullscreen ? 'Vollbild Beenden' : 'Vollbild'}
                  </div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 font-normal truncate">Tablet / Phone optimiert</div>
                </div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer Bar - Always pinned to bottom, never cut off */}
        <div className="shrink-0 mt-2.5 sm:mt-4 pt-2.5 sm:pt-3 border-t border-white/10 flex items-center justify-between text-[10px] sm:text-[11px] text-slate-400">
          <span>Drücke <kbd className="rounded bg-slate-800 px-1 py-0.5 text-amber-300 font-bold">ESC</kbd></span>
          <button
            onClick={onClose}
            className="rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 px-3 sm:px-4 py-1.5 font-bold text-slate-950 transition active:scale-95 shadow-md"
          >
            Weiterspielen
          </button>
        </div>
      </div>
    </div>
  );
};
