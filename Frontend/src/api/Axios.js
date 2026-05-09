// API base-URL constants used throughout the app.
//
// VITE_NODE_API_URL points to the Node.js (Express) backend on Render.
//   - Local dev : leave the env var empty → Vite proxy handles /api/chat
//                 and /api/integrations transparently.
//   - Staging   : set VITE_NODE_API_URL=https://categorizr-chatbot-staging.onrender.com
//                 in the Vercel dashboard (Environment Variables).
//   - Production: set VITE_NODE_API_URL=https://categorizr-chatbot.onrender.com
//
// PHP_API_BASE is always the live PHP server; its /api/* requests are
// already proxied by vercel.json in staging/production, so this constant
// is only needed if you ever want to reference it explicitly.
//
// /api/imageproxy is routed separately (Vite dev → Render by default; Vercel
// rewrite → Render) so ReceiptAnnotator can fetch receipt images without a
// local Node server. Set VITE_NODE_API_URL to override the proxy host.

export const NODE_API_URL = import.meta.env.VITE_NODE_API_URL ?? "";
export const PHP_API_BASE = "https://categorizr.com/emailserver";

/**
 * Wraps a third-party image URL through the Node.js image proxy so that
 * images blocked by Cross-Origin-Resource-Policy (e.g. logos-world.net)
 * can be displayed on the Vercel staging/production frontend.
 *
 * Safe to call on any string — data URIs, relative paths and already-proxied
 * URLs are returned unchanged.  Falls back to raw URL in local dev.
 */
export const proxyImageUrl = (url) => {
  if (!url || typeof url !== "string") return url;
  if (url.startsWith("data:")) return url;          // data URI — no proxy needed
  if (url.startsWith("/")) return url;               // relative path — no proxy needed
  if (!url.startsWith("http")) return url;           // not an HTTP URL
  // Use same-origin proxy when NODE_API_URL is not configured so blocked
  // hotlinked logos (403/anti-leech) still render in web app builds.
  const proxyBase = NODE_API_URL || "";
  if (url.includes("/api/imageproxy?url=")) return url; // already proxied
  return `${proxyBase}/api/imageproxy?url=${encodeURIComponent(url)}`;
};

/** Strip proxy wrapper and return the original raw URL (for localStorage storage). */
export const unproxyImageUrl = (url) => {
  if (!url || typeof url !== "string") return url;
  const marker = "/api/imageproxy?url=";
  const idx = url.indexOf(marker);
  if (idx === -1) return url;
  try {
    return decodeURIComponent(url.slice(idx + marker.length));
  } catch {
    return url;
  }
};
