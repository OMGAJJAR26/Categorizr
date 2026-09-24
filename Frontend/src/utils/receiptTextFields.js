/**
 * Clearing free-text receipt fields (Describe Purchase, Notes).
 *
 * updateReceiptv1 ignores empty strings: a field sent as "" keeps whatever the
 * server already had. The WebApp used to send the string "0" to force a clear,
 * but "0" is NOT user content — iOS and Android render it literally in Describe
 * Purchase / Notes (they have no sentinel translation). So outgoing blanks now go
 * out as null (JSON null) instead: no other client ever shows a stray "0".
 *
 * On the way IN we still collapse the legacy "0" sentinel (and null/"") to empty,
 * so receipts saved by older builds — or by mobile — never display a literal "0".
 */

/** Legacy sentinel older records may still carry in these fields (read-only now). */
export const CLEAR_TEXT_API_VALUE = "0";

/** Free-text fields the user can legitimately blank out. */
export const CLEARABLE_TEXT_FIELDS = ["product_name", "notes"];

/**
 * Outgoing value for updateReceiptv1. Blank goes out as null (never "0"), so the
 * cleared field can't surface as a literal "0" on other devices. Real text passes
 * through untouched.
 */
export const toApiTextValue = (value) => {
  const text = (value ?? "").toString();
  return text.trim() === "" ? null : text;
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
