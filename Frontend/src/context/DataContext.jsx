import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";

const DataContext = createContext();
const BASE_URL = "/api";
const onlyDigits = (s) => (s ?? "").toString().replace(/\D/g, "");

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
    const issuer = (r.card_issuer_name ?? r.cardIssuerName)?.toString().trim();
    const last4 = (r.last_4_digit_card ?? r.last4DigitCard)?.toString().trim();
    if (issuer && issuer !== "0") {
      addPayment(last4 && last4 !== "0" ? `${issuer} *${last4}` : issuer);
    } else {
      const paymentType = r.paymentType ?? r.payment_type;
      if (paymentType) addPayment(paymentType);
    }
  });

  return [...paymentMap.values()].filter(Boolean);
};
const getLast4 = (cardNumber, hintedLast4) => {
  if (hintedLast4 && /^\d{4}$/.test(hintedLast4)) return hintedLast4;
  const digits = onlyDigits(cardNumber);
  return digits.length >= 4 ? digits.slice(-4) : "";
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
  const isForwarded = receipt.receipt_forwarded === "1" || receipt.receipt_forwarded === 1;
  const isReceived = receipt.fk_forward_from_receipt_id > 0 || receipt.fkForwardFromReceiptId > 0;

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
      
      const response = await fetch(`${BASE_URL}/tax/addTax`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
           accesstoken: `${token}`,
        },
        body: JSON.stringify(taxData),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to add tax");
      }
      
      const savedTax = await response.json();
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
      
      const response = await fetch(`${BASE_URL}/tax/updateTax`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(taxData),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to update tax");
      }
      
      const updatedTax = await response.json();
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
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
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

  // ── API Merchant CRUD (via /userpaymentmethod endpoints) ──
  const fetchApiMerchants = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${BASE_URL}/userpaymentmethod/getPaymentMethodv1`, {
        headers: { Accesstoken: token, Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        const merchants = Array.isArray(data) ? data.filter(m => m.card_number && m.card_type === "merchant") : [];
        setApiMerchants(merchants);
      }
    } catch (e) { console.error("fetchApiMerchants error", e); }
  }, []);

  const addApiMerchant = async (name, logoUrl = "") => {
    const token = localStorage.getItem("token");
    if (!token || !name.trim()) return null;
    try {
      const res = await fetch(`${BASE_URL}/userpaymentmethod/addPaymentMethodv1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ card_number: name.trim(), icon_image: logoUrl || "", card_type: "merchant", default_payment_category: "" }),
      });
      if (res.ok) {
        const data = await res.json();
        setApiMerchants(prev => [...prev, data]);
        return data;
      }
    } catch (e) { console.error("addApiMerchant error", e); }
    return null;
  };

  const updateApiMerchant = async (id, name, logoUrl = "") => {
    const token = localStorage.getItem("token");
    if (!token) return false;
    try {
      const res = await fetch(`${BASE_URL}/userpaymentmethod/updatePaymentMethodv1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, card_number: name.trim(), icon_image: logoUrl || "", card_type: "merchant", default_payment_category: "" }),
      });
      if (res.ok) {
        const data = await res.json();
        setApiMerchants(prev => prev.map(m => m.id === id ? data : m));
        return true;
      }
    } catch (e) { console.error("updateApiMerchant error", e); }
    return false;
  };

  // ── API Payment Method CRUD (via /userpaymentmethod endpoints, card_type="payment") ──
  const fetchApiPaymentMethods = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token) return;
    try {
      const res = await fetch(`${BASE_URL}/userpaymentmethod/getPaymentMethodv1`, {
        headers: { Accesstoken: token, Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // Payment methods: everything with a card_number that isn't a merchant
        const payments = Array.isArray(data)
          ? data.filter(m => m.card_number && m.card_type !== "merchant")
          : [];
        setApiPaymentMethods(payments);
      }
    } catch (e) { console.error("fetchApiPaymentMethods error", e); }
  }, []);

  const addApiPaymentMethod = async (name, logoUrl = "") => {
    const token = localStorage.getItem("token");
    if (!token || !name.trim()) return null;
    try {
      const res = await fetch(`${BASE_URL}/userpaymentmethod/addPaymentMethodv1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ card_number: name.trim(), icon_image: logoUrl || "", card_type: "payment", default_payment_category: "" }),
      });
      if (res.ok) {
        const data = await res.json();
        setApiPaymentMethods(prev => [...prev, data]);
        return data;
      }
    } catch (e) { console.error("addApiPaymentMethod error", e); }
    return null;
  };

  const updateApiPaymentMethod = async (id, name, logoUrl = "") => {
    const token = localStorage.getItem("token");
    if (!token) return false;
    try {
      const res = await fetch(`${BASE_URL}/userpaymentmethod/updatePaymentMethodv1`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accesstoken: token, Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id, card_number: name.trim(), icon_image: logoUrl || "", card_type: "payment", default_payment_category: "" }),
      });
      if (res.ok) {
        const data = await res.json();
        setApiPaymentMethods(prev => prev.map(m => m.id === id ? data : m));
        return true;
      }
    } catch (e) { console.error("updateApiPaymentMethod error", e); }
    return false;
  };

  const deleteApiPaymentMethod = (id) => {
    setApiPaymentMethods(prev => prev.filter(m => m.id !== id));
  };

  const clearDataContent = () => setDataContent(null);

  const calculateSubtotal = (receipt) => {
    const purchasePrice = parseFloat(receipt.purchasePrice) || 0;
    const totalTax =
      receipt.receipt_tax_values?.reduce((sum, tax) => {
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

      // Fetch user
      const userRes = await fetch(`${BASE_URL}/user/getuserdetails`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accesstoken: token,
        },
      });
      if (!userRes.ok) throw new Error("Failed to fetch user data");
      const userData = await userRes.json();
      setUser(userData);
      const fk_user_id = userData?.id;
      // Persist user ID so tax payloads and other API calls can use it
      if (fk_user_id) localStorage.setItem("fk_user_id", fk_user_id);

      // Fetch receipts
      const receiptRes = await fetch(
        `${BASE_URL}/user/getreceiptfromdatev1?fk_user_id=${fk_user_id}&date_time_stamp=${date_time_stamp}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Accesstoken: token,
          },
        }
      );
      if (!receiptRes.ok) throw new Error("Failed to fetch receipts");
      const receiptData = await receiptRes.json();
      
      // Fetch taxes from API (needed to enrich receipt_tax_values)
      // Do this in parallel with receipt processing to avoid blocking
      let taxDataArray = [];
      try {
        const dateTimeStamp = Date.now();
        const taxRes = await fetch(`${BASE_URL}/tax/getTax?date_time_stamp=${dateTimeStamp}`, {
          headers: {
            // Use both header styles so the API works regardless of how the
            // backend authenticates (Accesstoken for PHP, Bearer for Node.js)
            Accesstoken: token,
            Authorization: `Bearer ${token}`,
          },
        });
        if (taxRes.ok) {
          const taxes = await taxRes.json();
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
        // Continue without tax data - receipts will still work
        taxDataArray = [];
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
              const rawProductDate = parseInt(r.product_date) || 0;
              const createDate = parseInt(r.create_date) || 0;

              let normalisedProductDate = rawProductDate;

              // Treat timestamps < 1,000,000 as invalid (too close to 1970-01-01)
              if (normalisedProductDate === 0 || normalisedProductDate < 1000000) {
                if (createDate >= 1000000) {
                  normalisedProductDate = createDate;
                } else {
                  normalisedProductDate = 0;
                }
              }

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
              let paymentType = r.paymentType ?? r.payment_type ?? "";
              const cardIssuerName = r.card_issuer_name ?? r.cardIssuerName ?? "";
              const last4DigitCard = r.last_4_digit_card ?? r.last4DigitCard ?? "";
              // Normalize merchant / category / tax fields – Android/iOS may use snake_case or camelCase
              const storeName = r.storeName ?? r.store_name ?? "";
              const storeImage = r.store_image ?? r.storeImage ?? "";
              const expenseType = r.expense_type ?? r.expenseType ?? "";
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
              
              const normalized = {
                ...r,
                // Overwrite with normalised values so downstream code can use
                // a single field name regardless of API variant (web vs Android/iOS)
                storeName,
                store_image: storeImage,
                expense_type: expenseType,
                product_name: productName,
                purchasePrice: purchasePrice, // normalize snake_case purchase_price → camelCase
                receipt_image: receiptImage,  // normalize camelCase receiptImage → snake_case
                receipt_tax_values: receiptTaxValues,
                paymentType: paymentType, // Keep paymentType as-is (e.g., "MasterCard *7836") - needed for logo detection
                card_issuer_name: cardIssuerName,
                last_4_digit_card: last4DigitCard,
                // Ensure draft/verify/email fields are always strings for easy comparison
                is_draft: String(r.is_draft ?? "0"),
                is_verify: String(r.is_verify ?? "0"),
                fk_incoming_email_id: r.fk_incoming_email_id ?? null,
                fk_original_receipt_id: r.fk_original_receipt_id ?? null,
              };
              const paymentDisplay = formatPaymentDisplayFromReceipt(normalized);
              const badgeStatus = getReceiptBadgeStatus(r);
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
      
      // Merge in locally tracked QuickBooks-linked state, so users can see which
      // receipts have already been sent to QuickBooks even after a reload.
      let receiptsWithIntegrations = formattedReceipts;
      try {
        const storedQbIds = JSON.parse(
          localStorage.getItem("qbLinkedReceipts") || "[]"
        );
        const qbIdSet = new Set(
          Array.isArray(storedQbIds)
            ? storedQbIds.map((id) => id.toString())
            : []
        );

        receiptsWithIntegrations = formattedReceipts.map((r) =>
          qbIdSet.has(r.id?.toString())
            ? { ...r, quickbooksLinked: true }
            : r
        );
      } catch (e) {
        console.error(
          "Failed to read QuickBooks-linked receipts from localStorage:",
          e
        );
        receiptsWithIntegrations = formattedReceipts;
      }


      // Fetch API merchants & payment methods in one call, split by card_type
      let apiMerchantsData = [];
      let apiPaymentMethodsData = [];
      try {
        const apiPayRes = await fetch(`${BASE_URL}/userpaymentmethod/getPaymentMethodv1`, {
          headers: { Accesstoken: token, Authorization: `Bearer ${token}` },
        });
        if (apiPayRes.ok) {
          const apiPayJson = await apiPayRes.json();
          const allItems = Array.isArray(apiPayJson) ? apiPayJson : [];
          // Merchants: explicitly marked card_type === "merchant"
          apiMerchantsData = allItems.filter(m => m.card_number && m.card_type === "merchant");
          // Payment methods: everything else with a card_number (any card_type that isn't "merchant")
          apiPaymentMethodsData = allItems.filter(m => m.card_number && m.card_type !== "merchant");
          setApiMerchants(apiMerchantsData);
          setApiPaymentMethods(apiPaymentMethodsData);
        }
      } catch (apiPayErr) {
        console.error("fetchApiPaymentMethods in fetchData error", apiPayErr);
      }

      setMerchants([
        "Miscellaneous", // always present — cannot be removed
        ...new Set([
          ...receiptsWithIntegrations
            .map((r) => r.storeName)
            .filter(Boolean)
            .filter((n) => n.toLowerCase().trim() !== "miscellaneous"),
          ...apiMerchantsData
            .map((m) => m.card_number)
            .filter(Boolean)
            .filter((n) => n.toLowerCase().trim() !== "miscellaneous"),
        ]),
      ]);
      setStoreImage([
        ...new Set(
          receiptsWithIntegrations.map((r) => r.store_image).filter(Boolean)
        ),
      ]);

 // In DataContext.js, update the fetchData function where merchantsWithImages is built

// Find this section in your fetchData function:
// Build merchantsWithImages from receipts (since API endpoint returns 404)
// Extract merchant images directly from receipts
const merchantsWithImagesMap = new Map();
receiptsWithIntegrations.forEach((r) => {
  const name = r.storeName?.toString().trim();
  const image = r.store_image?.toString().trim();
  if (name && name !== "0" && image && image !== "0") {
    const key = name.toLowerCase().trim();
    if (!merchantsWithImagesMap.has(key)) {
      merchantsWithImagesMap.set(key, {
        name: name,
        image: image,
      });
    }
  }
});
// Merge in API merchants (server-stored) if not already present from receipts
apiMerchantsData.forEach(m => {
  const key = (m.card_number || "").trim().toLowerCase();
  if (key && !merchantsWithImagesMap.has(key)) {
    merchantsWithImagesMap.set(key, { name: m.card_number, image: m.icon_image || "" });
  }
});

// "Miscellaneous" is always present, pinned at the top
if (!merchantsWithImagesMap.has("miscellaneous")) {
  merchantsWithImagesMap.set("miscellaneous", { name: "Miscellaneous", image: "" });
}
setMerchantsWithImages([
  { name: "Miscellaneous", image: "" },
  ...Array.from(merchantsWithImagesMap.values()).filter(
    (m) => m.name.toLowerCase().trim() !== "miscellaneous"
  ),
]);

      // Extract unique payment methods from receipts
      setPaymentMethods(buildPaymentMethods(receiptsWithIntegrations));
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

      // Enrich receipt_tax_values with tax_name and tax_rate from taxData
      // Also normalize receipts to include tax_name and tax_rate in receipt_tax_values
      receiptsWithIntegrations = receiptsWithIntegrations.map((r) => {
        if (Array.isArray(r.receipt_tax_values) && r.receipt_tax_values.length > 0) {
          // Pre-calculate subtotal for this receipt so we can infer tax_rate from tax_amount
          const total = parseFloat(r.purchasePrice) || 0;
          const totalTaxFromApi =
            r.receipt_tax_values.reduce(
              (sum, t) => sum + (parseFloat(t.tax_amount) || 0),
              0
            ) || 0;
          const tipEntryForRate = r.receipt_tax_values.find((t) =>
            (t.tax_name || "").toString().toLowerCase().includes("tip")
          );
          const tipAmountForRate = tipEntryForRate
            ? parseFloat(tipEntryForRate.tax_amount) || 0
            : 0;
          const subtotalForRate =
            total > 0 ? Math.max(total - totalTaxFromApi - tipAmountForRate, 0) : 0;

          const enrichedTaxValues = r.receipt_tax_values.map((tax) => {
            // If tax already has tax_name and tax_rate, use them
            if (tax.tax_name && tax.tax_rate) {
              return tax;
            }

            // Try to find tax definition by fk_tax_id
            const taxId = parseInt(tax.fk_tax_id) || 0;
            if (taxId > 0 && Array.isArray(taxDataArray) && taxDataArray.length > 0) {
              const taxDefinition = taxDataArray.find((t) => parseInt(t.id) === taxId);
              if (taxDefinition) {
                return {
                  ...tax,
                  fk_tax_id: taxId,
                  tax_name: taxDefinition.tax_name || tax.tax_name || "",
                  tax_rate: taxDefinition.tax_rate || tax.tax_rate || "0",
                  tax_number: taxDefinition.tax_number || tax.tax_number || "",
                };
              }
            }

            // If fk_tax_id is 0 or not found, try to infer tax_rate from tax_amount and subtotal
            // and then match to a tax definition with the same rate.
            let inferredRate = 0;
            const taxAmount = parseFloat(tax.tax_amount) || 0;
            const isTip =
              (tax.tax_name || "").toString().toLowerCase().includes("tip");

            if (!isTip && subtotalForRate > 0 && taxAmount > 0) {
              inferredRate = Math.round((taxAmount / subtotalForRate) * 100);
            }

            let matchedDefinition = null;
            if (
              inferredRate > 0 &&
              Array.isArray(taxDataArray) &&
              taxDataArray.length > 0
            ) {
              matchedDefinition = taxDataArray.find((tDef) => {
                const defRate = parseFloat(tDef.tax_rate) || 0;
                return Math.round(defRate) === inferredRate;
              });
            }

            if (matchedDefinition) {
              return {
                ...tax,
                fk_tax_id: parseInt(matchedDefinition.id) || taxId || 0,
                tax_name: matchedDefinition.tax_name || tax.tax_name || "Tax",
                tax_rate:
                  matchedDefinition.tax_rate ||
                  tax.tax_rate ||
                  inferredRate.toString(),
                tax_number: matchedDefinition.tax_number || tax.tax_number || "",
              };
            }

            // Fallback: preserve whatever we have, but at least keep a sensible default name/rate
            return {
              ...tax,
              fk_tax_id: taxId || 0,
              tax_name: tax.tax_name || (isTip ? "Tip" : "Tax"),
              tax_rate:
                tax.tax_rate ||
                (inferredRate > 0 ? inferredRate.toString() : "0"),
            };
          });

          return {
            ...r,
            receipt_tax_values: enrichedTaxValues,
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
      
      // Update receipts with enriched tax data
      setReceipts(receiptsWithIntegrations);

      setExpenseType([
        ...new Set(
          receiptsWithIntegrations.map((r) => String(r.receipt_category))
        ),
      ]);

      // Populate expenseCategories from the expense_type field of all receipts.
      // This ensures custom categories entered by the user appear in the Filter → Expense Category list.
      setExpenseCategories([
        ...new Set(
          receiptsWithIntegrations
            .map((r) => (r.expense_type ?? "").toString().trim())
            .filter(Boolean)
        ),
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

  useEffect(() => {
    const token = localStorage.getItem("token");
    // Only fetch data if token exists
    if (token) {
      fetchData(); // fetchData already calls fetchTaxes internally
    } else {
      setLoading(false);
    }
  }, [fetchData]); // fetchData already includes fetchTaxes in its dependencies

  const clearAllData = () => {
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
    // Clear custom receipt-info items and API merchants/payments on logout so next user gets a clean slate
    setApiMerchants([]);
    setApiPaymentMethods([]);
    setCustomMerchants([]);
    setCustomCategories([]);
    setCustomPaymentMethods([]);
    setHiddenMerchants(new Set());
    setHiddenCategories(new Set());
    setHiddenPaymentMethods(new Set());
    // Note: Don't clear taxes here - they should persist
  };

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
      const existingReceipt = receipts.find(r => r.id?.toString() === receiptId?.toString());
      
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
            receipt.id === receiptId ? { ...receipt, ...updates } : receipt
          );
        });
        return true;
      }
      
      // If we have API fields but no existing receipt, we can't update
      if (!existingReceipt) {
        // Still update local state
        setReceipts(prevReceipts => {
          return prevReceipts.map(receipt =>
            receipt.id === receiptId ? { ...receipt, ...updates } : receipt
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
            if (field === "notes" || field === "expense_type" || field === "product_name" || field === "storeName") {
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

      // Build the update payload matching API model
      // Only update fields that are provided, preserve existing values for others
      const updatePayload = {
        id: parseInt(receiptId),
        storeName: getValue("storeName", ""),
        product_name: getValue("product_name", ""),
        emailAttachment: getValue("emailAttachment", "0"),
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
        paymentType: getValue("paymentType", ""),
        last_4_digit_card: getValue("last_4_digit_card", ""),
        card_issuer_name: getValue("card_issuer_name", ""),
        fk_original_receipt_id: getValue("fk_original_receipt_id", "0"),
        fk_forward_from_receipt_id: getValue("fk_forward_from_receipt_id", "0"),
        // Preserve receipt_category - only update if explicitly provided
        receipt_category: (() => {
          const val = getValue("receipt_category");
          if (val === null || val === undefined) return existingReceipt?.receipt_category ?? 0;
          const parsed = parseInt(val);
          return isNaN(parsed) ? (existingReceipt?.receipt_category ?? 0) : parsed;
        })(),
        product_date: (() => {
          const val = getValue("product_date");
          if (val === null || val === undefined) return existingReceipt?.product_date ?? 0;
          const parsed = parseInt(val);
          return isNaN(parsed) ? (existingReceipt?.product_date ?? 0) : parsed;
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
        receipt_image: getValue("receipt_image", "0"),
        store_image: getValue("store_image", ""),
        notes: getValue("notes", ""),
        receipt_forwarded: getValue("receipt_forwarded", "0"),
        receipt_tag: getValue("receipt_tag", ""),
        create_date: getValue("create_date", ""),
        receipt_tax_values: getValue("receipt_tax_values", []),
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
            success = true;
            break;
          }
        } catch (err) {
          console.warn(`Update endpoint ${endpoint} failed: ${err.message}`);
        }
      }

      // Update local state regardless
      setReceipts(prevReceipts => {
        const updatedReceipts = prevReceipts.map(receipt =>
          receipt.id === receiptId ? { ...receipt, ...updates } : receipt
        );

        // Also update payment methods list if paymentType changed
        if (updates.paymentType) {
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

        return updatedReceipts;
      });

      if (!success) {
        console.warn("All update endpoints failed. Updated locally only.");
      }
      return true;
    } catch (error) {
      console.warn("Update failed:", error.message);
      setReceipts(prevReceipts => {
        const updatedReceipts = prevReceipts.map(receipt =>
          receipt.id === receiptId ? { ...receipt, ...updates } : receipt
        );
        return updatedReceipts;
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
    setHiddenMerchants((prev) => {
      const next = new Set([...prev, name]);
      localStorage.setItem("cat_hidden_merchants", JSON.stringify([...next]));
      return next;
    });
  }, []);
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

  // ─── Compute merged + filtered arrays for dropdown consumers ───────────────
  // Raw receipt-derived arrays (before any hidden filtering — exposed for the management modal)
  const receiptMerchantsRaw   = merchants;           // string[]
  const receiptMerchWImgRaw   = merchantsWithImages || []; // {name,image}[]
  const receiptCategoriesRaw  = expenseCategories;   // string[]
  const receiptPaymentsRaw    = paymentMethods;      // string[]

  // Dropdown-ready: receipt-derived (minus hidden) + custom (minus hidden duplicates)
  const _rmLower = new Set(receiptMerchantsRaw.map((m) => (m || "").toLowerCase()));
  const mergedMerchants = [
    ...receiptMerchantsRaw.filter((m) => !hiddenMerchants.has(m)),
    ...customMerchants.filter((m) => !hiddenMerchants.has(m) && !_rmLower.has(m.toLowerCase())),
  ];
  const _miLower = new Set(receiptMerchWImgRaw.map((m) => (m.name || "").toLowerCase()));
  const _miCustomLower = new Set([
    ..._miLower,
    ...customMerchants.map((m) => (m || "").toLowerCase()),
  ]);
  const mergedMerchantsWithImages = [
    ...receiptMerchWImgRaw.filter((m) => !hiddenMerchants.has(m.name)),
    ...customMerchants
      .filter((m) => !hiddenMerchants.has(m) && !_miLower.has(m.toLowerCase()))
      .map((m) => ({ name: m, image: "" })),
    // API merchants not already present from receipts or custom list
    ...apiMerchants
      .filter((m) => m.card_number && !hiddenMerchants.has(m.card_number) && !_miCustomLower.has((m.card_number || "").toLowerCase()))
      .map((m) => ({ name: m.card_number, image: m.icon_image || "" })),
  ];
  const _rcLower = new Set(receiptCategoriesRaw.map((c) => (c || "").toLowerCase()));
  const mergedExpenseCategories = [
    ...receiptCategoriesRaw.filter((c) => !hiddenCategories.has(c)),
    ...customCategories.filter((c) => !hiddenCategories.has(c) && !_rcLower.has(c.toLowerCase())),
  ];
  const _rpLower = new Set(receiptPaymentsRaw.map((p) => (p || "").toLowerCase()));
  const _rpCustomLower = new Set([
    ..._rpLower,
    ...customPaymentMethods.map((p) => (p || "").toLowerCase()),
  ]);
  const mergedPaymentMethods = [
    ...receiptPaymentsRaw.filter((p) => !hiddenPaymentMethods.has(p)),
    ...customPaymentMethods.filter((p) => !hiddenPaymentMethods.has(p) && !_rpLower.has(p.toLowerCase())),
    // API payment methods not already present from receipts or custom list
    ...apiPaymentMethods
      .filter((m) => m.card_number && !hiddenPaymentMethods.has(m.card_number) && !_rpCustomLower.has((m.card_number || "").toLowerCase()))
      .map((m) => m.card_number),
  ];

  return (
    <DataContext.Provider
      value={{
        user,
        receipts,
        // Dropdown-ready arrays (merged + hidden-filtered)
        merchants: mergedMerchants,
        expenseCategories: mergedExpenseCategories,
        paymentMethods: mergedPaymentMethods,
        merchantsWithImages: mergedMerchantsWithImages,
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
        silentRefreshData,
        calculateSubtotal,
        setDataContent,
        clearDataContent,
        clearAllData,
        getReceiptBadgeStatus,
        updateReceiptStatus,
        deleteReceipt,
        updateReceipt,
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
        // API-backed payment method management
        apiPaymentMethods,
        fetchApiPaymentMethods,
        addApiPaymentMethod,
        updateApiPaymentMethod,
        deleteApiPaymentMethod,
        // Custom receipt-info CRUD
        customMerchants,
        addCustomMerchant,
        editCustomMerchant,
        deleteCustomMerchant,
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
        hiddenCategories,
        hideCategory,
        unhideCategory,
        hiddenPaymentMethods,
        hidePaymentMethod,
        unhidePaymentMethod,
      }}
    >
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => useContext(DataContext);