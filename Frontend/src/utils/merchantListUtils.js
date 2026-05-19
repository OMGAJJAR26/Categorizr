/** Normalize merchant names for case-insensitive comparison. */
export const normalizeMerchantKey = (value) =>
  String(value || "")
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
      return apiName.startsWith(base) && apiName.length > base.length;
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
    return apiName.startsWith(base) && apiName.length > base.length;
  });
};

/** Collect fk_store_meta_id values present on API stores (non-zero). */
export const getApiStoreMetaIds = (apiList) =>
  new Set(
    (apiList || [])
      .map((m) => String(m?.fk_store_meta_id ?? "").trim())
      .filter((id) => id && id !== "0")
  );
