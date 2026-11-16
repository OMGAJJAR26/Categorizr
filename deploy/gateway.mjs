// Small Node gateway replacing the Vercel serverless functions on Apache hosting.
// Listens on 127.0.0.1:3100. Apache proxies only the routes below to it.
import http from "node:http";
import { handleAuthRequest, matchCredentialRoute } from "../Frontend/api/_lib/forwardAuth.js";
import {
  forwardLegacyReceiptWrite,
  matchLegacyReceiptWrite,
} from "../api/_lib/legacyReceiptWrite.js";

const PORT = Number(process.env.GATEWAY_PORT || 3100);
const HOST = "127.0.0.1";
const UPLOAD_URL = "https://categorizr.com/emailserver/api/user/uploadmediaV1";

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function uploadMedia(req, res) {
  if (req.method === "OPTIONS") { res.statusCode = 204; return res.end(); }
  if (req.method !== "POST") return json(res, 405, { message: "Method not allowed" });
  const chunks = [];
  try {
    for await (const c of req) chunks.push(c);
  } catch {
    return json(res, 400, { message: "Could not read request body." });
  }
  try {
    const up = await fetch(UPLOAD_URL, {
      method: "POST",
      headers: {
        "Content-Type": req.headers["content-type"] || "",
        Accesstoken: String(req.headers["accesstoken"] || ""),
      },
      body: Buffer.concat(chunks),
    });
    const text = await up.text();
    res.statusCode = up.status;
    res.setHeader("Content-Type", up.headers.get("content-type") || "application/json; charset=utf-8");
    res.end(text);
  } catch (err) {
    console.error("uploadmediaV1 upstream failed:", err);
    json(res, 502, { message: "Upload service is unavailable." });
  }
}

const server = http.createServer((req, res) => {
  const url = req.url || "";
  const path = url.split("?")[0].replace(/\/+$/, "");

  const cred = matchCredentialRoute(url);
  if (cred) return void handleAuthRequest(req, res, cred);

  const receipt = matchLegacyReceiptWrite(url);
  if (receipt) return void forwardLegacyReceiptWrite(req, res, receipt);

  if (path === "/api/user/uploadmediaV1") return void uploadMedia(req, res);

  json(res, 404, { message: "Not found" });
});

server.listen(PORT, HOST, () => console.log(`gateway listening on ${HOST}:${PORT}`));
