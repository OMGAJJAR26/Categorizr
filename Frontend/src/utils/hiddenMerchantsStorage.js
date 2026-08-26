import { normalizeMerchantKey } from "./merchantListUtils.js";

export const HIDDEN_MERCHANTS_LEGACY_KEY = "cat_hidden_merchants";
export const HIDDEN_MERCHANTS_KEY_PREFIX = "cat_hidden_merchants_";

const getDefaultStorage = () => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export const hiddenMerchantsKeyForUser = (userId) => {
  const id = String(userId || "").trim();
  return id ? `${HIDDEN_MERCHANTS_KEY_PREFIX}${id}` : HIDDEN_MERCHANTS_LEGACY_KEY;
};

export const getStoredUserId = (storage = getDefaultStorage()) => {
  try {
    return String(storage?.getItem("fk_user_id") || storage?.getItem("id") || "").trim();
  } catch {
    return "";
  }
};

const readNameList = (storage, key) => {
  try {
    const parsed = JSON.parse(storage?.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.map((n) => String(n ?? "").trim()).filter(Boolean);
  } catch {
    return [];
  }
};

/**
 * Load this user's deleted/hidden merchants. Merges the legacy unscoped key so
 * in-session deletions survive the first deploy, then copies the union into the
 * user-scoped key (the one logout preserves).
 */
export const loadHiddenMerchantNames = (userId, storage = getDefaultStorage()) => {
  if (!storage) return [];
  const scopedKey = userId ? hiddenMerchantsKeyForUser(userId) : HIDDEN_MERCHANTS_LEGACY_KEY;
  const hasScopedRecord = Boolean(userId && storage.getItem(hiddenMerchantsKeyForUser(userId)) != null);
  const scoped = userId ? readNameList(storage, hiddenMerchantsKeyForUser(userId)) : [];
  // Only merge the unscoped key when this user has no scoped record yet.
  // Otherwise a leftover legacy list would resurrect merchants after unhide.
  const legacy = hasScopedRecord ? [] : readNameList(storage, HIDDEN_MERCHANTS_LEGACY_KEY);
  const merged = [];
  const seen = new Set();
  for (const name of [...scoped, ...legacy]) {
    const key = normalizeMerchantKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    merged.push(name);
  }
  if (userId) {
    try {
      storage.setItem(scopedKey, JSON.stringify(merged));
      if (legacy.length || hasScopedRecord) {
        storage.removeItem(HIDDEN_MERCHANTS_LEGACY_KEY);
      }
    } catch {
      /* noop */
    }
  }
  return merged;
};

export const saveHiddenMerchantNames = (userId, names, storage = getDefaultStorage()) => {
  const unique = [];
  const seen = new Set();
  for (const name of names || []) {
    const trimmed = String(name ?? "").trim();
    const key = normalizeMerchantKey(trimmed);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(trimmed);
  }
  if (!storage) return unique;
  try {
    storage.setItem(hiddenMerchantsKeyForUser(userId), JSON.stringify(unique));
    if (userId) storage.removeItem(HIDDEN_MERCHANTS_LEGACY_KEY);
  } catch {
    /* noop */
  }
  return unique;
};

export const addHiddenMerchantName = (userId, currentNames, name, storage = getDefaultStorage()) => {
  const trimmed = String(name ?? "").trim();
  const next = new Set(
    [...(currentNames || [])].map((n) => String(n ?? "").trim()).filter(Boolean)
  );
  if (trimmed) next.add(trimmed);
  saveHiddenMerchantNames(userId, [...next], storage);
  return next;
};

export const removeHiddenMerchantName = (userId, currentNames, name, storage = getDefaultStorage()) => {
  const key = normalizeMerchantKey(name);
  const next = new Set(
    [...(currentNames || [])]
      .map((n) => String(n ?? "").trim())
      .filter((n) => n && normalizeMerchantKey(n) !== key)
  );
  saveHiddenMerchantNames(userId, [...next], storage);
  return next;
};
