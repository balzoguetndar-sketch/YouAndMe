'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import type { RealtimeChannel } from '@supabase/supabase-js';

type WhiteboardProps = {
  roomId: string;
  isInitiator: boolean;
};

export function Whiteboard({ roomId, isInitiator }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isChannelReady, setIsChannelReady] = useState(false);
  const [color, setColor] = useState('#6366f1');
  const [callerText, setCallerText] = useState('');
  const [calleeText, setCalleeText] = useState('');
  const supabase = createClient();

  const drawSegment = useCallback(
    (
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
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Écoute des tracés de l'interlocuteur
    const channel = supabase.channel(`whiteboard:${roomId}`);
    let isActive = true;
    channelRef.current = channel;

    channel
      .on('broadcast', { event: 'draw' }, ({ payload }) => {
        const { x0, y0, x1, y1, drawColor } = payload;
        drawSegment(ctx, x0, y0, x1, y1, drawColor);
      })
      .on('broadcast', { event: 'text-area-update' }, ({ payload }) => {
        if (payload.side === 'caller' && typeof payload.value === 'string') {
          setCallerText(payload.value.slice(0, 3000));
        }
        if (payload.side === 'callee' && typeof payload.value === 'string') {
          setCalleeText(payload.value.slice(0, 3000));
        }
      })
      .on('broadcast', { event: 'clear' }, () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      })
      .subscribe((status) => {
        if (isActive) setIsChannelReady(status === 'SUBSCRIBED');
      });

    return () => {
      isActive = false;
      channelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [roomId, supabase, drawSegment]);

  const getCanvasPosition = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const updateSharedText = (side: 'caller' | 'callee', value: string) => {
    const cleanText = value.slice(0, 3000);
    if (side === 'caller') setCallerText(cleanText);
    else setCalleeText(cleanText);
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'text-area-update',
      payload: { side, value: cleanText },
    });
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isChannelReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const position = getCanvasPosition(canvas, e.clientX, e.clientY);
    setIsDrawing(true);
    canvas.setPointerCapture(e.pointerId);
    canvas.dataset.lastX = position.x.toString();
    canvas.dataset.lastY = position.y.toString();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isChannelReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const position = getCanvasPosition(canvas, e.clientX, e.clientY);
    const x0 = parseFloat(canvas.dataset.lastX || '0');
    const y0 = parseFloat(canvas.dataset.lastY || '0');
    const x1 = position.x;
    const y1 = position.y;

    drawSegment(ctx, x0, y0, x1, y1, color);

    // Envoi du tracé à l'interlocuteur via Supabase Broadcast
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'draw',
      payload: { x0, y0, x1, y1, drawColor: color },
    });

    canvas.dataset.lastX = x1.toString();
    canvas.dataset.lastY = y1.toString();
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    setIsDrawing(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const clearBoard = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    void channelRef.current?.send({
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
            disabled={!isChannelReady}
            className="px-3 py-1.5 text-xs font-medium text-red-400 border border-red-800/60 bg-red-950/40 hover:bg-red-900/60 rounded-lg transition-colors"
          >
            Effacer
          </button>
        </div>
      </div>

      {!isChannelReady && (
        <p className="text-xs text-slate-400" role="status">
          Connexion au tableau partagé...
        </p>
      )}

      <div className="relative w-full">
        <canvas
          ref={canvasRef}
          width={600}
          height={350}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`block w-full bg-slate-950 rounded-xl border border-slate-800 touch-none ${!isChannelReady ? 'cursor-wait opacity-60' : 'cursor-crosshair'}`}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <label className="min-w-0 space-y-1.5">
          <span className="block text-sm font-semibold text-slate-200">
            Appelé {isInitiator ? '(correspondant)' : '(vous)'}
          </span>
          <textarea
            value={calleeText}
            onChange={(event) => updateSharedText('callee', event.target.value)}
            readOnly={isInitiator || !isChannelReady}
            maxLength={3000}
            rows={5}
            placeholder={isInitiator ? 'Le texte de votre correspondant apparaîtra ici.' : 'Écrivez ici…'}
            aria-label="Zone de texte de l’appelé"
            className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-3 text-base leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none read-only:cursor-default read-only:bg-slate-950/70 sm:text-lg"
          />
        </label>
        <label className="min-w-0 space-y-1.5 md:border-l md:border-slate-700 md:pl-3">
          <span className="block text-sm font-semibold text-slate-200">
            Appelant {isInitiator ? '(vous)' : '(correspondant)'}
          </span>
          <textarea
            value={callerText}
            onChange={(event) => updateSharedText('caller', event.target.value)}
            readOnly={!isInitiator || !isChannelReady}
            maxLength={3000}
            rows={5}
            placeholder={isInitiator ? 'Écrivez ici…' : 'Le texte de votre correspondant apparaîtra ici.'}
            aria-label="Zone de texte de l’appelant"
            className="w-full resize-y rounded-xl border border-slate-700 bg-slate-950 p-3 text-base leading-relaxed text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none read-only:cursor-default read-only:bg-slate-950/70 sm:text-lg"
          />
        </label>
      </div>
    </div>
  );
}