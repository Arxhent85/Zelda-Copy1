import React, { useState, useEffect } from 'react';
import { GameEngine } from '../game/GameEngine';
import { EditorToolType } from '../game/LevelEditorManager';
import { RoadMaterialType, RoadWallType } from '../game/BuildingSystem';
import {
  Play,
  Mountain,
  Palette,
  Trees,
  Save,
  Trash2,
  Sliders,
  Move,
  Brush,
  RotateCcw,
  Sparkles,
  Home,
  Shield,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface LevelEditorUIProps {
  engine: GameEngine | null;
  isOpen: boolean;
  onExitEditor: () => void;
  onToast: (msg: string) => void;
}

export const LevelEditorUI: React.FC<LevelEditorUIProps> = ({
  engine,
  isOpen,
  onExitEditor,
  onToast,
}) => {
  if (!isOpen || !engine) return null;

  const editor = engine.editorManager;

  const [activeTab, setActiveTab] = useState<'sculpt' | 'biome' | 'roads' | 'objects' | 'worlds'>('sculpt');
  const [activeTool, setActiveTool] = useState<EditorToolType>(editor.activeTool);
  const [brushRadius, setBrushRadius] = useState<number>(editor.brushRadius);
  const [brushStrength, setBrushStrength] = useState<number>(editor.brushStrength);
  const [selectedObject, setSelectedObject] = useState<string>(editor.selectedObjectType);
  const [touchMode, setTouchMode] = useState<'paint' | 'camera'>(editor.touchMode || 'paint');
  const [worldNameInput, setWorldNameInput] = useState<string>('Mein Königreich');
  const [savedWorlds, setSavedWorlds] = useState<string[]>(editor.getSavedWorldNames());
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(false);

  // Road & Circuit Planner State
  const [roadMaterial, setRoadMaterial] = useState<RoadMaterialType>(editor.roadPlannerMaterial || 'asphalt');
  const [roadWall, setRoadWall] = useState<RoadWallType>(editor.roadPlannerWall || 'racing_wall');
  const [roadIsLoop, setRoadIsLoop] = useState<boolean>(editor.roadPlannerIsLoop || false);
  const [roadWidth, setRoadWidth] = useState<number>(editor.roadPlannerWidth || 7.5);
  const [roadHasGate, setRoadHasGate] = useState<boolean>(editor.roadPlannerHasStartGate ?? true);
  const [roadPathInfo, setRoadPathInfo] = useState<{ pointCount: number; lengthMeters: number; estimatedSegments: number }>({
    pointCount: editor.roadPlannerPoints.length,
    lengthMeters: 0,
    estimatedSegments: 0,
  });

  useEffect(() => {
    editor.onRoadPathUpdated = (info) => {
      setRoadPathInfo(info);
    };
    return () => {
      editor.onRoadPathUpdated = undefined;
    };
  }, [editor]);

  // Camera Views & Zoom State
  const [editorViewMode, setEditorViewMode] = useState<'3d' | 'topdown' | 'isometric'>(engine.cameraControls.editorViewMode || '3d');
  const [currentZoom, setCurrentZoom] = useState<number>(Math.round(engine.cameraControls.distance));
  const [objectCategory, setObjectCategory] = useState<'roads' | 'vehicles' | 'nature' | 'creatures' | 'buildings'>('vehicles');

  const handleViewModeChange = (mode: '3d' | 'topdown' | 'isometric') => {
    setEditorViewMode(mode);
    engine.cameraControls.setEditorViewMode(mode);
    setCurrentZoom(Math.round(engine.cameraControls.distance));
    onToast(mode === 'topdown' ? '🗺️ Draufsicht aktiviert (Vogelperspektive 90°)' : mode === 'isometric' ? '🏛️ Isometrische Ansicht aktiviert (45°)' : '📐 Freie 3D-Ansicht aktiviert');
  };

  const handleZoomChange = (dist: number) => {
    engine.cameraControls.setEditorZoom(dist);
    setCurrentZoom(Math.round(engine.cameraControls.distance));
  };

  const handleZoomDelta = (delta: number) => {
    engine.cameraControls.zoom(delta);
    setCurrentZoom(Math.round(engine.cameraControls.distance));
  };

  const handleTouchModeChange = (mode: 'paint' | 'camera') => {
    setTouchMode(mode);
    editor.touchMode = mode;
    onToast(mode === 'paint' ? 'Touch-Modus: Bearbeiten (Formen/Malen)' : 'Touch-Modus: Kamera bewegen');
  };

  const handleSelectTool = (tool: EditorToolType) => {
    setActiveTool(tool);
    editor.activeTool = tool;
    onToast(`Werkzeug: ${tool}`);
  };

  const handleSelectObject = (objType: string) => {
    setSelectedObject(objType);
    editor.selectedObjectType = objType;
    handleSelectTool('place');
    onToast(`Objekt ausgewählt: ${objType}`);
  };

  const handleRadiusChange = (val: number) => {
    setBrushRadius(val);
    editor.brushRadius = val;
  };

  const handleStrengthChange = (val: number) => {
    setBrushStrength(val);
    editor.brushStrength = val;
  };

  const handleRoadMaterialChange = (mat: RoadMaterialType) => {
    setRoadMaterial(mat);
    editor.setRoadMaterial(mat);
    onToast(`Straßenbelag: ${mat}`);
  };

  const handleRoadWallChange = (wall: RoadWallType) => {
    setRoadWall(wall);
    editor.setRoadWall(wall);
    onToast(`Barriere / Wand: ${wall}`);
  };

  const handleRoadWidthChange = (w: number) => {
    setRoadWidth(w);
    editor.setRoadWidth(w);
    onToast(`🛣️ Fahrbahnbreite: ${w.toFixed(1)}m`);
  };

  const handleToggleRoadLoop = (loop: boolean) => {
    setRoadIsLoop(loop);
    editor.toggleRoadLoop(loop);
    onToast(loop ? 'Streckentyp: 🔄 Rundkurs (Geschlossener Kreis)' : 'Streckentyp: 🏁 Sprint-Strecke (Start bis Ziel)');
  };

  const handleToggleGate = (hasGate: boolean) => {
    setRoadHasGate(hasGate);
    editor.roadPlannerHasStartGate = hasGate;
  };

  const handleBuildPlannedRoad = () => {
    const res = editor.buildRoadFromPlannedPath();
    onToast(res.message);
    setRoadPathInfo({ pointCount: 0, lengthMeters: 0, estimatedSegments: 0 });
  };

  const handleClearRoadPath = () => {
    editor.clearPlannedPath();
    setRoadPathInfo({ pointCount: 0, lengthMeters: 0, estimatedSegments: 0 });
    onToast('🧹 Gezeichnete Linie gelöscht');
  };

  const handleUndoRoad = () => {
    const res = editor.undoLastBuiltRoad();
    onToast(res.message);
  };

  const handleGenerateTemplate = (template: 'flat' | 'circuit_flat' | 'islands' | 'mountains' | 'procedural' | 'clear') => {
    editor.generateTemplate(template);
    onToast(`Vorlage geladen: ${template === 'circuit_flat' ? 'Rennstrecken-Flachland' : template}`);
  };

  const handleSaveWorld = () => {
    if (!worldNameInput.trim()) return;
    const ok = editor.saveWorld(worldNameInput.trim());
    if (ok) {
      setSavedWorlds(editor.getSavedWorldNames());
      onToast(`Welt '${worldNameInput}' erfolgreich gespeichert!`);
    } else {
      onToast(`Fehler beim Speichern der Welt.`);
    }
  };

  const handleLoadWorld = (name: string) => {
    const ok = editor.loadWorld(name);
    if (ok) {
      onToast(`Welt '${name}' geladen!`);
    } else {
      onToast(`Konnte Welt '${name}' nicht laden.`);
    }
  };

  return (
    <div className="pointer-events-none fixed inset-0 z-40 select-none overflow-hidden font-sans">
      {/* Top Banner & Mode Switch Bar */}
      <div className="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 flex items-center gap-2 sm:gap-4 bg-slate-950/90 border border-cyan-400/50 px-4 sm:px-6 py-2 sm:py-2.5 rounded-2xl shadow-2xl backdrop-blur-xl animate-fade-in max-w-[95vw]">
        <div className="flex items-center gap-2">
          <span className="text-xl">🛠️</span>
          <div>
            <div className="text-xs sm:text-sm font-black text-cyan-300 uppercase tracking-wider">
              Welten- & Level-Editor
            </div>
            <div className="text-[10px] text-slate-400 hidden sm:block">
              Gestalte Berge, Flüsse, Biome & Siedlungen
            </div>
          </div>
        </div>

        <div className="h-6 w-[1px] bg-white/20" />

        {/* Mobile / Tablet Touch Mode Switch */}
        <div className="flex items-center bg-slate-900 rounded-xl p-1 border border-white/10">
          <button
            onClick={() => handleTouchModeChange('paint')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              touchMode === 'paint'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Brush className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Bearbeiten</span>
          </button>
          <button
            onClick={() => handleTouchModeChange('camera')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              touchMode === 'camera'
                ? 'bg-gradient-to-r from-cyan-500 to-blue-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Move className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Kamera</span>
          </button>
        </div>

        {/* Play World Button */}
        <button
          onClick={onExitEditor}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 px-4 py-1.5 text-xs sm:text-sm font-black text-slate-950 shadow-lg hover:scale-105 active:scale-95 transition"
        >
          <Play className="h-4 w-4 fill-slate-950" />
          <span>Welt spielen</span>
        </button>
      </div>

      {/* Floating Camera Views & Zoom Dock Bar */}
      <div className="pointer-events-auto absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-slate-950/90 border border-cyan-500/30 px-3 py-1.5 rounded-2xl shadow-xl backdrop-blur-xl max-w-[95vw] overflow-x-auto">
        {/* View Mode Selector */}
        <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-white/10">
          <button
            onClick={() => handleViewModeChange('topdown')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              editorViewMode === 'topdown'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Draufsicht Vogelperspektive 90° - Ideal zum Einzeichnen von Straßen und Kursen"
          >
            🗺️ <span>Draufsicht (90°)</span>
          </button>
          <button
            onClick={() => handleViewModeChange('isometric')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              editorViewMode === 'isometric'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Isometrische Ansicht 45°"
          >
            🏛️ <span>Isometrisch</span>
          </button>
          <button
            onClick={() => handleViewModeChange('3d')}
            className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition ${
              editorViewMode === '3d'
                ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                : 'text-slate-300 hover:text-white hover:bg-slate-800'
            }`}
            title="Freie 3D-Kamera"
          >
            📐 <span>3D Frei</span>
          </button>
        </div>

        <div className="h-5 w-[1px] bg-white/20" />

        {/* Zoom Controls */}
        <div className="flex items-center gap-1.5 text-xs text-slate-300">
          <button
            onClick={() => handleZoomDelta(20)}
            className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 font-bold border border-white/10 active:scale-95 transition"
            title="Herauszoomen"
          >
            - Zoom
          </button>
          <span className="font-mono text-[11px] text-cyan-300 w-12 text-center">{currentZoom}m</span>
          <button
            onClick={() => handleZoomDelta(-20)}
            className="px-2 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-cyan-300 font-bold border border-white/10 active:scale-95 transition"
            title="Heranzoomen"
          >
            + Zoom
          </button>

          {/* Quick Zoom Presets */}
          <div className="hidden sm:flex items-center gap-1 pl-1">
            {[
              { label: 'Nah (20m)', dist: 20 },
              { label: 'Mittel (60m)', dist: 60 },
              { label: 'Weit (140m)', dist: 140 },
            ].map((p) => (
              <button
                key={p.label}
                onClick={() => handleZoomChange(p.dist)}
                className={`px-2 py-0.5 text-[10px] font-bold rounded-md border transition ${
                  Math.abs(currentZoom - p.dist) < 20
                    ? 'border-cyan-400 bg-cyan-500/25 text-cyan-200'
                    : 'border-white/10 bg-slate-900 text-slate-400 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Floating Tool Dock (Bottom Center) */}
      <div className="pointer-events-auto absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-4xl px-3 flex flex-col items-center">
        {/* Dock Container */}
        <div className="w-full bg-slate-950/95 border border-cyan-500/40 rounded-3xl p-3 sm:p-4 shadow-2xl backdrop-blur-2xl">
          {/* Category Tabs Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-2 mb-3">
            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
              <button
                onClick={() => setActiveTab('sculpt')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeTab === 'sculpt'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-900'
                }`}
              >
                <Mountain className="h-3.5 w-3.5" /> 🏔️ Relief & Berge
              </button>
              <button
                onClick={() => setActiveTab('biome')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeTab === 'biome'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-900'
                }`}
              >
                <Palette className="h-3.5 w-3.5" /> 🎨 Biome & Farben
              </button>
              <button
                onClick={() => {
                  setActiveTab('roads');
                  handleSelectTool('plan_road');
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeTab === 'roads'
                    ? 'bg-orange-500/20 text-orange-300 border border-orange-500/40 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-900'
                }`}
              >
                🏎️ 🛣️ Straßen & Kurs
              </button>
              <button
                onClick={() => setActiveTab('objects')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeTab === 'objects'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-900'
                }`}
              >
                <Trees className="h-3.5 w-3.5" /> 🌲 Objekte & Bauten
              </button>
              <button
                onClick={() => setActiveTab('worlds')}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                  activeTab === 'worlds'
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-900'
                }`}
              >
                <Save className="h-3.5 w-3.5" /> 💾 Welten & Vorlagen
              </button>
            </div>

            <button
              onClick={() => setIsPanelCollapsed(!isPanelCollapsed)}
              className="text-slate-400 hover:text-white p-1"
            >
              {isPanelCollapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>

          {!isPanelCollapsed && (
            <>
              {/* TAB 1: RELIEF / TERRAFORMING & STRASSEN */}
              {activeTab === 'sculpt' && (
                <div className="flex flex-col gap-3 animate-fade-in">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      onClick={() => handleSelectTool('sculpt_raise')}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition ${
                        activeTool === 'sculpt_raise'
                          ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-md font-bold'
                          : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-xl">⛰️</span>
                      <span className="text-xs mt-1">Berg heben</span>
                      <span className="text-[10px] text-slate-400">Terrain anheben</span>
                    </button>
                    <button
                      onClick={() => handleSelectTool('sculpt_lower')}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition ${
                        activeTool === 'sculpt_lower'
                          ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200 shadow-md font-bold'
                          : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-xl">🌊</span>
                      <span className="text-xs mt-1">Tal / See graben</span>
                      <span className="text-[10px] text-slate-400">Senkt bis ins Wasser</span>
                    </button>
                    <button
                      onClick={() => handleSelectTool('sculpt_flatten')}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition ${
                        activeTool === 'sculpt_flatten'
                          ? 'bg-orange-500/20 border-orange-400 text-orange-200 shadow-md font-bold'
                          : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-xl">📏</span>
                      <span className="text-xs mt-1">Plateau / Ebnen</span>
                      <span className="text-[10px] text-slate-400">Glatter Bauplatz</span>
                    </button>
                    <button
                      onClick={() => handleSelectTool('sculpt_smooth')}
                      className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition ${
                        activeTool === 'sculpt_smooth'
                          ? 'bg-purple-500/20 border-purple-400 text-purple-200 shadow-md font-bold'
                          : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-xl">🫧</span>
                      <span className="text-xs mt-1">Glätten</span>
                      <span className="text-[10px] text-slate-400">Rund & sanft</span>
                    </button>

                    {/* Straße mit Wänden / Begrenzung einzeichnen */}
                    <button
                      onClick={() => {
                        setActiveTab('roads');
                        handleSelectTool('plan_road');
                      }}
                      className="flex flex-col items-center justify-center p-2.5 rounded-2xl border transition col-span-2 sm:col-span-4 bg-orange-500/20 hover:bg-orange-500/30 border-orange-400 text-orange-200 shadow-md font-bold ring-2 ring-orange-500/30 cursor-pointer"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xl">🏎️</span>
                        <span className="text-xs font-bold text-orange-300">Straße & Rennkurs Planer (Linie ziehen & Material wählen)</span>
                      </div>
                      <span className="text-[10px] text-slate-300 mt-0.5 text-center">
                        Einfach Linie mit Finger/Maus ziehen, Rundkurs oder Sprint wählen (Asphalt, Pflasterstein etc. mit Wänden)
                      </span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 2: BIOME / PAINTING */}
              {activeTab === 'biome' && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 animate-fade-in">
                  <button
                    onClick={() => handleSelectTool('paint_grass')}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition ${
                      activeTool === 'paint_grass'
                        ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 shadow-md font-bold'
                        : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-xl">🌱</span>
                    <span className="text-xs mt-1">Smaragd-Gras</span>
                    <span className="text-[10px] text-slate-400">Saftige Wiesen</span>
                  </button>
                  <button
                    onClick={() => handleSelectTool('paint_snow')}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition ${
                      activeTool === 'paint_snow'
                        ? 'bg-slate-100/20 border-white text-white shadow-md font-bold'
                        : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-xl">❄️</span>
                    <span className="text-xs mt-1">Schnee & Eis</span>
                    <span className="text-[10px] text-slate-400">Glitzernde Kälte</span>
                  </button>
                  <button
                    onClick={() => handleSelectTool('paint_rock')}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition ${
                      activeTool === 'paint_rock'
                        ? 'bg-slate-500/20 border-slate-400 text-slate-200 shadow-md font-bold'
                        : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-xl">🪨</span>
                    <span className="text-xs mt-1">Schieferfels</span>
                    <span className="text-[10px] text-slate-400">Steile Bergwände</span>
                  </button>
                  <button
                    onClick={() => handleSelectTool('paint_sand')}
                    className={`flex flex-col items-center justify-center p-2.5 rounded-2xl border transition ${
                      activeTool === 'paint_sand'
                        ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-md font-bold'
                        : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-xl">🏖️</span>
                    <span className="text-xs mt-1">Strandsand & Erde</span>
                    <span className="text-[10px] text-slate-400">Ufer & Pfade</span>
                  </button>
                </div>
              )}

              {/* TAB: ROADS & RACE TRACK PLANNER */}
              {activeTab === 'roads' && (
                <div className="flex flex-col gap-3 animate-fade-in max-h-[60vh] overflow-y-auto pr-1">
                  {/* 1. Header & Live Status */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-900/90 border border-white/10 rounded-2xl p-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-black text-orange-400">🛣️ Rennstrecken & Straßen-Planer</span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-300 border border-orange-500/30">
                          {activeTool === 'plan_road' ? 'Linien-Zeichnen aktiv' : 'Bereit'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 mt-0.5">
                        👉 <b>Linie mit Finger oder Maus auf dem Gelände ziehen</b>. Belag & Wände wählen, dann auf &quot;Straße jetzt bauen&quot; tippen!
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleViewModeChange(editorViewMode === 'topdown' ? '3d' : 'topdown')}
                        className="px-3 py-1.5 rounded-xl bg-cyan-900/50 hover:bg-cyan-800/60 border border-cyan-400/40 text-cyan-200 text-xs font-bold transition flex items-center gap-1.5"
                        title="Draufsicht für einfaches Zeichnen von oben"
                      >
                        {editorViewMode === 'topdown' ? '📐 3D-Kamera' : '🗺️ 90° Draufsicht'}
                      </button>
                    </div>
                  </div>

                  {/* Live Path Stats Bar */}
                  <div className="flex items-center justify-between bg-slate-900/60 border border-white/5 rounded-xl px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">📍</span>
                      {roadPathInfo.pointCount === 0 ? (
                        <span className="text-slate-400">Noch keine Linie gezeichnet. Klicke/wische auf das Gelände!</span>
                      ) : (
                        <span className="text-slate-200 font-medium">
                          Gezeichnet: <b className="text-cyan-300 font-bold">{roadPathInfo.lengthMeters.toFixed(1)}m</b> (
                          <b className="text-amber-300">{roadPathInfo.pointCount}</b> Wegpunkte • ca.{' '}
                          <b className="text-emerald-300">{roadPathInfo.estimatedSegments}</b> Segmente)
                        </span>
                      )}
                    </div>

                    {roadPathInfo.pointCount > 0 && (
                      <button
                        onClick={handleClearRoadPath}
                        className="text-red-400 hover:text-red-300 text-xs font-bold transition cursor-pointer"
                      >
                        🧹 Linie verwerfen
                      </button>
                    )}
                  </div>

                  {/* 2. Streckentyp: Rundkurs vs Sprint */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">1. Streckentyp</span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleToggleRoadLoop(false)}
                        className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition ${
                          !roadIsLoop
                            ? 'bg-amber-500/20 border-amber-400 text-amber-200 shadow-md ring-1 ring-amber-400/30'
                            : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-base">🏁</span>
                        <span>Sprint-Strecke (A nach B)</span>
                      </button>

                      <button
                        onClick={() => handleToggleRoadLoop(true)}
                        className={`flex items-center justify-center gap-2 p-2.5 rounded-xl border text-xs font-bold transition ${
                          roadIsLoop
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200 shadow-md ring-1 ring-emerald-400/30'
                            : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-base">🔄</span>
                        <span>Rundkurs (Geschlossener Kreis)</span>
                      </button>
                    </div>
                  </div>

                  {/* 2. Straßenbreite & Fahrbahngröße */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        2. Fahrbahnbreite ({roadWidth.toFixed(1)} Meter)
                      </span>
                      <span className="text-[11px] font-black text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-md border border-amber-500/30">
                        {roadWidth <= 4.2 ? '🏎️ Schmal' : roadWidth <= 6.8 ? '🛣️ Standard' : roadWidth <= 9.8 ? '🏁 Rennstrecke (Breit)' : '⚡ Super-Breit'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { width: 3.8, label: 'Schmal', meters: '3.8m', desc: 'Waldweg / Pfad' },
                        { width: 5.5, label: 'Standard', meters: '5.5m', desc: 'Dorfstraße' },
                        { width: 8.5, label: 'Breit (Rennstrecke)', meters: '8.5m', desc: 'Perfekt für Rennen' },
                        { width: 12.0, label: 'Super-Breit', meters: '12.0m', desc: 'Autobahn / Mega-Kurs' },
                      ].map((w) => (
                        <button
                          key={w.width}
                          onClick={() => handleRoadWidthChange(w.width)}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition ${
                            Math.abs(roadWidth - w.width) < 0.2
                              ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-md font-bold ring-2 ring-amber-500/40'
                              : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="font-black text-sm text-amber-300">{w.meters}</span>
                          <span className="mt-0.5 font-bold text-xs">{w.label}</span>
                          <span className="text-[9px] text-slate-400 text-center">{w.desc}</span>
                        </button>
                      ))}
                    </div>

                    {/* Fine-tuning Slider */}
                    <div className="flex items-center gap-3 px-1 pt-1">
                      <span className="text-[10px] text-slate-400 font-mono">2.5m</span>
                      <input
                        type="range"
                        min="2.5"
                        max="16.0"
                        step="0.5"
                        value={roadWidth}
                        onChange={(e) => handleRoadWidthChange(parseFloat(e.target.value))}
                        className="flex-1 h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-400"
                      />
                      <span className="text-[10px] text-slate-400 font-mono">16.0m</span>
                    </div>
                  </div>

                  {/* 3. Straßenbelag / Material */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">3. Straßenbelag & Material</span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { id: 'asphalt', label: 'Asphalt', icon: '🏁', desc: 'Rennstrecke & Streifen' },
                        { id: 'cobblestone', label: 'Pflasterstein', icon: '🏛️', desc: 'Antikes Kopfstein' },
                        { id: 'wood', label: 'Holzdielen', icon: '🪵', desc: 'Bohlenweg & Brücke' },
                        { id: 'dirt', label: 'Schotterpiste', icon: '🏜️', desc: 'Offroad Sand & Kies' },
                        { id: 'sheikah_neon', label: 'Sheikah-Neon', icon: '⚡', desc: 'Sci-Fi Cyan Leuchtspur' },
                      ].map((m) => (
                        <button
                          key={m.id}
                          onClick={() => handleRoadMaterialChange(m.id as RoadMaterialType)}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition ${
                            roadMaterial === m.id
                              ? 'bg-orange-500/25 border-orange-400 text-orange-200 shadow-md font-bold ring-2 ring-orange-500/40'
                              : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="text-lg">{m.icon}</span>
                          <span className="mt-1 font-bold text-xs">{m.label}</span>
                          <span className="text-[9px] text-slate-400 text-center">{m.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 4. Begrenzungswände & Barrieren */}
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">4. Barrieren & Begrenzungsmauern</span>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {[
                        { id: 'racing_wall', label: 'Rennmauer', icon: '🏎️', desc: '1.25m Curbs & Bande' },
                        { id: 'stone_wall', label: 'Steinmauer', icon: '🧱', desc: '1.25m Naturstein' },
                        { id: 'wood_fence', label: 'Holzzaun', icon: '🪵', desc: '1.15m Koppelzaun' },
                        { id: 'curbs_only', label: 'Niedrige Curbs', icon: '⚠️', desc: '0.25m Überfahrbar' },
                        { id: 'none', label: 'Keine Wand', icon: '🚫', desc: 'Ebenerdige Straße' },
                      ].map((w) => (
                        <button
                          key={w.id}
                          onClick={() => handleRoadWallChange(w.id as RoadWallType)}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-xs transition ${
                            roadWall === w.id
                              ? 'bg-amber-500/25 border-amber-400 text-amber-200 shadow-md font-bold ring-2 ring-amber-500/40'
                              : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                          }`}
                        >
                          <span className="text-lg">{w.icon}</span>
                          <span className="mt-1 font-bold text-xs">{w.label}</span>
                          <span className="text-[9px] text-slate-400 text-center">{w.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 5. Start/Finish Gate Checkbox */}
                  <div className="flex items-center justify-between bg-slate-900/50 border border-white/5 rounded-xl px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-base">🏁</span>
                      <span className="text-slate-300 font-medium">Monumentalen Start-/Ziel-Torbogen mit Zeitmessung platzieren</span>
                    </div>
                    <input
                      type="checkbox"
                      checked={roadHasGate}
                      onChange={(e) => handleToggleGate(e.target.checked)}
                      className="w-4 h-4 rounded text-orange-500 focus:ring-orange-400 cursor-pointer"
                    />
                  </div>

                  {/* 6. Primary Action Buttons */}
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleBuildPlannedRoad}
                      disabled={roadPathInfo.pointCount < 2}
                      className={`flex-1 py-3 px-4 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition shadow-lg ${
                        roadPathInfo.pointCount >= 2
                          ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-slate-950 hover:brightness-110 active:scale-[0.98] animate-pulse ring-2 ring-orange-400/50 cursor-pointer'
                          : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-white/5'
                      }`}
                    >
                      <span className="text-lg">🛣️</span>
                      <span>
                        {roadPathInfo.pointCount >= 2
                          ? `Straße jetzt bauen! (${roadPathInfo.lengthMeters.toFixed(1)}m • ${roadPathInfo.estimatedSegments} Teile)`
                          : 'Erst Linie auf der Karte zeichnen (mind. 2 Punkte)'}
                      </span>
                    </button>

                    <button
                      onClick={handleUndoRoad}
                      className="py-3 px-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 border border-white/10 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
                      title="Letzte gebaute Straße rückgängig machen"
                    >
                      <RotateCcw className="h-4 w-4" />
                      <span className="hidden sm:inline">Rückgängig</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 3: OBJECTS / SPAWNING */}
              {activeTab === 'objects' && (
                <div className="flex flex-col gap-2.5 animate-fade-in max-h-52 overflow-y-auto pr-1">
                  {/* Sub-Category Pills */}
                  <div className="flex items-center gap-1.5 overflow-x-auto pb-1 border-b border-white/10">
                    <button
                      onClick={() => setObjectCategory('vehicles')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition ${
                        objectCategory === 'vehicles'
                          ? 'bg-rose-500/25 text-rose-300 border border-rose-500/40 shadow-sm'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      🏎️ Fahrzeuge
                    </button>
                    <button
                      onClick={() => setObjectCategory('roads')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition ${
                        objectCategory === 'roads'
                          ? 'bg-orange-500/25 text-orange-300 border border-orange-500/40 shadow-sm'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      🏁 Rennstrecke & Deko
                    </button>
                    <button
                      onClick={() => setObjectCategory('nature')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition ${
                        objectCategory === 'nature'
                          ? 'bg-emerald-500/25 text-emerald-300 border border-emerald-500/40 shadow-sm'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      🌳 Natur & Wälder
                    </button>
                    <button
                      onClick={() => setObjectCategory('creatures')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition ${
                        objectCategory === 'creatures'
                          ? 'bg-indigo-500/25 text-indigo-300 border border-indigo-500/40 shadow-sm'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      🦌 Tiere & Wesen
                    </button>
                    <button
                      onClick={() => setObjectCategory('buildings')}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold whitespace-nowrap transition ${
                        objectCategory === 'buildings'
                          ? 'bg-amber-500/25 text-amber-300 border border-amber-500/40 shadow-sm'
                          : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      🏰 Bauten & Requisiten
                    </button>
                  </div>

                  {/* Filtered Objects Grid */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                    {(objectCategory === 'vehicles'
                      ? [
                          { type: 'vehicle_kart_classic', name: 'Standard-Kart (Rot)', icon: '🏎️' },
                          { type: 'vehicle_kart_sport', name: 'Turbo GT Racer (Cyan)', icon: '⚡' },
                          { type: 'vehicle_buggy_offroad', name: 'Offroad-Buggy', icon: '🚜' },
                          { type: 'vehicle_hover_cycle', name: 'Sheikah-Bike', icon: '🏍️' },
                        ]
                      : objectCategory === 'roads'
                      ? [
                          { type: 'vehicle_kart_classic', name: 'Standard-Kart', icon: '🏎️' },
                          { type: 'track_start_gate', name: 'Start-Tor', icon: '🏁' },
                          { type: 'track_finish_gate', name: 'Ziel-Tor', icon: '🏆' },
                          { type: 'track_pylon', name: 'Pylone', icon: '🔶' },
                          { type: 'track_tires', name: 'Reifenstapel', icon: '🛞' },
                          { type: 'track_boost_pad', name: 'Turbo-Boost-Pad', icon: '⚡' },
                          { type: 'track_barrier', name: 'Beton-Barriere', icon: '🚧' },
                          { type: 'track_coin', name: 'Rupee-Münze', icon: '💎' },
                          { type: 'walled_road', name: 'Straßen-Block', icon: '🛣️' },
                          { type: 'catan_road', name: 'Catan-Weg', icon: '🛤️' },
                        ]
                      : objectCategory === 'nature'
                      ? [
                          { type: 'tree_oak', name: 'Eichenbaum', icon: '🌳' },
                          { type: 'tree_pine', name: 'Kiefer', icon: '🌲' },
                          { type: 'tree_sakura', name: 'Kirschblüte', icon: '🌸' },
                          { type: 'tree_birch', name: 'Silberbirke', icon: '🪵' },
                          { type: 'tree_apple', name: 'Apfelbaum', icon: '🍎' },
                          { type: 'flower_silent_princess', name: 'Prinzessin-Lilie', icon: '🪻' },
                          { type: 'shroom_cluster', name: 'Pilzgruppe', icon: '🍄' },
                          { type: 'berry_bush', name: 'Beerenbusch', icon: '🫐' },
                          { type: 'rock_boulder', name: 'Felsbrocken', icon: '🪨' },
                          { type: 'ore_iron', name: 'Eisenerz', icon: '⛏️' },
                          { type: 'ore_gold', name: 'Golderz', icon: '✨' },
                          { type: 'ore_crystal', name: 'Kristall-Geode', icon: '💎' },
                        ]
                      : objectCategory === 'creatures'
                      ? [
                          { type: 'mount_horse', name: 'Hylia-Schimmel (Pferd)', icon: '🐎' },
                          { type: 'mount_epona', name: 'Epona Hengst', icon: '🐴' },
                          { type: 'mount_glider', name: 'Zonai-Gleiter', icon: '🛸' },
                          { type: 'wildlife_stag', name: 'Wald-Hirsch', icon: '🦌' },
                          { type: 'wildlife_blupee', name: 'Rubin-Hase', icon: '🐰' },
                          { type: 'wildlife_birds', name: 'Himmelsvögel', icon: '🕊️' },
                          { type: 'enemy_goomba', name: 'Mario Gumba', icon: '🍄' },
                          { type: 'enemy_boblin', name: 'Boblin', icon: '👹' },
                          { type: 'enemy_slime', name: 'Schleim', icon: '🟢' },
                          { type: 'enemy_talus', name: 'Felsen-Golem Boss', icon: '🗿' },
                        ]
                      : [
                          { type: 'catan_settlement', name: 'Catan-Siedlung', icon: '🛖' },
                          { type: 'catan_city', name: 'Catan-Festung', icon: '🏰' },
                          { type: 'catan_knight_tower', name: 'Ritterturm', icon: '🛡️' },
                          { type: 'windmill', name: 'Windmühle', icon: '🌾' },
                          { type: 'watchtower', name: 'Wachturm', icon: '🗼' },
                          { type: 'stone_well', name: 'Dorfbrunnen', icon: '💧' },
                          { type: 'lantern_post', name: 'Laterne', icon: '🏮' },
                          { type: 'camp_tent', name: 'Lagerzelt', icon: '⛺' },
                          { type: 'barrel_stack', name: 'Holzfässer', icon: '🛢️' },
                          { type: 'crate_wooden', name: 'Holzkiste', icon: '📦' },
                          { type: 'target_dummy', name: 'Übungspuppe', icon: '🎯' },
                          { type: 'campfire', name: 'Lagerfeuer', icon: '🔥' },
                          { type: 'torch', name: 'Fackel', icon: '🔦' },
                          { type: 'shrine', name: 'Schrein', icon: '⛩️' },
                          { type: 'chest', name: 'Schatztruhe', icon: '📦' },
                        ]
                    ).map((item) => (
                      <button
                        key={item.type}
                        onClick={() => handleSelectObject(item.type)}
                        className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition ${
                          selectedObject === item.type && activeTool === 'place'
                            ? 'bg-blue-600/30 border-blue-400 text-white font-bold shadow-md'
                            : 'bg-slate-900 border-white/10 text-slate-300 hover:bg-slate-800'
                        }`}
                      >
                        <span className="text-lg">{item.icon}</span>
                        <span className="text-[10px] mt-0.5 line-clamp-1">{item.name}</span>
                      </button>
                    ))}

                    {/* ERASER BUTTON */}
                    <button
                      onClick={() => handleSelectTool('erase')}
                      className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition ${
                        activeTool === 'erase'
                          ? 'bg-red-600/30 border-red-400 text-red-200 font-bold shadow-md'
                          : 'bg-red-950/40 border-red-500/30 text-red-300 hover:bg-red-900/50'
                      }`}
                    >
                      <Trash2 className="h-5 w-5 text-red-400" />
                      <span className="text-[10px] mt-0.5 font-bold">Löschen</span>
                    </button>
                  </div>
                </div>
              )}

              {/* TAB 4: WORLDS & TEMPLATES */}
              {activeTab === 'worlds' && (
                <div className="flex flex-col gap-3 animate-fade-in">
                  <div>
                    <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Landschafts-Vorlagen generieren
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <button
                        onClick={() => handleGenerateTemplate('circuit_flat')}
                        className="flex items-center gap-1.5 rounded-xl bg-orange-950/40 border border-orange-500/40 px-2.5 py-2 text-xs font-bold text-orange-200 hover:bg-orange-900/50 transition shadow-sm"
                        title="Völlig flache Ebene (y = 4.0m) zum Bauen von Rennstrecken & Straßen"
                      >
                        🏎️ Renn-Ebene
                      </button>
                      <button
                        onClick={() => handleGenerateTemplate('flat')}
                        className="flex items-center gap-1.5 rounded-xl bg-slate-900 border border-white/10 px-2.5 py-2 text-xs font-semibold text-emerald-300 hover:bg-slate-800 transition"
                      >
                        🌾 Flachland
                      </button>
                      <button
                        onClick={() => handleGenerateTemplate('islands')}
                        className="flex items-center gap-1.5 rounded-xl bg-slate-900 border border-white/10 px-2.5 py-2 text-xs font-semibold text-cyan-300 hover:bg-slate-800 transition"
                      >
                        🏝️ Inseln
                      </button>
                      <button
                        onClick={() => handleGenerateTemplate('mountains')}
                        className="flex items-center gap-1.5 rounded-xl bg-slate-900 border border-white/10 px-2.5 py-2 text-xs font-semibold text-amber-300 hover:bg-slate-800 transition"
                      >
                        🏔️ Berge
                      </button>
                      <button
                        onClick={() => handleGenerateTemplate('procedural')}
                        className="flex items-center gap-1.5 rounded-xl bg-slate-900 border border-white/10 px-2.5 py-2 text-xs font-semibold text-purple-300 hover:bg-slate-800 transition"
                      >
                        🎲 Zufall
                      </button>
                    </div>
                  </div>

                  {/* Save and Load World */}
                  <div className="border-t border-white/10 pt-2 flex flex-col sm:flex-row items-center gap-2">
                    <input
                      type="text"
                      value={worldNameInput}
                      onChange={(e) => setWorldNameInput(e.target.value)}
                      placeholder="Weltname..."
                      className="w-full sm:w-auto flex-1 rounded-xl bg-slate-900 border border-white/20 px-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
                    />
                    <button
                      onClick={handleSaveWorld}
                      className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-1.5 text-xs font-bold text-white shadow-md active:scale-95 transition"
                    >
                      <Save className="h-3.5 w-3.5" /> Speichern
                    </button>
                  </div>

                  {/* Saved Worlds List */}
                  {savedWorlds.length > 0 && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] text-slate-400">Gespeicherte Welten:</span>
                      {savedWorlds.map((name) => (
                        <button
                          key={name}
                          onClick={() => handleLoadWorld(name)}
                          className="rounded-lg bg-slate-800 px-2.5 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-slate-700 active:scale-95 border border-cyan-500/20 transition"
                        >
                          📂 {name}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Complete World Reset to Default (Standartmodus) */}
                  <div className="border-t border-red-500/30 pt-2.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 bg-red-950/20 p-2.5 rounded-xl border border-red-500/20">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-red-200">🔄 Welt komplett auf Standard-Zustand zurücksetzen</span>
                      <span className="text-[10px] text-slate-400">Löscht alle Straßen, Rennstrecken, Gebäude, Objekte und Gelände-Verformungen</span>
                    </div>
                    <button
                      onClick={() => {
                        if (window.confirm('Möchtest du wirklich die gesamte Welt auf den Standard-Zustand zurücksetzen? Alle Straßen, Bauten und Gelände-Änderungen werden unwiderruflich gelöscht.')) {
                          engine.resetWorldToDefault();
                          onToast('✨ Welt komplett auf Standard-Zustand zurückgesetzt!');
                        }
                      }}
                      className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-red-700 to-rose-600 hover:from-red-600 hover:to-rose-500 px-3.5 py-1.5 text-xs font-bold text-white shadow-md active:scale-95 transition border border-red-400/40"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Standard-Welt laden
                    </button>
                  </div>
                </div>
              )}

              {/* Pinsel Einstellungen (Radius & Stärke Slider) */}
              <div className="mt-3 pt-2.5 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-300">
                <div className="flex items-center gap-3 w-full sm:w-1/2">
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">Pinselgröße: {brushRadius}m</span>
                  <input
                    type="range"
                    min="4"
                    max="50"
                    value={brushRadius}
                    onChange={(e) => handleRadiusChange(Number(e.target.value))}
                    className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>

                <div className="flex items-center gap-3 w-full sm:w-1/2">
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">Intensität: {Math.round(brushStrength * 100)}%</span>
                  <input
                    type="range"
                    min="0.1"
                    max="2.0"
                    step="0.05"
                    value={brushStrength}
                    onChange={(e) => handleStrengthChange(Number(e.target.value))}
                    className="w-full accent-cyan-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                  />
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
