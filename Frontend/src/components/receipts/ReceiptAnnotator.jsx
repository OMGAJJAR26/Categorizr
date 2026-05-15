/**
 * ReceiptAnnotator
 *
 * Displays the receipt as a plain <img> (always works, even cross-origin).
 * A transparent <canvas> overlay sits on top for drawing annotations.
 * On save, we prefer the same-origin /api/imageproxy blob, then fall back to
 * a direct CORS fetch or a CORS-enabled Image load so the receipt background
 * is still composed when the proxy is down. Only if all paths fail do we use
 * a white background (strokes-only), which we try hard to avoid.
 */
import React, { useRef, useState, useEffect, useCallback } from "react";
import { X, Undo2, Trash2, Pen, Eraser, Download, Loader2 } from "lucide-react";
import { proxyImageUrl } from "../../api/Axios";

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
  const [saveError, setSaveError] = useState(null);
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
    setSaveError(null);
    try {
      const annotationCanvas = canvasRef.current;
      const { w, h } = imgNaturalSize;

      const output = document.createElement("canvas");
      output.width = w || annotationCanvas.width;
      output.height = h || annotationCanvas.height;
      const ctx = output.getContext("2d");

      const rawUrl =
        imageUrl && imageUrl.includes("/api/imageproxy?url=")
          ? (() => {
              try {
                return decodeURIComponent(
                  imageUrl.split("/api/imageproxy?url=")[1]
                );
              } catch {
                return imageUrl;
              }
            })()
          : imageUrl || "";

      let backgroundDrawn = false;

      const drawBlobToOutput = (blob) =>
        new Promise((resolve) => {
          const blobUrl = URL.createObjectURL(blob);
          const bg = new Image();
          bg.onload = () => {
            try {
              ctx.drawImage(bg, 0, 0, output.width, output.height);
              URL.revokeObjectURL(blobUrl);
              resolve(true);
            } catch {
              URL.revokeObjectURL(blobUrl);
              resolve(false);
            }
          };
          bg.onerror = () => {
            URL.revokeObjectURL(blobUrl);
            resolve(false);
          };
          bg.src = blobUrl;
        });

      const isImageBlob = (blob, resp) => {
        const ct = (blob?.type || resp?.headers?.get("content-type") || "").toLowerCase();
        return (
          ct.startsWith("image/") ||
          ct === "application/octet-stream" ||
          (!ct && (blob?.size || 0) > 512)
        );
      };

      // 1. Image proxy — same URL rules as proxyImageUrl() (Vite → Render locally,
      //    Vercel rewrite → Render, or VITE_NODE_API_URL absolute on staging).
      if (imageUrl && !imageUrl.startsWith("data:") && !imageUrl.startsWith("blob:")) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);
          const proxyUrl = proxyImageUrl(rawUrl);
          const resp = await fetch(proxyUrl, { signal: controller.signal });
          clearTimeout(timeoutId);
          if (resp.ok) {
            const blob = await resp.blob();
            if (isImageBlob(blob, resp)) {
              backgroundDrawn = await drawBlobToOutput(blob);
            }
          }
        } catch {
          /* fall through */
        }
      }

      // 2. data: URI — always safe for canvas
      if (!backgroundDrawn && imageUrl.startsWith("data:")) {
        await new Promise((resolve) => {
          const bg = new Image();
          bg.onload = () => {
            try {
              ctx.drawImage(bg, 0, 0, output.width, output.height);
              backgroundDrawn = true;
            } catch {
              /* noop */
            }
            resolve();
          };
          bg.onerror = resolve;
          bg.src = imageUrl;
        });
      }

      // 3. blob: URL (e.g. local file preview)
      if (!backgroundDrawn && typeof imageUrl === "string" && imageUrl.startsWith("blob:")) {
        await new Promise((resolve) => {
          const bg = new Image();
          bg.onload = () => {
            try {
              ctx.drawImage(bg, 0, 0, output.width, output.height);
              backgroundDrawn = true;
            } catch {
              /* noop */
            }
            resolve();
          };
          bg.onerror = resolve;
          bg.src = imageUrl;
        });
      }

      // 4. Direct CORS fetch to the receipt CDN (works when proxy is broken but CDN allows CORS)
      if (!backgroundDrawn && rawUrl && /^https?:\/\//i.test(rawUrl)) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 12000);
          const resp = await fetch(rawUrl, {
            method: "GET",
            mode: "cors",
            credentials: "omit",
            signal: controller.signal,
          });
          clearTimeout(timeoutId);
          if (resp.ok) {
            const blob = await resp.blob();
            if (isImageBlob(blob, resp)) {
              backgroundDrawn = await drawBlobToOutput(blob);
            }
          }
        } catch {
          /* fall through */
        }
      }

      // 5. CORS-enabled Image (some hosts allow img crossOrigin but not fetch)
      if (!backgroundDrawn && rawUrl && /^https?:\/\//i.test(rawUrl)) {
        const ok = await new Promise((resolve) => {
          const bg = new Image();
          bg.crossOrigin = "anonymous";
          bg.onload = () => {
            try {
              const probe = document.createElement("canvas");
              probe.width = output.width;
              probe.height = output.height;
              const pctx = probe.getContext("2d");
              pctx.drawImage(bg, 0, 0, output.width, output.height);
              probe.toDataURL("image/png");
              ctx.drawImage(bg, 0, 0, output.width, output.height);
              resolve(true);
            } catch {
              resolve(false);
            }
          };
          bg.onerror = () => resolve(false);
          bg.src = rawUrl;
        });
        backgroundDrawn = ok;
      }

      // 6. Same <img> as on screen — only if pixels are readable (same-origin or CORS-clean)
      if (!backgroundDrawn && imgRef.current?.complete && imgRef.current.naturalWidth) {
        try {
          const probe = document.createElement("canvas");
          probe.width = output.width;
          probe.height = output.height;
          const pctx = probe.getContext("2d");
          pctx.drawImage(imgRef.current, 0, 0, output.width, output.height);
          probe.toDataURL("image/png");
          ctx.drawImage(imgRef.current, 0, 0, output.width, output.height);
          backgroundDrawn = true;
        } catch {
          /* cross-origin taint — cannot export */
        }
      }

      // 7. Last resort: white (strokes only) — avoids crashing but looks wrong
      if (!backgroundDrawn) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, output.width, output.height);
      }

      // 8. Overlay the transparent annotation layer on top
      ctx.drawImage(annotationCanvas, 0, 0);

      let dataUrl;
      try {
        dataUrl = output.toDataURL("image/png");
      } catch (exportErr) {
        console.error("ReceiptAnnotator export error:", exportErr);
        throw new Error(
          "Could not export the annotated image (browser security). Try again after the image finishes loading, or use a receipt image hosted with CORS."
        );
      }

      // 9. Upload annotated PNG to CDN so the drawing persists permanently.
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
      setSaveError(
        err?.message ||
          "Could not save annotation. Wait for the image to finish loading, then try again."
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="receipt-annotator-root fixed inset-0 z-[90] flex items-center justify-center bg-black/75 p-4">
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

        {saveError && (
          <p className="mx-5 mb-0 px-3 py-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg">
            {saveError}
          </p>
        )}

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
