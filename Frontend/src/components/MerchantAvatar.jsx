import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { proxyImageUrl, unproxyImageUrl } from "../api/Axios";

// ─── helpers ────────────────────────────────────────────────────────────────

const normalizeKey = (name = "") =>
  name
    .toString()
    .trim()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();

const merchantKey = (name) => `merchantLogo:${normalizeKey(name)}`;
const SHELL_LOGO_URL = "https://logo.clearbit.com/shell.com";

/** Returns true for any URL we can try to display (http or data URI). */
const isValidUrl = (u) => {
  if (!u || typeof u !== "string") return false;
  const s = u.trim();
  return /^https?:\/\//i.test(s) || s.startsWith("data:image");
};

/**
 * Read the RAW (unproxied) URL from localStorage.
 * Returns the raw URL string, "failed" sentinel, or null.
 * Old entries may already contain a proxy URL — unwrap them so we always
 * store and compare raw URLs.
 */
const getRawCached = (name) => {
  try {
    const val = localStorage.getItem(merchantKey(name));
    if (!val) return null;
    if (val === "failed") return "failed";
    const raw = unproxyImageUrl(val); // strip proxy prefix for old cached entries
    // Evict any localhost URL that was cached during local dev — useless on staging/prod
    if (/localhost|127\.0\.0\.1/i.test(raw)) {
      localStorage.removeItem(merchantKey(name));
      return null;
    }
    return raw;
  } catch {
    return null;
  }
};

/** Persist a raw URL to localStorage (never store proxy URLs). */
const setRawCached = (name, rawUrl) => {
  try {
    if (!name) return;
    const raw = unproxyImageUrl(rawUrl); // defensive: strip proxy if present
    localStorage.setItem(merchantKey(name), raw);
  } catch {
    // Ignore storage errors
  }
};

const clearCached = (name) => {
  try { localStorage.removeItem(merchantKey(name)); } catch { /* noop */ }
};

