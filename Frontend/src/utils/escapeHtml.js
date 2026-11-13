// Helpers for building HTML strings from receipt data. Receipt text can come from
// other people (forwarded receipts, emails), so anything interpolated into report HTML
// must go through these.

/** Escape text for use in HTML content or a quoted attribute value. */
export const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * Return the URL only if it is safe to put in a link or viewer: http(s) or an inline
 * image. Anything else (javascript:, vbscript:, relative strings, "0") becomes "".
 */
export const safeLinkUrl = (value) => {
  const url = String(value ?? "").trim();
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:image\/(png|jpe?g|gif|webp);/i.test(url)) return url;
  return "";
};
