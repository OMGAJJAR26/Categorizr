const SENSITIVE_KEY = /password|token|username|emailaddress|recoveryemail|duplicate_ereciept_email/i;

export function isSensitiveQueryKey(key) {
  return SENSITIVE_KEY.test(String(key || ""));
}

export function searchParamsHaveCredentials(params) {
  for (const key of params.keys()) {
    if (isSensitiveQueryKey(key)) return true;
  }
  return false;
}

/** Drop credential query params from the address bar without using them. */
export function stripCredentialQueryFromLocation() {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  let removed = false;
  for (const key of [...params.keys()]) {
    if (!isSensitiveQueryKey(key)) continue;
    params.delete(key);
    removed = true;
  }
  if (!removed) return;
  const qs = params.toString();
  const next = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", next);
}
