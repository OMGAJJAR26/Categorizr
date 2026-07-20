import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { PHP_API_BASE } from "../api/Axios";
import { getPaymentDisplayFromReceipt } from "../hooks/usePaymentDisplay";
import {
  parseExpenseCategoryApiResponse,
  getExpenseCategoryNamesFromApi,
  getExpenseCategoryRecordName,
  getReceiptExpenseType,
  buildExpenseCategoryOptions,
  normalizeExpenseCategoryApiItem,
  normalizeExpenseCategoryApiList,
} from "../utils/expenseCategories";
import { enrichReceiptTaxValues } from "../utils/taxTypeUtils";
import {
  dedupeReceiptMediaAcrossReceipts,
  resolveReceiptMediaFieldsForApi,
  receiptMediaStorageKey,
} from "../utils/mediaUrlUtils";
import { isMerchantSupersededByApi } from "../utils/merchantListUtils";
import { isNetworkReceivedReceipt } from "../utils/networkReceiptUtils";
import {
  buildHomepageFilterMerchantsWithImages,
  buildHomepageFilterExpenseCategories,
  buildHomepageFilterPaymentMethods,
} from "../utils/homepageFilterUtils";
import {
  buildApiPaymentMethodPayload,
  cardTypeIntToBrand,
  getApiPaymentMethodCacheKey,
  getApiPaymentMethodDisplayName,
  getLast4FromPaymentApiRecord,
  inferCardTypeFromPayment,
  isPaymentApiRecord,
  mergePaymentMethodLabels,
  normalizeApiPaymentMethodInput,
  normalizePaymentField,
  paymentMethodPayloadToQuery,
  syncReceiptPaymentFieldAliases,
  CLEAR_PAYMENT_API_VALUE,
} from "../utils/paymentMethodUtils";
import {
  parseReceiptUnix,
  resolveReceiptCalendarUnix,
  calendarUnixToMobileUnix,
} from "../utils/receiptDate";
import { normalizeUserResponse } from "../utils/userUtils";

const DataContext = createContext();
const BASE_URL = "/api";
// Deduplication cache for cross-account sender-receipt fetches (keyed by sender user ID).
// Module-level so parallel syncForwardedReceiptData calls share in-flight promises.
const _senderReceiptFetchCache = new Map();
const onlyDigits = (s) => (s ?? "").toString().replace(/\D/g, "");
// DEFAULT_PAYMENT_METHODS removed — payment methods now come exclusively
// from the getPaymentMethodv1 API (apiPaymentMethods) and from receipts.
const DEFAULT_MERCHANTS_WITH_LOGOS = [
  { name: "Costco", image: "https://logo.clearbit.com/costco.com" },
  { name: "Home Depot", image: "https://logo.clearbit.com/homedepot.com" },
  { name: "Lowe's", image: "https://logo.clearbit.com/lowes.com" },
  { name: "Miscellaneous", image: "/miscellaneous-logo.png" },
  { name: "Nordstrom", image: "https://logo.clearbit.com/nordstrom.com" },
  { name: "Target", image: "https://logo.clearbit.com/target.com" },
  { name: "Walmart", image: "https://logo.clearbit.com/walmart.com" },
];

// Build a deduplicated list of payment methods from a receipts array.
// Prefers "issuerName *last4" format, falls back to paymentType.
const buildPaymentMethods = (receiptList) => {
  const paymentMap = new Map();
  const addPayment = (payment) => {
    if (!payment) return;
    const pt = payment.toString().trim();
    if (!pt || pt === "0" || pt === "0*0" || /^0\*\d*$/.test(pt) || /\*\s*0$/.test(pt)) return;
    const key = pt.toLowerCase();
    if (!paymentMap.has(key)) paymentMap.set(key, pt);
  };

  receiptList.forEach((r) => {
    const display = getPaymentDisplayFromReceipt(r);
    if (display && display !== "-") addPayment(display);
  });

  return [...paymentMap.values()].filter(Boolean);
};
const getLast4 = (cardNumber, hintedLast4) => {
  if (hintedLast4 && /^\d{4}$/.test(hintedLast4)) return hintedLast4;
  const digits = onlyDigits(cardNumber);
  return digits.length >= 4 ? digits.slice(-4) : "";
};
const parseJsonSafe = async (response) => {
  try { return await response.json(); } catch { return null; }
};
const getEntityId = (item) =>
  item?.id ??
  item?.store_id ??
  item?.fk_store_id ??
  item?.payment_method_id ??
  item?.fk_payment_method_id ??
  item?.expense_category_id ??
  item?.fk_expense_category_id ??
  null;

const isDeleteResponseSuccessful = (data) => {
  if (data === null || data === undefined) return false;
  if (typeof data !== "object") {
    const normalized = String(data).trim().toLowerCase();
    return ["1", "true", "success", "deleted", "ok"].includes(normalized);
  }
  const normalizedCode = String(data.code || data.error_code || "").trim();
  if (["010", "401", "403"].includes(normalizedCode)) return false;
  const statusLike = [data.success, data.status, data.ok, data.isSuccess]
    .filter((v) => v !== undefined);
  if (statusLike.some((v) => v === false || v === 0 || String(v).toLowerCase() === "false")) {
    return false;
  }
  if (statusLike.length > 0) return true;
  if (data.message || data.msg) {
    const m = String(data.message || data.msg).toLowerCase();
    if (
      m.includes("fail") ||
      m.includes("error") ||
      m.includes("not") ||
      m.includes("invalid") ||
      m.includes("unauthorized") ||
      m.includes("expired")
    ) return false;
    if (m.includes("success") || m.includes("delete")) return true;
  }
  return true;
};
const withDeleteQuery = (endpoint, id) => {
  const fkUserId = localStorage.getItem("fk_user_id") || "";
  const glue = endpoint.includes("?") ? "&" : "?";
  return `${endpoint}${glue}id=${encodeURIComponent(id)}&deleteId=${encodeURIComponent(id)}&store_id=${encodeURIComponent(id)}&payment_method_id=${encodeURIComponent(id)}&expense_category_id=${encodeURIComponent(id)}&fk_user_id=${encodeURIComponent(fkUserId)}`;
};
const maskToLast4 = (cardNumber, hintedLast4) => {
  const last4 = getLast4(cardNumber, hintedLast4);
  if (!last4) return "";
  const digits = onlyDigits(cardNumber);
  const maskedLen = Math.max(0, digits.length - 4);
  return `${"•".repeat(maskedLen)}${last4}`;
};

function formatPaymentDisplayFromReceipt(r) {
  // Support both snake_case (local/legacy) and camelCase (production API)
  const issuer = (r?.card_issuer_name ?? r?.cardIssuerName ?? "").toString().trim();
  const brand = (
    r?.paymentBrand ??
    r?.payment_method_name ??
    r?.paymentType ??
    ""
  )
    .toString()
    .trim();
  // Check multiple possible field names for last4 digits
  const last4 = getLast4(
    r?.card_number, 
    r?.card_last4 || r?.last_4_digit_card || r?.last4DigitCard
  );
  const masked = maskToLast4(
    r?.card_number, 
    r?.card_last4 || r?.last_4_digit_card || r?.last4DigitCard
  );
  const logoUrl = r?.payment_logo_url ?? r?.paymentLogoUrl ?? null;

  if (issuer && issuer !== "0") {
    // Issuer present -> prefer issuer + last4 (this is what user wants to see)
    if (last4) {
      return { title: `${issuer} •${last4}`, subtitle: masked, logoUrl };
    }
    return { title: issuer, logoUrl };
  }

  if (brand && brand !== "0") {
    if (last4) {
      return { title: `${brand} •${last4}`, subtitle: masked, logoUrl };
    }
    return { title: brand, logoUrl };
  }

  const typeTitle = (r?.paymentType ?? "Payment Method")
    .toString()
    .toUpperCase();
  if (last4) {
    return { title: `${typeTitle} •${last4}`, subtitle: masked, logoUrl };
  }
  return { title: typeTitle, logoUrl };
}

// Helper function to determine badge status
const getReceiptBadgeStatus = (receipt) => {
  const isForwarded =
    receipt.receipt_forwarded === "1" || receipt.receipt_forwarded === 1;
  const isReceived = isNetworkReceivedReceipt(receipt);

  if (isForwarded && isReceived) {
    return "both";
  } else if (isForwarded) {
    return "forwarded";
  } else if (isReceived) {
    return "received";
  }
  return null;
};

// Add this function to calculate badge status for each receipt
const calculateReceiptBadges = (receipts) => {
  return receipts.map(receipt => ({
    ...receipt,
    badgeStatus: getReceiptBadgeStatus(receipt)
  }));
};


