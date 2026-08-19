import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import FormData from "form-data";
import OAuthClient from "intuit-oauth";
import { XeroClient } from "xero-node";
import axios from "axios";
import { create } from "xmlbuilder2";
import {
  saveQuickBooksToken,
  getQuickBooksToken,
  deleteQuickBooksToken,
  getValidQuickBooksToken,
  getLinkedReceiptIds,
  addLinkedReceipt,
  exchangeQuickBooksAuthorizationCode,
  isMysqlConfigured,
} from "../services/quickbooksTokenStore.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QB_TOKENS_PATH = path.join(__dirname, "..", "data", "quickbooks-tokens.json");

// In-memory fallback + file persistence for QuickBooks tokens
let quickbooksTokens = new Map(); // key: realmId -> token

function loadQuickBooksTokens() {
  try {
    const dir = path.dirname(QB_TOKENS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(QB_TOKENS_PATH)) {
      const data = JSON.parse(fs.readFileSync(QB_TOKENS_PATH, "utf8"));
      quickbooksTokens = new Map(Object.entries(data));
    }
  } catch (err) {
    console.warn("QuickBooks tokens load failed:", err.message);
  }
}

function saveQuickBooksTokens() {
  try {
    const dir = path.dirname(QB_TOKENS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const obj = Object.fromEntries(quickbooksTokens);
    fs.writeFileSync(QB_TOKENS_PATH, JSON.stringify(obj, null, 2), "utf8");
  } catch (err) {
    console.warn("QuickBooks tokens save failed:", err.message);
  }
}

loadQuickBooksTokens();

const xeroTokenSet = { tokenSet: null, tenants: [] };

function ensureEnv(vars, res, providerName) {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length) {
    res.status(500).json({
      error: `${providerName} env vars missing: ${missing.join(", ")}`,
    });
    return false;
  }
  return true;
}

// ---------- QuickBooks ----------
function getQuickBooksClient() {
  return new OAuthClient({
    clientId: process.env.QB_CLIENT_ID,
    clientSecret: process.env.QB_CLIENT_SECRET,
    environment: process.env.QB_ENVIRONMENT || "sandbox",
    redirectUri: process.env.QB_REDIRECT_URI,
  });
}

export async function quickbooksConnect(req, res) {
  if (!ensureEnv(["QB_CLIENT_ID", "QB_CLIENT_SECRET", "QB_REDIRECT_URI"], res, "QuickBooks")) return;

  // Carry the Categorizr user id AND the initiating frontend origin through OAuth
  // via `state`, so the callback can (a) store the token against the right user
  // (fk_user_id) and (b) return the user to the SAME origin they started from —
  // otherwise they land on a different origin with no session and get logged out.
  const fkUserId = req.query.fk_user_id || req.query.fkUserId || "";
  const returnUrl = req.query.return_url || "";
  if (!String(fkUserId).trim()) {
    return redirectQuickBooksError(res, returnUrl, "missing_user");
  }
  const state = Buffer.from(
    JSON.stringify({ u: String(fkUserId), r: String(returnUrl), n: crypto.randomUUID() })
  ).toString("base64url");

  const client = getQuickBooksClient();
  try {
    const authUri = client.authorizeUri({
      scope: ["com.intuit.quickbooks.accounting"],
      state,
    });
    return res.redirect(authUri);
  } catch (err) {
    console.error("QuickBooks connect error", err);
    return res.status(500).json({ error: "Failed to start QuickBooks OAuth" });
  }
}

function parseOAuthState(state) {
  try {
    const decoded = JSON.parse(Buffer.from(state || "", "base64url").toString());
    return {
      fkUserId: String(decoded.u || "").trim(),
      returnUrl: String(decoded.r || "").trim(),
    };
  } catch {
    return { fkUserId: "", returnUrl: "" };
  }
}

function redirectQuickBooksError(res, returnUrl, reason) {
  const params = new URLSearchParams({ quickbooks: "error" });
  if (reason) params.set("reason", String(reason).slice(0, 48));
  return res.redirect(`${resolveFrontendOrigin(returnUrl)}/?${params.toString()}`);
}

export async function quickbooksCallback(req, res) {
  const { fkUserId, returnUrl } = parseOAuthState(req.query.state);

  if (!process.env.QB_CLIENT_ID || !process.env.QB_CLIENT_SECRET || !process.env.QB_REDIRECT_URI) {
    console.error("QuickBooks callback missing QB_CLIENT_ID / QB_CLIENT_SECRET / QB_REDIRECT_URI");
    return redirectQuickBooksError(res, returnUrl, "config");
  }

  if (req.query.error) {
    console.error("QuickBooks OAuth denied:", req.query.error, req.query.error_description || "");
    return redirectQuickBooksError(res, returnUrl, String(req.query.error).slice(0, 40));
  }

  const code = req.query.code;
  const realmId = req.query.realmId;
  if (!code) return redirectQuickBooksError(res, returnUrl, "missing_code");
  if (!fkUserId) {
    console.error("QuickBooks callback missing fk_user_id in OAuth state");
    return redirectQuickBooksError(res, returnUrl, "missing_user");
  }
  if (!realmId) return redirectQuickBooksError(res, returnUrl, "missing_company");

  let token;
  try {
    token = await exchangeQuickBooksAuthorizationCode(code);
  } catch (err) {
    const body = err?.response?.data;
    console.error("QuickBooks token exchange failed:", body || err.message);
    const detail = String(body?.error_description || body?.error || err.message || "");
    const reason = /redirect/i.test(detail) ? "redirect_uri" : "token_exchange";
    return redirectQuickBooksError(res, returnUrl, reason);
  }

  try {
    if (!isMysqlConfigured()) {
      throw new Error("MySQL is not configured (DB_HOST, DB_USER, DB_NAME).");
    }
    await saveQuickBooksToken({
      fkUserId,
      realmId,
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresIn: token.expires_in,
      xRefreshExpiresIn: token.x_refresh_token_expires_in,
      tokenJson: token,
    });
  } catch (err) {
    console.error("QuickBooks token save failed:", err.message);
    return redirectQuickBooksError(res, returnUrl, "db_save");
  }

  const frontendUrl = resolveFrontendOrigin(returnUrl);
  return res.redirect(
    `${frontendUrl}/?quickbooks=connected&realmId=${encodeURIComponent(realmId)}`
  );
}

// Return the origin to send the user back to after OAuth. Prefer the origin they
// started from (so they stay logged in), but only if it's one of our own Categorizr
// Vercel origins (main + preview deploys); otherwise fall back to FRONTEND_URL.
function resolveFrontendOrigin(returnUrl) {
  const fallback = process.env.FRONTEND_URL || "http://localhost:5173";
  if (
    typeof returnUrl === "string" &&
    /^https:\/\/categorizr-staging[a-z0-9-]*\.vercel\.app$/i.test(returnUrl)
  ) {
    return returnUrl;
  }
  return fallback;
}

export async function quickbooksStatus(req, res) {
  try {
    const fkUserId = req.query.fk_user_id || req.query.fkUserId;
    if (!fkUserId) {
      return res.status(200).json({ success: true, connected: false, linkedReceiptIds: [] });
    }
    const row = await getQuickBooksToken(fkUserId);
    const linkedReceiptIds = await getLinkedReceiptIds(fkUserId);
    return res.status(200).json({
      success: true,
      connected: !!row,
      realmId: row?.realm_id || undefined,
      linkedReceiptIds,
    });
  } catch (err) {
    console.error("QuickBooks status error", err);
    return res.status(200).json({ success: true, connected: false, linkedReceiptIds: [] });
  }
}

export async function quickbooksDisconnect(req, res) {
  try {
    const fkUserId = req.query.fk_user_id || req.query.fkUserId;
    if (!fkUserId) {
      return res.status(400).json({ success: false, error: "Missing fk_user_id" });
    }
    await deleteQuickBooksToken(fkUserId);
    return res.status(200).json({
      success: true,
      message: "QuickBooks disconnected successfully",
    });
  } catch (err) {
    console.error("QuickBooks disconnect error", err);
    return res.status(500).json({ error: "Failed to disconnect QuickBooks" });
  }
}

