import React from 'react';
import { X, MapPin, Zap, Compass, CheckCircle2 } from 'lucide-react';
import { ShrineData, Vector3D } from '../types';

interface FullMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  playerPos: Vector3D;
  shrines: ShrineData[];
  onFastTravel: (shrineId: string) => void;
}

export const FullMapModal: React.FC<FullMapModalProps> = ({
  isOpen,
  onClose,
  playerPos,
  shrines,
  onFastTravel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-2 sm:p-4 backdrop-blur-xl animate-fade-in select-none">
      <div className="relative flex max-h-[92dvh] w-full max-w-6xl flex-col rounded-2xl sm:rounded-3xl border border-emerald-500/30 bg-slate-900/90 p-3.5 sm:p-6 text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-white/10 pb-2.5 sm:pb-3">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Compass className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-400" />
            <h2 className="text-base sm:text-xl font-bold tracking-wide text-white">Weltkarte von Hyrule</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-800 p-1.5 sm:p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* Map Body */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 sm:gap-6 flex-1 min-h-0 py-2.5 sm:py-4 overflow-y-auto lg:overflow-hidden">
          {/* Main Visual Map Area */}
          <div className="lg:col-span-3 relative rounded-2xl border border-white/10 bg-slate-950 overflow-hidden flex items-center justify-center p-4">
            {/* Biome Graphic Map Backdrop */}
            <div className="relative h-[480px] w-full rounded-xl bg-gradient-to-tr from-slate-900 via-emerald-950 to-cyan-950 border border-emerald-500/20 shadow-inner flex flex-col justify-between p-6">
              {/* Regional Biome Labels */}
              <div className="absolute top-6 left-8 text-xs font-bold text-cyan-300 uppercase tracking-widest">
                🏔️ Dragon Peak Peaks
              </div>
              <div className="absolute top-1/2 right-10 text-xs font-bold text-emerald-400 uppercase tracking-widest">
                🌲 Whispering Forest
              </div>
              <div className="absolute top-1/3 left-12 text-xs font-bold text-amber-400 uppercase tracking-widest">
                🏛️ Temple Ruins Basin
              </div>
              <div className="absolute bottom-8 right-1/3 text-xs font-bold text-blue-400 uppercase tracking-widest">
                🌊 Crystal Lake
              </div>

              {/* Shrines Placed on Map */}
              {shrines.map((shrine) => {
                // Map coordinate normalization (-300..300 meters -> % on screen)
                const mapX = 50 + (shrine.position.x / 400) * 40;
                const mapY = 50 + (shrine.position.z / 400) * 40;

                return (
                  <div
                    key={shrine.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 group cursor-pointer"
                    style={{ left: `${mapX}%`, top: `${mapY}%` }}
                    onClick={() => {
                      if (shrine.fastTravelUnlocked) {
                        onFastTravel(shrine.id);
                        onClose();
                      }
                    }}
                  >
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform duration-200 group-hover:scale-125 ${
                        shrine.activated
                          ? 'border-cyan-300 bg-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/50'
                          : 'border-slate-500 bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Zap className="h-4 w-4 fill-current" />
                    </div>
                    {/* Tooltip */}
                    <div className="absolute top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-slate-900/90 px-2.5 py-1 text-[10px] font-bold text-white opacity-0 transition group-hover:opacity-100 border border-white/10">
                      {shrine.name} {shrine.fastTravelUnlocked ? '(Fast Travel)' : '(Locked)'}
                    </div>
                  </div>
                );
              })}

              {/* Player Current Location Icon */}
              {(() => {
                const pX = 50 + (playerPos.x / 400) * 40;
                const pY = 50 + (playerPos.z / 400) * 40;
                return (
                  <div
                    className="absolute -translate-x-1/2 -translate-y-1/2 z-20 flex items-center justify-center"
                    style={{ left: `${pX}%`, top: `${pY}%` }}
                  >
                    <div className="h-4 w-4 rounded-full bg-emerald-400 animate-ping absolute" />
                    <div className="h-4 w-4 rounded-full bg-emerald-500 border-2 border-white shadow-lg flex items-center justify-center">
                      <MapPin className="h-2.5 w-2.5 text-white" />
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Side Panel: Shrines & Teleport Destinations */}
          <div className="flex flex-col gap-4 overflow-y-auto pr-1">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Rune Shrines</h3>

            <div className="flex flex-col gap-2.5">
              {shrines.map((shrine) => (
                <div
                  key={shrine.id}
                  className={`flex flex-col rounded-xl p-3.5 border transition ${
                    shrine.activated
                      ? 'border-cyan-500/40 bg-cyan-950/20 hover:border-cyan-400'
                      : 'border-white/10 bg-slate-800/40 opacity-70'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">{shrine.name}</span>
                    {shrine.activated ? (
                      <CheckCircle2 className="h-4 w-4 text-cyan-400" />
                    ) : (
                      <span className="text-[10px] text-slate-500 uppercase">Unexplored</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">{shrine.description}</p>

                  {shrine.fastTravelUnlocked && (
                    <button
                      onClick={() => {
                        onFastTravel(shrine.id);
                        onClose();
                      }}
                      className="mt-2.5 flex items-center justify-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-bold text-slate-950 transition hover:bg-cyan-400"
                    >
                      <Zap className="h-3.5 w-3.5 fill-current" /> Fast Travel
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