export const DataProvider = ({ children }) => {
  const [receipts, setReceipts] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [expenseCategories, setExpenseCategories] = useState([]);
  const [storeNames, setStoreNames] = useState([]);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [note, setNote] = useState([]);
  const [receiptImage, setReceiptImage] = useState([]);
  const [receiptTaxValues, setReceiptTaxValues] = useState([]);
  const [loading, setLoading] = useState(true);
  // Ref used by fetchData to skip the loading spinner for background (silent) refreshes.
  const silentRefreshRef = useRef(false);
  const userFetchedRef = useRef(false);
  const mediaHealInFlightRef = useRef(false);
  // Map of signature → { lastAttemptTs: number, failCount: number }
  // We allow re-healing the same contamination pattern after 60 s so new uploads
  // that re-contaminate the same receipts are always fixed.  Give up after 5
  // consecutive failed attempts to avoid hammering a broken endpoint.
  const healAttemptMapRef = useRef(new Map());
  /** Raw receipt rows from the last fetch (before cross-receipt media dedupe). */
  const lastRawReceiptsRef = useRef([]);
  const [error, setError] = useState(null);
  const [receiptCategory, setReceiptCategory] = useState([]);
  const [expenseType, setExpenseType] = useState([]);
  const [taxData, setTaxData] = useState([]);
  const [purchasePrice, setPurchasePrice] = useState([]);
  const [dataContent, setDataContent] = useState(null);
  const [storeImage, setStoreImage] = useState(null);
  const [receiptTags, setReceiptTags] = useState([]);
  const [merchantsWithImages, setMerchantsWithImages] = useState([]);
  const [user, setUser] = useState(null);

  // ── API-backed merchants (server-stored via /userpaymentmethod endpoints) ──
  const [apiMerchants, setApiMerchants] = useState([]);
  // ── API-backed payment methods (server-stored via /userpaymentmethod endpoints) ──
  // ── API-backed expense categories (server-stored via /userexpensecategory endpoints) ──
  const [apiExpenseCategories, setApiExpenseCategories] = useState([]);
  // Placeholder for future Admin meta-driven default categories (Visible = Yes).
  const [adminDefaultExpenseCategories, setAdminDefaultExpenseCategories] = useState([]);
  const [apiPaymentMethods, setApiPaymentMethods] = useState([]);

  // ── Custom receipt-info items (localStorage-backed, managed via Settings → Receipt Information) ──
  const [customMerchants, setCustomMerchants] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cat_custom_merchants") || "[]"); } catch { return []; }
  });
  const [customCategories, setCustomCategories] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cat_custom_categories") || "[]"); } catch { return []; }
  });
  const [customPaymentMethods, setCustomPaymentMethods] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cat_custom_payment_methods") || "[]"); } catch { return []; }
  });

  // ── Hidden receipt-derived items — stored as arrays in localStorage, used as Sets internally ──
  const [hiddenMerchants, setHiddenMerchants] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("cat_hidden_merchants") || "[]")); } catch { return new Set(); }
  });
  const [hiddenCategories, setHiddenCategories] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("cat_hidden_categories") || "[]")); } catch { return new Set(); }
  });
  const [hiddenPaymentMethods, setHiddenPaymentMethods] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem("cat_hidden_payment_methods") || "[]")); } catch { return new Set(); }
  });

  // Tax management functions
  const fetchTaxes = useCallback(async () => {
    console.log("Fetching taxes from API...");
    try {
      const token = localStorage.getItem("token");
      if (!token) return [];
      
      const dateTimeStamp = Date.now();
      const response = await fetch(`${BASE_URL}/tax/getTax?date_time_stamp=0&fk_user_id=10476`, {
        headers: {
          accesstoken: `${token}`,
        },
      });
      
      if (response.ok) {
        const taxes = await response.json();
        const taxArray = Array.isArray(taxes) ? taxes : [];
        setTaxData(taxArray);

        console.log("%c[Tax] fetchTaxes response (full):", "color:#f59e0b;font-weight:bold", taxes);
        console.log("Tax API response status:", taxArray);
        return taxArray; // Return taxes for immediate use
      } else {
        console.warn("Failed to fetch taxes:", response.status);
        setTaxData([]);
        return [];
      }
    } catch (err) {
      console.error("Error fetching taxes:", err);
      setTaxData([]);
      return [];
    }
  }, []);
  
  const addTax = useCallback(async (taxData) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token not found");
      const safePayload = {
        ...taxData,
        tax_name: escapeSqlApostrophe(taxData?.tax_name || ""),
      };
      const response = await fetch(`${BASE_URL}/tax/addTax`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accesstoken: token,
        },
        body: JSON.stringify(safePayload),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to add tax");
      }
      
      const savedTax = await response.json();
      console.log("%c[Tax] addTax response (full):", "color:#22c55e;font-weight:bold", savedTax);
      await fetchTaxes(); // Refresh taxes list
      return savedTax;
    } catch (err) {
      console.error("Error adding tax:", err);
      throw err;
    }
  }, [fetchTaxes]);
  
  const updateTax = useCallback(async (taxData) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token not found");
      const safePayload = {
        ...taxData,
        tax_name: escapeSqlApostrophe(taxData?.tax_name || ""),
      };
      const response = await fetch(`${BASE_URL}/tax/updateTax`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accesstoken: token,
        },
        body: JSON.stringify(safePayload),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update tax");
      }
      
      const updatedTax = await response.json();
      console.log("%c[Tax] updateTax response (full):", "color:#f59e0b;font-weight:bold", updatedTax);
      await fetchTaxes(); // Refresh taxes list
      return updatedTax;
    } catch (err) {
      console.error("Error updating tax:", err);
      throw err;
    }
  }, [fetchTaxes]);
  
  const deleteTax = useCallback(async (taxId) => {
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Authentication token not found");
      
      const response = await fetch(`${BASE_URL}/tax/deleteTax?deleteId=${taxId}`, {
        method: "GET",
        headers: {
          Accesstoken: token,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to delete tax");
      }
      
      await fetchTaxes(); // Refresh taxes list
      return true;
    } catch (err) {
      console.error("Error deleting tax:", err);
      throw err;
    }
  }, [fetchTaxes]);

  // Remove local custom entries that duplicate server stores (prevents ghost duplicates after login).
  const purgeCustomMerchantsMatchingApi = useCallback((apiList) => {
    const apiNames = new Set(
      (apiList || [])
        .map((m) => (m?.store_name || "").trim().toLowerCase())
        .filter(Boolean)
    );
    if (apiNames.size === 0) return;
    setCustomMerchants((prev) => {
      const next = prev.filter((m) => !apiNames.has((m || "").trim().toLowerCase()));
      if (next.length === prev.length) return prev;
      localStorage.setItem("cat_custom_merchants", JSON.stringify(next));
      return next;
    });
  }, []);

  // ── API Merchant CRUD (via /userstore endpoints) ──
  const fetchApiMerchants = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return [];
    try {
      console.log("%c[Merchants] GET /userstore/getStorev1", "color:#6366f1;font-weight:bold");
      const res = await fetch(`${BASE_URL}/userstore/getStorev1`, {
        headers: { Accesstoken: token, Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const merchants = Array.isArray(data) ? data.filter(m => m.store_name) : [];
        console.log("%c[Merchants] fetchApiMerchants response:", "color:#6366f1;font-weight:bold", merchants);
        setApiMerchants(merchants);
        // Server-backed stores must stay visible in Manage Merchants even if the name
        // was previously added to cat_hidden_merchants via receipt/default cleanup.
        setHiddenMerchants((prev) => {
          const normalizeKey = (value) =>
            String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
          const apiKeys = new Set(
            merchants.map((m) => normalizeKey(m.store_name)).filter(Boolean)
          );
          const next = new Set([...prev].filter((h) => !apiKeys.has(normalizeKey(h))));
          if (next.size === prev.size) return prev;
          localStorage.setItem("cat_hidden_merchants", JSON.stringify([...next]));
          return next;
        });
        purgeCustomMerchantsMatchingApi(merchants);
        return merchants;
      }
    } catch (e) { console.error("[Merchants] fetchApiMerchants error", e); }
    return [];
  }, [purgeCustomMerchantsMatchingApi]);

  // Backend SQL does direct string concatenation — escape single quotes so they
  // don't break the query.  MySQL treats '' (doubled quote) as a literal apostrophe.
  const escapeSqlApostrophe = (s) => (s || "").replace(/'/g, "''");

  const addApiMerchant = async (name, logoUrl = "") => {
    const token = localStorage.getItem("token");
    if (!token || !name.trim()) return { ok: false, data: null, error: "Missing token or merchant name" };
    const fk_user_id = parseInt(localStorage.getItem("fk_user_id")) || 0;
    const payload = { store_name: escapeSqlApostrophe(name.trim()), store_image_url: logoUrl || "", fk_user_id };
    console.log("%c[Merchants] POST /userstore/addStorev1 →", "color:#22c55e;font-weight:bold", payload);
    try {
      const res = await fetch(`${BASE_URL}/userstore/addStorev1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token, Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        console.log("%c[Merchants] addApiMerchant response:", "color:#22c55e;font-weight:bold", data);
        // Re-fetch so we always have the server-assigned store id before any edit.
        const freshList = await fetchApiMerchants();
        const created =
          freshList.find(
            (m) =>
              String(m?.store_name || "").trim().toLowerCase() === name.trim().toLowerCase()
          ) || (getEntityId(data) ? data : null);
        return { ok: true, data: created || data, error: null };
      } else {
        console.warn("[Merchants] addApiMerchant failed, status:", res.status);
        return { ok: false, data: null, error: `Failed with status ${res.status}` };
      }
    } catch (e) {
      console.error("[Merchants] addApiMerchant error", e);
      return { ok: false, data: null, error: e.message || "Failed to add merchant" };
    }
  };

  const updateApiMerchant = async (id, name, logoUrl = "") => {
    const token = localStorage.getItem("token");
    if (!token) return { ok: false, data: null, error: "Missing token" };
    const fk_user_id = parseInt(localStorage.getItem("fk_user_id")) || 0;
    const payload = { id, store_name: escapeSqlApostrophe(name.trim()), store_image_url: logoUrl || "", fk_user_id };
    console.log("%c[Merchants] POST /userstore/updateStorev1 →", "color:#f59e0b;font-weight:bold", payload);
    try {
      const res = await fetch(`${BASE_URL}/userstore/updateStorev1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token, Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        console.log("%c[Merchants] updateApiMerchant response:", "color:#f59e0b;font-weight:bold", data);
        const freshList = await fetchApiMerchants();
        const nextMerchant =
          freshList.find((m) => String(getEntityId(m)) === String(id)) ||
          (data?.store_name ? data : { id, store_name: name.trim(), store_image_url: logoUrl || "" });
        return { ok: true, data: nextMerchant, error: null };
      } else {
        console.warn("[Merchants] updateApiMerchant failed, status:", res.status);
        return { ok: false, data: null, error: `Failed with status ${res.status}` };
      }
    } catch (e) {
      console.error("[Merchants] updateApiMerchant error", e);
      return { ok: false, data: null, error: e.message || "Failed to update merchant" };
    }
  };

  const deleteApiMerchant = async (id) => {
    const token = localStorage.getItem("token");
    if (!token) return { ok: false, data: null, error: "Missing token" };
    const fkUserId = localStorage.getItem("fk_user_id") || "";
    const payload = { id, deleteId: id, store_id: id, fk_store_id: id, fk_user_id: fkUserId };
    console.log("%c[Merchants] POST /userstore/deleteStorev1 →", "color:#ef4444;font-weight:bold", payload);
    try {
      let authErrorMessage = "";
      const endpoint = `${BASE_URL}/userstore/deleteStorev1`;
      const queryUrl = withDeleteQuery(endpoint, id);
      const attempts = [
        {
          method: "DELETE",
          url: `${endpoint}?id=${encodeURIComponent(id)}`,
          headers: { Accesstoken: token },
          body: undefined,
        },
        {
          method: "DELETE",
          url: queryUrl,
          headers: { Accesstoken: token },
          body: undefined,
        },
        {
          method: "POST",
          url: endpoint,
          headers: { "Content-Type": "application/json", Accesstoken: token },
          body: JSON.stringify(payload),
        },
        {
          method: "POST",
          url: endpoint,
          headers: { Accesstoken: token },
          body: JSON.stringify(payload),
        },
        {
          method: "POST",
          url: queryUrl,
          headers: { Accesstoken: token },
          body: undefined,
        },
        {
          method: "GET",
          url: queryUrl,
          headers: { Accesstoken: token },
          body: undefined,
        },
      ];
      for (const attempt of attempts) {
        try {
          const res = await fetch(attempt.url, {
            method: attempt.method,
            headers: attempt.headers,
            body: attempt.body,
          });
          const data = await parseJsonSafe(res);
          if (data && String(data.code || "") === "010") {
            authErrorMessage = data.message || "Session Token Invalid";
          }
          if (res.ok && isDeleteResponseSuccessful(data)) {
            console.log("%c[Merchants] deleteApiMerchant response:", "color:#ef4444;font-weight:bold", data);
            await fetchApiMerchants();
            return { ok: true, data, error: null };
          }
          console.warn("[Merchants] deleteApiMerchant failed:", {
            status: res.status, endpoint: attempt.url, method: attempt.method, data
          });
        } catch (attemptErr) {
          console.warn("[Merchants] deleteApiMerchant network error:", {
            endpoint: attempt.url,
            method: attempt.method,
            error: attemptErr?.message || String(attemptErr),
          });
        }
      }
      if (authErrorMessage) {
        return { ok: false, data: null, error: authErrorMessage };
      }
      return { ok: false, data: null, error: "Failed to delete merchant (all endpoints)" };
    } catch (e) {
      console.error("[Merchants] deleteApiMerchant error", e);
      return { ok: false, data: null, error: e.message || "Failed to delete merchant" };
    }
  };

  // ── sessionStorage: persist card_number→id so deletes survive logout/re-login (same tab) ──
  const _pmCacheKey = () => `cat_pm_ids_${localStorage.getItem("fk_user_id") || "anon"}`;
  const _cachePaymentId = (cardNumber, id) => {
    if (!cardNumber || !id || id === 0 || String(id) === "0") return;
    try {
      const cache = JSON.parse(sessionStorage.getItem(_pmCacheKey()) || "{}");
      cache[(cardNumber || "").trim().toLowerCase()] = id;
      sessionStorage.setItem(_pmCacheKey(), JSON.stringify(cache));
    } catch {}
  };
  const _getCachedPaymentId = (cardNumber) => {
    if (!cardNumber) return null;
    try {
      const cache = JSON.parse(sessionStorage.getItem(_pmCacheKey()) || "{}");
      return cache[(cardNumber || "").trim().toLowerCase()] ?? null;
    } catch { return null; }
  };
  const _extractPaymentId = (obj) =>
    obj?.id ?? obj?.payment_method_id ?? obj?.fk_payment_method_id ?? obj?.record_id ?? null;
  const _resolvePaymentMethodIdByCardNumber = async (token, lookupKey) => {
    if (!token || !lookupKey) return null;
    try {
      const res = await fetch(`${BASE_URL}/userpaymentmethod/getPaymentMethodv1`, {
        headers: { Accesstoken: token, Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      const rawList = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      const normalizedTarget = (lookupKey || "").trim().toLowerCase();
      const matched = rawList.find((m) => {
        const cacheKey = getApiPaymentMethodCacheKey(m);
        if (cacheKey === normalizedTarget) return true;
        const display = getApiPaymentMethodDisplayName(m).trim().toLowerCase();
        return display === normalizedTarget;
      });
      const resolvedId = _extractPaymentId(matched);
      if (resolvedId && resolvedId !== 0 && String(resolvedId) !== "0") {
        _cachePaymentId(lookupKey, resolvedId);
        return resolvedId;
      }
      return null;
    } catch (err) {
      console.warn("[PaymentMethods] _resolvePaymentMethodIdByCardNumber failed:", err);
      return null;
    }
  };

  // ── API Payment Method CRUD (via /userpaymentmethod endpoints) ──
  const fetchApiPaymentMethods = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      console.log("%c[PaymentMethods] GET /userpaymentmethod/getPaymentMethodv1", "color:#8b5cf6;font-weight:bold");
      const res = await fetch(`${BASE_URL}/userpaymentmethod/getPaymentMethodv1`, {
        headers: { Accesstoken: token, Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        console.log("%c[PaymentMethods] getPaymentMethodv1 raw response:", "color:#8b5cf6", data);
        // Handle {"code":"001","message":"No Records Found"} gracefully — treat as empty list
        const isNoRecords = !Array.isArray(data) && data && String(data.code) === "001";
        // Support both flat array and {data:[...]} wrapped responses
        const rawList = isNoRecords
          ? []
          : Array.isArray(data)
            ? data
            : Array.isArray(data?.data)
              ? data.data
              : [];
        // Keep payment records; backfill id from sessionStorage if absent
        const payments = rawList
          .filter(isPaymentApiRecord)
          .map(m => {
            if (m.id && m.id !== 0 && String(m.id) !== "0") return m; // id present — use it
            const cacheKey = getApiPaymentMethodCacheKey(m);
            const cachedId = cacheKey ? _getCachedPaymentId(cacheKey) : null;
            return cachedId ? { ...m, id: cachedId } : m;
          });
        console.log("%c[PaymentMethods] fetchApiPaymentMethods (with IDs):", "color:#8b5cf6;font-weight:bold", payments);
        setApiPaymentMethods(payments);
      }
    } catch (e) { console.error("[PaymentMethods] fetchApiPaymentMethods error", e); }
  }, []);

  const addApiPaymentMethod = async (paymentInput, logoUrl = "", expenseType = "") => {
    const token = localStorage.getItem("token");
    const normalized = normalizeApiPaymentMethodInput(paymentInput, logoUrl, expenseType);
    if (!token) return { ok: false, data: null, error: "Missing token" };
    if (!normalized.cardTypeBrand && !normalized.last4) {
      return { ok: false, data: null, error: "Missing payment method details" };
    }
    const fk_user_id = parseInt(localStorage.getItem("fk_user_id")) || 0;
    const payload = buildApiPaymentMethodPayload(
      { id: 0, fk_user_id, ...normalized },
      escapeSqlApostrophe
    );
    const addPayQuery = paymentMethodPayloadToQuery(payload);
    console.log("%c[PaymentMethods] POST /userpaymentmethod/addPaymentMethodv1 →", "color:#06b6d4;font-weight:bold", payload);
    try {
      const res = await fetch(`${BASE_URL}/userpaymentmethod/addPaymentMethodv1?${addPayQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token, Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        console.log("%c[PaymentMethods] addApiPaymentMethod response:", "color:#06b6d4;font-weight:bold", data);
        const entity =
          data && typeof data === "object" && (data.card_number != null || data.card_issuer_name != null)
            ? data
            : { ...payload, id: data?.id ?? data?.payment_method_id ?? data?.record_id ?? null };
        const cacheKey = getApiPaymentMethodCacheKey(entity);
        let resolvedId = _extractPaymentId(entity);
        if (!resolvedId || resolvedId === 0 || String(resolvedId) === "0") {
          resolvedId = await _resolvePaymentMethodIdByCardNumber(token, cacheKey);
        }
        if (resolvedId && resolvedId !== 0 && String(resolvedId) !== "0") {
          _cachePaymentId(cacheKey, resolvedId);
        }
        const stableEntity = {
          ...entity,
          id: resolvedId || entity?.id || null,
          icon_image:
            entity.icon_image != null && entity.icon_image !== ""
              ? entity.icon_image
              : payload.icon_image,
        };
        console.log("%c[PaymentMethods] addApiPaymentMethod entity:", "color:#06b6d4", stableEntity, "resolvedId:", resolvedId);
        setApiPaymentMethods((prev) => {
          const key = getApiPaymentMethodCacheKey(stableEntity);
          if (!key) return [...prev, stableEntity];
          const existingIdx = prev.findIndex((m) => getApiPaymentMethodCacheKey(m) === key);
          if (existingIdx === -1) return [...prev, stableEntity];
          const next = [...prev];
          next[existingIdx] = { ...next[existingIdx], ...stableEntity };
          return next;
        });
        return { ok: true, data: stableEntity, error: null };
      } else {
        const errData = await parseJsonSafe(res);
        const errMsg = errData?.message || errData?.msg || `Failed with status ${res.status}`;
        console.warn("[PaymentMethods] addApiPaymentMethod failed:", res.status, errData);
        return { ok: false, data: null, error: errMsg };
      }
    } catch (e) {
      console.error("[PaymentMethods] addApiPaymentMethod error", e);
      return { ok: false, data: null, error: e.message || "Failed to add payment method" };
    }
  };

  const updateApiPaymentMethod = async (id, paymentInput, logoUrl = "", expenseType = "") => {
    const token = localStorage.getItem("token");
    if (!token) return { ok: false, data: null, error: "Missing token" };
    const fk_user_id = parseInt(localStorage.getItem("fk_user_id")) || 0;
    const normalized = normalizeApiPaymentMethodInput(paymentInput, logoUrl, expenseType);
    const payload = buildApiPaymentMethodPayload(
      { id, fk_user_id, ...normalized },
      escapeSqlApostrophe
    );
    const updatePayQuery = paymentMethodPayloadToQuery(payload);
    console.log("%c[PaymentMethods] POST /userpaymentmethod/updatePaymentMethodv1 →", "color:#f59e0b;font-weight:bold", payload);
    try {
      const res = await fetch(`${BASE_URL}/userpaymentmethod/updatePaymentMethodv1?${updatePayQuery}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token, Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        console.log("%c[PaymentMethods] updateApiPaymentMethod response:", "color:#f59e0b;font-weight:bold", data);
        const entity =
          data && typeof data === "object" ? data : { ...payload };
        setApiPaymentMethods((prev) =>
          prev.map((m) => (String(m.id ?? "") === String(id) ? { ...m, ...entity, id } : m))
        );
        _cachePaymentId(getApiPaymentMethodCacheKey(entity), id);
        return { ok: true, data: entity, error: null };
      } else {
        console.warn("[PaymentMethods] updateApiPaymentMethod failed, status:", res.status);
        return { ok: false, data: null, error: `Failed with status ${res.status}` };
      }
    } catch (e) {
      console.error("[PaymentMethods] updateApiPaymentMethod error", e);
      return { ok: false, data: null, error: e.message || "Failed to update payment method" };
    }
  };

  // id         — numeric payment method ID from the GET response (required by the delete endpoint)
  // cardNumber — card_number string; used only for local state cleanup and ID cache lookup
  const deleteApiPaymentMethod = async (id, cardNumber = "") => {
    const token = localStorage.getItem("token");
    if (!token) return { ok: false, data: null, error: "Missing token" };

    // Resolve the numeric ID: prefer what was passed, then fall back to sessionStorage cache
    let resolvedId = (id != null && id !== 0 && String(id) !== "0") ? id : null;
    if (!resolvedId && cardNumber) resolvedId = _getCachedPaymentId(cardNumber);
    if (!resolvedId && cardNumber) {
      resolvedId = await _resolvePaymentMethodIdByCardNumber(token, cardNumber);
    }

    if (!resolvedId) {
      console.warn("[PaymentMethods] deleteApiPaymentMethod — no ID available for", cardNumber || id);
      return { ok: false, data: null, error: "Payment method ID not available" };
    }

    console.log("%c[PaymentMethods] DELETE /userpaymentmethod/deletePaymentMethodv1 →", "color:#ef4444;font-weight:bold", { resolvedId, cardNumber });
    try {
      const endpoint = `${BASE_URL}/userpaymentmethod/deletePaymentMethodv1`;
      const queryUrl = `${endpoint}?id=${encodeURIComponent(resolvedId)}&deleteId=${encodeURIComponent(resolvedId)}`;
      const fkUserId = localStorage.getItem("fk_user_id") || "";
      const payload = { id: resolvedId, deleteId: resolvedId, payment_method_id: resolvedId, fk_payment_method_id: resolvedId, fk_user_id: fkUserId };

      let authErrorMessage = "";
      const attempts = [
        // DELETE is the spec-defined method — confirmed working; try it first
        {
          method: "DELETE",
          url: queryUrl,
          headers: { Accesstoken: token, Authorization: `Bearer ${token}` },
          body: undefined,
        },
        // POST with JSON body as fallback (some backends route DELETE via POST)
        {
          method: "POST",
          url: endpoint,
          headers: { "Content-Type": "application/json", Accesstoken: token, Authorization: `Bearer ${token}` },
          body: JSON.stringify(payload),
        },
        // POST with query-string only as last resort
        {
          method: "POST",
          url: queryUrl,
          headers: { Accesstoken: token, Authorization: `Bearer ${token}` },
          body: undefined,
        },
      ];

      for (const attempt of attempts) {
        try {
          const res = await fetch(attempt.url, {
            method: attempt.method,
            headers: attempt.headers,
            body: attempt.body,
          });
          const data = await parseJsonSafe(res);
          console.log("%c[PaymentMethods] deletePaymentMethodv1 response:", "color:#ef4444;font-weight:bold", data);

          if (data && String(data.code || "") === "010") {
            authErrorMessage = data.message || "Session Token Invalid";
          }
          if (res.ok && isDeleteResponseSuccessful(data)) {
            // Remove only the record with this numeric id (last-4 is not unique).
            setApiPaymentMethods(prev =>
              prev.filter(m => String(m.id ?? "") !== String(resolvedId))
            );
            return { ok: true, data, error: null };
          }
          console.warn("[PaymentMethods] deleteApiPaymentMethod failed:", { status: res.status, data });
        } catch (attemptErr) {
          console.warn("[PaymentMethods] deleteApiPaymentMethod network error:", {
            endpoint: attempt.url,
            method: attempt.method,
            error: attemptErr?.message || String(attemptErr),
          });
        }
      }

      if (authErrorMessage) {
        return { ok: false, data: null, error: authErrorMessage };
      }
      return { ok: false, data: null, error: "Failed to delete payment method (all endpoints)" };
    } catch (e) {
      console.error("[PaymentMethods] deleteApiPaymentMethod error", e);
      return { ok: false, data: null, error: e.message || "Failed to delete payment method" };
    }
  };

  // ── API Expense Category CRUD (via /userexpensecategory endpoints) ──
  const fetchApiExpenseCategories = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      console.log("%c[ExpenseCategories] GET /userexpensecategory/getExpenseCategoryv1", "color:#a855f7;font-weight:bold");
      const res = await fetch(`${BASE_URL}/userexpensecategory/getExpenseCategoryv1`, {
        headers: { Accesstoken: token, Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const cats = normalizeExpenseCategoryApiList(parseExpenseCategoryApiResponse(data));
        console.log("%c[ExpenseCategories] fetchApiExpenseCategories response (full):", "color:#a855f7;font-weight:bold", data);
        console.log("%c[ExpenseCategories] filtered categories:", "color:#a855f7;font-weight:bold", cats);
        setApiExpenseCategories(cats);
        if (cats.length > 0) {
          const apiNameKeys = new Set(
            cats
              .map((c) => (c.expense_category_name || "").toString().trim().toLowerCase())
              .filter(Boolean)
          );
          // Categories returned by GET are active on the server — clear stale hidden flags
          // (e.g. after re-adding "Gold" from iOS following a prior web delete).
          setHiddenCategories((prev) => {
            const next = new Set(
              [...prev].filter(
                (hidden) => !apiNameKeys.has(String(hidden || "").trim().toLowerCase())
              )
            );
            if (next.size !== prev.size) {
              localStorage.setItem("cat_hidden_categories", JSON.stringify([...next]));
            }
            return next;
          });
          setExpenseCategories((prev) => {
            const merged = new Set(
              (prev || []).map((c) => (c || "").toString().trim()).filter(Boolean)
            );
            cats.forEach((c) => {
              const name = (c.expense_category_name || "").toString().trim();
              if (name) merged.add(name);
            });
            return [...merged];
          });
        }
      }
    } catch (e) { console.error("fetchApiExpenseCategories error", e); }
  }, []);

  const addApiExpenseCategory = async (name) => {
    const token = localStorage.getItem("token");
    if (!token || !name.trim()) return { ok: false, data: null, error: "Missing token or category name" };
    const fk_user_id = parseInt(localStorage.getItem("fk_user_id")) || 0;
    const payload = { id: 0, fk_user_id, expense_category_name: escapeSqlApostrophe(name.trim()) };
    console.log("%c[ExpenseCategories] POST /userexpensecategory/addExpenseCategoryv1 →", "color:#22c55e;font-weight:bold", payload);
    try {
      const res = await fetch(`${BASE_URL}/userexpensecategory/addExpenseCategoryv1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token, Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        console.log("%c[ExpenseCategories] addApiExpenseCategory response (full):", "color:#22c55e;font-weight:bold", data);
        let entity =
          normalizeExpenseCategoryApiItem(data, name.trim()) ||
          normalizeExpenseCategoryApiList(parseExpenseCategoryApiResponse(data)).find(
            (c) => c.expense_category_name.toLowerCase() === name.trim().toLowerCase()
          ) ||
          normalizeExpenseCategoryApiList(parseExpenseCategoryApiResponse(data))[0] ||
          normalizeExpenseCategoryApiItem(
            { id: getEntityId(data), fk_user_id },
            name.trim()
          ) ||
          // Hard fallback: all extraction attempts returned null (e.g. API returned a
          // response whose name field failed isValidExpenseCategory validation, such as
          // returning "0" or a numeric code).  Construct directly from the user's input.
          { id: getEntityId(data) ?? null, fk_user_id, expense_category_name: name.trim() };
        const catName = (entity?.expense_category_name || "").toString().trim();
        setApiExpenseCategories((prev) => {
          if (!catName) return prev; // nothing to add
          const key = catName.toLowerCase();
          const existingIdx = prev.findIndex(
            (c) =>
              (c?.expense_category_name || c?.name || "").toString().trim().toLowerCase() === key
          );
          if (existingIdx === -1) return [...prev, entity];
          const next = [...prev];
          next[existingIdx] = { ...next[existingIdx], ...entity };
          return next;
        });
        if (catName) {
          // Un-hide in case this category was previously deleted/hidden — ensures it
          // appears immediately in Settings and AddReceiptModal without waiting for fetchData.
          setHiddenCategories((prev) => {
            const key = catName.toLowerCase();
            const next = new Set([...prev].filter((h) => (h || "").trim().toLowerCase() !== key));
            if (next.size !== prev.size) {
              localStorage.setItem("cat_hidden_categories", JSON.stringify([...next]));
            }
            return next;
          });
          // Surface immediately in expenseCategories so dropdowns show it without waiting for fetchData.
          setExpenseCategories((prev) => {
            const key = catName.toLowerCase();
            return prev.some((c) => (c || "").toLowerCase() === key) ? prev : [...prev, catName];
          });
        }
        return { ok: true, data: entity, error: null };
      }
      return { ok: false, data: null, error: `Failed with status ${res.status}` };
    } catch (e) {
      console.error("addApiExpenseCategory error", e);
      return { ok: false, data: null, error: e.message || "Failed to add category" };
    }
  };

  const updateApiExpenseCategory = async (id, name) => {
    const token = localStorage.getItem("token");
    if (!token) return { ok: false, data: null, error: "Missing token" };
    const fk_user_id = parseInt(localStorage.getItem("fk_user_id")) || 0;
    const payload = { id, fk_user_id, expense_category_name: escapeSqlApostrophe(name.trim()) };
    console.log("%c[ExpenseCategories] POST /userexpensecategory/updateExpenseCategoryv1 →", "color:#f59e0b;font-weight:bold", payload);
    try {
      const res = await fetch(`${BASE_URL}/userexpensecategory/updateExpenseCategoryv1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token, Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        console.log("%c[ExpenseCategories] updateApiExpenseCategory response (full):", "color:#f59e0b;font-weight:bold", data);
        // Use the known-good shape (preserve existing entry, just update the name) so
        // visibleApiExpenseCategories never loses this entry due to a missing expense_category_name
        // in the raw API response.
        setApiExpenseCategories(prev => prev.map(c => String(c.id) === String(id) ? { ...c, expense_category_name: name } : c));
        return { ok: true, data, error: null };
      }
      return { ok: false, data: null, error: `Failed with status ${res.status}` };
    } catch (e) {
      console.error("updateApiExpenseCategory error", e);
      return { ok: false, data: null, error: e.message || "Failed to update category" };
    }
  };

  const deleteApiExpenseCategory = async (id) => {
    const token = localStorage.getItem("token");
    if (!token) return { ok: false, data: null, error: "Missing token" };
    if (id == null || String(id).trim() === "") return { ok: false, data: null, error: "ID is required" };
    const fkUserId = localStorage.getItem("fk_user_id") || "";
    const payload = { id: String(id), deleteId: String(id), expense_category_id: String(id), fk_user_id: fkUserId };
    const endpoint = `${BASE_URL}/userexpensecategory/deleteExpenseCategoryv1`;
    const queryUrl = withDeleteQuery(endpoint, id);
    console.log("%c[ExpenseCategories] POST /userexpensecategory/deleteExpenseCategoryv1 →", "color:#ef4444;font-weight:bold", { id, queryUrl });
    // API reads ID from query params — send with params in URL first, body fallback second
    const attempts = [
      { url: queryUrl, headers: { Accesstoken: token, Authorization: `Bearer ${token}` }, body: undefined },
      { url: endpoint, headers: { "Content-Type": "application/json", Accesstoken: token, Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) },
    ];
    for (const attempt of attempts) {
      try {
        const res = await fetch(attempt.url, { method: "POST", headers: attempt.headers, body: attempt.body });
        const data = await parseJsonSafe(res);
        const code = String(data?.code || "");
        const msg = String(data?.message || data?.msg || "").toLowerCase();
        // Strict success: code "000" OR message explicitly says deleted/success (not just any truthy response)
        const isSuccess = res.ok && (
          code === "000" ||
          msg.includes("deleted") ||
          (msg.includes("delete") && !msg.includes("fail")) ||
          msg.includes("success")
        );
        if (isSuccess) {
          console.log("%c[ExpenseCategories] deleteApiExpenseCategory success:", "color:#ef4444;font-weight:bold", data);
          setApiExpenseCategories(prev => prev.filter(c => String(getEntityId(c)) !== String(id)));
          return { ok: true, data, error: null };
        }
        console.warn("[ExpenseCategories] deleteApiExpenseCategory attempt failed:", { url: attempt.url, status: res.status, data });
      } catch (attemptErr) {
        console.warn("[ExpenseCategories] deleteApiExpenseCategory network error:", attemptErr?.message);
      }
    }
    return { ok: false, data: null, error: "Failed to delete expense category" };
  };

  const clearDataContent = () => setDataContent(null);

  const calculateSubtotal = (receipt) => {
    const purchasePrice = parseFloat(receipt.purchasePrice) || 0;
    const totalTax =
      receipt.receipt_tax_values?.reduce((sum, tax) => {
        if ((tax?.tax_name || "").toString().toLowerCase().includes("tip")) {
          return sum;
        }
        return sum + (parseFloat(tax.tax_amount) || 0);
      }, 0) || 0;
    return purchasePrice - totalTax;
  };

  const fetchData = useCallback(async () => {
    const token = localStorage.getItem("token");
    const date_time_stamp = 14000997;

    if (!token) {
      setError("No authentication token found");
      setLoading(false);
      return;
    }

    try {
      if (!silentRefreshRef.current) setLoading(true);
      setError(null);

      // Fetch user only on first load — user data doesn't change during a session.
      // userFetchedRef persists across renders so it works correctly inside the
      // memoized fetchData callback (avoids stale closure on the user state).
      let fk_user_id = localStorage.getItem("fk_user_id");
      if (!userFetchedRef.current) {
        const userRes = await fetch(`${BASE_URL}/user/getuserdetails`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accesstoken: token,
          },
        });
        if (!userRes.ok) throw new Error("Failed to fetch user data");
        const userJson = await userRes.json();
        const userData = normalizeUserResponse(userJson);
        if (!userData) throw new Error("Invalid user data response");
        setUser(userData);
        fk_user_id = userData?.id;
        if (fk_user_id) localStorage.setItem("fk_user_id", fk_user_id);
        userFetchedRef.current = true;
      }

      // Fire all independent requests in parallel so the receipt list appears as
      // fast as the slowest single response, not the sum of all responses.
      const [receiptRes, taxResRaw, apiStoreResRaw, apiPayResRaw, apiCatResRaw] = await Promise.all([
        fetch(
          `${BASE_URL}/user/getreceiptfromdatev1?fk_user_id=${fk_user_id}&date_time_stamp=${date_time_stamp}`,
          { method: "GET", headers: { "Content-Type": "application/json", Accesstoken: token } }
        ),
        fetch(`${BASE_URL}/tax/getTax?date_time_stamp=${Date.now()}`, {
          headers: { Accesstoken: token, Authorization: `Bearer ${token}` },
        }).catch(() => null),
        fetch(`${BASE_URL}/userstore/getStorev1`, {
          headers: { Accesstoken: token, Authorization: `Bearer ${token}` },
        }).catch(() => null),
        fetch(`${BASE_URL}/userpaymentmethod/getPaymentMethodv1`, {
          headers: { Accesstoken: token, Authorization: `Bearer ${token}` },
        }).catch(() => null),
        fetch(`${BASE_URL}/userexpensecategory/getExpenseCategoryv1`, {
          headers: { Accesstoken: token, Authorization: `Bearer ${token}` },
        }).catch(() => null),
      ]);

      if (!receiptRes.ok) throw new Error("Failed to fetch receipts");
      const receiptData = await receiptRes.json();
      console.log("%c[Receipts] getreceiptfromdatev1 response (all receipts):", "color:#06b6d4;font-weight:bold", receiptData);

      // Parse tax response
      let taxDataArray = [];
      try {
        if (taxResRaw?.ok) {
          const taxes = await taxResRaw.json();
          taxDataArray = Array.isArray(taxes) ? taxes : [];
          // Merge with existing taxData to avoid losing recently-added taxes that the API
          // might not yet return (e.g. due to server-side caching or propagation delay).
          setTaxData((prev) => {
            if (taxDataArray.length >= prev.length) return taxDataArray;
            const apiIds = new Set(taxDataArray.map((t) => t.id).filter(Boolean));
            const missing = prev.filter((t) => t.id && !apiIds.has(t.id));
            return [...taxDataArray, ...missing];
          });
        }
      } catch (taxErr) {
        console.error("Error fetching taxes:", taxErr);
        taxDataArray = [];
      }

      // Parse merchants response
      let apiMerchantsData = [];
      try {
        console.log("%c[fetchData] GET /userstore/getStorev1", "color:#6366f1;font-weight:bold");
        if (apiStoreResRaw?.ok) {
          const apiStoreJson = await apiStoreResRaw.json();
          apiMerchantsData = Array.isArray(apiStoreJson) ? apiStoreJson.filter(m => m.store_name) : [];
          console.log("%c[fetchData] Merchants from API:", "color:#6366f1;font-weight:bold", apiMerchantsData);
          setApiMerchants(apiMerchantsData);
          purgeCustomMerchantsMatchingApi(apiMerchantsData);
        }
      } catch (apiStoreErr) {
        console.error("[fetchData] fetchApiMerchants error", apiStoreErr);
      }

      // Parse payment methods response
      let apiPaymentMethodsData = [];
      try {
        console.log("%c[fetchData] GET /userpaymentmethod/getPaymentMethodv1", "color:#8b5cf6;font-weight:bold");
        if (apiPayResRaw?.ok) {
          const apiPayJson = await apiPayResRaw.json();
          const allPayItems = Array.isArray(apiPayJson) ? apiPayJson : [];
          apiPaymentMethodsData = allPayItems.filter(isPaymentApiRecord);
          console.log("%c[fetchData] Payment methods from API (raw all):", "color:#8b5cf6;font-weight:bold", allPayItems);
          console.log("%c[fetchData] Payment methods filtered (non-merchant):", "color:#8b5cf6;font-weight:bold", apiPaymentMethodsData);
          setApiPaymentMethods(apiPaymentMethodsData);
        }
      } catch (apiPayErr) {
        console.error("[fetchData] fetchApiPaymentMethods error", apiPayErr);
      }

      // Parse expense categories response
      let apiExpenseCategoriesData = [];
      try {
        if (apiCatResRaw?.ok) {
          const apiCatJson = await apiCatResRaw.json();
          apiExpenseCategoriesData = normalizeExpenseCategoryApiList(
            parseExpenseCategoryApiResponse(apiCatJson)
          );
          setApiExpenseCategories(apiExpenseCategoriesData);
          if (apiExpenseCategoriesData.length > 0) {
            const apiNameKeys = new Set(
              apiExpenseCategoriesData
                .map((c) => (c.expense_category_name || "").toString().trim().toLowerCase())
                .filter(Boolean)
            );
            setHiddenCategories((prev) => {
              const next = new Set(
                [...prev].filter(
                  (hidden) => !apiNameKeys.has(String(hidden || "").trim().toLowerCase())
                )
              );
              if (next.size !== prev.size) {
                localStorage.setItem("cat_hidden_categories", JSON.stringify([...next]));
              }
              return next;
            });
          }
        }
      } catch (apiCatErr) {
        console.error("fetchApiExpenseCategories in fetchData error", apiCatErr);
      }

      // Build formatted receipts with subtotal, paymentDisplay, badgeStatus, read status,
      // and any locally stored integration flags (e.g. QuickBooks-linked receipts).
      // 1) Normalise dates so we don't show 1970 for valid receipts
      // 2) Filter out ONLY truly empty placeholder rows (all 0/empty fields)
      const formattedReceipts = Array.isArray(receiptData)
        ? receiptData
            .map((r) => {
              // Normalise product_date:
              // - backend sends UNIX seconds
              // - some receipts (especially from mobile/manual) may have product_date=0
              //   but a valid create_date; use create_date as a fallback
              const rawProductDate = parseReceiptUnix(r.product_date);
              const createDate = parseReceiptUnix(
                r.create_date ?? r.createDate,
              );

              let normalisedProductDate = rawProductDate;

              // Treat timestamps < 1,000,000 as invalid (too close to 1970-01-01)
              if (normalisedProductDate === 0 || normalisedProductDate < 1000000) {
                if (createDate >= 1000000) {
                  normalisedProductDate = createDate;
                } else {
                  normalisedProductDate = 0;
                }
              }

              normalisedProductDate = resolveReceiptCalendarUnix(
                normalisedProductDate,
                createDate,
                {
                  isDraft: r.is_draft === "1" || r.is_draft === 1,
                  fk_incoming_email_id: r.fk_incoming_email_id,
                },
              );

              return {
                ...r,
                product_date: normalisedProductDate,
              };
            })
            .filter((r) => {
              // Check if receipt has at least some meaningful data
              // Accept both camelCase (web) and snake_case (Android) field names
              const sn = r.storeName ?? r.store_name ?? "";
              const hasStoreName = sn && sn.toString().trim() !== "" && sn !== "0";
              const pn = r.product_name ?? r.productName ?? "";
              const hasProductName =
                pn && pn.toString().trim() !== "" && pn !== "0";
              // Support both camelCase (web) and snake_case (iOS/Android) for purchasePrice
              const rawPurchasePrice = r.purchasePrice ?? r.purchase_price ?? "";
              const hasPurchasePrice =
                rawPurchasePrice && parseFloat(rawPurchasePrice) > 0;
              // Support both snake_case and camelCase for receipt image
              const rawReceiptImage = r.receipt_image ?? r.receiptImage ?? "";
              const hasReceiptImage =
                rawReceiptImage &&
                rawReceiptImage.toString().trim() !== "" &&
                rawReceiptImage !== "0";
              const hasEmailAttachment =
                r.emailAttachment &&
                r.emailAttachment.toString().trim() !== "" &&
                r.emailAttachment !== "0";

              // eReceipts forwarded via email — fk_incoming_email_id is non-null/non-zero
              const hasIncomingEmailId =
                r.fk_incoming_email_id &&
                r.fk_incoming_email_id !== "0" &&
                r.fk_incoming_email_id !== 0;

              // If this is an eReceipt (came via email), always keep — shown under "Draft Receipts"
              if (hasIncomingEmailId) return true;

              // is_draft = "1" → draft receipt, always keep
              if (r.is_draft === "1" || r.is_draft === 1) return true;

              // "Received" receipts forwarded within Categorizr Network — always keep
              const hasForwardFromId =
                r.fk_forward_from_receipt_id &&
                r.fk_forward_from_receipt_id !== "0" &&
                r.fk_forward_from_receipt_id !== 0;
              if (hasForwardFromId) return true;

              // If the receipt has a store name, it is a real receipt — never drop it.
              // This captures iOS/Android manually-added receipts where the price field
              // name may differ, or price was entered as 0 (e.g. free items, samples).
              if (hasStoreName) return true;

              const productDate = parseInt(r.product_date) || 0;

              // A "completely empty" placeholder row:
              // - no store name / product name / price / image / email attachment
              // - invalid date (0 or pre-2001)
              const isEmptyReceipt =
                !hasStoreName &&
                !hasProductName &&
                !hasPurchasePrice &&
                !hasReceiptImage &&
                !hasEmailAttachment;

              if (isEmptyReceipt && (productDate === 0 || productDate < 1000000)) {
                // Drop truly empty placeholder rows
                return false;
              }

              if (
                !hasProductName &&
                !hasPurchasePrice &&
                !hasReceiptImage &&
                !hasEmailAttachment
              ) {
                // No real content — drop upload stubs
                return false;
              }

              // Keep everything else
              return true;
            })
            .map((r) => {
              // Normalize ALL fields from API (support both snake_case and camelCase
              // so Android-created accounts sync correctly to the web Desktop version)
              let paymentType = normalizePaymentField(r.paymentType ?? r.payment_type);
              const cardIssuerName = normalizePaymentField(r.card_issuer_name ?? r.cardIssuerName);
              const last4DigitCard = normalizePaymentField(r.last_4_digit_card ?? r.last4DigitCard);
              // Normalize merchant / category / tax fields – Android/iOS may use snake_case or camelCase
              const storeName = r.storeName ?? r.store_name ?? "";
              // Strip any localhost proxy URL saved during local dev so receipt cards
              // don't try to load broken localhost URLs on staging/production.
              const _rawStoreImage = r.store_image ?? r.storeImage ?? "";
              const _storeImageMarker = "/api/imageproxy?url=";
              const _siIdx = _rawStoreImage.indexOf(_storeImageMarker);
              const _storeImageUnproxied = _siIdx !== -1
                ? (() => { try { return decodeURIComponent(_rawStoreImage.slice(_siIdx + _storeImageMarker.length)); } catch { return _rawStoreImage; } })()
                : _rawStoreImage;
              const storeImage = /localhost|127\.0\.0\.1/i.test(_storeImageUnproxied) ? "" : _storeImageUnproxied;
              const expenseType = getReceiptExpenseType(r, apiExpenseCategoriesData);
              const productName = r.product_name ?? r.productName ?? "";
              // iOS sends purchase_price (snake_case); web sends purchasePrice (camelCase)
              const purchasePrice = r.purchasePrice ?? r.purchase_price ?? "";
              // iOS may send receiptImage (camelCase) instead of receipt_image
              const receiptImage = r.receipt_image ?? r.receiptImage ?? "";
              // receipt_tax_values: Android may send receiptTaxValues
              const receiptTaxValues =
                Array.isArray(r.receipt_tax_values) ? r.receipt_tax_values
                : Array.isArray(r.receiptTaxValues)  ? r.receiptTaxValues
                : [];
              
              // IMPORTANT: Keep paymentType as-is from API (e.g., "MasterCard *7836")
              // The getPaymentLogo function will extract the card type from paymentType for logo detection
              // Don't modify paymentType here - it needs to contain the card type for logos to work

              const normalized = syncReceiptPaymentFieldAliases({
                ...r,
                // Overwrite with normalised values so downstream code can use
                // a single field name regardless of API variant (web vs Android/iOS)
                storeName,
                store_image: storeImage,
                expense_type: expenseType,
                product_name: productName,
                purchasePrice: purchasePrice, // normalize snake_case purchase_price → camelCase
                receipt_image: receiptImage,  // normalize camelCase receiptImage → snake_case
                emailAttachment: (r.emailAttachment ?? "").toString(),
                receipt_tax_values: receiptTaxValues,
                paymentType: paymentType, // Keep paymentType as-is (e.g., "MasterCard *7836") - needed for logo detection
                card_issuer_name: cardIssuerName,
                last_4_digit_card: last4DigitCard,
                // Ensure draft/verify/email fields are always strings for easy comparison
                is_draft: String(r.is_draft ?? "0"),
                is_verify: String(r.is_verify ?? "0"),
                fk_incoming_email_id: r.fk_incoming_email_id ?? null,
                fk_original_receipt_id: r.fk_original_receipt_id ?? null,
                fk_forward_from_receipt_id: String(
                  r.fk_forward_from_receipt_id ??
                    r.fkForwardFromReceiptId ??
                    "0"
                ),
                receipt_forwarded: String(r.receipt_forwarded ?? "0"),
                originalUsername: r.originalUsername ?? r.original_username ?? null,
                payment_logo_url: r.payment_logo_url ?? r.paymentLogoUrl ?? "",
              });
              const paymentDisplay = formatPaymentDisplayFromReceipt(normalized);
              const badgeStatus = getReceiptBadgeStatus(normalized);
              // Add status field: default to "0" (unread) if not present
              const status = r.status !== undefined ? r.status : "0";
              return {
                ...normalized,
                subtotal: calculateSubtotal(normalized),
                paymentDisplay, // { title, subtitle?, logoUrl? }
                badgeStatus, // "both", "forwarded", "received", or null
                status, // "0" (unread) or "1" (read)
              };
            })
        : [];

      // Remove cross-receipt media contamination from uploadmediaV1 / stale API data.
      lastRawReceiptsRef.current = formattedReceipts;
      const formattedReceiptsDeduped =
        dedupeReceiptMediaAcrossReceipts(formattedReceipts);

      // Merge in locally tracked QuickBooks-linked state, so users can see which
      // receipts have already been sent to QuickBooks even after a reload.
      let receiptsWithIntegrations = formattedReceiptsDeduped;
      try {
        const storedQbIds = JSON.parse(
          localStorage.getItem("qbLinkedReceipts") || "[]"
        );
        const qbIdSet = new Set(
          Array.isArray(storedQbIds)
            ? storedQbIds.map((id) => id.toString())
            : []
        );

        receiptsWithIntegrations = formattedReceiptsDeduped.map((r) =>
          qbIdSet.has(r.id?.toString())
            ? { ...r, quickbooksLinked: true }
            : r
        );
      } catch (e) {
        console.error(
          "Failed to read QuickBooks-linked receipts from localStorage:",
          e
        );
        receiptsWithIntegrations = formattedReceiptsDeduped;
      }


      setMerchants(
        Array.from(
          new Set([
            "Miscellaneous", // always present — cannot be removed
            ...receiptsWithIntegrations
              .filter((r) => !isNetworkReceivedReceipt(r))
              .map((r) => r.storeName)
              .filter(Boolean),
            ...apiMerchantsData.map((m) => m.store_name).filter(Boolean),
          ])
        ).sort((a, b) =>
          (a || "").toString().toLowerCase().localeCompare((b || "").toString().toLowerCase())
        )
      );
      setStoreImage([
        ...new Set(
          receiptsWithIntegrations.map((r) => r.store_image).filter(Boolean)
        ),
      ]);

      // Build merchantsWithImages — canonical logos are preferred in this order:
      // 1. API merchant logo (user-managed, server-stored) — always wins
      // 2. Receipt-derived logo (most recent first, localhost proxy URLs discarded)
      // This guarantees all receipts for the same merchant show the same logo.

      // Helper: strip proxy prefix and reject localhost URLs
      const cleanMerchantImage = (url) => {
        if (!url || url === "0") return "";
        const s = url.toString().trim();
        // Strip any /api/imageproxy?url= wrapper (localhost or staging)
        const marker = "/api/imageproxy?url=";
        const idx = s.indexOf(marker);
        const raw = idx !== -1 ? (() => { try { return decodeURIComponent(s.slice(idx + marker.length)); } catch { return s; } })() : s;
        // Reject localhost URLs — they are only valid in local dev
        if (/localhost|127\.0\.0\.1/i.test(raw)) return "";
        return raw;
      };

      // Step 1: seed with API merchants (highest priority — canonical logos)
      const merchantsWithImagesMap = new Map();
      apiMerchantsData.forEach(m => {
        const key = (m.store_name || "").trim().toLowerCase();
        if (!key) return;
        const cleanImg = cleanMerchantImage(m.store_image_url || "");
        merchantsWithImagesMap.set(key, { name: m.store_name, image: cleanImg });
      });

      // Step 2: fill gaps from receipt data (skip merchants already seeded from API).
      // Network-received receipts are excluded here — they appear in homepage filters only.
      receiptsWithIntegrations.forEach((r) => {
        if (isNetworkReceivedReceipt(r)) return;
        const name = r.storeName?.toString().trim();
        const rawImage = r.store_image?.toString().trim();
        if (!name || name === "0") return;
        const key = name.toLowerCase().trim();
        const cleanImg = cleanMerchantImage(rawImage);
        if (!merchantsWithImagesMap.has(key)) {
          // Merchant not yet in map — add it (even if image is empty)
          merchantsWithImagesMap.set(key, { name, image: cleanImg });
        } else if (!merchantsWithImagesMap.get(key).image && cleanImg) {
          // Merchant is in map (from API) but has no image yet — fill in from receipt
          merchantsWithImagesMap.set(key, { ...merchantsWithImagesMap.get(key), image: cleanImg });
        }
      });

// "Miscellaneous" is always present
if (!merchantsWithImagesMap.has("miscellaneous")) {
  merchantsWithImagesMap.set("miscellaneous", { name: "Miscellaneous", image: "" });
}
setMerchantsWithImages(
  Array.from(merchantsWithImagesMap.values()).sort((a, b) =>
    (a?.name || "").toString().toLowerCase().localeCompare((b?.name || "").toString().toLowerCase())
  )
);

      // NOTE: setPaymentMethods is called AFTER the enrichment step below so
      // that renamed payment methods (e.g. "SomeName *1111" → "Diners Club *1111")
      // are reflected in the payments list rather than the stale receipt values.
      setNote([
        ...new Set(
          receiptsWithIntegrations.map((r) => r.notes).filter(Boolean)
        ),
      ]);
      setReceiptImage([
        ...new Set(
          receiptsWithIntegrations
            .map((r) => r.receipt_image)
            .filter(Boolean)
        ),
      ]);
      setReceiptTags([
        ...new Set(
          receiptsWithIntegrations
            .map((r) => r.receipt_tag)
            .filter(Boolean)
        ),
      ]);

      // Enrich receipt_tax_values without overwriting stored amounts or effective rates.
      receiptsWithIntegrations = receiptsWithIntegrations.map((r) => {
        if (Array.isArray(r.receipt_tax_values) && r.receipt_tax_values.length > 0) {
          return {
            ...r,
            receipt_tax_values: enrichReceiptTaxValues(
              r.receipt_tax_values,
              taxDataArray,
              r,
            ),
          };
        }
        return r;
      });
      
      // Unique tax items by name+rate (for filters)
      // Include BOTH taxes from actual receipts AND tax definitions from API (taxData)
      // This ensures all tax types show up in filters even if no receipt uses them yet
      const uniqueTaxMap = new Map();

      // First: add all tax definitions from taxData API (these are user-created tax types)
      for (const tax of taxDataArray) {
        const name = (tax?.tax_name ?? "").toString().trim();
        const rate = (tax?.tax_rate ?? "").toString().trim();
        if (name && rate && !name.toLowerCase().includes("tip")) {
          const key = `${name}|${rate}`;
          if (!uniqueTaxMap.has(key)) uniqueTaxMap.set(key, tax);
        }
      }

      // Second: add taxes from receipts (may include taxes not in taxData)
      const flatTaxItems = receiptsWithIntegrations.flatMap((r) =>
        Array.isArray(r?.receipt_tax_values) ? r.receipt_tax_values : []
      );
      for (const tax of flatTaxItems) {
        const name = (tax?.tax_name ?? "").toString().trim();
        const rate = (tax?.tax_rate ?? "").toString().trim();
        // Only include taxes with both name and rate
        if (name && rate && rate !== "0") {
          const key = `${name}|${rate}`;
          if (!uniqueTaxMap.has(key)) uniqueTaxMap.set(key, tax);
        }
      }
      setReceiptTaxValues(Array.from(uniqueTaxMap.values()));
      
      // Enrich receipts with current API payment method data.
      // This syncs card_issuer_name + paymentType so a renamed payment method
      // (e.g. "OM *1111" → "Discover *1111") is reflected immediately without
      // needing a server-side receipt update.
      const allApiItems = [...(apiPaymentMethodsData || [])];

      // Build a map: last4 → API records that have that last4
      const last4ToApiRecs = new Map();
      allApiItems.forEach(p => {
        const l4 = getLast4FromPaymentApiRecord(p);
        if (!l4 || l4 === "0" || l4 === "-") return;
        if (!last4ToApiRecs.has(l4)) last4ToApiRecs.set(l4, []);
        last4ToApiRecs.get(l4).push(p);
      });

      receiptsWithIntegrations = receiptsWithIntegrations.map(r => {
        // Received forwarded receipts carry the SENDER's payment method — do not
        // overwrite it with the recipient's own card that happens to share the same last4.
        const forwardFromId = String(r.fk_forward_from_receipt_id ?? r.fkForwardFromReceiptId ?? "0").trim();
        if (forwardFromId && forwardFromId !== "0") {
          return syncReceiptPaymentFieldAliases(r);
        }

        const issuer  = (r.card_issuer_name  || r.cardIssuerName  || "").toString().trim();
        const last4   = (r.last_4_digit_card  || r.last4DigitCard  || "").toString().trim();
        const type    = (r.paymentType        || r.payment_type    || "").toString().trim();

        // ── Find the matching API payment-method record ────────────────────────
        let matchedRec = null;

        if (last4 && last4 !== "0") {
          const candidates = last4ToApiRecs.get(last4) || [];
          // 1. Exact issuer + last4 match (current name in API matches receipt)
          matchedRec = candidates.find(p => {
            const pIssuer = (p.card_issuer_name || "").trim().toLowerCase();
            return pIssuer && pIssuer === issuer.toLowerCase();
          });
          // 2. If no exact match, use the sole candidate (covers renames where
          //    the API issuer changed but last4 is still the same card)
          if (!matchedRec && candidates.length === 1) {
            matchedRec = candidates[0];
          }
          // 3. Multiple candidates with same last4 but no issuer match — try
          //    matching by card_type brand (paymentType often has the brand)
          if (!matchedRec && candidates.length > 1 && type) {
            const typeBase = type.replace(/\s*\*\d{3,4}$/, "").trim().toLowerCase();
            matchedRec = candidates.find(p => {
              const brand = cardTypeIntToBrand(p.card_type).toLowerCase();
              return brand && typeBase.includes(brand.split(" ")[0]);
            });
          }
        }

        if (matchedRec) {
          const enriched  = { ...r };
          const newIssuer = (matchedRec.card_issuer_name || "").trim();
          const newBrand  = cardTypeIntToBrand(matchedRec.card_type); // e.g. "Diners Club"

          // Sync card_issuer_name if the API record has a different value
          // (covers renames: "OM" → "" means card shows as "Discover *1111" now)
          if (newIssuer !== issuer) {
            enriched.card_issuer_name = newIssuer;
          }

          // Sync paymentType to the authoritative brand from card_type
          if (newBrand && newBrand !== "Other") {
            const l4Suffix = last4 && last4 !== "0" ? ` *${last4}` : "";
            const desiredType = `${newBrand}${l4Suffix}`;
            if (enriched.paymentType !== desiredType) {
              enriched.paymentType = desiredType;
            }
          }

          // Sync payment_logo_url if not already set
          if (!enriched.payment_logo_url && matchedRec.icon_image) {
            enriched.payment_logo_url = matchedRec.icon_image;
          }

          return syncReceiptPaymentFieldAliases(enriched);
        }

        // No API record found — fall back to logo-only enrichment via display key
        if (!r.payment_logo_url && !r.paymentLogoUrl) {
          const logoByIssuerLast4 = allApiItems
            .filter(p => p.icon_image)
            .find(p => {
              const pKey = getApiPaymentMethodDisplayName(p).trim().toLowerCase();
              const rKey = issuer && last4 ? `${issuer.toLowerCase()} *${last4}` : issuer.toLowerCase();
              return pKey === rKey || (p.card_number || "").trim().toLowerCase() === last4;
            });
          if (logoByIssuerLast4) {
            return syncReceiptPaymentFieldAliases({
              ...r,
              payment_logo_url: logoByIssuerLast4.icon_image,
            });
          }
        }

        return syncReceiptPaymentFieldAliases(r);
      });

      // Update receipts with enriched data (payment fields + logos + tax) and
      // build the payment methods list from the NOW-enriched receipts so renamed
      // payment methods show the updated name, not the stale one.
      // Merge: preserve receipt_forwarded="1" from in-memory state (same-session flicker)
      // and from localStorage (survives refresh and logout/login, like iOS Core Data).
      // Once the backend starts returning "1" for a receipt, the localStorage entry is
      // cleaned up automatically.
      setReceipts(prevReceipts => {
        const prevMap = new Map(prevReceipts.map(r => [String(r.id), r]));
        let locallyForwarded;
        try {
          locallyForwarded = new Set(JSON.parse(localStorage.getItem("cat_locally_forwarded") || "[]"));
        } catch {
          locallyForwarded = new Set();
        }
        const needsLocalWrite = locallyForwarded.size > 0;
        const result = receiptsWithIntegrations.map(r => {
          const rId = String(r.id);
          const prev = prevMap.get(rId);
          const shouldBeForwarded =
            (prev?.receipt_forwarded === "1") || locallyForwarded.has(rId);
          if (shouldBeForwarded && r.receipt_forwarded !== "1") {
            const merged = { ...r, receipt_forwarded: "1" };
            return { ...merged, badgeStatus: getReceiptBadgeStatus(merged) };
          }
          if (r.receipt_forwarded === "1" && locallyForwarded.has(rId)) {
            locallyForwarded.delete(rId);
          }
          return r;
        });
        if (needsLocalWrite) {
          try { localStorage.setItem("cat_locally_forwarded", JSON.stringify([...locallyForwarded])); } catch {}
        }
        return result;
      });
      // Heal runs on EVERY fetchData call (including silentRefreshData) so that
      // each new upload that re-contaminates older receipts is fixed promptly.
      // The function itself rate-limits per-signature (60 s cooldown, 5 retries).
      void healContaminatedReceiptMediaOnServer(
        formattedReceipts,
        formattedReceiptsDeduped,
        token
      );
      setPaymentMethods(
        buildPaymentMethods(
          receiptsWithIntegrations.filter((r) => !isNetworkReceivedReceipt(r))
        )
      );

      // ── Backfill payment methods from NORMAL receipts into the API ────────────
      // Payment lists (Settings/Filter/Add) are API-only (PAYMENT_METHODS_API_ONLY),
      // so a valid card entered/imported on a normal receipt would otherwise only
      // ever appear inside that one receipt's edit dropdown — never in Settings,
      // Filter, or Add Receipt. Ensure any receipt-carried card with a real 4-digit
      // last4 exists as a manageable API record. Network-forwarded receipts are
      // skipped here (syncForwardedReceiptData already reconciles those, with extra
      // forwarded-specific correction). Idempotent: methods already in the API are
      // skipped, and once created they load from the API on the next fetch so they
      // are never re-created. Requires a 4-digit last4 (the uniqueness key per the
      // app spec) so OCR noise without a card number never becomes a payment method.
      try {
        const createdSigs = new Set();
        const pmTasks = [];
        for (const receipt of receiptsWithIntegrations) {
          if (isNetworkReceivedReceipt(receipt)) continue;
          const pmLast4 = (receipt.last_4_digit_card || receipt.last4DigitCard || "")
            .replace(/\D/g, "")
            .slice(-4);
          if (pmLast4.length !== 4) continue;
          const issuerStr = (receipt.card_issuer_name || receipt.cardIssuerName || "")
            .replace(/\s*\*\d+/g, "")
            .trim();
          const payTypeStr = (receipt.paymentType || receipt.payment_type || "")
            .replace(/\s*\*\d+/g, "")
            .trim();
          if (`${issuerStr} ${payTypeStr}`.toLowerCase().includes("cash")) continue;
          const brandFromIssuer = inferCardTypeFromPayment(issuerStr);
          const resolvedBrand =
            brandFromIssuer !== "Other"
              ? brandFromIssuer
              : inferCardTypeFromPayment(payTypeStr) || "Other";
          const pmIssuer = issuerStr || payTypeStr;
          const pmSig = `${pmIssuer.toLowerCase()}|${pmLast4}`;
          if (createdSigs.has(pmSig)) continue;
          const existingPm = (apiPaymentMethodsData || []).find((pm) => {
            const eLast4 = getLast4FromPaymentApiRecord(pm);
            const eIssuer = (pm.card_issuer_name || "").trim().toLowerCase();
            if (`${eIssuer}|${eLast4}` === pmSig) return true;
            if (!eIssuer && eLast4 === pmLast4) {
              const eBrand = cardTypeIntToBrand(parseInt(pm.card_type ?? "", 10));
              if (eBrand && eBrand !== "Other" && eBrand.toLowerCase() === resolvedBrand.toLowerCase())
                return true;
            }
            return false;
          });
          if (existingPm) continue;
          createdSigs.add(pmSig);
          const pmInput =
            resolvedBrand !== "Other" ? { ...receipt, cardTypeBrand: resolvedBrand } : receipt;
          const pmLogoUrl =
            receipt.payment_logo_url || receipt.paymentDisplay?.logoUrl || "";
          pmTasks.push(addApiPaymentMethod(pmInput, pmLogoUrl, receipt.expense_type || ""));
        }
        if (pmTasks.length > 0) {
          Promise.allSettled(pmTasks).then(() => {
            fetchApiPaymentMethods();
          });
        }
      } catch (pmBackfillErr) {
        console.error("[fetchData] payment method backfill error", pmBackfillErr);
      }

      setExpenseType([
        ...new Set(
          receiptsWithIntegrations.map((r) => String(r.receipt_category))
        ),
      ]);

      const receiptDerivedCategories = [
        ...new Set(
          receiptsWithIntegrations
            .map((r) => getReceiptExpenseType(r, apiExpenseCategoriesData).trim())
            .filter(Boolean)
        ),
      ];
      const apiCategoryNames = getExpenseCategoryNamesFromApi(apiExpenseCategoriesData);
      // Receipt-derived + API names so dropdowns/filters stay in sync after fetchData.
      setExpenseCategories([
        ...new Set([...apiCategoryNames, ...receiptDerivedCategories]),
      ]);
    } catch (err) {
      setError(err.message);
      console.error("API Error:", err);
    } finally {
      if (!silentRefreshRef.current) setLoading(false);
      silentRefreshRef.current = false; // always reset after each run
    }
  }, []); // Empty dependency array - fetchTaxes is called directly, not as dependency

  // Silent refresh: reloads data in the background WITHOUT showing the full-page loading spinner.
  // Use after add/edit operations to sync with the server without disrupting the visible receipt list.
  const silentRefreshData = useCallback(async (delayMs = 1500) => {
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    silentRefreshRef.current = true;
    await fetchData();
  }, [fetchData]);

  // After login/signup: always re-fetch user profile (userFetchedRef may be stale).
  const refreshDataAfterAuth = useCallback(async () => {
    userFetchedRef.current = false;
    setUser(null);
    await fetchData();
  }, [fetchData]);

  const markRecoveryEmailVerified = useCallback(() => {
    setUser((prev) =>
      prev
        ? { ...prev, is_recovery_email_verified: 1, isRecoveryEmailVerified: true }
        : prev
    );
  }, []);

  // Persist profile fields (name + recovery / duplicate-eReceipt emails) to the backend
  // and reflect them in the in-memory user so the UI updates without a reload.
  const updateUserProfile = useCallback(async (fields) => {
    const token = localStorage.getItem("token");
    if (!token) return { ok: false, error: "Not authenticated" };
    // Only send provided fields; the backend keeps unspecified ones intact.
    const payload = {};
    if (fields.firstName !== undefined) payload.firstName = fields.firstName ?? "";
    if (fields.lastName !== undefined) payload.lastName = fields.lastName ?? "";
    if (fields.recoveryEmail !== undefined) payload.recoveryEmail = fields.recoveryEmail ?? "";
    if (fields.duplicate_eReciept_email !== undefined)
      payload.duplicate_eReciept_email = fields.duplicate_eReciept_email ?? "";
    try {
      const qs = new URLSearchParams(payload).toString();
      const res = await fetch(`${BASE_URL}/user/updateuser?${qs}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token },
        body: JSON.stringify(payload),
      });
      const text = await res.text().catch(() => "");
      let data = {};
      try { data = JSON.parse(text); } catch { /* non-JSON */ }
      if (!res.ok) return { ok: false, error: data?.message || text || "Update failed" };
      // Merge the returned/updated fields into the user context.
      const normalized = normalizeUserResponse(data) || {};
      setUser((prev) => ({ ...(prev || {}), ...normalized, ...payload }));
      return { ok: true, user: data };
    } catch (err) {
      return { ok: false, error: err?.message || "Update failed" };
    }
  }, []);

  const clearAllData = () => {
    userFetchedRef.current = false;
    setUser(null);
    setReceipts([]);
    setMerchants(["Miscellaneous"]);
    setExpenseCategories([]);
    setStoreNames([]);
    setPaymentMethods([]);
    setNote([]);
    setReceiptTags([]);
    setReceiptImage([]);
    setReceiptTaxValues([]);
    setReceiptCategory([]);
    setExpenseType([]);
    setTaxData([]);
    setStoreImage([]);
    setPurchasePrice([]);
    setMerchantsWithImages([{ name: "Miscellaneous", image: "" }]);
    setDataContent(null);
    // Clear custom receipt-info items and API merchants/payments/categories on logout so next user gets a clean slate
    setApiMerchants([]);
    setApiPaymentMethods([]);
    setApiExpenseCategories([]);
    setCustomMerchants([]);
    setCustomCategories([]);
    setCustomPaymentMethods([]);
    setHiddenMerchants(new Set());
    setHiddenCategories(new Set());
    setHiddenPaymentMethods(new Set());
    // Note: Don't clear taxes here - they should persist
  };

  useEffect(() => {
    const token = localStorage.getItem("token");
    // Only fetch data if token exists
    // fetchData now fetches all APIs in parallel (receipts, taxes, merchants, PMs, categories)
    if (token) {
      fetchData();
    } else {
      setLoading(false);
    }
  }, [fetchData]);

  useEffect(() => {
    const onSessionExpired = () => clearAllData();
    window.addEventListener("cat:session-expired", onSessionExpired);
    return () => window.removeEventListener("cat:session-expired", onSessionExpired);
  }, []);

  // Add updateReceiptStatus function
  const updateReceiptStatus = async (receiptId, newStatus) => {
    try {
      // Update local state immediately for responsive UI
      setReceipts(prevReceipts =>
        prevReceipts.map(receipt =>
          receipt.id === receiptId ? { ...receipt, status: newStatus } : receipt
        )
      );


      return true;
    } catch (error) {
      console.error("Failed to update receipt status:", error);
      // Revert the local state change if the API call fails
      setReceipts(prevReceipts =>
        prevReceipts.map(receipt =>
          receipt.id === receiptId ? { ...receipt, status: receipt.status } : receipt
        )
      );
      return false;
    }
  };

  // Delete receipt function - calls backend API to permanently delete
  // API uses query parameter: ?receiptid=123
  const deleteReceipt = async (receiptId) => {
    const token = localStorage.getItem("token");

    if (!token) {
      console.error("No authentication token found");
      return false;
    }

    // Try multiple possible endpoints with query parameter
    const endpoints = [
      `${BASE_URL}/receipt/deleteReceipt?receiptid=${receiptId}`,
      `${BASE_URL}/receipt/deletereceiptv1?receiptid=${receiptId}`,
      `${BASE_URL}/receipt/deleteReceiptv1?receiptid=${receiptId}`,
    ];

    let deleteSuccess = false;

    for (const endpoint of endpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accesstoken: token,
          },
        });

        // Check if response is ok (200-299 status codes)
        if (response.ok) {
          const responseData = await response.json().catch(() => ({}));
          // Some APIs return success in different formats, check for common patterns
          const isSuccess = 
            responseData.success === true ||
            responseData.status === "success" ||
            responseData.message?.toLowerCase().includes("success") ||
            responseData.message?.toLowerCase().includes("deleted") ||
            response.status === 200;

          if (isSuccess) {
            deleteSuccess = true;
            break;
          }
        }
      } catch (error) {
        console.warn(`Delete endpoint ${endpoint} failed: ${error.message}`);
      }
    }

    if (deleteSuccess) {
      // API succeeded - remove from local state immediately
      const deletedReceipt = receipts.find(r => r.id === receiptId);
      const updatedReceipts = receipts.filter(r => r.id !== receiptId);
      setReceipts(updatedReceipts);

      // If the deleted receipt had a merchant, remove it from the merchant lists
      // if no other receipt shares the same merchant name.
      if (deletedReceipt) {
        const merchantName = (deletedReceipt.storeName || deletedReceipt.store_name || "").toString().trim();
        if (merchantName && merchantName.toLowerCase() !== "miscellaneous") {
          const stillExists = updatedReceipts.some(r =>
            (r.storeName || r.store_name || "").toString().trim() === merchantName
          );
          if (!stillExists) {
            setMerchants(prev => prev.filter(m => m !== merchantName));
            setMerchantsWithImages(prev => prev.filter(m => m.name !== merchantName));
          }
        }

        // Same for expense categories
        const category = (deletedReceipt.expense_type || deletedReceipt.expenseType || "").toString().trim();
        if (category && category !== "0") {
          const catStillExists = updatedReceipts.some(r =>
            (r.expense_type || r.expenseType || "").toString().trim() === category
          );
          if (!catStillExists) {
            setExpenseCategories(prev => prev.filter(c => c !== category));
          }
        }

        // Same for payment methods — rebuild the display string from the deleted receipt
        const issuer = (deletedReceipt.card_issuer_name || deletedReceipt.cardIssuerName || "").toString().trim();
        const last4  = (deletedReceipt.last_4_digit_card || deletedReceipt.last4DigitCard || "").toString().trim();
        const payDisplay = issuer && issuer !== "0"
          ? (last4 && last4 !== "0" ? `${issuer} *${last4}` : issuer)
          : (deletedReceipt.paymentType || deletedReceipt.payment_type || "").toString().trim();
        if (payDisplay && payDisplay !== "0") {
          const payStillExists = updatedReceipts.some(r => {
            const rIssuer = (r.card_issuer_name || r.cardIssuerName || "").toString().trim();
            const rLast4  = (r.last_4_digit_card || r.last4DigitCard || "").toString().trim();
            const rDisp   = rIssuer && rIssuer !== "0"
              ? (rLast4 && rLast4 !== "0" ? `${rIssuer} *${rLast4}` : rIssuer)
              : (r.paymentType || r.payment_type || "").toString().trim();
            return rDisp === payDisplay;
          });
          if (!payStillExists) {
            setPaymentMethods(prev => prev.filter(p => p !== payDisplay));
          }
        }
      }

      return true;
    }

    // All endpoints failed - don't delete locally, return false
    console.error(`Failed to delete receipt ${receiptId}. All endpoints failed.`);
    return false;
  };

  const postReceiptUpdatePayload = async (payload, token) => {
    if (!token || !payload?.id) return false;
    const editEndpoints = [
      `${BASE_URL}/receipt/updateReceiptv1`,
      `${BASE_URL}/receipt/editReceiptv1`,
    ];
    for (const endpoint of editEndpoints) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accesstoken: token,
          },
          body: JSON.stringify(payload),
        });
        if (response.ok) return true;
        const errText = await response.text().catch(() => "");
        console.warn(
          `[Media heal] ${endpoint} HTTP ${response.status}:`,
          errText.slice(0, 200)
        );
      } catch (err) {
        console.warn(`[Media heal] ${endpoint} failed:`, err.message);
      }
    }
    return false;
  };

  const buildReceiptUpdatePayloadFromRow = (receipt) => {
    const rawPaymentType = normalizePaymentField(receipt.paymentType ?? receipt.payment_type);
    const normalizedPaymentType = rawPaymentType.replace(/\s*\*\d{3,4}/g, "").trim();
    const rawIssuerName = normalizePaymentField(receipt.card_issuer_name ?? receipt.cardIssuerName);
    const rawLast4 = normalizePaymentField(receipt.last_4_digit_card ?? receipt.last4DigitCard);
    const inferredLast4 = (() => {
      if (!rawPaymentType.includes("*")) return "";
      const matches = [...rawPaymentType.matchAll(/\*(\d{3,4})/g)];
      return matches.length > 0 ? matches[matches.length - 1][1] : "";
    })();
    const hasPayment = !!(normalizedPaymentType || rawIssuerName || rawLast4 || inferredLast4);

    return {
      id: parseInt(receipt.id),
      storeName: receipt.storeName ?? "",
      product_name: receipt.product_name ?? "",
      emailAttachment: receipt.emailAttachment ?? "0",
      purchasePrice: (receipt.purchasePrice ?? receipt.total_amount ?? "0").toString(),
      total_amount: (receipt.total_amount ?? receipt.purchasePrice ?? "0").toString(),
      payment_category_type: parseInt(receipt.payment_category_type ?? 0) || 0,
      status: parseInt(receipt.status ?? 0) || 0,
      paymentType: hasPayment ? normalizedPaymentType : CLEAR_PAYMENT_API_VALUE,
      last_4_digit_card: hasPayment ? (rawLast4 || inferredLast4 || "") : CLEAR_PAYMENT_API_VALUE,
      card_issuer_name: hasPayment ? rawIssuerName : CLEAR_PAYMENT_API_VALUE,
      fk_original_receipt_id: receipt.fk_original_receipt_id ?? "0",
      fk_forward_from_receipt_id: receipt.fk_forward_from_receipt_id ?? "0",
      receipt_category: parseInt(receipt.receipt_category ?? 0) || 0,
      product_date: parseInt(receipt.product_date ?? 0) || 0,
      expense_type: receipt.expense_type ?? "",
      receipt_image: receipt.receipt_image ?? "0",
      store_image: receipt.store_image ?? "",
      notes: receipt.notes ?? "",
      receipt_forwarded: receipt.receipt_forwarded ?? "0",
      receipt_tag: receipt.receipt_tag ?? "",
      is_draft: parseInt(receipt.is_draft ?? 0) || 0,
      is_verify: parseInt(receipt.is_verify ?? 0) || 0,
      create_date: receipt.create_date ?? "",
      // Preserve real taxes: if this row carries none, restore the freshest fetched
      // tax lines so a full-row update never deletes iOS-forwarded taxes.
      receipt_tax_values:
        Array.isArray(receipt.receipt_tax_values) && receipt.receipt_tax_values.length > 0
          ? receipt.receipt_tax_values
          : (resolveFreshestReceiptTaxValues(receipt.id) ||
             (Array.isArray(receipt.receipt_tax_values) ? receipt.receipt_tax_values : [])),
    };
  };

  // Resolve the freshest, non-empty tax lines for a receipt from the most recent fetch.
  // Forwarded-receipt backfill updates hit updateReceiptv1, which replaces the whole row,
  // so we must always send the real (iOS-forwarded) taxes — never an empty array that
  // would delete them. Returns null when no non-empty tax lines are known yet.
  const resolveFreshestReceiptTaxValues = (receiptId) => {
    const fresh = (lastRawReceiptsRef.current || []).find(
      (r) => String(r.id) === String(receiptId)
    );
    if (Array.isArray(fresh?.receipt_tax_values) && fresh.receipt_tax_values.length > 0) {
      return fresh.receipt_tax_values;
    }
    return null;
  };

  // Remap a sender's original tax lines onto the recipient's receipt so a backfill update
  // can restore taxes the recipient copy hasn't received yet (keeps them "as in iOS").
  const remapTaxValuesToRecipient = (taxLines, recipientReceiptId) => {
    const recipientUserId = parseInt(localStorage.getItem("fk_user_id")) || 0;
    return (taxLines || [])
      .filter((t) => (t?.tax_name || "").trim() && !/^tip$/i.test((t.tax_name || "").trim()))
      .map((t) => ({
        id: 0,
        fk_user_id: recipientUserId,
        fk_receipt_id: parseInt(recipientReceiptId) || 0,
        fk_tax_id: parseInt(t.fk_tax_id) || 0,
        tax_name: t.tax_name || "",
        tax_rate: (t.tax_rate ?? "0").toString(),
        tax_amount: (parseFloat(t.tax_amount) || 0).toString(),
        created: 0,
        updated: 0,
      }));
  };

  const markReceiptAsForwarded = async (receiptId) => {
    const token = localStorage.getItem("token");
    if (!token || !receiptId) return;
    const existingReceipt = receipts.find(r => String(r.id) === String(receiptId));
    if (!existingReceipt) return;
    const payload = buildReceiptUpdatePayloadFromRow({
      ...existingReceipt,
      receipt_forwarded: "1",
    });
    await postReceiptUpdatePayload(payload, token);
    // Persist locally so badge survives refresh and logout/login
    // (equivalent to iOS Core Data — backend doesn't update the source receipt)
    try {
      const set = new Set(JSON.parse(localStorage.getItem("cat_locally_forwarded") || "[]"));
      set.add(String(receiptId));
      localStorage.setItem("cat_locally_forwarded", JSON.stringify([...set]));
    } catch { /* quota */ }
    setReceipts(prev => prev.map(r => {
      if (String(r.id) !== String(receiptId)) return r;
      const updated = { ...r, receipt_forwarded: "1" };
      return { ...updated, badgeStatus: getReceiptBadgeStatus(updated) };
    }));
  };

  /**
   * uploadmediaV1 can attach the same file URL to many receipts on the server.
   * Push deduped media back via updateReceiptv1 so Android and future fetches
   * receive only each receipt's owned attachments.
   */
  const healContaminatedReceiptMediaOnServer = async (
    rawReceipts,
    cleanedReceipts,
    token,
    { force = false } = {}
  ) => {
    if (!token || mediaHealInFlightRef.current) return;
    if (!Array.isArray(rawReceipts) || !Array.isArray(cleanedReceipts)) return;

    const cleanedById = new Map(
      cleanedReceipts.map((r) => [r.id?.toString(), r])
    );
    const toHeal = rawReceipts
      .map((raw) => ({ raw, cleaned: cleanedById.get(raw.id?.toString()) }))
      .filter(
        ({ raw, cleaned }) =>
          cleaned &&
          receiptMediaStorageKey(raw) !== receiptMediaStorageKey(cleaned)
      );

    if (toHeal.length === 0) return true;

    const signature = toHeal
      .map(({ raw, cleaned }) => `${raw.id}:${receiptMediaStorageKey(cleaned)}`)
      .sort()
      .join("|");

    const HEAL_COOLDOWN_MS = 15_000;
    const MAX_FAIL_COUNT = 8;
    const now = Date.now();
    const prev = healAttemptMapRef.current.get(signature);
    if (!force && prev) {
      if (prev.failCount >= MAX_FAIL_COUNT) {
        console.warn(
          "[Media heal] Giving up on signature after repeated failures:",
          signature
        );
        return;
      }
      if (now - prev.lastAttemptTs < HEAL_COOLDOWN_MS) return;
    }

    mediaHealInFlightRef.current = true;
    healAttemptMapRef.current.set(signature, {
      lastAttemptTs: now,
      failCount: prev?.failCount ?? 0,
    });

    try {
      console.log(
        `%c[Media heal] Persisting cleaned attachments for ${toHeal.length} receipt(s)`,
        "color:#0ea5e9;font-weight:bold"
      );
      let anyFailed = false;
      for (const { cleaned } of toHeal) {
        const ok = await postReceiptUpdatePayload(
          buildReceiptUpdatePayloadFromRow(cleaned),
          token
        );
        if (!ok) {
          anyFailed = true;
          console.warn(`[Media heal] updateReceiptv1 failed for receipt ${cleaned.id}`);
        }
      }
      // Update fail counter so we can give up after persistent failures
      const cur = healAttemptMapRef.current.get(signature) ?? { lastAttemptTs: now, failCount: 0 };
      healAttemptMapRef.current.set(signature, {
        lastAttemptTs: cur.lastAttemptTs,
        failCount: anyFailed ? cur.failCount + 1 : 0, // reset on full success
      });
      if (!anyFailed) {
        console.log(
          `%c[Media heal] Successfully cleaned ${toHeal.length} receipt(s) — Android will now receive correct attachments`,
          "color:#22c55e;font-weight:bold"
        );
      }
      return !anyFailed;
    } finally {
      mediaHealInFlightRef.current = false;
    }
  };

  /**
   * Push deduped media to the server (iOS only ever stores one receipt's URL).
   * Call with force:true right after uploadmediaV1 — that endpoint re-contaminates
   * every receipt on the backend until we write the cleaned values back.
   */
  const fetchRawReceiptsForMediaHeal = async (token) => {
    const fk_user_id = localStorage.getItem("fk_user_id");
    if (!fk_user_id) return [];
    const receiptRes = await fetch(
      `${BASE_URL}/user/getreceiptfromdatev1?fk_user_id=${fk_user_id}&date_time_stamp=14000997`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Accesstoken: token,
        },
      }
    );
    if (!receiptRes.ok) return [];
    const receiptData = await receiptRes.json();
    if (Array.isArray(receiptData)) return receiptData;
    if (Array.isArray(receiptData?.receipts)) return receiptData.receipts;
    return [];
  };

  const repairReceiptMediaOnServer = useCallback(
    async ({ force = false } = {}) => {
      const token = localStorage.getItem("token");
      if (!token) return false;

      let raw = lastRawReceiptsRef.current;
      if (force || !Array.isArray(raw) || raw.length === 0) {
        const fresh = await fetchRawReceiptsForMediaHeal(token);
        if (fresh.length > 0) {
          raw = fresh;
          lastRawReceiptsRef.current = fresh;
        }
      }
      if (!Array.isArray(raw) || raw.length === 0) return false;

      const cleaned = dedupeReceiptMediaAcrossReceipts(raw);
      const ok = await healContaminatedReceiptMediaOnServer(
        raw,
        cleaned,
        token,
        { force }
      );
      if (ok && force) {
        await silentRefreshData(0);
      }
      return ok;
    },
    [silentRefreshData]
  );

  // Update receipt function - calls backend API to persist changes
  // API expects id field in the body for update
  const updateReceipt = async (receiptId, updates) => {
    const token = localStorage.getItem("token");

    if (!token) {
      console.error("No authentication token found");
      return false;
    }

    try {
      // Get existing receipt to preserve values for fields not being updated
      const receiptIdStr = receiptId?.toString();
      const existingReceipt = receipts.find(
        (r) => r.id?.toString() === receiptIdStr
      );
      const receiptMatchesId = (r) => r.id?.toString() === receiptIdStr;
      
      // Filter out frontend-only fields that shouldn't be sent to API
      const frontendOnlyFields = ['quickbooksLinked', 'paymentDisplay', 'badgeStatus', 'subtotal'];
      const apiUpdates = Object.keys(updates).reduce((acc, key) => {
        if (!frontendOnlyFields.includes(key)) {
          acc[key] = updates[key];
        }
        return acc;
      }, {});
      
      // If we only have frontend-only fields, skip API call entirely
      // This prevents unnecessary updateReceiptv1 calls when only updating UI state (like quickbooksLinked)
      if (Object.keys(apiUpdates).length === 0) {
        // Update local state for frontend-only fields
        setReceipts(prevReceipts => {
          return prevReceipts.map(receipt =>
            receiptMatchesId(receipt) ? { ...receipt, ...updates } : receipt
          );
        });
        return true;
      }
      
      // If we have API fields but no existing receipt, we can't update
      if (!existingReceipt) {
        // Still update local state
        setReceipts(prevReceipts => {
          return prevReceipts.map(receipt =>
            receiptMatchesId(receipt) ? { ...receipt, ...updates } : receipt
          );
        });
        return false;
      }
      
      // Helper function to get value from updates or fallback to existing receipt
      const getValue = (field, defaultValue = null) => {
        // Check if field is in apiUpdates (filtered updates)
        if (apiUpdates.hasOwnProperty(field)) {
          const value = apiUpdates[field];
          // Handle null/undefined/empty string - use existing value if available
          if (value === null || value === undefined || value === "") {
            // For empty strings, check if we should preserve existing value
            // Some fields like notes can be empty, so we need to be careful
            if (field === "notes" || field === "expense_type" || field === "product_name" || field === "storeName" || field === "card_issuer_name" || field === "paymentType" || field === "last_4_digit_card") {
              // These fields can legitimately be empty, so use empty string if provided
              return value === "" ? "" : (existingReceipt?.[field] ?? defaultValue);
            }
            return existingReceipt?.[field] ?? defaultValue;
          }
          return value;
        }
        // If field not in updates, use existing value
        return existingReceipt?.[field] ?? defaultValue;
      };

      // Build payment fields safely so partial updates (e.g. merchant/category rename)
      // do not accidentally downgrade card brand to "Other" on backend.
      const rawPaymentType = (getValue("paymentType", "") ?? "").toString().trim();
      const normalizedPaymentType = rawPaymentType.replace(/\s*\*\d{3,4}/g, "").trim();
      const rawIssuerName = (getValue("card_issuer_name", "") ?? "").toString().trim();
      const rawLast4 = (getValue("last_4_digit_card", "") ?? "").toString().trim();
      const inferredLast4FromPayment = (() => {
        if (!rawPaymentType.includes("*")) return "";
        const matches = [...rawPaymentType.matchAll(/\*(\d{3,4})/g)];
        return matches.length > 0 ? matches[matches.length - 1][1] : "";
      })();

      // Server ignores empty strings on update — must send "0" to clear payment fields.
      const clearingPayment =
        apiUpdates.hasOwnProperty("paymentType") &&
        apiUpdates.paymentType === "" &&
        apiUpdates.hasOwnProperty("card_issuer_name") &&
        apiUpdates.card_issuer_name === "" &&
        apiUpdates.hasOwnProperty("last_4_digit_card") &&
        apiUpdates.last_4_digit_card === "";

      // Never persist uploadmediaV1 cross-receipt contamination: each receipt may
      // only store media URLs it owns after global dedupe (newest receipt wins).
      const receiptsForMediaResolve = receipts.map((r) =>
        receiptMatchesId(r) ? { ...r, ...apiUpdates } : r
      );
      const apiMediaFields = resolveReceiptMediaFieldsForApi(
        receiptId,
        apiUpdates,
        receiptsForMediaResolve
      );

      // Build the update payload matching API model
      // Only update fields that are provided, preserve existing values for others
      const updatePayload = clearingPayment
        ? buildReceiptUpdatePayloadFromRow({
            ...existingReceipt,
            ...apiUpdates,
            paymentType: "",
            payment_type: "",
            card_issuer_name: "",
            last_4_digit_card: "",
            payment_logo_url: "",
            emailAttachment: apiMediaFields.emailAttachment,
            receipt_image: apiMediaFields.receipt_image,
          })
        : {
        id: parseInt(receiptId),
        storeName: getValue("storeName", ""),
        product_name: getValue("product_name", ""),
        emailAttachment: apiMediaFields.emailAttachment,
        // Preserve purchasePrice - only update if explicitly provided
        purchasePrice: (() => {
          const val = getValue("purchasePrice");
          if (val === null || val === undefined) return existingReceipt?.purchasePrice?.toString() || existingReceipt?.total_amount?.toString() || "0";
          return val.toString();
        })(),
        total_amount: (() => {
          const val = getValue("total_amount") ?? getValue("purchasePrice");
          if (val === null || val === undefined) return existingReceipt?.total_amount?.toString() || existingReceipt?.purchasePrice?.toString() || "0";
          return val.toString();
        })(),
        payment_category_type: (() => {
          const val = getValue("payment_category_type");
          if (val === null || val === undefined) return existingReceipt?.payment_category_type ?? 0;
          return parseInt(val) || 0;
        })(),
        status: (() => {
          const val = getValue("status");
          if (val === null || val === undefined) return existingReceipt?.status ?? 0;
          return parseInt(val) || 0;
        })(),
        paymentType: normalizedPaymentType,
        last_4_digit_card: rawLast4 || inferredLast4FromPayment || "",
        card_issuer_name: rawIssuerName,
        fk_original_receipt_id: getValue("fk_original_receipt_id", "0"),
        fk_forward_from_receipt_id: getValue("fk_forward_from_receipt_id", "0"),
        fk_forward_from_user_id: getValue("fk_forward_from_user_id", "0"),
        originalUsername: getValue("originalUsername") ?? getValue("original_username") ?? existingReceipt?.originalUsername ?? null,
        payment_logo_url: getValue("payment_logo_url") ?? getValue("paymentLogoUrl") ?? existingReceipt?.payment_logo_url ?? "",
        // Preserve receipt_category - only update if explicitly provided
        receipt_category: (() => {
          const val = getValue("receipt_category");
          if (val === null || val === undefined) return existingReceipt?.receipt_category ?? 0;
          const parsed = parseInt(val);
          return isNaN(parsed) ? (existingReceipt?.receipt_category ?? 0) : parsed;
        })(),
        product_date: (() => {
          const val = getValue("product_date");
          if (val === null || val === undefined) {
            return calendarUnixToMobileUnix(
              existingReceipt?.product_date ?? 0,
              existingReceipt?.create_date,
              {
                isDraft:
                  existingReceipt?.is_draft === "1" ||
                  existingReceipt?.is_draft === 1,
                fk_incoming_email_id: existingReceipt?.fk_incoming_email_id,
              },
            );
          }
          const parsed = parseInt(val, 10);
          if (isNaN(parsed)) {
            return calendarUnixToMobileUnix(
              existingReceipt?.product_date ?? 0,
              existingReceipt?.create_date,
              {
                isDraft:
                  existingReceipt?.is_draft === "1" ||
                  existingReceipt?.is_draft === 1,
                fk_incoming_email_id: existingReceipt?.fk_incoming_email_id,
              },
            );
          }
          return calendarUnixToMobileUnix(
            parsed,
            existingReceipt?.create_date ?? getValue("create_date"),
            {
              isDraft:
                getValue("is_draft") === "1" ||
                getValue("is_draft") === 1 ||
                existingReceipt?.is_draft === "1" ||
                existingReceipt?.is_draft === 1,
              fk_incoming_email_id:
                getValue("fk_incoming_email_id") ??
                existingReceipt?.fk_incoming_email_id,
            },
          );
        })(),
        expense_type: (() => {
          const val = getValue("expense_type");
          // If expense_type is explicitly provided (even if empty), use it
          // Otherwise preserve existing value
          if (apiUpdates.hasOwnProperty("expense_type")) {
            return val || "";
          }
          // If not in updates, preserve existing value
          return existingReceipt?.expense_type ?? "";
        })(),
        receipt_image: apiMediaFields.receipt_image,
        store_image: getValue("store_image", ""),
        notes: getValue("notes", ""),
        receipt_forwarded: getValue("receipt_forwarded", "0"),
        receipt_tag: getValue("receipt_tag", ""),
        // Persist draft/verify transitions (e.g. draft -> regular receipt after save)
        is_draft: (() => {
          const val = getValue("is_draft");
          if (val === null || val === undefined) return parseInt(existingReceipt?.is_draft ?? 0) || 0;
          return parseInt(val) || 0;
        })(),
        is_verify: (() => {
          const val = getValue("is_verify");
          if (val === null || val === undefined) return parseInt(existingReceipt?.is_verify ?? 0) || 0;
          return parseInt(val) || 0;
        })(),
        create_date: getValue("create_date", ""),
        // Never wipe taxes on a partial update (e.g. only is_verify). If the caller
        // did not pass tax lines and the in-state copy has none yet (common right
        // after an iOS forward), fall back to the freshest fetched tax values.
        receipt_tax_values: (() => {
          const candidate = getValue("receipt_tax_values", []);
          if (Array.isArray(candidate) && candidate.length > 0) return candidate;
          return resolveFreshestReceiptTaxValues(receiptId) || (Array.isArray(candidate) ? candidate : []);
        })(),
      };

      // Try multiple possible endpoints
      const editEndpoints = [
        `${BASE_URL}/receipt/updateReceiptv1`,
        `${BASE_URL}/receipt/editReceiptv1`,
        `${BASE_URL}/receipt/updateReceipt`,
        `${BASE_URL}/receipt/editReceipt`,
      ];

      let success = false;
      for (const endpoint of editEndpoints) {
        try {
          const response = await fetch(endpoint, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accesstoken: token,
            },
            body: JSON.stringify(updatePayload),
          });

          const text = await response.text();
          let json;
          try {
            json = text ? JSON.parse(text) : null;
          } catch {
            json = text;
          }

          if (response.ok) {
            console.log(`%c[Receipt Update] ${endpoint} response status:`, "color:#22c55e;font-weight:bold", response.status);
            console.log(`%c[Receipt Update] ${endpoint} response (full):`, "color:#22c55e;font-weight:bold", json);
            success = true;
            break;
          }
        } catch (err) {
          console.warn(`Update endpoint ${endpoint} failed: ${err.message}`);
        }
      }

      // Update local state regardless
      setReceipts(prevReceipts => {
        const paymentFieldsChanged =
          updates.paymentType !== undefined ||
          updates.card_issuer_name !== undefined ||
          updates.last_4_digit_card !== undefined;
        const updatedReceipts = prevReceipts.map(receipt => {
          if (!receiptMatchesId(receipt)) return receipt;
          const merged = syncReceiptPaymentFieldAliases({ ...receipt, ...updates });
          if (paymentFieldsChanged) {
            const cleared =
              (updates.paymentType === "" || merged.paymentType === "") &&
              !(merged.card_issuer_name || "").toString().trim() &&
              !(merged.last_4_digit_card || "").toString().trim();
            merged.payment_logo_url = "";
            merged.paymentLogoUrl = "";
            if (cleared) {
              merged.paymentBrand = "";
              merged.payment_method_name = "";
            }
          }
          if (updates.receipt_forwarded !== undefined) {
            merged.badgeStatus = getReceiptBadgeStatus(merged);
          }
          return merged;
        });

        // Also update payment methods list if paymentType changed
        if (updates.paymentType !== undefined) {
          setTimeout(() => {
            setPaymentMethods(buildPaymentMethods(updatedReceipts));
          }, 0);
        }

        // Also update expenseCategories if expense_type changed
        if (updates.expense_type !== undefined) {
          setTimeout(() => {
            setExpenseCategories([
              ...new Set(
                updatedReceipts
                  .map((r) => (r.expense_type ?? "").toString().trim())
                  .filter(Boolean)
              ),
            ]);
          }, 0);
        }

        return dedupeReceiptMediaAcrossReceipts(updatedReceipts);
      });

      if (!success) {
        console.warn("All update endpoints failed. Updated locally only.");
      }
      return true;
    } catch (error) {
      console.warn("Update failed:", error.message);
      setReceipts(prevReceipts => {
        const updatedReceipts = prevReceipts.map(receipt =>
          receiptMatchesId(receipt) ? { ...receipt, ...updates } : receipt
        );
        return dedupeReceiptMediaAcrossReceipts(updatedReceipts);
      });
      return true;
    }
  };

  // Optimistically add a custom expense category so it immediately appears in filters.
  const addExpenseCategory = (category) => {
    if (!category) return;
    const trimmed = category.toString().trim();
    if (!trimmed) return;
    setExpenseCategories((prev) =>
      prev.includes(trimmed) ? prev : [...prev, trimmed]
    );
  };

  // ── Custom Merchant CRUD ──
  const addCustomMerchant = useCallback((name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    setCustomMerchants((prev) => {
      if (prev.some((m) => m.toLowerCase() === trimmed.toLowerCase())) return prev;
      const next = [...prev, trimmed];
      localStorage.setItem("cat_custom_merchants", JSON.stringify(next));
      return next;
    });
  }, []);

  const editCustomMerchant = useCallback((oldName, newName) => {
    const trimmed = (newName || "").trim();
    if (!trimmed) return;
    setCustomMerchants((prev) => {
      const next = prev.map((m) => m === oldName ? trimmed : m);
      localStorage.setItem("cat_custom_merchants", JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteCustomMerchant = useCallback((name) => {
    setCustomMerchants((prev) => {
      const next = prev.filter((m) => m !== name);
      localStorage.setItem("cat_custom_merchants", JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Merchant logo persistence (localStorage) ──
  const saveMerchLogo = useCallback((name, url) => {
    if (!name || !url) return;
    try {
      const logos = JSON.parse(localStorage.getItem("cat_merch_logos") || "{}");
      logos[name] = url;
      localStorage.setItem("cat_merch_logos", JSON.stringify(logos));
    } catch (e) { console.error("saveMerchLogo error", e); }
  }, []);

  // When a forwarded receipt arrives, auto-add any merchant, payment method,
  // expense category, or tax type that doesn't yet exist in the recipient's account.
  const syncForwardedReceiptData = useCallback(async (receipt) => {
    if (!receipt) return;
    const tasks = [];

    // Merchant + logo
    const storeName = (receipt.storeName || receipt.store_name || "").trim();
    const storeImage = receipt.store_image || receipt.storeImage || "";
    if (storeName) {
      const existingMerchant = (apiMerchants || []).find(
        (m) => (m.store_name || "").toLowerCase() === storeName.toLowerCase()
      );
      if (!existingMerchant) {
        let logoToUse = storeImage;
        if (!logoToUse) {
          // Sender used a local app asset (no URL) — try prefix-match against known merchants.
          // e.g. "Target - iOS" starts with "Target" → use Target's logo.
          const storeNameLower = storeName.toLowerCase();
          const partialApi = (apiMerchants || []).find(
            (m) => m.store_image_url && storeNameLower.startsWith((m.store_name || "").toLowerCase())
          );
          if (partialApi) {
            logoToUse = partialApi.store_image_url;
          } else {
            const partialDef = DEFAULT_MERCHANTS_WITH_LOGOS.find(
              (d) => d.image && storeNameLower.startsWith((d.name || "").toLowerCase())
            );
            if (partialDef) logoToUse = partialDef.image;
          }
        }
        tasks.push(addApiMerchant(storeName, logoToUse));
        if (logoToUse) {
          saveMerchLogo(storeName, logoToUse);
          // Patch store_image on the in-memory receipt so the card re-renders immediately
          // with the resolved logo instead of waiting for the next full data fetch.
          if (receipt.id) {
            setReceipts((prev) =>
              prev.map((r) =>
                String(r.id) === String(receipt.id) && !r.store_image
                  ? { ...r, store_image: logoToUse }
                  : r
              )
            );
            tasks.push(
              (async () => {
                const token = localStorage.getItem("token");
                if (!token) return;
                // Full-row update: updateReceiptv1 replaces the whole row, so a minimal
                // {id, store_image} patch would delete taxes and every other field.
                const payload = buildReceiptUpdatePayloadFromRow({
                  ...receipt,
                  store_image: logoToUse,
                });
                await postReceiptUpdatePayload(payload, token);
              })()
            );
          }
        }
      } else if (storeImage && !existingMerchant.store_image_url) {
        tasks.push(updateApiMerchant(existingMerchant.id, storeName, storeImage));
        saveMerchLogo(storeName, storeImage);
      } else if (existingMerchant.store_image_url) {
        // WebApp already has a canonical logo for this merchant.
        // Patch the forwarded receipt to use it so the receipt card shows
        // the WebApp logo instead of the sender's logo.
        const canonicalLogo = existingMerchant.store_image_url;
        saveMerchLogo(storeName, canonicalLogo);
        if (receipt.id && storeImage && storeImage !== canonicalLogo) {
          tasks.push(
            (async () => {
              const token = localStorage.getItem("token");
              if (!token) return;
              // Full-row update so this logo patch never wipes taxes/other fields.
              const payload = buildReceiptUpdatePayloadFromRow({
                ...receipt,
                store_image: canonicalLogo,
              });
              await postReceiptUpdatePayload(payload, token);
            })()
          );
        }
      }
    }

    // Payment method — direct comparison so non-standard card types (e.g. "Coffee") work too
    const pmLast4 = (receipt.last_4_digit_card || "").replace(/\D/g, "").slice(-4);
    const pmIssuer = (receipt.card_issuer_name || "").trim()
      || (receipt.paymentType || "").replace(/\s*\*\d+/g, "").trim();
    if (pmLast4 || pmIssuer) {
      const pmSig = `${pmIssuer.toLowerCase()}|${pmLast4}`;

      // Resolve brand early — needed for both the alreadyHave check and logo/type resolution.
      // When the issuer is a custom name (e.g. "Nokia"), infer brand from paymentType
      // ("Discover") so card_type and logo are set correctly on Account B.
      const issuerStr = (receipt.card_issuer_name || "").replace(/\s*\*\d+/g, "").trim();
      const payTypeStr = (receipt.paymentType || "").replace(/\s*\*\d+/g, "").trim();
      const brandFromIssuer = inferCardTypeFromPayment(issuerStr);
      const resolvedBrand = brandFromIssuer !== "Other"
        ? brandFromIssuer
        : (inferCardTypeFromPayment(payTypeStr) || "Other");

      const existingPm = (apiPaymentMethods || []).find((pm) => {
        // API PM objects use card_number (not last_4_digit_card) for the last4 field
        const eLast4 = getLast4FromPaymentApiRecord(pm);
        const eIssuer = (pm.card_issuer_name || "").trim().toLowerCase();
        if (`${eIssuer}|${eLast4}` === pmSig) return true;
        // Brand-only PMs (Cash, Visa, etc.) are stored with card_issuer_name="" because
        // storedCardIssuerName returns "" when the issuer name equals the brand.
        // Fall back to card_type integer match so Cash (type 7) never duplicates.
        if (!eIssuer && eLast4 === pmLast4) {
          const eBrand = cardTypeIntToBrand(parseInt(pm.card_type ?? "", 10));
          if (eBrand && eBrand !== "Other" && eBrand.toLowerCase() === resolvedBrand.toLowerCase()) return true;
        }
        return false;
      });
      const alreadyHave = !!existingPm;

      // Prefer explicit logo from the forwarded receipt; fall back to the standard
      // logo for the detected card type so custom PMs (e.g. "HeadPhoneSONY") at
      // minimum store the generic credit-card icon instead of an empty string.
      const PM_LOGO_MAP = {
        Visa: "/payment-logos/Visa.png",
        MasterCard: "/payment-logos/MasterCard.png",
        PayPal: "/payment-logos/PayPal.png",
        "American Express": "/payment-logos/AmericanExpress.webp",
        Discover: "/payment-logos/discover.png",
        "Diners Club": "/payment-logos/DinersClub.png",
        Cash: "/payment-logos/Cash.jpg",
        "Debit Card": "/payment-logos/DebitCard.webp",
        Other: "/payment-logos/Creditdebitcardicon.jpg",
      };
      // If the receipt carries an explicit logo URL that matches a known brand,
      // use that brand — it is more authoritative than text inference for custom-named
      // cards (e.g. "Yashphone *2222" with a Discover logo → brand = Discover, not "Other")
      const pmRawLogoUrl = receipt.payment_logo_url || receipt.paymentDisplay?.logoUrl || "";
      const brandFromLogo = pmRawLogoUrl
        ? (Object.entries(PM_LOGO_MAP).find(
            ([, v]) => v.toLowerCase() === pmRawLogoUrl.toLowerCase()
          )?.[0] || null)
        : null;
      const finalBrand = brandFromLogo || resolvedBrand;
      const pmLogoUrl = pmRawLogoUrl || PM_LOGO_MAP[finalBrand] || PM_LOGO_MAP.Other;
      // Inject resolved brand as cardTypeBrand so normalizeApiPaymentMethodInput sets
      // the correct card_type integer (e.g. Discover=4) instead of defaulting to Other=8.
      const pmInput = finalBrand !== "Other"
        ? { ...receipt, cardTypeBrand: finalBrand }
        : receipt;
      if (!alreadyHave) {
        tasks.push(addApiPaymentMethod(pmInput, pmLogoUrl, receipt.expense_type || ""));
      } else if (existingPm?.id && brandFromLogo && existingPm.icon_image !== pmLogoUrl) {
        // The receipt carries an authoritative logo URL that differs from what is stored —
        // update the existing PM so Settings/Filter show the correct logo going forward.
        tasks.push(updateApiPaymentMethod(existingPm.id, pmInput, pmLogoUrl, receipt.expense_type || ""));
      }
    }

    // Expense category
    const expenseType = getReceiptExpenseType(receipt, apiExpenseCategories).trim();
    if (expenseType) {
      const catExists = (apiExpenseCategories || []).some(
        (c) => (c.expense_category_name || "").toLowerCase() === expenseType.toLowerCase()
      );
      if (!catExists) tasks.push(addApiExpenseCategory(expenseType));
      // Patch in-memory receipt when API row is missing expense_type (common on forwards)
      const currentType = (receipt.expense_type || "").trim();
      if (receipt.id && currentType.toLowerCase() !== expenseType.toLowerCase()) {
        setReceipts((prev) =>
          prev.map((r) =>
            String(r.id) === String(receipt.id) ? { ...r, expense_type: expenseType } : r
          )
        );
        tasks.push(
          (async () => {
            const token = localStorage.getItem("token");
            if (!token) return;
            // Keep the forwarded receipt's real taxes (never wipe them via this update).
            const freshTax = resolveFreshestReceiptTaxValues(receipt.id);
            const payload = buildReceiptUpdatePayloadFromRow({
              ...receipt,
              expense_type: expenseType,
              ...(freshTax ? { receipt_tax_values: freshTax } : {}),
            });
            await postReceiptUpdatePayload(payload, token);
          })()
        );
      }
    }

    // For network-forwarded receipts: fetch sender's original to fix missing expense_type
    // and/or payment method (backend overwrites payment with recipient's own card by last4).
    // Runs for ALL received forwards (not just ones missing expense_type) so that old receipts
    // with backend-corrupted payment data are also corrected.
    // fk_forward_from_receipt_id = sender's user ID; fk_original_receipt_id = source receipt ID.
    if (receipt.id) {
      const senderUserId = String(
        receipt.fk_forward_from_receipt_id ?? receipt.fkForwardFromReceiptId ?? "0"
      );
      const originalReceiptId = String(
        receipt.fk_original_receipt_id ?? receipt.fkOriginalReceiptId ?? "0"
      );
      if (senderUserId !== "0" && originalReceiptId !== "0") {
        tasks.push(
          (async () => {
            try {
              const token = localStorage.getItem("token");
              if (!token) return;
              // Reuse any in-flight fetch for the same sender (deduplicate parallel calls)
              let fetchPromise = _senderReceiptFetchCache.get(senderUserId);
              if (!fetchPromise) {
                fetchPromise = fetch(
                  `${BASE_URL}/user/getreceiptfromdatev1?fk_user_id=${senderUserId}&date_time_stamp=0`,
                  { headers: { "Content-Type": "application/json", Accesstoken: token } }
                )
                  .then((r) => (r.ok ? r.json() : []))
                  .then((d) => (Array.isArray(d) ? d : []))
                  .catch(() => []);
                _senderReceiptFetchCache.set(senderUserId, fetchPromise);
                // Evict after 30 s so stale data doesn't linger across multiple syncs
                setTimeout(() => _senderReceiptFetchCache.delete(senderUserId), 30000);
              }
              const senderReceipts = await fetchPromise;
              const orig = senderReceipts.find(
                (r) => String(r.id) === originalReceiptId
              );
              if (!orig) return;

              const fetchedType = (orig.expense_type || "").trim();
              const currentExpenseType = (receipt.expense_type || "").trim();
              const needsExpensePatch =
                fetchedType && fetchedType.toLowerCase() !== currentExpenseType.toLowerCase();

              // The backend overwrites the forwarded receipt's payment method with
              // the recipient's own card matched by last4. Detect and correct this.
              const origPayBase = (orig.paymentType || "")
                .replace(/\s*\*\d+/g, "").trim();
              const curPayBase = (receipt.paymentType || "")
                .replace(/\s*\*\d+/g, "").trim();
              const paymentMismatch =
                origPayBase &&
                curPayBase &&
                origPayBase.toLowerCase() !== curPayBase.toLowerCase();

              if (!needsExpensePatch && !paymentMismatch) return;

              const statePatch = {};
              const serverPatch = { ...receipt };
              if (needsExpensePatch) {
                statePatch.expense_type = fetchedType;
                serverPatch.expense_type = fetchedType;
              }
              if (paymentMismatch) {
                statePatch.paymentType = orig.paymentType || origPayBase;
                statePatch.card_issuer_name = (orig.card_issuer_name || "").trim();
                statePatch.last_4_digit_card = (orig.last_4_digit_card || "").trim();
                serverPatch.paymentType = orig.paymentType || origPayBase;
                serverPatch.card_issuer_name = (orig.card_issuer_name || "").trim();
                serverPatch.last_4_digit_card = (orig.last_4_digit_card || "").trim();
              }

              // Update in-memory receipt
              setReceipts((prev) =>
                prev.map((r) =>
                  String(r.id) === String(receipt.id)
                    ? { ...r, ...statePatch }
                    : r
                )
              );

              // Add expense category to user's list if new
              if (needsExpensePatch) {
                const catExists2 = (apiExpenseCategories || []).some(
                  (c) =>
                    (c.expense_category_name || "").toLowerCase() ===
                    fetchedType.toLowerCase()
                );
                if (!catExists2) addApiExpenseCategory(fetchedType);
              }

              // Preserve the receipt's real taxes so this update never wipes them.
              // Prefer the freshest fetched copy; if the recipient copy hasn't received
              // its tax lines yet, restore them from the sender's original (iOS source).
              const freshTax = resolveFreshestReceiptTaxValues(receipt.id);
              if (freshTax) {
                serverPatch.receipt_tax_values = freshTax;
              } else if (
                Array.isArray(orig?.receipt_tax_values) &&
                orig.receipt_tax_values.length > 0 &&
                !(Array.isArray(receipt.receipt_tax_values) && receipt.receipt_tax_values.length > 0)
              ) {
                serverPatch.receipt_tax_values = remapTaxValuesToRecipient(
                  orig.receipt_tax_values,
                  receipt.id
                );
              }

              // Persist all patches to server in one call
              const payload = buildReceiptUpdatePayloadFromRow(serverPatch);
              await postReceiptUpdatePayload(payload, token);
            } catch { /* ignore */ }
          })()
        );
      }
    }

    // Tax types (skip Tip lines)
    for (const tv of (receipt.receipt_tax_values || [])) {
      const taxName = (tv.tax_name || "").trim();
      if (!taxName || /^tip$/i.test(taxName)) continue;
      const taxExists = (taxData || []).some(
        (t) => (t.tax_name || "").toLowerCase() === taxName.toLowerCase()
      );
      if (!taxExists) {
        const fk_user_id = parseInt(localStorage.getItem("fk_user_id")) || 0;
        tasks.push(addTax({ tax_name: taxName, tax_rate: tv.tax_rate || "0", fk_user_id }));
      }
    }

    if (tasks.length > 0) await Promise.allSettled(tasks);
  }, [apiMerchants, apiPaymentMethods, apiExpenseCategories, taxData,
      addApiMerchant, updateApiMerchant, saveMerchLogo,
      addApiPaymentMethod, addApiExpenseCategory, addTax]);

  // ── Custom Category CRUD ──
  const addCustomCategory = useCallback((name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    setCustomCategories((prev) => {
      if (prev.some((c) => c.toLowerCase() === trimmed.toLowerCase())) return prev;
      const next = [...prev, trimmed];
      localStorage.setItem("cat_custom_categories", JSON.stringify(next));
      return next;
    });
    // Immediately surface in expenseCategories so dropdowns update without waiting for fetchData
    setExpenseCategories((cats) => {
      const low = trimmed.toLowerCase();
      return cats.some((c) => c.toLowerCase() === low) ? cats : [...cats, trimmed];
    });
  }, []);

  const editCustomCategory = useCallback((oldName, newName) => {
    const trimmed = (newName || "").trim();
    if (!trimmed) return;
    setCustomCategories((prev) => {
      const next = prev.map((c) => c === oldName ? trimmed : c);
      localStorage.setItem("cat_custom_categories", JSON.stringify(next));
      return next;
    });
    setExpenseCategories((cats) => cats.map((c) => c === oldName ? trimmed : c));
  }, []);

  const deleteCustomCategory = useCallback((name) => {
    setCustomCategories((prev) => {
      const next = prev.filter((c) => c !== name);
      localStorage.setItem("cat_custom_categories", JSON.stringify(next));
      return next;
    });
    // expenseCategories will naturally drop this entry on the next fetchData unless receipts still use it
  }, []);

  // ── Custom Payment Method CRUD ──
  const addCustomPaymentMethod = useCallback((name) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    setCustomPaymentMethods((prev) => {
      if (prev.some((p) => p.toLowerCase() === trimmed.toLowerCase())) return prev;
      const next = [...prev, trimmed];
      localStorage.setItem("cat_custom_payment_methods", JSON.stringify(next));
      return next;
    });
  }, []);

  const editCustomPaymentMethod = useCallback((oldName, newName) => {
    const trimmed = (newName || "").trim();
    if (!trimmed) return;
    setCustomPaymentMethods((prev) => {
      const next = prev.map((p) => p === oldName ? trimmed : p);
      localStorage.setItem("cat_custom_payment_methods", JSON.stringify(next));
      return next;
    });
  }, []);

  const deleteCustomPaymentMethod = useCallback((name) => {
    setCustomPaymentMethods((prev) => {
      const next = prev.filter((p) => p !== name);
      localStorage.setItem("cat_custom_payment_methods", JSON.stringify(next));
      return next;
    });
  }, []);

  // ── Hide / unhide receipt-derived items (non-destructive — items reappear from receipts but stay out of dropdowns) ──
  const hideMerchant = useCallback((name) => {
    const trimmed = (name || "").toString().trim();
    if (!trimmed) return;
    setHiddenMerchants((prev) => {
      const next = new Set([...prev, trimmed]);
      localStorage.setItem("cat_hidden_merchants", JSON.stringify([...next]));
      return next;
    });
  }, []);

  // Hide default merchant labels superseded by renamed API stores (e.g. Target → Targetttt).
  useEffect(() => {
    DEFAULT_MERCHANTS_WITH_LOGOS.forEach((def) => {
      if (def?.name && isMerchantSupersededByApi(def.name, apiMerchants)) {
        hideMerchant(def.name);
      }
    });
  }, [apiMerchants, hideMerchant]);
  const unhideMerchant = useCallback((name) => {
    setHiddenMerchants((prev) => {
      const next = new Set([...prev].filter((m) => m !== name));
      localStorage.setItem("cat_hidden_merchants", JSON.stringify([...next]));
      return next;
    });
  }, []);
  const hideCategory = useCallback((name) => {
    setHiddenCategories((prev) => {
      const next = new Set([...prev, name]);
      localStorage.setItem("cat_hidden_categories", JSON.stringify([...next]));
      return next;
    });
  }, []);
  const unhideCategory = useCallback((name) => {
    setHiddenCategories((prev) => {
      const next = new Set([...prev].filter((c) => c !== name));
      localStorage.setItem("cat_hidden_categories", JSON.stringify([...next]));
      return next;
    });
  }, []);
  const hidePaymentMethod = useCallback((name) => {
    setHiddenPaymentMethods((prev) => {
      const next = new Set([...prev, name]);
      localStorage.setItem("cat_hidden_payment_methods", JSON.stringify([...next]));
      return next;
    });
  }, []);
  const unhidePaymentMethod = useCallback((name) => {
    setHiddenPaymentMethods((prev) => {
      const next = new Set([...prev].filter((p) => p !== name));
      localStorage.setItem("cat_hidden_payment_methods", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const normalizeHiddenKey = (value) =>
    String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();

  const isMerchantHidden = useCallback(
    (name) => {
      const key = normalizeHiddenKey(name);
      if (!key) return false;
      for (const hidden of hiddenMerchants) {
        if (normalizeHiddenKey(hidden) === key) return true;
      }
      return false;
    },
    [hiddenMerchants]
  );

  const isCategoryHidden = useCallback(
    (name) => {
      const key = normalizeHiddenKey(name);
      if (!key) return false;
      for (const hidden of hiddenCategories) {
        if (normalizeHiddenKey(hidden) === key) return true;
      }
      return false;
    },
    [hiddenCategories]
  );

  const isPaymentMethodHidden = useCallback(
    (name) => {
      const key = normalizeHiddenKey(name);
      if (!key) return false;
      for (const hidden of hiddenPaymentMethods) {
        if (normalizeHiddenKey(hidden) === key) return true;
      }
      return false;
    },
    [hiddenPaymentMethods]
  );

  // ─── Compute merged + filtered arrays for dropdown consumers ───────────────
  // Raw receipt-derived arrays (before any hidden filtering — exposed for the management modal)
  const receiptMerchantsRaw   = merchants;           // string[]
  const receiptMerchWImgRaw   = merchantsWithImages || []; // {name,image}[]
  const receiptCategoriesRaw  = expenseCategories;   // string[]
  const receiptPaymentsRaw    = paymentMethods;      // string[]

  // Dropdown-ready: receipt-derived (minus hidden) + custom (minus hidden duplicates)
  const _rmLower = new Set(receiptMerchantsRaw.map((m) => (m || "").toLowerCase()));
  const _rmCustomLower = new Set([
    ..._rmLower,
    ...customMerchants.map((m) => (m || "").toLowerCase()),
  ]);
  const mergedMerchants = [
    ...receiptMerchantsRaw.filter(
      (m) => !isMerchantHidden(m) && !isMerchantSupersededByApi(m, apiMerchants)
    ),
    ...customMerchants.filter((m) => !isMerchantHidden(m) && !_rmLower.has(m.toLowerCase())),
    ...DEFAULT_MERCHANTS_WITH_LOGOS
      .map((m) => m.name)
      .filter(
        (m) =>
          m &&
          !isMerchantHidden(m) &&
          !_rmCustomLower.has((m || "").toLowerCase()) &&
          !isMerchantSupersededByApi(m, apiMerchants)
      ),
  ].sort((a, b) =>
    (a || "").toString().toLowerCase().localeCompare((b || "").toString().toLowerCase())
  );
  const visibleReceiptMerchWImg = receiptMerchWImgRaw.filter(
    (m) =>
      !isMerchantHidden(m.name) && !isMerchantSupersededByApi(m.name, apiMerchants)
  );
  const _miLower = new Set(
    visibleReceiptMerchWImg.map((m) => (m.name || "").toLowerCase())
  );
  const _miApiLower = new Set(
    (apiMerchants || []).map((m) => (m?.store_name || "").trim().toLowerCase()).filter(Boolean)
  );
  const _miCustomLower = new Set([
    ..._miLower,
    ..._miApiLower,
    ...customMerchants.map((m) => (m || "").toLowerCase()),
  ]);
  const mergedMerchantsWithImages = [
    ...visibleReceiptMerchWImg,
    // API merchants are the source of truth (before local custom list)
    ...apiMerchants
      .filter((m) => m.store_name && !_miLower.has((m.store_name || "").toLowerCase()))
      .map((m) => ({ name: m.store_name, image: m.store_image_url || "" })),
    ...customMerchants
      .filter(
        (m) =>
          !isMerchantHidden(m) &&
          !_miLower.has(m.toLowerCase()) &&
          !_miApiLower.has(m.toLowerCase()) &&
          !isMerchantSupersededByApi(m, apiMerchants)
      )
      .map((m) => ({ name: m, image: "" })),
    ...DEFAULT_MERCHANTS_WITH_LOGOS.filter(
      (m) =>
        m.name &&
        !isMerchantHidden(m.name) &&
        !_miCustomLower.has((m.name || "").toLowerCase()) &&
        !isMerchantSupersededByApi(m.name, apiMerchants)
    ),
  ].sort((a, b) =>
    (a?.name || "").toString().toLowerCase().localeCompare((b?.name || "").toString().toLowerCase())
  );
  const visibleReceiptCategories = receiptCategoriesRaw.filter(
    (c) => c && !isCategoryHidden(c)
  );
  const visibleCustomCategories = customCategories.filter(
    (c) => c && !isCategoryHidden(c)
  );
  const visibleApiExpenseCategories = apiExpenseCategories.filter((c) => {
    const name = getExpenseCategoryRecordName(c);
    return name && !isCategoryHidden(name);
  });
  const visibleAdminDefaults = adminDefaultExpenseCategories.filter(
    (c) => {
      const n = (c || "").toString().trim();
      return n && !isCategoryHidden(n);
    }
  );
  const mergedExpenseCategories = buildExpenseCategoryOptions({
    apiExpenseCategories: visibleApiExpenseCategories,
    receiptCategories: [
      ...visibleReceiptCategories,
      ...visibleCustomCategories,
      ...visibleAdminDefaults,
    ],
    includeDefaultsWhenEmpty: true,
  });
  const _rpLower = new Set(receiptPaymentsRaw.map((p) => (p || "").toLowerCase()));
  const mergedPaymentMethods = mergePaymentMethodLabels({
    baseLabels: [
      ...receiptPaymentsRaw.filter((p) => !isPaymentMethodHidden(p)),
      ...customPaymentMethods.filter(
        (p) => !isPaymentMethodHidden(p) && !_rpLower.has((p || "").toLowerCase())
      ),
    ],
    apiPaymentMethods: (apiPaymentMethods || []).filter((m) => isPaymentApiRecord(m)),
    isHidden: isPaymentMethodHidden,
  });
  // mergePaymentMethodLabels already dedupes by full label; do not re-key by last4/base
  // or admin defaults (card_number "-") collapse to one entry.
  const normalizedPaymentMethods = mergedPaymentMethods
    .map((p) => {
      const trimmed = (p || "").toString().trim();
      if (!trimmed) return "";
      const base = trimmed.replace(/\s*\*\s*\d{3,4}\s*$/g, "").trim().toLowerCase();
      return base === "cash" ? "Cash" : trimmed;
    })
    .filter(Boolean)
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));

  const homepageFilterMerchantsWithImages = buildHomepageFilterMerchantsWithImages(
    mergedMerchantsWithImages,
    receipts,
    apiMerchants
  );
  const homepageFilterExpenseCategories = buildHomepageFilterExpenseCategories(
    mergedExpenseCategories,
    receipts,
    apiExpenseCategories
  );
  const homepageFilterPaymentMethods = buildHomepageFilterPaymentMethods(
    normalizedPaymentMethods,
    receipts,
    apiPaymentMethods,
    isPaymentMethodHidden
  );

  return (
    <DataContext.Provider
      value={{
        user,
        receipts,
        // Dropdown-ready arrays (merged + hidden-filtered)
        merchants: mergedMerchants,
        expenseCategories: mergedExpenseCategories,
        paymentMethods: normalizedPaymentMethods,
        merchantsWithImages: mergedMerchantsWithImages,
        // Homepage filter-only extras from network-received receipts
        homepageFilterMerchantsWithImages,
        homepageFilterExpenseCategories,
        homepageFilterPaymentMethods,
        // Raw receipt-derived arrays (for the management modal — includes hidden items)
        receiptMerchantsRaw,
        receiptMerchWImgRaw,
        receiptCategoriesRaw,
        receiptPaymentsRaw,
        purchasePrice,
        storeNames,
        receiptCategory,
        expenseType,
        receiptTaxValues,
        note,
        receiptTags,
        receiptImage,
        storeImage,
        taxData,
        loading,
        error,
        refreshData: fetchData,
        refreshDataAfterAuth,
        silentRefreshData,
        markRecoveryEmailVerified,
        updateUserProfile,
        calculateSubtotal,
        setDataContent,
        clearDataContent,
        clearAllData,
        getReceiptBadgeStatus,
        updateReceiptStatus,
        deleteReceipt,
        updateReceipt,
        markReceiptAsForwarded,
        repairReceiptMediaOnServer,
        syncForwardedReceiptData,
        addExpenseCategory,
        // Tax management functions
        fetchTaxes,
        addTax,
        updateTax,
        deleteTax,
        // API-backed merchant management
        apiMerchants,
        fetchApiMerchants,
        addApiMerchant,
        updateApiMerchant,
        deleteApiMerchant,
        // API-backed payment method management
        apiPaymentMethods,
        fetchApiPaymentMethods,
        addApiPaymentMethod,
        updateApiPaymentMethod,
        deleteApiPaymentMethod,
        // API-backed expense category management
        apiExpenseCategories,
        adminDefaultExpenseCategories,
        setAdminDefaultExpenseCategories,
        fetchApiExpenseCategories,
        addApiExpenseCategory,
        updateApiExpenseCategory,
        deleteApiExpenseCategory,
        // Custom receipt-info CRUD
        customMerchants,
        addCustomMerchant,
        editCustomMerchant,
        deleteCustomMerchant,
        saveMerchLogo,
        customCategories,
        addCustomCategory,
        editCustomCategory,
        deleteCustomCategory,
        customPaymentMethods,
        addCustomPaymentMethod,
        editCustomPaymentMethod,
        deleteCustomPaymentMethod,
        // Hide / unhide receipt-derived items
        hiddenMerchants,
        hideMerchant,
        unhideMerchant,
        isMerchantHidden,
        hiddenCategories,
        hideCategory,
        unhideCategory,
        isCategoryHidden,
        hiddenPaymentMethods,
        hidePaymentMethod,
        unhidePaymentMethod,
        isPaymentMethodHidden,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const ctx = useContext(DataContext);
  if (ctx === undefined) {
    // This fires only when a component is rendered outside <DataProvider>.
    // Returning an empty object prevents a hard TypeError crash; the component
    // will render with no data but won't blow up the whole app.
    if (process.env.NODE_ENV !== "production") {
      console.error(
        "[useData] called outside DataProvider — check your component tree."
      );
    }
    return {};
  }
  return ctx;
};