async function getQuickBooksTokenForRealm(realmId) {
  let rid = realmId;
  if (!rid) {
    const first = quickbooksTokens.keys().next();
    if (first.done) return null;
    rid = first.value;
  }
  return quickbooksTokens.get(rid) || null;
}

async function getValidQuickBooksClient(realmId) {
  const token = await getQuickBooksTokenForRealm(realmId);
  if (!token) return null;
  const client = getQuickBooksClient();
  client.setToken(token);
  try {
    if (token.refresh_token && token.expires_in) {
      const expiresAt = (token.createdAt || Date.now()) + token.expires_in * 1000;
      if (Date.now() > expiresAt - 60000) {
        await client.refresh();
        const newToken = client.getToken();
        quickbooksTokens.set(realmId || token.realmId, newToken);
        saveQuickBooksTokens();
      }
    }
  } catch (err) {
    console.warn("QuickBooks token refresh:", err.message);
  }
  return client;
}

// ---- QuickBooks helpers (shared by receipt upload) --------------------------

// Format a tax rate for display: "13.0000" -> "13", "13.9950" -> "13.995".
function qbFormatRate(rate) {
  const n = parseFloat(rate);
  return isNaN(n) ? String(rate ?? "").trim() : String(n);
}

const qbFault = (err) =>
  err?.response?.data?.Fault?.Error?.[0]?.Message ||
  err?.response?.data?.Fault?.Error?.[0]?.Detail ||
  err?.message ||
  "unknown error";

