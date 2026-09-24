/**
 * Clearing free-text receipt fields (Describe Purchase, Notes).
 *
 * The WebApp used to send the string "0" to force a clear (older updateReceiptv1
 * ignored ""), but "0" is NOT user content — iOS and Android render it literally.
 * The backend now accepts an EMPTY STRING as "clear this field" (JSON null is
 * still ignored — PHP null !== ""), so outgoing blanks go out as "" instead: the
 * field is actually cleared and no other client ever shows a stray "0".
 *
 * On the way IN we still collapse the legacy "0" sentinel (and null/"") to empty,
 * so receipts saved by older builds — or by mobile — never display a literal "0".
 */

/** Legacy sentinel older records may still carry in these fields (read-only now). */
export const CLEAR_TEXT_API_VALUE = "0";

/** Free-text fields the user can legitimately blank out. */
export const CLEARABLE_TEXT_FIELDS = ["product_name", "notes"];

/**
 * Outgoing value for updateReceiptv1. Blank goes out as "" (never "0", never
 * null) — the backend clears the column on "", and no client shows a literal
 * "0". Real text passes through untouched.
 */
export const toApiTextValue = (value) => {
  const text = (value ?? "").toString();
  return text.trim() === "" ? "" : text;
};

/**
 * Incoming value from the API. The legacy clear sentinel "0" is not user content,
 * so it reads back as empty rather than showing a literal "0" in the field.
 *
 * Trade-off: a description of exactly "0" is indistinguishable from cleared. That
 * already matched existing behaviour — receipt filtering treated product_name "0"
 * as having no description before this.
 */
export const fromApiTextValue = (value) => {
  const text = (value ?? "").toString();
  return text.trim() === CLEAR_TEXT_API_VALUE ? "" : text;
};
