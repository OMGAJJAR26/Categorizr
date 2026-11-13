import { lazy } from "react";

const RELOAD_KEY = "cat_chunk_reload_at";
const RELOAD_COOLDOWN_MS = 30000;

const defaultStorage = () => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

// A tab left open across a deploy still points at chunk files that no longer exist
// (the SPA rewrite answers with index.html), so the dynamic import fails. Reload once
// to pick up the new build. The cooldown prevents a reload loop if it keeps failing,
// and nothing is reloaded while offline or when sessionStorage is unavailable.
export function importWithReload(factory, env = {}) {
  const {
    reload = () => window.location.reload(),
    storage = defaultStorage(),
    isOnline = () => typeof navigator === "undefined" || navigator.onLine !== false,
    now = Date.now,
  } = env;

  return factory().catch((err) => {
    try {
      if (!storage || !isOnline()) throw err;
      const last = Number(storage.getItem(RELOAD_KEY) || 0);
      if (now() - last < RELOAD_COOLDOWN_MS) throw err;
      storage.setItem(RELOAD_KEY, String(now()));
    } catch {
      throw err;
    }
    reload();
    // Keep Suspense on its fallback while the page reloads.
    return new Promise(() => {});
  });
}

export const lazyWithReload = (factory) => lazy(() => importWithReload(factory));