// Find an Account by exact Name; create it with the given type if missing.
// Returns the account Id, or null on failure.
async function qbFindOrCreateAccount(baseUrl, rid, accessToken, name, accountType, accountSubType) {
  const trimmed = (name || "").toString().trim();
  if (!trimmed) return null;
  const auth = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  const escaped = trimmed.replace(/'/g, "\\'");
  try {
    const q = `SELECT * FROM Account WHERE Name = '${escaped}' MAXRESULTS 1`;
    const url = `${baseUrl}/v3/company/${rid}/query?query=${encodeURIComponent(q)}`;
    const res = await axios.get(url, { headers: auth });
    const found = res.data?.QueryResponse?.Account?.[0];
    if (found?.Id) return found.Id;
  } catch (err) {
    console.warn(`Account query failed for "${trimmed}":`, qbFault(err));
  }
  const createOnce = async (body) => {
    const res = await axios.post(`${baseUrl}/v3/company/${rid}/account`, body, {
      headers: { ...auth, "Content-Type": "application/json" },
    });
    return res.data?.Account;
  };
  try {
    const body = { Name: trimmed, AccountType: accountType };
    if (accountSubType) body.AccountSubType = accountSubType;
    const created = await createOnce(body);
    if (created?.Id) {
      console.log(`✓ Created account "${trimmed}" (${accountType}/${accountSubType || "-"}) id ${created.Id}`);
      return created.Id;
    }
  } catch (err) {
    console.warn(`Account create failed for "${trimmed}":`, qbFault(err));
    if (accountSubType) {
      try {
        const created = await createOnce({ Name: trimmed, AccountType: accountType });
        if (created?.Id) {
          console.log(`✓ Created account "${trimmed}" (${accountType}/no-subtype) id ${created.Id}`);
          return created.Id;
        }
      } catch (retryErr) {
        console.warn(`Account create retry failed for "${trimmed}":`, qbFault(retryErr));
      }
    }
  }
  return null;
}

// Find a PaymentMethod by exact Name; create it if missing. Returns Id or null.
async function qbFindOrCreatePaymentMethod(baseUrl, rid, accessToken, name) {
  const trimmed = (name || "").toString().trim();
  if (!trimmed) return null;
  const auth = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
  try {
    const q = `SELECT * FROM PaymentMethod WHERE Name = '${trimmed.replace(/'/g, "\\'")}' MAXRESULTS 1`;
    const url = `${baseUrl}/v3/company/${rid}/query?query=${encodeURIComponent(q)}`;
    const res = await axios.get(url, { headers: auth });
    const found = res.data?.QueryResponse?.PaymentMethod?.[0];
    if (found?.Id) return found.Id;
  } catch (err) {
    console.warn(`PaymentMethod query failed for "${trimmed}":`, qbFault(err));
  }
  try {
    const res = await axios.post(`${baseUrl}/v3/company/${rid}/paymentmethod`, { Name: trimmed }, {
      headers: { ...auth, "Content-Type": "application/json" },
    });
    const created = res.data?.PaymentMethod;
    if (created?.Id) {
      console.log(`✓ Created payment method "${trimmed}" id ${created.Id}`);
      return created.Id;
    }
  } catch (err) {
    console.warn(`PaymentMethod create failed for "${trimmed}":`, qbFault(err));
  }
  return null;
}

export async function quickbooksUploadReceipt(req, res) {
  try {
    console.log("quickbooksUploadReceipt called with body:", JSON.stringify(req.body, null, 2));
    
    if (!ensureEnv(["QB_CLIENT_ID", "QB_CLIENT_SECRET", "QB_REDIRECT_URI"], res, "QuickBooks")) return;
    if (!req.body) {
      return res.status(400).json({ error: "Missing receipt payload" });
    }

    const {
      realmId,
      receiptId,
      storeName,
      purchasePrice,
      product_date,
      expense_type,
      product_name,
      receipt_category,
      payment_method,
      card_number,
      subtotal,
      receipt_tax_values,
      tip,
      notes,
      receipt_image,
      emailAttachment,
      receiptImages,
      receiptFileName,
    } = req.body;

    console.log("Extracted receipt data:", {
      realmId,
      receiptId,
      storeName,
      purchasePrice,
      product_date,
      expense_type,
      product_name,
      receipt_category,
      payment_method,
      subtotal,
      tip,
      notes,
      hasReceiptImage: !!receipt_image,
      hasEmailAttachment: !!emailAttachment,
    });

    // Load a valid access token from the DB for this user (auto-refreshes).
    const fkUserId = req.body.fk_user_id || req.body.fkUserId;
    if (!fkUserId) {
      return res.status(400).json({ error: "Missing fk_user_id. Cannot resolve QuickBooks connection." });
    }
    let validToken;
    try {
      validToken = await getValidQuickBooksToken(fkUserId);
    } catch (clientErr) {
      console.error("Error getting QuickBooks token:", clientErr);
      return res.status(500).json({ error: "Failed to get QuickBooks token: " + clientErr.message });
    }
    if (!validToken || !validToken.accessToken) {
      return res.status(400).json({ error: "QuickBooks not connected. Connect QuickBooks first." });
    }

    // Existing code below reads token.access_token — keep that shape.
    const token = { access_token: validToken.accessToken };
    const rid = validToken.realmId || realmId;
    if (!rid) {
      return res.status(400).json({ error: "QuickBooks company ID not found. Please reconnect." });
    }

    console.log("QuickBooks token validated, realmId:", rid);

    const baseUrl =
      (process.env.QB_ENVIRONMENT || "sandbox") === "production"
        ? "https://quickbooks.api.intuit.com"
        : "https://sandbox-quickbooks.api.intuit.com";
    const uploadUrl = `${baseUrl}/v3/company/${rid}/upload?minorversion=69`;

    // Images are optional. Support MULTIPLE images: the frontend may send an array
    // (receiptImages); fall back to the single receipt_image / emailAttachment field.
    const rawSources = (
      Array.isArray(receiptImages) && receiptImages.length
        ? receiptImages
        : [receipt_image || emailAttachment]
    )
      .filter((s) => typeof s === "string" && s.trim() && s.trim() !== "0")
      .map((s) => s.trim());
    // De-dupe while preserving order.
    const imageSources = [...new Set(rawSources)];

    const baseFileName = receiptFileName || `receipt_${receiptId || "img"}`;
    const loadImage = async (src, idx) => {
      try {
        if (src.startsWith("data:") || src.startsWith("/9j/") || /^[A-Za-z0-9+/=]+$/.test(src.slice(0, 100))) {
          const base64 = src.includes(",") ? src.split(",")[1] : src;
          const buf = Buffer.from(base64, "base64");
          if (buf && buf.length > 0) {
            return { buffer: buf, contentType: "image/jpeg", fileName: `${baseFileName}_${idx + 1}.jpg` };
          }
        } else if (src.startsWith("http://") || src.startsWith("https://")) {
          const imgRes = await axios.get(src, { responseType: "arraybuffer", timeout: 30000 });
          const buf = Buffer.from(imgRes.data);
          if (buf && buf.length > 0) {
            let ct = "image/jpeg";
            const hdr = imgRes.headers["content-type"];
            if (hdr) ct = hdr.split(";")[0].trim();
            const ext = ct.includes("png") ? "png" : ct.includes("pdf") ? "pdf" : ct.includes("gif") ? "gif" : "jpg";
            return { buffer: buf, contentType: ct, fileName: `${baseFileName}_${idx + 1}.${ext}` };
          }
        }
      } catch (err) {
        console.warn(`Could not load receipt image #${idx + 1}:`, err.message);
      }
      return null;
    };

    const imageFiles = (
      await Promise.all(imageSources.map((src, idx) => loadImage(src, idx)))
    ).filter(Boolean);
    console.log(`Loaded ${imageFiles.length}/${imageSources.length} receipt image(s) for attachment`);

    // Get Expense account for Purchase line item — exact name = Categorizr expense category.
    // Do not substring-match (e.g. "1a-2" must not match an account named "a" or "1").
    let expenseAccountId = null;
    const categoryName = (expense_type || "").toString().trim();
    if (categoryName && categoryName !== "0") {
      expenseAccountId = await qbFindOrCreateAccount(
        baseUrl, rid, token.access_token, categoryName, "Expense", "OtherBusinessExpenses"
      );
      if (expenseAccountId) {
        console.log(`✓ Expense category account "${categoryName}" id ${expenseAccountId}`);
      } else {
        console.warn(`Could not find or create expense account "${categoryName}"`);
      }
    }

    if (!expenseAccountId) {
      try {
        const accountQueryUrl = `${baseUrl}/v3/company/${rid}/query?query=SELECT * FROM Account WHERE AccountType='Expense' MAXRESULTS 1`;
        const accountRes = await axios.get(accountQueryUrl, {
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            Accept: "application/json",
          },
        });
        const accounts = accountRes.data?.QueryResponse?.Account;
        if (accounts && accounts.length > 0) {
          expenseAccountId = accounts[0].Id;
          console.log(`Using default expense account:`, accounts[0].Name, "ID:", accounts[0].Id);
        }
      } catch (err) {
        console.warn("Could not fetch Expense account:", err.message);
      }
    }

    // Get Bank account for Purchase (top-level AccountRef) - required for Cash/Check/CreditCard payment types
    let bankAccountId = null;
    try {
      const bankQueryUrl = `${baseUrl}/v3/company/${rid}/query?query=SELECT * FROM Account WHERE AccountType='Bank' MAXRESULTS 1`;
      const bankRes = await axios.get(bankQueryUrl, {
        headers: {
          Authorization: `Bearer ${token.access_token}`,
          Accept: "application/json",
        },
      });
      const bankAccounts = bankRes.data?.QueryResponse?.Account;
      if (bankAccounts && bankAccounts.length > 0) {
        bankAccountId = bankAccounts[0].Id;
      }
    } catch (err) {
      console.warn("Could not fetch Bank account:", err.message);
    }

    // A bank account is only the FALLBACK payment account now — card payments use a
    // Credit Card account resolved from the Categorizr payment method below, so a
    // missing bank account is no longer fatal on its own.
    if (!bankAccountId) {
      console.warn("No Bank account found — will rely on a Credit Card payment account.");
    }

    if (!expenseAccountId) {
      return res.status(400).json({ 
        error: "No expense account found in QuickBooks. Please set up at least one expense account in your QuickBooks company." 
      });
    }

    // Create a Purchase (Expense) transaction
    let purchaseId = null;
    let finalAmount = 0.01; // Store for use in response messages
    try {
      let purchaseDate;
      try {
        if (product_date) {
          const dateValue = Number(product_date);
          if (!isNaN(dateValue) && dateValue > 0) {
            purchaseDate = new Date(dateValue * 1000).toISOString().split("T")[0];
          } else {
            // Try parsing as ISO string or other format
            const parsedDate = new Date(product_date);
            if (!isNaN(parsedDate.getTime())) {
              purchaseDate = parsedDate.toISOString().split("T")[0];
            } else {
              purchaseDate = new Date().toISOString().split("T")[0];
            }
          }
        } else {
          purchaseDate = new Date().toISOString().split("T")[0];
        }
      } catch (dateErr) {
        console.warn("Error parsing date, using today:", dateErr.message);
        purchaseDate = new Date().toISOString().split("T")[0];
      }
      
      const purchaseAmount = parseFloat(purchasePrice);
      if (isNaN(purchaseAmount) || purchaseAmount <= 0) {
        console.warn("Invalid purchase price, using 0.01:", purchasePrice);
      }
      finalAmount = (isNaN(purchaseAmount) || purchaseAmount <= 0) ? 0.01 : purchaseAmount;
      
      // Map payment method to QuickBooks PaymentType
      let paymentType = "Cash"; // Default
      let paymentMethodDisplay = payment_method || "";
      if (payment_method) {
        const pm = payment_method.toString().toLowerCase();
        if (pm.includes("credit") || pm.includes("card") || pm.includes("visa") || pm.includes("mastercard") || pm.includes("amex") || pm.includes("discover") || pm.includes("diners") || pm.includes("discover")) {
          paymentType = "CreditCard";
        } else if (pm.includes("check")) {
          paymentType = "Check";
        } else if (pm.includes("cash")) {
          paymentType = "Cash";
        }
        paymentMethodDisplay = payment_method.toString().trim();
      }
      console.log("Payment method mapping:", {
        original: payment_method,
        display: paymentMethodDisplay,
        quickbooksType: paymentType,
      });
      
      // Calculate tax totals
      let totalTax = 0;
      const taxBreakdown = [];
      if (Array.isArray(receipt_tax_values) && receipt_tax_values.length > 0) {
        receipt_tax_values.forEach((tax) => {
          const taxAmount = parseFloat(tax.tax_amount) || 0;
          const taxName = tax.tax_name || "";
          // Exclude tip from tax calculation (tip is separate)
          if (taxName.toLowerCase() !== "tip" && taxAmount > 0) {
            totalTax += taxAmount;
            taxBreakdown.push(`${taxName}: $${taxAmount.toFixed(2)}`);
          }
        });
      }
      
      const tipAmount = parseFloat(tip) || 0;
      const subtotalAmount = parseFloat(subtotal) || (finalAmount - totalTax - tipAmount);
      
      // Build comprehensive memo with ALL receipt details
      // This will be the primary place for description since Line.Description is not supported
      const memoParts = [];
      
      // Add purchase description first (this is what user wants in Description field)
      if (product_name && product_name.trim()) {
        memoParts.push(`${product_name.trim()}`);
      } else if (expense_type && expense_type.trim()) {
        memoParts.push(`${expense_type.trim()} Expense`);
      }
      
      // Add additional details
      if (expense_type && expense_type.trim()) {
        memoParts.push(`Category: ${expense_type.trim()}`);
      }
      const receiptCategory = receipt_category === "0" || receipt_category === 0 ? "Personal" : 
                              receipt_category === "1" || receipt_category === 1 ? "Business" : null;
      if (receiptCategory) {
        memoParts.push(`Type: ${receiptCategory}`);
      }
      if (payment_method && payment_method.trim() && payment_method !== "0") {
        memoParts.push(`Payment Method: ${payment_method.trim()}`);
      }
      if (storeName && storeName.trim()) {
        memoParts.push(`Merchant: ${storeName.trim()}`);
      }
      if (subtotalAmount > 0) {
        memoParts.push(`Subtotal: $${subtotalAmount.toFixed(2)}`);
      }
      if (taxBreakdown.length > 0) {
        memoParts.push(`Tax: ${taxBreakdown.join(", ")}`);
      }
      if (tipAmount > 0) {
        memoParts.push(`Tip: $${tipAmount.toFixed(2)}`);
      }
      if (notes && notes.trim() && notes !== "0") {
        memoParts.push(`Notes: ${notes.trim()}`);
      }
      const memo = memoParts.length > 0 ? memoParts.join(" | ") : null;
      
      // Build the main expense line's Description.
      // Only populate it when the receipt has a "Describe Purchase"; if it's empty
      // the Description stays BLANK (do NOT fall back to the category name).
      // Format when present: "Describe Purchase (Expense Category)".
      let lineItemDescription = "";
      if (product_name && product_name.trim()) {
        lineItemDescription =
          expense_type && expense_type.trim()
            ? `${product_name.trim()} (${expense_type.trim()})`
            : product_name.trim();
      }
      
      // Note: ItemRef lookup will be done after baseUrl and rid are available
      
      // Get tax codes for taxes (GST, PST, etc.) - TaxCodeRef goes inside AccountBasedExpenseLineDetail
      const taxCodes = new Map(); // Map tax name to TaxCode
      const taxValues = Array.isArray(receipt_tax_values) ? receipt_tax_values.filter(t => 
        t.tax_name && t.tax_name.toLowerCase() !== "tip" && parseFloat(t.tax_amount) > 0
      ) : [];
      
      if (taxValues.length > 0) {
        // Query all TaxCodes at once for efficiency
        try {
          const taxCodeQueryUrl = `${baseUrl}/v3/company/${rid}/query?query=SELECT * FROM TaxCode`;
          const taxCodeRes = await axios.get(taxCodeQueryUrl, {
            headers: {
              Authorization: `Bearer ${token.access_token}`,
              Accept: "application/json",
            },
          });
          const allTaxCodes = taxCodeRes.data?.QueryResponse?.TaxCode || [];
          console.log(`Found ${allTaxCodes.length} TaxCodes in QuickBooks`);
          
          // Map all available tax codes
          allTaxCodes.forEach(tc => {
            if (tc.Name) {
              taxCodes.set(tc.Name.toUpperCase(), {
                value: tc.Id,
                name: tc.Name,
              });
            }
          });
        } catch (err) {
          console.warn("Could not query all TaxCodes:", err.message);
        }
        
        // Match receipt taxes to QuickBooks TaxCodes
        for (const tax of taxValues) {
          const taxName = (tax.tax_name || "").trim();
          const taxNameUpper = taxName.toUpperCase();
          
          // Check if we found a matching TaxCode
          if (!taxCodes.has(taxNameUpper)) {
            // Try to find partial match (e.g., "GST" matches "GST (5%)")
            const matched = Array.from(taxCodes.keys()).find(key => 
              key.includes(taxNameUpper) || taxNameUpper.includes(key)
            );
            if (matched) {
              taxCodes.set(taxName, taxCodes.get(matched));
            } else {
              // Use name directly - QuickBooks may create it or use default
              taxCodes.set(taxName, { name: taxName });
              console.log(`Using TaxCode name for ${taxName} (not found in QuickBooks)`);
            }
          } else {
            // Use the found TaxCode
            taxCodes.set(taxName, taxCodes.get(taxNameUpper));
            console.log(`✓ Matched TaxCode for ${taxName}`);
          }
        }
      }
      
      // Build line items with Description
      // Description goes at Line level, BEFORE DetailType (property order matters)
      const lineItems = [];
      
      // Main expense line — Amount = subtotal, category = matched/created Expense account.
      const mainLineItem = {
        Amount: subtotalAmount > 0 ? subtotalAmount : finalAmount,
      };
      if (lineItemDescription && lineItemDescription.trim()) {
        mainLineItem.Description = lineItemDescription.trim();
      }
      mainLineItem.DetailType = "AccountBasedExpenseLineDetail";
      mainLineItem.AccountBasedExpenseLineDetail = {
        AccountRef: { value: expenseAccountId },
      };
      lineItems.push(mainLineItem);

      // Tax / tip stay as extra lines (amounts + descriptions) but use the SAME
      // expense-category account so the Expenses list shows "1a-2" instead of "--Split--".
      for (const tax of taxValues) {
        const taxAmount = parseFloat(tax.tax_amount) || 0;
        if (taxAmount === 0) continue;
        const label = `${(tax.tax_name || "Tax").trim()} (${qbFormatRate(tax.tax_rate)}%)`;
        lineItems.push({
          Amount: taxAmount,
          Description: label,
          DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: { AccountRef: { value: expenseAccountId } },
        });
      }

      if (tipAmount > 0) {
        const tipPct = subtotalAmount > 0 ? Math.round((tipAmount / subtotalAmount) * 100) : 0;
        lineItems.push({
          Amount: tipAmount,
          Description: `TIP (${tipPct}%)`,
          DetailType: "AccountBasedExpenseLineDetail",
          AccountBasedExpenseLineDetail: { AccountRef: { value: expenseAccountId } },
        });
      }
      
      // Ensure total matches sum of line items
      const lineItemsTotal = lineItems.reduce((sum, item) => sum + (parseFloat(item.Amount) || 0), 0);
      const taxTotal = taxValues.reduce((sum, t) => sum + (parseFloat(t.tax_amount) || 0), 0);
      const expectedTotal = subtotalAmount + taxTotal + tipAmount;
      
      if (Math.abs(lineItemsTotal - expectedTotal) > 0.01) {
        // Adjust main line item to match total
        const adjustment = expectedTotal - (lineItemsTotal - (mainLineItem.Amount || 0));
        mainLineItem.Amount = adjustment > 0 ? adjustment : subtotalAmount;
      }
      
      // Extract card number for RefNo
      let refNo = null;
      if (card_number && card_number.toString().trim() && card_number !== "0") {
        refNo = card_number.toString().trim();
      } else if (payment_method) {
        // Try to extract card number from payment method (e.g., "Visa *1234" -> "1234")
        const pmStr = payment_method.toString();
        const cardMatch = pmStr.match(/\*(\d{3,4})/);
        if (cardMatch) {
          refNo = cardMatch[1];
        }
      }
      
      // ── Resolve QuickBooks "Payment account" + "Payment Method" from the
      // Categorizr payment method (e.g. "Mastercard Bank of America *7890"). ──
      // The Payment account (AccountRef) must be a Credit Card account for card
      // payments — match by name or create one (Account Type/Detail Type Credit Card).
      const paymentName = (paymentMethodDisplay || "").toString().trim();
      let accountRefId = null;
      let finalPaymentType = paymentType;
      if (finalPaymentType === "CreditCard" && paymentName) {
        accountRefId = await qbFindOrCreateAccount(
          baseUrl, rid, token.access_token, paymentName, "Credit Card", "CreditCard"
        );
      }
      if (!accountRefId) {
        // Fall back to a bank/cash account. A Bank account can't carry PaymentType
        // "CreditCard", so downgrade the type to keep the Purchase valid.
        accountRefId = bankAccountId;
        if (finalPaymentType === "CreditCard") finalPaymentType = "Cash";
      }
      if (!accountRefId) {
        return res.status(400).json({
          error: "No payment account available in QuickBooks. Add a bank or credit card account, then retry.",
        });
      }

      // Payment Method entity (the "Payment Method" dropdown) — match or create.
      let paymentMethodId = null;
      if (paymentName) {
        paymentMethodId = await qbFindOrCreatePaymentMethod(
          baseUrl, rid, token.access_token, paymentName
        );
      }

      // Build Purchase data with all fields
      const purchaseData = {
        PaymentType: finalPaymentType,
        AccountRef: { value: accountRefId },
        TxnDate: purchaseDate,
        TotalAmt: finalAmount,
        Line: lineItems,
      };
      if (paymentMethodId) {
        purchaseData.PaymentMethodRef = { value: paymentMethodId };
      }

      // Query vendor FIRST before building purchaseData
      // EntityRef must use 'value' (vendor ID) - 'name' alone may cause validation errors
      let vendorId = null;
      if (storeName && storeName.trim()) {
        try {
          const vendorQueryUrl = `${baseUrl}/v3/company/${rid}/query?query=SELECT * FROM Vendor WHERE DisplayName='${encodeURIComponent(storeName.trim())}' MAXRESULTS 1`;
          const vendorRes = await axios.get(vendorQueryUrl, {
            headers: {
              Authorization: `Bearer ${token.access_token}`,
              Accept: "application/json",
            },
          });
          const vendors = vendorRes.data?.QueryResponse?.Vendor;
          if (vendors && vendors.length > 0) {
            vendorId = vendors[0].Id;
            console.log("✓ Found existing vendor:", vendors[0].DisplayName, "ID:", vendorId);
          } else {
            // Try to create vendor if it doesn't exist
            try {
              const createVendorUrl = `${baseUrl}/v3/company/${rid}/vendor`;
              const vendorData = {
                DisplayName: storeName.trim(),
              };
              const createVendorRes = await axios.post(createVendorUrl, vendorData, {
                headers: {
                  Authorization: `Bearer ${token.access_token}`,
                  "Content-Type": "application/json",
                  Accept: "application/json",
                },
              });
              const newVendor = createVendorRes.data?.Vendor;
              if (newVendor?.Id) {
                vendorId = newVendor.Id;
                console.log("✓ Created new vendor:", newVendor.DisplayName, "ID:", vendorId);
              }
            } catch (createErr) {
              console.warn("Could not create vendor, will skip EntityRef:", createErr.message);
            }
          }
        } catch (err) {
          console.warn("Could not query vendor, will skip EntityRef:", err.message);
        }
      }
      
      // EntityRef for vendor/payee (Payee field) - use vendorId (merchant name)
      // QuickBooks Purchase API requires EntityRef.value, not EntityRef.name
      if (vendorId) {
        purchaseData.EntityRef = {
          value: vendorId,
        };
      }
      
      // Ref no. → "Cat - <receiptId>" (QuickBooks DocNumber, max 21 chars).
      if (receiptId != null && `${receiptId}`.trim() !== "") {
        purchaseData.DocNumber = `Cat - ${`${receiptId}`.trim()}`.slice(0, 21);
      }

      // Memo on a QBO Purchase is PrivateNote (Memo is ignored by the API).
      const notesText = notes && notes.toString().trim() && notes.toString().trim() !== "0"
        ? notes.toString().trim()
        : "";
      if (notesText) {
        purchaseData.PrivateNote = notesText;
        purchaseData.Memo = notesText;
      }
      
      console.log("Purchase data prepared:", {
        PaymentType: purchaseData.PaymentType,
        PaymentMethod: payment_method || "Not provided",
        EntityRef: purchaseData.EntityRef || "Not set",
        RefNo: purchaseData.RefNo || "Not set",
        AccountRef: purchaseData.AccountRef,
        TxnDate: purchaseData.TxnDate,
        TotalAmt: purchaseData.TotalAmt,
        Memo: purchaseData.Memo || "Not set",
        PrivateNote: purchaseData.PrivateNote || "Not set",
        LineCount: purchaseData.Line.length,
        LineItems: purchaseData.Line.map(l => ({ 
          Description: l.Description, 
          Amount: l.Amount,
          DetailType: l.DetailType,
        })),
      });

      const purchaseUrl = `${baseUrl}/v3/company/${rid}/purchase`;
      
      // Validate Purchase data structure before sending
      console.log("Purchase data structure validation:");
      console.log("- PaymentType:", purchaseData.PaymentType);
      console.log("- AccountRef:", JSON.stringify(purchaseData.AccountRef));
      console.log("- TxnDate:", purchaseData.TxnDate);
      console.log("- TotalAmt:", purchaseData.TotalAmt);
      console.log("- Memo:", purchaseData.Memo || "not set");
      console.log("- PrivateNote:", purchaseData.PrivateNote || "not set");
      console.log("- EntityRef:", JSON.stringify(purchaseData.EntityRef || "not set"));
      console.log("- Line count:", purchaseData.Line.length);
      purchaseData.Line.forEach((line, idx) => {
        console.log(`- Line ${idx + 1}:`, {
          Amount: line.Amount,
          Description: line.Description || "not set",
          DetailType: line.DetailType,
          AccountRef: line.AccountBasedExpenseLineDetail?.AccountRef,
        });
      });
      
      console.log("Creating Purchase:", JSON.stringify(purchaseData, null, 2));
      
      // Log detailed error information if request fails
      const postPurchase = (body) =>
        axios.post(purchaseUrl, body, {
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
        });

      const handlePurchaseError = (err) => {
        console.error("QuickBooks Purchase API Error:", JSON.stringify(err.response?.data, null, 2));
        const fault = err.response?.data?.Fault;
        if (fault && fault.Error) {
          const errors = Array.isArray(fault.Error) ? fault.Error : [fault.Error];
          console.error("QuickBooks Validation Errors:");
          errors.forEach((error, idx) => {
            console.error(`  Error ${idx + 1}:`, {
              code: error.code,
              element: error.element,
              detail: error.Detail,
              message: error.Message,
            });
          });
        }
        console.error("Error details:", {
          status: err.response?.status,
          statusText: err.response?.statusText,
          fault: fault,
        });
        throw err;
      };

      let purchaseRes;
      try {
        purchaseRes = await postPurchase(purchaseData);
      } catch (firstErr) {
        // Some companies reject optional fields (PaymentMethodRef / DocNumber) on a
        // Purchase. Rather than lose the whole expense, strip them and retry once so
        // the transaction, categories and attachment still go through.
        if (purchaseData.PaymentMethodRef || purchaseData.DocNumber) {
          console.warn(
            "Purchase failed with optional fields; retrying without PaymentMethodRef/DocNumber:",
            qbFault(firstErr)
          );
          const retryData = { ...purchaseData };
          delete retryData.PaymentMethodRef;
          delete retryData.DocNumber;
          try {
            purchaseRes = await postPurchase(retryData);
          } catch (retryErr) {
            purchaseRes = undefined;
            handlePurchaseError(retryErr);
          }
        } else {
          handlePurchaseError(firstErr);
        }
      }

      console.log("Purchase creation response:", JSON.stringify(purchaseRes.data, null, 2));
      
      // QuickBooks POST returns Purchase directly, not wrapped in QueryResponse
      const purchase = purchaseRes.data?.Purchase || purchaseRes.data?.QueryResponse?.Purchase?.[0];
      if (purchase?.Id) {
        purchaseId = purchase.Id;
        console.log("Purchase created successfully with ID:", purchaseId, "SyncToken:", purchase.SyncToken);
        
        // Verify Purchase exists and check for attachments
        try {
          const verifyUrl = `${baseUrl}/v3/company/${rid}/query?query=SELECT * FROM Purchase WHERE Id='${purchaseId}'`;
          const verifyRes = await axios.get(verifyUrl, {
            headers: {
              Authorization: `Bearer ${token.access_token}`,
              Accept: "application/json",
            },
          });
          const verifiedPurchase = verifyRes.data?.QueryResponse?.Purchase?.[0];
          if (verifiedPurchase) {
            console.log("Verified Purchase exists and is queryable:", verifiedPurchase.Id);
            console.log("Purchase details:", {
              id: verifiedPurchase.Id,
              date: verifiedPurchase.TxnDate,
              total: verifiedPurchase.TotalAmt,
              vendor: verifiedPurchase.EntityRef?.name || "N/A",
            });
            
            // Query for attachments linked to this Purchase
            try {
              const attachableUrl = `${baseUrl}/v3/company/${rid}/query?query=SELECT * FROM Attachable WHERE AttachableRef.EntityRef.value='${purchaseId}'`;
              const attachableRes = await axios.get(attachableUrl, {
                headers: {
                  Authorization: `Bearer ${token.access_token}`,
                  Accept: "application/json",
                },
              });
              const attachables = attachableRes.data?.QueryResponse?.Attachable || [];
              if (attachables.length > 0) {
                console.log(`✓ Found ${attachables.length} attachment(s) linked to Purchase ${purchaseId}:`, 
                  attachables.map(a => ({ id: a.Id, fileName: a.FileName, size: a.Size }))
                );
              } else {
                console.warn(`⚠ No attachments found linked to Purchase ${purchaseId} (may need a moment to sync)`);
              }
            } catch (attachErr) {
              console.warn("Could not query attachments:", attachErr.message);
              console.warn("Attachment query error details:", attachErr?.response?.data);
            }
          } else {
            console.warn("Purchase created but not immediately queryable (may need sync time)");
          }
        } catch (verifyErr) {
          console.warn("Could not verify Purchase (may need time to sync):", verifyErr.message);
          console.warn("Verification error details:", verifyErr?.response?.data);
        }
      } else {
        console.error("Purchase ID not found in response. Full response:", JSON.stringify(purchaseRes.data, null, 2));
      }
    } catch (err) {
      console.error("Error creating Purchase:", err?.response?.data || err.message);
      const fault = err?.response?.data?.Fault;
      if (fault) {
        const errors = Array.isArray(fault.Error) ? fault.Error : [fault.Error];
        const errorDetails = errors.map((e) => ({
          code: e.code,
          element: e.element,
          message: e.Message,
          detail: e.Detail,
        }));
        console.error("Purchase creation error details:", JSON.stringify(errorDetails, null, 2));
        const errMsg = errors.map((e) => e.Message || e.Detail || e.code || JSON.stringify(e)).join("; ");
        return res.status(400).json({ 
          error: `Failed to create expense transaction: ${errMsg}`,
          details: errorDetails,
        });
      }
      return res.status(400).json({ error: "Failed to create expense transaction. Please check your QuickBooks account setup." });
    }

    if (!purchaseId) {
      return res.status(400).json({ error: "Failed to create expense transaction in QuickBooks." });
    }

    if (fkUserId && receiptId) {
      try {
        await addLinkedReceipt(fkUserId, receiptId, purchaseId);
      } catch (linkErr) {
        console.warn("Could not persist QuickBooks-linked receipt id:", linkErr.message);
      }
    }

    // Attach EVERY receipt image to the Purchase (QuickBooks Attachable).
    let attachedCount = 0;
    for (let i = 0; i < imageFiles.length; i++) {
      const img = imageFiles[i];
      try {
        const cleanFileName = img.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
        const metadata = {
          AttachableRef: [{ EntityRef: { type: "Purchase", value: purchaseId } }],
          ContentType: img.contentType,
          FileName: cleanFileName,
        };

        const form = new FormData();
        form.append("file_content_01", img.buffer, { filename: cleanFileName, contentType: img.contentType });
        form.append("file_metadata_01", JSON.stringify(metadata), {
          contentType: "application/json",
          filename: "file_metadata_01",
        });

        // Intuit's /upload rejects chunked transfer-encoding — send the multipart body
        // as a single Buffer with an explicit Content-Length.
        const formBuffer = form.getBuffer();
        const response = await axios.post(uploadUrl, formBuffer, {
          headers: {
            Authorization: `Bearer ${token.access_token}`,
            Accept: "application/json",
            ...form.getHeaders(),
            "Content-Length": formBuffer.length,
          },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 60000,
        });
        const data = response.data;
        const fault = data?.Fault || data?.AttachableResponse?.[0]?.Fault;
        const attachable = data?.AttachableResponse?.[0]?.Attachable || data?.Attachable;
        if (!fault && attachable?.Id) {
          attachedCount++;
          console.log(`✓ Attached image ${i + 1}/${imageFiles.length} (Attachable ${attachable.Id})`);
        } else {
          console.error(`Attachment ${i + 1} fault:`, JSON.stringify(fault || data, null, 2));
        }
      } catch (err) {
        console.error(`Attachment ${i + 1} upload error:`, err?.response?.data || err.message);
      }
    }

    const environment = (process.env.QB_ENVIRONMENT || "sandbox") === "production" ? "app" : "sandbox";
    const quickbooksBaseUrl = `https://${environment}.qbo.intuit.com`;
    const displayAmount = (typeof finalAmount === "number" && !isNaN(finalAmount)) ? finalAmount.toFixed(2) : "0.00";

    let warning;
    if (imageFiles.length > 0 && attachedCount === 0) {
      warning = "Expense created, but the receipt image(s) could not be attached.";
    } else if (attachedCount > 0 && attachedCount < imageFiles.length) {
      warning = `Expense created; ${attachedCount} of ${imageFiles.length} image(s) attached.`;
    }

    return res.status(200).json({
      success: true,
      message: attachedCount > 0
        ? `Receipt linked to QuickBooks successfully! Purchase ID: ${purchaseId}`
        : `Expense created in QuickBooks! Purchase ID: ${purchaseId}`,
      purchaseId,
      attachedCount,
      imageCount: imageFiles.length,
      quickbooksUrl: `${quickbooksBaseUrl}/app/expenses`,
      instructions: `To view the expense: Go to Expenses in QuickBooks and search for transaction #${purchaseId} or amount $${displayAmount}.`,
      ...(warning && { warning }),
    });
  } catch (err) {
    console.error("QuickBooks upload receipt - unexpected error:", err);
    console.error("Error stack:", err.stack);
    console.error("Error details:", {
      message: err.message,
      response: err?.response?.data,
      status: err?.response?.status,
      name: err.name,
    });
    
    // Try to provide more specific error information
    let errorMessage = "Internal server error";
    if (err.message) {
      errorMessage += ": " + err.message;
    }
    
    // If it's a QuickBooks API error, try to extract more details
    if (err?.response?.data?.Fault) {
      const fault = err.response.data.Fault;
      const errors = Array.isArray(fault.Error) ? fault.Error : [fault.Error];
      const errMsg = errors.map((e) => e.Message || e.Detail || e.code).join("; ");
      if (errMsg) {
        errorMessage = `QuickBooks API error: ${errMsg}`;
      }
    }
    
    return res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === "development" ? err.stack : undefined
    });
  }
}

