import {
  forwardLegacyReceiptWrite,
  matchLegacyReceiptWrite,
} from "../_lib/legacyReceiptWrite.js";

export default function handler(req, res) {
  return forwardLegacyReceiptWrite(
    req,
    res,
    matchLegacyReceiptWrite("/api/user/forwardreceiptv2")
  );
}
