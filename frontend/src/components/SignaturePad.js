import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Eraser, Check } from "lucide-react";
import { fileToDataUrl } from "@/lib/colorExtractor";

export default function SignaturePad({ value, onChange }) {
  const [mode, setMode] = useState("upload"); // upload | draw
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const hasStrokeRef = useRef(false);

  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#0F172A";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    hasStrokeRef.current = false;
  }, [mode]);

  const pointerPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: (clientX - rect.left) * (canvas.width / rect.width), y: (clientY - rect.top) * (canvas.height / rect.height) };
  };

  const start = (e) => {
    e.preventDefault();
    drawingRef.current = true;
    const { x, y } = pointerPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const { x, y } = pointerPos(e);
    const ctx = canvasRef.current.getContext("2d");
    ctx.lineTo(x, y);
    ctx.stroke();
    hasStrokeRef.current = true;
  };

  const end = () => { drawingRef.current = false; };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    hasStrokeRef.current = false;
  };

  const saveDrawing = () => {
    if (!hasStrokeRef.current) return;
    onChange(canvasRef.current.toDataURL("image/png"));
  };

  const onUpload = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const dataUrl = await fileToDataUrl(f);
    onChange(dataUrl);
  };

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <Button type="button" size="sm" variant={mode === "upload" ? "default" : "outline"} className="rounded-full" onClick={() => setMode("upload")}>Importer une image</Button>
        <Button type="button" size="sm" variant={mode === "draw" ? "default" : "outline"} className="rounded-full" onClick={() => setMode("draw")}>Dessiner à la souris</Button>
      </div>

      {mode === "upload" ? (
        <label className="cursor-pointer block">
          <input type="file" accept="image/*" className="hidden" onChange={onUpload} data-testid="settings-signature-input" />
          <div className="border-2 border-dashed border-slate-300 rounded-2xl h-32 grid place-items-center bg-white hover:border-orange-400 transition">
            {value ? <img src={value} alt="Signature" className="max-h-24" /> : (
              <div className="text-center">
                <Upload size={20} className="mx-auto text-slate-400" />
                <div className="mt-2 text-sm text-slate-500">Uploader une signature (image/photo)</div>
              </div>
            )}
          </div>
        </label>
      ) : (
        <div>
          <canvas
            ref={canvasRef}
            width={480}
            height={160}
            className="w-full h-32 rounded-2xl border-2 border-slate-300 bg-white touch-none cursor-crosshair"
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end}
            data-testid="settings-signature-canvas"
          />
          <div className="flex gap-2 mt-2">
            <Button type="button" size="sm" variant="outline" className="rounded-full" onClick={clearCanvas}>
              <Eraser size={14} className="mr-1.5" />Effacer
            </Button>
            <Button type="button" size="sm" className="rounded-full" style={{background:"var(--club-primary)"}} onClick={saveDrawing}>
              <Check size={14} className="mr-1.5" />Valider ce dessin
            </Button>
          </div>
          {value && mode === "draw" && (
            <div className="mt-2 text-xs text-slate-500">Signature actuelle : <img src={value} alt="" className="inline h-8 align-middle border rounded ml-1" /></div>
          )}
        </div>
      )}

      {value && (
        <button type="button" className="text-xs text-red-600 mt-2 underline" onClick={() => onChange("")}>
          Supprimer la signature
        </button>
      )}
    </div>
  );
}
