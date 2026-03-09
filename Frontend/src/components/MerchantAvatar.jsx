import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const normalizeKey = (name = "") =>
  name
    .toString()
    .trim()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, " ")
    .toLowerCase();

const merchantKey = (name) => `merchantLogo:${normalizeKey(name)}`;

const isValidUrl = (u) => {
  if (!u || typeof u !== "string") return false;
  const s = u.trim();
  return /^https?:\/\//i.test(s) || s.startsWith("data:image");
};

const getCachedMerchantLogo = (name) => {
  try {
    return localStorage.getItem(merchantKey(name)) || null;
  } catch {
    return null;
  }
};

const MerchantAvatar = ({ name, explicitUrl, className = "w-6 h-6", storename }) => {
  const [failed, setFailed] = useState(false);
  const [apiUrl, setApiUrl] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // Check if explicitUrl is valid (not 0, null, undefined, etc.)
  const validExplicit = isValidUrl(explicitUrl);
  const cached = getCachedMerchantLogo(name);
  const failedCached = cached === "failed";
  const validCached = isValidUrl(cached);

  const src = validExplicit ? explicitUrl : validCached ? cached : apiUrl;
  const firstLetter = name?.toString().trim().charAt(0)?.toUpperCase?.() || "?";

  useEffect(() => {
    let cancelled = false;

    // Only fetch if we don't have a valid explicit URL, no cache, and we have a name
    const shouldFetch = !validExplicit && !validCached && !failedCached && !!name;

    if (!shouldFetch) return;

    const run = async () => {
      try {
        const queries = [
          name,
          `${name} logo`,
          name.replace(/\s+/g, "+"),
          name.replace(/\s+/g, ""),
        ];

        const pickUrl = (d) => {
          if (!d) return null;

          // Handle the specific array response format from imagesearch API
          if (Array.isArray(d) && d.length > 0) {
            // Get the first object from the array
            const firstItem = d[0];
            if (firstItem && typeof firstItem === "object") {
              // Extract the fullurl from the first object
              const fullUrl = firstItem.fullurl;
              if (isValidUrl(fullUrl)) {
                return fullUrl;
              }
            }

            // Fallback: if first object fullurl is not valid, try other objects
            for (const item of d) {
              if (item && typeof item === "object") {
                // Try fullurl first, then other URL properties
                const url =
                  item.fullurl ||
                  item.url ||
                  item.image ||
                  item.src ||
                  item.link ||
                  item.thumburl;
                if (isValidUrl(url)) {
                  return url;
                }
              }
            }
            return null;
          }

          // Handle object response (fallback for other response formats)
          if (typeof d === "object") {
            const arr = d.images || d.results || d.data || d.items || [];
            if (Array.isArray(arr) && arr.length > 0) {
              const firstItem = arr[0];
              if (firstItem && typeof firstItem === "object") {
                const url =
                  firstItem.fullurl ||
                  firstItem.url ||
                  firstItem.image ||
                  firstItem.src ||
                  firstItem.link;
                if (isValidUrl(url)) return url;
              }
            }

            // Check direct properties
            const directUrl = d.url || d.image || d.src || d.link || d.fullurl;
            if (isValidUrl(directUrl)) return directUrl;
          }

          return null;
        };

        let found = null;

        for (const qRaw of queries) {
          if (cancelled) break;
          const queryWithLogo = `${qRaw} logo`;
          const q = encodeURIComponent(queryWithLogo);
          try {
            // Use the proxied endpoint to avoid CORS
            const resp = await fetch(`/imagesearch?searchkeyword=${q}`, {
              method: "GET",
              headers: {
                Accept: "application/json",
              },
            });

            if (!resp.ok) {
              continue;
            }

            let data;
            const contentType = resp.headers.get("content-type");

            if (contentType && contentType.includes("application/json")) {
              data = await resp.json();
            } else {
              const text = await resp.text();
              try {
                data = JSON.parse(text);
              } catch {
                // If it's not JSON, try to extract URL from text
                const urlMatch = text.match(
                  /(https?:\/\/[^\s"']+\.(jpg|jpeg|png|gif|webp))/i
                );
                if (urlMatch) {
                  data = urlMatch[1];
                } else {
                  continue;
                }
              }
            }

            const candidate = pickUrl(data);
            if (isValidUrl(candidate)) {
              found = candidate;
              break;
            }
          } catch (error) {
            continue;
          }
        }

        if (!cancelled && isValidUrl(found)) {
          setApiUrl(found);
          try {
            localStorage.setItem(merchantKey(name), found);
          } catch (storageError) {
            // Silent fail for storage errors
          }
        }
      } catch (error) {
        // Silent fail for image search errors
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [validExplicit, validCached, failedCached, cached, name]);

  // Fallback to Clearbit if no image found
  const buildClearbitUrl = (name) => {
    if (!name) return null;
    const domain = name.toString().replace(/\s+/g, "").toLowerCase();
    if (!domain) return null;
    return `https://logo.clearbit.com/${domain}.com`;
  };

  const clearbitUrl = buildClearbitUrl(name);
  const finalSrc = src || clearbitUrl;

  // Show loader while image is loading
  if (isLoading) {
    return (
      <div
        className={`${className} rounded bg-gray-100 flex items-center justify-center`}
        aria-label={`Loading ${name} logo`}
      >
        <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!finalSrc || failed) {
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
      src={finalSrc}
      alt={`${name} Merchant`}
      className={`${className} rounded object-contain`}
      loading="lazy"
      onLoadStart={() => setIsLoading(true)}
      onError={() => {
        setIsLoading(false);
        setFailed(true);
        // If Clearbit fails, don't try again
        if (finalSrc === clearbitUrl) {
          try {
            localStorage.setItem(merchantKey(name), "failed");
          } catch {}
        }
      }}
      onLoad={() => {
        setIsLoading(false);
        try {
          if (name && finalSrc && finalSrc !== clearbitUrl) {
            localStorage.setItem(merchantKey(name), finalSrc);
          }
        } catch {}
      }}
    />
  );
};

export default MerchantAvatar;