// ---------- Xero ----------
let xeroClient;
function getXeroClient() {
  if (!xeroClient) {
    xeroClient = new XeroClient({
      clientId: process.env.XERO_CLIENT_ID,
      clientSecret: process.env.XERO_CLIENT_SECRET,
      redirectUris: [process.env.XERO_REDIRECT_URI || ""],
      scopes: [
        "offline_access",
        "accounting.transactions",
        "accounting.contacts",
        "accounting.attachments",
        "accounting.settings",
      ],
      state: crypto.randomUUID(),
    });
  }
  return xeroClient;
}

export async function xeroConnect(req, res) {
  if (!ensureEnv(["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_REDIRECT_URI"], res, "Xero")) return;
  try {
    const client = getXeroClient();
    const consentUrl = await client.buildConsentUrl();
    return res.redirect(consentUrl);
  } catch (err) {
    console.error("Xero connect error", err);
    return res.status(500).json({ error: "Failed to start Xero OAuth" });
  }
}

export async function xeroCallback(req, res) {
  if (!ensureEnv(["XERO_CLIENT_ID", "XERO_CLIENT_SECRET", "XERO_REDIRECT_URI"], res, "Xero")) return;
  try {
    const client = getXeroClient(); 
    const tokenSet = await client.apiCallback(req.url);
    await client.updateTenants();
    xeroTokenSet.tokenSet = tokenSet;
    xeroTokenSet.tenants = client.tenants || [];
    const firstTenant = xeroTokenSet.tenants[0];
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    const searchParams = new URLSearchParams({
      xero: "connected",
    });
    if (firstTenant?.tenantId) {
      searchParams.set("tenantId", firstTenant.tenantId);
    }
    const redirectUrl = `${frontendUrl}/?${searchParams.toString()}`;
    return res.redirect(redirectUrl);
  } catch (err) { 
    console.error("Xero callback error", err);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
    return res.redirect(`${frontendUrl}/?xero=error`);
  }
}

