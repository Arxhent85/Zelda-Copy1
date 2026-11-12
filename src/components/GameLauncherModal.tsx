import React from 'react';
import { Play, Rocket, Shield, Sparkles, Flame, Compass, ChevronRight, Zap, Target } from 'lucide-react';

interface GameLauncherModalProps {
  isOpen: boolean;
  onSelectGame: (game: 'zelda' | 'starfox') => void;
}

export const GameLauncherModal: React.FC<GameLauncherModalProps> = ({ isOpen, onSelectGame }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-slate-950/90 backdrop-blur-2xl animate-fade-in select-none">
      <div className="relative w-full max-w-4xl max-h-[95dvh] flex flex-col rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-slate-900/95 via-slate-950/95 to-slate-900/95 p-5 sm:p-8 shadow-2xl backdrop-blur-2xl overflow-y-auto">
        {/* Header */}
        <div className="text-center mb-6 shrink-0">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-400/30 text-cyan-300 text-xs font-semibold mb-2">
            <Sparkles className="h-3.5 w-3.5" />
            <span>SPIELAUSWAHL & LEVEL-PORTAL</span>
          </div>
          <h1 className="text-2xl sm:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-cyan-300 to-blue-400 tracking-wide">
            Wähle dein Spielerlebnis
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-slate-400 max-w-lg mx-auto">
            Wähle zu Beginn frei, welches Abenteuer du spielen möchtest. Du kannst im Menü jederzeit wechseln!
          </p>
        </div>

        {/* 2 Big Game Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 flex-1">
          {/* 1. THE LEGEND OF ZELDA: TEARS OF HYRULE */}
          <div className="group relative rounded-2xl sm:rounded-3xl border border-amber-500/30 hover:border-amber-400/80 bg-gradient-to-b from-slate-900/90 to-slate-950/90 p-5 sm:p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl hover:shadow-amber-500/20 hover:-translate-y-1">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-2xl shadow-inner shadow-amber-500/20">
                  🗡️
                </div>
                <span className="text-[10px] font-black tracking-widest px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  OPEN WORLD RPG
                </span>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white group-hover:text-amber-300 transition">
                  The Legend of Zelda
                </h2>
                <div className="text-xs font-bold text-amber-400 tracking-wider">TEARS OF HYRULE</div>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  Erkunde ein lebendiges 3D-Königreich. Ernte Rohstoffe, baue Catan-Siedlungen, schalte antike Schreine frei und reite über weite Wiesen.
                </p>
              </div>

              {/* Feature Highlights */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800 text-[11px] text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="text-amber-400">✓</span> 4 Helden: Link, Zelda, Kitsune & Drache
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-amber-400">✓</span> Catan-Bausystem, Werkbank & Crafting
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-amber-400">✓</span> Schreine, Teleport & dynamischer Tag/Nacht-Zyklus
                </div>
              </div>
            </div>

            <button
              onClick={() => onSelectGame('zelda')}
              className="mt-6 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs sm:text-sm tracking-wide shadow-lg shadow-amber-500/30 transition transform active:scale-95 group-hover:scale-[1.02]"
            >
              <span>Hyrule betreten</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* 2. STAR FOX: NEW CORNERIA BAY */}
          <div className="group relative rounded-2xl sm:rounded-3xl border-2 border-cyan-500/50 hover:border-cyan-300 bg-gradient-to-b from-cyan-950/40 via-slate-950/90 to-blue-950/40 p-5 sm:p-6 flex flex-col justify-between transition-all duration-300 hover:shadow-2xl hover:shadow-cyan-500/30 hover:-translate-y-1 ring-1 ring-cyan-500/30">
            {/* Top Badge */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-400/50 flex items-center justify-center text-2xl shadow-inner shadow-cyan-500/30 animate-pulse">
                  🚀
                </div>
                <span className="text-[10px] font-black tracking-widest px-2.5 py-1 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/50">
                  3D RAIL SHOOTER LEVEL
                </span>
              </div>

              <div>
                <h2 className="text-xl sm:text-2xl font-black text-white group-hover:text-cyan-300 transition">
                  Star Fox: New Corneria Bay
                </h2>
                <div className="text-xs font-bold text-cyan-400 tracking-wider">NEXT-GEN FLIGHT ACTION</div>
                <p className="mt-2 text-xs text-slate-300 leading-relaxed">
                  Steige ins Cockpit des Arwing Strikefighters! Fliege mit Höchstgeschwindigkeit über den Ozean, weiche schwimmenden Hochhäusern aus und vernichte feindliche Staffeln.
                </p>
              </div>

              {/* Feature Highlights */}
              <div className="space-y-1.5 pt-2 border-t border-slate-800 text-[11px] text-slate-300">
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span> Flüssiges Fluggefühl, Banking, Boost & Speed-Lines
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span> Barrel Roll zur Laser-Abwehr (Doppel-A/D / Q/E)
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span> Twin Plasma, Charge Shot & Smart-Bomben
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400">✓</span> Funk-Übertragungen von Commander Vance & Synth-BGM
                </div>
              </div>
            </div>

            <button
              onClick={() => onSelectGame('starfox')}
              className="mt-6 w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-xs sm:text-sm tracking-wide shadow-xl shadow-cyan-500/40 transition transform active:scale-95 group-hover:scale-[1.02]"
            >
              <span>Arwing Mission starten</span>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-6 pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>🎮 Tastatur, Maus & Touch-Steuerung voll unterstützt</span>
          <span className="text-cyan-400 font-medium">Three.js r185 High-End Graphics</span>
        </div>
      </div>
    </div>
  );
};
