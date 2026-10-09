import {
  forwardLegacyReceiptWrite,
  matchLegacyReceiptWrite,
} from "../_lib/legacyReceiptWrite.js";

export default function handler(req, res) {
  const endpoint = req.query?.endpoint || "";
  const route = matchLegacyReceiptWrite(`/api/receipt/${endpoint}`);
  if (!route) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ message: "Not found" }));
    return;
  }
  return forwardLegacyReceiptWrite(req, res, route);
}
