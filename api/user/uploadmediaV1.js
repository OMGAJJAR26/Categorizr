/**
 * Proxy for /api/user/uploadmediaV1 — forwards multipart/form-data to the
 * upstream emailserver.  Vercel rewrites do not reliably forward binary POST
 * bodies (multipart file uploads) to external origins, so this serverless
 * function acts as the hop instead.
 */

const UPSTREAM_ORIGIN = "https://categorizr.com/emailserver";

function readRawBody(req) {
  // If Vercel already parsed the body (Buffer or pre-read), use it directly.
  if (req.body != null) {
    if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    if (typeof req.body === "string") return Promise.resolve(Buffer.from(req.body));
    // JSON-parsed object — shouldn't happen for multipart, but handle defensively.
    return Promise.resolve(Buffer.from(JSON.stringify(req.body)));
  }

  // Read from the raw stream.
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
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
    upstream = await fetch(`${UPSTREAM_ORIGIN}/user/uploadmediaV1`, {
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

  const text = await upstream.text();
  res
    .status(upstream.status)
    .setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json; charset=utf-8"
    )
    .end(text);
}