export async function xeroUploadReceipt(req, res) {
  if (!xeroTokenSet.tokenSet) {
    return res.status(400).json({ error: "Connect Xero first" });
  }
  const tenants = xeroTokenSet.tenants || [];
  const tenantId = req.body?.tenantId || tenants[0]?.tenantId;
  if (!tenantId) {
    return res.status(400).json({ error: "No Xero tenant available. Re-connect or specify tenantId." });
  }
  try {
    const {
      receiptId,
      storeName,
      purchasePrice,
      product_date,
      expense_type,
      product_name,
      payment_method,
      card_number,
      subtotal,
      receipt_tax_values,
      tip,
      notes,
      receipt_image,
      emailAttachment,
      receiptFileName,
    } = req.body || {};

    const amountNumber = parseFloat(purchasePrice);
    const amount = Number.isFinite(amountNumber) && amountNumber !== 0 ? amountNumber : 0.01;

    let purchaseDate;
    try {
      const ts = product_date ? (typeof product_date === "number" ? product_date : parseInt(product_date, 10)) : null;
      purchaseDate = ts ? new Date(ts * 1000).toISOString().split("T")[0] : new Date().toISOString().split("T")[0];
    } catch {
      purchaseDate = new Date().toISOString().split("T")[0];
    }

    // Due date defaults to 30 days after purchase date
    const dueDateObj = new Date(purchaseDate);
    dueDateObj.setDate(dueDateObj.getDate() + 30);
    const dueDate = dueDateObj.toISOString().split("T")[0];

    const tokenSet = xeroTokenSet.tokenSet;
    const apiBase = "https://api.xero.com/api.xro/2.0";
    const xeroHeaders = {
      Authorization: `Bearer ${tokenSet.access_token}`,
      "xero-tenant-id": tenantId,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    // Build line items from receipt details
    const lineItems = [];

    // Main item line
    const mainDescription = [product_name, expense_type].filter(Boolean).join(" – ").slice(0, 400) || "Receipt from Categorizr";
    const subtotalNumber = parseFloat(subtotal);
    const mainAmount = Number.isFinite(subtotalNumber) && subtotalNumber > 0 ? subtotalNumber : amount;
    lineItems.push({
      Description: mainDescription,
      Quantity: 1,
      UnitAmount: mainAmount,
      AccountCode: "400", // Generic Expenses account
    });

    // Tax lines
    const taxes = Array.isArray(receipt_tax_values) ? receipt_tax_values : [];
    for (const tax of taxes) {
      const taxAmount = parseFloat(tax.tax_value || tax.amount || 0);
      if (Number.isFinite(taxAmount) && taxAmount > 0) {
        lineItems.push({
          Description: tax.tax_name || tax.name || "Tax",
          Quantity: 1,
          UnitAmount: taxAmount,
          AccountCode: "400",
        });
      }
    }

    // Tip line
    const tipAmount = parseFloat(tip);
    if (Number.isFinite(tipAmount) && tipAmount > 0) {
      lineItems.push({
        Description: "Tip",
        Quantity: 1,
        UnitAmount: tipAmount,
        AccountCode: "400",
      });
    }

    // Build reference with payment method details
    const referenceParts = [`Categorizr ${receiptId || ""}`.trim()];
    if (payment_method) referenceParts.push(payment_method);
    if (card_number) referenceParts.push(`****${card_number}`);
    const reference = referenceParts.join(" | ").slice(0, 255);

    // Build the narrative/notes field
    const narrativeParts = [];
    if (notes) narrativeParts.push(notes);
    if (expense_type) narrativeParts.push(`Category: ${expense_type}`);
    const narrative = narrativeParts.join(" | ").slice(0, 4000) || undefined;

    // 1) Create an ACCPAY Invoice (Bill) — shows in Purchases → Bills
    const invoicePayload = {
      Invoices: [
        {
          Type: "ACCPAY",
          Contact: {
            Name: storeName || "Unknown Merchant",
          },
          Date: purchaseDate,
          DueDate: dueDate,
          LineAmountTypes: "Inclusive",
          LineItems: lineItems,
          Reference: reference,
          Status: "DRAFT",
        },
      ],
    };

    if (narrative) {
      invoicePayload.Invoices[0].Narration = narrative;
    }

    const invoiceRes = await axios.post(`${apiBase}/Invoices`, invoicePayload, {
      headers: xeroHeaders,
      timeout: 20000,
    });

    const invoice = invoiceRes.data?.Invoices?.[0];
    const invoiceId = invoice?.InvoiceID;
    const invoiceNumber = invoice?.InvoiceNumber;

    // 2) Attach the receipt image if available
    const imageData = receipt_image || emailAttachment;
    if (invoiceId && imageData) {
      try {
        let imageBuffer;
        let mimeType = "image/jpeg";
        let fileName = receiptFileName || `receipt_${receiptId || Date.now()}.jpg`;

        if (typeof imageData === "string" && imageData.startsWith("data:")) {
          const matches = imageData.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            mimeType = matches[1];
            imageBuffer = Buffer.from(matches[2], "base64");
            if (mimeType === "application/pdf") fileName = fileName.replace(/\.(jpg|jpeg|png)$/i, ".pdf");
          }
        } else if (typeof imageData === "string" && imageData.startsWith("http")) {
          const imgRes = await axios.get(imageData, { responseType: "arraybuffer", timeout: 15000 });
          imageBuffer = Buffer.from(imgRes.data);
          const contentType = imgRes.headers["content-type"] || "image/jpeg";
          mimeType = contentType.split(";")[0].trim();
        }

        if (imageBuffer) {
          await axios.post(
            `${apiBase}/Invoices/${invoiceId}/Attachments/${encodeURIComponent(fileName)}`,
            imageBuffer,
            {
              headers: {
                Authorization: `Bearer ${tokenSet.access_token}`,
                "xero-tenant-id": tenantId,
                "Content-Type": mimeType,
              },
              timeout: 30000,
            }
          );
        }
      } catch (attachErr) {
        console.warn("Xero attachment upload failed (non-fatal):", attachErr?.response?.data || attachErr.message);
      }
    }

    const xeroUrl = invoiceId
      ? `https://go.xero.com/AccountsPayable/View.aspx?InvoiceID=${invoiceId}`
      : "https://go.xero.com/app/bills/list/all";

    return res.status(200).json({
      success: true,
      tenantId,
      invoiceId,
      invoiceNumber,
      message: invoiceId
        ? `Bill created in Xero (${invoiceNumber || invoiceId}). It appears under Purchases → Bills.`
        : "Bill created in Xero under Purchases → Bills.",
      xeroUrl,
    });
  } catch (err) {
    const status = err?.response?.status;
    const data = err?.response?.data;
    console.error("Xero upload receipt error", status, data || err.message);
    let message = "Failed to create bill in Xero.";
    if (data?.Elements && Array.isArray(data.Elements)) {
      const errors = data.Elements.flatMap((el) => el.ValidationErrors || []);
      const details = errors.map((e) => e.Message).filter(Boolean).join("; ");
      if (details) message = `Xero validation error: ${details}`;
    } else if (data?.Message) {
      message = `Xero error: ${data.Message}`;
    }
    return res.status(status && status >= 400 ? status : 500).json({
      error: message,
    });
  }
}

