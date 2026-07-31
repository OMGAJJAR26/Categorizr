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
