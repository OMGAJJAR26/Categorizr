import React, { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import { renderPdfFirstPageFromUrl } from "../../utils/receiptParser";
import { getPdfProxyUrl } from "../../utils/mediaUrlUtils";

/**
 * Renders the first page of a PDF as a thumbnail image (via pdf.js).
 */
export default function PdfThumbnail({
  url,
  className = "w-24 h-32",
  title = "Open PDF",
}) {
  const [thumbSrc, setThumbSrc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const openUrl = getPdfProxyUrl(url);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setFailed(false);
    setThumbSrc(null);

    renderPdfFirstPageFromUrl(url, { maxWidth: 192 })
      .then((dataUrl) => {
        if (!cancelled) {
          setThumbSrc(dataUrl);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true);
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  const shellClass = `${className} bg-gray-100 border rounded overflow-hidden relative block focus:outline-none`;

  return (
    <a
      href={openUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={shellClass}
      title={title}
    >
      {loading ? (
        <Centered>
          <span className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
        </Centered>
      ) : failed || !thumbSrc ? (
        <Centered>
          <FileText size={28} className="text-gray-500" />
        </Centered>
      ) : (
        <img
          src={thumbSrc}
          alt="PDF preview"
          className="w-full h-full object-cover object-top pointer-events-none"
        />
      )}
      <div className="absolute bottom-1 left-1 right-1 text-center text-[10px] font-semibold bg-white/80 rounded p-0.5">
        PDF
      </div>
    </a>
  );
}

function Centered({ children }) {
  return (
    <div className="w-full h-full flex items-center justify-center">{children}</div>
  );
}
