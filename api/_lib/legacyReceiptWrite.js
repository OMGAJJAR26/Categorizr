/**
 * Pass-through proxy for the legacy receipt-write endpoints
 * (addReceiptv1 / updateReceiptv1 / forwardreceiptv2) on emailserver.
 *
 * This hop used to double ' to '' for the text columns, because those columns
 * were once pasted straight into SQL. The backend has since parameterized all
 * three endpoints — verified live 2026-10-13: a raw "Lowe's" / "Bob's" is now
 * stored verbatim, and a sent "Lowe''s" is stored doubled. So escaping here now
 * CORRUPTS the data: it saved Lowe''s / Bob''s, which the web app hid by
 * un-doubling on read while iOS/Android (which don't) showed the doubled text,
 * and forwarding re-escaped an already-escaped value into Lowe''''s.
 *
 * The body is therefore forwarded unchanged. The client sends the typed text
 * ("Lowe's paint") and the backend stores exactly that.
 */

const UPSTREAM_ORIGIN = "https://categorizr.com/emailserver";

const RECEIPT_WRITE_ENDPOINTS = new Set([
  "addReceiptv1",
  "updateReceiptv1",
  "editReceiptv1",
  "updateReceipt",
  "editReceipt",
]);

// Backend endpoints are parameterized — forward the typed text verbatim, no
// apostrophe doubling. Kept as a function (not inlined) so the single escape
// decision stays in one place if a future endpoint ever needs it again.
export function prepareLegacyReceiptBody(body) {
  return body;
}

export function matchLegacyReceiptWrite(url) {
  const path = String(url || "").split("?")[0].replace(/\/+$/, "") || "/";
  const receipt = path.match(/^\/api\/receipt\/([^/]+)$/);
  if (receipt && RECEIPT_WRITE_ENDPOINTS.has(receipt[1])) {
    return { upstreamPath: path };
  }
  if (path === "/api/user/forwardreceiptv2") {
    return { upstreamPath: path };
  }
  return null;
}

function readJsonBody(req) {
  if (req.body != null && typeof req.body === "object" && !Buffer.isBuffer(req.body)) {
    return Promise.resolve(req.body);
  }
  if (typeof req.body === "string") {
    if (!req.body) return Promise.resolve({});
    try {
      return Promise.resolve(JSON.parse(req.body));
    } catch {
      return Promise.resolve(null);
    }
  }
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(null);
      }
    });
    req.on("error", reject);
  });
}

export async function forwardLegacyReceiptWrite(req, res, route) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }
  if (req.method !== "POST") {
    res.statusCode = 405;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ message: "Method not allowed" }));
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ message: "Invalid request." }));
    return;
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ message: "Invalid request." }));
    return;
  }

  const accessToken = req.headers?.accesstoken || req.headers?.Accesstoken || "";
  const upstreamBody = prepareLegacyReceiptBody(body);

  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM_ORIGIN}${route.upstreamPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accesstoken: String(accessToken),
      },
      body: JSON.stringify(upstreamBody),
    });
  } catch {
    res.statusCode = 502;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ message: "Receipt service is unavailable." }));
    return;
  }

  const text = await upstream.text();
  res.statusCode = upstream.status;
  res.setHeader(
    "Content-Type",
    upstream.headers.get("content-type") || "application/json; charset=utf-8"
  );
  res.end(text);
}