export async function xeroStatus(req, res) {
  const connected = !!xeroTokenSet.tokenSet;
  return res.status(200).json({
    success: true,
    connected,
    tenantCount: xeroTokenSet.tenants?.length || 0,
    tenants: xeroTokenSet.tenants?.map((t) => ({
      tenantId: t.tenantId,
      tenantName: t.tenantName,
      tenantType: t.tenantType,
    })),
  });
}

// ---------- FreshBooks (New OAuth) ----------
const freshBooksToken = { tokenSet: null, state: null };

function ensureFreshBooksOAuthEnv(res) {
  const required = ["FRESHBOOKS_CLIENT_ID", "FRESHBOOKS_CLIENT_SECRET", "FRESHBOOKS_REDIRECT_URI"];
  const missing = required.filter((v) => !process.env[v]);
  if (missing.length) {
    res.status(500).json({
      error: `FreshBooks env vars missing: ${missing.join(", ")}`,
    });
    return false;
  }
  return true;
}

export function freshbooksClassicConnect(req, res) {
  if (!ensureFreshBooksOAuthEnv(res)) return;
  // FreshBooks scopes must exactly match what is configured in the app:
  // user:profile:read user:account:read user:account:write
  const scopes =
    process.env.FRESHBOOKS_SCOPES ||
    "user:profile:read user:account:read user:account:write";
  const state = crypto.randomUUID();
  freshBooksToken.state = state;
  const params = new URLSearchParams({
    client_id: process.env.FRESHBOOKS_CLIENT_ID,
    response_type: "code",
    redirect_uri: process.env.FRESHBOOKS_REDIRECT_URI,
    scope: scopes,
    state,
  });
  const authUrl = `https://auth.freshbooks.com/service/auth/oauth/authorize?${params.toString()}`;
  return res.redirect(authUrl);
}

