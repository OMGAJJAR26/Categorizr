/**
 * Serverless proxy for POST /api/user/uploadmediaV1.
 *
 * Vercel rewrites do not reliably forward multipart/form-data bodies to
 * external origins, so this function acts as the hop instead.
 * Target: https://categorizr.com/emailserver/api/user/uploadmediaV1
 *
 * NOTE: Do NOT add `export const config = { api: { bodyParser: false } }` here.
 * That flag is a Next.js–only API-route setting; this project is not Next.js, so
 * Vercel ignores it and the req stream never fires data/end events, hanging the
 * function. Without that flag Vercel buffers the multipart body into req.body as
 * a Buffer, which readRawBody handles correctly in its first branch.
 */

const UPSTREAM_URL = "https://categorizr.com/emailserver/api/user/uploadmediaV1";

function readRawBody(req) {
  // Vercel buffers the request body before invoking the function.
  // For multipart/form-data it arrives as a Buffer on req.body.
  if (req.body != null) {
    if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    if (typeof req.body === "string" && req.body.length > 0) {
      return Promise.resolve(Buffer.from(req.body));
    }
  }
  // Stream fallback with timeout so the function never hangs forever.
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Body read timeout after 8 s")), 8000);
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => { clearTimeout(timer); resolve(Buffer.concat(chunks)); });
    req.on("error", (err) => { clearTimeout(timer); reject(err); });
  });
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ message: "Method not allowed" });
    return;
  }

  const accessToken = String(req.headers["accesstoken"] || req.headers["Accesstoken"] || "");
  const contentType = req.headers["content-type"] || "";

  let body;
  try {
    body = await readRawBody(req);
  } catch (err) {
    console.error("uploadmediaV1: failed to read request body:", err);
    res.status(400).json({ message: "Could not read request body." });
    return;
  }

  let upstream;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: "POST",
      headers: {
        "Content-Type": contentType,
        "Accesstoken": accessToken,
      },
      body,
    });
  } catch (err) {
    console.error("uploadmediaV1: upstream fetch failed:", err);
    res.status(502).json({ message: "Upload service is unavailable." });
    return;
  }

  let text;
  try {
    text = await upstream.text();
  } catch (err) {
    console.error("uploadmediaV1: failed to read upstream response:", err);
    res.status(502).json({ message: "Bad response from upload service." });
    return;
  }

  res
    .status(upstream.status)
    .setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json; charset=utf-8"
    )
    .end(text);
}
