import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { NODE_API_URL, proxyImageUrl, unproxyImageUrl } from "../api/Axios";
import {
  encodeReceiptTags,
  formatTaxRate,
  parseReceiptTags,
  taxTypeDedupKey,
  taxTypesMatch,
  taxDefinitionMatchesReceiptLine,
} from "../utils/receiptFormatters";
import {X,ChevronLeft,ChevronRight, Trash2, ChevronDown, Plus, Pencil, MoreHorizontal, Camera, PenLine, AlertCircle,} from "lucide-react";
import ReceiptAnnotator from "../components/receipts/ReceiptAnnotator";
import PdfThumbnail from "../components/receipts/PdfThumbnail";
import {
  splitMediaField,
  buildCombinedMediaField,
  collectReceiptMediaUrls,
  normalizeMediaUrl,
  mediaUrlsEqual,
  replaceUrlInMediaCsv,
  removeUrlFromReceiptMedia,
  getPdfProxyUrl,
  isPdfUrl,
  sanitizeUploadFile,
  dedupeEmailAttachmentPdfUrls,
} from "../utils/mediaUrlUtils";
import DeleteConfirmationDialog from "../components/receipts/DeleteConfirmationDialog";
import ForwardReceiptModal from "../components/receipts/ForwardReceiptModal";
import { isNetworkReceivedReceipt } from "../utils/networkReceiptUtils";
import "../App.css";
const Visa              = "/payment-logos/Visa.png";
const MasterCard        = "/payment-logos/MasterCard.png";
const PayPal            = "/payment-logos/PayPal.png";
const AmericanExpress   = "/payment-logos/AmericanExpress.webp";
const Discover          = "/payment-logos/discover.png";
const DinersClub        = "/payment-logos/DinersClub.png";
const Cash              = "/payment-logos/Cash.jpg";
const DebitCard         = "/payment-logos/DebitCard.webp";
const Creditdebitcardicon = "/payment-logos/Creditdebitcardicon.jpg";
import { motion, AnimatePresence } from "framer-motion";
import shareIcon from "../assets/icons/Share_Blue.png";
import ShareOptions from "../components/ShareOptions";
import ViewReport from "../components/ViewReport";
import Toast from "../components/Toast";
import { useData } from "../context/DataContext";
import { useCurrency } from "../context/CurrencyContext";
import MerchantAvatar from "../components/MerchantAvatar";
import LoadingImage from "../components/LoadingImage";
import { getPaymentDisplayFromReceipt, usePaymentDisplay } from "../hooks/usePaymentDisplay";
import {
  apiPaymentMethodMatchesLabel,
  buildPaymentMethodStorageString,
  cardTypeIntToBrand,
  getApiPaymentMethodDisplayName,
  getLast4FromPaymentApiRecord,
  inferCardTypeFromPayment,
  mergePaymentMethodLabels,
  isCustomCardIssuer,
  normalizePaymentMatchKey,
  parsePaymentDisplay,
  readPayCardTypeMap,
  storedCardIssuerName,
} from "../utils/paymentMethodUtils";
import EditPaymentMethodModal from "../components/receipts/EditPaymentMethodModal";
import { parseTaxRateInput, createTaxRateKeyDownHandler } from "../utils/taxRateInput";
import { useTaxRateLimitAlert } from "../hooks/useTaxRateLimitAlert";
import TaxRateChangeWarningModal from "../components/TaxRateChangeWarningModal";
import {
  buildIncrementedTaxName,
  propagateTaxNameChangeToReceipts,
  propagateTaxRateChangeToReceipts,
  taxRatesDiffer,
  enrichReceiptTaxValues,
  preserveStoredReceiptTaxTotals,
  resolveReceiptTaxLineRate,
  hasStoredTaxAmount,
  getReceiptTaxLineDisplay,
  buildReceiptTipTaxEntry,
  filterNonTipReceiptTaxValues,
  findTipLineInReceiptTaxValues,
  getReceiptsUsingTax,
} from "../utils/taxTypeUtils";
import { buildExpenseCategoryOptions } from "../utils/expenseCategories";
import { findRenamedApiMerchant } from "../utils/merchantListUtils";
import { containsEmoji } from "../utils/emojiUtils";
import {
  formatReceiptDateLong,
  parseDateInputToUnix,
  productDateToInputValue,
  todayLocalCalendarUnix,
} from "../utils/receiptDate";

// Default payment methods
const defaultPaymentMethods = [
  "Cash",
  "Visa",
  "MasterCard",
  "American Express",
  "Discover",
  "Debit Card",
  "PayPal",
  "Diners Club",
];

// Resolve the canonical card-issuer display name from a raw payment type string.
// Always returns the full brand name (e.g. "Diners Club", not "Club").
const resolveIssuerName = (pt) => {
  if (!pt) return "";
  const lower = pt.toLowerCase();
  if (lower.includes("visa")) return "Visa";
  if (lower.includes("master")) return "MasterCard";
  if (lower.includes("amex") || lower.includes("american express")) return "American Express";
  if (lower.includes("discover")) return "Discover";
  if (lower.includes("diners")) return "Diners Club";
  if (lower.includes("paypal")) return "PayPal";
  if (lower.includes("debit")) return "Debit Card";
  if (lower.includes("cash")) return "Cash";
  return pt; // custom name
};

import flagDeselect from "../assets/receipttags/flag_deselect.png";
import flagSelect from "../assets/receipttags/flag_select.png";
import locked from "../assets/receipttags/locked.png";
import unlocked from "../assets/receipttags/unlocked.png";
import reconcileDeselect from "../assets/receipttags/reconile_deselect.png";
import reconcileSelect from "../assets/receipttags/reconile_select.png";
import reimbursedDeselect from "../assets/receipttags/reimbursed_deselect.png";
import reimbursedSelect from "../assets/receipttags/reimbursed_select.png";
import starredDeselect from "../assets/receipttags/starred_deselect.png";
import starredSelect from "../assets/receipttags/starred_select.png";
import verifiedDeselect from "../assets/receipttags/verified_deselect.png";
import verifiedSelect from "../assets/receipttags/verified_select.png";
import warrantedDeselect from "../assets/receipttags/warrantied_deselect.png";
import warrantedSelect from "../assets/receipttags/warrantied_select.png";

import * as XLSX from "xlsx";
import JSZip from "jszip";

/** Match receipt ids across number/string API shapes. */
const findReceiptIndexInList = (list, id) => {
  if (id == null || !Array.isArray(list) || list.length === 0) return -1;
  const target = String(id);
  return list.findIndex((r) => String(r?.id) === target);
};

const RECEIPT_DEFAULT_TAGS = {
  locked: false,
  starred: false,
  flagged: false,
  verified: false,
  reconciled: false,
  reimbursed: false,
  warrantied: false,
};

const findContextReceipt = (receipts, incoming) => {
  if (!incoming) return null;
  if (!incoming.id || !Array.isArray(receipts) || receipts.length === 0) return incoming;
  return receipts.find((r) => String(r.id) === String(incoming.id)) || incoming;
};

const editedTagsFromReceiptTag = (receiptTagString) => {
  const parsed = parseReceiptTags(receiptTagString);
  if (!parsed) return RECEIPT_DEFAULT_TAGS;
  return {
    locked: !!parsed.locked,
    starred: !!parsed.starred,
    flagged: !!parsed.flagged,
    verified: !!parsed.verified,
    reconciled: !!parsed.reconciled,
    reimbursed: !!parsed.reimbursed,
    warrantied: !!parsed.warrantied,
  };
};

const SWIPE_IGNORE_SELECTOR =
  'input, textarea, select, button, a, label, canvas, [role="button"], [contenteditable="true"], .receipt-annotator-root';

const ReceiptDetail = ({
  receipt,
  onClose,
  onSaved,
  receiptList,
  setSelectedIndex,
  onDeleteReceipt,
  reversedSwipe = false,  // true for draft receipts: swipe right = next, swipe left = previous
}) => {
  const MAX_NOTES_LENGTH = 500;
  const MAX_DESCRIPTION_LENGTH = 100;
  const DEFAULT_TAGS = RECEIPT_DEFAULT_TAGS;

  const {
    receipts,
    updateReceiptStatus,
    updateReceipt,
    deleteReceipt,
    expenseCategories,
    paymentMethods,
    merchantsWithImages,
    taxData,
    refreshData,
    silentRefreshData,
    addTax,
    updateTax,
    deleteTax,
    fetchTaxes,
    addExpenseCategory,
    addCustomCategory,
    editCustomCategory,
    deleteCustomCategory,
    hideCategory,
    addCustomMerchant,
    editCustomMerchant,
    deleteCustomMerchant,
    hideMerchant,
    addApiMerchant,
    saveMerchLogo,
    apiMerchants,
    fetchApiMerchants,
    updateApiMerchant,
    deleteApiMerchant,
    apiExpenseCategories,
    fetchApiExpenseCategories,
    addApiExpenseCategory,
    updateApiExpenseCategory,
    deleteApiExpenseCategory,
    apiPaymentMethods,
    fetchApiPaymentMethods,
    deleteApiPaymentMethod,
    updateApiPaymentMethod,
    addApiPaymentMethod,
    editCustomPaymentMethod,
    deleteCustomPaymentMethod,
    hidePaymentMethod,
    repairReceiptMediaOnServer,
  } = useData();

  const openingReceipt = findContextReceipt(receipts, receipt);
  const [selectedReceipt, setSelectedReceipt] = useState(openingReceipt);
  const [sortedReceipts, setSortedReceipts] = useState([]);
  const [startX, setStartX] = useState(null);
  const [direction, setDirection] = useState(0);
  const [shareMenu, setShareMenu] = useState(false);
  const [showViewReport, setShowViewReport] = useState(false);
  const [isEditMode, setIsEditMode] = useState(true); // Default to edit mode
  const [editedReceipt, setEditedReceipt] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showImageDeleteConfirm, setShowImageDeleteConfirm] = useState(false);
  const [pendingImageDelete, setPendingImageDelete] = useState(null); // { type: "additional"|"existing", index?: number, url?: string }
  const containerRef = useRef(null);
  const dropdownRef = useRef();
  const scrollContentRef = useRef(null);
  const currentSelectedIdRef = useRef(receipt?.id ?? null);
  const lastReportedIndexRef = useRef(null);
  const swipeGestureActiveRef = useRef(false);
  const [showPDFPreview, setShowPDFPreview] = useState(false);
  const [pdfKey, setPdfKey] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [quickbooksConnected, setQuickbooksConnected] = useState(false);
  useEffect(() => {
    currentSelectedIdRef.current = selectedReceipt?.id ?? null;
  }, [selectedReceipt?.id]);

  const [quickbooksRealmId, setQuickbooksRealmId] = useState(null);
  const [linkToQbLoading, setLinkToQbLoading] = useState(false);
  const [toast, setToast] = useState({
    isVisible: false,
    message: "",
    type: "success",
  });

  // Dropdown states
  const [showMerchantDropdown, setShowMerchantDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  const [showPaymentDropdown, setShowPaymentDropdown] = useState(false);
  const [showTaxDropdown, setShowTaxDropdown] = useState(null);
  // Track active typing so we can show all options on focus/click
  const [isMerchantTyping, setIsMerchantTyping] = useState(false);
  const [isCategoryTyping, setIsCategoryTyping] = useState(false);
  const [isPaymentTyping, setIsPaymentTyping] = useState(false);

  // Add Expense Category inline state
  const [showAddCategoryInput, setShowAddCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");

  // Add Payment Method modal state
  const [showAddPaymentModal, setShowAddPaymentModal] = useState(false);
  const [payModalEditMode, setPayModalEditMode] = useState(null); // null | { name, apiId }
  const [newPaymentCardType, setNewPaymentCardType] = useState("");
  const [newCardIssuerName, setNewCardIssuerName] = useState("");
  const [newLast4Digits, setNewLast4Digits] = useState("");
  const [newPaymentCategoryType, setNewPaymentCategoryType] = useState("");
  const [payModalError, setPayModalError] = useState(null);
  const [localPaymentMethods, setLocalPaymentMethods] = useState([]);
  const [showPayMethodConfirm, setShowPayMethodConfirm] = useState(false);
  const [pendingPayMethodFn, setPendingPayMethodFn] = useState(null);
  const [payMethodConfirmMessage, setPayMethodConfirmMessage] = useState("");
  const [isPayMethodSaving, setIsPayMethodSaving] = useState(false);
  const [showPayDeleteConfirm, setShowPayDeleteConfirm] = useState(false);
  const [pendingPayDeleteMethod, setPendingPayDeleteMethod] = useState(null);

  // Add Merchant modal state
  const [showAddMerchantModal, setShowAddMerchantModal] = useState(false);
  const [newMerchantName, setNewMerchantName] = useState("");
  const [newMerchantLogo, setNewMerchantLogo] = useState("");
  const [isSavingMerchant, setIsSavingMerchant] = useState(false);
  const [addMerchantError, setAddMerchantError] = useState(null);
  const [logoOptions, setLogoOptions] = useState([]);
  const [selectedLogoIndex, setSelectedLogoIndex] = useState(null);
  const [isFetchingLogos, setIsFetchingLogos] = useState(false);
  const [localMerchants, setLocalMerchants] = useState([]);

  // Edit Merchant modal state
  const [showEditMerchantModal, setShowEditMerchantModal] = useState(false);
  const [editingMerchant, setEditingMerchant] = useState(null);
  const [editMerchantName, setEditMerchantName] = useState("");
  const [editMerchantLogo, setEditMerchantLogo] = useState("");
  const [editLogoOptions, setEditLogoOptions] = useState([]);
  const [editSelectedLogoIndex, setEditSelectedLogoIndex] = useState(null);
  const [isFetchingEditLogos, setIsFetchingEditLogos] = useState(false);
  const [isSavingEditMerchant, setIsSavingEditMerchant] = useState(false);
  const [editMerchantError, setEditMerchantError] = useState(null);
  const [showMerchantEditConfirm, setShowMerchantEditConfirm] = useState(false);
  const [showMerchantDeleteConfirm, setShowMerchantDeleteConfirm] = useState(false);
  const [pendingMerchantDeleteData, setPendingMerchantDeleteData] = useState(null);

  // Edit/Delete Expense Category state
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editCategoryName, setEditCategoryName] = useState("");
  const [isSavingEditCategory, setIsSavingEditCategory] = useState(false);
  const [showCategoryEditConfirm, setShowCategoryEditConfirm] = useState(false);
  const [editCategoryError, setEditCategoryError] = useState(null);
  const [showDeleteCategoryConfirm, setShowDeleteCategoryConfirm] = useState(false);
  const [deletingCategory, setDeletingCategory] = useState(null);
  const [isDeletingCategory, setIsDeletingCategory] = useState(false);

  // Manage Tax Types modal state
  const [showManageTaxModal, setShowManageTaxModal] = useState(false);
  const [newTaxName, setNewTaxName] = useState("");
  const [newTaxRate, setNewTaxRate] = useState("");
  const [newTaxNumber, setNewTaxNumber] = useState("");
  const [isSavingTax, setIsSavingTax] = useState(false);
  const [editingTaxId, setEditingTaxId] = useState(null);
  const [isDeletingTax, setIsDeletingTax] = useState(false);
  const [taxError, setTaxError] = useState(null);
  const [localTaxTypes, setLocalTaxTypes] = useState([]);
  const [showAddTaxForm, setShowAddTaxForm] = useState(false);
  const manageTaxModalBodyRef = useRef(null);
  const [taxRateFocused, setTaxRateFocused] = useState(false);
  const [showTaxRateChangeWarning, setShowTaxRateChangeWarning] = useState(false);
  const [pendingTaxUpdate, setPendingTaxUpdate] = useState(null);
  const [showDeleteTaxConfirm, setShowDeleteTaxConfirm] = useState(false);
  const [showTaxDeleteBlockedMsg, setShowTaxDeleteBlockedMsg] = useState(false);
  const [deletingTaxId, setDeletingTaxId] = useState(null);
  const [tipVisible, setTipVisible] = useState(false); // TIP field visibility (toggled by SELECT pill)
  const [currencyInputs, setCurrencyInputs] = useState({}); // Raw text while user is typing in currency fields

  // ── Split feature ─────────────────────────────────────────────────────────
  const [showSplitScreen, setShowSplitScreen] = useState(false);
  const [activeSplitIndex, setActiveSplitIndex] = useState(null);
  const [splits, setSplits] = useState([]);
  const [isSavingSplits, setIsSavingSplits] = useState(false);
  const [splitErrors, setSplitErrors] = useState({});
  const [splitError, setSplitError] = useState(null);
  const [showOptionsMenu, setShowOptionsMenu] = useState(false);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null);
  const [showMaxDefaultTaxModal, setShowMaxDefaultTaxModal] = useState(false);

  // Refs for dropdowns
  const merchantInputRef = useRef(null);
  const categoryInputRef = useRef(null);
  const paymentInputRef = useRef(null);
  const optionsMenuRef = useRef(null);
  const addPhotoInputRef = useRef(null);
  // Track which receipt ID has been initialized so taxData changes don't reset editedReceipt
  const lastInitReceiptIdRef = useRef(null);
  const receiptTaxValuesSigRef = useRef("");
  /** True while the user is toggling tags; blocks external receipt_tag from overwriting edits */
  const tagsDirtyRef = useRef(false);

  // ── Character-limit overflow banners ─────────────────────────────────────
  const [descriptionOverflow, setDescriptionOverflow] = useState(false);
  const [notesOverflow, setNotesOverflow]             = useState(false);

  // ── Add Photo / Annotation state ──────────────────────────────────────────
  const [isAddingPhoto, setIsAddingPhoto] = useState(false);
  const [additionalPhotoUrls, setAdditionalPhotoUrls] = useState([]);
  const [annotatorUrl, setAnnotatorUrl] = useState(null);
  const [annotatorSource, setAnnotatorSource] = useState(null); // { type: 'additional', index } | { type: 'existing', sourceUrl }
  /** Latest annotated CDN URL — used on Save Changes if React state hasn't flushed yet */
  const pendingAnnotatedMediaRef = useRef(null);

  // Editable tags state — initialized from context so tags are correct on first paint
  const [editedTags, setEditedTags] = useState(() =>
    editedTagsFromReceiptTag(openingReceipt?.receipt_tag),
  );

  const { formatCurrency } = useCurrency();
  const { getPaymentLogo } = usePaymentDisplay();

  // Get all merchants with images - deduplicated, include locally added merchants
  const allMerchantsWithImages = React.useMemo(() => {
    const uniqueMap = new Map();
    (merchantsWithImages || []).forEach((m) => {
      const normalizedName = (m.name || "").toString().trim().toLowerCase();
      if (normalizedName && !uniqueMap.has(normalizedName)) {
        uniqueMap.set(normalizedName, m);
      }
    });
    // Add locally added merchants (not yet from server)
    (localMerchants || []).forEach((m) => {
      const normalizedName = (m.name || "").toString().trim().toLowerCase();
      if (normalizedName && !uniqueMap.has(normalizedName)) {
        uniqueMap.set(normalizedName, m);
      }
    });
    return Array.from(uniqueMap.values());
  }, [merchantsWithImages, localMerchants]);

  const merchantExists = (name, excludeName = "") => {
    const normalized = (name || "").trim().toLowerCase();
    const excluded = (excludeName || "").trim().toLowerCase();
    if (!normalized) return false;
    return allMerchantsWithImages.some((m) => {
      const mn = (m.name || "").trim().toLowerCase();
      return mn === normalized && mn !== excluded;
    });
  };

  // Get merchant image by name
  const getMerchantImage = (name) => {
    if (!name) return null;
    const merchant = allMerchantsWithImages.find(
      (m) => m.name?.toLowerCase() === name?.toLowerCase()
    );
    return merchant?.image || null;
  };

  useEffect(() => {
    fetchApiExpenseCategories?.();
  }, [fetchApiExpenseCategories]);

  const allExpenseCategories = useMemo(
    () =>
      buildExpenseCategoryOptions({
        apiExpenseCategories,
        receiptCategories: expenseCategories,
        includeDefaultsWhenEmpty: true,
      }),
    [apiExpenseCategories, expenseCategories]
  );

  // Define getPaymentDisplayName BEFORE allPaymentMethods useMemo (to avoid hoisting issues)
  const getPaymentDisplayName = React.useCallback((rec) => {
    let issuer = rec?.card_issuer_name?.toString?.().trim?.() || null;
    let type = rec?.paymentType?.toString?.().trim?.() || null;
    const last4Digit = rec?.last_4_digit_card?.toString?.().trim?.() || null;

    // Filter out invalid paymentType values
    if (
      type === "0" ||
      type === "0*0" ||
      /^0\*\d*$/.test(type) ||
      /\*\s*0$/.test(type)
    ) {
      type = null;
    }

    if (!issuer && !type) return "";

    if (
      type?.toLowerCase().includes("cash") ||
      issuer?.toLowerCase() === "cash"
    ) {
      return "Cash";
    }

    // PRIORITY: Check last_4_digit_card field first (API stores it separately)
    let last4 = "";
    if (last4Digit && last4Digit !== "0" && /^\d{3,4}$/.test(last4Digit)) {
      last4 = last4Digit;
    } else if (type && type.includes("*")) {
      // Fallback: Extract from paymentType if last_4_digit_card not available
      const parts = type.split("*");
      const lastPart = parts.pop()?.trim();
      if (lastPart && /^\d{3,4}$/.test(lastPart.replace(/\D/g, ""))) {
        last4 = lastPart.replace(/\D/g, "").slice(-4);
      }
    }

    // PRIORITY 1: Custom issuer only (not the card brand alone, e.g. "Other" or "Visa")
    if (issuer && issuer !== "0") {
      const cleanIssuer = issuer.replace(/\s*\*\d{3,4}/g, "").trim();
      const brand =
        (type || "").replace(/\s*\*\d{3,4}/g, "").trim() ||
        inferCardTypeFromPayment(cleanIssuer);
      if (isCustomCardIssuer(cleanIssuer, brand)) {
        const alreadyHasLast4 = last4 && issuer.includes(`*${last4}`);
        if (alreadyHasLast4) return issuer;
        return `${cleanIssuer}${last4 ? ` *${last4}` : ""}`;
      }
    }

    // PRIORITY 2: Use paymentType if no issuer
    if (type) {
      // Strip ALL embedded *digits from type before re-appending last4
      // (prevents "Visa *0700 *0700" when paymentType already has *last4 embedded)
      const cleanType = type.replace(/\s*\*\d{3,4}/g, "").trim();
      if (cleanType && cleanType !== "0") {
        return last4 ? `${cleanType} *${last4}` : cleanType;
      }
      if (last4) return `*${last4}`;
    }

    return "";
  }, []);

  const isCashPaymentMethod = (name) =>
    (name || "").toString().replace(/\s*\*\s*\d{3,4}\s*$/, "").trim().toLowerCase() === "cash";

  const allPaymentMethods = React.useMemo(
    () =>
      mergePaymentMethodLabels({
        baseLabels: paymentMethods || [],
        apiPaymentMethods: apiPaymentMethods || [],
      }),
    [paymentMethods, apiPaymentMethods]
  );

  // Get all tax types - merge taxData (API) with session-only localTaxTypes, exclude Tip
  const allTaxTypes = React.useMemo(() => {
    const taxMap = new Map();
    const addToMap = (tax) => {
      const key = taxTypeDedupKey(tax);
      if (!key) return;
      const name = (tax.tax_name || "").toString().trim();
      const rate = formatTaxRate(tax.tax_rate);
      const entry = {
        tax_name: name,
        tax_rate: rate,
        tax_number: tax.tax_number || "",
        id: tax.id || 0,
        fk_user_id: tax.fk_user_id || 0,
        is_default_tax: tax.is_default_tax || 0,
      };
      const existing = taxMap.get(key);
      if (!existing || (!existing.id && entry.id)) {
        taxMap.set(key, entry);
      }
    };

    if (Array.isArray(taxData)) taxData.forEach(addToMap);

    // Session-only taxes not yet in taxData (e.g. optimistic before fetch completes)
    const taxDataKeys = new Set((taxData || []).map(taxTypeDedupKey).filter(Boolean));
    if (Array.isArray(localTaxTypes)) {
      localTaxTypes
        .filter((t) => !taxDataKeys.has(taxTypeDedupKey(t)))
        .forEach(addToMap);
    }

    return Array.from(taxMap.values());
  }, [taxData, localTaxTypes]);

  // Resolve tax rate from receipt row or tax definition (taxData).
  const resolveTaxRateForReceipt = useCallback(
    (tax, subtotalOverride) => {
      const taxId = parseInt(tax?.fk_tax_id) || 0;
      const def =
        taxId > 0 && Array.isArray(taxData)
          ? taxData.find((t) => parseInt(t.id) === taxId)
          : null;
      const subtotal =
        subtotalOverride ??
        (parseFloat(selectedReceipt?.subtotal) ||
          parseFloat(selectedReceipt?.purchasePrice) ||
          0);
      return parseFloat(resolveReceiptTaxLineRate(tax, def, subtotal)) || 0;
    },
    [taxData, selectedReceipt],
  );

  // Keep total fixed: derive subtotal and per-tax amounts from rates.
  const recalculateReceiptTotalsFromFixedTotal = useCallback(
    (total, taxValues, tip) => {
      const preserved = preserveStoredReceiptTaxTotals(total, taxValues, tip);
      if (preserved) return preserved;

      const totalNum = parseFloat(total) || 0;
      const tipNum = parseFloat(tip) || 0;
      const taxes = (taxValues || []).filter(
        (t) => !(t.tax_name || "").toLowerCase().includes("tip"),
      );

      const totalRateSum = taxes.reduce(
        (sum, t) => sum + resolveTaxRateForReceipt(t) / 100,
        0,
      );
      const subtotalNum =
        taxes.length > 0 && totalRateSum > 0
          ? (totalNum - tipNum) / (1 + totalRateSum)
          : totalNum - tipNum;
      const subtotal =
        subtotalNum > 0 ? parseFloat(subtotalNum.toFixed(2)) : 0;

      const receipt_tax_values = taxes.map((t) => {
        const rate = resolveTaxRateForReceipt(t);
        const tax_amount =
          subtotal > 0 && rate > 0
            ? parseFloat(((subtotal * rate) / 100).toFixed(2))
            : 0;
        return {
          ...t,
          tax_rate: rate > 0 ? formatTaxRate(rate) : t.tax_rate || "0",
          tax_amount,
        };
      });

      return { subtotal, receipt_tax_values };
    },
    [resolveTaxRateForReceipt],
  );

  // IDs of taxes marked as default (is_default_tax === 1)
  // Also expose a helper to check by id or by is_default_tax on the allTaxTypes object itself
  const defaultTaxIds = useMemo(() => {
    return (taxData || [])
      .filter((t) => parseInt(t.is_default_tax, 10) === 1)
      .map((t) => t.id);
  }, [taxData]);

  // Returns true if a tax row (from allTaxTypes) is a default tax
  const isTaxDefault = useCallback((tax) => {
    // Primary: check is_default_tax flag on the object itself (now preserved in allTaxTypes)
    if (parseInt(tax?.is_default_tax, 10) === 1) return true;
    // Fallback: check against defaultTaxIds list
    return defaultTaxIds.includes(tax?.id);
  }, [defaultTaxIds]);

  // Toggle a tax's default status (max 2 defaults allowed)
  const toggleDefaultTax = async (taxId) => {
    const taxToToggle = (taxData || []).find(t => t.id === taxId);
    if (!taxToToggle) return;
    const isCurrentlyDefault = parseInt(taxToToggle.is_default_tax) === 1;
    // This cap warning is only for explicit Default selection, not while adding/editing a tax type.
    if (!isCurrentlyDefault && defaultTaxIds.length >= 2) {
      if (!showAddTaxForm && editingTaxId == null) {
        setShowMaxDefaultTaxModal(true);
      }
      return;
    }
    try {
      await updateTax({ ...taxToToggle, is_default_tax: isCurrentlyDefault ? 0 : 1 });
    } catch (e) {
      console.error("Failed to update default tax", e);
    }
  };

// Add this useEffect to fetch taxes when component mounts
useEffect(() => {
  const loadTaxes = async () => {
    try {
      await fetchTaxes();
    } catch (error) {
      console.error("Error fetching taxes:", error);
    }
  };
  loadTaxes();
}, [fetchTaxes]);