export async function freshbooksClassicStatus(req, res) {
  const ready = !!freshBooksToken.tokenSet;
  return res.status(200).json({
    success: true,
    ready,
    scopes: ready ? freshBooksToken.tokenSet.scope : [],
    expires: ready ? freshBooksToken.tokenSet.expires_in : null,
  });
}

export async function freshbooksClassicCallback(req, res) {
  if (!ensureFreshBooksOAuthEnv(res)) return;
  const { code, state } = req.query;
  if (!code) {
    return res.status(400).json({ error: "Missing code" });
  }
  if (freshBooksToken.state && state && state !== freshBooksToken.state) {
    return res.status(400).json({ error: "Invalid state" });
  }

  try {
    const tokenResp = await axios.post(
      "https://api.freshbooks.com/auth/oauth/token",
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: process.env.FRESHBOOKS_REDIRECT_URI,
      }).toString(),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization:
            "Basic " +
            Buffer.from(`${process.env.FRESHBOOKS_CLIENT_ID}:${process.env.FRESHBOOKS_CLIENT_SECRET}`).toString(
              "base64"
            ),
        },
      }
    );

    freshBooksToken.tokenSet = tokenResp.data;
    return res.status(200).json({ success: true, token: true, scope: tokenResp.data.scope });
  } catch (err) {
    console.error("FreshBooks OAuth callback error", err?.response?.data || err.message);
    return res.status(500).json({ error: "FreshBooks OAuth callback failed" });
  }
}

