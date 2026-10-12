import React, { useState } from 'react';
import { Play, Settings, Globe, User, Shield, Sparkles, ChevronRight, ArrowLeft, Dices, Sun, Moon, Sunrise, Sunset, Flame, Snowflake, Trees, Compass } from 'lucide-react';
import { AvatarVariant, WorldCreationOptions } from '../types';

interface StartMenuModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings: () => void;
  currentVariant: AvatarVariant;
  onSelectAvatar: (variant: AvatarVariant) => void;
  onCreateWorld: (options: WorldCreationOptions) => void;
}

export const StartMenuModal: React.FC<StartMenuModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  currentVariant,
  onSelectAvatar,
  onCreateWorld,
}) => {
  const [tab, setTab] = useState<'main' | 'world_create' | 'avatar_select'>('main');

  // World creation state
  const [worldName, setWorldName] = useState<string>('Königreich Hyrule');
  const [worldSeed, setWorldSeed] = useState<string>('HYRULE-' + Math.floor(Math.random() * 8999 + 1000));
  const [biome, setBiome] = useState<'hyrule' | 'snow' | 'desert' | 'volcano'>('hyrule');
  const [template, setTemplate] = useState<'procedural' | 'circuit_flat' | 'flat' | 'islands' | 'mountains'>('procedural');
  const [timeOfDay, setTimeOfDay] = useState<number>(10.5);
  const [difficulty, setDifficulty] = useState<'explorer' | 'normal' | 'master'>('normal');
  const [selectedAvatar, setSelectedAvatar] = useState<AvatarVariant>(currentVariant);

  if (!isOpen) return null;

  const handleRandomSeed = () => {
    setWorldSeed('SEED-' + Math.floor(Math.random() * 899999 + 100000));
  };

  const handleStartCreatedWorld = () => {
    onCreateWorld({
      name: worldName,
      seed: worldSeed,
      biome,
      template,
      timeOfDay,
      difficulty,
      avatarVariant: selectedAvatar,
    });
    onClose();
  };

  const avatarCards: Array<{
    id: AvatarVariant;
    name: string;
    genderBadge: string;
    typeBadge: string;
    badgeColor: string;
    icon: string;
    desc: string;
    details: string[];
  }> = [
    {
      id: 'hylian_hero',
      name: 'Recke Link',
      genderBadge: 'Männlich',
      typeBadge: 'Hylia-Ritter',
      badgeColor: 'from-blue-600 to-cyan-500',
      icon: '🗡️',
      desc: 'Der Champion von Hyrule im Reckengewand.',
      details: ['Hylianische Elfenohren & Goldringe', 'Geschichtete Anime-Strähnen & Zopf', 'Reckengewand & Sheikah-Stein', 'Klassischer Schwertkampf'],
    },
    {
      id: 'princess_zelda',
      name: 'Prinzessin Zelda',
      genderBadge: 'Weiblich',
      typeBadge: 'Weisheits-Priesterin',
      badgeColor: 'from-amber-500 to-yellow-300',
      icon: '👑',
      desc: 'Die königliche Priesterin im edlen Saphir-Gold-Ornat.',
      details: ['Königliches Gold-Diadem mit Saphir', 'Lange Zöpfe mit goldenen Bändern', 'Weißes Seidenkleid & Saphir-Korsett', 'Smaragdgrüne Augen & Zarter Teint'],
    },
    {
      id: 'kitsune_beast',
      name: 'Kitsune Schatten-Fuchs',
      genderBadge: 'Tierwesen / Weiblich',
      typeBadge: 'Fuchskriegerin',
      badgeColor: 'from-orange-600 to-amber-500',
      icon: '🦊',
      desc: 'Mystische Fuchskriegerin mit flauschigen Ohren und Schweif.',
      details: ['Flauschige 3D-Fuchsohren (Rosa Innenfell)', 'Dynamischer Fuchsschweif mit weißer Spitze', 'Reißzahn-Amulett & Ninja-Leder', 'Bernstein-Raubtieraugen mit Schlitzpupillen'],
    },
    {
      id: 'dragon_warrior',
      name: 'Drachen-Recke',
      genderBadge: 'Tierwesen / Männlich',
      typeBadge: 'Drachenchampion',
      badgeColor: 'from-red-600 to-orange-600',
      icon: '🐉',
      desc: 'Uralter Drachenkrieger mit geschwungenen Hörnern & Schuppenpanzer.',
      details: ['Geschwungene Obsidian-Drachenhörner', 'Glühender Magma-Kern auf der Brust', 'Peitschender Stachel-Drachenschweif', 'Glühende Reptilien-Flammenaugen'],
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-xl p-4 sm:p-6 overflow-y-auto animate-fade-in font-sans">
      <div className="relative w-full max-w-3xl rounded-3xl border border-cyan-500/30 bg-gradient-to-b from-slate-900/95 via-slate-950/98 to-slate-900/95 p-6 sm:p-8 shadow-2xl backdrop-blur-2xl text-white">
        
        {/* Decorative Top Crest */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-500 shadow-lg shadow-cyan-500/30 border border-cyan-400/50 mb-3 animate-pulse">
            <span className="text-2xl">▲</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-wider bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 bg-clip-text text-transparent">
            HYRULE REALMS
          </h1>
          <p className="text-xs sm:text-sm text-cyan-200/80 mt-1 font-medium tracking-wide">
            Das Vermächtnis von Breath of the Wild & Catan
          </p>
        </div>

        {/* ----------------------------------------------------------- */}
        {/* VIEW: MAIN START MENU                                      */}
        {/* ----------------------------------------------------------- */}
        {tab === 'main' && (
          <div className="space-y-4 max-w-md mx-auto">
            {/* 1. Spiel starten */}
            <button
              onClick={onClose}
              className="w-full group flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 shadow-xl shadow-cyan-600/30 border border-cyan-300/40 transition transform active:scale-98 hover:scale-[1.02]"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white">
                  <Play className="h-5 w-5 fill-current" />
                </div>
                <div className="text-left">
                  <div className="text-base font-bold text-white group-hover:text-amber-200 transition">Spiel starten</div>
                  <div className="text-xs text-cyan-100/70">Direkt in die lebendige Welt eintauchen</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-cyan-200 group-hover:translate-x-1 transition" />
            </button>

            {/* 2. Welt erstellen */}
            <button
              onClick={() => setTab('world_create')}
              className="w-full group flex items-center justify-between p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-400/50 transition transform active:scale-98 hover:scale-[1.02]"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                  <Globe className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <div className="text-base font-bold text-slate-100 group-hover:text-emerald-300 transition">Welt erstellen & anpassen</div>
                  <div className="text-xs text-slate-400">Biome, Seed, Tageszeit & Schwierigkeit wählen</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400 group-hover:translate-x-1 transition" />
            </button>

            {/* 3. Avatar auswählen */}
            <button
              onClick={() => setTab('avatar_select')}
              className="w-full group flex items-center justify-between p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-amber-400/50 transition transform active:scale-98 hover:scale-[1.02]"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg">
                  👤
                </div>
                <div className="text-left">
                  <div className="text-base font-bold text-slate-100 group-hover:text-amber-300 transition">Charakter auswählen (4 Avatare)</div>
                  <div className="text-xs text-slate-400">Link, Zelda, Kitsune-Fuchs oder Drachenkrieger</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400 group-hover:translate-x-1 transition" />
            </button>

            {/* 4. Einstellungen */}
            <button
              onClick={() => {
                onOpenSettings();
                onClose();
              }}
              className="w-full group flex items-center justify-between p-4 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 hover:border-purple-400/50 transition transform active:scale-98 hover:scale-[1.02]"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <Settings className="h-5 w-5" />
                </div>
                <div className="text-left">
                  <div className="text-base font-bold text-slate-100 group-hover:text-purple-300 transition">Einstellungen</div>
                  <div className="text-xs text-slate-400">Grafik, Audio, Touch-Steuerung & Kamera</div>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-slate-400 group-hover:translate-x-1 transition" />
            </button>

            {/* Controls summary footer */}
            <div className="pt-4 border-t border-slate-800 text-center text-xs text-slate-400">
              <span className="font-semibold text-cyan-300">Tipp:</span> Im Spiel jederzeit mit <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300">ESC</kbd> oder Menü-Knopf erreichbar.
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------- */}
        {/* VIEW: WORLD CREATION                                        */}
        {/* ----------------------------------------------------------- */}
        {tab === 'world_create' && (
          <div className="space-y-5 animate-fade-in">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => setTab('main')}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-slate-100">Neue Welt erschaffen</h2>
                <p className="text-xs text-slate-400">Passe dein Abenteuer nach deinen Vorstellungen an</p>
              </div>
            </div>

            {/* Welten-Name & Seed */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Welten-Name</label>
                <input
                  type="text"
                  value={worldName}
                  onChange={(e) => setWorldName(e.target.value)}
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">Welten-Seed</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={worldSeed}
                    onChange={(e) => setWorldSeed(e.target.value)}
                    className="flex-1 rounded-xl bg-slate-800 border border-slate-700 px-3.5 py-2 text-sm text-white focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    onClick={handleRandomSeed}
                    className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 transition"
                    title="Zufälligen Seed generieren"
                  >
                    <Dices className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Start-Biom */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Start-Biom wählen</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { id: 'hyrule', name: 'Hyrule-Ebene', icon: '🌲', desc: 'Üppige Wälder & Gras' },
                  { id: 'snow', name: 'Hebra-Schnee', icon: '❄️', desc: 'Frost & Schneespuren' },
                  { id: 'desert', name: 'Gerudo-Wüste', icon: '🏜️', desc: 'Dünen & Oasen' },
                  { id: 'volcano', name: 'Eldin-Vulkan', icon: '🌋', desc: 'Basalt & Reiche Erze' },
                ].map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setBiome(b.id as any)}
                    className={`p-3 rounded-2xl text-left border transition ${
                      biome === b.id
                        ? 'bg-cyan-500/20 border-cyan-400 text-white shadow-lg shadow-cyan-500/10'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="text-2xl mb-1">{b.icon}</div>
                    <div className="text-xs font-bold text-white">{b.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{b.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Landschafts-Vorlage & Gelände */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Landschafts-Vorlage & Gelände</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { id: 'procedural', name: 'Standard Hyrule', icon: '⛰️', desc: 'Hügel, Täler & Seen' },
                  { id: 'flat', name: 'Flaches Land', icon: '🌱', desc: 'Sanfte grüne Wiesen' },
                  { id: 'circuit_flat', name: 'Rennstrecke', icon: '🏁', desc: '100% flach für Straßen' },
                  { id: 'islands', name: 'Insel-Archipel', icon: '🏝️', desc: 'Inseln & Ozean' },
                  { id: 'mountains', name: 'Hochgebirge', icon: '🏔️', desc: 'Alpine Schneegipfel' },
                ].map((tpl) => (
                  <button
                    key={tpl.id}
                    onClick={() => setTemplate(tpl.id as any)}
                    className={`p-2.5 rounded-2xl text-left border transition ${
                      template === tpl.id
                        ? 'bg-emerald-500/20 border-emerald-400 text-white shadow-lg shadow-emerald-500/10'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="text-xl mb-0.5">{tpl.icon}</div>
                    <div className="text-xs font-bold text-white leading-tight">{tpl.name}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{tpl.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Start-Tageszeit */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Start-Tageszeit</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { time: 6.0, name: 'Morgengrauen', icon: Sunrise },
                  { time: 12.0, name: 'Mittagssonne', icon: Sun },
                  { time: 18.5, name: 'Abenddämmerung', icon: Sunset },
                  { time: 23.0, name: 'Sternennacht', icon: Moon },
                ].map((t) => {
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.name}
                      onClick={() => setTimeOfDay(t.time)}
                      className={`flex items-center gap-2 p-2.5 rounded-xl border transition text-xs font-semibold ${
                        timeOfDay === t.time
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200'
                          : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:border-slate-600'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{t.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Schwierigkeit */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-2">Schwierigkeitsgrad</label>
              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { id: 'explorer', name: 'Erkunder', desc: '5 Herzen / Entspannt' },
                  { id: 'normal', name: 'Klassisch', desc: '3 Herzen / Standard' },
                  { id: 'master', name: 'Meister-Modus', desc: '2 Herzen / Hart' },
                ].map((d) => (
                  <button
                    key={d.id}
                    onClick={() => setDifficulty(d.id as any)}
                    className={`p-2.5 rounded-xl border transition text-center ${
                      difficulty === d.id
                        ? 'bg-blue-500/20 border-blue-400 text-blue-200'
                        : 'bg-slate-800/60 border-slate-700/80 text-slate-400 hover:border-slate-600'
                    }`}
                  >
                    <div className="text-xs font-bold text-white">{d.name}</div>
                    <div className="text-[10px] text-slate-400">{d.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-3">
              <button
                onClick={() => setTab('main')}
                className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-sm transition"
              >
                Zurück
              </button>
              <button
                onClick={handleStartCreatedWorld}
                className="flex-2 py-3 px-6 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-extrabold text-sm shadow-xl shadow-emerald-500/30 transition transform hover:scale-[1.02] active:scale-98"
              >
                🌍 Welt erschaffen & Starten
              </button>
            </div>
          </div>
        )}

        {/* ----------------------------------------------------------- */}
        {/* VIEW: AVATAR SELECTION                                      */}
        {/* ----------------------------------------------------------- */}
        {tab === 'avatar_select' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center gap-3 mb-2">
              <button
                onClick={() => setTab('main')}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <div>
                <h2 className="text-xl font-bold text-slate-100">Spielfigur wählen</h2>
                <p className="text-xs text-slate-400">Wähle deinen Helden – jederzeit im Spiel wechselbar</p>
              </div>
            </div>

            {/* 4 Avatar Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {avatarCards.map((card) => {
                const isSelected = selectedAvatar === card.id;
                return (
                  <div
                    key={card.id}
                    onClick={() => {
                      setSelectedAvatar(card.id);
                      onSelectAvatar(card.id);
                    }}
                    className={`cursor-pointer rounded-2xl p-4 border transition-all transform active:scale-98 ${
                      isSelected
                        ? 'bg-slate-800/90 border-cyan-400 ring-2 ring-cyan-400/40 shadow-xl shadow-cyan-500/20 scale-[1.01]'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2.5">
                        <span className="text-2xl">{card.icon}</span>
                        <div>
                          <div className="text-sm font-bold text-white">{card.name}</div>
                          <div className="text-[11px] text-cyan-300 font-medium">{card.typeBadge}</div>
                        </div>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r ${card.badgeColor} text-slate-950`}>
                        {card.genderBadge}
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 mb-2.5 leading-relaxed">{card.desc}</p>

                    <div className="space-y-1">
                      {card.details.map((detail, idx) => (
                        <div key={idx} className="flex items-center gap-1.5 text-[11px] text-slate-400">
                          <span className="text-cyan-400">•</span>
                          <span>{detail}</span>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 pt-2.5 border-t border-slate-800 flex justify-end">
                      <span className={`text-xs font-bold ${isSelected ? 'text-cyan-300' : 'text-slate-500'}`}>
                        {isSelected ? '✓ Ausgewählt' : 'Auswählen'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setTab('main')}
                className="px-6 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition"
              >
                Fertig
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
