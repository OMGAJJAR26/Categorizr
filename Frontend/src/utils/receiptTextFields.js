/**
 * Clearing free-text receipt fields (Describe Purchase, Notes).
 *
 * updateReceiptv1 ignores empty strings: a field sent as "" keeps whatever the
 * server already had, and the response echoes the OLD value back. So emptying
 * Describe Purchase looked like it saved (HTTP 200) but never persisted.
 *
 * The API's convention for "this field is now blank" is the string "0" — the same
 * sentinel the payment fields already use (see CLEAR_PAYMENT_API_VALUE) and the
 * value receipt filtering already reads as "no description". Sending "0" does
 * overwrite, so clearing goes out as "0" and comes back in as "".
 */
export const CLEAR_TEXT_API_VALUE = "0";

/** Free-text fields the user can legitimately blank out. */
export const CLEARABLE_TEXT_FIELDS = ["product_name", "notes"];

/**
 * Outgoing value for updateReceiptv1. Blank becomes the clear sentinel, because
 * "" would be silently ignored by the server.
 */
export const toApiTextValue = (value) => {
  const text = (value ?? "").toString();
  return text.trim() === "" ? CLEAR_TEXT_API_VALUE : text;
};

/**
 * Incoming value from the API. The clear sentinel is not user content, so it
 * reads back as empty rather than showing a literal "0" in the field.
 *
 * Trade-off: a description of exactly "0" is indistinguishable from cleared. That
 * already matched existing behaviour — receipt filtering treated product_name "0"
 * as having no description before this.
 */
export const fromApiTextValue = (value) => {
  const text = (value ?? "").toString();
  return text.trim() === CLEAR_TEXT_API_VALUE ? "" : text;
};