const buildClearbitUrl = (name) => {
  if (!name) return null;
  const normalized = normalizeKey(name);
  if (normalized.includes("shell")) return SHELL_LOGO_URL;
  const domain = name.toString().replace(/\s+/g, "").toLowerCase();
  return domain ? `https://logo.clearbit.com/${domain}.com` : null;
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
  // Raw API-fetched URL (no proxy prefix)
  const [rawApiUrl, setRawApiUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  // Track which display URLs have failed so we can walk down the fallback chain
  const [failedUrls, setFailedUrls] = useState(new Set());

  const rawCachedVal = getRawCached(name);
  const failedCached = rawCachedVal === "failed";
  const rawCached = !failedCached && isValidUrl(rawCachedVal) ? rawCachedVal : null;

  // Strip any proxy wrapper from the passed-in URL so stored localhost:port
  // proxy URLs (saved during local dev) degrade gracefully on staging.
  const safeExplicit = explicitUrl ? unproxyImageUrl(explicitUrl) : null;
  // Reject localhost URLs — they only work in local dev, not on staging/production
  const validExplicit =
    isValidUrl(safeExplicit) &&
    !/localhost|127\.0\.0\.1/i.test(safeExplicit);

  // Choose raw source (priority: explicit > cached > api-fetched)
  const rawSrc = validExplicit ? safeExplicit : rawCached ?? rawApiUrl;

  // Proxied URL for the <img> element
  const proxiedSrc = rawSrc ? proxyImageUrl(rawSrc) : null;
  // Direct (un-proxied) URL as secondary fallback for when the proxy returns 500
  const directSrc = rawSrc && rawSrc !== proxiedSrc ? rawSrc : null;

  // Clearbit fallback (also proxied)
  const clearbitRaw = buildClearbitUrl(name);
  const clearbitDisplay = clearbitRaw ? proxyImageUrl(clearbitRaw) : null;

  // Walk the fallback chain: proxied → direct → clearbit
  // Skip any URL that has already failed this render cycle.
  const displaySrc =
    (proxiedSrc && !failedUrls.has(proxiedSrc) ? proxiedSrc : null) ??
    (directSrc && !failedUrls.has(directSrc) ? directSrc : null) ??
    (clearbitDisplay && !failedUrls.has(clearbitDisplay) ? clearbitDisplay : null);

  const finalDisplay = displaySrc;

  // ── Fetch from API when no explicit URL and no valid cache ──────────────
  useEffect(() => {
    if (validExplicit || rawCached || failedCached || !name) return;

    let cancelled = false;
    setIsLoading(true);

    const queries = [
      name,
      `${name} logo`,
      name.replace(/\s+/g, "+"),
      name.replace(/\s+/g, ""),
    ];

    const pickRawUrl = (d) => {
      if (!d) return null;
      if (Array.isArray(d)) {
        for (const item of d) {
          if (!item || typeof item !== "object") continue;
          const u = item.fullurl || item.url || item.image || item.src || item.link || item.thumburl;
          if (u && /^https?:\/\//i.test(u)) return u; // return raw
        }
        return null;
      }
      if (typeof d === "object") {
        const arr = d.images || d.results || d.data || d.items || [];
        for (const item of arr) {
          if (!item || typeof item !== "object") continue;
          const u = item.fullurl || item.url || item.image || item.src || item.link;
          if (u && /^https?:\/\//i.test(u)) return u;
        }
        const direct = d.url || d.image || d.src || d.link || d.fullurl;
        if (direct && /^https?:\/\//i.test(direct)) return direct;
      }
      return null;
    };

    const run = async () => {
      for (const qRaw of queries) {
        if (cancelled) break;
        try {
          const q = encodeURIComponent(`${qRaw} logo`);
          const resp = await fetch(`/imagesearch?searchkeyword=${q}`, {
            headers: { Accept: "application/json" },
          });
          if (!resp.ok) continue;

          let data;
          const ct = resp.headers.get("content-type") || "";
          if (ct.includes("application/json")) {
            data = await resp.json();
          } else {
            const text = await resp.text();
            try { data = JSON.parse(text); } catch {
              const m = text.match(/(https?:\/\/[^\s"']+\.(jpg|jpeg|png|gif|webp))/i);
              if (m) data = [{ fullurl: m[1] }];
            }
          }

          const raw = pickRawUrl(data);
          if (raw) {
            if (!cancelled) {
              setRawApiUrl(raw);
              setRawCached(name, raw);
            }
            break;
          }
        } catch {
          continue;
        }
      }

      if (!cancelled) setIsLoading(false);
    };

    run();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, validExplicit, rawCached, failedCached]);

  // ── Derived state ─────────────────────────────────────────────────────────
  const firstLetter = name?.toString().trim().charAt(0)?.toUpperCase?.() || "?";
  // All candidates have been exhausted when every option is in failedUrls
  const allFailed =
    (!proxiedSrc || failedUrls.has(proxiedSrc)) &&
    (!directSrc || failedUrls.has(directSrc)) &&
    (!clearbitDisplay || failedUrls.has(clearbitDisplay));

  // ── Render ────────────────────────────────────────────────────────────────
  if (isLoading && !finalDisplay) {
    return (
      <div
        className={`${className} rounded bg-gray-100 flex items-center justify-center`}
        aria-label={`Loading ${name} logo`}
      >
        <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!finalDisplay || allFailed) {
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
      onError={() => {
        setIsLoading(false);
        // Add this URL to the failed set so the component falls to the next candidate
        setFailedUrls((prev) => new Set([...prev, finalDisplay]));

        if (finalDisplay === proxiedSrc) {
          // Proxied primary failed — clear cache so we don't cache a bad URL
          if (rawCached) clearCached(name);
          if (rawApiUrl) setRawApiUrl(null);
        } else if (finalDisplay === clearbitDisplay) {
          // Clearbit also failed — mark permanently failed
          try { localStorage.setItem(merchantKey(name), "failed"); } catch {}
        }
        // directSrc or intermediate failures just flow to the next candidate via failedUrls
      }}
      onLoad={() => {
        setIsLoading(false);
        // Persist the raw URL that worked so future renders skip the proxy/fallback dance
        if (rawSrc && rawSrc !== clearbitRaw) {
          setRawCached(name, rawSrc);
        }
      }}
    />
  );
};

export default MerchantAvatar;