export async function freshbooksClassicUploadReceipt(req, res) {
  if (!freshBooksToken.tokenSet) {
    return res.status(400).json({ error: "Connect FreshBooks first" });
  }

  const {
    amount,
    currency = process.env.FRESHBOOKS_CURRENCY || "USD",
    notes,
    categoryName,
    vendor,
    staffId = process.env.FRESHBOOKS_STAFF_ID,
    clientId = process.env.FRESHBOOKS_CLIENT_ID,
    receiptFileName,
    receiptBase64,
  } = req.body || {};

  if (!amount || !receiptBase64 || !receiptFileName) {
    return res.status(400).json({
      error: "Missing required fields: amount, receiptFileName, receiptBase64",
    });
  }

  // Stub payload for future real API call
  const expensePayload = {
    amount,
    currency,
    notes: notes || "Receipt import from Categorizr",
    categoryName: categoryName || "General",
    vendor: vendor || "",
    staffId,
    clientId,
    attachment: {
      fileName: receiptFileName,
      base64: receiptBase64,
    },
  };

  return res.status(200).json({
    success: true,
    message: "FreshBooks OAuth stub: map payload to expenses endpoint with attachment using access_token.",
    expensePayload,
    nextSteps: "Call FreshBooks expenses + attachments API with the stored access_token.",
  });
}

// ---------- Sage Intacct (XML) ----------
function buildIntacctLoginXML({ senderId, senderPassword, companyId, userId, userPassword }) {
  return create({ version: "1.0", encoding: "utf-8" })
    .ele("request")
    .ele("control")
    .ele("senderid").txt(senderId).up()
    .ele("password").txt(senderPassword).up()
    .ele("controlid").txt("categorizr-login").up()
    .ele("uniqueid").txt("false").up()
    .ele("dtdversion").txt("3.0").up()
    .ele("includewhitespace").txt("false").up()
    .up()
    .ele("operation")
    .ele("authentication")
    .ele("login")
    .ele("userid").txt(userId).up()
    .ele("companyid").txt(companyId).up()
    .ele("password").txt(userPassword).up()
    .up()
    .up()
    .up()
    .end({ prettyPrint: true });
}

export async function sageIntacctUpload(req, res) {
  const required = [
    "SAGE_INTACCT_SENDER_ID",
    "SAGE_INTACCT_SENDER_PASSWORD",
    "SAGE_INTACCT_COMPANY_ID",
    "SAGE_INTACCT_USER_ID",
    "SAGE_INTACCT_USER_PASSWORD",
  ];
  if (!ensureEnv(required, res, "Sage Intacct")) return;

  const payload = req.body || {};
  const xml = buildIntacctLoginXML({
    senderId: process.env.SAGE_INTACCT_SENDER_ID,
    senderPassword: process.env.SAGE_INTACCT_SENDER_PASSWORD,
    companyId: process.env.SAGE_INTACCT_COMPANY_ID,
    userId: process.env.SAGE_INTACCT_USER_ID,
    userPassword: process.env.SAGE_INTACCT_USER_PASSWORD,
  });

  try {
    const response = await axios.post(
      "https://api.intacct.com/ia/xml/xmlgw.phtml",
      xml,
      {
        headers: { "Content-Type": "application/xml" },
        timeout: 15000,
      }
    );

    return res.status(200).json({
      success: true,
      message:
        "Sage Intacct login call attempted. Map receipt fields to bill/expense + attachments next.",
      echoedRequest: payload,
      status: response.status,
    });
  } catch (err) {
    console.error("Sage Intacct error", err?.response?.data || err.message);
    return res.status(500).json({ error: "Sage Intacct request failed", detail: err.message });
  }
}

// Simple connect/status for Sage Intacct (no OAuth; checks env)
export function sageIntacctConnect(req, res) {
  const required = [
    "SAGE_INTACCT_SENDER_ID",
    "SAGE_INTACCT_SENDER_PASSWORD",
    "SAGE_INTACCT_COMPANY_ID",
    "SAGE_INTACCT_USER_ID",
    "SAGE_INTACCT_USER_PASSWORD",
  ];
  if (!ensureEnv(required, res, "Sage Intacct")) return;
  return res.status(200).json({ success: true, message: "Sage Intacct credentials are configured." });
}

export function sageIntacctStatus(req, res) {
  const ready =
    !!process.env.SAGE_INTACCT_SENDER_ID &&
    !!process.env.SAGE_INTACCT_SENDER_PASSWORD &&
    !!process.env.SAGE_INTACCT_COMPANY_ID &&
    !!process.env.SAGE_INTACCT_USER_ID &&
    !!process.env.SAGE_INTACCT_USER_PASSWORD;
  return res.status(200).json({
    success: true,
    ready,
  });
}

// ---------- Sage Business Cloud ----------
export async function sageBusinessCloudUpload(req, res) {
  // TODO: implement OAuth2 token exchange + REST call for bills/attachments.
  return res.status(200).json({
    success: true,
    message: "Sage Business Cloud stub; implement OAuth2 + receipt upload",
  });
}
