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

export const NODE_API_URL = import.meta.env.VITE_NODE_API_URL ?? "";
export const PHP_API_BASE = "https://categorizr.com/emailserver";

/**
 * Wraps a third-party image URL through the Node.js image proxy so that
 * images blocked by Cross-Origin-Resource-Policy (e.g. logos-world.net)
 * can be displayed on the Vercel staging/production frontend.
 *
 * Falls back to the raw URL when NODE_API_URL is not set (local dev with
 * Vite proxy, where CORP restrictions don't apply).
 */
export const proxyImageUrl = (url) => {
  if (!url) return url;
  if (!NODE_API_URL) return url; // local dev — no proxy needed
  return `${NODE_API_URL}/api/imageproxy?url=${encodeURIComponent(url)}`;
};
