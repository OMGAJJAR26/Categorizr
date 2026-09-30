import { searchParamsHaveCredentials } from "../../src/utils/credentialQuery.js";

const UPSTREAM_ORIGIN = "https://categorizr.com/emailserver";

const CREDENTIAL_ROUTES = {
  "/api/user/login": "/api/user/login",
  "/api/user/signup": "/api/user/signup",
};

export function matchCredentialRoute(url) {
  const path = String(url || "").split("?")[0].replace(/\/+$/, "") || "/";
  return CREDENTIAL_ROUTES[path] || null;
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(JSON.stringify(payload));
}

function incomingQuery(req) {
  const requestUrl = new URL(req.url || "/", "http://localhost");
  const params = new URLSearchParams(requestUrl.searchParams);
  const parsed = req.query;
  if (parsed && typeof parsed === "object") {
    for (const [key, value] of Object.entries(parsed)) {
      if (value == null || params.has(key)) continue;
      params.set(key, Array.isArray(value) ? String(value[0]) : String(value));
    }
  }
  return params;
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

/**
 * The legacy account API only reads credentials from the query string, so a
 * pasted login URL is enough to open that account. Accept credentials from
 * the JSON body only, and add them to the upstream URL on this server hop.
 * A browser navigation (GET) or any credential in the incoming URL is refused
 * and is not forwarded.
 */
export async function handleAuthRequest(req, res, upstreamPath) {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Cache-Control", "no-store");
    res.end();
    return;
  }

  if (req.method !== "POST" || searchParamsHaveCredentials(incomingQuery(req))) {
    sendJson(res, 400, {
      message: "This link cannot be used to sign in. Enter your username and password on the login page.",
    });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    sendJson(res, 400, { message: "Invalid request." });
    return;
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    sendJson(res, 400, { message: "Invalid request." });
    return;
  }

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value == null) continue;
    params.set(key, String(value));
  }

  const accessToken = req.headers?.accesstoken || "-";

  let upstream;
  try {
    upstream = await fetch(`${UPSTREAM_ORIGIN}${upstreamPath}?${params.toString()}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accesstoken: String(accessToken),
      },
      body: JSON.stringify(body),
    });
  } catch {
    sendJson(res, 502, { message: "Sign-in service is unavailable." });
    return;
  }

  const text = await upstream.text();
  res.statusCode = upstream.status;
  res.setHeader(
    "Content-Type",
    upstream.headers.get("content-type") || "application/json; charset=utf-8"
  );
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(text);
}
