import React, { useRef, useEffect } from 'react';
import { ShrineData, Vector3D } from '../types';

interface MinimapProps {
  playerPos: Vector3D;
  playerRotation: number;
  shrines: ShrineData[];
  enemies: { position: Vector3D; state: string }[];
  chests: { position: Vector3D; opened?: boolean }[];
  onOpenFullMap: () => void;
}

export const Minimap: React.FC<MinimapProps> = ({
  playerPos,
  playerRotation,
  shrines,
  enemies,
  chests,
  onOpenFullMap,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const scale = 0.45; // meters to canvas pixels ratio

    // Clear background
    ctx.clearRect(0, 0, w, h);

    // Circular Clip Mask
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.clip();

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, h);

    // Draw Shrines
    shrines.forEach((shrine) => {
      const dx = (shrine.position.x - playerPos.x) * scale;
      const dz = (shrine.position.z - playerPos.z) * scale;

      ctx.fillStyle = shrine.activated ? '#00f0ff' : '#64748b';
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dz, 5, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Chests
    chests.forEach((chest) => {
      if (chest.opened) return;
      const dx = (chest.position.x - playerPos.x) * scale;
      const dz = (chest.position.z - playerPos.z) * scale;

      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(cx + dx - 3, cy + dz - 3, 6, 6);
    });

    // Draw Enemy Red Dots
    enemies.forEach((enemy) => {
      if (enemy.state === 'DEAD') return;
      const dx = (enemy.position.x - playerPos.x) * scale;
      const dz = (enemy.position.z - playerPos.z) * scale;

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(cx + dx, cy + dz, 4, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw Center Player Arrow
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(playerRotation);

    ctx.fillStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(6, 6);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    ctx.restore();

    // Draw Outer Rim & Compass Labels
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('N', cx, 14);
    ctx.fillText('S', cx, h - 6);
    ctx.fillText('E', w - 8, cy + 3);
    ctx.fillText('W', 8, cy + 3);
  }, [playerPos, playerRotation, shrines, enemies, chests]);

  return (
    <div
      onClick={onOpenFullMap}
      className="pointer-events-auto absolute top-14 right-4 z-20 h-24 w-24 cursor-pointer rounded-full bg-slate-950/85 p-1 shadow-2xl backdrop-blur-md transition hover:scale-105 active:scale-95 border border-white/20"
      title="Karte antippen für Vollbild-Weltkarte mit Schnellreise"
    >
      <canvas ref={canvasRef} width={88} height={88} className="h-full w-full rounded-full" />
    </div>
  );
};
