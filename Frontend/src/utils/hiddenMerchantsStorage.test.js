import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { PRESERVED_LOCALSTORAGE_PREFIXES } from "./authStorage.js";
import {
  DEFAULT_MERCHANTS_WITH_LOGOS,
  isDefaultMerchantName,
  reconcileHiddenMerchantsWithApi,
} from "./merchantListUtils.js";
import {
  HIDDEN_MERCHANTS_KEY_PREFIX,
  HIDDEN_MERCHANTS_LEGACY_KEY,
  addHiddenMerchantName,
  getStoredUserId,
  hiddenMerchantsKeyForUser,
  loadHiddenMerchantNames,
  removeHiddenMerchantName,
  saveHiddenMerchantNames,
} from "./hiddenMerchantsStorage.js";

class MemoryStorage {
  constructor(init = {}) {
    this.store = { ...init };
  }
  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key) ? this.store[key] : null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
  key(i) {
    return Object.keys(this.store)[i] ?? null;
  }
  get length() {
    return Object.keys(this.store).length;
  }
}

const PRESERVED_PREFIXES = PRESERVED_LOCALSTORAGE_PREFIXES;

/** Mirror of clearAuthLocalStorage so we can test logout without a browser. */
const simulateLogout = (storage) => {
  const preserved = {};
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key && PRESERVED_PREFIXES.some((prefix) => key.startsWith(prefix))) {
      preserved[key] = storage.getItem(key);
    }
  }
  storage.clear();
  for (const [key, value] of Object.entries(preserved)) {
    if (value != null) storage.setItem(key, value);
  }
};

const visibleDefaultMerchantNames = (hiddenNames) =>
  DEFAULT_MERCHANTS_WITH_LOGOS.map((m) => m.name).filter(
    (name) =>
      name &&
      !hiddenNames.some((h) => String(h).trim().toLowerCase() === name.toLowerCase())
  );

describe("hidden default merchants survive logout", () => {
  let storage;

  beforeEach(() => {
    storage = new MemoryStorage({
      fk_user_id: "42",
      token: "abc",
      cat_theme: "light",
    });
  });

  it("keys hidden merchants per user", () => {
    assert.equal(hiddenMerchantsKeyForUser("42"), `${HIDDEN_MERCHANTS_KEY_PREFIX}42`);
    assert.equal(hiddenMerchantsKeyForUser(""), HIDDEN_MERCHANTS_LEGACY_KEY);
    assert.equal(getStoredUserId(storage), "42");
  });

  it("does not re-inject Home Depot after delete + logout + login", () => {
    const afterDelete = addHiddenMerchantName("42", [], "Home Depot", storage);
    assert.ok([...afterDelete].includes("Home Depot"));

    storage.setItem("token", "abc");
    storage.setItem("fk_user_id", "42");
    simulateLogout(storage);

    assert.equal(storage.getItem("token"), null);
    assert.equal(storage.getItem("fk_user_id"), null);
    assert.ok(storage.getItem(hiddenMerchantsKeyForUser("42")));

    storage.setItem("fk_user_id", "42");
    storage.setItem("token", "new-token");
    const restored = loadHiddenMerchantNames("42", storage);
    assert.deepEqual(restored, ["Home Depot"]);

    const visible = visibleDefaultMerchantNames(restored);
    assert.ok(!visible.includes("Home Depot"));
    assert.ok(visible.includes("Costco"));
    assert.ok(visible.includes("Walmart"));
  });

  it("migrates the legacy unscoped key into the user-scoped key", () => {
    storage.setItem(HIDDEN_MERCHANTS_LEGACY_KEY, JSON.stringify(["Home Depot", "Target"]));
    const loaded = loadHiddenMerchantNames("42", storage);
    assert.deepEqual(loaded.sort(), ["Home Depot", "Target"]);
    assert.equal(
      storage.getItem(hiddenMerchantsKeyForUser("42")),
      JSON.stringify(["Home Depot", "Target"])
    );
    assert.equal(storage.getItem(HIDDEN_MERCHANTS_LEGACY_KEY), null);

    simulateLogout(storage);
    storage.setItem("fk_user_id", "42");
    assert.deepEqual(loadHiddenMerchantNames("42", storage).sort(), ["Home Depot", "Target"]);
  });

  it("does not leak User A's deletions onto User B", () => {
    addHiddenMerchantName("42", [], "Home Depot", storage);
    simulateLogout(storage);
    storage.setItem("fk_user_id", "99");
    const userB = loadHiddenMerchantNames("99", storage);
    assert.deepEqual(userB, []);
    assert.ok(visibleDefaultMerchantNames(userB).includes("Home Depot"));
  });

  it("keeps deleted defaults hidden even if the API still returns them", () => {
    const kept = reconcileHiddenMerchantsWithApi(
      ["Home Depot", "Custom Shop"],
      ["Home Depot", "Custom Shop", "Costco"]
    );
    assert.ok(kept.includes("Home Depot"));
    assert.ok(!kept.includes("Custom Shop"));
  });

  it("unhides a default when the user explicitly adds it back", () => {
    const hidden = addHiddenMerchantName("42", [], "Home Depot", storage);
    const next = removeHiddenMerchantName("42", hidden, "Home Depot", storage);
    assert.ok(!next.has("Home Depot"));
    assert.ok(visibleDefaultMerchantNames([...next]).includes("Home Depot"));
  });

  it("identifies starter merchants including Home Depot", () => {
    assert.equal(isDefaultMerchantName("Home Depot"), true);
    assert.equal(isDefaultMerchantName("home depot"), true);
    assert.equal(isDefaultMerchantName("Custom Shop"), false);
  });

  it("save/load round-trips unique trimmed names", () => {
    saveHiddenMerchantNames("42", [" Home Depot ", "Home Depot", "Target"], storage);
    assert.deepEqual(loadHiddenMerchantNames("42", storage), ["Home Depot", "Target"]);
  });
});
