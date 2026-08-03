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

    // Pointer Lock Mouse Drag for Desktop Camera Orbit
    let isMouseDown = false;
    let lastMouseX = 0;
    let lastMouseY = 0;

    const handleMouseDown = (e: MouseEvent) => {
      if (e.button === 0) {
        isMouseDown = true;
        lastMouseX = e.clientX;
        lastMouseY = e.clientY;
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseDown || !engineRef.current) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      engineRef.current.cameraControls.handleMouseMove(dx, dy);
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    };

    const handleMouseUp = () => {
      isMouseDown = false;
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
