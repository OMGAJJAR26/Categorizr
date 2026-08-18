// Keys / key-prefixes that must SURVIVE logout and session-expiry.
const PRESERVED_LOCALSTORAGE_PREFIXES = [
  "cat_locally_forwarded",
  "cat_seen_forwards_",
  "cat_synced_forwards_",
  "qbLinkedReceipts",
];

export const clearAuthLocalStorage = () => {
  try {
    const preserved = {};
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (
        key &&
        PRESERVED_LOCALSTORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
      ) {
        preserved[key] = localStorage.getItem(key);
      }
    }
    localStorage.clear();
    for (const [key, value] of Object.entries(preserved)) {
      if (value != null) localStorage.setItem(key, value);
    }
  } catch {
    try {
      localStorage.clear();
    } catch {
      /* noop */
    }
  }
};
