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

/** Remove one URL from a receipt's media fields (web save shape: images in emailAttachment). */
export function removeUrlFromReceiptMedia(receipt, urlToRemove) {
  const remaining = collectReceiptMediaUrls(receipt).filter(
    (u) => !mediaUrlsEqual(u, urlToRemove)
  );
  return {
    receipt_image: "0",
    emailAttachment: buildCombinedMediaField(remaining),
  };
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
  const createDate = parseInt(receipt?.create_date, 10) || 0;
  const id = parseInt(receipt?.id, 10) || 0;
  const createPart =
    Number.isFinite(createDate) && createDate >= 1_000_000 ? createDate : 0;
  const idPart = Number.isFinite(id) ? id : 0;
  // Prefer create_date (when the receipt row was created) over product_date.
  return createPart * 1e10 + idPart;
}

/**
 * iOS sets a single receiptData.emailAttachmentURL on create/update.
 * Web must send only URLs from the current upload session — never a cumulative
 * uploadmediaV1 history list and never another receipt's attachment field.
 */
export function buildSessionEmailAttachmentForApi(sources) {
  const urls = [];
  const push = (candidate) => {
    splitMediaField(candidate).forEach((url) => {
      if (url && !urls.includes(url)) urls.push(url);
    });
  };

  if (Array.isArray(sources)) {
    sources.forEach((item) => {
      if (Array.isArray(item)) item.forEach((u) => push(u));
      else push(item);
    });
  } else {
    push(sources);
  }

  if (urls.length === 0) return "0";
  return buildCombinedMediaField(urls);
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

  // Some email-ingestion flows persist the same PDF twice:
  //   1) as an email-server attachment URL (categorizr.com/emailserver/attechment_images/...)
  //   2) as the underlying stored file (storage.googleapis.com/.../mediafiles/...)
  // The web UI should prefer the stored URL and hide the proxy attachment duplicate.
  return dedupeEmailAttachmentPdfUrls(ordered);
}

/**
 * If both the email-server attachment proxy PDF and the underlying stored GCS PDF
 * exist for the same receipt, hide the proxy one.
 *
 * This doesn't try to prove "same content"; it implements a safe preference rule:
 * when we can display the GCS-backed file, the UI should not show an additional
 * emailserver proxy copy alongside it.
 */
export function dedupeEmailAttachmentPdfUrls(urls) {
  if (!Array.isArray(urls) || urls.length === 0) return urls;

  const hasGcsStoredPdf = urls.some(
    (u) =>
      isPdfUrl(u) &&
      /storage\.googleapis\.com\/.*\/mediafiles\//i.test(u) &&
      /shared/gi.test(u) === false // keep this matcher narrow; ignore unrelated google storage URLs
  );

  if (!hasGcsStoredPdf) return urls;

  const filtered = urls.filter((u) => {
    if (!isPdfUrl(u)) return true;
    return !/\/emailserver\/(?:attechment_images|attachment_images)\//i.test(u);
  });

  // If filtering would remove everything, fall back to the original list.
  return filtered.length > 0 ? filtered : urls;
}

/**
 * When uploadmediaV1 pollutes older receipts, the same CDN URL can appear on
 * multiple receipts. Assign each URL to the newest receipt (by id, then date).
 */
/** Stable key for comparing a receipt's media fields before/after dedupe. */
export function receiptMediaStorageKey(receipt) {
  if (!receipt) return "";
  const attachment = buildCombinedMediaField(collectReceiptMediaUrls(receipt));
  const image =
    receipt.receipt_image &&
    receipt.receipt_image.toString().trim() !== "" &&
    receipt.receipt_image !== "0"
      ? normalizeMediaUrl(receipt.receipt_image)
      : "0";
  return `${attachment}|${image}`;
}

/**
 * After cross-receipt dedupe, return the emailAttachment / receipt_image values
 * that should be sent to updateReceiptv1 for one receipt.
 */
export function resolveReceiptMediaFieldsForApi(receiptId, updates, allReceipts) {
  if (!receiptId || !Array.isArray(allReceipts)) {
    return { emailAttachment: "0", receipt_image: "0" };
  }

  const idStr = receiptId.toString();
  const mergedList = allReceipts.map((r) =>
    r?.id?.toString() === idStr ? { ...r, ...(updates || {}) } : r
  );
  const deduped = dedupeReceiptMediaAcrossReceipts(mergedList);
  const row = deduped.find((r) => r?.id?.toString() === idStr);

  if (!row) {
    return { emailAttachment: "0", receipt_image: "0" };
  }

  return {
    emailAttachment: row.emailAttachment ?? "0",
    receipt_image: row.receipt_image ?? "0",
  };
}

export function dedupeReceiptMediaAcrossReceipts(receipts) {
  if (!Array.isArray(receipts) || receipts.length <= 1) return receipts;

  const urlOwner = new Map();
  // url → all receipt indices and create_dates that have it
  const urlAllIndices = new Map();

  receipts.forEach((receipt, index) => {
    const rank = receiptMediaRank(receipt);
    collectReceiptMediaUrls(receipt).forEach((url) => {
      const prev = urlOwner.get(url);
      if (
        !prev ||
        rank > prev.rank ||
        (rank === prev.rank && index > prev.index)
      ) {
        urlOwner.set(url, { rank, index, createDate: parseInt(receipt?.create_date, 10) || 0 });
      }
      if (!urlAllIndices.has(url)) urlAllIndices.set(url, []);
      urlAllIndices.get(url).push({ index, createDate: parseInt(receipt?.create_date, 10) || 0 });
    });
  });

  return receipts.map((receipt, index) => {
    const receiptCreateDate = parseInt(receipt?.create_date, 10) || 0;
    const owned = collectReceiptMediaUrls(receipt).filter((url) => {
      const owner = urlOwner.get(url);
      if (!owner) return false;
      if (owner.index === index) return true;
      // Receipts created within 60 seconds of each other are likely intentional splits
      // sharing the same image — allow them to all keep the URL.
      if (receiptCreateDate > 0 && owner.createDate > 0 &&
          Math.abs(receiptCreateDate - owner.createDate) <= 60) {
        return true;
      }
      return false;
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
