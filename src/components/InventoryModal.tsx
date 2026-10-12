import React from 'react';
import { X, Shield, Sword, Sparkles, Heart, Zap } from 'lucide-react';
import { InventoryItem } from '../types';

interface InventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: InventoryItem[];
  onEquipItem: (id: string) => void;
  onUseItem: (id: string) => void;
}

export const InventoryModal: React.FC<InventoryModalProps> = ({
  isOpen,
  onClose,
  items,
  onEquipItem,
  onUseItem,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-2 sm:p-4 backdrop-blur-xl animate-fade-in select-none">
      <div className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col rounded-2xl sm:rounded-3xl border border-amber-500/30 bg-slate-900/90 p-3.5 sm:p-6 text-slate-100 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between border-b border-white/10 pb-2.5 sm:pb-3">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 text-amber-400" />
            <h2 className="text-base sm:text-xl font-bold tracking-wide text-white">Inventar & Ausrüstung</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-slate-800 p-1.5 sm:p-2 text-slate-400 transition hover:bg-slate-700 hover:text-white"
          >
            <X className="h-4 w-4 sm:h-5 sm:w-5" />
          </button>
        </div>

        {/* Item Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4 flex-1 min-h-0 py-2.5 sm:py-4 overflow-y-auto pr-1">
          {items.map((item) => (
            <div
              key={item.id}
              className={`flex flex-col justify-between rounded-xl sm:rounded-2xl p-3 sm:p-4 border transition ${
                item.equipped
                  ? 'border-amber-400 bg-amber-950/30 shadow-lg shadow-amber-500/10'
                  : 'border-white/10 bg-slate-800/40 hover:border-slate-600'
              }`}
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="text-3xl">{item.icon}</span>
                  {item.equipped && (
                    <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-[10px] font-extrabold text-slate-950 uppercase">
                      Ausgerüstet
                    </span>
                  )}
                </div>

                <h3 className="mt-2 text-base font-bold text-white">{item.name}</h3>
                <p className="mt-1 text-xs text-slate-400 line-clamp-2">{item.description}</p>

                {/* Stat badges */}
                <div className="mt-3 flex items-center gap-2">
                  {item.attackPower && (
                    <span className="flex items-center gap-1 rounded-md bg-red-950/60 px-2 py-0.5 text-xs font-bold text-red-400 border border-red-500/30">
                      <Sword className="h-3 w-3" /> +{item.attackPower} Angr.
                    </span>
                  )}
                  {item.defensePower && (
                    <span className="flex items-center gap-1 rounded-md bg-blue-950/60 px-2 py-0.5 text-xs font-bold text-blue-400 border border-blue-500/30">
                      <Shield className="h-3 w-3" /> +{item.defensePower} Vert.
                    </span>
                  )}
                  {item.restoreHealth && (
                    <span className="flex items-center gap-1 rounded-md bg-emerald-950/60 px-2 py-0.5 text-xs font-bold text-emerald-400 border border-emerald-500/30">
                      <Heart className="h-3 w-3 fill-current" /> +{item.restoreHealth / 4} Herz
                    </span>
                  )}
                  {item.restoreStamina && (
                    <span className="flex items-center gap-1 rounded-md bg-teal-950/60 px-2 py-0.5 text-xs font-bold text-teal-400 border border-teal-500/30">
                      <Zap className="h-3 w-3 fill-current" /> Ausdauer
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-4 flex items-center gap-2">
                {item.type === 'potion' ? (
                  <button
                    onClick={() => onUseItem(item.id)}
                    className="w-full rounded-xl bg-emerald-500 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"
                  >
                    Trank trinken
                  </button>
                ) : item.type === 'tool' || item.type === 'weapon' ? (
                  <button
                    onClick={() => onEquipItem(item.id)}
                    className={`w-full rounded-xl py-2 text-xs font-bold transition ${
                      item.equipped
                        ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        : 'bg-amber-400 text-slate-950 hover:bg-amber-300 shadow-md shadow-amber-500/20'
                    }`}
                  >
                    {item.equipped ? 'Ablegen' : 'Ausrüsten & Halten'}
                  </button>
                ) : (
                  <div className="text-xs text-slate-500 font-medium py-1">Anzahl: {item.quantity || 1}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