// Add this useEffect to refresh taxes when modal closes
useEffect(() => {
  if (!showManageTaxModal) {
    const refreshTaxesOnClose = async () => {
      await fetchTaxes();
    };
    refreshTaxesOnClose();
  }
}, [showManageTaxModal, fetchTaxes]);

  useEffect(() => {
    if ((editingTaxId || showAddTaxForm) && manageTaxModalBodyRef.current) {
      manageTaxModalBodyRef.current.scrollTop = 0;
    }
  }, [editingTaxId, showAddTaxForm]);

  // Mark receipt as read when component mounts
  useEffect(() => {
    if (receipt && receipt.status === "0") {
      updateReceiptStatus(receipt.id, "1");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.id, receipt?.status]);

  // Fetch QuickBooks status when share menu opens
  useEffect(() => {
    if (!shareMenu) return;
    const fetchQBStatus = async () => {
      try {
        const res = await fetch(`${NODE_API_URL}/api/integrations/quickbooks/status`);
        const data = await res.json();
        if (data.success && data.connected) {
          setQuickbooksConnected(true);
          setQuickbooksRealmId(data.realmId || null);
        } else {
          setQuickbooksConnected(false);
          setQuickbooksRealmId(null);
        }
      } catch {
        setQuickbooksConnected(false);
      }
    };
    fetchQBStatus();
  }, [shareMenu]);

  // Allow re-init when server/context updates tax lines for the same receipt (e.g. after save + refresh).
  useEffect(() => {
    if (!selectedReceipt) return;
    const sig = JSON.stringify(selectedReceipt.receipt_tax_values || []);
    if (sig !== receiptTaxValuesSigRef.current) {
      receiptTaxValuesSigRef.current = sig;
      lastInitReceiptIdRef.current = null;
    }
  }, [selectedReceipt?.receipt_tax_values]);

  // Initialize edited receipt when selected receipt changes
  useEffect(() => {
    if (selectedReceipt) {
      // Only re-initialize if the receipt itself changed (different ID).
      // This prevents taxData refreshes (from fetchTaxes after adding a new tax)
      // from resetting editedReceipt and wiping the newly added tax entry.
      if (lastInitReceiptIdRef.current === selectedReceipt.id) return;
      lastInitReceiptIdRef.current = selectedReceipt.id;
      tagsDirtyRef.current = false;

      setAdditionalPhotoUrls([]);
      pendingAnnotatedMediaRef.current = null;

      // Enrich receipt_tax_values without overwriting stored amounts or effective rates.
      const enrichedTaxValues = enrichReceiptTaxValues(
        selectedReceipt.receipt_tax_values || [],
        taxData,
        selectedReceipt,
      );

      // Extract tip from receipt_tax_values (fallback: legacy top-level tip field)
      const tipEntry = findTipLineInReceiptTaxValues(enrichedTaxValues);
      const nonTipTaxValues = filterNonTipReceiptTaxValues(enrichedTaxValues).sort(
        (a, b) => (a.tax_name || "").localeCompare(b.tax_name || ""),
      );

      const receiptTotal = parseFloat(selectedReceipt.purchasePrice) || 0;
      const receiptTip = tipEntry
        ? parseFloat(tipEntry.tax_amount) || 0
        : parseFloat(selectedReceipt.tip) || 0;
      const { subtotal: initSubtotal, receipt_tax_values: initTaxValues } =
        recalculateReceiptTotalsFromFixedTotal(
          receiptTotal,
          nonTipTaxValues,
          receiptTip,
        );

      // Clean up paymentType - preserve original paymentType if valid, otherwise use card_issuer_name
      // For display: construct "Network *last4" format
      // Note: API stores paymentType WITHOUT *last4, so we need to construct display format
      const cleanPaymentType = (() => {
        const type = selectedReceipt.paymentType?.toString?.().trim?.() || "";
        const issuer =
          selectedReceipt.card_issuer_name?.toString?.().trim?.() || "";
        const last4 =
          selectedReceipt.last_4_digit_card?.toString?.().trim?.() || "";

        // Extract base type — strip ALL *digits occurrences (not just the last one)
        // This handles corrupted values like "Visa *0700 *0700" → "Visa"
        const baseType = type.replace(/\s*\*\d{3,4}/g, "").trim();

        // Filter out invalid values like "0", "0*0", "0*123"
        if (
          !baseType ||
          baseType === "0" ||
          baseType === "0*0" ||
          /^0\*\d*$/.test(baseType) ||
          /\*\s*0$/.test(baseType)
        ) {
          // Use card_issuer_name if available
          if (issuer && issuer !== "0") {
            // Normalize known payment networks to proper format
            // Also strip any accidentally embedded *digits from issuer
            const cleanIssuer = issuer.replace(/\s*\*\d{3,4}/g, "").trim();
            const issuerLower = cleanIssuer.toLowerCase();
            let normalizedIssuer = cleanIssuer;
            if (issuerLower.includes("diners")) {
              normalizedIssuer = "Diners Club";
            } else if (issuerLower.includes("visa")) {
              normalizedIssuer = "Visa";
            } else if (issuerLower.includes("master")) {
              normalizedIssuer = "MasterCard";
            } else if (issuerLower.includes("discover")) {
              normalizedIssuer = "Discover";
            } else if (issuerLower.includes("paypal")) {
              normalizedIssuer = "PayPal";
            } else if (
              issuerLower.includes("amex") ||
              issuerLower.includes("american express")
            ) {
              normalizedIssuer = "American Express";
            }
            // Construct display format with *last4 if available
            return last4 && last4 !== "0"
              ? `${normalizedIssuer} *${last4}`
              : normalizedIssuer;
          }
          // If no issuer, try to construct from paymentBrand if available
          const brand =
            selectedReceipt.paymentBrand?.toString?.().trim?.() || "";
          if (brand && brand !== "0") {
            return last4 && last4 !== "0" ? `${brand} *${last4}` : brand;
          }
          return "";
        }
        // Return just the base network name (no *last4 embedded).
        // last4 is stored separately in last_4_digit_card; getPaymentDisplayName
        // will combine them. Embedding *last4 here caused "Visa *0700 *0700" when
        // card_issuer_name was empty and getPaymentDisplayName's priority-2 path
        // re-appended last4 onto an already-suffixed paymentType.
        return baseType;
      })();

      setEditedReceipt({
        receipt_category: selectedReceipt.receipt_category,
        product_date: selectedReceipt.product_date,
        storeName: selectedReceipt.storeName || "",
        expense_type: selectedReceipt.expense_type || "",
        paymentType: cleanPaymentType,
        paymentBrand: "", // Always clear so r.paymentBrand doesn't leak into logo detection
        payment_logo_url: "",
        paymentLogoUrl: "",
        card_issuer_name: selectedReceipt.card_issuer_name || "",
        last_4_digit_card: selectedReceipt.last_4_digit_card || "",
        subtotal:
          initTaxValues.length > 0
            ? initSubtotal
            : selectedReceipt.subtotal || selectedReceipt.purchasePrice || 0,
        purchasePrice: selectedReceipt.purchasePrice || 0,
        product_name: selectedReceipt.product_name || "",
        notes: selectedReceipt.notes || "",
        receipt_tax_values: initTaxValues,
        tip:
          tipEntry
            ? (tipEntry.tax_amount ?? "")
            : receiptTip > 0
              ? receiptTip.toFixed(2)
              : selectedReceipt.tip || "",
        store_image: selectedReceipt.store_image || "",
        // Explicitly carry image fields so the Receipt Images section renders
        // without relying on the `?? r.*` fallback (which can miss updates when
        // selectedReceipt changes while editedReceipt is already mounted).
        receipt_image: selectedReceipt.receipt_image ?? "0",
        emailAttachment: selectedReceipt.emailAttachment ?? "",
      });
      // Show TIP field if receipt already has a tip value
      setTipVisible(receiptTip > 0);

      setEditedTags(editedTagsFromReceiptTag(selectedReceipt.receipt_tag));
    }
  }, [selectedReceipt, taxData, recalculateReceiptTotalsFromFixedTotal]);

  // Keep tags aligned with context receipt_tag before paint (avoids stale list flash on reopen).
  useLayoutEffect(() => {
    if (!selectedReceipt?.id || tagsDirtyRef.current) return;
    const contextReceipt = findContextReceipt(receipts, selectedReceipt);
    const tagStr = contextReceipt?.receipt_tag ?? selectedReceipt.receipt_tag ?? "";
    setEditedTags((prev) => {
      if (encodeReceiptTags(prev) === tagStr) return prev;
      return editedTagsFromReceiptTag(tagStr);
    });
  }, [receipts, selectedReceipt?.id, selectedReceipt?.receipt_tag]);

  // When tax definitions load, fill missing rates only — do not overwrite stored amounts.
  useEffect(() => {
    if (!selectedReceipt || !Array.isArray(taxData) || taxData.length === 0) return;
    setEditedReceipt((prev) => {
      const taxes = prev.receipt_tax_values || [];
      if (taxes.length === 0) return prev;
      const total =
        parseFloat(prev.purchasePrice) ||
        parseFloat(selectedReceipt.purchasePrice) ||
        0;
      if (!total) return prev;

      const nonTipTaxes = taxes.filter(
        (t) => !(t.tax_name || "").toLowerCase().includes("tip"),
      );
      if (nonTipTaxes.every(hasStoredTaxAmount)) return prev;

      const needsRate = taxes.some((t) => resolveTaxRateForReceipt(t) <= 0);
      const needsAmount = taxes.some(
        (t) => !hasStoredTaxAmount(t) && resolveTaxRateForReceipt(t) > 0,
      );
      if (!needsRate && !needsAmount) return prev;

      const tip = parseFloat(prev.tip) || 0;
      const next = recalculateReceiptTotalsFromFixedTotal(total, taxes, tip);
      return { ...prev, subtotal: next.subtotal, receipt_tax_values: next.receipt_tax_values };
    });
  }, [
    taxData,
    selectedReceipt,
    resolveTaxRateForReceipt,
    recalculateReceiptTotalsFromFixedTotal,
  ]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (
        merchantInputRef.current &&
        !merchantInputRef.current.contains(e.target)
      ) {
        setShowMerchantDropdown(false);
      }
      if (
        categoryInputRef.current &&
        !categoryInputRef.current.contains(e.target)
      ) {
        setShowCategoryDropdown(false);
      }
      if (
        paymentInputRef.current &&
        !paymentInputRef.current.contains(e.target)
      ) {
        setShowPaymentDropdown(false);
      }
      // Close tax dropdowns when clicking outside
      setShowTaxDropdown(null);
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-fetch merchant logos when merchant name is typed in Add Merchant modal
  useEffect(() => {
    if (showAddMerchantModal && newMerchantName && newMerchantName.trim().length > 1) {
      const timer = setTimeout(async () => {
        const logos = await fetchMerchantLogos(newMerchantName.trim());
        setLogoOptions(logos);
        if (logos.length > 0) {
          setSelectedLogoIndex(0);
          setNewMerchantLogo(logos[0].storeUrl);
        } else {
          setSelectedLogoIndex(null);
          setNewMerchantLogo("");
        }
      }, 800);
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newMerchantName, showAddMerchantModal]);

  // Filter functions — show ALL options when dropdown is opened via focus/click (not typing).
  // Only filter when the user is actively typing in the field.
  const sortMerchantsAlpha = (list) => {
    return [...list].sort((a, b) =>
      (a?.name || "").toString().toLowerCase().localeCompare((b?.name || "").toString().toLowerCase())
    );
  };

  const filteredMerchants = React.useMemo(() => {
    if (!isMerchantTyping) return sortMerchantsAlpha(allMerchantsWithImages);
    const searchTerm = (editedReceipt.storeName || "").toLowerCase().trim();
    if (!searchTerm) return sortMerchantsAlpha(allMerchantsWithImages);
    return sortMerchantsAlpha(allMerchantsWithImages.filter((m) =>
      m.name?.toLowerCase().includes(searchTerm)
    ));
  }, [allMerchantsWithImages, editedReceipt.storeName, isMerchantTyping]);

  const filteredCategories = React.useMemo(() => {
    if (!isCategoryTyping) return allExpenseCategories; // show all on open
    const searchTerm = (editedReceipt.expense_type || "").toLowerCase().trim();
    if (!searchTerm) return allExpenseCategories;
    return allExpenseCategories.filter((c) =>
      c.toLowerCase().includes(searchTerm)
    );
  }, [allExpenseCategories, editedReceipt.expense_type, isCategoryTyping]);

  const filteredPaymentMethods = React.useMemo(() => {
    if (!isPaymentTyping) return allPaymentMethods; // show all on open
    const searchTerm = (
      editedReceipt.card_issuer_name || editedReceipt.paymentType || ""
    ).toLowerCase().trim();
    if (!searchTerm) return allPaymentMethods;
    const matches = allPaymentMethods.filter((p) => {
      const pLower = p.toLowerCase();
      return pLower.includes(searchTerm) || searchTerm.includes(pLower);
    });
    return matches.length > 0 ? matches : allPaymentMethods;
  }, [
    allPaymentMethods,
    editedReceipt.card_issuer_name,
    editedReceipt.paymentType,
    isPaymentTyping,
  ]);

  const expenseCategoryExists = (name, excludeName = "") => {
    const normalized = (name || "").trim().toLowerCase();
    const excluded = (excludeName || "").trim().toLowerCase();
    if (!normalized) return false;
    return allExpenseCategories.some((c) => {
      const cn = (c || "").trim().toLowerCase();
      return cn === normalized && cn !== excluded;
    });
  };

  const normalizePaymentMethodKey = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .replace(/\s*\*\s*/, " *")
      .toLowerCase();

  const localPaymentMethodStrings = React.useMemo(
    () =>
      (localPaymentMethods || []).map((pm) => {
        const issuerName = pm.cardIssuerName || "";
        const last4 = pm.last4DigitCard || "";
        const brand = pm.selectedCardType || inferCardTypeFromPayment(pm.paymentType || "");
        if (issuerName && last4) {
          return isCustomCardIssuer(issuerName, brand)
            ? `${issuerName} *${last4}`
            : `${brand} *${last4}`;
        }
        if (issuerName) return issuerName;
        if (brand && last4) return `${brand} *${last4}`;
        return pm.paymentType || "";
      }),
    [localPaymentMethods]
  );

  const paymentMethodNameExists = (name, excludeName = "") => {
    const target = normalizePaymentMethodKey(name);
    const excluded = normalizePaymentMethodKey(excludeName);
    if (!target) return false;
    const allCandidates = [
      ...localPaymentMethodStrings,
      ...(apiPaymentMethods || []).map((p) => getApiPaymentMethodDisplayName(p)),
    ];
    return allCandidates.some((item) => {
      const normalizedItem = normalizePaymentMethodKey(item);
      return normalizedItem === target && normalizedItem !== excluded;
    });
  };

  const paymentMethodDraftName = (() => {
    const cardType = (newPaymentCardType || "").trim();
    const issuer = (newCardIssuerName || "").trim();
    const last4 = (newLast4Digits || "").replace(/\D/g, "").slice(0, 4);
    if (!cardType || last4.length < 4) return "";
    return buildPaymentMethodStorageString(issuer, cardType, last4);
  })();

  const paymentDuplicateError =
    paymentMethodDraftName &&
    paymentMethodNameExists(paymentMethodDraftName, payModalEditMode?.name || "")
      ? "Payment Method already exists"
      : "";

  const addCategoryDuplicateError =
    newCategoryName.trim() && expenseCategoryExists(newCategoryName.trim())
      ? "Expense Category already exists"
      : "";

  const editCategoryDuplicateError =
    editCategoryName.trim() && expenseCategoryExists(editCategoryName.trim(), editingCategory || "")
      ? "Expense Category already exists"
      : "";

  // Toggle tag
  const toggleTag = (tagName) => {
    tagsDirtyRef.current = true;
    setEditedTags((prev) => ({
      ...prev,
      [tagName]: !prev[tagName],
    }));
  };

  useLayoutEffect(() => {
    const hasExplicitList = Array.isArray(receiptList) && receiptList.length > 0;
    const receiptsToUse = hasExplicitList ? receiptList : receipts;
    if (!receiptsToUse || receiptsToUse.length === 0) return;

    const orderedReceipts = hasExplicitList
      ? [...receiptsToUse]
      : [...receiptsToUse].sort(
          (a, b) => new Date(b.product_date) - new Date(a.product_date)
        );
    setSortedReceipts(orderedReceipts);

    const currentSelectedId = currentSelectedIdRef.current;
    let nextIndex = findReceiptIndexInList(orderedReceipts, currentSelectedId);
    if (nextIndex === -1) {
      nextIndex = findReceiptIndexInList(orderedReceipts, receipt?.id);
    }
    if (nextIndex === -1) return;

    const nextSelected = orderedReceipts[nextIndex];
    const contextReceipt = findContextReceipt(receipts, nextSelected);
    const resolvedReceipt = contextReceipt || nextSelected;
    const isDifferentReceipt =
      currentSelectedId == null ||
      String(currentSelectedId) !== String(resolvedReceipt.id);
    if (isDifferentReceipt) {
      tagsDirtyRef.current = false;
      setSelectedReceipt(resolvedReceipt);
      currentSelectedIdRef.current = resolvedReceipt.id;
      lastInitReceiptIdRef.current = null;
    } else if (
      resolvedReceipt.receipt_tag != null &&
      resolvedReceipt.receipt_tag !== selectedReceipt?.receipt_tag
    ) {
      setSelectedReceipt((prev) =>
        prev
          ? { ...prev, receipt_tag: resolvedReceipt.receipt_tag }
          : resolvedReceipt
      );
    }
    if (setSelectedIndex && lastReportedIndexRef.current !== nextIndex) {
      setSelectedIndex(nextIndex);
      lastReportedIndexRef.current = nextIndex;
    }
  }, [receipts, receiptList, receipt?.id, setSelectedIndex]);

  // Close options menu on outside click
  useEffect(() => {
    if (!showOptionsMenu) return;
    const handler = (e) => {
      if (optionsMenuRef.current && !optionsMenuRef.current.contains(e.target)) {
        setShowOptionsMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showOptionsMenu]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShareMenu(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // iOS/Android-style locked: make scrollable content non-interactive without dark overlay
  useEffect(() => {
    const el = scrollContentRef.current;
    if (!el) return;
    if (editedTags.locked && !showSplitScreen) {
      el.setAttribute("inert", "");
    } else {
      el.removeAttribute("inert");
    }
  }, [editedTags.locked, showSplitScreen]);

  // Enrich receipt_tax_values with tax_name and tax_rate from taxData for display
  const enrichedReceiptTaxValues = React.useMemo(() => {
    if (
      !selectedReceipt ||
      !Array.isArray(selectedReceipt.receipt_tax_values) ||
      selectedReceipt.receipt_tax_values.length === 0
    ) {
      return [];
    }

    return selectedReceipt.receipt_tax_values.map((tax) => {
      // If tax already has tax_name and tax_rate, use them
      if (tax.tax_name && tax.tax_rate) {
        return tax;
      }

      // Try to find tax definition by fk_tax_id
      const taxId = parseInt(tax.fk_tax_id) || 0;
      if (taxId > 0 && Array.isArray(taxData) && taxData.length > 0) {
        const taxDefinition = taxData.find((t) => parseInt(t.id) === taxId);
        if (taxDefinition) {
          return {
            ...tax,
            tax_name: taxDefinition.tax_name || tax.tax_name || "",
            tax_rate: taxDefinition.tax_rate || tax.tax_rate || "0",
          };
        }
      }

      // If fk_tax_id is 0 or not found, calculate tax_rate from tax_amount and subtotal as fallback
      const subtotal =
        parseFloat(selectedReceipt.subtotal) || parseFloat(selectedReceipt.purchasePrice) || 0;
      const taxAmount = parseFloat(tax.tax_amount) || 0;
      let calculatedRate = 0;
      if (subtotal > 0 && taxAmount > 0) {
        calculatedRate = Math.round((taxAmount / subtotal) * 100);
      }

      return {
        ...tax,
        tax_name: tax.tax_name || "Tax",
        tax_rate: tax.tax_rate || calculatedRate.toString(),
      };
    });
  }, [selectedReceipt, taxData]);

  if (!selectedReceipt) return null;

  const currentIndex = findReceiptIndexInList(
    sortedReceipts,
    selectedReceipt.id
  );

  const goToPrevious = () => {
    if (currentIndex <= 0) return;
    const prevIndex = currentIndex - 1;
    const prevReceipt = sortedReceipts[prevIndex];
    if (!prevReceipt) return;
    setDirection(-1);
    tagsDirtyRef.current = false;
    lastInitReceiptIdRef.current = null;
    setSelectedReceipt(prevReceipt);
    currentSelectedIdRef.current = prevReceipt.id;
    if (setSelectedIndex) {
      setSelectedIndex(prevIndex);
      lastReportedIndexRef.current = prevIndex;
    }
  };

  const goToNext = () => {
    if (currentIndex < 0 || currentIndex >= sortedReceipts.length - 1) return;
    const nextIndex = currentIndex + 1;
    const nextReceipt = sortedReceipts[nextIndex];
    if (!nextReceipt) return;
    setDirection(1);
    tagsDirtyRef.current = false;
    lastInitReceiptIdRef.current = null;
    setSelectedReceipt(nextReceipt);
    currentSelectedIdRef.current = nextReceipt.id;
    if (setSelectedIndex) {
      setSelectedIndex(nextIndex);
      lastReportedIndexRef.current = nextIndex;
    }
  };

  const handleSwipeStart = (clientX) => {
    setStartX(clientX);
    setIsSwiping(true);
  };

  const handleSwipeEnd = (clientX) => {
    if (startX === null || !isSwiping) return;

    const diff = startX - clientX;
    const swipeThreshold = 50;

    if (Math.abs(diff) > swipeThreshold) {
      // Normal receipts: swipe left (diff > 0) → next, swipe right (diff < 0) → previous
      // Draft receipts:  swipe right (diff < 0) → next, swipe left (diff > 0) → previous
      const goingNext = reversedSwipe ? diff < 0 : diff > 0;
      const canGoNext =
        currentIndex >= 0 && currentIndex < sortedReceipts.length - 1;
      const canGoPrevious = currentIndex > 0;
      if (goingNext && canGoNext) {
        goToNext();
      } else if (!goingNext && canGoPrevious) {
        goToPrevious();
      }
    }

    setStartX(null);
    setIsSwiping(false);
  };

  const shouldIgnoreSwipeTarget = (target) =>
    !!target?.closest?.(SWIPE_IGNORE_SELECTOR);

  const onContainerTouchStart = (e) => {
    if (annotatorUrl || e.touches.length !== 1 || shouldIgnoreSwipeTarget(e.target)) {
      swipeGestureActiveRef.current = false;
      return;
    }
    swipeGestureActiveRef.current = true;
    handleSwipeStart(e.touches[0].clientX);
  };

  const onContainerTouchEnd = (e) => {
    if (annotatorUrl || !swipeGestureActiveRef.current || e.changedTouches.length !== 1) return;
    handleSwipeEnd(e.changedTouches[0].clientX);
    swipeGestureActiveRef.current = false;
  };

  const r = selectedReceipt;

  // A receipt is in "Draft / eReceipt" mode when it came via email forwarding
  // and has not yet been verified. In this mode:
  //   - The black X close button is hidden (use "Keep in Draft Mode" to dismiss)
  //   - "Keep in Draft Mode" button appears in the footer
  //   - Saving sets is_verify = "1" so it moves to the regular receipt list
  // isDraft mirrors isToBeVerified() in useReceiptGrouping:
  //   - is_draft === "1"  → always draft
  //   - has email ID + is_verify !== "1" + not a network-received receipt → draft
  //   - Once saved (is_verify = "1"), isDraft becomes false → "Keep in Draft Mode" disappears
  // isDraft must mirror isToBeVerified() in useReceiptGrouping exactly so that
  // "Save Changes" sends is_verify:"1" for the same receipts shown as drafts.
  // Bug fix: !r?.fk_forward_from_receipt_id evaluates to false when value is "0"
  // (a non-empty string is truthy). Must explicitly compare against "0" and 0.
  const isNetworkReceived =
    r?.fk_forward_from_receipt_id &&
    r.fk_forward_from_receipt_id !== "0" &&
    r.fk_forward_from_receipt_id !== 0;
  const isDraft =
    r?.is_draft === "1" ||
    (
      r?.fk_incoming_email_id &&
      r.fk_incoming_email_id !== "0" &&
      r.fk_incoming_email_id !== 0 &&
      r.fk_incoming_email_id !== null &&
      String(r?.is_verify ?? "0") !== "1" &&
      !isNetworkReceived
    );

  const formatDate = (timestamp) => {
    if (!timestamp) return "";
    return formatReceiptDateLong(
      timestamp,
      selectedReceipt?.create_date ?? editedReceipt?.create_date,
    );
  };

  const sanitizeMoneyInput = (raw) => {
    if (raw === null || raw === undefined) return "";
    const cleaned = String(raw).replace(/[^0-9.]/g, "");
    if (!cleaned) return "";
    const [intPartRaw = "", decRaw = ""] = cleaned.split(".");
    const intPart = intPartRaw.replace(/^0+(?=\d)/, "") || (intPartRaw ? "0" : "");
    const decPart = (decRaw || "").slice(0, 2);
    return cleaned.includes(".") ? `${intPart || "0"}.${decPart}` : intPart;
  };
  /** Block non-numeric keys from monetary inputs at the keyboard level. */
  const preventInvalidMoneyKey = (e) => {
    if (e.ctrlKey || e.metaKey) return; // allow Ctrl+C, Ctrl+V, Ctrl+A, etc.
    const allowed = ["Backspace", "Delete", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Tab", "Enter", "Home", "End"];
    if (allowed.includes(e.key)) return;
    if (/^\d$/.test(e.key)) return; // digits 0-9
    if (e.key === ".") return;       // decimal point
    e.preventDefault();
  };

  const collectReceiptMediaUrlsForSave = () => {
    const urls = [];
    const pushUnique = (candidate) => {
      const normalized = normalizeMediaUrl(candidate);
      if (!normalized || normalized === "0" || urls.includes(normalized)) return;
      urls.push(normalized);
    };

    splitMediaField(editedReceipt.receipt_image ?? selectedReceipt.receipt_image ?? "").forEach(
      pushUnique
    );
    splitMediaField(
      editedReceipt.emailAttachment ?? selectedReceipt.emailAttachment ?? ""
    ).forEach(pushUnique);
    additionalPhotoUrls.forEach(pushUnique);

    const pending = pendingAnnotatedMediaRef.current;
    if (pending?.persistUrl && pending.normOld) {
      const idx = urls.findIndex((u) => mediaUrlsEqual(u, pending.normOld));
      if (idx >= 0) {
        urls[idx] = normalizeMediaUrl(pending.persistUrl);
      } else if (!urls.some((u) => mediaUrlsEqual(u, pending.persistUrl))) {
        urls.unshift(normalizeMediaUrl(pending.persistUrl));
      }
    }

    const cleaned = urls.filter(
      (u) => u && !u.startsWith("data:") && !u.startsWith("blob:")
    );
    return dedupeEmailAttachmentPdfUrls(cleaned);
  };

  const normalizeMatchKey = (value) =>
    String(value || "")
      .trim()
      .replace(/\s+/g, " ")
      .toLowerCase();

  // Function to parse receipt tags
  const parseReceiptTags = (receiptTagString) => {
    if (!receiptTagString) return null;

    const tags = receiptTagString.split(",").map((tag) => tag.trim());

    return {
      locked: tags[0] === "1",
      starred: tags[1] === "1",
      flagged: tags[2] === "1",
      verified: tags[3] === "1",
      reconciled: tags[4] === "1",
      reimbursed: tags[5] === "1",
      warrantied: tags[6] === "1",
    };
  };

  const receiptTags = parseReceiptTags(r.receipt_tag);

  // ── Merchant-category intelligence ──────────────────────────────────────────
  // Scans existing receipts to find the most-recently-used expense category for
  // the given merchant. Returns "" when no history is found.
  const getMerchantDefaultCategory = React.useCallback(
    (merchantName) => {
      if (!merchantName?.trim() || !receipts?.length) return "";
      const normalized = merchantName.toLowerCase().trim();
      const matches = (receipts || [])
        .filter((r) => {
          const rStore = (r.storeName || r.store_name || "").toLowerCase().trim();
          return rStore === normalized && (r.expense_type || "").trim();
        })
        .sort((a, b) => {
          const dA = new Date(a.product_date || a.productDate || 0);
          const dB = new Date(b.product_date || b.productDate || 0);
          return dB - dA; // newest first
        });
      return matches[0]?.expense_type?.trim() || "";
    },
    [receipts]
  );

  // Handle field changes in edit mode
  const handleFieldChange = (field, value) => {
    if (editedTags.locked) return; // Receipt is locked — prevent any changes
    if (field === "notes") {
      const raw = (value || "").toString();
      setNotesOverflow(raw.length > MAX_NOTES_LENGTH);
      value = raw.slice(0, MAX_NOTES_LENGTH);
    }
    if (field === "product_name") {
      const raw = (value || "").toString();
      setDescriptionOverflow(raw.length > MAX_DESCRIPTION_LENGTH);
      value = raw.slice(0, MAX_DESCRIPTION_LENGTH);
    }
    // Normalize image URL fields so they're properly encoded for both web and mobile
    if (field === "emailAttachment" || field === "receipt_image") {
      value = normalizeMediaUrl(value) || "0";
    }
    if (field === "subtotal" || field === "purchasePrice" || field === "tip") {
      value = sanitizeMoneyInput(value);
    }
    setEditedReceipt((prev) => {
      const newData = { ...prev, [field]: value };

      // Clear cached payment logos when payment fields change (prevents stale Diners/Visa logos on "Other")
      if (
        field === "paymentType" ||
        field === "card_issuer_name" ||
        field === "last_4_digit_card" ||
        field === "paymentBrand"
      ) {
        newData.payment_logo_url = "";
        newData.paymentLogoUrl = "";
      }

      // When total changes, recalculate subtotal and tax amounts from rates
      if (field === "purchasePrice") {
        const total = parseFloat(value) || 0;
        const tipAmount = parseFloat(newData.tip) || 0;
        const taxValues = newData.receipt_tax_values || [];
        const recalculated = recalculateReceiptTotalsFromFixedTotal(
          total,
          taxValues,
          tipAmount,
        );
        newData.subtotal = recalculated.subtotal;
        newData.receipt_tax_values = recalculated.receipt_tax_values;
      }

      // When tip changes, keep total fixed and recalculate subtotal/taxes from rates
      if (field === "tip") {
        const total =
          parseFloat(newData.purchasePrice) ||
          parseFloat(r.total) ||
          parseFloat(r.purchasePrice) ||
          0;
        const tipAmount = parseFloat(value) || 0;
        const taxValues = newData.receipt_tax_values || [];
        const recalculated = recalculateReceiptTotalsFromFixedTotal(
          total,
          taxValues,
          tipAmount,
        );
        newData.subtotal = recalculated.subtotal;
        newData.receipt_tax_values = recalculated.receipt_tax_values;
        newData.purchasePrice = prev.purchasePrice;
      }

      return newData;
    });
  };

  // Payment card types are now defined in EditPaymentMethodModal (PAYMENT_CARD_TYPES)

  const handleOpenAddPaymentModal = () => {
    setPayModalError(null);
    setNewPaymentCardType("");
    setNewCardIssuerName("");
    setNewLast4Digits("");
    setNewPaymentCategoryType("");
    setShowAddPaymentModal(true);
    setShowPaymentDropdown(false);
  };

  const handleCloseAddPaymentModal = () => {
    if (isPayMethodSaving) return;
    setNewPaymentCardType("");
    setNewCardIssuerName("");
    setNewLast4Digits("");
    setNewPaymentCategoryType("");
    setShowAddPaymentModal(false);
    setPayModalEditMode(null);
    setPayModalError(null);
  };

  // ── Payment method delete from dropdown ───────────────────────────────────

  const getPaymentDisplayForReceipt = (r) => getPaymentDisplayFromReceipt(r);

  const getReceiptsMatchingPaymentMethod = (methodName) => {
    const { issuer: oldIssuer, last4: oldLast4 } = parsePaymentDisplay(methodName || "");
    const targetKey = normalizePaymentMatchKey(methodName);
    const exactByDisplay = (receipts || []).filter(
      (r) => normalizePaymentMatchKey(getPaymentDisplayForReceipt(r)) === targetKey
    );
    const exactIds = new Set(exactByDisplay.map((r) => r.id));
    const additionalByFields = oldLast4
      ? (receipts || []).filter((r) => {
          if (exactIds.has(r.id)) return false;
          const rLast4 = (r.last_4_digit_card || r.last4DigitCard || "").toString().trim();
          if (rLast4 !== oldLast4) return false;
          const rIssuer = (r.card_issuer_name || r.cardIssuerName || "").toString().trim().toLowerCase();
          const rTypeLower = (r.paymentType || r.payment_type || "")
            .toString()
            .replace(/\s*\*\d{3,4}$/, "")
            .trim()
            .toLowerCase();
          const oldIssuerLower = (oldIssuer || "").toLowerCase();
          return (
            (oldIssuerLower && rIssuer === oldIssuerLower) ||
            (oldIssuerLower && rTypeLower === oldIssuerLower)
          );
        })
      : [];
    return [...exactByDisplay, ...additionalByFields];
  };

  const handleDeletePaymentInDropdown = (method) => {
    if (isCashPaymentMethod(method)) return; // safety
    setPendingPayDeleteMethod(method);
    setShowPayDeleteConfirm(true);
  };

  const doConfirmPayDeleteInDropdown = async () => {
    setShowPayDeleteConfirm(false);
    const method = pendingPayDeleteMethod;
    setPendingPayDeleteMethod(null);
    if (!method) return;
    setIsPayMethodSaving(true);
    try {
      const matchingReceipts = getReceiptsMatchingPaymentMethod(method);
      if (matchingReceipts.length > 0) {
        await Promise.all(
          matchingReceipts.map((r) =>
            updateReceipt(r.id, {
              paymentType: "Cash",
              card_issuer_name: "",
              last_4_digit_card: "",
            })
          )
        );
      }
      const apiMatch = (apiPaymentMethods || []).find(
        (p) => apiPaymentMethodMatchesLabel(p, method)
      );
      const targetApiId = apiMatch
        ? (apiMatch.id ?? apiMatch.payment_method_id ?? apiMatch.fk_payment_method_id ?? null)
        : null;
      await deleteApiPaymentMethod(targetApiId, method);
      hidePaymentMethod(method);
      deleteCustomPaymentMethod(method);
      await Promise.all([fetchApiPaymentMethods(), silentRefreshData(0)]);
      const targetKey = normalizePaymentMatchKey(method);
      if (normalizePaymentMatchKey(getPaymentDisplayForReceipt(editedReceipt)) === targetKey) {
        handleFieldChange("paymentType", "Cash");
        handleFieldChange("card_issuer_name", "");
        handleFieldChange("last_4_digit_card", "");
      }
      setToast({ isVisible: true, message: "Payment Method Deleted", type: "success" });
    } catch (err) {
      setToast({
        isVisible: true,
        message: err.message || "Failed to delete payment method.",
        type: "error",
      });
    } finally {
      setIsPayMethodSaving(false);
    }
  };

  const handleEditPaymentInDropdown = (method) => {
    if (isCashPaymentMethod(method)) return;
    const { issuer, last4 } = parsePaymentDisplay(method);
    const _pct = readPayCardTypeMap();
    const apiMatch = (apiPaymentMethods || []).find(
      (p) => apiPaymentMethodMatchesLabel(p, method)
    );
    const apiId = apiMatch
      ? (apiMatch.id ?? apiMatch.payment_method_id ?? apiMatch.fk_payment_method_id ?? null)
      : null;
    // Prefer the authoritative card_type integer from the API record over keyword inference
    const brandFromApiType = apiMatch ? cardTypeIntToBrand(apiMatch.card_type) : "";
    const cardType = brandFromApiType || _pct[method] || inferCardTypeFromPayment(method);
    setNewPaymentCardType(cardType);
    // Leave Card Issuer empty when the name is only brand + last4 (same as Settings).
    setNewCardIssuerName(isCustomCardIssuer(issuer, cardType) ? issuer : "");
    setNewLast4Digits(last4 || "");
    const _pet = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_expense_type") || "{}"); } catch { return {}; } })();
    setNewPaymentCategoryType(_pet[method] || "");
    setPayModalEditMode({ name: method, apiId });
    setPayModalError(null);
    setShowAddPaymentModal(true);
    setShowPaymentDropdown(false);
  };

  const handleAddPaymentMethod = async () => {
    if (!newPaymentCardType || newPaymentCardType.trim().length === 0) {
      setPayModalError("Select Card Type");
      return;
    }
    if (!newLast4Digits || newLast4Digits.trim().replace(/\D/g, "").length < 4) {
      setPayModalError("Please enter last 4 digits of card number");
      return;
    }
    if (paymentDuplicateError) {
      setPayModalError("Payment Method already exists");
      return;
    }
    setPayModalError(null);

    // Resolve card type display name
    const cardTypeLower = newPaymentCardType.trim().toLowerCase();
    let selectedCardTypeForLogo = newPaymentCardType.trim();
    if (cardTypeLower.includes("visa")) selectedCardTypeForLogo = "Visa";
    else if (cardTypeLower.includes("master")) selectedCardTypeForLogo = "MasterCard";
    else if (cardTypeLower.includes("american express") || cardTypeLower.includes("amex")) selectedCardTypeForLogo = "American Express";
    else if (cardTypeLower.includes("discover")) selectedCardTypeForLogo = "Discover";
    else if (cardTypeLower.includes("diners")) selectedCardTypeForLogo = "Diners Club";
    else if (cardTypeLower.includes("paypal")) selectedCardTypeForLogo = "PayPal";
    else if (cardTypeLower.includes("debit")) selectedCardTypeForLogo = "Debit Card";
    else if (cardTypeLower === "other") selectedCardTypeForLogo = "Other";

    const customIssuer = newCardIssuerName.trim();
    const last4 = newLast4Digits.trim().replace(/\D/g, "").slice(0, 4);
    const storedIssuer = storedCardIssuerName(customIssuer, selectedCardTypeForLogo);
    const newPayStr = buildPaymentMethodStorageString(
      customIssuer,
      selectedCardTypeForLogo,
      last4
    );

    const PAYMENT_LOGOS = { Visa: Visa, MasterCard: MasterCard, "American Express": AmericanExpress, Discover: Discover, "Diners Club": DinersClub, PayPal: PayPal, "Debit Card": DebitCard, Cash: Cash };
    const logoUrl = PAYMENT_LOGOS[selectedCardTypeForLogo] || "";

    // ── EDIT MODE ────────────────────────────────────────────────────────────
    if (payModalEditMode) {
      const { name: oldName, apiId } = payModalEditMode;
      setPendingPayMethodFn(() => async () => {
        if (apiId != null) {
          await updateApiPaymentMethod(
            apiId,
            {
              cardIssuerName: storedIssuer,
              cardTypeBrand: selectedCardTypeForLogo,
              last4,
            },
            logoUrl
          );
        }
        const matchingReceipts = (receipts || []).filter(
          (r) => getPaymentDisplayForReceipt(r).toLowerCase() === (oldName || "").toLowerCase()
        );
        if (matchingReceipts.length > 0) {
          await Promise.all(matchingReceipts.map(r => updateReceipt(r.id, {
            paymentType: selectedCardTypeForLogo,
            card_issuer_name: storedIssuer,
            last_4_digit_card: last4 || r.last_4_digit_card || "",
            payment_logo_url: "",
            paymentLogoUrl: "",
          })));
        }
        const _pct = readPayCardTypeMap();
        _pct[newPayStr] = selectedCardTypeForLogo;
        localStorage.setItem("cat_pay_card_types", JSON.stringify(_pct));
        if (newPaymentCategoryType) {
          const _pet = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_expense_type") || "{}"); } catch { return {}; } })();
          _pet[newPayStr] = newPaymentCategoryType;
          localStorage.setItem("cat_pay_expense_type", JSON.stringify(_pet));
        }
        editCustomPaymentMethod(oldName, newPayStr);
        await fetchApiPaymentMethods();
        handleFieldChange("paymentType", selectedCardTypeForLogo);
        handleFieldChange("paymentBrand", "");
        handleFieldChange("card_issuer_name", storedIssuer);
        handleFieldChange("last_4_digit_card", last4);
        handleFieldChange("payment_logo_url", "");
        handleFieldChange("paymentLogoUrl", "");
        setPayModalEditMode(null);
        handleCloseAddPaymentModal();
        setToast({ isVisible: true, message: "Payment Method Updated", type: "success" });
      });
      setPayMethodConfirmMessage(
        "When editing a payment method, all receipts associated with that payment method will also be updated."
      );
      setShowPayMethodConfirm(true);
      return;
    }

    // ── ADD MODE ─────────────────────────────────────────────────────────────
    // No confirmation needed for add — save directly
    setIsPayMethodSaving(true);
    try {
      handleFieldChange("paymentType", selectedCardTypeForLogo);
      handleFieldChange("paymentBrand", "");
      handleFieldChange("card_issuer_name", storedIssuer);
      if (last4.length > 0) {
        handleFieldChange("last_4_digit_card", last4);
      } else {
        handleFieldChange("last_4_digit_card", "");
      }
      await addApiPaymentMethod(
        {
          cardIssuerName: storedIssuer,
          cardTypeBrand: selectedCardTypeForLogo,
          last4,
        },
        logoUrl
      );
      const _pct = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_card_types") || "{}"); } catch { return {}; } })();
      _pct[newPayStr] = selectedCardTypeForLogo;
      localStorage.setItem("cat_pay_card_types", JSON.stringify(_pct));
      if (newPaymentCategoryType) {
        const _pet = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_expense_type") || "{}"); } catch { return {}; } })();
        _pet[newPayStr] = newPaymentCategoryType;
        localStorage.setItem("cat_pay_expense_type", JSON.stringify(_pet));
      }
      await fetchApiPaymentMethods();
      handleCloseAddPaymentModal();
      setToast({ isVisible: true, message: "Payment Method Added", type: "success" });
    } catch (e) {
      setToast({ isVisible: true, message: e?.message || "Save failed", type: "error" });
    } finally {
      setIsPayMethodSaving(false);
    }
  };

  // ============ Tax Management Functions ============

  const MAX_RECEIPT_TAX_TYPES = 2;
  const MAX_RECEIPT_TAX_MSG =
    "A maximum of two tax types can be selected. Please remove one before selecting another.";

  // Add a tax type to the current receipt's tax values
  const addTaxToReceipt = (tax, { silent = false } = {}) => {
    const currentTaxValues =
      editedReceipt.receipt_tax_values ||
      enrichedReceiptTaxValues.filter(
        (t) => !(t.tax_name || "").toLowerCase().includes("tip")
      ) ||
      [];

    const alreadyExists = currentTaxValues.some((t) => taxTypesMatch(t, tax));
    if (alreadyExists) return;
    if (currentTaxValues.length >= MAX_RECEIPT_TAX_TYPES) {
      if (!silent) setAlertMsg(MAX_RECEIPT_TAX_MSG);
      return;
    }

    setEditedReceipt((prev) => {
      const prevTaxValues =
        prev.receipt_tax_values ||
        enrichedReceiptTaxValues.filter(
          (t) => !(t.tax_name || "").toLowerCase().includes("tip")
        ) ||
        [];

      if (prevTaxValues.some((t) => taxDefinitionMatchesReceiptLine(t, tax))) {
        return prev;
      }
      if (prevTaxValues.length >= MAX_RECEIPT_TAX_TYPES) return prev;
      const total =
        parseFloat(prev.purchasePrice) ||
        parseFloat(r.total) ||
        parseFloat(r.purchasePrice) ||
        0;
      const tipAmount =
        parseFloat(prev.tip) ||
        (tipTax?.tax_amount ? parseFloat(tipTax.tax_amount) : 0);

      // Add the new tax entry with all required API fields
      const fk_user_id = parseInt(localStorage.getItem("fk_user_id")) || 0;
      const defFromTaxData =
        Array.isArray(taxData)
          ? taxData.find((t) => parseInt(t.id) === parseInt(tax.id))
          : null;
      const taxRate = formatTaxRate(defFromTaxData?.tax_rate ?? tax.tax_rate);
      const newTaxEntry = {
        id: 0,
        fk_user_id: fk_user_id,
        fk_receipt_id: selectedReceipt?.id || 0,
        fk_tax_id: tax.id || 0,
        tax_name: defFromTaxData?.tax_name || tax.tax_name,
        tax_rate: taxRate,
        tax_amount: 0,
        tax_number: tax.tax_number || "",
        created: 0,
        updated: 0,
      };
      // Sort alphabetically so tax fields always render in A→Z order
      const newTaxValues = [...prevTaxValues, newTaxEntry]
        .sort((a, b) => (a.tax_name || "").localeCompare(b.tax_name || ""));

      const { subtotal, receipt_tax_values } = recalculateReceiptTotalsFromFixedTotal(
        total,
        newTaxValues,
        tipAmount,
      );

      return {
        ...prev,
        receipt_tax_values,
        subtotal,
        purchasePrice: prev.purchasePrice,
      };
    });
  };

  // Remove a tax type from the current receipt's tax values
  const removeTaxFromReceipt = (index) => {
    setEditedReceipt((prev) => {
      const currentTaxValues =
        prev.receipt_tax_values ||
        enrichedReceiptTaxValues.filter(
          (t) => !(t.tax_name || "").toLowerCase().includes("tip")
        ) ||
        [];
      const newTaxValues = currentTaxValues.filter((_, i) => i !== index);

      const total =
        parseFloat(prev.purchasePrice) ||
        parseFloat(r.total) ||
        parseFloat(r.purchasePrice) ||
        0;
      const tipAmount =
        parseFloat(prev.tip) ||
        (tipTax?.tax_amount ? parseFloat(tipTax.tax_amount) : 0);

      const { subtotal, receipt_tax_values } = recalculateReceiptTotalsFromFixedTotal(
        total,
        newTaxValues,
        tipAmount,
      );

      return {
        ...prev,
        receipt_tax_values,
        subtotal,
        purchasePrice: prev.purchasePrice,
      };
    });
  };

  // Tax amount input: keep total fixed; recalc subtotal and all tax rows from rates.
  const handleTaxAmountChange = (index, rawValue) => {
    const numeric = sanitizeMoneyInput(rawValue);
    const fieldKey = index === 0 ? "tax0" : "tax1";
    setCurrencyInputs((p) => ({ ...p, [fieldKey]: numeric ? `$${numeric}` : "$" }));
    setEditedReceipt((prev) => {
      const currentTaxValues =
        prev.receipt_tax_values ||
        enrichedReceiptTaxValues.filter(
          (t) => !(t.tax_name || "").toLowerCase().includes("tip")
        ) ||
        [];
      const updatedTaxValues = currentTaxValues.map((t, i) =>
        i === index ? { ...t, tax_amount: numeric === "" ? 0 : parseFloat(numeric) } : t
      );
      const total =
        parseFloat(prev.purchasePrice) ||
        parseFloat(r.total) ||
        parseFloat(r.purchasePrice) ||
        0;
      const tipAmount =
        parseFloat(prev.tip) ||
        (tipTax?.tax_amount ? parseFloat(tipTax.tax_amount) : 0);
      const { subtotal, receipt_tax_values } = recalculateReceiptTotalsFromFixedTotal(
        total,
        updatedTaxValues,
        tipAmount,
      );
      return {
        ...prev,
        receipt_tax_values,
        subtotal,
        purchasePrice: prev.purchasePrice,
      };
    });
  };

  // ── Tax field validation helpers ─────────────────────────────────────────
  const TAX_NAME_MAX = 15;
  const TAX_RATE_MAX = 99.999;
  const TAX_NUMBER_MAX = 35;

  const isDuplicateTaxName = (name, excludeId = null) =>
    allTaxTypes.some(t =>
      t.tax_name.trim().toLowerCase() === name.trim().toLowerCase() &&
      (excludeId === null || t.id !== excludeId)
    );

  const hasMoreThan3Decimals = (val) => {
    const str = String(val).replace(/%/g, "").trim();
    const dot = str.indexOf(".");
    return dot !== -1 && str.length - dot - 1 > 3;
  };

  const { message: taxRateLimitAlert, showAlert: showTaxRateLimitAlert, clearAlert: clearTaxRateLimitAlert } = useTaxRateLimitAlert();

  const isBlockedTaxRateInput = (val) => {
    const str = String(val).replace(/%/g, "").trim();
    return str === "99.999" || str === "999";
  };

  const taxNameError = newTaxName.length > TAX_NAME_MAX
    ? `Tax Name cannot exceed ${TAX_NAME_MAX} characters (${newTaxName.length}/${TAX_NAME_MAX})`
    : (newTaxName.trim() && isDuplicateTaxName(newTaxName.trim(), editingTaxId || null)
      ? `"${newTaxName.trim()}" already exists. Please use a different name.`
      : "");

  const taxRateError = (newTaxRate !== "" && isBlockedTaxRateInput(newTaxRate)
    ? "Tax Rate cannot be 99.999 or 999."
    : (newTaxRate !== "" && parseFloat(newTaxRate) > TAX_RATE_MAX
    ? `Tax Rate cannot exceed ${TAX_RATE_MAX}%`
    : (newTaxRate !== "" && hasMoreThan3Decimals(newTaxRate)
      ? "Tax Rate can have a maximum of 3 decimal places (e.g. 10.894%)"
      : "")));

  const taxNumberError = newTaxNumber.length > TAX_NUMBER_MAX
    ? `Tax Number cannot exceed ${TAX_NUMBER_MAX} characters (${newTaxNumber.length}/${TAX_NUMBER_MAX})`
    : null;

  // Manage Tax Types modal handlers
  const handleAddTaxType = async () => {
    if (isSavingTax) return;

    if (!newTaxName.trim()) {
      setTaxError("Please enter Tax Name");
      return;
    }
    if (!newTaxRate.trim()) {
      setTaxError("Please enter Tax Rate");
      return;
    }
    if (isDuplicateTaxName(newTaxName.trim())) {
      setToast({ isVisible: true, message: "Tax Type already exists", type: "error" });
      return;
    }
    if (hasMoreThan3Decimals(newTaxRate)) {
      setTaxError("Tax Rate can have a maximum of 3 decimal places (e.g. 10.894%).");
      return;
    }
    if (isBlockedTaxRateInput(newTaxRate)) {
      setTaxError("Tax Rate cannot be 99.999 or 999.");
      return;
    }
    setIsSavingTax(true);
    setTaxError(null);
    try {
      const fk_user_id = localStorage.getItem("fk_user_id") || "0";
      const taxPayload = {
        id: 0,
        fk_user_id: parseInt(fk_user_id),
        tax_name: newTaxName.trim(),
        tax_rate: newTaxRate.trim(),
        tax_number: newTaxNumber.trim() || "",
        is_default_tax: 0,
        is_tips: 0,
        default_tax_order: 0,
        created: 0,
        udpated: 0,
      };
      await addTax(taxPayload);

      // Reset form immediately to prevent flashing error state
      setNewTaxName("");
      setNewTaxRate("");
      setNewTaxNumber("");
      clearTaxRateLimitAlert();
      setShowAddTaxForm(false);
      
      setToast({ isVisible: true, message: "Tax Type Added", type: "success" });
    } catch (err) {
      console.error("Error adding tax:", err);
      setTaxError(err.message || "Failed to add tax type.");
    } finally {
      setIsSavingTax(false);
    }
  };

  const handleUpdateTaxType = async () => {
    if (isSavingTax) return;
    if (!editingTaxId || !newTaxName.trim() || !newTaxRate.trim()) {
      setTaxError("Tax Name and Tax Rate are required.");
      return;
    }
    if (isDuplicateTaxName(newTaxName.trim(), editingTaxId)) {
      setToast({ isVisible: true, message: "Tax Type already exists", type: "error" });
      return;
    }
    if (isBlockedTaxRateInput(newTaxRate)) {
      setTaxError("Tax Rate cannot be 99.999 or 999.");
      return;
    }
    if (hasMoreThan3Decimals(newTaxRate)) {
      setTaxError("Tax Rate can have a maximum of 3 decimal places.");
      return;
    }
    const cleanRate = String(newTaxRate).replace(/%/g, "").trim();
    const allKnown = [...(taxData || []), ...localTaxTypes];
    const existingTaxForRateCheck = allKnown.find((t) => t.id === editingTaxId);
    if (
      existingTaxForRateCheck &&
      taxRatesDiffer(existingTaxForRateCheck.tax_rate, cleanRate)
    ) {
      setPendingTaxUpdate({
        newName: newTaxName.trim(),
        newRate: cleanRate,
        newNumber: newTaxNumber.trim(),
      });
      setShowTaxRateChangeWarning(true);
      return;
    }
    setIsSavingTax(true);
    setTaxError(null);
    try {
      const fk_user_id = localStorage.getItem("fk_user_id") || "0";
      const existingTax = existingTaxForRateCheck;
      const taxPayload = {
        id: editingTaxId,
        fk_user_id: parseInt(fk_user_id),
        tax_name: newTaxName.trim(),
        tax_rate: cleanRate,
        tax_number: newTaxNumber.trim() || "",
        is_default_tax: parseInt(existingTax?.is_default_tax) || 0,
        is_tips: parseInt(existingTax?.is_tips) || 0,
        default_tax_order: existingTax?.default_tax_order || 0,
        created: existingTax?.created || 0,
        udpated: Date.now(),
      };
      await updateTax(taxPayload);
      await propagateTaxNameChangeToReceipts({
        receipts,
        taxId: editingTaxId,
        oldName: existingTax?.tax_name,
        newName: newTaxName.trim(),
        updateReceipt,
      });
      await fetchTaxes();
      setNewTaxName("");
      setNewTaxRate("");
      setNewTaxNumber("");
      clearTaxRateLimitAlert();
      setEditingTaxId(null);
      setShowAddTaxForm(false);
      setToast({ isVisible: true, message: "Tax Type Updated", type: "success" });
    } catch (err) {
      console.error("Error updating tax:", err);
      setTaxError(err.message || "Failed to update tax type.");
    } finally {
      setIsSavingTax(false);
    }
  };

  const handleAddNewTaxTypeFromRateWarning = () => {
    if (!pendingTaxUpdate) return;
    const allKnown = [...(taxData || []), ...localTaxTypes];
    const existingTax = allKnown.find((t) => t.id === editingTaxId);
    const baseName = existingTax?.tax_name || pendingTaxUpdate.newName;
    const incremented = buildIncrementedTaxName(
      baseName,
      allKnown.map((t) => t.tax_name),
    );
    setShowTaxRateChangeWarning(false);
    setPendingTaxUpdate(null);
    setEditingTaxId(null);
    setShowAddTaxForm(true);
    setNewTaxName(incremented);
    setNewTaxRate(pendingTaxUpdate.newRate);
    setNewTaxNumber(
      pendingTaxUpdate.newNumber || existingTax?.tax_number || "",
    );
    setTaxError(null);
  };

  const confirmTaxRateChange = async () => {
    if (isSavingTax || !pendingTaxUpdate || !editingTaxId) return;
    setShowTaxRateChangeWarning(false);
    const { newName, newRate, newNumber } = pendingTaxUpdate;
    const taxIdBeingEdited = editingTaxId;
    setPendingTaxUpdate(null);
    setIsSavingTax(true);
    setTaxError(null);
    try {
      const fk_user_id = localStorage.getItem("fk_user_id") || "0";
      const allKnown = [...(taxData || []), ...localTaxTypes];
      const existingTax = allKnown.find((t) => t.id === taxIdBeingEdited);
      await propagateTaxRateChangeToReceipts({
        receipts,
        taxId: taxIdBeingEdited,
        oldRate: existingTax?.tax_rate,
        oldName: existingTax?.tax_name,
        updateReceipt,
      });
      await updateTax({
        id: taxIdBeingEdited,
        fk_user_id: parseInt(fk_user_id),
        tax_name: newName,
        tax_rate: newRate,
        tax_number: newNumber || "",
        is_default_tax: parseInt(existingTax?.is_default_tax) || 0,
        is_tips: parseInt(existingTax?.is_tips) || 0,
        default_tax_order: existingTax?.default_tax_order || 0,
        created: existingTax?.created || 0,
        udpated: Date.now(),
      });
      if (
        (newName || "").trim().toLowerCase() !==
        (existingTax?.tax_name || "").trim().toLowerCase()
      ) {
        await propagateTaxNameChangeToReceipts({
          receipts,
          taxId: taxIdBeingEdited,
          oldName: existingTax?.tax_name,
          newName,
          updateReceipt,
        });
      }
      await fetchTaxes();
      // Refresh labels on the open edit form (amounts stay frozen on the line).
      setEditedReceipt((prev) => {
        if (!prev?.receipt_tax_values?.length) return prev;
        const idStr = String(taxIdBeingEdited);
        return {
          ...prev,
          receipt_tax_values: prev.receipt_tax_values.map((line) => {
            if (String(line?.fk_tax_id || "") === idStr) {
              return { ...line, tax_name: newName };
            }
            return line;
          }),
        };
      });
      setNewTaxName("");
      setNewTaxRate("");
      setNewTaxNumber("");
      setEditingTaxId(null);
      clearTaxRateLimitAlert();
      setShowAddTaxForm(false);
      setTaxError(null);
      setToast({ isVisible: true, message: "Tax Type Updated", type: "success" });
    } catch (err) {
      setTaxError(err.message || "Failed to update tax type.");
    } finally {
      setIsSavingTax(false);
    }
  };

  const handleDeleteTaxType = (taxId) => {
    const targetTax =
      (taxData || []).find((t) => t.id === taxId) ||
      allTaxTypes.find((t) => t.id === taxId);
    const matching = getReceiptsUsingTax(receipts, taxId, targetTax?.tax_name);
    if (matching.length > 0) {
      setShowTaxDeleteBlockedMsg(true);
      return;
    }
    setDeletingTaxId(taxId);
    setShowDeleteTaxConfirm(true);
  };

  const handleConfirmDeleteTax = async () => {
    if (!deletingTaxId) return;
    setIsDeletingTax(true);
    setTaxError(null);
    try {
      await deleteTax(deletingTaxId);
      setLocalTaxTypes((prev) => prev.filter((t) => t.id !== deletingTaxId));
      await fetchTaxes();
    } catch (err) {
      console.error("Error deleting tax:", err);
      setTaxError(err.message || "Failed to delete tax type.");
    } finally {
      setIsDeletingTax(false);
      setShowDeleteTaxConfirm(false);
      setDeletingTaxId(null);
    }
  };

  const handleEditTax = (tax) => {
    setEditingTaxId(tax.id);
    setNewTaxName(tax.tax_name || "");
    // Normalize stored rate (e.g. backend may persist "6.5000") so the input shows
    // "6.5" rather than "6.5000"/"6.500" and doesn't trigger the >3-decimal banner.
    const rawRate = tax.tax_rate;
    setNewTaxRate(rawRate === undefined || rawRate === null || rawRate === "" ? "" : formatTaxRate(rawRate));
    setNewTaxNumber(tax.tax_number || "");
    clearTaxRateLimitAlert();
    setShowAddTaxForm(true);
    setTaxError(null);
  };

  const handleCancelEditTax = () => {
    setEditingTaxId(null);
    setNewTaxName("");
    setNewTaxRate("");
    setNewTaxNumber("");
    clearTaxRateLimitAlert();
  };

  const closeTaxModal = () => {
    setShowManageTaxModal(false);
    setShowAddTaxForm(false);
    setTaxRateFocused(false);
    setNewTaxName(""); setNewTaxRate(""); setNewTaxNumber("");
    clearTaxRateLimitAlert();
    setEditingTaxId(null);
    setTaxError(null);
  };

  // ============ Add Merchant Functions ============

  const fetchMerchantLogos = async (merchantName) => {
    if (!merchantName || merchantName.trim().length === 0) return [];
    setIsFetchingLogos(true);
    try {
      const query = `${merchantName} logo`;
      const encodedQuery = encodeURIComponent(query);
      const resp = await fetch(`/imagesearch?searchkeyword=${encodedQuery}`, {
        method: "GET",
        headers: { Accept: "application/json" },
      });
      if (!resp.ok) throw new Error(`API returned ${resp.status}`);
      const contentType = resp.headers.get("content-type");
      let data;
      if (contentType && contentType.includes("application/json")) {
        data = await resp.json();
      } else {
        const text = await resp.text();
        try { data = JSON.parse(text); }
        catch {
          const urlMatch = text.match(/(https?:\/\/[^\s"']+\.(jpg|jpeg|png|gif|webp))/i);
          return urlMatch ? [urlMatch[1]] : [];
        }
      }
      // Each entry: { displayUrl (thumb – direct load), storeUrl (full – stored in DB) }
      const logoEntries = [];
      const isValidHttpUrl = (u) => u && /^https?:\/\//i.test(u);
      // Handle array of objects (primary API format: [{fullurl, thumburl, ...}])
      if (Array.isArray(data) && data.length > 0) {
        for (const item of data) {
          if (item && typeof item === "object") {
            const fullUrl = item.fullurl || item.url || item.image || item.src || item.link;
            const thumbUrl = item.thumburl || fullUrl;
            const storeUrl = fullUrl || thumbUrl;
            if (isValidHttpUrl(storeUrl)) {
              logoEntries.push({ displayUrl: isValidHttpUrl(thumbUrl) ? thumbUrl : storeUrl, storeUrl });
            }
          } else if (typeof item === "string" && isValidHttpUrl(item)) {
            logoEntries.push({ displayUrl: item, storeUrl: item });
          }
        }
      }
      // Handle object response
      if (typeof data === "object" && !Array.isArray(data)) {
        const arr = data.images || data.results || data.data || data.items || [];
        if (Array.isArray(arr)) {
          for (const item of arr) {
            if (item && typeof item === "object") {
              const fullUrl = item.fullurl || item.url || item.image || item.src || item.link;
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
      return logoEntries;
    } catch {
      return [];
    } finally {
      setIsFetchingLogos(false);
    }
  };

  const handleOpenAddMerchantModal = () => {
    setNewMerchantName("");
    setNewMerchantLogo("");
    setLogoOptions([]);
    setSelectedLogoIndex(null);
    setAddMerchantError(null);
    setShowAddMerchantModal(true);
    setShowMerchantDropdown(false);
  };

  const handleCloseAddMerchantModal = () => {
    setNewMerchantName("");
    setNewMerchantLogo("");
    setLogoOptions([]);
    setSelectedLogoIndex(null);
    setAddMerchantError(null);
    setShowAddMerchantModal(false);
  };

  const handleSelectMerchantLogo = (index) => {
    setSelectedLogoIndex(index);
    setNewMerchantLogo(logoOptions[index]?.storeUrl || "");
  };

  const handleFetchMerchantLogos = async () => {
    if (!newMerchantName || newMerchantName.trim().length === 0) return;
    const logos = await fetchMerchantLogos(newMerchantName.trim());
    setLogoOptions(logos);
    if (logos.length > 0) {
      setSelectedLogoIndex(0);
      setNewMerchantLogo(logos[0].storeUrl);
    } else {
      setSelectedLogoIndex(null);
      setNewMerchantLogo("");
    }
  };

  const handleAddMerchant = async () => {
    const name = (newMerchantName || "").trim();
    const normalizedName = name.toLowerCase();

    if (!name) {
      setAddMerchantError("Please enter Merchant Name");
      return;
    }

    if (containsEmoji(name)) {
      setAlertMsg("Emojis are not allowed in merchant names. Please use plain text.");
      return;
    }

    if (merchantExists(name)) {
      setAddMerchantError("Merchant already exists");
      return;
    }

    const selectedLogoUrl =
      selectedLogoIndex !== null
        ? logoOptions[selectedLogoIndex]?.storeUrl || ""
        : newMerchantLogo || "";

    setIsSavingMerchant(true);
    setAddMerchantError(null);
    try {
      const addResult = await addApiMerchant(name, selectedLogoUrl);
      if (!addResult?.ok) {
        setAddMerchantError(addResult?.error || "Failed to add merchant");
        return;
      }

      if (selectedLogoUrl) saveMerchLogo(name, selectedLogoUrl);
      setLocalMerchants((prev) => {
        const existingIndex = prev.findIndex(
          (m) => (m.name || "").toString().trim().toLowerCase() === normalizedName
        );
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = {
            ...next[existingIndex],
            name,
            image: selectedLogoUrl || next[existingIndex].image || "",
          };
          return next;
        }
        return [...prev, { name, image: selectedLogoUrl || "" }];
      });

      handleFieldChange("storeName", name);
      handleFieldChange("store_image", selectedLogoUrl || "");
      handleCloseAddMerchantModal();
      setToast({ isVisible: true, message: "Merchant added successfully!", type: "success" });
    } finally {
      setIsSavingMerchant(false);
    }
  };

  // ── Edit Merchant handlers ────────────────────────────────────────────────
  const handleOpenEditMerchant = (merchant) => {
    setEditingMerchant(merchant);
    setEditMerchantName(merchant.name);
    setEditMerchantLogo(merchant.image || "");
    setEditLogoOptions([]);
    setEditSelectedLogoIndex(null);
    setEditMerchantError(null);
    setShowEditMerchantModal(true);
  };

  const handleFetchEditLogos = async () => {
    if (!editMerchantName.trim()) return;
    setIsFetchingEditLogos(true);
    try {
      const logos = await fetchMerchantLogos(editMerchantName.trim());
      setEditLogoOptions(logos);
    } catch {
      // silent
    } finally {
      setIsFetchingEditLogos(false);
    }
  };

  const handleSelectEditLogo = (index) => {
    setEditSelectedLogoIndex(index);
    setEditMerchantLogo(editLogoOptions[index]?.storeUrl || "");
  };

  // Validate only — shows confirmation popup; actual save is in doConfirmMerchantEdit
  const handleSaveEditMerchant = () => {
    if (!editMerchantName.trim()) {
      setEditMerchantError("Merchant name is required.");
      return;
    }
    if (merchantExists(editMerchantName, editingMerchant?.name || "")) {
      setEditMerchantError("Merchant already exists");
      return;
    }
    setShowMerchantEditConfirm(true);
  };

  /** Rename + update logo for ALL receipts using this merchant, then refresh. */
  const doConfirmMerchantEdit = async () => {
    setShowMerchantEditConfirm(false);
    setIsSavingEditMerchant(true);
    setEditMerchantError(null);
    const oldName = editingMerchant.name;
    const newName = editMerchantName.trim();
    const newLogo = editMerchantLogo || editingMerchant.image || "";
    try {
      const affected = (receipts || []).filter(
        (r) => (r.storeName || r.store_name || "").toLowerCase() === oldName.toLowerCase()
      );
      for (const r of affected) {
        await updateReceipt(r.id, { storeName: newName, store_image: newLogo });
      }
      setLocalMerchants((prev) =>
        prev.map((m) =>
          m.name.toLowerCase() === oldName.toLowerCase()
            ? { ...m, name: newName, image: newLogo }
            : m
        )
      );
      const getApiMerchantId = (m) => {
        const id = m?.id ?? m?.store_id ?? m?.fk_store_id ?? null;
        return id != null && String(id) !== "" && String(id) !== "0" ? id : null;
      };
      const resolveApiForEdit = (list) => {
        const exact = (list || []).find(
          (m) => normalizeMatchKey(m.store_name) === normalizeMatchKey(oldName)
        );
        if (getApiMerchantId(exact)) return exact;
        return findRenamedApiMerchant(oldName, list);
      };
      let apiMatch = resolveApiForEdit(apiMerchants);
      let apiId = getApiMerchantId(apiMatch);
      if (apiId == null) {
        const fresh = await fetchApiMerchants();
        apiMatch = resolveApiForEdit(fresh);
        apiId = getApiMerchantId(apiMatch);
      }
      if (apiId != null) {
        const updateMerchantResult = await updateApiMerchant(apiId, newName, newLogo);
        if (!updateMerchantResult?.ok) {
          throw new Error(updateMerchantResult?.error || "Failed to update merchant");
        }
      } else {
        const addMerchantResult = await addApiMerchant(newName, newLogo);
        if (!addMerchantResult?.ok) {
          throw new Error(addMerchantResult?.error || "Failed to update merchant");
        }
      }
      deleteCustomMerchant(oldName);
      deleteCustomMerchant(newName);
      if (normalizeMatchKey(newName) !== normalizeMatchKey(oldName)) {
        hideMerchant(oldName);
      }
      if (newLogo) saveMerchLogo(newName, newLogo);
      // Select the edited merchant for this receipt (same as payment method edit)
      handleFieldChange("storeName", newName);
      handleFieldChange("store_image", newLogo);
      setShowEditMerchantModal(false);
      setEditingMerchant(null);
      setShowMerchantDropdown(false);
      await Promise.all([fetchApiMerchants(), silentRefreshData(0)]);
      setToast({ isVisible: true, message: "Merchant updated successfully!", type: "success" });
    } catch (err) {
      setEditMerchantError(err.message || "Failed to update merchant.");
    } finally {
      setIsSavingEditMerchant(false);
    }
  };

  /** Move all receipts of this merchant to "Miscellaneous". */
  const handleDeleteMerchant = (merchant) => {
    if (merchant.name.toLowerCase() === "miscellaneous") return;
    setPendingMerchantDeleteData(merchant);
    setShowMerchantDeleteConfirm(true);
  };

  /** Called when user confirms merchant deletion. */
  const doConfirmMerchantDelete = async () => {
    setShowMerchantDeleteConfirm(false);
    if (!pendingMerchantDeleteData) return;
    const merchant = pendingMerchantDeleteData;
    setPendingMerchantDeleteData(null);
    setIsSavingEditMerchant(true);
    try {
      const affected = (receipts || []).filter(
        (r) => (r.storeName || r.store_name || "").toLowerCase() === merchant.name.toLowerCase()
      );
      for (const r of affected) {
        await updateReceipt(r.id, { storeName: "Miscellaneous", store_image: "" });
      }
      setLocalMerchants((prev) =>
        prev.filter((m) => m.name.toLowerCase() !== merchant.name.toLowerCase())
      );
      const apiMerchantMatch = (apiMerchants || []).find(
        (m) => normalizeMatchKey(m.store_name) === normalizeMatchKey(merchant.name)
      );
      if (apiMerchantMatch?.id) {
        const deleteMerchantResult = await deleteApiMerchant(apiMerchantMatch.id);
        if (!deleteMerchantResult?.ok) {
          throw new Error(deleteMerchantResult?.error || "Failed to delete merchant");
        }
      }
      if ((editedReceipt.storeName || "").toLowerCase() === merchant.name.toLowerCase()) {
        handleFieldChange("storeName", "Miscellaneous");
        handleFieldChange("store_image", "");
      }
      hideMerchant(merchant.name);
      await Promise.all([fetchApiMerchants(), silentRefreshData(0)]);
      setToast({ isVisible: true, message: "Merchant deleted successfully!", type: "success" });
    } catch (err) {
      setToast({ isVisible: true, message: err.message || "Failed to delete merchant.", type: "error" });
    } finally {
      setIsSavingEditMerchant(false);
    }
  };

  // ── Expense Category edit/delete helpers ────────────────────────────────

  // ── Add Photo helpers ─────────────────────────────────────────────────────

  /** Upload a single file to /api/user/uploadmediaV1 and return the CDN URL */
  const uploadPhotoToMedia = async (file) => {
    const token = localStorage.getItem("token");
    const formData = new FormData();
    formData.append("file", sanitizeUploadFile(file));
    const response = await fetch("/api/user/uploadmediaV1", {
      method: "POST",
      headers: { Accesstoken: token },
      body: formData,
    });
    if (!response.ok) throw new Error(`Upload failed: ${response.status}`);
    const data = await response.json();
    // uploadmediaV1 is cumulative (all historical uploads) — take the last entry
    // which is the file we just uploaded, not a stale URL from a previous receipt.
    if (Array.isArray(data) && data.length > 0) {
      const last = data[data.length - 1];
      if (last?.fullImageUrl) return last.fullImageUrl;
    }
    if (data?.fullImageUrl) return data.fullImageUrl;
    throw new Error("No URL returned from upload");
  };

  const handleAddPhotoSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (addPhotoInputRef.current) addPhotoInputRef.current.value = "";
    setIsAddingPhoto(true);
    try {
      let url;
      try {
        url = await uploadPhotoToMedia(file);
      } catch {
        // Fallback to local object URL
        url = URL.createObjectURL(file);
      }
      const normalizedUrl = normalizeMediaUrl(url);
      if (!normalizedUrl) return;

      // Use the most up-to-date values (editedReceipt takes priority over server data)
      const r = selectedReceipt;
      const emptyVals = new Set(["0", "null", "", "undefined"]);
      const curReceiptImg   = normalizeMediaUrl(editedReceipt?.receipt_image   ?? r?.receipt_image   ?? "") || "";
      const curEmailAttach  = normalizeMediaUrl(editedReceipt?.emailAttachment ?? r?.emailAttachment ?? "") || "";

      // Deduplicate: skip if this URL is already displayed
      const existingNormalized = new Set(
        [curReceiptImg, curEmailAttach, ...additionalPhotoUrls.map(normalizeMediaUrl)].filter(Boolean)
      );
      if (existingNormalized.has(normalizedUrl)) return;

      const hasImage      = !emptyVals.has(curReceiptImg);
      // emailAttachment counts as "empty" if it is the same URL as receipt_image
      // (Add Receipt stores the same URL in both fields, so one slot is effectively free)
      const hasAttachment = !emptyVals.has(curEmailAttach) && curEmailAttach !== curReceiptImg;

      // When receipt_image slot is taken but emailAttachment is free:
      // put NEW photo into receipt_image (mobile reads this field only) and
      // move the OLD receipt_image URL into emailAttachment so it is preserved for web.
      const patch = hasImage
        ? hasAttachment ? {} : {
            receipt_image: normalizedUrl,   // new photo → receipt_image (mobile sees this)
            emailAttachment: curReceiptImg  // old photo → emailAttachment (preserved for web)
          }
        : { receipt_image: normalizedUrl };

      if (Object.keys(patch).length > 0) {
        Object.entries(patch).forEach(([key, val]) => handleFieldChange(key, val));
      } else {
        setAdditionalPhotoUrls((prev) => {
          if (prev.some((u) => normalizeMediaUrl(u) === normalizedUrl))
            return prev;
          return [...prev, normalizedUrl];
        });
      }

      if (repairReceiptMediaOnServer) {
        void repairReceiptMediaOnServer({ force: true });
      }
    } catch (err) {
      console.error("Add photo failed:", err);
    } finally {
      setIsAddingPhoto(false);
    }
  };

  const handleAnnotationSaveDetail = (savedUrl) => {
    const persistUrl =
      normalizeMediaUrl(savedUrl) ||
      (typeof savedUrl === "string" ? savedUrl.trim() : "");

    if (!persistUrl) {
      setAlertMsg("Could not save annotation. Please try again.");
      return;
    }

    if (annotatorSource?.type === "additional") {
      setAdditionalPhotoUrls((prev) =>
        prev.map((u, i) => {
          if (i === annotatorSource.index) return persistUrl;
          if (mediaUrlsEqual(u, annotatorSource.sourceUrl)) return persistUrl;
          return u;
        })
      );
    } else if (annotatorSource?.type === "existing") {
      if (editedTags.locked) {
        setAnnotatorUrl(null);
        setAnnotatorSource(null);
        return;
      }
      const rawTarget = annotatorSource.sourceUrl || unproxyImageUrl(annotatorUrl) || "";
      const normOld = normalizeMediaUrl(rawTarget);
      if (!normOld) {
        setAnnotatorUrl(null);
        setAnnotatorSource(null);
        return;
      }
      setEditedReceipt((prev) => {
        const email0 = prev.emailAttachment ?? selectedReceipt.emailAttachment ?? "0";
        const receipt0 = prev.receipt_image ?? selectedReceipt.receipt_image ?? "0";
        let mergedEmail = replaceUrlInMediaCsv(email0, normOld, persistUrl);
        let mergedReceipt = replaceUrlInMediaCsv(receipt0, normOld, persistUrl);
        if (mergedEmail === email0 && mergedReceipt === receipt0) {
          const combined = buildCombinedMediaField([receipt0, email0]);
          if (combined !== "0") {
            const mergedCombined = replaceUrlInMediaCsv(
              combined,
              normOld,
              persistUrl
            );
            mergedReceipt = mergedCombined;
            mergedEmail = mergedCombined;
          } else {
            mergedReceipt = persistUrl;
            mergedEmail = persistUrl;
          }
        }
        return {
          ...prev,
          emailAttachment: normalizeMediaUrl(mergedEmail) || "0",
          receipt_image: normalizeMediaUrl(mergedReceipt) || "0",
        };
      });
      setAdditionalPhotoUrls((prev) =>
        prev.map((u) => (mediaUrlsEqual(u, rawTarget) ? persistUrl : u))
      );
      if (!persistUrl.startsWith("data:") && !persistUrl.startsWith("blob:")) {
        pendingAnnotatedMediaRef.current = { normOld, persistUrl };
      }
    }
    setAnnotatorUrl(null);
    setAnnotatorSource(null);
  };

  /** Direct API update — spreads the full receipt then overrides fields (mirrors merchant delete pattern) */
  const putUpdateReceipt = async (payload) => {
    const token = localStorage.getItem("token");
    const response = await fetch("/api/receipt/updateReceiptv1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accesstoken: token },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Failed to update receipt: ${response.status}`);
    return response.json();
  };

  const handleOpenEditCategory = (category) => {
    setEditingCategory(category);
    setEditCategoryName(category);
    setEditCategoryError(null);
    setShowCategoryEditConfirm(false);
    setShowEditCategoryModal(true);
    setShowCategoryDropdown(false);
  };

  // Validate only — shows confirmation popup; actual save is in doConfirmCategoryEdit
  const handleSaveEditCategory = () => {
    const newName = editCategoryName.trim();
    if (!newName) { setEditCategoryError("Please enter Expense Category"); return; }
    if (editCategoryDuplicateError) return;
    setShowCategoryEditConfirm(true);
  };

  const doConfirmCategoryEdit = async () => {
    setShowCategoryEditConfirm(false);
    setIsSavingEditCategory(true);
    setEditCategoryError(null);
    const newName = editCategoryName.trim();
    const oldName = editingCategory;
    try {
      // Update all receipts that reference the old name
      const affected = (receipts || []).filter(
        (r) => (r.expense_type || "").toLowerCase() === oldName.toLowerCase()
      );
      for (const r of affected) {
        await updateReceipt(r.id, { expense_type: newName });
      }
      // Find and call the update API
      const apiMatch = (apiExpenseCategories || []).find(
        (c) => normalizeMatchKey(c.expense_category_name) === normalizeMatchKey(oldName)
      );
      if (apiMatch?.id) {
        const updateResult = await updateApiExpenseCategory(String(apiMatch.id), newName);
        if (!updateResult?.ok) throw new Error(updateResult?.error || "Failed to update category");
        deleteCustomCategory(oldName);
      } else {
        hideCategory(oldName);
        addCustomCategory(newName);
      }
      if (normalizeMatchKey(oldName) !== normalizeMatchKey(newName)) {
        editCustomCategory(oldName, newName);
      }
      // User edited this category from the receipt form — select it for this receipt.
      handleFieldChange("expense_type", newName);
      setShowEditCategoryModal(false);
      setEditingCategory(null);
      await Promise.all([fetchApiExpenseCategories(), silentRefreshData(0)]);
      setToast({ isVisible: true, message: "Expense Category Updated", type: "success" });
    } catch (err) {
      setEditCategoryError(err.message || "Failed to update category.");
    } finally {
      setIsSavingEditCategory(false);
    }
  };

  const handleConfirmDeleteCategory = async () => {
    if (!deletingCategory) return;
    setIsDeletingCategory(true);
    try {
      const affected = (receipts || []).filter(
        (r) => (r.expense_type || "").toLowerCase() === deletingCategory.toLowerCase()
      );
      for (const r of affected) {
        await updateReceipt(r.id, { expense_type: "" });
      }
      if ((editedReceipt.expense_type || "").toLowerCase() === deletingCategory.toLowerCase()) {
        handleFieldChange("expense_type", "");
      }
      const apiCategoryMatch = (apiExpenseCategories || []).find(
        (c) => normalizeMatchKey(c.expense_category_name) === normalizeMatchKey(deletingCategory)
      );
      if (apiCategoryMatch?.id) {
        const deleteCategoryResult = await deleteApiExpenseCategory(apiCategoryMatch.id);
        if (!deleteCategoryResult?.ok) {
          throw new Error(deleteCategoryResult?.error || "Failed to delete category");
        }
      }
      hideCategory(deletingCategory);
      setShowDeleteCategoryConfirm(false);
      setDeletingCategory(null);
      await Promise.all([fetchApiExpenseCategories(), silentRefreshData(0)]);
      setToast({ isVisible: true, message: "Expense category deleted successfully!", type: "success" });
    } catch (err) {
      setToast({ isVisible: true, message: err.message || "Failed to delete category.", type: "error" });
    } finally {
      setIsDeletingCategory(false);
    }
  };

  // ── Split helpers ─────────────────────────────────────────────────────────

  /** POST a new receipt payload to addReceiptv1 */
  const postNewReceiptForSplit = async (payload) => {
    const token = localStorage.getItem("token");
    const res = await fetch("/api/receipt/addReceiptv1", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accesstoken: token },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`Failed to save split receipt: ${res.status}`);
    return res.json();
  };

  /** Create a blank split entry */
  const createSplit = () => {
    const mainTotal    = parseFloat(editedReceipt.purchasePrice) || parseFloat(selectedReceipt?.purchasePrice) || 0;
    const mainSubtotal = parseFloat(editedReceipt.subtotal) || parseFloat(selectedReceipt?.subtotal) || mainTotal;
    const mainTaxes    = editedReceipt.receipt_tax_values || selectedReceipt?.receipt_tax_values || [];
    return {
      _id: Date.now() + Math.random(),
      receipt_category: editedReceipt.receipt_category ?? selectedReceipt?.receipt_category ?? 0,
      expense_type: editedReceipt.expense_type || selectedReceipt?.expense_type || "",
      subtotal: "",
      purchasePrice: "",
      product_name: "",
      receipt_tax_values: mainTaxes.map(t => ({ ...t, id: 0, tax_amount: "" })),
    };
  };

  /** Open the split screen — validates required fields first */
  const handleOpenSplit = () => {
    const total = parseFloat(editedReceipt.purchasePrice) || parseFloat(selectedReceipt?.purchasePrice) || 0;
    const storeName = editedReceipt.storeName || selectedReceipt?.storeName || "";
    const missing = [];
    if (!storeName.trim()) missing.push("Merchant Name");
    if (!total) missing.push("Total Amount");
    if (missing.length) {
      setSplitError(`Please fill in: ${missing.join(", ")} before splitting.`);
      return;
    }
    setSplitError(null);
    setSplits([]);
    setSplitErrors({});
    setActiveSplitIndex(null);
    setShowSplitScreen(true);
    setShowOptionsMenu(false);
  };

  const handleForwardSuccess = async () => {
    if (selectedReceipt?.id) {
      await updateReceipt(selectedReceipt.id, { receipt_forwarded: "1" });
    }
    setToast({ isVisible: true, message: "Receipt forwarded successfully.", type: "success" });
    await refreshData?.();
    onSaved?.();
  };

  /** Update a field on a specific split, auto-calculating tax/total like the main form */
  const updateSplitField = (idx, field, value) => {
    if (field === "subtotal" || field === "purchasePrice") {
      value = sanitizeMoneyInput(value);
    }
    if (field === "product_name") {
      value = (value || "").toString().slice(0, MAX_DESCRIPTION_LENGTH);
    }
    const mainSubtotal = parseFloat(editedReceipt.subtotal) || parseFloat(editedReceipt.purchasePrice) || parseFloat(selectedReceipt?.subtotal) || 0;
    const mainTotal    = parseFloat(editedReceipt.purchasePrice) || parseFloat(selectedReceipt?.purchasePrice) || 0;

    if (field === "subtotal" && mainSubtotal > 0 && (parseFloat(value) || 0) > mainSubtotal) {
      setAlertMsg(`Subtotal cannot exceed $${mainSubtotal.toFixed(2)}`);
      return;
    }
    if (field === "purchasePrice" && mainTotal > 0 && (parseFloat(value) || 0) > mainTotal) {
      setAlertMsg(`Total cannot exceed $${mainTotal.toFixed(2)}`);
      return;
    }

    setSplits(prev => {
      const updated = [...prev];
      const split   = updated[idx];
      if (field === "purchasePrice") {
        const totalNum = parseFloat(value) || 0;
        if (totalNum > 0) {
          const rateSum = (split.receipt_tax_values || []).reduce((s, t) => s + (parseFloat(t.tax_rate) || 0) / 100, 0);
          const sub = parseFloat((totalNum / (1 + rateSum)).toFixed(2));
          const taxes = (split.receipt_tax_values || []).map(t => ({
            ...t,
            tax_amount: sub > 0 ? parseFloat(((parseFloat(t.tax_rate) / 100) * sub).toFixed(2)) : "",
          }));
          updated[idx] = { ...split, purchasePrice: value, subtotal: sub > 0 ? sub.toString() : "", receipt_tax_values: taxes };
        } else {
          updated[idx] = { ...split, purchasePrice: value, subtotal: "", receipt_tax_values: (split.receipt_tax_values || []).map(t => ({ ...t, tax_amount: "" })) };
        }
      } else if (field === "subtotal") {
        const sub = parseFloat(value) || 0;
        const taxes = (split.receipt_tax_values || []).map(t => ({
          ...t,
          tax_amount: sub > 0 ? parseFloat(((parseFloat(t.tax_rate) / 100) * sub).toFixed(2)) : "",
        }));
        const total = sub + taxes.reduce((s, t) => s + (parseFloat(t.tax_amount) || 0), 0);
        updated[idx] = { ...split, subtotal: value, receipt_tax_values: taxes, purchasePrice: sub > 0 ? parseFloat(total.toFixed(2)) : "" };
      } else {
        updated[idx] = { ...split, [field]: value };
      }
      return updated;
    });

    if ((field === "subtotal" || field === "purchasePrice") && splits[idx]) {
      const id = splits[idx]._id;
      if (splitErrors[id]?.amount) {
        setSplitErrors(prev => { const n = { ...prev }; delete n[id]; return n; });
      }
    }
  };

  /** Add a new blank split and open its detail view */
  const addSplit = () => {
    const newSlot = createSplit();
    const newIdx  = splits.length;
    setSplits(prev => [...prev, newSlot]);
    setActiveSplitIndex(newIdx);
  };

  /** Remove a split by index */
  const removeSplit = (idx) => setSplits(prev => prev.filter((_, i) => i !== idx));

  /** Save all splits — creates new receipts, updates existing receipt to the remainder */
  const handleSaveSplits = async () => {
    if (splits.length === 0) {
      setSplitError("Please add at least one split before saving.");
      return;
    }
    // Validate
    const newErrors = {};
    splits.forEach(split => {
      if (!parseFloat(split.purchasePrice) && !parseFloat(split.subtotal)) {
        newErrors[split._id] = { amount: "Please enter an amount for this split." };
      }
    });
    if (Object.keys(newErrors).length) {
      setSplitErrors(newErrors);
      const firstBad = splits.findIndex(s => newErrors[s._id]);
      if (firstBad !== -1) setActiveSplitIndex(firstBad);
      return;
    }

    setIsSavingSplits(true);
    setSplitError(null);
    try {
      const fkUserId   = parseInt(localStorage.getItem("fk_user_id")) || 0;
      const mainTotal  = parseFloat(editedReceipt.purchasePrice) || parseFloat(selectedReceipt?.purchasePrice) || 0;
      const storeName  = editedReceipt.storeName || selectedReceipt?.storeName || "";
      const storeImage = editedReceipt.store_image || selectedReceipt?.store_image || "";
      const paymentType = editedReceipt.paymentType || selectedReceipt?.paymentType || "";
      const last4 =
        (editedReceipt?.last_4_digit_card ?? editedReceipt?.last4DigitCard ?? "")
          .toString()
          .trim() ||
        (selectedReceipt?.last_4_digit_card ?? selectedReceipt?.last4DigitCard ?? "")
          .toString()
          .trim();
      const cardIssuerName =
        (editedReceipt?.card_issuer_name ?? editedReceipt?.cardIssuerName ?? "")
          .toString()
          .trim() ||
        (selectedReceipt?.card_issuer_name ?? selectedReceipt?.cardIssuerName ?? "")
          .toString()
          .trim();
      let productDate = Number(editedReceipt.product_date || selectedReceipt?.product_date) || 0;
      if (!productDate || productDate < 1000000) {
        productDate = todayLocalCalendarUnix();
      }
      const receiptTag = ["0","0","0","0","0","0","0"].join(",");

      // Create a new receipt for each split
      for (const split of splits) {
        const splitSubtotal = parseFloat(split.subtotal) || 0;
        const taxValues = (split.receipt_tax_values || []).map(t => ({
          id: 0, fk_user_id: fkUserId, fk_receipt_id: 0,
          fk_tax_id: parseInt(t.fk_tax_id) || 0,
          tax_name: t.tax_name || "", tax_rate: t.tax_rate || "0",
          tax_amount: (parseFloat(t.tax_amount) || 0).toString(),
          created: 0, updated: 0,
        }));
        const splitTotal = parseFloat(split.purchasePrice) ||
          parseFloat((splitSubtotal + taxValues.reduce((s, t) => s + (parseFloat(t.tax_amount) || 0), 0)).toFixed(2));
        await postNewReceiptForSplit({
          id: 0,
          storeName,
          product_name: split.product_name || "",
          emailAttachment: selectedReceipt?.emailAttachment || "0",
          purchasePrice: splitTotal.toString(),
          total_amount: splitTotal.toString(),
          payment_category_type: parseInt(split.receipt_category) || 0,
          status: 0,
          paymentType,
          last_4_digit_card: last4,
          card_issuer_name: cardIssuerName,
          fk_original_receipt_id: "0",
          fk_forward_from_receipt_id: "0",
          receipt_category: parseInt(split.receipt_category) || 0,
          product_date: productDate,
          expense_type: split.expense_type || editedReceipt.expense_type || selectedReceipt?.expense_type || "",
          receipt_image: selectedReceipt?.receipt_image || "0",
          store_image: storeImage,
          notes: "",
          receipt_forwarded: "0",
          receipt_tag: receiptTag,
          create_date: "",
          receipt_tax_values: taxValues,
        });
      }

      // Calculate remainder and update the existing receipt
      const splitsTotal = parseFloat(splits.reduce((s, sp) => s + (parseFloat(sp.purchasePrice) || 0), 0).toFixed(2));
      const remainder   = parseFloat((mainTotal - splitsTotal).toFixed(2));

      if (remainder >= 0) {
        // Back-calculate remainder subtotal using existing tax rates
        const mainTaxRates = editedReceipt.receipt_tax_values || selectedReceipt?.receipt_tax_values || [];
        const rateSum      = mainTaxRates.reduce((s, t) => s + (parseFloat(t.tax_rate) || 0) / 100, 0);
        const remSubtotal  = rateSum > 0 ? parseFloat((remainder / (1 + rateSum)).toFixed(2)) : remainder;
        const remTaxValues = mainTaxRates.map(t => ({
          ...t,
          id: parseInt(t.id) || 0,
          fk_user_id: parseInt(t.fk_user_id) || fkUserId,
          fk_receipt_id: selectedReceipt?.id || 0,
          tax_amount: parseFloat(((parseFloat(t.tax_rate) / 100) * remSubtotal).toFixed(2)).toString(),
          created: parseInt(t.created) || 0,
          updated: parseInt(t.updated) || 0,
        }));
        // Build the updated existing receipt payload
        const receiptTagStr = [
          editedTags.locked ? "1" : "0",
          editedTags.starred ? "1" : "0",
          editedTags.flagged ? "1" : "0",
          editedTags.verified ? "1" : "0",
          editedTags.reconciled ? "1" : "0",
          editedTags.reimbursed ? "1" : "0",
          editedTags.warrantied ? "1" : "0",
        ].join(",");
        await updateReceipt(selectedReceipt.id, {
          ...selectedReceipt,
          ...editedReceipt,
          purchasePrice: remainder.toString(),
          total_amount: remainder.toString(),
          subtotal: remSubtotal.toString(),
          receipt_tax_values: remTaxValues,
          receipt_tag: receiptTagStr,
        });
      }

      await refreshData();
      setShowSplitScreen(false);
      setActiveSplitIndex(null);
      setSplits([]);
      setSplitError(null);
      setSplitErrors({});
      // Close modal so user can see all receipts including the new splits
      if (onClose) onClose();
    } catch (err) {
      setSplitError("Failed to save splits: " + (err.message || "Unknown error"));
    } finally {
      setIsSavingSplits(false);
    }
  };


  // Save edited receipt
  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Build receipt_tag string from editedTags
      const receiptTag = [
        editedTags.locked ? "1" : "0",
        editedTags.starred ? "1" : "0",
        editedTags.flagged ? "1" : "0",
        editedTags.verified ? "1" : "0",
        editedTags.reconciled ? "1" : "0",
        editedTags.reimbursed ? "1" : "0",
        editedTags.warrantied ? "1" : "0",
      ].join(",");

      // Build receipt_tax_values including tip (linked to Tip tax definition when available)
      const tipAmount = parseFloat(editedReceipt.tip) || 0;
      const subtotal = parseFloat(editedReceipt.subtotal) || 0;
      const fk_user_id = parseInt(localStorage.getItem("fk_user_id")) || 0;
      const existingTipLine = findTipLineInReceiptTaxValues(
        selectedReceipt.receipt_tax_values,
      );
      let receiptTaxValuesPayload = filterNonTipReceiptTaxValues(
        editedReceipt.receipt_tax_values,
      ).map((t) => ({
        id: parseInt(t.id) || 0,
        fk_user_id: parseInt(t.fk_user_id) || fk_user_id,
        fk_receipt_id: parseInt(t.fk_receipt_id) || selectedReceipt.id || 0,
        fk_tax_id: parseInt(t.fk_tax_id) || 0,
        tax_name: t.tax_name || "",
        tax_rate: t.tax_rate || "0",
        tax_amount: (parseFloat(t.tax_amount) || 0).toString(),
        created: parseInt(t.created) || 0,
        updated: parseInt(t.updated) || 0,
      }));

      const tipLine = buildReceiptTipTaxEntry({
        tipAmount,
        subtotal,
        taxDefinitions: taxData,
        existingTipLine,
        fk_receipt_id: selectedReceipt.id,
        fk_user_id,
      });
      if (tipLine) receiptTaxValuesPayload.push(tipLine);

      // Get store_image from selected merchant if changed
      const selectedMerchantImage = getMerchantImage(editedReceipt.storeName);
      const storeImageToSave =
        selectedMerchantImage ||
        editedReceipt.store_image ||
        selectedReceipt.store_image ||
        "";

      // Determine card_issuer_name and last4 from payment type
      let last4 =
        (editedReceipt.last_4_digit_card ?? editedReceipt.last4DigitCard ?? "")
          .toString()
          .trim() ||
        (selectedReceipt.last_4_digit_card ?? selectedReceipt.last4DigitCard ?? "")
          .toString()
          .trim();
      const paymentType = editedReceipt.paymentType || "";

      // Extract last4 from paymentType if present (e.g. "Diners Club *9999" → "9999")
      // Use last occurrence to handle corrupted values like "Visa *0700 *0700"
      if (paymentType && paymentType.includes("*")) {
        const allMatches = [...paymentType.matchAll(/\*(\d{3,4})/g)];
        if (allMatches.length > 0) last4 = allMatches[allMatches.length - 1][1];
      }

      // Strip ALL *digits to get the clean network name for the API
      const basePaymentType = paymentType.replace(/\s*\*\d{3,4}/g, "").trim();

      // Always derive cardIssuerName from the clean base payment type so we always
      // get the full correct name (e.g. "Diners Club", never "Club").
      // Only keep a user-entered custom name if it differs from the resolved brand.
      const derivedIssuer = resolveIssuerName(basePaymentType || paymentType);
      // Also strip any embedded *digits from the user-entered issuer name
      const formIssuer = (editedReceipt.card_issuer_name || "").replace(/\s*\*\d{3,4}/g, "").trim();
      const cardIssuerName =
        formIssuer && formIssuer.toLowerCase() !== derivedIssuer.toLowerCase()
          ? formIssuer
          : derivedIssuer;

      // For API: send paymentType WITHOUT *last4 (backend expects just network name)
      const finalPaymentTypeForAPI = basePaymentType || paymentType;

      const mediaUrlsForSave = collectReceiptMediaUrlsForSave();
      if (pendingAnnotatedMediaRef.current?.persistUrl && mediaUrlsForSave.length === 0) {
        setAlertMsg(
          "Annotation could not be saved to the server. Please tap Save Annotation again, then Save Changes."
        );
        setIsSaving(false);
        return;
      }
      const combinedReceiptImages = buildCombinedMediaField(mediaUrlsForSave);

      const updatedData = {
        ...selectedReceipt, // Include all original fields
        ...editedReceipt, // Override with edited fields
        receipt_image: "0",
        emailAttachment: combinedReceiptImages,
        receipt_tag: receiptTag,
        receipt_tax_values: receiptTaxValuesPayload,
        store_image: storeImageToSave,
        card_issuer_name: cardIssuerName,
        paymentType: finalPaymentTypeForAPI || "", // Send WITHOUT *last4 to API
        last_4_digit_card: last4 || "", // Send separately
        // Saving a draft receipt marks it as verified so it moves to the regular list
        ...(isDraft ? { is_verify: "1", is_draft: "0" } : {}),
      };

      const success = await updateReceipt(selectedReceipt.id, updatedData);
      if (success) {
        tagsDirtyRef.current = false;
        pendingAnnotatedMediaRef.current = null;
        // If the user entered a custom expense category, add it to context immediately
        // so it appears in Filter → Expense Category without waiting for a refresh.
        if (updatedData.expense_type && updatedData.expense_type.trim()) {
          addExpenseCategory(updatedData.expense_type.trim());
        }
        // Update local state and close popup
        setSelectedReceipt((prev) => ({
          ...prev,
          ...updatedData,
        }));
        // Sync with server in the background (no spinner) so changes persist after reload
        silentRefreshData?.(1500);
        // Notify parent to show toast, then close
        onSaved?.();
        onClose();
      }
    } catch (error) {
      console.error("Error saving receipt:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      const success = await deleteReceipt(selectedReceipt.id);
      if (success) {
        setShowDeleteConfirmation(false);
        onClose();
        // Don't refresh data here - deleteReceipt already updates local state
        // Refreshing can cause deleted receipts to reappear if API hasn't fully processed the delete
      } else {
        console.error("Failed to delete receipt - API call failed");
        // Show error message to user
        setAlertMsg("Failed to delete receipt. Please try again.");
      }
    } catch (error) {
      console.error("Error deleting receipt:", error);
      setAlertMsg("Error deleting receipt. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmImageDelete = async () => {
    if (!pendingImageDelete) return;
    try {
      if (pendingImageDelete.type === "additional") {
        setAdditionalPhotoUrls((prev) =>
          prev.filter((_, i) => i !== pendingImageDelete.index)
        );
      } else if (pendingImageDelete.type === "existing") {
        const urlToRemove = pendingImageDelete.url;
        if (!urlToRemove) throw new Error("No image URL to delete");
        const mediaSource = {
          emailAttachment:
            editedReceipt.emailAttachment ?? selectedReceipt.emailAttachment,
          receipt_image:
            editedReceipt.receipt_image ?? selectedReceipt.receipt_image,
        };
        const updates = removeUrlFromReceiptMedia(mediaSource, urlToRemove);
        const success = await updateReceipt(selectedReceipt.id, updates);
        if (!success) throw new Error("Failed to delete image from receipt");
        setEditedReceipt((prev) => ({ ...prev, ...updates }));
        setSelectedReceipt((prev) => ({ ...prev, ...updates }));
      }
    } catch (error) {
      console.error("Image delete error:", error);
      setToast({
        isVisible: true,
        message: "Failed to delete receipt image",
        type: "error",
      });
    } finally {
      setShowImageDeleteConfirm(false);
      setPendingImageDelete(null);
    }
  };

  // Function to get tag image based on status
  const getTagImage = (tagName, isActive) => {
    const tagImages = {
      locked: isActive ? locked : unlocked,
      starred: isActive ? starredSelect : starredDeselect,
      flagged: isActive ? flagSelect : flagDeselect,
      verified: isActive ? verifiedSelect : verifiedDeselect,
      reconciled: isActive ? reconcileSelect : reconcileDeselect,
      reimbursed: isActive ? reimbursedSelect : reimbursedDeselect,
      warrantied: isActive ? warrantedSelect : warrantedDeselect,
    };
    return tagImages[tagName];
  };

  // Function to get tag display name
  const getTagDisplayName = (tagName) => {
    const tagNames = {
      locked: "Locked",
      starred: "Starred",
      flagged: "Flagged",
      verified: "Verified",
      reconciled: "Reconciled",
      reimbursed: "Reimbursed",
      warrantied: "Warrantied",
    };
    return tagNames[tagName];
  };

  const formatCurrencyFixed2 = (amount) => {
    const num = Number(amount) || 0;
    try {
      const locale = "en-US";
      const currency = "USD";
      return new Intl.NumberFormat(locale, {
        style: "currency",
        currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(num);
    } catch {
      return num.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    }
  };

  const inputClass =
    "w-full border border-blue-400 text-sm px-2 py-1 rounded-md bg-white text-gray-800 mt-2.5 mb-0  ";


  const taxes = enrichedReceiptTaxValues.filter(
    (t) => !(t.tax_name || "").toLowerCase().includes("tip")
  );

  const sortedTaxes = [...taxes].sort((a, b) =>
    (a?.tax_name || "").localeCompare(b?.tax_name || "")
  );

  const tipTax =
    enrichedReceiptTaxValues.find((t) =>
      (t.tax_name || "").toLowerCase().includes("tip")
    ) || null;

  // Share handler functions - UPDATED
  const handleSaveAsPDF = () => {
    setShareMenu(false);
    setPdfKey((prev) => prev + 1);
    setShowPDFPreview(true);
  };

  // Helper function to save receipt without closing modal
  const saveReceiptWithoutClosing = async () => {
    // Build receipt_tag string from editedTags
    const receiptTag = [
      editedTags.locked ? "1" : "0",
      editedTags.starred ? "1" : "0",
      editedTags.flagged ? "1" : "0",
      editedTags.verified ? "1" : "0",
      editedTags.reconciled ? "1" : "0",
      editedTags.reimbursed ? "1" : "0",
      editedTags.warrantied ? "1" : "0",
    ].join(",");

    // Build receipt_tax_values including tip (linked to Tip tax definition when available)
    const tipAmount = parseFloat(editedReceipt.tip) || 0;
    const subtotal = parseFloat(editedReceipt.subtotal) || 0;
    const fk_user_id = parseInt(localStorage.getItem("fk_user_id")) || 0;
    const existingTipLine = findTipLineInReceiptTaxValues(
      selectedReceipt.receipt_tax_values,
    );
    let receiptTaxValuesPayload = filterNonTipReceiptTaxValues(
      editedReceipt.receipt_tax_values,
    ).map((t) => ({
      id: parseInt(t.id) || 0,
      fk_user_id: parseInt(t.fk_user_id) || fk_user_id,
      fk_receipt_id: parseInt(t.fk_receipt_id) || selectedReceipt.id || 0,
      fk_tax_id: parseInt(t.fk_tax_id) || 0,
      tax_name: t.tax_name || "",
      tax_rate: t.tax_rate || "0",
      tax_amount: (parseFloat(t.tax_amount) || 0).toString(),
      created: parseInt(t.created) || 0,
      updated: parseInt(t.updated) || 0,
    }));

    const tipLine = buildReceiptTipTaxEntry({
      tipAmount,
      subtotal,
      taxDefinitions: taxData,
      existingTipLine,
      fk_receipt_id: selectedReceipt.id,
      fk_user_id,
    });
    if (tipLine) receiptTaxValuesPayload.push(tipLine);

    // Get store_image from selected merchant if changed
    const selectedMerchantImage = getMerchantImage(editedReceipt.storeName);
    const storeImageToSave =
      selectedMerchantImage ||
      editedReceipt.store_image ||
      selectedReceipt.store_image ||
      "";

    // Determine card_issuer_name and last4 from payment type
    let last4 =
      (editedReceipt.last_4_digit_card ?? editedReceipt.last4DigitCard ?? "")
        .toString()
        .trim() ||
      (selectedReceipt.last_4_digit_card ?? selectedReceipt.last4DigitCard ?? "")
        .toString()
        .trim();
    const paymentType = editedReceipt.paymentType || "";

    // Extract last4 from paymentType if present
    // Use last occurrence to handle corrupted values like "Visa *0700 *0700"
    if (paymentType && paymentType.includes("*")) {
      const allMatches = [...paymentType.matchAll(/\*(\d{3,4})/g)];
      if (allMatches.length > 0) last4 = allMatches[allMatches.length - 1][1];
    }

    // Strip ALL *digits to get the clean network name for the API
    const basePaymentType = paymentType.replace(/\s*\*\d{3,4}/g, "").trim();

    // Always derive cardIssuerName from the clean base payment type
    const derivedIssuer2 = resolveIssuerName(basePaymentType || paymentType);
    // Also strip any embedded *digits from the user-entered issuer name
    const formIssuer2 = (editedReceipt.card_issuer_name || "").replace(/\s*\*\d{3,4}/g, "").trim();
    const cardIssuerName =
      formIssuer2 && formIssuer2.toLowerCase() !== derivedIssuer2.toLowerCase()
        ? formIssuer2
        : derivedIssuer2;

    const finalPaymentTypeForAPI = basePaymentType || paymentType;

    const mediaUrlsForSave = collectReceiptMediaUrlsForSave();
    const combinedReceiptImages = buildCombinedMediaField(mediaUrlsForSave);

    // Merge edited data with original receipt fields
    const updatedData = {
      ...selectedReceipt,
      ...editedReceipt,
      receipt_image: "0",
      emailAttachment: combinedReceiptImages,
      receipt_tag: receiptTag,
      receipt_tax_values: receiptTaxValuesPayload,
      store_image: storeImageToSave,
      card_issuer_name: cardIssuerName,
      paymentType: finalPaymentTypeForAPI || "",
      last_4_digit_card: last4 || "",
      // Keep draft transition behavior consistent with main Save Changes flow
      ...(isDraft ? { is_verify: "1", is_draft: "0" } : {}),
    };

    const success = await updateReceipt(selectedReceipt.id, updatedData);
    if (success) {
      // If the user entered a custom expense category, add it to context immediately
      // so it appears in Filter → Expense Category without waiting for a refresh.
      if (updatedData.expense_type && updatedData.expense_type.trim()) {
        addExpenseCategory(updatedData.expense_type.trim());
      }
      // Update local state but don't close modal
      setSelectedReceipt((prev) => ({
        ...prev,
        ...updatedData,
      }));
      // Also update editedReceipt to reflect saved state
      setEditedReceipt(updatedData);
      // Sync with server in the background so changes persist after reload
      silentRefreshData?.(1500);
    }
    return success;
  };

  const handleLinkToQuickBooks = async () => {
    const rec = { ...editedReceipt, ...selectedReceipt };
    const imageUrl = rec.receipt_image || rec.emailAttachment;
    if (!imageUrl || imageUrl === "0") {
      setToast({
        isVisible: true,
        message: "No receipt image to link.",
        type: "error",
      });
      return;
    }

    // Save receipt first to ensure all changes (category, amount, etc.) are persisted
    // This ensures that when the page refreshes, the data matches what was sent to QuickBooks
    if (Object.keys(editedReceipt).length > 0) {
      setIsSaving(true);
      try {
        const saved = await saveReceiptWithoutClosing();
        if (!saved) {
          setToast({
            isVisible: true,
            message: "Please save your changes before linking to QuickBooks.",
            type: "error",
          });
          setIsSaving(false);
          return;
        }
        // Wait a moment for save to complete
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        console.error(
          "Error saving receipt before QuickBooks integration:",
          error
        );
        setToast({
          isVisible: true,
          message: "Please save your changes before linking to QuickBooks.",
          type: "error",
        });
        setIsSaving(false);
        return;
      } finally {
        setIsSaving(false);
      }
    }

    setShareMenu(false);
    setLinkToQbLoading(true);
    try {
      const token = localStorage.getItem("token");
      // Use the latest receipt data (including any saved changes)
      const latestRec = { ...editedReceipt, ...selectedReceipt };
      const res = await fetch(`${NODE_API_URL}/api/integrations/quickbooks/receipts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accesstoken: token || "",
        },
        body: JSON.stringify({
          realmId: quickbooksRealmId,
          receiptId: latestRec.id,
          storeName: latestRec.storeName || latestRec.merchant || "",
          purchasePrice:
            latestRec.purchasePrice || latestRec.total_amount || "",
          product_date: latestRec.product_date || "",
          expense_type: latestRec.expense_type || "",
          product_name: latestRec.product_name || "",
          receipt_category: latestRec.receipt_category || "",
          payment_method:
            latestRec.paymentMethod || latestRec.payment_method || "",
          card_number:
            latestRec.last_4_digit_card || latestRec.last4Digits || "",
          subtotal: latestRec.subtotal || "",
          receipt_tax_values: latestRec.receipt_tax_values || [],
          tip: latestRec.tip || "",
          notes: latestRec.notes || "",
          receipt_image: imageUrl,
          emailAttachment: imageUrl,
          receiptFileName: `receipt_${latestRec.id || Date.now()}.jpg`,
        }),
      });

      // Check response status first (before reading body)
      const status = res.status;
      const statusOk = res.ok;
      console.log(
        "QuickBooks integration response status:",
        status,
        "ok:",
        statusOk
      );

      // Read response text (can only read once)
      let responseText;
      try {
        responseText = await res.text();
        console.log("QuickBooks integration raw response:", responseText);
      } catch (readErr) {
        console.error("Failed to read response:", readErr);
        setToast({
          isVisible: true,
          message: "Failed to read response from server.",
          type: "error",
        });
        return;
      }

      // Parse JSON response
      let data;
      try {
        data = JSON.parse(responseText);
        console.log(
          "QuickBooks integration parsed response:",
          JSON.stringify(data, null, 2)
        );
      } catch (parseErr) {
        console.error(
          "Failed to parse QuickBooks response:",
          parseErr,
          "Response text:",
          responseText
        );
        setToast({
          isVisible: true,
          message:
            "Invalid JSON response from server. Please check console for details.",
          type: "error",
        });
        return;
      }

      // Check if response indicates success
      // API returns { success: true, ... } on success (status 200)
      // OR { error: "..." } on failure (status 400/500)
      const hasSuccessFlag = data.success === true || data.success === "true";
      const hasPurchaseId = !!data.purchaseId;
      const hasSuccessMessage = !!(data.message && !data.error);
      const hasError = !!data.error;

      // Check success: status must be 200 AND no error field
      // If status is not 200 (e.g., 500), it's definitely an error
      let isSuccess = false;
      if (status === 200) {
        // Status 200: check for explicit error field
        if (
          hasError &&
          typeof data.error === "string" &&
          data.error.length > 0
        ) {
          isSuccess = false;
        } else {
          // Status 200 with no error = success
          isSuccess = true;
        }
      } else {
        // Non-200 status = error (e.g., 400, 500)
        isSuccess = false;
      }

      console.log("QuickBooks integration success check:", {
        status,
        statusOk,
        dataSuccess: data.success,
        dataSuccessType: typeof data.success,
        hasSuccessFlag,
        hasPurchaseId,
        hasSuccessMessage,
        hasError,
        errorValue: data.error,
        isSuccess,
        fullData: data,
      });

      if (isSuccess) {
        let message =
          data.message || "Receipt linked to QuickBooks successfully!";
        if (data.instructions) {
          message += ` ${data.instructions}`;
        }
        if (data.warning) {
          message += ` ${data.warning}`;
        } else if (data.note) {
          message += ` ${data.note}`;
        }
        setToast({ isVisible: true, message: message, type: "success" });

        // Update local state only (no API call) - refreshData will fetch fresh data
        if (latestRec.id != null) {
          setSelectedReceipt((prev) =>
            prev ? { ...prev, quickbooksLinked: true } : prev
          );
        }

        // Refresh receipt data from backend to ensure all data (including payment method logos) is up to date
        // This calls getreceiptfromdatev1 API to fetch fresh data
        try {
          refreshData();
        } catch (refreshErr) {
          console.error(
            "Error refreshing data after QuickBooks link:",
            refreshErr
          );
          // Don't show error toast for refresh failure - the link was successful
        }
      } else {
        // Error response (non-200 status or error field present)
        console.error("QuickBooks integration failed:", {
          status,
          statusOk,
          error: data.error,
          message: data.message,
          details: data.details,
        });

        // Show detailed error message from backend
        let errorMessage =
          data.error ||
          data.message ||
          `Failed to link receipt to QuickBooks (HTTP ${status}).`;

        // Include details if available (for debugging)
        if (data.details) {
          console.error("QuickBooks integration error details:", data.details);
          // In development, show more details
          if (
            process.env.NODE_ENV === "development" ||
            window.location.hostname === "localhost"
          ) {
            const detailsStr =
              typeof data.details === "string"
                ? data.details
                : JSON.stringify(data.details);
            errorMessage += ` Check console for details.`;
          }
        }

        setToast({ isVisible: true, message: errorMessage, type: "error" });
      }
    } catch (err) {
      console.error("QuickBooks link error:", err);
      console.error("Error details:", {
        message: err.message,
        stack: err.stack,
        name: err.name,
        cause: err.cause,
      });

      // Provide more specific error message
      let errorMessage = "Failed to link receipt. Please try again.";
      if (err.message) {
        errorMessage += ` Error: ${err.message}`;
      }

      setToast({
        isVisible: true,
        message: errorMessage,
        type: "error",
      });
    } finally {
      setLinkToQbLoading(false);
    }
  };

  // Add this new function for direct PDF download
  const handleDirectDownloadPDF = async () => {
    setShareMenu(false);

    try {
      // Import html2pdf dynamically
      const html2pdf = (await import("html2pdf.js")).default;

      // Use the same HTML structure as ViewReport for consistency
      const receipt = r;
      const paymentDisplayName = getPaymentDisplayName(receipt);

      const formatCurrencyFixed2 = (amount) => {
        const num = Number(amount) || 0;
        try {
          return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(num);
        } catch (_) {
          return num.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        }
      };

      const categoryLabel =
        String(receipt?.receipt_category) === "1"
          ? "Business"
          : String(receipt?.receipt_category) === "0"
          ? "Personal"
          : "-";

      const taxesArray = Array.isArray(receipt?.receipt_tax_values)
        ? receipt.receipt_tax_values
        : [];

      const nonTipTaxes = taxesArray
        .filter((t) => !(t?.tax_name || "").toLowerCase().includes("tip"))
        .sort((a, b) => (a?.tax_name || "").localeCompare(b?.tax_name || ""));

      const tipTax = taxesArray.find((t) =>
        (t?.tax_name || "").toLowerCase().includes("tip")
      );

      const taxRowsHtml = nonTipTaxes
        .map((t) => {
          const rateNum =
            t?.tax_rate !== undefined && t?.tax_rate !== null
              ? parseFloat(String(t.tax_rate).replace(/%/g, ""))
              : 0;
          const rateStr = `${parseFloat((isNaN(rateNum) ? 0 : rateNum).toFixed(3))}%`;
          const amt = Number(t?.tax_amount) || 0;
          const name = (t?.tax_name || "Tax").toString();
          return `
            <div class="total-row">
              <span>${name} (${rateStr})</span>
              <span>${formatCurrencyFixed2(amt)}</span>
            </div>
          `;
        })
        .join("");

      const tipsRowHtml = tipTax
        ? (() => {
            const tipAmount = Number(tipTax?.tax_amount) || 0;
            const subtotal = Number(
              receipt.subtotal || receipt.purchasePrice || 0
            );

            let tipPercentage = 0;
            if (subtotal > 0 && tipAmount > 0) {
              tipPercentage = Math.round((tipAmount / subtotal) * 100);
            }

            return `
              <div class="total-row">
                <span>Tips (${tipPercentage}%)</span>
                <span>${formatCurrencyFixed2(tipAmount)}</span>
              </div>
            `;
          })()
        : `
          <div class="total-row">
            <span>Tips (0%)</span>
            <span>-</span>
          </div>
        `;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Receipt Report - ${receipt.storeName || "Merchant"}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
              }
              body {
                font-family: Arial, sans-serif;
                color: #404040;
                background: white;
                min-height: 100vh;
              }
              .container {
                max-width: 900px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                text-align: center;
                margin-bottom: 30px;
              }
              .merchant {
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 5px;
                color: #333;
              }
              .date {
                color: #6b7280;
                font-size: 14px;
              }
              .section {
                margin-bottom: 25px;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                overflow: hidden;
                background: #fff;
                page-break-inside: avoid;
              }
              .section-title {
                background-color: #f9fafb;
                padding: 12px 16px;
                font-weight: 600;
                font-size: 15px;
                border-bottom: 1px solid #e5e7eb;
                color: #374151;
              }
              .row {
                display: flex;
                padding: 10px 16px;
                border-bottom: 1px solid #f3f4f6;
              }
              .row:last-child { border-bottom: none; }
              .label {
                width: 180px;
                font-weight: 500;
                color: #4b5563;
              }
              .value {
                flex: 1;
                color: #111827;
              }
              .total-row {
                display: flex;
                justify-content: space-between;
                padding: 10px 16px;
                page-break-inside: avoid;
              }
              .total-row.total {
                border-top: 2px solid #111827;
                font-weight: 600;
                font-size: 16px;
                background: #f9fafb;
              }
              .receipt-image-section {
                margin: 25px 0;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                overflow: hidden;
                background: #fff;
                page-break-inside: avoid;
              }
              .receipt-image-container {
                padding: 20px;
                text-align: center;
                background: #f9fafb;
              }
              .receipt-image {
                max-width: 100%;
                max-height: 600px;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              }
              .pdf-viewer {
                width: 100%;
                height: 600px;
                border: none;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              }
              .image-notice {
                padding: 20px;
                text-align: center;
                color: #6b7280;
                font-style: italic;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="merchant">${
                  receipt.storeName || "MERCHANT NAME"
                }</div>
                <div class="date">${formatDate(receipt.product_date)}</div>
              </div>

              <div class="section">
                <div class="section-title">RECEIPT INFORMATION</div>
                <div class="row">
                  <div class="label">Date</div>
                  <div class="value">${
                    formatDate(receipt.product_date) || "—"
                  }</div>
                </div>
                <div class="row">
                  <div class="label">Expense Type</div>
                  <div class="value">${categoryLabel}</div>
                </div>
                <div class="row">
                  <div class="label">Merchant</div>
                  <div class="value">${receipt.storeName || "—"}</div>
                </div>
                <div class="row">
                  <div class="label">Expense Category</div>
                  <div class="value">${receipt.expense_type || "—"}</div>
                </div>
                <div class="row">
                  <div class="label">Payment</div>
                  <div class="value">${paymentDisplayName}</div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">RECEIPT TOTALS</div>
                <div class="total-row">
                  <span>Subtotal</span>
                  <span>${formatCurrencyFixed2(receipt.subtotal || 0)}</span>
                </div>
                ${taxRowsHtml}
                ${tipsRowHtml}
                <div class="total-row total">
                  <span>Total</span>
                  <span>${formatCurrencyFixed2(
                    receipt.purchasePrice || 0
                  )}</span>
                </div>
              </div>

              <div class="section">
                <div class="section-title">MORE INFORMATION</div>
                <div class="row">
                  <div class="label">Describe Purchase</div>
                  <div class="value">${receipt.product_name || ""}</div>
                </div>
                <div class="row">
                  <div class="label">Notes</div>
                  <div class="value">${receipt.notes || ""}</div>
                </div>
              </div>

              <!-- Tags Selected Section -->
              <div class="section">
                <div class="section-title">TAGS SELECTED</div>
                ${(() => {
                  const parseReceiptTags = (receiptTagString) => {
                    if (!receiptTagString) return null;
                    const tags = receiptTagString
                      .split(",")
                      .map((tag) => tag.trim());
                    return {
                      locked: tags[0] === "1",
                      starred: tags[1] === "1",
                      flagged: tags[2] === "1",
                      verified: tags[3] === "1",
                      reconciled: tags[4] === "1",
                      reimbursed: tags[5] === "1",
                      warrantied: tags[6] === "1",
                    };
                  };

                  const getTagDisplayName = (tagName) => {
                    const tagNames = {
                      starred: "Starred",
                      flagged: "Flagged",
                      verified: "Verified",
                      reconciled: "Reconciled",
                      reimbursed: "Reimbursed",
                      warrantied: "Warrantied",
                    };
                    return tagNames[tagName] || tagName;
                  };

                  const receiptTags = parseReceiptTags(receipt.receipt_tag);

                  if (!receiptTags) {
                    return '<div class="row"><div class="value" style="text-align: center; color: #999;">No tags selected</div></div>';
                  }

                  const activeTags = [];
                  Object.entries(receiptTags).forEach(([tagName, isActive]) => {
                    if (isActive && tagName !== "locked") {
                      activeTags.push(getTagDisplayName(tagName));
                    }
                  });

                  if (activeTags.length === 0) {
                    return '<div class="row"><div class="value" style="text-align: center; color: #999;">No tags selected</div></div>';
                  }

                  return (
                    '<div class="row"><div class="value"><div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px;">' +
                    activeTags
                      .map(
                        (tag) =>
                          '<div style="background: #f0f9ff; border: 1px solid #007bff; border-radius: 16px; padding: 4px 12px; font-size: 12px; color: #007bff; font-weight: 500;">' +
                          tag +
                          "</div>"
                      )
                      .join("") +
                    "</div></div></div>"
                  );
                })()}
              </div>

              <!-- Linked to Inventory -->
              <div class="section">
                <div class="row w-auto me-4">
                  <div class="label">Linked to Inventory</div>
                  <div class="value">${
                    receipt.isLinkedToInventory ? "Yes" : "No"
                  }</div>
                </div>
              </div>

              <!-- Receipt Image/PDF Section - Always show image/PDF -->
              <div class="receipt-image-section">
                <div class="section-title">RECEIPT IMAGE</div>
                <div class="receipt-image-container">
                  ${(() => {
                    const getEmailAttachmentUrl = () => {
                      const urls = [
                        ...splitMediaField(receipt?.receipt_image),
                        ...splitMediaField(receipt?.emailAttachment),
                      ];
                      const url = urls[0] || "";
                      if (!url) return "";
                      const invalidPatterns = [
                        "android.resource://",
                        "content://",
                        "file://",
                        "resource://",
                      ];
                      if (invalidPatterns.some((p) => url.startsWith(p))) return "";
                      return url;
                    };

                    const emailAttachmentUrl = getEmailAttachmentUrl();
                    const isPdfAttachment = isPdfUrl(emailAttachmentUrl);
                    const finalPdfUrl = isPdfAttachment
                      ? getPdfProxyUrl(emailAttachmentUrl)
                      : emailAttachmentUrl;

                    return finalPdfUrl
                      ? isPdfAttachment
                        ? `<iframe src="${finalPdfUrl}" class="pdf-viewer" title="Receipt PDF"></iframe>`
                        : `<img src="${finalPdfUrl}" class="receipt-image" alt="Receipt" onerror="this.onerror=null; this.src=''; this.parentNode.innerHTML='<div class=\\'image-notice\\'>Receipt image could not be loaded</div>';" />`
                      : '<div class="image-notice">No receipt image available</div>';
                  })()}
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      // Create element for PDF generation
      const element = document.createElement("div");
      element.innerHTML = htmlContent;

      // PDF options - same as ViewReport
      const options = {
        margin: 10,
        filename: `Receipt_${receipt.id || Date.now()}.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          logging: false,
          scrollY: 0,
        },
        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait",
        },
      };

      // Generate and download PDF
      await html2pdf().from(element).set(options).save();
    } catch (error) {
      console.error("Error generating PDF:", error);
      setAlertMsg("Failed to generate PDF. Please try again.");
    }
  };

  const handleEmailReceipt = () => {
    setShareMenu(false);

    const subject = `Receipt from ${r.storeName || "Merchant"} - ${formatDate(
      r.product_date
    )}`;
    const body = `
Receipt Details:

Merchant: ${r.storeName || "-"}
Date: ${formatDate(r.product_date)}
Amount: ${formatCurrency(r.total || r.purchasePrice || 0)}
Payment Method: ${getPaymentDisplayName(r)}
Category: ${r.expense_type || "-"}

Description: ${r.product_name || "No description provided"}
Notes: ${r.notes || "No notes provided"}

Thank you for using our receipt management system.
    `.trim();

    const mailtoLink = `mailto:?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoLink;
  };

  // Fixed View Report handler
  const handleViewReport = () => {
    setShareMenu(false);
    setShowViewReport(true);
  };

  // Download CSV handler
  const handleDownloadCSV = () => {
    setShareMenu(false);

    const csvData = {
      "Receipt ID": r.id,
      Date: formatDate(r.product_date),
      Merchant: r.storeName || "",
      "Expense Type":
        String(r.receipt_category) === "0" ? "Personal" : "Business",
      "Expense Category": r.expense_type || "",
      "Payment Method": getPaymentDisplayName(r),
      Subtotal: r.subtotal || r.purchasePrice || 0,
      "Total Tax": Array.isArray(r.receipt_tax_values)
        ? r.receipt_tax_values.reduce(
            (sum, tax) => sum + (parseFloat(tax.tax_amount) || 0),
            0
          )
        : 0,
      Total: r.total || r.purchasePrice || 0,
      Description: r.product_name || "",
      Notes: r.notes || "",
    };

    const csvContent =
      "data:text/csv;charset=utf-8," +
      Object.keys(csvData).join(",") +
      "\n" +
      Object.values(csvData).join(",");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `receipt_${r.id}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Download ZIP handler
  const handleDownloadZIP = async () => {
    setShareMenu(false);

    try {
      const zip = new JSZip();

      // Generate PDF blob (same as direct PDF download)
      const html2pdf = (await import("html2pdf.js")).default;
      const receipt = r;
      const paymentDisplayName = getPaymentDisplayName(receipt);

      const formatCurrencyFixed2 = (amount) => {
        const num = Number(amount) || 0;
        try {
          return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }).format(num);
        } catch (_) {
          return num.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
        }
      };

      const categoryLabel =
        String(receipt?.receipt_category) === "1"
          ? "Business"
          : String(receipt?.receipt_category) === "0"
          ? "Personal"
          : "-";

      const taxesArray = Array.isArray(receipt?.receipt_tax_values)
        ? receipt.receipt_tax_values
        : [];

      const nonTipTaxes = taxesArray
        .filter((t) => !(t?.tax_name || "").toLowerCase().includes("tip"))
        .sort((a, b) => (a?.tax_name || "").localeCompare(b?.tax_name || ""));

      const tipTax = taxesArray.find((t) =>
        (t?.tax_name || "").toLowerCase().includes("tip")
      );

      const taxRowsHtml = nonTipTaxes
        .map((t) => {
          const rateNum =
            t?.tax_rate !== undefined && t?.tax_rate !== null
              ? parseFloat(String(t.tax_rate).replace(/%/g, ""))
              : 0;
          const rateStr = `${parseFloat((isNaN(rateNum) ? 0 : rateNum).toFixed(3))}%`;
          const amt = Number(t?.tax_amount) || 0;
          const name = (t?.tax_name || "Tax").toString();
          return `
            <div class="total-row">
              <span>${name} (${rateStr})</span>
              <span>${formatCurrencyFixed2(amt)}</span>
            </div>
          `;
        })
        .join("");

      const tipsRowHtml = tipTax
        ? (() => {
            const tipAmount = Number(tipTax?.tax_amount) || 0;
            const subtotal = Number(
              receipt.subtotal || receipt.purchasePrice || 0
            );

            let tipPercentage = 0;
            if (subtotal > 0 && tipAmount > 0) {
              tipPercentage = Math.round((tipAmount / subtotal) * 100);
            }

            return `
              <div class="total-row">
                <span>Tips (${tipPercentage}%)</span>
                <span>${formatCurrencyFixed2(tipAmount)}</span>
              </div>
            `;
          })()
        : `
          <div class="total-row">
            <span>Tips (0%)</span>
            <span>-</span>
          </div>
        `;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Receipt Report - ${receipt.storeName || "Merchant"}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <style>
              * {
                box-sizing: border-box;
                margin: 0;
                padding: 0;
              }
              body {
                font-family: Arial, sans-serif;
                color: #404040;
                background: white;
                min-height: 100vh;
              }
              .container {
                max-width: 900px;
                margin: 0 auto;
                padding: 20px;
              }
              .header {
                text-align: center;
                margin-bottom: 30px;
              }
              .merchant {
                font-size: 24px;
                font-weight: bold;
                margin-bottom: 5px;
                color: #333;
              }
              .date {
                color: #6b7280;
                font-size: 14px;
              }
              .section {
                margin-bottom: 25px;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                overflow: hidden;
                background: #fff;
                page-break-inside: avoid;
              }
              .section-title {
                background-color: #f9fafb;
                padding: 12px 16px;
                font-weight: 600;
                font-size: 15px;
                border-bottom: 1px solid #e5e7eb;
                color: #374151;
              }
              .row {
                display: flex;
                padding: 10px 16px;
                border-bottom: 1px solid #f3f4f6;
              }
              .row:last-child { border-bottom: none; }
              .label {
                width: 180px;
                font-weight: 500;
                color: #4b5563;
              }
              .value {
                flex: 1;
                color: #111827;
              }
              .total-row {
                display: flex;
                justify-content: space-between;
                padding: 10px 16px;
                page-break-inside: avoid;
              }
              .total-row.total {
                border-top: 2px solid #111827;
                font-weight: 600;
                font-size: 16px;
                background: #f9fafb;
              }
              .receipt-image-section {
                margin: 25px 0;
                border: 1px solid #e5e7eb;
                border-radius: 8px;
                overflow: hidden;
                background: #fff;
                page-break-inside: avoid;
              }
              .receipt-image-container {
                padding: 20px;
                text-align: center;
                background: #f9fafb;
              }
              .receipt-image {
                max-width: 100%;
                max-height: 600px;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              }
              .pdf-viewer {
                width: 100%;
                height: 600px;
                border: none;
                border-radius: 4px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
              }
              .image-notice {
                padding: 20px;
                text-align: center;
                color: #6b7280;
                font-style: italic;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <div class="merchant">${
                  receipt.storeName || "MERCHANT NAME"
                }</div>
                <div class="date">${formatDate(receipt.product_date)}</div>
              </div>

              <div class="section">
                <div class="section-title">RECEIPT INFORMATION</div>
                <div class="row">
                  <div class="label">Date</div>
                  <div class="value">${
                    formatDate(receipt.product_date) || "—"
                  }</div>
                </div>
                <div class="row">
                  <div class="label">Expense Type</div>
                  <div class="value">${categoryLabel}</div>
                </div>
                <div class="row">
                  <div class="label">Merchant</div>
                  <div class="value">${receipt.storeName || "—"}</div>
                </div>
                <div class="row">
                  <div class="label">Expense Category</div>
                  <div class="value">${receipt.expense_type || "—"}</div>
                </div>
                <div class="row">
                  <div class="label">Payment</div>
                  <div class="value">${paymentDisplayName}</div>
                </div>
              </div>

              <div class="section">
                <div class="section-title">RECEIPT TOTALS</div>
                <div class="total-row">
                  <span>Subtotal</span>
                  <span>${formatCurrencyFixed2(receipt.subtotal || 0)}</span>
                </div>
                ${taxRowsHtml}
                ${tipsRowHtml}
                <div class="total-row total">
                  <span>Total</span>
                  <span>${formatCurrencyFixed2(
                    receipt.purchasePrice || 0
                  )}</span>
                </div>
              </div>

              <div class="section">
                <div class="section-title">MORE INFORMATION</div>
                <div class="row">
                  <div class="label">Describe Purchase</div>
                  <div class="value">${receipt.product_name || ""}</div>
                </div>
                <div class="row">
                  <div class="label">Notes</div>
                  <div class="value">${receipt.notes || ""}</div>
                </div>
              </div>

              <!-- Tags Selected Section -->
              <div class="section">
                <div class="section-title">TAGS SELECTED</div>
                ${(() => {
                  const parseReceiptTags = (receiptTagString) => {
                    if (!receiptTagString) return null;
                    const tags = receiptTagString
                      .split(",")
                      .map((tag) => tag.trim());
                    return {
                      locked: tags[0] === "1",
                      starred: tags[1] === "1",
                      flagged: tags[2] === "1",
                      verified: tags[3] === "1",
                      reconciled: tags[4] === "1",
                      reimbursed: tags[5] === "1",
                      warrantied: tags[6] === "1",
                    };
                  };

                  const getTagDisplayName = (tagName) => {
                    const tagNames = {
                      starred: "Starred",
                      flagged: "Flagged",
                      verified: "Verified",
                      reconciled: "Reconciled",
                      reimbursed: "Reimbursed",
                      warrantied: "Warrantied",
                    };
                    return tagNames[tagName] || tagName;
                  };

                  const receiptTags = parseReceiptTags(receipt.receipt_tag);

                  if (!receiptTags) {
                    return '<div class="row"><div class="value" style="text-align: center; color: #999;">No tags selected</div></div>';
                  }

                  const activeTags = [];
                  Object.entries(receiptTags).forEach(([tagName, isActive]) => {
                    if (isActive && tagName !== "locked") {
                      activeTags.push(getTagDisplayName(tagName));
                    }
                  });

                  if (activeTags.length === 0) {
                    return '<div class="row"><div class="value" style="text-align: center; color: #999;">No tags selected</div></div>';
                  }

                  return (
                    '<div class="row"><div class="value"><div style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: 5px;">' +
                    activeTags
                      .map(
                        (tag) =>
                          '<div style="background: #f0f9ff; border: 1px solid #007bff; border-radius: 16px; padding: 4px 12px; font-size: 12px; color: #007bff; font-weight: 500;">' +
                          tag +
                          "</div>"
                      )
                      .join("") +
                    "</div></div></div>"
                  );
                })()}
              </div>

              <!-- Linked to Inventory -->
              <div class="section">
                <div class="row w-auto me-4">
                  <div class="label">Linked to Inventory</div>
                  <div class="value">${
                    receipt.isLinkedToInventory ? "Yes" : "No"
                  }</div>
                </div>
              </div>

              <!-- Receipt Image/PDF Section - Always show image/PDF -->
              <div class="receipt-image-section">
                <div class="section-title">RECEIPT IMAGE</div>
                <div class="receipt-image-container">
                  ${(() => {
                    const getEmailAttachmentUrl = () => {
                      const urls = [
                        ...splitMediaField(receipt?.receipt_image),
                        ...splitMediaField(receipt?.emailAttachment),
                      ];
                      const url = urls[0] || "";
                      if (!url) return "";
                      const invalidPatterns = [
                        "android.resource://",
                        "content://",
                        "file://",
                        "resource://",
                      ];
                      if (invalidPatterns.some((p) => url.startsWith(p))) return "";
                      return url;
                    };

                    const emailAttachmentUrl = getEmailAttachmentUrl();
                    const isPdfAttachment = isPdfUrl(emailAttachmentUrl);
                    const finalPdfUrl = isPdfAttachment
                      ? getPdfProxyUrl(emailAttachmentUrl)
                      : emailAttachmentUrl;

                    return finalPdfUrl
                      ? isPdfAttachment
                        ? `<iframe src="${finalPdfUrl}" class="pdf-viewer" title="Receipt PDF"></iframe>`
                        : `<img src="${finalPdfUrl}" class="receipt-image" alt="Receipt" onerror="this.onerror=null; this.src=''; this.parentNode.innerHTML='<div class=\\'image-notice\\'>Receipt image could not be loaded</div>';" />`
                      : '<div class="image-notice">No receipt image available</div>';
                  })()}
                </div>
              </div>
            </div>
          </body>
        </html>
      `;

      const element = document.createElement("div");
      element.innerHTML = htmlContent;

      const options = {
        margin: 10,
        filename: `Receipt_${receipt.id || Date.now()}.pdf`,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          foreignObjectRendering: true,
          logging: false,
          scrollY: 0,
        },
        jsPDF: {
          unit: "mm",
          format: "a4",
          orientation: "portrait",
        },
      };

      const pdfBlob = await html2pdf()
        .from(element)
        .set(options)
        .outputPdf("blob");

      // Add PDF to ZIP
      zip.file(`receipt_${r.id}.pdf`, pdfBlob);

      const receiptData = {
        id: r.id,
        date: formatDate(r.product_date),
        merchant: r.storeName || "",
        expenseType:
          String(r.receipt_category) === "0" ? "Personal" : "Business",
        expenseCategory: r.expense_type || "",
        paymentMethod: getPaymentDisplayName(r),
        subtotal: r.subtotal || r.purchasePrice || 0,
        totalTax: Array.isArray(r.receipt_tax_values)
          ? r.receipt_tax_values.reduce(
              (sum, tax) => sum + (parseFloat(tax.tax_amount) || 0),
              0
            )
          : 0,
        total: r.total || r.purchasePrice || 0,
        description: r.product_name || "",
        notes: r.notes || "",
        tags: receiptTags,
      };

      zip.file("receipt_data.json", JSON.stringify(receiptData, null, 2));

      const csvData = {
        "Receipt ID": r.id,
        Date: formatDate(r.product_date),
        Merchant: r.storeName || "",
        "Expense Type":
          String(r.receipt_category) === "0" ? "Personal" : "Business",
        "Expense Category": r.expense_type || "",
        "Payment Method": getPaymentDisplayName(r),
        Subtotal: r.subtotal || r.purchasePrice || 0,
        "Total Tax": Array.isArray(r.receipt_tax_values)
          ? r.receipt_tax_values.reduce(
              (sum, tax) => sum + (parseFloat(tax.tax_amount) || 0),
              0
            )
          : 0,
        Total: r.total || r.purchasePrice || 0,
        Description: r.product_name || "",
        Notes: r.notes || "",
      };

      const csvContent =
        Object.keys(csvData).join(",") +
        "\n" +
        Object.values(csvData).join(",");
      zip.file("receipt_data.csv", csvContent);

      const content = await zip.generateAsync({ type: "blob" });

      const url = URL.createObjectURL(content);
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt_${r.id}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error generating ZIP file:", error);
      setAlertMsg("Error generating ZIP file. Please try again.");
    }
  };

  // Animation variants
  const slideVariants = {
    enter: (direction) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
      scale: 0.95,
    }),
    center: {
      x: 0,
      opacity: 1,
      scale: 1,
      transition: {
        duration: 0.3,
        ease: "easeOut",
      },
    },
    exit: (direction) => ({
      x: direction > 0 ? -300 : 300,
      opacity: 0,
      scale: 0.95,
      transition: {
        duration: 0.3,
        ease: "easeIn",
      },
    }),
  };

  const backdropVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { duration: 0.2 },
    },
  };

  const modalVariants = {
    hidden: {
      opacity: 0,
      scale: 0.8,
      y: 20,
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: 0.3,
        ease: "easeOut",
      },
    },
  };

  return (
    <>
      <motion.div
        initial="hidden"
        animate="visible"
        exit="hidden"
        variants={backdropVariants}
        className="fixed inset-0 z-50 flex items-center justify-center bg-white/30 backdrop-blur-sm receipt-detail-modal"
      >
        <motion.div
          ref={containerRef}
          className="relative w-full h-full overflow-auto p-2 sm:p-4 text-center touch-pan-y"
          onTouchStart={onContainerTouchStart}
          onTouchEnd={onContainerTouchEnd}
        >
          <motion.div
            variants={modalVariants}
            className="relative inline-block w-full max-w-4xl"
          >
            {/* Navigation Buttons - Desktop/Tablet (side positioned) */}
            {currentIndex > 0 && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={goToPrevious}
                className="hidden md:block absolute top-1/2 -translate-y-1/2 left-1 lg:left-[-55px] z-50 bg-white/90 hover:bg-white border border-gray-300 rounded-full p-2 lg:p-3 shadow-lg transition-all duration-200 w-auto"
              >
                <ChevronLeft
                  size={20}
                  className="lg:w-6 lg:h-6 text-blue-600"
                />
              </motion.button>
            )}

            {currentIndex < sortedReceipts.length - 1 && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={goToNext}
                className="hidden md:block absolute top-1/2 -translate-y-1/2 right-1 lg:right-[-55px] z-50 bg-white/90 hover:bg-white border border-gray-300 rounded-full p-2 lg:p-3 shadow-lg transition-all duration-200 w-auto"
              >
                <ChevronRight
                  size={20}
                  className="lg:w-6 lg:h-6 text-blue-600"
                />
              </motion.button>
            )}

            {/* Mobile Navigation Buttons - Bottom of screen */}
            <div className="md:hidden fixed bottom-16 left-1/2 transform -translate-x-1/2 z-50 flex gap-4">
              {currentIndex > 0 && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={goToPrevious}
                  className="bg-white/90 hover:bg-white border border-gray-300 rounded-full p-3 shadow-lg"
                >
                  <ChevronLeft size={24} className="text-blue-600" />
                </motion.button>
              )}
              {currentIndex < sortedReceipts.length - 1 && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={goToNext}
                  className="bg-white/90 hover:bg-white border border-gray-300 rounded-full p-3 shadow-lg"
                >
                  <ChevronRight size={24} className="text-blue-600" />
                </motion.button>
              )}
            </div>

            {/* Receipt Counter */}
            <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 z-50 bg-black/70 text-white px-3 py-1 rounded-full text-xs sm:text-sm font-medium shadow-lg">
              {currentIndex + 1} of {sortedReceipts.length}
            </div>

            <div className="bg-white rounded-xl shadow-2xl w-full max-h-[95vh] sm:max-h-[90vh] overflow-hidden border border-gray-200 relative flex flex-col">

              {/* Modal Header */}
              <div className="receipt-modal-header flex items-center border-b border-gray-200 px-3 sm:px-4 py-2 sm:py-2.5 bg-white sticky top-0 z-40">
                {/* Left side (fixed width for balance) */}
                <div className="w-[90px] sm:w-[130px] flex justify-start gap-1">
                  {/* Split screen: back button */}
                  {showSplitScreen ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (activeSplitIndex !== null) {
                          setActiveSplitIndex(null);
                        } else {
                          setShowSplitScreen(false);
                          setSplits([]);
                          setSplitError(null);
                          setSplitErrors({});
                        }
                      }}
                      className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-gray-100 hover:bg-gray-200 transition-colors"
                    >
                      <ChevronLeft size={18} className="text-gray-700" />
                    </button>
                  ) : isDraft ? (
                    /* Draft receipt — no X close button; user must use Save or Keep in Draft Mode */
                    <button
                      onClick={() => setShowDeleteConfirmation(true)}
                      className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 hover:bg-red-50 rounded-full transition-colors group"
                      aria-label="Delete"
                      title="Delete receipt"
                    >
                      <Trash2
                        size={16}
                        className="text-red-500 group-hover:text-red-600"
                      />
                    </button>
                  ) : (
                    <>
                  <button
                    onClick={onClose}
                    className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-full transition-colors"
                    style={{ backgroundColor: "#000000" }}
                    aria-label="Close"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#FFFFFF"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <line x1="18" y1="6" x2="6" y2="18"></line>
                      <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                  </button>
                  {/* Delete Button */}
                  <button
                    onClick={() => setShowDeleteConfirmation(true)}
                    className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 hover:bg-red-50 rounded-full transition-colors group"
                    aria-label="Delete"
                    title="Delete receipt"
                  >
                    <Trash2
                      size={16}
                      className="text-red-500 group-hover:text-red-600"
                    />
                  </button>
                    </>
                  )}
                </div>

                {/* Title - Center (flex-1 to take remaining space) */}
                <h2 className="flex-1 text-center text-sm sm:text-base md:text-lg font-bold text-gray-900">
                  {showSplitScreen && activeSplitIndex !== null
                    ? "Add Receipt Split"
                    : showSplitScreen
                    ? "Split Expense"
                    : "Edit Receipt"}
                </h2>

                {/* Right side actions (fixed width to match left for centering) */}
                <div className="w-[90px] sm:w-[130px] flex items-center justify-end gap-1 sm:gap-2">
                  {/* Split overview: SAVE button */}
                  {showSplitScreen && activeSplitIndex === null && (
                    <button
                      type="button"
                      onClick={handleSaveSplits}
                      disabled={isSavingSplits || splits.length === 0}
                      className="px-4 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSavingSplits ? "Saving…" : "SAVE"}
                    </button>
                  )}
                  {/* Split detail: SAVE button */}
                  {showSplitScreen && activeSplitIndex !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        const split = splits[activeSplitIndex];
                        if (!parseFloat(split?.purchasePrice) && !parseFloat(split?.subtotal)) {
                          setSplitErrors(prev => ({ ...prev, [split._id]: { amount: "Please enter an amount." } }));
                          return;
                        }
                        setSplitErrors(prev => { const n = { ...prev }; if (split) delete n[split._id]; return n; });
                        setActiveSplitIndex(null);
                      }}
                      className="px-4 py-1.5 bg-blue-600 text-white text-sm font-bold rounded-lg hover:bg-blue-700"
                    >
                      SAVE
                    </button>
                  )}
                  {/* Normal view: Locked/Unlocked + "..." options menu */}
                  {!showSplitScreen && (
                    <>
                  {/* Locked/Unlocked Status — click to toggle */}
                  <button
                    type="button"
                    onClick={() => toggleTag("locked")}
                    title={editedTags.locked ? "Click to unlock receipt" : "Click to lock receipt"}
                    className={`flex items-center gap-1 rounded-full px-1.5 sm:px-2 py-1 sm:py-1.5 transition-colors ${
                      editedTags.locked
                        ? "bg-red-100 hover:bg-red-200"
                        : "bg-gray-100 hover:bg-gray-200"
                    }`}
                  >
                    <img
                      src={getTagImage("locked", editedTags.locked)}
                      alt={editedTags.locked ? "Locked" : "Unlocked"}
                      className="w-3.5 h-3.5 sm:w-4 sm:h-4 object-contain flex-shrink-0"
                    />
                    <span className={`text-[8px] sm:text-[10px] font-medium whitespace-nowrap ${editedTags.locked ? "text-red-700" : "text-gray-700"}`}>
                      {editedTags.locked ? "Locked" : "Unlocked"}
                    </span>
                  </button>

                  {/* Share Button */}
                  <div className="relative">
                    <button
                      className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 bg-blue-50 hover:bg-blue-100 rounded-full transition-colors"
                      onClick={() => setShareMenu((prev) => !prev)}
                      aria-label="Share"
                    >
                      <img
                        src={shareIcon}
                        alt="Share"
                        className="w-4 h-4 sm:w-5 sm:h-5"
                      />
                    </button>
                    {shareMenu && (
                      <ShareOptions
                        ref={dropdownRef}
                        onViewReport={handleViewReport}
                        onSaveAsPDF={handleSaveAsPDF}
                        onDownloadPDF={handleDirectDownloadPDF}
                        onDownloadCSV={handleDownloadCSV}
                        onDownloadZIP={handleDownloadZIP}
                        onEmailReceipt={handleEmailReceipt}
                        onLinkToQuickBooks={handleLinkToQuickBooks}
                        quickbooksConnected={quickbooksConnected}
                        onClose={() => setShareMenu(false)}
                      />
                    )}
                  </div>
                  {/* "..." options menu with Split */}
                  <div className="relative" ref={optionsMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowOptionsMenu(prev => !prev)}
                      className="flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 bg-blue-600 hover:bg-blue-700 rounded-full transition-colors"
                      title="More options"
                      disabled={editedTags.locked}
                    >
                      <MoreHorizontal size={16} className="text-white" />
                    </button>
                    {showOptionsMenu && (
                      <div className="absolute top-full right-0 mt-2 bg-white shadow-xl border border-gray-200 rounded-xl z-[100] min-w-[140px] overflow-hidden">
                        {!isNetworkReceivedReceipt(selectedReceipt) && (
                          <button
                            type="button"
                            className="w-full text-left px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors border-b border-gray-100"
                            onClick={() => {
                              setShowOptionsMenu(false);
                              setShowForwardModal(true);
                            }}
                          >
                            Forward
                          </button>
                        )}
                        <button
                          type="button"
                          className="w-full text-left px-4 py-3 text-sm font-medium text-gray-800 hover:bg-gray-50 transition-colors"
                          onClick={handleOpenSplit}
                        >
                          Split
                        </button>
                      </div>
                    )}
                  </div>
                    </>
                  )}
                </div>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto flex-1 min-h-0 relative">
              <div ref={scrollContentRef}>
                {/* ── Split Screen ─────────────────────────────────────────── */}
                {showSplitScreen ? (
                  <div className="p-4 sm:p-6">
                    {activeSplitIndex !== null && splits[activeSplitIndex] ? (
                      /* Split Detail View */
                      (() => {
                        const split = splits[activeSplitIndex];
                        const mainSubtotal = parseFloat(editedReceipt.subtotal) || parseFloat(editedReceipt.purchasePrice) || parseFloat(selectedReceipt?.subtotal) || 0;
                        const mainTotal    = parseFloat(editedReceipt.purchasePrice) || parseFloat(selectedReceipt?.purchasePrice) || 0;
                        const fieldErr     = splitErrors[split._id] || {};
                        const hasAmountErr = !!fieldErr.amount;
                        return (
                          <div className="space-y-4">
                            {/* Expense Type */}
                            <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Expense Type</label>
                              <div className="flex rounded-lg overflow-hidden border border-gray-200">
                                <button type="button"
                                  className={`flex-1 py-2 text-sm font-medium transition-colors ${parseInt(split.receipt_category) !== 1 ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                                  onClick={() => updateSplitField(activeSplitIndex, "receipt_category", 0)}>Personal</button>
                                <button type="button"
                                  className={`flex-1 py-2 text-sm font-medium transition-colors ${parseInt(split.receipt_category) === 1 ? "bg-blue-600 text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
                                  onClick={() => updateSplitField(activeSplitIndex, "receipt_category", 1)}>Business</button>
                              </div>
                            </div>
                            {/* Category */}
                            <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Category</label>
                              <select
                                className="w-full border border-blue-400 text-sm px-2 py-2 rounded-md bg-white text-gray-800"
                                value={split.expense_type || ""}
                                onChange={(e) => updateSplitField(activeSplitIndex, "expense_type", e.target.value)}
                              >
                                <option value="">Select category</option>
                                {allExpenseCategories.map(cat => (
                                  <option key={cat} value={cat}>{cat}</option>
                                ))}
                              </select>
                            </div>
                            {/* Subtotal */}
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className={`text-xs font-bold uppercase tracking-wide ${hasAmountErr ? "text-red-500" : "text-gray-500"}`}>Subtotal *</label>
                                <span className="text-xs text-gray-400">Max: ${mainSubtotal.toFixed(2)}</span>
                              </div>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">$</span>
                                <input type="number"
                                  className={`w-full text-sm pl-6 pr-2 py-2 rounded-md bg-white text-gray-800 border ${hasAmountErr ? "border-red-400 ring-1 ring-red-300" : "border-blue-400"}`}
                                  value={split.subtotal ?? ""} onChange={(e) => updateSplitField(activeSplitIndex, "subtotal", e.target.value)}
                                  placeholder="0.00" min="0" max={mainSubtotal} step="0.01" />
                              </div>
                              {hasAmountErr && <p className="mt-1 text-xs text-red-500">{fieldErr.amount}</p>}
                            </div>
                            {/* Tax fields */}
                            {(split.receipt_tax_values || []).map((t, ti) => {
                              const maxTax = parseFloat(((parseFloat(t.tax_rate || 0) / 100) * mainSubtotal).toFixed(2));
                              return (
                                <div key={ti}>
                                  <div className="flex items-center justify-between mb-1">
                                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">{t.tax_name} ({t.tax_rate}%)</label>
                                    <span className="text-xs text-gray-400">Max: ${maxTax.toFixed(2)}</span>
                                  </div>
                                  <div className="relative">
                                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">$</span>
                                    <input type="number"
                                      className="w-full border border-blue-400 text-sm pl-6 pr-2 py-2 rounded-md bg-white text-gray-800"
                                      value={t.tax_amount ?? ""}
                                      onChange={(e) => {
                                        const v = parseFloat(e.target.value) || 0;
                                        if (maxTax > 0 && v > maxTax) { setAlertMsg(`${t.tax_name} cannot exceed $${maxTax.toFixed(2)}`); return; }
                                        const updatedTaxes = split.receipt_tax_values.map((tv, tvi) => tvi === ti ? { ...tv, tax_amount: e.target.value } : tv);
                                        updateSplitField(activeSplitIndex, "receipt_tax_values", updatedTaxes);
                                      }}
                                      placeholder="0.00" min="0" step="0.01" />
                                  </div>
                                </div>
                              );
                            })}
                            {/* Total */}
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label className={`text-xs font-bold uppercase tracking-wide ${hasAmountErr ? "text-red-500" : "text-gray-500"}`}>Total *</label>
                                <span className="text-xs text-gray-400">Max: ${mainTotal.toFixed(2)}</span>
                              </div>
                              <div className="relative">
                                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">$</span>
                                <input type="number"
                                  className={`w-full text-sm pl-6 pr-2 py-2 rounded-md bg-white text-gray-800 border ${hasAmountErr ? "border-red-400 ring-1 ring-red-300" : "border-blue-400"}`}
                                  value={split.purchasePrice ?? ""} onChange={(e) => updateSplitField(activeSplitIndex, "purchasePrice", e.target.value)}
                                  placeholder="0.00" min="0" max={mainTotal} step="0.01" />
                              </div>
                              {hasAmountErr && <p className="mt-1 text-xs text-red-500">{fieldErr.amount}</p>}
                            </div>
                            {/* Description */}
                            <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Describe Purchase</label>
                              <input type="text"
                                className="w-full border border-blue-400 text-sm px-2 py-2 rounded-md bg-white text-gray-800"
                                value={split.product_name || ""} onChange={(e) => updateSplitField(activeSplitIndex, "product_name", e.target.value)}
                                maxLength={MAX_DESCRIPTION_LENGTH}
                                placeholder="Enter a description" />
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      /* ── Split Overview ── */
                      (() => {
                        const mainTotal   = parseFloat(editedReceipt.purchasePrice || selectedReceipt?.purchasePrice || 0);
                        const splitsTotal = parseFloat(splits.reduce((s, sp) => s + (parseFloat(sp.purchasePrice) || 0), 0).toFixed(2));
                        const remainder   = parseFloat((mainTotal - splitsTotal).toFixed(2));
                        const isOverBudget = remainder < -0.009;
                        const payLogo = getPaymentLogo({ ...selectedReceipt, ...editedReceipt });
                        const storeName = editedReceipt.storeName || selectedReceipt?.storeName || "—";
                        return (
                        <div className="space-y-3">
                          {/* ── Existing Receipt row ── */}
                          <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 flex items-center gap-3">
                            {payLogo && (
                              <LoadingImage src={payLogo} alt="payment" className="w-8 h-5 object-contain flex-shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-500 font-medium">Existing (will update)</p>
                              <p className="font-semibold text-gray-900 text-sm truncate">{storeName}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="font-bold text-gray-900 text-sm">${mainTotal.toFixed(2)}</p>
                              {splits.length > 0 && (
                                <p className={`text-xs font-semibold mt-0.5 ${isOverBudget ? "text-red-500" : "text-blue-600"}`}>
                                  → ${remainder.toFixed(2)}
                                </p>
                              )}
                            </div>
                          </div>

                          {isOverBudget && (
                            <div className="px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs font-medium">
                              ⚠ Splits exceed total by ${Math.abs(remainder).toFixed(2)}
                            </div>
                          )}

                          {/* ── Split rows ── */}
                          {splits.length === 0 ? (
                            <div className="text-center py-8 text-gray-400">
                              <p className="text-sm font-medium">No splits yet</p>
                              <p className="text-xs mt-1">Tap "Add Split" to create a new split receipt.</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New Split Receipts</p>
                              {splits.map((split, idx) => {
                                const hasErr = !!splitErrors[split._id];
                                const hasAmount = !!(parseFloat(split.purchasePrice) || parseFloat(split.subtotal));
                                return (
                                  <div key={split._id}
                                    className={`bg-white border rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors ${hasErr ? "border-red-400 bg-red-50" : "border-blue-200 hover:border-blue-400"}`}
                                    onClick={() => setActiveSplitIndex(idx)}
                                  >
                                    {payLogo && (
                                      <LoadingImage src={payLogo} alt="payment" className="w-8 h-5 object-contain flex-shrink-0" />
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="font-semibold text-gray-800 text-sm">Split {idx + 1}</p>
                                      {split.expense_type && <p className="text-xs text-gray-400 truncate">{split.expense_type}</p>}
                                      {!hasAmount && <p className="text-xs text-gray-400">Tap to fill in details →</p>}
                                      {hasErr && <p className="text-xs text-red-500 font-medium">Incomplete — tap to fix</p>}
                                    </div>
                                    <div className="flex items-center gap-2 flex-shrink-0">
                                      <p className={`font-bold text-sm ${hasAmount ? "text-blue-600" : "text-gray-400"}`}>
                                        {hasAmount ? `$${parseFloat(split.purchasePrice || 0).toFixed(2)}` : "—"}
                                      </p>
                                      <button type="button" onClick={(e) => { e.stopPropagation(); removeSplit(idx); }}
                                        className="text-red-400 hover:text-red-600 p-1" title="Remove split">
                                        <Trash2 size={14} />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Add Split Button */}
                          <button type="button" onClick={addSplit}
                            className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-blue-300 rounded-xl text-blue-600 font-medium text-sm hover:border-blue-500 hover:bg-blue-50 transition-colors">
                            <Plus size={18} /> Add Split
                          </button>

                          {splitError && (
                            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">{splitError}</div>
                          )}
                        </div>
                        );
                      })()
                    )}
                  </div>
                ) : (
                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={selectedReceipt?.id}
                    custom={direction}
                    variants={slideVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    className="w-full"
                  >
                    {/* Locked Banner */}
                    {editedTags.locked && (
                      <div className="mx-3 sm:mx-6 mt-3 px-4 py-3 bg-red-50 border border-red-300 rounded-lg flex items-center gap-2 text-red-700 text-sm font-medium">
                        <img src={locked} alt="Locked" className="w-4 h-4 object-contain" />
                        This receipt is locked. Unlock it in Tags below to edit and save changes.
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 p-3 sm:p-6 text-sm text-gray-800">
                      <div>
                        <h3 className="font-bold mb-4 text-gray-900 text-left">
                          RECEIPT INFORMATION
                        </h3>

                        <div className="mb-4 text-align-left">
                          <label className="font-bold">Expense Type</label>
                          <select
                            className={inputClass}
                            value={
                              editedReceipt.receipt_category ??
                              r.receipt_category
                            }
                            onChange={(e) =>
                              handleFieldChange(
                                "receipt_category",
                                e.target.value
                              )
                            }
                          >
                            <option value="0">Personal</option>
                            <option value="1">Business</option>
                          </select>
                        </div>

                        <div className="mb-4 text-align-left">
                          <label className="font-bold">Date</label>
                          <input
                            type="date"
                            className={inputClass}
                            value={productDateToInputValue(
                              editedReceipt.product_date,
                              selectedReceipt?.create_date ?? editedReceipt?.create_date,
                            )}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const unix = parseDateInputToUnix(e.target.value);
                              if (unix) handleFieldChange("product_date", unix);
                            }}
                          />
                        </div>

                        {/* Merchant with Dropdown */}
                        <div
                          className="mb-4 text-align-left"
                          ref={merchantInputRef}
                        >
                          <label className="font-bold">Merchant</label>
                          <div className="relative w-full">
                            {(editedReceipt.storeName || r.storeName || r.merchant) ? (
                              <div className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10">
                                <MerchantAvatar
                                  name={
                                    editedReceipt.storeName ||
                                    r.storeName ||
                                    r.merchant
                                  }
                                  explicitUrl={
                                    getMerchantImage(editedReceipt.storeName) ||
                                    r.store_image
                                  }
                                  className="w-5 h-5 mt-2"
                                />
                              </div>
                            ) : null}
                            <input
                              className={`${inputClass} ${(editedReceipt.storeName || r.storeName || r.merchant) ? "pl-8" : "pl-3"}`}
                              value={
                                editedReceipt.storeName ?? r.storeName ?? ""
                              }
                              onChange={(e) => {
                                handleFieldChange("storeName", e.target.value);
                                setIsMerchantTyping(true);
                                setShowMerchantDropdown(true);
                              }}
                              onFocus={() => {
                                setIsMerchantTyping(false);
                                setShowMerchantDropdown(true);
                              }}
                              placeholder="Select or type merchant name"
                            />
                            <ChevronDown
                              size={16}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
                              onClick={() => {
                                setIsMerchantTyping(false);
                                setShowMerchantDropdown(!showMerchantDropdown);
                              }}
                            />
                            {showMerchantDropdown && (
                                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto">
                                  {/* Add Merchant Option */}
                                  <div
                                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left flex items-center gap-2 border-b border-gray-200 bg-blue-50"
                                    onClick={handleOpenAddMerchantModal}
                                  >
                                    <Plus size={16} className="text-blue-600" />
                                    <span className="font-medium text-blue-600">
                                      Add Merchant
                                    </span>
                                  </div>
                                  {filteredMerchants.map((merchant, idx) => {
                                    const isMisc = merchant.name?.toLowerCase().trim() === "miscellaneous";
                                    return (
                                    <div
                                      key={idx}
                                      className="group px-3 py-2 hover:bg-blue-50 text-left flex items-center gap-2"
                                    >
                                      <div
                                        className="flex-1 flex items-center gap-2 cursor-pointer"
                                        onClick={() => {
                                          // Auto-fill expense category from receipt history if currently empty
                                          const suggestedCategory = getMerchantDefaultCategory(merchant.name);
                                          setEditedReceipt((prev) => ({
                                            ...prev,
                                            storeName: merchant.name,
                                            store_image: merchant.image || prev.store_image || "",
                                            ...(suggestedCategory && !prev.expense_type
                                              ? { expense_type: suggestedCategory }
                                              : {}),
                                          }));
                                          setShowMerchantDropdown(false);
                                        }}
                                      >
                                        <MerchantAvatar
                                          name={merchant.name}
                                          explicitUrl={merchant.image}
                                          className="w-5 h-5 mt-2"
                                        />
                                        <span className="truncate">{merchant.name}</span>
                                      </div>
                                      {!isMisc && (
                                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleOpenEditMerchant(merchant); }}
                                            title="Edit merchant"
                                            style={{ padding: "2px 5px", borderRadius: 6, background: "#eff6ff", border: "1px solid #bfdbfe", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                          >
                                            <Pencil size={11} style={{ color: "#2563eb" }} />
                                          </button>
                                          <button
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); handleDeleteMerchant(merchant); }}
                                            title="Delete merchant"
                                            style={{ padding: "2px 5px", borderRadius: 6, background: "#fef2f2", border: "1px solid #fecaca", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                          >
                                            <Trash2 size={11} style={{ color: "#dc2626" }} />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                    );
                                  })}
                                </div>
                              )}
                          </div>
                        </div>

                        {/* Expense Category with Dropdown */}
                        <div
                          className="mb-4 text-align-left"
                          ref={categoryInputRef}
                        >
                          <label className="font-bold">Expense Category</label>
                          <div className="relative">
                            <input
                              className={inputClass}
                              value={
                                editedReceipt.expense_type ??
                                r.expense_type ??
                                ""
                              }
                              onChange={(e) => {
                                handleFieldChange("expense_type", e.target.value);
                                setIsCategoryTyping(true);
                                setShowCategoryDropdown(true);
                              }}
                              onFocus={() => {
                                setIsCategoryTyping(false);
                                setShowCategoryDropdown(true);
                              }}
                              placeholder="e.g., Restaurants, Fuel, General Retail"
                            />
                            <ChevronDown
                              size={16}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
                              onClick={() => {
                                setIsCategoryTyping(false);
                                setShowCategoryDropdown(!showCategoryDropdown);
                              }}
                            />
                            {showCategoryDropdown && (
                                <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto">
                                  {/* Add Expense Category option */}
                                  <div
                                    className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left flex items-center gap-2 border-b border-gray-200 bg-blue-50"
                                    onClick={() => {
                                      setShowAddCategoryInput(true);
                                      setNewCategoryName("");
                                      setShowCategoryDropdown(false);
                                    }}
                                  >
                                    <Plus size={16} className="text-blue-600" />
                                    <span className="font-medium text-blue-600">Add Expense Category</span>
                                  </div>
                                  {filteredCategories.map((category, idx) => (
                                    <div
                                      key={idx}
                                      className="px-3 py-2 hover:bg-blue-50 text-left flex items-center justify-between group"
                                    >
                                      <span
                                        className="flex-1 cursor-pointer text-sm"
                                        onClick={() => {
                                          handleFieldChange("expense_type", category);
                                          setShowCategoryDropdown(false);
                                        }}
                                      >
                                        {category}
                                      </span>
                                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); handleOpenEditCategory(category); }}
                                          title="Edit category"
                                          style={{ padding: "2px 5px", borderRadius: 6, background: "#eff6ff", border: "1px solid #bfdbfe", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                        >
                                          <Pencil size={11} style={{ color: "#2563eb" }} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => { e.stopPropagation(); setDeletingCategory(category); setShowDeleteCategoryConfirm(true); setShowCategoryDropdown(false); }}
                                          title="Delete category"
                                          style={{ padding: "2px 5px", borderRadius: 6, background: "#fef2f2", border: "1px solid #fecaca", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                        >
                                          <Trash2 size={11} style={{ color: "#dc2626" }} />
                                        </button>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                          </div>
                        </div>

                        {/* Payment Method with Dropdown */}
                        <div
                          className="mb-4 text-align-left"
                          ref={paymentInputRef}
                        >
                          <label className="font-bold">Payment Method</label>
                          <div className="relative w-full">
                            {(() => {
                              // Merge editedReceipt with original receipt to ensure card_issuer_name is available
                              const receiptForLogo = { ...r, ...editedReceipt };
                              const logo = getPaymentLogo(receiptForLogo);
                              return logo ? (
                                <div className="absolute left-2 top-1/2 transform -translate-y-1/2 z-10 mt-1">
                                  <LoadingImage
                                    src={logo}
                                    alt={
                                      receiptForLogo.paymentType ||
                                      receiptForLogo.card_issuer_name ||
                                      ""
                                    }
                                    className="w-5 h-5 rounded object-contain"
                                    wrapperClassName="w-5 h-5"
                                  />
                                </div>
                              ) : null;
                            })()}
                            <input
                              className={`${inputClass} ${
                                (() => {
                                  const receiptForLogo = {
                                    ...r,
                                    ...editedReceipt,
                                  };
                                  return getPaymentLogo(receiptForLogo);
                                })()
                                  ? "pl-8"
                                  : ""
                              }`}
                              value={(() => {
                                // Use getPaymentDisplayName to show card issuer name + last4 (like homepage)
                                const receiptForDisplay = {
                                  ...r,
                                  ...editedReceipt,
                                };
                                return (
                                  getPaymentDisplayName(receiptForDisplay) || ""
                                );
                              })()}
                              onChange={(e) => {
                                // When user types, extract card issuer name and last4 from input
                                const inputValue = e.target.value;

                                // Extract parts: "Card Issuer Name *1234" or "Card Type *1234"
                                const parts = inputValue.split("*");
                                const baseName = parts[0]?.trim() || "";
                                const last4FromInput = parts[1]?.trim() || "";

                                // Detect card type for logo from the base name
                                let cardType = baseName;
                                const baseNameLower = baseName.toLowerCase();
                                if (baseNameLower.includes("visa"))
                                  cardType = "Visa";
                                else if (baseNameLower.includes("master"))
                                  cardType = "MasterCard";
                                else if (baseNameLower.includes("paypal"))
                                  cardType = "PayPal";
                                else if (
                                  baseNameLower.includes("amex") ||
                                  baseNameLower.includes("american express")
                                )
                                  cardType = "American Express";
                                else if (baseNameLower.includes("discover"))
                                  cardType = "Discover";
                                else if (baseNameLower.includes("diners"))
                                  cardType = "Diners Club";
                                else if (baseNameLower.includes("debit"))
                                  cardType = "Debit Card";
                                else if (baseNameLower.includes("cash"))
                                  cardType = "Cash";

                                // Update paymentType with card type (for logo detection)
                                handleFieldChange("paymentType", cardType);

                                // Clear paymentBrand so original receipt's brand doesn't override logo detection
                                handleFieldChange("paymentBrand", "");

                                const safeBaseName = baseName.replace(/\s*\*\d{3,4}$/, "").trim();
                                handleFieldChange(
                                  "card_issuer_name",
                                  storedCardIssuerName(safeBaseName, cardType)
                                );

                                // Update last_4_digit_card if present
                                if (
                                  last4FromInput &&
                                  /^\d{3,4}$/.test(last4FromInput)
                                ) {
                                  handleFieldChange(
                                    "last_4_digit_card",
                                    last4FromInput
                                  );
                                } else if (!last4FromInput) {
                                  // Clear last4 if user removed it
                                  handleFieldChange("last_4_digit_card", "");
                                }

                                setIsPaymentTyping(true);
                                setShowPaymentDropdown(true);
                              }}
                              onFocus={() => {
                                setIsPaymentTyping(false);
                                setShowPaymentDropdown(true);
                              }}
                              placeholder="Select or type payment method"
                            />
                            <ChevronDown
                              size={16}
                              className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 cursor-pointer"
                              onClick={() => {
                                setIsPaymentTyping(false);
                                setShowPaymentDropdown(!showPaymentDropdown);
                              }}
                            />
                            {showPaymentDropdown && (
                              <div className="absolute z-20 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-64 overflow-y-auto">
                                {/* Add Payment Method Option */}
                                <div
                                  className="px-3 py-2 hover:bg-blue-50 cursor-pointer text-left flex items-center gap-2 border-b border-gray-200 bg-blue-50"
                                  onClick={handleOpenAddPaymentModal}
                                >
                                  <Plus size={16} className="text-blue-600" />
                                  <span className="font-medium text-blue-600">
                                    Add Payment Method
                                  </span>
                                </div>
                                {filteredPaymentMethods.map((method, idx) => {
                                  const isCashItem = isCashPaymentMethod(method);
                                  // Logo = card type. Find a receipt with this payment display so we use its paymentType for logo
                                  const receiptsToSearch =
                                    receiptList && receiptList.length > 0
                                      ? receiptList
                                      : receipts || [];
                                  const matchingReceipt = receiptsToSearch.find(
                                    (r) => getPaymentDisplayName(r) === method
                                  );
                                  // Logo priority:
                                  // 1. API card_type integer (most authoritative — fixes e.g. Citibank=Visa)
                                  // 2. Matching receipt's paymentType
                                  // 3. Settings-saved cat_pay_card_types map
                                  // 4. Raw method string keyword detection
                                  const _pct = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_card_types") || "{}"); } catch { return {}; } })();
                                  const apiRecForLogo = (apiPaymentMethods || []).find(
                                    (p) => apiPaymentMethodMatchesLabel(p, method)
                                  );
                                  const brandFromApiType = apiRecForLogo
                                    ? cardTypeIntToBrand(apiRecForLogo.card_type)
                                    : "";
                                  const logo = brandFromApiType
                                    ? getPaymentLogo({ paymentType: brandFromApiType })
                                    : matchingReceipt
                                      ? getPaymentLogo(matchingReceipt)
                                      : _pct[method]
                                        ? getPaymentLogo({ paymentType: _pct[method] })
                                        : getPaymentLogo(method);
                                  return (
                                    <div
                                      key={idx}
                                      className="px-3 py-2 hover:bg-blue-50 text-left flex items-center gap-2"
                                      style={{ cursor: "default" }}
                                    >
                                    <div
                                      style={{ cursor: "pointer", flex: 1, display: "flex", alignItems: "center", gap: 8 }}
                                      onClick={() => {
                                        // Extract card issuer name and last4 from selected method
                                        const methodParts = method.split("*");
                                        const baseMethod =
                                          methodParts[0]?.trim() || "";
                                        const last4FromMethod =
                                          methodParts[1]?.trim() || "";

                                        // Find matching receipt to get card type for logo detection
                                        const receiptsToSearch =
                                          receiptList && receiptList.length > 0
                                            ? receiptList
                                            : receipts || [];
                                        const matchingReceipt =
                                          receiptsToSearch.find(
                                            (r) =>
                                              getPaymentDisplayName(r) ===
                                              method
                                          );

                                        // Get card type from matching receipt's paymentType (for logo detection)
                                        // paymentType should contain card type like "PayPal", "Visa", etc.
                                        let cardType = baseMethod; // Default to issuer name

                                        if (
                                          matchingReceipt &&
                                          matchingReceipt.paymentType
                                        ) {
                                          // Extract card type from paymentType (remove last4 digits pattern)
                                          const receiptPaymentType =
                                            matchingReceipt.paymentType
                                              .toString()
                                              .trim();
                                          const basePaymentType =
                                            receiptPaymentType
                                              .replace(/\s*\*\d{3,4}$/, "")
                                              .trim();

                                          // Check if paymentType contains a known card type
                                          const paymentTypeLower =
                                            basePaymentType.toLowerCase();
                                          if (
                                            paymentTypeLower.includes("paypal")
                                          )
                                            cardType = "PayPal";
                                          else if (
                                            paymentTypeLower.includes("visa")
                                          )
                                            cardType = "Visa";
                                          else if (
                                            paymentTypeLower.includes("master")
                                          )
                                            cardType = "MasterCard";
                                          else if (
                                            paymentTypeLower.includes("amex") ||
                                            paymentTypeLower.includes(
                                              "american express"
                                            )
                                          )
                                            cardType = "American Express";
                                          else if (
                                            paymentTypeLower.includes(
                                              "discover"
                                            )
                                          )
                                            cardType = "Discover";
                                          else if (
                                            paymentTypeLower.includes("diners")
                                          )
                                            cardType = "Diners Club";
                                          else if (
                                            paymentTypeLower.includes("debit")
                                          )
                                            cardType = "Debit Card";
                                          else if (
                                            paymentTypeLower.includes("cash")
                                          )
                                            cardType = "Cash";
                                          else if (
                                            basePaymentType &&
                                            basePaymentType !== "0"
                                          )
                                            cardType = basePaymentType;
                                        } else {
                                          // Check Settings-saved card type map first (cat_pay_card_types)
                                          const _pct = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_card_types") || "{}"); } catch { return {}; } })();
                                          if (_pct[method]) {
                                            cardType = _pct[method];
                                          } else {
                                            // Try to detect card type from issuer name
                                            const issuerLower =
                                              baseMethod.toLowerCase();
                                            if (issuerLower.includes("paypal"))
                                              cardType = "PayPal";
                                            else if (issuerLower.includes("visa"))
                                              cardType = "Visa";
                                            else if (
                                              issuerLower.includes("master")
                                            )
                                              cardType = "MasterCard";
                                            else if (
                                              issuerLower.includes("amex") ||
                                              issuerLower.includes(
                                                "american express"
                                              )
                                            )
                                              cardType = "American Express";
                                            else if (
                                              issuerLower.includes("discover")
                                            )
                                              cardType = "Discover";
                                            else if (
                                              issuerLower.includes("diners")
                                            )
                                              cardType = "Diners Club";
                                            else if (
                                              issuerLower.includes("debit")
                                            )
                                              cardType = "Debit Card";
                                            else if (issuerLower.includes("cash"))
                                              cardType = "Cash";
                                          }
                                        }

                                        // Update paymentType with card type (for logo detection)
                                        handleFieldChange(
                                          "paymentType",
                                          cardType
                                        );

                                        // Clear paymentBrand so the original receipt's brand
                                        // doesn't override logo detection for the newly selected method
                                        handleFieldChange("paymentBrand", "");

                                        // Custom issuer only — not the card brand (e.g. "Other *0009" → issuer "")
                                        handleFieldChange(
                                          "card_issuer_name",
                                          isCustomCardIssuer(baseMethod, cardType)
                                            ? baseMethod
                                            : ""
                                        );

                                        // Update last_4_digit_card
                                        if (
                                          last4FromMethod &&
                                          /^\d{3,4}$/.test(last4FromMethod)
                                        ) {
                                          handleFieldChange(
                                            "last_4_digit_card",
                                            last4FromMethod
                                          );
                                        }

                                        // Auto-apply Personal/Business preference saved in Settings
                                        const _petMap = (() => { try { return JSON.parse(localStorage.getItem("cat_pay_expense_type") || "{}"); } catch { return {}; } })();
                                        const _storedExpType = _petMap[method];
                                        if (_storedExpType === "Business") {
                                          handleFieldChange("receipt_category", "1");
                                        } else if (_storedExpType === "Personal") {
                                          handleFieldChange("receipt_category", "0");
                                        }

                                        setShowPaymentDropdown(false);
                                      }}
                                    >
                                      {logo && (
                                        <LoadingImage
                                          src={logo}
                                          alt={method}
                                          className="w-5 h-5 rounded"
                                          style={{ flexShrink: 0 }}
                                        />
                                      )}
                                      <span style={{ flex: 1 }}>{method}</span>
                                    </div>
                                    {!isCashItem && (
                                      <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                                        <button
                                          type="button"
                                          title="Edit payment method"
                                          onClick={(e) => { e.stopPropagation(); handleEditPaymentInDropdown(method); }}
                                          style={{ padding: "2px 5px", borderRadius: 6, background: "#eff6ff", border: "1px solid #bfdbfe", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                        >
                                          <Pencil size={11} style={{ color: "#2563eb" }} />
                                        </button>
                                        <button
                                          type="button"
                                          title="Delete payment method"
                                          onClick={(e) => { e.stopPropagation(); handleDeletePaymentInDropdown(method); }}
                                          style={{ padding: "2px 5px", borderRadius: 6, background: "#fef2f2", border: "1px solid #fecaca", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                                        >
                                          <Trash2 size={11} style={{ color: "#dc2626" }} />
                                        </button>
                                      </div>
                                    )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div>
                        <h3 className="font-bold mb-4 text-gray-900 text-left">
                          RECEIPT TOTALS
                        </h3>

                        <div className="mb-4 text-align-left">
                          <label className="font-bold">Subtotal</label>
                          <input
                            type="text"
                            readOnly
                            className={`${inputClass} ${(() => {
                              const sub =
                                parseFloat(editedReceipt.subtotal) ||
                                parseFloat(r.subtotal) ||
                                0;
                              return sub < 0 ? "text-red-500" : "";
                            })()}`}
                            value={(() => {
                              const sub =
                                parseFloat(editedReceipt.subtotal) ||
                                parseFloat(r.subtotal) ||
                                0;
                              const displaySub = Number.isFinite(sub) ? sub : 0;
                              return `$${displaySub > 0 ? displaySub.toFixed(2) : "0.00"}`;
                            })()}
                          />
                        </div>

                        {/* Tax Type Selection Dropdowns */}
                        {(() => {
                          const currentTaxValues =
                            editedReceipt.receipt_tax_values ||
                            enrichedReceiptTaxValues.filter(
                              (t) =>
                                !(t.tax_name || "")
                                  .toLowerCase()
                                  .includes("tip")
                            ) ||
                            [];

                          return (
                            <>
                              {/* Tax Type #1 */}
                              {currentTaxValues[0] ? (
                              <div className="mb-4 text-align-left">
                                <div className="flex items-center justify-between">
                                  <label className="font-bold">
                                    {(() => {
                                      const d = getReceiptTaxLineDisplay(currentTaxValues[0], taxData);
                                      return `${d.tax_name} (${d.tax_rate}%)`;
                                    })()}
                                  </label>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => removeTaxFromReceipt(0)}
                                      className="text-red-500 hover:text-red-700 text-xs font-medium"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                                <input
                                  type="text"
                                  className={`${inputClass} ${parseFloat(currentTaxValues[0].tax_amount) < 0 ? "text-red-600 font-medium" : ""}`}
                                  value={
                                    currencyInputs.tax0 !== undefined
                                      ? currencyInputs.tax0
                                      : `$${parseFloat(currentTaxValues[0].tax_amount || 0).toFixed(2)}`
                                  }
                                  onFocus={() => {
                                    const num = parseFloat(currentTaxValues[0].tax_amount);
                                    setCurrencyInputs(p => ({ ...p, tax0: `$${num ? num.toFixed(2) : "0.00"}` }));
                                  }}
                                  onKeyDown={preventInvalidMoneyKey}
                                  onChange={(e) => {
                                    handleTaxAmountChange(0, e.target.value);
                                  }}
                                  onBlur={() => setCurrencyInputs(p => ({ ...p, tax0: undefined }))}
                                  placeholder="$0.00"
                                />
                              </div>
                              ) : null}

                              {/* Tax Type #2 - Only show if Tax #2 exists */}
                              {currentTaxValues[1] ? (
                              <div className="mb-4 text-align-left">
                                <div className="flex items-center justify-between">
                                  <label className="font-bold">
                                    {(() => {
                                      const d = getReceiptTaxLineDisplay(currentTaxValues[1], taxData);
                                      return `${d.tax_name} (${d.tax_rate}%)`;
                                    })()}
                                  </label>
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => removeTaxFromReceipt(1)}
                                      className="text-red-500 hover:text-red-700 text-xs font-medium"
                                    >
                                      Remove
                                    </button>
                                  </div>
                                </div>
                                <input
                                  type="text"
                                  className={`${inputClass} ${parseFloat(currentTaxValues[1].tax_amount) < 0 ? "text-red-600 font-medium" : ""}`}
                                  value={
                                    currencyInputs.tax1 !== undefined
                                      ? currencyInputs.tax1
                                      : `$${parseFloat(currentTaxValues[1].tax_amount || 0).toFixed(2)}`
                                  }
                                  onFocus={() => {
                                    const num = parseFloat(currentTaxValues[1].tax_amount);
                                    setCurrencyInputs(p => ({ ...p, tax1: `$${num ? num.toFixed(2) : "0.00"}` }));
                                  }}
                                  onKeyDown={preventInvalidMoneyKey}
                                  onChange={(e) => {
                                    handleTaxAmountChange(1, e.target.value);
                                  }}
                                  onBlur={() => setCurrencyInputs(p => ({ ...p, tax1: undefined }))}
                                  placeholder="$0.00"
                                />
                              </div>
                              ) : null}

                              {/* Editable Tip Field — only shown when TIP pill is selected */}
                              {tipVisible && (() => {
                                const tipNum = parseFloat(editedReceipt.tip) || 0;
                                const subtotal =
                                  parseFloat(editedReceipt.subtotal) ||
                                  parseFloat(r.subtotal) ||
                                  parseFloat(r.purchasePrice) ||
                                  0;
                                const tipPercentage =
                                  subtotal > 0 && tipNum > 0
                                    ? Math.round((tipNum / subtotal) * 100)
                                    : 0;
                                return (
                                  <div className="mb-4 text-align-left">
                                    <div className="flex items-center justify-between">
                                      <label className="font-bold">
                                        TIP ({tipPercentage}%)
                                      </label>
                                      <div className="flex items-center gap-1">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setTipVisible(false);
                                            handleFieldChange("tip", "");
                                            setCurrencyInputs((p) => ({ ...p, tip: undefined }));
                                          }}
                                          className="text-red-500 hover:text-red-700 text-xs font-medium"
                                        >
                                          Remove
                                        </button>
                                      </div>
                                    </div>
                                    <input
                                      id="edit-receipt-tip-input"
                                      type="text"
                                      inputMode="decimal"
                                      className={`${inputClass}`}
                                      value={
                                        currencyInputs.tip !== undefined
                                          ? currencyInputs.tip
                                          : tipNum > 0
                                            ? `$${tipNum.toFixed(2)}`
                                            : ""
                                      }
                                      onFocus={() =>
                                        setCurrencyInputs((p) => ({
                                          ...p,
                                          tip: tipNum > 0 ? `$${tipNum.toFixed(2)}` : "$",
                                        }))
                                      }
                                      onKeyDown={preventInvalidMoneyKey}
                                      onChange={(e) => {
                                        const raw = e.target.value;
                                        const numPart = raw.replace(/^\$?/, "");
                                        const sanitized = sanitizeMoneyInput(numPart);
                                        const display = `$${sanitized}`;
                                        setCurrencyInputs((p) => ({ ...p, tip: display }));
                                        const parsed = parseFloat(raw.replace(/[^0-9.-]/g, ""));
                                        if (!isNaN(parsed)) handleFieldChange("tip", parsed);
                                      }}
                                      onBlur={() =>
                                        setCurrencyInputs((p) => ({ ...p, tip: undefined }))
                                      }
                                      placeholder="$0.00"
                                    />
                                  </div>
                                );
                              })()}
                            </>
                          );
                        })()}

                        <div className="mb-4 text-align-left">
                          <label className="font-bold">TOTAL</label>
                          <input
                            type="text"
                            inputMode="decimal"
                            className={`${inputClass} ${
                              (parseFloat(editedReceipt.purchasePrice) ||
                                parseFloat(r.total) ||
                                parseFloat(r.purchasePrice) ||
                                0) < 0
                                ? "text-red-500"
                                : ""
                            }`}
                            value={(() => {
                              if (currencyInputs.total !== undefined) return currencyInputs.total;
                              const num = parseFloat(
                                editedReceipt.purchasePrice ?? r.total ?? r.purchasePrice ?? 0
                              );
                              return `$${isNaN(num) ? "0.00" : num.toFixed(2)}`;
                            })()}
                            onFocus={() => {
                              const num = parseFloat(
                                editedReceipt.purchasePrice ?? r.total ?? r.purchasePrice ?? 0
                              );
                              setCurrencyInputs((p) => ({
                                ...p,
                                total: `$${isNaN(num) ? "0.00" : num.toFixed(2)}`,
                              }));
                            }}
                            onKeyDown={preventInvalidMoneyKey}
                            onChange={(e) => {
                              const raw = e.target.value;
                              const isNeg = raw.startsWith("-");
                              const numPart = raw.replace(/^-?\$?/, "");
                              const sanitized = sanitizeMoneyInput(numPart);
                              const display = `${isNeg ? "-" : ""}$${sanitized}`;
                              setCurrencyInputs((p) => ({ ...p, total: display }));
                              const parsed = parseFloat(raw.replace(/[^0-9.-]/g, ""));
                              if (!isNaN(parsed)) handleFieldChange("purchasePrice", parsed);
                            }}
                            onBlur={() =>
                              setCurrencyInputs((p) => ({ ...p, total: undefined }))
                            }
                          />
                        </div>

                        {/* SELECT — tax/tip pill selector */}
                        {(() => {
                          const currentTaxVals =
                            editedReceipt.receipt_tax_values ||
                            enrichedReceiptTaxValues.filter(
                              (t) => !(t.tax_name || "").toLowerCase().includes("tip")
                            ) || [];

                          const sortedTaxPills = [...allTaxTypes]
                            .map((tax) => ({
                              ...tax,
                              _selIdx: currentTaxVals.findIndex((t) =>
                                taxDefinitionMatchesReceiptLine(t, tax),
                              ),
                            }))
                            .sort((a, b) => {
                              const aS = a._selIdx !== -1;
                              const bS = b._selIdx !== -1;
                              if (aS && !bS) return -1;
                              if (!aS && bS) return 1;
                              return a.tax_name.localeCompare(b.tax_name);
                            });

                          return (
                            <div className="mt-2">
                              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Select</p>

                              {/* Row 1: Manage Tax Types + TIP on same line */}
                              <div className="flex items-center gap-2 mb-2 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowTaxDropdown(null);
                                    setShowManageTaxModal(true);
                                  }}
                                  className="px-4 py-1.5 rounded-full border border-blue-400 text-blue-600 bg-blue-50 text-sm font-semibold flex items-center gap-1 whitespace-nowrap hover:bg-blue-100 transition-all"
                                >
                                  <Plus size={12} /> Manage Tax Types
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (tipVisible) {
                                      setTipVisible(false);
                                      handleFieldChange("tip", "");
                                    } else {
                                      setTipVisible(true);
                                      handleFieldChange("tip", "0");
                                      setTimeout(() => {
                                        document.getElementById("edit-receipt-tip-input")?.focus();
                                      }, 50);
                                    }
                                  }}
                                  className={`px-4 py-1.5 rounded-full border text-sm font-semibold transition-all ${
                                    tipVisible
                                      ? "border-blue-500 text-blue-600 bg-blue-50"
                                      : "border-gray-300 text-gray-500 bg-white hover:border-blue-300 hover:text-blue-500"
                                  }`}
                                >
                                  TIP
                                </button>
                              </div>

                              {/* Row 3: Scrollable tax pills — selected first (A→Z), then unselected (A→Z) */}
                              <div
                                className="flex gap-2 overflow-x-auto pb-1"
                                style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
                              >
                                {sortedTaxPills.map((tax, idx) => {
                                  const isSelected = tax._selIdx !== -1;
                                  const atMaxTaxTypes =
                                    currentTaxVals.length >= MAX_RECEIPT_TAX_TYPES;
                                  return (
                                    <button
                                      key={idx}
                                      type="button"
                                      onClick={() => {
                                        if (isSelected) {
                                          removeTaxFromReceipt(tax._selIdx);
                                        } else if (atMaxTaxTypes) {
                                          setAlertMsg(MAX_RECEIPT_TAX_MSG);
                                        } else {
                                          addTaxToReceipt(tax);
                                        }
                                      }}
                                      className={`flex-shrink-0 px-3 py-1.5 rounded-full border text-sm font-semibold transition-all ${
                                        isSelected
                                          ? "border-blue-500 text-blue-600 bg-blue-50"
                                          : "border-gray-300 text-gray-500 bg-white hover:border-blue-300 hover:text-blue-500"
                                      }`}
                                    >
                                      {tax.tax_name} ({formatTaxRate(tax.tax_rate)}%)
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <h2 className="font-semibold mb-2 text-gray-900 text-align-left px-6 ">
                      MORE INFORMATION
                    </h2>

                    <div className="px-6 pb-4 text-align-left mb-4">
                      <h3 className="font-semibold mb-2 text-gray-900">
                        Describe Purchase
                      </h3>
                      <textarea
                        className={`w-full border rounded-md p-2 mb-1 text-sm ${descriptionOverflow ? "border-red-400 bg-red-50" : "border-blue-400"}`}
                        value={editedReceipt.product_name ?? r.product_name ?? ""}
                        onChange={(e) => handleFieldChange("product_name", e.target.value)}
                        placeholder="No description provided"
                        rows={2}
                      />
                      {descriptionOverflow && (
                        <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-center gap-1.5">
                          <span className="font-bold">!</span> Character limit of {MAX_DESCRIPTION_LENGTH} exceeded
                        </div>
                      )}
                      <h3 className="font-semibold mb-2 text-gray-900">
                        Notes
                      </h3>
                      <textarea
                        className={`w-full border rounded-md p-2 mb-1 text-sm ${notesOverflow ? "border-red-400 bg-red-50" : "border-blue-400"}`}
                        value={editedReceipt.notes ?? r.notes ?? ""}
                        onChange={(e) => handleFieldChange("notes", e.target.value)}
                        placeholder="No notes provided"
                        rows={6}
                      />
                      {notesOverflow && (
                        <div className="mb-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-center gap-1.5">
                          <span className="font-bold">!</span> Character limit of {MAX_NOTES_LENGTH} exceeded
                        </div>
                      )}

                      {/* Receipt Tags Section - Clickable */}
                      <h3 className="font-semibold mb-2 text-gray-900">Tags</h3>
                      <div className="w-full overflow-x-auto hide-scrollbar">
                        <div
                          className="flex gap-2 pb-2"
                          style={{ minWidth: "max-content" }}
                        >
                          {[
                            { key: "starred", label: "Starred" },
                            { key: "flagged", label: "Flagged" },
                            { key: "verified", label: "Verified" },
                            { key: "reconciled", label: "Reconciled" },
                            { key: "reimbursed", label: "Reimbursed" },
                            { key: "warrantied", label: "Warrantied" },
                          ]
                            .sort((a, b) => (editedTags[b.key] ? 1 : 0) - (editedTags[a.key] ? 1 : 0))
                            .map(({ key, label }) => (
                              <button
                                key={key}
                                type="button"
                                onClick={() => !editedTags.locked && toggleTag(key)}
                                className={`flex items-center gap-1 px-3 py-2 border rounded-full transition-colors ${
                                  editedTags.locked
                                    ? editedTags[key]
                                      ? "border-blue-500 text-blue-600 cursor-not-allowed"
                                      : "border-gray-200 text-gray-400 cursor-not-allowed opacity-40"
                                    : editedTags[key]
                                    ? "border-blue-500 text-blue-600 cursor-pointer"
                                    : "border-gray-300 cursor-pointer"
                                }`}
                              >
                                <img
                                  src={getTagImage(key, editedTags[key])}
                                  alt={label}
                                  className="w-4 h-4 object-contain"
                                />
                                <span className="text-xs font-medium">{label}</span>
                              </button>
                            ))}
                        </div>
                      </div>
                    </div>

                    <div className="px-6 pb-6 text-left">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-gray-900">
                          RECEIPT IMAGES
                        </h3>
                        <div className="flex items-center gap-2">
                          {/* Add Photo button */}
                          <button
                            type="button"
                            onClick={() => addPhotoInputRef.current?.click()}
                            disabled={isAddingPhoto}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                          >
                            {isAddingPhoto ? (
                              <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Camera size={13} />
                            )}
                            Add Photo
                          </button>
                          <input
                            ref={addPhotoInputRef}
                            type="file"
                            accept="image/*,application/pdf"
                            className="hidden"
                            onChange={handleAddPhotoSelect}
                          />
                        </div>
                      </div>

                      <div className="border border-dashed border-blue-400 rounded-lg p-3 flex gap-4 flex-wrap">
                        {(() => {
                          // Prefer editedReceipt values so that annotated
                          // images (and newly added photos) are reflected
                          // immediately in the thumbnails without waiting for
                          // a server round-trip.
                          const urls = collectReceiptMediaUrls({
                            emailAttachment:
                              editedReceipt.emailAttachment ?? r.emailAttachment,
                            receipt_image:
                              editedReceipt.receipt_image ?? r.receipt_image,
                          }).filter((url) => {
                            if (!url || typeof url !== "string") return false;
                            const trimmed = url.trim();
                            if (
                              !trimmed ||
                              ["0", "null", "@", "undefined", ""].includes(
                                trimmed
                              )
                            )
                              return false;

                            const invalidPatterns = [
                              "android.resource://",
                              "content://",
                              "file://",
                              "resource://",
                              "blob:",
                            ];
                            return !invalidPatterns.some((p) =>
                              trimmed.startsWith(p)
                            );
                          });

                          const allUrls = [
                            ...new Set(
                              [...urls, ...additionalPhotoUrls]
                                .map((u) => normalizeMediaUrl(u))
                                .filter(Boolean)
                            ),
                          ];

                          if (allUrls.length === 0) {
                            return (
                              <div className="flex flex-col items-center justify-center w-full py-6 text-gray-400 gap-2">
                                <Camera size={28} className="opacity-40" />
                                <span className="text-sm italic">No receipt image — tap &quot;Add Photo&quot; to upload one</span>
                              </div>
                            );
                          }

                          return allUrls.map((u, idx) => {
                            const isAdditional = idx >= urls.length;
                            return (
                              <div key={idx} className="relative group">
                                {isPdfUrl(u) ? (
                                  <PdfThumbnail url={u} />
                                ) : (
                                  <img
                                    key={normalizeMediaUrl(u)}
                                    src={proxyImageUrl(u)}
                                    alt="Receipt"
                                    className="w-24 h-auto rounded cursor-pointer border border-gray-200"
                                    onClick={() => window.open(u, "_blank")}
                                    onError={(e) =>
                                      (e.target.style.display = "none")
                                    }
                                  />
                                )}
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (isAdditional) {
                                      setPendingImageDelete({
                                        type: "additional",
                                        index: idx - urls.length,
                                      });
                                      setShowImageDeleteConfirm(true);
                                      return;
                                    }
                                    const currentUrl = normalizeMediaUrl(u);
                                    setPendingImageDelete({
                                      type: "existing",
                                      url: currentUrl,
                                    });
                                    setShowImageDeleteConfirm(true);
                                  }}
                                  className="absolute top-1 right-1 bg-white/90 hover:bg-red-600 hover:text-white text-red-600 rounded p-1 opacity-0 group-hover:opacity-100 transition-all shadow"
                                  title="Delete file"
                                >
                                  <Trash2 size={11} />
                                </button>
                                {/* Annotate button */}
                                {!isPdfUrl(u) && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const sourceUrl = normalizeMediaUrl(u) || u;
                                      setAnnotatorUrl(proxyImageUrl(sourceUrl));
                                      setAnnotatorSource(
                                        isAdditional
                                          ? {
                                              type: "additional",
                                              index: idx - urls.length,
                                              sourceUrl,
                                            }
                                          : { type: "existing", sourceUrl }
                                      );
                                    }}
                                    className="absolute top-1 right-8 bg-white/90 hover:bg-blue-600 hover:text-white text-gray-700 rounded p-1 opacity-0 group-hover:opacity-100 transition-all shadow"
                                    title="Edit receipt image"
                                  >
                                    <PenLine size={11} />
                                  </button>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>

                      <p
                        className={`text-sm font-semibold mt-2 ${
                          r.isLinkedToInventory
                            ? "text-green-600"
                            : "text-black"
                        }`}
                      >
                        {r.isLinkedToInventory
                          ? "Linked to Inventory"
                          : "Not linked to Inventory"}
                      </p>

                      {/* Save button is in the sticky footer below */}
                    </div>
                  </motion.div>
                </AnimatePresence>
                )}
              </div>{/* end inert inner wrapper */}
              </div>{/* end scrollable content */}

              {/* ── Sticky Save Bar ── */}
              {!showSplitScreen && (
              <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 sm:px-6 py-3 flex flex-col gap-2 relative z-40">
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  title=""
                >
                  {isSaving ? "Saving..." : "Save Changes"}
                </button>
                {isDraft && (
                  <button
                    onClick={onClose}
                    disabled={isSaving}
                    className="w-full py-3 bg-white border border-amber-400 text-amber-600 font-semibold rounded-xl hover:bg-amber-50 transition-colors text-sm"
                  >
                    Keep in Draft Mode
                  </button>
                )}
              </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      </motion.div>

      {showPDFPreview && (
        <PDFPreview
          key={pdfKey}
          receipt={selectedReceipt}
          onClose={() => setShowPDFPreview(false)}
        />
      )}

      {showViewReport && (
        <ViewReport
          receipt={selectedReceipt}
          onClose={() => setShowViewReport(false)}
        />
      )}

      {showForwardModal && selectedReceipt && (
        <ForwardReceiptModal
          receipt={{
            ...selectedReceipt,
            ...editedReceipt,
            receipt_tax_values:
              editedReceipt.receipt_tax_values ?? selectedReceipt.receipt_tax_values,
          }}
          onClose={() => setShowForwardModal(false)}
          onSuccess={handleForwardSuccess}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <DeleteConfirmationDialog
        isOpen={showDeleteConfirmation}
        onClose={() => setShowDeleteConfirmation(false)}
        onConfirm={handleDelete}
        isDeleting={isDeleting}
      />

      <AnimatePresence>
        {showImageDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[1100] flex items-center justify-center bg-black/50 p-4"
          >
            <motion.div
              initial={{ scale: 0.96, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.96, y: 10 }}
              className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl border border-gray-200"
            >
              <h3 className="text-base font-bold text-gray-900 mb-2">
                Delete Image
              </h3>
              <p className="text-sm text-gray-600 mb-5">
                Are you sure you want to delete this image?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowImageDeleteConfirm(false);
                    setPendingImageDelete(null);
                  }}
                  className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImageDelete}
                  className="px-4 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toast for Link to QuickBooks */}
      <Toast
        message={toast.message}
        type={toast.type}
        isVisible={toast.isVisible}
        onClose={() => setToast((t) => ({ ...t, isVisible: false }))}
      />

      {/* Add / Edit Payment Method Modal */}
      <EditPaymentMethodModal
        isOpen={showAddPaymentModal}
        isSaving={isPayMethodSaving}
        editMode={payModalEditMode}
        cardType={newPaymentCardType}
        cardIssuerName={newCardIssuerName}
        last4Digits={newLast4Digits}
        categoryType={newPaymentCategoryType}
        duplicateError={paymentDuplicateError}
        generalError={payModalError}
        onClose={handleCloseAddPaymentModal}
        onSave={handleAddPaymentMethod}
        onCardTypeChange={(v) => { setNewPaymentCardType(v); setPayModalError(null); }}
        onIssuerChange={(v) => { setNewCardIssuerName(v); setPayModalError(null); }}
        onLast4Change={(v) => { setNewLast4Digits(v); setPayModalError(null); }}
        onCategoryChange={(v) => { setNewPaymentCategoryType(v); setPayModalError(null); }}
      />

      {/* Payment method add/edit confirmation (same copy pattern as Settings) */}
      <AnimatePresence>
        {showPayMethodConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!isPayMethodSaving) { setShowPayMethodConfirm(false); setPendingPayMethodFn(null); setPayMethodConfirmMessage(""); } }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-3">Confirmation</h3>
                <p className="text-sm text-gray-600 mb-6">{payMethodConfirmMessage}</p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { if (!isPayMethodSaving) { setShowPayMethodConfirm(false); setPendingPayMethodFn(null); setPayMethodConfirmMessage(""); } }}
                    disabled={isPayMethodSaving}
                    className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const fn = pendingPayMethodFn;
                      setShowPayMethodConfirm(false);
                      setPendingPayMethodFn(null);
                      setPayMethodConfirmMessage("");
                      if (typeof fn !== "function") return;
                      setIsPayMethodSaving(true);
                      try {
                        await fn();
                      } catch (e) {
                        setToast({ isVisible: true, message: e?.message || "Update failed", type: "error" });
                      } finally {
                        setIsPayMethodSaving(false);
                      }
                    }}
                    disabled={isPayMethodSaving}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isPayMethodSaving ? "Saving…" : "OK"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Payment Method Delete Confirmation Popup */}
      <AnimatePresence>
        {showPayDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[40px] leading-none text-slate-900 font-black mb-4 tracking-tight">Confirmation</h3>
              <p className="text-sm font-medium text-slate-800 leading-relaxed mb-5">
                Are you sure you want to delete this<br />
                Payment Method? When deleting a<br />
                Payment Method all receipts<br />
                associated with that Payment Method<br />
                will have that Payment Method<br />
                removed.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowPayDeleteConfirm(false); setPendingPayDeleteMethod(null); }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={doConfirmPayDeleteInDropdown}
                  disabled={isPayMethodSaving}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-xl text-white font-semibold text-sm transition-colors"
                >
                  {isPayMethodSaving ? "Deleting…" : "Delete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Merchant Edit Confirmation Dialog (same pattern as Payment Method) */}
      <AnimatePresence>
        {showMerchantEditConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!isSavingEditMerchant) setShowMerchantEditConfirm(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6 text-center">
                <p className="text-sm font-medium text-slate-700 leading-relaxed mb-6">
                  When editing a Merchant all<br />
                  receipts associated with that Merchant<br />
                  will also be updated.
                </p>
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { if (!isSavingEditMerchant) setShowMerchantEditConfirm(false); }}
                    disabled={isSavingEditMerchant}
                    className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={doConfirmMerchantEdit}
                    disabled={isSavingEditMerchant}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {isSavingEditMerchant ? "Saving…" : "Okay"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Merchant Delete Confirmation Popup */}
      <AnimatePresence>
        {showMerchantDeleteConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center border border-slate-200"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-[40px] leading-none text-slate-900 font-black mb-4 tracking-tight">Confirmation</h3>
              <p className="text-sm font-medium text-slate-800 leading-relaxed mb-5">
                Are you sure you want to delete this<br />
                Merchant? If so, then all Receipts<br />
                associated with this Merchant will<br />
                now be associated with the<br />
                &quot;Miscellaneous&quot; Merchant.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => { setShowMerchantDeleteConfirm(false); setPendingMerchantDeleteData(null); }}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={doConfirmMerchantDelete}
                  disabled={isSavingEditMerchant}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-60 rounded-xl text-white font-semibold text-sm transition-colors"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Merchant Modal */}
      <AnimatePresence>
        {showEditMerchantModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!isSavingEditMerchant) setShowEditMerchantModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Saving overlay */}
              {isSavingEditMerchant && (
                <div className="absolute inset-0 z-10 bg-white/80 flex flex-col items-center justify-center rounded-xl">
                  <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm text-gray-600 font-medium">Updating all receipts…</p>
                </div>
              )}

              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-white">
                <h2 className="text-xl font-bold text-gray-900">Edit Merchant</h2>
                <button
                  onClick={() => { if (!isSavingEditMerchant) setShowEditMerchantModal(false); }}
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors"
                  aria-label="Close"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                {/* Name field */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Merchant Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full border border-blue-400 text-sm px-3 py-2 rounded-md bg-white text-gray-800"
                    value={editMerchantName}
                    onChange={(e) => {
                      setEditMerchantName(e.target.value);
                      setEditLogoOptions([]);
                      setEditSelectedLogoIndex(null);
                    }}
                    placeholder="Enter merchant name"
                    autoFocus
                    disabled={isSavingEditMerchant}
                  />
                </div>

                {/* Logo section */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-gray-700">Merchant Logo</label>
                    <button
                      type="button"
                      onClick={handleFetchEditLogos}
                      disabled={!editMerchantName.trim() || isFetchingEditLogos || isSavingEditMerchant}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isFetchingEditLogos ? "Fetching…" : "Search Logos"}
                    </button>
                  </div>

                  {/* Current logo (before new one is selected) */}
                  {editMerchantLogo && editSelectedLogoIndex === null && (
                    <div className="mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
                      <p className="text-sm font-medium text-gray-700 flex-shrink-0">Current:</p>
                      <div className="p-2 border border-gray-300 rounded bg-white flex items-center justify-center min-w-[64px] min-h-[64px]">
                        <LoadingImage src={editMerchantLogo} alt="Current logo" className="max-w-full max-h-16 w-auto h-auto object-contain" wrapperClassName="min-w-[48px] min-h-[48px]" />
                      </div>
                    </div>
                  )}

                  {isFetchingEditLogos && (
                    <div className="text-center py-8 text-gray-500">Fetching logo options…</div>
                  )}

                  {!isFetchingEditLogos && editLogoOptions.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 mb-3">Select a logo ({editLogoOptions.length} options found):</p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-64 overflow-y-auto border border-gray-200 rounded-lg p-4">
                        {editLogoOptions.map((logo, index) => (
                          <div
                            key={index}
                            className={`relative cursor-pointer border-2 rounded-lg transition-all flex items-center justify-center p-2 min-h-[80px] ${
                              editSelectedLogoIndex === index ? "border-blue-600 ring-2 ring-blue-300" : "border-gray-200 hover:border-gray-400"
                            }`}
                            onClick={() => handleSelectEditLogo(index)}
                          >
                            <LoadingImage
                              src={logo.displayUrl}
                              alt={`Logo ${index + 1}`}
                              className="max-w-full max-h-16 w-auto h-auto object-contain"
                              fallbackSrc={logo.storeUrl}
                              showErrorPlaceholder
                              wrapperClassName="w-full min-h-[64px]"
                            />
                            {editSelectedLogoIndex === index && (
                              <div className="absolute top-1 right-1 bg-blue-600 rounded-full p-1 z-10">
                                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Selected logo preview */}
                  {editMerchantLogo && editSelectedLogoIndex !== null && (
                    <div className="mt-4 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
                      <p className="text-sm font-medium text-gray-700 flex-shrink-0">Selected:</p>
                      <div className="p-2 border border-gray-300 rounded bg-white flex items-center justify-center min-w-[64px] min-h-[64px]">
                        <LoadingImage src={editMerchantLogo} alt="Selected logo" className="max-w-full max-h-16 w-auto h-auto object-contain" wrapperClassName="min-w-[48px] min-h-[48px]" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Error */}
                {editMerchantError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {editMerchantError}
                  </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => { if (!isSavingEditMerchant) setShowEditMerchantModal(false); }}
                    disabled={isSavingEditMerchant}
                    className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditMerchant}
                    disabled={!editMerchantName.trim() || isSavingEditMerchant}
                    className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSavingEditMerchant ? "Saving…" : "Save Changes"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Merchant Modal */}
      <AnimatePresence>
        {showAddMerchantModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={handleCloseAddMerchantModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 bg-white">
                <h2 className="text-xl font-bold text-gray-900">Add New Merchant</h2>
                <button
                  onClick={handleCloseAddMerchantModal}
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>
              {/* Content */}
              <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
                {/* Merchant Name */}
                <div className="mb-6">
                  <label className="block text-sm font-bold text-gray-700 mb-2">
                    Merchant Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={newMerchantName}
                    onChange={(e) => {
                      setNewMerchantName(e.target.value);
                      setLogoOptions([]);
                      setSelectedLogoIndex(null);
                      setNewMerchantLogo("");
                    }}
                    placeholder="Enter merchant name"
                    autoFocus
                  />
                </div>
                {/* Logo Section */}
                <div className="mb-6">
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-bold text-gray-700">
                      Merchant Logo <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <button
                      type="button"
                      onClick={handleFetchMerchantLogos}
                      disabled={!newMerchantName || isFetchingLogos}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isFetchingLogos ? "Fetching..." : "Search Logos"}
                    </button>
                  </div>
                  {isFetchingLogos && (
                    <div className="text-center py-8 text-gray-500">Fetching logo options...</div>
                  )}
                  {!isFetchingLogos && logoOptions.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm text-gray-600 mb-3">
                        Select a logo ({logoOptions.length} options found):
                      </p>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-3">
                        {logoOptions.map((logo, index) => (
                          <div
                            key={index}
                            className={`relative cursor-pointer border-2 rounded-lg transition-all flex items-center justify-center p-2 min-h-[60px] ${
                              selectedLogoIndex === index
                                ? "border-blue-600 ring-2 ring-blue-300"
                                : "border-gray-200 hover:border-gray-400"
                            }`}
                            onClick={() => handleSelectMerchantLogo(index)}
                          >
                            <LoadingImage
                              src={logo.displayUrl}
                              alt={`Logo ${index + 1}`}
                              className="max-w-full max-h-12 w-auto h-auto object-contain"
                              fallbackSrc={logo.storeUrl}
                              showErrorPlaceholder
                              wrapperClassName="w-full min-h-[48px]"
                            />
                            {selectedLogoIndex === index && (
                              <div className="absolute top-1 right-1 bg-blue-600 rounded-full p-0.5 z-10">
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!isFetchingLogos && logoOptions.length === 0 && newMerchantName && (
                    <div className="text-center py-6 text-gray-500 border border-gray-200 rounded-lg text-sm">
                      Click "Search Logos" to find logo options.
                    </div>
                  )}
                  {newMerchantLogo && (
                    <div className="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-200 flex items-center gap-3">
                      <p className="text-sm font-medium text-gray-700 flex-shrink-0">Selected:</p>
                      <div className="p-1 border border-gray-200 rounded bg-white flex items-center justify-center min-w-[48px] min-h-[48px]">
                        <LoadingImage
                          src={newMerchantLogo}
                          alt="Selected logo"
                          className="w-12 h-12 object-contain"
                          wrapperClassName="w-12 h-12"
                        />
                      </div>
                    </div>
                  )}
                </div>
                {addMerchantError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {addMerchantError}
                  </div>
                )}
                {/* Buttons */}
                <div className="flex justify-end gap-3 mt-4">
                  <button
                    type="button"
                    onClick={handleCloseAddMerchantModal}
                    className="px-5 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddMerchant}
                    disabled={!newMerchantName || isSavingMerchant || isFetchingLogos}
                    className="px-5 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSavingMerchant ? "Adding..." : "Add Merchant"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manage Tax Types Modal */}
      <AnimatePresence>
        {showManageTaxModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={closeTaxModal}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 flex flex-col"
              style={{ maxHeight: "90vh" }}
              onClick={e => e.stopPropagation()}
            >
              {/* Sticky Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                <h2 className="text-xl font-bold text-gray-900">Manage Tax Types</h2>
                <div className="flex items-center gap-2">
                  {!editingTaxId && !showAddTaxForm && (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddTaxForm(true);
                        setNewTaxName(""); setNewTaxRate(""); setNewTaxNumber("");
                        clearTaxRateLimitAlert();
                        setTaxError(null);
                      }}
                      className="px-4 py-1.5 bg-blue-600 text-white text-sm font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Add
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeTaxModal}
                    disabled={isSavingTax || isDeletingTax}
                    className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors disabled:opacity-50"
                  >
                    <X size={20} className="text-gray-600" />
                  </button>
                </div>
              </div>

              {/* Scrollable Body */}
              <div ref={manageTaxModalBodyRef} className="overflow-y-auto flex-1 px-6 py-4 flex flex-col">

                {/* Add / Edit form — shown when Add tapped or Edit tapped */}
                {(showAddTaxForm || editingTaxId) && (
                  <div className="order-1 mb-4 pb-5 border-b border-gray-100">
                    <h3 className="text-base font-bold text-gray-900 mb-4">
                      {editingTaxId ? "Edit Tax Type" : "Add New Tax Type"}
                    </h3>

                    {/* General error banner */}
                    {taxError && (
                      <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                        {taxError}
                      </div>
                    )}

                    {/* Tax Name */}
                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-blue-600 mb-1.5">
                        Tax Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                          taxNameError ? "border-red-400 bg-red-50" : "border-gray-200"
                        }`}
                        value={newTaxName}
                        onChange={e => setNewTaxName(e.target.value)}
                        placeholder="Enter Tax Name (e.g. GST, HST, VAT)"
                        autoFocus
                      />
                      {taxNameError && (
                        <div className="mt-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-center gap-1.5">
                          <span className="font-bold">!</span> {taxNameError}
                        </div>
                      )}
                    </div>

                    {/* Tax Rate */}
                    <div className="mb-4">
                      <label className="block text-sm font-semibold text-blue-600 mb-1.5">
                        Tax Rate (%) <span className="text-red-500">*</span>
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          inputMode="decimal"
                          className={`w-full px-4 py-2.5 pr-8 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                            taxRateError || taxRateLimitAlert ? "border-red-400 bg-red-50" : "border-gray-200"
                          }`}
                          value={newTaxRate}
                          onKeyDown={createTaxRateKeyDownHandler(newTaxRate, showTaxRateLimitAlert)}
                          onChange={e => {
                            const parsed = parseTaxRateInput(e.target.value);
                            if (parsed.rejected) {
                              showTaxRateLimitAlert(parsed.message);
                              return;
                            }
                            setNewTaxRate(parsed.value);
                          }}
                          placeholder="Enter Tax Rate"
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">%</span>
                      </div>
                      {taxRateLimitAlert && (
                        <motion.div
                          initial={{ opacity: 0, y: -4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0 }}
                          className="mt-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-center gap-1.5"
                        >
                          <span className="font-bold">!</span> {taxRateLimitAlert}
                        </motion.div>
                      )}
                      {taxRateError && (
                        <div className="mt-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-center gap-1.5">
                          <span className="font-bold">!</span> {taxRateError}
                        </div>
                      )}
                    </div>

                    {/* Tax Number */}
                    <div className="mb-5">
                      <label className="block text-sm font-semibold text-blue-600 mb-1.5">
                        Tax Number <span className="text-gray-400 text-xs font-normal">(optional)</span>
                      </label>
                      <input
                        type="text"
                        className={`w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all ${
                          taxNumberError ? "border-red-400 bg-red-50" : "border-gray-200"
                        }`}
                        value={newTaxNumber}
                        onChange={e => setNewTaxNumber(e.target.value)}
                        placeholder="Enter Tax Number"
                      />
                      <p className="mt-1.5 text-xs text-gray-400">* Required</p>
                      {taxNumberError && (
                        <div className="mt-1 px-3 py-2 bg-red-50 border border-red-200 rounded-lg text-red-600 text-xs flex items-center gap-1.5">
                          <span className="font-bold">!</span> {taxNumberError}
                        </div>
                      )}
                    </div>

                    {/* Form action buttons */}
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddTaxForm(false);
                          setEditingTaxId(null);
                          setNewTaxName(""); setNewTaxRate(""); setNewTaxNumber("");
                          clearTaxRateLimitAlert();
                          setTaxRateFocused(false);
                          setTaxError(null);
                        }}
                        disabled={isSavingTax}
                        className="px-5 py-2 text-sm text-gray-600 font-medium hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={editingTaxId ? handleUpdateTaxType : handleAddTaxType}
                        disabled={!newTaxName.trim() || !newTaxRate.trim() || isSavingTax || !!taxNameError || !!taxRateError || !!taxNumberError}
                        className="px-6 py-2 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {isSavingTax ? (editingTaxId ? "Updating..." : "Saving...") : "Save"}
                      </button>
                    </div>
                  </div>
                )}

                {/* List of existing tax types — alphabetical */}
                {allTaxTypes.length > 0 ? (
                  <div className={`space-y-2 mb-2${(showAddTaxForm || editingTaxId) ? " order-2" : ""}`}>
                    {[...allTaxTypes]
                      .sort((a, b) => (a.tax_name || "").localeCompare(b.tax_name || ""))
                      .map(tax => {
                        const isDefault = isTaxDefault(tax);
                        return (
                          <div
                            key={tax.id || `${tax.tax_name}-${tax.tax_rate}`}
                            className="flex items-center justify-between px-4 py-3 bg-white border border-gray-200 rounded-xl"
                          >
                            <div className="flex-1 min-w-0 mr-2">
                              <div className="font-semibold text-blue-600 text-sm leading-tight">
                                {tax.tax_name} ({formatTaxRate(tax.tax_rate)}%)
                              </div>
                              <div className="text-xs text-gray-400 mt-0.5">
                                Tax No. {tax.tax_number || "N/A"}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => toggleDefaultTax(tax.id)}
                                title={isDefault ? "Remove as default" : "Set as default"}
                                className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors ${
                                  isDefault
                                    ? "border-yellow-400 bg-yellow-50 text-yellow-600"
                                    : "border-gray-300 bg-white text-gray-500 hover:border-gray-400"
                                }`}
                              >
                                {isDefault ? "★ Default" : "Default"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditTax(tax)}
                                disabled={isSavingTax || isDeletingTax}
                                className="px-2.5 py-1 text-xs bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 transition-colors font-medium"
                              >Edit</button>
                              <button
                                type="button"
                                onClick={() => handleDeleteTaxType(tax.id)}
                                disabled={isSavingTax || isDeletingTax || editingTaxId !== null}
                                className="px-2.5 py-1 text-xs bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors font-medium"
                              >Delete</button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                ) : (
                  !showAddTaxForm && (
                    <p className="text-sm text-gray-400 text-center py-8">
                      No tax types yet. Tap <strong>Add</strong> to create one.
                    </p>
                  )
                )}

              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <TaxRateChangeWarningModal
        isOpen={showTaxRateChangeWarning}
        zIndexClass="z-[70]"
        isProcessing={isSavingTax}
        onGoBack={() => {
          setShowTaxRateChangeWarning(false);
          setPendingTaxUpdate(null);
        }}
        onClose={() => {
          setShowTaxRateChangeWarning(false);
          setPendingTaxUpdate(null);
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

      {/* Delete Tax Confirmation */}
      <AnimatePresence>
        {showDeleteTaxConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowDeleteTaxConfirm(false); setDeletingTaxId(null); }}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-gray-900 mb-2">Delete Tax Type?</h3>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to delete this tax type? This cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { setShowDeleteTaxConfirm(false); setDeletingTaxId(null); }}
                  disabled={isDeletingTax}
                  className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >Cancel</button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteTax}
                  disabled={isDeletingTax}
                  className="px-4 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >{isDeletingTax ? "Deleting..." : "Delete"}</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Add Expense Category Modal */}
      <AnimatePresence>
        {showAddCategoryInput && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { setShowAddCategoryInput(false); setNewCategoryName(""); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <h2 className="text-xl font-bold text-gray-900">Add Expense Category</h2>
                <button
                  onClick={() => { setShowAddCategoryInput(false); setNewCategoryName(""); }}
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>
              <div className="p-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Category Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  className="w-full border border-blue-400 text-sm px-3 py-2 rounded-md bg-white text-gray-800 mb-4"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Enter category name"
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      const nextCategory = newCategoryName.trim();
                      if (!nextCategory) {
                        setToast({ isVisible: true, message: "Please enter Expense Category", type: "error" });
                        return;
                      }
                      if (addCategoryDuplicateError) return;
                      // Immediate local state so dropdown shows it right away
                      addExpenseCategory(nextCategory);
                      handleFieldChange("expense_type", nextCategory);
                      setShowAddCategoryInput(false);
                      setNewCategoryName("");
                      // Persist to server in background
                      addApiExpenseCategory(nextCategory);
                      setToast({ isVisible: true, message: "Expense Category Added", type: "success" });
                    } else if (e.key === "Escape") {
                      setShowAddCategoryInput(false);
                      setNewCategoryName("");
                    }
                  }}
                />
                {addCategoryDuplicateError && (
                  <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    <AlertCircle size={14} />
                    {addCategoryDuplicateError}
                  </div>
                )}
                <div className="flex justify-end">
                  <button
                    type="button"
                    disabled={!newCategoryName.trim() || !!addCategoryDuplicateError}
                    onClick={async () => {
                      const nextCategory = newCategoryName.trim();
                      if (!nextCategory) {
                        setToast({ isVisible: true, message: "Please enter Expense Category", type: "error" });
                        return;
                      }
                      if (addCategoryDuplicateError) return;
                      // Immediate local state so dropdown shows it right away
                      addExpenseCategory(nextCategory);
                      handleFieldChange("expense_type", nextCategory);
                      setShowAddCategoryInput(false);
                      setNewCategoryName("");
                      // Persist to server in background
                      addApiExpenseCategory(nextCategory);
                      setToast({ isVisible: true, message: "Expense Category Added", type: "success" });
                    }}
                    className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Expense Category Modal */}
      <AnimatePresence>
        {showEditCategoryModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!isSavingEditCategory) setShowEditCategoryModal(false); }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              {isSavingEditCategory && (
                <div className="absolute inset-0 z-10 bg-white/80 flex flex-col items-center justify-center rounded-xl">
                  <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm text-gray-600 font-medium">Updating all receipts…</p>
                </div>
              )}
              <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
                <h2 className="text-xl font-bold text-gray-900">Edit Expense Category</h2>
                <button
                  onClick={() => { if (!isSavingEditCategory) setShowEditCategoryModal(false); }}
                  className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors"
                >
                  <X size={20} className="text-gray-600" />
                </button>
              </div>
              <div className="p-6">
                <label className="block text-sm font-bold text-gray-700 mb-2">
                  Category Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="w-full border border-blue-400 text-sm px-3 py-2 rounded-md bg-white text-gray-800 mb-4"
                  value={editCategoryName}
                  onChange={(e) => {
                    setEditCategoryName(e.target.value);
                    if (editCategoryError === "Expense Category already exists") setEditCategoryError(null);
                  }}
                  placeholder="Enter category name"
                  autoFocus
                  disabled={isSavingEditCategory}
                  onKeyDown={(e) => { if (e.key === "Enter" && editCategoryName.trim() && !editCategoryDuplicateError) handleSaveEditCategory(); }}
                />
                {editCategoryDuplicateError && (
                  <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    <AlertCircle size={14} />
                    {editCategoryDuplicateError}
                  </div>
                )}
                {editCategoryError && editCategoryError !== "Expense Category already exists" && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
                    {editCategoryError}
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => { if (!isSavingEditCategory) setShowEditCategoryModal(false); }}
                    disabled={isSavingEditCategory}
                    className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveEditCategory}
                    disabled={!editCategoryName.trim() || isSavingEditCategory || !!editCategoryDuplicateError}
                    className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {isSavingEditCategory ? "Saving…" : "Okay"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Expense Category Confirmation */}
      <AnimatePresence>
        {showDeleteCategoryConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
            onClick={() => { if (!isDeletingCategory) { setShowDeleteCategoryConfirm(false); setDeletingCategory(null); } }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6"
              onClick={(e) => e.stopPropagation()}
            >
              {isDeletingCategory && (
                <div className="absolute inset-0 z-10 bg-white/80 flex flex-col items-center justify-center rounded-xl">
                  <div className="w-10 h-10 border-4 border-red-600 border-t-transparent rounded-full animate-spin mb-3" />
                  <p className="text-sm text-gray-600 font-medium">Removing from all receipts…</p>
                </div>
              )}
              <div className="flex items-start gap-4 mb-6">
                <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                  <Trash2 size={20} className="text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Are you sure you want to delete this Expense Category?</h2>
                  <p className="text-sm text-gray-600">
                    When deleting an Expense Category all receipts associated with that Expense Category will have that Expense Category removed.
                  </p>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => { if (!isDeletingCategory) { setShowDeleteCategoryConfirm(false); setDeletingCategory(null); } }}
                  disabled={isDeletingCategory}
                  className="px-6 py-2 text-gray-700 font-medium hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteCategory}
                  disabled={isDeletingCategory}
                  className="px-6 py-2 bg-red-600 text-white font-medium rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isDeletingCategory ? "Deleting…" : "Delete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Receipt Annotator overlay */}
      {annotatorUrl && (
        <ReceiptAnnotator
          imageUrl={annotatorUrl}
          onSave={handleAnnotationSaveDetail}
          onClose={() => {
            setAnnotatorUrl(null);
            setAnnotatorSource(null);
          }}
        />
      )}

      {/* Expense Category Edit Confirmation Popup */}
      {showCategoryEditConfirm && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <motion.div initial={{ scale: 0.95, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 12 }}
            className="bg-white rounded-2xl p-6 max-w-xs w-full shadow-2xl text-center border border-slate-200">
            <p className="text-sm font-medium text-slate-800 leading-relaxed mb-5">
              When editing an Expense Category<br />
              all receipts associated with that<br />
              Expense Category will also be updated.
            </p>
            <div className="flex gap-3">
              <button type="button"
                onClick={() => setShowCategoryEditConfirm(false)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 rounded-xl text-slate-700 font-semibold text-sm transition-colors">
                Cancel
              </button>
              <button type="button" onClick={doConfirmCategoryEdit} disabled={isSavingEditCategory}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 rounded-xl text-white font-semibold text-sm transition-colors">
                Okay
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}

      {alertMsg && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-auto p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{alertMsg}</p>
            <button
              onClick={() => setAlertMsg(null)}
              className="mt-5 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {showMaxDefaultTaxModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-auto p-6 text-center">
            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-4">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-500"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </div>
            <h3 className="text-base font-bold text-slate-900 mb-2">Message</h3>
            <p className="text-sm text-slate-700 leading-relaxed">A maximum of two tax types can be selected as Default. Please unselect a tax type before selecting another.</p>
            <button
              onClick={() => setShowMaxDefaultTaxModal(false)}
              className="mt-5 w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm rounded-xl transition-colors"
            >
              OK
            </button>
          </div>
        </div>
      )}

    </>
  );
};

export default ReceiptDetail;
