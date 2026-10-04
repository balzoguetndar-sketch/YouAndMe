'use client';

import { useRef, useEffect, useState } from 'react';
import { createClient } from '@/src/lib/supabase/clients';

type WhiteboardProps = {
  roomId: string;
};

export function Whiteboard({ roomId }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [color, setColor] = useState('#6366f1');
  const supabase = createClient();

  const drawSegment = (
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    segmentColor: string
  ) => {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = segmentColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.stroke();
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Écoute des tracés de l'interlocuteur
    const channel = supabase.channel(`whiteboard:${roomId}`);

    channel
      .on('broadcast', { event: 'draw' }, ({ payload }) => {
        const { x0, y0, x1, y1, drawColor } = payload;
        drawSegment(ctx, x0, y0, x1, y1, drawColor);
      })
      .on('broadcast', { event: 'clear' }, () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, supabase, drawSegment]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.dataset.lastX = (e.clientX - rect.left).toString();
    canvas.dataset.lastY = (e.clientY - rect.top).toString();
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const x0 = parseFloat(canvas.dataset.lastX || '0');
    const y0 = parseFloat(canvas.dataset.lastY || '0');
    const x1 = e.clientX - rect.left;
    const y1 = e.clientY - rect.top;

    drawSegment(ctx, x0, y0, x1, y1, color);

    // Envoi du tracé à l'interlocuteur via Supabase Broadcast
    const channel = supabase.channel(`whiteboard:${roomId}`);
    void channel.send({
      type: 'broadcast',
      event: 'draw',
      payload: { x0, y0, x1, y1, drawColor: color },
    });

    canvas.dataset.lastX = x1.toString();
    canvas.dataset.lastY = y1.toString();
  };

  const handleMouseUp = () => setIsDrawing(false);

  const clearBoard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const channel = supabase.channel(`whiteboard:${roomId}`);
    channel.send({
      type: 'broadcast',
      event: 'clear',
    });
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-4 shadow-xl">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">Tableau partagé</h3>
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded border-none cursor-pointer bg-transparent"
            title="Choisir la couleur"
          />
          <button
            onClick={clearBoard}
            className="px-3 py-1.5 text-xs font-medium text-red-400 border border-red-800/60 bg-red-950/40 hover:bg-red-900/60 rounded-lg transition-colors"
          >
            Effacer
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={600}
        height={350}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className="w-full bg-slate-950 rounded-xl border border-slate-800 cursor-crosshair touch-none"
      />
    </div>
  );
}