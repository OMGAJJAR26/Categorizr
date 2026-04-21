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
    return unproxyImageUrl(val); // strip proxy prefix for old cached entries
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
  // Track whether the *current* display URL failed so we can fall back
  const [failedUrl, setFailedUrl] = useState(null);

  const rawCachedVal = getRawCached(name);
  const failedCached = rawCachedVal === "failed";
  const rawCached = !failedCached && isValidUrl(rawCachedVal) ? rawCachedVal : null;

  const validExplicit = isValidUrl(explicitUrl);

  // Choose raw source (priority: explicit > cached > api-fetched)
  const rawSrc = validExplicit ? explicitUrl : rawCached ?? rawApiUrl;

  // Proxied URL for the <img> element
  const displaySrc = rawSrc ? proxyImageUrl(rawSrc) : null;

  // Clearbit fallback (also proxied)
  const clearbitRaw = buildClearbitUrl(name);
  const clearbitDisplay = clearbitRaw ? proxyImageUrl(clearbitRaw) : null;

  const finalDisplay = displaySrc || clearbitDisplay;

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
  const hasFailed = finalDisplay && failedUrl === finalDisplay;

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

  if (!finalDisplay || hasFailed) {
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
        setFailedUrl(finalDisplay);

        if (displaySrc && displaySrc === finalDisplay) {
          // The primary URL (cached or api-fetched) failed — clear cache so
          // the component can attempt a fresh API fetch on next render.
          if (rawCached) clearCached(name);
          if (rawApiUrl) setRawApiUrl(null);
        } else {
          // Clearbit also failed — mark as permanently failed
          try { localStorage.setItem(merchantKey(name), "failed"); } catch {}
        }
      }}
      onLoad={() => {
        setIsLoading(false);
        // Persist the raw URL so future renders don't re-fetch
        if (rawSrc && rawSrc !== clearbitRaw) {
          setRawCached(name, rawSrc);
        }
      }}
    />
  );
};

export default MerchantAvatar;
