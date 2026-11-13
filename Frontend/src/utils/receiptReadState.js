// Read/unread state of a receipt comes from ONE place: the `status` flag the API
// returns (GET /user/getreceiptfromdatev1) and accepts (PUT /receipt/updateReceiptv1):
//   0 => unread, 1 => read.
// is_verify is NOT part of this. It only marks drafts / eReceipts awaiting review,
// which is a separate section of the list.

/** Numeric status of a receipt; a missing or empty status is -1 (counts as unread). */
export const getReceiptStatusValue = (r) => {
  if (!r) return -1;
  const raw = r.status != null && r.status !== "" ? r.status : r.Status;
  if (raw == null || raw === "") return -1;
  const n = Number(raw);
  return Number.isFinite(n) ? n : -1;
};

export const isReceiptRead = (r) => {
  if (!r) return true;
  return getReceiptStatusValue(r) === 1;
};

export const isReceiptUnread = (r) => !!r && !isReceiptRead(r);

const isNetworkReceivedReceipt = (r) =>
  r?.fk_forward_from_receipt_id != null &&
  String(r.fk_forward_from_receipt_id) !== "0";

/**
 * Blue "New" highlight for a received (network-forwarded) receipt: it is highlighted
 * while it is UNREAD, i.e. while the API `status` flag is not 1 (0 => unread, 1 => read;
 * a missing status counts as unread). is_verify plays no part. Drafts never highlight
 * (they surface in the Needs Review section).
 */
export const isNewForwardedReceipt = (r) => {
  if (!r || String(r.is_draft ?? "0") === "1") return false;
  if (!isNetworkReceivedReceipt(r)) return false;
  return isReceiptUnread(r);
};

/**
 * Blue "New"/unread highlight shown in the receipt list for ANY receipt (normal,
 * forwarded, received). The only input is the API `status` flag from
 * GET /user/getreceiptfromdatev1: highlighted while status is not 1 (0 => unread,
 * 1 => read; missing counts as unread). is_verify plays no part. Drafts are excluded
 * (they appear in the Needs Review section).
 */
export const isUnreadHighlightReceipt = (r) => {
  if (!r || String(r.is_draft ?? "0") === "1") return false;
  return isReceiptUnread(r);
};

/** Opening (Edit) or swiping onto an unread receipt should mark it read. */
export const shouldMarkReceiptRead = (r) => !!r?.id && isReceiptUnread(r);

/**
 * Did a status-only update (POST /receipt/UpdateReceiptStatus) actually succeed?
 * The legacy API answers some failures with HTTP 200 and an error body such as
 * { code: "010", message: "Session Token Invalid" }, so an OK status alone is not
 * proof. A success returns the receipt (it carries an id) or a success code/message.
 */
export const isStatusUpdateSuccessful = (httpOk, bodyText) => {
  if (!httpOk) return false;
  const text = String(bodyText ?? "").trim();
  if (!text) return true;
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return true; // non-JSON 200: nothing to tell us it failed
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) return true;
  if ("id" in body) return true;
  if (!("code" in body) && !("message" in body)) return true;
  const code = String(body.code ?? "");
  return code === "000" || /success|updated/i.test(String(body.message ?? ""));
};
