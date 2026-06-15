import {
  buildReceiptTipTaxEntry,
  filterNonTipReceiptTaxValues,
  findTipLineInReceiptTaxValues,
} from "../utils/taxTypeUtils";
import { calendarUnixToMobileUnix } from "../utils/receiptDate";

const BASE_URL = "/api";

const authHeaders = () => ({
  "Content-Type": "application/json",
  Accesstoken: localStorage.getItem("token"),
});

const toPositiveInt = (value) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const toInt = (value, fallback = 0) => {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const isForwardSuccessResponse = (data) => {
  if (!data) return true;
  if (typeof data === "string") {
    return /success|ok|forward/i.test(data);
  }
  if (typeof data !== "object") return false;
  if (data.originalUsername != null) return true;
  if (
    typeof data.message === "string" &&
    /success|forward|sent/i.test(data.message)
  ) {
    return true;
  }
  const code = data.code != null ? String(data.code) : "";
  if (code && code !== "0" && code !== "200") return false;
  if (data.message && /fail|error|invalid|not found/i.test(String(data.message))) {
    return false;
  }
  return !("code" in data && "message" in data);
};

const parseResponseBody = async (res) => {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const inferLast4 = (paymentType, last4) => {
  const raw = (last4 || "").toString().trim();
  if (raw && raw !== "0") return raw;
  const pt = (paymentType || "").toString();
  if (!pt.includes("*")) return "";
  const matches = [...pt.matchAll(/\*(\d{3,4})/g)];
  return matches.length > 0 ? matches[matches.length - 1][1] : "";
};

const getReceiptTaxValues = (receipt) => {
  if (Array.isArray(receipt?.receipt_tax_values)) return receipt.receipt_tax_values;
  if (Array.isArray(receipt?.receiptTaxValues)) return receipt.receiptTaxValues;
  return [];
};

/** Tax lines for a newly created receipt on the recipient account. */
const buildForwardTaxValues = (receipt, recipientUserId) => {
  const recipientId = toPositiveInt(recipientUserId);
  const allTaxValues = getReceiptTaxValues(receipt);
  const existingTipLine =
    findTipLineInReceiptTaxValues(allTaxValues) ||
    findTipLineInReceiptTaxValues(receipt._sourceReceiptTaxValues);
  const tipAmount =
    parseFloat(receipt.tip) ||
    (existingTipLine ? parseFloat(existingTipLine.tax_amount) : 0) ||
    0;
  const subtotal =
    parseFloat(receipt.subtotal) ||
    (() => {
      const total =
        parseFloat(receipt.purchasePrice ?? receipt.purchase_price ?? 0) || 0;
      const nonTipTaxSum = filterNonTipReceiptTaxValues(allTaxValues).reduce(
        (sum, t) => sum + (parseFloat(t.tax_amount) || 0),
        0,
      );
      return Math.max(0, total - tipAmount - nonTipTaxSum);
    })();

  const taxLines = filterNonTipReceiptTaxValues(allTaxValues).map((t) => ({
    id: 0,
    fk_user_id: recipientId || toPositiveInt(t.fk_user_id),
    fk_receipt_id: 0,
    fk_tax_id: toInt(t.fk_tax_id),
    tax_name: (t.tax_name || "").toString(),
    tax_rate: (t.tax_rate ?? "0").toString(),
    tax_amount: (parseFloat(t.tax_amount) || 0).toString(),
    created: 0,
    updated: 0,
  }));

  const tipLine = buildReceiptTipTaxEntry({
    tipAmount,
    subtotal,
    taxDefinitions: [],
    existingTipLine,
    fk_receipt_id: 0,
    fk_user_id: recipientId,
  });
  if (tipLine) {
    taxLines.push({
      ...tipLine,
      id: 0,
      fk_user_id: recipientId || toPositiveInt(tipLine.fk_user_id),
      fk_receipt_id: 0,
      created: 0,
      updated: 0,
    });
  }

  return taxLines;
};

/** UserReceipt body for POST /user/forwardreceiptv2. Sender from Accesstoken; recipient via forward_to_user_id. */
export const buildForwardPayload = (receipt, recipientUserId) => {
  const sourceReceiptId = toPositiveInt(receipt.id);
  const recipientId = toPositiveInt(recipientUserId);
  const paymentType = (receipt.paymentType || receipt.payment_type || "")
    .toString()
    .trim();
  const basePaymentType = paymentType.replace(/\s*\*\d{3,4}/g, "").trim();
  const last4 = inferLast4(
    paymentType,
    receipt.last_4_digit_card || receipt.last4DigitCard
  );

  const originalId =
    receipt.fk_original_receipt_id &&
    String(receipt.fk_original_receipt_id) !== "0"
      ? String(receipt.fk_original_receipt_id)
      : String(sourceReceiptId);

  return {
    id: sourceReceiptId,
    forward_to_user_id: recipientId,
    storeName: receipt.storeName || receipt.store_name || "",
    product_name: receipt.product_name || receipt.productName || "",
    emailAttachment: (receipt.emailAttachment || "0").toString(),
    purchasePrice: (receipt.purchasePrice ?? receipt.purchase_price ?? "0").toString(),
    total_amount: (
      receipt.total_amount ??
      receipt.purchasePrice ??
      receipt.purchase_price ??
      "0"
    ).toString(),
    payment_category_type: toInt(receipt.payment_category_type),
    status: toInt(receipt.status, 1),
    paymentType: basePaymentType || paymentType,
    last_4_digit_card: last4,
    card_issuer_name: receipt.card_issuer_name || receipt.cardIssuerName || "",
    fk_original_receipt_id: originalId,
    fk_forward_from_receipt_id: String(sourceReceiptId),
    receipt_category: toInt(receipt.receipt_category),
    product_date: calendarUnixToMobileUnix(
      receipt.product_date,
      receipt.create_date ?? receipt.createDate,
      {
        isDraft: receipt.is_draft === "1" || receipt.is_draft === 1,
        fk_incoming_email_id: receipt.fk_incoming_email_id,
      },
    ),
    expense_type: receipt.expense_type || receipt.expenseType || "",
    receipt_image: (receipt.receipt_image || receipt.receiptImage || "0").toString(),
    store_image: receipt.store_image || receipt.storeImage || "",
    receipt_tag: receipt.receipt_tag || "0,0,0,0,0,0,0",
    notes: receipt.notes || "",
    receipt_forwarded: "1",
    create_date: (receipt.create_date || String(Math.floor(Date.now() / 1000))).toString(),
    receipt_tax_values: buildForwardTaxValues(receipt, recipientId),
  };
};

export const forwardReceiptToUser = async (receipt, recipientUserId, senderUser) => {
  const token = localStorage.getItem("token");
  if (!token) return { ok: false, error: "Missing token" };
  if (!receipt?.id) return { ok: false, error: "Receipt not saved yet." };

  const recipientId = toPositiveInt(recipientUserId);
  const senderId =
    toPositiveInt(localStorage.getItem("fk_user_id")) ||
    toPositiveInt(senderUser?.id);

  if (!recipientId) {
    return { ok: false, error: "Invalid recipient. Please try again." };
  }
  if (senderId && recipientId === senderId) {
    return { ok: false, error: "You cannot forward a receipt to yourself." };
  }

  const body = buildForwardPayload(receipt, recipientId);

  try {
    const res = await fetch(`${BASE_URL}/user/forwardreceiptv2`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    const data = await parseResponseBody(res);

    if (res.ok && isForwardSuccessResponse(data)) {
      return { ok: true, data, error: null };
    }

    const error =
      (data && typeof data === "object" && data.message) ||
      (typeof data === "string" && data.trim()) ||
      `Forward failed (${res.status})`;

    return { ok: false, error };
  } catch (e) {
    return { ok: false, error: e.message || "Forward failed" };
  }
};
