const LEGACY_KEY = "qbLinkedReceipts";
const KEY_PREFIX = "qbLinkedReceipts_";

export const getFkUserId = () =>
  String(localStorage.getItem("fk_user_id") || localStorage.getItem("id") || "").trim();

export const qbLinkedStorageKey = (userId) => {
  const id = String(userId || getFkUserId());
  return id ? `${KEY_PREFIX}${id}` : LEGACY_KEY;
};

export const loadQbLinkedReceipts = (userId) => {
  try {
    const keyed = JSON.parse(localStorage.getItem(qbLinkedStorageKey(userId)) || "[]");
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) || "[]");
    return [
      ...new Set(
        [...(Array.isArray(keyed) ? keyed : []), ...(Array.isArray(legacy) ? legacy : [])].map(
          (id) => String(id)
        )
      ),
    ];
  } catch {
    return [];
  }
};

export const saveQbLinkedReceipts = (ids, userId) => {
  const unique = [...new Set((ids || []).map((id) => String(id)).filter(Boolean))];
  try {
    localStorage.setItem(qbLinkedStorageKey(userId), JSON.stringify(unique));
    localStorage.setItem(LEGACY_KEY, JSON.stringify(unique));
  } catch {
    /* ignore quota / private mode */
  }
  return unique;
};

export const addQbLinkedReceipt = (receiptId, userId) => {
  if (receiptId == null || receiptId === "") return loadQbLinkedReceipts(userId);
  return saveQbLinkedReceipts([...loadQbLinkedReceipts(userId), String(receiptId)], userId);
};

export const clearQbLinkedReceipts = (userId) => saveQbLinkedReceipts([], userId);
