// Keys / key-prefixes that must SURVIVE logout and session-expiry.
//
// These hold per-user state that should persist across sign-ins on the same
// device. Wiping them on logout is what caused the "N new eReceipts" banner to
// re-appear on every login: the "already seen" set was cleared, so previously
// seen forwarded receipts were treated as new again.
//
// - cat_locally_forwarded    : receipts this device forwarded (keeps the badge)
// - cat_seen_forwards_<uid>  : forwarded receipts already notified to the user
// - cat_synced_forwards_<uid>: forwarded receipts whose data was already synced
const PRESERVED_LOCALSTORAGE_PREFIXES = [
  "cat_locally_forwarded",
  "cat_seen_forwards_",
  "cat_synced_forwards_",
];

/**
 * Clear localStorage on logout / session-expiry WITHOUT resetting the durable
 * per-user notification/sync tracking above. Use this everywhere a logout wipes
 * storage so the "new eReceipts" banner only shows for genuinely new receipts.
 */
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
    // If anything goes wrong, fall back to a plain clear so logout still works.
    try {
      localStorage.clear();
    } catch {
      /* noop */
    }
  }
};
