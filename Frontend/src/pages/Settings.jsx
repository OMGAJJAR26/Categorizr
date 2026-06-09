import { useState, useEffect, useMemo } from "react";
import { containsEmoji, stripEmoji } from "../utils/emojiUtils";
import { parseTaxRateInput, createTaxRateKeyDownHandler } from "../utils/taxRateInput";
import { useTaxRateLimitAlert } from "../hooks/useTaxRateLimitAlert";
import TaxRateChangeWarningModal from "../components/TaxRateChangeWarningModal";
import {
  buildIncrementedTaxName,
  propagateTaxNameChangeToReceipts,
  propagateTaxRateChangeToReceipts,
  taxRatesDiffer,
} from "../utils/taxTypeUtils";
import {
  findRenamedApiMerchant,
  isMerchantSupersededByApi,
} from "../utils/merchantListUtils";
import { AnimatePresence, motion } from "framer-motion";
import {
  Settings as SettingsIcon,
  User,
  Lock,
  LogOut,
  Search,
  CheckCircle,
  XCircle,
  Eye,
  EyeOff,
  Shield,
  AlertCircle,
  Store,
  Tag,
  CreditCard,
  Percent,
  Pencil,
  Trash2,
  Receipt,
  X,
  ArrowLeft,
  ChevronRight,
  QrCode,
  Car,
  Truck,
  Home,
  Network,
  Star,
  Trash,
  Mail,
  UserCircle,
  Plus,
} from "lucide-react";

// Payment logos are served from /public/payment-logos/ so their URLs are
// identical in dev, staging, and production — no Vite content-hash, no
// environment mismatch when the path is stored as icon_image on the server.
const visaLogo            = "/payment-logos/Visa.png";
const mastercardLogo      = "/payment-logos/MasterCard.png";
const amexLogo            = "/payment-logos/AmericanExpress.webp";
const paypalLogo          = "/payment-logos/PayPal.png";
const cashLogo            = "/payment-logos/Cash.jpg";
const debitLogo           = "/payment-logos/DebitCard.webp";
const dinersLogo          = "/payment-logos/DinersClub.png";
const discoverLogo        = "/payment-logos/discover.png";
const creditDebitCardIcon = "/payment-logos/Creditdebitcardicon.jpg";

import { QRCodeSVG } from "qrcode.react";
import Header from "../components/Header";
import LogoutConfirmationDialog from "../components/LogoutConfirmationDialog";
import ForgotPasswordModal from "./ForgotPasswordModel";
import MerchantAvatar from "../components/MerchantAvatar";
import SimpleAlertModal from "../components/SimpleAlertModal";
import MyNetworkPanel from "../components/network/MyNetworkPanel";
import { getPendingRequestCount } from "../api/networkApi";
import { useNavigate } from "react-router-dom";
import { useData } from "../context/DataContext";
import { getPaymentDisplayFromReceipt } from "../hooks/usePaymentDisplay";
import {
  apiPaymentMethodMatchesLabel,
  getApiPaymentMethodDisplayName,
  getLast4FromPaymentApiRecord,
  isCashPaymentVariant,
  isPaymentApiRecord,
  mergePaymentMethodLabels,
  parsePaymentDisplay,
  paymentCategoryFromApiEnum,
  cardTypeIntToBrand,
  PAYMENT_METHODS_API_ONLY,
} from "../utils/paymentMethodUtils";
import {
  getExpenseCategoryRecordName,
  getExpenseCategoryRecordId,
} from "../utils/expenseCategories";

/* ─── Helpers ─────────────────────────────────────────── */

/**
 * The backend sometimes constructs the unique Categorizr inbox address as
 * "{realEmail}@categorizr.com" (e.g. "john@gmail.com@categorizr.com").
 * This strips the intermediate provider so only "john@categorizr.com" is shown.
 * Emails that don't end in @categorizr.com are returned unchanged.
 */
const sanitizeCategorizrEmail = (email) => {
  if (!email) return "";
  const suffix = "@categorizr.com";
  if (!email.endsWith(suffix)) return email;
  const localPart = email.slice(0, email.length - suffix.length);
  // If the local part itself contains "@", strip the provider domain
  // e.g. "john@gmail.com" → "john"
  const cleanLocal = localPart.includes("@") ? localPart.split("@")[0] : localPart;
  return `${cleanLocal}@categorizr.com`;
};

const getPaymentLogo = (name) => {
  const n = (name || "").toLowerCase();
  if (n.includes("visa"))                                return visaLogo;
  if (n.includes("mastercard") || n.includes("master")) return mastercardLogo;
  if (n.includes("amex") || n.includes("american"))     return amexLogo;
  if (n.includes("paypal"))                              return paypalLogo;
  if (n.includes("cash"))                                return cashLogo;
  if (n.includes("diners"))                              return dinersLogo;
  if (n.includes("discover"))                            return discoverLogo;
  if (n.includes("debit"))                               return debitLogo;
  return null;
};

/** Resolve logo for an API payment-method record using card_type (authoritative)
 *  then icon_image, then keyword detection on the display name. */
