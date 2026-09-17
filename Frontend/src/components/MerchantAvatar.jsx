import { useState } from "react";
import { proxyImageUrl, unproxyImageUrl } from "../api/Axios";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Returns true for any URL we can try to display (http or data URI). */
const isValidUrl = (u) => {
  if (!u || typeof u !== "string") return false;
  const s = u.trim();
  return /^https?:\/\//i.test(s) || s.startsWith("data:image");
};

// ─── Miscellaneous "M" badge ─────────────────────────────────────────────────
const MiscellaneousAvatar = ({ className }) => (
  <img
    src="/miscellaneous-logo.png"
    alt="Miscellaneous logo"
    className={`${className} rounded object-contain`}
    aria-label="Miscellaneous"
    title="Miscellaneous"
  />
);

// ─── component ──────────────────────────────────────────────────────────────

const MerchantAvatar = ({ name, explicitUrl, className = "w-6 h-6" }) => {
  // Special badge for Miscellaneous merchant
  if (name?.toString().trim().toLowerCase() === "miscellaneous") {
    return <MiscellaneousAvatar className={className} />;
  }

  // Track a failed proxied URL so we can fall back to the direct URL once, for a
  // REAL logo whose image proxy returns 500.
  const [failedUrls, setFailedUrls] = useState(new Set());

  // Only ever show a REAL, stored logo — the receipt's store_image, which is
  // filled from the verified merchant record (see DataContext). We deliberately
  // do NOT guess a logo from a web image search anymore: for uncommon merchants
  // that returned the wrong picture (e.g. a Bandcamp album cover for "Sweet
  // Distractions"), the guess differed device-to-device, and it was inconsistent
  // with the iOS app. No stored logo ⇒ letter avatar, matching iOS.
  const safeExplicit = explicitUrl ? unproxyImageUrl(explicitUrl) : null;
  // Reject localhost URLs — they only work in local dev, not on staging/prod.
  const validExplicit =
    isValidUrl(safeExplicit) && !/localhost|127\.0\.0\.1/i.test(safeExplicit);

  const rawSrc = validExplicit ? safeExplicit : null;
  const proxiedSrc = rawSrc ? proxyImageUrl(rawSrc) : null;
  const directSrc = rawSrc && rawSrc !== proxiedSrc ? rawSrc : null;

  // proxied → direct (skip any URL that already failed this render cycle)
  const finalDisplay =
    (proxiedSrc && !failedUrls.has(proxiedSrc) ? proxiedSrc : null) ??
    (directSrc && !failedUrls.has(directSrc) ? directSrc : null);

  const firstLetter = name?.toString().trim().charAt(0)?.toUpperCase?.() || "?";

  // No real logo → letter avatar (same as iOS; no web-guessed image).
  if (!finalDisplay) {
    return (
      <div
        className={`${className} rounded bg-gray-300 text-gray-700 flex items-center justify-center text-xs font-bold`}
        aria-label={`${name} Merchant`}
        title={`${name} Merchant`}
      >
        {firstLetter}
      </div>
    );
  }

  return (
    <img
      key={finalDisplay}        // force remount when URL changes → clears browser error state
      src={finalDisplay}
      alt={`${name} logo`}
      className={`${className} rounded object-contain`}
      loading="lazy"
      onError={() => setFailedUrls((prev) => new Set([...prev, finalDisplay]))}
    />
  );
};

export default MerchantAvatar;
