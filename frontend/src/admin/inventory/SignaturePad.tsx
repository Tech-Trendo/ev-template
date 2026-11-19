import { useEffect, useRef, useState } from "react";

export default function SignaturePad({
  value,
  onChange,
}: {
  /** Existing signature image URL (read-only preview when signed) */
  value?: string;
  onChange?: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inkRef = useRef(false);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * scale;
    canvas.height = 160 * scale;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(scale, scale);
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.strokeStyle = "#0B3D2B";
    }
  }, []);

  const pos = (e: React.PointerEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const emit = () => {
    const canvas = canvasRef.current;
    if (canvas && inkRef.current && onChange) onChange(canvas.toDataURL("image/png"));
  };

  return (
    <div>
      {value && !hasInk ? (
        <div className="border border-[#E8E8E5] rounded-xl bg-white p-3">
          <img src={value} alt="Saved signature" className="h-24 w-auto mx-auto" />
          {onChange && (
            <button
              type="button"
              onClick={() => setHasInk(true)}
              className="mt-2 w-full text-[11px] font-bold text-[#10B981] hover:text-[#0B3D2B] transition-colors"
            >
              Re-sign
            </button>
          )}
        </div>
      ) : (
        <>
          <canvas
            ref={canvasRef}
            className="w-full h-40 border border-dashed border-[#B0B0AA] rounded-xl bg-white cursor-crosshair touch-none"
            onPointerDown={(e) => {
              drawing.current = true;
              const ctx = canvasRef.current?.getContext("2d");
              const p = pos(e);
              ctx?.beginPath();
              ctx?.moveTo(p.x, p.y);
              (e.target as HTMLElement).setPointerCapture(e.pointerId);
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return;
              const ctx = canvasRef.current?.getContext("2d");
              const p = pos(e);
              ctx?.lineTo(p.x, p.y);
              ctx?.stroke();
              inkRef.current = true;
              if (!hasInk) setHasInk(true);
            }}
            onPointerUp={() => {
              drawing.current = false;
              emit();
            }}
            onPointerLeave={() => {
              if (drawing.current) {
                drawing.current = false;
                emit();
              }
            }}
          />
          <div className="mt-1.5 flex justify-between items-center">
            <span className="text-[10px] text-[#B0B0AA]">Sign inside the box</span>
            {onChange && (
              <button
                type="button"
                onClick={() => {
                  const canvas = canvasRef.current;
                  const ctx = canvas?.getContext("2d");
                  if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
                  inkRef.current = false;
                  setHasInk(false);
                  onChange(null);
                }}
                className="text-[11px] font-bold text-[#737373] hover:text-[#8B0000] transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
