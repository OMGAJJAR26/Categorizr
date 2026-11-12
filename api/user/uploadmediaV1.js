/**
 * Serverless proxy for POST /api/user/uploadmediaV1.
 *
 * Vercel rewrites do not reliably forward multipart/form-data bodies to
 * external origins, so this function acts as the hop instead.
 * Target: https://categorizr.com/emailserver/api/user/uploadmediaV1
 *
 * bodyParser must be disabled so Vercel hands us the raw stream — if Vercel
 * pre-parses a multipart body the binary data is corrupted before we can proxy it.
 */

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

const UPSTREAM_URL = "https://categorizr.com/emailserver/api/user/uploadmediaV1";

function readRawBody(req) {
  if (req.body != null) {
    if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    if (typeof req.body === "string") return Promise.resolve(Buffer.from(req.body));
    return Promise.resolve(Buffer.from(JSON.stringify(req.body)));
  }
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

  const text = await upstream.text();
  res
    .status(upstream.status)
    .setHeader(
      "Content-Type",
      upstream.headers.get("content-type") || "application/json; charset=utf-8"
    )
    .end(text);
}