const getApiPaymentMethodLogo = (p) => {
  if (!p) return null;
  // card_type integer is authoritative (0=AmEx…5=DinersClub…8=Other)
  const brand = cardTypeIntToBrand(p.card_type);
  const brandLogo = brand ? getPaymentLogo(brand) : null;
  if (brandLogo) return brandLogo;
  // fall back to icon_image if it's a valid logo path / URL
  const img = (p.icon_image || "").trim();
  if (img && (img.startsWith("/payment-logos/") || /^https?:\/\//.test(img) || img.startsWith("data:image"))) {
    return img;
  }
  // last resort: keyword detection on display name
  return getPaymentLogo(getApiPaymentMethodDisplayName(p));
};

const normalizePaymentDisplayKey = (value) => {
  const { issuer, last4 } = parsePaymentDisplay(value);
  const base = (issuer || "").replace(/\s+/g, " ").trim();
  return last4 ? `${base} *${last4}`.toLowerCase() : base.toLowerCase();
};

const PAYMENT_CARD_TYPES = [
  { name: "Visa",             logo: visaLogo },
  { name: "MasterCard",       logo: mastercardLogo },
  { name: "American Express", logo: amexLogo },
  { name: "Discover",         logo: discoverLogo },
  { name: "Diners Club",      logo: dinersLogo },
  { name: "PayPal",           logo: paypalLogo },
  { name: "Debit Card",       logo: debitLogo },
  { name: "Other",            logo: creditDebitCardIcon },
];

const DEFAULT_PAYMENT_CARD_MAP = {
  "American Express": "American Express",
  "Bank of America": "MasterCard",
  "Citibank": "MasterCard",
  "Mastercard": "MasterCard",
  "Visa": "Visa",
  "Cash": "Cash",
};
const SETTINGS_DEFAULT_MERCHANTS_WITH_LOGOS = [
  { name: "Costco", image: "https://logo.clearbit.com/costco.com" },
  { name: "Home Depot", image: "https://logo.clearbit.com/homedepot.com" },
  { name: "Lowe's", image: "https://logo.clearbit.com/lowes.com" },
  { name: "Miscellaneous", image: "/miscellaneous-logo.png" },
  { name: "Nordstrom", image: "https://logo.clearbit.com/nordstrom.com" },
  { name: "Target", image: "https://logo.clearbit.com/target.com" },
  { name: "Walmart", image: "https://logo.clearbit.com/walmart.com" },
];

/* ─── Shared styles ────────────────────────────────────── */
const inputCls = "w-full bg-white/95 border border-slate-200 text-slate-900 text-sm rounded-xl px-4 py-2.5 placeholder-slate-400 shadow-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all";
const labelCls = "block text-[11px] font-semibold text-slate-500 uppercase tracking-[0.08em] mb-1.5";
const sectionCardCls = "bg-white border border-slate-200/80 rounded-2xl shadow-sm";

/* ─── ItemLogo ─────────────────────────────────────────── */
const ItemLogo = ({ logo, name }) => {
  const [err, setErr] = useState(false);
  
  if (name?.toString().trim().toLowerCase() === "miscellaneous") {
    return <img src="/miscellaneous-logo.png" alt="Miscellaneous logo" className="w-9 h-9 rounded-lg object-contain flex-shrink-0" />;
  }

  if (logo && !err)
    return <img src={logo} alt={name} onError={() => setErr(true)} className="w-9 h-9 rounded-lg object-contain bg-gray-100 p-1 flex-shrink-0" />;
    
  return (
    <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-xs font-bold text-blue-600 flex-shrink-0">
      {(name || "?")[0].toUpperCase()}
    </div>
  );
};

/* ─── ItemRow ──────────────────────────────────────────── */
// logoNode: optional pre-built React node that replaces ItemLogo (e.g. MerchantAvatar for merchants)
const ItemRow = ({ logo, logoNode, name, sublabel, badge, badgeCls, actions, showIcon = true }) => (
  <div className="flex items-center gap-3 bg-white rounded-xl px-3 py-2.5 border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:shadow-[0_4px_14px_rgba(15,23,42,0.08)] transition-all">
    {showIcon && (logoNode ?? <ItemLogo logo={logo} name={name} />)}
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-slate-900 truncate">{name}</p>
      {sublabel && <p className="text-xs text-slate-400 truncate">{sublabel}</p>}
    </div>
    {badge && <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md border flex-shrink-0 ${badgeCls}`}>{badge}</span>}
    <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>
  </div>
);

/* ─── Manage Modal (Merchants / Categories / Payments / Taxes) ─────────── */
const MODAL_CFG = {
  merchants:  { icon: Store,      label: "Merchants",          color: "blue",    addPlaceholder: "New merchant name…" },
  categories: { icon: Tag,        label: "Expense Categories", color: "violet",  addPlaceholder: "New category name…" },
  payments:   { icon: CreditCard, label: "Payment Methods",    color: "emerald", addPlaceholder: "e.g. Visa *1234, Cash…" },
  taxes:      { icon: Percent,    label: "Tax Types",          color: "amber",   addPlaceholder: "Tax name (e.g. GST)" },
};
const COLOR_MAP = {
  blue:    { badge: "bg-blue-100 text-blue-600 border-blue-200",         btn: "bg-blue-600 hover:bg-blue-700" },
  violet:  { badge: "bg-violet-100 text-violet-600 border-violet-200",   btn: "bg-violet-600 hover:bg-violet-700" },
  emerald: { badge: "bg-emerald-100 text-emerald-600 border-emerald-200",btn: "bg-emerald-600 hover:bg-emerald-700" },
  amber:   { badge: "bg-amber-100 text-amber-700 border-amber-200",      btn: "bg-amber-500 hover:bg-amber-600" },
};

const ManageModal = ({ type, onClose }) => {
  const {
    receiptMerchWImgRaw, customMerchants, hideMerchant, isMerchantHidden, addCustomMerchant, editCustomMerchant, deleteCustomMerchant,
    receiptCategoriesRaw, customCategories, hideCategory, addCustomCategory, editCustomCategory, deleteCustomCategory,
    receiptPaymentsRaw, customPaymentMethods, hidePaymentMethod, addCustomPaymentMethod, editCustomPaymentMethod, deleteCustomPaymentMethod,
    taxData, addTax, updateTax, deleteTax, fetchTaxes,
    hiddenMerchants, hiddenCategories, hiddenPaymentMethods,
    apiMerchants, fetchApiMerchants, addApiMerchant, updateApiMerchant, deleteApiMerchant,
    apiPaymentMethods, fetchApiPaymentMethods, deleteApiPaymentMethod,
  } = useData();

  useEffect(() => { if (type === "taxes") fetchTaxes(); }, [type, fetchTaxes]);
  useEffect(() => { if (type === "merchants") fetchApiMerchants(); }, [type, fetchApiMerchants]);
  useEffect(() => { if (type === "payments") fetchApiPaymentMethods(); }, [type, fetchApiPaymentMethods]);

  const cfg = MODAL_CFG[type]; const colors = COLOR_MAP[cfg.color];
  const [search, setSearch]                     = useState("");
  const [addVal, setAddVal]                     = useState("");
  const [addTaxVal, setAddTaxVal]               = useState({ tax_name: "", tax_rate: "", tax_number: "" });
  const [editKey, setEditKey]                   = useState(null);
  const [editVal, setEditVal]                   = useState("");
  const [editTaxKey, setEditTaxKey]             = useState(null);
  const [editTaxVal, setEditTaxVal]             = useState({ tax_name: "", tax_rate: "", tax_number: "" });
  const [editReceiptKey, setEditReceiptKey]     = useState(null);
  const [editReceiptVal, setEditReceiptVal]     = useState("");
  const [msg, setMsg]                           = useState(null);

  const TAX_NAME_MAX   = 15;
  const TAX_RATE_MAX   = 99.999;
  const TAX_NUMBER_MAX = 35;

  const [addTaxNameOverflow, setAddTaxNameOverflow]   = useState(false);
  const [addTaxNumberOverflow, setAddTaxNumberOverflow] = useState(false);
  const [editTaxNameOverflow, setEditTaxNameOverflow]  = useState(false);
  const [editTaxNumberOverflow, setEditTaxNumberOverflow] = useState(false);

  const toast = (t, text) => { setMsg({ type: t, text }); setTimeout(() => setMsg(null), 3000); };
  const { message: addTaxRateLimitAlert, showAlert: showAddTaxRateLimitAlert } = useTaxRateLimitAlert();
  const { message: editTaxRateLimitAlert, showAlert: showEditTaxRateLimitAlert } = useTaxRateLimitAlert();

  const handleAdd = async () => {
    if (type === "taxes") {
      const n = addTaxVal.tax_name.trim(), r = addTaxVal.tax_rate.toString().trim();
      if (!n || !r) return toast("error", "Name and rate are required.");
      const dupTax = (taxData || []).some(t => (t.tax_name || "").trim().toLowerCase() === n.toLowerCase());
      if (dupTax) return toast("error", "Tax Type already exists");
      try {
        const fk_user_id = localStorage.getItem("fk_user_id") || "";
        await addTax({ tax_name: n, tax_rate: r, tax_number: addTaxVal.tax_number.trim(), fk_user_id });
        setAddTaxVal({ tax_name: "", tax_rate: "", tax_number: "" });
        setAddTaxNameOverflow(false);
        setAddTaxNumberOverflow(false);
        toast("success", `"${n}" added.`);
      } catch (e) { toast("error", e.message || "Failed."); }
      return;
    }
    if (!addVal.trim()) return;
    if (containsEmoji(addVal)) return toast("error", "Emojis are not allowed in names. Please use plain text.");
    if (type === "merchants") {
      const merchantName = addVal.trim();
      const duplicate = [
        ...(receiptMerchWImgRaw || []).map((m) => m?.name || ""),
        ...(customMerchants || []),
        ...(apiMerchants || []).map((m) => m?.store_name || ""),
      ].some((m) => normalizeMatchKey(m) === normalizeMatchKey(merchantName));
      if (duplicate) {
        toast("error", "Merchant already exists");
        return;
      }
      try {
        const result = await addApiMerchant(merchantName, "");
        if (!result?.ok) throw new Error(result?.error || "Failed to add merchant");
        await fetchApiMerchants();
        toast("success", "Merchant Added");
      } catch (e) {
        toast("error", e.message || "Failed.");
      }
      setAddVal("");
      return;
    }
    if (type === "categories") {
      const categoryName = addVal.trim();
      const duplicate = [
        ...(receiptCategoriesRaw || []),
        ...(customCategories || [])
      ].some((c) => normalizeMatchKey(c) === normalizeMatchKey(categoryName));
      if (duplicate) {
        toast("error", "Expense Category already exists");
        return;
      }
      addCustomCategory(categoryName);
    }
    if (type === "payments")   addCustomPaymentMethod(addVal);
    setAddVal("");
  };

  const handleEdit = async (itemOrKey) => {
    const item = typeof itemOrKey === "object" && itemOrKey !== null
      ? itemOrKey
      : { key: itemOrKey, name: String(itemOrKey || "") };
    if (type === "taxes") {
      const n = editTaxVal.tax_name.trim(), r = editTaxVal.tax_rate.toString().trim();
      if (!n || !r) return;
      const dupTax = (taxData || []).some(t => t.id !== item.key && (t.tax_name || "").trim().toLowerCase() === n.toLowerCase());
      if (dupTax) return toast("error", "Tax Type already exists");
      try {
        const tObj = taxData.find(t => t.id === item.key);
        await updateTax({ ...tObj, tax_name: n, tax_rate: r, tax_number: editTaxVal.tax_number.trim(), is_default_tax: parseInt(tObj?.is_default_tax) || 0, is_tips: parseInt(tObj?.is_tips) || 0 });
        setEditTaxKey(null);
        setEditTaxNameOverflow(false);
        setEditTaxNumberOverflow(false);
      }
      catch (e) { toast("error", e.message || "Failed."); }
      return;
    }
    if (!editVal.trim()) return;
    if (type === "merchants") {
      const nextName = editVal.trim();
      const duplicate = [
        ...(receiptMerchWImgRaw || []).map((m) => m?.name || ""),
        ...(customMerchants || []),
        ...(apiMerchants || []).map((m) => m?.store_name || ""),
      ].some((m) => normalizeMatchKey(m) === normalizeMatchKey(nextName) && normalizeMatchKey(m) !== normalizeMatchKey(item?.name));
      if (duplicate) {
        toast("error", "Merchant already exists");
        return;
      }
      try {
        const directMerchantId = getApiMerchantId(item);
        const apiMatch = (apiMerchants || []).find(
          (m) => normalizeMatchKey(m?.store_name) === normalizeMatchKey(item?.name)
        );
        const apiId = directMerchantId ?? getApiMerchantId(apiMatch);
        if (apiId !== null) {
          const result = await updateApiMerchant(apiId, nextName, "");
          if (!result?.ok) throw new Error(result?.error || "Failed to update merchant");
          deleteCustomMerchant(item.name);
        } else {
          const addResult = await addApiMerchant(nextName, "");
          if (!addResult?.ok) throw new Error(addResult?.error || "Failed to update merchant");
        }
        await fetchApiMerchants();
        toast("success", "Merchant Updated");
      } catch (e) {
        toast("error", e.message || "Failed.");
      }
      setEditKey(null);
      return;
    }
    if (type === "categories") {
      const nextName = editVal.trim();
      const duplicate = [
        ...(receiptCategoriesRaw || []),
        ...(customCategories || [])
      ].some((c) => normalizeMatchKey(c) === normalizeMatchKey(nextName) && normalizeMatchKey(c) !== normalizeMatchKey(item?.name));
      if (duplicate) {
        toast("error", "Expense Category already exists");
        return;
      }
      editCustomCategory(item.key, nextName);
    }
    if (type === "payments") {
      const nextName = editVal.trim();
      const duplicate = [
        ...(receiptPaymentsRaw || []),
        ...(customPaymentMethods || []),
        ...(apiPaymentMethods || []).map((m) => m?.card_number || ""),
      ].some(
        (p) =>
          normalizeMatchKey(p) === normalizeMatchKey(nextName) &&
          normalizeMatchKey(p) !== normalizeMatchKey(item?.name)
      );
      if (duplicate) {
        toast("error", "Payment Method already exists");
        return;
      }
      editCustomPaymentMethod(item.key, nextName);
    }
    setEditKey(null);
  };

  const normalizeMatchKey = (value) =>
    String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  const getApiPaymentId = (obj) =>
    obj?.id ?? obj?.payment_method_id ?? obj?.fk_payment_method_id ?? null;
  const getApiMerchantId = (obj) =>
    obj?.id ?? obj?.store_id ?? obj?.fk_store_id ?? null;
  const handleDelete = async (itemOrKey) => {
    const item = typeof itemOrKey === "object" && itemOrKey !== null
      ? itemOrKey
      : { key: itemOrKey, name: String(itemOrKey || "") };
    if (type === "taxes") {
      try { await deleteTax(item.key); } catch (e) { toast("error", e.message || "Failed."); }
      return;
    }
    if (type === "merchants") {
      try {
        const directMerchantId = getApiMerchantId(item);
        if (directMerchantId !== null) {
          const result = await deleteApiMerchant(directMerchantId);
          if (!result?.ok) throw new Error(result?.error || "Failed to delete merchant");
        } else {
          const apiMatch = (apiMerchants || []).find(
            (m) => normalizeMatchKey(m?.store_name) === normalizeMatchKey(item?.name)
          );
          const apiId = getApiMerchantId(apiMatch);
          if (apiId !== null) {
            const result = await deleteApiMerchant(apiId);
            if (!result?.ok) throw new Error(result?.error || "Failed to delete merchant");
          }
        }
        hideMerchant(item.key || item.name);
        deleteCustomMerchant(item.key || item.name);
        await fetchApiMerchants();
        toast("success", "Merchant Deleted");
      } catch (e) {
        toast("error", e.message || "Failed.");
      }
      return;
    }
    if (type === "categories") {
      deleteCustomCategory(item.key);
      return;
    }
    if (type === "payments") {
      try {
        // Resolve numeric ID: prefer item.apiId (from buildAllItems → m.id from GET response),
        // then search apiPaymentMethods by name. deleteApiPaymentMethod also checks sessionStorage cache.
        const directApiId = item?.apiId ?? getApiPaymentId(
          (apiPaymentMethods || []).find(p => normalizeMatchKey(p?.card_number) === normalizeMatchKey(item.name))
        ) ?? null;
        const result = await deleteApiPaymentMethod(directApiId, item.name);
        if (!result?.ok) throw new Error(result?.error || "Failed to delete payment method");
        hidePaymentMethod(item.key || item.name);
        deleteCustomPaymentMethod(item.key || item.name);
        await fetchApiPaymentMethods();
        toast("success", "Payment Method Deleted");
      } catch (e) {
        toast("error", e.message || "Failed.");
      }
    }
  };

  const handleReceiptEdit = async (key, currentName) => {
    const newName = editReceiptVal.trim();
    if (!newName || newName === currentName) { setEditReceiptKey(null); return; }
    const allReceiptItems = buildReceiptItems();
    const allCustomItems = buildCustomItems();
    const dupCheck = [...allReceiptItems, ...allCustomItems].some(i => i.key !== key && i.name.toLowerCase() === newName.toLowerCase());
    if (dupCheck) {
      if (type === "merchants") return toast("error", "Merchant already exists");
      if (type === "categories") return toast("error", "Expense Category already exists");
    }
    if (type === "merchants")  {
      try {
        const apiMatch = (apiMerchants || []).find(
          (m) => normalizeMatchKey(m?.store_name) === normalizeMatchKey(currentName)
        );
        const apiId = getApiMerchantId(apiMatch);
        if (apiId !== null) {
          const result = await updateApiMerchant(apiId, newName, "");
          if (!result?.ok) throw new Error(result?.error || "Failed to update merchant");
          await fetchApiMerchants();
        } else {
          hideMerchant(key);
          addCustomMerchant(newName);
        }
      } catch (e) {
        toast("error", e.message || "Failed.");
        return;
      }
    }
    if (type === "categories") { hideCategory(key);      addCustomCategory(newName); }
    if (type === "payments") {
      const allPayNames = [
        ...(receiptPaymentsRaw || []),
        ...(customPaymentMethods || []),
        ...(apiPaymentMethods || []).map((m) => m?.card_number || ""),
      ];
      const isDup = allPayNames.some(
        (p) =>
          normalizeMatchKey(p) === normalizeMatchKey(newName) &&
          normalizeMatchKey(p) !== normalizeMatchKey(currentName)
      );
      if (isDup) { toast("error", "Payment Method already exists"); return; }
      hidePaymentMethod(key);
      addCustomPaymentMethod(newName);
    }
    setEditReceiptKey(null); setEditReceiptVal("");
  };

  const buildReceiptItems = () => {
    if (type === "merchants")  return receiptMerchWImgRaw.filter(m => !isMerchantHidden(m.name)).map(m => ({ key: m.name, name: m.name, logo: m.image || null }));
    if (type === "categories") return receiptCategoriesRaw.filter(c => !hiddenCategories.has(c)).map(c => ({ key: c, name: c, logo: null }));
    if (type === "payments") {
      if (PAYMENT_METHODS_API_ONLY) return [];
      return receiptPaymentsRaw.filter(p => !hiddenPaymentMethods.has(p)).map(p => {
        // Try to resolve logo via the API payment methods list (authoritative card_type)
        const apiRec = (apiPaymentMethods || []).find(ap => {
          try { return (getApiPaymentMethodDisplayName(ap) || "").toLowerCase() === p.toLowerCase(); } catch { return false; }
        });
        const logo = apiRec ? getApiPaymentMethodLogo(apiRec) : getPaymentLogo(p);
        return { key: p, name: p, logo };
      });
    }
    return [];
  };
  const buildCustomItems = () => {
    if (type === "merchants") {
      const customItems = customMerchants
        .filter(m => !isMerchantHidden(m))
        .map(m => ({ key: m, name: m, logo: null }));
      const existingNames = new Set([
        ...receiptMerchWImgRaw.map((m) => normalizeMatchKey(m?.name)),
        ...customItems.map((m) => normalizeMatchKey(m?.name)),
      ]);
      const apiItems = (apiMerchants || [])
        .map((m) => {
          const apiId = getApiMerchantId(m);
          const name = (m?.store_name || "").toString().trim();
          if (!name || apiId === null) return null;
          return {
            key: `api_${apiId}`,
            name,
            logo: m?.store_image_url || null,
            apiId,
          };
        })
        .filter(Boolean)
        .filter((m) => !existingNames.has(normalizeMatchKey(m.name)));
      return [...customItems, ...apiItems];
    }
    if (type === "categories") return customCategories.filter(c => !hiddenCategories.has(c)).map(c => ({ key: c, name: c, logo: null }));
    if (type === "payments") {
      if (PAYMENT_METHODS_API_ONLY) {
        return (apiPaymentMethods || [])
          .filter(isPaymentApiRecord)
          .map((p, index) => {
            const apiId = getApiPaymentId(p);
            const cardName = getApiPaymentMethodDisplayName(p);
            if (!cardName || hiddenPaymentMethods.has(cardName)) return null;
            return {
              key: apiId != null ? `api_${apiId}` : `api_idx_${index}`,
              name: cardName,
              logo: getApiPaymentMethodLogo(p),
              apiId,
            };
          })
          .filter(Boolean);
      }
      const customItems = customPaymentMethods
        .filter(p => !hiddenPaymentMethods.has(p))
        .map(p => ({ key: p, name: p, logo: getPaymentLogo(p) }));
      const existingNames = new Set([
        ...receiptPaymentsRaw.map((p) => normalizeMatchKey(p)),
        ...customItems.map((p) => normalizeMatchKey(p.name)),
      ]);
      // Also track last4s already covered by receipt/custom entries so we don't
      // show a duplicate API entry after a rename (e.g. "OM *1111" AND "Discover *1111")
      const existingLast4s = new Set(
        [...receiptPaymentsRaw, ...customItems.map(i => i.name)]
          .map(p => { const m = /\*(\d{3,4})$/.exec((p || "").trim()); return m ? m[1] : null; })
          .filter(Boolean)
      );
      const apiItems = (apiPaymentMethods || [])
        .map((p) => {
          const apiId = getApiPaymentId(p);
          const cardName = getApiPaymentMethodDisplayName(p);
          if (!cardName || apiId === null) return null;
          return {
            key: `api_${apiId}`,
            name: cardName,
            logo: getApiPaymentMethodLogo(p),
            apiId,
          };
        })
        .filter(Boolean)
        .filter((p) => {
          if (existingNames.has(normalizeMatchKey(p.name))) return false;
          // Skip if a receipt/custom entry already covers the same last4
          const l4m = /\*(\d{3,4})$/.exec((p.name || "").trim());
          if (l4m && existingLast4s.has(l4m[1])) return false;
          return true;
        });
      return [...customItems, ...apiItems];
    }
    return [];
  };

  const receiptItems = buildReceiptItems().filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const customItems  = buildCustomItems().filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const taxItems     = type === "taxes" ? taxData.filter(t => (t.tax_name || "").toLowerCase().includes(search.toLowerCase())) : [];
  const Icon = cfg.icon;
  const mInput = "flex-1 min-w-0 bg-white border border-slate-200 text-slate-900 text-sm rounded-xl px-3 py-2 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all";
  const ab = (color, onClick, children) => (
    <button onClick={onClick} className={`flex items-center justify-center w-7 h-7 rounded-lg text-white text-xs transition-all ${color}`}>{children}</button>
  );

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 12 }} transition={{ duration: 0.22 }}
        className="relative bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-gray-200 flex flex-col" style={{ maxHeight: "88vh" }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors.badge}`}><Icon size={15} /></div>
          <h2 className="flex-1 text-base font-bold text-gray-900">Manage {cfg.label}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 p-1 transition-colors"><X size={18} /></button>
        </div>
        {/* Add */}
        <div className="px-5 pt-4 pb-3 border-b border-gray-100 flex-shrink-0">
          {type === "taxes" ? (
            <div className="flex flex-col gap-2">
              <div className="flex gap-2">
                <input className={mInput} placeholder="Tax name (e.g. GST)" value={addTaxVal.tax_name}
                  onChange={e => {
                    const v = e.target.value;
                    if (v.length > TAX_NAME_MAX) { setAddTaxNameOverflow(true); return; }
                    setAddTaxNameOverflow(false);
                    setAddTaxVal(p => ({ ...p, tax_name: v }));
                  }} />
                <div className="relative w-[80px] flex-shrink-0">
                    <input className={`${mInput} pr-6 w-full placeholder:text-slate-400`} placeholder="Rate (%)" value={addTaxVal.tax_rate} onKeyDown={createTaxRateKeyDownHandler(addTaxVal.tax_rate, showAddTaxRateLimitAlert)} onChange={e => {
                      const parsed = parseTaxRateInput(e.target.value);
                      if (parsed.rejected) { showAddTaxRateLimitAlert(parsed.message); return; }
                      setAddTaxVal(p => ({ ...p, tax_rate: parsed.value }));
                    }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">%</span>
                </div>
              </div>
              {addTaxNameOverflow && <p className="text-xs text-red-500 -mt-1">Character limit of {TAX_NAME_MAX} exceeded</p>}
              {addTaxRateLimitAlert && (
                <p className="text-xs text-red-600 font-medium -mt-1">{addTaxRateLimitAlert}</p>
              )}
              <div className="flex gap-2">
                <input className={mInput} placeholder="Tax number (optional)" value={addTaxVal.tax_number}
                  onChange={e => {
                    const v = e.target.value;
                    if (v.length > TAX_NUMBER_MAX) { setAddTaxNumberOverflow(true); return; }
                    setAddTaxNumberOverflow(false);
                    setAddTaxVal(p => ({ ...p, tax_number: v }));
                  }} />
                <div className="w-[80px] flex-shrink-0" />
              </div>
              {addTaxNumberOverflow && <p className="text-xs text-red-500 -mt-1">Character limit of {TAX_NUMBER_MAX} exceeded</p>}
              <div className="flex justify-end">
                <button onClick={handleAdd} className={`px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0 ${colors.btn}`}>Add</button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <input className={mInput} placeholder={cfg.addPlaceholder} value={addVal} onChange={e => setAddVal(stripEmoji(e.target.value))} onKeyDown={e => e.key === "Enter" && handleAdd()} />
              <button onClick={handleAdd} className={`px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0 ${colors.btn}`}>Add</button>
            </div>
          )}
          <AnimatePresence>
            {msg && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`flex items-center gap-2 mt-2 text-xs px-3 py-2 rounded-xl ${msg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {msg.type === "success" ? <CheckCircle size={13}/> : <AlertCircle size={13}/>} {msg.text}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {/* Search */}
        <div className="px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input className="w-full bg-gray-50 border border-gray-200 text-sm text-gray-900 rounded-xl pl-8 pr-8 py-2 placeholder-gray-400 focus:outline-none focus:border-blue-400 transition-all"
              placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
            {search && <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13}/></button>}
          </div>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-2">
          {type === "taxes" ? (
            taxItems.length === 0 ? <p className="text-sm text-gray-400 text-center py-6">No tax types yet.</p> :
            taxItems.map(tax => {
              const isEd = editTaxKey === tax.id;
              return (
                <div key={tax.id}>
                  {isEd ? (
                    <div className="flex flex-col gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <div className="flex gap-2">
                        <input className={mInput} value={editTaxVal.tax_name}
                          onChange={e => {
                            const v = e.target.value;
                            if (v.length > TAX_NAME_MAX) { setEditTaxNameOverflow(true); return; }
                            setEditTaxNameOverflow(false);
                            setEditTaxVal(p => ({ ...p, tax_name: v }));
                          }} placeholder="Name" />
                        <div className="relative w-[80px] flex-shrink-0">
                            <input className={`${mInput} pr-6 w-full placeholder:text-slate-400`} value={editTaxVal.tax_rate} onKeyDown={createTaxRateKeyDownHandler(editTaxVal.tax_rate, showEditTaxRateLimitAlert)} onChange={e => {
                              const parsed = parseTaxRateInput(e.target.value);
                              if (parsed.rejected) { showEditTaxRateLimitAlert(parsed.message); return; }
                              setEditTaxVal(p => ({ ...p, tax_rate: parsed.value }));
                            }} placeholder="Rate (%)" />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">%</span>
                        </div>
                      </div>
                      {editTaxNameOverflow && <p className="text-xs text-red-500 -mt-1">Character limit of {TAX_NAME_MAX} exceeded</p>}
                      {editTaxRateLimitAlert && (
                        <p className="text-xs text-red-600 font-medium -mt-1">{editTaxRateLimitAlert}</p>
                      )}
                      <div className="flex gap-2">
                        <input className={mInput} value={editTaxVal.tax_number}
                          onChange={e => {
                            const v = e.target.value;
                            if (v.length > TAX_NUMBER_MAX) { setEditTaxNumberOverflow(true); return; }
                            setEditTaxNumberOverflow(false);
                            setEditTaxVal(p => ({ ...p, tax_number: v }));
                          }} placeholder="Tax number (optional)" />
                        <button onClick={() => handleEdit(tax.id)} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg">Save</button>
                        <button onClick={() => setEditTaxKey(null)} className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-600 text-xs font-semibold rounded-lg">Cancel</button>
                      </div>
                      {editTaxNumberOverflow && <p className="text-xs text-red-500 -mt-1">Character limit of {TAX_NUMBER_MAX} exceeded</p>}
                    </div>
                  ) : (
                    <ItemRow name={tax.tax_name} sublabel={tax.tax_number ? `#${tax.tax_number}` : undefined} badge={`${tax.tax_rate}%`} badgeCls={colors.badge}
                      actions={<>
                        {ab("bg-blue-500 hover:bg-blue-600", () => { setEditTaxKey(tax.id); setEditTaxVal({ tax_name: tax.tax_name, tax_rate: tax.tax_rate, tax_number: tax.tax_number || "" }); }, <Pencil size={13}/>)}
                        {ab("bg-red-400 hover:bg-red-500", () => handleDelete({ key: tax.id, name: tax.tax_name }), <Trash2 size={13}/>)}
                      </>}
                    />
                  )}
                </div>
              );
            })
          ) : (
            <>
              {receiptItems.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">From your receipts</p>
                  <div className="flex flex-col gap-1.5">
                    {receiptItems.map(item => {
                      const isEd = editReceiptKey === item.key;
                      return (
                        <div key={item.key}>
                          {isEd ? (
                            <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                              <input className={mInput} value={editReceiptVal} onChange={e => setEditReceiptVal(e.target.value)} placeholder={item.name} />
                              <button onClick={() => handleReceiptEdit(item.key, item.name)} className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg">Save</button>
                              <button onClick={() => setEditReceiptKey(null)} className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg">Cancel</button>
                            </div>
                          ) : (
                            <ItemRow
                              logo={item.logo}
                              logoNode={type === "merchants"
                                ? <MerchantAvatar name={item.name} explicitUrl={item.logo} className="w-9 h-9 flex-shrink-0" />
                                : undefined}
                              name={item.name} badgeCls={colors.badge}
                              actions={<>
                                {ab("bg-blue-500 hover:bg-blue-600", () => { setEditReceiptKey(item.key); setEditReceiptVal(item.name); }, <Pencil size={13}/>)}
                                {ab("bg-red-400 hover:bg-red-500", () => handleDelete(item), <Trash2 size={13}/>)}
                              </>}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {customItems.length > 0 && (
                <div>
                  <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5 mt-2">Custom</p>
                  <div className="flex flex-col gap-1.5">
                    {customItems.map(item => {
                      const isEd = editKey === item.key;
                      return (
                        <div key={item.key}>
                          {isEd ? (
                            <div className="flex gap-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2">
                              <input className={mInput} value={editVal} onChange={e => setEditVal(stripEmoji(e.target.value))} placeholder={item.name} />
                              <button onClick={() => handleEdit(item)} className="px-3 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg">Save</button>
                              <button onClick={() => setEditKey(null)} className="px-3 py-1 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg">Cancel</button>
                            </div>
                          ) : (
                            <ItemRow
                              logo={item.logo}
                              logoNode={type === "merchants"
                                ? <MerchantAvatar name={item.name} explicitUrl={item.logo} className="w-9 h-9 flex-shrink-0" />
                                : undefined}
                              name={item.name} badgeCls={colors.badge}
                              actions={<>
                                {ab("bg-blue-500 hover:bg-blue-600", () => { setEditKey(item.key); setEditVal(item.name); }, <Pencil size={13}/>)}
                                {ab("bg-red-400 hover:bg-red-500", () => handleDelete(item), <Trash2 size={13}/>)}
                              </>}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {receiptItems.length === 0 && customItems.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No {cfg.label.toLowerCase()} yet.</p>
              )}
            </>
          )}
        </div>
      </motion.div>
    </div>
  );
};

/* ─── Content Panels ─────────────────────────────────────── */

/* My Account panel — menu → sub-view */
const MyAccountPanel = ({ user, onLogoutRequest }) => {
  const [view, setView] = useState("menu"); // menu | editProfile | changePassword | deleteConfirm
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  const [profile, setProfile] = useState({
    firstName: user?.firstName || "", lastName: user?.lastName || "",
    recoveryEmail: user?.recoveryEmail || user?.emailAdress || user?.email || "", receiptEmail: user?.duplicate_eReciept_email || "", sameAsRecovery: false,
  });
  const [profileMsg, setProfileMsg] = useState(null);

  // Sync profile from user once user data arrives (handles async load)
  useEffect(() => {
    if (user) {
      setProfile(p => ({
        ...p,
        firstName:     p.firstName     || user.firstName || "",
        lastName:      p.lastName      || user.lastName  || "",
        recoveryEmail: p.recoveryEmail || user?.recoveryEmail || user?.emailAdress || user?.email || "",
      }));
    }
  }, [user]);

  const [passwords, setPasswords] = useState({ newPassword: "", confirmPassword: "" });
  const [showNew, setShowNew]     = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState(null);

  const handleProfileUpdate = (e) => {
    e.preventDefault();
    setProfileMsg({ type: "success", text: "Profile updated successfully!" });
    setTimeout(() => setProfileMsg(null), 3000);
  };

  const handlePasswordReset = (e) => {
    e.preventDefault();
    if (passwords.newPassword.length < 8) { setPasswordMsg({ type: "error", text: "Minimum 8 characters." }); return; }
    if (passwords.newPassword !== passwords.confirmPassword) { setPasswordMsg({ type: "error", text: "Passwords do not match." }); return; }
    setPasswordMsg({ type: "success", text: "Password reset successfully!" });
    setPasswords({ newPassword: "", confirmPassword: "" });
    setTimeout(() => setPasswordMsg(null), 3000);
  };

  const strengthLevel = passwords.newPassword.length === 0 ? null : passwords.newPassword.length < 8 ? "weak" : passwords.newPassword.length < 12 ? "medium" : "strong";
  const strengthColor = strengthLevel === "weak" ? "bg-red-500" : strengthLevel === "medium" ? "bg-yellow-400" : "bg-green-500";
  const strengthWidth = strengthLevel === "weak" ? "w-1/3" : strengthLevel === "medium" ? "w-2/3" : "w-full";

  const menuItems = [
    { icon: UserCircle, label: "Edit Profile",    sub: "Update your name and email",      view: "editProfile",    color: "text-blue-600",   bg: "bg-blue-50" },
    { icon: Lock,       label: "Change Password", sub: "Set a new secure password",        view: "changePassword", color: "text-violet-600", bg: "bg-violet-50" },
    { icon: Trash,      label: "Delete Account",  sub: "Permanently remove your account",  view: "deleteConfirm",  color: "text-red-500",    bg: "bg-red-50" },
    { icon: LogOut,     label: "Logoff",           sub: "Sign out of Categorizr",           view: "logoff",         color: "text-gray-500",   bg: "bg-gray-100" },
  ];

  return (
    <>
      {/* Sub-view back button */}
      {view !== "menu" && (
        <button onClick={() => setView("menu")} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-5 transition-colors bg-slate-100 hover:bg-slate-200 rounded-lg px-2.5 py-1.5">
          <ArrowLeft size={15} /> Back
        </button>
      )}

      {/* ── Menu ── */}
      {view === "menu" && (
        <div className="flex flex-col gap-2">
          {menuItems.map(({ icon: Icon, label, sub, view: target, color, bg }) => (
            <button key={target}
              onClick={() => target === "logoff" ? onLogoutRequest() : setView(target)}
              className="flex items-center gap-4 bg-gradient-to-r from-white to-slate-50/70 border border-slate-200 rounded-2xl px-4 py-3.5 hover:from-white hover:to-blue-50/50 hover:border-slate-300 transition-all shadow-sm text-left group"
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
                <Icon size={18} className={color} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${target === "deleteConfirm" ? "text-red-500" : "text-slate-900"}`}>{label}</p>
                <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
              </div>
              <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 transition-colors flex-shrink-0" />
            </button>
          ))}
        </div>
      )}

      {/* ── Edit Profile ── */}
      {view === "editProfile" && (
        <form onSubmit={handleProfileUpdate} className="flex flex-col gap-4 max-w-md bg-slate-50/50 border border-slate-200 rounded-2xl p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>First Name</label>
              <input className={inputCls} type="text" value={profile.firstName} onChange={e => setProfile(p => ({ ...p, firstName: e.target.value }))} placeholder="e.g. John" />
            </div>
            <div>
              <label className={labelCls}>Last Name</label>
              <input className={inputCls} type="text" value={profile.lastName} onChange={e => setProfile(p => ({ ...p, lastName: e.target.value }))} placeholder="e.g. Smith" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Password Recovery Email</label>
            <input className={inputCls} type="email" value={profile.recoveryEmail} onChange={e => setProfile(p => ({ ...p, recoveryEmail: e.target.value, sameAsRecovery: false }))} placeholder="recovery@email.com" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className={`${labelCls} mb-0`}>
                Duplicate eReceipt Email
                <span className="normal-case font-normal text-blue-500 ml-1">(Recommended)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <span className="text-[11px] text-slate-400">Same as recovery</span>
                <div onClick={() => setProfile(p => ({ ...p, sameAsRecovery: !p.sameAsRecovery, receiptEmail: !p.sameAsRecovery ? p.recoveryEmail : p.receiptEmail }))}
                  className={`w-9 h-5 rounded-full transition-colors relative cursor-pointer ${profile.sameAsRecovery ? "bg-blue-500" : "bg-slate-200"}`}>
                  <div className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all ${profile.sameAsRecovery ? "left-4" : "left-0.5"}`} />
                </div>
              </label>
            </div>
            <input className={inputCls} type="email" value={profile.sameAsRecovery ? profile.recoveryEmail : profile.receiptEmail} disabled={profile.sameAsRecovery}
              onChange={e => setProfile(p => ({ ...p, receiptEmail: e.target.value }))} placeholder="receipts@email.com" />
            <p className="text-[11px] text-slate-500 mt-1.5">Note: Categorizr will send you a duplicate copy of your eReceipt to this email address.</p>
          </div>
          <AnimatePresence>
            {profileMsg && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl ${profileMsg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {profileMsg.type === "success" ? <CheckCircle size={14}/> : <AlertCircle size={14}/>} {profileMsg.text}
              </motion.div>
            )}
          </AnimatePresence>
          <button type="submit" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-all shadow-sm hover:shadow">Update</button>
        </form>
      )}

      {/* ── Change Password ── */}
      {view === "changePassword" && (
        <form onSubmit={handlePasswordReset} className="flex flex-col gap-4 max-w-md bg-slate-50/50 border border-slate-200 rounded-2xl p-4">
          <div>
            <label className={labelCls}>New Password</label>
            <div className="relative">
              <input className={`${inputCls} pr-10`} type={showNew ? "text" : "password"} value={passwords.newPassword}
                onChange={e => setPasswords(p => ({ ...p, newPassword: e.target.value }))} placeholder="Enter new password" />
              <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showNew ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            {strengthLevel && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1 rounded-full bg-slate-200 overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-300 ${strengthColor} ${strengthWidth}`} />
                </div>
                <span className="text-xs text-slate-500 capitalize">{strengthLevel}</span>
              </div>
            )}
          </div>
          <div>
            <label className={labelCls}>Confirm New Password</label>
            <div className="relative">
              <input className={`${inputCls} pr-10`} type={showConfirm ? "text" : "password"} value={passwords.confirmPassword}
                onChange={e => setPasswords(p => ({ ...p, confirmPassword: e.target.value }))} placeholder="Re-enter new password" />
              <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showConfirm ? <EyeOff size={16}/> : <Eye size={16}/>}
              </button>
            </div>
            {passwords.confirmPassword.length > 0 && (
              <div className={`flex items-center gap-1.5 mt-1.5 text-xs font-medium ${passwords.newPassword === passwords.confirmPassword ? "text-green-600" : "text-red-500"}`}>
                {passwords.newPassword === passwords.confirmPassword ? <><CheckCircle size={12}/> Passwords match</> : <><XCircle size={12}/> Passwords do not match</>}
              </div>
            )}
          </div>
          <AnimatePresence>
            {passwordMsg && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className={`flex items-center gap-2 text-sm px-3 py-2.5 rounded-xl ${passwordMsg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
                {passwordMsg.type === "success" ? <CheckCircle size={14}/> : <AlertCircle size={14}/>} {passwordMsg.text}
              </motion.div>
            )}
          </AnimatePresence>
          <button type="submit" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-all shadow-sm hover:shadow">Reset Password</button>
          <button type="button" onClick={() => setShowForgotPassword(true)} className="text-xs text-blue-500 hover:text-blue-700 text-center">Forgot Password?</button>
        </form>
      )}

      {/* ── Delete Confirm ── */}
      {view === "deleteConfirm" && (
        <div className="max-w-md flex flex-col items-center gap-4 text-center py-4 bg-red-50/50 border border-red-100 rounded-2xl">
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center">
            <Trash size={28} className="text-red-500" />
          </div>
          <div>
            <p className="text-lg font-bold text-slate-900">Are you sure?</p>
            <p className="text-sm text-slate-500 mt-1 max-w-xs">This will permanently delete your account and all data. This cannot be undone.</p>
          </div>
          <div className="flex gap-3 w-full max-w-xs">
            <button onClick={() => setView("menu")} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-all">No, Keep It</button>
            <button className="flex-1 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-sm font-semibold transition-all">Yes, Delete</button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showForgotPassword && <ForgotPasswordModal onClose={() => setShowForgotPassword(false)} />}
      </AnimatePresence>
    </>
  );
};

/* Receipt Info panel — wraps a manage section inline */
const ReceiptInfoPanel = ({ type, merchants, expenseCategories, paymentMethods, taxData, onOpen }) => {
  const items = [
    { type: "merchants",  icon: Store,      label: "Manage Merchants",          count: merchants.length,         iconBg: "bg-blue-50",    iconColor: "text-blue-600",    countBg: "bg-blue-100 text-blue-600 border-blue-200" },
    { type: "categories", icon: Tag,        label: "Manage Expense Categories", count: expenseCategories.length, iconBg: "bg-violet-50",  iconColor: "text-violet-600",  countBg: "bg-violet-100 text-violet-600 border-violet-200" },
    { type: "payments",   icon: CreditCard, label: "Manage Payment Methods",    count: paymentMethods.length,    iconBg: "bg-emerald-50", iconColor: "text-emerald-600", countBg: "bg-emerald-100 text-emerald-600 border-emerald-200" },
    { type: "taxes",      icon: Percent,    label: "Manage Tax Types",          count: taxData.length,           iconBg: "bg-amber-50",   iconColor: "text-amber-600",   countBg: "bg-amber-100 text-amber-700 border-amber-200" },
  ];

  const activeItem = items.find(i => i.type === type);
  if (activeItem) {
    // show just that type's full list
    return <ManageModal type={type} onClose={() => onOpen(null)} />;
  }

  return (
    <div className="flex flex-col gap-2 max-w-lg">
      <p className="text-xs text-slate-500 mb-2">Deleting a merchant linked to existing receipts will reassign them to Miscellaneous.</p>
      {items.map(({ type: t, icon: Icon, label, count, iconBg, iconColor, countBg }) => (
        <button key={t} onClick={() => onOpen(t)}
          className="w-full flex items-center gap-4 bg-white border border-slate-200 rounded-2xl px-4 py-3.5 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm text-left group">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}><Icon size={18} className={iconColor} /></div>
          <span className="flex-1 text-sm font-semibold text-slate-900">{label}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border flex-shrink-0 ${countBg}`}>{count}</span>
          <ChevronRight size={16} className="text-slate-300 group-hover:text-slate-500 flex-shrink-0 transition-colors" />
        </button>
      ))}
    </div>
  );
};

/* My Information panel */
const MyInformationPanel = ({ user }) => {
  const email       = user?.userName ? `${user.userName}@categorizr.com` : (user?.username ? `${user.username}@categorizr.com` : "");
  const displayName = user?.userName || user?.username || user?.firstName || email.split("@")[0] || "User";
  return (
    <div className="flex flex-col gap-6 max-w-lg">
      {/* Profile card + QR */}
      <div className="bg-gradient-to-br from-white to-slate-50 border border-slate-200 rounded-2xl p-5 shadow-sm flex flex-col sm:flex-row items-center gap-5">
        <div className="flex-shrink-0 flex flex-col items-center gap-2">
          <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-sm">
            {email ? <QRCodeSVG value={`mailto:${email}`} size={120} bgColor="#ffffff" fgColor="#1e293b" /> : (
              <div className="w-[120px] h-[120px] bg-slate-100 rounded-lg flex items-center justify-center"><QrCode size={40} className="text-slate-300" /></div>
            )}
          </div>
          <p className="text-[11px] text-slate-500">Scan to see email</p>
        </div>
        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center text-white text-xl font-bold mx-auto sm:mx-0 mb-3">
            {displayName[0].toUpperCase()}
          </div>
          <p className="text-base font-bold text-slate-900 truncate">{displayName}</p>
          {email && <p className="text-sm text-slate-500 truncate mt-0.5">{email}</p>}
        </div>
      </div>
      {/* Coming soon cards */}
      {[
        { icon: Car,   label: "Driver Information",   sub: "Driver license, insurance, and more" },
        { icon: Truck, label: "Vehicle Information",  sub: "Vehicle details and registration" },
        { icon: Home,  label: "Property Information", sub: "Property records and details" },
      ].map(({ icon: Icon, label, sub }) => (
        <div key={label} className="flex items-center gap-4 bg-white border border-slate-200 rounded-xl px-4 py-3.5 opacity-70 cursor-not-allowed shadow-sm">
          <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0"><Icon size={18} className="text-slate-400" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-600">{label}</p>
            <p className="text-xs text-slate-500 mt-0.5">{sub}</p>
          </div>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-yellow-50 text-yellow-600 border border-yellow-200 flex-shrink-0">Coming Soon</span>
        </div>
      ))}
    </div>
  );
};

/* ─── Sidebar nav config ─────────────────────────────────── */
const NAV = [
  {
    group: "Account",
    items: [
      { id: "myaccount",  icon: User,    label: "My Account"  },
      { id: "mynetwork",  icon: Network, label: "My Network"  },
    ],
  },
  {
    group: "Receipt Information",
    items: [
      { id: "merchants",  icon: Store,      label: "Manage Merchants"          },
      { id: "categories", icon: Tag,        label: "Manage Expense Categories" },
      { id: "payments",   icon: CreditCard, label: "Manage Payment Methods"    },
      { id: "taxes",      icon: Percent,    label: "Manage Tax Types"          },
    ],
  },
  {
    group: "My Information",
    items: [
      { id: "myinfo", icon: QrCode, label: "Profile & QR Code" },
      { id: "driver",   icon: Car,   label: "Driver Information",   soon: true },
      { id: "vehicle",  icon: Truck, label: "Vehicle Information",  soon: true },
      { id: "property", icon: Home,  label: "Property Information", soon: true },
    ],
  },
];

const MANAGE_TYPES = ["merchants", "categories", "payments", "taxes"];

const TITLES = {
  myaccount:  "My Account",
  mynetwork:  "My Network",
  merchants:  "Manage Merchants",
  categories: "Manage Expense Categories",
  payments:   "Manage Payment Methods",
  taxes:      "Manage Tax Types",
  myinfo:     "My Information",
  driver:     "Driver Information",
  vehicle:    "Vehicle Information",
  property:   "Property Information",
};

/* ─── Main Settings Component ───────────────────────────── */
const Settings = () => {
  const navigate = useNavigate();
  const { clearAllData, user } = useData();

  const [active, setActive]               = useState("myaccount");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [sidebarOpen, setSidebarOpen]     = useState(false); // mobile toggle
  const [pendingNetworkCount, setPendingNetworkCount] = useState(0);

  useEffect(() => {
    getPendingRequestCount().then((res) => {
      if (res.ok) setPendingNetworkCount(res.data);
    });
  }, []);

  const handleLogout = () => {
    clearAllData();
    localStorage.clear();
    navigate("/login", { replace: true });
  };

  const handleNavClick = (id, soon) => {
    if (soon) return;
    setActive(id);
    setSidebarOpen(false);
  };

  /* breadcrumb label */
  const crumbLabel = TITLES[active] || active;

  /* Sidebar */
  const Sidebar = () => (
    <aside className="flex flex-col h-full bg-white/95 backdrop-blur-md border-r border-slate-200/80 w-72 flex-shrink-0">
      {/* Sidebar header */}
      <div className="px-4 py-5 border-b border-slate-200/80">
        <button onClick={() => navigate("/homepage")}
          className="flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors mb-4">
          <ArrowLeft size={16} /> Settings
        </button>
      </div>
      {/* Nav groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-5">
        {NAV.map(({ group, items }) => (
          <div key={group}>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] px-2 mb-2">{group}</p>
            <div className="flex flex-col gap-1">
              {items.map(({ id, icon: Icon, label, soon }) => {
                const isActive = active === id;
                return (
                  <button key={id} onClick={() => handleNavClick(id, soon)}
                    disabled={soon}
                    className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-all text-left w-full border
                      ${soon ? "opacity-40 cursor-not-allowed text-slate-500 border-transparent" : ""}
                      ${!soon && isActive ? "bg-blue-50/80 text-blue-700 border-blue-100 shadow-sm" : ""}
                      ${!soon && !isActive ? "text-slate-600 border-transparent hover:bg-slate-50 hover:border-slate-200 hover:text-slate-900" : ""}`}
                  >
                    <Icon size={15} className={isActive && !soon ? "text-blue-600" : ""} />
                    <span className="flex-1">{label}</span>
                    {id === "mynetwork" && pendingNetworkCount > 0 && (
                      <span className="min-w-[18px] h-[18px] flex items-center justify-center text-[10px] font-bold px-1 rounded-full bg-red-500 text-white">
                        {pendingNetworkCount > 9 ? "9+" : pendingNetworkCount}
                      </span>
                    )}
                    {soon && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-600 border border-yellow-200">Soon</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      {/* Logout at bottom of sidebar */}
      <div className="px-3 py-4 border-t border-slate-200/80">
        <button onClick={() => setShowLogoutConfirm(true)}
          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 border border-transparent hover:border-red-100 transition-all w-full">
          <LogOut size={15} /> Log out
        </button>
      </div>
    </aside>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-slate-50 to-blue-50/30 flex flex-col">
      <Header />

      {/* Page body */}
      <div className="flex flex-1 overflow-hidden" style={{ minHeight: "calc(100vh - 60px)" }}>

        {/* ── Desktop Sidebar ── */}
        <div className="hidden lg:flex flex-col h-auto sticky top-0 self-start" style={{ minHeight: "calc(100vh - 60px)" }}>
          <Sidebar />
        </div>

        {/* ── Mobile sidebar overlay ── */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-black/40 lg:hidden" />
              <motion.div initial={{ x: -256 }} animate={{ x: 0 }} exit={{ x: -256 }} transition={{ type: "tween", duration: 0.22 }}
                className="fixed left-0 top-0 z-50 h-full lg:hidden">
                <Sidebar />
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* ── Main content ── */}
        <main className="flex-1 overflow-y-auto">
          {/* Top bar */}
          <div className="bg-white/90 backdrop-blur-md border-b border-slate-200 px-6 py-4 flex items-center gap-3 sticky top-0 z-10">
            {/* Mobile menu button */}
            <button onClick={() => setSidebarOpen(true)} className="lg:hidden flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-100 transition-colors text-slate-500">
              <SettingsIcon size={16} />
            </button>
            {/* Breadcrumb */}
            <nav className="flex items-center gap-1.5 text-sm text-slate-400">
              <button onClick={() => navigate("/homepage")} className="hover:text-slate-700 transition-colors flex items-center gap-1">
                <Home size={13} /> Home
              </button>
              <ChevronRight size={12} />
              <span className="text-slate-400">Settings</span>
              <ChevronRight size={12} />
              <span className="text-slate-900 font-semibold">{crumbLabel}</span>
            </nav>
          </div>

          {/* Panel content */}
          <div className="px-4 sm:px-6 py-7">
            <div className="mb-5">
              <p className="text-xs uppercase tracking-[0.14em] text-slate-400 font-semibold">Workspace Settings</p>
              <h1 className="text-2xl font-bold text-slate-900 mt-1">{crumbLabel}</h1>
              <div className="w-12 h-0.5 bg-blue-500 rounded-full mt-3" />
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={active} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }} className={`${sectionCardCls} p-4 sm:p-6`}>
                {active === "myaccount" && (
                  <MyAccountPanel user={user} onLogoutRequest={() => setShowLogoutConfirm(true)} />
                )}
                {active === "mynetwork" && (
                  <MyNetworkPanel
                    user={user}
                    onPendingCountChange={setPendingNetworkCount}
                  />
                )}
                {MANAGE_TYPES.includes(active) && (
                  <ReceiptInfoInline type={active} />
                )}
                {active === "myinfo" && <MyInformationPanel user={user} />}
                {(active === "driver" || active === "vehicle" || active === "property") && (
                  <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
                    <div className="w-16 h-16 rounded-full bg-yellow-50 flex items-center justify-center">
                      <Star size={28} className="text-yellow-400" />
                    </div>
                    <p className="text-base font-bold text-gray-700">Coming Soon</p>
                    <p className="text-sm text-gray-400">This feature is under development.</p>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>

      <LogoutConfirmationDialog isOpen={showLogoutConfirm} onClose={() => setShowLogoutConfirm(false)} onConfirm={handleLogout} />
    </div>
  );
};

/* ─── Logo grid sub-component ───────────────────────────── */
const LogoGrid = ({ options, selectedIndex, onSelect }) => {
  if (!options || options.length === 0) return null;
  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">Select a logo (optional):</p>
      <div className="grid grid-cols-4 gap-2">
        {options.map((opt, i) => {
          const url = opt.displayUrl || opt.storeUrl;
          return (
            <button key={i} type="button"
              style={{ margin: 0, padding: 0, aspectRatio: "1" }}
              onClick={() => onSelect(i === selectedIndex ? null : i)}
              className={`relative rounded-xl border-2 overflow-hidden bg-gray-50 flex items-center justify-center transition-all ${selectedIndex === i ? "border-blue-500 ring-2 ring-blue-200" : "border-gray-200 hover:border-blue-300"}`}
            >
              <img src={url} alt="" style={{ width: "80%", height: "80%", objectFit: "contain" }} onError={e => { e.target.style.visibility = "hidden"; }} />
              {selectedIndex === i && (
                <div className="absolute bottom-0.5 right-0.5"><CheckCircle size={14} className="text-blue-600 bg-white rounded-full" /></div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/* ─── Inline Manage (no modal, content directly in panel) ── */
const ReceiptInfoInline = ({ type }) => {
  const {
    receipts, updateReceipt,
    receiptMerchWImgRaw, customMerchants, hiddenMerchants, hideMerchant, isMerchantHidden, addCustomMerchant, editCustomMerchant, deleteCustomMerchant,
    receiptCategoriesRaw, customCategories, hiddenCategories, hideCategory, unhideCategory, isCategoryHidden, addCustomCategory, editCustomCategory, deleteCustomCategory,
    paymentMethods,
    receiptPaymentsRaw, customPaymentMethods, hiddenPaymentMethods, hidePaymentMethod, unhidePaymentMethod, isPaymentMethodHidden, addCustomPaymentMethod, editCustomPaymentMethod, deleteCustomPaymentMethod,
    taxData, addTax, updateTax, deleteTax, fetchTaxes,
    apiMerchants, fetchApiMerchants, addApiMerchant, updateApiMerchant, deleteApiMerchant,
    apiPaymentMethods, fetchApiPaymentMethods, addApiPaymentMethod, updateApiPaymentMethod, deleteApiPaymentMethod,
    apiExpenseCategories, fetchApiExpenseCategories, addApiExpenseCategory, updateApiExpenseCategory, deleteApiExpenseCategory,
    refreshData,
    silentRefreshData,
  } = useData();

  useEffect(() => { if (type === "taxes") fetchTaxes(); }, [type, fetchTaxes]);
  useEffect(() => { if (type === "merchants") fetchApiMerchants(); }, [type]);
  useEffect(() => { if (type === "payments") fetchApiPaymentMethods(); }, [type]);
  useEffect(() => {
    if (type === "categories") {
      fetchApiExpenseCategories();
      silentRefreshData?.(0);
    }
  }, [type, fetchApiExpenseCategories, silentRefreshData]);
  useEffect(() => { 
    setShowAddForm(false); 
    resetAddFormState();
    setEditTaxKey(null);
    clearEditTaxRateLimitAlert();
    setEditTaxRateFocused(false);
  }, [type]);

  const cfg    = MODAL_CFG[type];
  const colors = COLOR_MAP[cfg.color];

  const [search, setSearch]     = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [addVal, setAddVal]     = useState("");
  const [addTaxVal, setAddTaxVal] = useState({ tax_name: "", tax_rate: "", tax_number: "" });
  const [msg, setMsg]           = useState(null);
  const [showMaxDefaultTaxMsg, setShowMaxDefaultTaxMsg] = useState(false);

  const defaultTaxIds = useMemo(() => {
    return (taxData || []).filter(t => parseInt(t.is_default_tax) === 1).map(t => t.id);
  }, [taxData]);

  const toggleDefaultTax = async (taxId) => {
    const taxToToggle = (taxData || []).find(t => t.id === taxId);
    if (!taxToToggle) return;

    const isCurrentlyDefault = parseInt(taxToToggle.is_default_tax) === 1;

    if (!isCurrentlyDefault && defaultTaxIds.length >= 2) {
      setShowMaxDefaultTaxMsg(true);
      return;
    }
    
    try {
      const taxPayload = {
        ...taxToToggle,
        is_default_tax: isCurrentlyDefault ? 0 : 1,
      };
      await updateTax(taxPayload);
    } catch (e) {
      toast("error", "Failed to update default tax");
    }
  };

  // Edit state (unified for all non-tax item types)
  const [editKey, setEditKey]             = useState(null);   // item.key being edited
  const [editIsReceipt, setEditIsReceipt] = useState(false);  // is it a receipt-derived item?
  const [editVal, setEditVal]             = useState("");
  const [editOrigLogo, setEditOrigLogo]   = useState(null);   // logo before edit
  const [editLogoOpts, setEditLogoOpts]   = useState([]);
  const [editLogoSel, setEditLogoSel]     = useState(null);
  const [isFetchEditLogo, setIsFetchEditLogo] = useState(false);

  // Tax edit state
  const [editTaxKey, setEditTaxKey] = useState(null);
  const [editTaxVal, setEditTaxVal] = useState({ tax_name: "", tax_rate: "", tax_number: "" });

  // Tax field overflow state (ReceiptInfoInline)
  const [addTaxNameOverflow, setAddTaxNameOverflow]     = useState(false);
  const { message: addTaxRateLimitAlert, showAlert: showAddTaxRateLimitAlert, clearAlert: clearAddTaxRateLimitAlert } = useTaxRateLimitAlert();
  const [addTaxNumberOverflow, setAddTaxNumberOverflow]   = useState(false);
  const [addTaxRateFocused, setAddTaxRateFocused]       = useState(false);
  const [editTaxNameOverflow, setEditTaxNameOverflow]   = useState(false);
  const { message: editTaxRateLimitAlert, showAlert: showEditTaxRateLimitAlert, clearAlert: clearEditTaxRateLimitAlert } = useTaxRateLimitAlert();
  const [editTaxNumberOverflow, setEditTaxNumberOverflow] = useState(false);
  const [editTaxRateFocused, setEditTaxRateFocused]     = useState(false);

  // Merchant confirmation dialog state
  const [showMerchantEditConfirm, setShowMerchantEditConfirm] = useState(false);
  const [pendingMerchantEdit, setPendingMerchantEdit] = useState(null); // { item, newName, keepLogo }
  const [showMerchantDeleteConfirm, setShowMerchantDeleteConfirm] = useState(false);
  const [pendingMerchantDelete, setPendingMerchantDelete] = useState(null); // item
  const [showCategoryEditConfirm, setShowCategoryEditConfirm] = useState(false);
  const [pendingCategoryEdit, setPendingCategoryEdit] = useState(null); // { item, newName }
  const [showCategoryDeleteConfirm, setShowCategoryDeleteConfirm] = useState(false);
  const [pendingCategoryDelete, setPendingCategoryDelete] = useState(null); // item
  const [showPaymentEditConfirm, setShowPaymentEditConfirm] = useState(false);
  const [pendingPaymentEdit, setPendingPaymentEdit] = useState(null); // { item, newName } | { fn: async () => void }
  const [showPaymentDeleteConfirm, setShowPaymentDeleteConfirm] = useState(false);
  const [pendingPaymentDelete, setPendingPaymentDelete] = useState(null); // item
  const [showTaxRateChangeWarning, setShowTaxRateChangeWarning] = useState(false);
  const [pendingTaxRateEdit, setPendingTaxRateEdit] = useState(null); // { tax, nextName, nextRate, nextNumber }
  const [showTaxDeleteBlockedMsg, setShowTaxDeleteBlockedMsg] = useState(false);
  const [showTaxDeleteConfirm, setShowTaxDeleteConfirm] = useState(false);
  const [pendingTaxDeleteId, setPendingTaxDeleteId] = useState(null);
  const [isDeleteSyncing, setIsDeleteSyncing] = useState(false);

  // Add-merchant state
  const [newMerchantName, setNewMerchantName] = useState("");
  const [addLogoOpts, setAddLogoOpts]         = useState([]);
  const [addLogoSel, setAddLogoSel]           = useState(null);
  const [isFetchAddLogo, setIsFetchAddLogo]   = useState(false);

  // Add-payment state
  const [newCardType, setNewCardType]         = useState("");
  const [newIssuerName, setNewIssuerName]     = useState("");
  const [newLast4, setNewLast4]               = useState("");
  const [newExpenseType, setNewExpenseType]   = useState("Personal"); // Personal | Business

  // localStorage: payment display string → "Personal" or "Business"
  // payEditMode: null = add mode, { item, apiId } = edit an existing payment method via the Add form
  const [payEditMode, setPayEditMode] = useState(null);

  const resetAddFormState = () => {
    setAddVal("");
    setAddTaxVal({ tax_name: "", tax_rate: "", tax_number: "" });
    setAddTaxNameOverflow(false);
    clearAddTaxRateLimitAlert();
    setAddTaxNumberOverflow(false);
    setAddTaxRateFocused(false);
    setNewMerchantName("");
    setAddLogoOpts([]);
    setAddLogoSel(null);
    setIsFetchAddLogo(false);
    setNewCardType("");
    setNewIssuerName("");
    setNewLast4("");
    setNewExpenseType("Personal");
    setPayEditMode(null);
  };

  const [payExpenseTypeMap, setPayExpenseTypeMap] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cat_pay_expense_type") || "{}"); } catch { return {}; }
  });
  const savePayExpenseType = (payStr, expType) => {
    setPayExpenseTypeMap(prev => {
      const next = { ...prev, [payStr]: expType };
      localStorage.setItem("cat_pay_expense_type", JSON.stringify(next));
      return next;
    });
  };

  // localStorage: merchant name → logo URL
  const [merchLogos, setMerchLogos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cat_merch_logos") || "{}"); } catch { return {}; }
  });
  const saveMerchLogo = (name, url) => {
    setMerchLogos(prev => {
      const next = { ...prev, [name]: url };
      localStorage.setItem("cat_merch_logos", JSON.stringify(next));
      return next;
    });
  };

  // localStorage: payment display string → card type name
  const [payCardMap, setPayCardMap] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem("cat_pay_card_types") || "{}");
      return { ...DEFAULT_PAYMENT_CARD_MAP, ...(stored || {}) };
    } catch {
      return { ...DEFAULT_PAYMENT_CARD_MAP };
    }
  });
  const savePayCard = (payStr, cardTypeName) => {
    setPayCardMap(prev => {
      const next = { ...prev, [payStr]: cardTypeName };
      localStorage.setItem("cat_pay_card_types", JSON.stringify(next));
      return next;
    });
  };

  // Build a map: display string (e.g. "My Card *4567") → card brand (e.g. "Diners Club")
  // derived from all receipts. This lets us resolve logos for custom-named payment methods
  // that were added via the Add/Edit Receipt modal (where the brand is in paymentType but
  // the display name is in card_issuer_name).
  const receiptDisplayToCardType = (() => {
    const map = {};
    (receipts || []).forEach(r => {
      const issuer = (r.card_issuer_name || r.cardIssuerName || "").toString().trim();
      const last4  = (r.last_4_digit_card || r.last4DigitCard || "").toString().trim();
      const brand  = (r.paymentType || r.payment_type || "").toString().trim();
      if (!issuer || issuer === "0" || !brand || brand === "0") return;
      const alreadyHasLast4 = last4 && last4 !== "0" && issuer.includes(`*${last4}`);
      const displayKey = (last4 && last4 !== "0" && !alreadyHasLast4)
        ? `${issuer} *${last4}`
        : issuer;
      const rawKey = (displayKey || "").toLowerCase();
      const normalizedKey = normalizePaymentDisplayKey(displayKey);
      if (rawKey && !map[rawKey]) map[rawKey] = brand;
      if (normalizedKey && !map[normalizedKey]) map[normalizedKey] = brand;
    });
    return map;
  })();

  // Get the correct logo for a payment string
  const getPayLogoResolved = (payStr) => {
    const normalizedKey = normalizePaymentDisplayKey(payStr);
    // Priority 0: API payment methods card_type integer (most authoritative)
    const apiRec = (apiPaymentMethods || []).find(ap => {
      try {
        return normalizePaymentDisplayKey(getApiPaymentMethodDisplayName(ap)) === normalizedKey;
      } catch { return false; }
    });
    if (apiRec) {
      const apiLogo = getApiPaymentMethodLogo(apiRec);
      if (apiLogo) return apiLogo;
    }
    // Priority 1: localStorage mapping (saved when added via Settings)
    const stored = payCardMap[payStr] || (normalizedKey ? payCardMap[normalizedKey] : null);
    if (stored) {
      const found = PAYMENT_CARD_TYPES.find(c => c.name === stored);
      if (found) return found.logo;
    }
    // Priority 2: keyword detection on the display string itself
    const logo = getPaymentLogo(payStr);
    if (logo) return logo;
    // Priority 3: look up the card brand from receipts (covers custom-named payment methods
    // added via Add/Edit Receipt modal where brand is stored in paymentType, not display name)
    const brand =
      receiptDisplayToCardType[(payStr || "").toLowerCase()] ||
      (normalizedKey ? receiptDisplayToCardType[normalizedKey] : null);
    if (brand) return getPaymentLogo(brand);
    return null;
  };

  const inferCardTypeFromPayment = (value) => {
    const v = (value || "").toLowerCase();
    if (v.includes("visa")) return "Visa";
    if (v.includes("master")) return "MasterCard";
    if (v.includes("american") || v.includes("amex")) return "American Express";
    if (v.includes("discover")) return "Discover";
    if (v.includes("diners")) return "Diners Club";
    if (v.includes("paypal")) return "PayPal";
    if (v.includes("debit")) return "Debit Card";
    if (v.includes("cash")) return "Cash";
    return "Other";
  };

  // True when issuer is a user-entered custom name (not the card brand alone).
  const isCustomCardIssuer = (issuer, brand) => {
    const iss = (issuer || "").trim();
    if (!iss) return false;
    const ik = normalizeMatchKey(iss);
    const bk = normalizeMatchKey(brand || "");
    if (ik === bk) return false;
    if (ik === normalizeMatchKey(inferCardTypeFromPayment(iss))) return false;
    return true;
  };

  const storedCardIssuerName = (customIssuer, cardType) => {
    const iss = (customIssuer || "").trim();
    return isCustomCardIssuer(iss, cardType) ? iss : "";
  };

  // List label: brand *last4 when no custom issuer (e.g. "MasterCard *7979").
  const getPaymentMethodListLabel = (paymentName) => {
    const { issuer, last4 } = parsePaymentDisplay(paymentName);
    const brand = getPaymentBrand(paymentName, inferCardTypeFromPayment(issuer || paymentName));
    const base = isCustomCardIssuer(issuer, brand) ? issuer : (brand || issuer || paymentName);
    if (!last4) return base || paymentName;
    const alreadyHasLast4 =
      new RegExp(`\\*${last4}\\s*$`).test(base) || base.includes(`*${last4}`);
    return alreadyHasLast4 ? base : `${base} *${last4}`;
  };

  const getPaymentBrand = (paymentName, fallbackCardType = "") => {
    const key = (paymentName || "").toString().trim();
    const normalizedKey = normalizePaymentDisplayKey(key);
    if (!key) return (fallbackCardType || "").trim();
    const fromLocal = payCardMap[key] || (normalizedKey ? payCardMap[normalizedKey] : null);
    if (fromLocal) return fromLocal;
    const fromReceipts =
      receiptDisplayToCardType[key.toLowerCase()] ||
      (normalizedKey ? receiptDisplayToCardType[normalizedKey] : null);
    if (fromReceipts) return fromReceipts;
    const inferred = inferCardTypeFromPayment(key);
    if (inferred !== "Other") return inferred;
    // For items like "Citibank *1234", also try the issuer-only part in payCardMap
    const { issuer: issuerOnly, last4: keyLast4 } = parsePaymentDisplay(key);
    if (issuerOnly && keyLast4) {
      const fromIssuer = payCardMap[issuerOnly] || payCardMap[(issuerOnly || "").toLowerCase()];
      if (fromIssuer) return fromIssuer;
    }
    return (fallbackCardType || "").trim();
  };

  const getPaymentSignature = (paymentName, fallbackCardType = "") => {
    const { last4 } = parsePaymentDisplay(paymentName);
    const brand = getPaymentBrand(paymentName, fallbackCardType);
    const normalizedBrand = (brand || "").toString().trim().toLowerCase();
    const normalizedLast4 = (last4 || "").toString().trim();
    if (!normalizedBrand || !normalizedLast4) return "";
    return `${normalizedBrand}|${normalizedLast4}`;
  };
  const normalizeMatchKey = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();
  const getApiMerchantId = (obj) => {
    const id = obj?.id ?? obj?.store_id ?? obj?.fk_store_id ?? obj?.apiId ?? null;
    return id != null && String(id) !== "" && String(id) !== "0" ? id : null;
  };
  const resolveMerchantApiIdForName = async (merchantName) => {
    const matchIn = (list) =>
      (list || []).find(
        (m) => normalizeMatchKey(m?.store_name) === normalizeMatchKey(merchantName)
      );
    const resolveFromList = (list) => {
      let match = matchIn(list);
      let apiId = getApiMerchantId(match);
      if (apiId !== null) return { apiId, match };
      match = findRenamedApiMerchant(merchantName, list);
      apiId = getApiMerchantId(match);
      return { apiId, match };
    };
    let resolved = resolveFromList(apiMerchants);
    if (resolved.apiId !== null) return resolved;
    const fresh = await fetchApiMerchants();
    return resolveFromList(fresh);
  };
  const getApiEntityId = (obj) =>
    obj?.id ?? obj?.payment_method_id ?? obj?.fk_payment_method_id ?? null;
  const resolvePaymentApiMatches = (item) => {
    const itemName = item?.name || "";
    const itemKey = normalizeMatchKey(itemName);
    const { issuer: itemIssuer, last4: itemLast4 } = parsePaymentDisplay(itemName);
    const itemIssuerKey = normalizeMatchKey(itemIssuer);
    const itemBrand = normalizeMatchKey(getPaymentBrand(itemName, inferCardTypeFromPayment(itemName)));
    const matches = (apiPaymentMethods || []).filter((p) => {
      const apiName = getApiPaymentMethodDisplayName(p);
      const apiNameKey = normalizeMatchKey(apiName);
      if (!apiNameKey) return false;
      if (apiNameKey === itemKey) return true;
      const apiIssuer = (p?.card_issuer_name || "").trim() || parsePaymentDisplay(apiName).issuer;
      const apiLast4 = getLast4FromPaymentApiRecord(p) || parsePaymentDisplay(apiName).last4;
      const apiIssuerKey = normalizeMatchKey(apiIssuer);
      if (!itemLast4 || !apiLast4 || itemLast4 !== apiLast4) return false;
      if (itemIssuerKey && apiIssuerKey && itemIssuerKey === apiIssuerKey) return true;
      const apiBrand = normalizeMatchKey(getPaymentBrand(apiName, inferCardTypeFromPayment(apiName)));
      if (itemBrand && apiBrand && itemBrand === apiBrand) return true;
      return false;
    });
    if (item?.isApiItem && item?.apiId) {
      const direct = (apiPaymentMethods || []).find(
        (p) => String(getApiEntityId(p)) === String(item.apiId)
      );
      if (direct && !matches.some((m) => String(getApiEntityId(m)) === String(getApiEntityId(direct)))) {
        matches.unshift(direct);
      }
    }
    return matches.filter((m) => getApiEntityId(m) !== null);
  };

  const isCashMethod = (name) => {
    const base = (name || "")
      .toString()
      .replace(/\s*\*\s*\d{3,4}\s*$/g, "")
      .trim()
      .toLowerCase();
    return base === "cash";
  };

  const paymentDisplayForReceipt = (r) => getPaymentDisplayFromReceipt(r);

  const getReceiptsByMerchant = (name) =>
    (receipts || []).filter(
      (r) =>
        ((r.storeName || r.store_name || "").toString().trim().toLowerCase() ===
          (name || "").toString().trim().toLowerCase())
    );

  const getReceiptsByCategory = (name) =>
    (receipts || []).filter(
      (r) =>
        ((r.expense_type || r.expenseType || "").toString().trim().toLowerCase() ===
          (name || "").toString().trim().toLowerCase())
    );

  const getReceiptsByPaymentDisplay = (name) =>
    (receipts || []).filter(
      (r) => paymentDisplayForReceipt(r).toLowerCase() === (name || "").toLowerCase()
    );

  const toast = (t, text) => { setMsg({ type: t, text }); setTimeout(() => setMsg(null), 3000); };
  const TAX_NAME_MAX = 15;
const TAX_RATE_MAX = 99.999;
const TAX_NUMBER_MAX = 35;

const hasMoreThan3Decimals = (val) => {
  const str = String(val).replace(/%/g, "").trim();
  const dot = str.indexOf(".");
  return dot !== -1 && str.length - dot - 1 > 3;
};

const isBlockedTaxRateInput = (val) => {
  const str = String(val).replace(/%/g, "").trim();
  return str === "99.999" || str === "999";
};

  const expenseCategoryExists = (name, excludeKey = null) => {
    const normalized = (name || "").trim().toLowerCase();
    if (!normalized) return false;
    return buildAllItems().some(
      (item) => item.name.toLowerCase() === normalized && item.key !== excludeKey
    );
  };

  // Generic logo fetch
  const doFetch = async (keyword, setFetching, setOpts, setSel) => {
    if (!keyword.trim()) return;
    setFetching(true); setOpts([]); setSel(null);
    try {
      const query = `${keyword.trim()} logo`;
      const res = await fetch(`/imagesearch?searchkeyword=${encodeURIComponent(query)}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`API returned ${res.status}`);

      let data;
      const contentType = res.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        try { data = JSON.parse(text); }
        catch {
          const urlMatch = text.match(/(https?:\/\/[^\s"']+\.(jpg|jpeg|png|gif|webp))/i);
          if (urlMatch) { setOpts([{ displayUrl: urlMatch[1], storeUrl: urlMatch[1] }]); return; }
          throw new Error("No valid image URL found");
        }
      }

      const isValidHttpUrl = (u) => u && /^https?:\/\//i.test(u);
      const logoEntries = [];

      // Primary format: array of {fullurl, thumburl, ...}
      if (Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          if (item && typeof item === "object") {
            const fullUrl  = item.fullurl || item.url || item.image || item.src || item.link;
            const thumbUrl = item.thumburl || fullUrl;
            const storeUrl = fullUrl || thumbUrl;
            if (isValidHttpUrl(storeUrl)) {
              logoEntries.push({ displayUrl: isValidHttpUrl(thumbUrl) ? thumbUrl : storeUrl, storeUrl });
            }
          }
        }
      }

      // Object response: {images/results/data: [...]}
      if (typeof data === "object" && !Array.isArray(data)) {
        const arr = data.images || data.results || data.data || data.items || [];
        if (Array.isArray(arr) && arr.length > 0) {
          for (const item of arr) {
            if (item && typeof item === "object") {
              const fullUrl  = item.fullurl || item.url || item.image || item.src || item.link;
              const thumbUrl = item.thumburl || fullUrl;
              if (isValidHttpUrl(fullUrl)) {
                logoEntries.push({ displayUrl: isValidHttpUrl(thumbUrl) ? thumbUrl : fullUrl, storeUrl: fullUrl });
              }
            }
          }
        }
        const directUrl = data.url || data.image || data.src || data.link || data.fullurl;
        if (isValidHttpUrl(directUrl)) logoEntries.push({ displayUrl: directUrl, storeUrl: directUrl });
      }

      setOpts(logoEntries.slice(0, 8));
    } catch (e) { console.error("Logo fetch error:", e); }
    finally { setFetching(false); }
  };

  // ── Close edit helper ──
  const closeEdit = () => {
    setEditKey(null); setEditIsReceipt(false); setEditVal("");
    setEditOrigLogo(null); setEditLogoOpts([]); setEditLogoSel(null);
  };

  const getInlineEditDuplicateMessage = (item, nextValue) => {
    const nextName = (nextValue || "").trim();
    if (!nextName) return "";
    if (type === "merchants") {
      const exists = buildAllItems().some(
        (i) => normalizeMatchKey(i.name) === normalizeMatchKey(nextName) && i.key !== item.key
      );
      return exists ? "Merchant already exists" : "";
    }
    if (type === "categories") {
      const exists = buildAllItems().some(
        (i) => normalizeMatchKey(i.name) === normalizeMatchKey(nextName) && i.key !== item.key
      );
      return exists ? "Expense Category already exists" : "";
    }
    return "";
  };

  const getInlineTaxDuplicateMessage = (taxId, taxName) => {
    const nextName = (taxName || "").trim();
    if (!nextName) return "";
    const exists = (taxData || []).some(
      (t) => t.id !== taxId && normalizeMatchKey(t.tax_name) === normalizeMatchKey(nextName)
    );
    return exists ? "Tax Type already exists" : "";
  };

  // Live duplicate-name detection for the Add Tax form (no id to exclude).
  const addInlineTaxDuplicateMsg = type === "taxes"
    ? getInlineTaxDuplicateMessage(null, addTaxVal.tax_name)
    : "";

  // ── ADD ──
  const handleAdd = async () => {
    if (type === "taxes") {
      const n = addTaxVal.tax_name.trim(), r = addTaxVal.tax_rate.toString().trim(), num = addTaxVal.tax_number.trim();
      if (!n) return toast("error", "Please enter Tax Name");
      if (n.length > TAX_NAME_MAX) return toast("error", `Tax Name cannot exceed ${TAX_NAME_MAX} characters`);
      if (!r) return toast("error", "Please enter Tax Rate");
      if (parseFloat(r) > TAX_RATE_MAX || parseFloat(r) < 0) {
        return toast("error", `Tax Rate must be between 0 and ${TAX_RATE_MAX}`);
      }
      if (hasMoreThan3Decimals(r)) {
        return toast("error", "Tax Rate can have a maximum of 3 decimal places (e.g. 10.894%)");
      }
      if (isBlockedTaxRateInput(r)) {
        return toast("error", "Tax Rate cannot be 99.999 or 999");
      }
      if (num.length > TAX_NUMBER_MAX) return toast("error", `Tax Number cannot exceed ${TAX_NUMBER_MAX} characters`);
      const duplicateTaxName = (taxData || []).some(
        (tax) => (tax.tax_name || "").toLowerCase() === n.toLowerCase()
      );
      if (duplicateTaxName) return toast("error", "Tax Type already exists");
      try {
        await addTax({ tax_name: n, tax_rate: r, tax_number: addTaxVal.tax_number.trim(), fk_user_id: localStorage.getItem("fk_user_id") || "" });
        resetAddFormState();
        toast("success", "Tax Type Added");
      } catch (e) { toast("error", e.message || "Failed."); }
      return;
    }
    if (type === "merchants") {
      const name = newMerchantName.trim();
      if (!name) return toast("error", "Please enter Merchant Name");
      // Duplicate check (case-insensitive across all existing items)
      const allExisting = buildAllItems();
      if (allExisting.some(i => i.name.toLowerCase() === name.toLowerCase())) {
        return toast("error", "Merchant already exists");
      }
      const selectedUrl = addLogoSel !== null ? (addLogoOpts[addLogoSel]?.displayUrl || addLogoOpts[addLogoSel]?.storeUrl || null) : null;
      if (selectedUrl) saveMerchLogo(name, selectedUrl);
      const addMerchantResult = await addApiMerchant(name, selectedUrl || "");
      if (!addMerchantResult?.ok) throw new Error(addMerchantResult?.error || "Failed to add merchant");
      resetAddFormState();
      toast("success", "Merchant Added");
      return;
    }
    if (type === "payments") {
      const ct     = newCardType.trim();
      const issuer = newIssuerName.trim();
      const last4  = newLast4.trim();
      if (!ct) return toast("error", "Select Card Type");
      if (!last4 || last4.replace(/\D/g, "").length < 4) {
        return toast("error", "Please enter last 4 digits of card number");
      }
      const payStr = issuer ? `${issuer} *${last4}` : `${ct} *${last4}`;
      if (!payStr) return toast("error", "Select Card Type");
      const selectedCard = PAYMENT_CARD_TYPES.find((c) => c.name === ct);
      const selectedLogoUrl = selectedCard?.logo || "";

      // ── EDIT MODE ──────────────────────────────────────────────────────────
      if (payEditMode) {
        const oldName  = payEditMode.item.name;
        const targetId = payEditMode.apiId;
        // Duplicate check (skip self and skip receipt-derived items that share the same
        // last4 — they represent the SAME physical card under a different display name,
        // so renaming the API record should never be blocked by enriched receipt entries).
        const editedLast4 = (parsePaymentDisplay(payEditMode.item.name).last4 || "").trim();
        const newSig = getPaymentSignature(payStr, ct);
        const dupExists = buildAllItems().some((i) => {
          if (i.key === payEditMode.item.key) return false;
          // Receipt items with the same last4 are the same physical card — not a duplicate
          if (i.isReceiptItem) {
            const iLast4 = (parsePaymentDisplay(i.name).last4 || "").trim();
            if (editedLast4 && iLast4 && editedLast4 === iLast4) return false;
          }
          const sig = getPaymentSignature(i.name);
          return sig && newSig && sig === newSig;
        });
        if (dupExists) return toast("error", "Payment Method already exists");

        // Show confirmation before touching API or receipts
        setPendingPaymentEdit({
          fn: async () => {
            const paymentPayload = {
              cardIssuerName: storedCardIssuerName(issuer, ct),
              cardTypeBrand: ct,
              last4: last4.replace(/\D/g, "").slice(0, 4),
            };
            // Update existing API record, or create one for default/custom-only entries.
            if (targetId != null) {
              const res = await updateApiPaymentMethod(
                targetId,
                paymentPayload,
                selectedLogoUrl,
                newExpenseType
              );
              if (!res?.ok) throw new Error(res?.error || "Failed to update payment method");
            } else {
              const res = await addApiPaymentMethod(
                paymentPayload,
                selectedLogoUrl,
                newExpenseType
              );
              if (!res?.ok) throw new Error(res?.error || "Failed to add payment method");
            }
            // Propagate to receipts that use old name.
            // Use a broad match so receipts added via AddReceiptModal (which may store
            // the issuer as paymentType rather than as card_issuer_name) are also caught.
            const { issuer: oldIssuer, last4: oldLast4 } = parsePaymentDisplay(oldName);
            const exactByDisplay = getReceiptsByPaymentDisplay(oldName);
            const exactIds = new Set(exactByDisplay.map(r => r.id));
            const additionalByFields = oldLast4
              ? (receipts || []).filter(r => {
                  if (exactIds.has(r.id)) return false;
                  const rLast4 = (r.last_4_digit_card || r.last4DigitCard || "").toString().trim();
                  if (rLast4 !== oldLast4) return false;
                  const rIssuer = (r.card_issuer_name || r.cardIssuerName || "").toString().trim().toLowerCase();
                  const rTypeLower = (r.paymentType || r.payment_type || "").toString().replace(/\s*\*\d{3,4}$/, "").trim().toLowerCase();
                  const oldIssuerLower = (oldIssuer || "").toLowerCase();
                  return (oldIssuerLower && rIssuer === oldIssuerLower) ||
                         (oldIssuerLower && rTypeLower === oldIssuerLower);
                })
              : [];
            const matchingReceipts = [...exactByDisplay, ...additionalByFields];
            if (matchingReceipts.length > 0) {
              const { last4: newL4 } = parsePaymentDisplay(payStr);
              await Promise.all(matchingReceipts.map(r => updateReceipt(r.id, {
                paymentType: ct,
                card_issuer_name: storedCardIssuerName(issuer, ct),
                last_4_digit_card: newL4 || r.last_4_digit_card || "",
              })));
            }
            // Update localStorage mappings
            savePayCard(payStr, ct);
            savePayExpenseType(payStr, newExpenseType);
            const editedItem = payEditMode.item;
            const nameChanged = normalizeMatchKey(oldName) !== normalizeMatchKey(payStr);
            deleteCustomPaymentMethod(oldName);
            deleteCustomPaymentMethod(payStr);
            if (editedItem.isDefaultItem || editedItem.isReceiptItem) {
              if (nameChanged) hidePaymentMethod(editedItem.isDefaultItem ? oldName : (editedItem.key || oldName));
            } else if (!editedItem.isApiItem) {
              editCustomPaymentMethod(oldName, payStr);
              if (nameChanged) hidePaymentMethod(oldName);
            } else if (nameChanged) {
              hidePaymentMethod(oldName);
            }
            // Reset & refresh
            setPayEditMode(null);
            setNewCardType(""); setNewIssuerName(""); setNewLast4(""); setNewExpenseType("Personal");
            setShowAddForm(false);
            await Promise.all([refreshData(), fetchApiPaymentMethods()]);
            toast("success", "Payment Method Updated");
          },
        });
        setShowPaymentEditConfirm(true);
        return;
      }

      // ── ADD MODE ───────────────────────────────────────────────────────────
      if (ct.toLowerCase() === "cash" || isCashMethod(issuer)) {
        return toast("error", "Cash already exists and cannot be created again");
      }
      const nextSignature = getPaymentSignature(payStr, ct);
      const duplicateExists = buildAllItems().some((item) => {
        // Receipt-derived items are passive (they come from past receipts, not explicit
        // registrations). The user should be able to explicitly add any card even if it
        // appeared in a receipt — only check API/custom/default items.
        if (item.isReceiptItem) return false;
        const sig = getPaymentSignature(item.name);
        return sig && sig === nextSignature;
      });
      if (duplicateExists) return toast("error", "Payment Method already exists");
      unhidePaymentMethod(payStr);
      deleteCustomPaymentMethod(payStr);
      if (ct) savePayCard(payStr, ct);
      savePayExpenseType(payStr, newExpenseType);
      const addPaymentResult = await addApiPaymentMethod(
        {
          cardIssuerName: storedCardIssuerName(issuer, ct),
          cardTypeBrand: ct,
          last4: last4.replace(/\D/g, "").slice(0, 4),
        },
        selectedLogoUrl,
        newExpenseType
      );
      if (!addPaymentResult?.ok) throw new Error(addPaymentResult?.error || "Failed to add payment method");
      // Reset form fields and edit mode; keep the form OPEN so user can add the next method
      resetAddFormState();
      await Promise.all([refreshData(), fetchApiPaymentMethods()]);
      toast("success", "Payment Method Added");
      return;
    }
    if (type === "categories") {
      if (!addVal.trim()) return toast("error", "Please enter Expense Category");
      const catName = addVal.trim();
      if (expenseCategoryExists(catName)) return toast("error", "Expense Category already exists");
      // Use API only — response includes the id so the item appears as isApiItem:true in the list,
      // which lets edit and delete work correctly via the API on the first try.
      const addCategoryResult = await addApiExpenseCategory(catName);
      if (!addCategoryResult?.ok) throw new Error(addCategoryResult?.error || "Failed to add expense category");
      unhideCategory(catName);
      await fetchApiExpenseCategories();
      resetAddFormState();
      toast("success", "Expense Category Added");
      return;
    }
    if (!addVal.trim()) return;
    setAddVal("");
  };

  // ── Merchant edit confirmed ──
  const doConfirmMerchantEdit = async () => {
    setShowMerchantEditConfirm(false);
    if (!pendingMerchantEdit) return;
    const { item, newName, keepLogo } = pendingMerchantEdit;
    try {
      // Always propagate merchant edits to existing receipts that use this merchant.
      // This keeps list edits in sync with homepage/edit-receipt merchant name+logo.
      const matching = (receipts || []).filter(
        (r) => ((r.storeName || r.store_name || "").toString().trim().toLowerCase() === (item.name || "").toString().trim().toLowerCase())
      );
      if (matching.length > 0) {
        await Promise.all(
          matching.map((r) =>
            updateReceipt(r.id, {
              storeName: newName,
              store_image: keepLogo || r.store_image || "",
            })
          )
        );
      }

      const oldName = item.name;
      const { apiId: resolvedApiId, match: apiMatch } = await resolveMerchantApiIdForName(oldName);
      const apiId =
        (item.isApiItem ? getApiMerchantId({ id: item.apiId }) : null) ?? resolvedApiId;
      const logo = keepLogo || apiMatch?.store_image_url || "";

      if (apiId !== null) {
        const updateMerchantResult = await updateApiMerchant(apiId, newName, logo);
        if (!updateMerchantResult?.ok) throw new Error(updateMerchantResult?.error || "Failed to update merchant");
      } else {
        const addResult = await addApiMerchant(newName, logo);
        if (!addResult?.ok) throw new Error(addResult?.error || "Failed to update merchant");
      }

      deleteCustomMerchant(oldName);
      deleteCustomMerchant(newName);
      if (item.isReceiptItem && normalizeMatchKey(newName) !== normalizeMatchKey(oldName)) {
        hideMerchant(item.key);
      } else if ((item.isDefaultItem || item.isApiItem) && normalizeMatchKey(newName) !== normalizeMatchKey(oldName)) {
        hideMerchant(item.name);
      }
      if (keepLogo) saveMerchLogo(newName, keepLogo);
      await Promise.all([refreshData(), fetchApiMerchants()]);
      toast("success", "Merchant Updated");
    } catch (e) { toast("error", e.message || "Update failed."); }
    closeEdit();
    setPendingMerchantEdit(null);
  };

  // ── Merchant delete confirmed ──
  const doConfirmMerchantDelete = async () => {
    setShowMerchantDeleteConfirm(false);
    if (!pendingMerchantDelete) return;
    const item = pendingMerchantDelete;
    try {
      const matching = getReceiptsByMerchant(item.name);
      if (matching.length > 0) {
        await Promise.all(
          matching.map((r) => updateReceipt(r.id, { storeName: "Miscellaneous" }))
        );
      }
      const directApiId = item.isApiItem ? getApiMerchantId({ id: item.apiId }) : null;
      const { apiId: resolvedApiId } = await resolveMerchantApiIdForName(item.name);
      const apiId = directApiId ?? resolvedApiId;
      if (apiId !== null) {
        const deleteMerchantResult = await deleteApiMerchant(apiId);
        if (!deleteMerchantResult?.ok) throw new Error(deleteMerchantResult?.error || "Failed to delete merchant");
      }
      deleteCustomMerchant(item.name);
      if (item.isReceiptItem) {
        hideMerchant(item.key);
      } else if (item.isDefaultItem) {
        hideMerchant(item.name);
      }
      setIsDeleteSyncing(true);
      await Promise.all([refreshData(), fetchApiMerchants()]);
      toast("success", "Merchant Deleted");
    } catch (e) { toast("error", e.message || "Delete failed."); }
    finally { setIsDeleteSyncing(false); }
    setPendingMerchantDelete(null);
  };

  const applyCategoryEdit = async (item, newName) => {
    const currentName = item.name;
    // Resolve the API entry regardless of whether the item was flagged as isApiItem.
    // Items added via the old flow (addCustomCategory + addApiExpenseCategory) end up in
    // customCategories with isApiItem:false, but their API record still exists.
    const apiMatch = item.apiId
      ? (apiExpenseCategories || []).find(c => String(c.id) === String(item.apiId))
      : (apiExpenseCategories || []).find(c => normalizeMatchKey(c.expense_category_name) === normalizeMatchKey(currentName));

    if (item.isReceiptItem) {
      // Update all receipts that reference the old category name
      const matching = getReceiptsByCategory(currentName);
      await Promise.all(matching.map(r => updateReceipt(r.id, { expense_type: newName })));
      if (apiMatch?.id) {
        // Has API backing — update via API (keeps the record, just renames it)
        const updateCategoryResult = await updateApiExpenseCategory(String(apiMatch.id), newName);
        if (!updateCategoryResult?.ok) throw new Error(updateCategoryResult?.error || "Failed to update expense category");
        // Hide the old name so it no longer appears in the receipt-derived list
        hideCategory(currentName);
      } else {
        // No API backing — hide old receipt-derived entry, add new custom one
        hideCategory(item.key);
        addCustomCategory(newName);
      }
      toast("success", "Expense Category Updated");
      return;
    }
    if (item.isApiItem || apiMatch?.id) {
      // Direct API item or a custom item that has an API record
      const targetId = item.isApiItem ? item.apiId : apiMatch.id;
      const updateCategoryResult = await updateApiExpenseCategory(String(targetId), newName);
      if (!updateCategoryResult?.ok) throw new Error(updateCategoryResult?.error || "Failed to update expense category");
      // Remove the stale custom-categories entry so the renamed API item is the only copy
      if (!item.isApiItem) deleteCustomCategory(item.key);
      // Propagate name change to all receipts that referenced the old category
      const matchingCatReceipts = getReceiptsByCategory(currentName);
      if (matchingCatReceipts.length > 0) {
        await Promise.all(matchingCatReceipts.map(r => updateReceipt(r.id, { expense_type: newName })));
      }
      // Hide the old name so it no longer appears in the receipt-derived list or API list
      hideCategory(currentName);
      await Promise.all([silentRefreshData(0), fetchApiExpenseCategories()]);
      toast("success", "Expense Category Updated");
      return;
    }
    // Pure local-only custom category with no API record
    editCustomCategory(item.key, newName);
    toast("success", "Expense Category Updated");
  };

  const applyPaymentEdit = async (item, newName) => {
    const currentName = item.name;
    if (item.isReceiptItem) {
      const { issuer, last4 } = parsePaymentDisplay(newName);
      const { issuer: oldIssuer, last4: oldLast4 } = parsePaymentDisplay(currentName);
      const brand = getPaymentBrand(currentName, inferCardTypeFromPayment(currentName));
      // Broad match: exact display + same last4+issuer fallback (catches AddReceiptModal storage variants)
      const exactMatches = getReceiptsByPaymentDisplay(currentName);
      const exactIds = new Set(exactMatches.map(r => r.id));
      const additionalMatches = oldLast4
        ? (receipts || []).filter(r => {
            if (exactIds.has(r.id)) return false;
            const rLast4 = (r.last_4_digit_card || r.last4DigitCard || "").toString().trim();
            if (rLast4 !== oldLast4) return false;
            const rIssuer = (r.card_issuer_name || r.cardIssuerName || "").toString().trim().toLowerCase();
            const rTypeLower = (r.paymentType || r.payment_type || "").toString().replace(/\s*\*\d{3,4}$/, "").trim().toLowerCase();
            const oldIssuerLower = (oldIssuer || "").toLowerCase();
            return (oldIssuerLower && rIssuer === oldIssuerLower) ||
                   (oldIssuerLower && rTypeLower === oldIssuerLower);
          })
        : [];
      const matching = [...exactMatches, ...additionalMatches];
      await Promise.all(matching.map(r => updateReceipt(r.id, {
        paymentType: getPaymentBrand(currentName, r.paymentType || r.payment_type || ""),
        card_issuer_name: storedCardIssuerName(issuer, brand),
        last_4_digit_card: last4 || (r.last_4_digit_card || r.last4DigitCard || ""),
      })));
      savePayCard(newName, getPaymentBrand(currentName, inferCardTypeFromPayment(currentName)));
      hidePaymentMethod(item.key || currentName);
      deleteCustomPaymentMethod(currentName);
      deleteCustomPaymentMethod(newName);
      await Promise.all([refreshData(), fetchApiPaymentMethods()]);
      toast("success", "Payment Method Updated");
      return;
    }
    if (item.isApiItem) {
      const { issuer: newIssuer, last4: newL4 } = parsePaymentDisplay(newName);
      const newBrand = getPaymentBrand(newName, inferCardTypeFromPayment(newName));
      const existingApi = (apiPaymentMethods || []).find((p) => p.id === item.apiId);
      const updatePaymentResult = await updateApiPaymentMethod(
        item.apiId,
        {
          cardIssuerName: storedCardIssuerName(newIssuer, newBrand),
          cardTypeBrand: newBrand,
          last4: newL4,
        },
        existingApi?.icon_image || "",
        existingApi?.default_payment_category || ""
      );
      if (!updatePaymentResult?.ok) throw new Error(updatePaymentResult?.error || "Failed to update payment method");
      const matchingReceipts = getReceiptsByPaymentDisplay(item.name);
      if (matchingReceipts.length > 0) {
        await Promise.all(matchingReceipts.map(r => updateReceipt(r.id, {
          paymentType: newBrand || newIssuer,
          card_issuer_name: storedCardIssuerName(newIssuer, newBrand),
          last_4_digit_card: newL4 || r.last_4_digit_card || "",
        })));
      }
      savePayCard(newName, getPaymentBrand(item.name, newCardType || ""));
      if (normalizeMatchKey(currentName) !== normalizeMatchKey(newName)) {
        hidePaymentMethod(currentName);
      }
      await Promise.all([refreshData(), fetchApiPaymentMethods()]);
      toast("success", "Payment Method Updated");
      return;
    }
    if (item.isDefaultItem) {
      hidePaymentMethod(currentName);
      deleteCustomPaymentMethod(currentName);
      deleteCustomPaymentMethod(newName);
    } else {
      editCustomPaymentMethod(item.key, newName);
      if (normalizeMatchKey(currentName) !== normalizeMatchKey(newName)) {
        hidePaymentMethod(currentName);
      }
    }
    savePayCard(newName, getPaymentBrand(item.key, inferCardTypeFromPayment(item.key)));
    await Promise.all([refreshData(), fetchApiPaymentMethods()]);
    toast("success", "Payment Method Updated");
  };

  const doConfirmCategoryEdit = async () => {
    setShowCategoryEditConfirm(false);
    if (!pendingCategoryEdit) return;
    try {
      await applyCategoryEdit(pendingCategoryEdit.item, pendingCategoryEdit.newName);
      // Re-sync the API list so any stale backend entries are replaced with the latest data
      await fetchApiExpenseCategories();
    } catch (e) {
      toast("error", e.message || "Update failed.");
    } finally {
      setPendingCategoryEdit(null);
      closeEdit();
    }
  };

  const doConfirmPaymentEdit = async () => {
    setShowPaymentEditConfirm(false);
    if (!pendingPaymentEdit) return;
    try {
      if (typeof pendingPaymentEdit.fn === "function") {
        // Modal-form edit path — execute the stored callback
        await pendingPaymentEdit.fn();
      } else {
        // Inline edit path
        await applyPaymentEdit(pendingPaymentEdit.item, pendingPaymentEdit.newName);
        closeEdit();
      }
    } catch (e) {
      toast("error", e.message || "Update failed.");
    } finally {
      setPendingPaymentEdit(null);
    }
  };

  const applyCategoryDelete = async (item) => {
    // Resolve the API record by apiId (preferred) or by name match
    const apiCategoryMatch = item.apiId
      ? (apiExpenseCategories || []).find(c => String(c.id) === String(item.apiId))
      : (apiExpenseCategories || []).find(c => normalizeMatchKey(c.expense_category_name) === normalizeMatchKey(item.name));
    const apiId = apiCategoryMatch?.id ?? null;

    // Clear the category from every receipt that references it
    const matching = getReceiptsByCategory(item.name || "");
    if (matching.length > 0) {
      await Promise.all(matching.map(r => updateReceipt(r.id, { expense_type: "" })));
    }

    // Remove from local state
    if (item.isReceiptItem) {
      hideCategory(item.key);
    } else if (!item.isApiItem) {
      deleteCustomCategory(item.key);
    }

    // Delete from the API when we have a confirmed API id
    if (apiId) {
      const deleteCategoryResult = await deleteApiExpenseCategory(String(apiId));
      if (!deleteCategoryResult?.ok) throw new Error(deleteCategoryResult?.error || "Failed to delete expense category");
    }

    setIsDeleteSyncing(true);
    // Sequential refresh — avoids concurrent setApiExpenseCategories calls racing each other
    await refreshData();
    toast("success", "Expense Category Deleted");
  };

  const applyPaymentDelete = async (item) => {
    console.log(item, "item")
    if (isCashMethod(item.name)) {
      toast("error", "Cash payment method cannot be deleted");
      return;
    }
    // Step 1 — set payment method to Cash on every matching receipt
    const matching = getReceiptsByPaymentDisplay(item.name || "");
    if (matching.length > 0) {
      await Promise.all(
        matching.map(r =>
          updateReceipt(r.id, { paymentType: "Cash", card_issuer_name: "", last_4_digit_card: "" })
        )
      );
    }
    console.log("jdhhj step22")
    // Step 2 — resolve numeric ID (from item.apiId set by buildAllItems, or by name-match in API list)
    // The GET /getPaymentMethodv1 response includes an `id` field per the Swagger schema.
    const directNameMatch = (apiPaymentMethods || []).find(
      (p) => normalizeMatchKey(p.card_number) === normalizeMatchKey(item.name)
    );
    const targetApiId =
      (item.isApiItem && item.apiId != null && item.apiId !== 0 ? item.apiId : null) ||
      (directNameMatch?.id && directNameMatch.id !== 0 ? directNameMatch.id : null) ||
      getApiEntityId(directNameMatch) ||
      getApiEntityId(resolvePaymentApiMatches(item)[0]) ||
      null;
    console.log("[applyPaymentDelete] targetApiId:", targetApiId, "item:", item.name);
    // Step 3 — call the delete API; deleteApiPaymentMethod also checks sessionStorage cache
    const deletePaymentResult = await deleteApiPaymentMethod(targetApiId, item.name);
    if (!deletePaymentResult?.ok) {
      // Non-fatal — hide locally regardless so the UI always updates
      console.warn("[applyPaymentDelete] API delete failed (non-fatal):", deletePaymentResult?.error);
    }
    
    // Step 4 — hide & remove from local state.
    // Always delete by item.name (the payment string like "Diners Club *1111"), not item.key
    // ("api_28"), because customPaymentMethods is a plain string array keyed by name.
    hidePaymentMethod(item.name);
    deleteCustomPaymentMethod(item.name);
    // Step 5 — refresh
    setIsDeleteSyncing(true);
    await Promise.all([refreshData(), fetchApiPaymentMethods()]);
    toast("success", "Payment Method Deleted");
  };

  const doConfirmCategoryDelete = async () => {
    setShowCategoryDeleteConfirm(false);
    if (!pendingCategoryDelete) return;
    try {
      await applyCategoryDelete(pendingCategoryDelete);
    } catch (e) {
      toast("error", e.message || "Delete failed.");
    } finally {
      setPendingCategoryDelete(null);
      setIsDeleteSyncing(false);
    }
  };

  const doConfirmPaymentDelete = async () => {
    setShowPaymentDeleteConfirm(false);
    if (!pendingPaymentDelete) return;

    try {
      console.log(pendingPaymentDelete)
      await applyPaymentDelete(pendingPaymentDelete);
    } catch (e) {
      toast("error", e.message || "Delete failed.");
    } finally {
      setPendingPaymentDelete(null);
      setIsDeleteSyncing(false);
    }
  };

  // ── SAVE EDIT ──
  const handleSaveEdit = async (item) => {
    const newName = editVal.trim();
    if (!newName) return;
    if (containsEmoji(newName)) return toast("error", "Emojis are not allowed in names. Please use plain text.");
    if (type === "payments" && (item.name || "").trim().toLowerCase() === "cash") {
      toast("error", "Cash payment method cannot be edited");
      closeEdit();
      return;
    }
    if (type === "payments" && isCashMethod(newName) && !isCashMethod(item.name)) {
      toast("error", "Cash already exists and cannot be created again");
      closeEdit();
      return;
    }
    if (type === "payments") {
      const fallbackBrand = getPaymentBrand(item.name, newCardType || "");
      const newSignature = getPaymentSignature(newName, fallbackBrand);
      const editedLast4Inline = (parsePaymentDisplay(item.name).last4 || "").trim();
      const duplicatePayment = buildAllItems().some((other) => {
        if (other.key === item.key) return false;
        // Receipt items for the same physical card (same last4) are not true duplicates
        if (other.isReceiptItem) {
          const oLast4 = (parsePaymentDisplay(other.name).last4 || "").trim();
          if (editedLast4Inline && oLast4 && editedLast4Inline === oLast4) return false;
        }
        const sig = getPaymentSignature(other.name);
        return sig && sig === newSignature;
      });
      if (duplicatePayment) {
        toast("error", "Payment Method already exists");
        closeEdit();
        return;
      }
    }
    const newLogoUrl = editLogoSel !== null ? (editLogoOpts[editLogoSel]?.displayUrl || editLogoOpts[editLogoSel]?.storeUrl || null) : null;
    const keepLogo   = newLogoUrl || editOrigLogo; // use new if picked, else keep original

    if (type === "taxes") {
      const n = editTaxVal.tax_name.trim(), r = editTaxVal.tax_rate.toString().trim(), num = editTaxVal.tax_number.trim();
      if (!n) return toast("error", "Please enter Tax Name");
      if (n.length > TAX_NAME_MAX) return toast("error", `Tax Name cannot exceed ${TAX_NAME_MAX} characters`);
      if (!r) return toast("error", "Please enter Tax Rate");
      if (parseFloat(r) > TAX_RATE_MAX || parseFloat(r) < 0) {
        return toast("error", `Tax Rate must be between 0 and ${TAX_RATE_MAX}`);
      }
      if (hasMoreThan3Decimals(r)) {
        return toast("error", "Tax Rate can have a maximum of 3 decimal places (e.g. 10.894%)");
      }
      if (isBlockedTaxRateInput(r)) {
        return toast("error", "Tax Rate cannot be 99.999 or 999");
      }
      if (num.length > TAX_NUMBER_MAX) return toast("error", `Tax Number cannot exceed ${TAX_NUMBER_MAX} characters`);
      const originalTax = (taxData || []).find((t) => t.id === editKey);
      const duplicateTaxName = (taxData || []).some(
        (tax) => tax.id !== editKey && (tax.tax_name || "").toLowerCase() === n.toLowerCase()
      );
      if (duplicateTaxName) return toast("error", "Tax Type already exists");
      const rateChanged = taxRatesDiffer(originalTax?.tax_rate, r);
      if (rateChanged) {
        setPendingTaxRateEdit({
          tax: originalTax,
          nextName: n,
          nextRate: r,
          nextNumber: editTaxVal.tax_number.trim(),
        });
        setShowTaxRateChangeWarning(true);
        return;
      }
      try {
        await updateTax({
          ...originalTax,
          tax_name: n,
          tax_rate: r,
          tax_number: editTaxVal.tax_number.trim(),
          is_default_tax: parseInt(originalTax?.is_default_tax) || 0,
          is_tips: parseInt(originalTax?.is_tips) || 0,
        });
        await propagateTaxNameChangeToReceipts({
          receipts,
          taxId: originalTax.id,
          oldName: originalTax.tax_name,
          newName: n,
          updateReceipt,
        });
        toast("success", "Tax Type Updated");
        setEditTaxKey(null);
        clearEditTaxRateLimitAlert();
        setEditTaxRateFocused(false);
      } catch (e) {
        toast("error", e.message || "Failed.");
      }
      return;
    }

    // Merchants always require duplicate check + confirmation popup
    if (type === "merchants") {
      const allExisting = buildAllItems();
      if (allExisting.some(i => i.name.toLowerCase() === newName.toLowerCase() && i.key !== item.key)) {
        return toast("error", "Merchant already exists");
      }
      setPendingMerchantEdit({ item, newName, keepLogo });
      setShowMerchantEditConfirm(true);
      return;
    }

    if (type === "categories") {
      if (buildAllItems().some(i => i.name.toLowerCase() === newName.toLowerCase() && i.key !== item.key)) {
        return toast("error", "Expense Category already exists");
      }
      setPendingCategoryEdit({ item, newName });
      setShowCategoryEditConfirm(true);
      return;
    }
    if (type === "payments") {
      setPendingPaymentEdit({ item, newName });
      setShowPaymentEditConfirm(true);
      return;
    }
  };

  // ── DELETE ──
  const handleDelete = async (item) => {
    if (type === "taxes") {
      const targetTax = (taxData || []).find((t) => t.id === item.key);
      const hasAssociation = (receipts || []).some((r) =>
        (Array.isArray(r.receipt_tax_values) ? r.receipt_tax_values : []).some((t) => {
          const byId = String(t?.fk_tax_id || "") === String(item.key);
          const byName = (t?.tax_name || "").toString().trim().toLowerCase() === (targetTax?.tax_name || "").toString().trim().toLowerCase();
          return byId || byName;
        })
      );
      if (hasAssociation) {
        setShowTaxDeleteBlockedMsg(true);
        return;
      }
      setPendingTaxDeleteId(item.key);
      setShowTaxDeleteConfirm(true);
      return;
    }

    // Merchants: block Miscellaneous deletion + require confirmation
    if (type === "merchants") {
      if ((item.name || "").toLowerCase() === "miscellaneous") {
        toast("error", '"Miscellaneous" cannot be deleted.');
        return;
      }
      setPendingMerchantDelete(item);
      setShowMerchantDeleteConfirm(true);
      return;
    }

    if (type === "categories") {
      setPendingCategoryDelete(item);
      setShowCategoryDeleteConfirm(true);
      return;
    }
    if (type === "payments") {
      setPendingPaymentDelete(item);
      setShowPaymentDeleteConfirm(true);
      return;
    }
    try {
      const matching = getReceiptsByMerchant(item.name);
      if (matching.length > 0) {
        await Promise.all(matching.map((r) => updateReceipt(r.id, { storeName: "Miscellaneous" })));
      }
      deleteCustomMerchant(item.key);
      toast("success", "Merchant Deleted");
    } catch (e) { toast("error", e.message || "Delete failed."); }
  };

  const resetTaxEditForm = () => {
    setEditTaxKey(null);
    clearEditTaxRateLimitAlert();
    setEditTaxNameOverflow(false);
    setEditTaxNumberOverflow(false);
    setEditTaxRateFocused(false);
  };

  const saveTaxTypeWithoutRateChange = async (originalTax, n, r, num) => {
    await updateTax({
      ...originalTax,
      tax_name: n,
      tax_rate: r,
      tax_number: num,
      is_default_tax: parseInt(originalTax?.is_default_tax) || 0,
      is_tips: parseInt(originalTax?.is_tips) || 0,
    });
    await propagateTaxNameChangeToReceipts({
      receipts,
      taxId: originalTax.id,
      oldName: originalTax.tax_name,
      newName: n,
      updateReceipt,
    });
    toast("success", "Tax Type Updated");
    resetTaxEditForm();
  };

  const confirmTaxRateChange = async () => {
    if (!pendingTaxRateEdit?.tax) return;
    const targetTax = pendingTaxRateEdit.tax;
    const { nextName, nextRate, nextNumber } = pendingTaxRateEdit;
    try {
      await propagateTaxRateChangeToReceipts({
        receipts,
        taxId: targetTax.id,
        oldRate: targetTax.tax_rate,
        oldName: targetTax.tax_name,
        updateReceipt,
      });
      await updateTax({
        ...targetTax,
        tax_name: nextName,
        tax_rate: nextRate,
        tax_number: nextNumber || "",
        is_default_tax: parseInt(targetTax?.is_default_tax) || 0,
        is_tips: parseInt(targetTax?.is_tips) || 0,
      });
      if (
        (nextName || "").trim().toLowerCase() !==
        (targetTax.tax_name || "").trim().toLowerCase()
      ) {
        await propagateTaxNameChangeToReceipts({
          receipts,
          taxId: targetTax.id,
          oldName: targetTax.tax_name,
          newName: nextName,
          updateReceipt,
        });
      }
      toast("success", "Tax Type Updated");
      resetTaxEditForm();
    } catch (e) {
      toast("error", e.message || "Failed.");
    } finally {
      setShowTaxRateChangeWarning(false);
      setPendingTaxRateEdit(null);
    }
  };

  const handleAddNewTaxTypeFromRateWarning = () => {
    if (!pendingTaxRateEdit?.tax) return;
    const baseName = pendingTaxRateEdit.tax.tax_name || "";
    const incremented = buildIncrementedTaxName(
      baseName,
      (taxData || []).map((t) => t.tax_name),
    );
    setShowTaxRateChangeWarning(false);
    setPendingTaxRateEdit(null);
    setEditTaxKey(null);
    setShowAddForm(true);
    setAddTaxVal({
      tax_name: incremented,
      tax_rate: pendingTaxRateEdit.nextRate,
      tax_number:
        pendingTaxRateEdit.nextNumber ||
        pendingTaxRateEdit.tax.tax_number ||
        "",
    });
    clearEditTaxRateLimitAlert();
    setEditTaxRateFocused(false);
  };

  // Build unified list (receipt-derived + custom + API, no dupes, no "Custom" label)
  const buildAllItems = () => {
    if (type === "merchants") {
      const rItems = receiptMerchWImgRaw
        .filter(
          (m) =>
            !isMerchantHidden(m.name) &&
            !isMerchantSupersededByApi(m.name, apiMerchants)
        )
        .map(m => ({
          key: m.name, name: m.name,
          logo: merchLogos[m.name] || m.image || null,
          isReceiptItem: true,
          isApiItem: false,
        }));
      const rKeys = new Set(rItems.map(m => m.name.toLowerCase()));
      // API merchants are the source of truth (GET /userstore/getStorev1)
      const apiItems = (apiMerchants || [])
        .filter(m => m.store_name && !rKeys.has((m.store_name || "").toLowerCase()))
        .map(m => {
          const apiId = m?.id ?? m?.store_id ?? m?.fk_store_id ?? null;
          return {
            key: `api_${apiId ?? m.store_name}`,
            name: m.store_name,
            logo: m.store_image_url || null,
            isReceiptItem: false,
            apiId,
            isApiItem: true,
          };
        });
      const apiNameKeys = new Set(apiItems.map((m) => m.name.toLowerCase()));
      const cItems = customMerchants
        .filter(m => !rKeys.has(m.toLowerCase()) && !apiNameKeys.has(m.toLowerCase()) && !isMerchantHidden(m))
        .map(m => ({ key: m, name: m, logo: merchLogos[m] || null, isReceiptItem: false, isApiItem: false }));
      const allWithApi = [...rItems, ...apiItems, ...cItems];
      const existingAfterApi = new Set(allWithApi.map((m) => (m.name || "").toLowerCase()));
      const defaultItems = SETTINGS_DEFAULT_MERCHANTS_WITH_LOGOS
        .filter(
          (m) =>
            m.name &&
            !existingAfterApi.has((m.name || "").toLowerCase()) &&
            !isMerchantHidden(m.name) &&
            !isMerchantSupersededByApi(m.name, apiMerchants)
        )
        .map((m) => ({
          key: `default_${m.name}`,
          name: m.name,
          logo: m.image || null,
          isReceiptItem: false,
          isApiItem: false,
          isDefaultItem: true,
        }));
      return [...allWithApi, ...defaultItems];
    }
    if (type === "categories") {
      // API expense categories are the source of truth (GET /userexpensecategory/getExpenseCategoryv1)
      const apiItems = (apiExpenseCategories || [])
        .map((c) => {
          const categoryName = getExpenseCategoryRecordName(c);
          if (!categoryName || isCategoryHidden(categoryName)) return null;
          const apiId = getExpenseCategoryRecordId(c);
          return {
            key: apiId != null ? `api_${apiId}` : `api_name_${categoryName.toLowerCase()}`,
            name: categoryName,
            logo: null,
            isReceiptItem: false,
            isApiItem: true,
            apiId,
          };
        })
        .filter(Boolean);
      const apiNameKeys = new Set(apiItems.map((item) => (item.name || "").toLowerCase()));
      const rItems = receiptCategoriesRaw
        .filter(
          (c) =>
            c &&
            !apiNameKeys.has((c || "").toLowerCase()) &&
            !isCategoryHidden(c)
        )
        .map((c) => ({ key: c, name: c, logo: null, isReceiptItem: true, isApiItem: false }));
      const rKeys = new Set(rItems.map((c) => c.name.toLowerCase()));
      const cItems = customCategories
        .filter(
          (c) =>
            !apiNameKeys.has((c || "").toLowerCase()) &&
            !rKeys.has((c || "").toLowerCase()) &&
            !isCategoryHidden(c)
        )
        .map((c) => ({ key: c, name: c, logo: null, isReceiptItem: false, isApiItem: false }));
      return [...apiItems, ...rItems, ...cItems];
    }
    if (type === "payments") {
      const resolvePaymentLogoFromApi = (m, displayName) => {
        const storedLogo = (m?.icon_image || "").trim();
        if (storedLogo.startsWith("/payment-logos/") || /^https?:\/\//i.test(storedLogo)) {
          return storedLogo;
        }
        const brandFromApiType = cardTypeIntToBrand(m?.card_type);
        if (brandFromApiType) {
          const ct = PAYMENT_CARD_TYPES.find((c) => c.name === brandFromApiType);
          return ct ? ct.logo : getPayLogoResolved(displayName);
        }
        return getPayLogoResolved(displayName);
      };

      if (PAYMENT_METHODS_API_ONLY) {
        return (apiPaymentMethods || [])
          .filter(isPaymentApiRecord)
          .map((m, index) => {
            const apiId = getApiEntityId(m);
            const name = getApiPaymentMethodDisplayName(m);
            if (!name || isPaymentMethodHidden(name)) return null;
            return {
              key: apiId != null ? `api_${apiId}` : `api_idx_${index}`,
              name,
              logo: resolvePaymentLogoFromApi(m, name),
              isReceiptItem: false,
              isApiItem: true,
              apiId,
            };
          })
          .filter(Boolean);
      }

      const buildPaymentItemFromLabel = (label) => {
        if (!label || isCashPaymentVariant(label)) return null;
        const labelKey = normalizeMatchKey(label);
        const apiRec = (apiPaymentMethods || []).find((m) =>
          apiPaymentMethodMatchesLabel(m, label)
        );
        const apiId = apiRec ? getApiEntityId(apiRec) : null;
        if (apiId != null) {
          return {
            key: `api_${apiId}`,
            name: label,
            logo: resolvePaymentLogoFromApi(apiRec, label),
            isReceiptItem: false,
            isApiItem: true,
            apiId,
          };
        }
        const isFromReceipt = (receiptPaymentsRaw || []).some(
          (p) => normalizeMatchKey(p) === labelKey && !isPaymentMethodHidden(p)
        );
        return {
          key: label,
          name: label,
          logo: getPayLogoResolved(label),
          isReceiptItem: isFromReceipt,
          isApiItem: false,
        };
      };

      // Same canonical labels as Filter / Add Receipt / Edit Receipt (API-backed).
      const canonicalLabels = mergePaymentMethodLabels({
        baseLabels: paymentMethods || [],
        apiPaymentMethods: apiPaymentMethods || [],
        isHidden: isPaymentMethodHidden,
      });
      return canonicalLabels.map(buildPaymentItemFromLabel).filter(Boolean);
    }
    return [];
  };

  const taxItems = type === "taxes"
    ? taxData
        .filter(t => {
          const name = (t.tax_name || "").toLowerCase();
          return name !== "tip" && name.includes(search.toLowerCase());
        })
        .sort((a, b) => (a.tax_name || "").toLowerCase().localeCompare((b.tax_name || "").toLowerCase()))
    : [];
  const allItems = type !== "taxes"
    ? buildAllItems()
        .filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) =>
          (a.name || "").toLowerCase().localeCompare((b.name || "").toLowerCase())
        )
    : [];

  const mInput = "flex-1 min-w-0 bg-white border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all";
  const taxRateInput = "w-full bg-white border border-gray-200 text-gray-900 text-sm rounded-xl px-3 py-2 placeholder-gray-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/10 transition-all";
  const showAddTaxRateSuffix = addTaxVal.tax_rate.toString().trim() !== "" && !addTaxRateFocused;
  const showEditTaxRateSuffix = editTaxVal.tax_rate.toString().trim() !== "" && !editTaxRateFocused;
  const Btn = ({ color, onClick, children }) => (
    <button type="button" onClick={onClick} style={{ margin: 0, padding: 0, width: 28, height: 28, flexShrink: 0 }}
      className={`flex items-center justify-center rounded-lg text-white text-xs transition-all ${color}`}>
      {children}
    </button>
  );

  return (
    <>
    <div className="max-w-lg flex flex-col gap-4">

      {/* ── Add action (top-right) ── */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => {
            if (showAddForm) {
              resetAddFormState();
            }
            setShowAddForm((prev) => !prev); setPayEditMode(null); setEditTaxKey(null); clearEditTaxRateLimitAlert(); setEditTaxRateFocused(false);
          }}
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold transition-all ${
            showAddForm
              ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
              : `${colors.btn} text-white`
          }`}
        >
          <Plus size={14} />
          {showAddForm ? "Close" : "Add"}
        </button>
      </div>

      {/* ── Add form ── */}
      {showAddForm && (
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">

        {type === "taxes" && (
          <>
            <div className="flex gap-2">
              <input className={mInput} placeholder="Enter Tax Name (e.g. GST, HST, VAT)" value={addTaxVal.tax_name}
                onChange={e => {
                  const v = e.target.value;
                  if (v.length > TAX_NAME_MAX) { setAddTaxNameOverflow(true); return; }
                  setAddTaxNameOverflow(false);
                  setAddTaxVal(p => ({ ...p, tax_name: v }));
                }} />
              <div className="relative w-[72px] flex-shrink-0">
                  <input
                    className={`${taxRateInput}${showAddTaxRateSuffix ? " pr-6" : ""} placeholder:text-slate-400`}
                    placeholder="Rate (%)"
                    value={addTaxVal.tax_rate}
                    onKeyDown={createTaxRateKeyDownHandler(addTaxVal.tax_rate, showAddTaxRateLimitAlert)}
                    onFocus={() => setAddTaxRateFocused(true)}
                    onBlur={() => setAddTaxRateFocused(false)}
                    onChange={e => {
                      const parsed = parseTaxRateInput(e.target.value);
                      if (parsed.rejected) { showAddTaxRateLimitAlert(parsed.message); return; }
                      setAddTaxVal(p => ({ ...p, tax_rate: parsed.value }));
                    }}
                  />
                  {showAddTaxRateSuffix && (
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">%</span>
                  )}
              </div>
            </div>
            {addTaxNameOverflow && <p className="text-xs text-red-500 -mt-1">Character limit of {TAX_NAME_MAX} exceeded</p>}
            {!!addInlineTaxDuplicateMsg && <p className="text-xs text-red-600 -mt-1">{addInlineTaxDuplicateMsg}</p>}
            {addTaxRateLimitAlert && (
              <p className="text-xs text-red-600 font-medium -mt-1">{addTaxRateLimitAlert}</p>
            )}
            <div className="flex flex-col gap-1">
              <div className="flex gap-2">
                <input className={mInput} placeholder="Tax Number" value={addTaxVal.tax_number}
                  onChange={e => {
                    const v = e.target.value;
                    if (v.length > TAX_NUMBER_MAX) { setAddTaxNumberOverflow(true); return; }
                    setAddTaxNumberOverflow(false);
                    setAddTaxVal(p => ({ ...p, tax_number: v }));
                  }} />
                <div className="w-[72px] flex-shrink-0" />
              </div>
              <p className="mt-1 text-xs text-slate-400">* Required</p>
              {addTaxNumberOverflow && <p className="text-xs text-red-500 -mt-1">Character limit of {TAX_NUMBER_MAX} exceeded</p>}
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={handleAdd} disabled={!!addInlineTaxDuplicateMsg} className={`px-4 py-2.5 rounded-xl text-white text-sm font-semibold flex-shrink-0 ${colors.btn} disabled:opacity-50 disabled:cursor-not-allowed`}>Add</button>
            </div>
          </>
        )}

        {type === "merchants" && (
          <>
            <div className="flex gap-2">
              <input className={mInput} placeholder="New merchant name…" value={newMerchantName}
                onChange={e => { setNewMerchantName(e.target.value); setAddLogoOpts([]); setAddLogoSel(null); }}
                onKeyDown={e => e.key === "Enter" && handleAdd()} />
              <button type="button"
                onClick={() => doFetch(newMerchantName, setIsFetchAddLogo, setAddLogoOpts, setAddLogoSel)}
                disabled={!newMerchantName.trim() || isFetchAddLogo}
                className="px-3 py-2 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-600 text-sm font-medium flex-shrink-0 disabled:opacity-40 transition-all flex items-center gap-1.5">
                {isFetchAddLogo
                  ? <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                  : <Search size={14} />} Logo
              </button>
              <button type="button" onClick={handleAdd}  className={`px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0 ${colors.btn}`}>Add</button>
            </div>
            <LogoGrid options={addLogoOpts} selectedIndex={addLogoSel} onSelect={setAddLogoSel} />
          </>
        )}

        {type === "payments" && (
          <>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Select Card Type</p>
            <div className="grid grid-cols-3 gap-2">
              {PAYMENT_CARD_TYPES.map(ct => (
                <button key={ct.name} type="button"
                  style={{ margin: 0, padding: 0 }}
                  onClick={() => setNewCardType(prev => prev === ct.name ? "" : ct.name)}
                  className={`flex flex-col items-center gap-1 py-2 px-1 rounded-xl border-2 transition-all cursor-pointer ${newCardType === ct.name ? "border-blue-500 bg-blue-50 ring-2 ring-blue-200" : "border-slate-200 bg-white hover:border-blue-300"}`}>
                  <img src={ct.logo} alt={ct.name} style={{ height: 30, width: 52, objectFit: "contain", display: "block", margin: 0, padding: 0 }} />
                  <span className="text-[10px] font-medium text-slate-600 text-center leading-tight block">{ct.name}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input className={mInput} placeholder="Card issuer / bank name (optional)" value={newIssuerName} onChange={e => setNewIssuerName(e.target.value)} />
              <input className={`${mInput} max-w-[110px]`} placeholder="Last 4 digits" value={newLast4} maxLength={4}
                onChange={e => setNewLast4(e.target.value.replace(/\D/g, "").slice(0, 4))} />
            </div>
            {/* Personal / Business toggle */}
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Default Type</p>
              <div className="flex rounded-xl border border-slate-200 overflow-hidden">
                {["Personal", "Business"].map(opt => (
                  <button key={opt} type="button"
                    onClick={() => setNewExpenseType(opt)}
                    className={`px-4 py-1.5 text-xs font-semibold transition-all ${newExpenseType === opt ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}>
                    {opt}
                  </button>
                ))}
              </div>
            </div>
            <button type="button" onClick={handleAdd}  className={`px-4 py-2 rounded-xl text-white text-sm font-semibold self-start ${colors.btn}`}>{payEditMode ? "Save" : "Add"}</button>
          </>
        )}

        {type === "categories" && (
          <div className="flex gap-2">
            <input className={mInput} placeholder={cfg.addPlaceholder} value={addVal} onChange={e => setAddVal(stripEmoji(e.target.value))} onKeyDown={e => e.key === "Enter" && handleAdd()} />
            <button type="button" onClick={handleAdd}  className={`px-4 py-2 rounded-xl text-white text-sm font-semibold flex-shrink-0 ${colors.btn}`}>Add</button>
          </div>
        )}

        <AnimatePresence>
          {msg && (
            <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className={`flex items-center gap-2 text-xs px-3 py-2 rounded-xl ${msg.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
              {msg.type === "success" ? <CheckCircle size={13}/> : <AlertCircle size={13}/>} {msg.text}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      )}

      {/* ── Search ── */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input className="w-full bg-white border border-slate-200 text-sm text-slate-900 rounded-xl pl-8 pr-8 py-2.5 placeholder-slate-400 focus:outline-none focus:border-blue-400 focus:ring-4 focus:ring-blue-500/10 transition-all shadow-sm"
          placeholder="Search…" value={search} onChange={e => setSearch(e.target.value)} />
        {search && <button type="button" onClick={() => setSearch("")}  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 w-5 h-5 flex items-center justify-center"><X size={13}/></button>}
      </div>

      {/* ── List ── */}
      <div className="flex flex-col gap-1.5">
        {isDeleteSyncing && (
          <div className="flex items-center gap-2 text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mb-1">
            <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Syncing latest data...
          </div>
        )}

        {/* Taxes */}
        {type === "taxes" && (
          taxItems.length === 0
            ? <p className="text-sm text-slate-400 text-center py-8">No tax types yet.</p>
            : [...taxItems].sort((a, b) => (a.tax_name || "").localeCompare(b.tax_name || "")).map(tax => {
                const isEd = editTaxKey === tax.id;
                const inlineTaxDuplicateMsg = isEd ? getInlineTaxDuplicateMessage(tax.id, editTaxVal.tax_name) : "";
                return (
                  <div key={tax.id} className="flex items-center justify-between px-4 py-3 bg-white border border-slate-200/80 rounded-xl shadow-sm hover:shadow-md transition-all">
                    {isEd ? (
                      <div className="flex flex-col gap-2 w-full">
                        <div className="flex gap-2">
                          <input className={mInput} value={editTaxVal.tax_name}
                            onChange={e => {
                              const v = e.target.value;
                              if (v.length > TAX_NAME_MAX) { setEditTaxNameOverflow(true); return; }
                              setEditTaxNameOverflow(false);
                              setEditTaxVal(p => ({ ...p, tax_name: v }));
                            }} placeholder="Tax Name (e.g. GST)" />
                          <div className="relative w-[72px] flex-shrink-0">
                              <input
                                className={`${taxRateInput}${showEditTaxRateSuffix ? " pr-6" : ""} placeholder:text-slate-400`}
                                value={editTaxVal.tax_rate}
                                onKeyDown={createTaxRateKeyDownHandler(editTaxVal.tax_rate, showEditTaxRateLimitAlert)}
                                onFocus={() => setEditTaxRateFocused(true)}
                                onBlur={() => setEditTaxRateFocused(false)}
                                onChange={e => {
                                  const parsed = parseTaxRateInput(e.target.value);
                                  if (parsed.rejected) { showEditTaxRateLimitAlert(parsed.message); return; }
                                  setEditTaxVal(p => ({ ...p, tax_rate: parsed.value }));
                                }}
                                placeholder="Rate (%)"
                              />
                              {showEditTaxRateSuffix && (
                                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 text-sm pointer-events-none">%</span>
                              )}
                          </div>
                        </div>
                        {editTaxNameOverflow && <p className="text-xs text-red-500 -mt-1">Character limit of {TAX_NAME_MAX} exceeded</p>}
                        {!!inlineTaxDuplicateMsg && <p className="text-xs text-red-600 -mt-1">{inlineTaxDuplicateMsg}</p>}
                        {editTaxRateLimitAlert && (
                          <p className="text-xs text-red-600 font-medium -mt-1">{editTaxRateLimitAlert}</p>
                        )}
                        <div className="flex gap-2 items-start">
                          <div className="flex-1">
                            <div className="flex gap-2">
                              <input className={mInput} value={editTaxVal.tax_number}
                                onChange={e => {
                                  const v = e.target.value;
                                  if (v.length > TAX_NUMBER_MAX) { setEditTaxNumberOverflow(true); return; }
                                  setEditTaxNumberOverflow(false);
                                  setEditTaxVal(p => ({ ...p, tax_number: v }));
                                }} placeholder="Tax Number" />
                              <div className="w-[72px] flex-shrink-0" />
                            </div>
                            <p className="mt-1 text-xs text-slate-400">* Required</p>
                            {editTaxNumberOverflow && <p className="text-xs text-red-500 -mt-1">Character limit of {TAX_NUMBER_MAX} exceeded</p>}
                          </div>
                          <button type="button" disabled={!!inlineTaxDuplicateMsg} onClick={async () => {
                            const n = editTaxVal.tax_name.trim(), r = editTaxVal.tax_rate.toString().trim(), num = editTaxVal.tax_number.trim();
                            if (!n) return toast("error", "Please enter Tax Name");
                            if (n.length > TAX_NAME_MAX) return toast("error", `Tax Name cannot exceed ${TAX_NAME_MAX} characters`);
                            if (!r) return toast("error", "Please enter Tax Rate");
                            if (parseFloat(r) > TAX_RATE_MAX || parseFloat(r) < 0) {
                              return toast("error", `Tax Rate must be between 0 and ${TAX_RATE_MAX}`);
                            }
                            if (hasMoreThan3Decimals(r)) {
                              return toast("error", "Tax Rate can have a maximum of 3 decimal places (e.g. 10.894%)");
                            }
                            if (isBlockedTaxRateInput(r)) {
                              return toast("error", "Tax Rate cannot be 99.999 or 999");
                            }
                            if (num.length > TAX_NUMBER_MAX) return toast("error", `Tax Number cannot exceed ${TAX_NUMBER_MAX} characters`);
                            const duplicateTaxName = (taxData || []).some(
                              (t) => t.id !== editTaxKey && (t.tax_name || "").toLowerCase() === n.toLowerCase()
                            );
                            if (duplicateTaxName) return toast("error", "Tax Type already exists");
                            const originalTax = (taxData || []).find((t) => t.id === editTaxKey);
                            const rateChanged = taxRatesDiffer(originalTax?.tax_rate, r);
                            if (rateChanged) {
                              setPendingTaxRateEdit({
                                tax: originalTax,
                                nextName: n,
                                nextRate: r,
                                nextNumber: num,
                              });
                              setShowTaxRateChangeWarning(true);
                              return;
                            }
                            try {
                              await saveTaxTypeWithoutRateChange(originalTax, n, r, num);
                            } catch (e) {
                              toast("error", e.message || "Failed.");
                            }
                          }} className="px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg flex-shrink-0">Save</button>
                          <button type="button" onClick={() => { setEditTaxKey(null); clearEditTaxRateLimitAlert(); setEditTaxNameOverflow(false); setEditTaxNumberOverflow(false); setEditTaxRateFocused(false); }} className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg flex-shrink-0">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0 mr-2">
                          <div className="font-semibold text-blue-600 text-sm leading-tight">
                            {tax.tax_name} ({parseFloat(parseFloat(tax.tax_rate).toFixed(3))}%)
                          </div>
                          <div className="text-xs text-slate-400 mt-0.5">
                            Tax No. {tax.tax_number || "N/A"}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <button type="button"
                            onClick={() => toggleDefaultTax(tax.id)}
                            title={defaultTaxIds.includes(tax.id) ? "Remove as default" : "Set as default (auto-applied to new receipts)"}
                            className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors ${defaultTaxIds.includes(tax.id) ? "bg-yellow-50 border-yellow-400 text-yellow-600" : "bg-white border-slate-200 text-slate-400 hover:border-yellow-400 hover:text-yellow-500"}`}>
                            {defaultTaxIds.includes(tax.id) ? "★ Default" : "Default"}
                          </button>
                          <Btn color="bg-blue-500 hover:bg-blue-600" onClick={() => { setShowAddForm(false); setEditTaxKey(tax.id); clearEditTaxRateLimitAlert(); setEditTaxRateFocused(false); setEditTaxVal({ tax_name: tax.tax_name, tax_rate: parseFloat(parseFloat(tax.tax_rate).toFixed(3)).toString(), tax_number: tax.tax_number || "" }); }}><Pencil size={13}/></Btn>
                          <Btn color="bg-red-400 hover:bg-red-500" onClick={() => handleDelete({ key: tax.id, name: tax.tax_name })}><Trash2 size={13}/></Btn>
                        </div>
                      </>
                    )}
                  </div>
                );
              })
        )}

        {/* Merchants / Categories / Payments — unified list */}
        {type !== "taxes" && (
          allItems.length === 0
            ? <p className="text-sm text-slate-400 text-center py-8">No {cfg.label.toLowerCase()} yet.</p>
            : allItems.map(item => {
                const isEd = editKey === item.key;
                const isMisc = type === "merchants" && (item.name || "").toLowerCase().trim() === "miscellaneous";
                const inlineEditDuplicateMsg = isEd ? getInlineEditDuplicateMessage(item, editVal) : "";
                // resolve logo shown in list: prefer merchant logo map, then item logo
                const displayLogo = type === "merchants"
                  ? (merchLogos[item.name] || item.logo)
                  : item.logo;
                return (
                  <div key={item.key}>
                    {isEd && !isMisc ? (
                      <div className="flex flex-col gap-2 bg-blue-50 border border-blue-200 rounded-xl p-3">
                        {/* Edit row */}
                        <div className="flex items-center gap-2">
                          {/* Show current/new logo preview */}
                          {type === "merchants" && (
                            <MerchantAvatar
                              name={editVal || item.name}
                              explicitUrl={editLogoSel !== null ? (editLogoOpts[editLogoSel]?.displayUrl || editLogoOpts[editLogoSel]?.storeUrl) : editOrigLogo}
                              className="w-9 h-9 flex-shrink-0"
                            />
                          )}
                          <input className={mInput} value={editVal} onChange={e => setEditVal(stripEmoji(e.target.value))} placeholder={item.name} />
                          {/* Logo search button (merchants only) */}
                          {type === "merchants" && (
                            <button type="button" style={{ margin: 0 }}
                              onClick={() => doFetch(editVal || item.name, setIsFetchEditLogo, setEditLogoOpts, setEditLogoSel)}
                              disabled={isFetchEditLogo}
                              className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 flex-shrink-0 disabled:opacity-40 flex items-center justify-center">
                              {isFetchEditLogo
                                ? <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
                                : <Search size={13} />}
                            </button>
                          )}
                          <button type="button" disabled={!!inlineEditDuplicateMsg} onClick={() => handleSaveEdit(item)} style={{ margin: 0 }} className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg flex-shrink-0">Save</button>
                          <button type="button" onClick={closeEdit} style={{ margin: 0 }} className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg flex-shrink-0">Cancel</button>
                        </div>
                        {!!inlineEditDuplicateMsg && <p className="text-xs text-red-600">{inlineEditDuplicateMsg}</p>}
                        {/* Logo search results (edit mode, merchants) */}
                        {type === "merchants" && <LogoGrid options={editLogoOpts} selectedIndex={editLogoSel} onSelect={setEditLogoSel} />}
                      </div>
                    ) : (
                      <ItemRow
                        logo={displayLogo}
                        logoNode={type === "merchants"
                          ? <MerchantAvatar name={item.name} explicitUrl={displayLogo} className="w-9 h-9 flex-shrink-0" />
                          : undefined}
                        name={type === "payments" ? getPaymentMethodListLabel(item.name) : item.name}
                        badgeCls={colors.badge}
                        showIcon={type !== "categories"}
                        actions={<>
                          {!isMisc && !(type === "payments" && isCashMethod(item.name)) && (
                            <Btn color="bg-blue-500 hover:bg-blue-600" onClick={() => {
                              if (type === "payments") {
                                // Open Add form prefilled for edit
                                const { issuer: pIssuer, last4: pLast4 } = parsePaymentDisplay(item.name);
                                const pApiMatches = resolvePaymentApiMatches(item);
                                const pApiId = item.apiId ?? getApiEntityId(pApiMatches[0]) ?? null;
                                // Direct ID lookup is most reliable; fall back to name-based match.
                                const pApiRecord =
                                  item.apiId != null
                                    ? (apiPaymentMethods || []).find(p => String(getApiEntityId(p)) === String(item.apiId))
                                    : pApiMatches[0];
                                // Prefer card_type from the API record (authoritative integer enum)
                                // over keyword-matching the display name, which mis-classifies entries
                                // like "Bank of America" (card_type=1 → MasterCard) as "Other".
                                const brandFromApiType = pApiRecord ? cardTypeIntToBrand(pApiRecord.card_type) : "";
                                const pBrand = brandFromApiType || getPaymentBrand(item.name, inferCardTypeFromPayment(item.name));
                                setNewCardType(pBrand || "");
                                // Leave Card Issuer empty when the name is only brand + last4
                                // (e.g. "MasterCard *7979") so users know they can add a custom issuer.
                                setNewIssuerName(isCustomCardIssuer(pIssuer, pBrand) ? pIssuer : "");
                                setNewLast4(pLast4 || "");
                                setNewExpenseType(
                                  payExpenseTypeMap[item.name] ||
                                    paymentCategoryFromApiEnum(pApiMatches[0]?.default_payment_category) ||
                                    "Personal"
                                );
                                setPayEditMode({ item, apiId: pApiId });
                                setShowAddForm(true);
                              } else {
                                setEditKey(item.key); setEditIsReceipt(item.isReceiptItem);
                                setEditVal(item.name); setEditOrigLogo(displayLogo);
                                setEditLogoOpts([]); setEditLogoSel(null);
                              }
                            }}><Pencil size={13}/></Btn>
                          )}
                          {!isMisc && !(type === "payments" && isCashMethod(item.name)) && (
                            <Btn color="bg-red-400 hover:bg-red-500" onClick={() => handleDelete(item)}><Trash2 size={13}/></Btn>
                          )}
                        </>}
                      />
                    )}
                  </div>
                );
              })
        )}

      </div>
    </div>

    {/* Merchant Edit Confirmation Popup */}
    <AnimatePresence>
      {showMerchantEditConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center border border-slate-200">
            <p className="text-sm font-medium text-slate-800 leading-relaxed mb-5">
              When editing a Merchant<br />
              all receipts associated with that<br />
              Merchant will also be updated.
            </p>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => { setShowMerchantEditConfirm(false); setPendingMerchantEdit(null); }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={doConfirmMerchantEdit}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-semibold text-sm transition-colors">
                Okay
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Merchant Delete Confirmation Popup */}
    <AnimatePresence>
      {showMerchantDeleteConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center border border-slate-200">
            <p className="text-sm font-medium text-slate-800 leading-relaxed mb-5">
              Are you sure you want to delete this<br />
              Merchant? If so, then all Receipts<br />
              associated with this Merchant will<br />
              now be associated with the<br />
              &quot;Miscellaneous&quot; Merchant.
            </p>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => { setShowMerchantDeleteConfirm(false); setPendingMerchantDelete(null); }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={doConfirmMerchantDelete} disabled={isDeleteSyncing}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-white font-semibold text-sm transition-colors">
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Expense Category Edit Confirmation Popup */}
    <AnimatePresence>
      {showCategoryEditConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center border border-slate-200">
            <p className="text-sm font-medium text-slate-800 leading-relaxed mb-5">
              When editing an Expense Category<br />
              all receipts associated with that<br />
              Expense Category will also be updated.
            </p>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => { setShowCategoryEditConfirm(false); setPendingCategoryEdit(null); }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={doConfirmCategoryEdit}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-semibold text-sm transition-colors">
                Okay
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Expense Category Delete Confirmation Popup */}
    <AnimatePresence>
      {showCategoryDeleteConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center border border-slate-200">
            <p className="text-sm font-medium text-slate-800 leading-relaxed mb-5">
              Are you sure you want to delete this Expense<br />
              Category? When deleting an Expense Category all<br />
              receipts associated with that Expense Category will<br />
              have that Expense Category removed.
            </p>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => { setShowCategoryDeleteConfirm(false); setPendingCategoryDelete(null); }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={doConfirmCategoryDelete} disabled={isDeleteSyncing}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-white font-semibold text-sm transition-colors">
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Payment Method Edit Confirmation Popup */}
    <AnimatePresence>
      {showPaymentEditConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center border border-slate-200">
            <p className="text-sm font-medium text-slate-700 leading-relaxed mb-5">
              When editing an Payment Method all<br />
              receipts associated with that Payment<br />
              Method will also be updated.
            </p>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => { setShowPaymentEditConfirm(false); setPendingPaymentEdit(null); }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={doConfirmPaymentEdit}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 rounded-xl text-white font-semibold text-sm transition-colors">
                Okay
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Payment Method Delete Confirmation Popup */}
    <AnimatePresence>
      {showPaymentDeleteConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center border border-slate-200">
            <p className="text-sm font-medium text-slate-800 leading-relaxed mb-5">
              Are you sure you want to delete this<br />
              Payment Method? When deleting a<br />
              Payment Method all receipts<br />
              associated with that Payment Method<br />
              will have that Payment Method<br />
              removed.
            </p>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => { setShowPaymentDeleteConfirm(false); setPendingPaymentDelete(null); }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={doConfirmPaymentDelete} disabled={isDeleteSyncing}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-white font-semibold text-sm transition-colors">
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Max Default Tax Types Popup */}
    {showMaxDefaultTaxMsg && (
      <SimpleAlertModal
        title="Message"
        message={"A maximum of two tax types can be selected as Default. Please unselect a tax type before selecting another."}
        onClose={() => setShowMaxDefaultTaxMsg(false)}
      />
    )}

    <TaxRateChangeWarningModal
      isOpen={showTaxRateChangeWarning}
      onGoBack={() => {
        setShowTaxRateChangeWarning(false);
        setPendingTaxRateEdit(null);
      }}
      onClose={() => {
        setShowTaxRateChangeWarning(false);
        setPendingTaxRateEdit(null);
      }}
      onAddNewTaxType={handleAddNewTaxTypeFromRateWarning}
      onUpdateCurrentRate={confirmTaxRateChange}
    />

    {/* Tax Delete Blocked Message Popup */}
    <AnimatePresence>
      {showTaxDeleteBlockedMsg && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center border border-slate-200">
            <p className="text-sm font-medium text-slate-800 leading-relaxed mb-5">
              Before you can delete this Tax Type you must<br />
              remove that Tax Type from any associated<br />
              receipts. You can do this by using the Search<br />
              Filters on the Main Receipt screen and<br />
              tapping the &quot;Tax Type &amp; Tip&quot; filter and<br />
              selecting this Tax Type. From here you can<br />
              edit each receipt by either removing this Tax<br />
              Type or replacing it with another Tax Type.
            </p>
            <button type="button"
              onClick={() => setShowTaxDeleteBlockedMsg(false)}
              className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors">
              Ok
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>

    {/* Tax Delete Confirmation Popup */}
    <AnimatePresence>
      {showTaxDeleteConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center border border-slate-200">
            <p className="text-sm font-medium text-slate-800 leading-relaxed mb-5">
              Are you sure you want to delete this<br />
              Tax Type?
            </p>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => { setShowTaxDeleteConfirm(false); setPendingTaxDeleteId(null); }}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={async () => {
                try {
                  if (pendingTaxDeleteId) {
                    await deleteTax(pendingTaxDeleteId);
                    toast("success", "Tax Type Deleted");
                  }
                } catch (e) {
                  toast("error", e.message || "Failed.");
                } finally {
                  setShowTaxDeleteConfirm(false);
                  setPendingTaxDeleteId(null);
                }
              }}
                className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 rounded-xl text-white font-semibold text-sm transition-colors">
                Delete
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
};

export default Settings;
