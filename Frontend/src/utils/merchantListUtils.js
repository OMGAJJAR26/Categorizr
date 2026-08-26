/**
 * Undo SQL apostrophe escaping the backend stored literally (Longo''s → Longo's).
 * The write path escapes apostrophes for the query (' → ''); when that escaped form
 * gets persisted verbatim it reads back doubled, splitting one store into "Longo''s",
 * "Longo's", "Longos". Use for the display name so lists show it correctly.
 */
export const unescapeMerchantName = (value) =>
  String(value || "").replace(/''/g, "'");

/**
 * Normalize merchant names for case-insensitive comparison / dedupe.
 * Undoes the SQL '' artifact and folds curly apostrophes to straight so the same store
 * never appears as multiple rows in one list but a single row in another.
 */
export const normalizeMerchantKey = (value) =>
  unescapeMerchantName(value)
    .replace(/[‘’]/g, "'")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();

/** Resolve store id from API record shape. */
export const getApiMerchantId = (obj) => {
  const id = obj?.id ?? obj?.store_id ?? obj?.fk_store_id ?? obj?.apiId ?? null;
  return id != null && String(id) !== "" && String(id) !== "0" ? id : null;
};

/** Find API store by exact store_name. */
export const findApiMerchantByName = (name, apiList) =>
  (apiList || []).find(
    (m) => normalizeMerchantKey(m?.store_name) === normalizeMerchantKey(name)
  );

/**
 * True when apiName extends base as a concatenated rename (Target → Targetttt),
 * not a distinct store that shares a prefix (Walmart vs Walmart AA).
 */
export const isConcatenatedApiRename = (baseName, apiName) => {
  const base = normalizeMerchantKey(baseName);
  const api = normalizeMerchantKey(apiName);
  if (!base || !api || api === base || !api.startsWith(base) || api.length <= base.length) {
    return false;
  }
  const suffix = api.slice(base.length);
  // A space after the base means a separate qualifier (e.g. "Walmart AA"), not a rename.
  return !/^\s/.test(suffix);
};

/**
 * Find API store renamed from a default/receipt name (e.g. Target → Targetttt).
 * Used when fk_store_meta_id is 0 after rename.
 */
export const findRenamedApiMerchant = (oldName, apiList) => {
  const base = normalizeMerchantKey(oldName);
  if (!base) return null;
  return (
    (apiList || []).find((m) => {
      const apiName = normalizeMerchantKey(m?.store_name);
      if (!apiName) return false;
      if (apiName === base) return true;
      return isConcatenatedApiRename(base, apiName);
    }) || null
  );
};

/**
 * True when an API store exists that is a renamed variant of this name
 * (hide stale default/receipt row — API is source of truth).
 */
export const isMerchantSupersededByApi = (name, apiList) => {
  const base = normalizeMerchantKey(name);
  if (!base) return false;
  return (apiList || []).some((m) => {
    const apiName = normalizeMerchantKey(m?.store_name);
    if (!apiName || apiName === base) return false;
    return isConcatenatedApiRename(base, apiName);
  });
};

/** Collect fk_store_meta_id values present on API stores (non-zero). */
export const getApiStoreMetaIds = (apiList) =>
  new Set(
    (apiList || [])
      .map((m) => String(m?.fk_store_meta_id ?? "").trim())
      .filter((id) => id && id !== "0")
  );

/** Client-side starter merchants shown until the user deletes them. */
export const DEFAULT_MERCHANTS_WITH_LOGOS = [
  { name: "Costco", image: "https://logo.clearbit.com/costco.com" },
  { name: "Home Depot", image: "https://logo.clearbit.com/homedepot.com" },
  { name: "Lowe's", image: "https://logo.clearbit.com/lowes.com" },
  { name: "Miscellaneous", image: "/miscellaneous-logo.png" },
  { name: "Nordstrom", image: "https://logo.clearbit.com/nordstrom.com" },
  { name: "Target", image: "https://logo.clearbit.com/target.com" },
  { name: "Walmart", image: "https://logo.clearbit.com/walmart.com" },
];

const DEFAULT_MERCHANT_KEYS = new Set(
  DEFAULT_MERCHANTS_WITH_LOGOS.map((m) => normalizeMerchantKey(m.name)).filter(Boolean)
);

export const isDefaultMerchantName = (name) =>
  DEFAULT_MERCHANT_KEYS.has(normalizeMerchantKey(name));

/** True when a starter name is not in getStorev1 (user deleted it — do not re-inject). */
export const isOrphanedDefaultMerchant = (name, apiList) => {
  if (!isDefaultMerchantName(name)) return false;
  const key = normalizeMerchantKey(name);
  return !(apiList || []).some((m) => normalizeMerchantKey(m?.store_name) === key);
};

/**
 * API stores unhide matching hidden names, except starter merchants the user
 * deleted. Those must stay hidden across login even if the store list still
 * contains them (or they are re-injected client-side).
 */
export const reconcileHiddenMerchantsWithApi = (hiddenNames, apiStoreNames) => {
  const apiKeys = new Set(
    (apiStoreNames || []).map((n) => normalizeMerchantKey(n)).filter(Boolean)
  );
  return [...new Set((hiddenNames || []).map((n) => String(n ?? "").trim()).filter(Boolean))].filter(
    (hidden) => isDefaultMerchantName(hidden) || !apiKeys.has(normalizeMerchantKey(hidden))
  );
};
