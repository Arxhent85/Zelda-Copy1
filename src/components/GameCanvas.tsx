import React, { useRef, useEffect } from 'react';
import { GameEngine } from '../game/GameEngine';
import { audioEngine } from '../game/AudioEngine';
import { GameSettings } from '../types';

interface GameCanvasProps {
  settings: GameSettings;
  onEngineReady: (engine: GameEngine) => void;
  moveInput: { x: number; z: number };
}

export const GameCanvas: React.FC<GameCanvasProps> = ({ settings, onEngineReady, moveInput }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  // Keyboard & Touch input refs
  const keys = useRef<{ [key: string]: boolean }>({});
  const moveInputRef = useRef(moveInput);

  useEffect(() => {
    moveInputRef.current = moveInput;
  }, [moveInput]);

  useEffect(() => {
    if (!canvasRef.current) return;

    // Initialize Game Engine
    const engine = new GameEngine(canvasRef.current, settings);
    engineRef.current = engine;
    onEngineReady(engine);

    // Audio context resume on click
    const handleFirstInteraction = () => {
      audioEngine.init();
      audioEngine.resume();
      window.removeEventListener('click', handleFirstInteraction);
      window.removeEventListener('keydown', handleFirstInteraction);
      window.removeEventListener('touchstart', handleFirstInteraction);
    };

    window.addEventListener('click', handleFirstInteraction);
    window.addEventListener('keydown', handleFirstInteraction);
    window.addEventListener('touchstart', handleFirstInteraction);

    // Canvas Resize Observer
    const handleResize = () => {
      if (canvasRef.current && engineRef.current) {
        engineRef.current.resize(canvasRef.current.clientWidth, canvasRef.current.clientHeight);
      }
    };

    window.addEventListener('resize', handleResize);
    engine.start();

    // Keyboard Listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      keys.current[e.code] = true;

      // Single triggers
      if (e.code === 'KeyE') {
        const msg = engine.interactWithNearbyObject();
        if (msg && engine.onToastMessage) engine.onToastMessage(msg);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keys.current[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Provide frame-aligned input polling function to engine
    engine.inputPollFn = () => {
      let kx = 0;
      let kz = 0;
      if (keys.current['KeyW'] || keys.current['ArrowUp']) kz += 1;
      if (keys.current['KeyS'] || keys.current['ArrowDown']) kz -= 1;
      if (keys.current['KeyA'] || keys.current['ArrowLeft']) kx -= 1;
      if (keys.current['KeyD'] || keys.current['ArrowRight']) kx += 1;

      const touchX = moveInputRef.current.x;
      const touchZ = moveInputRef.current.z;

      const finalX = Math.abs(touchX) > 0.05 ? touchX : kx;
      const finalZ = Math.abs(touchZ) > 0.05 ? touchZ : kz;

      const isSprint = !!keys.current['ShiftLeft'] || !!keys.current['ShiftRight'];
      const isJump = !!keys.current['Space'];
      const isAttack = !!keys.current['KeyF'] || !!keys.current['ControlLeft'];
      const isDodge = !!keys.current['KeyC'];

      return {
        moveX: finalX,
        moveZ: finalZ,
        isSprint,
        isJump,
        isAttack,
        isDodge,
      };
    };

    // Desktop Mouse & Pointer Controls (Pointer Lock, Drag Orbit, Wheel Zoom, Editor Raycasting)
    let isMouseDown = false;
    let mouseDownButton = 0;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      isMouseDown = true;
      mouseDownButton = e.button;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;

      const engine = engineRef.current;
      if (!engine) return;

      if (engine.editorManager.isEditorActive) {
        // Level Editor Click
        if (e.button === 0 && !e.shiftKey) {
          const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
          const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
          const hit = engine.editorManager.raycastTerrain(ndcX, ndcY, engine.camera);
          if (hit) {
            engine.editorManager.hoverTerrainPos = hit;
            if (engine.editorManager.activeTool === 'place') {
              const msg = engine.editorManager.placeSelectedObject(hit.x, hit.z);
              if (engine.onToastMessage) engine.onToastMessage(msg);
            } else if (engine.editorManager.activeTool === 'erase') {
              const msg = engine.editorManager.eraseInRadius(hit.x, hit.z);
              if (engine.onToastMessage) engine.onToastMessage(msg);
            } else if (engine.editorManager.activeTool === 'plan_road') {
              engine.editorManager.startRoadPath(hit.x, hit.z);
              engine.editorManager.isApplyingTool = true;
            } else {
              engine.editorManager.isApplyingTool = true;
            }
          }
        }
      } else {
        // Play Mode: Pointer Lock or Attack
        if (e.button === 0) {
          // If not yet pointer locked, request pointer lock on first click
          if (document.pointerLockElement !== canvasRef.current && (e.target as HTMLElement).tagName === 'CANVAS') {
            canvasRef.current?.requestPointerLock?.();
          }
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      const engine = engineRef.current;
      if (!engine) return;

      // 1. Level Editor Mode
      if (engine.editorManager.isEditorActive) {
        const ndcX = (e.clientX / window.innerWidth) * 2 - 1;
        const ndcY = -(e.clientY / window.innerHeight) * 2 + 1;
        const hit = engine.editorManager.raycastTerrain(ndcX, ndcY, engine.camera);
        if (hit) {
          engine.editorManager.updateBrushMarker(hit);
        }

        // Camera Pan (Middle click or Shift + Left click)
        if (isMouseDown && (mouseDownButton === 1 || (mouseDownButton === 0 && e.shiftKey))) {
          const dx = e.clientX - lastMouseX;
          const dy = e.clientY - lastMouseY;
          engine.cameraControls.panEditor(-dy * 0.4, dx * 0.4);
        }
        // Camera Orbit (Right click drag)
        else if (isMouseDown && mouseDownButton === 2) {
          const dx = e.clientX - lastMouseX;
          const dy = e.clientY - lastMouseY;
          engine.cameraControls.handleMouseMove(dx, dy, 0.005);
        }

        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
        return;
      }

      // 2. Play Mode: Pointer Lock
      if (document.pointerLockElement === canvasRef.current) {
        const dx = e.movementX || 0;
        const dy = e.movementY || 0;
        engine.cameraControls.handleMouseMove(dx, dy);
        return;
      }

      // 3. Play Mode: Drag Orbit Fallback
      if (isMouseDown && (mouseDownButton === 0 || mouseDownButton === 2)) {
        const dx = e.clientX - lastMouseX;
        const dy = e.clientY - lastMouseY;
        engine.cameraControls.handleMouseMove(dx, dy);
      }
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };

    const handleMouseUp = () => {
      isMouseDown = false;
      const engine = engineRef.current;
      if (engine && engine.editorManager.isEditorActive) {
        engine.editorManager.isApplyingTool = false;
        engine.editorManager.endRoadStroke();
        if (engine.editorManager.activeTool === 'plan_road') {
          engine.editorManager.endRoadPathStroke();
        }
      }
    };

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const engine = engineRef.current;
      if (engine) {
        engine.cameraControls.zoom(e.deltaY * 0.03);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      // Prevent browser right click menu to allow smooth camera rotation
      e.preventDefault();
    };

    // Mobile / Tablet Touch Gestures for Level Editor & Canvas
    let lastTouchX = 0;
    let lastTouchY = 0;
    let initialPinchDist = 0;

    const handleTouchStart = (e: TouchEvent) => {
      const engine = engineRef.current;
      if (!engine || !engine.editorManager.isEditorActive) return;

      if (e.touches.length === 1) {
        const touch = e.touches[0];
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;

        if (engine.editorManager.touchMode === 'paint') {
          const ndcX = (touch.clientX / window.innerWidth) * 2 - 1;
          const ndcY = -(touch.clientY / window.innerHeight) * 2 + 1;
          const hit = engine.editorManager.raycastTerrain(ndcX, ndcY, engine.camera);
          if (hit) {
            engine.editorManager.hoverTerrainPos = hit;
            engine.editorManager.updateBrushMarker(hit);
            if (engine.editorManager.activeTool === 'place') {
              const msg = engine.editorManager.placeSelectedObject(hit.x, hit.z);
              if (engine.onToastMessage) engine.onToastMessage(msg);
            } else if (engine.editorManager.activeTool === 'erase') {
              const msg = engine.editorManager.eraseInRadius(hit.x, hit.z);
              if (engine.onToastMessage) engine.onToastMessage(msg);
            } else if (engine.editorManager.activeTool === 'plan_road') {
              engine.editorManager.startRoadPath(hit.x, hit.z);
              engine.editorManager.isApplyingTool = true;
            } else {
              engine.editorManager.isApplyingTool = true;
            }
          }
        }
      } else if (e.touches.length === 2) {
        // Pinch & Two-finger Pan
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        initialPinchDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        lastTouchX = (t1.clientX + t2.clientX) * 0.5;
        lastTouchY = (t1.clientY + t2.clientY) * 0.5;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const engine = engineRef.current;
      if (!engine || !engine.editorManager.isEditorActive) return;

      if (e.touches.length === 1) {
        const touch = e.touches[0];
        if (engine.editorManager.touchMode === 'paint') {
          const ndcX = (touch.clientX / window.innerWidth) * 2 - 1;
          const ndcY = -(touch.clientY / window.innerHeight) * 2 + 1;
          const hit = engine.editorManager.raycastTerrain(ndcX, ndcY, engine.camera);
          if (hit) {
            engine.editorManager.hoverTerrainPos = hit;
            engine.editorManager.updateBrushMarker(hit);
          }
        } else {
          // Camera Look Mode
          const dx = touch.clientX - lastTouchX;
          const dy = touch.clientY - lastTouchY;
          engine.cameraControls.handleMouseMove(dx, dy, 0.005);
        }
        lastTouchX = touch.clientX;
        lastTouchY = touch.clientY;
      } else if (e.touches.length === 2) {
        // Pinch Zoom & Pan
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const currentDist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        const distDiff = initialPinchDist - currentDist;
        if (Math.abs(distDiff) > 2) {
          engine.cameraControls.zoom(distDiff * 0.05);
          initialPinchDist = currentDist;
        }

        const midX = (t1.clientX + t2.clientX) * 0.5;
        const midY = (t1.clientY + t2.clientY) * 0.5;
        const dx = midX - lastTouchX;
        const dy = midY - lastTouchY;
        engine.cameraControls.panEditor(-dy * 0.4, dx * 0.4);
        lastTouchX = midX;
        lastTouchY = midY;
      }
    };

    const handleTouchEnd = () => {
      const engine = engineRef.current;
      if (engine && engine.editorManager.isEditorActive) {
        engine.editorManager.isApplyingTool = false;
        engine.editorManager.endRoadStroke();
        if (engine.editorManager.activeTool === 'plan_road') {
          engine.editorManager.endRoadPathStroke();
        }
      }
    };

    const canvasEl = canvasRef.current;

    // WebGL Context Loss Handler to prevent mobile browser tab crashes
    const handleContextLost = (e: Event) => {
      e.preventDefault();
      if (engineRef.current) engineRef.current.stop();
    };

    const handleContextRestored = () => {
      if (engineRef.current) engineRef.current.start();
    };

    canvasEl.addEventListener('webglcontextlost', handleContextLost);
    canvasEl.addEventListener('webglcontextrestored', handleContextRestored);
    canvasEl.addEventListener('mousedown', handleMouseDown);
    canvasEl.addEventListener('wheel', handleWheel, { passive: false });
    canvasEl.addEventListener('contextmenu', handleContextMenu);
    canvasEl.addEventListener('touchstart', handleTouchStart, { passive: true });
    canvasEl.addEventListener('touchmove', handleTouchMove, { passive: true });
    canvasEl.addEventListener('touchend', handleTouchEnd, { passive: true });
    canvasEl.addEventListener('touchcancel', handleTouchEnd, { passive: true });
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      engine.stop();
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      canvasEl.removeEventListener('webglcontextlost', handleContextLost);
      canvasEl.removeEventListener('webglcontextrestored', handleContextRestored);
      canvasEl.removeEventListener('mousedown', handleMouseDown);
      canvasEl.removeEventListener('wheel', handleWheel);
      canvasEl.removeEventListener('contextmenu', handleContextMenu);
      canvasEl.removeEventListener('touchstart', handleTouchStart);
      canvasEl.removeEventListener('touchmove', handleTouchMove);
      canvasEl.removeEventListener('touchend', handleTouchEnd);
      canvasEl.removeEventListener('touchcancel', handleTouchEnd);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Update Settings on engine
  useEffect(() => {
    if (engineRef.current) {
      engineRef.current.settings = settings;
      audioEngine.setVolumes(1.0, settings.musicVolume, settings.soundVolume);
    }
  }, [settings]);

  return <canvas ref={canvasRef} className="h-full w-full touch-none block" />;
};
