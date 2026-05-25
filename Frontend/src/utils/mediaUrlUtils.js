import { unproxyImageUrl } from "../api/Axios";

export const PDF_PROXY_BASE =
  "https://categorizr.com/emailserver/pdf_proxy_base.php?url=";

/** Comma between URLs only — not commas inside a path (e.g. "Feb 27, 2026.pdf"). */
const MEDIA_URL_SEPARATOR = /,(?=\s*https?:\/\/)/i;

const INVALID_VALUES = new Set(["0", "null", "undefined", ""]);

export function normalizeMediaUrl(url) {
  const raw = unproxyImageUrl((url || "").toString().trim());
  if (!raw || INVALID_VALUES.has(raw.toLowerCase()) || raw.startsWith("blob:")) {
    return "";
  }
  try {
    const fixed = raw.replace(/%25([0-9A-Fa-f]{2})/g, "%$1");
    return encodeURI(decodeURI(fixed));
  } catch {
    return encodeURI(raw);
  }
}

export function mediaUrlsEqual(a, b) {
  const na = normalizeMediaUrl(a);
  const nb = normalizeMediaUrl(b);
  return !!na && !!nb && na === nb;
}

export function splitMediaField(value) {
  if (!value || typeof value !== "string") return [];
  return value
    .split(MEDIA_URL_SEPARATOR)
    .map((part) => part.trim())
    .filter((part) => part && !INVALID_VALUES.has(part.toLowerCase()))
    .map((part) => normalizeMediaUrl(part))
    .filter(Boolean);
}

export function buildCombinedMediaField(sources) {
  const urls = [];
  const pushUrl = (candidate) => {
    const normalized = normalizeMediaUrl(candidate);
    if (!normalized || urls.includes(normalized)) return;
    urls.push(normalized);
  };

  sources.forEach((source) => {
    if (Array.isArray(source)) {
      source.forEach((item) => pushUrl(item));
      return;
    }
    splitMediaField(source).forEach((item) => pushUrl(item));
  });

  if (urls.length === 0) return "0";
  return urls.join(",");
}

/** Replace one normalized URL inside a comma-separated media field. */
export function replaceUrlInMediaCsv(csv, normalizedOld, replacement) {
  if (!csv || typeof csv !== "string" || csv === "0") return csv;

  const rawParts = csv
    .split(MEDIA_URL_SEPARATOR)
    .map((p) => p.trim())
    .filter((p) => p && !INVALID_VALUES.has(p.toLowerCase()));

  let hit = false;
  const next = rawParts.map((p) => {
    const n = normalizeMediaUrl(p);
    if (n && normalizedOld && n === normalizedOld) {
      hit = true;
      return replacement;
    }
    return p;
  });

  if (!hit) return csv;
  return next.join(",");
}

const SAFE_UPLOAD_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "gif",
  "webp",
  "pdf",
  "heic",
  "heif",
  "bmp",
  "tiff",
  "tif",
]);

/**
 * Rename a File before upload so the backend stores a safe GCS object key.
 * Commas/spaces in names like "Costco - Feb 27, 2026.pdf" break comma-separated
 * receipt_image fields and can produce un-fetchable CDN URLs.
 */
export function sanitizeUploadFile(file) {
  if (!file) return file;
  const original = file.name || "";
  const dotIdx = original.lastIndexOf(".");
  const rawExt = dotIdx >= 0 ? original.slice(dotIdx + 1).toLowerCase() : "";
  const ext = SAFE_UPLOAD_EXTENSIONS.has(rawExt)
    ? rawExt
    : file.type === "application/pdf"
      ? "pdf"
      : "jpg";
  const ts = Date.now();
  const rnd = Math.random().toString(36).slice(2, 8);
  const safeName = `image_${ts}_${rnd}.${ext}`;
  return new File([file], safeName, {
    type: file.type,
    lastModified: file.lastModified,
  });
}

export function getPdfProxyUrl(url) {
  if (!url || typeof url !== "string") return "";
  const trimmed = url.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:")) return trimmed;
  if (trimmed.includes("pdf_proxy_base.php")) return trimmed;
  return PDF_PROXY_BASE + encodeURIComponent(trimmed);
}

export function isPdfUrl(url) {
  if (!url || typeof url !== "string") return false;
  return (
    /\.pdf(\?|$)/i.test(url) || /^data:application\/pdf/i.test(url)
  );
}

/** Email / forwarded receipts keep server media as-is. */
export function isProtectedReceiptMedia(receipt) {
  if (!receipt) return false;
  const hasIncomingEmailId =
    receipt.fk_incoming_email_id &&
    receipt.fk_incoming_email_id !== "0" &&
    receipt.fk_incoming_email_id !== 0;
  const isForwardedReceipt =
    receipt.receipt_forwarded === "1" || receipt.receipt_forwarded === 1;
  return !!(hasIncomingEmailId || isForwardedReceipt);
}

/** Higher rank = newer receipt (wins duplicate media URLs). */
export function receiptMediaRank(receipt) {
  const id = parseInt(receipt?.id, 10);
  const date = parseInt(receipt?.product_date, 10);
  const idPart = Number.isFinite(id) ? id : 0;
  const datePart = Number.isFinite(date) ? date : 0;
  return idPart * 1e10 + datePart;
}

/** Ordered unique media URLs from a receipt's image fields. */
export function collectReceiptMediaUrls(receipt) {
  if (!receipt) return [];
  const ordered = [];
  const seen = new Set();
  [...splitMediaField(receipt.emailAttachment), ...splitMediaField(receipt.receipt_image)].forEach(
    (url) => {
      if (!url || seen.has(url)) return;
      seen.add(url);
      ordered.push(url);
    }
  );
  return ordered;
}

/**
 * When uploadmediaV1 pollutes older receipts, the same CDN URL can appear on
 * multiple receipts. Assign each URL to the newest receipt (by id, then date).
 */
export function dedupeReceiptMediaAcrossReceipts(receipts) {
  if (!Array.isArray(receipts) || receipts.length <= 1) return receipts;

  const urlOwner = new Map();

  receipts.forEach((receipt, index) => {
    if (isProtectedReceiptMedia(receipt)) return;
    const rank = receiptMediaRank(receipt);
    collectReceiptMediaUrls(receipt).forEach((url) => {
      const prev = urlOwner.get(url);
      if (
        !prev ||
        rank > prev.rank ||
        (rank === prev.rank && index > prev.index)
      ) {
        urlOwner.set(url, { rank, index });
      }
    });
  });

  return receipts.map((receipt, index) => {
    if (isProtectedReceiptMedia(receipt)) return receipt;

    const owned = collectReceiptMediaUrls(receipt).filter((url) => {
      const owner = urlOwner.get(url);
      return owner && owner.index === index;
    });

    const hadReceiptImageUrl =
      receipt.receipt_image &&
      receipt.receipt_image.toString().trim() !== "" &&
      receipt.receipt_image !== "0";

    if (owned.length === 0) {
      return { ...receipt, receipt_image: "0", emailAttachment: "0" };
    }

    const emailAttachment = buildCombinedMediaField(owned);
    const receipt_image =
      hadReceiptImageUrl && owned.length === 1 ? owned[0] : "0";

    return { ...receipt, receipt_image, emailAttachment };
  });
}
