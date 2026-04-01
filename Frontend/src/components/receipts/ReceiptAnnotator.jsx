/**
 * ReceiptAnnotator
 *
 * Displays the receipt as a plain <img> (always works, even cross-origin).
 * A transparent <canvas> overlay sits on top for drawing annotations.
 * On save, we fetch the image through the existing /api/imageproxy endpoint
 * (same-origin blob) so we can compose background + annotations into a single
 * PNG without the canvas being "tainted" by cross-origin data.
 */
import React, { useRef, useState, useEffect, useCallback } from "react";
import { X, Undo2, Trash2, Pen, Eraser, Download, Loader2 } from "lucide-react";
import { NODE_API_URL } from "../../api/Axios";

const COLORS = ["#EF4444", "#3B82F6", "#000000", "#16A34A", "#F97316", "#7C3AED"];

const ReceiptAnnotator = ({ imageUrl, onSave, onClose }) => {
  const imgRef = useRef(null);
  const canvasRef = useRef(null);
  const lastPoint = useRef(null);
  const historyRef = useRef([]); // array of ImageData snapshots of the drawing layer

  const [imgLoaded, setImgLoaded] = useState(false);
  const [imgNaturalSize, setImgNaturalSize] = useState({ w: 0, h: 0 });
  // Use a ref (not state) so all callbacks always see the current value
  // without stale-closure delays — the root cause of invisible strokes.
  const isDrawingRef = useRef(false);
  const [isSaving, setIsSaving] = useState(false);
  const [color, setColor] = useState("#EF4444");
  const [lineWidth, setLineWidth] = useState(3);
  const [tool, setTool] = useState("pen"); // 'pen' | 'eraser'
  const [historyLen, setHistoryLen] = useState(0);

  // ── When image loads: initialise canvas to the same natural dimensions ────
  const handleImgLoad = useCallback(() => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const w = img.naturalWidth || img.offsetWidth;
    const h = img.naturalHeight || img.offsetHeight;
    canvas.width = w;
    canvas.height = h;
    setImgNaturalSize({ w, h });
    // Initial empty snapshot
    const ctx = canvas.getContext("2d");
    historyRef.current = [ctx.getImageData(0, 0, w, h)];
    setHistoryLen(1);
    setImgLoaded(true);
  }, []);

  // If the imageUrl is a data: URI or blob: URI we may never get an onLoad
  // event if it fires before the callback is attached — re-check on mount.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth) {
      handleImgLoad();
    }
  }, [handleImgLoad]);

  // ── Pointer helpers ────────────────────────────────────────────────────────
  const getPos = (e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = useCallback((e) => {
    e.preventDefault();
    isDrawingRef.current = true; // synchronous — no stale-closure lag
    lastPoint.current = getPos(e);
  }, []);

  const draw = useCallback(
    (e) => {
      e.preventDefault();
      if (!isDrawingRef.current || !lastPoint.current) return;
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const pos = getPos(e);

      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.lineWidth = lineWidth * 6;
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = color;
      }

      ctx.stroke();
      ctx.globalCompositeOperation = "source-over"; // reset
      lastPoint.current = pos;
    },
    [tool, color, lineWidth]
  );

  const stopDraw = useCallback(() => {
    if (!isDrawingRef.current) return;
    isDrawingRef.current = false; // synchronous reset
    lastPoint.current = null;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const snap = ctx.getImageData(0, 0, canvas.width, canvas.height);
    historyRef.current.push(snap);
    setHistoryLen(historyRef.current.length);
  }, []);

  // ── Undo / Clear ────────────────────────────────────────────────────────
  const undo = () => {
    if (historyRef.current.length <= 1) return;
    historyRef.current.pop();
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.putImageData(historyRef.current[historyRef.current.length - 1], 0, 0);
    setHistoryLen(historyRef.current.length);
  };

  const clearAll = () => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    historyRef.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
    setHistoryLen(1);
  };

  // ── Save: compose background + annotation layer ──────────────────────────
  const handleSave = async () => {
    setIsSaving(true);
    try {
      const annotationCanvas = canvasRef.current;
      const { w, h } = imgNaturalSize;

      const output = document.createElement("canvas");
      output.width = w || annotationCanvas.width;
      output.height = h || annotationCanvas.height;
      const ctx = output.getContext("2d");

      // 1. Try fetching background via proxy with a 6-second timeout
      let backgroundDrawn = false;
      if (imageUrl && !imageUrl.startsWith("data:")) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 6000);
          const proxyUrl = `${NODE_API_URL}/api/imageproxy?url=${encodeURIComponent(imageUrl)}`;
          const resp = await fetch(proxyUrl, { signal: controller.signal });
          clearTimeout(timeoutId);

          if (resp.ok) {
            const blob = await resp.blob();
            const blobUrl = URL.createObjectURL(blob);
            await new Promise((resolve) => {
              const bg = new Image();
              bg.onload = () => {
                ctx.drawImage(bg, 0, 0, output.width, output.height);
                URL.revokeObjectURL(blobUrl);
                backgroundDrawn = true;
                resolve();
              };
              bg.onerror = () => {
                URL.revokeObjectURL(blobUrl);
                resolve(); // don't reject — fall through
              };
              bg.src = blobUrl;
            });
          }
        } catch {
          // timeout or network error — fall through to direct draw
        }
      }

      // 2. Fallback: data URI — always safe for canvas
      if (!backgroundDrawn && imageUrl.startsWith("data:")) {
        await new Promise((resolve) => {
          const bg = new Image();
          bg.onload = () => {
            ctx.drawImage(bg, 0, 0, output.width, output.height);
            backgroundDrawn = true;
            resolve();
          };
          bg.onerror = resolve;
          bg.src = imageUrl;
        });
      }

      // 3. Fallback: draw the displayed <img> directly (works if same-origin or
      //    already loaded without crossOrigin; silently skipped if tainted)
      if (!backgroundDrawn) {
        try {
          ctx.drawImage(imgRef.current, 0, 0, output.width, output.height);
        } catch {
          // tainted — will save annotations-only on a white background
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, output.width, output.height);
        }
      }

      // 4. Always overlay the transparent annotation layer on top
      ctx.drawImage(annotationCanvas, 0, 0);

      const dataUrl = output.toDataURL("image/png");

      // 5. Upload annotated PNG to CDN so the drawing persists permanently.
      //    Fall back to the data URL if the upload fails for any reason.
      let finalUrl = dataUrl;
      try {
        const blob = await fetch(dataUrl).then((r) => r.blob());
        const file = new File([blob], `annotation_${Date.now()}.png`, {
          type: "image/png",
        });
        const formData = new FormData();
        formData.append("file", file);
        const token = localStorage.getItem("token");
        const uploadController = new AbortController();
        const uploadTimeout = setTimeout(
          () => uploadController.abort(),
          15000
        );
        const uploadResp = await fetch("/api/user/uploadmediaV1", {
          method: "POST",
          headers: { Accesstoken: token },
          body: formData,
          signal: uploadController.signal,
        });
        clearTimeout(uploadTimeout);
        if (uploadResp.ok) {
          const uploadData = await uploadResp.json();
          const cdnUrl = Array.isArray(uploadData)
            ? uploadData[0]?.fullImageUrl
            : uploadData?.fullImageUrl;
          if (cdnUrl) finalUrl = cdnUrl;
        }
      } catch (uploadErr) {
        // Network error or timeout — keep the data URL so the drawing is
        // still visible in the current session even if it won't survive a
        // page reload.
        console.warn(
          "Annotation CDN upload failed, using data URL as fallback:",
          uploadErr
        );
      }

      onSave(finalUrl);
    } catch (err) {
      console.error("ReceiptAnnotator save error:", err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4">
      <div className="bg-white rounded-2xl shadow-2xl flex flex-col w-full max-w-3xl max-h-[95vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h3 className="font-bold text-gray-900 text-base">Annotate Receipt</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 rounded-full text-gray-500 hover:text-gray-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-100 bg-gray-50 flex-wrap">
          {/* Pen / Eraser toggle */}
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-lg p-0.5">
            <button
              onClick={() => setTool("pen")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tool === "pen"
                  ? "bg-blue-600 text-white shadow"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Pen size={13} />
              Draw
            </button>
            <button
              onClick={() => setTool("eraser")}
              className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                tool === "eraser"
                  ? "bg-blue-600 text-white shadow"
                  : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              <Eraser size={13} />
              Erase
            </button>
          </div>

          {/* Color swatches */}
          <div className="flex items-center gap-1.5 ml-1">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setColor(c);
                  setTool("pen");
                }}
                style={{ backgroundColor: c }}
                className={`w-5 h-5 rounded-full border-2 transition-transform ${
                  color === c && tool === "pen"
                    ? "border-gray-900 scale-125"
                    : "border-transparent hover:scale-110"
                }`}
              />
            ))}
            <input
              type="color"
              value={color}
              onChange={(e) => {
                setColor(e.target.value);
                setTool("pen");
              }}
              className="w-5 h-5 rounded cursor-pointer border border-gray-300"
              title="Custom colour"
            />
          </div>

          {/* Line width */}
          <select
            value={lineWidth}
            onChange={(e) => setLineWidth(parseInt(e.target.value))}
            className="text-xs border border-gray-200 rounded-md px-1.5 py-1 bg-white ml-1"
          >
            <option value="2">Thin</option>
            <option value="4">Medium</option>
            <option value="7">Thick</option>
            <option value="12">Extra Thick</option>
          </select>

          {/* Undo / Clear */}
          <div className="flex items-center gap-1 ml-auto">
            <button
              onClick={undo}
              disabled={historyLen <= 1}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md disabled:opacity-40"
              title="Undo"
            >
              <Undo2 size={13} />
              Undo
            </button>
            <button
              onClick={clearAll}
              className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-600 hover:bg-gray-100 rounded-md"
              title="Clear all annotations"
            >
              <Trash2 size={13} />
              Clear
            </button>
          </div>
        </div>

        {/* Canvas area — <img> for display + transparent <canvas> overlay */}
        <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center p-4 min-h-0">
          {!imgLoaded && (
            <div className="flex flex-col items-center gap-2 text-gray-400">
              <Loader2 size={28} className="animate-spin" />
              <span className="text-sm">Loading image…</span>
            </div>
          )}

          {/* Wrapper: positions the canvas directly over the img */}
          <div
            className="relative inline-block shadow-lg rounded overflow-hidden"
            style={{ display: imgLoaded ? "inline-block" : "none", maxHeight: "52vh" }}
          >
            {/* Background image — displayed normally, no crossOrigin needed */}
            <img
              ref={imgRef}
              src={imageUrl}
              alt="Receipt"
              className="block max-w-full max-h-[52vh] select-none pointer-events-none"
              onLoad={handleImgLoad}
              draggable={false}
            />

            {/* Transparent drawing canvas — sits exactly on top */}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full"
              style={{
                cursor: tool === "eraser" ? "cell" : "crosshair",
                touchAction: "none",
              }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end items-center gap-3 px-5 py-3 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!imgLoaded || isSaving}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Saving…
              </>
            ) : (
              <>
                <Download size={14} />
                Save Annotation
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReceiptAnnotator;
