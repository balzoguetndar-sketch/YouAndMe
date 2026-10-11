'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { createClient } from '@/src/lib/supabase/clients';
import type { RealtimeChannel } from '@supabase/supabase-js';

type WhiteboardProps = {
  roomId: string;
};

export function Whiteboard({ roomId }: WhiteboardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isChannelReady, setIsChannelReady] = useState(false);
  const [color, setColor] = useState('#6366f1');
  const [tool, setTool] = useState<'draw' | 'text'>('draw');
  const [textDraft, setTextDraft] = useState('');
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null);
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

  const drawText = useCallback(
    (ctx: CanvasRenderingContext2D, value: string, x: number, y: number, textColor: string) => {
      ctx.font = '20px sans-serif';
      ctx.textBaseline = 'top';
      ctx.fillStyle = textColor;
      const maxWidth = Math.max(1, 600 - x - 8);
      const lines: string[] = [];

      value.split('\n').forEach((paragraph) => {
        let line = '';
        paragraph.split(/\s+/).forEach((word) => {
          const nextLine = line ? `${line} ${word}` : word;
          if (line && ctx.measureText(nextLine).width > maxWidth) {
            lines.push(line);
            line = word;
          } else {
            line = nextLine;
          }
        });
        lines.push(line);
      });

      lines.forEach((line, index) => {
        ctx.fillText(line, x, y + index * 24, maxWidth);
      });
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
      .on('broadcast', { event: 'text' }, ({ payload }) => {
        const { value, x, y, textColor } = payload;
        drawText(ctx, value, x, y, textColor);
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
  }, [roomId, supabase, drawSegment, drawText]);

  const getCanvasPosition = (canvas: HTMLCanvasElement, clientX: number, clientY: number) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    };
  };

  const publishText = (value = textDraft, position = textPosition) => {
    const cleanText = value.trim();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!cleanText || !position || !canvas || !ctx) return;

    drawText(ctx, cleanText, position.x, position.y, color);
    void channelRef.current?.send({
      type: 'broadcast',
      event: 'text',
      payload: { value: cleanText, x: position.x, y: position.y, textColor: color },
    });
    setTextDraft('');
    setTextPosition(null);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isChannelReady) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const position = getCanvasPosition(canvas, e.clientX, e.clientY);
    if (tool === 'text') {
      if (textPosition && textDraft.trim()) publishText();
      const editorX = Math.min(position.x, canvas.width * 0.58);
      const editorHeightInCanvasUnits = (120 * canvas.height) / canvas.getBoundingClientRect().height;
      const editorY = Math.min(position.y, Math.max(0, canvas.height - editorHeightInCanvasUnits));
      setTextDraft('');
      setTextPosition({ x: editorX, y: editorY });
      requestAnimationFrame(() => textInputRef.current?.focus());
      return;
    }

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
          <div className="flex rounded-lg border border-slate-700 p-0.5" role="group" aria-label="Outil du tableau">
            <button
              type="button"
              onClick={() => {
                setTextPosition(null);
                setTextDraft('');
                setTool('draw');
              }}
              aria-pressed={tool === 'draw'}
              className={`px-2.5 py-1.5 text-xs rounded-md ${tool === 'draw' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              Dessin
            </button>
            <button
              type="button"
              onClick={() => setTool('text')}
              aria-pressed={tool === 'text'}
              className={`px-2.5 py-1.5 text-xs rounded-md ${tool === 'text' ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'}`}
            >
              Texte
            </button>
          </div>
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
          className={`block w-full bg-slate-950 rounded-xl border border-slate-800 touch-none ${!isChannelReady ? 'cursor-wait opacity-60' : tool === 'text' ? 'cursor-text' : 'cursor-crosshair'}`}
        />
        {textPosition && tool === 'text' && (
          <div
            className="absolute z-10 w-[42%] rounded-md border border-indigo-500 bg-slate-900 p-2 shadow-xl"
            style={{ left: `${(textPosition.x / 600) * 100}%`, top: `${(textPosition.y / 350) * 100}%` }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <textarea
              ref={textInputRef}
              autoFocus
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              placeholder="Saisir ou coller le texte"
              aria-label="Texte à placer sur le tableau"
              rows={3}
              className="w-full resize-none rounded border border-slate-700 bg-slate-950 p-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-indigo-500 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) publishText();
              }}
            />
            <div className="mt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTextDraft('');
                  setTextPosition(null);
                }}
                className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => publishText()}
                disabled={!textDraft.trim()}
                className="rounded bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Placer
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}