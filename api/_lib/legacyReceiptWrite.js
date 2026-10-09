/**
 * The browser sends the typed text as JSON ("Lowe's paint").
 * addReceiptv1 / updateReceiptv1 / forwardreceiptv2 on emailserver still paste
 * some columns into SQL, so this hop — not the client — doubles ' to '' for
 * those columns only. MySQL stores that as one apostrophe.
 *
 * storeName on add/update is already parameterized. Doubling it would save Lowe''s.
 */

const UPSTREAM_ORIGIN = "https://categorizr.com/emailserver";

const RECEIPT_SQL_TEXT_FIELDS = [
  "product_name",
  "notes",
  "expense_type",
  "expenseType",
  "paymentType",
  "card_issuer_name",
];

const RECEIPT_WRITE_ENDPOINTS = new Set([
  "addReceiptv1",
  "updateReceiptv1",
  "editReceiptv1",
  "updateReceipt",
  "editReceipt",
]);

const escapeSqlApostrophe = (value) =>
  (value ?? "").toString().replace(/'/g, "''");

export function prepareLegacyReceiptBody(body, { includeStoreName = false } = {}) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const next = { ...body };
  const fields = includeStoreName
    ? ["storeName", ...RECEIPT_SQL_TEXT_FIELDS]
    : RECEIPT_SQL_TEXT_FIELDS;
  for (const field of fields) {
    if (next[field] == null) continue;
    next[field] = escapeSqlApostrophe(next[field]);
  }
  if (includeStoreName && Array.isArray(next.receipt_tax_values)) {
    next.receipt_tax_values = next.receipt_tax_values.map((line) => {
      if (!line || typeof line !== "object" || line.tax_name == null) return line;
      return { ...line, tax_name: escapeSqlApostrophe(line.tax_name) };
    });
  }
  return next;
}

export function matchLegacyReceiptWrite(url) {
  const path = String(url || "").split("?")[0].replace(/\/+$/, "") || "/";
  const receipt = path.match(/^\/api\/receipt\/([^/]+)$/);
  if (receipt && RECEIPT_WRITE_ENDPOINTS.has(receipt[1])) {
    return { upstreamPath: path, includeStoreName: false };
  }
  if (path === "/api/user/forwardreceiptv2") {
    return { upstreamPath: path, includeStoreName: true };
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
  const upstreamBody = prepareLegacyReceiptBody(body, {
    includeStoreName: route.includeStoreName,
  });

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
