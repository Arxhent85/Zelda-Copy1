import React, { useState } from 'react';
import { InventoryItem } from '../types';
import { CraftingSystem } from '../game/CraftingSystem';
import { Hammer, Pickaxe, Axe, Shield, X, Sparkles, Check, AlertCircle, Wrench } from 'lucide-react';

interface CraftingModalProps {
  isOpen: boolean;
  onClose: () => void;
  inventory: InventoryItem[];
  isNearWorkbench: boolean;
  onCraft: (recipeId: string) => void;
  onSelectBuildType: (buildType: string) => void;
}

export const CraftingModal: React.FC<CraftingModalProps> = ({
  isOpen,
  onClose,
  inventory,
  isNearWorkbench,
  onCraft,
  onSelectBuildType,
}) => {
  const [activeTab, setActiveTab] = useState<'tools' | 'building' | 'resources' | 'gear'>('tools');

  if (!isOpen) return null;

  const recipes = CraftingSystem.RECIPES.filter((r) => r.category === activeTab);

  const getIngredientCount = (ingId: string, name: string) => {
    const keyLower = ingId.toLowerCase();
    const nameLower = name.toLowerCase();

    const item = inventory.find((i) => {
      const iName = i.name.toLowerCase();
      const iId = i.id.toLowerCase();
      if (iId === keyLower || iName === nameLower) return true;
      if (keyLower.includes('holz') && (iName.includes('holz') || iId.includes('wood'))) return true;
      if (keyLower.includes('erz') && (iName.includes('erz') || iName.includes('stein') || iId.includes('stone') || iId.includes('ore'))) return true;
      if (keyLower.includes('lehm') && iName.includes('lehm')) return true;
      if (keyLower.includes('getreide') && (iName.includes('getreide') || iName.includes('weizen'))) return true;
      if (keyLower.includes('wolle') && iName.includes('wolle')) return true;
      return false;
    });

    return item ? item.quantity : 0;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-2 sm:p-4 md:p-6 backdrop-blur-md animate-fade-in select-none">
      <div className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col rounded-2xl sm:rounded-3xl border border-amber-500/30 bg-slate-900/90 shadow-2xl backdrop-blur-2xl text-slate-100 overflow-hidden">
        {/* Header Bar */}
        <div className="shrink-0 flex items-center justify-between border-b border-amber-500/20 bg-slate-950/60 px-3.5 sm:px-6 py-2.5 sm:py-3.5">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="flex h-8 w-8 sm:h-10 sm:w-10 items-center justify-center rounded-xl sm:rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-slate-950 shadow-lg">
              <Hammer className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-xl font-bold tracking-wide text-amber-200">Werkbank & Crafting</h2>
              <p className="text-[10px] sm:text-xs text-slate-400">Ressourcen kombinieren & eigene Strukturen erschaffen</p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {isNearWorkbench ? (
              <span className="flex items-center gap-1 sm:gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs font-semibold text-emerald-400">
                <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> <span className="hidden xs:inline">Werkbank</span> Aktiv
              </span>
            ) : (
              <span className="flex items-center gap-1 sm:gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 sm:px-3 py-0.5 sm:py-1 text-[10px] sm:text-xs text-amber-300">
                <AlertCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5" /> <span className="hidden xs:inline">Hand-</span>Crafting
              </span>
            )}

            <button
              onClick={onClose}
              className="flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition"
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="shrink-0 flex border-b border-slate-800 bg-slate-950/40 px-3 sm:px-4 pt-1.5 sm:pt-2 gap-1.5 sm:gap-2 overflow-x-auto">
          <button
            onClick={() => setActiveTab('tools')}
            className={`flex items-center gap-1.5 sm:gap-2 rounded-t-xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'tools'
                ? 'bg-amber-500/20 text-amber-300 border-b-2 border-amber-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Pickaxe className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Werkzeuge
          </button>
          <button
            onClick={() => setActiveTab('building')}
            className={`flex items-center gap-1.5 sm:gap-2 rounded-t-xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'building'
                ? 'bg-amber-500/20 text-amber-300 border-b-2 border-amber-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Hammer className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Bauelemente
          </button>
          <button
            onClick={() => setActiveTab('resources')}
            className={`flex items-center gap-1.5 sm:gap-2 rounded-t-xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'resources'
                ? 'bg-amber-500/20 text-amber-300 border-b-2 border-amber-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Wrench className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Materialien
          </button>
          <button
            onClick={() => setActiveTab('gear')}
            className={`flex items-center gap-1.5 sm:gap-2 rounded-t-xl px-3 sm:px-4 py-2 sm:py-2.5 text-xs sm:text-sm font-semibold transition ${
              activeTab === 'gear'
                ? 'bg-amber-500/20 text-amber-300 border-b-2 border-amber-400'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }`}
          >
            <Shield className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Ausrüstung
          </button>
        </div>

        {/* Recipe Grid */}
        <div className="grid flex-1 min-h-0 grid-cols-1 gap-2.5 sm:gap-4 overflow-y-auto p-3 sm:p-6 sm:grid-cols-2">
          {recipes.map((recipe) => {
            const output = recipe.resultItem;
            const canCraftCheck = CraftingSystem.canCraft(recipe, inventory, isNearWorkbench);

            return (
              <div
                key={recipe.id}
                className={`relative flex flex-col justify-between rounded-2xl border p-4 transition-all ${
                  canCraftCheck.can
                    ? 'border-amber-500/40 bg-slate-800/60 hover:border-amber-400 hover:bg-slate-800/80 shadow-lg'
                    : 'border-slate-800 bg-slate-900/40 opacity-75'
                }`}
              >
                <div>
                  {/* Top Info */}
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-900 text-2xl shadow-inner border border-slate-700">
                        {output.icon}
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-100 flex items-center gap-2">
                          {output.name}
                          <span className="text-xs font-normal text-amber-400">x{output.quantity}</span>
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">{output.description}</p>
                      </div>
                    </div>

                    {recipe.requiresWorkbench && (
                      <span className="rounded-md bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 border border-amber-500/30">
                        Werkbank
                      </span>
                    )}
                  </div>

                  {/* Required Ingredients */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {recipe.ingredients.map((ing) => {
                      const current = getIngredientCount(ing.itemId, ing.name);
                      const hasEnough = current >= ing.quantity;

                      return (
                        <div
                          key={ing.itemId}
                          className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs ${
                            hasEnough
                              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                              : 'border-red-500/30 bg-red-500/10 text-red-300'
                          }`}
                        >
                          <span>{ing.name}:</span>
                          <span className="font-bold">
                            {current}/{ing.quantity}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Craft Button */}
                <div className="mt-5 flex gap-2">
                  <button
                    disabled={!canCraftCheck.can}
                    onClick={() => onCraft(recipe.id)}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-xs font-bold transition shadow-md ${
                      canCraftCheck.can
                        ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 hover:scale-[1.02] active:scale-95'
                        : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <Sparkles className="h-4 w-4" /> Herstellen
                  </button>

                  {output.type === 'building_part' && output.buildingType && (
                    <button
                      onClick={() => {
                        onSelectBuildType(output.buildingType!);
                        onClose();
                      }}
                      className="flex items-center justify-center rounded-xl bg-cyan-600/30 border border-cyan-400/40 px-3 py-2.5 text-xs font-bold text-cyan-300 hover:bg-cyan-600/50 transition"
                    >
                      Platzieren
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
